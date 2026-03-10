import { z } from 'zod';

const actionContextSchema = z.object({
  workspace_id: z.string().min(3).max(128),
  user_id: z.string().min(3).max(128),
  locale: z.string().min(2).max(16),
  strict_visual: z.boolean(),
  arabic_mode: z.enum(['BASIC', 'PROFESSIONAL', 'ELITE']),
  mode: z.enum(['AUTO', 'GUIDED']),
  font_policy: z.enum(['PROVIDED', 'ALLOW_UPLOAD', 'FALLBACK_ALLOWED']),
}).passthrough();

const assetRefSchema = z.object({
  asset_id: z.string().min(8).max(128),
  uri: z.string().min(1).max(2048),
  mime: z.string().min(3).max(128),
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/),
  size_bytes: z.number().int().nonnegative(),
  page_count: z.number().int().positive().optional(),
}).strict();

const pdfDomRefSchema = z.object({
  pdf_dom_id: z.string().min(8).max(128),
}).strict();

const imageSegRegionSchema = z.object({
  region_id: z.string().min(1).max(128),
  kind: z.enum(['background', 'text', 'logo', 'table', 'chart', 'figure', 'photo', 'ui_control', 'unknown']),
  bbox: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number().nonnegative(),
    h: z.number().nonnegative(),
  }).strict(),
  mask_uri: z.string().max(2048).optional(),
  confidence: z.number().min(0).max(1).optional(),
}).passthrough();

const imageSegRefSchema = z.object({
  seg_id: z.string().min(8).max(128),
  regions: z.array(imageSegRegionSchema),
}).strict();

const cdrDesignRefSchema = z.object({
  cdr_design_id: z.string().min(8).max(128),
  page_count: z.number().int().positive(),
}).strict();

const cdrDataRefSchema = z.object({
  cdr_data_id: z.string().min(8).max(128),
  table_count: z.number().int().nonnegative(),
}).strict();

const fontPlanSchema = z.object({
  fonts: z.array(z.object({
    family: z.string().min(1).max(256),
    status: z.enum(['available', 'embedded', 'synthesized', 'missing']),
    font_program_uri: z.string().max(2048).optional(),
    embed_all_glyphs: z.boolean().default(true),
  }).strict()),
}).strict();

const artifactRefSchema = z.object({
  artifact_id: z.string().min(8).max(128),
  kind: z.enum(['pptx', 'docx', 'xlsx', 'dashboard', 'pdf', 'png', 'json']),
  uri: z.string().min(1).max(2048),
}).strict();

const renderProfileSchema = z.object({
  dpi: z.number().int().min(72).max(1200),
  colorspace: z.literal('sRGB'),
  page_range: z.object({
    from: z.number().int().positive(),
    to: z.number().int().positive(),
  }).strict().optional(),
}).strict();

const hashBundleSchema = z.object({
  layout_hash: z.string().min(16).max(256),
  structural_hash: z.string().min(16).max(256),
  typography_hash: z.string().min(16).max(256),
  pixel_hash: z.string().min(16).max(256),
  perceptual_hash: z.string().min(16).max(256).optional(),
}).strict();

const renderRefSchema = z.object({
  render_id: z.string().min(8).max(128),
  uri: z.string().min(1).max(2048),
  dpi: z.number().int().min(72).max(1200),
  colorspace: z.literal('sRGB'),
  engine_fingerprint: z.string().min(6).max(256),
  render_config_hash: z.string().min(16).max(256),
  fingerprint: hashBundleSchema,
}).strict();

const diffRefSchema = z.object({
  diff_id: z.string().min(8).max(128),
  pixel_diff: z.number().min(0),
  pass: z.boolean(),
  heatmap_uri: z.string().max(2048).optional(),
}).strict();

const determinismCheckSchema = z.object({
  anti_aliasing_policy: z.literal('locked'),
  gpu_cpu_parity: z.enum(['validated', 'forced_single_path']),
  float_norm_policy: z.literal('locked'),
  random_seed_locked: z.boolean(),
}).strict();

const warningsSchema = z.array(z.object({
  code: z.string().min(2).max(64),
  message: z.string().min(1).max(2000),
  severity: z.enum(['info', 'warning', 'error']),
}).strict()).optional();

function toolRequestSchema<TInputs extends z.ZodTypeAny, TParams extends z.ZodTypeAny>(
  toolId: string,
  inputs: TInputs,
  params: TParams,
): z.ZodObject<{
  request_id: z.ZodString;
  tool_id: z.ZodLiteral<string>;
  context: typeof actionContextSchema;
  inputs: TInputs;
  params: TParams;
}> {
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
): z.ZodObject<{
  request_id: z.ZodString;
  tool_id: z.ZodLiteral<string>;
  status: z.ZodEnum<['ok', 'failed']>;
  refs: TRefs;
  warnings: typeof warningsSchema;
}> {
  return z.object({
    request_id: z.string(),
    tool_id: z.literal(toolId),
    status: z.enum(['ok', 'failed']),
    refs,
    warnings: warningsSchema,
  }).strict();
}

