"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import { RasedCanvasProvider } from "@/state/RasedCanvasProvider";
import { useRasedCanvas } from "@/state/useRasedCanvas";
import {
  ArrowLeft,
  Bot,
  ChevronLeft,
  Command,
  Download,
  Loader2,
  MoonStar,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  PinOff,
  RefreshCcw,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  SunMedium,
  UploadCloud,
  X,
} from "lucide-react";
import { getDatasets, getDatasetById, importDataset, type Dataset, type DatasetDetail } from "@/lib/api/data";
import { addReportSection, buildReport, createReport, exportReport } from "@/lib/api/reporting";
import { exportPresentation, generatePresentationFromAi, generatePresentationFromData, generatePresentationFromFile } from "@/lib/api/presentation";
import { analyzeDataset } from "@/lib/api/dashboard";
import { applyRtlContent, detectTextLanguage, translatePlainText } from "@/lib/api/localization";
import { convertCsvToExcel, convertExcelToCsv, convertExcelToPdf, convertMarkdownToHtml, convertPdfToWord, convertWordToPdf } from "@/lib/api/conversion";
import { extractMultimodal } from "@/lib/api/multimodal";
import { analyzeVisualImage, compareVisualReplication, reconstructDashboardFromImage } from "@/lib/api/replication";
import {
  askSurfaceAssistant,
  rasedDispatchUiActions,
  rasedEvidencePack,
  type RasedArtifactRef,
  rasedIntentParse,
  rasedPlanActionGraph,
  rasedPreferenceGet,
  rasedSyncUiState,
  rasedTourEnd,
  rasedTourStart,
  rasedTourStep,
  type RasedAssetRef,
  type RasedTourStep,
} from "@/lib/api/ai";
import { isE2EAuthBypassed } from "@/lib/auth/e2e";
import { buildHomeFileBundle, type HomeActionId, type HomeCapabilityAction, type HomeFileBundle } from "@/lib/home/home-file-capabilities";
import { OFFICIAL_MARK_URL, OFFICIAL_PLATFORM_NAME, OFFICIAL_PLATFORM_TAGLINE } from "@/lib/branding";
import { applyRasedUiActions, buildHomeGuidedTour, buildHomeUiSnapshot } from "@/lib/rased-ui";
import type { Attachment, ConversationMessage, FocusArtifactKind, JobEntry, JobEvidence, SidebarTab, ViewId } from "@/state/rasedCanvas.types";
import {
  CanvasActionsCard,
  CanvasConversationCard,
  CanvasEvidenceCard,
  CanvasFileCard,
  CanvasFocusRail,
  CanvasPlanCard,
  CanvasPreviewCard,
  CanvasResultCard,
  CanvasRunCard,
  CanvasSidebarTabButton,
  CanvasWelcomeCard,
} from "@/components/workspaces/RasedCanvasCards";
import { RasedGuidedTourOverlay } from "@/components/assistant/RasedGuidedTourOverlay";

type DatasetState = { fileKey: string; importResult: { datasetId: string; name: string; rowCount: number; columnCount: number; status: string; warnings: string[] }; detail: DatasetDetail };
type OutputAction = { kind: "route" | "download"; label: string; href: string; downloadName?: string };
type ResultState = { id: string; actionId: HomeActionId; status: "success" | "error"; title: string; body: string; chips: string[]; previewText?: string; previewImage?: string; outputs?: OutputAction[]; executedAt: string };
type ActivityItem = { id: string; label: string; note: string; status: "success" | "error"; executedAt: string; source: "guided" | "assistant" };
type AssistantNotice = { title: string; body: string; chips: string[]; tone: "neutral" | "success" | "error" };
type CommandPaletteItem = { id: string; label: string; description: string; kind: "action" | "route" | "assistant"; actionId?: HomeActionId; href?: string; prompt?: string };
type GuidedTourState = { sessionId: string; steps: RasedTourStep[]; stepIndex: number; mode: "explain" | "coach" | "executor" };

