/**
 * RASID Platform - Dashboard Widget Types
 *
 * Type definitions for dashboard widgets, layouts, data bindings, and interactions.
 */

// ─── Widget Types ─────────────────────────────────────────────────────
export type WidgetType =
  | 'chart'
  | 'table'
  | 'metric_card'
  | 'map'
  | 'text'
  | 'image'
  | 'filter'
  | 'kpi'
  | 'gauge'
  | 'heatmap'
  | 'treemap';

export type ChartType =
  | 'bar'
  | 'line'
  | 'pie'
  | 'doughnut'
  | 'area'
  | 'radar'
  | 'scatter'
  | 'gauge'
  | 'waterfall'
  | 'combined'
  | 'heatmap'
  | 'treemap'
  | 'bubble'
  | 'polarArea';

// ─── Widget Position & Layout ─────────────────────────────────────────
export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface GridConfig {
  columns: number;
  rowHeight: number;
  gap: number;
  breakpoints: {
    lg: number;
    md: number;
    sm: number;
    xs: number;
  };
  compactType: 'vertical' | 'horizontal' | 'none';
  preventCollision: boolean;
  maxRows: number;
}

// ─── Data Binding ─────────────────────────────────────────────────────
export interface WidgetDataBinding {
  type: 'query' | 'dataset' | 'api' | 'static' | 'realtime';
  datasetId?: string;
  query?: string;
  apiUrl?: string;
  staticData?: unknown[];
  streamId?: string;
  mapping: {
    xColumn?: string;
    yColumn?: string;
    labelColumn?: string;
    valueColumn?: string;
    groupByColumn?: string;
  };
  filters?: Record<string, unknown>;
  refreshInterval?: number;
}

// ─── Widget Style Config ──────────────────────────────────────────────
export interface WidgetStyleConfig {
  colors: string[];
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  shadow?: string;
  padding?: { top: number; right: number; bottom: number; left: number };
  opacity?: number;
  animation?: boolean;
  fontFamily?: string;
  fontSize?: number;
}

// ─── Widget Interaction ───────────────────────────────────────────────
export interface WidgetInteraction {
  sourceWidgetId: string;
  targetWidgetId: string;
  interactionType: 'filter' | 'drill_down' | 'highlight' | 'navigate';
  sourceField: string;
  targetField: string;
  config?: Record<string, unknown>;
}

// ─── Chart Configuration ──────────────────────────────────────────────
export interface ChartConfig {
  chartType: ChartType;
  title?: string;
  xAxis?: AxisConfig;
  yAxis?: AxisConfig;
  legend?: {
    show: boolean;
    position: 'top' | 'bottom' | 'left' | 'right';
  };
  tooltip?: { enabled: boolean };
  stacked?: boolean;
  animated?: boolean;
  responsive?: boolean;
}

export interface AxisConfig {
  field: string;
  label?: string;
  format?: string;
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  beginAtZero?: boolean;
  grid?: boolean;
}

// ─── Series Configuration ─────────────────────────────────────────────
export interface SeriesConfig {
  field: string;
  label: string;
  color?: string;
  type?: ChartType;
  yAxisId?: string;
}

// ─── Widget Complete Config ───────────────────────────────────────────
export interface WidgetConfig {
  id: string;
  dashboardId: string;
  type: WidgetType;
  title: string;
  chart?: ChartConfig;
  style?: WidgetStyleConfig;
  dataBinding?: WidgetDataBinding;
  position: WidgetPosition;
  interactions?: WidgetInteraction[];
  refreshInterval?: number;
  visible?: boolean;
  locked?: boolean;
}

// ─── Metric Card Config ───────────────────────────────────────────────
export interface MetricCardConfig {
  metricField: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'last';
  label: string;
  prefix?: string;
  suffix?: string;
  format?: string;
  comparisonField?: string;
  comparisonType?: 'previous_period' | 'target' | 'custom';
  thresholds?: Array<{ value: number; color: string; label: string }>;
  icon?: string;
  sparkline?: boolean;
}

// ─── Table Config ─────────────────────────────────────────────────────
export interface TableColumnConfig {
  field: string;
  header: string;
  width?: number;
  sortable?: boolean;
  filterable?: boolean;
  format?: string;
  alignment?: 'left' | 'center' | 'right';
}

export interface TableConfig {
  columns: TableColumnConfig[];
  pagination?: { enabled: boolean; pageSize: number };
  striped?: boolean;
  bordered?: boolean;
}

// ─── Filter Widget Config ─────────────────────────────────────────────
export interface FilterWidgetConfig {
  filterType: 'dropdown' | 'date_range' | 'slider' | 'text_search' | 'checkbox' | 'radio';
  targetField: string;
  label: string;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: unknown }>;
  multiSelect?: boolean;
  affectedWidgets?: string[];
}
