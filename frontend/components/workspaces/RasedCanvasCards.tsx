"use client";

import React from "react";
import {
  Bot,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Globe2,
  Loader2,
  Presentation,
  ScanSearch,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import type { DetectedHomeFile, HomeActionId, HomeCapabilityAction } from "@/lib/home/home-file-capabilities";
import type { ConversationMessage, JobEntry } from "@/state/rasedCanvas.types";

interface JobEvidence {
  evidenceId: string;
  sources: Array<{ label: string; url?: string }>;
  artifactIds?: string[];
}

interface DownloadOutput {
  label: string;
  href: string;
  downloadName?: string;
}

interface RouteOutput {
  label: string;
  href: string;
}

interface CanvasResultData {
  title: string;
  body: string;
  status: "success" | "error";
  executedAt: string;
  chips: string[];
  previewText?: string;
  previewImage?: string;
}

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
}

function fileKindLabel(item: DetectedHomeFile): string {
  switch (item.kind) {
    case "dataset":
    case "excel":
      return "بيانات";
    case "pdf":
      return "PDF";
    case "word":
      return "DOCX";
    case "image":
      return "صورة";
    case "markdown":
    case "text":
    case "html":
    case "json":
      return "نص";
    default:
      return "ملف";
  }
}

function fileKindIcon(item: DetectedHomeFile) {
  switch (item.kind) {
    case "dataset":
    case "excel":
      return FileSpreadsheet;
    case "pdf":
    case "word":
    case "markdown":
    case "text":
    case "html":
    case "json":
      return FileText;
    case "image":
      return FileImage;
    default:
      return UploadCloud;
  }
}

function useFilePreview(item: DetectedHomeFile) {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (item.kind !== "image") {
      setUrl(null);
      return undefined;
    }

    const nextUrl = URL.createObjectURL(item.file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [item.file, item.kind]);

  return url;
}

export function CanvasWelcomeCard({
  onUpload,
  suggestions,
  onSuggestion,
}: {
  onUpload: () => void;
  suggestions: string[];
  onSuggestion: (value: string) => void;
}) {
  return (
    <section data-rased-id="welcome.card" className="rased-panel-soft rased-motion-rise overflow-hidden">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-800">
            <Sparkles className="h-4 w-4" />
            <span>Canvas واحد</span>
          </div>
          <h2 className="mt-4 text-2xl font-black text-slate-950">ابدأ من الشات مباشرة</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            اسحب الملف هنا أو اكتب المطلوب. راصد سيكشف السياق ويعرض 3 إلى 7 خطوات فقط ثم يبني النتيجة داخل نفس الشاشة.
          </p>
          <div data-rased-options-surface="welcome-suggestions" className="mt-4 flex flex-wrap gap-2">
            {suggestions.slice(0, 3).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSuggestion(suggestion)}
                data-rased-option="true"
                className="rased-chip transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <button data-rased-id="welcome.upload" data-rased-option="true" type="button" onClick={onUpload} className="rased-action-primary self-start">
          <UploadCloud className="h-4 w-4" />
          <span>اسحب ملفك أو اختره</span>
        </button>
      </div>
    </section>
  );
}

export function CanvasFileCard({ item, cardId }: { item: DetectedHomeFile; cardId?: string }) {
  const Icon = fileKindIcon(item);
  const previewUrl = useFilePreview(item);

  return (
    <section data-rased-id={cardId ?? "file.card"} className="rased-panel-soft rased-motion-stagger-1 overflow-hidden">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-[22px] bg-slate-950 p-3 text-white">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-700">
              <span>{fileKindLabel(item)}</span>
            </div>
            <h3 className="mt-3 text-base font-black text-slate-950">{item.file.name}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {item.extension || item.mimeType || item.kind} · {item.sizeLabel}
            </p>
          </div>
        </div>

        {previewUrl ? (
          <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
            <img src={previewUrl} alt={item.file.name} className="h-24 w-36 object-cover" />
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500">
            معاينة مصغرة
          </div>
        )}
      </div>
    </section>
  );
}

