// ─── Rased Canvas FSM – Type Definitions ────────────────────────────────────

// ─── Event Types ─────────────────────────────────────────────────────────────

export type AppEvent =
  | { type: "APP/BOOT" }
  | { type: "APP/READY" }
  | { type: "APP/CRASH"; error: string };

export type ThemeEvent =
  | { type: "THEME/TOGGLE" }
  | { type: "THEME/SET_REDUCE_MOTION"; enabled: boolean };

export type SidebarEvent =
  | { type: "SIDEBAR/OPEN" }
  | { type: "SIDEBAR/CLOSE" }
  | { type: "SIDEBAR/SET_TAB"; tab: string }
  | { type: "SIDEBAR/TOGGLE_PIN" };

export type ComposerEvent =
  | { type: "COMPOSER/SET_TEXT"; text: string }
  | { type: "COMPOSER/SEND" }
  | { type: "COMPOSER/CLEAR" };

export type DropEvent =
  | { type: "DROP/ENTER" }
  | { type: "DROP/LEAVE" }
  | { type: "DROP/FILES"; files: File[] };

export type ActionsEvent =
  | { type: "ACTIONS/SHOW"; actions: ActionItem[] }
  | { type: "ACTIONS/SELECT"; actionId: string }
  | { type: "ACTIONS/DISMISS" };

export type JobEvent =
  | { type: "JOB/CREATE"; jobId: string; label: string }
  | { type: "JOB/STAGE"; jobId: string; stage: string }
  | { type: "JOB/PROGRESS"; jobId: string; progress: number }
  | { type: "JOB/PREVIEW_READY"; jobId: string; previewUrl: string }
  | { type: "JOB/RESULT_READY"; jobId: string; result: JobResult }
  | { type: "JOB/EVIDENCE_READY"; jobId: string; evidence: JobEvidence }
  | { type: "JOB/FAIL"; jobId: string; error: string };

export type FocusEvent =
  | { type: "FOCUS/OPEN"; jobId: string }
  | { type: "FOCUS/CLOSE" };

export type ModalEvent =
  | { type: "MODAL/OPEN"; modalId: string; props?: Record<string, unknown> }
  | { type: "MODAL/CLOSE" };

export type NavEvent =
  | { type: "NAV/GO"; path: string };

export type ConversationEvent =
  | { type: "CONVERSATION/ADD_USER"; text: string }
  | { type: "CONVERSATION/ADD_ASSISTANT"; text: string }
  | { type: "CONVERSATION/STREAM_CHUNK"; chunk: string }
  | { type: "CONVERSATION/STREAM_END" };

export type RasedCanvasEvent =
  | AppEvent
  | ThemeEvent
  | SidebarEvent
  | ComposerEvent
  | DropEvent
  | ActionsEvent
  | JobEvent
  | FocusEvent
  | ModalEvent
  | NavEvent
  | ConversationEvent;

// ─── Data Types ──────────────────────────────────────────────────────────────

export interface ActionItem {
  id: string;
  label: string;
  icon?: string;
  description?: string;
}

export interface JobResult {
  title: string;
  body: string;
  chips: string[];
  previewText?: string;
  previewImage?: string;
  outputs?: { kind: "route" | "download"; label: string; href: string }[];
}

export interface JobEvidence {
  sources: { label: string; url?: string }[];
}

export interface JobEntry {
  jobId: string;
  label: string;
  stage: string;
  progress: number;
  previewUrl: string | null;
  result: JobResult | null;
  evidence: JobEvidence | null;
  error: string | null;
  status: "running" | "preview" | "done" | "failed";
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// ─── Context ─────────────────────────────────────────────────────────────────

export interface RasedCanvasContext {
  theme: "dark" | "light";
  reduceMotion: boolean;

  sidebarOpen: boolean;
  sidebarPinned: boolean;
  sidebarTab: string;

  composerText: string;

  dropActive: boolean;
  droppedFiles: File[];

  actions: ActionItem[];
  selectedActionId: string | null;

  jobs: Record<string, JobEntry>;
  activeJobId: string | null;

  focusJobId: string | null;

  modalId: string | null;
  modalProps: Record<string, unknown> | null;

  conversation: ConversationMessage[];
  streamBuffer: string;

  bootError: string | null;
}

export const initialCanvasContext: RasedCanvasContext = {
  theme: "dark",
  reduceMotion: false,

  sidebarOpen: false,
  sidebarPinned: false,
  sidebarTab: "recent",

  composerText: "",

  dropActive: false,
  droppedFiles: [],

  actions: [],
  selectedActionId: null,

  jobs: {},
  activeJobId: null,

  focusJobId: null,

  modalId: null,
  modalProps: null,

  conversation: [],
  streamBuffer: "",

  bootError: null,
};
