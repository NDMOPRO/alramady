import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { StreamingPipelineService } from '../services/streaming-pipeline.service';

const router = Router();
const service = new StreamingPipelineService();

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// ─── Zod Schemas ──────────────────────────────────────────────────

const ProcessFileSchema = z.object({
  filePath: z.string().min(1).max(2000),
  stages: z.array(z.object({
    type: z.enum(['uppercase', 'lowercase', 'round', 'fill_null', 'filter']),
    column: z.string().min(1),
    params: z.record(z.unknown()).optional().default({}),
  })).optional().default([]),
  config: z.object({
    batchSize: z.number().int().positive().optional(),
    maxConcurrency: z.number().int().positive().max(16).optional(),
    backpressureThreshold: z.number().int().positive().optional(),
    retryAttempts: z.number().int().min(0).max(10).optional(),
    retryDelayMs: z.number().int().positive().optional(),
  }).optional().default({}),
});

const IngestionSchema = z.object({
  filePath: z.string().min(1).max(2000),
  datasetId: z.string().uuid(),
  config: z.object({
    batchSize: z.number().int().positive().optional(),
    maxConcurrency: z.number().int().positive().max(16).optional(),
    backpressureThreshold: z.number().int().positive().optional(),
    retryAttempts: z.number().int().min(0).max(10).optional(),
    retryDelayMs: z.number().int().positive().optional(),
  }).optional().default({}),
});

// ─── Routes ────────────────────────────────────────────────────────

/**
 * POST /streaming/process-file
 * Process a large file through a streaming pipeline with configurable stages
 */
router.post('/process-file', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = req.tenant!;
  const { filePath, stages, config } = ProcessFileSchema.parse(req.body);

  const transformStages = service.createTransformPipeline(
    stages.map((s) => ({
      type: s.type,
      column: s.column,
      params: s.params as Record<string, unknown>,
    })),
  );

  const result = await service.processLargeFile(filePath, tenantId, userId, transformStages, config);
  res.json({ success: true, data: result });
}));

/**
 * GET /streaming/pipelines
 * List available pipeline configurations
 */
router.get('/pipelines', asyncHandler(async (_req: Request, res: Response) => {
  const pipelines = [
    {
      name: 'ingestion',
      description: 'Validate, normalize, and store data rows',
      stages: ['validate', 'normalize', 'store'],
    },
    {
      name: 'transform',
      description: 'Apply column-level transformations',
      supportedTypes: ['uppercase', 'lowercase', 'round', 'fill_null', 'filter'],
    },
  ];
  res.json({ success: true, data: pipelines });
}));

/**
 * POST /streaming/ingestion
 * Create an ingestion pipeline and process a file through it
 */
router.post('/ingestion', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = req.tenant!;
  const { filePath, datasetId, config } = IngestionSchema.parse(req.body);

  const stages = service.createIngestionPipeline(tenantId, datasetId);
  const result = await service.processLargeFile(filePath, tenantId, userId, stages, config);
  res.json({ success: true, data: result });
}));

export default router;
