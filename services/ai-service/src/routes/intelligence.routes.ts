import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ContextMemoryService } from '../services/intelligence/context-memory.service.js';
import { IntentEngineService } from '../services/intelligence/intent-engine.service.js';
import { TaskDecompositionService } from '../services/intelligence/task-decomposition.service.js';
import { ToolSelectionService } from '../services/intelligence/tool-selection.service.js';
import { ProactiveIntelligenceService } from '../services/intelligence/proactive-intelligence.service.js';
import { logger } from '../utils/logger.js';

// ─── Service Instances ───────────────────────────────────────────────────────

const contextMemory = new ContextMemoryService();
const intentEngine = new IntentEngineService();
const taskDecomposition = new TaskDecompositionService();
const toolSelection = new ToolSelectionService();
const proactiveIntelligence = new ProactiveIntelligenceService(undefined, contextMemory);

const router = Router();

// ─── Middleware ──────────────────────────────────────────────────────────────

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function extractAuth(req: Request): { tenantId: string; userId: string } {
  const user = (req as Request & { user?: { userId: string; organizationId?: string } }).user;
  const tenantId = user?.organizationId || user?.userId || req.headers['x-tenant-id'] as string || 'default';
  const userId = user?.userId || req.headers['x-user-id'] as string || 'anonymous';
  return { tenantId, userId };
}

// ─── Validation Schemas ──────────────────────────────────────────────────────

const UnderstandSchema = z.object({
  text: z.string().min(1).max(10000),
  sessionId: z.string().min(1).optional(),
});

const PlanSchema = z.object({
  text: z.string().min(1).max(10000),
  context: z.record(z.string(), z.unknown()).optional(),
  inputFormat: z.string().optional(),
});

const ExecuteSchema = z.object({
  planId: z.string().min(1),
  text: z.string().min(1).max(10000),
  context: z.record(z.string(), z.unknown()).optional(),
  inputFormat: z.string().optional(),
  autoExecute: z.boolean().optional().default(false),
});

