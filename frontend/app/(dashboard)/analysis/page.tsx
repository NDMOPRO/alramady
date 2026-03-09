"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  Brain,
  Calendar,
  Database,
  GitBranch,
  Loader2,
  RefreshCw,
  Sigma,
  Table2,
} from "lucide-react";
import EmbeddedRasidAssistant, {
  type EmbeddedAssistantAction,
} from "@/components/assistant/EmbeddedRasidAssistant";
import CompactSurfaceHeader from "@/components/layout/CompactSurfaceHeader";
import { useAppearanceStore } from "@/lib/stores/appearance-store";
import {
  analyzeDataset,
  getDashboards,
  type AnalysisChartRecommendation,
  type AnalysisKPIRecommendation,
  type AnalysisProfileColumn,
  type DatasetAnalysisResult,
} from "@/lib/api/dashboard";
import { getDatasets, type Dataset } from "@/lib/api/data";

const chartTypeLabels: Record<string, string> = {
  line_chart: "مخطط خطي",
  bar_chart: "مخطط أعمدة",
  pie_chart: "مخطط دائري",
  scatter_plot: "مخطط تبعثر",
  area_chart: "مخطط مساحي",
  radar_chart: "مخطط رادار",
  gauge: "مؤشر قياس",
  table: "جدول",
};

const formulaLabels: Record<string, string> = {
  SUM: "المجموع",
  AVG: "المتوسط",
  MAX: "الأعلى",
  MIN: "الأدنى",
  COUNT: "العدد",
};

const columnTypeLabels: Record<string, string> = {
  numeric: "رقمي",
  categorical: "تصنيفي",
  date: "تاريخ",
  text: "نصي",
  boolean: "منطقي",
};

function formatMetric(value: number | undefined): string {
  if (value === undefined) return "0";
  return value.toLocaleString("ar-SA", { maximumFractionDigits: 2 });
}

function extractErrorMessage(error: unknown): string {
  return (
    (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ||
    (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message ||
    (error as Error)?.message ||
    "فشل تشغيل تحليل البيانات من خدمة التحليل."
  );
}

function ChartRecommendationCard({ recommendation }: { recommendation: AnalysisChartRecommendation }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            {chartTypeLabels[recommendation.widgetType] ?? recommendation.widgetType}
          </p>
          <h3 className="mt-1 text-sm font-bold text-gray-900 dark:text-white">
            {recommendation.titleAr || recommendation.title}
          </h3>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
          {formatMetric(recommendation.score)}
        </span>
      </div>
      <p className="mt-3 text-xs leading-6 text-gray-500 dark:text-gray-400">
        {recommendation.reason}
      </p>
      <div className="mt-4 grid gap-2 text-xs text-gray-600 dark:text-gray-300">
        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
          X: {recommendation.xColumn ?? "غير مطلوب"}
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
          Y: {recommendation.yColumn ?? "غير مطلوب"}
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
          التسمية: {recommendation.labelColumn ?? "غير مطلوب"}
        </div>
      </div>
    </div>
  );
}

function KPIRecommendationCard({ recommendation }: { recommendation: AnalysisKPIRecommendation }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {formulaLabels[recommendation.formula] ?? recommendation.formula}
          </p>
          <h3 className="mt-1 text-sm font-bold text-gray-900 dark:text-white">
            {recommendation.nameAr || recommendation.name}
          </h3>
        </div>
        <Sigma className="h-4 w-4 text-emerald-500" />
      </div>
      <div className="mt-4 grid gap-2 text-xs text-gray-600 dark:text-gray-300">
        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
          العمود: {recommendation.column}
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
          التنسيق: {recommendation.format}
        </div>
      </div>
    </div>
  );
}

