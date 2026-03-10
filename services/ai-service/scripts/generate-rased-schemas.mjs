import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaRoot = join(__dirname, '..', '..', '..', 'schemas', 'rased');
const toolsDir = join(schemaRoot, 'tools');

mkdirSync(toolsDir, { recursive: true });

const common = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rased.local/schemas/common.json',
  $defs: {
    Mode: { type: 'string', enum: ['AUTO', 'CONTROLLED', 'TUTOR', 'EXECUTOR'] },
    ArabicMode: { type: 'string', enum: ['BASIC', 'PROFESSIONAL', 'ELITE'] },
    ActionContext: {
      type: 'object',
      required: ['workspace_id', 'user_id', 'mode', 'arabic_mode', 'locale'],
      properties: {
        workspace_id: { type: 'string', minLength: 3, maxLength: 128 },
        user_id: { type: 'string', minLength: 3, maxLength: 128 },
        mode: { $ref: '#/$defs/Mode' },
        arabic_mode: { $ref: '#/$defs/ArabicMode' },
        locale: { type: 'string', minLength: 2, maxLength: 16 },
      },
      additionalProperties: true,
    },
    AssetRef: {
      type: 'object',
      required: ['asset_id', 'uri', 'mime', 'sha256'],
      properties: {
        asset_id: { type: 'string', minLength: 8, maxLength: 128 },
        uri: { type: 'string', maxLength: 2048 },
        mime: { type: 'string', maxLength: 128 },
        sha256: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
      },
      additionalProperties: false,
    },
    ArtifactRef: {
      type: 'object',
      required: ['artifact_id', 'kind', 'uri'],
      properties: {
        artifact_id: { type: 'string', minLength: 8, maxLength: 128 },
        kind: { type: 'string', enum: ['pptx', 'docx', 'xlsx', 'dashboard', 'pdf', 'html', 'png', 'json', 'srt', 'vtt', 'link'] },
        uri: { type: 'string', maxLength: 2048 },
      },
      additionalProperties: false,
    },
    Warnings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['code', 'message', 'severity'],
        properties: {
          code: { type: 'string', minLength: 2, maxLength: 64 },
          message: { type: 'string', minLength: 1, maxLength: 2000 },
          severity: { type: 'string', enum: ['info', 'warning', 'error'] },
        },
        additionalProperties: false,
      },
      default: [],
    },
  },
};

writeFileSync(join(schemaRoot, 'common.json'), `${JSON.stringify(common, null, 2)}\n`, 'utf8');

const ref = (name) => `common.json#/$defs/${name}`;
const anyObject = { type: 'object' };
const anyArray = { type: 'array', items: anyObject };

function baseRequest(toolId, inputs, params) {
  return {
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: toolId },
      context: { $ref: ref('ActionContext') },
      inputs,
      params,
    },
    additionalProperties: false,
  };
}

function baseResponse(toolId, refs) {
  return {
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
  };
}

