/**
 * STRICT 1:1 CDR (Canonical Design Representation) — 7-Layer Type System
 * Section 6 of the STRICT spec — exact field definitions, no modifications allowed.
 *
 * Units: EMU (English Metric Units) — 914400 EMU per inch
 */

// ─── Constants ───────────────────────────────────────────────────────
export const EMU_PER_INCH = 914400;
export const EMU_PER_CM = 360000;
export const EMU_PER_PT = 12700;

// ─── Enums ───────────────────────────────────────────────────────────
export type ArabicMode = 'BASIC' | 'PROFESSIONAL' | 'ELITE';
export type FontPolicy = 'PROVIDED' | 'ALLOW_UPLOAD' | 'FALLBACK_ALLOWED';
export type FontStatus = 'available' | 'embedded' | 'synthesized' | 'missing';
export type Severity = 'info' | 'warning' | 'error';
export type ArtifactKind = 'pptx' | 'docx' | 'xlsx' | 'dashboard' | 'pdf' | 'png' | 'json';
export type ToolStatus = 'ok' | 'failed';
export type DeterminismLevel = 'HARD' | 'SOFT';
export type FidelityTarget = 'PIXEL_0';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';
export type TextDirection = 'RTL' | 'LTR' | 'AUTO';
export type TextAlignment = 'start' | 'center' | 'end' | 'justify';
export type TextWrap = 'none' | 'word' | 'char';
export type ScriptType = 'arabic' | 'latin' | 'number' | 'mixed';
export type GeometryType = 'rounded_rect' | 'ellipse' | 'line' | 'polygon' | 'custom_path';
export type FillType = 'solid' | 'gradient' | 'pattern';
export type AlphaMode = 'premultiplied' | 'straight';
export type SamplingMode = 'nearest' | 'bilinear';
export type BindingKind = 'extracted' | 'reconstructed_synthetic';
export type RegionKind = 'background' | 'text' | 'logo' | 'table' | 'chart' | 'figure' | 'photo' | 'ui_control' | 'unknown';
export type ElementKind = 'text' | 'shape' | 'path' | 'image' | 'group' | 'table' | 'chart' | 'container' | 'clip_group' | 'background_fragment';
export type ExportKind = 'pptx' | 'docx' | 'xlsx' | 'dashboard';
export type RenderKind = 'pptx' | 'docx' | 'xlsx' | 'dashboard';

