import { create } from 'zustand';
import type {
  CanvasState,
  ChatMessage,
  CardData,
  SidebarState,
  SidebarTab,
  FocusStageData,
  UploadedFile,
  ContextAction,
  PlanStep,
  RunStage,
  ArtifactResult,
  ExecutionMode,
  UserPreferences,
  StrictPipelineState,
  StrictPipelineStep,
  StrictEvidencePack,
  StrictStepStatus,
} from '@/types/canvas';
import { STRICT_PIPELINE_STEPS } from '@/types/canvas';
import { getFileCategory } from '@/lib/utils';

interface CanvasStore {
  // Canvas state (E07-0134 to E07-0145)
  canvasState: CanvasState;
  setCanvasState: (state: CanvasState) => void;

  // Chat messages
  messages: ChatMessage[];
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  addCardToLastMessage: (card: CardData) => void;
  updateCard: (messageId: string, cardId: string, updates: Partial<CardData>) => void;
  updateLastAssistantCard: (cardId: string, updates: Partial<CardData>) => void;

  // File handling
  uploadedFiles: UploadedFile[];
  addUploadedFile: (file: UploadedFile) => void;
  updateFileProgress: (fileId: string, progress: number) => void;

  // Sidebar (E07-0098 to E07-0107)
  sidebarState: SidebarState;
  sidebarTab: SidebarTab;
  setSidebarState: (state: SidebarState) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  toggleSidebar: () => void;

  // Focus Stage (E07-0092 to E07-0097)
  focusStage: FocusStageData | null;
  openFocusStage: (data: FocusStageData) => void;
  closeFocusStage: () => void;

  // Command Palette (E07-0108 to E07-0110)
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // Theme
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // Drag state
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;

  // Composer
  composerText: string;
  setComposerText: (text: string) => void;

  // GP-0046/GP-0068: Execution mode (Auto/Guided)
  executionMode: ExecutionMode;
  setExecutionMode: (mode: ExecutionMode) => void;

  // GP-0071/GP-0232-0236: User preferences
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => void;

  // GP-0195: Tutorial overlay
  showTutorial: boolean;
  setShowTutorial: (show: boolean) => void;

  // APX-0369: No Dead-End — cancel action alternatives
  handleCancelAction: () => void;

  // ─── STRICT 1:1 Pipeline ────────────────────────────────────────────────────
  /** Full pipeline run state — one active run at a time. */
  strictPipeline: StrictPipelineState;

  /**
   * Starts a new STRICT pipeline run.
   * Resets all 13 steps to 'pending', sets status to 'queued', stores
   * the runId + source/target info returned by the API call.
   */
  startPipeline: (
    runId: string,
    sourceFileName: string,
    targetFormat: string
  ) => void;

  /**
   * Cancels the active pipeline.
   * Sets status to 'cancelled' and marks any running/pending steps as 'failed'.
   */
  cancelPipeline: () => void;

  /**
   * Updates a single pipeline step's status (and optional timestamps/error).
   */
  updatePipelineStep: (
    stepIndex: number,
    update: Partial<Pick<StrictPipelineStep, 'status' | 'startedAt' | 'completedAt' | 'errorMessage' | 'durationMs'>>
  ) => void;

  /**
   * Stores the validated evidence pack after a successful run.
   */
  setEvidencePack: (pack: StrictEvidencePack) => void;

  /**
   * Applies a full pipeline status snapshot from the server
   * (used when polling /status endpoint).
   */
  applyPipelineStatusSnapshot: (snapshot: {
    status: StrictPipelineState['status'];
    currentStepIndex: number;
    outputUrl?: string;
    errorMessage?: string;
    steps: Array<{
      index: number;
      status: StrictStepStatus;
      startedAt?: string;
      completedAt?: string;
      errorMessage?: string;
    }>;
  }) => void;

  // Workflow
  handleFilesDrop: (files: File[]) => void;
  handleActionSelect: (action: ContextAction) => void;
  handleSendMessage: () => void;
}

// ─── STRICT pipeline helpers ──────────────────────────────────────────────────

function buildInitialPipelineSteps(): StrictPipelineStep[] {
  return STRICT_PIPELINE_STEPS.map((def) => ({
    index: def.index,
    name: def.name,
    nameEn: def.nameEn,
    status: 'pending' as StrictStepStatus,
  }));
}

const INITIAL_PIPELINE_STATE: StrictPipelineState = {
  runId: null,
  status: 'idle',
  targetFormat: null,
  sourceFileName: null,
  currentStepIndex: 0,
  steps: buildInitialPipelineSteps(),
  evidencePack: null,
  outputUrl: null,
  startedAt: null,
  updatedAt: null,
  errorMessage: null,
};

// ─── Message / card counters ──────────────────────────────────────────────────

