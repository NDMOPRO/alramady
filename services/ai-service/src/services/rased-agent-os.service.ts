import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { dirname, extname, isAbsolute, join } from 'path';
import { logger } from '../utils/logger.js';
import {
  parseRasedToolRequest,
  parseRasedToolResponse,
  type RasedActionContext,
  type RasedArtifactRef,
  type RasedAssetRef,
  type RasedPreferenceValues,
  type RasedToolId,
} from './rased-tool-contracts.js';
import { RasedActionRegistryService, type RasedRegisteredAction } from './rased-action-registry.service.js';
import { RasedEventSchemaRegistryService } from './rased-event-schema-registry.service.js';
import { RasedGuardrailsService, type GuardrailEvaluation } from './rased-guardrails.service.js';

interface ServiceOptions {
  rootDir?: string;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

interface RuntimeRegistryEntry {
  tool_id: string;
  service: string;
  execute_url: string;
  required_permissions: string[];
  evidence_required: boolean;
  strict_profile: 'STRICT_PIXEL_LOCK_FINAL' | 'NONE';
  async_mode: 'sync' | 'async';
}

interface RuntimeRegistryResponse {
  success: boolean;
  data: {
    generated_at: string;
    tools: RuntimeRegistryEntry[];
  };
}

interface RuntimeEvidenceRecord {
  evidence_id: string;
  status: 'open' | 'closed';
  created_at: string;
  closed_at?: string;
  context: Record<string, unknown>;
  summary: Record<string, unknown>;
  attachments: Array<Record<string, unknown>>;
  closure: Record<string, unknown> | null;
}

interface RuntimeEvidenceResponse {
  success: boolean;
  data: RuntimeEvidenceRecord;
}

interface ExternalToolResponse {
  request_id?: string;
  tool_id?: string;
  status: 'ok' | 'failed';
  refs: Record<string, unknown>;
  warnings?: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error' }>;
  failure?: { code: string; message: string };
}

interface UiStateSnapshot {
  selection: Record<string, unknown>;
  open_panels: string[];
  focus_stage: Record<string, unknown>;
  running_jobs: Array<Record<string, unknown>>;
  artifacts?: Array<Record<string, unknown>>;
  permissions_context?: Record<string, unknown>;
  active_template?: string | null;
  active_brand?: string | null;
  observed_at?: string;
}

interface StoredTourSession {
  id: string;
  workspace_id: string;
  user_id: string;
  tour: Record<string, unknown>;
  current_step_index: number;
  step_events: Array<Record<string, unknown>>;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  started_at: string;
  completed_at?: string;
}

interface StoredPack {
  pack_id: string;
  pack_name: string;
  pack_version: string;
  scope: 'user' | 'workspace' | 'org';
  workspace_id: string;
  user_id: string;
  created_at: string;
  assets: RasedAssetRef[];
  chunks: Array<{
    chunk_id: string;
    asset_id: string;
    text: string;
    fingerprint: string;
  }>;
}

interface StoredPlaybook {
  playbook_id: string;
  version: string;
  workspace_id: string;
  user_id: string;
  created_at: string;
  playbook: Record<string, unknown>;
}

interface StoredExecution {
  graph_id: string;
  goal: string;
  executed_at: string;
  steps: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  artifacts: RasedArtifactRef[];
  warnings: Array<Record<string, unknown>>;
}

interface HandleToolResult {
  request_id: string;
  tool_id: string;
  status: 'ok' | 'failed';
  refs: Record<string, unknown>;
  warnings?: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error' }>;
  failure?: { code: string; message: string };
}

const DEFAULT_PREFERENCES: RasedPreferenceValues = {
  tone: 'official',
  language: 'ar',
  strict_defaults: ['LOCALIZE_PRO_100'],
  templates: [],
  export_targets: ['pdf'],
  reduce_motion: false,
  evidence_visibility: true,
};

const DEFAULT_UI_STATE: UiStateSnapshot = {
  selection: { kind: 'none' },
  open_panels: [],
  focus_stage: { open: false },
  running_jobs: [],
  artifacts: [],
  permissions_context: {},
  active_template: null,
  active_brand: null,
};

const DANGEROUS_OPERATION_TOKENS: Record<string, string> = {
  publish: 'CONFIRM PUBLISH',
  publish_public: 'CONFIRM PUBLISH',
  delete: 'CONFIRM DELETE',
  revoke_permissions: 'CONFIRM REVOKE',
  overwrite_template: 'CONFIRM OVERWRITE',
};

const DEFAULT_GOVERNANCE_RUNTIME_URL = 'http://localhost:8010/api/v1/governance/runtime';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right, 'en'));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}

