import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { PredictiveEngineService } from '../services/predictive-engine.service';
import { prisma } from '../utils/prisma';

const router = Router();
const service = new PredictiveEngineService(prisma);

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

const ForecastSchema = z.object({
  datasetId: z.string().uuid(),
  column: z.string().min(1),
  periods: z.number().int().min(1).max(365),
  method: z.enum(['moving_average', 'exponential_smoothing', 'linear_trend']).optional(),
});

const RegressionSchema = z.object({
  datasetId: z.string().uuid(),
  targetColumn: z.string().min(1),
  featureColumns: z.array(z.string().min(1)).min(1),
});

const CorrelationSchema = z.object({
  datasetId: z.string().uuid(),
  columns: z.array(z.string().min(1)).optional(),
});

const ClusterSchema = z.object({
  datasetId: z.string().uuid(),
  columns: z.array(z.string().min(1)).min(1),
  k: z.number().int().min(2).max(20).optional(),
});

router.post('/forecast', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { datasetId, column, periods, method } = ForecastSchema.parse(req.body);
  const result = await service.forecast(datasetId, tenantId, column, periods, method);
  res.json({ success: true, data: result });
}));

router.post('/regression', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { datasetId, targetColumn, featureColumns } = RegressionSchema.parse(req.body);
  const result = await service.linearRegression(datasetId, tenantId, targetColumn, featureColumns);
  res.json({ success: true, data: result });
}));

router.post('/correlation', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { datasetId, columns } = CorrelationSchema.parse(req.body);
  const result = await service.correlationMatrix(datasetId, tenantId, columns);
  res.json({ success: true, data: result });
}));

router.post('/cluster', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { datasetId, columns, k } = ClusterSchema.parse(req.body);
  const result = await service.clusterAnalysis(datasetId, tenantId, columns, k);
  res.json({ success: true, data: result });
}));

export default router;
