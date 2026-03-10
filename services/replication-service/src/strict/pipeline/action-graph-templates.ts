/**
 * Action Graph Templates — Section 15.2
 * Immutable templates for all strict conversion pipelines.
 */

export interface ActionGraphNode {
  id: string;
  tool_id: string;
  depends_on: string[];
  params?: Record<string, unknown>;
}

export interface ActionGraphTemplate {
  template_id: string;
  name: string;
  description: string;
  nodes: ActionGraphNode[];
}

// ─── PDF → PPTX STRICT ──────────────────────────────────────────────
export const PDF_TO_PPTX_STRICT: ActionGraphTemplate = {
  template_id: 'pdf-to-pptx-strict',
  name: 'PDF → PPTX (Strict)',
  description: 'Convert PDF to editable PPTX with PixelDiff==0',
  nodes: [
    { id: 'ingest', tool_id: 'extract.pdf_dom', depends_on: [] },
    { id: 'build_cdr', tool_id: 'cdr.build_design_from_pdf', depends_on: ['ingest'] },
    { id: 'embed_fonts', tool_id: 'fonts.embed_full_glyph', depends_on: ['build_cdr'], params: { embed_all_glyphs: true } },
    { id: 'export', tool_id: 'export.pptx_from_cdr', depends_on: ['embed_fonts'] },
    { id: 'render_source', tool_id: 'render.pdf_to_png', depends_on: ['ingest'] },
    { id: 'render_target', tool_id: 'render.pptx_to_png', depends_on: ['export'] },
    { id: 'verify_det', tool_id: 'render.validate_determinism', depends_on: ['render_target'] },
    { id: 'verify_struct', tool_id: 'verify.structural_equivalence', depends_on: ['export', 'build_cdr'] },
    { id: 'verify_pixel', tool_id: 'verify.pixel_diff', depends_on: ['render_source', 'render_target'], params: { threshold: 0 } },
    { id: 'repair', tool_id: 'repair.loop_controller', depends_on: ['verify_pixel'], params: { max_iterations: 50 } },
  ],
};

// ─── PDF → DOCX STRICT ──────────────────────────────────────────────
export const PDF_TO_DOCX_STRICT: ActionGraphTemplate = {
  template_id: 'pdf-to-docx-strict',
  name: 'PDF → DOCX (Strict)',
  description: 'Convert PDF to editable DOCX with PixelDiff==0',
  nodes: [
    { id: 'ingest', tool_id: 'extract.pdf_dom', depends_on: [] },
    { id: 'build_cdr', tool_id: 'cdr.build_design_from_pdf', depends_on: ['ingest'] },
    { id: 'embed_fonts', tool_id: 'fonts.embed_full_glyph', depends_on: ['build_cdr'], params: { embed_all_glyphs: true } },
    { id: 'export', tool_id: 'export.docx_from_cdr', depends_on: ['embed_fonts'] },
    { id: 'render_source', tool_id: 'render.pdf_to_png', depends_on: ['ingest'] },
    { id: 'render_target', tool_id: 'render.docx_to_png', depends_on: ['export'] },
    { id: 'verify_det', tool_id: 'render.validate_determinism', depends_on: ['render_target'] },
    { id: 'verify_struct', tool_id: 'verify.structural_equivalence', depends_on: ['export', 'build_cdr'] },
    { id: 'verify_pixel', tool_id: 'verify.pixel_diff', depends_on: ['render_source', 'render_target'], params: { threshold: 0 } },
    { id: 'repair', tool_id: 'repair.loop_controller', depends_on: ['verify_pixel'], params: { max_iterations: 50 } },
  ],
};

