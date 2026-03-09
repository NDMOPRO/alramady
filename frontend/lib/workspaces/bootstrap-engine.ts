import type {
  ReplicationArtifact,
  ReplicationOutputModel,
  ReplicationTargetOutput,
} from "@/lib/types/replication";

export type WorkspaceDraftPriority = "high" | "medium" | "low";

export interface WorkspaceGeneratedDraftItem {
  id: string;
  type: string;
  title: string;
  details: string;
  priority: WorkspaceDraftPriority;
}

export interface WorkspaceGeneratedDraft {
  workspace: ReplicationTargetOutput;
  artifactId: string;
  sessionId: string;
  sourceId: string;
  sourceName: string;
  generatedAt: string;
  summary: string;
  items: WorkspaceGeneratedDraftItem[];
}

const DRAFTS_KEY = "rasid_workspace_generated_v1";

function fromDashboardModel(
  artifact: ReplicationArtifact,
  model: Extract<ReplicationOutputModel, { kind: "dashboard" }>
): WorkspaceGeneratedDraft {
  const items = model.widgets.map((w, idx) => ({
    id: w.id,
    type: "widget",
    title: `Widget ${idx + 1} (${w.type})`,
    details: `Binding: ${w.binding} • Layout: ${model.layout}`,
    priority: idx < 2 ? "high" as const : "medium" as const,
  }));
  model.filters.forEach((f, idx) => {
    items.push({
      id: `filter_${idx + 1}`,
      type: "filter",
      title: `Filter ${idx + 1}`,
      details: f,
      priority: "medium",
    });
  });

  return {
    workspace: "dashboard",
    artifactId: artifact.id,
    sessionId: artifact.sessionId,
    sourceId: artifact.source.id,
    sourceName: artifact.source.name,
    generatedAt: new Date().toISOString(),
    summary: `${model.widgets.length} widgets • ${model.filters.length} filters • ${model.refreshMode} refresh`,
    items,
  };
}

function fromReportModel(
  artifact: ReplicationArtifact,
  model: Extract<ReplicationOutputModel, { kind: "report" }>
): WorkspaceGeneratedDraft {
  const items = model.sections.map((s, idx) => ({
    id: s.id,
    type: "section",
    title: s.title,
    details: `${s.blocks} content blocks`,
    priority: idx < 2 ? "high" as const : "medium" as const,
  }));

  return {
    workspace: "report",
    artifactId: artifact.id,
    sessionId: artifact.sessionId,
    sourceId: artifact.source.id,
    sourceName: artifact.source.name,
    generatedAt: new Date().toISOString(),
    summary: `${model.sections.length} sections • TOC ${model.toc ? "enabled" : "disabled"} • ~${model.pageCountEstimate} pages`,
    items,
  };
}

function fromPresentationModel(
  artifact: ReplicationArtifact,
  model: Extract<ReplicationOutputModel, { kind: "presentation" }>
): WorkspaceGeneratedDraft {
  const items = model.slides.map((s, idx) => ({
    id: s.id,
    type: "slide",
    title: `Slide ${idx + 1}`,
    details: `Layout: ${s.layout} • Theme: ${model.theme}`,
    priority: idx === 0 ? "high" as const : "medium" as const,
  }));

  return {
    workspace: "presentation",
    artifactId: artifact.id,
    sessionId: artifact.sessionId,
    sourceId: artifact.source.id,
    sourceName: artifact.source.name,
    generatedAt: new Date().toISOString(),
    summary: `${model.slides.length} slides • Theme ${model.theme} • Notes ${model.speakerNotes ? "enabled" : "disabled"}`,
    items,
  };
}

function fromExcelModel(
  artifact: ReplicationArtifact,
  model: Extract<ReplicationOutputModel, { kind: "excel" }>
): WorkspaceGeneratedDraft {
  const items: WorkspaceGeneratedDraftItem[] = model.sheets.map((s, idx) => ({
    id: `sheet_${idx + 1}`,
    type: "sheet",
    title: s.name,
    details: `${s.columns} columns • ${s.formulaCells} formula cells`,
    priority: idx === 0 ? "high" as const : "medium" as const,
  }));
  items.push({
    id: "pivot_tables",
    type: "pivot",
    title: "Pivot Tables",
    details: `${model.pivotTables} generated`,
    priority: "high",
  });
  items.push({
    id: "named_ranges",
    type: "named-range",
    title: "Named Ranges",
    details: `${model.namedRanges} generated`,
    priority: "low",
  });

  return {
    workspace: "excel",
    artifactId: artifact.id,
    sessionId: artifact.sessionId,
    sourceId: artifact.source.id,
    sourceName: artifact.source.name,
    generatedAt: new Date().toISOString(),
    summary: `${model.sheets.length} sheets • ${model.pivotTables} pivots • ${model.namedRanges} named ranges`,
    items,
  };
}

function fromLocalizedModel(
  artifact: ReplicationArtifact,
  model: Extract<ReplicationOutputModel, { kind: "localized" }>
): WorkspaceGeneratedDraft {
  const items = [
    {
      id: "locale_map",
      type: "locale-map",
      title: "Locale Mapping",
      details: `${model.baseLocale} -> ${model.targetLocale}`,
      priority: "high" as const,
    },
    {
      id: "rtl_transform",
      type: "rtl-transform",
      title: "RTL Transform",
      details: `${model.rtlTransforms} transformations`,
      priority: "high" as const,
    },
    {
      id: "mirrored_charts",
      type: "chart-mirror",
      title: "Mirrored Charts",
      details: `${model.mirroredCharts} charts`,
      priority: "medium" as const,
    },
    {
      id: "terminology_locks",
      type: "term-lock",
      title: "Terminology Locks",
      details: `${model.terminologyLocks} locked terms`,
      priority: "medium" as const,
    },
  ];

  return {
    workspace: "localized",
    artifactId: artifact.id,
    sessionId: artifact.sessionId,
    sourceId: artifact.source.id,
    sourceName: artifact.source.name,
    generatedAt: new Date().toISOString(),
    summary: `${model.rtlTransforms} RTL ops • ${model.mirroredCharts} chart mirrors • ${model.terminologyLocks} term locks`,
    items,
  };
}

export function buildWorkspaceDraftFromArtifact(
  artifact: ReplicationArtifact
): WorkspaceGeneratedDraft {
  const model = artifact.outputModel;
  if (model.kind === "dashboard") return fromDashboardModel(artifact, model);
  if (model.kind === "report") return fromReportModel(artifact, model);
  if (model.kind === "presentation") return fromPresentationModel(artifact, model);
  if (model.kind === "excel") return fromExcelModel(artifact, model);
  return fromLocalizedModel(artifact, model);
}

export function loadAllWorkspaceDrafts(): WorkspaceGeneratedDraft[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(DRAFTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as WorkspaceGeneratedDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadWorkspaceDraft(
  workspace: ReplicationTargetOutput
): WorkspaceGeneratedDraft | null {
  const drafts = loadAllWorkspaceDrafts();
  return drafts.find((d) => d.workspace === workspace) ?? null;
}

export function saveWorkspaceDraft(draft: WorkspaceGeneratedDraft): void {
  if (typeof window === "undefined") return;
  const drafts = loadAllWorkspaceDrafts().filter((d) => d.workspace !== draft.workspace);
  drafts.unshift(draft);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

export function clearWorkspaceDraft(workspace: ReplicationTargetOutput): void {
  if (typeof window === "undefined") return;
  const drafts = loadAllWorkspaceDrafts().filter((d) => d.workspace !== workspace);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}
