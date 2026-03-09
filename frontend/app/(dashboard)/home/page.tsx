"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import {
  ArrowLeft,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileImage,
  FileSpreadsheet,
  Globe2,
  Loader2,
  Presentation,
  RefreshCcw,
  ScanSearch,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { getDatasets, getDatasetById, importDataset, type Dataset, type DatasetDetail } from "@/lib/api/data";
import { addReportSection, buildReport, createReport, exportReport, getReports } from "@/lib/api/reporting";
import { exportPresentation, fetchPresentations, generatePresentationFromAi, generatePresentationFromData, generatePresentationFromFile } from "@/lib/api/presentation";
import { analyzeDataset, getDashboards } from "@/lib/api/dashboard";
import { applyRtlContent, detectTextLanguage, translatePlainText } from "@/lib/api/localization";
import { convertCsvToExcel, convertExcelToCsv, convertExcelToPdf, convertMarkdownToHtml, convertPdfToWord, convertWordToPdf } from "@/lib/api/conversion";
import { extractMultimodal } from "@/lib/api/multimodal";
import { analyzeVisualImage, compareVisualReplication, reconstructDashboardFromImage } from "@/lib/api/replication";
import { askSurfaceAssistant } from "@/lib/api/ai";
import { buildHomeFileBundle, type HomeActionId, type HomeCapabilityAction, type HomeFileBundle } from "@/lib/home/home-file-capabilities";
import { OFFICIAL_MARK_URL, OFFICIAL_PLATFORM_NAME, OFFICIAL_PLATFORM_TAGLINE } from "@/lib/branding";

type Stats = { datasets: number | null; reports: number | null; presentations: number | null; dashboards: number | null };
type DatasetState = { fileKey: string; importResult: { datasetId: string; name: string; rowCount: number; columnCount: number; status: string; warnings: string[] }; detail: DatasetDetail };
type OutputAction = { kind: "route" | "download"; label: string; href: string; downloadName?: string };
type ResultState = { id: string; actionId: HomeActionId; status: "success" | "error"; title: string; body: string; chips: string[]; previewText?: string; previewImage?: string; outputs?: OutputAction[]; executedAt: string };
type ActivityItem = { id: string; label: string; note: string; status: "success" | "error"; executedAt: string; source: "guided" | "assistant" };
type AssistantNotice = { title: string; body: string; chips: string[]; tone: "neutral" | "success" | "error" };

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

const SECONDARY_LINKS = [
  { label: "البيانات", href: "/data" },
  { label: "التحليل", href: "/analysis" },
  { label: "التقارير", href: "/reports" },
  { label: "العروض", href: "/presentations" },
  { label: "المكتبة", href: "/library" },
];

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

function actionIcon(actionId: HomeActionId) {
  switch (actionId) {
    case "import-dataset":
    case "analyze-dataset":
    case "build-report":
      return BarChart3;
    case "generate-data-presentation":
    case "generate-file-presentation":
    case "generate-ai-presentation":
      return Presentation;
    case "extract-exact":
    case "extract-steps":
      return ScanSearch;
    case "translate-arabic":
    case "apply-rtl":
      return Globe2;
    case "convert-markdown-html":
    case "convert-pdf-word":
    case "convert-word-pdf":
    case "convert-excel-pdf":
    case "convert-csv-excel":
    case "convert-excel-csv":
      return FileSpreadsheet;
    default:
      return FileImage;
  }
}

