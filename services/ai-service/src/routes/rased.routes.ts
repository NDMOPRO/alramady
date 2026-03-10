import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { RasedAgentOsService } from '../services/rased-agent-os.service.js';

const router = Router();
const service = new RasedAgentOsService();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function buildContext(req: Request) {
  return {
    workspace_id: req.user?.organizationId || req.user?.tenantId || req.user?.userId || 'workspace-local',
    user_id: req.user?.userId || req.user?.id || 'user-local',
    mode: 'AUTO' as const,
    arabic_mode: 'ELITE' as const,
    locale: req.headers['accept-language']?.toString().split(',')[0] || 'ar-SA',
  };
}

const uiStateSchema = z.object({
  selection: z.object({}).passthrough(),
  open_panels: z.array(z.string()),
  focus_stage: z.object({}).passthrough(),
  running_jobs: z.array(z.object({}).passthrough()),
  artifacts: z.array(z.object({}).passthrough()).optional(),
  permissions_context: z.object({}).passthrough().optional(),
  active_template: z.string().nullable().optional(),
  active_brand: z.string().nullable().optional(),
}).strict();

router.post('/tools/execute', asyncHandler(async (req, res) => {
  const toolId = z.string().min(1).parse(req.body?.tool_id);
  const payload = {
    ...req.body,
    tool_id: toolId,
    context: req.body?.context ?? buildContext(req),
  };

  const result = await service.handleTool(toolId, payload);
  res.status(result.status === 'ok' ? 200 : 400).json(result);
}));

router.post('/rased/tools/:toolId', authMiddleware, asyncHandler(async (req, res) => {
  const toolId = z.string().min(1).parse(req.params.toolId);
  const payload = {
    ...req.body,
    tool_id: toolId,
    context: req.body?.context ?? buildContext(req),
  };

  const result = await service.handleTool(toolId, payload);
  res.status(result.status === 'ok' ? 200 : 400).json({ success: result.status === 'ok', data: result });
}));

router.post('/rased/ui-state', authMiddleware, asyncHandler(async (req, res) => {
  const snapshot = uiStateSchema.parse(req.body) as Parameters<RasedAgentOsService['syncUiState']>[1];
  const saved = await service.syncUiState(buildContext(req), snapshot);
  res.json({ success: true, data: saved });
}));

export default router;