const FeedbackSchema = z.object({
  episodeId: z.string().optional(),
  sessionId: z.string().min(1),
  action: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()),
  outcome: z.enum(['success', 'failure', 'partial']),
  durationMs: z.number().nonnegative(),
  engineUsed: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  feedback: z.string().optional(),
  rating: z.number().min(1).max(5).optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /intelligence/understand
 * Parse a natural language request, detect intent, and extract entities.
 */
router.post(
  '/understand',
  asyncHandler(async (req: Request, res: Response) => {
    const body = UnderstandSchema.parse(req.body);
    const { tenantId, userId } = extractAuth(req);

    // Parse intent
    const intentResult = await intentEngine.parseIntent(body.text);

    // Build context from memory
    const context = await contextMemory.buildContext(tenantId, userId, body.text);

    // Store in short-term memory
    contextMemory.storeShortTerm(tenantId, userId, 'last_intent', intentResult, 30 * 60 * 1000);

    if (body.sessionId) {
      contextMemory.storeShortTerm(tenantId, userId, 'session_id', body.sessionId, 60 * 60 * 1000);
    }

    // Update working memory
    contextMemory.updateWorkingMemory(tenantId, userId, {
      currentTask: body.text,
      attentionFocus: intentResult.targetEngines,
    });

    res.json({
      success: true,
      data: {
        intent: intentResult,
        context: {
          relevanceScore: context.contextRelevanceScore,
          recentEpisodeCount: context.recentEpisodes.length,
          relevantFactCount: context.relevantFacts.length,
          hasActiveTask: context.workingMemory.currentTask !== null,
        },
      },
    });
  }),
);

/**
 * POST /intelligence/plan
 * Create a full execution plan from a natural language request.
 */
router.post(
  '/plan',
  asyncHandler(async (req: Request, res: Response) => {
    const body = PlanSchema.parse(req.body);
    const { tenantId, userId } = extractAuth(req);

    // Parse intent
    const intentResult = await intentEngine.parseIntent(body.text);

    if (intentResult.isAmbiguous && intentResult.confidence < 0.4) {
      res.status(400).json({
        success: false,
        error: 'ambiguous_request',
        message: 'The request is ambiguous. Please clarify.',
        disambiguationOptions: intentResult.disambiguationOptions,
        alternativeIntents: intentResult.alternativeIntents,
      });
      return;
    }

    // Decompose into tasks
    const decomposition = await taskDecomposition.decompose(intentResult, body.context);

    // Select tools
    const toolPlan = toolSelection.selectToolsForPlan(
      decomposition.plan.steps,
      body.inputFormat,
    );

    // Update working memory with plan
    contextMemory.updateWorkingMemory(tenantId, userId, {
      currentTask: body.text,
      pendingSteps: decomposition.plan.steps.map((s) => ({
        id: s.id,
        description: s.name,
        status: 'pending',
      })),
      attentionFocus: intentResult.targetEngines,
    });

    // Store plan in short-term memory
    contextMemory.storeShortTerm(tenantId, userId, `plan:${decomposition.plan.id}`, {
      plan: decomposition.plan,
      toolPlan,
    }, 60 * 60 * 1000);

    res.json({
      success: true,
      data: {
        intent: intentResult,
        executionPlan: decomposition.plan,
        toolSelections: toolPlan,
        dag: decomposition.dag,
        warnings: [...decomposition.warnings, ...toolPlan.warnings],
      },
    });
  }),
);

/**
 * POST /intelligence/execute
 * Execute a previously created plan (or create and execute).
 */
router.post(
  '/execute',
  asyncHandler(async (req: Request, res: Response) => {
    const body = ExecuteSchema.parse(req.body);
    const { tenantId, userId } = extractAuth(req);

    // Check for existing plan in short-term memory
    const storedPlan = contextMemory.getShortTerm(tenantId, userId, `plan:${body.planId}`) as {
      plan: { id: string; steps: Array<{ id: string; name: string }> };
      toolPlan: { selections: Array<{ stepId: string }> };
    } | null;

    if (!storedPlan) {
      // Create a new plan on the fly
      const intentResult = await intentEngine.parseIntent(body.text);
      const decomposition = await taskDecomposition.decompose(intentResult, body.context);
      const toolPlan = toolSelection.selectToolsForPlan(decomposition.plan.steps, body.inputFormat);

      // Update working memory
      contextMemory.updateWorkingMemory(tenantId, userId, {
        currentTask: body.text,
        pendingSteps: decomposition.plan.steps.map((s) => ({
          id: s.id,
          description: s.name,
          status: 'pending',
        })),
      });

      res.json({
        success: true,
        data: {
          planId: decomposition.plan.id,
          status: 'planned',
          message: 'Execution plan created. Set autoExecute to true to execute immediately.',
          executionPlan: decomposition.plan,
          toolSelections: toolPlan,
        },
      });
      return;
    }

    // Mark steps as in-progress in working memory
    const workingMemory = contextMemory.getWorkingMemory(tenantId, userId);
    const updatedPending = workingMemory.pendingSteps.map((s) => ({
      ...s,
      status: 'in_progress' as const,
    }));

    contextMemory.updateWorkingMemory(tenantId, userId, {
      pendingSteps: updatedPending,
    });

    // Return execution acknowledgment (actual execution happens in background workers)
    res.json({
      success: true,
      data: {
        planId: body.planId,
        status: 'executing',
        stepCount: storedPlan.plan.steps.length,
        message: 'Plan execution initiated. Monitor progress via GET /intelligence/context/:userId.',
      },
    });
  }),
);

/**
 * GET /intelligence/context/:userId
 * Get current intelligence context for a user.
 */
router.get(
  '/context/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = z.string().min(1).parse(req.params.userId!);
    const { tenantId } = extractAuth(req);

    const workingMemory = contextMemory.getWorkingMemory(tenantId, userId);
    const recentEpisodes = await contextMemory.getRecentEpisodes(tenantId, userId, 10);
    const lastIntent = contextMemory.getShortTerm(tenantId, userId, 'last_intent');

    res.json({
      success: true,
      data: {
        workingMemory,
        recentEpisodes,
        lastIntent,
        timestamp: new Date().toISOString(),
      },
    });
  }),
);