const ACCEPTED_FILES: Accept = {
  "text/csv": [".csv"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "text/html": [".html", ".htm"],
  "application/json": [".json"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/bmp": [".bmp"],
  "image/gif": [".gif"],
  "image/tiff": [".tiff"],
};

const defaultNotice: AssistantNotice = {
  title: "ابدأ من ملف واحد",
  body: "اسحب الملف هنا أو اختره يدويًا. بعد الاكتشاف سأعرض أفضل الخطوات فقط، وبالعربية.",
  chips: ["رفع ملف", "كشف النوع", "إجراء موجّه"],
  tone: "neutral",
};

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}`;
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

async function toRasedAssetRef(file: File): Promise<RasedAssetRef> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

  return {
    asset_id: fileKey(file).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 120),
    uri: file.name,
    mime: file.type || "application/octet-stream",
    sha256: hash,
  };
}

function normalizeArabicText(value: string) {
  return value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
}

function actionChipLabel(actionId: HomeActionId) {
  switch (actionId) {
    case "import-dataset": return "إضافة إلى البيانات";
    case "analyze-dataset": return "تحليل البيانات";
    case "build-report": return "إنشاء تقرير";
    case "generate-data-presentation": return "عرض من البيانات";
    case "generate-file-presentation": return "عرض من الملف";
    case "generate-ai-presentation": return "عرض ذكي";
    case "extract-exact": return "استخراج النص";
    case "extract-steps": return "استخراج الخطوات";
    case "translate-arabic": return "تعريب";
    case "apply-rtl": return "تنسيق عربي";
    case "convert-markdown-html": return "تحويل إلى HTML";
    case "convert-pdf-word": return "تحويل إلى وورد";
    case "convert-word-pdf": return "تحويل إلى PDF";
    case "convert-excel-pdf": return "إكسل إلى PDF";
    case "convert-csv-excel": return "CSV إلى إكسل";
    case "convert-excel-csv": return "إكسل إلى CSV";
    case "analyze-visual": return "تحليل بصري";
    case "reconstruct-dashboard": return "لوحة مؤشرات";
    case "compare-visuals": return "مطابقة صارمة";
    default: return "تنفيذ";
  }
}

function toneClass(tone: AssistantNotice["tone"]) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "error") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-slate-200 bg-slate-50 text-slate-900";
}

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
}

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
    return maybeError.response?.data?.error ?? maybeError.response?.data?.message ?? maybeError.message ?? "تعذر إكمال التنفيذ عبر المسار الحقيقي.";
  }
  return "تعذر إكمال التنفيذ عبر المسار الحقيقي.";
}

function workflowLabel(activeJob: JobEntry | null, resultReady: boolean) {
  if (!activeJob) return "بانتظار";
  if (activeJob.stage === "failed") return "تعثر";
  if (activeJob.stage === "planning" || activeJob.stage === "analyzing") return "تهيئة";
  if (activeJob.stage === "running") return "تنفيذ";
  if (activeJob.stage === "verifying") return "تحقق";
  if (activeJob.stage === "exporting") return "تجهيز";
  if (activeJob.stage === "completed" || resultReady) return "مكتمل";
  return "تنفيذ";
}

function stageLabel(activeJob: JobEntry | null, resultReady: boolean) {
  const state = workflowLabel(activeJob, resultReady);
  if (state === "تهيئة") return "نرتّب المسار";
  if (state === "تنفيذ") return "قيد البناء";
  if (state === "تحقق") return "قيد التحقق";
  if (state === "تجهيز") return "قيد التجهيز";
  if (state === "مكتمل") return "مكتمل";
  if (state === "تعثر") return "فشل التنفيذ";
  return "بانتظار";
}

function fileToAttachment(file: File): Promise<Attachment> {
  return toRasedAssetRef(file).then((asset) => ({
    assetId: asset.asset_id,
    name: file.name,
    mime: file.type || "application/octet-stream",
    sizeBytes: file.size,
    sha256: asset.sha256,
  }));
}

function inferResultArtifactKind(actionId: HomeActionId | null): FocusArtifactKind {
  switch (actionId) {
    case "reconstruct-dashboard":
    case "analyze-dataset":
      return "dashboard";
    case "build-report":
    case "convert-pdf-word":
      return "docx";
    case "convert-word-pdf":
    case "convert-excel-pdf":
      return "pdf";
    case "convert-csv-excel":
    case "convert-excel-csv":
    case "import-dataset":
      return "xlsx";
    case "generate-data-presentation":
    case "generate-file-presentation":
    case "generate-ai-presentation":
      return "pptx";
    case "extract-exact":
    case "extract-steps":
      return "json";
    default:
      return "html";
  }
}

function resolveCanvasViewFromHref(href: string): ViewId | null {
  try {
    const parsed = new URL(href, "https://rased.local");
    const pathname = parsed.pathname.toLowerCase();
    if (pathname === "/home" || pathname === "/") {
      const view = parsed.searchParams.get("view");
      return view === "dashboards" || view === "dataLake" || view === "reports" || view === "library" || view === "settings"
        ? view
        : "chat";
    }
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/analysis") || pathname.startsWith("/observer")) return "dashboards";
    if (pathname.startsWith("/data") || pathname.startsWith("/excel") || pathname.startsWith("/convert")) return "dataLake";
    if (pathname.startsWith("/replicate") || pathname.startsWith("/replication") || pathname.startsWith("/literal-match") || pathname.startsWith("/localization")) return "dataLake";
    if (pathname.startsWith("/report")) return "reports";
    if (pathname.startsWith("/library") || pathname.startsWith("/templates") || pathname.startsWith("/presentations")) return "library";
    if (pathname.startsWith("/settings") || pathname.startsWith("/admin")) return "settings";
    return null;
  } catch {
    return null;
  }
}

function inferArtifactKindFromOutput(actionId: HomeActionId, output: OutputAction): RasedArtifactRef["kind"] {
  if (output.kind === "route") return "link";
  const loweredName = (output.downloadName ?? output.href).toLowerCase();
  if (loweredName.endsWith(".pptx")) return "pptx";
  if (loweredName.endsWith(".docx")) return "docx";
  if (loweredName.endsWith(".xlsx")) return "xlsx";
  if (loweredName.endsWith(".pdf")) return "pdf";
  if (loweredName.endsWith(".html") || loweredName.endsWith(".htm")) return "html";
  if (loweredName.endsWith(".png") || loweredName.endsWith(".jpg") || loweredName.endsWith(".jpeg") || loweredName.endsWith(".webp")) return "png";
  if (loweredName.endsWith(".srt")) return "srt";
  if (loweredName.endsWith(".vtt")) return "vtt";
  if (loweredName.endsWith(".json") || loweredName.endsWith(".txt") || loweredName.endsWith(".csv") || loweredName.endsWith(".md")) return "json";

  switch (inferResultArtifactKind(actionId)) {
    case "pptx":
      return "pptx";
    case "docx":
      return "docx";
    case "xlsx":
      return "xlsx";
    case "pdf":
      return "pdf";
    case "dashboard":
      return "dashboard";
    case "html":
      return "html";
    default:
      return "json";
  }
}

function isDirectCanvasView(value: string | null): value is Extract<ViewId, string> {
  return value === "chat" || value === "dashboards" || value === "dataLake" || value === "reports" || value === "library" || value === "settings";
}

function planSteps(bundle: HomeFileBundle | null, actionId: HomeActionId | null) {
  if (actionId === "compare-visuals") {
    return ["تحليل الملفين", "بناء المقارنة", "قفل التطابق", "إخراج تقرير الفروقات"];
  }
  if (actionId === "reconstruct-dashboard") {
    return ["فهم العناصر", "بناء اللوحة", "التحقق", "تجهيز المعاينة"];
  }
  if (actionId === "build-report") {
    return ["قراءة المصدر", "بناء الأقسام", "قفل الجودة", "تجهيز التصدير"];
  }
  if (actionId === "generate-data-presentation" || actionId === "generate-file-presentation" || actionId === "generate-ai-presentation") {
    return ["فهم المحتوى", "بناء الشرائح", "التحقق", "تصدير العرض"];
  }
  if (actionId === "extract-exact" || actionId === "extract-steps") {
    return ["تحليل المصدر", "استخراج المحتوى", "قفل الدقة", "تجهيز النتيجة"];
  }
  if (actionId === "translate-arabic" || actionId === "apply-rtl") {
    return ["قراءة النص", "إعادة الصياغة", "فحص العربية", "تثبيت النتيجة"];
  }
  if (bundle?.kind === "image-compare") {
    return ["التقاط الملفين", "تحليل بصري", "تحقق صارم", "إخراج التقرير"];
  }
  return ["تحليل السياق", "بناء النتيجة", "قفل بوابات التحقق", "حفظ المخرج"];
}

function focusSuggestions(bundle: HomeFileBundle | null, result: ResultState | null, assistantSuggestions: string[]) {
  const actionLabels = bundle?.actions.map((action) => action.title) ?? [];
  const outputLabels = result?.outputs?.map((output) => output.label) ?? [];
  return [...assistantSuggestions, ...actionLabels, ...outputLabels]
    .filter((value, index, array) => value && array.indexOf(value) === index)
    .slice(0, 7);
}

function isCapabilityPrompt(query: string) {
  return /(ماذا|ما الذي|ماهي|وش|ايش|كيف ابدا|كيف ابدأ|ماذا يمكن|ما الانسب|ما الأنسب)/.test(query);
}

function isSessionPrompt(query: string) {
  return /(الحاله|الحالة|الجلسه|الجلسة|الملف الحالي|ماذا اخترت|ماذا يحدث)/.test(query);
}

function isExplicitExecutionPrompt(query: string) {
  return /(نفذ|نفذي|شغل|شغّل|ابدأ|ابدا|افتح|أنشئ|انشئ|ولد|ولّد|حوّل|حول|حلل|حلّل|استخرج|قارن|طابق|صدر|صدّر|ابن|ابني|كوّن|كون)/.test(query);
}

function findMatchingAction(query: string, actions: HomeCapabilityAction[]) {
  const normalizedQuery = normalizeArabicText(query);
  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  let best: { action: HomeCapabilityAction; score: number } | null = null;

  for (const action of actions) {
    const haystacks = [
      normalizeArabicText(action.title),
      normalizeArabicText(action.description),
      normalizeArabicText(action.outputLabel),
      normalizeArabicText(action.serviceLabel),
      normalizeArabicText(actionChipLabel(action.id)),
      normalizeArabicText(action.id),
    ];

    let score = 0;
    for (const haystack of haystacks) {
      if (!haystack) continue;
      if (haystack === normalizedQuery) score += 10;
      if (haystack.includes(normalizedQuery) || normalizedQuery.includes(haystack)) score += 5;
      for (const term of queryTerms) if (term.length > 1 && haystack.includes(term)) score += 2;
    }
    if (score > 0 && (!best || score > best.score)) best = { action, score };
  }

  return best?.action ?? null;
}

function shouldAutoRunMatchedAction(query: string, matched: HomeCapabilityAction | null) {
  if (!matched) return false;

  const normalizedQuery = normalizeArabicText(query);
  if (isCapabilityPrompt(normalizedQuery) || isSessionPrompt(normalizedQuery)) {
    return false;
  }

  const exactForms = [
    normalizeArabicText(matched.title),
    normalizeArabicText(matched.description),
    normalizeArabicText(matched.outputLabel),
    normalizeArabicText(matched.serviceLabel),
    normalizeArabicText(actionChipLabel(matched.id)),
    normalizeArabicText(matched.id),
  ].filter(Boolean);

  if (exactForms.includes(normalizedQuery)) {
    return true;
  }

  return isExplicitExecutionPrompt(normalizedQuery);
}

function HomePageContent() {
  const searchParams = useSearchParams();
  const { state: canvasState, send } = useRasedCanvas();
  const downloadUrlsRef = useRef<string[]>([]);
  const assistantInputRef = useRef<HTMLInputElement>(null);
  const focusPreviewRef = useRef<HTMLDivElement>(null);
  const [recentDatasets, setRecentDatasets] = useState<Dataset[]>([]);
  const [bundle, setBundle] = useState<HomeFileBundle | null>(null);
  const [datasetState, setDatasetState] = useState<DatasetState | null>(null);
  const [fileRejections, setFileRejections] = useState<FileRejection[]>([]);
  const [executingAction, setExecutingAction] = useState<HomeActionId | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantNotice, setAssistantNotice] = useState<AssistantNotice>(defaultNotice);
  const [assistantMessages, setAssistantMessages] = useState<ConversationMessage[]>([]);
  const [assistantSessionId, setAssistantSessionId] = useState<string | null>(null);
  const [commandQuery, setCommandQuery] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [teaserIndex, setTeaserIndex] = useState(0);
  const [guidedTour, setGuidedTour] = useState<GuidedTourState | null>(null);
  const [evidenceVisible, setEvidenceVisible] = useState(true);
  const tourCleanupRef = useRef<(() => void) | null>(null);
  const activeJobId = canvasState.jobs.activeJobIds[canvasState.jobs.activeJobIds.length - 1] ?? null;
  const activeJob = activeJobId ? canvasState.jobs.byId[activeJobId] ?? null : null;
  const verifiedArtifactIds = activeJob?.artifactIds ?? [];
  const resultReady = Boolean(result && activeJob?.evidenceId && verifiedArtifactIds.length > 0);
  const resultEvidence: JobEvidence | null =
    resultReady && activeJob?.evidenceId && result
      ? {
          evidenceId: activeJob.evidenceId,
          artifactIds: verifiedArtifactIds,
          sources: bundle?.files.map((item) => ({ label: item.file.name })) ?? [{ label: "جلسة راصد" }],
        }
      : null;
  const focusOpen = canvasState.focus.open && canvasState.focus.artifactId === result?.id && Boolean(result);
  const activeSidebarTab: SidebarTab =
    ["context", "library", "history", "templates", "search", "exports", "permissions", "settings"].includes(canvasState.sidebar.activeTab)
      ? canvasState.sidebar.activeTab
      : "context";
  const mergedConversation = useMemo(
    () => [...canvasState.conversation.messages, ...assistantMessages].sort((left, right) => left.createdAt - right.createdAt),
    [assistantMessages, canvasState.conversation.messages]
  );

  const clearDownloads = useCallback(() => {
    downloadUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    downloadUrlsRef.current = [];
  }, []);
  const appendAssistantMessage = useCallback((text: string) => {
    setAssistantMessages((current) => [
      ...current,
      {
        id: createId("assistant-msg"),
        author: "rased",
        text,
        createdAt: Date.now(),
      },
    ]);
  }, []);

  const loadHomeData = useCallback(async () => {
    if (isE2EAuthBypassed()) {
      setRecentDatasets([]);
      return;
    }
    const datasets = await getDatasets({ page: 1, limit: 3 });
    setRecentDatasets(datasets.data.slice(0, 3));
  }, []);

  useEffect(() => {
    void loadHomeData().catch(() => {
      setRecentDatasets([]);
    });
  }, [loadHomeData]);
  useEffect(() => () => clearDownloads(), [clearDownloads]);
  useEffect(() => {
    void (async () => {
      try {
        const prefs = await rasedPreferenceGet("workspace");
        const nextReduceMotion = Boolean((prefs.refs.preferences as Record<string, unknown>)?.reduce_motion);
        const nextEvidenceVisible = (prefs.refs.preferences as Record<string, unknown>)?.evidence_visibility;
        send({ type: "EFFECTS/SET_REDUCE_MOTION", value: nextReduceMotion });
        if (typeof nextEvidenceVisible === "boolean") {
          setEvidenceVisible(nextEvidenceVisible);
        }
      } catch {
        // Keep local defaults when preferences service is unavailable.
      }
    })();
  }, [send]);
  useEffect(() => {
    const requestedView = searchParams?.get("view") ?? null;
    if (!isDirectCanvasView(requestedView)) return;
    if (canvasState.nav.activeView === requestedView) return;
    send({ type: "NAV/GO", view: requestedView });
  }, [canvasState.nav.activeView, searchParams, send]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sync = () => setIsOnline(window.navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const openAssistant = () => {
      setAssistantNotice((current) => current ?? defaultNotice);
      window.requestAnimationFrame(() => assistantInputRef.current?.focus());
    };

    window.addEventListener("rasid:open-assistant", openAssistant as EventListener);
    return () => window.removeEventListener("rasid:open-assistant", openAssistant as EventListener);
  }, []);
  useEffect(() => {
    send({ type: "COMPOSER/SET_TEXT", text: assistantInput });
  }, [assistantInput, send]);
  useEffect(() => {
    if (bundle?.actions?.length) {
      send({
        type: "ACTIONS/SHOW",
        forAssetIds: bundle.files.map((item) => fileKey(item.file)),
      });
    }
  }, [bundle, send]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      const isCommandPalette = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (isCommandPalette) {
        event.preventDefault();
        send({ type: "PALETTE/OPEN" });
        return;
      }

      if (event.key === "Escape") {
        if (canvasState.overlays.blockingModalOpen) {
          send({ type: "MODAL/CLOSE" });
          return;
        }
        if (canvasState.overlays.commandPaletteOpen) {
          send({ type: "PALETTE/CLOSE" });
          return;
        }
        if (canvasState.focus.open) {
          send({ type: "FOCUS/CLOSE" });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canvasState.focus.open, canvasState.overlays.blockingModalOpen, canvasState.overlays.commandPaletteOpen, send]);
  useEffect(() => {
    const currentActiveJob = activeJobId ? canvasState.jobs.byId[activeJobId] ?? null : null;
    if (!currentActiveJob || canvasState.uiEffects.reduceMotion) return undefined;
    const interval = window.setInterval(() => setTeaserIndex((current) => current + 1), 2200);
    return () => window.clearInterval(interval);
  }, [activeJobId, canvasState.jobs.byId, canvasState.uiEffects.reduceMotion]);
  useEffect(() => {
    const snapshot = buildHomeUiSnapshot({
      canvas: canvasState,
      activeSidebarTab,
      bundleSummary: bundle?.summary ?? null,
      resultTitle: result?.title ?? null,
      resultStatus: result?.status ?? null,
      evidenceReady: Boolean(resultEvidence),
    });

    const timeout = window.setTimeout(() => {
      void rasedSyncUiState(snapshot).catch(() => undefined);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [activeSidebarTab, bundle?.summary, canvasState, result?.status, result?.title, resultEvidence]);
  useEffect(() => () => {
    tourCleanupRef.current?.();
  }, []);

  const primaryActions = useMemo(() => (bundle ? bundle.actions.slice(0, 3) : []), [bundle]);
  const assistantSuggestions = useMemo(() => {
    if (!bundle) return ["كيف أبدأ؟", "ما أنواع الملفات المدعومة؟", "لدي صورتان للمقارنة"];
    return [bundle.actions[0]?.title ?? "ما الأنسب لهذا الملف؟", bundle.actions[1]?.title ?? "ما الخطوة التالية؟", "ما الأنسب لهذا الملف؟", "ما حالة الجلسة؟"]
      .filter((value, index, array) => value && array.indexOf(value) === index)
      .slice(0, 4);
  }, [bundle]);
  const sidebarMode = canvasState.sidebar.mode;
  const statusLabel = stageLabel(activeJob, resultReady);
  const workflowState = workflowLabel(activeJob, resultReady);
  const teaserMessages = ["نرتّب التفاصيل…", "نثبت التطابق…", "نراجع الدقة…", "نبني نسخة قابلة للتعديل…", "نجهّز المعاينة…", "نقفل بوابات التحقق…"];
  const activeTeaser = activeJob ? teaserMessages[teaserIndex % teaserMessages.length] : "";
  const resultDownloads = resultReady ? result?.outputs?.filter((output) => output.kind === "download") ?? [] : [];
  const resultRoutes = resultReady ? result?.outputs?.filter((output) => output.kind === "route") ?? [] : [];
  const focusQuickSuggestions = useMemo(() => focusSuggestions(bundle, result, assistantSuggestions), [assistantSuggestions, bundle, result]);
  const commandItems = useMemo<CommandPaletteItem[]>(() => {
    const items: CommandPaletteItem[] = [
      ...(bundle?.actions.map((action) => ({
        id: `action-${action.id}`,
        label: action.title,
        description: action.description,
        kind: "action" as const,
        actionId: action.id,
      })) ?? []),
      ...assistantSuggestions.map((prompt, index) => ({
        id: `assistant-${index}`,
        label: prompt,
        description: "إرسال هذا السؤال مباشرة إلى مساعد راصد",
        kind: "assistant" as const,
        prompt,
      })),
    ];

    const normalizedQuery = normalizeArabicText(commandQuery);
    if (!normalizedQuery) return items.slice(0, 7);
    return items
      .filter((item) => normalizeArabicText(`${item.label} ${item.description}`).includes(normalizedQuery))
      .slice(0, 7);
  }, [assistantSuggestions, bundle, commandQuery]);

  const createDownloadAction = useCallback((blob: Blob, label: string, downloadName: string): OutputAction => {
    const href = URL.createObjectURL(blob);
    downloadUrlsRef.current.push(href);
    return { kind: "download", label, href, downloadName };
  }, []);
  const createResultArtifacts = useCallback((resultState: ResultState, jobId: string): RasedArtifactRef[] => {
    const artifacts = (resultState.outputs ?? []).map((output, index) => ({
      artifact_id: `${jobId}-artifact-${index + 1}`,
      kind: inferArtifactKindFromOutput(resultState.actionId, output),
      uri: output.href,
    }));

    if (artifacts.length > 0) {
      return artifacts;
    }

    const syntheticBlob = new Blob([
      JSON.stringify(
        {
          actionId: resultState.actionId,
          title: resultState.title,
          body: resultState.body,
          previewText: resultState.previewText ?? null,
          executedAt: resultState.executedAt,
        },
        null,
        2
      ),
    ], { type: "application/json;charset=utf-8" });
    const href = URL.createObjectURL(syntheticBlob);
    downloadUrlsRef.current.push(href);

    return [
      {
        artifact_id: `${jobId}-artifact-1`,
        kind: "json",
        uri: href,
      },
    ];
  }, []);
  const openCanvasRoute = useCallback((href: string) => {
    const nextView = resolveCanvasViewFromHref(href);
    send({ type: "NAV/GO", view: nextView ?? "chat" });
  }, [send]);
  const createExecutionJob = useCallback((actionId: HomeActionId) => {
    const jobId = createId("job");
    send({ type: "JOB/CREATE", jobId });
    send({ type: "JOB/STAGE", jobId, stage: "planning" });
    send({ type: "JOB/PROGRESS", jobId, progressPct: 12 });
    return jobId;
  }, [send]);
  const toggleSidebar = useCallback(() => {
    send({ type: canvasState.sidebar.mode === "hidden" ? "SIDEBAR/OPEN" : "SIDEBAR/CLOSE" });
  }, [canvasState.sidebar.mode, send]);
  const runRasedUiActions = useCallback(async (
    actions: Array<{
      type: "open_sidebar" | "close_sidebar" | "open_focus" | "close_focus" | "select" | "set_control" | "scroll_to" | "highlight";
      target_rased_id?: string;
      value?: unknown;
    }>
  ) => {
    tourCleanupRef.current?.();
    const local = applyRasedUiActions(actions, send, {
      reduceMotion: canvasState.uiEffects.reduceMotion,
      onSelectSidebarTab: (tab) => send({ type: "SIDEBAR/SET_TAB", tab: tab as SidebarTab }),
      onOpenFocus: (artifactId) => send({ type: "FOCUS/OPEN", artifactId, kind: "html", stageMode: "view" }),
    });
    tourCleanupRef.current = local.cleanup;
    await rasedDispatchUiActions({ actions, mode: "EXECUTOR" }).catch(() => undefined);
    return local.applied;
  }, [canvasState.uiEffects.reduceMotion, send]);
  const closeGuidedTour = useCallback(async (outcome: "completed" | "cancelled" | "failed" = "cancelled") => {
    const sessionId = guidedTour?.sessionId ?? null;
    setGuidedTour(null);
    tourCleanupRef.current?.();
    tourCleanupRef.current = null;
    if (sessionId) {
      await rasedTourEnd({ tour_session_id: sessionId, outcome }).catch(() => undefined);
    }
  }, [guidedTour?.sessionId]);
  const advanceGuidedTour = useCallback(async (status: "viewed" | "completed" | "auto_applied" = "viewed") => {
    setGuidedTour((current) => {
      if (!current) return current;
      void rasedTourStep({
        tour_session_id: current.sessionId,
        step_index: current.stepIndex,
        target_rased_id: current.steps[current.stepIndex]?.target_rased_id,
        status,
      }).catch(() => undefined);

      if (current.stepIndex + 1 >= current.steps.length) {
        void closeGuidedTour("completed");
        return null;
      }
      return { ...current, stepIndex: current.stepIndex + 1 };
    });
  }, [closeGuidedTour]);
  const startGuidedTour = useCallback(async (mode: "explain" | "coach" | "executor") => {
    const steps = buildHomeGuidedTour({
      bundleAvailable: Boolean(bundle),
      hasResult: Boolean(result),
      focusReady: focusOpen,
      actionId: primaryActions[0]?.id ?? null,
      mode,
    });
    const started = await rasedTourStart({
      name: bundle ? `tour-${bundle.kind}` : "home-tour",
      mode,
      steps,
    });

    setGuidedTour({
      sessionId: started.refs.tour_session_id,
      steps,
      stepIndex: 0,
      mode,
    });
    await rasedTourStep({
      tour_session_id: started.refs.tour_session_id,
      step_index: 0,
      target_rased_id: steps[0]?.target_rased_id,
      status: "viewed",
    }).catch(() => undefined);
  }, [bundle, focusOpen, primaryActions, result]);

  const resetSession = useCallback(() => {
    clearDownloads();
    setBundle(null);
    setDatasetState(null);
    setFileRejections([]);
    setExecutingAction(null);
    setResult(null);
    setActivity([]);
    setAssistantMessages([]);
    setAssistantInput("");
    setAssistantSessionId(null);
    setAssistantNotice({
      title: "جلسة جديدة جاهزة",
      body: "اسحب ملفًا واحدًا أو صورتين للمطابقة الصارمة. سأعيد كشف السياق وأقترح المسار التالي فورًا.",
      chips: ["ملف واحد", "صورتان", "تنفيذ حقيقي"],
      tone: "neutral",
    });
    setGuidedTour(null);
    tourCleanupRef.current?.();
    tourCleanupRef.current = null;
    send({ type: "SELECT/CLEAR" });
    send({ type: "FOCUS/CLOSE" });
    send({ type: "SIDEBAR/CLOSE" });
  }, [clearDownloads, send]);

  const ensureDatasetImported = useCallback(async (file: File): Promise<DatasetState> => {
    const currentKey = fileKey(file);
    if (datasetState?.fileKey === currentKey) return datasetState;
    const imported = await importDataset(file.name.split(".").pop() ?? "csv", file);
    const detail = await getDatasetById(imported.datasetId);
    const nextState = { fileKey: currentKey, importResult: imported, detail };
    setDatasetState(nextState);
    await loadHomeData();
    return nextState;
  }, [datasetState, loadHomeData]);

  const readPrimaryFileAsText = useCallback(async () => {
    const primary = bundle?.files[0]?.file;
    if (!primary) throw new Error("لا يوجد ملف نشط.");
    return primary.text();
  }, [bundle]);

  const finalizeExecution = useCallback(async (next: Omit<ResultState, "id" | "executedAt">, source: "guided" | "assistant", jobId?: string) => {
    const finalResult: ResultState = { ...next, id: createId("result"), executedAt: new Date().toISOString() };
    setResult(finalResult);
    let committedResult = finalResult;

    if (jobId) {
      if (finalResult.status === "success") {
        send({ type: "JOB/STAGE", jobId, stage: "verifying" });
        send({ type: "JOB/PROGRESS", jobId, progressPct: 88 });
        if (finalResult.previewImage || finalResult.previewText) {
          send({ type: "JOB/PREVIEW_READY", jobId, previewCardId: createId("preview-card") });
        }
        try {
          const artifacts = createResultArtifacts(finalResult, jobId);
          const evidence = await rasedEvidencePack({
            action_graph: {
              graph_id: `ui_graph_${jobId}`,
              goal: actionChipLabel(finalResult.actionId),
              source,
              steps: [
                {
                  step_id: `ui_step_${finalResult.actionId}`,
                  tool_id: finalResult.actionId,
                  label: finalResult.title,
                },
              ],
            },
            action_ids: [`ui_action_${jobId}`],
            artifacts,
            reports: {
              result_status: finalResult.status,
              result_title: finalResult.title,
              bundle_summary: bundle?.summary ?? null,
              preview_available: Boolean(finalResult.previewImage || finalResult.previewText),
            },
          });

          if (evidence.status !== "ok" || !evidence.refs.evidence_id) {
            throw new Error(evidence.failure?.message ?? "فشل قفل Evidence Pack.");
          }

          send({
            type: "JOB/RESULT_READY",
            jobId,
            artifactIds: artifacts.map((artifact) => artifact.artifact_id),
            resultCardId: `card.result.${jobId}`,
          });
          send({
            type: "JOB/EVIDENCE_READY",
            jobId,
            evidenceId: evidence.refs.evidence_id,
            evidenceCardId: `card.evidence.${jobId}`,
          });
          send({ type: "JOB/STAGE", jobId, stage: "completed" });
          send({ type: "JOB/PROGRESS", jobId, progressPct: 100 });
        } catch (error) {
          committedResult = {
            ...finalResult,
            status: "error",
            title: "فشل التحقق",
            body: getErrorMessage(error),
          };
          setResult(committedResult);
          send({ type: "JOB/STAGE", jobId, stage: "failed" });
          send({ type: "JOB/FAIL", jobId, error: { code: "evidence_failed", message: committedResult.body } });
        }
      } else {
        send({ type: "JOB/STAGE", jobId, stage: "failed" });
        send({ type: "JOB/FAIL", jobId, error: { code: "execution_failed", message: finalResult.body } });
      }
    }

    setActivity((current) => [
      { id: createId("activity"), label: actionChipLabel(committedResult.actionId), note: committedResult.title, status: committedResult.status, executedAt: committedResult.executedAt, source },
      ...current,
    ].slice(0, 4));

    return committedResult;
  }, [bundle?.summary, createResultArtifacts, send]);

  const executeAction = useCallback(async (actionId: HomeActionId, source: "guided" | "assistant" = "guided") => {
    if (!bundle?.files[0]?.file) throw new Error("ابدأ بإضافة ملف أولًا.");

    const primaryFile = bundle.files[0].file;
    const jobId = createExecutionJob(actionId);
    clearDownloads();
    setExecutingAction(actionId);
    send({ type: "JOB/STAGE", jobId, stage: "running" });
    send({ type: "JOB/PROGRESS", jobId, progressPct: 34 });

    try {
      switch (actionId) {
        case "import-dataset": {
          const imported = await ensureDatasetImported(primaryFile);
          return finalizeExecution({
            actionId,
            status: "success",
            title: "تم إنشاء مجموعة بيانات حقيقية",
            body: `تم رفع ${primaryFile.name} إلى خدمة البيانات وإنشاء مجموعة قابلة للاستخدام داخل راصد.`,
            chips: [`المعرّف ${imported.importResult.datasetId}`, `${imported.importResult.rowCount} صف`, `${imported.importResult.columnCount} عمود`],
            outputs: [{ kind: "route", label: "فتح مجموعة البيانات", href: `/data/${imported.importResult.datasetId}` }],
          }, source, jobId);
        }
        case "analyze-dataset": {
          const imported = await ensureDatasetImported(primaryFile);
          const analysis = await analyzeDataset(imported.importResult.datasetId);
          return finalizeExecution({
            actionId,
            status: "success",
            title: "اكتمل التحليل الفوري",
            body: analysis.chartRecommendations.length > 0 ? `أفضل اقتراح حالي هو ${analysis.chartRecommendations[0].titleAr}.` : "أعاد محرك التحليل ملف تعريف البيانات من دون توصيات رسوم إضافية.",
            chips: [`${analysis.dataProfile.rowCount} صف`, `${analysis.dataProfile.columnCount} عمود`, `${analysis.kpiRecommendations.length} مؤشر`],
            previewText: analysis.chartRecommendations.slice(0, 3).map((chart, index) => `${index + 1}. ${chart.titleAr} - ${chart.reason}`).join("\n") || imported.detail.columns.slice(0, 4).map((column) => column.name).join("، "),
            outputs: [{ kind: "route", label: "فتح التحليل", href: "/analysis" }],
          }, source, jobId);
        }
        case "build-report": {
          const imported = await ensureDatasetImported(primaryFile);
          const report = await createReport({ name: `${baseName(primaryFile.name)} - تقرير`, dataSources: [{ datasetId: imported.importResult.datasetId }] });
          await addReportSection(report.id, {
            type: "text",
            position: 0,
            content: { title: "ملخص تنفيذي", text: `تم إنشاء هذا التقرير من الملف ${primaryFile.name}. يحتوي المصدر على ${imported.importResult.rowCount} صف و${imported.importResult.columnCount} عمود.` },
          });
          if (imported.detail.columns.length > 0) {
            await addReportSection(report.id, {
              type: "table",
              position: 1,
              content: {
                title: "استعراض البيانات",
                datasetId: imported.importResult.datasetId,
                columns: imported.detail.columns.slice(0, 4).map((column) => ({ field: column.name, label: column.name })),
              },
            });
          }
          const build = await buildReport(report.id);
          const pdf = await exportReport(report.id, "pdf");
          return finalizeExecution({
            actionId,
            status: "success",
            title: "تم بناء التقرير فعليًا",
            body: "بنى راصد تقريرًا جديدًا من الملف وأصدر نسخة PDF قابلة للتنزيل.",
            chips: [`التقرير ${report.id}`, `البناء ${build.buildId}`, `${build.sectionCount} قسم`],
            outputs: [createDownloadAction(pdf, "تنزيل PDF", `${baseName(primaryFile.name)}-report.pdf`), { kind: "route", label: "فتح التقارير", href: "/reports" }],
          }, source, jobId);
        }
        case "generate-data-presentation": {
          const imported = await ensureDatasetImported(primaryFile);
          const presentation = await generatePresentationFromData({ datasetId: imported.importResult.datasetId, slideCount: 6, style: "executive" });
          const pptx = await exportPresentation(presentation.id, "pptx");
          return finalizeExecution({
            actionId,
            status: "success",
            title: "تم إنشاء العرض من البيانات",
            body: "عالجت خدمة العروض مجموعة البيانات وأنشأت ملف PowerPoint فعليًا.",
            chips: [`العرض ${presentation.id}`, `${presentation.slideCount} شريحة`],
            outputs: [createDownloadAction(pptx, "تنزيل PowerPoint", `${baseName(primaryFile.name)}-presentation.pptx`), { kind: "route", label: "فتح العرض", href: `/presentations/${presentation.id}` }],
          }, source, jobId);
        }
        case "generate-file-presentation": {
          const presentation = await generatePresentationFromFile(primaryFile, { slideCount: 6, style: "executive", language: "ar", detailLevel: "standard" });
          const pptx = await exportPresentation(presentation.id, "pptx");
          await loadHomeData();
          return finalizeExecution({
            actionId,
            status: "success",
            title: "تم إنشاء العرض من الملف مباشرة",
            body: "أُرسل الملف إلى خدمة العروض، وتم توليد عرض فعلي قابل للفتح والتنزيل.",
            chips: [`العرض ${presentation.id}`, `${presentation.slideCount} شريحة`],
            outputs: [createDownloadAction(pptx, "تنزيل PowerPoint", `${baseName(primaryFile.name)}-slides.pptx`), { kind: "route", label: "فتح العرض", href: `/presentations/${presentation.id}` }],
          }, source, jobId);
        }
        case "generate-ai-presentation": {
          const content = await readPrimaryFileAsText();
          const presentation = await generatePresentationFromAi({ text: content, slideCount: 6, language: "ar", style: "executive" });
          const pptx = await exportPresentation(presentation.id, "pptx");
          await loadHomeData();
          return finalizeExecution({
            actionId,
            status: "success",
            title: "تم توليد العرض الذكي من النص",
            body: "حوّل راصد النص المستخرج إلى عرض تنفيذي حقيقي داخل خدمة العروض.",
            chips: [`العرض ${presentation.id}`, `${presentation.slideCount} شريحة`],
            outputs: [createDownloadAction(pptx, "تنزيل PowerPoint", `${baseName(primaryFile.name)}-ai.pptx`), { kind: "route", label: "فتح العرض", href: `/presentations/${presentation.id}` }],
          }, source, jobId);
        }
        case "extract-exact": {
          const extraction = await extractMultimodal(primaryFile, { mode: "exact", languageHint: "auto" });
          return finalizeExecution({
            actionId,
            status: "success",
            title: "تم استخراج المحتوى بدقة",
            body: "أعاد محرك الفهم والاستخراج النص الفعلي من الملف مع اللغة والمحرك المستخدم.",
            chips: [
              extraction.inputType,
              extraction.exactExtraction?.language ?? "unknown",
              extraction.exactExtraction?.sourceEngine ?? "engine",
            ],
            previewText: extraction.exactExtraction?.text || "لم يعد المسار نصًا قابلاً للعرض.",
          }, source, jobId);
        }
        case "extract-steps": {
          const extraction = await extractMultimodal(primaryFile, { mode: "both", languageHint: "auto" });
          const steps = extraction.structuredSteps?.steps ?? [];
          return finalizeExecution({
            actionId,
            status: "success",
            title: "تم اشتقاق خطوات عملية من المحتوى",
            body: extraction.structuredSteps?.summary || "حوّل راصد المحتوى الإجرائي إلى خطوات مرتبة قابلة للمراجعة.",
            chips: [
              extraction.structuredSteps?.language ?? extraction.exactExtraction?.language ?? "unknown",
              `${steps.length} خطوة`,
              extraction.exactExtraction?.sourceEngine ?? "engine",
            ],
            previewText: steps.length > 0
              ? steps.map((step) => `${step.index}. ${step.title}\n${step.description}\n${step.evidence.join(" | ")}`).join("\n\n")
              : extraction.exactExtraction?.text || "لم ينجح المسار في استخراج خطوات منظمة من هذا الملف.",
          }, source, jobId);
        }
        case "translate-arabic": {
          const content = await readPrimaryFileAsText();
          const detected = await detectTextLanguage(content);
          const translated = await translatePlainText({ text: content, sourceLang: detected.language || "en", targetLang: "ar" });
          return finalizeExecution({ actionId, status: "success", title: "اكتمل التعريب", body: "أعادت خدمة التوطين النص العربي مباشرة من داخل الصفحة الرئيسية.", chips: [`من ${translated.sourceLang}`, `إلى ${translated.targetLang}`], previewText: translated.translatedText }, source, jobId);
        }
        case "apply-rtl": {
          const content = await readPrimaryFileAsText();
          const rtlContent = await applyRtlContent(content);
          return finalizeExecution({ actionId, status: "success", title: "تم تجهيز المحتوى عربيًا", body: "شغّل راصد معالجة RTL على النص الحالي وأعاد صياغته للعرض العربي.", chips: ["RTL", "خدمة التوطين"], previewText: rtlContent }, source, jobId);
        }
        case "convert-markdown-html": {
          const content = await readPrimaryFileAsText();
          const html = await convertMarkdownToHtml(content);
          return finalizeExecution({
            actionId,
            status: "success",
            title: "تم التحويل إلى HTML",
            body: "حوّلت خدمة التحويل الملف إلى صفحة HTML قابلة للتنزيل.",
            chips: [`${html.characterCount} حرف`],
            previewText: html.html,
            outputs: [createDownloadAction(new Blob([html.html], { type: "text/html;charset=utf-8" }), "تنزيل HTML", `${baseName(primaryFile.name)}.html`)],
          }, source, jobId);
        }
        case "convert-pdf-word": {
          const blob = await convertPdfToWord(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "تم التحويل إلى وورد", body: "أنتجت خدمة التحويل ملف DOCX جاهزًا للتنزيل.", chips: ["PDF", "DOCX"], outputs: [createDownloadAction(blob, "تنزيل ملف وورد", `${baseName(primaryFile.name)}.docx`)] }, source, jobId);
        }
        case "convert-word-pdf": {
          const blob = await convertWordToPdf(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "تم التحويل إلى PDF", body: "أنتجت خدمة التحويل ملف PDF فعليًا من المستند الحالي.", chips: ["DOCX", "PDF"], outputs: [createDownloadAction(blob, "تنزيل PDF", `${baseName(primaryFile.name)}.pdf`)] }, source, jobId);
        }
        case "convert-excel-pdf": {
          const blob = await convertExcelToPdf(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "تم تحويل الجدول إلى PDF", body: "حوّلت خدمة التحويل ملف الجدول إلى PDF قابل للتنزيل.", chips: ["Excel", "PDF"], outputs: [createDownloadAction(blob, "تنزيل PDF", `${baseName(primaryFile.name)}.pdf`)] }, source, jobId);
        }
        case "convert-csv-excel": {
          const blob = await convertCsvToExcel(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "تم تحويل CSV إلى إكسل", body: "تم إنشاء ملف XLSX فعلي من بيانات CSV الحالية.", chips: ["CSV", "XLSX"], outputs: [createDownloadAction(blob, "تنزيل ملف إكسل", `${baseName(primaryFile.name)}.xlsx`)] }, source, jobId);
        }
        case "convert-excel-csv": {
          const blob = await convertExcelToCsv(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "تم تحويل إكسل إلى CSV", body: "أنتجت خدمة التحويل ملف CSV فعليًا من الجدول الحالي.", chips: ["Excel", "CSV"], outputs: [createDownloadAction(blob, "تنزيل CSV", `${baseName(primaryFile.name)}.csv`)] }, source, jobId);
        }
        case "analyze-visual": {
          const analysis = await analyzeVisualImage(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "اكتمل التحليل البصري", body: "فحص راصد الصورة بصريًا وأعاد عناصرها الأساسية عبر خدمة المطابقة.", chips: [`${analysis.elements.length} عنصر`, `نوع المصدر ${String(analysis.metadata?.sourceType ?? "screenshot")}`], previewText: JSON.stringify(analysis.analysis, null, 2) }, source, jobId);
        }
        case "reconstruct-dashboard": {
          const dashboard = await reconstructDashboardFromImage(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "تم إنشاء لوحة مؤشرات من الصورة", body: "حوّلت خدمة المطابقة البصرية الصورة إلى لوحة مؤشرات حقيقية داخل النظام.", chips: [`المعرّف ${dashboard.dashboardId}`], outputs: [{ kind: "route", label: "فتح التحليل", href: "/analysis" }] }, source, jobId);
        }
        case "compare-visuals": {
          if (bundle.files.length < 2) throw new Error("المطابقة الصارمة تحتاج صورتين.");
          const compare = await compareVisualReplication(bundle.files[0].file, bundle.files[1].file);
          return finalizeExecution({ actionId, status: "success", title: compare.passed ? "المطابقة الصارمة اجتازت الفحص" : "المطابقة الصارمة كشفت فروقات", body: "تمت المقارنة البصرية الحقيقية بين الصورتين مع حساب الفروقات البنيوية والبكسلية.", chips: [`SSIM ${compare.ssim.toFixed(3)}`, `${compare.mismatchedPixels} بكسل مختلف`, compare.passed ? "مطابقة ناجحة" : "فروقات مرئية"], previewImage: compare.diffImage }, source, jobId);
        }
      }
    } catch (error) {
      return finalizeExecution({ actionId, status: "error", title: "فشل التنفيذ", body: getErrorMessage(error), chips: [actionChipLabel(actionId)] }, source, jobId);
    } finally {
      setExecutingAction(null);
    }
  }, [bundle, clearDownloads, createDownloadAction, createExecutionJob, ensureDatasetImported, finalizeExecution, loadHomeData, readPrimaryFileAsText, send]);

  const handleAcceptedFiles = useCallback((files: File[]) => {
    clearDownloads();
    setDatasetState(null);
    setFileRejections([]);
    setExecutingAction(null);
    setResult(null);
    setActivity([]);
    setAssistantMessages([]);
    const nextBundle = buildHomeFileBundle(files);
    setBundle(nextBundle);
    setAssistantNotice(
      nextBundle.kind === "unsupported"
        ? { title: "هذا المسار غير متاح من الصفحة الرئيسية", body: nextBundle.summary, chips: ["ابدأ من ملف مدعوم"], tone: "error" }
        : { title: nextBundle.title, body: nextBundle.orchestrationNote, chips: nextBundle.brainSteps, tone: "success" }
    );
    void Promise.all(files.map((file) => fileToAttachment(file))).then((attachments) => {
      send({ type: "DROP/FILES", files: attachments });
    });
    send({ type: "SIDEBAR/OPEN" });
    send({ type: "SIDEBAR/SET_TAB", tab: files.length > 1 ? "library" : "context" });
  }, [clearDownloads, send]);

  const handleRejectedFiles = useCallback((rejections: FileRejection[]) => {
    setFileRejections(rejections);
    setAssistantNotice({
      title: "تعذر قبول الملف",
      body: "الصفحة الرئيسية تقبل ملفًا واحدًا لمعظم المسارات، أو صورتين فقط للمطابقة البصرية الصارمة.",
      chips: rejections.flatMap((rejection) => rejection.errors.map((error) => error.message)).slice(0, 3),
      tone: "error",
    });
    send({ type: "DROP/LEAVE" });
  }, [send]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: ACCEPTED_FILES,
    maxFiles: 2,
    multiple: true,
    noClick: true,
    onDropAccepted: handleAcceptedFiles,
    onDropRejected: handleRejectedFiles,
  });
  useEffect(() => {
    send({ type: isDragActive ? "DROP/ENTER" : "DROP/LEAVE" });
  }, [isDragActive, send]);

  const runActionFromUI = useCallback(async (actionId: HomeActionId) => {
    send({ type: "ACTIONS/SELECT", actionId });
    const next = await executeAction(actionId, "guided");
    setAssistantNotice({ title: next.title, body: next.body, chips: next.chips, tone: next.status === "success" ? "success" : "error" });
  }, [executeAction, send]);

  const handleAssistantPrompt = useCallback(async (rawPrompt: string) => {
    const query = rawPrompt.trim();
    if (!query) return;
    setAssistantBusy(true);
    send({ type: "COMPOSER/SET_TEXT", text: query });
    send({ type: "COMPOSER/SEND" });

    try {
      const normalizedQuery = normalizeArabicText(query);
      const rasedAssets = bundle ? await Promise.all(bundle.files.map((item) => toRasedAssetRef(item.file))) : [];
      const intentResponse = await rasedIntentParse({
        prompt: query,
        assets: rasedAssets,
        mode: /علمني|ارشدني|أرشدني|tour|guide/.test(query) ? "TUTOR" : "AUTO",
      }).catch(() => null);
      const intentManifest = intentResponse?.refs.intent_manifest ?? null;
      const actionPlan = intentManifest
        ? await rasedPlanActionGraph(intentManifest, /علمني|ارشدني|أرشدني|tour|guide/.test(query) ? "TUTOR" : "AUTO").catch(() => null)
        : null;
      const matched = bundle ? findMatchingAction(normalizedQuery, bundle.actions) : null;
      if (matched && shouldAutoRunMatchedAction(normalizedQuery, matched)) {
        const next = await executeAction(matched.id, "assistant");
        setAssistantNotice({ title: next.title, body: next.body, chips: next.chips, tone: next.status === "success" ? "success" : "error" });
        appendAssistantMessage(`${next.title}\n${next.body}`);
        return;
      }

      const wantsTour = Boolean(intentManifest?.controls?.guided_tour_requested) || /علمني|ارشدني|أرشدني|tour|guide|coach|وجّهني|وجهني/.test(query);
      if (wantsTour) {
        const mode: "explain" | "coach" | "executor" =
          /نفذها لي|do it for me/.test(normalizedQuery)
            ? "executor"
            : /coach|جرّب|جرب/.test(normalizedQuery)
              ? "coach"
              : "explain";

        setAssistantNotice({
          title: "بدأ الإرشاد الحي",
          body: actionPlan?.refs.action_graph?.steps?.slice(0, 4)?.map((step: Record<string, unknown>) => String(step.label)).join(" ← ") || "سأرشدك داخل العناصر الظاهرة الآن خطوة بخطوة.",
          chips: (intentManifest?.engine_targets ?? []).slice(0, 4),
          tone: "success",
        });
        appendAssistantMessage("فتحت مسار إرشاد حي داخل الـCanvas الحالي.");
        await startGuidedTour(mode);
        return;
      }

      if (intentManifest && actionPlan) {
        const planLabels = Array.isArray(actionPlan.refs.action_graph?.steps)
          ? actionPlan.refs.action_graph.steps.slice(0, 4).map((step: Record<string, unknown>) => String(step.label))
          : [];

        setAssistantNotice({
          title: "خطة راصد الجاهزة",
          body: planLabels.length > 0 ? planLabels.join(" ← ") : `المسار الأقرب الآن: ${intentManifest.goal}`,
          chips: [...intentManifest.engine_targets.slice(0, 3), ...intentManifest.exports.slice(0, 2)].slice(0, 5),
          tone: "neutral",
        });
      }

      const response = await askSurfaceAssistant({
        surfaceName: "الصفحة الرئيسية",
        route: "/home",
        contextSummary: bundle
          ? result
            ? `${bundle.orchestrationNote} آخر تنفيذ: ${result.title}.`
            : bundle.orchestrationNote
          : "لا يوجد ملف نشط بعد. المستخدم يحتاج إلى بدء الجلسة من رفع ملف أو سحب ملف.",
        contextItems: bundle
          ? [
              ...bundle.files.map((item) => ({
                label: "ملف",
                value: `${item.file.name} · ${item.sizeLabel}`,
              })),
              ...(result ? [{ label: "آخر نتيجة", value: result.title }] : []),
            ]
          : [
              { label: "الملفات المدعومة", value: "CSV، XLSX، PDF، DOCX، TXT، MD، HTML، JSON، والصور" },
              { label: "المسار", value: "ابدأ من الملف ثم اختر الإجراء الأنسب" },
            ],
        actions: (bundle?.actions ?? [
          { title: "هل تريد تحليلًا؟", description: "تحويل الملف إلى تحليل فعلي داخل المنصة." },
          { title: "هل تريد تقريرًا؟", description: "إنشاء تقرير حقيقي قابل للبناء والتصدير." },
          { title: "هل تريد عرض باوربوينت؟", description: "توليد عرض فعلي قابل للتنزيل." },
          { title: "هل تريد تحويله؟", description: "تحويل الصيغة عبر خدمة التحويل الحقيقية." },
        ]).map((action) => ({
          label: action.title,
          description: action.description,
        })),
        userMessage: query,
        sessionId: assistantSessionId ?? undefined,
      });

      setAssistantNotice({
        title: "رد راصد",
        body: response.reply,
        chips: response.suggestedChips,
        tone: "neutral",
      });
      setAssistantSessionId(response.sessionId);
      appendAssistantMessage(response.reply);
    } finally {
      setAssistantBusy(false);
      setAssistantInput("");
    }
  }, [appendAssistantMessage, assistantSessionId, bundle, executeAction, result, send, startGuidedTour]);
  const runCommandPaletteItem = useCallback(async (item: CommandPaletteItem) => {
    send({ type: "PALETTE/CLOSE" });
    setCommandQuery("");

    if (item.kind === "action" && item.actionId) {
      await runActionFromUI(item.actionId);
      return;
    }
    if (item.kind === "route" && item.href) {
      openCanvasRoute(item.href);
      return;
    }
    if (item.kind === "assistant" && item.prompt) {
      await handleAssistantPrompt(item.prompt);
    }
  }, [handleAssistantPrompt, openCanvasRoute, runActionFromUI, send]);

  const supportedSummary = bundle
    ? bundle.files.map((item) => `${item.file.name} · ${item.sizeLabel}`).join("  •  ")
    : "CSV، XLSX، PDF، DOCX، TXT، MD، HTML، JSON، وصورة واحدة أو صورتان.";

  return (
    <div dir="rtl" className={`rased-surface-page min-h-[calc(100vh-2rem)] pb-40 ${canvasState.uiEffects.reduceMotion ? "[&_*]:!transition-none [&_*]:!animate-none" : ""}`}>
      <section data-rased-id="header.bar" className="rased-motion-rise sticky top-4 z-30 overflow-hidden rounded-[32px] border border-slate-200/70 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),_transparent_35%),linear-gradient(135deg,_#08111f_0%,_#10243c_52%,_#0f172a_100%)] px-6 py-5 text-white shadow-[0_32px_80px_-48px_rgba(15,23,42,0.9)] backdrop-blur lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <img src={OFFICIAL_MARK_URL} alt={OFFICIAL_PLATFORM_NAME} className="h-11 w-11 rounded-2xl border border-white/10 bg-white/95 object-contain p-1.5" />
            <div>
              <p className="text-lg font-black">{OFFICIAL_PLATFORM_NAME}</p>
              <p className="text-xs font-semibold text-cyan-100/80">{OFFICIAL_PLATFORM_TAGLINE}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${isOnline ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100" : "border-rose-300/30 bg-rose-400/10 text-rose-100"}`}>
              {isOnline ? "متصل" : "غير متصل"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-black text-slate-100">{workflowState}</span>
          </div>
          <div data-rased-options-surface="header-actions" className="flex flex-wrap items-center justify-end gap-2">
            <button data-rased-id="sidebar.toggle" data-rased-option="true" type="button" onClick={toggleSidebar} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/15">
              {canvasState.sidebar.mode === "hidden" ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
              <span>{sidebarMode === "hidden" ? "إظهار الشريط" : sidebarMode === "full" ? "الشريط الكامل" : "شريط جانبي"}</span>
            </button>
            <button data-rased-id="command.palette.open" data-rased-option="true" type="button" onClick={() => send({ type: "PALETTE/OPEN" })} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/15">
              <Command className="h-4 w-4" />
              <span>بحث سريع</span>
            </button>
            <button data-rased-id="theme.toggle" data-rased-option="true" type="button" onClick={() => send({ type: "THEME/TOGGLE" })} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/15">
              {canvasState.theme === "dark" ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              <span>{canvasState.theme === "dark" ? "فاتح" : "داكن"}</span>
            </button>
            <button data-rased-id="motion.toggle" data-rased-option="true" type="button" onClick={() => send({ type: "EFFECTS/SET_REDUCE_MOTION", value: !canvasState.uiEffects.reduceMotion })} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/15">
              <Sparkles className="h-4 w-4" />
              <span>{canvasState.uiEffects.reduceMotion ? "حركة هادئة" : "حركة كاملة"}</span>
            </button>
          </div>
        </div>
      </section>

      <div className={`grid gap-6 ${sidebarMode === "hidden" ? "xl:grid-cols-1" : sidebarMode === "full" ? "xl:grid-cols-[minmax(0,1.45fr)_400px]" : "xl:grid-cols-[minmax(0,1.6fr)_320px]"}`}>
        <div className="space-y-6">
          <section {...getRootProps()} className={`rased-panel rased-motion-stagger-1 overflow-hidden !p-0 ${isDragActive ? "border-cyan-300 shadow-[0_0_0_10px_rgba(34,211,238,0.12)]" : ""}`}>
            <input {...getInputProps({ className: "hidden", "aria-label": "إرفاق ملف إلى Canvas راصد" })} />
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-black tracking-[0.18em] text-slate-400">مسار موحّد</p>
                  <h2 className="mt-1 text-lg font-black text-slate-900">مسار واحد يبدأ من الشات</h2>
                  <p className="mt-1 text-sm text-slate-500">اسحب الملف هنا أو اكتب الأمر في الـcomposer. راصد يعرض الخطوات فقط عندما تحتاجها.</p>
                </div>
                <div data-rased-options-surface="session-actions" className="flex flex-wrap gap-2">
                  <button data-rased-id="upload.primary" data-rased-option="true" type="button" onClick={open} className="rased-action-primary">
                    <UploadCloud className="h-4 w-4" />
                    <span>إرفاق ملف</span>
                  </button>
                  <button data-rased-id="session.reset" data-rased-option="true" type="button" onClick={resetSession} className="rased-action-secondary">
                    <RefreshCcw className="h-4 w-4" />
                    <span>جلسة جديدة</span>
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs leading-6 text-slate-400">{supportedSummary}</p>
            </div>

            <div data-rased-id="chat.stream" className="max-h-[calc(100vh-270px)] overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                {!bundle && mergedConversation.length === 0 ? (
                  <CanvasWelcomeCard onUpload={open} suggestions={assistantSuggestions} onSuggestion={(value) => void handleAssistantPrompt(value)} />
                ) : null}

                <section className={`rased-panel-soft ${toneClass(assistantNotice.tone)}`}>
                  <p className="text-xs font-black tracking-[0.18em]">ملخص سريع</p>
                  <h3 className="mt-1 text-base font-black">{assistantNotice.title}</h3>
                  <p className="mt-2 text-sm leading-7">{assistantNotice.body}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {assistantNotice.chips.map((chip) => (
                      <span key={chip} className="rounded-full border border-current/15 bg-white/70 px-2.5 py-1 text-[11px] font-black">{chip}</span>
                    ))}
                  </div>
                </section>

                {fileRejections.length > 0 ? (
                  <section className="rased-status-error">
                    {fileRejections.map(({ file, errors }) => <p key={file.name}>{file.name}: {errors.map((error) => error.message).join("، ")}</p>)}
                  </section>
                ) : null}

                {bundle?.files.map((item) => <CanvasFileCard key={fileKey(item.file)} item={item} cardId={`card.file.${fileKey(item.file).replace(/[^a-zA-Z0-9._-]+/g, "-")}`} />)}

                {bundle && primaryActions.length > 0 ? (
                  <CanvasActionsCard
                    actions={primaryActions}
                    busyActionId={executingAction}
                    onRun={(actionId) => void runActionFromUI(actionId)}
                    onOpenSearch={() => send({ type: "PALETTE/OPEN" })}
                    cardId={bundle.files[0] ? `card.actions.${fileKey(bundle.files[0].file).replace(/[^a-zA-Z0-9._-]+/g, "-")}` : undefined}
                  />
                ) : null}

                {bundle ? <CanvasPlanCard title={executingAction ? actionChipLabel(executingAction) : bundle.title} steps={planSteps(bundle, executingAction)} statusLabel={statusLabel} cardId={activeJobId ? `card.plan.${activeJobId}` : undefined} /> : null}

                {mergedConversation.map((message: ConversationMessage, index) => (
                  <CanvasConversationCard key={`${message.createdAt}-${index}`} message={message} />
                ))}

                {activeJob && activeJob.stage !== "completed" && activeJob.stage !== "failed" ? <CanvasRunCard title={executingAction ? actionChipLabel(executingAction) : bundle?.title ?? "قيد التنفيذ"} job={activeJob} stageLabel={statusLabel} teaser={activeTeaser} cardId={`card.run.${activeJob.jobId}`} /> : null}
                {activeJob?.previewCards.length ? <CanvasPreviewCard title="المعاينة الأولية" previewImage={result?.previewImage} cardId={activeJob.previewCards[0] ?? `card.preview.${activeJob.jobId}.0`} /> : null}
                {result && activeJob ? <CanvasPreviewCard title={result.title} previewText={result.previewText} previewImage={result.previewImage} cardId={activeJob.previewCards[1] ?? `card.preview.${activeJob.jobId}.1`} /> : null}
                {result && resultReady && activeJob ? <CanvasResultCard result={result} evidenceReady downloadOutputs={resultDownloads} routeOutputs={resultRoutes} onOpenFocus={() => send({ type: "FOCUS/OPEN", artifactId: result.id, kind: inferResultArtifactKind(result.actionId), stageMode: "view" })} cardId={`card.result.${activeJob.jobId}`} /> : null}
                {resultEvidence && evidenceVisible && activeJob ? <CanvasEvidenceCard evidence={resultEvidence} cardId={`card.evidence.${activeJob.jobId}`} /> : null}
              </div>
            </div>
          </section>

        </div>

        {sidebarMode !== "hidden" && (
          <aside className={`space-y-6 ${sidebarMode === "full" ? "" : "xl:max-w-[320px]"}`}>
            <section className="rased-panel rased-motion-stagger-2 overflow-hidden">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black tracking-[0.18em] text-slate-400">لوحة جانبية</p>
                  <h2 className="mt-1 text-base font-black text-slate-950">لوحة السياق الحالية</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">يتغير المحتوى هنا حسب ما حددته داخل الـCanvas فقط.</p>
                </div>
                <div data-rased-options-surface="sidebar-shell" className="flex items-center gap-2">
                  <button data-rased-id="sidebar.pin" data-rased-option="true" type="button" onClick={() => send({ type: "SIDEBAR/TOGGLE_PIN" })} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-cyan-200 hover:text-cyan-700">
                    {canvasState.sidebar.pin === "pinned" ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  </button>
                  <button data-rased-id="sidebar.close" data-rased-option="true" type="button" onClick={toggleSidebar} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-cyan-200 hover:text-cyan-700">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div data-rased-options-surface="sidebar-tabs" className="mt-4 flex flex-wrap gap-2">
                {[
                  ["context", "السياق"],
                  ["library", "المكتبة"],
                  ["history", "السجل"],
                  ["exports", "التصدير"],
                  ["permissions", "الحوكمة"],
                ].map(([tabId, label]) => (
                  <CanvasSidebarTabButton
                    key={tabId}
                    active={activeSidebarTab === tabId}
                    label={label}
                    dataRasedId={`sidebar.tab.${tabId}`}
                    onClick={() => send({ type: "SIDEBAR/SET_TAB", tab: tabId as SidebarTab })}
                  />
                ))}
              </div>

              <div className="mt-5 space-y-4">
                {activeSidebarTab === "context" ? (
                  <>
                    <section className={`rounded-[24px] border px-4 py-4 ${toneClass(assistantNotice.tone)}`}>
                      <p className="text-xs font-black tracking-[0.18em]">ملخص سريع</p>
                      <h3 className="mt-1 text-sm font-black">{assistantNotice.title}</h3>
                      <p className="mt-2 text-sm leading-7">{assistantNotice.body}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {assistantNotice.chips.map((chip) => (
                          <span key={chip} className="rounded-full border border-current/15 bg-white/70 px-2.5 py-1 text-[11px] font-black">
                            {chip}
                          </span>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black tracking-[0.18em] text-slate-400">اقتراحات</p>
                          <p className="mt-1 text-sm font-black text-slate-900">إجراءات سريعة وسياقية</p>
                        </div>
                        <button data-rased-id="sidebar.search" data-rased-option="true" type="button" onClick={() => send({ type: "PALETTE/OPEN" })} className="rased-action-secondary px-3 py-2 text-xs">
                          <Search className="h-4 w-4" />
                          <span>بحث</span>
                        </button>
                      </div>
                      <div data-rased-options-surface="sidebar-suggestions" className="mt-3 flex flex-wrap gap-2">
                        {assistantSuggestions.slice(0, 4).map((prompt) => (
                          <button key={prompt} data-rased-option="true" type="button" onClick={() => void handleAssistantPrompt(prompt)} className="rased-chip transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700">
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </section>

                    {bundle ? (
                      <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                        <p className="text-xs font-black tracking-[0.18em] text-slate-400">الخطوات</p>
                        <div className="mt-3 space-y-3">
                          {planSteps(bundle, executingAction).map((step, index) => (
                            <div key={step} className="flex items-center gap-3 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-[11px] font-black text-white">
                                0{index + 1}
                              </span>
                              <div>
                                <p className="text-sm font-black text-slate-900">{step}</p>
                                <p className="text-xs text-slate-500">{index === 0 ? statusLabel : "سيتفعل تلقائيًا عند التقدم"}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </>
                ) : null}

                {activeSidebarTab === "library" ? (
                  <>
                    <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                      <p className="text-xs font-black tracking-[0.18em] text-slate-400">الملفات الحالية</p>
                      <div className="mt-3 space-y-3">
                        {bundle ? bundle.files.map((item) => (
                          <div key={fileKey(item.file)} className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                            <p className="truncate text-sm font-black text-slate-900">{item.file.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{item.extension || item.mimeType || item.kind} · {item.sizeLabel}</p>
                          </div>
                        )) : <p className="rased-empty">لم تُضف ملفات بعد.</p>}
                      </div>
                    </section>

                    <section className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-xs font-black tracking-[0.18em] text-slate-400">البيانات الحديثة</p>
                      <div className="mt-3 space-y-3">
                        {recentDatasets.length > 0 ? recentDatasets.map((dataset) => (
                          <div key={dataset.id} className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                            <p className="truncate text-sm font-black text-slate-900">{dataset.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{dataset.format.toUpperCase()} · {dataset.rowCount} صف · {dataset.columnCount} عمود</p>
                          </div>
                        )) : <p className="rased-empty">لا توجد مجموعات حديثة في الجلسة.</p>}
                      </div>
                    </section>
                  </>
                ) : null}

                {activeSidebarTab === "history" ? (
                  <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black tracking-[0.18em] text-slate-400">السجل</p>
                      <span className="text-[11px] font-black text-slate-400">{activity.length} عناصر</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {activity.length > 0 ? activity.map((item) => (
                        <div key={item.id} className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-black text-slate-900">{item.label}</p>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${item.status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                              {item.status === "success" ? "نجح" : "فشل"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-6 text-slate-500">{item.note}</p>
                          <p className="mt-2 text-[11px] text-slate-400">{item.source === "assistant" ? "عبر الشات" : "عبر الاختيار المباشر"} · {formatTime(item.executedAt)}</p>
                        </div>
                      )) : <p className="rased-empty">السجل سيظهر هنا بعد أول تشغيل.</p>}
                    </div>
                  </section>
                ) : null}

                {activeSidebarTab === "exports" ? (
                  <>
                    <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black tracking-[0.18em] text-slate-400">المخرجات</p>
                      <button data-rased-id="exports.open" data-rased-option="true" type="button" onClick={() => result && send({ type: "FOCUS/OPEN", artifactId: result.id, kind: inferResultArtifactKind(result.actionId), stageMode: "view" })} disabled={!resultReady || !result} className="rased-action-secondary px-3 py-2 text-xs disabled:opacity-50">
                        <Sparkles className="h-4 w-4" />
                        <span>فتح</span>
                      </button>
                    </div>
                      <div className="mt-3 space-y-3">
                        {resultDownloads.length > 0 ? resultDownloads.map((output) => (
                          <a key={output.label} href={output.href} download={output.downloadName} className="flex items-center justify-between rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-black text-slate-900 transition hover:border-cyan-200 hover:bg-cyan-50">
                            <span>{output.label}</span>
                            <Download className="h-4 w-4 text-cyan-700" />
                          </a>
                        )) : <p className="rased-empty">سيظهر التصدير هنا بعد قفل بوابات التحقق.</p>}
                      </div>
                    </section>

                    {resultEvidence && evidenceVisible ? (
                      <section className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4">
                      <p className="text-xs font-black tracking-[0.18em] text-emerald-800">الإثبات</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {resultEvidence.sources.map((source) => (
                            <span key={source.label} className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-black text-emerald-700">
                              {source.label}
                            </span>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </>
                ) : null}

                {activeSidebarTab === "permissions" ? (
                  <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-[18px] bg-slate-950 p-2 text-white">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-black tracking-[0.18em] text-slate-400">الضبط</p>
                        <p className="text-sm font-black text-slate-900">المشاركة والحوكمة</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-sm font-black text-slate-900">وضع النتيجة</p>
                        <p className="mt-1 text-xs leading-6 text-slate-500">{resultEvidence ? "الإثبات محفوظ ويمكن مشاركة النتيجة وفق الصلاحيات." : "النتيجة ما زالت قيد التحقق أو لم تُبن بعد."}</p>
                      </div>
                      <button data-rased-id="permissions.to-exports" data-rased-option="true" type="button" onClick={() => send({ type: "SIDEBAR/SET_TAB", tab: "exports" })} className="rased-action-secondary w-full justify-center">
                        <Share2 className="h-4 w-4" />
                        <span>الانتقال إلى التصدير والمشاركة</span>
                      </button>
                    </div>
                  </section>
                ) : null}
              </div>
            </section>
          </aside>
        )}
      </div>
      {focusOpen && result ? (
        <div data-rased-id="focus.stage" className="rased-focus-stage-shell fixed inset-0 z-40 bg-slate-950/55 px-4 py-4 backdrop-blur-sm">
          <div className="mx-auto grid h-full max-w-7xl gap-4 xl:grid-cols-[minmax(0,1.25fr)_320px]">
            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-[0.18em] text-slate-400">التركيز</p>
                  <h2 className="mt-2 text-xl font-black text-slate-900">{result.title}</h2>
                </div>
                <div data-rased-options-surface="focus-header" className="flex items-center gap-2">
                  <button data-rased-id="focus.preview" data-rased-option="true" type="button" onClick={() => focusPreviewRef.current?.scrollIntoView({ behavior: canvasState.uiEffects.reduceMotion ? "auto" : "smooth", block: "start" })} className="rased-action-secondary px-3 py-2 text-xs">
                    <Search className="h-4 w-4" />
                    <span>معاينة</span>
                  </button>
                  <button data-rased-id="focus.export" data-rased-option="true" type="button" onClick={() => { send({ type: "SIDEBAR/OPEN" }); send({ type: "SIDEBAR/SET_TAB", tab: "exports" }); }} className="rased-action-secondary px-3 py-2 text-xs">
                    <Download className="h-4 w-4" />
                    <span>تنزيل</span>
                  </button>
                  <button data-rased-id="focus.share" data-rased-option="true" type="button" onClick={() => { send({ type: "SIDEBAR/OPEN" }); send({ type: "SIDEBAR/SET_TAB", tab: "permissions" }); }} className="rased-action-secondary px-3 py-2 text-xs">
                    <Share2 className="h-4 w-4" />
                    <span>مشاركة</span>
                  </button>
                  <button data-rased-id="focus.close" data-rased-option="true" type="button" onClick={() => send({ type: "FOCUS/CLOSE" })} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-cyan-200 hover:text-cyan-700">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600">{result.body}</p>
              <div ref={focusPreviewRef} className="mt-5 space-y-5">
                {result.previewImage ? (
                  <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
                    <img src={result.previewImage} alt="معاينة داخل نافذة التركيز" className="max-h-[520px] w-full object-contain" />
                  </div>
                ) : null}
                {result.previewText ? (
                  <pre className="max-h-[420px] overflow-auto rounded-[24px] bg-slate-950 px-4 py-4 text-xs leading-7 text-slate-100">{result.previewText}</pre>
                ) : null}
              </div>
              {(resultDownloads.length > 0 || resultRoutes.length > 0) ? (
                <div data-rased-options-surface="focus-actions" className="mt-5 flex flex-wrap gap-2">
                  {resultDownloads.slice(0, 5).map((output) => (
                    <a key={`focus-download-${output.label}`} data-rased-option="true" href={output.href} download={output.downloadName} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800 transition hover:border-cyan-300 hover:bg-cyan-100">
                      <Download className="h-4 w-4" />
                      <span>{output.label}</span>
                    </a>
                  ))}
                  {resultRoutes.slice(0, 2).map((output) => (
                    <button
                      key={`focus-route-${output.label}`}
                      data-rased-option="true"
                      type="button"
                      onClick={() => openCanvasRoute(output.href)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>{output.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
            <CanvasFocusRail
              title={assistantNotice.title}
              body={assistantNotice.body}
              chips={assistantNotice.chips}
              suggestions={focusQuickSuggestions}
              onSuggestion={(value) => void handleAssistantPrompt(value)}
              conversation={mergedConversation}
            />
          </div>
        </div>
      ) : (
        <div data-rased-id="focus.stage" className="hidden" aria-hidden="true" />
      )}
      <RasedGuidedTourOverlay
        open={Boolean(guidedTour)}
        sessionId={guidedTour?.sessionId ?? null}
        steps={guidedTour?.steps ?? []}
        stepIndex={guidedTour?.stepIndex ?? 0}
        mode={guidedTour?.mode ?? "explain"}
        reduceMotion={canvasState.uiEffects.reduceMotion}
        onClose={() => void closeGuidedTour("cancelled")}
        onNext={() => void advanceGuidedTour("viewed")}
        onDoIt={(step) => {
          const actions = [
            ...(step.action ? [{ ...step.action, target_rased_id: step.target_rased_id }] : [{ type: "highlight" as const, target_rased_id: step.target_rased_id }]),
          ];
          void runRasedUiActions(actions).then(() => advanceGuidedTour("auto_applied"));
        }}
      />
      <section className="rased-composer-shell fixed inset-x-4 bottom-4 z-30">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleAssistantPrompt(assistantInput);
          }}
          className="mx-auto flex max-w-7xl items-end gap-3 rounded-[30px] border border-slate-200/80 bg-white/95 px-4 py-3 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.48)] backdrop-blur"
        >
          <button data-rased-id="composer.upload" data-rased-option="true" type="button" onClick={open} className="rased-action-secondary px-3 py-3" aria-label="إرفاق ملف">
            <UploadCloud className="h-4 w-4" />
          </button>
          <button data-rased-id="composer.search" data-rased-option="true" type="button" onClick={() => send({ type: "PALETTE/OPEN" })} className="rased-action-secondary px-3 py-3" aria-label="فتح البحث والأوامر">
            <Search className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <input
              data-rased-id="composer.input"
              ref={assistantInputRef}
              value={assistantInput}
              onChange={(event) => setAssistantInput(event.target.value)}
              placeholder="اكتب المطلوب أو اسحب الملف هنا"
              aria-label="محرر أوامر راصد"
              className="rased-field min-h-[52px] border-transparent bg-slate-50"
            />
            <p className="mt-2 px-1 text-[11px] font-bold text-slate-400">كل شيء يبقى هنا ويُفتح داخل نافذة التركيز دون مغادرة الشاشة.</p>
          </div>
          <button
            data-rased-id="composer.send"
            data-rased-option="true"
            type="submit"
            disabled={assistantBusy}
            aria-label="إرسال الطلب إلى راصد"
            title="إرسال الطلب إلى راصد"
            className="rased-action-primary min-w-[110px] px-4 py-3"
          >
            {assistantBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            <span>{assistantBusy ? "جارٍ..." : "إرسال"}</span>
          </button>
        </form>
      </section>
      {canvasState.overlays.commandPaletteOpen && (
        <div data-rased-id="command.palette" className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 px-4 py-16 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[30px] border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] text-slate-400">البحث السريع</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">ابحث عن أمر أو نتيجة أو مسار</h2>
              </div>
              <button type="button" onClick={() => send({ type: "PALETTE/CLOSE" })} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-cyan-200 hover:text-cyan-700"><X className="h-5 w-5" /></button>
            </div>
            <input data-rased-id="command.palette.input" value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} autoFocus placeholder="ابحث باسم الإجراء أو المسار" className="rased-field mt-4 w-full" />
            <div data-rased-options-surface="command-results" className="mt-4 space-y-2">
              {commandItems.length > 0 ? commandItems.map((item) => <button key={item.id} data-rased-option="true" type="button" onClick={() => void runCommandPaletteItem(item)} className="flex w-full items-start justify-between rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-right transition hover:border-cyan-200 hover:bg-cyan-50"><div><p className="text-sm font-black text-slate-900">{item.label}</p><p className="mt-1 text-xs text-slate-500">{item.description}</p></div><ChevronLeft className="mt-1 h-4 w-4 text-slate-300" /></button>) : <div className="rounded-[22px] border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">لا توجد نتائج مطابقة لهذا البحث.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <RasedCanvasProvider>
      <React.Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
        <HomePageContent />
      </React.Suspense>
    </RasedCanvasProvider>
  );
}
