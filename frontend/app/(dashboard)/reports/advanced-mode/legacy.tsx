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
  Database,
  PlayCircle,
} from "lucide-react";
import {
  getAdvancedModeReports,
  createAdvancedModeReport,
  deleteAdvancedModeReport,
  executeAdvancedQuery,
} from "@/lib/api/reporting";
import type { AdvancedModeReport, CreateAdvancedModePayload } from "@/lib/api/reporting";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useWorkspaceDraft } from "@/lib/workspaces/use-workspace-draft";
import { buildAdvancedModeReportDefaults } from "@/lib/workspaces/draft-presets";

const createSchema = z.object({
  name: z.string().min(1, "اسم التقرير مطلوب"),
  description: z.string().min(1, "الوصف مطلوب"),
  queryConfig: z.string().min(1, "إعدادات الاستعلام مطلوبة").refine(
    (val) => {
      try { JSON.parse(val); return true; } catch { return false; }
    },
    { message: "يجب أن يكون JSON صالح" }
  ),
  dataSources: z.string().min(1, "مصادر البيانات مطلوبة").refine(
    (val) => {
      try { JSON.parse(val); return true; } catch { return false; }
    },
    { message: "يجب أن يكون JSON صالح" }
  ),
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

export default function AdvancedModeReportsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const reportDraft = useWorkspaceDraft("report");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["advanced-mode-reports", search],
    queryFn: () => getAdvancedModeReports({ search: search || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateAdvancedModePayload) => createAdvancedModeReport(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advanced-mode-reports"] });
      setShowCreateModal(false);
      reset();
      toast.success("تم إنشاء التقرير بنجاح");
    },
    onError: () => {
      toast.error("فشل إنشاء التقرير");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdvancedModeReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advanced-mode-reports"] });
      toast.success("تم حذف التقرير");
    },
    onError: () => {
      toast.error("فشل حذف التقرير");
    },
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => executeAdvancedQuery(id, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advanced-mode-reports"] });
      toast.success("تم تنفيذ الاستعلام بنجاح");
    },
    onError: () => {
      toast.error("فشل تنفيذ الاستعلام");
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", description: "", queryConfig: "", dataSources: "" },
  });

  const onCreateSubmit = (formData: CreateFormData) => {
    createMutation.mutate({
      name: formData.name,
      description: formData.description,
      queryConfig: JSON.parse(formData.queryConfig),
      dataSources: JSON.parse(formData.dataSources),
    });
  };

  const applyDraftToForm = useCallback(() => {
    if (!reportDraft) return;
    const defaults = buildAdvancedModeReportDefaults(reportDraft);
    reset({
      name: defaults.name,
      description: defaults.description,
      queryConfig: defaults.queryConfig,
      dataSources: defaults.dataSources,
    });
  }, [reportDraft, reset]);

  const reports: AdvancedModeReport[] = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            التقارير المتقدمة
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            إنشاء التقارير بالوضع المتقدم مع استعلامات مخصصة
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
              <PlayCircle className="h-4 w-4" />
              <span>إنشاء متقدم من المسودة</span>
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
          تم اكتشاف مسودة مطابقة لتقرير متقدم: {reportDraft.summary}
        </section>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="البحث في التقارير..."
          className="input-field ps-9"
        />
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
          <Database className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            لا توجد تقارير متقدمة
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            أنشئ أول تقرير متقدم مع استعلامات مخصصة
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
                  مصادر البيانات
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
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400">
                        <Database className="h-3.5 w-3.5" />
                        {report.dataSources?.length ?? 0}
                      </span>
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
                          href={`/reports/advanced-mode/${report.id}`}
                          className="rounded-lg p-1.5 text-rasid-600 hover:bg-rasid-50 dark:text-rasid-400 dark:hover:bg-rasid-900/20"
                          title="عرض"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => executeMutation.mutate(report.id)}
                          disabled={executeMutation.isPending}
                          className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                          title="تنفيذ الاستعلام"
                        >
                          <PlayCircle className="h-4 w-4" />
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
        titleAr="إنشاء تقرير متقدم"
        size="lg"
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
              rows={2}
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
              إعدادات الاستعلام (JSON)
            </label>
            <textarea
              rows={5}
              dir="ltr"
              className={`input-field resize-none font-mono text-xs ${errors.queryConfig ? "border-red-500" : ""}`}
              placeholder='{"select": ["*"], "from": "table", "where": {}}'
              {...register("queryConfig")}
            />
            {errors.queryConfig && (
              <p className="mt-1 text-xs text-red-600">{errors.queryConfig.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              مصادر البيانات (JSON)
            </label>
            <textarea
              rows={4}
              dir="ltr"
              className={`input-field resize-none font-mono text-xs ${errors.dataSources ? "border-red-500" : ""}`}
              placeholder='[{"type": "database", "name": "main_db"}]'
              {...register("dataSources")}
            />
            {errors.dataSources && (
              <p className="mt-1 text-xs text-red-600">{errors.dataSources.message}</p>
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
