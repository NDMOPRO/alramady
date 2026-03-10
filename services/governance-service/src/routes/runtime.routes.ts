import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { RuntimeRegistryService } from '../services/runtime-registry.service.js';
import {
  RuntimeEvidenceService,
  RuntimeEvidenceServiceError,
} from '../services/runtime-evidence.service.js';

const router = Router();
const registry = new RuntimeRegistryService();
const evidence = new RuntimeEvidenceService();

const evidenceCreateSchema = z.object({
  context: z.object({}).passthrough(),
  summary: z.object({}).passthrough(),
}).strict();

const evidenceAttachSchema = z.object({
  attachment: z.object({}).passthrough(),
}).strict();

const evidenceCloseSchema = z.object({
  closure: z.object({}).passthrough(),
}).strict();

function serializeRegistry() {
  const tools = registry.listTools();
  return {
    success: true,
    data: {
      generated_at: new Date().toISOString(),
      tools,
    },
  };
}

function serializeActions() {
  const actions = registry.listTools().map((tool) => ({
    action: tool.tool_id,
    tool_id: tool.tool_id,
    engine_service: tool.service,
    endpoint: tool.execute_url,
    required_permissions: tool.required_permissions,
    strict_profile_supported: tool.strict_profile !== 'NONE',
    evidence_required: tool.evidence_required,
  }));

  return {
    success: true,
    data: {
      generated_at: new Date().toISOString(),
      actions,
    },
  };
}

router.get('/registry', (_req: Request, res: Response) => {
  res.json(serializeRegistry());
});

router.get('/registry/tools', (_req: Request, res: Response) => {
  res.json(serializeRegistry());
});

router.get('/registry/tools/:toolId', (req: Request, res: Response) => {
  const tool = registry.getTool(req.params.toolId);
  if (!tool) {
    res.status(404).json({
      success: false,
      error: 'Tool not found',
      code: 'TOOL_NOT_FOUND',
    });
    return;
  }

  res.json({
    success: true,
    data: tool,
  });
});

router.get('/registry/actions', (_req: Request, res: Response) => {
  res.json(serializeActions());
});

router.post('/evidence/create', (req: Request, res: Response) => {
  const payload = evidenceCreateSchema.parse(req.body);
  const record = evidence.create(payload.context, payload.summary);
  res.status(201).json({
    success: true,
    data: record,
  });
});

router.post('/evidence/:evidenceId/attach', (req: Request, res: Response) => {
  const payload = evidenceAttachSchema.parse(req.body);
  const record = evidence.attach(req.params.evidenceId, payload.attachment);
  res.json({
    success: true,
    data: record,
  });
});

router.post('/evidence/:evidenceId/close', (req: Request, res: Response) => {
  const payload = evidenceCloseSchema.parse(req.body);
  const record = evidence.close(req.params.evidenceId, payload.closure);
  res.json({
    success: true,
    data: record,
  });
});

router.use((error: unknown, _req: Request, res: Response, _next: () => void) => {
  if (error instanceof z.ZodError) {
    res.status(422).json({
      success: false,
      error: 'Invalid runtime payload',
      code: 'RUNTIME_SCHEMA_VALIDATION_FAILED',
      issues: error.issues,
    });
    return;
  }

  if (error instanceof RuntimeEvidenceServiceError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Runtime route failed';
  res.status(500).json({
    success: false,
    error: message,
    code: 'RUNTIME_ROUTE_FAILED',
  });
});

export default router;
