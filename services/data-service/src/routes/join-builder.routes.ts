import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { JoinBuilderService } from '../services/join-builder.service';
import { prisma } from '../utils/prisma';

const router = Router();
const service = new JoinBuilderService(prisma);

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// ─── Zod Schemas ──────────────────────────────────────────────────

const DetectJoinKeysSchema = z.object({
  datasetIds: z.array(z.string().uuid()).min(2).max(10),
});

const JoinKeySchema = z.object({
  leftColumn: z.string().min(1).max(500),
  rightColumn: z.string().min(1).max(500),
});

const JoinConfigSchema = z.object({
  leftDatasetId: z.string().uuid(),
  rightDatasetId: z.string().uuid(),
  joinType: z.enum(['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS']),
  joinKeys: z.array(JoinKeySchema).min(1).max(20),
  outputName: z.string().min(1).max(500).optional(),
});

const PreviewJoinSchema = z.object({
  leftDatasetId: z.string().uuid(),
  rightDatasetId: z.string().uuid(),
  joinType: z.enum(['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS']),
  joinKeys: z.array(JoinKeySchema).min(1).max(20),
  limit: z.number().int().min(1).max(500).default(50),
});

// ─── Routes ────────────────────────────────────────────────────────

/**
 * POST /joins/detect
 * Auto-detect potential join keys between datasets
 */
router.post('/detect', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { datasetIds } = DetectJoinKeysSchema.parse(req.body);
  const result = await service.detectJoinKeys(datasetIds, tenantId);
  res.json({ success: true, data: result });
}));

/**
 * POST /joins/execute
 * Execute a join and create a new dataset
 */
router.post('/execute', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = req.tenant!;
  const config = JoinConfigSchema.parse(req.body);
  const result = await service.executeJoin({
    ...config,
    tenantId,
    userId,
  });
  res.status(201).json({ success: true, data: result });
}));

/**
 * POST /joins/preview
 * Preview join results without creating a dataset
 */
router.post('/preview', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { limit, ...config } = PreviewJoinSchema.parse(req.body);
  const result = await service.previewJoin(
    {
      ...config,
      tenantId,
      userId: req.tenant!.userId,
    },
    limit
  );
  res.json({ success: true, data: result });
}));

export default router;
