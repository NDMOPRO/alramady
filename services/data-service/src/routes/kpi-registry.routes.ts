import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { KpiRegistryService } from '../services/kpi-registry.service';
import { prisma } from '../utils/prisma';
import { getRedisClient } from '../utils/redis';

const router = Router();
const service = new KpiRegistryService(prisma, getRedisClient());

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

const CreateKpiBody = z.object({
  name: z.string().min(1).max(500),
  nameAr: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  formula: z.string().min(1).max(2000),
  variables: z.array(z.object({
    name: z.string().min(1),
    datasetId: z.string().uuid(),
    column: z.string().min(1),
    aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max', 'count_distinct', 'latest']),
    filter: z.string().max(500).optional(),
  })),
  ownerId: z.string().uuid(),
  category: z.string().min(1).max(200),
  unit: z.string().max(100).optional(),
  direction: z.enum(['higher_better', 'lower_better']),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual']),
  target: z.number().optional(),
  warningThreshold: z.number().optional(),
  criticalThreshold: z.number().optional(),
  sensitivityLevel: z.enum(['public', 'internal', 'confidential', 'restricted']).default('internal'),
  tags: z.array(z.string().max(100)).default([]),
  parentKpiId: z.string().uuid().optional(),
});

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = CreateKpiBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.createKpi({ ...body, tenantId, stakeholderIds: [] });
  res.status(201).json({ success: true, data: result });
}));

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const options = {
    status: req.query.status as 'draft' | 'active' | 'deprecated' | undefined,
    category: req.query.category as string | undefined,
    ownerId: req.query.ownerId as string | undefined,
    search: req.query.search as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
  };
  const result = await service.listKpis(tenantId, options);
  res.json({ success: true, data: result });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const result = await service.getKpiById(req.params.id, tenantId);
  res.json({ success: true, data: result });
}));

router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const body = CreateKpiBody.partial().parse(req.body);
  const { tenantId, userId } = req.tenant!;
  const changeReason = (req.body.changeReason as string) || 'Updated via API';
  const result = await service.updateKpi(req.params.id, tenantId, { ...body, changeReason, requestedBy: userId });
  res.json({ success: true, data: result });
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = req.tenant!;
  await service.deleteKpi(req.params.id, tenantId, userId);
  res.json({ success: true, message: 'KPI deleted' });
}));

router.post('/:id/calculate', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const result = await service.calculateKpi({ kpiId: req.params.id, forceRefresh: false }, tenantId);
  res.json({ success: true, data: result });
}));

router.get('/:id/history', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const result = await service.getVersionHistory(req.params.id, tenantId);
  res.json({ success: true, data: result });
}));

export default router;
