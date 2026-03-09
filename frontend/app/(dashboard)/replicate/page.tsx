"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  History,
  LayoutDashboard,
  Loader2,
  Presentation,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Table2,
  FileText,
  Languages,
  XCircle,
} from "lucide-react";
import { useSourceLibraryStore, type SourceLibraryItem } from "@/lib/stores/source-library-store";
import SourceContextBanner from "@/components/workspaces/SourceContextBanner";

type TargetOutput = "dashboard" | "report" | "presentation" | "excel" | "localized";
type SessionStatus = "queued" | "processing" | "completed" | "rejected";

interface SessionData {
  id: string;
  source: {
    id: string;
    name: string;
    sourceType: SourceLibraryItem["sourceType"];
  };
  targetOutput: TargetOutput;
  strictMode: boolean;
  status: SessionStatus;
  progress: number;
  etaSec: number;
  fidelity: {
    structural: number;
    pixel: number;
    density: number;
    hierarchy: number;
  };
  thresholds: {
    structuralMin: number;
    pixelMin: number;
    densityMin: number;
    hierarchyMin: number;
  };
  steps: Array<{
    id: string;
    title: string;
    status: "pending" | "running" | "completed";
    progress: number;
    durationSec: number;
  }>;
  rejectionReasons: string[];
}

interface ArtifactData {
  id: string;
  route: string;
  source: {
    id: string;
  };
}

interface ArtifactSummary {
  id: string;
  status: "approved" | "blocked";
  route: string;
  targetOutput: TargetOutput;
  source: {
    id: string;
    name: string;
  };
}

const outputOptions: Array<{
  value: TargetOutput;
  label: string;
  icon: React.ReactNode;
  route: string;
}> = [
  { value: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, route: "/dashboard" },
  { value: "report", label: "Report", icon: <FileText className="h-4 w-4" />, route: "/reports" },
  { value: "presentation", label: "Presentation", icon: <Presentation className="h-4 w-4" />, route: "/presentations" },
  { value: "excel", label: "Excel", icon: <Table2 className="h-4 w-4" />, route: "/excel" },
  { value: "localized", label: "Localization", icon: <Languages className="h-4 w-4" />, route: "/localization" },
];

function fidelityClass(value: number, threshold: number): string {
  if (value >= threshold) return "text-emerald-700 dark:text-emerald-300";
  return "text-red-700 dark:text-red-300";
}

function statusUI(status: SessionStatus): { label: string; cls: string; icon: React.ReactNode } {
  if (status === "completed") {
    return {
      label: "مكتملة",
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    };
  }
  if (status === "rejected") {
    return {
      label: "مرفوضة",
      cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
      icon: <XCircle className="h-3.5 w-3.5" />,
    };
  }
  if (status === "queued") {
    return {
      label: "قيد الانتظار",
      cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
      icon: <Clock3 className="h-3.5 w-3.5" />,
    };
  }
  return {
    label: "قيد المعالجة",
    cls: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  };
}

