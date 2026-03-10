import { z } from 'zod';

const modeSchema = z.enum(['AUTO', 'CONTROLLED', 'TUTOR', 'EXECUTOR']);
const arabicModeSchema = z.enum(['BASIC', 'PROFESSIONAL', 'ELITE']);
const warningsSchema = z.array(z.object({
  code: z.string().min(2).max(64),
  message: z.string().min(1).max(2000),
  severity: z.enum(['info', 'warning', 'error']),
}).strict()).default([]);

const actionContextSchema = z.object({
  workspace_id: z.string().min(3).max(128),
  user_id: z.string().min(3).max(128),
  mode: modeSchema,
  arabic_mode: arabicModeSchema,
  locale: z.string().min(2).max(16),
}).passthrough();

const assetRefSchema = z.object({
  asset_id: z.string().min(8).max(128),
  uri: z.string().max(2048),
  mime: z.string().max(128),
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/),
}).strict();

const artifactRefSchema = z.object({
  artifact_id: z.string().min(8).max(128),
  kind: z.enum(['pptx', 'docx', 'xlsx', 'dashboard', 'pdf', 'html', 'png', 'json', 'srt', 'vtt', 'link']),
  uri: z.string().max(2048),
}).strict();

const anyObjectSchema = z.object({}).passthrough();
const anyArraySchema = z.array(anyObjectSchema);

const tourModeSchema = z.enum(['explain', 'coach', 'executor']);
const uiActionTypeSchema = z.enum(['open_sidebar', 'close_sidebar', 'open_focus', 'close_focus', 'select', 'set_control', 'scroll_to', 'highlight']);

function toolRequestSchema<TInputs extends z.ZodTypeAny, TParams extends z.ZodTypeAny>(
  toolId: string,
  inputs: TInputs,
  params: TParams,
) {
  return z.object({
    request_id: z.string(),
    tool_id: z.literal(toolId),
    context: actionContextSchema,
    inputs,
    params,
  }).strict();
}

function toolResponseSchema<TRefs extends z.ZodTypeAny>(
  toolId: string,
  refs: TRefs,
) {
  return z.object({
    request_id: z.string(),
    tool_id: z.literal(toolId),
    status: z.enum(['ok', 'failed']),
    refs: z.union([refs, z.object({}).passthrough()]),
    warnings: warningsSchema.optional(),
    failure: z.object({
      code: z.string(),
      message: z.string(),
    }).optional(),
  }).strict();
}

const preferenceValuesSchema = z.object({
  tone: z.enum(['official', 'business', 'technical', 'simple']).optional(),
  language: z.enum(['ar', 'en', 'mixed']).optional(),
  strict_defaults: z.array(z.string()).optional(),
  templates: z.array(z.string()).optional(),
  export_targets: z.array(z.string()).optional(),
  reduce_motion: z.boolean().optional(),
  evidence_visibility: z.boolean().optional(),
}).strict();

const tourSchema = z.object({
  name: z.string().min(1).max(256),
  mode: tourModeSchema,
  steps: z.array(z.object({
    step_id: z.string().min(1).max(128),
    target_rased_id: z.string().min(1).max(256),
    title: z.string().min(1).max(256),
    body: z.string().min(1).max(2000),
    action: z.object({
      type: uiActionTypeSchema,
      value: z.union([z.string(), z.number(), z.boolean(), anyObjectSchema, z.null()]).optional(),
    }).optional(),
  }).strict()).min(1),
}).strict();

const actionGraphSchema = z.object({
  graph_id: z.string().min(8),
  goal: z.string().optional(),
  steps: z.array(z.object({
    step_id: z.string().min(1),
    tool_id: z.string().min(1),
    action: z.string().min(1).optional(),
    label: z.string().min(1),
    phase: z.string().min(1),
    depends_on: z.array(z.string()).optional(),
    engine_target: z.string().optional(),
    inputs: anyObjectSchema.optional(),
    params: anyObjectSchema.optional(),
    status: z.string().optional(),
    metadata: anyObjectSchema.optional(),
  }).strict()).min(1),
}).passthrough();