export function CanvasActionsCard({
  actions,
  busyActionId,
  onRun,
  onOpenSearch,
  cardId,
}: {
  actions: HomeCapabilityAction[];
  busyActionId: HomeActionId | null;
  onRun: (actionId: HomeActionId) => void;
  onOpenSearch: () => void;
  cardId?: string;
}) {
  const visible = actions.slice(0, 3);

  return (
    <section data-rased-id={cardId ?? "actions.card"} className="rased-panel-soft rased-motion-stagger-1">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-slate-400">الخطوة التالية</p>
          <h3 className="mt-1 text-base font-black text-slate-950">الإجراءات المناسبة الآن</h3>
          <p className="mt-1 text-sm text-slate-500">هذه هي البداية الأقرب لسياق الملف. الباقي يظهر عبر البحث أو المزيد.</p>
        </div>
        <button data-rased-id="actions.more" data-rased-option="true" type="button" onClick={onOpenSearch} className="rased-action-secondary">
          <Sparkles className="h-4 w-4" />
          <span>المزيد</span>
        </button>
      </div>

      <div data-rased-options-surface="primary-actions" className="mt-4 grid gap-3 lg:grid-cols-3">
        {visible.map((action) => {
          const busy = busyActionId === action.id;
          return (
            <button
              key={action.id}
              data-rased-id={`action.${action.id}`}
              data-rased-option="true"
              type="button"
              onClick={() => onRun(action.id)}
              disabled={busyActionId !== null}
              className={`rased-item-card text-right ${busy ? "border-cyan-300 bg-cyan-50 shadow-[0_18px_36px_-28px_rgba(8,145,178,0.4)]" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-[16px] p-2 ${busy ? "bg-cyan-600 text-white" : "bg-slate-950 text-white"}`}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronLeft className="h-4 w-4" />}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-500">{action.serviceLabel}</span>
              </div>
              <h4 className="mt-4 text-sm font-black text-slate-950">{action.title}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-500">{action.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function CanvasPlanCard({
  title,
  steps,
  statusLabel,
  cardId,
}: {
  title: string;
  steps: string[];
  statusLabel: string;
  cardId?: string;
}) {
  return (
    <section data-rased-id={cardId ?? "plan.card"} className="rased-panel-accent rased-motion-stagger-1">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-cyan-700">الخطة الحالية</p>
          <h3 className="mt-1 text-base font-black text-slate-950">{title}</h3>
        </div>
        <span className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-[11px] font-black text-cyan-700">{statusLabel}</span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        {steps.slice(0, 4).map((step, index) => (
          <div key={step} className="rounded-[20px] border border-cyan-100 bg-white px-4 py-3">
            <p className="text-[11px] font-black text-cyan-700">0{index + 1}</p>
            <p className="mt-2 text-sm font-bold text-slate-900">{step}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CanvasConversationCard({ message }: { message: ConversationMessage }) {
  const isAssistant = message.author === "rased";
  return (
    <section className={`rased-motion-stagger-2 flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-3xl rounded-[26px] px-5 py-4 shadow-sm ${
          isAssistant
            ? "border border-slate-200 bg-white text-slate-900"
            : "bg-slate-950 text-white"
        }`}
      >
        <div className="mb-2 flex items-center gap-2 text-[11px] font-black">
          {isAssistant ? <Bot className="h-3.5 w-3.5 text-cyan-600" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span>{isAssistant ? "راصد" : "أنت"}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-7">{message.text}</p>
      </div>
    </section>
  );
}

export function CanvasRunCard({
  title,
  job,
  stageLabel,
  teaser,
  cardId,
}: {
  title: string;
  job: JobEntry;
  stageLabel: string;
  teaser: string;
  cardId?: string;
}) {
  return (
    <section data-rased-id={cardId ?? "run.card"} className="rased-panel-soft rased-motion-stagger-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-slate-400">قيد التنفيذ</p>
          <h3 className="mt-1 text-base font-black text-slate-950">{title}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-500">{teaser}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-700">
          {job.stage === "failed" ? <Bot className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{stageLabel}</span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-full bg-slate-100">
        <div
          className="rased-run-shimmer h-2 rounded-full bg-[linear-gradient(90deg,_#0891b2_0%,_#22d3ee_55%,_#0891b2_100%)] transition-all duration-300"
          style={{ width: `${Math.max(8, Math.min(100, job.progressPct))}%` }}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        {["تحليل", "بناء", "تحقق", "تصدير"].map((step, index) => {
          const activeIndex = job.stage === "planning" ? 0 : job.stage === "running" ? 1 : job.stage === "verifying" ? 2 : 3;
          const isActive = activeIndex === index;
          const isDone = activeIndex > index || job.stage === "completed";
          return (
            <div
              key={step}
              className={`rounded-[18px] border px-4 py-3 text-sm font-bold ${
                isDone
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : isActive
                    ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                    : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              {step}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CanvasPreviewCard({
  title,
  previewText,
  previewImage,
  cardId,
}: {
  title: string;
  previewText?: string;
  previewImage?: string;
  cardId?: string;
}) {
  if (!previewText && !previewImage) return null;

  return (
    <section data-rased-id={cardId ?? "preview.card"} className="rased-panel-soft rased-motion-stagger-2 overflow-hidden">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-slate-400">معاينة</p>
          <h3 className="mt-1 text-base font-black text-slate-950">{title}</h3>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-500">مبكرًا</span>
      </div>

      {previewImage ? (
        <div className="mt-4 overflow-hidden rounded-[22px] border border-slate-200 bg-white">
          <img src={previewImage} alt={title} className="max-h-[420px] w-full object-contain" />
        </div>
      ) : null}

      {previewText ? (
        <pre className="mt-4 max-h-[300px] overflow-auto rounded-[22px] bg-slate-950 px-4 py-4 text-xs leading-7 text-slate-100">
          {previewText}
        </pre>
      ) : null}
    </section>
  );
}

export function CanvasResultCard({
  result,
  evidenceReady,
  downloadOutputs,
  routeOutputs,
  onOpenFocus,
  cardId,
}: {
  result: CanvasResultData;
  evidenceReady: boolean;
  downloadOutputs: DownloadOutput[];
  routeOutputs: RouteOutput[];
  onOpenFocus: () => void;
  cardId?: string;
}) {
  const visibleDownloads = downloadOutputs.slice(0, 6);
  return (
    <section data-rased-id={cardId ?? "result.card"} className={`rased-panel rased-motion-stagger-2 overflow-hidden ${result.status === "success" ? "rased-success-glow" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${result.status === "success" ? (evidenceReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700") : "bg-rose-100 text-rose-700"}`}>
            {result.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            <span>{result.status === "success" ? (evidenceReady ? "مكتمل" : "قيد التحقق") : "تعثر"}</span>
          </div>
          <p className="mt-4 text-xs font-black tracking-[0.18em] text-slate-400">النتيجة</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{result.title}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">{result.body}</p>
        </div>
        <span className="text-xs font-bold text-slate-400">{formatTime(result.executedAt)}</span>
      </div>

      {result.chips.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {result.chips.map((chip) => (
            <span key={chip} className="rased-chip">
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      <div data-rased-options-surface="result-actions" className="mt-5 flex flex-wrap gap-2">
        <button data-rased-id="result.open_focus" data-rased-option="true" type="button" onClick={onOpenFocus} className="rased-action-primary">
          <Sparkles className="h-4 w-4" />
          <span>فتح</span>
        </button>
        {visibleDownloads.map((output) => (
          <a key={output.label} data-rased-id={`result.download.${output.label.replace(/\s+/g, "-")}`} data-rased-option="true" href={output.href} download={output.downloadName} className="rased-action-secondary">
            <Download className="h-4 w-4" />
            <span>{output.label}</span>
          </a>
        ))}
      </div>

      {routeOutputs.length > 0 ? (
        <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-black text-slate-500">روابط داخلية محفوظة</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {routeOutputs.map((output) => (
              <span key={output.href} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-600">
                {output.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function CanvasEvidenceCard({ evidence, cardId }: { evidence: JobEvidence; cardId?: string }) {
  return (
    <section data-rased-id={cardId ?? "evidence.card"} className="rased-panel-soft rased-motion-stagger-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-emerald-700">الإثبات</p>
          <h3 className="mt-1 text-base font-black text-slate-950">بوابات التحقق مقفلة</h3>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">جاهز للمراجعة</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {evidence.sources.map((source) => (
          <span key={source.label} className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-black text-emerald-700">
            {source.label}
          </span>
        ))}
      </div>
    </section>
  );
}

export function CanvasSidebarTabButton({
  active,
  label,
  dataRasedId,
  onClick,
}: {
  active: boolean;
  label: string;
  dataRasedId?: string;
  onClick: () => void;
}) {
  return (
    <button
      data-rased-id={dataRasedId}
      data-rased-option="true"
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
        active
          ? "bg-slate-950 text-white"
          : "border border-slate-200 bg-white text-slate-600 hover:border-cyan-200 hover:text-cyan-700"
      }`}
    >
      {label}
    </button>
  );
}

export function CanvasFocusRail({
  title,
  body,
  chips,
  suggestions,
  onSuggestion,
  conversation,
}: {
  title: string;
  body: string;
  chips: string[];
  suggestions: string[];
  onSuggestion: (value: string) => void;
  conversation: ConversationMessage[];
}) {
  return (
    <aside data-rased-id="focus.rail" className="rased-thread-rail rounded-[30px] border border-white/10 bg-slate-950/90 p-5 text-white shadow-2xl">
      <div className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4">
        <p className="text-sm font-black">{title}</p>
        <p className="mt-2 text-sm leading-7 text-slate-200">{body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span key={chip} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-black text-slate-100">
              {chip}
            </span>
          ))}
        </div>
      </div>

      <div data-rased-options-surface="focus-suggestions" className="mt-4 flex flex-wrap gap-2">
        {suggestions.slice(0, 7).map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestion(suggestion)}
            data-rased-option="true"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black text-slate-100 transition hover:border-cyan-300 hover:bg-cyan-500/15"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {conversation.slice(-4).map((message, index) => (
          <div key={`${message.createdAt}-${index}`} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs font-black text-slate-300">{message.author === "rased" ? "راصد" : "أنت"}</p>
            <p className="mt-1 text-sm leading-7 text-slate-100">{message.text}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
