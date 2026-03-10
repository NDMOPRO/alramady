import { z } from 'zod';

export const slidesActionContextSchema = z.object({
  workspace_id: z.string(),
  user_id: z.string(),
  locale: z.string(),
  mode: z.enum(['AUTO', 'CONTROLLED']),
  arabic_mode: z.enum(['BASIC', 'PROFESSIONAL', 'ELITE']),
  brand_kit_id: z.string(),
}).passthrough();

export const slidesAssetRefSchema = z.object({
  asset_id: z.string(),
  uri: z.string(),
  mime: z.string(),
  sha256: z.string(),
}).strict();

export const slidesDeckRefSchema = z.object({
  deck_id: z.string(),
  slide_count: z.number().int().min(1),
}).strict();

export const slidesArtifactRefSchema = z.object({
  artifact_id: z.string(),
  kind: z.enum(['pptx', 'png', 'json', 'pdf', 'html', 'google_slides']),
  uri: z.string(),
}).strict();

const catalogKindSchema = z.enum(['layout', 'infographic', 'table', 'chart', 'icon', 'motion', 'header', 'background']);

const slideIntentSchema = z.object({
  topic: z.string(),
  language: z.enum(['ar', 'en', 'mixed']),
  slide_count: z.number().int().min(1).max(200),
  tone: z.enum(['formal', 'neutral', 'creative']),
  density: z.enum(['sparse', 'standard', 'dense']),
  infographic_level: z.enum(['low', 'med', 'high']),
  motion_level: z.enum(['none', 'basic', 'cinematic']),
  must_include: z.array(z.string()).optional(),
}).passthrough();

const controlManifestSchema = z.object({
  prefs_enabled: z.boolean(),
  deck_controls: z.record(z.object({
    mode: z.enum(['auto', 'fixed']),
    value: z.unknown(),
  }).strict()),
  scope_defaults: z.object({
    deck: z.array(z.string()),
    slide: z.array(z.string()),
    element: z.array(z.string()),
  }).strict(),
  search_controls_enabled: z.literal(true),
}).strict();

const preferencesSchema = z.object({
  prefs_enabled: z.boolean(),
  default_fidelity_mode: z.enum(['literal_1to1', 'smart']),
  default_language: z.enum(['ar', 'en', 'mixed']),
  default_slide_size: z.enum(['16:9', '4:3', 'A4']),
  default_tone: z.enum(['formal', 'neutral', 'creative']),
  default_density: z.enum(['sparse', 'standard', 'dense']),
  default_infographic_level: z.enum(['low', 'med', 'high']),
  default_motion_level: z.enum(['none', 'basic', 'cinematic']),
  default_fonts: z.object({
    ar_font: z.string(),
    latin_font: z.string(),
    mono_font: z.string(),
  }).strict(),
  default_palette: z.string(),
  default_background: z.enum(['auto', 'solid', 'gradient', 'image', 'pattern']),
  default_numbering: z.enum(['off', 'slide_x_of_y', 'section_based', 'custom']),
  default_toc: z.enum(['off', 'on']),
  default_header_style: z.enum(['auto', 'boardroom', 'editorial']),
  default_export_targets: z.array(z.enum(['pptx', 'google_slides', 'pdf', 'html'])),
}).strict();

const dataBindingRefSchema = z.object({
  binding_id: z.string(),
  asset_id: z.string(),
  sheet: z.string().optional(),
  range: z.string().optional(),
  columns: z.array(z.string()),
  rows_preview: z.array(z.record(z.union([z.string(), z.number()]))),
}).strict();

function toolRequestSchema<TInputs extends z.ZodTypeAny, TParams extends z.ZodTypeAny>(
  toolId: string,
  inputs: TInputs,
  params: TParams,
) {
  return z.object({
    request_id: z.string(),
    tool_id: z.literal(toolId),
    context: slidesActionContextSchema,
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
  }).strict();
}

