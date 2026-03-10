import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashDir = join(__dirname, '..', '..', '..', 'schemas', 'dash');
const toolsDir = join(dashDir, 'tools');
mkdirSync(toolsDir, { recursive: true });

const common = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://dash.local/schemas/common.json',
  $defs: {
    Mode: { type: 'string', enum: ['AUTO', 'PRO'] },
    ArabicMode: { type: 'string', enum: ['BASIC', 'PROFESSIONAL', 'ELITE'] },
    ActionContext: {
      type: 'object',
      required: ['workspace_id', 'user_id', 'mode', 'arabic_mode', 'locale'],
      properties: {
        workspace_id: { type: 'string' },
        user_id: { type: 'string' },
        mode: { $ref: '#/$defs/Mode' },
        arabic_mode: { $ref: '#/$defs/ArabicMode' },
        locale: { type: 'string' },
      },
      additionalProperties: true,
    },
    AssetRef: {
      type: 'object',
      required: ['asset_id', 'uri', 'mime', 'sha256'],
      properties: {
        asset_id: { type: 'string' },
        uri: { type: 'string' },
        mime: { type: 'string' },
        sha256: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
      },
      additionalProperties: false,
    },
    DatasetRef: {
      type: 'object',
      required: ['dataset_id'],
      properties: { dataset_id: { type: 'string' } },
      additionalProperties: false,
    },
    DashboardRef: {
      type: 'object',
      required: ['dashboard_id', 'page_count'],
      properties: {
        dashboard_id: { type: 'string' },
        page_count: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
    ArtifactRef: {
      type: 'object',
      required: ['artifact_id', 'kind', 'uri'],
      properties: {
        artifact_id: { type: 'string' },
        kind: { type: 'string', enum: ['pdf', 'pptx', 'docx', 'xlsx', 'html', 'png', 'json'] },
        uri: { type: 'string' },
      },
      additionalProperties: false,
    },
    Warnings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['code', 'message', 'severity'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'warning', 'error'] },
        },
        additionalProperties: false,
      },
      default: [],
    },
  },
};

writeFileSync(join(dashDir, 'common.json'), `${JSON.stringify(common, null, 2)}\n`, 'utf8');

const ref = name => `common.json#/$defs/${name}`;
const baseResponse = (toolId, refs) => ({
  type: 'object',
  required: ['request_id', 'tool_id', 'status', 'refs'],
  properties: {
    request_id: { type: 'string' },
    tool_id: { const: toolId },
    status: { type: 'string', enum: ['ok', 'failed'] },
    refs,
    warnings: { $ref: ref('Warnings') },
  },
  additionalProperties: false,
});

