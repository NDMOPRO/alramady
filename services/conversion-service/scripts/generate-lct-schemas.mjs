import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaRoot = join(__dirname, '..', '..', '..', 'schemas', 'lct');
const toolsDir = join(schemaRoot, 'tools');

mkdirSync(toolsDir, { recursive: true });

const common = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://lct.local/schemas/common.json',
  $defs: {
    Mode: { type: 'string', enum: ['AUTO', 'PRO'] },
    ArabicMode: { type: 'string', enum: ['BASIC', 'PROFESSIONAL', 'ELITE'] },
    StrictClaim: {
      type: 'string',
      enum: ['NONE', 'CONVERT_STRICT_1TO1_100', 'LOCALIZE_PRO_100', 'TRANSCRIBE_STRICT_100'],
    },
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
      required: ['asset_id', 'uri', 'mime', 'sha256', 'size_bytes'],
      properties: {
        asset_id: { type: 'string' },
        uri: { type: 'string', maxLength: 2048 },
        mime: { type: 'string' },
        sha256: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
        size_bytes: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
    ArtifactRef: {
      type: 'object',
      required: ['artifact_id', 'kind', 'uri'],
      properties: {
        artifact_id: { type: 'string' },
        kind: { type: 'string', enum: ['pptx', 'docx', 'xlsx', 'dashboard', 'pdf', 'html', 'png', 'json', 'srt', 'vtt'] },
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

writeFileSync(join(schemaRoot, 'common.json'), `${JSON.stringify(common, null, 2)}\n`, 'utf8');

const ref = name => `common.json#/$defs/${name}`;
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

const schemas = {
  'lct.orch.any_to_any.input.json': {
    $id: 'https://lct.local/schemas/lct.orch.any_to_any.input.json',
    ...baseRequest('lct.orch.any_to_any', {
      type: 'object',
      required: ['assets', 'instruction'],
      properties: {
        assets: { type: 'array', minItems: 1, items: { $ref: ref('AssetRef') } },
        instruction: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    }, {
      type: 'object',
      required: ['targets', 'claims'],
      properties: {
        targets: { type: 'array', minItems: 1, items: { type: 'string', enum: ['pptx', 'docx', 'xlsx', 'dashboard', 'pdf', 'html', 'png', 'srt', 'vtt', 'json'] } },
        claims: { type: 'array', items: { $ref: ref('StrictClaim') } },
        target_language: { type: 'string', enum: ['ar', 'en', 'mixed'] },
        fidelity_mode: { type: 'string', enum: ['literal_1to1', 'smart'] },
        template_id: { type: 'string' },
        term_pack_id: { type: 'string' },
        style_guide_id: { type: 'string' },
        classification: { type: 'string', enum: ['public', 'internal', 'confidential', 'restricted'] },
      },
      additionalProperties: false,
    }),
  },
  'lct.orch.any_to_any.output.json': {
    $id: 'https://lct.local/schemas/lct.orch.any_to_any.output.json',
    ...baseResponse('lct.orch.any_to_any', {
      type: 'object',
      required: ['artifacts', 'evidence_id'],
      properties: {
        artifacts: { type: 'array', minItems: 1, items: { $ref: ref('ArtifactRef') } },
        evidence_id: { type: 'string', minLength: 8 },
      },
      additionalProperties: false,
    }),
  },
};

const toolPairs = [
  {
    id: 'lct.extract.modality_detect',
    inputs: { type: 'object', required: ['asset'], properties: { asset: { $ref: ref('AssetRef') } }, additionalProperties: false },
    params: { type: 'object', additionalProperties: false },
    refs: {
      type: 'object',
      required: ['modality', 'has_embedded_captions', 'has_tables'],
      properties: {
        modality: { type: 'string', enum: ['pdf', 'image', 'audio', 'video', 'docx', 'pptx', 'xlsx', 'text'] },
        has_embedded_captions: { type: 'boolean' },
        has_tables: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.transcribe.video_to_audio',
    inputs: { type: 'object', required: ['video_asset'], properties: { video_asset: { $ref: ref('AssetRef') } }, additionalProperties: false },
    params: { type: 'object', additionalProperties: false },
    refs: {
      type: 'object',
      required: ['audio_asset', 'track_metadata'],
      properties: {
        audio_asset: { $ref: ref('AssetRef') },
        track_metadata: anyObject,
      },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.transcribe.asr_ensemble_strict',
    inputs: {
      type: 'object',
      required: ['audio_asset'],
      properties: {
        audio_asset: { $ref: ref('AssetRef') },
        video_asset: { $ref: ref('AssetRef') },
        glossary: anyObject,
      },
      additionalProperties: false,
    },
    params: { type: 'object', additionalProperties: false },
    refs: {
      type: 'object',
      required: ['transcript_draft', 'disagreements', 'diarization_draft'],
      properties: {
        transcript_draft: anyObject,
        disagreements: anyArray,
        diarization_draft: anyObject,
      },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.transcribe.forced_alignment',
    inputs: {
      type: 'object',
      required: ['audio_asset', 'transcript_draft'],
      properties: {
        audio_asset: { $ref: ref('AssetRef') },
        transcript_draft: anyObject,
      },
      additionalProperties: false,
    },
    params: { type: 'object', additionalProperties: false },
    refs: {
      type: 'object',
      required: ['word_timestamps', 'alignment_pass', 'alignment'],
      properties: {
        word_timestamps: anyArray,
        alignment_pass: { type: 'boolean' },
        alignment: anyObject,
      },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.transcribe.ocr_on_screen',
    inputs: { type: 'object', required: ['video_asset'], properties: { video_asset: { $ref: ref('AssetRef') } }, additionalProperties: false },
    params: { type: 'object', properties: { sample_every_seconds: { type: 'number', minimum: 0 } }, additionalProperties: false },
    refs: {
      type: 'object',
      required: ['on_screen_text', 'subtitles_detection'],
      properties: {
        on_screen_text: anyObject,
        subtitles_detection: anyObject,
      },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.transcribe.exactness_gate',
    inputs: {
      type: 'object',
      required: ['ensemble', 'alignment', 'ocr'],
      properties: {
        ensemble: anyObject,
        alignment: anyObject,
        ocr: anyObject,
      },
      additionalProperties: false,
    },
    params: { type: 'object', additionalProperties: false },
    refs: {
      type: 'object',
      required: ['exact', 'unresolved_spans'],
      properties: {
        exact: { type: 'boolean' },
        unresolved_spans: anyArray,
      },
      additionalProperties: false,
    },
  },
  {
    id: 'verifier.ops.dispatch',
    inputs: {
      type: 'object',
      required: ['operation', 'unresolved_spans'],
      properties: {
        operation: { type: 'string', enum: ['convert', 'localize', 'transcribe'] },
        unresolved_spans: anyArray,
        assets: { type: 'array', items: { $ref: ref('AssetRef') } },
        candidate_text: { type: 'string' },
        context_payload: anyObject,
      },
      additionalProperties: false,
    },
    params: { type: 'object', additionalProperties: false },
    refs: {
      type: 'object',
      required: ['verified_transcript', 'verifier_proof'],
      properties: {
        verified_transcript: anyObject,
        verifier_proof: anyObject,
      },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.localize.termaware_translate',
    inputs: {
      type: 'object',
      required: ['doc_ir', 'target_language'],
      properties: {
        doc_ir: anyObject,
        term_pack: anyObject,
        style_guide: anyObject,
        target_language: { type: 'string', enum: ['ar', 'en', 'mixed'] },
      },
      additionalProperties: false,
    },
    params: { type: 'object', additionalProperties: false },
    refs: {
      type: 'object',
      required: ['translated_runs', 'terminology_report', 'lqa_report'],
      properties: {
        translated_runs: anyObject,
        terminology_report: anyObject,
        lqa_report: anyObject,
      },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.localize.arabic_typeset_elite',
    inputs: {
      type: 'object',
      required: ['translated_runs'],
      properties: {
        translated_runs: anyObject,
        layout_constraints: anyObject,
      },
      additionalProperties: false,
    },
    params: { type: 'object', additionalProperties: false },
    refs: {
      type: 'object',
      required: ['typeset_runs', 'layout_fixes_applied', 'layout_qa'],
      properties: {
        typeset_runs: anyObject,
        layout_fixes_applied: anyArray,
        layout_qa: anyObject,
      },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.localize.lqa_gate_zero',
    inputs: {
      type: 'object',
      required: ['terminology_report', 'lqa_report', 'layout_qa'],
      properties: {
        terminology_report: anyObject,
        lqa_report: anyObject,
        layout_qa: anyObject,
      },
      additionalProperties: false,
    },
    params: { type: 'object', additionalProperties: false },
    refs: {
      type: 'object',
      required: ['pass'],
      properties: { pass: { type: 'boolean' } },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.convert.cdr_build',
    inputs: { type: 'object', required: ['asset'], properties: { asset: { $ref: ref('AssetRef') } }, additionalProperties: false },
    params: { type: 'object', additionalProperties: false },
    refs: {
      type: 'object',
      required: ['cdr'],
      properties: { cdr: anyObject },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.convert.export_targets',
    inputs: {
      type: 'object',
      required: ['cdr', 'targets'],
      properties: {
        cdr: anyObject,
        targets: { type: 'array', minItems: 1, items: { type: 'string', enum: ['pptx', 'docx', 'xlsx', 'dashboard', 'pdf', 'html', 'png', 'json'] } },
        text_payload: { type: 'string' },
        transcript: anyObject,
      },
      additionalProperties: false,
    },
    params: {
      type: 'object',
      properties: {
        classification: { type: 'string', enum: ['public', 'internal', 'confidential', 'restricted'] },
        localized: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    refs: {
      type: 'object',
      required: ['artifacts', 'export_manifest'],
      properties: {
        artifacts: { type: 'array', minItems: 1, items: { $ref: ref('ArtifactRef') } },
        export_manifest: anyObject,
      },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.verify.pixel_gate_zero',
    inputs: {
      type: 'object',
      required: ['source_render', 'target_render'],
      properties: {
        source_render: { $ref: ref('ArtifactRef') },
        target_render: { $ref: ref('ArtifactRef') },
      },
      additionalProperties: false,
    },
    params: { type: 'object', additionalProperties: false },
    refs: {
      type: 'object',
      required: ['pass', 'pixel_diff', 'report'],
      properties: {
        pass: { type: 'boolean' },
        pixel_diff: { type: 'number', minimum: 0 },
        report: anyObject,
      },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.verify.structural_editable_gate',
    inputs: {
      type: 'object',
      required: ['artifact'],
      properties: {
        artifact: { $ref: ref('ArtifactRef') },
        export_manifest: anyObject,
      },
      additionalProperties: false,
    },
    params: { type: 'object', additionalProperties: false },
    refs: {
      type: 'object',
      required: ['pass', 'report'],
      properties: {
        pass: { type: 'boolean' },
        report: anyObject,
      },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.repair.loop_controller',
    inputs: {
      type: 'object',
      required: ['kind', 'current_state'],
      properties: {
        kind: { type: 'string', enum: ['convert', 'localize', 'transcribe'] },
        current_state: anyObject,
      },
      additionalProperties: false,
    },
    params: {
      type: 'object',
      properties: { max_iterations: { type: 'integer', minimum: 1, maximum: 100 } },
      additionalProperties: false,
    },
    refs: {
      type: 'object',
      required: ['state', 'resolved'],
      properties: {
        state: anyObject,
        resolved: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.export.multi_format',
    inputs: {
      type: 'object',
      required: ['project_state', 'targets'],
      properties: {
        project_state: anyObject,
        targets: { type: 'array', minItems: 1, items: { type: 'string', enum: ['pptx', 'docx', 'xlsx', 'dashboard', 'pdf', 'html', 'png', 'srt', 'vtt', 'json'] } },
      },
      additionalProperties: false,
    },
    params: {
      type: 'object',
      properties: { classification: { type: 'string', enum: ['public', 'internal', 'confidential', 'restricted'] } },
      additionalProperties: false,
    },
    refs: {
      type: 'object',
      required: ['artifacts'],
      properties: {
        artifacts: { type: 'array', minItems: 1, items: { $ref: ref('ArtifactRef') } },
      },
      additionalProperties: false,
    },
  },
  {
    id: 'lct.evidence.pack',
    inputs: {
      type: 'object',
      required: ['operation', 'artifacts', 'reports'],
      properties: {
        operation: anyObject,
        artifacts: { type: 'array', minItems: 1, items: { $ref: ref('ArtifactRef') } },
        reports: anyObject,
      },
      additionalProperties: false,
    },
    params: { type: 'object', additionalProperties: false },
    refs: {
      type: 'object',
      required: ['evidence_id'],
      properties: { evidence_id: { type: 'string', minLength: 8 } },
      additionalProperties: false,
    },
  },
];

for (const spec of toolPairs) {
  schemas[`${spec.id}.input.json`] = {
    $id: `https://lct.local/schemas/${spec.id}.input.json`,
    ...baseRequest(spec.id, spec.inputs, spec.params),
  };
  schemas[`${spec.id}.output.json`] = {
    $id: `https://lct.local/schemas/${spec.id}.output.json`,
    ...baseResponse(spec.id, spec.refs),
  };
}

for (const [filename, schema] of Object.entries(schemas)) {
  writeFileSync(join(toolsDir, filename), `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
}

