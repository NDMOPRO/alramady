import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { ExcelToSystemService } from '../services/excel-to-system.service';

const router = Router();
const service = new ExcelToSystemService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  },
});

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const TransformBody = z.object({
  sourceWorkbookId: z.string().min(1, 'Source workbook ID is required'),
  targetSystem: z.enum(['dashboard', 'report', 'dataset', 'kpi_registry', 'workflow']),
  config: z.object({
    mappingRules: z.array(z.object({
      sourceSheet: z.string().min(1),
      sourceRange: z.string().optional(),
      targetEntity: z.string().min(1),
      fieldMappings: z.array(z.object({
        sourceColumn: z.string().min(1),
        targetField: z.string().min(1),
        transform: z.enum(['none', 'uppercase', 'lowercase', 'trim', 'number', 'date', 'boolean']).optional(),
      })),
    })).optional(),
    autoDetect: z.boolean().optional(),
  }).optional().default({}),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post(
  '/analyze',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Excel file is required', code: 'MISSING_FILE' });
      return;
    }
    const result = await service.analyzeWorkbook(req.file.buffer);
    res.json({ success: true, data: result });
  }),
);

router.post(
  '/transform',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Excel file is required', code: 'MISSING_FILE' });
      return;
    }

    const bodyData = req.body.config ? JSON.parse(req.body.config) : req.body;
    const { sourceWorkbookId, targetSystem, config } = TransformBody.parse({
      sourceWorkbookId: bodyData.sourceWorkbookId || req.body.sourceWorkbookId,
      targetSystem: bodyData.targetSystem || req.body.targetSystem,
      config: bodyData.config || bodyData,
    });

    const tenantId = req.user!.organizationId || req.user!.userId;
    const userId = req.user!.userId;

    const result = await service.transform({
      sourceWorkbookId,
      targetSystemType: targetSystem,
      mappingRules: config.mappingRules,
      autoDetect: config.autoDetect,
      tenantId,
      userId,
    });
    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/auto-detect',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Excel file is required', code: 'MISSING_FILE' });
      return;
    }

    const tenantId = req.user!.organizationId || req.user!.userId;
    const userId = req.user!.userId;

    const result = await service.autoDetectAndTransform(req.file.buffer, tenantId, userId);
    res.status(201).json({ success: true, data: result });
  }),
);

export default router;