export default function ReplicateExecutionPage() {
  const router = useRouter();
  const sources = useSourceLibraryStore((s) => s.sources);
  const markSourceUsed = useSourceLibraryStore((s) => s.markSourceUsed);

  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [targetOutput, setTargetOutput] = useState<TargetOutput>("dashboard");
  const [strictMode, setStrictMode] = useState(true);
  const [session, setSession] = useState<SessionData | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionData[]>([]);
  const [recentArtifacts, setRecentArtifacts] = useState<ArtifactSummary[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSource = useMemo(
    () => sources.find((s) => s.id === selectedSourceId) ?? null,
    [selectedSourceId, sources]
  );

  const fetchRecentSessions = useCallback(async () => {
    try {
      setLoadingRecent(true);
      const [sessionRes, artifactRes] = await Promise.all([
        fetch("/api/replication/session?limit=10"),
        fetch("/api/replication/artifact?limit=10"),
      ]);
      const sessionJson = (await sessionRes.json()) as { success?: boolean; data?: SessionData[] };
      const artifactJson = (await artifactRes.json()) as { success?: boolean; data?: ArtifactSummary[] };
      if (sessionRes.ok && sessionJson.success && sessionJson.data) {
        setRecentSessions(sessionJson.data);
      }
      if (artifactRes.ok && artifactJson.success && artifactJson.data) {
        setRecentArtifacts(artifactJson.data);
      }
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSourceId) return;
    if (typeof window === "undefined") return;
    const fromQuery = new URLSearchParams(window.location.search).get("source");
    if (fromQuery) {
      setSelectedSourceId(fromQuery);
      return;
    }
    if (sources[0]) {
      setSelectedSourceId(sources[0].id);
    }
  }, [selectedSourceId, sources]);

  useEffect(() => {
    void fetchRecentSessions();
  }, [fetchRecentSessions]);

  useEffect(() => {
    if (!session) return;
    if (session.status === "completed" || session.status === "rejected") return;

    const timer = window.setInterval(async () => {
      try {
        setLoadingStatus(true);
        const res = await fetch(`/api/replication/session/${session.id}`);
        const json = (await res.json()) as { success?: boolean; data?: SessionData };
        if (res.ok && json.success && json.data) {
          setSession(json.data);
          if (json.data.status === "completed" || json.data.status === "rejected") {
            void fetchRecentSessions();
          }
        }
      } finally {
        setLoadingStatus(false);
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [session]);

  const startSession = async () => {
    if (!selectedSource) return;
    setError(null);
    setStarting(true);
    try {
      const res = await fetch("/api/replication/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: selectedSource.id,
          sourceName: selectedSource.name,
          sourceType: selectedSource.sourceType,
          targetOutput,
          strictMode,
        }),
      });
      const json = (await res.json()) as { success?: boolean; data?: SessionData; error?: string };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || "Failed to start session");
      }
      markSourceUsed(selectedSource.id);
      setSession(json.data);
      void fetchRecentSessions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    } finally {
      setStarting(false);
    }
  };

  const launchOutput = async () => {
    if (!session) return;
    setDispatching(true);
    setError(null);
    try {
      const res = await fetch(`/api/replication/session/${session.id}/dispatch`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: ArtifactData;
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || "Failed to dispatch artifact");
      }

      router.push(
        `${json.data.route}?source=${encodeURIComponent(json.data.source.id)}&replicationSession=${encodeURIComponent(
          session.id
        )}&replicationArtifact=${encodeURIComponent(json.data.id)}`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to dispatch artifact");
    } finally {
      setDispatching(false);
    }
  };

  const statusBadge = session ? statusUI(session.status) : null;

  return (
    <div className="space-y-6" dir="rtl">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-bl from-cyan-700 via-blue-700 to-indigo-800 px-6 py-8 text-white shadow-xl lg:px-8">
        <div className="pointer-events-none absolute -left-16 -top-20 h-60 w-60 rounded-full bg-white/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-cyan-200/20 blur-3xl" />
        <div className="relative space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold">
            <ShieldCheck className="h-4 w-4" />
            <span>Strict Replication Executor</span>
          </div>
          <h1 className="text-2xl font-black lg:text-4xl">استوديو المطابقة التنفيذي</h1>
          <p className="max-w-3xl text-sm text-cyan-100 lg:text-base">
            تشغيل جلسة 1:1 حرفية مع مراحل واضحة، عتبات Fidelity، وقرار قبول/رفض آلي قبل الإرسال للمحرك النهائي.
          </p>
        </div>
      </section>

      <SourceContextBanner workspaceLabel="استوديو المطابقة التنفيذي" />

      <section className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 lg:col-span-2">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">إعداد الجلسة</h2>

          <div>
            <p className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-400">المصدر</p>
            <select
              value={selectedSourceId}
              onChange={(e) => setSelectedSourceId(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="">اختر مصدرًا من المكتبة</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.sourceType})
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-400">المخرج المستهدف</p>
            <div className="grid grid-cols-1 gap-2">
              {outputOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTargetOutput(option.value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    targetOutput === option.value
                      ? "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300"
                      : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-300"
                  }`}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={strictMode}
              onChange={(e) => setStrictMode(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
            />
            تفعيل STRICT Mode (رفض تلقائي عند انخفاض الدقة)
          </label>

          <button
            type="button"
            onClick={startSession}
            disabled={!selectedSource || starting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-500 disabled:opacity-50"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span>{starting ? "جاري إنشاء الجلسة..." : "بدء الجلسة"}</span>
          </button>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/40">
            <div className="mb-2 flex items-center justify-between">
              <p className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 dark:text-gray-300">
                <History className="h-3.5 w-3.5" />
                آخر الجلسات
              </p>
              <button
                type="button"
                onClick={() => void fetchRecentSessions()}
                className="rounded-md p-1 text-gray-500 transition hover:bg-gray-200 dark:hover:bg-gray-600"
                title="تحديث"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingRecent ? "animate-spin" : ""}`} />
              </button>
            </div>

            {recentSessions.length === 0 ? (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">لا توجد جلسات سابقة.</p>
            ) : (
              <div className="space-y-2">
                {recentSessions.slice(0, 5).map((item) => {
                  const meta = statusUI(item.status);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSession(item);
                        setSelectedSourceId(item.source.id);
                      }}
                      className={`w-full rounded-lg border px-2.5 py-2 text-right transition ${
                        session?.id === item.id
                          ? "border-cyan-300 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-900/20"
                          : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] font-bold text-gray-800 dark:text-gray-200">{item.source.name}</p>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
                          {meta.icon}
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                        {item.targetOutput} • {item.progress}%
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/40">
            <p className="mb-2 text-xs font-bold text-gray-700 dark:text-gray-300">آخر الحِزم</p>
            {recentArtifacts.length === 0 ? (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">لا توجد حِزم بعد.</p>
            ) : (
              <div className="space-y-2">
                {recentArtifacts.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      router.push(
                        `${item.route}?source=${encodeURIComponent(item.source.id)}&replicationArtifact=${encodeURIComponent(item.id)}`
                      )
                    }
                    className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-right transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-bold text-gray-800 dark:text-gray-200">{item.id}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          item.status === "approved"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                      {item.targetOutput} • {item.source.name}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">حالة التنفيذ</h3>
            {statusBadge && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge.cls}`}>
                {statusBadge.icon}
                {statusBadge.label}
              </span>
            )}
          </div>

          {!session ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-12 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              ابدأ جلسة جديدة ليظهر مسار التنفيذ الحي.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>التقدم الكلي</span>
                  <span>{session.progress}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-cyan-500 to-blue-600 transition-all"
                    style={{ width: `${session.progress}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  ETA: {session.etaSec}s {loadingStatus ? "• تحديث..." : ""}
                </p>
              </div>

              <div className="space-y-2">
                {session.steps.map((step, idx) => (
                  <div key={step.id} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-600 dark:bg-gray-700/40">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold text-gray-800 dark:text-gray-200">
                        {idx + 1}. {step.title}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">{step.progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className={`h-full rounded-full ${
                          step.status === "completed"
                            ? "bg-emerald-500"
                            : step.status === "running"
                              ? "bg-cyan-500"
                              : "bg-gray-300 dark:bg-gray-600"
                        }`}
                        style={{ width: `${step.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Structural</p>
                  <p className={`text-sm font-bold ${fidelityClass(session.fidelity.structural, session.thresholds.structuralMin)}`}>
                    {(session.fidelity.structural * 100).toFixed(2)}%
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Pixel</p>
                  <p className={`text-sm font-bold ${fidelityClass(session.fidelity.pixel, session.thresholds.pixelMin)}`}>
                    {(session.fidelity.pixel * 100).toFixed(2)}%
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Density</p>
                  <p className={`text-sm font-bold ${fidelityClass(session.fidelity.density, session.thresholds.densityMin)}`}>
                    {(session.fidelity.density * 100).toFixed(2)}%
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Hierarchy</p>
                  <p className={`text-sm font-bold ${fidelityClass(session.fidelity.hierarchy, session.thresholds.hierarchyMin)}`}>
                    {(session.fidelity.hierarchy * 100).toFixed(2)}%
                  </p>
                </div>
              </div>

              {session.status === "rejected" && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                  <p className="font-bold">تم رفض الجلسة بسبب:</p>
                  {session.rejectionReasons.map((reason) => (
                    <p key={reason}>- {reason}</p>
                  ))}
                </div>
              )}

              {(session.status === "completed" || session.status === "rejected") && (
                <button
                  type="button"
                  onClick={launchOutput}
                  disabled={dispatching}
                  className="inline-flex items-center gap-1 rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-2 text-xs font-bold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300"
                >
                  {dispatching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>{dispatching ? "جاري تجهيز الحزمة..." : "فتح المخرج المستهدف"}</span>
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
