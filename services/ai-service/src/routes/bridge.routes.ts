import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  getCrossEngineBridge,
  EngineType,
} from '../../packages/shared/services/cross-engine-bridge.js';

const router = Router();
const bridge = getCrossEngineBridge();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ── Validation Schemas ─────────────────────────────────────────────────

const engineTypeValues = Object.values(EngineType) as [string, ...string[]];

const publishSchema = z.object({
  sourceEngine: z.enum(engineTypeValues),
  targetEngine: z.union([z.enum(engineTypeValues), z.literal('*')]),
  dataType: z.string().min(1).max(100),
  data: z.record(z.unknown()),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  correlationId: z.string().uuid().optional(),
  ttlMs: z.number().int().positive().optional(),
});

const requestSchema = z.object({
  sourceEngine: z.enum(engineTypeValues),
  targetEngine: z.enum(engineTypeValues),
  dataType: z.string().min(1).max(100),
  data: z.record(z.unknown()),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  timeoutMs: z.number().int().positive().max(60000).optional(),
});

// ── Routes ──────────────────────────────────────────────────────────────

/**
 * POST /api/bridge/publish
 * Publish data from one engine to others
 */
router.post('/publish', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const body = publishSchema.parse(req.body);

  const payloadId = await bridge.publish({
    sourceEngine: body.sourceEngine as EngineType,
    targetEngine: body.targetEngine === '*' ? '*' : body.targetEngine as EngineType,
    dataType: body.dataType,
    data: body.data,
    metadata: {
      tenantId: body.tenantId,
      userId: body.userId,
      timestamp: new Date().toISOString(),
      correlationId: body.correlationId || crypto.randomUUID(),
      ttlMs: body.ttlMs,
    },
  });

  res.json({
    success: true,
    data: {
      payloadId,
      timestamp: new Date().toISOString(),
    },
  });
}));

/**
 * POST /api/bridge/request
 * Synchronous request/response between engines
 */
router.post('/request', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const body = requestSchema.parse(req.body);

  const startTime = Date.now();

  const response = await bridge.request(
    body.sourceEngine as EngineType,
    body.targetEngine as EngineType,
    body.dataType,
    body.data,
    {
      tenantId: body.tenantId,
      userId: body.userId,
      timestamp: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
    },
  );

  res.json({
    success: true,
    data: {
      payloadId: response.id,
      responseData: response.data,
      sourceEngine: response.sourceEngine,
      processingTimeMs: Date.now() - startTime,
    },
  });
}));

/**
 * GET /api/bridge/lineage/:payloadId
 * Get lineage for a specific payload
 */
router.get('/lineage/:payloadId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { payloadId } = req.params;
  const lineage = bridge.getLineage(payloadId);

  res.json({
    success: true,
    data: lineage,
  });
}));

/**
 * GET /api/bridge/lineage/tenant/:tenantId
 * Get lineage for a tenant
 */
router.get('/lineage/tenant/:tenantId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  const limit = parseInt(req.query.limit as string || '50', 10);
  const lineage = bridge.getLineageByTenant(tenantId, limit);

  res.json({
    success: true,
    data: lineage,
  });
}));

/**
 * GET /api/bridge/stats
 * Get bridge statistics
 */
router.get('/stats', authMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  const stats = bridge.getStats();

  res.json({
    success: true,
    data: stats,
  });
}));

export default router;