export const RASED_TOOL_REGISTRY = {
  'rased.intent_parse': {
    required_permissions: ['ai:execute'],
    determinism: 'deterministic',
    category: 'agent',
  },
  'rased.plan_action_graph': {
    required_permissions: ['ai:execute'],
    determinism: 'deterministic',
    category: 'agent',
  },
  'rased.execute_action_graph': {
    required_permissions: ['ai:execute'],
    determinism: 'deterministic',
    category: 'agent',
  },
  'rased.observe_ui_state': {
    required_permissions: ['ui:observe'],
    determinism: 'deterministic',
    category: 'ui',
  },
  'rased.ui_action.dispatch': {
    required_permissions: ['ui:control'],
    determinism: 'deterministic',
    category: 'ui',
  },
  'rased.ui_tour.start': {
    required_permissions: ['ui:tour'],
    determinism: 'deterministic',
    category: 'tour',
  },
  'rased.ui_tour.step': {
    required_permissions: ['ui:tour'],
    determinism: 'deterministic',
    category: 'tour',
  },
  'rased.ui_tour.end': {
    required_permissions: ['ui:tour'],
    determinism: 'deterministic',
    category: 'tour',
  },
  'rased.training.pack.ingest': {
    required_permissions: ['training:write'],
    determinism: 'deterministic',
    category: 'training',
  },
  'rased.training.playbook.upsert': {
    required_permissions: ['training:write'],
    determinism: 'deterministic',
    category: 'training',
  },
  'rased.training.eval.run': {
    required_permissions: ['training:execute'],
    determinism: 'deterministic',
    category: 'training',
  },
  'rased.knowledge.search': {
    required_permissions: ['knowledge:read'],
    determinism: 'deterministic',
    category: 'knowledge',
  },
  'rased.preference.get': {
    required_permissions: ['preference:read'],
    determinism: 'deterministic',
    category: 'preference',
  },
  'rased.preference.set': {
    required_permissions: ['preference:write'],
    determinism: 'deterministic',
    category: 'preference',
  },
  'rased.policy.check': {
    required_permissions: ['policy:check'],
    determinism: 'deterministic',
    category: 'policy',
  },
  'rased.connector.call': {
    required_permissions: ['connector:call'],
    determinism: 'deterministic',
    category: 'connector',
  },
  'rased.explain.trace': {
    required_permissions: ['evidence:read'],
    determinism: 'deterministic',
    category: 'trace',
  },
  'rased.evidence.pack': {
    required_permissions: ['evidence:write'],
    determinism: 'deterministic',
    category: 'evidence',
  },
} as const;

export type RasedToolId = keyof typeof RASED_TOOL_REGISTRY;