const renderRequestFactory = (toolId: string) => toolRequestSchema(toolId, z.object({
  source: z.object({}).passthrough(),
  render_profile: renderProfileSchema,
}).passthrough(), z.object({}).passthrough());

const renderResponseSchema = (toolId: string) => toolResponseSchema(toolId, z.object({
  renders: z.array(renderRefSchema).min(1),
}).strict());

const exportRequestFactory = (toolId: string, inputs: z.ZodTypeAny) =>
  toolRequestSchema(toolId, inputs, z.object({}).passthrough());
const exportResponseSchema = (toolId: string) => toolResponseSchema(toolId, z.object({
  artifact: artifactRefSchema,
}).strict());

const requestSchemas = new Map<string, z.ZodTypeAny>([
  ['extract.pdf_dom', toolRequestSchema('extract.pdf_dom', z.object({ pdf_asset: assetRefSchema }).strict(), z.object({}).passthrough())],
  ['extract.image_segments', toolRequestSchema('extract.image_segments', z.object({ image_asset: assetRefSchema }).strict(), z.object({}).passthrough())],
  ['cdr.build_design_from_pdf', toolRequestSchema(
    'cdr.build_design_from_pdf',
    z.object({ pdf_dom: pdfDomRefSchema }).strict(),
    z.object({
      page_range: z.object({
        from: z.number().int().positive(),
        to: z.number().int().positive(),
      }).strict().optional(),
    }).passthrough(),
  )],
  ['cdr.build_design_from_image', toolRequestSchema('cdr.build_design_from_image', z.object({ image_segments: imageSegRefSchema }).strict(), z.object({}).passthrough())],
  ['cdr.build_table_from_image', toolRequestSchema(
    'cdr.build_table_from_image',
    z.object({
      image_segments: imageSegRefSchema,
      table_region_id: z.string(),
    }).strict(),
    z.object({
      min_ocr_confidence: z.number().min(0).max(1).optional(),
    }).passthrough(),
  )],
  ['fonts.embed_full_glyph', toolRequestSchema(
    'fonts.embed_full_glyph',
    z.object({ font_plan: fontPlanSchema }).strict(),
    z.object({ embed_all_glyphs: z.literal(true) }).strict(),
  )],
  ['export.pptx_from_cdr', exportRequestFactory('export.pptx_from_cdr', z.object({
    cdr_design: cdrDesignRefSchema,
    font_plan: fontPlanSchema,
  }).strict())],
  ['export.docx_from_cdr', exportRequestFactory('export.docx_from_cdr', z.object({
    cdr_design: cdrDesignRefSchema,
    font_plan: fontPlanSchema,
  }).strict())],
  ['export.xlsx_from_table_cdr', exportRequestFactory('export.xlsx_from_table_cdr', z.object({
    cdr_data: cdrDataRefSchema,
    style_source: cdrDesignRefSchema,
  }).strict())],
  ['export.dashboard_from_cdr', exportRequestFactory('export.dashboard_from_cdr', z.object({
    cdr_design: cdrDesignRefSchema,
    cdr_data: cdrDataRefSchema,
  }).strict())],
  ['render.pdf_to_png', renderRequestFactory('render.pdf_to_png')],
  ['render.pptx_to_png', renderRequestFactory('render.pptx_to_png')],
  ['render.docx_to_png', renderRequestFactory('render.docx_to_png')],
  ['render.xlsx_to_png', renderRequestFactory('render.xlsx_to_png')],
  ['render.dashboard_to_png', renderRequestFactory('render.dashboard_to_png')],
  ['verify.pixel_diff', toolRequestSchema(
    'verify.pixel_diff',
    z.object({
      source_render: renderRefSchema,
      target_render: renderRefSchema,
    }).strict(),
    z.object({ threshold: z.literal(0) }).strict(),
  )],
  ['verify.structural_equivalence', toolRequestSchema(
    'verify.structural_equivalence',
    z.object({
      artifact: artifactRefSchema,
      cdr_design: cdrDesignRefSchema,
    }).strict(),
    z.object({
      require_text_editable: z.literal(true),
      require_tables_structured: z.literal(true),
      require_charts_bound: z.literal(true),
    }).strict(),
  )],
  ['render.validate_determinism', toolRequestSchema(
    'render.validate_determinism',
    z.object({
      renders: z.array(renderRefSchema).min(2),
      checks: determinismCheckSchema,
    }).strict(),
    z.object({}).passthrough(),
  )],
  ['diagnose.diff_attribution', toolRequestSchema(
    'diagnose.diff_attribution',
    z.object({
      diff: diffRefSchema,
      cdr_design: cdrDesignRefSchema,
    }).strict(),
    z.object({}).passthrough(),
  )],
  ['repair.quantize_geometry', toolRequestSchema(
    'repair.quantize_geometry',
    z.object({ cdr_design: cdrDesignRefSchema }).strict(),
    z.object({ emu_snap: z.number().int().min(1) }).strict(),
  )],
  ['repair.adjust_text_metrics', toolRequestSchema(
    'repair.adjust_text_metrics',
    z.object({
      cdr_design: cdrDesignRefSchema,
      patch_plan: z.object({}).passthrough(),
    }).strict(),
    z.object({}).passthrough(),
  )],
  ['repair.loop_controller', toolRequestSchema(
    'repair.loop_controller',
    z.object({
      source_render: renderRefSchema,
      initial_cdr_design: cdrDesignRefSchema,
      export_kind: z.enum(['pptx', 'docx', 'xlsx', 'dashboard']),
      render_kind: z.enum(['pptx', 'docx', 'xlsx', 'dashboard']),
    }).strict(),
    z.object({ max_iterations: z.number().int().min(1) }).strict(),
  )],
]);