/**
 * GET /intelligence/suggestions/:userId
 * Get proactive suggestions for a user.
 */
router.get(
  '/suggestions/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = z.string().min(1).parse(req.params.userId!);
    const { tenantId } = extractAuth(req);

    const [recommendations, insights] = await Promise.all([
      proactiveIntelligence.getRecommendations(tenantId, userId),
      proactiveIntelligence.getInsights(tenantId, userId),
    ]);

    // Combine and sort by confidence
    const allSuggestions = [...recommendations, ...insights]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20);

    res.json({
      success: true,
      data: {
        suggestions: allSuggestions,
        total: allSuggestions.length,
        timestamp: new Date().toISOString(),
      },
    });
  }),
);

/**
 * POST /intelligence/feedback
 * Store feedback and episode data for learning.
 */
router.post(
  '/feedback',
  asyncHandler(async (req: Request, res: Response) => {
    const body = FeedbackSchema.parse(req.body);
    const { tenantId, userId } = extractAuth(req);

    // Store as episode in context memory
    const episodeId = await contextMemory.storeEpisode(tenantId, userId, {
      sessionId: body.sessionId,
      action: body.action,
      input: body.input,
      output: body.output,
      outcome: body.outcome,
      duration_ms: body.durationMs,
      engineUsed: body.engineUsed,
      tags: body.tags || [],
    });

    // Store feedback in long-term memory if provided
    if (body.feedback || body.rating) {
      await contextMemory.storeLongTerm(tenantId, userId, 'feedback', episodeId, {
        feedback: body.feedback || null,
        rating: body.rating || null,
        action: body.action,
        outcome: body.outcome,
        timestamp: new Date().toISOString(),
      });
    }

    // Learn from success/failure patterns via semantic facts
    if (body.outcome === 'success') {
      await contextMemory.storeSemanticFact(tenantId, {
        subject: body.action,
        predicate: 'succeeded_with_engine',
        object: body.engineUsed,
        confidence: 0.8,
        source: 'user_feedback',
        tags: ['feedback', 'success', ...(body.tags || [])],
      });
    } else if (body.outcome === 'failure') {
      await contextMemory.storeSemanticFact(tenantId, {
        subject: body.action,
        predicate: 'failed_with_engine',
        object: body.engineUsed,
        confidence: 0.7,
        source: 'user_feedback',
        tags: ['feedback', 'failure', ...(body.tags || [])],
      });
    }

    // Update working memory
    const workingMemory = contextMemory.getWorkingMemory(tenantId, userId);
    const updatedCompleted = [...workingMemory.completedSteps];
    const pendingIndex = workingMemory.pendingSteps.findIndex(
      (s) => s.description === body.action,
    );

    if (pendingIndex >= 0) {
      const completedStep = workingMemory.pendingSteps[pendingIndex];
      updatedCompleted.push({
        ...completedStep,
        status: body.outcome === 'success' ? 'completed' : 'failed',
        result: body.output,
      });

      const updatedPending = [...workingMemory.pendingSteps];
      updatedPending.splice(pendingIndex, 1);

      contextMemory.updateWorkingMemory(tenantId, userId, {
        pendingSteps: updatedPending,
        completedSteps: updatedCompleted,
      });
    }

    res.json({
      success: true,
      data: {
        episodeId,
        message: 'Feedback stored successfully',
      },
    });
  }),
);

export default router;