const requestSchemas = new Map<string, z.ZodTypeAny>([
  ['slides.intent_parse', toolRequestSchema(
    'slides.intent_parse',
    z.object({
      prompt: z.string().min(1),
      assets: z.array(slidesAssetRefSchema).optional(),
    }).strict(),
    z.object({}).passthrough(),
  )],
  ['slides.control_manifest_build', toolRequestSchema(
    'slides.control_manifest_build',
    z.object({
      intent: z.object({}).passthrough(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.preferences_get', toolRequestSchema(
    'slides.preferences_get',
    z.object({}).strict(),
    z.object({}).strict(),
  )],
  ['slides.preferences_set', toolRequestSchema(
    'slides.preferences_set',
    z.object({
      preferences: preferencesSchema.partial(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.catalog_search', toolRequestSchema(
    'slides.catalog_search',
    z.object({
      catalog: catalogKindSchema,
      query: z.string().optional(),
      tags: z.array(z.string()).optional(),
      top_k: z.number().int().min(1).max(24).optional(),
      density: z.enum(['sparse', 'standard', 'dense']).optional(),
      tone: z.enum(['formal', 'neutral', 'creative']).optional(),
      rtl_ready: z.boolean().optional(),
      brand_compatible: z.boolean().optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.variant_generate', toolRequestSchema(
    'slides.variant_generate',
    z.object({
      catalog: catalogKindSchema,
      base_item_id: z.string(),
      direction: z.enum(['more_like_this', 'different_direction']),
      count: z.number().int().min(1).max(24).optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.plan_outline', toolRequestSchema(
    'slides.plan_outline',
    z.object({
      intent: z.object({}).passthrough(),
    }).strict(),
    z.object({}).passthrough(),
  )],
  ['slides.plan_storyboard', toolRequestSchema(
    'slides.plan_storyboard',
    z.object({
      outline: z.object({}).passthrough(),
    }).strict(),
    z.object({}).passthrough(),
  )],
  ['slides.apply_theme', toolRequestSchema(
    'slides.apply_theme',
    z.object({
      theme_id: z.string(),
      brand_kit_id: z.string(),
    }).strict(),
    z.object({
      force_fonts: z.boolean().optional(),
      force_palette: z.boolean().optional(),
      logo_rules: z.enum(['auto', 'off']).optional(),
    }).strict(),
  )],
  ['slides.build_deck', toolRequestSchema(
    'slides.build_deck',
    z.object({
      storyboard: z.object({}).passthrough(),
      theme_tokens: z.object({}).passthrough(),
      assets: z.array(slidesAssetRefSchema).optional(),
    }).strict(),
    z.object({
      grid_profile: z.enum(['premium_16_9', 'premium_4_3']).optional(),
      rtl_policy: z.enum(['auto', 'force_rtl']).optional(),
    }).strict(),
  )],
  ['slides.element_transform', toolRequestSchema(
    'slides.element_transform',
    z.object({
      deck: slidesDeckRefSchema,
      slide_index: z.number().int().min(1),
      element_id: z.string(),
      catalog: catalogKindSchema,
      variant_id: z.string(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.insert_strict_slide_from_asset', toolRequestSchema(
    'slides.insert_strict_slide_from_asset',
    z.object({
      deck: slidesDeckRefSchema,
      asset: slidesAssetRefSchema,
      target_index: z.number().int().min(1),
    }).strict(),
    z.object({
      strict_mode: z.literal('STRICT_1TO1_100'),
      page_number: z.number().int().min(1).optional(),
    }).strict(),
  )],
  ['slides.data_picker_browse', toolRequestSchema(
    'slides.data_picker_browse',
    z.object({
      asset: slidesAssetRefSchema,
      sheet: z.string().optional(),
      range: z.string().optional(),
      columns: z.array(z.string()).optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.data_binding_apply', toolRequestSchema(
    'slides.data_binding_apply',
    z.object({
      deck: slidesDeckRefSchema,
      slide_index: z.number().int().min(1),
      binding: z.union([z.string(), dataBindingRefSchema]),
      binding_kind: z.enum(['table', 'chart', 'kpi']),
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.media_import', toolRequestSchema(
    'slides.media_import',
    z.object({
      source_type: z.enum(['local', 'drive', 'onedrive', 'sharepoint', 's3']),
      uri: z.string(),
      mime: z.string().optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.video_embed', toolRequestSchema(
    'slides.video_embed',
    z.object({
      deck: slidesDeckRefSchema,
      slide_index: z.number().int().min(1),
      asset: slidesAssetRefSchema.optional(),
      url: z.string().optional(),
      poster_asset: slidesAssetRefSchema.optional(),
      autoplay: z.boolean().optional(),
      start_time: z.number().min(0).optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.qa_validate', toolRequestSchema(
    'slides.qa_validate',
    z.object({
      deck: slidesDeckRefSchema,
    }).strict(),
    z.object({
      must_pass_all: z.literal(true),
    }).strict(),
  )],
  ['slides.qa_autofix', toolRequestSchema(
    'slides.qa_autofix',
    z.object({
      deck: slidesDeckRefSchema,
      issues: z.array(z.object({}).passthrough()),
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.preview_render', toolRequestSchema(
    'slides.preview_render',
    z.object({
      deck: slidesDeckRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.reader_launch', toolRequestSchema(
    'slides.reader_launch',
    z.object({
      deck: slidesDeckRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.export_pptx', toolRequestSchema(
    'slides.export_pptx',
    z.object({
      deck: slidesDeckRefSchema,
    }).strict(),
    z.object({
      embed_fonts: z.literal(true),
    }).strict(),
  )],
  ['slides.export_google_slides', toolRequestSchema(
    'slides.export_google_slides',
    z.object({
      deck: slidesDeckRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.export_pdf', toolRequestSchema(
    'slides.export_pdf',
    z.object({
      deck: slidesDeckRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.export_html', toolRequestSchema(
    'slides.export_html',
    z.object({
      deck: slidesDeckRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.render_parity_verify', toolRequestSchema(
    'slides.render_parity_verify',
    z.object({
      deck: slidesDeckRefSchema,
      pptx: slidesArtifactRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.parity_matrix_verify', toolRequestSchema(
    'slides.parity_matrix_verify',
    z.object({
      deck: slidesDeckRefSchema,
      artifacts: z.array(slidesArtifactRefSchema).min(1),
      preview_id: z.string().optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.evidence_pack', toolRequestSchema(
    'slides.evidence_pack',
    z.object({
      deck: slidesDeckRefSchema,
      pptx: slidesArtifactRefSchema,
      qa_report: z.object({}).passthrough(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['slides.evidence_pack_export', toolRequestSchema(
    'slides.evidence_pack_export',
    z.object({
      deck: slidesDeckRefSchema,
      artifacts: z.array(slidesArtifactRefSchema).min(1),
      qa_report: z.object({}).passthrough(),
      preview_id: z.string().optional(),
    }).strict(),
    z.object({}).strict(),
  )],
]);

const responseSchemas = new Map<string, z.ZodTypeAny>([
  ['slides.intent_parse', toolResponseSchema(
    'slides.intent_parse',
    z.object({
      intent: slideIntentSchema,
    }).strict(),
  )],
  ['slides.control_manifest_build', toolResponseSchema(
    'slides.control_manifest_build',
    z.object({
      control_manifest: controlManifestSchema,
    }).strict(),
  )],
  ['slides.preferences_get', toolResponseSchema(
    'slides.preferences_get',
    z.object({
      preferences: preferencesSchema,
    }).strict(),
  )],
  ['slides.preferences_set', toolResponseSchema(
    'slides.preferences_set',
    z.object({
      preferences: preferencesSchema,
    }).strict(),
  )],
  ['slides.catalog_search', toolResponseSchema(
    'slides.catalog_search',
    z.object({
      catalog: catalogKindSchema,
      total_available: z.number().int().min(1),
      variant_capacity: z.number().int().min(1),
      items: z.array(z.object({}).passthrough()),
    }).strict(),
  )],
  ['slides.variant_generate', toolResponseSchema(
    'slides.variant_generate',
    z.object({
      base_item_id: z.string(),
      direction: z.enum(['more_like_this', 'different_direction']),
      variants: z.array(z.object({}).passthrough()),
    }).strict(),
  )],
  ['slides.plan_outline', toolResponseSchema(
    'slides.plan_outline',
    z.object({
      outline: z.object({
        sections: z.array(z.object({
          title: z.string(),
          slides: z.array(z.object({}).passthrough()),
        }).passthrough()).min(1),
      }).strict(),
    }).strict(),
  )],
  ['slides.plan_storyboard', toolResponseSchema(
    'slides.plan_storyboard',
    z.object({
      storyboard: z.object({
        slides: z.array(z.object({
          slide_index: z.number().int().min(1),
          layout_kind: z.string(),
          content_spec: z.object({}).passthrough(),
          blocks: z.array(z.string()).optional(),
        }).passthrough()).min(1),
      }).strict(),
    }).strict(),
  )],
  ['slides.apply_theme', toolResponseSchema(
    'slides.apply_theme',
    z.object({
      theme_tokens: z.object({}).passthrough(),
    }).strict(),
  )],
  ['slides.build_deck', toolResponseSchema(
    'slides.build_deck',
    z.object({
      deck: slidesDeckRefSchema,
    }).strict(),
  )],
  ['slides.element_transform', toolResponseSchema(
    'slides.element_transform',
    z.object({
      deck: slidesDeckRefSchema,
      slide_index: z.number().int().min(1),
      preview_hash: z.string(),
    }).strict(),
  )],
  ['slides.insert_strict_slide_from_asset', toolResponseSchema(
    'slides.insert_strict_slide_from_asset',
    z.object({
      deck: slidesDeckRefSchema,
    }).strict(),
  )],
  ['slides.data_picker_browse', toolResponseSchema(
    'slides.data_picker_browse',
    z.object({
      binding: dataBindingRefSchema,
    }).strict(),
  )],
  ['slides.data_binding_apply', toolResponseSchema(
    'slides.data_binding_apply',
    z.object({
      deck: slidesDeckRefSchema,
    }).strict(),
  )],
  ['slides.media_import', toolResponseSchema(
    'slides.media_import',
    z.object({
      asset: slidesAssetRefSchema,
      cached: z.boolean(),
    }).strict(),
  )],
  ['slides.video_embed', toolResponseSchema(
    'slides.video_embed',
    z.object({
      deck: slidesDeckRefSchema,
    }).strict(),
  )],
  ['slides.qa_validate', toolResponseSchema(
    'slides.qa_validate',
    z.object({
      pass: z.boolean(),
      issues: z.array(z.object({}).passthrough()),
    }).strict(),
  )],
  ['slides.qa_autofix', toolResponseSchema(
    'slides.qa_autofix',
    z.object({
      deck: slidesDeckRefSchema,
    }).strict(),
  )],
  ['slides.preview_render', toolResponseSchema(
    'slides.preview_render',
    z.object({
      preview_id: z.string(),
      frames: z.array(slidesArtifactRefSchema).min(1),
    }).strict(),
  )],
  ['slides.reader_launch', toolResponseSchema(
    'slides.reader_launch',
    z.object({
      reader_session_id: z.string(),
      reader_url: z.string(),
    }).strict(),
  )],
  ['slides.export_pptx', toolResponseSchema(
    'slides.export_pptx',
    z.object({
      pptx: slidesArtifactRefSchema,
    }).strict(),
  )],
  ['slides.export_google_slides', toolResponseSchema(
    'slides.export_google_slides',
    z.object({
      artifact: slidesArtifactRefSchema,
    }).strict(),
  )],
  ['slides.export_pdf', toolResponseSchema(
    'slides.export_pdf',
    z.object({
      artifact: slidesArtifactRefSchema,
    }).strict(),
  )],
  ['slides.export_html', toolResponseSchema(
    'slides.export_html',
    z.object({
      artifact: slidesArtifactRefSchema,
    }).strict(),
  )],
  ['slides.render_parity_verify', toolResponseSchema(
    'slides.render_parity_verify',
    z.object({
      pass: z.boolean(),
    }).strict(),
  )],
  ['slides.parity_matrix_verify', toolResponseSchema(
    'slides.parity_matrix_verify',
    z.object({
      pass: z.boolean(),
      matrix: z.array(z.object({
        target: z.string(),
        pass: z.boolean(),
        expected_hash: z.string(),
        actual_hash: z.string(),
      }).strict()).min(1),
    }).strict(),
  )],
  ['slides.evidence_pack', toolResponseSchema(
    'slides.evidence_pack',
    z.object({
      evidence_id: z.string(),
    }).strict(),
  )],
  ['slides.evidence_pack_export', toolResponseSchema(
    'slides.evidence_pack_export',
    z.object({
      evidence_id: z.string(),
    }).strict(),
  )],
]);

export const SLIDES_TOOL_DEFINITIONS = [
  {
    tool_id: 'slides.intent_parse',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.intent_parse.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.intent_parse.output.json',
  },
  {
    tool_id: 'slides.control_manifest_build',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.control_manifest_build.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.control_manifest_build.output.json',
  },
  {
    tool_id: 'slides.preferences_get',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.preferences_get.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.preferences_get.output.json',
  },
  {
    tool_id: 'slides.preferences_set',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.preferences_set.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.preferences_set.output.json',
  },
  {
    tool_id: 'slides.catalog_search',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.catalog_search.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.catalog_search.output.json',
  },
  {
    tool_id: 'slides.variant_generate',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.variant_generate.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.variant_generate.output.json',
  },
  {
    tool_id: 'slides.plan_outline',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.plan_outline.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.plan_outline.output.json',
  },
  {
    tool_id: 'slides.plan_storyboard',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.plan_storyboard.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.plan_storyboard.output.json',
  },
  {
    tool_id: 'slides.apply_theme',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.apply_theme.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.apply_theme.output.json',
  },
  {
    tool_id: 'slides.build_deck',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.build_deck.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.build_deck.output.json',
  },
  {
    tool_id: 'slides.element_transform',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.element_transform.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.element_transform.output.json',
  },
  {
    tool_id: 'slides.insert_strict_slide_from_asset',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.insert_strict_slide_from_asset.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.insert_strict_slide_from_asset.output.json',
  },
  {
    tool_id: 'slides.data_picker_browse',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.data_picker_browse.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.data_picker_browse.output.json',
  },
  {
    tool_id: 'slides.data_binding_apply',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.data_binding_apply.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.data_binding_apply.output.json',
  },
  {
    tool_id: 'slides.media_import',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.media_import.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.media_import.output.json',
  },
  {
    tool_id: 'slides.video_embed',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.video_embed.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.video_embed.output.json',
  },
  {
    tool_id: 'slides.qa_validate',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.qa_validate.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.qa_validate.output.json',
  },
  {
    tool_id: 'slides.qa_autofix',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.qa_autofix.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.qa_autofix.output.json',
  },
  {
    tool_id: 'slides.preview_render',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.preview_render.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.preview_render.output.json',
  },
  {
    tool_id: 'slides.reader_launch',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.reader_launch.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.reader_launch.output.json',
  },
  {
    tool_id: 'slides.export_pptx',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.export_pptx.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.export_pptx.output.json',
  },
  {
    tool_id: 'slides.export_google_slides',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.export_google_slides.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.export_google_slides.output.json',
  },
  {
    tool_id: 'slides.export_pdf',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.export_pdf.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.export_pdf.output.json',
  },
  {
    tool_id: 'slides.export_html',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.export_html.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.export_html.output.json',
  },
  {
    tool_id: 'slides.render_parity_verify',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.render_parity_verify.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.render_parity_verify.output.json',
  },
  {
    tool_id: 'slides.parity_matrix_verify',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.parity_matrix_verify.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.parity_matrix_verify.output.json',
  },
  {
    tool_id: 'slides.evidence_pack',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.evidence_pack.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.evidence_pack.output.json',
  },
  {
    tool_id: 'slides.evidence_pack_export',
    version: '1.0.0',
    input_schema_ref: 'https://slides.local/schemas/slides.evidence_pack_export.input.json',
    output_schema_ref: 'https://slides.local/schemas/slides.evidence_pack_export.output.json',
  },
] as const;

export type SlidesContractDirection = 'request' | 'response';

export function validateSlidesToolContract(
  toolId: string,
  direction: SlidesContractDirection,
  payload: unknown,
) {
  const schema = direction === 'request'
    ? requestSchemas.get(toolId)
    : responseSchemas.get(toolId);

  if (!schema) {
    throw new Error(`Slides tool contract not registered: ${toolId}`);
  }

  return schema.parse(payload);
}
