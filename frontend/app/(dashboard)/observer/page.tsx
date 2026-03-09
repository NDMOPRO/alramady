"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Send,
  Mic,
  MicOff,
  FileSearch,
  GitCompareArrows,
  LayoutDashboard,
  FileText,
  Presentation,
  Search,
  Eraser,
  Import,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  Clock,
  Loader2,
  Database,
  BarChart3,
  Bell,
  Activity,
  ChevronLeft,
  FileUp,
  Zap,
  ArrowUpLeft,
  XCircle,
  ScanSearch,
  Languages,
  type LucideIcon,
} from "lucide-react";
import { useSourceLibraryStore } from "@/lib/stores/source-library-store";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DetectedIntent {
  type: string;
  confidence: number;
  label: string;
  labelAr: string;
}

interface SuggestedAction {
  id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  engine: string;
  route: string;
}

interface CommandResult {
  intent: DetectedIntent;
  suggestedActions: SuggestedAction[];
  executionPlan: {
    steps: Array<{
      order: number;
      action: string;
      actionAr: string;
      engine: string;
      estimatedTime: string;
    }>;
  };
}

interface Anomaly {
  id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  severity: "low" | "medium" | "high" | "critical";
  source: string;
  detectedAt: string;
  actionRoute: string;
}

interface Suggestion {
  id: string;
  type: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  actionRoute: string;
  priority: number;
}

interface RecentActivityItem {
  id: string;
  type: "command" | "file" | "report" | "dashboard";
  title: string;
  titleAr: string;
  timestamp: string;
  status: "completed" | "in_progress" | "failed";
  route?: string;
}

interface SystemStats {
  activeDatasets: number;
  activeDashboards: number;
  recentAlerts: number;
  systemHealth: "healthy" | "degraded" | "critical";
}