const responseSchemas = new Map<string, z.ZodTypeAny>([
  ['extract.pdf_dom', toolResponseSchema('extract.pdf_dom', z.object({ pdf_dom: pdfDomRefSchema }).strict())],
  ['extract.image_segments', toolResponseSchema('extract.image_segments', z.object({ image_segments: imageSegRefSchema }).strict())],
  ['cdr.build_design_from_pdf', toolResponseSchema('cdr.build_design_from_pdf', z.object({
    cdr_design: cdrDesignRefSchema,
    font_plan: fontPlanSchema,
  }).strict())],
  ['cdr.build_design_from_image', toolResponseSchema('cdr.build_design_from_image', z.object({
    cdr_design: cdrDesignRefSchema,
    font_plan: fontPlanSchema,
  }).strict())],
  ['cdr.build_table_from_image', toolResponseSchema('cdr.build_table_from_image', z.object({
    cdr_design: cdrDesignRefSchema,
    cdr_data: cdrDataRefSchema,
  }).strict())],
  ['fonts.embed_full_glyph', toolResponseSchema('fonts.embed_full_glyph', z.object({ font_plan: fontPlanSchema }).strict())],
  ['export.pptx_from_cdr', exportResponseSchema('export.pptx_from_cdr')],
  ['export.docx_from_cdr', exportResponseSchema('export.docx_from_cdr')],
  ['export.xlsx_from_table_cdr', exportResponseSchema('export.xlsx_from_table_cdr')],
  ['export.dashboard_from_cdr', exportResponseSchema('export.dashboard_from_cdr')],
  ['render.pdf_to_png', renderResponseSchema('render.pdf_to_png')],
  ['render.pptx_to_png', renderResponseSchema('render.pptx_to_png')],
  ['render.docx_to_png', renderResponseSchema('render.docx_to_png')],
  ['render.xlsx_to_png', renderResponseSchema('render.xlsx_to_png')],
  ['render.dashboard_to_png', renderResponseSchema('render.dashboard_to_png')],
  ['verify.pixel_diff', toolResponseSchema('verify.pixel_diff', z.object({ diff: diffRefSchema }).strict())],
  ['verify.structural_equivalence', toolResponseSchema('verify.structural_equivalence', z.object({
    pass: z.boolean(),
    hashes: hashBundleSchema,
  }).strict())],
  ['render.validate_determinism', toolResponseSchema('render.validate_determinism', z.object({ pass: z.boolean() }).strict())],
  ['diagnose.diff_attribution', toolResponseSchema('diagnose.diff_attribution', z.object({
    patch_plan: z.object({
      fixes: z.array(z.unknown()),
    }).passthrough(),
  }).strict())],
  ['repair.quantize_geometry', toolResponseSchema('repair.quantize_geometry', z.object({ cdr_design: cdrDesignRefSchema }).strict())],
  ['repair.adjust_text_metrics', toolResponseSchema('repair.adjust_text_metrics', z.object({ cdr_design: cdrDesignRefSchema }).strict())],
  ['repair.loop_controller', toolResponseSchema('repair.loop_controller', z.object({
    final_artifact: artifactRefSchema,
    final_diff: diffRefSchema,
  }).strict())],
]);

function buildErrorMessage(toolId: string, phase: 'request' | 'response', issues: z.ZodIssue[]): string {
  const details = issues
    .map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
  return `${toolId} ${phase} contract violation: ${details}`;
}

export function validateToolContract(toolId: string, phase: 'request' | 'response', payload: unknown): void {
  const schemas = phase === 'request' ? requestSchemas : responseSchemas;
  const schema = schemas.get(toolId);
  if (!schema) {
    throw new Error(`Missing ${phase} contract for tool: ${toolId}`);
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(buildErrorMessage(toolId, phase, result.error.issues));
  }
}
