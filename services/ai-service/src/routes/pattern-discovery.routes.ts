import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { PatternDiscoveryService } from '../services/pattern-discovery.service.js';

const router = Router();
const patternDiscoveryService = new PatternDiscoveryService();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const dataRecordSchema = z.record(z.string(), z.number().nullable());

const correlationSchema = z.object({
  data: z.array(dataRecordSchema).min(3),
  columns: z.array(z.string()).min(2),
});

const clusterSchema = z.object({
  data: z.array(dataRecordSchema).min(1),
  columns: z.array(z.string()).min(1),
  k: z.number().int().min(1).max(50).optional(),
});

const anomalySchema = z.object({
  data: z.array(dataRecordSchema).min(1),
  columns: z.array(z.string()).min(1),
});

const trendSchema = z.object({
  data: z.array(dataRecordSchema).min(3),
  timeColumn: z.string(),
  valueColumns: z.array(z.string()).min(1),
});

const causalitySchema = z.object({
  data: z.array(dataRecordSchema).min(10),
  columns: z.array(z.string()).min(2),
});

router.post(
  '/correlations',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { data, columns } = correlationSchema.parse(req.body);
    const result = patternDiscoveryService.detectCorrelations(data, columns);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/clusters',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { data, columns, k } = clusterSchema.parse(req.body);
    const result = patternDiscoveryService.clusterData(data, columns, k);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/anomalies',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { data, columns } = anomalySchema.parse(req.body);
    const result = patternDiscoveryService.detectAnomalies(data, columns);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/trends',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { data, timeColumn, valueColumns } = trendSchema.parse(req.body);
    const result = patternDiscoveryService.detectTrends(data, timeColumn, valueColumns);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/causality',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { data, columns } = causalitySchema.parse(req.body);
    const result = patternDiscoveryService.detectCausality(data, columns);
    res.json({ success: true, data: result });
  })
);

export default router;