// ─── PDF → XLSX STRICT ──────────────────────────────────────────────
export const PDF_TO_XLSX_STRICT: ActionGraphTemplate = {
  template_id: 'pdf-to-xlsx-strict',
  name: 'PDF → XLSX (Strict)',
  description: 'Convert PDF tables to editable XLSX with PixelDiff==0',
  nodes: [
    { id: 'ingest', tool_id: 'extract.pdf_dom', depends_on: [] },
    { id: 'build_cdr', tool_id: 'cdr.build_design_from_pdf', depends_on: ['ingest'] },
    { id: 'embed_fonts', tool_id: 'fonts.embed_full_glyph', depends_on: ['build_cdr'], params: { embed_all_glyphs: true } },
    { id: 'export', tool_id: 'export.xlsx_from_table_cdr', depends_on: ['embed_fonts'] },
    { id: 'render_source', tool_id: 'render.pdf_to_png', depends_on: ['ingest'] },
    { id: 'render_target', tool_id: 'render.xlsx_to_png', depends_on: ['export'] },
    { id: 'verify_pixel', tool_id: 'verify.pixel_diff', depends_on: ['render_source', 'render_target'], params: { threshold: 0 } },
    { id: 'repair', tool_id: 'repair.loop_controller', depends_on: ['verify_pixel'], params: { max_iterations: 50 } },
  ],
};

// ─── Image(table) → XLSX STRICT ─────────────────────────────────────
export const IMAGE_TABLE_TO_XLSX_STRICT: ActionGraphTemplate = {
  template_id: 'image-table-to-xlsx-strict',
  name: 'Image(Table) → XLSX (Strict)',
  description: 'Convert table screenshot to editable XLSX with PixelDiff==0',
  nodes: [
    { id: 'segment', tool_id: 'extract.image_segments', depends_on: [] },
    { id: 'build_table', tool_id: 'cdr.build_table_from_image', depends_on: ['segment'] },
    { id: 'export', tool_id: 'export.xlsx_from_table_cdr', depends_on: ['build_table'] },
    { id: 'render_source', tool_id: 'render.pdf_to_png', depends_on: [] },
    { id: 'render_target', tool_id: 'render.xlsx_to_png', depends_on: ['export'] },
    { id: 'verify_pixel', tool_id: 'verify.pixel_diff', depends_on: ['render_source', 'render_target'], params: { threshold: 0 } },
    { id: 'repair', tool_id: 'repair.loop_controller', depends_on: ['verify_pixel'], params: { max_iterations: 50 } },
  ],
};

// ─── Image(Dashboard) → Dashboard STRICT ─────────────────────────────
export const IMAGE_DASHBOARD_TO_DASHBOARD_STRICT: ActionGraphTemplate = {
  template_id: 'image-dashboard-to-dashboard-strict',
  name: 'Image(Dashboard) → Dashboard (Strict)',
  description: 'Convert dashboard screenshot to live dashboard with PixelDiff==0',
  nodes: [
    { id: 'segment', tool_id: 'extract.image_segments', depends_on: [] },
    { id: 'build_cdr', tool_id: 'cdr.build_design_from_image', depends_on: ['segment'] },
    { id: 'embed_fonts', tool_id: 'fonts.embed_full_glyph', depends_on: ['build_cdr'], params: { embed_all_glyphs: true } },
    { id: 'export', tool_id: 'export.dashboard_from_cdr', depends_on: ['build_cdr'] },
    { id: 'render_source', tool_id: 'render.dashboard_to_png', depends_on: [] },
    { id: 'render_target', tool_id: 'render.dashboard_to_png', depends_on: ['export'] },
    { id: 'verify_pixel', tool_id: 'verify.pixel_diff', depends_on: ['render_source', 'render_target'], params: { threshold: 0 } },
    { id: 'repair', tool_id: 'repair.loop_controller', depends_on: ['verify_pixel'], params: { max_iterations: 50 } },
  ],
};

