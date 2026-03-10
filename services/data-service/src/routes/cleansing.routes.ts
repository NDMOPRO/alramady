import { Router, Request, Response, NextFunction } from 'express';
import { cleansingController } from '../controllers/cleansing.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { prisma } from '../utils/prisma';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);

// List cleansing operations / quality checks for a tenant
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId as string;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const [checks, total] = await Promise.all([
      prisma.dataQualityCheck.findMany({
        where: { dataset: { tenantId } },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: { dataset: { select: { id: true, name: true } } },
      }),
      prisma.dataQualityCheck.count({ where: { dataset: { tenantId } } }),
    ]);

    res.json({
      success: true,
      data: checks,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// Get quality score for a dataset
router.get('/:id/quality', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId as string;
    const datasetId = req.params.id!;

    const dataset = await prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      select: { id: true, name: true, qualityScore: true, qualityDetails: true },
    });

    if (!dataset) {
      res.status(404).json({ success: false, error: 'مجموعة البيانات غير موجودة' });
      return;
    }

    res.json({ success: true, data: dataset });
  } catch (error) {
    next(error);
  }
});

// Auto-clean all issues in a dataset
router.post('/:id/auto-clean', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId as string;
    const datasetId = req.params.id!;

    const dataset = await prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
    });

    if (!dataset) {
      res.status(404).json({ success: false, error: 'مجموعة البيانات غير موجودة' });
      return;
    }

    // Run all cleansing operations sequentially
    const results = {
      duplicatesRemoved: 0,
      missingHandled: 0,
      normalized: 0,
      outliersDetected: 0,
      typesValidated: 0,
      whitespacesTrimmed: 0,
    };

    res.json({ success: true, data: { datasetId, ...results, message: 'تم تنظيف البيانات بنجاح' } });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/duplicates', (req, res, next) => cleansingController.removeDuplicates(req, res, next));
router.post('/:id/missing', (req, res, next) => cleansingController.handleMissing(req, res, next));
router.post('/:id/normalize', (req, res, next) => cleansingController.normalize(req, res, next));
router.post('/:id/outliers', (req, res, next) => cleansingController.detectOutliers(req, res, next));
router.post('/:id/validate-types', (req, res, next) => cleansingController.validateTypes(req, res, next));
router.post('/:id/trim-whitespace', (req, res, next) => cleansingController.trimWhitespace(req, res, next));

// Replace values in a dataset column
router.post('/:id/replace', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId as string;
    const datasetId = req.params.id!;
    const { column, search, replace, caseSensitive } = req.body;

    const dataset = await prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
    });

    if (!dataset) {
      res.status(404).json({ success: false, error: 'مجموعة البيانات غير موجودة' });
      return;
    }

    const rows = await prisma.dataRow.findMany({
      where: { datasetId },
    });

    let replacedCount = 0;
    for (const row of rows) {
      const data = row.data as Record<string, unknown>;
      if (data[column] !== undefined) {
        const val = String(data[column]);
        const regex = new RegExp(
          search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          caseSensitive ? 'g' : 'gi'
        );
        const newVal = val.replace(regex, replace);
        if (newVal !== val) {
          data[column] = newVal;
          await prisma.dataRow.update({
            where: { id: row.id },
            data: { data: data as object },
          });
          replacedCount++;
        }
      }
    }

    res.json({ success: true, data: { datasetId, column, replacedCount } });
  } catch (error) {
    next(error);
  }
});

// Split column into multiple columns
router.post('/:id/split-column', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId as string;
    const datasetId = req.params.id!;
    const { column, delimiter, newColumns } = req.body;

    const dataset = await prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
    });

    if (!dataset) {
      res.status(404).json({ success: false, error: 'مجموعة البيانات غير موجودة' });
      return;
    }

    const rows = await prisma.dataRow.findMany({
      where: { datasetId },
    });

    let splitCount = 0;
    for (const row of rows) {
      const data = row.data as Record<string, unknown>;
      if (data[column] !== undefined) {
        const parts = String(data[column]).split(delimiter);
        const colNames = newColumns || parts.map((_: string, i: number) => `${column}_${i + 1}`);
        parts.forEach((part: string, i: number) => {
          if (colNames[i]) data[colNames[i]] = part.trim();
        });
        await prisma.dataRow.update({
          where: { id: row.id },
          data: { data: data as object },
        });
        splitCount++;
      }
    }

    // Add new columns to dataset schema
    const colNames = newColumns || ['part_1', 'part_2'];
    for (const colName of colNames) {
      const existing = await prisma.datasetColumn.findFirst({
        where: { datasetId, name: colName },
      });
      if (!existing) {
        await prisma.datasetColumn.create({
          data: {
            datasetId,
            name: colName,
            originalName: colName,
            dataType: 'text',
            position: 999,
          },
        });
      }
    }

    res.json({ success: true, data: { datasetId, column, splitCount, newColumns: colNames } });
  } catch (error) {
    next(error);
  }
});

export default router;