function outputClass(kind: OutputAction["kind"]) {
  return kind === "route"
    ? "border border-slate-300 bg-white text-slate-700 hover:border-cyan-300 hover:text-cyan-700"
    : "border border-cyan-200 bg-cyan-50 text-cyan-800 hover:border-cyan-300 hover:bg-cyan-100";
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

export default function HomePage() {
  const router = useRouter();
  const downloadUrlsRef = useRef<string[]>([]);
  const assistantInputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<Stats>({ datasets: null, reports: null, presentations: null, dashboards: null });
  const [recentDatasets, setRecentDatasets] = useState<Dataset[]>([]);
  const [bundle, setBundle] = useState<HomeFileBundle | null>(null);
  const [datasetState, setDatasetState] = useState<DatasetState | null>(null);
  const [fileRejections, setFileRejections] = useState<FileRejection[]>([]);
  const [executingAction, setExecutingAction] = useState<HomeActionId | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantNotice, setAssistantNotice] = useState<AssistantNotice>(defaultNotice);
  const [assistantSessionId, setAssistantSessionId] = useState<string | null>(null);

  const clearDownloads = useCallback(() => {
    downloadUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    downloadUrlsRef.current = [];
  }, []);

  const loadHomeData = useCallback(async () => {
    const results = await Promise.allSettled([
      getDatasets({ page: 1, limit: 3 }),
      getReports({ page: 1, limit: 1 }),
      fetchPresentations({ page: 1, limit: 1 }),
      getDashboards({ page: 1, limit: 1 }),
    ]);

    setStats({
      datasets: results[0].status === "fulfilled" ? results[0].value.total : null,
      reports: results[1].status === "fulfilled" ? results[1].value.total : null,
      presentations: results[2].status === "fulfilled" ? results[2].value.total : null,
      dashboards: results[3].status === "fulfilled" ? results[3].value.total : null,
    });
    setRecentDatasets(results[0].status === "fulfilled" ? results[0].value.data.slice(0, 3) : []);
  }, []);

  useEffect(() => { void loadHomeData(); }, [loadHomeData]);
  useEffect(() => () => clearDownloads(), [clearDownloads]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const openAssistant = () => {
      setAssistantNotice((current) => current ?? defaultNotice);
      window.requestAnimationFrame(() => assistantInputRef.current?.focus());
    };

    window.addEventListener("rasid:open-assistant", openAssistant as EventListener);
    return () => window.removeEventListener("rasid:open-assistant", openAssistant as EventListener);
  }, []);

  const primaryActions = useMemo(() => (bundle ? bundle.actions.slice(0, 3) : []), [bundle]);
  const secondaryActions = useMemo(() => (bundle ? bundle.actions.slice(3) : []), [bundle]);
  const assistantSuggestions = useMemo(() => {
    if (!bundle) return ["كيف أبدأ؟", "ما أنواع الملفات المدعومة؟", "لدي صورتان للمقارنة"];
    return [bundle.actions[0]?.title ?? "ما الأنسب لهذا الملف؟", bundle.actions[1]?.title ?? "ما الخطوة التالية؟", "ما الأنسب لهذا الملف؟", "ما حالة الجلسة؟"]
      .filter((value, index, array) => value && array.indexOf(value) === index)
      .slice(0, 4);
  }, [bundle]);

  const createDownloadAction = useCallback((blob: Blob, label: string, downloadName: string): OutputAction => {
    const href = URL.createObjectURL(blob);
    downloadUrlsRef.current.push(href);
    return { kind: "download", label, href, downloadName };
  }, []);

  const resetSession = useCallback(() => {
    clearDownloads();
    setBundle(null);
    setDatasetState(null);
    setFileRejections([]);
    setExecutingAction(null);
    setShowAllActions(false);
    setResult(null);
    setActivity([]);
    setAssistantInput("");
    setAssistantSessionId(null);
    setAssistantNotice({
      title: "جلسة جديدة جاهزة",
      body: "اسحب ملفًا واحدًا أو صورتين للمطابقة الصارمة. سأعيد كشف السياق وأقترح المسار التالي فورًا.",
      chips: ["ملف واحد", "صورتان", "تنفيذ حقيقي"],
      tone: "neutral",
    });
  }, [clearDownloads]);

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

  const finalizeExecution = useCallback((next: Omit<ResultState, "id" | "executedAt">, source: "guided" | "assistant") => {
    const finalResult: ResultState = { ...next, id: createId("result"), executedAt: new Date().toISOString() };
    setResult(finalResult);
    setActivity((current) => [
      { id: createId("activity"), label: actionChipLabel(finalResult.actionId), note: finalResult.title, status: finalResult.status, executedAt: finalResult.executedAt, source },
      ...current,
    ].slice(0, 4));
    return finalResult;
  }, []);

  const executeAction = useCallback(async (actionId: HomeActionId, source: "guided" | "assistant" = "guided") => {
    if (!bundle?.files[0]?.file) throw new Error("ابدأ بإضافة ملف أولًا.");

    const primaryFile = bundle.files[0].file;
    clearDownloads();
    setExecutingAction(actionId);

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
          }, source);
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
          }, source);
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
          }, source);
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
          }, source);
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
          }, source);
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
          }, source);
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
          }, source);
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
          }, source);
        }
        case "translate-arabic": {
          const content = await readPrimaryFileAsText();
          const detected = await detectTextLanguage(content);
          const translated = await translatePlainText({ text: content, sourceLang: detected.language || "en", targetLang: "ar" });
          return finalizeExecution({ actionId, status: "success", title: "اكتمل التعريب", body: "أعادت خدمة التوطين النص العربي مباشرة من داخل الصفحة الرئيسية.", chips: [`من ${translated.sourceLang}`, `إلى ${translated.targetLang}`], previewText: translated.translatedText }, source);
        }
        case "apply-rtl": {
          const content = await readPrimaryFileAsText();
          const rtlContent = await applyRtlContent(content);
          return finalizeExecution({ actionId, status: "success", title: "تم تجهيز المحتوى عربيًا", body: "شغّل راصد معالجة RTL على النص الحالي وأعاد صياغته للعرض العربي.", chips: ["RTL", "خدمة التوطين"], previewText: rtlContent }, source);
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
          }, source);
        }
        case "convert-pdf-word": {
          const blob = await convertPdfToWord(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "تم التحويل إلى وورد", body: "أنتجت خدمة التحويل ملف DOCX جاهزًا للتنزيل.", chips: ["PDF", "DOCX"], outputs: [createDownloadAction(blob, "تنزيل ملف وورد", `${baseName(primaryFile.name)}.docx`)] }, source);
        }
        case "convert-word-pdf": {
          const blob = await convertWordToPdf(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "تم التحويل إلى PDF", body: "أنتجت خدمة التحويل ملف PDF فعليًا من المستند الحالي.", chips: ["DOCX", "PDF"], outputs: [createDownloadAction(blob, "تنزيل PDF", `${baseName(primaryFile.name)}.pdf`)] }, source);
        }
        case "convert-excel-pdf": {
          const blob = await convertExcelToPdf(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "تم تحويل الجدول إلى PDF", body: "حوّلت خدمة التحويل ملف الجدول إلى PDF قابل للتنزيل.", chips: ["Excel", "PDF"], outputs: [createDownloadAction(blob, "تنزيل PDF", `${baseName(primaryFile.name)}.pdf`)] }, source);
        }
        case "convert-csv-excel": {
          const blob = await convertCsvToExcel(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "تم تحويل CSV إلى إكسل", body: "تم إنشاء ملف XLSX فعلي من بيانات CSV الحالية.", chips: ["CSV", "XLSX"], outputs: [createDownloadAction(blob, "تنزيل ملف إكسل", `${baseName(primaryFile.name)}.xlsx`)] }, source);
        }
        case "convert-excel-csv": {
          const blob = await convertExcelToCsv(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "تم تحويل إكسل إلى CSV", body: "أنتجت خدمة التحويل ملف CSV فعليًا من الجدول الحالي.", chips: ["Excel", "CSV"], outputs: [createDownloadAction(blob, "تنزيل CSV", `${baseName(primaryFile.name)}.csv`)] }, source);
        }
        case "analyze-visual": {
          const analysis = await analyzeVisualImage(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "اكتمل التحليل البصري", body: "فحص راصد الصورة بصريًا وأعاد عناصرها الأساسية عبر خدمة المطابقة.", chips: [`${analysis.elements.length} عنصر`, `نوع المصدر ${String(analysis.metadata?.sourceType ?? "screenshot")}`], previewText: JSON.stringify(analysis.analysis, null, 2) }, source);
        }
        case "reconstruct-dashboard": {
          const dashboard = await reconstructDashboardFromImage(primaryFile);
          return finalizeExecution({ actionId, status: "success", title: "تم إنشاء لوحة مؤشرات من الصورة", body: "حوّلت خدمة المطابقة البصرية الصورة إلى لوحة مؤشرات حقيقية داخل النظام.", chips: [`المعرّف ${dashboard.dashboardId}`], outputs: [{ kind: "route", label: "فتح التحليل", href: "/analysis" }] }, source);
        }
        case "compare-visuals": {
          if (bundle.files.length < 2) throw new Error("المطابقة الصارمة تحتاج صورتين.");
          const compare = await compareVisualReplication(bundle.files[0].file, bundle.files[1].file);
          return finalizeExecution({ actionId, status: "success", title: compare.passed ? "المطابقة الصارمة اجتازت الفحص" : "المطابقة الصارمة كشفت فروقات", body: "تمت المقارنة البصرية الحقيقية بين الصورتين مع حساب الفروقات البنيوية والبكسلية.", chips: [`SSIM ${compare.ssim.toFixed(3)}`, `${compare.mismatchedPixels} بكسل مختلف`, compare.passed ? "مطابقة ناجحة" : "فروقات مرئية"], previewImage: compare.diffImage }, source);
        }
      }
    } catch (error) {
      return finalizeExecution({ actionId, status: "error", title: "فشل التنفيذ", body: getErrorMessage(error), chips: [actionChipLabel(actionId)] }, source);
    } finally {
      setExecutingAction(null);
    }
  }, [bundle, clearDownloads, createDownloadAction, ensureDatasetImported, finalizeExecution, loadHomeData, readPrimaryFileAsText]);

  const handleAcceptedFiles = useCallback((files: File[]) => {
    clearDownloads();
    setDatasetState(null);
    setFileRejections([]);
    setExecutingAction(null);
    setShowAllActions(false);
    setResult(null);
    setActivity([]);
    const nextBundle = buildHomeFileBundle(files);
    setBundle(nextBundle);
    setAssistantNotice(
      nextBundle.kind === "unsupported"
        ? { title: "هذا المسار غير متاح من الصفحة الرئيسية", body: nextBundle.summary, chips: ["ابدأ من ملف مدعوم"], tone: "error" }
        : { title: nextBundle.title, body: nextBundle.orchestrationNote, chips: nextBundle.brainSteps, tone: "success" }
    );
  }, [clearDownloads]);

  const handleRejectedFiles = useCallback((rejections: FileRejection[]) => {
    setFileRejections(rejections);
    setAssistantNotice({
      title: "تعذر قبول الملف",
      body: "الصفحة الرئيسية تقبل ملفًا واحدًا لمعظم المسارات، أو صورتين فقط للمطابقة البصرية الصارمة.",
      chips: rejections.flatMap((rejection) => rejection.errors.map((error) => error.message)).slice(0, 3),
      tone: "error",
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: ACCEPTED_FILES,
    maxFiles: 2,
    multiple: true,
    noClick: true,
    onDropAccepted: handleAcceptedFiles,
    onDropRejected: handleRejectedFiles,
  });

  const runActionFromUI = useCallback(async (actionId: HomeActionId) => {
    const next = await executeAction(actionId, "guided");
    setAssistantNotice({ title: next.title, body: next.body, chips: next.chips, tone: next.status === "success" ? "success" : "error" });
  }, [executeAction]);

  const handleAssistantPrompt = useCallback(async (rawPrompt: string) => {
    const query = rawPrompt.trim();
    if (!query) return;
    setAssistantBusy(true);

    try {
      const normalizedQuery = normalizeArabicText(query);
      const matched = bundle ? findMatchingAction(normalizedQuery, bundle.actions) : null;
      if (matched && shouldAutoRunMatchedAction(normalizedQuery, matched)) {
        const next = await executeAction(matched.id, "assistant");
        setAssistantNotice({ title: next.title, body: next.body, chips: next.chips, tone: next.status === "success" ? "success" : "error" });
        return;
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
    } finally {
      setAssistantBusy(false);
      setAssistantInput("");
    }
  }, [assistantSessionId, bundle, executeAction, result]);

  const supportedSummary = bundle
    ? bundle.files.map((item) => `${item.file.name} · ${item.sizeLabel}`).join("  •  ")
    : "CSV، XLSX، PDF، DOCX، TXT، MD، HTML، JSON، وصورة واحدة أو صورتان.";

  return (
    <div dir="rtl" className="rased-surface-page pb-8">
      <section className="rased-motion-rise rounded-[32px] border border-slate-200/70 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),_transparent_35%),linear-gradient(135deg,_#08111f_0%,_#10243c_52%,_#0f172a_100%)] px-6 py-6 text-white shadow-[0_32px_80px_-48px_rgba(15,23,42,0.9)] lg:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[11px] font-bold text-cyan-100 backdrop-blur">
              <img src={OFFICIAL_MARK_URL} alt={OFFICIAL_PLATFORM_NAME} className="h-7 w-7 rounded-xl border border-white/10 bg-white/90 object-contain p-1" />
              <div className="text-right">
                <p className="text-sm font-black text-white">{OFFICIAL_PLATFORM_NAME}</p>
                <p className="text-[11px] font-semibold text-cyan-100/80">{OFFICIAL_PLATFORM_TAGLINE}</p>
              </div>
            </div>
            <h1 className="mt-4 text-3xl font-black leading-[1.25] lg:text-[2.45rem]">ابدأ المهمة من هنا</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-200 lg:text-[15px]">
              أسقط ملفًا واحدًا، أو صورتين للمقارنة الصارمة. سيكشف راصد النوع أولًا ثم يعرض لك أفضل الخطوات فقط.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100">البيانات {stats.datasets ?? "—"}</span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100">التقارير {stats.reports ?? "—"}</span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100">العروض {stats.presentations ?? "—"}</span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100">التحليل {stats.dashboards ?? "—"}</span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <div className="space-y-6">
          <section className="rased-panel rased-motion-stagger-1 overflow-hidden !p-0">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-bold tracking-[0.18em] text-slate-400">بداية ذكية</p>
                  <h2 className="mt-1 text-lg font-black text-slate-900">الملف أولًا</h2>
                  <p className="mt-1 text-sm text-slate-500">افهم الملف، ثم اختر المسار الأنسب من دون ازدحام أو تخمين.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={open} className="rased-action-primary">
                    <UploadCloud className="h-4 w-4" />
                    <span>اختيار ملف</span>
                  </button>
                  <button type="button" onClick={resetSession} className="rased-action-secondary">
                    <RefreshCcw className="h-4 w-4" />
                    <span>جلسة جديدة</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5">
              <div {...getRootProps()} data-testid="home-dropzone" className={`relative overflow-hidden rounded-[28px] border border-dashed px-5 py-8 transition-all duration-300 ${isDragActive ? "border-cyan-400 bg-cyan-50 shadow-[0_0_0_10px_rgba(34,211,238,0.12)]" : "border-slate-300 bg-[radial-gradient(circle_at_top_right,_rgba(240,249,255,0.95),_rgba(248,250,252,1)_58%)] hover:border-slate-400 hover:bg-slate-50"}`}>
                <input {...getInputProps({ className: "hidden", "aria-label": "اختيار ملف الصفحة الرئيسية" })} />
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`rounded-[22px] p-3.5 transition ${isDragActive ? "bg-cyan-100 text-cyan-700" : "bg-slate-950 text-white"}`}>
                      <UploadCloud className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-lg font-black text-slate-900">{isDragActive ? "اترك الملف هنا" : "اسحب الملف إلى هنا"}</p>
                      <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">
                        {bundle ? "تم التعرف على الملف الحالي. يمكنك استبداله بملف جديد في أي وقت." : "ملف واحد لمعظم المسارات، أو صورتين فقط للمطابقة البصرية الصارمة. بعد الاكتشاف سأعرض الخيارات المناسبة لهذا السياق فقط."}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                    <span className="rounded-full bg-white px-3 py-1 shadow-sm">كشف فوري</span>
                    <span className="rounded-full bg-white px-3 py-1 shadow-sm">خيارات محددة</span>
                    <span className="rounded-full bg-white px-3 py-1 shadow-sm">تنفيذ فعلي</span>
                  </div>
                </div>
                <div className="mt-6 text-xs leading-6 text-slate-400">{supportedSummary}</div>
              </div>

              {fileRejections.length > 0 && (
                <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {fileRejections.map(({ file, errors }) => <p key={file.name}>{file.name}: {errors.map((error) => error.message).join("، ")}</p>)}
                </div>
              )}

              <div className="mt-5 space-y-4">
                {bundle ? (
                  <>
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-cyan-700 shadow-sm">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>{bundle.title}</span>
                          </div>
                          <p className="mt-3 text-sm leading-7 text-slate-600">{bundle.summary}</p>
                          <p className="mt-2 text-xs leading-6 text-slate-500">{bundle.orchestrationNote}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {bundle.files.map((item) => <span key={fileKey(item.file)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">{item.file.name} · {item.sizeLabel}</span>)}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {bundle.brainSteps.map((step) => <span key={step} className="rased-chip">{step}</span>)}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-black text-slate-900">أفضل الخطوات الآن</h3>
                          <p className="mt-1 text-sm text-slate-500">أعرض لك البداية الأنسب أولًا، ثم أترك الباقي عند الحاجة فقط.</p>
                        </div>
                        {secondaryActions.length > 0 && <button type="button" onClick={() => setShowAllActions((current) => !current)} className="text-xs font-bold text-cyan-700 transition hover:text-cyan-600">{showAllActions ? "إخفاء الخيارات الإضافية" : "إظهار خيارات إضافية"}</button>}
                      </div>
                      <div className="grid gap-3 lg:grid-cols-3">
                        {[...primaryActions, ...(showAllActions ? secondaryActions : [])].map((action) => {
                          const Icon = actionIcon(action.id);
                          const busy = executingAction === action.id;
                          return (
                            <button key={action.id} type="button" onClick={() => void runActionFromUI(action.id)} disabled={Boolean(executingAction)} data-testid={`home-action-${action.id}`} className={`group rounded-[24px] border px-4 py-4 text-right transition-all duration-300 ${busy ? "border-cyan-300 bg-cyan-50 shadow-[0_18px_34px_-24px_rgba(8,145,178,0.55)]" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-[0_18px_34px_-24px_rgba(15,23,42,0.24)]"} ${executingAction && !busy ? "opacity-60" : ""}`}>
                              <div className="flex items-center justify-between gap-3">
                                <div className={`rounded-[18px] p-2.5 ${busy ? "bg-cyan-600 text-white" : "bg-slate-950 text-white transition group-hover:bg-cyan-600"}`}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}</div>
                                <ChevronLeft className="h-4 w-4 text-slate-300 transition group-hover:text-cyan-500" />
                              </div>
                              <h4 className="mt-4 text-sm font-black text-slate-900">{action.title}</h4>
                              <p className="mt-2 text-sm leading-6 text-slate-500">{action.description}</p>
                              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1">{action.serviceLabel}</span>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1">{action.outputLabel}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.88fr)]">
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                      <h3 className="text-sm font-black text-slate-900">ماذا سيحدث بعد الرفع؟</h3>
                      <div className="mt-4 space-y-3">
                        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm"><p className="text-sm font-bold text-slate-800">1. كشف النوع</p><p className="mt-1 text-sm leading-6 text-slate-500">بيانات، مستند، صورة، أو صورتان للمقارنة الصارمة.</p></div>
                        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm"><p className="text-sm font-bold text-slate-800">2. اقتراح أفضل خطوة</p><p className="mt-1 text-sm leading-6 text-slate-500">تعريب، تحليل، تقرير، عرض، تحويل، أو مطابقة بصرية بحسب السياق.</p></div>
                        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm"><p className="text-sm font-bold text-slate-800">3. متابعة التنفيذ</p><p className="mt-1 text-sm leading-6 text-slate-500">تظهر النتيجة الحالية هنا مع الملفات الجاهزة أو روابط الانتقال المناسبة.</p></div>
                      </div>
                    </div>
                    <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                      <h3 className="text-sm font-black text-slate-900">بدء سريع هادئ</h3>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={open} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700">رفع ملف الآن</button>
                        <button type="button" onClick={() => setAssistantNotice({ title: "للمطابقة الصارمة", body: "أسقط صورتين معًا. سيظهر لك خيار المطابقة البصرية الصارمة مباشرة.", chips: ["صورتان", "مقارنة بكسلية", "تقرير فروقات"], tone: "neutral" })} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700">لدي صورتان</button>
                        <button type="button" onClick={() => setAssistantNotice({ title: "للمستندات النصية", body: "ارفع TXT أو MD أو HTML أو JSON ليظهر التعريب والتنسيق العربي والعرض الذكي حسب الملف.", chips: ["TXT", "MD", "HTML", "JSON"], tone: "neutral" })} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700">ماذا عن المستندات؟</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rased-panel rased-motion-stagger-2">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] text-slate-400">الجلسة الحالية</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">الجلسة الحالية</h2>
                <p className="mt-1 text-sm text-slate-500">ما الذي اخترته، ما الذي نُفّذ، وما الخطوة التالية إذا أردت الاستمرار.</p>
              </div>
              {executingAction && <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-700"><Loader2 className="h-4 w-4 animate-spin" /><span>جارٍ تنفيذ {actionChipLabel(executingAction)}</span></div>}
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-3">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-bold text-slate-400">الملف الحالي</p>
                  <div className="mt-3 space-y-2">
                    {bundle ? bundle.files.map((item) => <div key={fileKey(item.file)} className="rounded-2xl border border-slate-200 bg-white px-3 py-3"><p className="truncate text-sm font-black text-slate-900">{item.file.name}</p><p className="mt-1 text-xs text-slate-500">{item.extension || item.mimeType || item.kind} · {item.sizeLabel}</p></div>) : <p className="text-sm leading-7 text-slate-500">لم تبدأ الجلسة بعد. ارفع ملفًا أولًا.</p>}
                  </div>
                  {bundle && <div className="mt-3 flex flex-wrap gap-2">{bundle.brainSteps.map((step) => <span key={step} className="rased-chip">{step}</span>)}</div>}
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-400">آخر الحركات</p>{activity.length > 0 && <span className="text-[11px] font-bold text-slate-400">{activity.length} عناصر</span>}</div>
                  <div className="mt-3 space-y-2">
                    {activity.length > 0 ? activity.map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-900">{item.label}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{item.status === "success" ? "نجح" : "فشل"}</span></div><p className="mt-1 text-xs text-slate-500">{item.note}</p><p className="mt-1 text-[11px] text-slate-400">{item.source === "assistant" ? "عبر المساعد" : "عبر الاختيار المباشر"} · {formatTime(item.executedAt)}</p></div>) : <p className="text-sm leading-7 text-slate-500">لا يوجد تنفيذ بعد في هذه الجلسة.</p>}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 py-4">
                {result ? (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${result.status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{result.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}<span>{result.status === "success" ? "مخرج حقيقي جاهز" : "تعذر التنفيذ"}</span></div>
                        <h3 className="mt-4 text-base font-black text-slate-900">{result.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-slate-600">{result.body}</p>
                      </div>
                      <span className="text-xs font-bold text-slate-400">{formatTime(result.executedAt)}</span>
                    </div>
                    {result.chips.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{result.chips.map((chip) => <span key={chip} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-600">{chip}</span>)}</div>}
                    {result.previewText && <pre className="mt-4 overflow-x-auto rounded-[20px] bg-slate-950 px-4 py-3 text-xs leading-7 text-slate-100">{result.previewText}</pre>}
                    {result.previewImage && <div className="mt-4 overflow-hidden rounded-[20px] border border-slate-200 bg-white"><img src={result.previewImage} alt="مخرج بصري من راصد" className="max-h-[360px] w-full object-contain" /></div>}
                    {result.outputs && result.outputs.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{result.outputs.map((output) => output.kind === "route" ? <button key={`${result.id}-${output.label}`} type="button" onClick={() => router.push(output.href)} className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold transition ${outputClass(output.kind)}`}><ArrowLeft className="h-4 w-4" /><span>{output.label}</span></button> : <a key={`${result.id}-${output.label}`} href={output.href} download={output.downloadName} className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold transition ${outputClass(output.kind)}`}><Download className="h-4 w-4" /><span>{output.label}</span></a>)}</div>}
                  </>
                ) : (
                  <div className="flex h-full min-h-[260px] items-center justify-center rounded-[22px] border border-dashed border-slate-200 bg-white px-5 py-6 text-center"><div><p className="text-sm font-black text-slate-900">لا توجد نتيجة بعد</p><p className="mt-2 max-w-md text-sm leading-7 text-slate-500">بعد اختيار الإجراء ستظهر هنا النتيجة الحالية والملفات الجاهزة وروابط المتابعة.</p></div></div>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rased-panel rased-motion-stagger-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-700"><Bot className="h-3.5 w-3.5 text-cyan-600" /><span>مساعد راصد</span></div>
                <h2 className="mt-3 text-base font-black text-slate-900">موجّه الجلسة الحالية</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">يقرأ الملف الحالي ويشرح الخطوة التالية أو ينفذها مباشرة من هنا.</p>
              </div>
              <ScanSearch className="h-5 w-5 text-slate-300" />
            </div>

            <div className={`mt-4 rounded-[22px] border px-4 py-4 ${toneClass(assistantNotice.tone)}`}>
              <p className="text-sm font-black">{assistantNotice.title}</p>
              <p className="mt-2 text-sm leading-7">{assistantNotice.body}</p>
              {assistantNotice.chips.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{assistantNotice.chips.map((chip) => <span key={chip} className="rounded-full border border-current/15 bg-white/60 px-2.5 py-1 text-[11px] font-bold">{chip}</span>)}</div>}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {assistantSuggestions.map((prompt) => <button key={prompt} type="button" onClick={() => void handleAssistantPrompt(prompt)} className="rased-chip transition-all duration-200 hover:-translate-y-0.5">{prompt}</button>)}
            </div>

            <form onSubmit={(event) => { event.preventDefault(); void handleAssistantPrompt(assistantInput); }} className="mt-4 flex gap-2">
              <input
                ref={assistantInputRef}
                value={assistantInput}
                onChange={(event) => setAssistantInput(event.target.value)}
                placeholder="اسأل راصد عن هذه الجلسة"
                aria-label="اسأل راصد عن هذه الجلسة"
                className="rased-field flex-1"
              />
              <button
                type="submit"
                disabled={assistantBusy}
                aria-label="إرسال السؤال إلى راصد"
                title="إرسال السؤال إلى راصد"
                className="rased-action-primary px-4"
              >
                {assistantBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                <span className="sr-only">إرسال السؤال إلى راصد</span>
              </button>
            </form>
          </section>

          <section className="rased-panel rased-motion-stagger-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-black text-slate-900">وصول ثانوي فقط</h2>
                <p className="mt-1 text-sm text-slate-500">للعمل الأعمق بعد البداية من هنا.</p>
              </div>
              <button type="button" onClick={() => router.push("/data")} className="text-xs font-bold text-cyan-700 transition hover:text-cyan-600">فتح البيانات</button>
            </div>
            <div className="mt-4 space-y-3">
              {recentDatasets.length > 0 ? recentDatasets.map((dataset) => <button key={dataset.id} type="button" onClick={() => router.push(`/data/${dataset.id}`)} className="w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-right transition hover:border-cyan-200 hover:bg-cyan-50"><p className="truncate text-sm font-black text-slate-900">{dataset.name}</p><p className="mt-1 text-xs text-slate-500">{dataset.format.toUpperCase()} · {dataset.rowCount} صف · {dataset.columnCount} عمود</p></button>) : <p className="rounded-[22px] border border-dashed border-slate-200 px-4 py-5 text-sm leading-7 text-slate-500">لا توجد عناصر حديثة بعد. ابدأ من رفع ملف، وسيظهر أحدث ما أنشأته هنا.</p>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {SECONDARY_LINKS.map((link) => <button key={link.href} type="button" onClick={() => router.push(link.href)} className="rased-chip transition-all duration-200 hover:-translate-y-0.5">{link.label}</button>)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
