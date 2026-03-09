import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { TableDiffEngineService } from '../services/table-diff-engine.service';
import { prisma } from '../utils/prisma';

const router = Router();
const service = new TableDiffEngineService(prisma);

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// ─── Zod Schemas ──────────────────────────────────────────────────

const CompareSchema = z.object({
  leftDatasetId: z.string().uuid(),
  rightDatasetId: z.string().uuid(),
});

const SummarySchema = z.object({
  leftDatasetId: z.string().uuid(),
  rightDatasetId: z.string().uuid(),
});

// ─── Routes ────────────────────────────────────────────────────────

/**
 * POST /diff/compare
 * Compare two datasets row-by-row and column-by-column
 */
router.post('/compare', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { leftDatasetId, rightDatasetId } = CompareSchema.parse(req.body);
  const result = await service.compareDatasets(leftDatasetId, rightDatasetId, tenantId);
  res.json({ success: true, data: result });
}));

/**
 * POST /diff/summary
 * Get diff summary statistics for two datasets
 */
router.post('/summary', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { leftDatasetId, rightDatasetId } = SummarySchema.parse(req.body);
  const result = await service.compareDatasets(leftDatasetId, rightDatasetId, tenantId);
  res.json({
    success: true,
    data: {
      summary: result.summary,
      columnCount: result.columns.length,
      columnsChanged: result.columns.filter((c) => c.status !== 'unchanged').length,
      statisticsDiff: result.statisticsDiff,
      executionTimeMs: result.executionTimeMs,
    },
  });
}));

export default router;
