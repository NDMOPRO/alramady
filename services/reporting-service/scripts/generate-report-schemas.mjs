import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const reportDir = join(__dirname, '..', '..', '..', 'schemas', 'report');
const toolsDir = join(reportDir, 'tools');
mkdirSync(toolsDir, { recursive: true });

const common = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://report.local/schemas/common.json',
  $defs: {
    Mode: { type: 'string', enum: ['AUTO', 'CONTROLLED'] },
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
    DocRef: {
      type: 'object',
      required: ['doc_id', 'version'],
      properties: {
        doc_id: { type: 'string' },
        version: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
    ArtifactRef: {
      type: 'object',
      required: ['artifact_id', 'kind', 'uri'],
      properties: {
        artifact_id: { type: 'string' },
        kind: { type: 'string', enum: ['docx', 'pdf', 'html', 'pptx', 'xlsx', 'png', 'json'] },
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

writeFileSync(join(reportDir, 'common.json'), `${JSON.stringify(common, null, 2)}\n`, 'utf8');

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

const docArtifactResponse = toolId => ({
  $id: `https://report.local/schemas/${toolId}.output.json`,
  ...baseResponse(toolId, {
    type: 'object',
    required: ['artifact'],
    properties: { artifact: { $ref: ref('ArtifactRef') } },
    additionalProperties: false,
  }),
});

const schemas = {
  'report.intent_parse.input.json': {
    $id: 'https://report.local/schemas/report.intent_parse.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.intent_parse' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', minLength: 1 },
          assets: { type: 'array', items: { $ref: ref('AssetRef') } },
          datasets: { type: 'array', items: { $ref: ref('DatasetRef') } },
        },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        required: ['fidelity_mode'],
        properties: {
          fidelity_mode: { type: 'string', enum: ['literal_1to1', 'smart'] },
          template_id: { type: 'string' },
          classification: { type: 'string', enum: ['public', 'internal', 'confidential', 'restricted'] },
          detail_level: { type: 'string', enum: ['brief', 'standard', 'deep', 'audit'] },
          tone: { type: 'string', enum: ['formal', 'neutral', 'persuasive', 'urgent'] },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'report.intent_parse.output.json': {
    $id: 'https://report.local/schemas/report.intent_parse.output.json',
    ...baseResponse('report.intent_parse', {
      type: 'object',
      required: ['intent'],
      properties: { intent: { type: 'object' } },
      additionalProperties: false,
    }),
  },
  'report.template_extract.input.json': {
    $id: 'https://report.local/schemas/report.template_extract.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.template_extract' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['template_docx'],
        properties: { template_docx: { $ref: ref('AssetRef') } },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'report.template_extract.output.json': {
    $id: 'https://report.local/schemas/report.template_extract.output.json',
    ...baseResponse('report.template_extract', {
      type: 'object',
      required: ['template_id', 'style_tokens', 'writing_rules', 'numbering_rules', 'compliance_rules'],
      properties: {
        template_id: { type: 'string' },
        style_tokens: { type: 'object' },
        writing_rules: { type: 'object' },
        numbering_rules: { type: 'object' },
        compliance_rules: { type: 'object' },
      },
      additionalProperties: false,
    }),
  },
  'report.plan_outline.input.json': {
    $id: 'https://report.local/schemas/report.plan_outline.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.plan_outline' },
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
  'report.plan_outline.output.json': {
    $id: 'https://report.local/schemas/report.plan_outline.output.json',
    ...baseResponse('report.plan_outline', {
      type: 'object',
      required: ['outline'],
      properties: { outline: { type: 'object' } },
      additionalProperties: false,
    }),
  },
  'report.build_doc_ir.input.json': {
    $id: 'https://report.local/schemas/report.build_doc_ir.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.build_doc_ir' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['outline'],
        properties: {
          outline: { type: 'object' },
          template_id: { type: 'string' },
        },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'report.build_doc_ir.output.json': {
    $id: 'https://report.local/schemas/report.build_doc_ir.output.json',
    ...baseResponse('report.build_doc_ir', {
      type: 'object',
      required: ['doc', 'doc_ir'],
      properties: {
        doc: { $ref: ref('DocRef') },
        doc_ir: { type: 'object' },
      },
      additionalProperties: false,
    }),
  },
  'report.bind_data.input.json': {
    $id: 'https://report.local/schemas/report.bind_data.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.bind_data' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['doc'],
        properties: {
          doc: { $ref: ref('DocRef') },
          datasets: { type: 'array', items: { $ref: ref('DatasetRef') } },
          tir_steps: { type: 'array', items: { type: 'object' } },
          mir_measures: { type: 'array', items: { type: 'object' } },
        },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'report.bind_data.output.json': {
    $id: 'https://report.local/schemas/report.bind_data.output.json',
    ...baseResponse('report.bind_data', {
      type: 'object',
      required: ['doc', 'doc_ir'],
      properties: {
        doc: { $ref: ref('DocRef') },
        doc_ir: { type: 'object' },
      },
      additionalProperties: false,
    }),
  },
  'report.generate_content_literal.input.json': {
    $id: 'https://report.local/schemas/report.generate_content_literal.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.generate_content_literal' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['doc', 'user_text'],
        properties: {
          doc: { $ref: ref('DocRef') },
          user_text: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'report.generate_content_literal.output.json': {
    $id: 'https://report.local/schemas/report.generate_content_literal.output.json',
    ...baseResponse('report.generate_content_literal', {
      type: 'object',
      required: ['doc', 'literal_hash_report'],
      properties: {
        doc: { $ref: ref('DocRef') },
        literal_hash_report: { type: 'object' },
      },
      additionalProperties: false,
    }),
  },
  'report.generate_content_smart.input.json': {
    $id: 'https://report.local/schemas/report.generate_content_smart.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.generate_content_smart' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['doc'],
        properties: {
          doc: { $ref: ref('DocRef') },
          prompt: { type: 'string' },
        },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'report.generate_content_smart.output.json': {
    $id: 'https://report.local/schemas/report.generate_content_smart.output.json',
    ...baseResponse('report.generate_content_smart', {
      type: 'object',
      required: ['doc', 'content_trace'],
      properties: {
        doc: { $ref: ref('DocRef') },
        content_trace: { type: 'object' },
      },
      additionalProperties: false,
    }),
  },
  'report.qa_validate.input.json': {
    $id: 'https://report.local/schemas/report.qa_validate.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.qa_validate' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['doc'],
        properties: { doc: { $ref: ref('DocRef') } },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        required: ['must_pass_all'],
        properties: { must_pass_all: { type: 'boolean', const: true } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'report.qa_validate.output.json': {
    $id: 'https://report.local/schemas/report.qa_validate.output.json',
    ...baseResponse('report.qa_validate', {
      type: 'object',
      required: ['pass', 'issues', 'report'],
      properties: {
        pass: { type: 'boolean' },
        issues: { type: 'array', items: { type: 'object' } },
        report: { type: 'object' },
      },
      additionalProperties: false,
    }),
  },
  'report.qa_autofix.input.json': {
    $id: 'https://report.local/schemas/report.qa_autofix.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.qa_autofix' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['doc', 'issues'],
        properties: {
          doc: { $ref: ref('DocRef') },
          issues: { type: 'array', items: { type: 'object' } },
        },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'report.qa_autofix.output.json': {
    $id: 'https://report.local/schemas/report.qa_autofix.output.json',
    ...baseResponse('report.qa_autofix', {
      type: 'object',
      required: ['doc', 'fix_log'],
      properties: {
        doc: { $ref: ref('DocRef') },
        fix_log: { type: 'array', items: { type: 'object' } },
      },
      additionalProperties: false,
    }),
  },
  'report.export_docx.input.json': {
    $id: 'https://report.local/schemas/report.export_docx.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.export_docx' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['doc'],
        properties: { doc: { $ref: ref('DocRef') } },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        properties: { embed_fonts: { type: 'boolean' } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'report.export_docx.output.json': docArtifactResponse('report.export_docx'),
  'report.export_pdf.input.json': {
    $id: 'https://report.local/schemas/report.export_pdf.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.export_pdf' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['doc'],
        properties: { doc: { $ref: ref('DocRef') } },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'report.export_pdf.output.json': docArtifactResponse('report.export_pdf'),
  'report.export_html.input.json': {
    $id: 'https://report.local/schemas/report.export_html.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.export_html' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['doc'],
        properties: { doc: { $ref: ref('DocRef') } },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'report.export_html.output.json': docArtifactResponse('report.export_html'),
  'report.export_pptx.input.json': {
    $id: 'https://report.local/schemas/report.export_pptx.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.export_pptx' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['doc'],
        properties: { doc: { $ref: ref('DocRef') } },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'report.export_pptx.output.json': docArtifactResponse('report.export_pptx'),
  'report.export_xlsx.input.json': {
    $id: 'https://report.local/schemas/report.export_xlsx.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.export_xlsx' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['doc'],
        properties: { doc: { $ref: ref('DocRef') } },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'report.export_xlsx.output.json': docArtifactResponse('report.export_xlsx'),
  'report.render_parity_verify.input.json': {
    $id: 'https://report.local/schemas/report.render_parity_verify.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.render_parity_verify' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['doc', 'artifacts'],
        properties: {
          doc: { $ref: ref('DocRef') },
          artifacts: { type: 'array', minItems: 1, items: { $ref: ref('ArtifactRef') } },
        },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'report.render_parity_verify.output.json': {
    $id: 'https://report.local/schemas/report.render_parity_verify.output.json',
    ...baseResponse('report.render_parity_verify', {
      type: 'object',
      required: ['pass', 'report'],
      properties: {
        pass: { type: 'boolean' },
        report: { type: 'object' },
      },
      additionalProperties: false,
    }),
  },
  'report.classify_and_govern.input.json': {
    $id: 'https://report.local/schemas/report.classify_and_govern.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.classify_and_govern' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['doc'],
        properties: {
          doc: { $ref: ref('DocRef') },
          permissions: { type: 'object' },
          share_policy: { type: 'object' },
        },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        required: ['classification'],
        properties: {
          classification: { type: 'string', enum: ['public', 'internal', 'confidential', 'restricted'] },
          approvals_enabled: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'report.classify_and_govern.output.json': {
    $id: 'https://report.local/schemas/report.classify_and_govern.output.json',
    ...baseResponse('report.classify_and_govern', {
      type: 'object',
      required: ['doc', 'governance'],
      properties: {
        doc: { $ref: ref('DocRef') },
        governance: { type: 'object' },
      },
      additionalProperties: false,
    }),
  },
  'report.evidence_pack.input.json': {
    $id: 'https://report.local/schemas/report.evidence_pack.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'report.evidence_pack' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['doc'],
        properties: {
          doc: { $ref: ref('DocRef') },
          artifacts: { type: 'array', items: { $ref: ref('ArtifactRef') } },
          qa_report: { type: 'object' },
          parity_report: { type: 'object' },
          template_compliance: { type: 'object' },
          literal_diff: { type: 'object' },
          content_trace: { type: 'object' },
        },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'report.evidence_pack.output.json': {
    $id: 'https://report.local/schemas/report.evidence_pack.output.json',
    ...baseResponse('report.evidence_pack', {
      type: 'object',
      required: ['evidence_id'],
      properties: { evidence_id: { type: 'string' } },
      additionalProperties: false,
    }),
  },
};

for (const [name, schema] of Object.entries(schemas)) {
  writeFileSync(join(toolsDir, name), `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
}