// ─── Geometry Primitives ─────────────────────────────────────────────
export interface BboxEmu {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SizeEmu {
  w: number;
  h: number;
}

/** 2x3 affine transform matrix [a, b, c, d, tx, ty] */
export type TransformMatrix = [number, number, number, number, number, number];

// ─── Color & Paint ───────────────────────────────────────────────────
export interface ColorRGBA {
  r: number; // 0-255
  g: number;
  b: number;
  a: number; // 0-255
}

export interface GradientStop {
  offset: number; // 0..1
  color: ColorRGBA;
}

export interface FillSpec {
  type: FillType;
  color?: ColorRGBA;
  gradient_stops?: GradientStop[];
  gradient_angle?: number;
  pattern_ref?: string;
}

export interface StrokeSpec {
  width_emu: number;
  color: ColorRGBA;
  join: 'miter' | 'round' | 'bevel';
  cap: 'butt' | 'round' | 'square';
  dash: number[];
}

// ─── Text ────────────────────────────────────────────────────────────
export interface TextRun {
  range: { start: number; end: number };
  font_family: string;
  font_weight: number;
  font_style: 'normal' | 'italic' | 'oblique';
  font_size_emu: number;
  letter_spacing_emu: number;
  kerning_enabled: boolean;
  color: ColorRGBA;
  script: ScriptType;
}

export interface BidiRun {
  start: number;
  end: number;
  level: number;
  direction: 'LTR' | 'RTL';
}

export interface TextShaping {
  arabic_mode: ArabicMode;
  bidi_runs: BidiRun[];
  glyph_positions_emu: number[];
}

export interface TextPaint {
  fill: FillSpec;
  outline?: StrokeSpec;
}

export interface TextElementData {
  text: string;
  direction: TextDirection;
  alignment: TextAlignment;
  baseline_offset_emu: number;
  line_height: number | { absolute_emu: number };
  wrap: TextWrap;
  auto_fit: false; // MUST be false
  runs: TextRun[];
  shaping: TextShaping;
  paint: TextPaint;
}

// ─── Shape / Path ────────────────────────────────────────────────────
export interface ShapeElementData {
  geometry: GeometryType;
  path_data?: string; // SVG path data for custom_path
  stroke?: StrokeSpec;
  fill?: FillSpec;
  effects: EffectSpec[];
}

export interface EffectSpec {
  type: 'shadow' | 'glow' | 'blur';
  params: Record<string, number | string | ColorRGBA>;
}

// ─── Image ───────────────────────────────────────────────────────────
export interface ImageCrop {
  left: number;   // 0..1
  top: number;
  right: number;
  bottom: number;
  offsets_emu?: BboxEmu;
}

export interface ImageMask {
  type: 'none' | 'rect' | 'rounded_rect' | 'custom_path';
  path_data?: string;
}

export interface ImageElementData {
  asset_ref: string;
  crop: ImageCrop;
  mask: ImageMask;
  sampling: SamplingMode;
  color_profile: 'sRGB';
  alpha_mode: AlphaMode;
  exif_orientation_applied: true; // MUST be true
}

// ─── Table ───────────────────────────────────────────────────────────
export interface CellSpec {
  r: number;
  c: number;
  merge?: { row_span: number; col_span: number };
  value: string | number | null;
  format?: string;
  style_ref?: string;
  inline_style?: CellStyle;
}

export interface CellStyle {
  fill?: FillSpec;
  borders?: {
    top?: StrokeSpec;
    right?: StrokeSpec;
    bottom?: StrokeSpec;
    left?: StrokeSpec;
  };
  font?: {
    family: string;
    size_emu: number;
    weight: number;
    color: ColorRGBA;
  };
  alignment?: TextAlignment;
  direction?: TextDirection;
}

export interface TableElementData {
  grid: {
    rows: number;
    cols: number;
    row_heights_emu: number[];
    col_widths_emu: number[];
  };
  cells: CellSpec[];
  style: {
    borders?: Record<string, StrokeSpec>;
    fills?: Record<string, FillSpec>;
    fonts?: Record<string, Partial<TextRun>>;
    alignments?: Record<string, TextAlignment>;
  };
  rtl: boolean;
  binding?: string; // table_id in CDR-Data
}

// ─── Chart ───────────────────────────────────────────────────────────
export interface ChartDataBinding {
  table_id: string;
  mappings: {
    x?: string;
    y?: string;
    series?: string;
    category?: string;
  };
  binding_kind: BindingKind;
}

export interface ChartInteraction {
  tooltip_fields: string[];
  drill_mapping?: Record<string, string>;
}

export interface ChartElementData {
  chart_kind: string;
  encoding: {
    axes?: Record<string, unknown>;
    legend?: Record<string, unknown>;
    ticks?: Record<string, unknown>;
    gridlines?: Record<string, unknown>;
  };
  style: {
    colors: ColorRGBA[];
    fonts: Record<string, Partial<TextRun>>;
  };
  data_binding: ChartDataBinding;
  interaction: ChartInteraction;
  rtl_axis_inverted: boolean;
}

// ─── Element (MUST) ──────────────────────────────────────────────────
export interface ElementConstraints {
  no_reflow: true; // MUST be true
  lock_aspect?: boolean;
  snap_baseline?: boolean;
}

export interface ElementRatios {
  padding_ratio: number;
  margin_ratio: number;
  whitespace_ratio: number;
}

export interface CdrElement {
  element_id: string;
  kind: ElementKind;
  bbox_emu: BboxEmu;
  transform_matrix: TransformMatrix;
  opacity: number; // 0..1
  z_index: number;
  clipping_overflow_rules?: string;
  constraints: ElementConstraints;
  ratios: ElementRatios;
  // Element-specific data (exactly one populated)
  text?: TextElementData;
  shape?: ShapeElementData;
  image?: ImageElementData;
  table?: TableElementData;
  chart?: ChartElementData;
  children?: CdrElement[]; // for group/container/clip_group
}

// ─── Layer (MUST) ────────────────────────────────────────────────────
export interface CdrLayer {
  layer_id: string;
  z_index: number;
  transform_matrix: TransformMatrix;
  opacity: number;
  blend_mode: BlendMode;
  elements: CdrElement[];
}

// ─── Page (MUST) ─────────────────────────────────────────────────────
export interface CdrPage {
  page_id: string;
  index: number; // 1..N
  size_emu: SizeEmu;
  background_spec?: FillSpec;
  layers: CdrLayer[];
}

// ─── Fingerprints ────────────────────────────────────────────────────
export interface CdrFingerprints {
  layout_hash: string;
  structural_hash: string;
  typography_hash: string;
  render_intent_hash: string;
}

// ─── CDR-Design Top-level (MUST) ─────────────────────────────────────
export interface CdrDesign {
  version: string;
  immutable_layout_lock_flag: true; // MUST be true
  conversion_policy_id?: string;
  dpi_reference?: number;
  pages: CdrPage[];
  assets: CdrAsset[];
  layout_graph: string; // serialized graph
  constraint_matrix: string; // serialized constraints
  fingerprints: CdrFingerprints;
}

export interface CdrAsset {
  asset_id: string;
  uri: string;
  mime: string;
  sha256: string;
  size_bytes: number;
  data?: Buffer;
}

// ─── CDR-Data (MUST) ─────────────────────────────────────────────────
export interface CdrDataColumn {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  stats?: Record<string, number>;
  fingerprint: string;
}

export interface CdrDataTable {
  table_id: string;
  columns: CdrDataColumn[];
  row_source_ref: string; // columnar store pointer
  rows?: Array<Record<string, unknown>>;
}

export interface CdrData {
  tables: CdrDataTable[];
  lineage_ref: string; // immutable
  semantic_model_ref?: string; // for dashboards/measures
}

// ─── Action Context ──────────────────────────────────────────────────
export interface ActionContext {
  workspace_id: string;
  user_id: string;
  locale: string;
  strict_visual: boolean;
  arabic_mode: ArabicMode;
  mode: 'AUTO' | 'GUIDED';
  font_policy: FontPolicy;
}

// ─── Refs (matching JSON Schema exactly) ─────────────────────────────
export interface AssetRef {
  asset_id: string;
  uri: string;
  mime: string;
  sha256: string;
  size_bytes: number;
  page_count?: number;
}

export interface PdfDomRef {
  pdf_dom_id: string;
}

export interface ImageSegRegion {
  region_id: string;
  kind: RegionKind;
  bbox: { x: number; y: number; w: number; h: number };
  mask_uri?: string;
  confidence?: number;
}

export interface ImageSegRef {
  seg_id: string;
  regions: ImageSegRegion[];
}

export interface CdrDesignRef {
  cdr_design_id: string;
  page_count: number;
}

export interface CdrDataRef {
  cdr_data_id: string;
  table_count: number;
}

export interface FontPlanEntry {
  family: string;
  status: FontStatus;
  font_program_uri?: string;
  embed_all_glyphs: boolean;
}

export interface FontPlan {
  fonts: FontPlanEntry[];
}

export interface ArtifactRef {
  artifact_id: string;
  kind: ArtifactKind;
  uri: string;
}

export interface RenderProfile {
  dpi: number;
  colorspace: 'sRGB';
  page_range?: { from: number; to: number };
}

export interface HashBundle {
  layout_hash: string;
  structural_hash: string;
  typography_hash: string;
  pixel_hash: string;
  perceptual_hash?: string;
}

export interface RenderRef {
  render_id: string;
  uri: string;
  dpi: number;
  colorspace: 'sRGB';
  engine_fingerprint: string;
  render_config_hash: string;
  fingerprint: HashBundle;
}

export interface DiffRef {
  diff_id: string;
  pixel_diff: number;
  pass: boolean;
  heatmap_uri?: string;
}

export interface DeterminismCheck {
  anti_aliasing_policy: 'locked';
  gpu_cpu_parity: 'validated' | 'forced_single_path';
  float_norm_policy: 'locked';
  random_seed_locked: boolean;
}

// ─── Warning ─────────────────────────────────────────────────────────
export interface Warning {
  code: string;
  message: string;
  severity: Severity;
}

// ─── Evidence Pack ───────────────────────────────────────────────────
export interface EvidencePack {
  run_id: string;
  timestamp: string;
  source_renders: RenderRef[];
  target_renders: RenderRef[];
  pixel_diff_reports: DiffRef[];
  structural_hashes: HashBundle[];
  determinism_report: {
    same_input_rerun_equals: boolean;
    checks: DeterminismCheck;
  };
  functional_tests_report: {
    dashboard_filters?: boolean;
    dashboard_drill?: boolean;
    dashboard_export?: boolean;
    excel_recalc?: boolean;
  };
  action_graph_snapshot: string;
  tool_versions: Record<string, string>;
  farm_image_id: string;
  font_snapshot_id: string;
  audit_log_entry_ids: string[];
}
