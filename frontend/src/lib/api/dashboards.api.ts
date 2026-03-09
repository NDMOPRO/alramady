import { api } from '@/lib/api';

// --- Interfaces ---

export interface DashboardSummary {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  widgetCount: number;
}

export interface Widget {
  id: string;
  type: 'chart' | 'kpi' | 'table' | 'map' | 'text';
  title: string;
  config: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
  dataSourceId: string;
}

export interface Dashboard {
  id: string;
  title: string;
  description: string;
  widgets: Widget[];
  layout: Record<string, unknown>;
  filters: DashboardFilter[];
  createdAt: string;
  updatedAt: string;
}

export interface DashboardFilter {
  id: string;
  field: string;
  operator: string;
  value: unknown;
}

export interface CreateDashboardInput {
  title: string;
  description?: string;
}

export interface UpdateDashboardInput {
  title?: string;
  description?: string;
  layout?: Record<string, unknown>;
  filters?: DashboardFilter[];
}

export interface CreateWidgetInput {
  type: Widget['type'];
  title: string;
  config: Record<string, unknown>;
  position: Widget['position'];
  dataSourceId: string;
}

export interface UpdateWidgetInput {
  title?: string;
  config?: Record<string, unknown>;
  position?: Partial<Widget['position']>;
}

export interface WidgetDataQuery {
  dataSourceId: string;
  aggregation?: string;
  groupBy?: string[];
  filters?: DashboardFilter[];
  limit?: number;
}

export interface WidgetDataResult {
  rows: Record<string, unknown>[];
  columns: string[];
  totalRows: number;
}

export interface DashboardExportOptions {
  format: 'pdf' | 'png' | 'html';
  includeFilters?: boolean;
}

export interface ExportResult {
  url: string;
  expiresAt: string;
}

export interface TvModeOptions {
  rotationIntervalSeconds?: number;
  widgetIds?: string[];
  fullscreen?: boolean;
}

export interface TvModeSession {
  sessionId: string;
  url: string;
  expiresAt: string;
}

export interface PublishLinkOptions {
  expiresInHours?: number;
  password?: string;
  allowedDomains?: string[];
}

export interface PublishLinkResult {
  publicUrl: string;
  expiresAt: string;
  isPasswordProtected: boolean;
}

interface ApiSuccess<T> {
  success: boolean;
  data: T;
}

interface ApiOk {
  success: boolean;
}

// --- API ---

export const dashboardsApi = {
  // Dashboard CRUD
  list: () =>
    api.get<ApiSuccess<DashboardSummary[]>>('/api/v1/dashboards'),

  get: (id: string) =>
    api.get<ApiSuccess<Dashboard>>(`/api/v1/dashboards/${id}`),

  create: (input: CreateDashboardInput) =>
    api.post<ApiSuccess<Dashboard>>('/api/v1/dashboards', input),

  update: (id: string, input: UpdateDashboardInput) =>
    api.patch<ApiSuccess<Dashboard>>(`/api/v1/dashboards/${id}`, input),

  remove: (id: string) =>
    api.del<ApiOk>(`/api/v1/dashboards/${id}`),

  duplicate: (id: string) =>
    api.post<ApiSuccess<Dashboard>>(`/api/v1/dashboards/${id}/duplicate`, {}),

  // Widgets
  addWidget: (dashboardId: string, input: CreateWidgetInput) =>
    api.post<ApiSuccess<Widget>>(`/api/v1/dashboards/${dashboardId}/widgets`, input),

  updateWidget: (dashboardId: string, widgetId: string, input: UpdateWidgetInput) =>
    api.patch<ApiSuccess<Widget>>(`/api/v1/dashboards/${dashboardId}/widgets/${widgetId}`, input),

  removeWidget: (dashboardId: string, widgetId: string) =>
    api.del<ApiOk>(`/api/v1/dashboards/${dashboardId}/widgets/${widgetId}`),

  // Widget data
  queryWidgetData: (dashboardId: string, widgetId: string, query: WidgetDataQuery) =>
    api.post<ApiSuccess<WidgetDataResult>>(`/api/v1/dashboards/${dashboardId}/widgets/${widgetId}/data`, query),

  // Export
  exportDashboard: (id: string, options: DashboardExportOptions) =>
    api.post<ApiSuccess<ExportResult>>(`/api/v1/dashboards/${id}/export`, options),

  // Sharing
  share: (id: string, userIds: string[], permission: 'view' | 'edit') =>
    api.post<ApiOk>(`/api/v1/dashboards/${id}/share`, { userIds, permission }),

  unshare: (id: string, userId: string) =>
    api.del<ApiOk>(`/api/v1/dashboards/${id}/share/${userId}`),

  // Cross-filter
  applyCrossFilter: (id: string, filters: DashboardFilter[]) =>
    api.post<ApiSuccess<{ affectedWidgets: string[] }>>(`/api/v1/dashboards/${id}/cross-filter`, { filters }),

  clearCrossFilter: (id: string) =>
    api.del<ApiOk>(`/api/v1/dashboards/${id}/cross-filter`),

  // TV Mode
  enableTvMode: (id: string, options: TvModeOptions) =>
    api.post<ApiSuccess<TvModeSession>>(`/api/v1/dashboards/${id}/tv-mode`, options),

  disableTvMode: (id: string, sessionId: string) =>
    api.del<ApiOk>(`/api/v1/dashboards/${id}/tv-mode/${sessionId}`),

  // Publish Link
  publishLink: (id: string, options?: PublishLinkOptions) =>
    api.post<ApiSuccess<PublishLinkResult>>(`/api/v1/dashboards/${id}/publish`, options ?? {}),

  unpublish: (id: string) =>
    api.del<ApiOk>(`/api/v1/dashboards/${id}/publish`),
};