function ColumnProfileCard({ column }: { column: AnalysisProfileColumn }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{column.name}</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {columnTypeLabels[column.type] ?? column.type}
          </p>
        </div>
        <GitBranch className="h-4 w-4 text-violet-500" />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
          <dt className="text-gray-400">فريدة</dt>
          <dd className="mt-1 font-semibold text-gray-700 dark:text-gray-200">
            {formatMetric(column.uniqueCount)}
          </dd>
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
          <dt className="text-gray-400">فارغة</dt>
          <dd className="mt-1 font-semibold text-gray-700 dark:text-gray-200">
            {formatMetric(column.nullCount)}
          </dd>
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
          <dt className="text-gray-400">إجمالي</dt>
          <dd className="mt-1 font-semibold text-gray-700 dark:text-gray-200">
            {formatMetric(column.totalCount)}
          </dd>
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
          <dt className="text-gray-400">عينة</dt>
          <dd className="mt-1 font-semibold text-gray-700 dark:text-gray-200">
            {column.sample.slice(0, 2).map((value) => String(value)).join(" / ") || "لا توجد"}
          </dd>
        </div>
      </dl>
      {column.stats && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          {column.stats.min !== undefined && (
            <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
              الأدنى: {formatMetric(column.stats.min)}
            </div>
          )}
          {column.stats.max !== undefined && (
            <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
              الأعلى: {formatMetric(column.stats.max)}
            </div>
          )}
          {column.stats.mean !== undefined && (
            <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
              المتوسط: {formatMetric(column.stats.mean)}
            </div>
          )}
          {column.stats.sum !== undefined && (
            <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
              المجموع: {formatMetric(column.stats.sum)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  const router = useRouter();
  const activeTheme = useAppearanceStore((state) => state.activeTheme);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dashboardCount, setDashboardCount] = useState(0);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [analysisResult, setAnalysisResult] = useState<DatasetAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId]
  );

  async function runAnalysis(datasetId: string) {
    setAnalyzing(true);
    setError(null);

    try {
      const result = await analyzeDataset(datasetId, [
        "line_chart",
        "bar_chart",
        "pie_chart",
        "scatter_plot",
        "area_chart",
      ]);
      setAnalysisResult(result);
    } catch (runError) {
      setAnalysisResult(null);
      setError(extractErrorMessage(runError));
    } finally {
      setAnalyzing(false);
    }
  }

  async function loadSurface(preferredDatasetId?: string) {
    setLoading(true);

    try {
      const [dashboardsResult, datasetsResult] = await Promise.all([
        getDashboards({ page: 1, pageSize: 1 }),
        getDatasets({ page: 1, pageSize: 8 }),
      ]);

      setDashboardCount(dashboardsResult.total);
      setDatasets(datasetsResult.data);

      const nextDatasetId = preferredDatasetId || datasetsResult.data[0]?.id || "";
      if (nextDatasetId) {
        setSelectedDatasetId(nextDatasetId);
        await runAnalysis(nextDatasetId);
      } else {
        setAnalysisResult(null);
      }
      return {
        datasetCount: datasetsResult.data.length,
        dashboardCount: dashboardsResult.total,
      };
    } catch (loadError) {
      setDatasets([]);
      setAnalysisResult(null);
      setError(extractErrorMessage(loadError));
      return {
        datasetCount: 0,
        dashboardCount: 0,
      };
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSurface();
  }, []);

  const chartRecommendationCount = analysisResult?.chartRecommendations.length ?? 0;
  const profile = analysisResult?.dataProfile;
  const assistantActions = useMemo<EmbeddedAssistantAction[]>(
    () => [
      {
        id: "reload-analysis-surface",
        label: "تحديث التحليل والبيانات",
        description: "يعيد قراءة البيانات ولوحات المؤشرات ثم يشغّل التحليل على المجموعة الحالية.",
        keywords: ["تحديث التحليل", "حدث السطح", "اعد تحميل التحليل", "جدد التحليل"],
        run: async () => {
          const snapshot = await loadSurface(selectedDatasetId || undefined);
          return {
            message: `تم تحديث Surface التحليل. عدد المجموعات المتاحة الآن ${snapshot.datasetCount} وعدد لوحات المؤشرات ${snapshot.dashboardCount}.`,
            chips: [`المجموعات ${snapshot.datasetCount}`, `اللوحات ${snapshot.dashboardCount}`],
          };
        },
      },
      {
        id: "run-current-analysis",
        label: "شغّل التحليل الحالي",
        description: "يرسل datasetId الحالي مباشرة إلى محرك التحليل.",
        keywords: ["شغل التحليل", "حلل المجموعه", "اعد التحليل", "تحليل الان"],
        run: async () => {
          if (!selectedDatasetId || !selectedDataset) {
            throw new Error("لا توجد مجموعة بيانات محددة للتحليل.");
          }

          await runAnalysis(selectedDatasetId);
          return {
            message: `تم تشغيل التحليل على ${selectedDataset.name}.`,
            chips: [`${selectedDataset.rowCount} صف`, `${selectedDataset.columnCount} عمود`],
          };
        },
      },
      {
        id: "open-data-surface",
        label: "افتح Surface البيانات",
        description: "ينقلك إلى البيانات لمراجعة المجموعة المصدر أو استيراد ملف جديد.",
        keywords: ["افتح البيانات", "اذهب الى البيانات", "مساحة البيانات"],
        run: async () => {
          router.push("/data");
          return {
            message: "تم تحويلك إلى Surface البيانات لمراجعة المصدر أو استيراد ملف جديد.",
          };
        },
      },
    ],
    [dashboardCount, datasets.length, router, selectedDataset, selectedDatasetId]
  );

  return (
    <div className="rased-surface-page" dir="rtl">
      <CompactSurfaceHeader
        badge="التحليل"
        title="المجموعة الحالية ثم النتيجة"
        description="اختر المصدر وشغّل التحليل. التفاصيل العميقة تنكشف فقط بعد ظهور النتيجة."
        accentClassName="border-violet-200 bg-violet-50 text-violet-800"
        metrics={[
          { label: "المجموعات", value: String(datasets.length) },
          { label: "اللوحات", value: String(dashboardCount) },
          { label: "التوصيات", value: String(chartRecommendationCount) },
          ...(activeTheme ? [{ label: "الثيم", value: activeTheme.name }] : []),
        ]}
      />

      <EmbeddedRasidAssistant
        surfaceId="analysis"
        surfaceName="التحليل والذكاء الاصطناعي"
        route="/analysis"
        intro="أقرأ المجموعة المحددة ونتائج التحليل الحالية، ثم أشغل فقط الإجراءات الحقيقية المتاحة في هذا السطح."
        contextSummary={
          selectedDataset && analysisResult
            ? `المجموعة الحالية هي ${selectedDataset.name} وبها ${analysisResult.dataProfile.rowCount} صف و${analysisResult.chartRecommendations.length} توصية رسم.`
            : "لا توجد نتيجة تحليل مكتملة الآن، ويمكنني إعادة تحميل السطح أو تشغيل التحليل على مجموعة متاحة."
        }
        contextItems={[
          { label: "المجموعات", value: String(datasets.length) },
          { label: "اللوحات", value: String(dashboardCount) },
          { label: "المجموعة الحالية", value: selectedDataset?.name ?? "غير محددة" },
          { label: "توصيات الرسوم", value: String(chartRecommendationCount) },
        ]}
        actions={assistantActions}
        suggestedPrompts={[
          "ماذا يمكنك أن تفعل هنا؟",
          "شغّل التحليل الحالي",
          "حدّث التحليل",
          "ما الحالة الحالية؟",
        ]}
      />

      <section className="rased-panel rased-motion-stagger-1">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">اختيار مجموعة البيانات للتحليل</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              اختيارك هنا يرسل `datasetId` مباشرة إلى `POST /api/v1/dashboard/analyze-data`.
            </p>
          </div>
          <button
            type="button"
            disabled={!selectedDatasetId || analyzing || loading}
            onClick={() => {
              if (selectedDatasetId) {
                void runAnalysis(selectedDatasetId);
              }
            }}
            className="rased-action-accent"
          >
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span>{analyzing ? "جاري تشغيل التحليل" : "تشغيل التحليل"}</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
          </div>
        ) : datasets.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            لا توجد مجموعات بيانات متاحة للتحليل.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {datasets.map((dataset) => {
              const isActive = dataset.id === selectedDatasetId;
              return (
                <button
                  key={dataset.id}
                  type="button"
                  onClick={() => {
                    setSelectedDatasetId(dataset.id);
                    void runAnalysis(dataset.id);
                  }}
                  className={`rounded-2xl border p-4 text-right transition ${
                    isActive
                      ? "border-cyan-300 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950/20"
                      : "border-gray-200 bg-gray-50 hover:border-cyan-200 dark:border-gray-700 dark:bg-gray-900/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">{dataset.name}</h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{dataset.format.toUpperCase()}</p>
                    </div>
                    <Database className={`h-4 w-4 ${isActive ? "text-cyan-600" : "text-gray-400"}`} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
                    <div className="rounded-xl bg-white px-3 py-2 dark:bg-gray-800">
                      صفوف: {formatMetric(dataset.rowCount)}
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 dark:bg-gray-800">
                      أعمدة: {formatMetric(dataset.columnCount)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {error && (
        <section className="rased-status-error">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{error}</span>
          </div>
        </section>
      )}

      {selectedDataset && analysisResult && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rased-panel-soft p-5">
              <div className="inline-flex rounded-xl bg-cyan-100 p-2 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                <Database className="h-4 w-4" />
              </div>
              <p className="mt-4 text-2xl font-black text-gray-900 dark:text-white">{formatMetric(profile?.rowCount)}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">صفوف تم تحليلها</p>
            </div>
            <div className="rased-panel-soft p-5">
              <div className="inline-flex rounded-xl bg-violet-100 p-2 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                <Table2 className="h-4 w-4" />
              </div>
              <p className="mt-4 text-2xl font-black text-gray-900 dark:text-white">{formatMetric(profile?.columnCount)}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">أعمدة تم تحليلها</p>
            </div>
            <div className="rased-panel-soft p-5">
              <div className="inline-flex rounded-xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <Sigma className="h-4 w-4" />
              </div>
              <p className="mt-4 text-2xl font-black text-gray-900 dark:text-white">
                {formatMetric(analysisResult.kpiRecommendations.length)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">KPI مقترحة</p>
            </div>
            <div className="rased-panel-soft p-5">
              <div className="inline-flex rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                <BarChart3 className="h-4 w-4" />
              </div>
              <p className="mt-4 text-2xl font-black text-gray-900 dark:text-white">
                {formatMetric(analysisResult.chartRecommendations.length)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">رسوم مقترحة</p>
            </div>
            <div className="rased-panel-soft p-5">
              <div className="inline-flex rounded-xl bg-rose-100 p-2 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                <Calendar className="h-4 w-4" />
              </div>
              <p className="mt-4 text-sm font-black text-gray-900 dark:text-white">{selectedDataset.name}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">المجموعة الحالية</p>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <div className="rased-panel">
              <div className="mb-4 flex items-center gap-2">
                <Sigma className="h-4 w-4 text-emerald-600" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">مؤشرات KPI المقترحة</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {analysisResult.kpiRecommendations.map((recommendation) => (
                  <KPIRecommendationCard
                    key={`${recommendation.column}-${recommendation.formula}`}
                    recommendation={recommendation}
                  />
                ))}
              </div>
            </div>

            <div className="rased-panel">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">توصيات الرسوم البيانية</h2>
              </div>
              <div className="grid gap-3">
                {analysisResult.chartRecommendations.map((recommendation) => (
                  <ChartRecommendationCard
                    key={`${recommendation.widgetType}-${recommendation.title}-${recommendation.xColumn ?? "x"}-${recommendation.yColumn ?? "y"}`}
                    recommendation={recommendation}
                  />
                ))}
              </div>
            </div>
          </section>

          <details className="rased-details">
            <summary className="rased-summary">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-violet-600" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">بروفايل الأعمدة</h2>
              </div>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                {profile?.columns.length ?? 0} عمود
              </span>
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {profile?.columns.map((column) => (
                <ColumnProfileCard key={column.name} column={column} />
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
