/**
 * RASID Platform - Dashboard Engine Interfaces
 *
 * Contracts for the 7 dashboard engines: chart, widget, filter, kpi, theme, export, realtime.
 */

import type { ChartType, WidgetPosition, WidgetDataBinding, WidgetStyleConfig, WidgetInteraction } from './dashboard-widgets';

// ─── Chart Engine ─────────────────────────────────────────────────────
export interface ChartRenderRequest {
  type: ChartType;
  data: {
    labels?: string[];
    datasets: Array<{
      label: string;
      data: number[] | Array<{ x: number; y: number }>;
      backgroundColor?: string | string[];
      borderColor?: string;
    }>;
  };
  config?: {
    width?: number;
    height?: number;
    title?: string;
    tension?: number;
    fill?: boolean;
    stacked?: boolean;
    trendLine?: boolean;
    doughnut?: boolean;
    cutout?: string;
    thresholds?: { warning: number; critical: number };
  };
}

export interface ChartRenderResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: 'png' | 'jpeg';
  chartType: ChartType;
}

// ─── Widget Engine ────────────────────────────────────────────────────
export interface WidgetCreateRequest {
  dashboardId: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  dataSource: WidgetDataBinding;
  layout: WidgetPosition;
}

export interface WidgetUpdateRequest {
  widgetId: string;
  title?: string;
  config?: Record<string, unknown>;
  dataSource?: WidgetDataBinding;
  layout?: WidgetPosition;
}

export interface WidgetDataResult {
  widgetId: string;
  data: unknown[];
  metadata: {
    totalRows: number;
    fetchedAt: Date;
    queryDurationMs: number;
  };
}

// ─── Filter Engine ────────────────────────────────────────────────────
export interface FilterCreateRequest {
  dashboardId: string;
  config: {
    type: 'date_range' | 'dropdown' | 'slider' | 'text';
    label: string;
    column: string;
    options?: string[];
  };
}

export interface FilterApplyRequest {
  dashboardId: string;
  filterId: string;
  value: unknown;
}

export interface FilterApplyResult {
  filterId: string;
  dashboardId: string;
  appliedValue: unknown;
  filterType: string;
  column: string;
  refreshedWidgets: Array<{
    widgetId: string;
    type: string;
    title: string;
    status: 'refreshed' | 'error' | 'no_dataset';
    filteredRowCount?: number;
    error?: string;
  }>;
  appliedAt: Date;
}

// ─── KPI Engine ───────────────────────────────────────────────────────
export interface KpiConfig {
  name: string;
  dataSource: {
    table: string;
    column: string;
    filterColumn?: string;
    filterValue?: string;
    dateColumn?: string;
    aggregation?: string;
  };
  formula: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'MEDIAN' | 'STDDEV' | 'GROWTH' | string;
  target: number;
  thresholds: {
    warning: number;
    critical: number;
  };
}

export interface KpiCalculationResult {
  kpiId: string;
  name: string;
  currentValue: number;
  previousValue: number;
  change: number;
  trend: 'up' | 'down' | 'stable';
  target: number;
  percentOfTarget: number;
  status: 'on_target' | 'warning' | 'critical' | 'below_critical';
  dataPoints: number;
  formula: string;
  calculatedAt: Date;
}

export interface KpiAlertConfig {
  kpiId: string;
  condition: 'above_target' | 'below_target' | 'critical' | 'warning' | 'any_change' | 'threshold_breach';
  recipients: string[];
}

// ─── Theme Engine ─────────────────────────────────────────────────────
export interface ThemeConfig {
  name: string;
  description: string;
  mode: 'light' | 'dark';
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    chartColors: string[];
    [key: string]: string | string[];
  };
  typography: {
    fontFamily: string;
    fontFamilyArabic: string;
    fontSize: Record<string, number>;
    fontWeight: Record<string, number>;
  };
  spacing: Record<string, number>;
  borderRadius: Record<string, number>;
  shadows: Record<string, string>;
  rtl: boolean;
  brandKit?: {
    logoUrl: string;
    companyName: string;
    brandColors: string[];
  };
}

export interface ThemePreviewResult {
  imageBuffer: Buffer;
  width: number;
  height: number;
  format: 'png';
}

// ─── Export Engine ─────────────────────────────────────────────────────
export interface ExportRequest {
  dashboardId: string;
  tenantId: string;
  format: 'pdf' | 'png' | 'pptx';
  options?: {
    width?: number;
    height?: number;
    quality?: number;
  };
}

export interface ExportResult {
  id: string;
  dashboardId: string;
  format: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  fileSize: number;
  exportedAt: Date;
  metadata: Record<string, unknown>;
}

export interface BatchExportRequest {
  dashboardIds: string[];
  tenantId: string;
  format: 'pdf' | 'png' | 'pptx';
}

// ─── Realtime Engine ──────────────────────────────────────────────────
export interface RealtimeStreamConfig {
  id: string;
  dashboardId: string;
  widgetId: string;
  dataSourceId: string;
  refreshInterval: number;
  query: string;
  aggregation?: {
    type: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'last' | 'first';
    field: string;
    groupBy?: string;
    timeWindow?: number;
  };
  filters: Array<{
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'between';
    value: unknown;
  }>;
  maxDataPoints: number;
  enabled: boolean;
}

export interface RealtimeDataUpdate {
  streamId: string;
  widgetId: string;
  dashboardId: string;
  data: Record<string, unknown>[];
  timestamp: Date;
  metadata: {
    rowCount: number;
    queryTime: number;
    cached: boolean;
  };
}

export interface RealtimeConnectionMetrics {
  totalConnections: number;
  activeDashboards: number;
  activeStreams: number;
  messagesPerSecond: number;
  averageLatency: number;
  peakConnections: number;
}
