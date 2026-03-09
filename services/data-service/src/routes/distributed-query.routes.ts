import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { DistributedQueryService } from '../services/distributed-query.service';

const router = Router();
const service = new DistributedQueryService();

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// ─── Zod Schemas ──────────────────────────────────────────────────

const ExecuteQuerySchema = z.object({
  datasetId: z.string().uuid(),
  query: z.object({
    select: z.array(z.string()).optional(),
    where: z.record(z.unknown()).optional(),
    groupBy: z.array(z.string()).optional(),
    orderBy: z.array(z.object({
      column: z.string().min(1),
      direction: z.enum(['asc', 'desc']),
    })).optional(),
    limit: z.number().int().positive().max(100000).optional(),
    offset: z.number().int().min(0).optional(),
    aggregates: z.array(z.object({
      function: z.enum(['sum', 'avg', 'min', 'max', 'count']),
      column: z.string().min(1),
    })).optional(),
  }),
});

const EstimateQueryCostSchema = z.object({
  datasetId: z.string().uuid(),
});

// ─── Routes ────────────────────────────────────────────────────────

/**
 * POST /distributed/execute
 * Execute a distributed query against a dataset
 */
router.post('/execute', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { datasetId, query } = ExecuteQuerySchema.parse(req.body);
  const result = await service.executeDistributedQuery(datasetId, tenantId, query);
  res.json({ success: true, data: result });
}));

/**
 * POST /distributed/estimate
 * Estimate the cost of a distributed query
 */
router.post('/estimate', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { datasetId } = EstimateQueryCostSchema.parse(req.body);
  const result = await service.estimateQueryCost(datasetId, tenantId);
  res.json({ success: true, data: result });
}));

export default router;
