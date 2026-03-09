"use client";

import React, { useState } from "react";
import { useDropzone, type Accept } from "react-dropzone";
import { FileText, ImageIcon, Send, Sparkles, UploadCloud, X } from "lucide-react";
import {
  useSourceLibraryStore,
  type SourceLibraryItem,
} from "@/lib/stores/source-library-store";

type ExperienceFlag = 0 | 1;
type TargetFormat = "dashboard" | "pptx" | "docx" | "html" | "pdf" | "xlsx";
type ServiceKind =
  | "visual_match"
  | "visual_match_ar"
  | "arabization"
  | "translation"
  | "save_library"
  | "template";
type ArabizationMode = "design_rtl" | "terms_only" | "full_localized";
type TranslationLang = "ar" | "en";
type TemplateKind = "executive" | "academic" | "operations";

interface QuickAction {
  id: string;
  label: string;
  value: string;
  tone?: "primary" | "neutral";
}

interface GuidedFlowState {
  service: ServiceKind | null;
  format: TargetFormat | null;
  arabization: ArabizationMode | null;
  translationLang: TranslationLang | null;
  template: TemplateKind | null;
}

interface MessagePreview {
  kind: "image" | "pdf" | "file";
  name: string;
  mimeType: string;
  url?: string;
}

interface MessagePanel {
  title: string;
  lines: string[];
}

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  panel?: MessagePanel;
  actions?: QuickAction[];
  preview?: MessagePreview;
  delivery?: {
    url: string;
    fileName: string;
  };
}

interface LiteralMetrics {
  structural: number;
  pixel: number;
  density: number;
  hierarchy: number;
  byteSimilarity: number;
  sizeSimilarity: number;
  exactByteMatch: boolean;
}

interface ReplicationSessionRef {
  id: string;
  status: "queued" | "processing" | "completed" | "rejected";
}

interface ReplicationArtifactRef {
  id: string;
  route: string;
  status: "approved" | "blocked";
}

interface LiteralMatchApiData {
  accepted: boolean;
  mode: "source_reconstruct" | "pair_compare";
  targetFormat: TargetFormat;
  thresholds: {
    structural: number;
    pixel: number;
    density: number;
    hierarchy: number;
  };
  metrics: LiteralMetrics;
  session: ReplicationSessionRef;
  artifact: ReplicationArtifactRef;
  delivery: {
    fileName: string;
    mimeType: string;
    downloadUrl: string;
  };
}

