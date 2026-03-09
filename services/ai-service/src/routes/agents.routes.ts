import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { AutonomousOrchestratorService, AutonomousAgentType } from '../services/agents/autonomous-orchestrator.service.js';
import { AgentStudioService } from '../services/agent-studio.service.js';
import { ProactiveAIService } from '../services/proactive-ai.service.js';

const router = Router();

const orchestrator = new AutonomousOrchestratorService();
const agentStudio = new AgentStudioService();
const proactiveAI = new ProactiveAIService();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ========================
// Autonomous Orchestration Routes
// ========================

const orchestrateSchema = z.object({
  description: z.string().min(1).max(10000),
  context: z.string().max(5000).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  autoExecute: z.boolean().optional().default(false),
  qualityThreshold: z.number().min(0).max(1).optional().default(0.7),
});

router.post(
  '/agents/orchestrate',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = orchestrateSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.userId;
    const userId = req.user!.userId;

    const result = await orchestrator.orchestrate({
      description: body.description,
      tenantId,
      userId,
      context: body.context,
      data: body.data,
      autoExecute: body.autoExecute,
      qualityThreshold: body.qualityThreshold,
    });

    res.json({ success: true, data: result });
  })
);

router.post(
  '/agents/proactive/:tenantId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = z.string().min(1).parse(req.params.tenantId);

    const insights = await orchestrator.runProactiveAnalysis(tenantId);

    res.json({ success: true, data: { insights, count: insights.length } });
  })
);

router.get(
  '/agents/capabilities',
  authMiddleware,
  asyncHandler(async (_req: Request, res: Response) => {
    const capabilities = orchestrator.getAgentCapabilities();

    res.json({ success: true, data: { agents: capabilities, count: capabilities.length } });
  })
);

const decomposeSchema = z.object({
  description: z.string().min(1).max(10000),
  context: z.string().max(5000).optional(),
});

router.post(
  '/agents/decompose',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = decomposeSchema.parse(req.body);

    const steps = await orchestrator.decomposeTask(
      body.description,
      body.context
    );

    const plan = orchestrator.generateExecutionPlan(steps, {
      description: body.description,
      tenantId: req.user!.organizationId || req.user!.userId,
      userId: req.user!.userId,
      context: body.context,
    });

    res.json({ success: true, data: plan });
  })
);

// ========================
// Agent Studio Routes
// ========================

const createAgentConfigSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  agentType: z.nativeEnum(AutonomousAgentType),
  tools: z.array(z.string().min(1)).min(1),
  permissions: z.array(z.string().min(1)),
  knowledgeSources: z.array(z.string().min(1)),
  systemPrompt: z.string().min(1).max(10000),
});

router.post(
  '/agent-studio',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = createAgentConfigSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.userId;
    const userId = req.user!.userId;

    const result = await agentStudio.createAgentConfig({
      ...body,
      tenantId,
      createdBy: userId,
    });

    res.status(201).json({ success: true, data: result });
  })
);

router.get(
  '/agent-studio',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || req.user!.userId;

    const configs = await agentStudio.listAgentConfigs(tenantId);

    res.json({ success: true, data: { configs, total: configs.length } });
  })
);

router.get(
  '/agent-studio/tools',
  authMiddleware,
  asyncHandler(async (_req: Request, res: Response) => {
    const tools = agentStudio.getAvailableTools();

    res.json({ success: true, data: { tools, total: tools.length } });
  })
);

router.get(
  '/agent-studio/knowledge-sources',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || req.user!.userId;

    const sources = await agentStudio.getAvailableKnowledgeSources(tenantId);

    res.json({ success: true, data: { sources, total: sources.length } });
  })
);

router.get(
  '/agent-studio/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);

    const config = await agentStudio.getAgentConfig(id);

    res.json({ success: true, data: config });
  })
);

const updateAgentConfigSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  agentType: z.nativeEnum(AutonomousAgentType).optional(),
  tools: z.array(z.string().min(1)).min(1).optional(),
  permissions: z.array(z.string().min(1)).optional(),
  knowledgeSources: z.array(z.string().min(1)).optional(),
  systemPrompt: z.string().min(1).max(10000).optional(),
});

router.put(
  '/agent-studio/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = updateAgentConfigSchema.parse(req.body);

    const result = await agentStudio.updateAgentConfig(id, body);

    res.json({ success: true, data: result });
  })
);

router.delete(
  '/agent-studio/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);

    const result = await agentStudio.deleteAgentConfig(id);

    res.json({ success: true, data: result });
  })
);

const testAgentSchema = z.object({
  input: z.string().min(1).max(5000),
});

router.post(
  '/agent-studio/:id/test',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const { input } = testAgentSchema.parse(req.body);

    const result = await agentStudio.testAgent(id, input);

    res.json({ success: true, data: result });
  })
);

router.post(
  '/agent-studio/:id/deploy',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);

    const result = await agentStudio.deployAgent(id);

    res.json({ success: true, data: result });
  })
);

router.get(
  '/agent-studio/:id/history',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);

    const history = await agentStudio.getAgentExecutionHistory(id);

    res.json({ success: true, data: { history, total: history.length } });
  })
);

// ========================
// Proactive AI Routes
// ========================

router.get(
  '/proactive/alerts/:tenantId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = z.string().min(1).parse(req.params.tenantId);

    const alerts = await proactiveAI.getAlerts(tenantId);

    res.json({ success: true, data: { alerts, total: alerts.length } });
  })
);

router.post(
  '/proactive/alerts/:id/dismiss',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.string().min(1).parse(req.params.id);

    const result = await proactiveAI.dismissAlert(id);

    res.json({ success: true, data: result });
  })
);

const configureThresholdsSchema = z.object({
  anomalyZScoreThreshold: z.number().min(1).max(5).optional().default(2.5),
  staleDataDays: z.number().int().min(1).max(365).optional().default(30),
  qualityScoreMin: z.number().min(0).max(1).optional().default(0.7),
  trendChangePercent: z.number().min(1).max(100).optional().default(15),
  enabledAlertTypes: z
    .array(
      z.enum([
        'anomaly',
        'threshold_breach',
        'trend_change',
        'data_quality',
        'stale_data',
      ])
    )
    .optional()
    .default([
      'anomaly',
      'threshold_breach',
      'trend_change',
      'data_quality',
      'stale_data',
    ]),
});

router.post(
  '/proactive/configure/:tenantId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = z.string().min(1).parse(req.params.tenantId);
    const body = configureThresholdsSchema.parse(req.body);

    const result = await proactiveAI.configureThresholds(tenantId, body);

    res.json({ success: true, data: result });
  })
);

router.post(
  '/proactive/insights/:tenantId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = z.string().min(1).parse(req.params.tenantId);

    const insights = await proactiveAI.generateAutomatedInsights(tenantId);

    res.json({
      success: true,
      data: { insights, total: insights.length },
    });
  })
);

const forecastSchema = z.object({
  datasetId: z.string().uuid(),
  column: z.string().min(1),
  periods: z.number().int().min(1).max(100).default(10),
});

router.post(
  '/proactive/forecast',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { datasetId, column, periods } = forecastSchema.parse(req.body);

    const result = await proactiveAI.predictForecast(
      datasetId,
      column,
      periods
    );

    res.json({ success: true, data: result });
  })
);

router.post(
  '/proactive/suggest-dashboards/:tenantId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = z.string().min(1).parse(req.params.tenantId);

    const suggestions = await proactiveAI.suggestDashboards(tenantId);

    res.json({
      success: true,
      data: { suggestions, total: suggestions.length },
    });
  })
);

router.post(
  '/proactive/suggest-reports/:tenantId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = z.string().min(1).parse(req.params.tenantId);

    const suggestions = await proactiveAI.suggestReports(tenantId);

    res.json({
      success: true,
      data: { suggestions, total: suggestions.length },
    });
  })
);

export default router;
