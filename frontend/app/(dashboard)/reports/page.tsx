"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react";
import { getDatasets, getDatasetById, getDatasetRows, type Dataset } from "@/lib/api/data";
import EmbeddedRasidAssistant, {
  type EmbeddedAssistantAction,
} from "@/components/assistant/EmbeddedRasidAssistant";
import CompactSurfaceHeader from "@/components/layout/CompactSurfaceHeader";
import {
  addReportSection,
  buildReport,
  createReport,
  exportReport,
  getReportById,
  getReports,
  setReportSchedule,
  type Report,
  type ReportBuildResult,
  type ReportDetail,
  type ReportOutput,
} from "@/lib/api/reporting";

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: "مسودة", className: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" },
  generating: { label: "قيد البناء", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  ready: { label: "جاهز", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  scheduled: { label: "مجدول", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  error: { label: "خطأ", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

const exportFormats: ReportOutput["format"][] = ["html", "pdf", "docx", "xlsx"];

function extractErrorMessage(error: unknown): string {
  return (
    (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ||
    (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message ||
    (error as Error)?.message ||
    "فشل تنفيذ العملية من reporting-service."
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "غير متوفر";
  return new Date(value).toLocaleString("ar-SA");
}

export default function ReportsWorkspacePage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(null);
  const [latestBuild, setLatestBuild] = useState<ReportBuildResult | null>(null);
  const [reportName, setReportName] = useState("تقرير أداء المناطق");
  const [recipientEmail, setRecipientEmail] = useState("ops@example.com");
  const [cronExpression, setCronExpression] = useState("0 8 * * 1");
  const [scheduleFormat, setScheduleFormat] = useState<"pdf" | "docx" | "html">("pdf");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [building, setBuilding] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ReportOutput["format"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId]
  );
  const assistantActions = useMemo<EmbeddedAssistantAction[]>(
    () => [
      {
        id: "refresh-reports",
        label: "تحديث التقارير",
        description: "يعيد قراءة التقارير والمصادر من reporting-service وdata-service.",
        keywords: ["تحديث التقارير", "حدث التقارير", "اعد تحميل التقارير", "جدد التقارير"],
        run: async () => {
          const snapshot = await refreshSurface(selectedReportId || undefined);
          return {
            message: `تم تحديث Surface التقارير. يوجد الآن ${snapshot.reportCount} تقرير و${snapshot.datasetCount} مصدر متاح.`,
            chips: [`التقارير ${snapshot.reportCount}`, `المصادر ${snapshot.datasetCount}`],
          };
        },
      },
      {
        id: "create-build-report",
        label: "أنشئ وابنِ التقرير الحالي",
        description: "ينفذ إنشاء تقرير جديد ثم يضيف الأقسام ويبني المخرجات الفعلية.",
        keywords: ["انشئ تقرير", "ابن التقرير", "انشاء وبناء", "تقرير جديد"],
        run: async () => {
          if (!selectedDatasetId || !reportName.trim()) {
            throw new Error("اسم التقرير ومجموعة البيانات مطلوبان قبل الإنشاء.");
          }

          await handleCreateAndBuildReport();
          return {
            message: `تم تمرير طلب إنشاء وبناء التقرير ${reportName} عبر reporting-service.`,
            chips: [selectedDataset?.name ?? "بدون مصدر محدد"],
          };
        },
      },
      {
        id: "rebuild-selected-report",
        label: "أعد بناء التقرير المحدد",
        description: "يشغّل بناء التقرير المحدد ويحدّث المخرجات في السطح نفسه.",
        keywords: ["اعد البناء", "ابن التقرير المحدد", "اعاده بناء التقرير"],
        run: async () => {
          if (!selectedReportId) {
            throw new Error("لا يوجد تقرير محدد لإعادة بنائه.");
          }

          await handleBuildSelectedReport();
          return {
            message: `تم تشغيل إعادة البناء على ${selectedReport?.name ?? "التقرير المحدد"}.`,
          };
        },
      },
      {
        id: "export-selected-pdf",
        label: "صدّر PDF للتقرير المحدد",
        description: "يطلب المخرج الفعلي بصيغة PDF من reporting-service.",
        keywords: ["صدر pdf", "تصدير pdf", "نزل pdf", "export pdf"],
        run: async () => {
          if (!selectedReportId) {
            throw new Error("لا يوجد تقرير محدد للتصدير.");
          }

          await handleExport("pdf");
          return {
            message: `تم طلب تصدير PDF للتقرير ${selectedReport?.name ?? selectedReportId}.`,
          };
        },
      },
      {
        id: "save-schedule",
        label: "احفظ الجدولة الحالية",
        description: "يحفظ cron والبريد والصيغة الحالية في report_schedules.",
        keywords: ["احفظ الجدوله", "حفظ الجدوله", "جدوله التقرير", "schedule"],
        run: async () => {
          if (!selectedReportId) {
            throw new Error("لا يوجد تقرير محدد للجدولة.");
          }

          await handleSchedule();
          return {
            message: "تم تمرير حفظ الجدولة الحالية إلى reporting-service.",
            chips: [cronExpression, recipientEmail, scheduleFormat.toUpperCase()],
          };
        },
      },
    ],
    [
      cronExpression,
      datasets.length,
      recipientEmail,
      reportName,
      reports.length,
      scheduleFormat,
      selectedDatasetId,
      selectedDataset,
      selectedReport?.name,
      selectedReportId,
    ]
  );

  async function loadReportsList(preferredReportId?: string) {
    const result = await getReports({ page: 1, pageSize: 12 });
    setReports(result.data);

    const nextReportId =
      preferredReportId ||
      selectedReportId ||
      result.data[0]?.id ||
      "";

    if (nextReportId) {
      setSelectedReportId(nextReportId);
      const detail = await getReportById(nextReportId);
      setSelectedReport(detail);
      return {
        reports: result.data,
        selectedReport: detail,
      };
    } else {
      setSelectedReportId("");
      setSelectedReport(null);
      return {
        reports: result.data,
        selectedReport: null,
      };
    }
  }

  async function refreshSurface(preferredReportId?: string) {
    setError(null);
    const [datasetsResult, reportsResult] = await Promise.all([
      getDatasets({ page: 1, pageSize: 12 }),
      loadReportsList(preferredReportId),
    ]);
    setDatasets(datasetsResult.data);
    const nextDatasetId = selectedDatasetId || datasetsResult.data[0]?.id || "";
    if (nextDatasetId) {
      setSelectedDatasetId(nextDatasetId);
    }
    return {
      datasetCount: datasetsResult.data.length,
      reportCount: reportsResult.reports.length,
      selectedReportName: reportsResult.selectedReport?.name ?? null,
    };
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        await refreshSurface();
      } catch (loadError) {
        setError(extractErrorMessage(loadError));
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  async function handleSelectReport(reportId: string) {
    setError(null);
    try {
      setSelectedReportId(reportId);
      const detail = await getReportById(reportId);
      setSelectedReport(detail);
      setLatestBuild(null);
    } catch (selectionError) {
      setError(extractErrorMessage(selectionError));
    }
  }

  async function handleCreateAndBuildReport() {
    if (!reportName.trim() || !selectedDatasetId) {
      setError("اسم التقرير ومجموعة البيانات مطلوبان.");
      return;
    }

    setCreating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const [datasetDetail, datasetRows] = await Promise.all([
        getDatasetById(selectedDatasetId),
        getDatasetRows(selectedDatasetId, { page: 1, pageSize: 20 }),
      ]);

      const created = await createReport({
        name: reportName.trim(),
        templateId: null,
        dataSources: [{ datasetId: selectedDatasetId }],
      });

      const columns = datasetDetail.columns.map((column) => column.name);
      const previewRows = datasetRows.data.map((row) =>
        columns.map((columnName) => {
          const value = row[columnName];
          if (value === null || value === undefined) return "";
          return String(value);
        })
      );

      await addReportSection(created.id, {
        type: "text",
        position: 0,
        content: {
          title: "ملخص المصدر",
          text: `تم ربط التقرير بالمجموعة ${datasetDetail.name} بعدد ${datasetDetail.rowCount} صف و${datasetDetail.columnCount} عمود.`,
        },
      });

      await addReportSection(created.id, {
        type: "table",
        position: 1,
        content: {
          title: "معاينة البيانات",
          datasetId: selectedDatasetId,
          columns,
          rows: previewRows,
        },
      });

      const buildResult = await buildReport(created.id);
      setLatestBuild(buildResult);
      await loadReportsList(created.id);
      setSuccessMessage(`تم إنشاء التقرير وبناؤه فعليًا عبر reporting-service: ${created.name}`);
    } catch (creationError) {
      setError(extractErrorMessage(creationError));
    } finally {
      setCreating(false);
    }
  }

  async function handleBuildSelectedReport() {
    if (!selectedReportId) return;

    setBuilding(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await buildReport(selectedReportId);
      setLatestBuild(result);
      const detail = await getReportById(selectedReportId);
      setSelectedReport(detail);
      await loadReportsList(selectedReportId);
      setSuccessMessage(`تم بناء التقرير ${detail.name} بنجاح.`);
    } catch (buildError) {
      setError(extractErrorMessage(buildError));
    } finally {
      setBuilding(false);
    }
  }

  async function handleExport(format: ReportOutput["format"]) {
    if (!selectedReportId || !selectedReport) return;

    setExportingFormat(format);
    setError(null);
    setSuccessMessage(null);

    try {
      const blob = await exportReport(selectedReportId, format);
      downloadBlob(blob, `${selectedReport.name}.${format === "docx" ? "docx" : format === "xlsx" ? "xls" : format}`);
      const detail = await getReportById(selectedReportId);
      setSelectedReport(detail);
      setSuccessMessage(`تم تصدير التقرير بصيغة ${format.toUpperCase()}.`);
    } catch (exportError) {
      setError(extractErrorMessage(exportError));
    } finally {
      setExportingFormat(null);
    }
  }

  async function handleSchedule() {
    if (!selectedReportId) return;

    setScheduling(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await setReportSchedule(selectedReportId, {
        cronExpression,
        recipients: [recipientEmail],
        format: scheduleFormat,
      });
      const detail = await getReportById(selectedReportId);
      setSelectedReport(detail);
      await loadReportsList(selectedReportId);
      setSuccessMessage("تم حفظ الجدولة عبر reporting-service.");
    } catch (scheduleError) {
      setError(extractErrorMessage(scheduleError));
    } finally {
      setScheduling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center" dir="rtl">
        <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="rased-surface-page" dir="rtl">
      <CompactSurfaceHeader
        badge="التقارير"
        title="التقرير الحالي ثم الإجراء التالي"
        description="التركيز هنا على تقرير واحد: إنشاؤه أو بناؤه أو تصديره. ما عدا ذلك يبقى ثانويًا."
        accentClassName="border-amber-200 bg-amber-50 text-amber-800"
        metrics={[
          { label: "التقارير", value: String(reports.length) },
          { label: "المصادر", value: String(datasets.length) },
          { label: "المخرجات", value: String(selectedReport?.outputs.length ?? 0) },
        ]}
      />

      <EmbeddedRasidAssistant
        surfaceId="reports"
        surfaceName="مساحة التقارير التنفيذية"
        route="/reports"
        intro="أتابع التقرير والمصدر المحددين وأستطيع تشغيل البناء والتصدير والجدولة من نفس السطح."
        contextSummary={
          selectedReport
            ? `التقرير المحدد الآن هو ${selectedReport.name} وحالته ${statusLabels[selectedReport.status]?.label ?? selectedReport.status}.`
            : "لا يوجد تقرير محدد الآن، ويمكنني إنشاء تقرير جديد من المصدر الحالي أو تحديث القائمة."
        }
        contextItems={[
          { label: "التقارير", value: String(reports.length) },
          { label: "المصادر", value: String(datasets.length) },
          { label: "المصدر الحالي", value: selectedDataset?.name ?? "غير محدد" },
          { label: "التقرير الحالي", value: selectedReport?.name ?? "غير محدد" },
        ]}
        actions={assistantActions}
        suggestedPrompts={[
          "ماذا يمكنك أن تفعل هنا؟",
          "أنشئ وابنِ التقرير الحالي",
          "صدّر PDF للتقرير المحدد",
          "احفظ الجدولة الحالية",
        ]}
      />

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rased-panel rased-motion-stagger-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">إنشاء تقرير جديد وبناؤه</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                ينفذ `POST /reports`, `POST /reports/:id/sections`, ثم `POST /reports/:id/build`.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshSurface(selectedReportId)}
              className="rased-action-secondary text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>تحديث</span>
            </button>
          </div>

          <div className="mt-5 grid gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">اسم التقرير</label>
              <input
                value={reportName}
                onChange={(event) => setReportName(event.target.value)}
                data-testid="reports-name-input"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">مجموعة البيانات</label>
              <select
                value={selectedDatasetId}
                onChange={(event) => setSelectedDatasetId(event.target.value)}
                data-testid="reports-dataset-select"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              >
                <option value="">اختر مجموعة بيانات</option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name} ({dataset.format.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {selectedDataset && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                {selectedDataset.name} • {selectedDataset.rowCount} صف • {selectedDataset.columnCount} عمود
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleCreateAndBuildReport()}
              disabled={creating || !selectedDatasetId || !reportName.trim()}
              data-testid="reports-create-build"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span>{creating ? "جاري الإنشاء والبناء" : "إنشاء وبناء التقرير"}</span>
            </button>
          </div>
        </div>

        <div className="rased-panel rased-motion-stagger-2">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">التقارير الحالية</h2>
          <div className="mt-4 space-y-3">
            {reports.map((report) => {
              const status = statusLabels[report.status] ?? statusLabels.draft;
              const active = report.id === selectedReportId;
              return (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => void handleSelectReport(report.id)}
                  data-testid={`reports-card-${report.id}`}
                  className={`w-full rounded-2xl border p-4 text-right transition ${
                    active
                      ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20"
                      : "border-gray-200 bg-gray-50 hover:border-amber-200 dark:border-gray-700 dark:bg-gray-900/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{report.name}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        آخر بناء: {formatDate(report.lastGenerated)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {error && (
        <section className="rased-status-error">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{error}</span>
          </div>
        </section>
      )}

      {successMessage && (
        <section className="rased-status-success">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
            <span>{successMessage}</span>
          </div>
        </section>
      )}

      {selectedReport && (
        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rased-panel">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedReport.name}</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {selectedReport.description || "تقرير مربوط بمصدر بيانات فعلي من الخدمة."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleBuildSelectedReport()}
                  disabled={building}
                  data-testid="reports-build-selected"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span>{building ? "جاري البناء" : "إعادة البناء"}</span>
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-700">
                  <p className="text-2xl font-black text-gray-900 dark:text-white">{selectedReport.sections.length}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">أقسام معرفة</p>
                </div>
                <div className="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-700">
                  <p className="text-2xl font-black text-gray-900 dark:text-white">{selectedReport.outputs.length}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">مخرجات متاحة</p>
                </div>
                <div className="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-700">
                  <p className="text-2xl font-black text-gray-900 dark:text-white">{selectedReport.schedules?.length ?? 0}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">جداول محفوظة</p>
                </div>
              </div>

              {latestBuild && latestBuild.reportId === selectedReport.id && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                  buildId: {latestBuild.buildId} • duration: {latestBuild.duration}ms • sections: {latestBuild.sectionCount}
                </div>
              )}
            </div>

            <div className="rased-panel">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">المخرجات الفعلية</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {exportFormats.map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => void handleExport(format)}
                    disabled={exportingFormat !== null}
                    data-testid={`reports-export-${format}`}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-4 text-sm font-bold text-gray-800 transition hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-amber-900/10"
                  >
                    {exportingFormat === format ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    <span>{format.toUpperCase()}</span>
                  </button>
                ))}
              </div>

              {selectedReport.outputs.length > 0 && (
                <div className="mt-5 space-y-2">
                  {selectedReport.outputs.map((output) => (
                    <div
                      key={output.id}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-200"
                    >
                      {output.format.toUpperCase()} • {output.fileSize} bytes • {formatDate(output.generatedAt)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <details className="rased-details">
              <summary className="rased-summary">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">أقسام التقرير</h3>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                  {selectedReport.sections.length} قسم
                </span>
              </summary>
              <div className="mt-4 space-y-3">
                {selectedReport.sections.map((section) => (
                  <div key={section.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{section.titleAr || section.title}</p>
                      <span className="text-xs text-gray-400">{section.type}</span>
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap text-xs leading-6 text-gray-600 dark:text-gray-300">
                      {section.content}
                    </pre>
                  </div>
                ))}
              </div>
            </details>
          </div>

          <details className="rased-details">
            <summary className="rased-summary mb-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">جدولة التقرير</h3>
              </div>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                {selectedReport.schedules?.length ?? 0} جدول
              </span>
            </summary>

            <div className="grid gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">البريد المستلم</label>
                <input
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  data-testid="reports-schedule-email"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Cron</label>
                <input
                  value={cronExpression}
                  onChange={(event) => setCronExpression(event.target.value)}
                  data-testid="reports-schedule-cron"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-left font-mono text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">صيغة الجدولة</label>
                <select
                  value={scheduleFormat}
                  onChange={(event) => setScheduleFormat(event.target.value as "pdf" | "docx" | "html")}
                  data-testid="reports-schedule-format"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                >
                  <option value="pdf">PDF</option>
                  <option value="docx">DOCX</option>
                  <option value="html">HTML</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => void handleSchedule()}
                disabled={scheduling}
                data-testid="reports-schedule-save"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>{scheduling ? "جاري الحفظ" : "حفظ الجدولة"}</span>
              </button>
            </div>

            {(selectedReport.schedules?.length ?? 0) > 0 && (
              <div className="mt-5 space-y-3">
                {selectedReport.schedules?.map((schedule) => (
                  <div key={schedule.id} className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                    {schedule.cronExpression} • {schedule.format.toUpperCase()} • {schedule.recipients.join(", ")}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs leading-6 text-gray-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400">
              إنشاء الجدولة ينفذ `POST /api/v1/reporting/reports/:id/schedule` مباشرة ويُحفظ في `report_schedules`.
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
