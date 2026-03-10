import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { DataPipelineService } from '../services/data-pipeline.service';
import { prisma } from '../utils/prisma';
import Redis from 'ioredis';

const router = Router();
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  lazyConnect: true,
});
const service = new DataPipelineService(prisma, redis);

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

const RetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0).default(3),
  backoffMs: z.number().int().min(100).default(1000),
  backoffMultiplier: z.number().min(1).default(2),
});

const PipelineStepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['extract', 'transform', 'load', 'validate', 'enrich']),
  config: z.record(z.unknown()),
  dependsOn: z.array(z.string()).default([]),
  retryPolicy: RetryPolicySchema.default({ maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 }),
  timeout: z.number().int().min(1000).default(300000),
  parallel: z.boolean().default(false),
});

const CreatePipelineBody = z.object({
  name: z.string().min(1).max(500),
  description: z.string().max(2000).default(''),
  steps: z.array(PipelineStepSchema).min(1),
  schedule: z.string().optional(),
  enabled: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = CreatePipelineBody.parse(req.body);
  const { userId } = req.tenant!;
  const result = await service.createPipeline({ ...body, createdBy: userId });
  res.status(201).json({ success: true, data: result });
}));

router.post('/:id/execute', asyncHandler(async (req: Request, res: Response) => {
  const params = req.body.params as Record<string, unknown> | undefined;
  const result = await service.executePipeline(req.params.id!, params);
  res.json({ success: true, data: result });
}));

router.get('/:id/monitor', asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getMonitoringDashboard(req.params.id!);
  res.json({ success: true, data: result });
}));

router.get('/:id/executions/:executionId/logs', asyncHandler(async (req: Request, res: Response) => {
  const level = req.query.level as string | undefined;
  const result = await service.getExecutionLogs(req.params.executionId!, level);
  res.json({ success: true, data: result });
}));

router.post('/:id/schedule', asyncHandler(async (req: Request, res: Response) => {
  const { cronExpression } = z.object({ cronExpression: z.string().min(5) }).parse(req.body);
  const result = await service.schedulePipeline(req.params.id!, cronExpression);
  res.json({ success: true, data: result });
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await service.deletePipeline(req.params.id!);
  res.json({ success: true, message: 'Pipeline deleted' });
}));

router.post('/:id/clone', asyncHandler(async (req: Request, res: Response) => {
  const { name } = z.object({ name: z.string().min(1).max(500) }).parse(req.body);
  const { userId } = req.tenant!;
  const result = await service.clonePipeline(req.params.id!, name, userId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/from-template', asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({
    templateId: z.string().uuid(),
    name: z.string().min(1).max(500),
    configOverrides: z.record(z.unknown()).optional(),
  }).parse(req.body);
  const { userId } = req.tenant!;
  const result = await service.createPipelineFromTemplate(body.templateId, body.name, userId, body.configOverrides);
  res.status(201).json({ success: true, data: result });
}));

router.get('/templates', asyncHandler(async (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  const result = await service.listTemplates(category);
  res.json({ success: true, data: result });
}));

export default router;
