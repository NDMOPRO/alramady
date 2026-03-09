declare module '@rasid/shared' {
  export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface Position {
    top: number;
    right: number;
    bottom: number;
    left: number;
  }

  export interface FontToken {
    family: string;
    size: number;
    weight: number;
    style: 'normal' | 'italic';
    lineHeight: number;
    letterSpacing: number;
  }

  export interface BorderToken {
    width: number;
    style: 'solid' | 'dashed' | 'dotted' | 'none';
    color: string;
  }

  export interface ShadowToken {
    offsetX: number;
    offsetY: number;
    blur: number;
    spread: number;
    color: string;
  }

  export interface GradientToken {
    type: 'linear' | 'radial' | 'conic';
    angle: number;
    stops: { color: string; position: number }[];
  }

  export type LayoutNodeType =
    | 'page' | 'container' | 'section' | 'column' | 'row'
    | 'paragraph' | 'heading' | 'table' | 'chart' | 'image'
    | 'icon' | 'kpi-card' | 'widget' | 'filter' | 'text-block'
    | 'list' | 'divider' | 'shape' | 'logo' | 'footer'
    | 'header' | 'sidebar' | 'navigation' | 'unknown';

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
    chartType: string;
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

  export interface CanonicalLayoutGraph {
    id: string;
    version: string;
    sourceType: 'image' | 'pdf' | 'html' | 'docx' | 'pptx' | 'xlsx' | 'screenshot';
    sourceHash: string;
    dimensions: { width: number; height: number };
    dpi: number;
    pages: PageNode[];
    designTokens: Record<string, unknown>;
    metadata: Record<string, unknown>;
    sceneGraph: Record<string, unknown>;
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
}
