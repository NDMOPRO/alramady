declare module '@rasid/shared' {
  export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface FontToken {
    family: string;
    size: number;
    weight: number;
    style: 'normal' | 'italic';
    color: string;
    lineHeight: number;
    letterSpacing: number;
    kerning?: number;
    [key: string]: unknown;
  }

  export interface BorderStyle {
    width: number;
    style: string;
    color: string;
    radius: number;
  }

  export interface ShadowStyle {
    inset: boolean;
    offsetX: number;
    offsetY: number;
    blur: number;
    spread: number;
    color: string;
  }

  export interface GradientStop {
    color: string;
    position: number;
  }

  export interface BackgroundGradient {
    type: 'linear' | 'radial';
    angle: number;
    stops: GradientStop[];
  }

  export interface NodeStyle {
    backgroundColor: string | null;
    backgroundGradient: BackgroundGradient | null;
    border: BorderStyle | null;
    shadow: ShadowStyle | null;
    opacity: number;
    borderRadius: number;
    padding: { top: number; left: number; right: number; bottom: number };
    margin: { top: number; left: number; right: number; bottom: number };
    overflow?: 'hidden' | 'visible' | 'scroll';
    display?: 'block' | 'flex' | 'grid' | 'inline';
    flexDirection?: string | null;
    alignItems?: string | null;
    justifyContent?: string | null;
    gridTemplate?: string | null;
    font?: FontToken;
    borderColor?: string;
    borderWidth?: number;
    direction?: 'ltr' | 'rtl';
    alignment?: 'left' | 'center' | 'right' | 'justify';
    [key: string]: unknown;
  }

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
    isArabic?: boolean;
    [key: string]: unknown;
  }

  export interface TableCell {
    value: string;
    type: string;
    font: FontToken | null;
    color: string | null;
    backgroundColor: string | null;
    alignment: 'left' | 'center' | 'right';
    verticalAlignment: 'top' | 'middle' | 'bottom';
    colSpan: number;
    rowSpan: number;
  }

  export interface TableContent {
    kind: 'table';
    headers: TableCell[];
    rows: TableCell[][];
    mergedCells: unknown[];
    headerRows: number;
    headerColumns: number;
    columnWidths: number[];
    rowHeights: number[];
    borderStyle: 'full' | 'horizontal' | 'minimal' | 'none';
    alternateRowColor: string | null;
    headerStyle: { backgroundColor: string; font: FontToken; color: string };
  }

  export interface ChartSeries {
    name: string;
    data: Array<{ label: string; value: number }>;
    color: string;
    type?: string;
    stacked?: boolean;
    [key: string]: unknown;
  }

  export interface ChartLegend {
    items: Array<{ label: string; color: string }>;
    [key: string]: unknown;
  }

  export interface ChartContent {
    kind: 'chart';
    chartType: string;
    title: string;
    subtitle: string | null;
    xAxis: unknown;
    yAxis: unknown;
    series: ChartSeries[];
    legend: ChartLegend | null;
    colors: string[];
    dataLabels: boolean;
    gridLines: boolean;
    [key: string]: unknown;
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

  export interface EmptyContent {
    kind: 'empty';
  }

  export type NodeContent = TextContent | ImageContent | IconContent | EmptyContent | TableContent | ChartContent | KpiContent;

  export interface LayoutNode {
    id: string;
    type: string;
    kind?: string;
    bbox: BoundingBox;
    zIndex: number;
    confidence: number;
    children: LayoutNode[];
    parentId: string | null;
    style: NodeStyle;
    content: NodeContent;
    semanticRole: string;
    readingOrder: number;
    position?: { x: number; y: number; z: number };
    metadata?: Record<string, string>;
    [key: string]: unknown;
  }

  export interface PageNode {
    pageNumber: number;
    dimensions: { width: number; height: number };
    orientation: 'portrait' | 'landscape';
    backgroundColor: string;
    rootNode: LayoutNode;
    readingOrder: string[];
    id?: string;
    width?: number;
    height?: number;
    nodes?: LayoutNode[];
    background?: string;
  }

  export interface ColorToken {
    hex: string;
    usage: string;
    [key: string]: unknown;
  }

  export interface FontTokenEntry {
    family: string;
    size: number;
    weight: number;
    style: string;
    [key: string]: unknown;
  }

  export interface SpacingToken {
    value: number;
    usage: string;
    direction: string;
    [key: string]: unknown;
  }

  export interface DesignTokens {
    colors: ColorToken[];
    fonts: FontTokenEntry[];
    spacing: SpacingToken[];
    borders: unknown[];
    shadows: unknown[];
    gradients?: unknown[];
    [key: string]: unknown;
  }

  export interface DocumentMetadata {
    title: string | null;
    author?: string;
    createdAt?: string;
    pageCount: number;
    language: string;
    direction: 'ltr' | 'rtl';
    documentType?: string;
    wordCount?: number;
    tableCount?: number;
    chartCount?: number;
    imageCount?: number;
    confidence?: number;
    [key: string]: unknown;
  }

  export interface CanonicalLayoutGraph {
    id: string;
    version: string;
    sourceType: string;
    sourceHash: string;
    dimensions: { width: number; height: number };
    dpi: number;
    pages: PageNode[];
    metadata: DocumentMetadata;
    designTokens: DesignTokens;
    statistics?: {
      totalNodes: number;
      textCount: number;
      tableCount: number;
      chartCount: number;
      imageCount: number;
      confidence: number;
    };
    sceneGraph?: {
      layers: unknown[];
      relationships: unknown[];
    };
    createdAt?: string;
    processingTimeMs?: number;
    [key: string]: unknown;
  }

  export interface DetectedFont {
    family: string;
    size: number;
    weight: number;
    style: string;
    color?: string;
    lineHeight: number;
    letterSpacing: number;
    confidence: number;
    sampleText: string;
    bbox: BoundingBox;
    alternatives?: Array<{ family: string; similarity: number }>;
    isArabic?: boolean;
    openTypeFeatures?: string[];
    [key: string]: unknown;
  }

  export interface FontRecognitionResult {
    fonts: DetectedFont[];
    dominantFont: DetectedFont | null;
    fontCount: number;
    confidence: number;
    typographyHierarchy?: TypographyLevel[];
    [key: string]: unknown;
  }

  export interface TypographyLevel {
    role: string;
    font: DetectedFont;
    count: number;
    averageLineLength: number;
    level?: number;
    name?: string;
    fontSize?: number;
    fontWeight?: number;
    lineHeight?: number;
    letterSpacing?: number;
    color?: string;
    textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  }

  export interface PixelValidationResult {
    pixelDiff: number;
    totalPixels: number;
    diffPercentage: number;
    ssim: number;
    lpips: number;
    hotspots: ValidationHotspot[];
    iterationCount: number;
    convergenceHistory: number[];
    [key: string]: unknown;
  }

  export interface ValidationHotspot {
    region: BoundingBox;
    severity: 'critical' | 'warning' | 'minor';
    pixelDiff: number;
    description: string;
  }

  export interface QualityMetrics {
    overallScore: number;
    pixelAccuracy?: number;
    structuralSimilarity?: number;
    colorAccuracy?: number;
    textFidelity?: number;
    layoutAccuracy?: number;
    cer?: number;
    wer?: number;
    bleu?: number;
    comet?: number;
    bertScore?: number;
    layoutFidelity?: number;
    fontAccuracy?: number;
    spacingAccuracy?: number;
    issues?: QualityIssue[];
    [key: string]: unknown;
  }

  export interface QualityIssue {
    type: string;
    severity: 'critical' | 'major' | 'minor' | 'warning' | 'info';
    description: string;
    location: BoundingBox | null;
    suggestion: string;
    score?: number;
    [key: string]: unknown;
  }

  export interface LocalizationResult {
    localizedGraph: CanonicalLayoutGraph;
    translatedCount: number;
    [key: string]: unknown;
  }

  export type ReplicationJobStatus = string;
}