function dedupe<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function tokenise(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function looksLikeUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export class RasedAgentOsService {
  private readonly rootDir: string;
  private readonly now: () => Date;
  private readonly fetchImpl: typeof fetch;
  private readonly actionRegistry: RasedActionRegistryService;
  private readonly eventSchemaRegistry: RasedEventSchemaRegistryService;
  private readonly guardrails: RasedGuardrailsService;

  constructor(options: ServiceOptions = {}) {
    this.rootDir = options.rootDir ?? join(process.cwd(), '.rased-agent-os');
    this.now = options.now ?? (() => new Date());
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.actionRegistry = new RasedActionRegistryService();
    this.eventSchemaRegistry = new RasedEventSchemaRegistryService();
    this.guardrails = new RasedGuardrailsService(this.now);
  }

  async handleTool(toolId: string, payload: unknown): Promise<HandleToolResult> {
    const request = parseRasedToolRequest(toolId, payload);

    try {
      const response = await this.dispatch(toolId as RasedToolId, request.request_id, request.context, request.inputs, request.params);
      return parseRasedToolResponse(toolId, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unhandled rased tool error';
      logger.error('RASED tool failed', { toolId, message });
      return parseRasedToolResponse(toolId, {
        request_id: request.request_id,
        tool_id: toolId,
        status: 'failed',
        refs: {},
        warnings: [],
        failure: {
          code: 'RASED_TOOL_FAILED',
          message,
        },
      });
    }
  }

  async syncUiState(context: RasedActionContext, snapshot: UiStateSnapshot) {
    await this.ensureDirectories();
    const next = { ...DEFAULT_UI_STATE, ...snapshot, observed_at: this.now().toISOString() };
    await this.writeJson(this.uiStatePath(context), next);
    await this.appendAudit(context, 'ui_state_sync', { snapshot: next });
    return next;
  }

  private async dispatch(
    toolId: RasedToolId,
    requestId: string,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    await this.ensureDirectories();

    switch (toolId) {
      case 'rased.intent_parse':
        return this.handleIntentParse(requestId, toolId, context, inputs, params);
      case 'rased.plan_action_graph':
        return this.handlePlanActionGraph(requestId, toolId, context, inputs);
      case 'rased.execute_action_graph':
        return this.handleExecuteActionGraph(requestId, toolId, context, inputs);
      case 'rased.observe_ui_state':
        return this.handleObserveUiState(requestId, toolId, context);
      case 'rased.ui_action.dispatch':
        return this.handleUiActionDispatch(requestId, toolId, context, inputs);
      case 'rased.ui_tour.start':
        return this.handleUiTourStart(requestId, toolId, context, inputs);
      case 'rased.ui_tour.step':
        return this.handleUiTourStep(requestId, toolId, context, inputs);
      case 'rased.ui_tour.end':
        return this.handleUiTourEnd(requestId, toolId, context, inputs);
      case 'rased.training.pack.ingest':
        return this.handleTrainingPackIngest(requestId, toolId, context, inputs, params);
      case 'rased.training.playbook.upsert':
        return this.handleTrainingPlaybookUpsert(requestId, toolId, context, inputs);
      case 'rased.training.eval.run':
        return this.handleTrainingEvalRun(requestId, toolId, context, inputs);
      case 'rased.knowledge.search':
        return this.handleKnowledgeSearch(requestId, toolId, context, inputs, params);
      case 'rased.preference.get':
        return this.handlePreferenceGet(requestId, toolId, context, params);
      case 'rased.preference.set':
        return this.handlePreferenceSet(requestId, toolId, context, inputs, params);
      case 'rased.policy.check':
        return this.handlePolicyCheck(requestId, toolId, context, inputs, params);
      case 'rased.connector.call':
        return this.handleConnectorCall(requestId, toolId, context, inputs, params);
      case 'rased.explain.trace':
        return this.handleExplainTrace(requestId, toolId, context, inputs);
      case 'rased.evidence.pack':
        return this.handleEvidencePack(requestId, toolId, context, inputs);
      default:
        throw new Error(`Unsupported RASED tool: ${toolId}`);
    }
  }

  private async handleIntentParse(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const prompt = String(inputs.prompt ?? '');
    const assets = (inputs.assets as RasedAssetRef[] | undefined) ?? [];
    const lowered = prompt.toLowerCase();

    const engineTargets = dedupe([
      ...this.detectEngineTargetsFromPrompt(lowered),
      ...this.detectEngineTargetsFromAssets(assets),
    ]);
    const finalEngineTargets = engineTargets.length > 0 ? engineTargets : ['lct'];
    const exports = this.detectExports(lowered, params.default_exports as string[] | undefined, finalEngineTargets);

    const intentManifest = {
      goal: this.detectGoal(lowered, finalEngineTargets),
      engine_targets: finalEngineTargets,
      exports,
      prompt,
      controls: {
        strict_claim: typeof params.default_strict_claim === 'string' ? params.default_strict_claim : this.detectStrictClaim(lowered),
        language: this.detectLanguage(prompt),
        guided_tour_requested: /علمني|ارشدني|أرشدني|ارشاد|إرشاد|tour|guide|coach/.test(prompt),
        executor_requested: /نفذها لي|نفذ لي|do it for me|execute for me/.test(lowered) || context.mode === 'EXECUTOR',
        tutor_requested: /علمني|ارشدني|أرشدني|ارشاد|إرشاد|tour|guide|coach/.test(prompt) || context.mode === 'TUTOR',
        controlled: context.mode === 'CONTROLLED',
        fidelity: /literal|حرفي|1:1/.test(lowered) ? 'literal_1to1' : 'smart',
      },
      risk_level: this.detectRiskLevel(lowered),
      source_assets: assets.map((asset) => ({
        ...asset,
        size_bytes: typeof (asset as { size_bytes?: unknown }).size_bytes === 'number'
          ? Number((asset as { size_bytes?: number }).size_bytes)
          : 0,
      })),
      parsed_at: this.now().toISOString(),
    };

    await this.appendAudit(context, 'intent_parse', { requestId, intentManifest });

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: { intent_manifest: intentManifest },
      warnings: [],
    };
  }

  private async handlePlanActionGraph(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const intent = inputs.intent_manifest as Record<string, unknown>;
    const engineTargets = Array.isArray(intent.engine_targets) ? intent.engine_targets.map((value) => String(value)) : ['lct'];
    const sortedTargets = [...engineTargets].sort((left, right) => left.localeCompare(right, 'en'));
    const goal = String(intent.goal ?? 'تشغيل راصد');

    const steps: Array<Record<string, unknown>> = [
      {
        step_id: 'step-01-policy',
        tool_id: 'rased.policy.check',
        action: 'rased.policy.evaluate',
        label: 'فحص السياسات والصلاحيات',
        phase: 'planning',
        depends_on: [],
        status: 'planned',
      },
      {
        step_id: 'step-02-knowledge',
        tool_id: 'rased.knowledge.search',
        action: 'rased.knowledge.retrieve',
        label: 'استدعاء المعرفة الداخلية',
        phase: 'planning',
        depends_on: ['step-01-policy'],
        status: 'planned',
      },
    ];

    sortedTargets.forEach((target, index) => {
      const toolIdForTarget = this.planToolForTarget(target, goal);
      steps.push({
        step_id: `step-${String(index + 3).padStart(2, '0')}-${target}`,
        tool_id: toolIdForTarget,
        action: this.planActionForTarget(target, goal),
        label: this.planLabelForTarget(target),
        phase: 'execution',
        depends_on: [index === 0 ? 'step-02-knowledge' : `step-${String(index + 2).padStart(2, '0')}-${sortedTargets[index - 1]}`],
        engine_target: target,
        inputs: this.planInputsForTarget(target, toolIdForTarget, goal, intent),
        params: this.planParamsForTarget(target, toolIdForTarget, intent),
        status: 'planned',
      });
    });

    steps.push({
      step_id: `step-${String(sortedTargets.length + 3).padStart(2, '0')}-evidence`,
      tool_id: 'rased.evidence.pack',
      action: 'rased.evidence.finalize',
      label: 'تجميع الأدلة',
      phase: 'verification',
      depends_on: [sortedTargets.length > 0 ? `step-${String(sortedTargets.length + 2).padStart(2, '0')}-${sortedTargets[sortedTargets.length - 1]}` : 'step-02-knowledge'],
      status: 'planned',
    });

    const actionGraph = {
      graph_id: `graph_${hashValue({ goal, sortedTargets, controls: intent.controls }).slice(0, 16)}`,
      goal,
      steps,
      created_at: this.now().toISOString(),
      deterministic: true,
      context: {
        workspace_id: context.workspace_id,
        user_id: context.user_id,
      },
    };

    await this.writeJson(this.graphPath(actionGraph.graph_id), actionGraph);
    await this.appendAudit(context, 'plan_action_graph', { requestId, graph_id: actionGraph.graph_id });

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: { action_graph: actionGraph },
      warnings: [],
    };
  }

  private async handleExecuteActionGraph(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const actionGraph = inputs.action_graph as Record<string, unknown>;
    const graphId = String(actionGraph.graph_id ?? `graph_${randomUUID()}`);
    const graphSteps = Array.isArray(actionGraph.steps) ? actionGraph.steps as Array<Record<string, unknown>> : [];
    const actionIds: string[] = [];
    const warnings: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error' }> = [];
    const events: Array<Record<string, unknown>> = [];
    const guardrailEvaluations: GuardrailEvaluation[] = [];
    const producedArtifacts: RasedArtifactRef[] = [];
    const stepOutputs: Array<Record<string, unknown>> = [];
    const classification = String(actionGraph.classification ?? 'internal');
    let deferredEvidenceStep: {
      actionId: string;
      currentAction: string;
      step: Record<string, unknown>;
      registeredAction: RasedRegisteredAction;
      evaluation: GuardrailEvaluation;
      toolRef: string;
    } | null = null;

    const addArtifacts = (artifacts: RasedArtifactRef[]) => {
      artifacts.forEach((artifact) => {
        if (!producedArtifacts.some((existing) => existing.artifact_id === artifact.artifact_id)) {
          producedArtifacts.push(artifact);
        }
      });
    };

    for (const [index, step] of graphSteps.entries()) {
      const actionId = `act_${graphId}_${String(index + 1).padStart(2, '0')}`;
      const toolRef = String(step.tool_id ?? 'unknown.tool');
      const registeredAction = this.actionRegistry.resolveForTool(toolRef, step);
      const currentAction = typeof step.action === 'string' ? step.action : registeredAction.action;
      const explicitToken = String(
        step.explicit_command_token
        ?? actionGraph.explicit_command_token
        ?? actionGraph.command_token
        ?? '',
      ).trim();

      actionIds.push(actionId);
      events.push(this.createEventRecord('rased.action.requested', {
        action_id: actionId,
        action: currentAction,
        tool_id: toolRef,
        graph_id: graphId,
        step_id: step.step_id,
      }));

      const evaluation = this.guardrails.evaluate(context, {
        action: currentAction,
        target: String(step.label ?? step.engine_target ?? toolRef),
        classification: String(step.classification ?? classification),
        explicitToken,
        inputSnapshot: {
          graph_id: graphId,
          goal: actionGraph.goal,
          step,
          tool_id: toolRef,
          context: {
            workspace_id: context.workspace_id,
            user_id: context.user_id,
          },
        },
        registeredAction,
      });
      guardrailEvaluations.push(evaluation);
      await this.writeJson(this.guardrailEvaluationPath(evaluation.evaluation_id), evaluation);
      events.push(this.createEventRecord('rased.guardrail.evaluated', {
        action_id: actionId,
        evaluation_id: evaluation.evaluation_id,
        decision: evaluation.decision,
        action: currentAction,
        required_token: evaluation.required_token ?? null,
      }));

      if (evaluation.decision === 'BLOCK' || evaluation.decision === 'REQUIRE_CONFIRMATION') {
        const failureReport = await this.createArtifact('json', `rased-execution-failure-${graphId}`, {
          graph_id: graphId,
          step_id: step.step_id,
          action_id: actionId,
          blocked_action: currentAction,
          guardrail_evaluation: evaluation,
          action_ids: actionIds,
          warnings,
        });
        await this.appendAudit(context, 'execute_action_graph_blocked', {
          requestId,
          graphId,
          actionId,
          step_id: step.step_id,
          decision: evaluation.decision,
          evaluation_id: evaluation.evaluation_id,
          failure_report: failureReport.artifact_id,
        });

        events.push(this.createEventRecord('rased.action.failed', {
          action_id: actionId,
          action: currentAction,
          tool_id: toolRef,
          graph_id: graphId,
          step_id: step.step_id,
          reason: evaluation.reason,
          decision: evaluation.decision,
        }));

        return {
          request_id: requestId,
          tool_id: toolId,
          status: 'failed',
          refs: {
            failure_report: failureReport,
            action_ids: actionIds,
            guardrail_evaluation_id: evaluation.evaluation_id,
          },
          warnings: [
            ...warnings,
            {
              code: 'ACTION_BLOCKED_BY_GUARDRAIL',
              message: evaluation.reason,
              severity: 'error',
            },
          ],
          failure: {
            code: 'ACTION_BLOCKED_BY_GUARDRAIL',
            message: evaluation.reason,
          },
        };
      }

      if (evaluation.decision === 'FLAG') {
        warnings.push({
          code: 'SENSITIVE_ACTION_FLAGGED',
          message: evaluation.reason,
          severity: 'warning',
        });
      }

      if (toolRef === 'rased.evidence.pack') {
        deferredEvidenceStep = {
          actionId,
          currentAction,
          step,
          registeredAction,
          evaluation,
          toolRef,
        };
        continue;
      }

      const delegated = !toolRef.startsWith('rased.');
      let stepStatus = 'completed';
      let outputRefs: Record<string, unknown> = {};

      if (delegated) {
        const stepResult = await this.executeExternalTool(
          `${requestId}__${String(step.step_id ?? index)}`,
          context,
          actionGraph,
          step,
          toolRef,
        );
        stepStatus = stepResult.status === 'ok' ? 'completed' : 'failed';
        outputRefs = stepResult.refs;

        addArtifacts(this.collectArtifactRefs(stepResult.refs));
        if (stepResult.warnings?.length) warnings.push(...stepResult.warnings);

        if (stepResult.status !== 'ok') {
          const failureReport = await this.createArtifact('json', `rased-external-step-failure-${graphId}`, {
            graph_id: graphId,
            step_id: step.step_id,
            action_id: actionId,
            tool_id: toolRef,
            output_refs: stepResult.refs,
            failure: stepResult.failure,
          });
          events.push(this.createEventRecord('rased.action.failed', {
            action_id: actionId,
            action: currentAction,
            tool_id: toolRef,
            graph_id: graphId,
            step_id: step.step_id,
            reason: stepResult.failure?.message ?? `فشل تنفيذ ${toolRef}.`,
          }));
          return {
            request_id: requestId,
            tool_id: toolId,
            status: 'failed',
            refs: {
              action_ids: actionIds,
              failed_step: step.step_id,
              tool_id: toolRef,
              output_refs: stepResult.refs,
              failure_report: failureReport,
            },
            warnings,
            failure: stepResult.failure ?? {
              code: 'EXTERNAL_ACTION_FAILED',
              message: `فشل تنفيذ ${toolRef}.`,
            },
          };
        }
      } else {
        const invocation = this.buildInternalStepInvocation(toolRef as RasedToolId, actionGraph, step, producedArtifacts, actionIds);
        const stepResult = await this.dispatch(
          toolRef as RasedToolId,
          `${requestId}__${String(step.step_id ?? index)}`,
          context,
          invocation.inputs,
          invocation.params,
        );
        stepStatus = stepResult.status === 'ok' ? 'completed' : 'failed';
        outputRefs = stepResult.refs;

        addArtifacts(this.collectArtifactRefs(stepResult.refs));
        if (typeof stepResult.refs.evidence_id === 'string') {
          outputRefs = { ...outputRefs, evidence_id: stepResult.refs.evidence_id };
        }

        if (stepResult.status !== 'ok') {
          events.push(this.createEventRecord('rased.action.failed', {
            action_id: actionId,
            action: currentAction,
            tool_id: toolRef,
            graph_id: graphId,
            step_id: step.step_id,
            reason: stepResult.failure?.message ?? 'فشل تنفيذ الأداة الداخلية.',
          }));
          return {
            request_id: requestId,
            tool_id: toolId,
            status: 'failed',
            refs: {
              action_ids: actionIds,
              failed_step: step.step_id,
              tool_id: toolRef,
              output_refs: stepResult.refs,
            },
            warnings: [...warnings, ...(stepResult.warnings ?? [])],
            failure: stepResult.failure ?? {
              code: 'INTERNAL_ACTION_FAILED',
              message: `فشل تنفيذ ${toolRef}.`,
            },
          };
        }

        if (stepResult.warnings?.length) warnings.push(...stepResult.warnings);
      }

      const executedStep = {
        action_id: actionId,
        action: currentAction,
        step_id: step.step_id,
        tool_id: toolRef,
        label: step.label,
        status: stepStatus,
        evaluation_id: evaluation.evaluation_id,
        required_permissions: registeredAction.required_permissions,
        executed_at: this.now().toISOString(),
        outputs: outputRefs,
      };
      stepOutputs.push(executedStep);

      events.push(this.createEventRecord('rased.action.completed', {
        action_id: actionId,
        action: currentAction,
        tool_id: toolRef,
        graph_id: graphId,
        step_id: step.step_id,
        status: stepStatus,
        outputs: outputRefs,
      }));
    }

    const execution: StoredExecution = {
      graph_id: graphId,
      goal: String(actionGraph.goal ?? 'تشغيل راصد'),
      executed_at: this.now().toISOString(),
      steps: stepOutputs,
      events,
      artifacts: [],
      warnings,
    };

    const executionArtifact = await this.createArtifact('json', `rased-execution-${graphId}`, execution);
    addArtifacts([executionArtifact]);
    execution.artifacts = [...producedArtifacts];
    await this.writeJson(this.executionPath(graphId), execution);

    const evidenceInvocation = deferredEvidenceStep
      ? this.buildInternalStepInvocation('rased.evidence.pack', actionGraph, deferredEvidenceStep.step, producedArtifacts, actionIds)
      : {
        inputs: {
          action_graph: actionGraph,
          action_ids: actionIds,
          artifacts: producedArtifacts,
          reports: { execution, warnings, guardrail_evaluations: guardrailEvaluations },
        },
        params: {},
      };

    const evidenceResult = await this.dispatch(
      'rased.evidence.pack',
      `${requestId}__${deferredEvidenceStep?.step.step_id ?? 'evidence'}`,
      context,
      evidenceInvocation.inputs,
      evidenceInvocation.params,
    );

    if (evidenceResult.warnings?.length) warnings.push(...evidenceResult.warnings);
    addArtifacts(this.collectArtifactRefs(evidenceResult.refs));

    if (evidenceResult.status !== 'ok' || typeof evidenceResult.refs.evidence_id !== 'string') {
      return {
        request_id: requestId,
        tool_id: toolId,
        status: 'failed',
        refs: {
          action_ids: actionIds,
          failed_step: deferredEvidenceStep?.step.step_id ?? 'evidence',
          tool_id: 'rased.evidence.pack',
          output_refs: evidenceResult.refs,
        },
        warnings,
        failure: evidenceResult.failure ?? {
          code: 'EVIDENCE_FINALIZATION_FAILED',
          message: 'فشل قفل Evidence Pack النهائي.',
        },
      };
    }

    if (deferredEvidenceStep) {
      stepOutputs.push({
        action_id: deferredEvidenceStep.actionId,
        action: deferredEvidenceStep.currentAction,
        step_id: deferredEvidenceStep.step.step_id,
        tool_id: deferredEvidenceStep.toolRef,
        label: deferredEvidenceStep.step.label,
        status: 'completed',
        evaluation_id: deferredEvidenceStep.evaluation.evaluation_id,
        required_permissions: deferredEvidenceStep.registeredAction.required_permissions,
        executed_at: this.now().toISOString(),
        outputs: evidenceResult.refs,
      });
      events.push(this.createEventRecord('rased.action.completed', {
        action_id: deferredEvidenceStep.actionId,
        action: deferredEvidenceStep.currentAction,
        tool_id: deferredEvidenceStep.toolRef,
        graph_id: graphId,
        step_id: deferredEvidenceStep.step.step_id,
        status: 'completed',
        outputs: evidenceResult.refs,
      }));
    }

    if (typeof evidenceResult.refs.artifact === 'object' && evidenceResult.refs.artifact) {
      const evidenceArtifact = evidenceResult.refs.artifact as RasedArtifactRef;
      events.push(this.createEventRecord('rased.evidence.finalized', {
        evidence_id: evidenceResult.refs.evidence_id,
        artifact_id: evidenceArtifact.artifact_id,
        graph_id: graphId,
      }));
    } else {
      events.push(this.createEventRecord('rased.evidence.finalized', {
        evidence_id: evidenceResult.refs.evidence_id,
        graph_id: graphId,
      }));
    }

    execution.steps = stepOutputs;
    execution.events = events;
    execution.artifacts = [...producedArtifacts];
    await this.writeJson(this.executionPath(graphId), execution);

    await this.appendAudit(context, 'execute_action_graph', {
      requestId,
      graphId,
      actionIds,
      artifact_id: executionArtifact.artifact_id,
      evidence_id: evidenceResult.refs.evidence_id,
    });

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: {
        action_ids: actionIds,
        artifacts: producedArtifacts,
        evidence_id: evidenceResult.refs.evidence_id,
      },
      warnings,
    };
  }

  private async handleObserveUiState(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
  ): Promise<HandleToolResult> {
    const uiState = await this.readJson<UiStateSnapshot>(this.uiStatePath(context), DEFAULT_UI_STATE);
    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: { ui_state: uiState },
      warnings: [],
    };
  }

  private async handleUiActionDispatch(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const actions = Array.isArray(inputs.actions) ? inputs.actions : [];
    const dispatchId = `dispatch_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const payload = {
      dispatch_id: dispatchId,
      actions,
      dispatched_at: this.now().toISOString(),
      workspace_id: context.workspace_id,
      user_id: context.user_id,
    };
    await this.writeJson(this.dispatchPath(dispatchId), payload);
    await this.appendAudit(context, 'ui_action_dispatch', { requestId, dispatchId, count: actions.length });

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: {
        applied: actions.length,
        dispatch_id: dispatchId,
      },
      warnings: [],
    };
  }

  private async handleUiTourStart(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const sessionId = `tour_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const next: StoredTourSession = {
      id: sessionId,
      workspace_id: context.workspace_id,
      user_id: context.user_id,
      tour: inputs.tour as Record<string, unknown>,
      current_step_index: 0,
      step_events: [],
      status: 'running',
      started_at: this.now().toISOString(),
    };

    await this.writeJson(this.tourPath(sessionId), next);
    await this.appendAudit(context, 'ui_tour_start', { requestId, sessionId });

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: { tour_session_id: sessionId },
      warnings: [],
    };
  }

  private async handleUiTourStep(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const sessionId = String(inputs.tour_session_id);
    const tour = await this.readJson<StoredTourSession>(this.tourPath(sessionId));
    if (!tour) throw new Error(`Tour session not found: ${sessionId}`);

    const stepEvent = {
      step_index: Number(inputs.step_index ?? 0),
      target_rased_id: inputs.target_rased_id ?? null,
      status: inputs.status,
      timestamp: this.now().toISOString(),
    };
    tour.current_step_index = Math.max(tour.current_step_index, Number(inputs.step_index ?? 0));
    tour.step_events.push(stepEvent);
    await this.writeJson(this.tourPath(sessionId), tour);
    await this.appendAudit(context, 'ui_tour_step', { requestId, sessionId, stepEvent });

    const totalSteps = Array.isArray(tour.tour.steps) ? tour.tour.steps.length : 1;
    const progress = totalSteps > 0 ? Math.min(1, (tour.current_step_index + 1) / totalSteps) : 1;

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: {
        acknowledged: true,
        progress,
      },
      warnings: [],
    };
  }

  private async handleUiTourEnd(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const sessionId = String(inputs.tour_session_id);
    const tour = await this.readJson<StoredTourSession>(this.tourPath(sessionId));
    if (!tour) throw new Error(`Tour session not found: ${sessionId}`);

    tour.status = String(inputs.outcome) as StoredTourSession['status'];
    tour.completed_at = this.now().toISOString();
    await this.writeJson(this.tourPath(sessionId), tour);
    await this.appendAudit(context, 'ui_tour_end', { requestId, sessionId, outcome: inputs.outcome });

    const totalSteps = Array.isArray(tour.tour.steps) ? tour.tour.steps.length : 1;
    const completionRate = totalSteps > 0 ? Math.min(1, tour.step_events.length / totalSteps) : 1;

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: {
        ended: true,
        completion_rate: completionRate,
      },
      warnings: [],
    };
  }

  private async handleTrainingPackIngest(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const packName = String(inputs.pack_name);
    const assets = (inputs.assets as RasedAssetRef[]) ?? [];
    const scope = (params.scope as 'user' | 'workspace' | 'org') ?? 'workspace';
    const chunks: StoredPack['chunks'] = [];

    for (const asset of assets) {
      const text = await this.extractAssetText(asset);
      if (!text) continue;
      const excerpt = text.slice(0, 4000);
      chunks.push({
        chunk_id: `chunk_${hashValue({ asset_id: asset.asset_id, excerpt }).slice(0, 16)}`,
        asset_id: asset.asset_id,
        text: excerpt,
        fingerprint: hashValue(excerpt),
      });
    }

    const packId = `pack_${hashValue({ packName, assets, scope }).slice(0, 16)}`;
    const packVersion = hashValue({ packName, assets, scope, chunks }).slice(0, 16);
    const pack: StoredPack = {
      pack_id: packId,
      pack_name: packName,
      pack_version: packVersion,
      scope,
      workspace_id: context.workspace_id,
      user_id: context.user_id,
      created_at: this.now().toISOString(),
      assets,
      chunks,
    };

    await this.writeJson(this.packPath(packId), pack);
    await this.appendAudit(context, 'training_pack_ingest', { requestId, packId, packVersion, scope });

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: {
        pack_id: packId,
        pack_version: packVersion,
      },
      warnings: chunks.length === 0 ? [{
        code: 'PACK_NO_TEXT',
        message: 'الحزمة حُفظت لكن لم يتم استخراج مقاطع نصية قابلة للفهرسة من الأصول الحالية.',
        severity: 'warning',
      }] : [],
    };
  }

  private async handleTrainingPlaybookUpsert(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const playbook = inputs.playbook as Record<string, unknown>;
    const trigger = String(playbook.trigger ?? playbook.name ?? 'generic-playbook');
    const playbookId = String(playbook.playbook_id ?? `playbook_${hashValue({ trigger, workspace_id: context.workspace_id }).slice(0, 16)}`);
    const version = hashValue({ playbook, updated_at: this.now().toISOString() }).slice(0, 16);

    const stored: StoredPlaybook = {
      playbook_id: playbookId,
      version,
      workspace_id: context.workspace_id,
      user_id: context.user_id,
      created_at: this.now().toISOString(),
      playbook,
    };

    await this.writeJson(this.playbookPath(playbookId), stored);
    await this.appendAudit(context, 'training_playbook_upsert', { requestId, playbookId, version });

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: {
        playbook_id: playbookId,
        version,
      },
      warnings: [],
    };
  }

  private async handleTrainingEvalRun(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const suiteId = String(inputs.suite_id);
    const report = await this.buildEvalReport(context, suiteId);
    const reportId = `eval_${hashValue(report).slice(0, 16)}`;
    await this.writeJson(this.evalPath(reportId), report);
    await this.appendAudit(context, 'training_eval_run', { requestId, suiteId, reportId, pass: report.pass });

    return {
      request_id: requestId,
      tool_id: toolId,
      status: report.pass ? 'ok' : 'failed',
      refs: {
        pass: report.pass,
        report_id: reportId,
      },
      warnings: report.warnings,
      ...(report.pass ? {} : { failure: { code: 'EVAL_FAILED', message: `Suite ${suiteId} failed` } }),
    };
  }

  private async handleKnowledgeSearch(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const query = String(inputs.query);
    const topK = Number(params.top_k ?? 5);
    const queryTokens = tokenise(query);
    const packs = await this.listPacks(context);
    const chunks = packs
      .flatMap((pack) => pack.chunks.map((chunk) => ({
        ...chunk,
        pack_id: pack.pack_id,
        score: this.scoreChunk(queryTokens, chunk.text),
      })))
      .filter((chunk) => chunk.score > 0)
      .sort((left, right) => right.score - left.score || left.chunk_id.localeCompare(right.chunk_id, 'en'))
      .slice(0, topK)
      .map((chunk) => ({
        chunk_id: chunk.chunk_id,
        pack_id: chunk.pack_id,
        asset_id: chunk.asset_id,
        score: Number(chunk.score.toFixed(4)),
        snippet: chunk.text.slice(0, 600),
      }));

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: { chunks },
      warnings: chunks.length === 0 ? [{
        code: 'KNOWLEDGE_EMPTY',
        message: 'لا توجد نتائج معرفة مطابقة ضمن الحزم الحالية.',
        severity: 'info',
      }] : [],
    };
  }

  private async handlePreferenceGet(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    params: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const preferences = await this.readPreferences(context, String(params.scope ?? 'workspace'));
    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: { preferences },
      warnings: [],
    };
  }

  private async handlePreferenceSet(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const scope = String(params.scope ?? 'workspace');
    const current = await this.readPreferences(context, scope);
    const next = { ...current, ...(inputs.values as RasedPreferenceValues), updated_at: this.now().toISOString() };
    await this.writeJson(this.preferencePath(context, scope), next);
    await this.appendAudit(context, 'preference_set', { requestId, scope, values: inputs.values });

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: { preferences: next },
      warnings: [],
    };
  }

  private async handlePolicyCheck(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const operation = String(inputs.operation ?? '').toLowerCase();
    const target = String(inputs.target ?? '');
    const classification = String(inputs.classification ?? 'internal');
    const evaluation = this.guardrails.evaluate(context, {
      action: operation || 'unknown',
      target,
      classification,
      explicitToken: String(params.explicit_command_token ?? inputs.command_text ?? '').trim(),
      inputSnapshot: {
        request_id: requestId,
        operation,
        target,
        classification,
        command_text: inputs.command_text ?? null,
      },
      registeredAction: this.actionRegistry.resolve(operation) ?? {
        action: operation,
        tool_id: toolId,
        engine: 'policy',
        required_permissions: [],
        sensitive: /publish|delete|export|revoke|overwrite|share/i.test(`${operation} ${target}`),
        async: false,
        emitted_events: ['rased.guardrail.evaluated'],
      },
    });

    await this.writeJson(this.guardrailEvaluationPath(evaluation.evaluation_id), evaluation);
    await this.appendAudit(context, 'policy_check', {
      requestId,
      operation,
      target,
      allow: evaluation.decision === 'PASS' || evaluation.decision === 'FLAG',
      reason: evaluation.reason,
      evaluation_id: evaluation.evaluation_id,
    });

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: {
        allow: evaluation.decision === 'PASS' || evaluation.decision === 'FLAG',
        deny: evaluation.decision === 'BLOCK' || evaluation.decision === 'REQUIRE_CONFIRMATION',
        required_token: evaluation.decision === 'REQUIRE_CONFIRMATION' ? evaluation.required_token : undefined,
        reason: evaluation.reason,
      },
      warnings: [],
    };
  }

  private async handleConnectorCall(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const connectorId = String(inputs.connector_id);
    const request = inputs.request as Record<string, unknown>;
    const url = String(request.url);
    const classification = String(params.classification ?? 'internal');
    const parsedUrl = new URL(url);
    const allowlistedHosts = ((params.allowlisted_hosts as string[] | undefined) ?? this.readAllowlist()).map((host) => host.toLowerCase());
    const hostAllowed = allowlistedHosts.length === 0 || allowlistedHosts.includes(parsedUrl.host.toLowerCase());
    const evaluation = this.guardrails.evaluate(context, {
      action: 'rased.connector.call',
      target: url,
      classification,
      explicitToken: String(params.explicit_command_token ?? ''),
      inputSnapshot: {
        request_id: requestId,
        connector_id: connectorId,
        request,
        allowlisted_hosts: allowlistedHosts,
        classification,
      },
      registeredAction: this.actionRegistry.resolve('rased.connector.call'),
    });
    await this.writeJson(this.guardrailEvaluationPath(evaluation.evaluation_id), evaluation);

    if (evaluation.decision === 'BLOCK' || evaluation.decision === 'REQUIRE_CONFIRMATION') {
      return {
        request_id: requestId,
        tool_id: toolId,
        status: 'failed',
        refs: {
          ok: false,
          status_code: 0,
          response_body: null,
          audit_id: evaluation.evaluation_id,
        },
        warnings: [],
        failure: {
          code: 'CONNECTOR_CALL_BLOCKED',
          message: evaluation.reason,
        },
      };
    }

    if (!hostAllowed || (classification === 'restricted' && parsedUrl.protocol.startsWith('http'))) {
      throw new Error(`Connector host not allowed: ${parsedUrl.host}`);
    }

    const response = await this.fetchImpl(url, {
      method: String(request.method ?? 'GET'),
      headers: request.headers as HeadersInit | undefined,
      body: typeof request.body === 'string' ? request.body : request.body ? JSON.stringify(request.body) : undefined,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const responseBody = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
    const auditId = `conn_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    await this.writeJson(this.connectorAuditPath(auditId), {
      audit_id: auditId,
      connector_id: connectorId,
      request: { ...request, url },
      status_code: response.status,
      recorded_at: this.now().toISOString(),
    });
    await this.appendAudit(context, 'connector_call', { requestId, connectorId, auditId, status_code: response.status });

    return {
      request_id: requestId,
      tool_id: toolId,
      status: response.ok ? 'ok' : 'failed',
      refs: {
        ok: response.ok,
        status_code: response.status,
        response_body: responseBody ?? null,
        audit_id: auditId,
      },
      warnings: [],
      ...(response.ok ? {} : { failure: { code: 'CONNECTOR_CALL_FAILED', message: `HTTP ${response.status}` } }),
    };
  }

  private async handleExplainTrace(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const evidenceId = typeof inputs.evidence_id === 'string' ? inputs.evidence_id : undefined;
    const actionGraph = inputs.action_graph as Record<string, unknown> | undefined;
    const execution = inputs.execution as Record<string, unknown> | undefined;
    const evidence = evidenceId ? await this.readJson<Record<string, unknown>>(this.evidencePath(evidenceId)) : null;
    const trace = {
      action_graph: actionGraph ?? evidence?.action_graph ?? null,
      execution: execution ?? evidence?.reports ?? null,
      evidence_id: evidenceId ?? evidence?.evidence_id ?? null,
    };

    const stepCount = Array.isArray((trace.action_graph as Record<string, unknown> | null)?.steps)
      ? ((trace.action_graph as Record<string, unknown>).steps as unknown[]).length
      : 0;
    const artifactCount = Array.isArray((execution ?? evidence?.artifacts) as unknown[]) ? ((execution ?? evidence?.artifacts) as unknown[]).length : 0;
    const explanation = `الخطة تحتوي على ${stepCount} خطوة، والمخرجات المسجلة ${artifactCount}، وآخر دليل مرتبط هو ${trace.evidence_id ?? 'غير متوفر'}.`;

    await this.appendAudit(context, 'explain_trace', { requestId, evidenceId, stepCount, artifactCount });

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: {
        explanation,
        trace,
      },
      warnings: [],
    };
  }

  private async handleEvidencePack(
    requestId: string,
    toolId: RasedToolId,
    context: RasedActionContext,
    inputs: Record<string, unknown>,
  ): Promise<HandleToolResult> {
    const summary = {
      action_graph: inputs.action_graph ?? null,
      action_ids: Array.isArray(inputs.action_ids) ? inputs.action_ids : [],
      reports: inputs.reports ?? {},
      ui_audit: inputs.ui_audit ?? {},
      training_refs: inputs.training_refs ?? {},
    };
    const record = await this.createGovernanceEvidence(context, summary);
    const artifacts = Array.isArray(inputs.artifacts) ? (inputs.artifacts as RasedArtifactRef[]) : [];

    for (const artifact of artifacts) {
      await this.attachGovernanceEvidence(record.evidence_id, {
        kind: 'artifact',
        artifact_id: artifact.artifact_id,
        artifact_kind: artifact.kind,
        uri: artifact.uri,
      });
    }

    if (inputs.action_graph) {
      await this.attachGovernanceEvidence(record.evidence_id, {
        kind: 'action_graph_snapshot',
        snapshot: inputs.action_graph,
      });
    }

    if (inputs.reports) {
      await this.attachGovernanceEvidence(record.evidence_id, {
        kind: 'reports',
        reports: inputs.reports,
      });
    }

    const closedRecord = await this.closeGovernanceEvidence(record.evidence_id, {
      pass: true,
      artifact_ids: artifacts.map((artifact) => artifact.artifact_id),
      reports: inputs.reports ?? {},
    });
    await this.writeJson(this.evidencePath(record.evidence_id), closedRecord);
    const artifact = await this.createArtifact('json', `governance-evidence-${record.evidence_id}`, closedRecord);

    await this.appendAudit(context, 'evidence_pack', {
      requestId,
      evidence_id: record.evidence_id,
      artifact_id: artifact.artifact_id,
    });

    return {
      request_id: requestId,
      tool_id: toolId,
      status: 'ok',
      refs: {
        evidence_id: record.evidence_id,
        artifact,
      },
      warnings: [],
    };
  }

  private detectEngineTargetsFromPrompt(prompt: string): string[] {
    const targets: string[] = [];
    if (/pdf|صورة|صوره|مطابقه|مطابقة|تحويل/.test(prompt)) targets.push('strict');
    if (/عرض|شرائح|بوربوينت|powerpoint|pptx/.test(prompt)) targets.push('slides');
    if (/تقرير|مذكرة|docx|word/.test(prompt)) targets.push('report');
    if (/لوحة|dashboard|kpi|مؤشر/.test(prompt)) targets.push('dashboard');
    if (/excel|xlsx|csv|جدول|بيانات/.test(prompt)) targets.push('excel');
    if (/تفريغ|نسخ|ترجمة|تعريب|فيديو|صوت|srt|vtt/.test(prompt)) targets.push('lct');
    return targets;
  }

  private detectEngineTargetsFromAssets(assets: RasedAssetRef[]): string[] {
    const targets: string[] = [];
    for (const asset of assets) {
      if (/audio|video/.test(asset.mime)) targets.push('lct');
      if (/spreadsheet|csv|excel/.test(asset.mime)) targets.push('excel');
      if (/pdf|image/.test(asset.mime)) targets.push('strict');
      if (/word|document/.test(asset.mime)) targets.push('report');
      if (/presentation|pptx/.test(asset.mime)) targets.push('slides');
    }
    return targets;
  }

  private detectExports(prompt: string, defaultExports: string[] | undefined, engineTargets: string[]): string[] {
    const fromPrompt: string[] = [];
    if (/pptx|powerpoint|عرض/.test(prompt)) fromPrompt.push('pptx');
    if (/docx|word|وورد/.test(prompt)) fromPrompt.push('docx');
    if (/xlsx|excel|إكسل/.test(prompt)) fromPrompt.push('xlsx');
    if (/dashboard|لوحة/.test(prompt)) fromPrompt.push('dashboard');
    if (/pdf/.test(prompt)) fromPrompt.push('pdf');
    if (/html/.test(prompt)) fromPrompt.push('html');
    if (/srt/.test(prompt)) fromPrompt.push('srt');
    if (/vtt/.test(prompt)) fromPrompt.push('vtt');
    if (/json/.test(prompt)) fromPrompt.push('json');

    if (fromPrompt.length > 0) return dedupe(fromPrompt);
    if (defaultExports && defaultExports.length > 0) return dedupe(defaultExports);
    if (engineTargets.includes('slides')) return ['pptx'];
    if (engineTargets.includes('report')) return ['docx', 'pdf'];
    if (engineTargets.includes('dashboard')) return ['dashboard', 'pdf'];
    if (engineTargets.includes('excel')) return ['xlsx'];
    if (engineTargets.includes('lct')) return ['docx', 'srt', 'json'];
    return ['json'];
  }

  private detectGoal(prompt: string, engineTargets: string[]): string {
    if (/تعلم|علمني|ارشدني|أرشدني|tour|guide/.test(prompt)) return 'guidance';
    if (/حوّل|حول|convert/.test(prompt)) return 'convert';
    if (/عرّب|عرب|ترجم|تعريب|translate|localize/.test(prompt)) return 'localize';
    if (/فرغ|تفريغ|نسخ|transcribe/.test(prompt)) return 'transcribe';
    if (/حلل|dashboard|لوحة|مؤشر/.test(prompt)) return 'analyze';
    if (/تقرير|report/.test(prompt)) return 'report';
    if (/عرض|شرائح|presentation|slides/.test(prompt)) return 'slides';
    return engineTargets[0] ?? 'orchestrate';
  }

  private detectStrictClaim(prompt: string): string {
    if (/1:1|strict|pixel|مطابقة/.test(prompt)) return 'CONVERT_STRICT_1TO1_100';
    if (/تعريب|translate|localize/.test(prompt)) return 'LOCALIZE_PRO_100';
    if (/تفريغ|transcribe|srt|vtt/.test(prompt)) return 'TRANSCRIBE_STRICT_100';
    return 'NONE';
  }

  private detectLanguage(prompt: string): 'ar' | 'en' | 'mixed' {
    const hasArabic = /[\u0600-\u06FF]/.test(prompt);
    const hasLatin = /[a-zA-Z]/.test(prompt);
    if (hasArabic && hasLatin) return 'mixed';
    return hasArabic ? 'ar' : 'en';
  }

  private detectRiskLevel(prompt: string): 'low' | 'medium' | 'high' {
    if (/delete|حذف|publish|نشر|share public|عام|revoke|overwrite/.test(prompt)) return 'high';
    if (/share|مشاركة|export|تصدير/.test(prompt)) return 'medium';
    return 'low';
  }

  private planToolForTarget(target: string, goal: string): string {
    if (target === 'lct' || ['convert', 'localize', 'transcribe'].includes(goal)) return 'lct.orch.any_to_any';
    if (target === 'slides') return 'slides.build_deck';
    if (target === 'report') return 'report.build_doc_ir';
    if (target === 'dashboard') return 'dashboard.build';
    if (target === 'excel') return 'canvas.table.create_empty';
    if (target === 'strict') return 'lct.orch.any_to_any';
    return `engine.${target}.dispatch`;
  }

  private planActionForTarget(target: string, goal: string): string {
    if (target === 'lct' || ['convert', 'localize', 'transcribe'].includes(goal)) return 'lct.any_to_any';
    if (target === 'slides') return 'slides.generate';
    if (target === 'report') return 'report.build';
    if (target === 'dashboard') return 'dashboard.build';
    if (target === 'excel') return 'excel.canvas.create';
    if (target === 'strict') return 'lct.any_to_any';
    return `engine.${target}.dispatch`;
  }

  private planLabelForTarget(target: string): string {
    switch (target) {
      case 'slides': return 'تنفيذ مسار العروض';
      case 'report': return 'تنفيذ مسار التقارير';
      case 'dashboard': return 'تنفيذ مسار اللوحات';
      case 'excel': return 'تنفيذ مسار الإكسل';
      case 'lct': return 'تنفيذ مسار التحويل/التعريب/التفريغ';
      case 'strict': return 'تنفيذ مسار المطابقة الصارمة';
      default: return `تنفيذ محرك ${target}`;
    }
  }

  private planInputsForTarget(
    target: string,
    toolId: string,
    goal: string,
    intent: Record<string, unknown>,
  ): Record<string, unknown> {
    const sourceAssets = Array.isArray(intent.source_assets)
      ? intent.source_assets as Array<Record<string, unknown>>
      : [];

    if (toolId === 'lct.orch.any_to_any') {
      return {
        assets: sourceAssets.map((asset) => ({
          asset_id: String(asset.asset_id ?? ''),
          uri: String(asset.uri ?? ''),
          mime: String(asset.mime ?? 'application/octet-stream'),
          sha256: String(asset.sha256 ?? ''),
          size_bytes: typeof asset.size_bytes === 'number' ? asset.size_bytes : 0,
        })),
        instruction: String(intent.prompt ?? goal),
      };
    }

    if (toolId === 'slides.build_deck') {
      return {
        storyboard: {
          goal,
          prompt: intent.prompt ?? goal,
          target,
          intent,
        },
        theme_tokens: {
          template_id: (intent.controls as Record<string, unknown> | undefined)?.template_id ?? 'auto',
        },
        assets: sourceAssets.map((asset) => ({
          asset_id: String(asset.asset_id ?? ''),
          uri: String(asset.uri ?? ''),
          mime: String(asset.mime ?? 'application/octet-stream'),
          sha256: String(asset.sha256 ?? ''),
        })),
      };
    }

    if (toolId === 'report.build_doc_ir') {
      return {
        outline: {
          goal,
          prompt: intent.prompt ?? goal,
          sections: ['cover', 'body', 'appendix'],
          intent,
        },
        template_id: typeof ((intent.controls as Record<string, unknown> | undefined) ?? {}).template_id === 'string'
          ? String(((intent.controls as Record<string, unknown> | undefined) ?? {}).template_id)
          : undefined,
      };
    }

    if (toolId === 'dashboard.build') {
      return {
        dashboard_ir_plan: {
          goal,
          prompt: intent.prompt ?? goal,
          pages: [{ page_id: 'page-overview', name: 'Overview' }],
          intent,
        },
      };
    }

    if (toolId === 'canvas.table.create_empty') {
      return {};
    }

    return {
      source_intent: intent,
      goal,
      target,
    };
  }

  private planParamsForTarget(
    target: string,
    toolId: string,
    intent: Record<string, unknown>,
  ): Record<string, unknown> {
    const controls = (intent.controls as Record<string, unknown> | undefined) ?? {};
    const exports = Array.isArray(intent.exports) ? intent.exports.map((value) => String(value)) : [];

    if (toolId === 'lct.orch.any_to_any') {
      const strictClaim = target === 'strict'
        ? 'CONVERT_STRICT_1TO1_100'
        : String(controls.strict_claim ?? 'NONE');
      const targetLanguage = ['ar', 'en', 'mixed'].includes(String(controls.language))
        ? String(controls.language)
        : 'ar';

      return {
        targets: exports.length > 0 ? exports : [target === 'strict' ? 'pptx' : 'json'],
        claims: [strictClaim],
        target_language: targetLanguage,
        fidelity_mode: String(controls.fidelity ?? 'smart'),
        classification: String(intent.classification ?? 'internal'),
      };
    }

    if (toolId === 'slides.build_deck') {
      return {
        grid_profile: 'premium_16_9',
        rtl_policy: 'auto',
      };
    }

    if (toolId === 'report.build_doc_ir') {
      return {};
    }

    if (toolId === 'canvas.table.create_empty') {
      return {
        name: String(intent.goal ?? 'result_table'),
      };
    }

    return {};
  }

  private async buildEvalReport(context: RasedActionContext, suiteId: string) {
    const hasPrefs = Boolean(await this.readJson<Record<string, unknown>>(this.preferencePath(context, 'workspace')).catch(() => null));
    const packFiles = await this.safeListDir(this.packsDir());
    const playbookFiles = await this.safeListDir(this.playbooksDir());
    const registryFiles = await this.safeListDir(this.registriesDir());
    const checks = [
      { id: 'tool_registry', pass: true, note: 'سجل الأدوات متاح.' },
      { id: 'preferences', pass: hasPrefs, note: hasPrefs ? 'التفضيلات متاحة.' : 'لا توجد تفضيلات محفوظة بعد.' },
      { id: 'packs', pass: suiteId === 'core-agent-os' ? true : packFiles.length > 0, note: packFiles.length > 0 ? 'هناك حزم معرفة مخزنة.' : 'لا توجد حزم معرفة مخزنة.' },
      { id: 'playbooks', pass: suiteId === 'guided-tours' ? playbookFiles.length > 0 : true, note: playbookFiles.length > 0 ? 'هناك playbooks محفوظة.' : 'لا توجد playbooks محفوظة.' },
      { id: 'registries', pass: registryFiles.length >= 3, note: registryFiles.length >= 3 ? 'سجلات الأفعال والأحداث والقيود موجودة.' : 'سجلات الحوكمة غير مكتملة.' },
    ];

    return {
      suite_id: suiteId,
      executed_at: this.now().toISOString(),
      pass: checks.every((check) => check.pass),
      checks,
      warnings: checks.filter((check) => !check.pass).map((check) => ({
        code: `EVAL_${check.id.toUpperCase()}`,
        message: check.note,
        severity: 'warning' as const,
      })),
    };
  }

  private scoreChunk(queryTokens: string[], text: string): number {
    if (queryTokens.length === 0) return 0;
    const textTokens = tokenise(text);
    const overlap = queryTokens.filter((token) => textTokens.includes(token)).length;
    if (overlap === 0) return 0;
    return overlap / Math.max(queryTokens.length, 1);
  }

  private buildInternalStepInvocation(
    toolId: RasedToolId,
    actionGraph: Record<string, unknown>,
    step: Record<string, unknown>,
    producedArtifacts: RasedArtifactRef[],
    actionIds: string[],
  ) {
    switch (toolId) {
      case 'rased.policy.check':
        return {
          inputs: {
            operation: String(step.action ?? actionGraph.goal ?? 'execute'),
            target: String(step.engine_target ?? step.label ?? actionGraph.goal ?? ''),
            command_text: String(actionGraph.command_text ?? ''),
            classification: String(step.classification ?? actionGraph.classification ?? 'internal'),
          },
          params: {
            explicit_command_token: String(step.explicit_command_token ?? actionGraph.explicit_command_token ?? ''),
          },
        };
      case 'rased.knowledge.search':
        return {
          inputs: {
            query: String(actionGraph.goal ?? step.label ?? 'rased'),
          },
          params: {
            top_k: 5,
          },
        };
      case 'rased.evidence.pack':
        return {
          inputs: {
            action_graph: actionGraph,
            action_ids: actionIds,
            artifacts: producedArtifacts,
            reports: {
              step_id: step.step_id,
              phase: step.phase ?? 'verification',
            },
          },
          params: {},
        };
      default:
        return { inputs: {}, params: {} };
    }
  }

  private buildExternalStepInvocation(
    toolId: string,
    actionGraph: Record<string, unknown>,
    step: Record<string, unknown>,
    context: RasedActionContext,
  ) {
    const explicitInputs = step.inputs && typeof step.inputs === 'object'
      ? step.inputs as Record<string, unknown>
      : null;
    const explicitParams = step.params && typeof step.params === 'object'
      ? step.params as Record<string, unknown>
      : null;
    const explicitContext = step.context_overrides && typeof step.context_overrides === 'object'
      ? step.context_overrides as Record<string, unknown>
      : null;

    if (explicitInputs || explicitParams || explicitContext) {
      return {
        context: {
          ...context,
          ...(explicitContext ?? {}),
        },
        inputs: explicitInputs ?? {},
        params: explicitParams ?? {},
      };
    }

    return {
      context,
      inputs: this.planInputsForTarget(String(step.engine_target ?? 'lct'), toolId, String(actionGraph.goal ?? 'تشغيل راصد'), actionGraph),
      params: this.planParamsForTarget(String(step.engine_target ?? 'lct'), toolId, actionGraph),
    };
  }

  private governanceRuntimeUrl() {
    return process.env.GOVERNANCE_RUNTIME_URL ?? DEFAULT_GOVERNANCE_RUNTIME_URL;
  }

  private async fetchRuntimeRegistry(): Promise<RuntimeRegistryEntry[]> {
    const response = await this.fetchImpl(`${this.governanceRuntimeUrl()}/registry`);
    if (!response.ok) {
      throw new Error(`Governance runtime registry request failed with status ${response.status}`);
    }

    const payload = await response.json() as RuntimeRegistryResponse;
    if (!payload.success || !payload.data || !Array.isArray(payload.data.tools)) {
      throw new Error('Governance runtime registry returned an invalid payload');
    }

    return payload.data.tools;
  }

  private async resolveRuntimeTool(toolId: string): Promise<RuntimeRegistryEntry> {
    const tools = await this.fetchRuntimeRegistry();
    const entry = tools.find((candidate) => candidate.tool_id === toolId);
    if (!entry) {
      throw new Error(`Runtime registry entry not found for ${toolId}`);
    }
    return entry;
  }

  private async executeExternalTool(
    requestId: string,
    context: RasedActionContext,
    actionGraph: Record<string, unknown>,
    step: Record<string, unknown>,
    toolId: string,
  ): Promise<ExternalToolResponse> {
    const runtimeTool = await this.resolveRuntimeTool(toolId);
    const invocation = this.buildExternalStepInvocation(toolId, actionGraph, step, context);
    const response = await this.fetchImpl(runtimeTool.execute_url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        request_id: requestId,
        tool_id: toolId,
        context: invocation.context,
        inputs: invocation.inputs,
        params: invocation.params,
      }),
    });

    const contentType = response.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? await response.json()
      : { status: 'failed', refs: {}, failure: { code: 'EXTERNAL_TOOL_INVALID_RESPONSE', message: await response.text() } };

    const payload = body && typeof body === 'object' && 'data' in body && 'success' in body
      ? (body as { data: ExternalToolResponse }).data
      : body;

    if (!payload || typeof payload !== 'object' || typeof (payload as { status?: string }).status !== 'string') {
      return {
        status: 'failed',
        refs: {},
        failure: {
          code: 'EXTERNAL_TOOL_INVALID_RESPONSE',
          message: `الاستجابة من ${toolId} غير قابلة للتحقق.`,
        },
      };
    }

    const parsed = payload as ExternalToolResponse;
    if (!response.ok && parsed.status !== 'ok') {
      return {
        ...parsed,
        status: 'failed',
        failure: parsed.failure ?? {
          code: 'EXTERNAL_TOOL_HTTP_FAILURE',
          message: `فشل ${toolId} بحالة HTTP ${response.status}.`,
        },
      };
    }

    return parsed;
  }

  private async createGovernanceEvidence(
    context: RasedActionContext,
    summary: Record<string, unknown>,
  ): Promise<RuntimeEvidenceRecord> {
    const response = await this.fetchImpl(`${this.governanceRuntimeUrl()}/evidence/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        context: {
          workspace_id: context.workspace_id,
          user_id: context.user_id,
          locale: context.locale,
          mode: context.mode,
        },
        summary,
      }),
    });

    if (!response.ok) {
      throw new Error(`Governance evidence create failed with status ${response.status}`);
    }

    const payload = await response.json() as RuntimeEvidenceResponse;
    if (!payload.success || !payload.data?.evidence_id) {
      throw new Error('Governance evidence create returned an invalid payload');
    }
    return payload.data;
  }

  private async attachGovernanceEvidence(
    evidenceId: string,
    attachment: Record<string, unknown>,
  ): Promise<RuntimeEvidenceRecord> {
    const response = await this.fetchImpl(`${this.governanceRuntimeUrl()}/evidence/${evidenceId}/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attachment }),
    });

    if (!response.ok) {
      throw new Error(`Governance evidence attach failed with status ${response.status}`);
    }

    const payload = await response.json() as RuntimeEvidenceResponse;
    if (!payload.success || !payload.data?.evidence_id) {
      throw new Error('Governance evidence attach returned an invalid payload');
    }
    return payload.data;
  }

  private async closeGovernanceEvidence(
    evidenceId: string,
    closure: Record<string, unknown>,
  ): Promise<RuntimeEvidenceRecord> {
    const response = await this.fetchImpl(`${this.governanceRuntimeUrl()}/evidence/${evidenceId}/close`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ closure }),
    });

    if (!response.ok) {
      throw new Error(`Governance evidence close failed with status ${response.status}`);
    }

    const payload = await response.json() as RuntimeEvidenceResponse;
    if (!payload.success || !payload.data?.evidence_id) {
      throw new Error('Governance evidence close returned an invalid payload');
    }
    return payload.data;
  }

  private collectArtifactRefs(refs: Record<string, unknown>) {
    const artifacts: RasedArtifactRef[] = [];
    const pushIfArtifact = (candidate: unknown) => {
      if (
        candidate
        && typeof candidate === 'object'
        && typeof (candidate as Record<string, unknown>).artifact_id === 'string'
        && typeof (candidate as Record<string, unknown>).kind === 'string'
        && typeof (candidate as Record<string, unknown>).uri === 'string'
      ) {
        artifacts.push(candidate as RasedArtifactRef);
      }
    };

    pushIfArtifact(refs.artifact);
    pushIfArtifact(refs.pptx);
    pushIfArtifact(refs.docx);
    pushIfArtifact(refs.pdf);
    pushIfArtifact(refs.html);
    pushIfArtifact(refs.xlsx);
    pushIfArtifact(refs.dashboard);
    pushIfArtifact(refs.link_ref);

    if (Array.isArray(refs.artifacts)) refs.artifacts.forEach(pushIfArtifact);
    if (Array.isArray(refs.renders)) refs.renders.forEach(pushIfArtifact);
    return artifacts;
  }

  private createEventRecord(eventName: string, payload: Record<string, unknown>) {
    const schema = this.eventSchemaRegistry.resolve(eventName);
    return {
      event_id: `evt_${hashValue({ eventName, payload, now: this.now().toISOString() }).slice(0, 16)}`,
      event_name: eventName,
      schema_version: schema?.version ?? '1.0.0',
      payload,
      recorded_at: this.now().toISOString(),
    };
  }

  private async readPreferences(context: RasedActionContext, scope: string) {
    return this.readJson<Record<string, unknown>>(this.preferencePath(context, scope), DEFAULT_PREFERENCES);
  }

  private findRequiredToken(operation: string, target: string) {
    if (/publish/.test(operation) || /public/.test(target)) return DANGEROUS_OPERATION_TOKENS.publish;
    if (/delete|remove/.test(operation)) return DANGEROUS_OPERATION_TOKENS.delete;
    if (/revoke/.test(operation)) return DANGEROUS_OPERATION_TOKENS.revoke_permissions;
    if (/overwrite/.test(operation) || /template/.test(target)) return DANGEROUS_OPERATION_TOKENS.overwrite_template;
    return undefined;
  }

  private readAllowlist() {
    const configured = process.env.RASED_CONNECTOR_ALLOWLIST;
    return configured ? configured.split(',').map((item) => item.trim()).filter(Boolean) : ['example.com', 'api.github.com'];
  }

  private async createArtifact(kind: RasedArtifactRef['kind'], baseName: string, content: unknown): Promise<RasedArtifactRef> {
    const artifactId = `artifact_${hashValue({ kind, baseName, content }).slice(0, 16)}`;
    const extension = kind === 'json' || kind === 'link' ? 'json' : kind;
    const artifactPath = join(this.artifactsDir(), `${sanitizeSegment(baseName)}-${artifactId}.${extension}`);
    await this.writeFileEnsuringDir(artifactPath, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
    return {
      artifact_id: artifactId,
      kind,
      uri: artifactPath,
    };
  }

  private async extractAssetText(asset: RasedAssetRef): Promise<string> {
    try {
      if (looksLikeUrl(asset.uri)) {
        const response = await this.fetchImpl(asset.uri);
        if (!response.ok) return '';
        return await response.text();
      }

      const resolvedPath = asset.uri.startsWith('file://')
        ? new URL(asset.uri)
        : (isAbsolute(asset.uri) ? asset.uri : join(process.cwd(), asset.uri));
      const buffer = await readFile(resolvedPath);
      if (/json/.test(asset.mime)) return buffer.toString('utf8');
      if (/text|markdown|html|xml|csv/.test(asset.mime) || ['.txt', '.md', '.html', '.csv', '.json'].includes(extname(String(resolvedPath)).toLowerCase())) {
        return buffer.toString('utf8');
      }
      return '';
    } catch {
      return '';
    }
  }

  private scopeKey(context: RasedActionContext) {
    return `${sanitizeSegment(context.workspace_id)}__${sanitizeSegment(context.user_id)}`;
  }

  private uiStatePath(context: RasedActionContext) {
    return join(this.uiStatesDir(), `${this.scopeKey(context)}.json`);
  }

  private preferencePath(context: RasedActionContext, scope: string) {
    return join(this.preferencesDir(), `${sanitizeSegment(scope)}__${this.scopeKey(context)}.json`);
  }

  private packPath(packId: string) {
    return join(this.packsDir(), `${sanitizeSegment(packId)}.json`);
  }

  private playbookPath(playbookId: string) {
    return join(this.playbooksDir(), `${sanitizeSegment(playbookId)}.json`);
  }

  private evalPath(reportId: string) {
    return join(this.evalsDir(), `${sanitizeSegment(reportId)}.json`);
  }

  private graphPath(graphId: string) {
    return join(this.graphsDir(), `${sanitizeSegment(graphId)}.json`);
  }

  private executionPath(graphId: string) {
    return join(this.executionsDir(), `${sanitizeSegment(graphId)}.json`);
  }

  private dispatchPath(dispatchId: string) {
    return join(this.dispatchesDir(), `${sanitizeSegment(dispatchId)}.json`);
  }

  private tourPath(sessionId: string) {
    return join(this.toursDir(), `${sanitizeSegment(sessionId)}.json`);
  }

  private evidencePath(evidenceId: string) {
    return join(this.evidenceDir(), `${sanitizeSegment(evidenceId)}.json`);
  }

  private connectorAuditPath(auditId: string) {
    return join(this.connectorsDir(), `${sanitizeSegment(auditId)}.json`);
  }

  private guardrailEvaluationPath(evaluationId: string) {
    return join(this.guardrailsDir(), `${sanitizeSegment(evaluationId)}.json`);
  }

  private async listPacks(context: RasedActionContext) {
    const files = await this.safeListDir(this.packsDir());
    const packs = await Promise.all(files.map(async (fileName) => this.readJson<StoredPack>(join(this.packsDir(), fileName)).catch(() => null)));
    return packs.filter((pack): pack is StoredPack => Boolean(pack && pack.workspace_id === context.workspace_id));
  }

  private async safeListDir(path: string) {
    try {
      return (await readdir(path)).filter((fileName) => fileName.endsWith('.json'));
    } catch {
      return [];
    }
  }

  private async readJson<T>(path: string, fallback?: T): Promise<T> {
    try {
      const value = await readFile(path, 'utf8');
      return JSON.parse(value) as T;
    } catch {
      if (fallback !== undefined) return fallback;
      throw new Error(`Missing JSON record: ${path}`);
    }
  }

  private async writeJson(path: string, value: unknown) {
    await this.writeFileEnsuringDir(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  private async writeFileEnsuringDir(path: string, value: string) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, value, 'utf8');
  }

  private async appendAudit(context: RasedActionContext, kind: string, payload: unknown) {
    const auditPath = join(this.auditDir(), `${this.scopeKey(context)}.jsonl`);
    let existing = '';
    try {
      existing = await readFile(auditPath, 'utf8');
    } catch {
      existing = '';
    }
    await this.writeFileEnsuringDir(auditPath, `${existing}${JSON.stringify({ kind, payload, recorded_at: this.now().toISOString() })}\n`);
  }

  private async ensureDirectories() {
    await Promise.all([
      this.rootDir,
      this.artifactsDir(),
      this.evidenceDir(),
      this.preferencesDir(),
      this.uiStatesDir(),
      this.toursDir(),
      this.packsDir(),
      this.playbooksDir(),
      this.evalsDir(),
      this.graphsDir(),
      this.executionsDir(),
      this.dispatchesDir(),
      this.connectorsDir(),
      this.guardrailsDir(),
      this.registriesDir(),
      this.auditDir(),
    ].map(async (dir) => mkdir(dir, { recursive: true })));
    await this.writeRegistrySnapshots();
  }

  private artifactsDir() {
    return join(this.rootDir, 'artifacts');
  }

  private evidenceDir() {
    return join(this.rootDir, 'evidence');
  }

  private preferencesDir() {
    return join(this.rootDir, 'preferences');
  }

  private uiStatesDir() {
    return join(this.rootDir, 'ui-state');
  }

  private toursDir() {
    return join(this.rootDir, 'tours');
  }

  private packsDir() {
    return join(this.rootDir, 'packs');
  }

  private playbooksDir() {
    return join(this.rootDir, 'playbooks');
  }

  private evalsDir() {
    return join(this.rootDir, 'evals');
  }

  private graphsDir() {
    return join(this.rootDir, 'graphs');
  }

  private executionsDir() {
    return join(this.rootDir, 'executions');
  }

  private dispatchesDir() {
    return join(this.rootDir, 'dispatches');
  }

  private connectorsDir() {
    return join(this.rootDir, 'connectors');
  }

  private guardrailsDir() {
    return join(this.rootDir, 'guardrails');
  }

  private registriesDir() {
    return join(this.rootDir, 'registries');
  }

  private auditDir() {
    return join(this.rootDir, 'audit');
  }

  private async writeRegistrySnapshots() {
    await Promise.all([
      this.writeJson(join(this.registriesDir(), 'action-registry.json'), {
        generated_at: this.now().toISOString(),
        actions: this.actionRegistry.list(),
      }),
      this.writeJson(join(this.registriesDir(), 'event-schema-registry.json'), {
        generated_at: this.now().toISOString(),
        events: this.eventSchemaRegistry.list(),
      }),
      this.writeJson(join(this.registriesDir(), 'guardrail-rules.json'), {
        generated_at: this.now().toISOString(),
        rules: this.guardrails.listRules(),
      }),
    ]);
  }
}