const requestSchemas = new Map<string, z.ZodTypeAny>([
  ['rased.intent_parse', toolRequestSchema(
    'rased.intent_parse',
    z.object({
      prompt: z.string().min(1),
      assets: z.array(assetRefSchema).optional(),
    }).strict(),
    z.object({
      default_strict_claim: z.string().optional(),
      default_exports: z.array(z.string()).optional(),
    }).passthrough(),
  )],
  ['rased.plan_action_graph', toolRequestSchema(
    'rased.plan_action_graph',
    z.object({
      intent_manifest: anyObjectSchema,
    }).strict(),
    z.object({
      deterministic: z.literal(true),
    }).strict(),
  )],
  ['rased.execute_action_graph', toolRequestSchema(
    'rased.execute_action_graph',
    z.object({
      action_graph: actionGraphSchema,
    }).strict(),
    z.object({
      must_produce_evidence: z.literal(true),
    }).strict(),
  )],
  ['rased.observe_ui_state', toolRequestSchema(
    'rased.observe_ui_state',
    z.object({}).strict(),
    z.object({}).strict(),
  )],
  ['rased.ui_action.dispatch', toolRequestSchema(
    'rased.ui_action.dispatch',
    z.object({
      actions: z.array(z.object({
        type: uiActionTypeSchema,
        target_rased_id: z.string().optional(),
        value: z.union([z.string(), z.number(), z.boolean(), anyObjectSchema, z.null()]).optional(),
      }).strict()).min(1),
    }).strict(),
    z.object({}).strict(),
  )],
  ['rased.ui_tour.start', toolRequestSchema(
    'rased.ui_tour.start',
    z.object({
      tour: tourSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['rased.ui_tour.step', toolRequestSchema(
    'rased.ui_tour.step',
    z.object({
      tour_session_id: z.string().min(8),
      step_index: z.number().int().min(0),
      target_rased_id: z.string().min(1).max(256).optional(),
      status: z.enum(['viewed', 'completed', 'auto_applied', 'failed']),
    }).strict(),
    z.object({}).strict(),
  )],
  ['rased.ui_tour.end', toolRequestSchema(
    'rased.ui_tour.end',
    z.object({
      tour_session_id: z.string().min(8),
      outcome: z.enum(['completed', 'cancelled', 'failed']),
      feedback: z.string().max(2000).optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['rased.training.pack.ingest', toolRequestSchema(
    'rased.training.pack.ingest',
    z.object({
      pack_name: z.string().min(1).max(256),
      assets: z.array(assetRefSchema).min(1),
    }).strict(),
    z.object({
      scope: z.enum(['user', 'workspace', 'org']),
    }).strict(),
  )],
  ['rased.training.playbook.upsert', toolRequestSchema(
    'rased.training.playbook.upsert',
    z.object({
      playbook: anyObjectSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['rased.training.eval.run', toolRequestSchema(
    'rased.training.eval.run',
    z.object({
      suite_id: z.string().min(1),
    }).strict(),
    z.object({
      must_pass: z.literal(true),
    }).strict(),
  )],
  ['rased.knowledge.search', toolRequestSchema(
    'rased.knowledge.search',
    z.object({
      query: z.string().min(1),
    }).strict(),
    z.object({
      top_k: z.number().int().min(1).max(20),
    }).strict(),
  )],
  ['rased.preference.get', toolRequestSchema(
    'rased.preference.get',
    z.object({}).strict(),
    z.object({
      scope: z.enum(['user', 'workspace']).optional(),
    }).strict(),
  )],
  ['rased.preference.set', toolRequestSchema(
    'rased.preference.set',
    z.object({
      values: preferenceValuesSchema,
    }).strict(),
    z.object({
      scope: z.enum(['user', 'workspace']).optional(),
    }).strict(),
  )],
  ['rased.policy.check', toolRequestSchema(
    'rased.policy.check',
    z.object({
      operation: z.string().min(1),
      target: z.string().optional(),
      command_text: z.string().optional(),
      classification: z.enum(['public', 'internal', 'confidential', 'restricted']).optional(),
    }).strict(),
    z.object({
      explicit_command_token: z.string().optional(),
    }).strict(),
  )],
  ['rased.connector.call', toolRequestSchema(
    'rased.connector.call',
    z.object({
      connector_id: z.string().min(1),
      request: z.object({
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
        url: z.string().url(),
        headers: z.record(z.string(), z.string()).optional(),
        body: z.union([z.string(), anyObjectSchema]).optional(),
      }).strict(),
    }).strict(),
    z.object({
      allowlisted_hosts: z.array(z.string()).optional(),
      classification: z.enum(['public', 'internal', 'confidential', 'restricted']).optional(),
    }).strict(),
  )],
  ['rased.explain.trace', toolRequestSchema(
    'rased.explain.trace',
    z.object({
      action_graph: anyObjectSchema.optional(),
      execution: anyObjectSchema.optional(),
      evidence_id: z.string().min(8).optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['rased.evidence.pack', toolRequestSchema(
    'rased.evidence.pack',
    z.object({
      action_graph: anyObjectSchema.optional(),
      action_ids: z.array(z.string()).optional(),
      artifacts: z.array(artifactRefSchema).optional(),
      reports: anyObjectSchema.optional(),
      ui_audit: anyObjectSchema.optional(),
      training_refs: anyObjectSchema.optional(),
    }).strict(),
    z.object({}).strict(),
  )],
]);

const responseSchemas = new Map<string, z.ZodTypeAny>([
  ['rased.intent_parse', toolResponseSchema(
    'rased.intent_parse',
    z.object({
      intent_manifest: z.object({
        goal: z.string(),
        engine_targets: z.array(z.string()).min(1),
        exports: z.array(z.string()),
        controls: anyObjectSchema,
        risk_level: z.enum(['low', 'medium', 'high']),
      }).passthrough(),
    }).strict(),
  )],
  ['rased.plan_action_graph', toolResponseSchema(
    'rased.plan_action_graph',
    z.object({
      action_graph: actionGraphSchema,
    }).strict(),
  )],
  ['rased.execute_action_graph', toolResponseSchema(
    'rased.execute_action_graph',
    z.object({
      action_ids: z.array(z.string()).min(1),
      artifacts: z.array(artifactRefSchema).min(1),
      evidence_id: z.string().min(8),
    }).strict(),
  )],
  ['rased.observe_ui_state', toolResponseSchema(
    'rased.observe_ui_state',
    z.object({
      ui_state: z.object({
        selection: anyObjectSchema,
        open_panels: z.array(z.string()),
        focus_stage: anyObjectSchema,
        running_jobs: z.array(anyObjectSchema),
      }).passthrough(),
    }).strict(),
  )],
  ['rased.ui_action.dispatch', toolResponseSchema(
    'rased.ui_action.dispatch',
    z.object({
      applied: z.number().int().min(0),
      dispatch_id: z.string().min(8).optional(),
    }).strict(),
  )],
  ['rased.ui_tour.start', toolResponseSchema(
    'rased.ui_tour.start',
    z.object({
      tour_session_id: z.string().min(8),
    }).strict(),
  )],
  ['rased.ui_tour.step', toolResponseSchema(
    'rased.ui_tour.step',
    z.object({
      acknowledged: z.boolean(),
      progress: z.number().min(0).max(1),
    }).strict(),
  )],
  ['rased.ui_tour.end', toolResponseSchema(
    'rased.ui_tour.end',
    z.object({
      ended: z.boolean(),
      completion_rate: z.number().min(0).max(1),
    }).strict(),
  )],
  ['rased.training.pack.ingest', toolResponseSchema(
    'rased.training.pack.ingest',
    z.object({
      pack_id: z.string(),
      pack_version: z.string(),
    }).strict(),
  )],
  ['rased.training.playbook.upsert', toolResponseSchema(
    'rased.training.playbook.upsert',
    z.object({
      playbook_id: z.string(),
      version: z.string(),
    }).strict(),
  )],
  ['rased.training.eval.run', toolResponseSchema(
    'rased.training.eval.run',
    z.object({
      pass: z.boolean(),
      report_id: z.string(),
    }).strict(),
  )],
  ['rased.knowledge.search', toolResponseSchema(
    'rased.knowledge.search',
    z.object({
      chunks: z.array(anyObjectSchema),
    }).strict(),
  )],
  ['rased.preference.get', toolResponseSchema(
    'rased.preference.get',
    z.object({
      preferences: preferenceValuesSchema.passthrough(),
    }).strict(),
  )],
  ['rased.preference.set', toolResponseSchema(
    'rased.preference.set',
    z.object({
      preferences: preferenceValuesSchema.passthrough(),
    }).strict(),
  )],
  ['rased.policy.check', toolResponseSchema(
    'rased.policy.check',
    z.object({
      allow: z.boolean(),
      deny: z.boolean(),
      required_token: z.string().optional(),
      reason: z.string(),
    }).strict(),
  )],
  ['rased.connector.call', toolResponseSchema(
    'rased.connector.call',
    z.object({
      ok: z.boolean(),
      status_code: z.number().int(),
      response_body: z.union([z.string(), anyObjectSchema, z.null()]),
      audit_id: z.string(),
    }).strict(),
  )],
  ['rased.explain.trace', toolResponseSchema(
    'rased.explain.trace',
    z.object({
      explanation: z.string(),
      trace: anyObjectSchema,
    }).strict(),
  )],
  ['rased.evidence.pack', toolResponseSchema(
    'rased.evidence.pack',
    z.object({
      evidence_id: z.string().min(8),
      artifact: artifactRefSchema.optional(),
    }).strict(),
  )],
]);

export type RasedPreferenceValues = z.infer<typeof preferenceValuesSchema>;
export type RasedActionContext = z.infer<typeof actionContextSchema>;
export type RasedAssetRef = z.infer<typeof assetRefSchema>;
export type RasedArtifactRef = z.infer<typeof artifactRefSchema>;

export function parseRasedToolRequest(toolId: string, payload: unknown) {
  const schema = requestSchemas.get(toolId);
  if (!schema) throw new Error(`Unsupported rased tool request schema: ${toolId}`);
  return schema.parse(payload);
}

export function parseRasedToolResponse(toolId: string, payload: unknown) {
  const schema = responseSchemas.get(toolId);
  if (!schema) throw new Error(`Unsupported rased tool response schema: ${toolId}`);
  return schema.parse(payload);
}

export function getRasedRequestSchema(toolId: string) {
  return requestSchemas.get(toolId);
}

export function getRasedResponseSchema(toolId: string) {
  return responseSchemas.get(toolId);
}
