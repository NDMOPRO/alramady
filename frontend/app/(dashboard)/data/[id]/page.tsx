"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Database,
  Download,
  FileText,
  Hash,
  LibraryBig,
  Loader2,
  Presentation,
  Sparkles,
  Type,
} from "lucide-react";
import {
  getDatasetById,
  getDatasetRows,
  getDatasetStatistics,
  exportDataset,
} from "@/lib/api/data";
import type { DatasetColumn, DatasetRow } from "@/lib/api/data";
import { analyzeDataset, type DatasetAnalysisResult } from "@/lib/api/dashboard";
import { generatePresentationFromData, type Presentation as PresentationRecord } from "@/lib/api/presentation";
import {
  buildReportFromDataset,
  saveReusableRecipeAsset,
  type SavedReportActionRecipe,
} from "@/lib/api/library-reuse";
import DataTable from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/Toast";
import type { ColumnDef } from "@tanstack/react-table";
import type { Report, ReportBuildResult } from "@/lib/api/reporting";

interface LatestReportExecution {
  report: Report;
  build: ReportBuildResult;
}

export default function DatasetDetailPage() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const toast = useToast();
  const datasetId = typeof params?.id === "string" ? params.id : "";
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"data" | "stats">("data");
  const [runningAction, setRunningAction] = useState<"analysis" | "report" | "presentation" | "recipe" | null>(null);
  const [serviceMessage, setServiceMessage] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [analysisResult, setAnalysisResult] = useState<DatasetAnalysisResult | null>(null);
  const [latestReport, setLatestReport] = useState<LatestReportExecution | null>(null);
  const [latestPresentation, setLatestPresentation] = useState<PresentationRecord | null>(null);
  const [lastSavedRecipeName, setLastSavedRecipeName] = useState<string | null>(null);
  const [lastReusableRecipe, setLastReusableRecipe] = useState<SavedReportActionRecipe | null>(null);

  const { data: dataset, isLoading: datasetLoading, isError: datasetError } = useQuery({
    queryKey: ["dataset", datasetId],
    queryFn: () => getDatasetById(datasetId),
    enabled: !!datasetId,
  });

  const { data: rowsData, isLoading: rowsLoading } = useQuery({
    queryKey: ["dataset-rows", datasetId, page],
    queryFn: () => getDatasetRows(datasetId, { page, pageSize: 50 }),
    enabled: !!datasetId,
  });

  const { data: statistics, isLoading: statisticsLoading } = useQuery({
    queryKey: ["dataset-statistics", datasetId],
    queryFn: () => getDatasetStatistics(datasetId),
    enabled: !!datasetId && activeTab === "stats",
  });

  const rows: DatasetRow[] = rowsData?.data ?? [];
  const columns: DatasetColumn[] = useMemo(() => {
    if (!dataset) return [];

    if ((dataset.columns ?? []).length === 0 && rows.length > 0) {
      return Object.keys(rows[0]).map((key) => ({
        name: key,
        type: typeof rows[0][key],
        nullable: true,
        uniqueCount: 0,
        nullCount: 0,
        sampleValues: [],
      }));
    }

    return (dataset.columns ?? []).map((column) => {
      const stats = statistics?.columns?.[column.name];
      return {
        ...column,
        type: String(stats?.type ?? column.type ?? "string"),
        uniqueCount: Number(stats?.uniqueCount ?? column.uniqueCount ?? 0),
        nullCount: Number(stats?.nullCount ?? column.nullCount ?? 0),
        min: stats?.min ?? column.min,
        max: stats?.max ?? column.max,
        mean: typeof stats?.mean === "number" ? stats.mean : column.mean,
        sampleValues: column.sampleValues.length > 0 ? column.sampleValues : [],
      };
    });
  }, [dataset, rows, statistics]);

  const tableColumns: ColumnDef<DatasetRow, unknown>[] = useMemo(() => {
    if (columns.length === 0 && rows.length > 0) {
      return Object.keys(rows[0]).map((key) => ({
        accessorKey: key,
        header: key,
        cell: ({ getValue }) => {
          const val = getValue();
          return val === null ? (
            <span className="text-gray-300 dark:text-gray-600">null</span>
          ) : (
            String(val)
          );
        },
      }));
    }
    return columns.map((col) => ({
      accessorKey: col.name,
      header: col.name,
      cell: ({ getValue }) => {
        const val = getValue();
        return val === null ? (
          <span className="text-gray-300 dark:text-gray-600">null</span>
        ) : (
          String(val)
        );
      },
    }));
  }, [columns, rows]);

  const handleExport = async (format: string) => {
    try {
      const blob = await exportDataset(datasetId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dataset?.name || "dataset"}.${format === "excel" ? "xlsx" : format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`تم تصدير البيانات بصيغة ${format.toUpperCase()}`);
    } catch {
      toast.error("فشل تصدير البيانات");
    }
  };

  const getTypeIcon = (type: string) => {
    if (type.includes("int") || type.includes("float") || type.includes("number")) {
      return <Hash className="h-4 w-4 text-blue-500" />;
    }
    if (type.includes("date") || type.includes("time")) {
      return <Calendar className="h-4 w-4 text-purple-500" />;
    }
    return <Type className="h-4 w-4 text-green-500" />;
  };

  if (datasetLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-rasid-600" />
          <p className="text-sm text-gray-500">جاري تحميل مجموعة البيانات...</p>
        </div>
      </div>
    );
  }

  if (datasetError || !dataset) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4" dir="rtl">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          فشل تحميل مجموعة البيانات
        </p>
        <button onClick={() => router.back()} className="btn-primary px-4 py-2">
          العودة
        </button>
      </div>
    );
  }

  const canRunContextualServices = ["csv", "excel", "json", "jsonl", "ndjson"].includes(
    dataset.format.toLowerCase()
  );

  const handleAnalyzeDataset = async () => {
    setRunningAction("analysis");
    setServiceMessage(null);
    try {
      const result = await analyzeDataset(datasetId, ["bar_chart", "line_chart", "pie_chart", "table"]);
      setAnalysisResult(result);
      setServiceMessage({
        tone: "success",
        message: `أكمل محرك التحليل قراءة ${result.dataProfile.rowCount} صف وأعاد ${result.chartRecommendations.length} توصية رسم.`,
      });
    } catch (error) {
      setServiceMessage({
        tone: "error",
        message: error instanceof Error ? error.message : "تعذر تشغيل التحليل الحقيقي.",
      });
    } finally {
      setRunningAction(null);
    }
  };

  const handleBuildReport = async () => {
    setRunningAction("report");
    setServiceMessage(null);
    try {
      const result = await buildReportFromDataset(datasetId, `${dataset.name} - تقرير تنفيذي`);
      const recipe: SavedReportActionRecipe = {
        kind: "generate-report-from-dataset",
        version: 1,
        nameAr: `إعادة بناء تقرير ${result.datasetName}`,
        datasetId,
        datasetName: result.datasetName,
        createdAt: new Date().toISOString(),
      };
      setLatestReport(result);
      setLastReusableRecipe(recipe);
      setServiceMessage({
        tone: "success",
        message: `تم إنشاء التقرير ${result.report.name} ثم بناؤه فعليًا عبر reporting-service.`,
      });
    } catch (error) {
      setServiceMessage({
        tone: "error",
        message: error instanceof Error ? error.message : "تعذر بناء التقرير الحقيقي.",
      });
    } finally {
      setRunningAction(null);
    }
  };

  const handleGeneratePresentation = async () => {
    setRunningAction("presentation");
    setServiceMessage(null);
    try {
      const presentation = await generatePresentationFromData({
        datasetId,
        slideCount: 6,
        style: "executive-arabic",
      });
      setLatestPresentation(presentation);
      setServiceMessage({
        tone: "success",
        message: `تم توليد العرض ${presentation.name} بعدد ${presentation.slideCount} شرائح عبر presentation-service.`,
      });
    } catch (error) {
      setServiceMessage({
        tone: "error",
        message: error instanceof Error ? error.message : "تعذر توليد العرض الحقيقي.",
      });
    } finally {
      setRunningAction(null);
    }
  };

  const handleSaveReusableRecipe = async () => {
    if (!lastReusableRecipe) {
      setServiceMessage({
        tone: "error",
        message: "نفّذ بناء التقرير أولًا قبل حفظ الإجراء داخل المكتبة.",
      });
      return;
    }

    setRunningAction("recipe");
    setServiceMessage(null);
    try {
      const stem = lastReusableRecipe.datasetName
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w\u0600-\u06ff-]/g, "")
        .toLowerCase();
      await saveReusableRecipeAsset(
        `${stem || "dataset-report"}-${Date.now()}.json`,
        lastReusableRecipe,
        {
          description: "وصفة تقرير محفوظة من Surface البيانات لإعادة تشغيلها من المكتبة.",
          tags: ["library-action", "reusable", "dataset-report"],
        }
      );
      setLastSavedRecipeName(lastReusableRecipe.nameAr);
      setServiceMessage({
        tone: "success",
        message: `تم حفظ الوصفة ${lastReusableRecipe.nameAr} داخل المكتبة كأصل JSON فعلي.`,
      });
    } catch (error) {
      setServiceMessage({
        tone: "error",
        message: error instanceof Error ? error.message : "تعذر حفظ الوصفة داخل المكتبة.",
      });
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link
            href="/data"
            className="mt-1 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <ArrowRight className="h-5 w-5 rtl:rotate-180" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {dataset.nameAr || dataset.name}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {dataset.description}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span className="inline-flex items-center gap-1">
                <Database className="h-3.5 w-3.5" />
                {dataset.rowCount.toLocaleString("ar-SA")} صف
              </span>
              <span className="inline-flex items-center gap-1">
                <BarChart3 className="h-3.5 w-3.5" />
                {dataset.columnCount.toLocaleString("ar-SA")} عمود
              </span>
              <span className="uppercase font-medium">{dataset.format}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {["csv", "excel", "json"].map((fmt) => (
            <button
              key={fmt}
              onClick={() => handleExport(fmt)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Download className="h-3.5 w-3.5" />
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">الخدمات السياقية لهذه المجموعة</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              تظهر هذه الإجراءات فقط لأن المجموعة الحالية قابلة للتحليل والتقارير والعروض عبر الخدمات الفعلية.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/library")}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <LibraryBig className="h-4 w-4" />
            <span>استخدم هذا من المكتبة</span>
          </button>
        </div>

        {!canRunContextualServices ? (
          <div className="mt-4 rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            هذا النوع لا يدعم الحزمة الكاملة من الخدمات السياقية الحالية. يمكنك متابعة التصدير أو مراجعة الأعمدة فقط.
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => void handleAnalyzeDataset()}
                disabled={runningAction !== null}
                data-testid="dataset-context-analyze"
                className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-right transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-cyan-900/50 dark:bg-cyan-950/20"
              >
                <div className="mb-3 inline-flex rounded-xl bg-white p-2 text-cyan-700 dark:bg-gray-900 dark:text-cyan-200">
                  {runningAction === "analysis" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">حلّل هذه المجموعة الآن</p>
                <p className="mt-1 text-xs leading-6 text-gray-500 dark:text-gray-400">
                  `POST /api/v1/dashboard/analyze-data`
                </p>
              </button>

              <button
                type="button"
                onClick={() => void handleBuildReport()}
                disabled={runningAction !== null}
                data-testid="dataset-context-report"
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-right transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/50 dark:bg-amber-950/20"
              >
                <div className="mb-3 inline-flex rounded-xl bg-white p-2 text-amber-700 dark:bg-gray-900 dark:text-amber-200">
                  {runningAction === "report" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">ابنِ تقريرًا من هذه البيانات</p>
                <p className="mt-1 text-xs leading-6 text-gray-500 dark:text-gray-400">
                  إنشاء، إضافة أقسام، ثم بناء فعلي عبر `reporting-service`
                </p>
              </button>

              <button
                type="button"
                onClick={() => void handleGeneratePresentation()}
                disabled={runningAction !== null}
                data-testid="dataset-context-presentation"
                className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4 text-right transition hover:border-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-fuchsia-900/50 dark:bg-fuchsia-950/20"
              >
                <div className="mb-3 inline-flex rounded-xl bg-white p-2 text-fuchsia-700 dark:bg-gray-900 dark:text-fuchsia-200">
                  {runningAction === "presentation" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Presentation className="h-4 w-4" />}
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">ولّد عرضًا من هذه البيانات</p>
                <p className="mt-1 text-xs leading-6 text-gray-500 dark:text-gray-400">
                  `POST /api/v1/presentation/ai/generate-from-data`
                </p>
              </button>

              <button
                type="button"
                onClick={() => void handleSaveReusableRecipe()}
                disabled={runningAction !== null || !lastReusableRecipe}
                data-testid="dataset-context-save-recipe"
                className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-right transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900/50 dark:bg-emerald-950/20"
              >
                <div className="mb-3 inline-flex rounded-xl bg-white p-2 text-emerald-700 dark:bg-gray-900 dark:text-emerald-200">
                  {runningAction === "recipe" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LibraryBig className="h-4 w-4" />}
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">احفظ آخر إجراء داخل المكتبة</p>
                <p className="mt-1 text-xs leading-6 text-gray-500 dark:text-gray-400">
                  يحفظ وصفة JSON قابلة لإعادة التشغيل من Surface المكتبة
                </p>
              </button>
            </div>

            {serviceMessage && (
              <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                serviceMessage.tone === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200"
                  : "border border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
              }`}>
                <div className="flex items-start gap-2">
                  {serviceMessage.tone === "success" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4" />
                  )}
                  <span>{serviceMessage.message}</span>
                </div>
              </div>
            )}

            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">التحليل الأخير</p>
                {analysisResult ? (
                  <>
                    <p className="mt-2 text-sm font-bold text-gray-900 dark:text-white">
                      {analysisResult.chartRecommendations[0]?.titleAr || "تمت إعادة بروفايل البيانات"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {analysisResult.kpiRecommendations.length} KPI • {analysisResult.chartRecommendations.length} توصية رسم
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push("/analysis")}
                      className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-cyan-700 dark:text-cyan-300"
                    >
                      <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                      <span>افتح Surface التحليل</span>
                    </button>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">لم يتم تشغيل التحليل على هذه المجموعة بعد.</p>
                )}
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">التقرير الأخير</p>
                {latestReport ? (
                  <>
                    <p className="mt-2 text-sm font-bold text-gray-900 dark:text-white">{latestReport.report.name}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      buildId: {latestReport.build.buildId} • {latestReport.build.sectionCount} قسم
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push("/reports")}
                      className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300"
                    >
                      <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                      <span>افتح Surface التقارير</span>
                    </button>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">لم يتم بناء تقرير من هذه المجموعة بعد.</p>
                )}
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                <p className="text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">العرض والوصفة</p>
                {latestPresentation || lastSavedRecipeName ? (
                  <>
                    <p className="mt-2 text-sm font-bold text-gray-900 dark:text-white">
                      {latestPresentation ? latestPresentation.name : lastSavedRecipeName}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {latestPresentation
                        ? `${latestPresentation.slideCount} شرائح`
                        : "الوصفة محفوظة داخل المكتبة وقابلة لإعادة التشغيل"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {latestPresentation && (
                        <button
                          type="button"
                          onClick={() => router.push(`/presentations/${latestPresentation.id}`)}
                          className="inline-flex items-center gap-2 text-xs font-bold text-fuchsia-700 dark:text-fuchsia-300"
                        >
                          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                          <span>افتح العرض</span>
                        </button>
                      )}
                      {lastSavedRecipeName && (
                        <button
                          type="button"
                          onClick={() => router.push("/library")}
                          className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                        >
                          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                          <span>افتح المكتبة</span>
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">لم يتم توليد عرض أو حفظ وصفة بعد.</p>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("data")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "data"
              ? "border-b-2 border-rasid-600 text-rasid-600"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          البيانات
        </button>
        <button
          onClick={() => setActiveTab("stats")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "stats"
              ? "border-b-2 border-rasid-600 text-rasid-600"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          إحصائيات الأعمدة
        </button>
      </div>

      {activeTab === "data" && (
        <div>
          {rowsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-rasid-600" />
            </div>
          ) : (
            <DataTable
              data={rows}
              columns={tableColumns}
              isLoading={rowsLoading}
              searchPlaceholder="البحث في البيانات..."
              emptyMessageAr="لا توجد بيانات لعرضها"
              pageSize={50}
            />
          )}
          {rowsData && rowsData.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-gray-600"
              >
                السابق
              </button>
              <span className="text-sm text-gray-500">
                {page} / {rowsData.totalPages}
              </span>
              <button
                disabled={page >= rowsData.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-gray-600"
              >
                التالي
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "stats" && (
        <>
          {statisticsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-rasid-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {columns.map((col) => (
                <div
                  key={col.name}
                  className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="mb-3 flex items-center gap-2">
                    {getTypeIcon(col.type)}
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                      {col.name}
                    </h4>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      {col.type}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-gray-400">قيم فريدة</dt>
                      <dd className="font-medium text-gray-700 dark:text-gray-300">
                        {col.uniqueCount.toLocaleString("ar-SA")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">قيم فارغة</dt>
                      <dd className="font-medium text-gray-700 dark:text-gray-300">
                        {col.nullCount.toLocaleString("ar-SA")}
                      </dd>
                    </div>
                    {col.min !== undefined && (
                      <div>
                        <dt className="text-gray-400">الأدنى</dt>
                        <dd className="font-medium text-gray-700 dark:text-gray-300">
                          {String(col.min)}
                        </dd>
                      </div>
                    )}
                    {col.max !== undefined && (
                      <div>
                        <dt className="text-gray-400">الأقصى</dt>
                        <dd className="font-medium text-gray-700 dark:text-gray-300">
                          {String(col.max)}
                        </dd>
                      </div>
                    )}
                    {col.mean !== undefined && (
                      <div className="col-span-2">
                        <dt className="text-gray-400">المتوسط</dt>
                        <dd className="font-medium text-gray-700 dark:text-gray-300">
                          {col.mean.toLocaleString("ar-SA", { maximumFractionDigits: 2 })}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {col.sampleValues.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-2 dark:border-gray-700">
                      <p className="mb-1 text-[10px] font-medium text-gray-400">عينة من القيم</p>
                      <div className="flex flex-wrap gap-1">
                        {col.sampleValues.slice(0, 5).map((val, idx) => (
                          <span
                            key={idx}
                            className="inline-block rounded bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                          >
                            {val === null ? "null" : String(val)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {columns.length === 0 && (
                <div className="col-span-full flex flex-col items-center py-12 text-center">
                  <BarChart3 className="mb-3 h-10 w-10 text-gray-300" />
                  <p className="text-sm text-gray-500">لا تتوفر إحصائيات الأعمدة</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
