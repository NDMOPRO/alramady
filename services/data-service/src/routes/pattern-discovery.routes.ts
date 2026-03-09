import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { PatternDiscoveryService } from '../services/pattern-discovery.service';
import { prisma } from '../utils/prisma';

const router = Router();
const service = new PatternDiscoveryService(prisma);

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

const DatasetIdSchema = z.object({
  datasetId: z.string().uuid(),
});

const AnomalySchema = z.object({
  datasetId: z.string().uuid(),
  column: z.string().optional(),
  threshold: z.number().min(1).max(10).optional(),
});

router.post('/discover', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { datasetId } = DatasetIdSchema.parse(req.body);
  const result = await service.discoverPatterns(datasetId, tenantId);
  res.json({ success: true, data: result });
}));

router.post('/anomalies', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { datasetId, column, threshold } = AnomalySchema.parse(req.body);
  const result = await service.detectAnomalies(datasetId, tenantId, column, threshold);
  res.json({ success: true, data: result });
}));

router.post('/summary', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { datasetId } = DatasetIdSchema.parse(req.body);
  const result = await service.getPatternSummary(datasetId, tenantId);
  res.json({ success: true, data: result });
}));

export default router;
