import { z } from 'zod';

const actionContextSchema = z.object({
  workspace_id: z.string(),
  user_id: z.string(),
  mode: z.enum(['AUTO', 'PRO']),
  arabic_mode: z.enum(['BASIC', 'PROFESSIONAL', 'ELITE']),
  locale: z.string(),
}).passthrough();

const strictClaimSchema = z.enum([
  'NONE',
  'CONVERT_STRICT_1TO1_100',
  'LOCALIZE_PRO_100',
  'TRANSCRIBE_STRICT_100',
]);

const assetRefSchema = z.object({
  asset_id: z.string(),
  uri: z.string().max(2048),
  mime: z.string(),
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/),
  size_bytes: z.number().int().nonnegative(),
}).strict();

const artifactRefSchema = z.object({
  artifact_id: z.string(),
  kind: z.enum(['pptx', 'docx', 'xlsx', 'dashboard', 'pdf', 'html', 'png', 'json', 'srt', 'vtt']),
  uri: z.string().max(2048),
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

const transcriptDraftSchema = z.object({
  transcript_id: z.string(),
  text: z.string(),
  segments: z.array(z.object({}).passthrough()),
  speakers: z.array(z.object({}).passthrough()),
}).passthrough();

const alignmentSchema = z.object({
  alignment_id: z.string(),
  words: z.array(z.object({}).passthrough()),
  duration_seconds: z.number().nonnegative(),
}).passthrough();

const reportSchema = z.object({}).passthrough();

const requestSchemas = new Map<string, z.ZodTypeAny>([
  ['lct.orch.any_to_any', toolRequestSchema(
    'lct.orch.any_to_any',
    z.object({
      assets: z.array(assetRefSchema).min(1),
      instruction: z.string().min(1),
    }).strict(),
    z.object({
      targets: z.array(z.enum(['pptx', 'docx', 'xlsx', 'dashboard', 'pdf', 'html', 'png', 'srt', 'vtt', 'json'])).min(1),
      claims: z.array(strictClaimSchema),
      target_language: z.enum(['ar', 'en', 'mixed']).optional(),
      fidelity_mode: z.enum(['literal_1to1', 'smart']).optional(),
      template_id: z.string().optional(),
      term_pack_id: z.string().optional(),
      style_guide_id: z.string().optional(),
      classification: z.enum(['public', 'internal', 'confidential', 'restricted']).optional(),
    }).strict(),
  )],
  ['lct.extract.modality_detect', toolRequestSchema(
    'lct.extract.modality_detect',
    z.object({
      asset: assetRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['lct.transcribe.video_to_audio', toolRequestSchema(
    'lct.transcribe.video_to_audio',
    z.object({
      video_asset: assetRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['lct.transcribe.asr_ensemble_strict', toolRequestSchema(
    'lct.transcribe.asr_ensemble_strict',
    z.object({
      audio_asset: assetRefSchema,
      video_asset: assetRefSchema.optional(),
      glossary: z.object({}).passthrough().optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['lct.transcribe.forced_alignment', toolRequestSchema(
    'lct.transcribe.forced_alignment',
    z.object({
      audio_asset: assetRefSchema,
      transcript_draft: transcriptDraftSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['lct.transcribe.ocr_on_screen', toolRequestSchema(
    'lct.transcribe.ocr_on_screen',
    z.object({
      video_asset: assetRefSchema,
    }).strict(),
    z.object({
      sample_every_seconds: z.number().positive().optional(),
    }).strict(),
  )],
  ['lct.transcribe.exactness_gate', toolRequestSchema(
    'lct.transcribe.exactness_gate',
    z.object({
      ensemble: reportSchema,
      alignment: alignmentSchema,
      ocr: reportSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['verifier.ops.dispatch', toolRequestSchema(
    'verifier.ops.dispatch',
    z.object({
      operation: z.enum(['convert', 'localize', 'transcribe']),
      unresolved_spans: z.array(z.object({}).passthrough()),
      assets: z.array(assetRefSchema).optional(),
      candidate_text: z.string().optional(),
      context_payload: z.object({}).passthrough().optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['lct.localize.termaware_translate', toolRequestSchema(
    'lct.localize.termaware_translate',
    z.object({
      doc_ir: reportSchema,
      term_pack: reportSchema.optional(),
      style_guide: reportSchema.optional(),
      target_language: z.enum(['ar', 'en', 'mixed']),
    }).strict(),
    z.object({}).strict(),
  )],
  ['lct.localize.arabic_typeset_elite', toolRequestSchema(
    'lct.localize.arabic_typeset_elite',
    z.object({
      translated_runs: reportSchema,
      layout_constraints: reportSchema.optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['lct.localize.lqa_gate_zero', toolRequestSchema(
    'lct.localize.lqa_gate_zero',
    z.object({
      terminology_report: reportSchema,
      lqa_report: reportSchema,
      layout_qa: reportSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['lct.convert.cdr_build', toolRequestSchema(
    'lct.convert.cdr_build',
    z.object({
      asset: assetRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['lct.convert.export_targets', toolRequestSchema(
    'lct.convert.export_targets',
    z.object({
      cdr: reportSchema,
      targets: z.array(z.enum(['pptx', 'docx', 'xlsx', 'dashboard', 'pdf', 'html', 'png', 'json'])).min(1),
      text_payload: z.string().optional(),
      transcript: transcriptDraftSchema.optional(),
    }).strict(),
    z.object({
      classification: z.enum(['public', 'internal', 'confidential', 'restricted']).optional(),
      localized: z.boolean().optional(),
    }).strict(),
  )],
  ['lct.verify.pixel_gate_zero', toolRequestSchema(
    'lct.verify.pixel_gate_zero',
    z.object({
      source_render: artifactRefSchema,
      target_render: artifactRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['lct.verify.structural_editable_gate', toolRequestSchema(
    'lct.verify.structural_editable_gate',
    z.object({
      artifact: artifactRefSchema,
      export_manifest: reportSchema.optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['lct.repair.loop_controller', toolRequestSchema(
    'lct.repair.loop_controller',
    z.object({
      kind: z.enum(['convert', 'localize', 'transcribe']),
      current_state: reportSchema,
    }).strict(),
    z.object({
      max_iterations: z.number().int().min(1).max(100).optional(),
    }).strict(),
  )],
  ['lct.export.multi_format', toolRequestSchema(
    'lct.export.multi_format',
    z.object({
      project_state: reportSchema,
      targets: z.array(z.enum(['pptx', 'docx', 'xlsx', 'dashboard', 'pdf', 'html', 'png', 'srt', 'vtt', 'json'])).min(1),
    }).strict(),
    z.object({
      classification: z.enum(['public', 'internal', 'confidential', 'restricted']).optional(),
    }).strict(),
  )],
  ['lct.evidence.pack', toolRequestSchema(
    'lct.evidence.pack',
    z.object({
      operation: reportSchema,
      artifacts: z.array(artifactRefSchema).min(1),
      reports: reportSchema,
    }).strict(),
    z.object({}).strict(),
  )],
]);

const responseSchemas = new Map<string, z.ZodTypeAny>([
  ['lct.orch.any_to_any', toolResponseSchema(
    'lct.orch.any_to_any',
    z.object({
      artifacts: z.array(artifactRefSchema).min(1),
      evidence_id: z.string().min(8),
    }).strict(),
  )],
  ['lct.extract.modality_detect', toolResponseSchema(
    'lct.extract.modality_detect',
    z.object({
      modality: z.enum(['pdf', 'image', 'audio', 'video', 'docx', 'pptx', 'xlsx', 'text']),
      has_embedded_captions: z.boolean(),
      has_tables: z.boolean(),
    }).strict(),
  )],
  ['lct.transcribe.video_to_audio', toolResponseSchema(
    'lct.transcribe.video_to_audio',
    z.object({
      audio_asset: assetRefSchema,
      track_metadata: reportSchema,
    }).strict(),
  )],
  ['lct.transcribe.asr_ensemble_strict', toolResponseSchema(
    'lct.transcribe.asr_ensemble_strict',
    z.object({
      transcript_draft: transcriptDraftSchema,
      disagreements: z.array(z.object({}).passthrough()),
      diarization_draft: reportSchema,
    }).strict(),
  )],
  ['lct.transcribe.forced_alignment', toolResponseSchema(
    'lct.transcribe.forced_alignment',
    z.object({
      word_timestamps: z.array(z.object({}).passthrough()),
      alignment_pass: z.boolean(),
      alignment: alignmentSchema,
    }).strict(),
  )],
  ['lct.transcribe.ocr_on_screen', toolResponseSchema(
    'lct.transcribe.ocr_on_screen',
    z.object({
      on_screen_text: reportSchema,
      subtitles_detection: reportSchema,
    }).strict(),
  )],
  ['lct.transcribe.exactness_gate', toolResponseSchema(
    'lct.transcribe.exactness_gate',
    z.object({
      exact: z.boolean(),
      unresolved_spans: z.array(z.object({}).passthrough()),
    }).strict(),
  )],
  ['verifier.ops.dispatch', toolResponseSchema(
    'verifier.ops.dispatch',
    z.object({
      verified_transcript: reportSchema,
      verifier_proof: reportSchema,
    }).strict(),
  )],
  ['lct.localize.termaware_translate', toolResponseSchema(
    'lct.localize.termaware_translate',
    z.object({
      translated_runs: reportSchema,
      terminology_report: reportSchema,
      lqa_report: reportSchema,
    }).strict(),
  )],
  ['lct.localize.arabic_typeset_elite', toolResponseSchema(
    'lct.localize.arabic_typeset_elite',
    z.object({
      typeset_runs: reportSchema,
      layout_fixes_applied: z.array(z.object({}).passthrough()),
      layout_qa: reportSchema,
    }).strict(),
  )],
  ['lct.localize.lqa_gate_zero', toolResponseSchema(
    'lct.localize.lqa_gate_zero',
    z.object({
      pass: z.boolean(),
    }).strict(),
  )],
  ['lct.convert.cdr_build', toolResponseSchema(
    'lct.convert.cdr_build',
    z.object({
      cdr: reportSchema,
    }).strict(),
  )],
  ['lct.convert.export_targets', toolResponseSchema(
    'lct.convert.export_targets',
    z.object({
      artifacts: z.array(artifactRefSchema).min(1),
      export_manifest: reportSchema,
    }).strict(),
  )],
  ['lct.verify.pixel_gate_zero', toolResponseSchema(
    'lct.verify.pixel_gate_zero',
    z.object({
      pass: z.boolean(),
      pixel_diff: z.number().nonnegative(),
      report: reportSchema,
    }).strict(),
  )],
  ['lct.verify.structural_editable_gate', toolResponseSchema(
    'lct.verify.structural_editable_gate',
    z.object({
      pass: z.boolean(),
      report: reportSchema,
    }).strict(),
  )],
  ['lct.repair.loop_controller', toolResponseSchema(
    'lct.repair.loop_controller',
    z.object({
      state: reportSchema,
      resolved: z.boolean(),
    }).strict(),
  )],
  ['lct.export.multi_format', toolResponseSchema(
    'lct.export.multi_format',
    z.object({
      artifacts: z.array(artifactRefSchema).min(1),
    }).strict(),
  )],
  ['lct.evidence.pack', toolResponseSchema(
    'lct.evidence.pack',
    z.object({
      evidence_id: z.string().min(8),
    }).strict(),
  )],
]);

export const LCT_TOOL_DEFINITIONS = Array.from(requestSchemas.keys()).map(tool_id => ({
  tool_id,
  version: '1.0.0',
  determinism_level: 'HARD',
}));

export type LctContractDirection = 'request' | 'response';

export function validateLctToolContract(
  toolId: string,
  direction: LctContractDirection,
  payload: unknown,
): void {
  const schema = direction === 'request'
    ? requestSchemas.get(toolId)
    : responseSchemas.get(toolId);
  if (!schema) {
    throw new Error(`Unknown LCT tool contract: ${toolId}`);
  }
  schema.parse(payload);
}

export {
  actionContextSchema as lctActionContextSchema,
  strictClaimSchema as lctStrictClaimSchema,
  assetRefSchema as lctAssetRefSchema,
  artifactRefSchema as lctArtifactRefSchema,
};