interface QuickAction {
  id: string;
  titleAr: string;
  descriptionAr: string;
  icon: LucideIcon;
  gradient: string;
  iconColor: string;
  action: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const quickActions: QuickAction[] = [
  {
    id: "analyze",
    titleAr: "تحليل ملفات",
    descriptionAr: "تحليل شامل لأي نوع من الملفات والبيانات",
    icon: FileSearch,
    gradient: "from-blue-500 to-blue-600",
    iconColor: "text-blue-100",
    action: "analyze-files",
  },
  {
    id: "compare",
    titleAr: "مقارنة بيانات",
    descriptionAr: "مقارنة مجموعات البيانات واكتشاف الفروقات",
    icon: GitCompareArrows,
    gradient: "from-emerald-500 to-emerald-600",
    iconColor: "text-emerald-100",
    action: "compare-data",
  },
  {
    id: "dashboard",
    titleAr: "بناء لوحة مؤشرات",
    descriptionAr: "إنشاء لوحة مؤشرات تفاعلية من بياناتك",
    icon: LayoutDashboard,
    gradient: "from-purple-500 to-purple-600",
    iconColor: "text-purple-100",
    action: "build-dashboard",
  },
  {
    id: "report",
    titleAr: "إنشاء تقرير",
    descriptionAr: "توليد تقارير احترافية تلقائياً",
    icon: FileText,
    gradient: "from-orange-500 to-orange-600",
    iconColor: "text-orange-100",
    action: "generate-report",
  },
  {
    id: "presentation",
    titleAr: "إنشاء عرض تقديمي",
    descriptionAr: "تصميم عروض تقديمية جذابة من البيانات",
    icon: Presentation,
    gradient: "from-pink-500 to-pink-600",
    iconColor: "text-pink-100",
    action: "create-presentation",
  },
  {
    id: "patterns",
    titleAr: "اكتشاف أنماط",
    descriptionAr: "اكتشاف الأنماط والاتجاهات المخفية",
    icon: Search,
    gradient: "from-violet-500 to-violet-600",
    iconColor: "text-violet-100",
    action: "discover-patterns",
  },
  {
    id: "replication",
    titleAr: "مطابقة حرفية 1:1",
    descriptionAr: "تشغيل جلسة مطابقة صارمة وتحويل إلى مخرج حي",
    icon: ScanSearch,
    gradient: "from-sky-500 to-cyan-600",
    iconColor: "text-sky-100",
    action: "strict-replication",
  },
  {
    id: "clean",
    titleAr: "تنظيف بيانات",
    descriptionAr: "تنظيف وتصحيح وتطبيع البيانات",
    icon: Eraser,
    gradient: "from-teal-500 to-teal-600",
    iconColor: "text-teal-100",
    action: "clean-data",
  },
  {
    id: "import",
    titleAr: "استيراد بيانات",
    descriptionAr: "رفع واستيراد ملفات البيانات بسهولة",
    icon: Import,
    gradient: "from-cyan-500 to-cyan-600",
    iconColor: "text-cyan-100",
    action: "import-data",
  },
  {
    id: "localization",
    titleAr: "تعريب تصميمي",
    descriptionAr: "فتح التعريب الاحترافي مع ضبط RTL دلالي",
    icon: Languages,
    gradient: "from-amber-500 to-orange-600",
    iconColor: "text-amber-100",
    action: "open-localization",
  },
];

const intentChips: Array<{ label: string; keyword: string }> = [
  { label: "تحليل", keyword: "تحليل" },
  { label: "لوحة مؤشرات", keyword: "لوحة مؤشرات" },
  { label: "تقرير", keyword: "تقرير" },
  { label: "عرض", keyword: "عرض تقديمي" },
  { label: "بيانات", keyword: "بيانات" },
];

const autoSuggestions = [
  "حلل ملف المبيعات الأخير",
  "أنشئ لوحة مؤشرات للأداء الشهري",
  "قارن بيانات الربع الأول والثاني",
  "أنشئ تقرير ملخص شهري",
  "اكتشف الأنماط في بيانات العملاء",
  "نظف بيانات المخزون",
  "أنشئ عرض تقديمي للنتائج المالية",
  "استورد ملف CSV جديد",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

function severityBadge(severity: Anomaly["severity"]): {
  bg: string;
  text: string;
  label: string;
} {
  const map: Record<Anomaly["severity"], { bg: string; text: string; label: string }> = {
    critical: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300", label: "حرج" },
    high: { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300", label: "مرتفع" },
    medium: { bg: "bg-yellow-100 dark:bg-yellow-900/40", text: "text-yellow-700 dark:text-yellow-300", label: "متوسط" },
    low: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", label: "منخفض" },
  };
  return map[severity];
}

function activityIcon(type: RecentActivityItem["type"]): LucideIcon {
  const map: Record<RecentActivityItem["type"], LucideIcon> = {
    command: Zap,
    file: FileUp,
    report: FileText,
    dashboard: LayoutDashboard,
  };
  return map[type];
}

function statusIndicator(status: RecentActivityItem["status"]): {
  icon: LucideIcon;
  color: string;
  label: string;
} {
  const map: Record<RecentActivityItem["status"], { icon: LucideIcon; color: string; label: string }> = {
    completed: { icon: CheckCircle2, color: "text-green-500", label: "مكتمل" },
    in_progress: { icon: Loader2, color: "text-blue-500", label: "قيد التنفيذ" },
    failed: { icon: XCircle, color: "text-red-500", label: "فشل" },
  };
  return map[status];
}

function healthColor(health: SystemStats["systemHealth"]): string {
  const map: Record<SystemStats["systemHealth"], string> = {
    healthy: "text-green-500",
    degraded: "text-yellow-500",
    critical: "text-red-500",
  };
  return map[health];
}

function healthLabel(health: SystemStats["systemHealth"]): string {
  const map: Record<SystemStats["systemHealth"], string> = {
    healthy: "سليم",
    degraded: "متراجع",
    critical: "حرج",
  };
  return map[health];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ObserverPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const sources = useSourceLibraryStore((s) => s.sources);

  // Command state
  const [command, setCommand] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);

  // Data state
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null);

  const pendingSource = pendingSourceId
    ? sources.find((item) => item.id === pendingSourceId) ?? null
    : null;

  /* ---- Fetch proactive suggestions ---- */
  const fetchSuggestions = useCallback(async () => {
    setLoadingData(true);
    setDataError(null);
    try {
      const res = await fetch("/api/observer/suggestions");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.success && json.data) {
        setAnomalies(json.data.anomalies || []);
        setSuggestions(json.data.suggestions || []);
        setRecentActivity(json.data.recentActivity || []);
        setStats(json.data.stats || null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "فشل تحميل البيانات";
      setDataError(msg);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  useEffect(() => {
    const pendingPrompt =
      typeof window !== "undefined" ? localStorage.getItem("rasid_pending_prompt") : null;
    const sourceId =
      typeof window !== "undefined" ? localStorage.getItem("rasid_pending_source") : null;

    if (pendingPrompt) {
      setCommand(pendingPrompt);
      if (typeof window !== "undefined") {
        localStorage.removeItem("rasid_pending_prompt");
      }
      setTimeout(() => inputRef.current?.focus(), 0);
    }

    if (sourceId) {
      setPendingSourceId(sourceId);
      if (typeof window !== "undefined") {
        localStorage.removeItem("rasid_pending_source");
      }
    }
  }, []);

  /* ---- Command handling ---- */
  const handleCommand = useCallback(async () => {
    if (!command.trim() || isProcessing) return;

    setIsProcessing(true);
    setCommandResult(null);
    setShowSuggestions(false);

    try {
      const res = await fetch("/api/observer/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: command.trim() }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      if (json.success && json.data) {
        setCommandResult(json.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطأ في معالجة الأمر";
      setDataError(msg);
    } finally {
      setIsProcessing(false);
    }
  }, [command, isProcessing]);

  /* ---- Execute action ---- */
  const executeAction = useCallback(
    async (actionId: string) => {
      try {
        const res = await fetch("/api/observer/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: actionId, params: {} }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        if (json.success && json.data?.redirectTo) {
          router.push(json.data.redirectTo);
        }
      } catch {
        // silent navigation fallback
      }
    },
    [router]
  );

  /* ---- Auto-suggestions filtering ---- */
  useEffect(() => {
    if (command.trim().length > 0) {
      const filtered = autoSuggestions.filter((s) =>
        s.includes(command.trim())
      );
      setFilteredSuggestions(filtered.length > 0 ? filtered : autoSuggestions.slice(0, 4));
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
      setFilteredSuggestions([]);
    }
  }, [command]);

  /* ---- Voice input toggle ---- */
  const toggleVoice = useCallback(() => {
    setIsListening((prev) => !prev);
  }, []);

  /* ---- Key handler ---- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleCommand();
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
      }
    },
    [handleCommand]
  );

  /* ---- Intent chip click ---- */
  const handleChipClick = useCallback((keyword: string) => {
    setCommand(keyword + " ");
    inputRef.current?.focus();
  }, []);

  /* ---- Select suggestion ---- */
  const selectSuggestion = useCallback((suggestion: string) => {
    setCommand(suggestion);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, []);

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div dir="rtl" className="min-h-full space-y-8 pb-12">
      {/* ------------------------------------------------------------ */}
      {/*  Status Dashboard (top bar)                                   */}
      {/* ------------------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Active Datasets */}
        <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="absolute -left-4 -top-4 h-20 w-20 rounded-full bg-blue-500/10 transition-transform group-hover:scale-110" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
              <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats?.activeDatasets ?? "--"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">مجموعات بيانات نشطة</p>
            </div>
          </div>
        </div>

        {/* Active Dashboards */}
        <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="absolute -left-4 -top-4 h-20 w-20 rounded-full bg-purple-500/10 transition-transform group-hover:scale-110" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40">
              <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats?.activeDashboards ?? "--"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">لوحات مؤشرات نشطة</p>
            </div>
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="absolute -left-4 -top-4 h-20 w-20 rounded-full bg-orange-500/10 transition-transform group-hover:scale-110" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/40">
              <Bell className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats?.recentAlerts ?? "--"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">تنبيهات حديثة</p>
            </div>
          </div>
        </div>

        {/* System Health */}
        <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="absolute -left-4 -top-4 h-20 w-20 rounded-full bg-green-500/10 transition-transform group-hover:scale-110" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/40">
              <Activity className={`h-5 w-5 ${stats ? healthColor(stats.systemHealth) : "text-gray-400"}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${stats ? healthColor(stats.systemHealth) : "text-gray-400"}`}>
                {stats ? healthLabel(stats.systemHealth) : "--"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">حالة النظام</p>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/*  Command Bar                                                  */}
      {/* ------------------------------------------------------------ */}
      <div className="relative mx-auto max-w-3xl">
        {pendingSource && (
          <div className="mb-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-xs text-cyan-800 dark:border-cyan-900/50 dark:bg-cyan-900/20 dark:text-cyan-200">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <FileUp className="h-3.5 w-3.5" />
              مصدر مرفق من راصد الذكي: {pendingSource.name}
            </span>
          </div>
        )}

        {/* Header */}
        <div className="mb-4 text-center">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-l from-rasid-600/10 to-accent-600/10 px-4 py-1.5">
            <Sparkles className="h-4 w-4 text-rasid-600 dark:text-rasid-400" />
            <span className="text-sm font-semibold text-rasid-700 dark:text-rasid-300">
              الراصد الذكي
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
            كيف يمكنني مساعدتك اليوم؟
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            اكتب أمراً أو سؤالاً وسأقوم بتوجيهك للمحرك المناسب
          </p>
        </div>

        {/* Input */}
        <div className="relative">
          <div className="relative overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-lg transition-all focus-within:border-rasid-500 focus-within:shadow-rasid-500/10 dark:border-gray-600 dark:bg-gray-800">
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (command.trim().length > 0) setShowSuggestions(true);
              }}
              onBlur={() => {
                setTimeout(() => setShowSuggestions(false), 200);
              }}
              placeholder="اسأل الراصد الذكي... اكتب أمراً أو سؤالاً"
              className="w-full bg-transparent px-6 py-5 pe-14 ps-14 text-lg text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-white dark:placeholder:text-gray-500"
              dir="auto"
              disabled={isProcessing}
            />

            {/* Voice button */}
            <div className="absolute start-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <button
                onClick={toggleVoice}
                className={`rounded-lg p-2 transition-colors ${
                  isListening
                    ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                    : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                }`}
                title="إدخال صوتي"
                type="button"
              >
                {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
            </div>

            {/* Send button */}
            <div className="absolute end-3 top-1/2 -translate-y-1/2">
              <button
                onClick={handleCommand}
                disabled={!command.trim() || isProcessing}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-l from-rasid-600 to-rasid-700 text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50 disabled:shadow-none"
                title="إرسال"
                type="button"
              >
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {/* Auto-suggestions dropdown */}
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute top-full z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white py-2 shadow-xl dark:border-gray-600 dark:bg-gray-800">
              {filteredSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(suggestion)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-right text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <ArrowUpLeft className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Intent chips */}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {intentChips.map((chip) => (
            <button
              key={chip.keyword}
              type="button"
              onClick={() => handleChipClick(chip.keyword)}
              className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 transition-all hover:border-rasid-300 hover:bg-rasid-50 hover:text-rasid-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-rasid-500 dark:hover:bg-rasid-900/20 dark:hover:text-rasid-400"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Command Result */}
        {commandResult && (
          <div className="mt-6 animate-fade-in rounded-xl border border-gray-200 bg-white p-6 shadow-md dark:border-gray-700 dark:bg-gray-800">
            {/* Intent badge */}
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full bg-rasid-100 px-3 py-1 text-sm font-semibold text-rasid-700 dark:bg-rasid-900/40 dark:text-rasid-300">
                {commandResult.intent.labelAr}
              </div>
              <span className="text-xs text-gray-400">
                ثقة: {Math.round(commandResult.intent.confidence * 100)}%
              </span>
            </div>

            {/* Suggested actions */}
            <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              الإجراءات المقترحة
            </h3>
            <div className="space-y-2">
              {commandResult.suggestedActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => executeAction(action.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-3 text-right transition-colors hover:border-rasid-200 hover:bg-rasid-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-rasid-500 dark:hover:bg-rasid-900/20"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {action.titleAr}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {action.descriptionAr}
                    </p>
                  </div>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-gray-400" />
                </button>
              ))}
            </div>

            {/* Execution plan */}
            {commandResult.executionPlan.steps.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  خطة التنفيذ
                </h3>
                <div className="space-y-2">
                  {commandResult.executionPlan.steps.map((step) => (
                    <div
                      key={step.order}
                      className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/50"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rasid-100 text-xs font-bold text-rasid-700 dark:bg-rasid-900/40 dark:text-rasid-300">
                        {step.order}
                      </span>
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                        {step.actionAr}
                      </span>
                      <span className="text-xs text-gray-400">
                        ~{step.estimatedTime}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ */}
      {/*  Quick Actions Grid                                           */}
      {/* ------------------------------------------------------------ */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">
          إجراءات سريعة
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => executeAction(action.action)}
                className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800"
              >
                <div
                  className={`absolute -left-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${action.gradient} opacity-10 transition-transform group-hover:scale-125`}
                />
                <div className="relative">
                  <div
                    className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${action.gradient} shadow-md`}
                  >
                    <Icon className={`h-5 w-5 ${action.iconColor}`} />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    {action.titleAr}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    {action.descriptionAr}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/*  Proactive Intelligence + Recent Activity                     */}
      {/* ------------------------------------------------------------ */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* ------ Proactive Intelligence Panel (3 cols) ------ */}
        <div className="space-y-6 lg:col-span-3">
          {/* Anomaly Alerts */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  تنبيهات ذكية
                </h2>
              </div>
              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                {anomalies.length}
              </span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {loadingData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : dataError ? (
                <div className="px-5 py-6 text-center text-sm text-red-500">{dataError}</div>
              ) : anomalies.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-gray-400">
                  لا توجد تنبيهات حالياً
                </div>
              ) : (
                anomalies.map((anomaly) => {
                  const badge = severityBadge(anomaly.severity);
                  return (
                    <button
                      key={anomaly.id}
                      type="button"
                      onClick={() => router.push(anomaly.actionRoute)}
                      className="flex w-full items-start gap-3 px-5 py-4 text-right transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <div className="mt-0.5 shrink-0">
                        <AlertTriangle className={`h-4 w-4 ${badge.text}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {anomaly.titleAr}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.text}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {anomaly.descriptionAr}
                        </p>
                        <p className="mt-1 text-[10px] text-gray-400">
                          {anomaly.source} - {timeAgo(anomaly.detectedAt)}
                        </p>
                      </div>
                      <ChevronLeft className="mt-1 h-4 w-4 shrink-0 text-gray-300" />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Smart Suggestions */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <Sparkles className="h-5 w-5 text-accent-500" />
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                اقتراحات ذكية
              </h2>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {loadingData ? (
                <div className="col-span-full flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : (
                suggestions.map((s) => {
                  const typeIcons: Record<string, LucideIcon> = {
                    dashboard: LayoutDashboard,
                    report: FileText,
                    analysis: TrendingUp,
                    optimization: Zap,
                  };
                  const typeColors: Record<string, string> = {
                    dashboard: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400",
                    report: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
                    analysis: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
                    optimization: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
                  };
                  const SIcon = typeIcons[s.type] || Sparkles;
                  const sColor = typeColors[s.type] || "bg-gray-100 text-gray-600";

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => router.push(s.actionRoute)}
                      className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 text-right transition-all hover:border-rasid-200 hover:bg-rasid-50 hover:shadow-sm dark:border-gray-600 dark:bg-gray-700/50 dark:hover:border-rasid-500 dark:hover:bg-rasid-900/20"
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${sColor}`}>
                        <SIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {s.titleAr}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {s.descriptionAr}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ------ Recent Activity Feed (2 cols) ------ */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <Clock className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                النشاط الأخير
              </h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {loadingData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-gray-400">
                  لا يوجد نشاط حديث
                </div>
              ) : (
                recentActivity.map((item) => {
                  const AIcon = activityIcon(item.type);
                  const sInfo = statusIndicator(item.status);
                  const SIcon = sInfo.icon;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.route) router.push(item.route);
                      }}
                      className="flex w-full items-center gap-3 px-5 py-3.5 text-right transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
                        <AIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-700 dark:text-gray-300">
                          {item.titleAr}
                        </p>
                        <p className="text-[10px] text-gray-400">{timeAgo(item.timestamp)}</p>
                      </div>
                      <SIcon
                        className={`h-4 w-4 shrink-0 ${sInfo.color} ${
                          item.status === "in_progress" ? "animate-spin" : ""
                        }`}
                      />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
