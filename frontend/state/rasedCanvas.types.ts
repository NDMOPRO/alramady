export type ThemeMode = "light" | "dark";
export type SidebarMode = "hidden" | "peek" | "full";
export type SidebarPin = "unpinned" | "pinned";
export type SidebarTab =
  | "library"
  | "search"
  | "history"
  | "templates"
  | "exports"
  | "permissions"
  | "settings"
  | "context";
export type ViewId =
  | "chat"
  | "dashboards"
  | "dataLake"
  | "reports"
  | "library"
  | "settings"
  | { sub: string };
export type FocusArtifactKind =
  | "pptx"
  | "xlsx"
  | "docx"
  | "dashboard"
  | "pdf"
  | "html"
  | "video"
  | "audio"
  | "image"
  | "json";
export type JobStage =
  | "analyzing"
  | "planning"
  | "running"
  | "verifying"
  | "exporting"
  | "completed"
  | "failed";

export type Selection =
  | { kind: "none" }
  | { kind: "message"; messageId: string }
  | { kind: "card"; cardId: string }
  | { kind: "artifact"; artifactId: string }
  | { kind: "page"; pageId: string }
  | { kind: "widget"; widgetId: string }
  | { kind: "table"; tableId: string }
  | { kind: "column"; columnId: string }
  | { kind: "slide"; slideId: string }
  | { kind: "docBlock"; blockId: string };

export interface Attachment {
  assetId: string;
  name: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  pageCount?: number;
  durationSec?: number;
}

export interface ConversationMessage {
  id: string;
  author: "user" | "rased";
  text: string;
  createdAt: number;
  attachments?: Attachment[];
  cards?: string[];
}

export interface JobError {
  code: string;
  message: string;
  detail?: unknown;
}

export interface JobEntry {
  jobId: string;
  createdAt: number;
  stage: JobStage;
  progressPct: number;
  runCards: string[];
  previewCards: string[];
  resultCards: string[];
  evidenceId?: string;
  artifactIds?: string[];
  error?: JobError;
}

export interface JobEvidence {
  evidenceId: string;
  sources: Array<{ label: string; url?: string }>;
  artifactIds?: string[];
}

export interface UIEffects {
  reduceMotion: boolean;
  particlesEnabled: boolean;
  premiumMotionEnabled: boolean;
}

export interface NavState {
  activeView: ViewId;
  expandedNavItems: string[];
  sidebarCollapsed: boolean;
}

export interface SidebarState {
  mode: SidebarMode;
  pin: SidebarPin;
  activeTab: SidebarTab;
}

export type FocusStageState =
  | { open: false }
  | {
      open: true;
      artifactId: string;
      artifactKind: FocusArtifactKind;
      stageMode: "view" | "edit";
    };

export interface Overlays {
  commandPaletteOpen: boolean;
  previewReaderOpen: boolean;
  tourOpen: boolean;
  blockingModalOpen: boolean;
  activeModal?: "manus" | "confirm" | "error" | "share" | "export";
  activeTourId?: string;
  tourSteps?: unknown[];
  tourStepIndex?: number;
  tourPaused?: boolean;
}

export interface RasedCanvasContext {
  theme: ThemeMode;
  uiEffects: UIEffects;

  nav: NavState;
  sidebar: SidebarState;
  focus: FocusStageState;
  overlays: Overlays;

  composer: {
    text: string;
    isComposing: boolean;
    isSending: boolean;
    dragOver: boolean;
  };

  conversation: {
    messages: ConversationMessage[];
    isAssistantTyping: boolean;
  };

  selection: Selection;

  jobs: {
    byId: Record<string, JobEntry>;
    activeJobIds: string[];
  };

  dev: {
    designPanelOpen: boolean;
  };

  appError?: {
    code: string;
    message: string;
  };
}

