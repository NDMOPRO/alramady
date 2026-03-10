/**
 * STRICT Engine Routes — Express Router
 * Exposes the strict pipeline and individual tools via REST API.
 */

import { Router, type Request, type Response } from 'express';
import { initStrictEngine, runStrictPipeline, executeTool, listTools } from './index';
import type { ActionContext, AssetRef, ExportKind } from './cdr/types';
import { EvidencePackBuilder } from './evidence/evidence-pack';

const router = Router();

// Initialize engine on module load
initStrictEngine();

// ─── POST /api/v1/strict/convert ─────────────────────────────────────
// Main conversion endpoint — runs full STRICT pipeline
router.post('/convert', async (req: Request, res: Response) => {
  try {
    const { context, source_asset, target_format, config } = req.body as {
      context: ActionContext;
      source_asset: AssetRef;
      target_format?: ExportKind;
      config?: Record<string, unknown>;
    };

    if (!context || !source_asset) {
      return res.status(400).json({
        error: 'Missing required fields: context, source_asset',
      });
    }

    // Force strict_visual=true
    context.strict_visual = true;

    const result = await runStrictPipeline(context, source_asset, target_format, config);

    if (result.success) {
      return res.json({
        success: true,
        artifact: result.artifact,
        evidence_pack: result.evidence_pack,
        warnings: result.warnings,
      });
    }

    return res.status(422).json({
      success: false,
      error: result.error,
      warnings: result.warnings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal error',
    });
  }
});

// ─── POST /api/v1/strict/tool/execute ────────────────────────────────
// Execute a single tool directly
router.post('/tool/execute', async (req: Request, res: Response) => {
  try {
    const request = req.body;

    if (!request.tool_id || !request.request_id || !request.context) {
      return res.status(400).json({
        error: 'Missing required fields: request_id, tool_id, context',
      });
    }

    const response = await executeTool(request);
    return res.json(response);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal error',
    });
  }
});

// ─── GET /api/v1/strict/tools ────────────────────────────────────────
// List all registered tools
router.get('/tools', (_req: Request, res: Response) => {
  const tools = listTools();
  return res.json({ tools });
});

// ─── POST /api/v1/strict/evidence/validate ───────────────────────────
// Validate an evidence pack
router.post('/evidence/validate', (req: Request, res: Response) => {
  try {
    const pack = req.body;
    const result = EvidencePackBuilder.validate(pack);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({
      valid: false,
      errors: [error instanceof Error ? error.message : 'Invalid evidence pack'],
    });
  }
});

// ─── GET /api/v1/strict/health ───────────────────────────────────────
router.get('/health', (_req: Request, res: Response) => {
  const tools = listTools();
  return res.json({
    status: 'healthy',
    engine: 'STRICT_1TO1_100',
    version: '1.0.0',
    registered_tools: tools.length,
    tool_ids: tools.map(t => t.tool_id),
  });
});

export default router;
