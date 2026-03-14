// E07-0134 to E07-0145: Canvas states
export type CanvasState =
  | 'IDLE'
  | 'COMPOSING'
  | 'UPLOADING'
  | 'ANALYZING'
  | 'PLANNING'
  | 'RUNNING'
  | 'VERIFYING'
  | 'EXPORTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'NEEDS_VERIFIER_OPS'
  | 'CANCELLED';

// E07-0036 to E07-0061: Card types
export type CardType =
  | 'file'
  | 'context-actions'
  | 'plan'
  | 'run'
  | 'preview'
  | 'result'
  | 'editor'
  | 'diff'
  | 'evidence'
  | 'share'
  | 'message';

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  category: 'document' | 'spreadsheet' | 'presentation' | 'image' | 'video' | 'audio' | 'unknown';
  thumbnailUrl?: string;
  pageCount?: number;
  uploadProgress?: number;
  dataUrl?: string;       // base64 data URL for images
  textContent?: string;   // text content for CSV/text files
  rawFile?: File;         // reference to the actual File object
}

export interface ContextAction {
  id: string;
  label: string;
  icon: string;
  description?: string;
  category: string;
}

export interface PlanStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface RunStage {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  teaserText?: string;
}

export interface ArtifactResult {
  id: string;
  name: string;
  type: 'pptx' | 'docx' | 'xlsx' | 'dashboard' | 'pdf' | 'png' | 'srt' | 'json';
  downloadUrl?: string;
  previewUrl?: string;
  evidenceId?: string;
  gatesPassed?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  cards?: CardData[];
}

export interface CardData {
  id: string;
  type: CardType;
  file?: UploadedFile;
  actions?: ContextAction[];
  planSteps?: PlanStep[];
  runStages?: RunStage[];
  previewUrl?: string;
  previewThumbnails?: string[];
  artifact?: ArtifactResult;
  diffData?: DiffData;
  evidenceData?: EvidenceData;
  tableData?: { headers: string[]; rows: string[][] };
  htmlContent?: string;
}

export interface DiffData {
  type: 'pixel' | 'row' | 'structural';
  pixelDiff?: number;
  heatmapUrl?: string;
  addedCount?: number;
  removedCount?: number;
  modifiedCount?: number;
}

export interface EvidenceData {
  evidenceId: string;
  pixelDiff: number;
  structuralHash: string;
  gatesPassed: boolean;
  timestamp: Date;
}

// E07-0098 to E07-0100: Sidebar states
export type SidebarState = 'hidden' | 'peek' | 'full';

// E07-0031 + APX-0357/0358: Sidebar tabs (Search + Settings + Permissions added)
export type SidebarTab = 'library' | 'templates' | 'history' | 'exports' | 'governance' | 'search' | 'settings' | 'permissions';

// GP-0046/GP-0068: Execution mode
export type ExecutionMode = 'auto' | 'guided';

// GP-0071/GP-0232-0236: User preferences
export interface UserPreferences {
  fontSize: 'small' | 'medium' | 'large';
  uiDensity: 'compact' | 'normal' | 'comfortable';
  language: 'ar' | 'en';
  arabicMode: boolean;
  notifications: boolean;
}

// Focus Stage
export interface FocusStageData {
  artifactId: string;
  artifactType: ArtifactResult['type'];
  title: string;
  content?: unknown;
}

// ─── STRICT 1:1 Pipeline ──────────────────────────────────────────────────────

/**
 * Status of a single STRICT pipeline step.
 * The 13 mandatory steps follow the spec in STRICT_1TO1_IMPLEMENTATION.md.
 */
export type StrictStepStatus = 'pending' | 'running' | 'done' | 'failed';

/** One of the 13 mandatory STRICT pipeline steps. */
export interface StrictPipelineStep {
  index: number;            // 0-based, 0..12
  name: string;             // human-readable Arabic label
  nameEn: string;           // English internal name matching backend step key
  status: StrictStepStatus;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  durationMs?: number;
}

/** Overall status of the active STRICT pipeline run. */
export type StrictPipelineStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Evidence pack returned after a completed STRICT run. */
export interface StrictEvidencePack {
  runId: string;
  gatesPassed: boolean;
  pixelDiff: number;
  structuralHash: string;
  layerCount: number;
  elementCount: number;
  validatedAt: Date;
  failedGates: string[];
}

/** Full state for the active STRICT pipeline run in canvas-store. */
export interface StrictPipelineState {
  runId: string | null;
  status: StrictPipelineStatus;
  targetFormat: string | null;
  sourceFileName: string | null;
  currentStepIndex: number;
  steps: StrictPipelineStep[];
  evidencePack: StrictEvidencePack | null;
  outputUrl: string | null;
  startedAt: Date | null;
  updatedAt: Date | null;
  errorMessage: string | null;
}

/** The 13 STRICT pipeline step definitions (names + English keys). */
export const STRICT_PIPELINE_STEPS: Pick<StrictPipelineStep, 'index' | 'name' | 'nameEn'>[] = [
  { index: 0,  name: 'استقبال الملف',           nameEn: 'file_ingest' },
  { index: 1,  name: 'فهم الهيكل',              nameEn: 'structure_parse' },
  { index: 2,  name: 'بناء CDR',                nameEn: 'cdr_build' },
  { index: 3,  name: 'تحليل الصفحات',           nameEn: 'page_analyze' },
  { index: 4,  name: 'استخراج الطبقات',         nameEn: 'layer_extract' },
  { index: 5,  name: 'معالجة العناصر',          nameEn: 'element_process' },
  { index: 6,  name: 'ضبط الوحدات (EMU)',       nameEn: 'unit_normalize' },
  { index: 7,  name: 'تحويل الصيغة',            nameEn: 'format_convert' },
  { index: 8,  name: 'إعادة بناء التخطيط',      nameEn: 'layout_rebuild' },
  { index: 9,  name: 'تضمين الخطوط والصور',    nameEn: 'asset_embed' },
  { index: 10, name: 'التحقق من التطابق',       nameEn: 'fidelity_verify' },
  { index: 11, name: 'توليد حزمة الأدلة',       nameEn: 'evidence_pack' },
  { index: 12, name: 'إخراج الملف النهائي',     nameEn: 'final_export' },
];
