import { z } from 'zod';

const actionContextSchema = z.object({
  workspace_id: z.string(),
  user_id: z.string(),
  mode: z.enum(['AUTO', 'PRO']),
  arabic_mode: z.enum(['BASIC', 'PROFESSIONAL', 'ELITE']),
  locale: z.string(),
}).passthrough();

const assetRefSchema = z.object({
  asset_id: z.string(),
  uri: z.string(),
  mime: z.string(),
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/),
}).strict();

const datasetRefSchema = z.object({
  dataset_id: z.string(),
}).strict();

const dashboardRefSchema = z.object({
  dashboard_id: z.string(),
  page_count: z.number().int().min(1),
}).strict();

const artifactRefSchema = z.object({
  artifact_id: z.string(),
  kind: z.enum(['pdf', 'pptx', 'docx', 'xlsx', 'html', 'png', 'json']),
  uri: z.string(),
}).strict();

const warningsSchema = z.array(z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
}).strict()).default([]);

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
    refs,
    warnings: warningsSchema.optional(),
    failure: z.object({
      code: z.string(),
      message: z.string(),
    }).optional(),
  }).strict();
}

const requestSchemas = new Map<string, z.ZodTypeAny>([
  ['dashboard.intent_parse', toolRequestSchema(
    'dashboard.intent_parse',
    z.object({
      prompt: z.string().min(1),
      assets: z.array(assetRefSchema).optional(),
    }).strict(),
    z.object({
      strict_import: z.boolean().optional(),
      pages_hint: z.number().int().min(1).max(50).optional(),
    }).strict(),
  )],
  ['dashboard.catalog_search', toolRequestSchema(
    'dashboard.catalog_search',
    z.object({
      query: z.string().min(1),
    }).strict(),
    z.object({
      catalog: z.string(),
      top_k: z.number().int().min(1).max(50),
    }).strict(),
  )],
  ['dashboard.plan', toolRequestSchema(
    'dashboard.plan',
    z.object({
      intent: z.object({}).passthrough(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['dashboard.build', toolRequestSchema(
    'dashboard.build',
    z.object({
      dashboard_ir_plan: z.object({}).passthrough(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['dashboard.bind_data', toolRequestSchema(
    'dashboard.bind_data',
    z.object({
      dashboard: dashboardRefSchema,
      datasets: z.array(datasetRefSchema).min(1),
      tir_steps: z.array(z.object({}).passthrough()).optional(),
      mir_measures: z.array(z.object({}).passthrough()).optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['dashboard.render_preview', toolRequestSchema(
    'dashboard.render_preview',
    z.object({
      dashboard: dashboardRefSchema,
    }).strict(),
    z.object({
      dpi: z.number().int().min(96).max(600),
    }).strict(),
  )],
  ['dashboard.qa_validate', toolRequestSchema(
    'dashboard.qa_validate',
    z.object({
      dashboard: dashboardRefSchema,
    }).strict(),
    z.object({
      must_pass_all: z.literal(true),
    }).strict(),
  )],
  ['dashboard.qa_autofix', toolRequestSchema(
    'dashboard.qa_autofix',
    z.object({
      dashboard: dashboardRefSchema,
      issues: z.array(z.object({}).passthrough()),
    }).strict(),
    z.object({}).strict(),
  )],
  ['dashboard.publish', toolRequestSchema(
    'dashboard.publish',
    z.object({
      dashboard: dashboardRefSchema,
      share_policy: z.object({}).passthrough(),
      permissions: z.object({}).passthrough(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['dashboard.export', toolRequestSchema(
    'dashboard.export',
    z.object({
      dashboard: dashboardRefSchema,
    }).strict(),
    z.object({
      export_kind: z.enum(['pdf', 'pptx', 'docx', 'xlsx', 'html', 'png']),
    }).strict(),
  )],
  ['dashboard.parity_verify', toolRequestSchema(
    'dashboard.parity_verify',
    z.object({
      dashboard: dashboardRefSchema,
      artifact: artifactRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['dashboard.evidence_pack', toolRequestSchema(
    'dashboard.evidence_pack',
    z.object({
      dashboard: dashboardRefSchema,
      artifacts: z.array(artifactRefSchema).optional(),
      qa_report: z.object({}).passthrough().optional(),
      parity_report: z.object({}).passthrough().optional(),
    }).strict(),
    z.object({}).strict(),
  )],
]);

const responseSchemas = new Map<string, z.ZodTypeAny>([
  ['dashboard.intent_parse', toolResponseSchema(
    'dashboard.intent_parse',
    z.object({
      intent: z.object({}).passthrough(),
    }).strict(),
  )],
  ['dashboard.catalog_search', toolResponseSchema(
    'dashboard.catalog_search',
    z.object({
      items: z.array(z.object({}).passthrough()),
    }).strict(),
  )],
  ['dashboard.plan', toolResponseSchema(
    'dashboard.plan',
    z.object({
      dashboard_ir_plan: z.object({}).passthrough(),
    }).strict(),
  )],
  ['dashboard.build', toolResponseSchema(
    'dashboard.build',
    z.object({
      dashboard: dashboardRefSchema,
    }).strict(),
  )],
  ['dashboard.bind_data', toolResponseSchema(
    'dashboard.bind_data',
    z.object({
      dashboard: dashboardRefSchema,
    }).strict(),
  )],
  ['dashboard.render_preview', toolResponseSchema(
    'dashboard.render_preview',
    z.object({
      renders: z.array(artifactRefSchema).min(1),
    }).strict(),
  )],
  ['dashboard.qa_validate', toolResponseSchema(
    'dashboard.qa_validate',
    z.object({
      pass: z.boolean(),
      issues: z.array(z.object({}).passthrough()),
    }).strict(),
  )],
  ['dashboard.qa_autofix', toolResponseSchema(
    'dashboard.qa_autofix',
    z.object({
      dashboard: dashboardRefSchema,
      fix_log: z.array(z.object({}).passthrough()),
    }).strict(),
  )],
  ['dashboard.publish', toolResponseSchema(
    'dashboard.publish',
    z.object({
      link_ref: artifactRefSchema,
      audit_entry_id: z.string(),
    }).strict(),
  )],
  ['dashboard.export', toolResponseSchema(
    'dashboard.export',
    z.object({
      artifact: artifactRefSchema,
    }).strict(),
  )],
  ['dashboard.parity_verify', toolResponseSchema(
    'dashboard.parity_verify',
    z.object({
      pass: z.boolean(),
      report: z.object({}).passthrough(),
    }).strict(),
  )],
  ['dashboard.evidence_pack', toolResponseSchema(
    'dashboard.evidence_pack',
    z.object({
      evidence_id: z.string(),
    }).strict(),
  )],
]);

export const DASHBOARD_TOOL_DEFINITIONS = [
  { tool_id: 'dashboard.intent_parse', version: '1.0.0', input_schema_ref: 'https://dash.local/schemas/dashboard.intent_parse.input.json', output_schema_ref: 'https://dash.local/schemas/dashboard.intent_parse.output.json', required_permissions: ['read:assets', 'write:datasets'] },
  { tool_id: 'dashboard.catalog_search', version: '1.0.0', input_schema_ref: 'https://dash.local/schemas/dashboard.catalog_search.input.json', output_schema_ref: 'https://dash.local/schemas/dashboard.catalog_search.output.json', required_permissions: ['read:catalogs'] },
  { tool_id: 'dashboard.plan', version: '1.0.0', input_schema_ref: 'https://dash.local/schemas/dashboard.plan.input.json', output_schema_ref: 'https://dash.local/schemas/dashboard.plan.output.json', required_permissions: ['read:datasets'] },
  { tool_id: 'dashboard.build', version: '1.0.0', input_schema_ref: 'https://dash.local/schemas/dashboard.build.input.json', output_schema_ref: 'https://dash.local/schemas/dashboard.build.output.json', required_permissions: ['write:dashboards'] },
  { tool_id: 'dashboard.bind_data', version: '1.0.0', input_schema_ref: 'https://dash.local/schemas/dashboard.bind_data.input.json', output_schema_ref: 'https://dash.local/schemas/dashboard.bind_data.output.json', required_permissions: ['read:datasets', 'write:dashboards'] },
  { tool_id: 'dashboard.render_preview', version: '1.0.0', input_schema_ref: 'https://dash.local/schemas/dashboard.render_preview.input.json', output_schema_ref: 'https://dash.local/schemas/dashboard.render_preview.output.json', required_permissions: ['read:dashboards', 'write:artifacts'] },
  { tool_id: 'dashboard.qa_validate', version: '1.0.0', input_schema_ref: 'https://dash.local/schemas/dashboard.qa_validate.input.json', output_schema_ref: 'https://dash.local/schemas/dashboard.qa_validate.output.json', required_permissions: ['read:dashboards'] },
  { tool_id: 'dashboard.qa_autofix', version: '1.0.0', input_schema_ref: 'https://dash.local/schemas/dashboard.qa_autofix.input.json', output_schema_ref: 'https://dash.local/schemas/dashboard.qa_autofix.output.json', required_permissions: ['read:dashboards', 'write:dashboards'] },
  { tool_id: 'dashboard.publish', version: '1.0.0', input_schema_ref: 'https://dash.local/schemas/dashboard.publish.input.json', output_schema_ref: 'https://dash.local/schemas/dashboard.publish.output.json', required_permissions: ['read:dashboards', 'publish:dashboards'] },
  { tool_id: 'dashboard.export', version: '1.0.0', input_schema_ref: 'https://dash.local/schemas/dashboard.export.input.json', output_schema_ref: 'https://dash.local/schemas/dashboard.export.output.json', required_permissions: ['read:dashboards', 'write:artifacts'] },
  { tool_id: 'dashboard.parity_verify', version: '1.0.0', input_schema_ref: 'https://dash.local/schemas/dashboard.parity_verify.input.json', output_schema_ref: 'https://dash.local/schemas/dashboard.parity_verify.output.json', required_permissions: ['read:dashboards', 'read:artifacts'] },
  { tool_id: 'dashboard.evidence_pack', version: '1.0.0', input_schema_ref: 'https://dash.local/schemas/dashboard.evidence_pack.input.json', output_schema_ref: 'https://dash.local/schemas/dashboard.evidence_pack.output.json', required_permissions: ['read:dashboards', 'read:artifacts', 'write:evidence'] },
] as const;

export type DashboardContractDirection = 'request' | 'response';

export function validateDashboardToolContract(
  toolId: string,
  direction: DashboardContractDirection,
  payload: unknown,
) {
  const schema = direction === 'request'
    ? requestSchemas.get(toolId)
    : responseSchemas.get(toolId);

  if (!schema) {
    throw new Error(`Dashboard tool contract not registered: ${toolId}`);
  }

  return schema.parse(payload);
}
