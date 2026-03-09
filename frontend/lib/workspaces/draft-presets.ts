import type { CreateEasyModePayload } from "@/lib/api/reporting";
import type { WorkspaceGeneratedDraft } from "@/lib/workspaces/bootstrap-engine";

export interface DashboardEditorWidgetPreset {
  id: string;
  type: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  column?: string;
  datasetId?: string;
  aggregation?: string;
}

export interface DashboardAdvancedWidgetPreset {
  id: string;
  type:
    | "BAR_CHART"
    | "LINE_CHART"
    | "PIE_CHART"
    | "DONUT_CHART"
    | "AREA_CHART"
    | "TABLE"
    | "KPI_CARD"
    | "MAP"
    | "GAUGE"
    | "TEXT";
  title: string;
  titleEn: string;
  colSpan: number;
  rowSpan: number;
  dataSource: string;
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u0600-\u06FF]/g, "");
}

function extractBinding(details: string): string {
  const m = details.match(/binding:\s*([^•]+)/i);
  if (m && m[1]) {
    return normalizeToken(m[1]) || "source_binding";
  }
  return "source_binding";
}

function extractWidgetKindFromTitle(title: string): string {
  const m = title.match(/\(([^)]+)\)/);
  return normalizeToken(m?.[1] ?? "");
}

function dashboardEditorTypeFromKind(kind: string): string {
  if (kind === "kpi") return "kpi";
  if (kind === "line") return "chart-line";
  if (kind === "bar") return "chart-bar";
  if (kind === "pie") return "chart-pie";
  if (kind === "table") return "table";
  return "chart-bar";
}

function dashboardAdvancedTypeFromKind(
  kind: string
): DashboardAdvancedWidgetPreset["type"] {
  if (kind === "kpi") return "KPI_CARD";
  if (kind === "line") return "LINE_CHART";
  if (kind === "bar") return "BAR_CHART";
  if (kind === "pie") return "PIE_CHART";
  if (kind === "table") return "TABLE";
  return "BAR_CHART";
}

function layoutSizeForKind(kind: string): { w: number; h: number } {
  if (kind === "kpi") return { w: 1, h: 1 };
  if (kind === "table") return { w: 4, h: 1 };
  return { w: 2, h: 2 };
}

export function buildDashboardEditorWidgetsFromDraft(
  draft: WorkspaceGeneratedDraft
): DashboardEditorWidgetPreset[] {
  let x = 0;
  let y = 0;
  let rowHeight = 1;

  return draft.items.map((item, idx) => {
    const kind = extractWidgetKindFromTitle(item.title);
    const size = layoutSizeForKind(kind);
    if (x + size.w > 4) {
      x = 0;
      y += rowHeight;
      rowHeight = 1;
    }
    const widget: DashboardEditorWidgetPreset = {
      id: `artifact-${idx + 1}`,
      type: dashboardEditorTypeFromKind(kind),
      title: item.title,
      x,
      y,
      w: size.w,
      h: size.h,
      column: extractBinding(item.details),
      datasetId: draft.sourceId,
      aggregation: kind === "kpi" ? "sum" : kind === "table" ? "none" : "avg",
    };
    x += size.w;
    rowHeight = Math.max(rowHeight, size.h);
    return widget;
  });
}

export function buildDashboardAdvancedWidgetsFromDraft(
  draft: WorkspaceGeneratedDraft
): DashboardAdvancedWidgetPreset[] {
  return draft.items.map((item, idx) => {
    const kind = extractWidgetKindFromTitle(item.title);
    return {
      id: `artifact-${idx + 1}`,
      type: dashboardAdvancedTypeFromKind(kind),
      title: item.title,
      titleEn: `Artifact Widget ${idx + 1}`,
      colSpan: kind === "kpi" ? 1 : 2,
      rowSpan: 1,
      dataSource: extractBinding(item.details) || draft.sourceId,
    };
  });
}

export function buildEasyModeReportDefaults(
  draft: WorkspaceGeneratedDraft,
  defaultReportType: string
): CreateEasyModePayload {
  return {
    name: `تقرير مطابق - ${draft.sourceName}`,
    description: `تقرير مولد من حزمة المطابقة ${draft.artifactId}. ${draft.summary}`,
    reportType: defaultReportType,
    outputFormat: "pdf",
    datasetId: draft.sourceId || "artifact_dataset",
  };
}

export function buildAdvancedModeReportDefaults(
  draft: WorkspaceGeneratedDraft
): {
  name: string;
  description: string;
  queryConfig: string;
  dataSources: string;
} {
  const queryConfig = {
    sourceArtifact: draft.artifactId,
    sourceDataset: draft.sourceId,
    mode: "literal-fidelity",
    sections: draft.items.map((item, index) => ({
      order: index + 1,
      title: item.title,
      weight: item.priority,
    })),
  };
  const dataSources = [
    { datasetId: draft.sourceId || "artifact_dataset", alias: "source_main" },
  ];

  return {
    name: `تقرير متقدم مطابق - ${draft.sourceName}`,
    description: `تهيئة متقدمة من حزمة ${draft.artifactId} للحفاظ على التطابق الحرفي.`,
    queryConfig: JSON.stringify(queryConfig, null, 2),
    dataSources: JSON.stringify(dataSources, null, 2),
  };
}
