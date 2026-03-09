declare module '@rasid/shared' {
  export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface Position {
    x?: number;
    y?: number;
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  }

  export type LayoutNodeType =
    | 'root'
    | 'page'
    | 'header'
    | 'footer'
    | 'section'
    | 'paragraph'
    | 'text'
    | 'table'
    | 'chart'
    | 'image'
    | 'kpi'
    | 'kpi-card'
    | 'list'
    | 'title'
    | 'subtitle'
    | 'caption'
    | 'sidebar'
    | 'card'
    | 'grid'
    | 'heading'
    | 'label'
    | 'filter'
    | 'unknown'
    | string;

  export interface NodeStyle {
    backgroundColor?: string | null;
    backgroundGradient?: Record<string, unknown> | null;
    border?: Record<string, unknown> | string | null;
    borderColor?: string | null;
    borderWidth?: number | null;
    borderRadius?: number | null;
    padding?: { top: number; right: number; bottom: number; left: number } | Position | null;
    margin?: { top: number; right: number; bottom: number; left: number } | Position | null;
    opacity?: number;
    shadow?: Record<string, unknown> | string | null;
    fontFamily?: string | null;
    fontSize?: number | null;
    fontWeight?: number | null;
    fontColor?: string | null;
    textAlign?: string | null;
    lineHeight?: number | null;
    overflow?: string;
    display?: string;
    flexDirection?: string | null;
    alignItems?: string | null;
    justifyContent?: string | null;
    gridTemplate?: Record<string, unknown> | string | null;
    [key: string]: unknown;
  }

  export interface TextContent {
    text: string;
    language?: string;
    direction?: 'ltr' | 'rtl' | string;
    alignment?: string;
    formattedSegments?: Array<{
      text: string;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      fontSize?: number;
      fontColor?: string;
    }>;
    [key: string]: unknown;
  }

  export interface TableContent {
    headers: (string | Record<string, unknown>)[];
    rows: (string | number | boolean | null | Record<string, unknown>)[][];
    columnTypes?: string[];
    hasHeader?: boolean;
    mergedCells?: Record<string, unknown>[];
    [key: string]: unknown;
  }

  export interface ChartContent {
    chartType: string;
    title?: string;
    xAxis?: {
      label: string;
      type: string;
      min: number | null;
      max: number | null;
      tickCount: number;
      tickValues: string[];
      format: string | null;
      rotation: number;
    } | null;
    yAxis?: {
      label: string;
      type: string;
      min: number | null;
      max: number | null;
      tickCount: number;
      tickValues: string[];
      format: string | null;
      rotation: number;
    } | null;
    series: Array<{
      name: string;
      data: Array<{ label: string; value: number }>;
      type: string;
      color: string;
      stacked: boolean;
    }>;
    legend?: { position: string; items: string[] } | null;
    [key: string]: unknown;
  }

  export interface ImageContent {
    src?: string;
    alt?: string;
    caption?: string;
    naturalWidth?: number;
    naturalHeight?: number;
    kind?: string;
    [key: string]: unknown;
  }

  export interface KpiContent {
    label: string;
    value: string | number;
    unit?: string;
    trend?: 'up' | 'down' | 'stable' | 'neutral' | string;
    changePercent?: number;
    target?: number;
    format?: string;
    [key: string]: unknown;
  }

  export interface EmptyContent {
    kind?: string;
    [key: string]: unknown;
  }

  export interface LayoutNode {
    id: string;
    type: LayoutNodeType;
    label?: string;
    boundingBox?: BoundingBox;
    bbox?: BoundingBox;
    parentId?: string | null;
    style: NodeStyle;
    content: TextContent | TableContent | ChartContent | ImageContent | KpiContent | EmptyContent | unknown;
    children: LayoutNode[];
    readingOrder?: number;
    confidence: number;
    zIndex?: number;
    [key: string]: unknown;
  }

  export interface PageNode {
    id?: string;
    pageNumber: number;
    width?: number;
    height?: number;
    dimensions?: { width: number; height: number };
    direction?: 'ltr' | 'rtl' | 'auto' | string;
    rootNode: LayoutNode;
    readingOrder: string[];
    [key: string]: unknown;
  }

  export interface CanonicalLayoutGraph {
    id: string;
    sourceType: string;
    sourceId?: string;
    pages: PageNode[];
    metadata: DocumentMetadata;
    designTokens: DesignTokens;
    sceneGraph: SceneGraph;
    processingTimeMs: number;
    createdAt: Date | string;
    [key: string]: unknown;
  }

  export interface DocumentMetadata {
    title?: string | null;
    language?: string;
    direction?: 'ltr' | 'rtl' | 'auto' | string;
    documentType?: string;
    pageCount: number;
    wordCount: number;
    tableCount: number;
    chartCount: number;
    imageCount: number;
    confidence: number;
    [key: string]: unknown;
  }

  export interface ColorToken {
    id: string;
    name: string;
    hex: string;
    rgba: { r: number; g: number; b: number; a: number };
    usage: string;
    frequency: number;
  }

  export interface FontToken {
    id: string;
    family: string;
    size: number;
    weight: number;
    style: 'normal' | 'italic' | string;
    lineHeight: number;
    letterSpacing: number;
    kerning: number;
    usage: string;
    confidence: number;
    fallbackFamilies: string[];
  }

  export interface SpacingToken {
    id: string;
    name?: string;
    value: number;
    unit: 'px' | 'rem' | 'em' | '%' | string;
    usage: string;
    direction?: string;
    [key: string]: unknown;
  }

  export interface DesignTokens {
    colors: ColorToken[];
    fonts: FontToken[];
    spacing: SpacingToken[];
    gradients: Array<{
      id: string;
      type: 'linear' | 'radial' | string;
      stops: Array<{ color: string; position: number }>;
      angle?: number;
    }>;
    borders: Record<string, unknown>[];
    shadows: Record<string, unknown>[];
    [key: string]: unknown;
  }

  export interface SceneLayer {
    id: string;
    name: string;
    nodeIds: string[];
    zIndex: number;
    visible: boolean;
    locked?: boolean;
    opacity?: number;
    [key: string]: unknown;
  }

  export interface SceneRelationship {
    sourceId: string;
    targetId: string;
    type: string;
    metadata?: Record<string, unknown>;
  }

  export interface SceneGraph {
    layers: SceneLayer[];
    relationships: SceneRelationship[];
    readingOrder?: string[];
    [key: string]: unknown;
  }

  export interface DetectedFont {
    family: string;
    size: number;
    weight: number;
    style: 'normal' | 'italic' | string;
    lineHeight: number;
    letterSpacing: number;
    confidence: number;
    sampleText: string;
    alternatives: Array<{ family: string; confidence?: number; similarity?: number }>;
    boundingBox?: BoundingBox;
    bbox?: BoundingBox;
    isArabic?: boolean;
    openTypeFeatures?: string[];
    [key: string]: unknown;
  }

  export interface TypographyLevel {
    level?: number;
    role: string;
    font: DetectedFont;
    frequency?: number;
    count?: number;
    averageLineLength?: number;
    [key: string]: unknown;
  }

  export interface FontRecognitionResult {
    detectedFonts: DetectedFont[];
    typographyHierarchy: TypographyLevel[];
    dominantFamily?: string;
    isConsistent?: boolean;
    recommendations?: string[];
    confidence?: number;
    [key: string]: unknown;
  }
}