const tourSchema = {
  type: 'object',
  required: ['name', 'mode', 'steps'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 256 },
    mode: { type: 'string', enum: ['explain', 'coach', 'executor'] },
    steps: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['step_id', 'target_rased_id', 'title', 'body'],
        properties: {
          step_id: { type: 'string', minLength: 1, maxLength: 128 },
          target_rased_id: { type: 'string', minLength: 1, maxLength: 256 },
          title: { type: 'string', minLength: 1, maxLength: 256 },
          body: { type: 'string', minLength: 1, maxLength: 2000 },
          action: {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['open_sidebar', 'close_sidebar', 'open_focus', 'close_focus', 'select', 'set_control', 'scroll_to', 'highlight'] },
              value: {},
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

const schemas = {
  'rased.intent_parse.input.json': {
    $id: 'https://rased.local/schemas/rased.intent_parse.input.json',
    ...baseRequest('rased.intent_parse', {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', minLength: 1 },
        assets: { type: 'array', items: { $ref: ref('AssetRef') } },
      },
      additionalProperties: false,
    }, {
      type: 'object',
      properties: {
        default_strict_claim: { type: 'string' },
        default_exports: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: true,
    }),
  },
  'rased.intent_parse.output.json': {
    $id: 'https://rased.local/schemas/rased.intent_parse.output.json',
    ...baseResponse('rased.intent_parse', {
      type: 'object',
      required: ['intent_manifest'],
      properties: {
        intent_manifest: {
          type: 'object',
          required: ['goal', 'engine_targets', 'exports', 'controls', 'risk_level'],
          properties: {
            goal: { type: 'string' },
            engine_targets: { type: 'array', minItems: 1, items: { type: 'string' } },
            exports: { type: 'array', items: { type: 'string' } },
            controls: anyObject,
            risk_level: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          additionalProperties: true,
        },
      },
      additionalProperties: false,
    }),
  },
};

const toolPairs = [
  {
    id: 'rased.plan_action_graph',
    inputs: { type: 'object', required: ['intent_manifest'], properties: { intent_manifest: anyObject }, additionalProperties: false },
    params: { type: 'object', required: ['deterministic'], properties: { deterministic: { type: 'boolean', const: true } }, additionalProperties: false },
    refs: { type: 'object', required: ['action_graph'], properties: { action_graph: anyObject }, additionalProperties: false },
  },
  {
    id: 'rased.execute_action_graph',
    inputs: { type: 'object', required: ['action_graph'], properties: { action_graph: anyObject }, additionalProperties: false },
    params: { type: 'object', required: ['must_produce_evidence'], properties: { must_produce_evidence: { type: 'boolean', const: true } }, additionalProperties: false },
    refs: {
      type: 'object',
      required: ['action_ids', 'artifacts', 'evidence_id'],
      properties: {
        action_ids: { type: 'array', minItems: 1, items: { type: 'string' } },
        artifacts: { type: 'array', minItems: 1, items: { $ref: ref('ArtifactRef') } },
        evidence_id: { type: 'string', minLength: 8 },
      },
      additionalProperties: false,
    },
  },
  {
    id: 'rased.observe_ui_state',
    inputs: { type: 'object', properties: {}, additionalProperties: false },
    params: { type: 'object', properties: {}, additionalProperties: false },
    refs: {
      type: 'object',
      required: ['ui_state'],
      properties: {
        ui_state: {
          type: 'object',
          required: ['selection', 'open_panels', 'focus_stage', 'running_jobs'],
          properties: {
            selection: anyObject,
            open_panels: { type: 'array', items: { type: 'string' } },
            focus_stage: anyObject,
            running_jobs: { type: 'array', items: anyObject },
          },
          additionalProperties: true,
        },
      },
      additionalProperties: false,
    },
  },
  {
    id: 'rased.ui_action.dispatch',
    inputs: {
      type: 'object',
      required: ['actions'],
      properties: {
        actions: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['open_sidebar', 'close_sidebar', 'open_focus', 'close_focus', 'select', 'set_control', 'scroll_to', 'highlight'] },
              target_rased_id: { type: 'string' },
              value: {},
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    params: { type: 'object', properties: {}, additionalProperties: false },
    refs: { type: 'object', required: ['applied'], properties: { applied: { type: 'integer', minimum: 0 }, dispatch_id: { type: 'string' } }, additionalProperties: false },
  },
  {
    id: 'rased.ui_tour.start',
    inputs: { type: 'object', required: ['tour'], properties: { tour: tourSchema }, additionalProperties: false },
    params: { type: 'object', properties: {}, additionalProperties: false },
    refs: { type: 'object', required: ['tour_session_id'], properties: { tour_session_id: { type: 'string', minLength: 8 } }, additionalProperties: false },
  },
  {
    id: 'rased.ui_tour.step',
    inputs: {
      type: 'object',
      required: ['tour_session_id', 'step_index', 'status'],
      properties: {
        tour_session_id: { type: 'string', minLength: 8 },
        step_index: { type: 'integer', minimum: 0 },
        target_rased_id: { type: 'string' },
        status: { type: 'string', enum: ['viewed', 'completed', 'auto_applied', 'failed'] },
      },
      additionalProperties: false,
    },
    params: { type: 'object', properties: {}, additionalProperties: false },
    refs: { type: 'object', required: ['acknowledged', 'progress'], properties: { acknowledged: { type: 'boolean' }, progress: { type: 'number', minimum: 0, maximum: 1 } }, additionalProperties: false },
  },
  {
    id: 'rased.ui_tour.end',
    inputs: {
      type: 'object',
      required: ['tour_session_id', 'outcome'],
      properties: {
        tour_session_id: { type: 'string', minLength: 8 },
        outcome: { type: 'string', enum: ['completed', 'cancelled', 'failed'] },
        feedback: { type: 'string', maxLength: 2000 },
      },
      additionalProperties: false,
    },
    params: { type: 'object', properties: {}, additionalProperties: false },
    refs: { type: 'object', required: ['ended', 'completion_rate'], properties: { ended: { type: 'boolean' }, completion_rate: { type: 'number', minimum: 0, maximum: 1 } }, additionalProperties: false },
  },
  {
    id: 'rased.training.pack.ingest',
    inputs: { type: 'object', required: ['pack_name', 'assets'], properties: { pack_name: { type: 'string', minLength: 1, maxLength: 256 }, assets: { type: 'array', minItems: 1, items: { $ref: ref('AssetRef') } } }, additionalProperties: false },
    params: { type: 'object', required: ['scope'], properties: { scope: { type: 'string', enum: ['user', 'workspace', 'org'] } }, additionalProperties: false },
    refs: { type: 'object', required: ['pack_id', 'pack_version'], properties: { pack_id: { type: 'string' }, pack_version: { type: 'string' } }, additionalProperties: false },
  },
  {
    id: 'rased.training.playbook.upsert',
    inputs: { type: 'object', required: ['playbook'], properties: { playbook: anyObject }, additionalProperties: false },
    params: { type: 'object', properties: {}, additionalProperties: false },
    refs: { type: 'object', required: ['playbook_id', 'version'], properties: { playbook_id: { type: 'string' }, version: { type: 'string' } }, additionalProperties: false },
  },
  {
    id: 'rased.training.eval.run',
    inputs: { type: 'object', required: ['suite_id'], properties: { suite_id: { type: 'string' } }, additionalProperties: false },
    params: { type: 'object', required: ['must_pass'], properties: { must_pass: { type: 'boolean', const: true } }, additionalProperties: false },
    refs: { type: 'object', required: ['pass', 'report_id'], properties: { pass: { type: 'boolean' }, report_id: { type: 'string' } }, additionalProperties: false },
  },
  {
    id: 'rased.knowledge.search',
    inputs: { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 1 } }, additionalProperties: false },
    params: { type: 'object', required: ['top_k'], properties: { top_k: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false },
    refs: { type: 'object', required: ['chunks'], properties: { chunks: { type: 'array', items: anyObject } }, additionalProperties: false },
  },
  {
    id: 'rased.preference.get',
    inputs: { type: 'object', properties: {}, additionalProperties: false },
    params: { type: 'object', properties: { scope: { type: 'string', enum: ['user', 'workspace'] } }, additionalProperties: false },
    refs: { type: 'object', required: ['preferences'], properties: { preferences: anyObject }, additionalProperties: false },
  },
  {
    id: 'rased.preference.set',
    inputs: { type: 'object', required: ['values'], properties: { values: anyObject }, additionalProperties: false },
    params: { type: 'object', properties: { scope: { type: 'string', enum: ['user', 'workspace'] } }, additionalProperties: false },
    refs: { type: 'object', required: ['preferences'], properties: { preferences: anyObject }, additionalProperties: false },
  },
  {
    id: 'rased.policy.check',
    inputs: { type: 'object', required: ['operation'], properties: { operation: { type: 'string', minLength: 1 }, target: { type: 'string' }, command_text: { type: 'string' }, classification: { type: 'string', enum: ['public', 'internal', 'confidential', 'restricted'] } }, additionalProperties: false },
    params: { type: 'object', properties: { explicit_command_token: { type: 'string' } }, additionalProperties: false },
    refs: { type: 'object', required: ['allow', 'deny', 'reason'], properties: { allow: { type: 'boolean' }, deny: { type: 'boolean' }, required_token: { type: 'string' }, reason: { type: 'string' } }, additionalProperties: false },
  },
  {
    id: 'rased.connector.call',
    inputs: { type: 'object', required: ['connector_id', 'request'], properties: { connector_id: { type: 'string', minLength: 1 }, request: { type: 'object', required: ['method', 'url'], properties: { method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }, url: { type: 'string', format: 'uri' }, headers: { type: 'object', additionalProperties: { type: 'string' } }, body: {} }, additionalProperties: false } }, additionalProperties: false },
    params: { type: 'object', properties: { allowlisted_hosts: { type: 'array', items: { type: 'string' } }, classification: { type: 'string', enum: ['public', 'internal', 'confidential', 'restricted'] } }, additionalProperties: false },
    refs: { type: 'object', required: ['ok', 'status_code', 'response_body', 'audit_id'], properties: { ok: { type: 'boolean' }, status_code: { type: 'integer' }, response_body: {}, audit_id: { type: 'string' } }, additionalProperties: false },
  },
  {
    id: 'rased.explain.trace',
    inputs: { type: 'object', properties: { action_graph: anyObject, execution: anyObject, evidence_id: { type: 'string', minLength: 8 } }, additionalProperties: false },
    params: { type: 'object', properties: {}, additionalProperties: false },
    refs: { type: 'object', required: ['explanation', 'trace'], properties: { explanation: { type: 'string' }, trace: anyObject }, additionalProperties: false },
  },
  {
    id: 'rased.evidence.pack',
    inputs: { type: 'object', properties: { action_graph: anyObject, action_ids: { type: 'array', items: { type: 'string' } }, artifacts: { type: 'array', items: { $ref: ref('ArtifactRef') } }, reports: anyObject, ui_audit: anyObject, training_refs: anyObject }, additionalProperties: false },
    params: { type: 'object', properties: {}, additionalProperties: false },
    refs: { type: 'object', required: ['evidence_id'], properties: { evidence_id: { type: 'string', minLength: 8 }, artifact: { $ref: ref('ArtifactRef') } }, additionalProperties: false },
  },
];

for (const tool of toolPairs) {
  schemas[`${tool.id}.input.json`] = {
    $id: `https://rased.local/schemas/${tool.id}.input.json`,
    ...baseRequest(tool.id, tool.inputs, tool.params),
  };
  schemas[`${tool.id}.output.json`] = {
    $id: `https://rased.local/schemas/${tool.id}.output.json`,
    ...baseResponse(tool.id, tool.refs),
  };
}

for (const [fileName, schema] of Object.entries(schemas)) {
  writeFileSync(join(toolsDir, fileName), `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
}