const ACCEPT_ALL: Accept = {
  "application/pdf": [".pdf"],
  "application/json": [".json"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "image/*": [".png", ".jpg", ".jpeg", ".webp", ".svg"],
};

const SERVICE_ACTIONS: QuickAction[] = [
  { id: "svc-visual", label: "المطابقة البصرية", value: "service:visual_match", tone: "primary" },
  { id: "svc-visual-ar", label: "المطابقة البصرية والتعريب", value: "service:visual_match_ar", tone: "primary" },
  { id: "svc-arabization", label: "التعريب", value: "service:arabization" },
  { id: "svc-translation", label: "الترجمة", value: "service:translation" },
  { id: "svc-library", label: "حفظه في المكتبة", value: "service:save_library" },
  { id: "svc-template", label: "قالب", value: "service:template" },
];

const FORMAT_ACTIONS: QuickAction[] = [
  { id: "fmt-pptx", label: "PowerPoint (PPTX)", value: "format:pptx", tone: "primary" },
  { id: "fmt-dashboard", label: "Dashboard", value: "format:dashboard", tone: "primary" },
  { id: "fmt-docx", label: "Word (DOCX)", value: "format:docx" },
  { id: "fmt-pdf", label: "PDF", value: "format:pdf" },
  { id: "fmt-html", label: "HTML", value: "format:html" },
  { id: "fmt-xlsx", label: "Excel (XLSX)", value: "format:xlsx" },
];

const ARABIZATION_ACTIONS: QuickAction[] = [
  { id: "arb-rtl", label: "تعريب RTL بصري", value: "arabization:design_rtl", tone: "primary" },
  { id: "arb-terms", label: "تعريب مصطلحات", value: "arabization:terms_only" },
  { id: "arb-full", label: "تعريب كامل", value: "arabization:full_localized" },
];

const TRANSLATION_ACTIONS: QuickAction[] = [
  { id: "tr-ar", label: "الترجمة إلى العربية", value: "translation:ar", tone: "primary" },
  { id: "tr-en", label: "الترجمة إلى الإنجليزية", value: "translation:en" },
];

const TEMPLATE_ACTIONS: QuickAction[] = [
  { id: "tpl-exec", label: "قالب تنفيذي", value: "template:executive", tone: "primary" },
  { id: "tpl-academic", label: "قالب أكاديمي", value: "template:academic" },
  { id: "tpl-ops", label: "قالب تشغيلي", value: "template:operations" },
];

const EMPTY_FLOW: GuidedFlowState = {
  service: null,
  format: null,
  arabization: null,
  translationLang: null,
  template: null,
};

const MAX_AUTO_RECOVERY_ATTEMPTS = 3;

const FORMAT_EXTENSION: Record<TargetFormat, string> = {
  dashboard: ".html",
  html: ".html",
  pptx: ".pptx",
  docx: ".docx",
  pdf: ".pdf",
  xlsx: ".xlsx",
};

const FORMAT_MIME_HINTS: Record<TargetFormat, string[]> = {
  dashboard: ["text/html"],
  html: ["text/html"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  pdf: ["application/pdf"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

function inferIntent(
  prompt: string,
  type: SourceLibraryItem["sourceType"] | null,
): string {
  const t = prompt.trim().toLowerCase();
  if (!t) {
    if (type === "excel" || type === "csv") return "تحليل الجداول";
    if (type === "image" || type === "pdf") return "المطابقة الحرفية";
    if (type === "presentation") return "العروض";
    if (type === "document") return "التقارير";
    return "التحليل الذكي";
  }
  if (t.includes("مطابقة") || t.includes("حرفية") || t.includes("replication")) {
    return "المطابقة الحرفية";
  }
  if (t.includes("تقرير") || t.includes("word")) return "التقارير";
  if (t.includes("عرض") || t.includes("بوربوينت") || t.includes("presentation")) {
    return "العروض";
  }
  if (t.includes("لوحة") || t.includes("داشبورد") || t.includes("dashboard")) {
    return "لوحات المؤشرات";
  }
  if (t.includes("اكسل") || t.includes("excel") || t.includes("جدول")) {
    return "تحليل الجداول";
  }
  if (t.includes("تعريب")) return "تعريب التصميم";
  if (t.includes("مكتبة")) return "المكتبة";
  return "التحليل الذكي";
}

function normalizePromptForDetection(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

function inferTargetFormat(
  prompt: string,
): TargetFormat | null {
  const t = normalizePromptForDetection(prompt);

  if (
    /(power\s*point|pptx?|بوربوينت|باوربوينت|باور بوينت|عرض تقديمي|presentation)/.test(t)
  ) {
    return "pptx";
  }
  if (/(word|docx?|وورد)/.test(t)) return "docx";
  if (/(^|[^a-z])pdf([^a-z]|$)|بي دي اف/.test(t)) return "pdf";
  if (/(html|صفحه ويب|ويب|web page)/.test(t)) return "html";
  if (/(excel|xlsx?|اكسل|اكسيل)/.test(t)) return "xlsx";
  if (/(dashboard|داشبورد|لوحه مؤشرات|لوحه)/.test(t)) return "dashboard";

  return null;
}

function shouldRunLiteralMatch(prompt: string): boolean {
  const t = normalizePromptForDetection(prompt);
  if (!t) return false;
  if (/(مطابق|مطابقه|حرفي|replication|literal)/.test(t)) return true;
  if (/(حول|تحويل|انشئ|سوي|اصنع|generate|convert|export)/.test(t)) return true;
  return inferTargetFormat(t) !== null;
}

function outputFromFormat(
  format: TargetFormat,
): "dashboard" | "report" | "presentation" | "excel" | "localized" {
  if (format === "pptx") return "presentation";
  if (format === "docx" || format === "pdf") return "report";
  if (format === "xlsx") return "excel";
  if (format === "dashboard" || format === "html") return "dashboard";
  return "dashboard";
}

function welcome(): ChatMessage[] {
  return [
    {
      id: `w-${Date.now()}`,
      role: "assistant",
      text: "مرحبًا. ارفع الملف من الأعلى، ثم اختر الخدمة من الأزرار. التنفيذ كله داخل نفس البورد.",
    },
  ];
}

function isImageOrPdf(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type.startsWith("image/") || name.endsWith(".pdf");
}

function humanFormat(format: TargetFormat): string {
  if (format === "dashboard") return "Dashboard";
  return format.toUpperCase();
}

function arabizationLabel(mode: ArabizationMode | null): string {
  if (mode === "design_rtl") return "تعريب RTL بصري";
  if (mode === "terms_only") return "تعريب مصطلحات";
  if (mode === "full_localized") return "تعريب كامل";
  return "تعريب مبدئي";
}

function hasExpectedExtension(fileName: string, targetFormat: TargetFormat): boolean {
  const ext = FORMAT_EXTENSION[targetFormat];
  return fileName.toLowerCase().endsWith(ext);
}

function hasExpectedMime(mimeType: string | null, targetFormat: TargetFormat): boolean {
  if (!mimeType) return false;
  const lower = mimeType.toLowerCase();
  return FORMAT_MIME_HINTS[targetFormat].some((hint) => lower.includes(hint.toLowerCase()));
}

function createMessagePreview(file: File): MessagePreview {
  const lower = file.name.toLowerCase();
  if (file.type.startsWith("image/")) {
    return {
      kind: "image",
      name: file.name,
      mimeType: file.type || "image/*",
      url: URL.createObjectURL(file),
    };
  }
  if (lower.endsWith(".pdf")) {
    return {
      kind: "pdf",
      name: file.name,
      mimeType: file.type || "application/pdf",
    };
  }
  return {
    kind: "file",
    name: file.name,
    mimeType: file.type || "application/octet-stream",
  };
}

interface RasidCommandCenterProps {
  compact?: boolean;
}

export default function RasidCommandCenter({
  compact = false,
}: RasidCommandCenterProps) {
  const addFiles = useSourceLibraryStore((s) => s.addFiles);
  const sources = useSourceLibraryStore((s) => s.sources);

  const [prompt, setPrompt] = useState("");
  const [advancedFlag, setAdvancedFlag] = useState<ExperienceFlag>(0);
  const [chat, setChat] = useState<ChatMessage[]>(welcome());
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [latestAdded, setLatestAdded] = useState<SourceLibraryItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [guidedFlow, setGuidedFlow] = useState<GuidedFlowState>(EMPTY_FLOW);

  const leadSource = latestAdded[0] ?? sources[0] ?? null;

  const appendMessage = (msg: ChatMessage) => {
    setChat((prev) => [...prev.slice(-30), msg]);
  };

  const resetGuidedFlow = () => {
    setGuidedFlow(EMPTY_FLOW);
  };

  const askServiceMenu = (sourceFile?: File) => {
    appendMessage({
      id: `svc-${Date.now()}`,
      role: "assistant",
      text: sourceFile
        ? `تم استلام "${sourceFile.name}". اختر نوع الخدمة المطلوبة لهذا الملف:`
        : "اختر نوع الخدمة المطلوبة للملف:",
      preview: sourceFile ? createMessagePreview(sourceFile) : undefined,
      actions: SERVICE_ACTIONS,
    });
  };

  const askFormatMenu = (leadText: string) => {
    appendMessage({
      id: `fmt-${Date.now()}`,
      role: "assistant",
      text: leadText,
      actions: FORMAT_ACTIONS,
    });
  };

  const askArabizationMenu = () => {
    appendMessage({
      id: `arb-${Date.now()}`,
      role: "assistant",
      text: "اختر نمط التعريب المطلوب:",
      actions: ARABIZATION_ACTIONS,
    });
  };

  const askTranslationMenu = () => {
    appendMessage({
      id: `tr-${Date.now()}`,
      role: "assistant",
      text: "اختر لغة الترجمة المطلوبة:",
      actions: TRANSLATION_ACTIONS,
    });
  };

  const askTemplateMenu = () => {
    appendMessage({
      id: `tpl-${Date.now()}`,
      role: "assistant",
      text: "اختر نوع القالب أولًا:",
      actions: TEMPLATE_ACTIONS,
    });
  };

  const onDropFiles = (files: File[]) => {
    if (!files.length) return;
    const added = addFiles(files, "rasid-chat");
    setLatestAdded(added.slice(0, 6));
    setUploadedFiles((prev) => [...prev, ...files].slice(0, 10));
    resetGuidedFlow();

    appendMessage({
      id: `f-${Date.now()}`,
      role: "assistant",
      text: `تم رفع ${files.length} ملف. إجمالي الملفات الحالية: ${Math.min(
        uploadedFiles.length + files.length,
        10,
      )}.`,
    });

    const leadFile = files.find(isImageOrPdf) ?? files[0];
    askServiceMenu(leadFile);
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: onDropFiles,
    maxFiles: 10,
    maxSize: 1024 * 1024 * 1024,
    accept: ACCEPT_ALL,
    noClick: true,
  });

  const runLiteralMatch = async (requestText: string, forcedFormat?: TargetFormat) => {
    if (uploadedFiles.length < 1) {
      appendMessage({
        id: `lm-${Date.now()}`,
        role: "assistant",
        text: "للمطابقة الحرفية: ارفع ملفًا واحدًا على الأقل (صورة/ملف المصدر).",
      });
      return;
    }

    const source = uploadedFiles[0];
    const targetFormat = forcedFormat ?? inferTargetFormat(requestText);
    if (!targetFormat) {
      appendMessage({
        id: `lf-${Date.now()}`,
        role: "assistant",
        text: "حدد الصيغة النهائية بشكل صريح داخل الطلب (مثال: حولها إلى PPTX).",
      });
      return;
    }
    const targetOutput = outputFromFormat(targetFormat);

    setIsProcessing(true);
    appendMessage({
      id: `lp-${Date.now()}`,
      role: "assistant",
      text: `جاري تشغيل المطابقة الحرفية من "${source.name}" إلى صيغة ${targetFormat.toUpperCase()} مع التصحيح التلقائي...`,
    });

    let lastErrorMessage = "فشل غير معروف";

    try {
      for (let attempt = 1; attempt <= MAX_AUTO_RECOVERY_ATTEMPTS; attempt += 1) {
        try {
          const formData = new FormData();
          formData.append("source", source);
          formData.append("targetOutput", targetOutput);
          formData.append("targetFormat", targetFormat);

          const response = await fetch("/api/replication/literal-match", {
            method: "POST",
            body: formData,
          });

          const payload = (await response.json()) as {
            success: boolean;
            error?: string;
            data?: LiteralMatchApiData;
          };

          if (!response.ok || !payload.success || !payload.data) {
            throw new Error(payload.error || "Literal match API failed");
          }

          const { targetFormat: apiTargetFormat, delivery } = payload.data;
          if (apiTargetFormat !== targetFormat) {
            throw new Error(
              `صيغة غير مطابقة للطلب. المطلوب: ${targetFormat.toUpperCase()} | الناتج: ${apiTargetFormat.toUpperCase()}`,
            );
          }

          if (!hasExpectedExtension(delivery.fileName, targetFormat)) {
            throw new Error(`امتداد الملف غير صحيح: ${delivery.fileName}`);
          }

          const fileResp = await fetch(delivery.downloadUrl);
          if (!fileResp.ok) {
            throw new Error("فشل جلب الملف الناتج.");
          }

          const contentType = fileResp.headers.get("content-type");
          if (!hasExpectedMime(contentType || delivery.mimeType, targetFormat)) {
            throw new Error(`نوع ملف غير متوافق: ${contentType || delivery.mimeType}`);
          }

          let savedToLibrary = false;
          try {
            const blob = await fileResp.blob();
            const generatedFile = new File([blob], delivery.fileName, {
              type: delivery.mimeType,
            });
            addFiles([generatedFile], "replication-output");
            savedToLibrary = true;
          } catch {
            savedToLibrary = false;
          }

          const absoluteUrl =
            typeof window !== "undefined"
              ? new URL(delivery.downloadUrl, window.location.origin).toString()
              : delivery.downloadUrl;

          appendMessage({
            id: `lr-${Date.now()}`,
            role: "assistant",
            text:
              attempt > 1
                ? `تم تصحيح النتيجة تلقائيًا في المحاولة ${attempt} وتسليم ${targetFormat.toUpperCase()} بنجاح.`
                : `تم إنشاء الملف الناتج بصيغة ${apiTargetFormat.toUpperCase()} وتسليمه بنجاح.`,
            panel: {
              title: "التسليم النهائي",
              lines: [
                `الملف الناتج: ${delivery.fileName}`,
                savedToLibrary ? "تم حفظ الملف في المكتبة." : "تعذر حفظ الملف في المكتبة تلقائيًا.",
                `رابط التنزيل: ${absoluteUrl}`,
              ],
            },
            delivery: {
              url: absoluteUrl,
              fileName: delivery.fileName,
            },
          });

          return;
        } catch (attemptError: unknown) {
          const msg =
            attemptError instanceof Error ? attemptError.message : "فشل غير معروف";
          lastErrorMessage = msg;

          if (attempt < MAX_AUTO_RECOVERY_ATTEMPTS) {
            appendMessage({
              id: `retry-${Date.now()}-${attempt}`,
              role: "assistant",
              text: `تم رصد نتيجة غير دقيقة (${msg}). جاري إعادة المحاولة تلقائيًا (${attempt + 1}/${MAX_AUTO_RECOVERY_ATTEMPTS})...`,
            });
            continue;
          }
        }
      }

      throw new Error(lastErrorMessage);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "فشل غير معروف";
      appendMessage({
        id: `le-${Date.now()}`,
        role: "assistant",
        text: `فشل تنفيذ المطابقة الحرفية: ${msg}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const executeGuidedFlow = async (flow: GuidedFlowState) => {
    if (!flow.service) {
      askServiceMenu(uploadedFiles[0]);
      return;
    }

    if (flow.service === "save_library") {
      appendMessage({
        id: `lib-${Date.now()}`,
        role: "assistant",
        text: "تم حفظ الملف في المكتبة. يمكنك طلب أي خدمة عليه في أي وقت.",
      });
      resetGuidedFlow();
      return;
    }

    if (!flow.format) {
      askFormatMenu("اختر الصيغة النهائية المطلوبة:");
      return;
    }

    const formatText = humanFormat(flow.format);

    if (flow.service === "visual_match") {
      await runLiteralMatch(`مطابقة بصرية إلى ${formatText}`, flow.format);
      resetGuidedFlow();
      return;
    }

    if (flow.service === "visual_match_ar" || flow.service === "arabization") {
      if (!flow.arabization) {
        askArabizationMenu();
        return;
      }

      appendMessage({
        id: `arb-note-${Date.now()}`,
        role: "assistant",
        text: `سيتم التنفيذ بالمسار: ${arabizationLabel(flow.arabization)} ثم إخراج ${formatText}.`,
      });
      await runLiteralMatch(
        `مطابقة بصرية وتعريب (${arabizationLabel(flow.arabization)}) إلى ${formatText}`,
        flow.format,
      );
      resetGuidedFlow();
      return;
    }

    if (flow.service === "translation") {
      if (!flow.translationLang) {
        askTranslationMenu();
        return;
      }

      appendMessage({
        id: `tr-note-${Date.now()}`,
        role: "assistant",
        text: "محرك الترجمة الدلالية الكاملة قيد الربط. سيتم الآن إنشاء نسخة مطابقة بنفس المحتوى تمهيدًا للترجمة.",
      });
      await runLiteralMatch(`ترجمة ${flow.translationLang} إلى ${formatText}`, flow.format);
      resetGuidedFlow();
      return;
    }

    if (flow.service === "template") {
      if (!flow.template) {
        askTemplateMenu();
        return;
      }
      appendMessage({
        id: `tpl-note-${Date.now()}`,
        role: "assistant",
        text: `تم اختيار ${flow.template === "executive" ? "قالب تنفيذي" : flow.template === "academic" ? "قالب أكاديمي" : "قالب تشغيلي"} مع إخراج ${formatText}.`,
      });
      await runLiteralMatch(`قالب ${flow.template} إلى ${formatText}`, flow.format);
      resetGuidedFlow();
    }
  };

  const handleQuickAction = async (action: QuickAction) => {
    if (isProcessing) return;

    appendMessage({
      id: `u-act-${Date.now()}`,
      role: "user",
      text: action.label,
    });

    if (action.value.startsWith("service:")) {
      const service = action.value.replace("service:", "") as ServiceKind;
      const nextFlow: GuidedFlowState = {
        ...EMPTY_FLOW,
        service,
      };
      setGuidedFlow(nextFlow);

      if (service === "save_library") {
        await executeGuidedFlow(nextFlow);
        return;
      }

      if (service === "template") {
        askTemplateMenu();
        return;
      }

      if (service === "translation") {
        askTranslationMenu();
        return;
      }

      askFormatMenu("اختر صيغة الإخراج المطلوبة:");
      return;
    }

    if (action.value.startsWith("format:")) {
      const format = action.value.replace("format:", "") as TargetFormat;
      const nextFlow: GuidedFlowState = { ...guidedFlow, format };
      setGuidedFlow(nextFlow);
      await executeGuidedFlow(nextFlow);
      return;
    }

    if (action.value.startsWith("arabization:")) {
      const arabization = action.value.replace("arabization:", "") as ArabizationMode;
      const nextFlow: GuidedFlowState = { ...guidedFlow, arabization };
      setGuidedFlow(nextFlow);
      await executeGuidedFlow(nextFlow);
      return;
    }

    if (action.value.startsWith("translation:")) {
      const translationLang = action.value.replace("translation:", "") as TranslationLang;
      const nextFlow: GuidedFlowState = { ...guidedFlow, translationLang };
      setGuidedFlow(nextFlow);
      if (!nextFlow.format) {
        askFormatMenu("اختر صيغة الملف بعد الترجمة:");
        return;
      }
      await executeGuidedFlow(nextFlow);
      return;
    }

    if (action.value.startsWith("template:")) {
      const template = action.value.replace("template:", "") as TemplateKind;
      const nextFlow: GuidedFlowState = { ...guidedFlow, template };
      setGuidedFlow(nextFlow);
      if (!nextFlow.format) {
        askFormatMenu("اختر صيغة الإخراج للقالب:");
        return;
      }
      await executeGuidedFlow(nextFlow);
    }
  };

  const sendMessage = async () => {
    if (isProcessing) return;

    const text = prompt.trim();
    if (!text && uploadedFiles.length === 0) {
      appendMessage({
        id: `n-${Date.now()}`,
        role: "assistant",
        text: "اكتب طلبك أو ارفع ملفات من الشريط العلوي.",
      });
      return;
    }

    if (!text && uploadedFiles.length > 0) {
      askServiceMenu(uploadedFiles[0]);
      return;
    }

    if (text) {
      appendMessage({ id: `u-${Date.now()}`, role: "user", text });
    }
    setPrompt("");

    const intent = inferIntent(text, leadSource?.sourceType ?? null);

    if (intent === "المطابقة الحرفية" || shouldRunLiteralMatch(text)) {
      await runLiteralMatch(text);
      resetGuidedFlow();
      return;
    }

    appendMessage({
      id: `a-${Date.now()}`,
      role: "assistant",
      text: `تم فهم الطلب: ${intent}. التنفيذ داخل نفس البورد. (الوضع: ${advancedFlag})`,
      panel: {
        title: "خطة التنفيذ",
        lines: [
          `الوضع المتقدم: ${advancedFlag}`,
          "لا يوجد انتقال لصفحة أخرى",
          "المخرجات ستظهر هنا بالتسلسل",
        ],
      },
    });
  };

  return (
    <section className={compact ? "h-[460px]" : "h-screen"}>
      <div className="relative h-full overflow-hidden bg-gradient-to-bl from-slate-900 via-[#061a33] to-[#041427] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(34,211,238,0.12),transparent_40%),radial-gradient(circle_at_20%_80%,rgba(14,165,233,0.1),transparent_45%)]" />

        <div className="relative flex h-full flex-col">
          <div className="px-4 py-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-100">
              <Sparkles className="h-4 w-4" />
              <span>محادثة راصد الذكي</span>
            </div>
          </div>

          <div className="px-4 pt-1">
            <div
              {...getRootProps()}
              className={`rounded-xl p-3 transition ${
                isDragActive
                  ? "bg-cyan-300/10"
                  : "bg-slate-900/35 hover:bg-slate-900/55"
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    open();
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/12 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/20"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>{isDragActive ? "أفلت الملفات الآن" : "رفع ملفات"}</span>
                </button>
                <p className="text-xs text-slate-300">
                  ارفع من هنا (أعلى الشاشة)، وستظهر خيارات الخدمة مباشرة.
                </p>
              </div>

              {uploadedFiles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {uploadedFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2.5 py-1 text-[11px] text-cyan-100"
                    >
                      <span className="max-w-[180px] truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(idx);
                        }}
                        className="rounded p-0.5 text-cyan-100 hover:bg-cyan-400/20"
                        aria-label="remove file"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
            <div className="space-y-3">
              {chat.map((m) => (
                <div key={m.id} className="flex justify-start">
                  <div
                    className={`max-w-[980px] rounded-xl px-3 py-2 text-sm ${
                      m.role === "assistant"
                        ? "bg-cyan-300/8 text-cyan-50"
                        : "bg-white/7 text-slate-100"
                    }`}
                  >
                    <p>{m.text}</p>
                    {m.preview && (
                      <div className="mt-3 overflow-hidden rounded-lg bg-slate-900/55">
                        <div className="flex items-center justify-between px-3 py-2 text-[11px] text-cyan-100">
                          <span className="truncate font-semibold">{m.preview.name}</span>
                          <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px]">
                            {m.preview.kind === "image" ? "صورة" : m.preview.kind === "pdf" ? "PDF" : "ملف"}
                          </span>
                        </div>
                        {m.preview.kind === "image" && m.preview.url ? (
                          <div className="p-2 pt-0">
                            <img
                              src={m.preview.url}
                              alt={m.preview.name}
                              className="h-20 w-44 rounded-lg object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-200">
                            {m.preview.kind === "pdf" ? (
                              <FileText className="h-4 w-4 text-cyan-200" />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-cyan-200" />
                            )}
                            <span className="truncate">{m.preview.mimeType}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {m.actions && m.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {m.actions.map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            onClick={() => void handleQuickAction(action)}
                            disabled={isProcessing}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              action.tone === "primary"
                                ? "bg-cyan-500/20 text-cyan-50 hover:bg-cyan-500/30"
                                : "bg-white/12 text-slate-100 hover:bg-white/20"
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {m.panel && (
                      <div className="mt-3 rounded-lg bg-slate-900/55 p-3 text-xs text-cyan-100">
                        <p className="mb-2 font-bold">{m.panel.title}</p>
                        <ul className="list-inside list-disc space-y-1 text-slate-200">
                          {m.panel.lines.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                        {m.delivery && (
                          <div className="mt-3">
                            <a
                              href={m.delivery.url}
                              download={m.delivery.fileName}
                              className="inline-flex items-center rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/30"
                            >
                              تحميل الملف (اختياري)
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 pb-4">
            <div className="rounded-xl bg-slate-900/55 p-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="اكتب رسالتك هنا..."
                rows={compact ? 2 : 3}
                className="min-h-[72px] w-full resize-none rounded-lg bg-slate-900/45 px-3 py-2 text-sm text-white placeholder:text-slate-300 focus:outline-none"
              />

              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setAdvancedFlag((prev) => (prev === 0 ? 1 : 0))}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    advancedFlag === 1
                      ? "bg-cyan-400 text-slate-900"
                      : "bg-slate-900/40 text-slate-100 hover:bg-slate-900/55"
                  }`}
                >
                  متقدم: {advancedFlag}
                </button>

                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={isProcessing}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-cyan-400 px-3 py-1.5 text-xs font-bold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isProcessing ? "جارٍ المعالجة..." : "إرسال"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