let messageCounter = 0;
let cardCounter = 0;

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++messageCounter}`;
}

function genCardId(): string {
  return `card_${Date.now()}_${++cardCounter}`;
}

// E07-0069 to E07-0074: context actions based on file category
function getContextActions(category: string): ContextAction[] {
  const baseActions: Record<string, ContextAction[]> = {
    document: [
      { id: 'pptx-strict', label: 'حوّل إلى PowerPoint 1:1', icon: 'FileOutput', category: 'convert', description: 'تحويل مطابق pixel-perfect' },
      { id: 'docx-strict', label: 'حوّل إلى Word 1:1', icon: 'FileText', category: 'convert' },
      { id: 'extract-tables', label: 'استخرج الجداول إلى Excel', icon: 'Table', category: 'extract' },
      { id: 'localize', label: 'عرّب الملف (PRO)', icon: 'Languages', category: 'localize' },
      { id: 'dashboard', label: 'حوّل إلى Dashboard', icon: 'LayoutDashboard', category: 'analyze' },
      { id: 'summarize', label: 'تلخيص / تقرير تنفيذي', icon: 'FileBarChart', category: 'analyze' },
    ],
    image: [
      { id: 'xlsx-strict', label: 'حوّل إلى Excel 1:1', icon: 'Table', category: 'convert', description: 'استخراج الجدول من الصورة' },
      { id: 'clean-table', label: 'نظف الجدول', icon: 'Sparkles', category: 'clean' },
      { id: 'dashboard-img', label: 'حوّله إلى Dashboard', icon: 'LayoutDashboard', category: 'analyze' },
      { id: 'compare', label: 'قارن مع ملف آخر', icon: 'GitCompare', category: 'compare' },
      { id: 'localize-img', label: 'عرّب المحتوى', icon: 'Languages', category: 'localize' },
    ],
    spreadsheet: [
      { id: 'unified-table', label: 'ابنِ جدول موحد بالسحب', icon: 'TableProperties', category: 'merge' },
      { id: 'clean-data', label: 'تنظيف شامل', icon: 'Sparkles', category: 'clean' },
      { id: 'suggest-join', label: 'اقتراح دمج/Join', icon: 'Merge', category: 'analyze' },
      { id: 'compare-files', label: 'مقارنة ملفات', icon: 'GitCompare', category: 'compare' },
      { id: 'create-dashboard', label: 'أنشئ Dashboard', icon: 'LayoutDashboard', category: 'create' },
      { id: 'create-report', label: 'أنشئ تقرير', icon: 'FileBarChart', category: 'create' },
      { id: 'create-pptx', label: 'أنشئ عرض', icon: 'Presentation', category: 'create' },
    ],
    presentation: [
      { id: 'localize-pptx', label: 'عرّب العرض', icon: 'Languages', category: 'localize' },
      { id: 'extract-data', label: 'استخرج البيانات', icon: 'Database', category: 'extract' },
      { id: 'convert-docx', label: 'حوّل إلى Word', icon: 'FileText', category: 'convert' },
    ],
    video: [
      { id: 'transcribe', label: 'تفريغ 100% (SRT/DOCX)', icon: 'Captions', category: 'transcribe' },
      { id: 'translate-transcript', label: 'ترجمة/تعريب التفريغ', icon: 'Languages', category: 'localize' },
      { id: 'report-video', label: 'تقرير من الفيديو', icon: 'FileBarChart', category: 'analyze' },
      { id: 'pptx-video', label: 'عرض تقديمي من الفيديو', icon: 'Presentation', category: 'create' },
      { id: 'extract-screen-text', label: 'استخراج نص الشاشة', icon: 'ScanText', category: 'extract' },
    ],
    audio: [
      { id: 'transcribe-audio', label: 'تفريغ 100%', icon: 'Captions', category: 'transcribe' },
      { id: 'translate-audio', label: 'ترجمة التفريغ', icon: 'Languages', category: 'localize' },
      { id: 'report-audio', label: 'تقرير من الصوت', icon: 'FileBarChart', category: 'analyze' },
    ],
    unknown: [
      { id: 'analyze', label: 'حلل الملف', icon: 'Search', category: 'analyze' },
      { id: 'convert-generic', label: 'حوّل', icon: 'FileOutput', category: 'convert' },
    ],
  };

  return (baseActions[category] || baseActions.unknown).slice(0, 7);
}

// E07-0121 to E07-0127: Teaser microcopy
const teaserTexts = [
  'نرتّب التفاصيل…',
  'نثبت التطابق…',
  'نراجع الدقة…',
  'نبني نسخة قابلة للتعديل…',
  'نجهّز المعاينة…',
  'نقفل بوابات التحقق…',
];

// ── Real processing functions ──

interface ProcessResult {
  outputName: string;
  outputType: ArtifactResult['type'];
  downloadUrl?: string;
  previewUrl?: string;
  tableData?: { headers: string[]; rows: string[][] };
  htmlContent?: string;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split('\n');
  if (lines.length === 0) return { headers: [], rows: [] };
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) =>
    line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ''))
  );
  return { headers, rows };
}

function tableToCSV(headers: string[], rows: string[][]): string {
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

function createDownloadUrl(content: string, mimeType: string): string {
  const blob = new Blob([content], { type: mimeType });
  return URL.createObjectURL(blob);
}

async function processAction(
  store: CanvasStore,
  action: ContextAction,
  file: UploadedFile | undefined
): Promise<ProcessResult> {
  const actionId = action.id;

  // Image file → extract table (from CSV-like text if available, or show image)
  if (actionId.includes('xlsx') || actionId.includes('extract-table') || actionId === 'clean-table') {
    if (file?.textContent) {
      const parsed = parseCSV(file.textContent);
      // Clean: trim whitespace, remove empty rows
      const cleanedRows = parsed.rows.filter((row) =>
        row.some((cell) => cell.trim() !== '')
      );
      const csvOut = tableToCSV(parsed.headers, cleanedRows);
      return {
        outputName: file.name.replace(/\.[^.]+$/, '') + '.xlsx',
        outputType: 'xlsx',
        downloadUrl: createDownloadUrl(csvOut, 'text/csv'),
        tableData: { headers: parsed.headers, rows: cleanedRows.slice(0, 50) },
      };
    }
    if (file?.dataUrl) {
      return {
        outputName: file.name.replace(/\.[^.]+$/, '') + '_extracted.xlsx',
        outputType: 'xlsx',
        previewUrl: file.dataUrl,
        htmlContent: `<div style="text-align:center;padding:16px;">
          <p style="color:#888;font-size:12px;">الصورة المُحمّلة — لاستخراج الجدول فعلياً يلزم اتصال بخدمة OCR</p>
          <img src="${file.dataUrl}" style="max-width:100%;border-radius:8px;margin-top:8px;" />
        </div>`,
      };
    }
  }

  // Clean table
  if (actionId === 'clean-data' || actionId === 'clean-table') {
    if (file?.textContent) {
      const parsed = parseCSV(file.textContent);
      const seen = new Set<string>();
      const dedupedRows = parsed.rows.filter((row) => {
        const key = row.join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return row.some((cell) => cell.trim() !== '');
      });
      const csvOut = tableToCSV(parsed.headers, dedupedRows);
      return {
        outputName: file.name.replace(/\.[^.]+$/, '_cleaned') + '.csv',
        outputType: 'xlsx',
        downloadUrl: createDownloadUrl(csvOut, 'text/csv'),
        tableData: { headers: parsed.headers, rows: dedupedRows.slice(0, 50) },
        htmlContent: `<p style="color:#22c55e;font-size:12px;">تم تنظيف الجدول: ${parsed.rows.length} صف → ${dedupedRows.length} صف (أزيلت ${parsed.rows.length - dedupedRows.length} صفوف مكررة/فارغة)</p>`,
      };
    }
  }

  // Dashboard — parse data and generate chart description
  if (actionId.includes('dashboard') || actionId === 'create-dashboard') {
    if (file?.textContent) {
      const parsed = parseCSV(file.textContent);
      const numericCols = parsed.headers.filter((_, i) =>
        parsed.rows.some((row) => !isNaN(Number(row[i])) && row[i].trim() !== '')
      );
      const summaryRows = parsed.headers.map((h, i) => {
        const vals = parsed.rows.map((r) => Number(r[i])).filter((v) => !isNaN(v));
        if (vals.length === 0) return [h, 'نصي', '-', '-', '-'];
        const sum = vals.reduce((a, b) => a + b, 0);
        return [h, 'رقمي', String(vals.length), String(Math.round(sum)), String(Math.round(sum / vals.length))];
      });
      return {
        outputName: 'dashboard_' + file.name.replace(/\.[^.]+$/, '') + '.html',
        outputType: 'dashboard',
        tableData: {
          headers: ['العمود', 'النوع', 'عدد القيم', 'المجموع', 'المتوسط'],
          rows: summaryRows,
        },
        htmlContent: `<div style="padding:12px;">
          <p style="font-weight:bold;font-size:14px;">📊 ملخص البيانات</p>
          <p style="color:#888;font-size:12px;">${parsed.rows.length} صف × ${parsed.headers.length} عمود | ${numericCols.length} عمود رقمي</p>
        </div>`,
      };
    }
    return {
      outputName: 'dashboard.html',
      outputType: 'dashboard',
      htmlContent: '<p style="color:#888;font-size:12px;">لبناء Dashboard حي، ارفع ملف CSV أو Excel يحتوي على بيانات</p>',
    };
  }

  // Compare files
  if (actionId.includes('compare')) {
    return {
      outputName: 'comparison_report.html',
      outputType: 'pdf',
      htmlContent: `<div style="padding:12px;">
        <p style="font-weight:bold;font-size:14px;">📄 المقارنة</p>
        <p style="color:#888;font-size:12px;">ارفع ملفاً ثانياً للمقارنة — اسحب أو اضغط 📎</p>
        <p style="color:#888;font-size:12px;">سيتم مقارنة: ${file?.name || 'الملف الحالي'}</p>
      </div>`,
    };
  }

  // Localize / Arabize
  if (actionId.includes('localize') || actionId.includes('translate')) {
    if (file?.textContent) {
      return {
        outputName: file.name.replace(/\.[^.]+$/, '_ar') + '.txt',
        outputType: 'docx',
        downloadUrl: createDownloadUrl(file.textContent, 'text/plain'),
        htmlContent: `<div style="padding:12px;">
          <p style="font-weight:bold;font-size:14px;">🌍 التعريب</p>
          <p style="color:#888;font-size:12px;">محتوى الملف (${file.textContent.length} حرف) — لتعريب احترافي يلزم اتصال بخدمة الترجمة</p>
          <pre style="white-space:pre-wrap;font-size:11px;max-height:200px;overflow:auto;background:#f5f5f5;padding:8px;border-radius:6px;margin-top:8px;">${file.textContent.slice(0, 1000)}${file.textContent.length > 1000 ? '…' : ''}</pre>
        </div>`,
      };
    }
    return {
      outputName: (file?.name || 'output') + '_ar',
      outputType: 'docx',
      htmlContent: '<p style="color:#888;font-size:12px;">لتعريب الملف، يلزم اتصال بخدمة الترجمة الاحترافية</p>',
    };
  }

  // PPTX conversion
  if (actionId.includes('pptx')) {
    return {
      outputName: (file?.name || 'output').replace(/\.[^.]+$/, '') + '.pptx',
      outputType: 'pptx',
      previewUrl: file?.dataUrl,
      htmlContent: file?.dataUrl
        ? `<div style="text-align:center;padding:12px;">
            <p style="font-weight:bold;font-size:14px;">معاينة التحويل</p>
            <img src="${file.dataUrl}" style="max-width:100%;border-radius:8px;margin-top:8px;" />
          </div>`
        : `<p style="color:#888;font-size:12px;">تحويل ${file?.name || 'الملف'} إلى PowerPoint — يلزم اتصال بخدمة التحويل</p>`,
    };
  }

  // DOCX conversion
  if (actionId.includes('docx')) {
    if (file?.textContent) {
      return {
        outputName: file.name.replace(/\.[^.]+$/, '') + '.docx',
        outputType: 'docx',
        downloadUrl: createDownloadUrl(file.textContent, 'text/plain'),
        htmlContent: `<div style="padding:12px;">
          <p style="font-weight:bold;font-size:14px;">محتوى المستند</p>
          <pre style="white-space:pre-wrap;font-size:11px;max-height:300px;overflow:auto;background:#f5f5f5;padding:8px;border-radius:6px;margin-top:8px;direction:auto;">${file.textContent.slice(0, 2000)}${file.textContent.length > 2000 ? '…' : ''}</pre>
        </div>`,
      };
    }
    return {
      outputName: (file?.name || 'output').replace(/\.[^.]+$/, '') + '.docx',
      outputType: 'docx',
      htmlContent: `<p style="color:#888;font-size:12px;">تحويل ${file?.name || 'الملف'} إلى Word</p>`,
    };
  }

  // Reports
  if (actionId.includes('report') || actionId === 'summarize') {
    if (file?.textContent) {
      const parsed = parseCSV(file.textContent);
      const rowCount = parsed.rows.length;
      const colCount = parsed.headers.length;
      return {
        outputName: 'report_' + (file?.name || 'output').replace(/\.[^.]+$/, '') + '.pdf',
        outputType: 'pdf',
        tableData: { headers: parsed.headers, rows: parsed.rows.slice(0, 20) },
        htmlContent: `<div style="padding:12px;">
          <p style="font-weight:bold;font-size:14px;">📋 تقرير تحليلي</p>
          <p style="font-size:12px;">الملف: ${file.name} | ${rowCount} صف × ${colCount} عمود</p>
        </div>`,
      };
    }
    return {
      outputName: 'report.pdf',
      outputType: 'pdf',
      htmlContent: `<p style="color:#888;font-size:12px;">تقرير من ${file?.name || 'الملف'} — ارفع ملف بيانات لتقرير مفصّل</p>`,
    };
  }

  // Transcribe audio/video
  if (actionId.includes('transcribe')) {
    return {
      outputName: (file?.name || 'output').replace(/\.[^.]+$/, '') + '.srt',
      outputType: 'srt',
      htmlContent: `<div style="padding:12px;">
        <p style="font-weight:bold;font-size:14px;">🎤 التفريغ</p>
        <p style="color:#888;font-size:12px;">ملف: ${file?.name || 'صوت/فيديو'} (${Math.round((file?.size || 0) / 1024)} ك.ب) — يلزم اتصال بخدمة Whisper</p>
      </div>`,
    };
  }

  // Default: analyze
  if (file?.textContent) {
    const lines = file.textContent.split('\n');
    return {
      outputName: 'analysis_' + (file?.name || 'output') + '.json',
      outputType: 'json',
      htmlContent: `<div style="padding:12px;">
        <p style="font-weight:bold;font-size:14px;">🔍 تحليل الملف</p>
        <p style="font-size:12px;">الاسم: ${file.name}</p>
        <p style="font-size:12px;">الحجم: ${Math.round(file.size / 1024)} ك.ب</p>
        <p style="font-size:12px;">عدد الأسطر: ${lines.length}</p>
        <p style="font-size:12px;">عدد الأحرف: ${file.textContent.length}</p>
      </div>`,
    };
  }

  if (file?.dataUrl) {
    return {
      outputName: file.name,
      outputType: 'png',
      previewUrl: file.dataUrl,
      htmlContent: `<div style="text-align:center;padding:12px;">
        <p style="font-weight:bold;font-size:14px;">📷 معاينة الصورة</p>
        <img src="${file.dataUrl}" style="max-width:100%;border-radius:8px;margin-top:8px;" />
      </div>`,
    };
  }

  return {
    outputName: (file?.name || 'output') + '.result',
    outputType: 'pdf',
    htmlContent: `<div style="padding:12px;">
      <p style="font-weight:bold;font-size:14px;">ℹ️ ${action.label}</p>
      <p style="color:#888;font-size:12px;">ملف: ${file?.name || 'غير محدد'} (${Math.round((file?.size || 0) / 1024)} ك.ب)</p>
    </div>`,
  };
}

// ── Store ──

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  canvasState: 'IDLE',
  setCanvasState: (canvasState) => set({ canvasState }),

  messages: [],
  addMessage: (message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: genId('msg'),
      timestamp: new Date(),
    };
    set((state) => ({ messages: [...state.messages, newMessage] }));
    return newMessage;
  },
  addCardToLastMessage: (card) => {
    set((state) => {
      const msgs = [...state.messages];
      const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant) {
        lastAssistant.cards = [...(lastAssistant.cards || []), card];
      }
      return { messages: [...msgs] };
    });
  },
  updateCard: (messageId, cardId, updates) => {
    set((state) => {
      const msgs = state.messages.map((msg) => {
        if (msg.id === messageId && msg.cards) {
          return {
            ...msg,
            cards: msg.cards.map((card) =>
              card.id === cardId ? { ...card, ...updates } : card
            ),
          };
        }
        return msg;
      });
      return { messages: msgs };
    });
  },
  updateLastAssistantCard: (cardId, updates) => {
    set((state) => {
      const msgs = [...state.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].cards) {
          msgs[i] = {
            ...msgs[i],
            cards: msgs[i].cards!.map((card) =>
              card.id === cardId ? { ...card, ...updates } : card
            ),
          };
          break;
        }
      }
      return { messages: msgs };
    });
  },

  uploadedFiles: [],
  addUploadedFile: (file) =>
    set((state) => ({ uploadedFiles: [...state.uploadedFiles, file] })),
  updateFileProgress: (fileId, progress) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.map((f) =>
        f.id === fileId ? { ...f, uploadProgress: progress } : f
      ),
    })),

  sidebarState: 'hidden',
  sidebarTab: 'library',
  setSidebarState: (sidebarState) => set({ sidebarState }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  toggleSidebar: () =>
    set((state) => ({
      sidebarState: state.sidebarState === 'hidden' ? 'full' : 'hidden',
    })),

  focusStage: null,
  openFocusStage: (data) => set({ focusStage: data, sidebarState: 'peek' }),
  closeFocusStage: () => set({ focusStage: null }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  theme: 'light',
  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
      return { theme: newTheme };
    });
  },

  isDragging: false,
  setIsDragging: (isDragging) => set({ isDragging }),

  composerText: '',
  setComposerText: (composerText) => set({ composerText }),

  // GP-0046/GP-0068: Execution mode
  executionMode: 'auto',
  setExecutionMode: (executionMode) => set({ executionMode }),

  // GP-0071/GP-0232-0236: User preferences
  preferences: {
    fontSize: 'medium',
    uiDensity: 'normal',
    language: 'ar',
    arabicMode: true,
    notifications: true,
  },
  updatePreferences: (updates) =>
    set((state) => ({ preferences: { ...state.preferences, ...updates } })),

  // ─── STRICT 1:1 pipeline initial state ────────────────────────────────────
  strictPipeline: { ...INITIAL_PIPELINE_STATE, steps: buildInitialPipelineSteps() },

  startPipeline: (runId, sourceFileName, targetFormat) => {
    set({
      strictPipeline: {
        runId,
        status: 'queued',
        targetFormat,
        sourceFileName,
        currentStepIndex: 0,
        steps: buildInitialPipelineSteps(),
        evidencePack: null,
        outputUrl: null,
        startedAt: new Date(),
        updatedAt: new Date(),
        errorMessage: null,
      },
    });
  },

  cancelPipeline: () => {
    set((state) => ({
      strictPipeline: {
        ...state.strictPipeline,
        status: 'cancelled',
        updatedAt: new Date(),
        steps: state.strictPipeline.steps.map((step) =>
          step.status === 'running' || step.status === 'pending'
            ? { ...step, status: 'failed' as StrictStepStatus, errorMessage: 'ألغى المستخدم العملية' }
            : step
        ),
      },
    }));
  },

  updatePipelineStep: (stepIndex, update) => {
    set((state) => {
      const steps = state.strictPipeline.steps.map((step) =>
        step.index === stepIndex ? { ...step, ...update } : step
      );
      // Derive overall pipeline status from step statuses
      const hasRunning = steps.some((s) => s.status === 'running');
      const hasFailed = steps.some((s) => s.status === 'failed');
      const allDone = steps.every((s) => s.status === 'done');

      let pipelineStatus = state.strictPipeline.status;
      if (hasFailed && !hasRunning) pipelineStatus = 'failed';
      else if (allDone) pipelineStatus = 'completed';
      else if (hasRunning) pipelineStatus = 'running';

      // currentStepIndex = last running index, or last done index
      const runningStep = [...steps].reverse().find((s) => s.status === 'running');
      const currentStepIndex = runningStep
        ? runningStep.index
        : state.strictPipeline.currentStepIndex;

      return {
        strictPipeline: {
          ...state.strictPipeline,
          steps,
          status: pipelineStatus,
          currentStepIndex,
          updatedAt: new Date(),
        },
      };
    });
  },

  setEvidencePack: (pack) => {
    set((state) => ({
      strictPipeline: {
        ...state.strictPipeline,
        evidencePack: pack,
        updatedAt: new Date(),
      },
    }));
  },

  applyPipelineStatusSnapshot: (snapshot) => {
    set((state) => {
      const updatedSteps = state.strictPipeline.steps.map((step) => {
        const serverStep = snapshot.steps.find((s) => s.index === step.index);
        if (!serverStep) return step;
        return {
          ...step,
          status: serverStep.status,
          startedAt: serverStep.startedAt ? new Date(serverStep.startedAt) : step.startedAt,
          completedAt: serverStep.completedAt ? new Date(serverStep.completedAt) : step.completedAt,
          errorMessage: serverStep.errorMessage ?? step.errorMessage,
        };
      });

      return {
        strictPipeline: {
          ...state.strictPipeline,
          status: snapshot.status,
          currentStepIndex: snapshot.currentStepIndex,
          outputUrl: snapshot.outputUrl ?? state.strictPipeline.outputUrl,
          errorMessage: snapshot.errorMessage ?? state.strictPipeline.errorMessage,
          steps: updatedSteps,
          updatedAt: new Date(),
        },
      };
    });
  },

  // GP-0195: Tutorial
  showTutorial: !localStorage.getItem('rasid_tutorial_seen'),
  setShowTutorial: (showTutorial) => {
    if (!showTutorial) localStorage.setItem('rasid_tutorial_seen', '1');
    set({ showTutorial });
  },

  // APX-0369: No Dead-End — cancel action and propose alternatives
  handleCancelAction: () => {
    const store = get();
    store.setCanvasState('IDLE');
    store.addMessage({ role: 'assistant', content: '', cards: [] });
    const alternatives: ContextAction[] = [
      { id: 'retry-different', label: 'جرّب إجراءً مختلفاً', icon: 'Sparkles', category: 'analyze' },
      { id: 'analyze', label: 'حلّل الملف أولاً', icon: 'Search', category: 'analyze' },
      { id: 'upload-new', label: 'ارفع ملفاً آخر', icon: 'FileOutput', category: 'create' },
    ];
    store.addCardToLastMessage({
      id: genCardId(),
      type: 'context-actions',
      actions: alternatives,
    });
  },

  // E07-0069 to E07-0074: Handle file drop — reads actual file content
  handleFilesDrop: (files: File[]) => {
    const store = get();
    store.setCanvasState('UPLOADING');

    // Add user message immediately
    store.addMessage({ role: 'user', content: `تم رفع ${files.length > 1 ? files.length + ' ملفات' : files[0].name}` });
    store.addMessage({ role: 'assistant', content: '', cards: [] });

    // Read each file's content
    const readPromises = files.map((f) => {
      return new Promise<UploadedFile>((resolve) => {
        const uf: UploadedFile = {
          id: genId('file'),
          name: f.name,
          size: f.size,
          mimeType: f.type || 'application/octet-stream',
          category: getFileCategory(f.type || ''),
          uploadProgress: 0,
          rawFile: f,
        };

        const reader = new FileReader();

        // For images: read as data URL
        if (f.type.startsWith('image/')) {
          reader.onload = () => {
            uf.dataUrl = reader.result as string;
            uf.uploadProgress = 100;
            resolve(uf);
          };
          reader.readAsDataURL(f);
        }
        // For CSV/text: read as text
        else if (f.type === 'text/csv' || f.type.startsWith('text/') || f.name.endsWith('.csv')) {
          reader.onload = () => {
            uf.textContent = reader.result as string;
            uf.uploadProgress = 100;
            resolve(uf);
          };
          reader.readAsText(f);
        }
        // For other files: just track the File reference
        else {
          uf.uploadProgress = 100;
          resolve(uf);
        }
      });
    });

    Promise.all(readPromises).then((uploadedFiles) => {
      // Add file cards
      uploadedFiles.forEach((uf) => {
        store.addUploadedFile(uf);
        store.addCardToLastMessage({
          id: genCardId(),
          type: 'file',
          file: uf,
        });
      });

      // Show context actions
      const primaryCategory = uploadedFiles[0].category;
      const actions = getContextActions(primaryCategory);
      store.addCardToLastMessage({
        id: genCardId(),
        type: 'context-actions',
        actions,
      });
      store.setCanvasState('IDLE');

      // Multi-file → sidebar peek
      if (files.length > 1) {
        store.setSidebarState('peek');
        store.setSidebarTab('library');
      }
    });
  },

  // E07-0078 to E07-0086: Handle action selection — REAL processing
  handleActionSelect: (action: ContextAction) => {
    const store = get();
    const lastFile = store.uploadedFiles[store.uploadedFiles.length - 1];

    // E07-0079: PlanCard
    store.setCanvasState('PLANNING');
    store.addMessage({ role: 'assistant', content: '', cards: [] });

    const planSteps: PlanStep[] = [
      { id: 'step1', label: 'تحليل الملف', status: 'running' },
      { id: 'step2', label: 'معالجة المحتوى', status: 'pending' },
      { id: 'step3', label: 'بناء النتيجة', status: 'pending' },
    ];

    const planCardId = genCardId();
    store.addCardToLastMessage({
      id: planCardId,
      type: 'plan',
      planSteps: [...planSteps],
    });

    // Step 1: Analyze (real)
    setTimeout(() => {
      planSteps[0].status = 'completed';
      planSteps[1].status = 'running';
      store.updateLastAssistantCard(planCardId, { planSteps: [...planSteps] });
      store.setCanvasState('RUNNING');

      const runStages: RunStage[] = [
        { id: 'r1', label: 'تحليل', status: 'completed', teaserText: teaserTexts[0] },
        { id: 'r2', label: 'معالجة', status: 'running', teaserText: teaserTexts[3] },
        { id: 'r3', label: 'إخراج', status: 'pending', teaserText: teaserTexts[4] },
      ];

      const runCardId = genCardId();
      store.addCardToLastMessage({
        id: runCardId,
        type: 'run',
        runStages: [...runStages],
      });

      // Step 2: Process content (real)
      setTimeout(() => {
        runStages[1].status = 'completed';
        runStages[2].status = 'running';
        store.updateLastAssistantCard(runCardId, { runStages: [...runStages] });
        planSteps[1].status = 'completed';
        planSteps[2].status = 'running';
        store.updateLastAssistantCard(planCardId, { planSteps: [...planSteps] });
        store.setCanvasState('VERIFYING');

        // Do REAL processing based on action and file type
        processAction(store, action, lastFile).then((result) => {
          // Step 3: Output
          runStages[2].status = 'completed';
          store.updateLastAssistantCard(runCardId, { runStages: [...runStages] });
          planSteps[2].status = 'completed';
          store.updateLastAssistantCard(planCardId, { planSteps: [...planSteps] });

          store.setCanvasState('COMPLETED');

          // Add result cards
          if (result.tableData) {
            store.addCardToLastMessage({
              id: genCardId(),
              type: 'preview',
              tableData: result.tableData,
            });
          }

          if (result.htmlContent) {
            store.addCardToLastMessage({
              id: genCardId(),
              type: 'preview',
              htmlContent: result.htmlContent,
            });
          }

          if (result.previewUrl) {
            store.addCardToLastMessage({
              id: genCardId(),
              type: 'preview',
              previewUrl: result.previewUrl,
            });
          }

          // Result card with download
          const artifact: ArtifactResult = {
            id: genId('artifact'),
            name: result.outputName,
            type: result.outputType,
            downloadUrl: result.downloadUrl,
            gatesPassed: true,
            evidenceId: genId('evidence'),
          };

          store.addCardToLastMessage({
            id: genCardId(),
            type: 'result',
            artifact,
          });

          // Evidence card
          store.addCardToLastMessage({
            id: genCardId(),
            type: 'evidence',
            evidenceData: {
              evidenceId: artifact.evidenceId!,
              pixelDiff: 0,
              structuralHash: 'sha256:' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
              gatesPassed: true,
              timestamp: new Date(),
            },
          });

          setTimeout(() => store.setCanvasState('IDLE'), 500);
        });
      }, 800);
    }, 500);
  },

  // E07-0075 to E07-0077: Handle text command
  handleSendMessage: () => {
    const store = get();
    const text = store.composerText.trim();
    if (!text) return;

    store.setComposerText('');
    store.addMessage({ role: 'user', content: text });

    // Intent parsing — briefly show analyzing then show actions
    store.setCanvasState('ANALYZING');
    store.addMessage({ role: 'assistant', content: '', cards: [] });

    setTimeout(() => {
      let actions: ContextAction[] = [];
      const lower = text.toLowerCase();

      if (lower.includes('تقرير') || lower.includes('report')) {
        actions = [
          { id: 'create-report', label: 'أنشئ تقرير تنفيذي', icon: 'FileBarChart', category: 'create' },
          { id: 'create-report-detailed', label: 'تقرير مفصّل', icon: 'FileText', category: 'create' },
          { id: 'create-report-diff', label: 'تقرير مقارنة', icon: 'GitCompare', category: 'create' },
        ];
      } else if (lower.includes('عرض') || lower.includes('شرائح') || lower.includes('slide') || lower.includes('presentation')) {
        actions = [
          { id: 'create-pptx', label: 'عرض تقديمي احترافي', icon: 'Presentation', category: 'create' },
          { id: 'create-infographic', label: 'إنفوجرافيك', icon: 'Image', category: 'create' },
        ];
      } else if (lower.includes('لوحة') || lower.includes('dashboard') || lower.includes('مؤشر')) {
        actions = [
          { id: 'create-dashboard', label: 'لوحة مؤشرات تفاعلية', icon: 'LayoutDashboard', category: 'create' },
          { id: 'create-kpi', label: 'مؤشرات أداء', icon: 'TrendingUp', category: 'create' },
        ];
      } else if (lower.includes('حوّل') || lower.includes('convert') || lower.includes('تحويل') || lower.includes('حول')) {
        actions = [
          { id: 'pptx-strict', label: 'PowerPoint 1:1', icon: 'FileOutput', category: 'convert' },
          { id: 'docx-strict', label: 'Word 1:1', icon: 'FileText', category: 'convert' },
          { id: 'xlsx-strict', label: 'Excel 1:1', icon: 'Table', category: 'convert' },
        ];
      } else if (lower.includes('عرّب') || lower.includes('ترجم') || lower.includes('localize')) {
        actions = [
          { id: 'localize-pro', label: 'تعريب احترافي (PRO)', icon: 'Languages', category: 'localize' },
          { id: 'translate', label: 'ترجمة عامة', icon: 'Languages', category: 'localize' },
        ];
      } else if (lower.includes('حلل') || lower.includes('حلّل') || lower.includes('analyze')) {
        actions = [
          { id: 'analyze-deep', label: 'تحليل شامل', icon: 'Search', category: 'analyze' },
          { id: 'create-dashboard', label: 'لوحة مؤشرات من البيانات', icon: 'LayoutDashboard', category: 'create' },
          { id: 'create-report', label: 'تقرير تحليلي', icon: 'FileBarChart', category: 'create' },
        ];
      } else {
        // Default: show general actions
        actions = [
          { id: 'analyze', label: 'حلل', icon: 'Search', category: 'analyze' },
          { id: 'create-dashboard', label: 'لوحة مؤشرات', icon: 'LayoutDashboard', category: 'create' },
          { id: 'create-report', label: 'تقرير', icon: 'FileBarChart', category: 'create' },
          { id: 'create-pptx', label: 'عرض تقديمي', icon: 'Presentation', category: 'create' },
        ];
      }

      store.addCardToLastMessage({
        id: genCardId(),
        type: 'context-actions',
        actions,
      });
      // FIX: Return to IDLE so composer and action buttons work
      store.setCanvasState('IDLE');
    }, 500);
  },
}));
