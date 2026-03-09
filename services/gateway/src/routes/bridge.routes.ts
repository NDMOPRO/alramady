/**
 * Bridge API Routes — Rasid Platform Gateway
 * مسارات API لجسر البيانات بين المحركات
 *
 * Exposes the CrossEngineBridge functionality via REST endpoints.
 */

import { Router, Request, Response } from 'express';
import {
  CrossEngineBridge,
  EngineType,
  getCrossEngineBridge,
} from '../../../../packages/shared/services/cross-engine-bridge';

const router = Router();

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_ENGINE_TYPES = new Set<string>(Object.values(EngineType));

function isValidEngineType(value: string): value is EngineType {
  return VALID_ENGINE_TYPES.has(value);
}

function isValidTargetEngine(value: string): value is EngineType | '*' {
  return value === '*' || VALID_ENGINE_TYPES.has(value);
}

interface PublishRequestBody {
  sourceEngine: string;
  targetEngine: string;
  dataType: string;
  data: Record<string, unknown>;
  metadata: {
    tenantId: string;
    userId: string;
    correlationId?: string;
    ttlMs?: number;
  };
}

interface RequestRequestBody {
  sourceEngine: string;
  targetEngine: string;
  dataType: string;
  data: Record<string, unknown>;
  metadata: {
    tenantId: string;
    userId: string;
    correlationId?: string;
  };
}

function validatePublishBody(body: unknown): { valid: true; data: PublishRequestBody } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const b = body as Record<string, unknown>;

  if (typeof b['sourceEngine'] !== 'string' || !isValidEngineType(b['sourceEngine'])) {
    return { valid: false, error: `Invalid sourceEngine. Must be one of: ${[...VALID_ENGINE_TYPES].join(', ')}` };
  }

  if (typeof b['targetEngine'] !== 'string' || !isValidTargetEngine(b['targetEngine'])) {
    return { valid: false, error: `Invalid targetEngine. Must be "*" or one of: ${[...VALID_ENGINE_TYPES].join(', ')}` };
  }

  if (typeof b['dataType'] !== 'string' || b['dataType'].trim().length === 0) {
    return { valid: false, error: 'dataType is required and must be a non-empty string' };
  }

  if (!b['data'] || typeof b['data'] !== 'object' || Array.isArray(b['data'])) {
    return { valid: false, error: 'data is required and must be a JSON object' };
  }

  if (!b['metadata'] || typeof b['metadata'] !== 'object' || Array.isArray(b['metadata'])) {
    return { valid: false, error: 'metadata is required and must be a JSON object' };
  }

  const meta = b['metadata'] as Record<string, unknown>;

  if (typeof meta['tenantId'] !== 'string' || meta['tenantId'].trim().length === 0) {
    return { valid: false, error: 'metadata.tenantId is required' };
  }

  if (typeof meta['userId'] !== 'string' || meta['userId'].trim().length === 0) {
    return { valid: false, error: 'metadata.userId is required' };
  }

  if (meta['correlationId'] !== undefined && typeof meta['correlationId'] !== 'string') {
    return { valid: false, error: 'metadata.correlationId must be a string if provided' };
  }

  if (meta['ttlMs'] !== undefined && (typeof meta['ttlMs'] !== 'number' || meta['ttlMs'] <= 0)) {
    return { valid: false, error: 'metadata.ttlMs must be a positive number if provided' };
  }

  return { valid: true, data: b as unknown as PublishRequestBody };
}

function validateRequestBody(body: unknown): { valid: true; data: RequestRequestBody } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const b = body as Record<string, unknown>;

  if (typeof b['sourceEngine'] !== 'string' || !isValidEngineType(b['sourceEngine'])) {
    return { valid: false, error: `Invalid sourceEngine. Must be one of: ${[...VALID_ENGINE_TYPES].join(', ')}` };
  }

  if (typeof b['targetEngine'] !== 'string' || !isValidEngineType(b['targetEngine'])) {
    return { valid: false, error: `Invalid targetEngine. Must be one of: ${[...VALID_ENGINE_TYPES].join(', ')}` };
  }

  if (typeof b['dataType'] !== 'string' || b['dataType'].trim().length === 0) {
    return { valid: false, error: 'dataType is required and must be a non-empty string' };
  }

  if (!b['data'] || typeof b['data'] !== 'object' || Array.isArray(b['data'])) {
    return { valid: false, error: 'data is required and must be a JSON object' };
  }

  if (!b['metadata'] || typeof b['metadata'] !== 'object' || Array.isArray(b['metadata'])) {
    return { valid: false, error: 'metadata is required and must be a JSON object' };
  }

  const meta = b['metadata'] as Record<string, unknown>;

  if (typeof meta['tenantId'] !== 'string' || meta['tenantId'].trim().length === 0) {
    return { valid: false, error: 'metadata.tenantId is required' };
  }

  if (typeof meta['userId'] !== 'string' || meta['userId'].trim().length === 0) {
    return { valid: false, error: 'metadata.userId is required' };
  }

  return { valid: true, data: b as unknown as RequestRequestBody };
}