const schemas = {
  'dashboard.intent_parse.input.json': {
    $id: 'https://dash.local/schemas/dashboard.intent_parse.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'dashboard.intent_parse' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', minLength: 1 },
          assets: { type: 'array', items: { $ref: ref('AssetRef') } },
        },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        properties: {
          strict_import: { type: 'boolean', default: false },
          pages_hint: { type: 'integer', minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'dashboard.intent_parse.output.json': {
    $id: 'https://dash.local/schemas/dashboard.intent_parse.output.json',
    ...baseResponse('dashboard.intent_parse', {
      type: 'object',
      required: ['intent'],
      properties: { intent: { type: 'object' } },
      additionalProperties: false,
    }),
  },
  'dashboard.catalog_search.input.json': {
    $id: 'https://dash.local/schemas/dashboard.catalog_search.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'dashboard.catalog_search' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['query'],
        properties: { query: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        required: ['catalog', 'top_k'],
        properties: {
          catalog: { type: 'string' },
          top_k: { type: 'integer', minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'dashboard.catalog_search.output.json': {
    $id: 'https://dash.local/schemas/dashboard.catalog_search.output.json',
    ...baseResponse('dashboard.catalog_search', {
      type: 'object',
      required: ['items'],
      properties: { items: { type: 'array', items: { type: 'object' } } },
      additionalProperties: false,
    }),
  },
  'dashboard.plan.input.json': {
    $id: 'https://dash.local/schemas/dashboard.plan.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'dashboard.plan' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['intent'],
        properties: { intent: { type: 'object' } },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'dashboard.plan.output.json': {
    $id: 'https://dash.local/schemas/dashboard.plan.output.json',
    ...baseResponse('dashboard.plan', {
      type: 'object',
      required: ['dashboard_ir_plan'],
      properties: { dashboard_ir_plan: { type: 'object' } },
      additionalProperties: false,
    }),
  },
  'dashboard.build.input.json': {
    $id: 'https://dash.local/schemas/dashboard.build.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'dashboard.build' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['dashboard_ir_plan'],
        properties: { dashboard_ir_plan: { type: 'object' } },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'dashboard.build.output.json': {
    $id: 'https://dash.local/schemas/dashboard.build.output.json',
    ...baseResponse('dashboard.build', {
      type: 'object',
      required: ['dashboard'],
      properties: { dashboard: { $ref: ref('DashboardRef') } },
      additionalProperties: false,
    }),
  },
  'dashboard.bind_data.input.json': {
    $id: 'https://dash.local/schemas/dashboard.bind_data.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'dashboard.bind_data' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['dashboard', 'datasets'],
        properties: {
          dashboard: { $ref: ref('DashboardRef') },
          datasets: { type: 'array', minItems: 1, items: { $ref: ref('DatasetRef') } },
          tir_steps: { type: 'array', items: { type: 'object' } },
          mir_measures: { type: 'array', items: { type: 'object' } },
        },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'dashboard.bind_data.output.json': {
    $id: 'https://dash.local/schemas/dashboard.bind_data.output.json',
    ...baseResponse('dashboard.bind_data', {
      type: 'object',
      required: ['dashboard'],
      properties: { dashboard: { $ref: ref('DashboardRef') } },
      additionalProperties: false,
    }),
  },
  'dashboard.render_preview.input.json': {
    $id: 'https://dash.local/schemas/dashboard.render_preview.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'dashboard.render_preview' },
      context: { $ref: ref('ActionContext') },
      inputs: { type: 'object', required: ['dashboard'], properties: { dashboard: { $ref: ref('DashboardRef') } }, additionalProperties: false },
      params: { type: 'object', required: ['dpi'], properties: { dpi: { type: 'integer', minimum: 96, maximum: 600 } }, additionalProperties: false },
    },
    additionalProperties: false,
  },
  'dashboard.render_preview.output.json': {
    $id: 'https://dash.local/schemas/dashboard.render_preview.output.json',
    ...baseResponse('dashboard.render_preview', {
      type: 'object',
      required: ['renders'],
      properties: { renders: { type: 'array', minItems: 1, items: { $ref: ref('ArtifactRef') } } },
      additionalProperties: false,
    }),
  },
  'dashboard.qa_validate.input.json': {
    $id: 'https://dash.local/schemas/dashboard.qa_validate.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'dashboard.qa_validate' },
      context: { $ref: ref('ActionContext') },
      inputs: { type: 'object', required: ['dashboard'], properties: { dashboard: { $ref: ref('DashboardRef') } }, additionalProperties: false },
      params: { type: 'object', required: ['must_pass_all'], properties: { must_pass_all: { type: 'boolean', const: true } }, additionalProperties: false },
    },
    additionalProperties: false,
  },
  'dashboard.qa_validate.output.json': {
    $id: 'https://dash.local/schemas/dashboard.qa_validate.output.json',
    ...baseResponse('dashboard.qa_validate', {
      type: 'object',
      required: ['pass', 'issues'],
      properties: { pass: { type: 'boolean' }, issues: { type: 'array', items: { type: 'object' } } },
      additionalProperties: false,
    }),
  },
  'dashboard.qa_autofix.input.json': {
    $id: 'https://dash.local/schemas/dashboard.qa_autofix.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'dashboard.qa_autofix' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['dashboard', 'issues'],
        properties: { dashboard: { $ref: ref('DashboardRef') }, issues: { type: 'array', items: { type: 'object' } } },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'dashboard.qa_autofix.output.json': {
    $id: 'https://dash.local/schemas/dashboard.qa_autofix.output.json',
    ...baseResponse('dashboard.qa_autofix', {
      type: 'object',
      required: ['dashboard', 'fix_log'],
      properties: { dashboard: { $ref: ref('DashboardRef') }, fix_log: { type: 'array', items: { type: 'object' } } },
      additionalProperties: false,
    }),
  },
  'dashboard.publish.input.json': {
    $id: 'https://dash.local/schemas/dashboard.publish.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'dashboard.publish' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['dashboard', 'share_policy', 'permissions'],
        properties: { dashboard: { $ref: ref('DashboardRef') }, share_policy: { type: 'object' }, permissions: { type: 'object' } },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'dashboard.publish.output.json': {
    $id: 'https://dash.local/schemas/dashboard.publish.output.json',
    ...baseResponse('dashboard.publish', {
      type: 'object',
      required: ['link_ref', 'audit_entry_id'],
      properties: { link_ref: { $ref: ref('ArtifactRef') }, audit_entry_id: { type: 'string' } },
      additionalProperties: false,
    }),
  },
  'dashboard.export.input.json': {
    $id: 'https://dash.local/schemas/dashboard.export.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'dashboard.export' },
      context: { $ref: ref('ActionContext') },
      inputs: { type: 'object', required: ['dashboard'], properties: { dashboard: { $ref: ref('DashboardRef') } }, additionalProperties: false },
      params: { type: 'object', required: ['export_kind'], properties: { export_kind: { type: 'string', enum: ['pdf', 'pptx', 'docx', 'xlsx', 'html', 'png'] } }, additionalProperties: false },
    },
    additionalProperties: false,
  },
  'dashboard.export.output.json': {
    $id: 'https://dash.local/schemas/dashboard.export.output.json',
    ...baseResponse('dashboard.export', {
      type: 'object',
      required: ['artifact'],
      properties: { artifact: { $ref: ref('ArtifactRef') } },
      additionalProperties: false,
    }),
  },
  'dashboard.parity_verify.input.json': {
    $id: 'https://dash.local/schemas/dashboard.parity_verify.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'dashboard.parity_verify' },
      context: { $ref: ref('ActionContext') },
      inputs: { type: 'object', required: ['dashboard', 'artifact'], properties: { dashboard: { $ref: ref('DashboardRef') }, artifact: { $ref: ref('ArtifactRef') } }, additionalProperties: false },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'dashboard.parity_verify.output.json': {
    $id: 'https://dash.local/schemas/dashboard.parity_verify.output.json',
    ...baseResponse('dashboard.parity_verify', {
      type: 'object',
      required: ['pass', 'report'],
      properties: { pass: { type: 'boolean' }, report: { type: 'object' } },
      additionalProperties: false,
    }),
  },
  'dashboard.evidence_pack.input.json': {
    $id: 'https://dash.local/schemas/dashboard.evidence_pack.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'dashboard.evidence_pack' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['dashboard'],
        properties: {
          dashboard: { $ref: ref('DashboardRef') },
          artifacts: { type: 'array', items: { $ref: ref('ArtifactRef') } },
          qa_report: { type: 'object' },
          parity_report: { type: 'object' },
        },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'dashboard.evidence_pack.output.json': {
    $id: 'https://dash.local/schemas/dashboard.evidence_pack.output.json',
    ...baseResponse('dashboard.evidence_pack', {
      type: 'object',
      required: ['evidence_id'],
      properties: { evidence_id: { type: 'string' } },
      additionalProperties: false,
    }),
  },
};

for (const [filename, schema] of Object.entries(schemas)) {
  writeFileSync(join(toolsDir, filename), `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
}

console.log(`generated ${Object.keys(schemas).length} dashboard schemas`);
