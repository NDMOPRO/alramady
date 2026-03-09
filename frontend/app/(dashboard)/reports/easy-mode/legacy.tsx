"use client";

import React, { useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Plus,
  FileText,
  Loader2,
  Search,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  Play,
  Wand2,
} from "lucide-react";
import {
  getEasyModeReports,
  createEasyModeReport,
  deleteEasyModeReport,
  autoComposeEasyModeReport,
  getReportTypes,
} from "@/lib/api/reporting";
import type { EasyModeReport, CreateEasyModePayload } from "@/lib/api/reporting";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useWorkspaceDraft } from "@/lib/workspaces/use-workspace-draft";
import { buildEasyModeReportDefaults } from "@/lib/workspaces/draft-presets";

const createSchema = z.object({
  name: z.string().min(1, "اسم التقرير مطلوب"),
  description: z.string().min(1, "الوصف مطلوب"),
  reportType: z.string().min(1, "نوع التقرير مطلوب"),
  outputFormat: z.string().min(1, "صيغة الإخراج مطلوبة"),
  datasetId: z.string().min(1, "مجموعة البيانات مطلوبة"),
});

type CreateFormData = z.infer<typeof createSchema>;

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; style: string; label: string }> = {
  DRAFT: {
    icon: <FileText className="h-3.5 w-3.5" />,
    style: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
    label: "مسودة",
  },
  COMPLETED: {
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    style: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    label: "مكتمل",
  },
  GENERATING: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    style: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    label: "قيد الإنشاء",
  },
};

const OUTPUT_FORMAT_OPTIONS = [
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "Word" },
  { value: "html", label: "HTML" },
  { value: "xlsx", label: "Excel" },
];

export default function EasyModeReportsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const reportDraft = useWorkspaceDraft("report");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["easy-mode-reports", search, typeFilter],
    queryFn: () =>
      getEasyModeReports({
        search: search || undefined,
        reportType: typeFilter || undefined,
      }),
  });

  const { data: reportTypes } = useQuery({
    queryKey: ["report-types"],
    queryFn: () => getReportTypes(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateEasyModePayload) => createEasyModeReport(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["easy-mode-reports"] });
      setShowCreateModal(false);
      reset();
      toast.success("تم إنشاء التقرير بنجاح");
    },
    onError: () => {
      toast.error("فشل إنشاء التقرير");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEasyModeReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["easy-mode-reports"] });
      toast.success("تم حذف التقرير");
    },
    onError: () => {
      toast.error("فشل حذف التقرير");
    },
  });

  const autoComposeMutation = useMutation({
    mutationFn: (id: string) => autoComposeEasyModeReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["easy-mode-reports"] });
      toast.success("تم تركيب التقرير تلقائياً");
    },
    onError: () => {
      toast.error("فشل التركيب التلقائي");
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", description: "", reportType: "", outputFormat: "", datasetId: "" },
  });

  const onCreateSubmit = (formData: CreateFormData) => {
    createMutation.mutate(formData);
  };

  const applyDraftToForm = useCallback(() => {
    if (!reportDraft) return;
    const defaults = buildEasyModeReportDefaults(reportDraft, reportTypes?.[0]?.id ?? "");
    reset({
      name: defaults.name ?? "",
      description: defaults.description ?? "",
      reportType: defaults.reportType ?? "",
      outputFormat: defaults.outputFormat ?? "",
      datasetId: defaults.datasetId ?? "",
    });
  }, [reportDraft, reportTypes, reset]);

  const reports: EasyModeReport[] = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            التقارير السريعة
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            إنشاء التقارير بالوضع السهل
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {reportDraft && (
            <button
              onClick={() => {
                applyDraftToForm();
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300"
            >
              <Wand2 className="h-4 w-4" />
              <span>إنشاء من مسودة المطابقة</span>
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            <span>إنشاء تقرير</span>
          </button>
        </div>
      </div>

      {reportDraft && (
        <section className="rounded-xl border border-cyan-200 bg-cyan-50/70 px-4 py-3 text-xs text-cyan-800 dark:border-cyan-900/40 dark:bg-cyan-900/20 dark:text-cyan-300">
          Artifact {reportDraft.artifactId} جاهز للتحويل إلى تقرير سريع. يمكنك تشغيل الإنشاء المباشر من الزر أعلاه.
        </section>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="البحث في التقارير..."
            className="input-field ps-9"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="input-field w-full sm:w-48"
        >
          <option value="">كل الأنواع</option>
          {(reportTypes ?? []).map((rt) => (
            <option key={rt.id} value={rt.id}>
              {rt.nameAr || rt.name}
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-rasid-600" />
            <p className="text-sm text-gray-500">جاري تحميل التقارير...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            خطأ: {(error as Error)?.message || "تعذر تحميل التقارير"}
          </p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && reports.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-20 dark:border-gray-700">
          <FileText className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            لا توجد تقارير
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            أنشئ أول تقرير سريع
          </p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && reports.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  الاسم
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  النوع
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  الصيغة
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  الحالة
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  تاريخ الإنشاء
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  إجراءات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {reports.map((report) => {
                const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;
                return (
                  <tr
                    key={report.id}
                    className="bg-white transition-colors hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {report.name}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">{report.description}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {report.reportType}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 uppercase">
                      {report.outputFormat}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig.style}`}
                      >
                        {statusConfig.icon}
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(report.createdAt).toLocaleDateString("ar-SA")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/reports/easy-mode/${report.id}`}
                          className="rounded-lg p-1.5 text-rasid-600 hover:bg-rasid-50 dark:text-rasid-400 dark:hover:bg-rasid-900/20"
                          title="عرض"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => autoComposeMutation.mutate(report.id)}
                          disabled={autoComposeMutation.isPending}
                          className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                          title="تركيب تلقائي"
                        >
                          <Wand2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(report.id)}
                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                          title="حذف"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        titleAr="إنشاء تقرير سريع"
        size="md"
      >
        <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              اسم التقرير
            </label>
            <input
              type="text"
              className={`input-field ${errors.name ? "border-red-500" : ""}`}
              placeholder="اسم التقرير"
              {...register("name")}
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              الوصف
            </label>
            <textarea
              rows={3}
              className={`input-field resize-none ${errors.description ? "border-red-500" : ""}`}
              placeholder="وصف التقرير..."
              {...register("description")}
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              نوع التقرير
            </label>
            <select
              className={`input-field ${errors.reportType ? "border-red-500" : ""}`}
              {...register("reportType")}
            >
              <option value="">اختر نوع التقرير...</option>
              {(reportTypes ?? []).map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.nameAr || rt.name}
                </option>
              ))}
            </select>
            {errors.reportType && (
              <p className="mt-1 text-xs text-red-600">{errors.reportType.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              صيغة الإخراج
            </label>
            <select
              className={`input-field ${errors.outputFormat ? "border-red-500" : ""}`}
              {...register("outputFormat")}
            >
              <option value="">اختر الصيغة...</option>
              {OUTPUT_FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors.outputFormat && (
              <p className="mt-1 text-xs text-red-600">{errors.outputFormat.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              مجموعة البيانات
            </label>
            <input
              type="text"
              className={`input-field ${errors.datasetId ? "border-red-500" : ""}`}
              placeholder="معرّف مجموعة البيانات"
              dir="ltr"
              {...register("datasetId")}
            />
            {errors.datasetId && (
              <p className="mt-1 text-xs text-red-600">{errors.datasetId.message}</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>إنشاء</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