// ---------------------------------------------------------------------------
// POST /bridge/publish
// ---------------------------------------------------------------------------

router.post('/publish', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = validatePublishBody(req.body);
    if (!validation.valid) {
      res.status(400).json({ success: false, error: validation.error });
      return;
    }

    const { sourceEngine, targetEngine, dataType, data, metadata } = validation.data;
    const bridge = getCrossEngineBridge();

    const payloadId = await bridge.publish({
      sourceEngine: sourceEngine as EngineType,
      targetEngine: targetEngine as EngineType | '*',
      dataType,
      data,
      metadata: {
        tenantId: metadata.tenantId,
        userId: metadata.userId,
        timestamp: new Date().toISOString(),
        correlationId: metadata.correlationId ?? '',
        ttlMs: metadata.ttlMs,
      },
    });

    res.status(201).json({
      success: true,
      data: { payloadId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during publish';
    res.status(500).json({ success: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /bridge/request
// ---------------------------------------------------------------------------

router.post('/request', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = validateRequestBody(req.body);
    if (!validation.valid) {
      res.status(400).json({ success: false, error: validation.error });
      return;
    }

    const { sourceEngine, targetEngine, dataType, data, metadata } = validation.data;
    const bridge = getCrossEngineBridge();

    const response = await bridge.request(
      sourceEngine as EngineType,
      targetEngine as EngineType,
      dataType,
      data,
      {
        tenantId: metadata.tenantId,
        userId: metadata.userId,
        correlationId: metadata.correlationId,
      }
    );

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during request';

    // Differentiate between "no handler" (404) and other errors (500)
    if (message.includes('No handler registered')) {
      res.status(404).json({ success: false, error: message });
      return;
    }

    res.status(500).json({ success: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /bridge/lineage/:payloadId
// ---------------------------------------------------------------------------

router.get('/lineage/:payloadId', (req: Request, res: Response): void => {
  try {
    const { payloadId } = req.params;
    if (!payloadId || payloadId.trim().length === 0) {
      res.status(400).json({ success: false, error: 'payloadId parameter is required' });
      return;
    }

    const bridge = getCrossEngineBridge();
    const lineage = bridge.getLineage(payloadId);

    res.status(200).json({
      success: true,
      data: lineage,
      count: lineage.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error fetching lineage';
    res.status(500).json({ success: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /bridge/lineage/tenant/:tenantId
// ---------------------------------------------------------------------------

router.get('/lineage/tenant/:tenantId', (req: Request, res: Response): void => {
  try {
    const { tenantId } = req.params;
    if (!tenantId || tenantId.trim().length === 0) {
      res.status(400).json({ success: false, error: 'tenantId parameter is required' });
      return;
    }

    const limitParam = req.query['limit'];
    let limit: number | undefined;
    if (limitParam !== undefined) {
      const parsed = parseInt(String(limitParam), 10);
      if (isNaN(parsed) || parsed <= 0) {
        res.status(400).json({ success: false, error: 'limit must be a positive integer' });
        return;
      }
      limit = parsed;
    }

    const bridge = getCrossEngineBridge();
    const lineage = bridge.getLineageByTenant(tenantId, limit);

    res.status(200).json({
      success: true,
      data: lineage,
      count: lineage.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error fetching tenant lineage';
    res.status(500).json({ success: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /bridge/stats
// ---------------------------------------------------------------------------

router.get('/stats', (_req: Request, res: Response): void => {
  try {
    const bridge = getCrossEngineBridge();
    const stats = bridge.getStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error fetching stats';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