export type RasedEvent =
  | { type: "APP/BOOT" }
  | { type: "APP/READY" }
  | { type: "APP/FAIL"; error: { code: string; message: string } }
  | { type: "THEME/TOGGLE" }
  | { type: "EFFECTS/SET_REDUCE_MOTION"; value: boolean }
  | { type: "EFFECTS/SET_PARTICLES"; value: boolean }
  | { type: "EFFECTS/SET_PREMIUM_MOTION"; value: boolean }
  | { type: "NAV/GO"; view: ViewId }
  | { type: "NAV/TOGGLE_COLLAPSE" }
  | { type: "NAV/EXPAND_ITEM"; itemId: string }
  | { type: "NAV/COLLAPSE_ITEM"; itemId: string }
  | { type: "SIDEBAR/OPEN"; mode?: SidebarMode; tab?: SidebarTab }
  | { type: "SIDEBAR/CLOSE" }
  | { type: "SIDEBAR/TOGGLE_PIN" }
  | { type: "SIDEBAR/SET_TAB"; tab: SidebarTab }
  | { type: "SIDEBAR/SET_MODE"; mode: SidebarMode }
  | { type: "COMPOSER/FOCUS" }
  | { type: "COMPOSER/BLUR" }
  | { type: "COMPOSER/SET_TEXT"; text: string }
  | { type: "COMPOSER/SEND" }
  | { type: "COMPOSER/CLEAR" }
  | { type: "DROP/ENTER" }
  | { type: "DROP/LEAVE" }
  | { type: "DROP/FILES"; files: Attachment[] }
  | { type: "ACTIONS/SHOW"; forMessageId?: string; forAssetIds?: string[] }
  | { type: "ACTIONS/SELECT"; actionId: string; payload?: unknown }
  | { type: "JOB/CREATE"; jobId: string }
  | { type: "JOB/STAGE"; jobId: string; stage: JobStage }
  | { type: "JOB/PROGRESS"; jobId: string; progressPct: number }
  | { type: "JOB/PREVIEW_READY"; jobId: string; previewCardId: string }
  | { type: "JOB/RESULT_READY"; jobId: string; artifactIds: string[]; resultCardId: string }
  | { type: "JOB/EVIDENCE_READY"; jobId: string; evidenceId: string; evidenceCardId: string }
  | { type: "JOB/FAIL"; jobId: string; error: { code: string; message: string; detail?: unknown } }
  | { type: "JOB/CANCEL"; jobId: string }
  | { type: "JOB/RETRY"; jobId: string }
  | { type: "FOCUS/OPEN"; artifactId: string; kind: FocusArtifactKind; stageMode: "view" | "edit" }
  | { type: "FOCUS/CLOSE" }
  | { type: "FOCUS/SET_MODE"; stageMode: "view" | "edit" }
  | { type: "SELECT/SET"; selection: Selection }
  | { type: "SELECT/CLEAR" }
  | { type: "PALETTE/OPEN" }
  | { type: "PALETTE/CLOSE" }
  | { type: "READER/OPEN" }
  | { type: "READER/CLOSE" }
  | { type: "TOUR/START"; tourId: string; steps: unknown[] }
  | { type: "TOUR/NEXT" }
  | { type: "TOUR/PREV" }
  | { type: "TOUR/PAUSE" }
  | { type: "TOUR/RESUME" }
  | { type: "TOUR/END" }
  | { type: "MODAL/OPEN"; modal: Overlays["activeModal"] }
  | { type: "MODAL/CLOSE" }
  | { type: "DEV/DESIGN_PANEL_TOGGLE" };

export const initialCanvasContext: RasedCanvasContext = {
  theme: "dark",
  uiEffects: {
    reduceMotion: false,
    particlesEnabled: true,
    premiumMotionEnabled: true,
  },
  nav: {
    activeView: "chat",
    expandedNavItems: [],
    sidebarCollapsed: false,
  },
  sidebar: {
    mode: "hidden",
    pin: "unpinned",
    activeTab: "context",
  },
  focus: {
    open: false,
  },
  overlays: {
    commandPaletteOpen: false,
    previewReaderOpen: false,
    tourOpen: false,
    blockingModalOpen: false,
  },
  composer: {
    text: "",
    isComposing: false,
    isSending: false,
    dragOver: false,
  },
  conversation: {
    messages: [],
    isAssistantTyping: false,
  },
  selection: {
    kind: "none",
  },
  jobs: {
    byId: {},
    activeJobIds: [],
  },
  dev: {
    designPanelOpen: false,
  },
};
