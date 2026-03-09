import { dashboardApi } from "./client";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface Dashboard {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  thumbnail?: string;
  widgetCount: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Widget {
  id: string;
  dashboardId: string;
  title: string;
  titleAr: string;
  type: "bar" | "line" | "pie" | "area" | "scatter" | "kpi" | "table";
  config: {
    dataSource: string;
    xAxis?: string;
    yAxis?: string;
    colors?: string[];
    aggregation?: string;
  };
  layout: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  data: Array<Record<string, string | number>>;
}

export interface DashboardDetail extends Dashboard {
  widgets: Widget[];
}

export interface CreateDashboardPayload {
  name: string;
  nameAr: string;
  description: string;
  isPublic: boolean;
}

export interface AnalysisProfileColumn {
  name: string;
  type: "numeric" | "categorical" | "date" | "text" | "boolean";
  uniqueCount: number;
  nullCount: number;
  totalCount: number;
  sample: unknown[];
  stats?: {
    min?: number;
    max?: number;
    mean?: number;
    median?: number;
    stddev?: number;
    sum?: number;
  };
}

export interface AnalysisDataProfile {
  rowCount: number;
  columnCount: number;
  columns: AnalysisProfileColumn[];
  numericColumns: string[];
  categoricalColumns: string[];
  dateColumns: string[];
  textColumns: string[];
}

export interface AnalysisKPIRecommendation {
  name: string;
  nameAr: string;
  column: string;
  formula: string;
  icon: string;
  format: string;
}

export interface AnalysisChartRecommendation {
  widgetType: string;
  title: string;
  titleAr: string;
  xColumn: string | null;
  yColumn: string | null;
  labelColumn: string | null;
  config: Record<string, unknown>;
  score: number;
  reason: string;
}

export interface DatasetAnalysisResult {
  dataProfile: AnalysisDataProfile;
  kpiRecommendations: AnalysisKPIRecommendation[];
  chartRecommendations: AnalysisChartRecommendation[];
}

/* ── Dashboards ────────────────────────────────────────────────────── */

export async function getDashboards(params?: {
  page?: number;
  pageSize?: number;
  limit?: number;
  search?: string;
}): Promise<{ data: Dashboard[]; total: number }> {
  const response = await dashboardApi.get<{
    success: boolean;
    data: {
      items: Dashboard[];
      pagination: { total: number };
    };
  }>("/dashboards", {
    params: {
      page: params?.page,
      limit: params?.limit ?? params?.pageSize,
      search: params?.search,
    },
  });
  const result = response.data;
  // Service returns { data: { items: [], pagination: { total } } }
  const items = result.data?.items ?? [];
  const total = result.data?.pagination?.total ?? items.length;
  return { data: items, total };
}

export async function analyzeDataset(
  datasetId: string,
  preferredChartTypes?: string[]
): Promise<DatasetAnalysisResult> {
  const response = await dashboardApi.post<{
    success: boolean;
    data: DatasetAnalysisResult;
  }>("/analyze-data", {
    datasetId,
    preferredChartTypes,
  });
  return response.data.data;
}

export async function getDashboardById(id: string): Promise<DashboardDetail> {
  const response = await dashboardApi.get<DashboardDetail>(`/dashboards/${id}`);
  return response.data;
}

export async function createDashboard(payload: CreateDashboardPayload): Promise<Dashboard> {
  const response = await dashboardApi.post<Dashboard>("/dashboards", payload);
  return response.data;
}

export async function updateDashboard(id: string, payload: Partial<CreateDashboardPayload>): Promise<Dashboard> {
  const response = await dashboardApi.put<Dashboard>(`/dashboards/${id}`, payload);
  return response.data;
}

export async function deleteDashboard(id: string): Promise<void> {
  await dashboardApi.delete(`/dashboards/${id}`);
}

/* ── Widgets ───────────────────────────────────────────────────────── */

export async function addWidget(
  dashboardId: string,
  payload: Omit<Widget, "id" | "dashboardId" | "data">
): Promise<Widget> {
  const response = await dashboardApi.post<Widget>(`/dashboards/${dashboardId}/widgets`, payload);
  return response.data;
}

export async function updateWidget(
  dashboardId: string,
  widgetId: string,
  payload: Partial<Widget>
): Promise<Widget> {
  const response = await dashboardApi.put<Widget>(
    `/dashboards/${dashboardId}/widgets/${widgetId}`,
    payload
  );
  return response.data;
}

export async function deleteWidget(dashboardId: string, widgetId: string): Promise<void> {
  await dashboardApi.delete(`/dashboards/${dashboardId}/widgets/${widgetId}`);
}
