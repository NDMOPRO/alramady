'use client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8003';
const DASH = `${API_BASE}/api/v1/dashboard`;

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('rasid_token');
}

async function req<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API ${res.status}`);
  }
  return res.json();
}

const get = <T>(url: string) => req<T>(url);
const post = <T>(url: string, body?: unknown) => req<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) });
const patch = <T>(url: string, body?: unknown) => req<T>(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
const del = <T>(url: string) => req<T>(url, { method: 'DELETE' });

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ApiRes<T> { success: boolean; data: T }
export interface ApiList<T> { success: boolean; data: T[]; total: number; page: number; limit: number }

export interface DashboardItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  layout?: Record<string, unknown>;
  theme?: Record<string, unknown>;
  config?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
  status?: string;
  version?: number;
}

export interface WidgetItem {
  id: string;
  dashboardId: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  position: Record<string, unknown>;
  size: Record<string, unknown>;
  datasetId?: string;
}

export interface DragElement {
  id: string;
  dashboardId: string;
  elementType: string;
  label: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex: number;
  config: Record<string, unknown>;
}

export interface TemplateItem {
  id: string;
  name: string;
  description?: string;
  category: string;
  templateConfig: Record<string, unknown>;
  isPremium: boolean;
  isPublic: boolean;
  thumbnail?: string;
  createdAt: string;
}

export interface VersionEntry {
  id: string;
  dashboardId: string;
  layouts: Record<string, unknown>;
  savedAt: string;
}

export interface KPIDefinition {
  name: string;
  nameAr: string;
  formula: string;
  column: string;
  unit: string;
  format: string;
}

export interface ShareLink {
  token: string;
  url: string;
  expiresAt: string;
}

export interface CompareResult {
  dashboard1: { id: string; name: string; elementsCount: number };
  dashboard2: { id: string; name: string; elementsCount: number };
  commonElements: number;
  differences: string[];
}

export interface PerformanceMetrics {
  metrics: Array<{ name: string; aggregation: string; column: string }>;
}

export interface BatchResult {
  total: number;
  processed: number;
  results: Array<{ type: string; dashboardId: string; success: boolean; error?: string }>;
}

export interface ChartSuggestion {
  type: string;
  config: Record<string, unknown>;
  aggregation: string;
}

export interface DesignTokens {
  colors: string[];
  font: string;
  themeId: string;
  borderRadius: number;
  shadowLevel: string;
}

// ═══════════════════════════════════════════════════════════════
// Dashboard CRUD (Core)
// ═══════════════════════════════════════════════════════════════

export const dashboardEngine = {
  // --- Core ---
  listDashboards: () => get<ApiRes<DashboardItem[]>>(`${DASH}/dashboards`),
  getDashboard: (id: string) => get<ApiRes<DashboardItem>>(`${DASH}/dashboards/${id}`),

  // --- E03.01: Easy Mode ---
  easyList: () => get<ApiList<Record<string, unknown>>>(`${DASH}/easy`),

  // --- E03.02: Advanced Mode ---
  advancedList: () => get<ApiList<Record<string, unknown>>>(`${DASH}/advanced`),

  // --- E03.03: Drag Elements ---
  dragList: () => get<ApiList<DragElement>>(`${DASH}/drag`),
  dropAndBind: (dashboardId: string, elementType: string, columnName: string, position: { x: number; y: number; w: number; h: number }) =>
    post<ApiRes<DragElement>>(`${DASH}/drag/drop-bind`, { dashboardId, elementType, columnName, position }),
  linkElements: (dashboardId: string, sourceElementId: string, targetElementIds: string[], filterColumn: string) =>
    post<ApiRes<{ linked: boolean }>>(`${DASH}/drag/link`, { dashboardId, sourceElementId, targetElementIds, filterColumn }),
  configureDrillDown: (elementId: string, levels: Array<{ field: string; label: string }>) =>
    post<ApiRes<DragElement>>(`${DASH}/drag/${elementId}/drill-down`, { levels }),
  configureAlert: (elementId: string, threshold: number, condition: string, alertType: string) =>
    post<ApiRes<DragElement>>(`${DASH}/drag/${elementId}/alert`, { threshold, condition, alertType }),
  exportToPresentation: (elementId: string, dashboardId: string, presentationId: string, slideIndex: number) =>
    post<ApiRes<{ jobId: string; status: string }>>(`${DASH}/drag/${elementId}/export-to-presentation`, { dashboardId, presentationId, slideIndex }),
  updatePosition: (elementId: string, dashboardId: string, position: { x: number; y: number; w: number; h: number }) =>
    patch<ApiRes<DragElement>>(`${DASH}/drag/${elementId}/position`, { dashboardId, position }),

  // --- E03.04: Full Editor ---
  editorList: () => get<ApiList<Record<string, unknown>>>(`${DASH}/editor`),
  resizeElement: (widgetId: string, dashboardId: string, newSize: { w: number; h: number }) =>
    post<ApiRes<{ widgetId: string; size: Record<string, unknown> }>>(`${DASH}/editor/resize`, { widgetId, dashboardId, newSize }),
  shareInteractiveLink: (dashboardId: string, expiresHours: number) =>
    post<ApiRes<ShareLink>>(`${DASH}/editor/dashboards/${dashboardId}/share`, { expiresHours }),
  convertToReport: (dashboardId: string) =>
    post<ApiRes<{ jobId: string; status: string }>>(`${DASH}/editor/dashboards/${dashboardId}/convert-to-report`, {}),
  rebindElement: (widgetId: string, newColumn: string, newDatasetId: string, newAggregation: string) =>
    post<ApiRes<{ widgetId: string }>>(`${DASH}/editor/rebind`, { widgetId, newColumn, newDatasetId, newAggregation }),
  addCanvasFormula: (widgetId: string, expression: string, resultColumn: string) =>
    post<ApiRes<{ widgetId: string; formulaCount: number }>>(`${DASH}/editor/widgets/${widgetId}/formula`, { expression, resultColumn }),
  exportDashboard: (dashboardId: string, format: string) =>
    post<ApiRes<{ jobId: string; status: string; format: string }>>(`${DASH}/editor/dashboards/${dashboardId}/export`, { format }),

  // --- E03.05: Post-Edit ---
  postEditList: () => get<ApiList<Record<string, unknown>>>(`${DASH}/post-edit`),
  changeChartType: (widgetId: string, newType: string) =>
    patch<ApiRes<{ widgetId: string; newType: string }>>(`${DASH}/post-edit/widgets/${widgetId}/chart-type`, { newType }),
  changeAggregation: (widgetId: string, aggregation: string) =>
    patch<ApiRes<{ widgetId: string; aggregation: string }>>(`${DASH}/post-edit/widgets/${widgetId}/aggregation`, { aggregation }),
  getVersionHistory: (dashboardId: string) =>
    get<ApiRes<VersionEntry[]>>(`${DASH}/post-edit/dashboards/${dashboardId}/versions`),
  cloneDashboard: (dashboardId: string) =>
    post<ApiRes<DashboardItem>>(`${DASH}/post-edit/dashboards/${dashboardId}/clone`, {}),
  saveState: (dashboardId: string, filters: Record<string, unknown>) =>
    post<ApiRes<{ id: string; dashboardId: string; savedAt: string }>>(`${DASH}/post-edit/dashboards/${dashboardId}/save-state`, { filters }),
  rebindDashboardData: (dashboardId: string, newDatasetId: string) =>
    post<ApiRes<{ updatedCount: number }>>(`${DASH}/post-edit/dashboards/${dashboardId}/rebind`, { newDatasetId }),
  addElement: (dashboardId: string, elementType: string, config: Record<string, unknown>, position: Record<string, unknown>) =>
    post<ApiRes<WidgetItem>>(`${DASH}/post-edit/dashboards/${dashboardId}/elements`, { elementType, config, position }),
  deleteElement: (dashboardId: string, widgetId: string) =>
    del<ApiRes<{ deleted: boolean }>>(`${DASH}/post-edit/dashboards/${dashboardId}/elements/${widgetId}`),

  // --- E03.06: Template Library ---
  templateList: () => get<ApiList<TemplateItem>>(`${DASH}/templates`),
  getCategories: () => get<ApiRes<string[]>>(`${DASH}/templates/categories`),
  saveAsTemplate: (dashboardId: string, name: string, description: string, category: string) =>
    post<ApiRes<TemplateItem>>(`${DASH}/templates/save-as-template`, { dashboardId, name, description, category }),
  createFromTemplate: (templateId: string, name: string, newDatasetId: string) =>
    post<ApiRes<DashboardItem>>(`${DASH}/templates/from-template`, { templateId, name, newDatasetId }),
  compareDashboards: (dashboardId1: string, dashboardId2: string) =>
    post<ApiRes<CompareResult>>(`${DASH}/templates/compare`, { dashboardId1, dashboardId2 }),
  autoGenerateKPIs: (datasetId: string) =>
    get<ApiRes<KPIDefinition[]>>(`${DASH}/templates/auto-kpis/${datasetId}`),

  // --- E03.07: External Simulation ---
  simulationList: () => get<ApiList<Record<string, unknown>>>(`${DASH}/simulation`),
  simulateFromImage: (imageAnalysis: Record<string, unknown>, datasetId: string) =>
    post<ApiRes<DashboardItem>>(`${DASH}/simulation/simulate-from-image`, { imageAnalysis, datasetId }),
  generateChartFromPrompt: (prompt: string, datasetId: string) =>
    post<ApiRes<ChartSuggestion>>(`${DASH}/simulation/generate-chart-from-prompt`, { prompt, datasetId }),
  simulatePerformance: (datasetId: string) =>
    get<ApiRes<{ estimatedRenderTime: string; recommendations: string[] }>>(`${DASH}/simulation/simulate-performance/${datasetId}`),
  extractDesignTokens: (imageAnalysis: Record<string, unknown>) =>
    post<ApiRes<DesignTokens>>(`${DASH}/simulation/extract-design-tokens`, { imageAnalysis }),

  // --- E03.08: Performance ---
  performanceList: () => get<ApiList<Record<string, unknown>>>(`${DASH}/performance`),
  getSemanticLayer: (dashboardId: string) =>
    get<ApiRes<PerformanceMetrics>>(`${DASH}/performance/semantic-layer/${dashboardId}`),
  precomputeAggregations: (dashboardId: string) =>
    post<ApiRes<{ dashboardId: string; precomputedCount: number }>>(`${DASH}/performance/precompute/${dashboardId}`, {}),
  getOptimizedData: (dashboardId: string) =>
    get<ApiRes<{ data: unknown[]; cached: boolean; rowCount: number }>>(`${DASH}/performance/optimized-data/${dashboardId}`),
  batchProcess: (operations: Array<{ dashboardId: string; type: string }>) =>
    post<ApiRes<BatchResult>>(`${DASH}/performance/batch`, { operations }),
};
