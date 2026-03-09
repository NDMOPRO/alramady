/**
 * RASID Platform - Canonical Intermediate Representation (IR)
 *
 * Universal document representation used across all engines for
 * layout intelligence, pixel-perfect reconstruction, and document understanding.
 */

// ---------------------------------------------------------------------------
// Bounding Box & Position
// ---------------------------------------------------------------------------

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Position {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

// ---------------------------------------------------------------------------
// Design Tokens
// ---------------------------------------------------------------------------

export interface DesignTokens {
  colors: ColorToken[];
  fonts: FontToken[];
  spacing: SpacingToken[];
  borders: BorderToken[];
  shadows: ShadowToken[];
  gradients: GradientToken[];
}

export interface ColorToken {
  id: string;
  name: string;
  hex: string;
  rgba: { r: number; g: number; b: number; a: number };
  usage: 'background' | 'text' | 'border' | 'accent' | 'chart' | 'icon';
  frequency: number;
}

export interface FontToken {
  id: string;
  family: string;
  size: number;
  weight: number;
  style: 'normal' | 'italic' | 'oblique';
  lineHeight: number;
  letterSpacing: number;
  kerning: number;
  usage: 'heading' | 'subheading' | 'body' | 'caption' | 'label' | 'data';
  confidence: number;
  fallbackFamilies: string[];
}

export interface SpacingToken {
  id: string;
  value: number;
  unit: 'px' | 'pt' | 'em' | 'rem' | '%';
  direction: 'horizontal' | 'vertical' | 'all';
  usage: 'margin' | 'padding' | 'gap' | 'indent';
}

export interface BorderToken {
  id: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
  color: string;
  radius: number;
}

export interface ShadowToken {
  id: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
  inset: boolean;
}

export interface GradientToken {
  id: string;
  type: 'linear' | 'radial' | 'conic';
  angle: number;
  stops: { color: string; position: number }[];
}

// ---------------------------------------------------------------------------
// Layout Graph Nodes
// ---------------------------------------------------------------------------

export type LayoutNodeType =
  | 'page'
  | 'container'
  | 'section'
  | 'column'
  | 'row'
  | 'paragraph'
  | 'heading'
  | 'table'
  | 'chart'
  | 'image'
  | 'icon'
  | 'kpi-card'
  | 'widget'
  | 'filter'
  | 'text-block'
  | 'list'
  | 'divider'
  | 'shape'
  | 'logo'
  | 'footer'
  | 'header'
  | 'sidebar'
  | 'navigation'
  | 'unknown';

export interface LayoutNode {
  id: string;
  type: LayoutNodeType;
  bbox: BoundingBox;
  zIndex: number;
  confidence: number;
  children: LayoutNode[];
  parentId: string | null;
  style: NodeStyle;
  content: NodeContent;
  semanticRole: string;
  readingOrder: number;
}

export interface NodeStyle {
  backgroundColor: string | null;
  backgroundGradient: GradientToken | null;
  border: BorderToken | null;
  shadow: ShadowToken | null;
  opacity: number;
  borderRadius: number;
  padding: Position;
  margin: Position;
  overflow: 'visible' | 'hidden' | 'scroll';
  display: 'block' | 'flex' | 'grid' | 'inline' | 'none';
  flexDirection: 'row' | 'column' | null;
  alignItems: 'start' | 'center' | 'end' | 'stretch' | null;
  justifyContent: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | null;
  gridTemplate: string | null;
}

// ---------------------------------------------------------------------------
// Node Content Variants
// ---------------------------------------------------------------------------

export type NodeContent =
  | TextContent
  | TableContent
  | ChartContent
  | ImageContent
  | IconContent
  | KpiContent
  | WidgetContent
  | FilterContent
  | EmptyContent;

export interface TextContent {
  kind: 'text';
  text: string;
  language: string;
  direction: 'ltr' | 'rtl' | 'auto';
  font: FontToken;
  color: string;
  alignment: 'left' | 'center' | 'right' | 'justify';
  textDecoration: 'none' | 'underline' | 'strikethrough';
  listType: 'none' | 'bullet' | 'numbered';
  listLevel: number;
}

export interface TableContent {
  kind: 'table';
  headers: TableCell[];
  rows: TableCell[][];
  mergedCells: MergedCell[];
  headerRows: number;
  headerColumns: number;
  columnWidths: number[];
  rowHeights: number[];
  borderStyle: 'full' | 'horizontal' | 'minimal' | 'none';
  alternateRowColor: string | null;
  headerStyle: {
    backgroundColor: string;
    font: FontToken;
    color: string;
  };
}

export interface TableCell {
  value: string;
  type: 'text' | 'number' | 'date' | 'currency' | 'percentage' | 'formula';
  font: FontToken | null;
  color: string | null;
  backgroundColor: string | null;
  alignment: 'left' | 'center' | 'right';
  verticalAlignment: 'top' | 'middle' | 'bottom';
  colSpan: number;
  rowSpan: number;
}

export interface MergedCell {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface ChartContent {
  kind: 'chart';
  chartType: 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter' | 'area' | 'radar' | 'gauge' | 'waterfall' | 'treemap' | 'heatmap' | 'funnel' | 'combo';
  title: string;
  subtitle: string | null;
  xAxis: AxisConfig | null;
  yAxis: AxisConfig | null;
  series: ChartSeries[];
  legend: LegendConfig | null;
  colors: string[];
  dataLabels: boolean;
  gridLines: boolean;
}

export interface AxisConfig {
  label: string;
  type: 'category' | 'value' | 'time';
  min: number | null;
  max: number | null;
  tickCount: number;
  tickValues: string[];
  format: string | null;
  rotation: number;
}

export interface ChartSeries {
  name: string;
  data: Array<{ label: string; value: number; category?: string }>;
  type: string;
  color: string;
  stacked: boolean;
}

export interface LegendConfig {
  position: 'top' | 'bottom' | 'left' | 'right';
  items: Array<{ label: string; color: string }>;
}

export interface ImageContent {
  kind: 'image';
  src: string;
  alt: string;
  objectFit: 'cover' | 'contain' | 'fill' | 'none';
  naturalWidth: number;
  naturalHeight: number;
  format: 'png' | 'jpeg' | 'svg' | 'webp' | 'gif';
  isVector: boolean;
  vectorData: string | null;
}

export interface IconContent {
  kind: 'icon';
  name: string;
  svgData: string;
  color: string;
  size: number;
  library: string;
}

export interface KpiContent {
  kind: 'kpi';
  label: string;
  value: string;
  unit: string;
  trend: 'up' | 'down' | 'neutral';
  trendValue: string;
  trendColor: string;
  icon: string | null;
  sparkline: number[] | null;
}

export interface WidgetContent {
  kind: 'widget';
  widgetType: string;
  config: Record<string, unknown>;
  dataSource: string | null;
}

export interface FilterContent {
  kind: 'filter';
  filterType: 'dropdown' | 'daterange' | 'search' | 'checkbox' | 'slider' | 'toggle';
  label: string;
  options: string[];
  selectedValue: string | null;
}

export interface EmptyContent {
  kind: 'empty';
}

// ---------------------------------------------------------------------------
// Canonical Layout Graph (top-level document IR)
// ---------------------------------------------------------------------------

export interface CanonicalLayoutGraph {
  id: string;
  version: string;
  sourceType: 'image' | 'pdf' | 'html' | 'docx' | 'pptx' | 'xlsx' | 'screenshot';
  sourceHash: string;
  dimensions: { width: number; height: number };
  dpi: number;
  pages: PageNode[];
  designTokens: DesignTokens;
  metadata: DocumentMetadata;
  sceneGraph: SceneGraph;
  createdAt: string;
  processingTimeMs: number;
}

export interface PageNode {
  pageNumber: number;
  dimensions: { width: number; height: number };
  orientation: 'portrait' | 'landscape';
  backgroundColor: string;
  rootNode: LayoutNode;
  readingOrder: string[];
}

export interface DocumentMetadata {
  title: string | null;
  language: string;
  direction: 'ltr' | 'rtl';
  documentType: 'report' | 'dashboard' | 'presentation' | 'spreadsheet' | 'form' | 'invoice' | 'letter' | 'article' | 'unknown';
  pageCount: number;
  wordCount: number;
  tableCount: number;
  chartCount: number;
  imageCount: number;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Scene Graph (hierarchical visual structure)
// ---------------------------------------------------------------------------

export interface SceneGraph {
  layers: SceneLayer[];
  relationships: SceneRelationship[];
}

export interface SceneLayer {
  id: string;
  name: string;
  zIndex: number;
  visible: boolean;
  opacity: number;
  nodeIds: string[];
}

export interface SceneRelationship {
  sourceId: string;
  targetId: string;
  type: 'contains' | 'adjacent-horizontal' | 'adjacent-vertical' | 'overlaps' | 'labels' | 'data-bound';
}

// ---------------------------------------------------------------------------
// Pixel Validation Types
// ---------------------------------------------------------------------------

export interface PixelValidationResult {
  pixelDiff: number;
  totalPixels: number;
  diffPercentage: number;
  ssim: number;
  lpips: number;
  isPerfect: boolean;
  hotspots: ValidationHotspot[];
  diffImagePath: string | null;
  iterationCount: number;
  convergenceHistory: number[];
}

export interface ValidationHotspot {
  region: BoundingBox;
  severity: 'critical' | 'warning' | 'minor';
  pixelDiff: number;
  description: string;
}

export interface DiagnosticReport {
  status: 'PIXEL_PERFECT' | 'CONVERGENCE_PLATEAU' | 'MAX_ITERATIONS_EXHAUSTED';
  pixelDiff: number;
  totalPixels: number;
  ssim: number;
  iterationCount: number;
  convergenceHistory: number[];
  missingFonts: string[];
  unavailableAssets: string[];
  renderingInconsistencies: string[];
  unsupportedFeatures: string[];
}

// ---------------------------------------------------------------------------
// Font Recognition Types
// ---------------------------------------------------------------------------

export interface FontRecognitionResult {
  detectedFonts: DetectedFont[];
  typographyHierarchy: TypographyLevel[];
  confidence: number;
}

export interface DetectedFont {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  size: number;
  lineHeight: number;
  letterSpacing: number;
  confidence: number;
  sampleText: string;
  bbox: BoundingBox;
  alternatives: Array<{ family: string; similarity: number }>;
  isArabic: boolean;
  openTypeFeatures: string[];
}

export interface TypographyLevel {
  role: 'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'caption' | 'label' | 'data';
  font: DetectedFont;
  count: number;
  averageLineLength: number;
}

// ---------------------------------------------------------------------------
// Localization Types
// ---------------------------------------------------------------------------

export interface LocalizationMetadata {
  sourceLanguage: string;
  targetLanguage: string;
  translationMethod: 'ai' | 'memory' | 'terminology' | 'hybrid';
  qualityScore: number;
  layoutPreservation: number;
  terminologyConsistency: number;
}

export interface AssetIntegrityRecord {
  nodeId: string;
  assetType: 'image' | 'icon' | 'vector';
  sha256: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Quality Metrics
// ---------------------------------------------------------------------------

export interface QualityMetrics {
  cer: number;
  wer: number;
  bleu: number;
  comet: number;
  bertScore: number;
  layoutFidelity: number;
  colorAccuracy: number;
  fontAccuracy: number;
  spacingAccuracy: number;
  overallScore: number;
  issues: QualityIssue[];
}

export interface QualityIssue {
  type: 'missing_text' | 'ocr_error' | 'translation_inconsistency' | 'layout_overflow' | 'alignment_issue' | 'font_mismatch' | 'color_mismatch' | 'spacing_error';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  location: BoundingBox | null;
  suggestion: string;
}