// ─── Image(Report) → DOCX STRICT ────────────────────────────────────
export const IMAGE_REPORT_TO_DOCX_STRICT: ActionGraphTemplate = {
  template_id: 'image-report-to-docx-strict',
  name: 'Image(Report) → DOCX (Strict)',
  description: 'Convert report screenshot to editable DOCX with PixelDiff==0',
  nodes: [
    { id: 'segment', tool_id: 'extract.image_segments', depends_on: [] },
    { id: 'build_cdr', tool_id: 'cdr.build_design_from_image', depends_on: ['segment'] },
    { id: 'embed_fonts', tool_id: 'fonts.embed_full_glyph', depends_on: ['build_cdr'], params: { embed_all_glyphs: true } },
    { id: 'export', tool_id: 'export.docx_from_cdr', depends_on: ['embed_fonts'] },
    { id: 'render_source', tool_id: 'render.pdf_to_png', depends_on: [] },
    { id: 'render_target', tool_id: 'render.docx_to_png', depends_on: ['export'] },
    { id: 'verify_pixel', tool_id: 'verify.pixel_diff', depends_on: ['render_source', 'render_target'], params: { threshold: 0 } },
    { id: 'repair', tool_id: 'repair.loop_controller', depends_on: ['verify_pixel'], params: { max_iterations: 50 } },
  ],
};

// ─── Any → Any STRICT (generic) ─────────────────────────────────────
export const ANY_TO_ANY_STRICT: ActionGraphTemplate = {
  template_id: 'any-to-any-strict',
  name: 'Any → Any (Strict)',
  description: 'Generic strict conversion pipeline (format auto-detected)',
  nodes: [
    { id: 'extract', tool_id: 'extract.pdf_dom', depends_on: [] }, // or extract.image_segments
    { id: 'build_cdr', tool_id: 'cdr.build_design_from_pdf', depends_on: ['extract'] }, // or from_image
    { id: 'embed_fonts', tool_id: 'fonts.embed_full_glyph', depends_on: ['build_cdr'], params: { embed_all_glyphs: true } },
    { id: 'export', tool_id: 'export.pptx_from_cdr', depends_on: ['embed_fonts'] }, // dynamic
    { id: 'render_source', tool_id: 'render.pdf_to_png', depends_on: ['extract'] }, // dynamic
    { id: 'render_target', tool_id: 'render.pptx_to_png', depends_on: ['export'] }, // dynamic
    { id: 'verify_det', tool_id: 'render.validate_determinism', depends_on: ['render_target'] },
    { id: 'verify_struct', tool_id: 'verify.structural_equivalence', depends_on: ['export', 'build_cdr'] },
    { id: 'verify_pixel', tool_id: 'verify.pixel_diff', depends_on: ['render_source', 'render_target'], params: { threshold: 0 } },
    { id: 'repair', tool_id: 'repair.loop_controller', depends_on: ['verify_pixel'], params: { max_iterations: 50 } },
  ],
};

// ─── Template Registry ───────────────────────────────────────────────
export const ALL_TEMPLATES: ActionGraphTemplate[] = [
  PDF_TO_PPTX_STRICT,
  PDF_TO_DOCX_STRICT,
  PDF_TO_XLSX_STRICT,
  IMAGE_TABLE_TO_XLSX_STRICT,
  IMAGE_DASHBOARD_TO_DASHBOARD_STRICT,
  IMAGE_REPORT_TO_DOCX_STRICT,
  ANY_TO_ANY_STRICT,
];

export function getTemplate(templateId: string): ActionGraphTemplate | undefined {
  return ALL_TEMPLATES.find(t => t.template_id === templateId);
}

export function selectTemplate(inputMime: string, targetKind: string): ActionGraphTemplate {
  if (inputMime === 'application/pdf') {
    if (targetKind === 'pptx') return PDF_TO_PPTX_STRICT;
    if (targetKind === 'docx') return PDF_TO_DOCX_STRICT;
    if (targetKind === 'xlsx') return PDF_TO_XLSX_STRICT;
  }
  if (inputMime.startsWith('image/')) {
    if (targetKind === 'xlsx') return IMAGE_TABLE_TO_XLSX_STRICT;
    if (targetKind === 'dashboard') return IMAGE_DASHBOARD_TO_DASHBOARD_STRICT;
    if (targetKind === 'docx') return IMAGE_REPORT_TO_DOCX_STRICT;
  }
  return ANY_TO_ANY_STRICT;
}
