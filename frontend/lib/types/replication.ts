export type ReplicationTargetOutput =
  | "dashboard"
  | "report"
  | "presentation"
  | "excel"
  | "localized";

export type ReplicationArtifactStatus = "approved" | "blocked";

export type ReplicationOutputModel =
  | {
      kind: "dashboard";
      layout: "grid-12";
      widgets: Array<{ id: string; type: "kpi" | "line" | "bar" | "pie" | "table"; binding: string }>;
      filters: string[];
      refreshMode: "live" | "scheduled";
    }
  | {
      kind: "report";
      format: "docx+pdf";
      sections: Array<{ id: string; title: string; blocks: number }>;
      toc: boolean;
      pageCountEstimate: number;
    }
  | {
      kind: "presentation";
      theme: "executive" | "analytical" | "modern";
      slides: Array<{ id: string; layout: "title" | "two-column" | "chart-focus" | "table-focus" }>;
      speakerNotes: boolean;
    }
  | {
      kind: "excel";
      sheets: Array<{ name: string; columns: number; formulaCells: number }>;
      pivotTables: number;
      namedRanges: number;
    }
  | {
      kind: "localized";
      baseLocale: string;
      targetLocale: string;
      rtlTransforms: number;
      mirroredCharts: number;
      terminologyLocks: number;
    };

export interface ReplicationArtifact {
  id: string;
  sessionId: string;
  status: ReplicationArtifactStatus;
  createdAt: string;
  route: string;
  source: {
    id: string;
    name: string;
    sourceType: string;
  };
  targetOutput: ReplicationTargetOutput;
  fidelity: {
    structural: number;
    pixel: number;
    density: number;
    hierarchy: number;
  };
  packageInfo: {
    componentCount: number;
    dataBindingCount: number;
    tableCount: number;
    chartCount: number;
    sections: string[];
  };
  outputModel: ReplicationOutputModel;
}

export interface WorkspaceBootstrapContext {
  workspace: ReplicationTargetOutput;
  artifact: ReplicationArtifact;
  appliedAt: string;
}

