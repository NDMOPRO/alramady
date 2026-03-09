"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Plus,
  Loader2,
  Search,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  PlayCircle,
  GitCompareArrows,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  getCompareSchedules,
  createCompareSchedule,
  deleteCompareSchedule,
  executeCompareSchedule,
  activateCompareSchedule,
  deactivateCompareSchedule,
} from "@/lib/api/reporting";
import type { CompareSchedule } from "@/lib/api/reporting";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

const createSchema = z.object({
  name: z.string().min(1, "اسم المقارنة مطلوب"),
  reportIdA: z.string().min(1, "التقرير الأول مطلوب"),
  reportIdB: z.string().min(1, "التقرير الثاني مطلوب"),
  comparisonType: z.string().min(1, "نوع المقارنة مطلوب"),
  thresholds: z.string().optional(),
});

type CreateFormData = z.infer<typeof createSchema>;

const COMPARISON_TYPES = [
  { value: "diff", label: "مقارنة الفروقات" },
  { value: "trend", label: "تحليل الاتجاهات" },
  { value: "variance", label: "تحليل التباين" },
  { value: "benchmark", label: "مقارنة معيارية" },
];

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; style: string; label: string }> = {
  PENDING: {
    icon: <Clock className="h-3.5 w-3.5" />,
    style: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
    label: "قيد الانتظار",
  },
  COMPLETED: {
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    style: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    label: "مكتمل",
  },
  RUNNING: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    style: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    label: "قيد التنفيذ",
  },
};

export default function CompareScheduleListPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["compare-schedules", search],
    queryFn: () => getCompareSchedules({ search: search || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; reportIdA: string; reportIdB: string; comparisonType: string; thresholds?: Record<string, unknown> }) => createCompareSchedule(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compare-schedules"] });
      setShowCreateModal(false);
      reset();
      toast.success("تم إنشاء المقارنة بنجاح");
    },
    onError: () => {
      toast.error("فشل إنشاء المقارنة");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCompareSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compare-schedules"] });
      toast.success("تم حذف المقارنة");
    },
    onError: () => {
      toast.error("فشل حذف المقارنة");
    },
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => executeCompareSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compare-schedules"] });
      toast.success("تم تنفيذ المقارنة بنجاح");
    },
    onError: () => {
      toast.error("فشل تنفيذ المقارنة");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? activateCompareSchedule(id) : deactivateCompareSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compare-schedules"] });
      toast.success("تم تحديث الحالة");
    },
    onError: () => {
      toast.error("فشل تحديث الحالة");
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", reportIdA: "", reportIdB: "", comparisonType: "", thresholds: "" },
  });

  const onCreateSubmit = (formData: CreateFormData) => {
    let parsedThresholds = {};
    if (formData.thresholds) {
      try { parsedThresholds = JSON.parse(formData.thresholds); } catch { /* ignore */ }
    }
    createMutation.mutate({
      name: formData.name,
      reportIdA: formData.reportIdA,
      reportIdB: formData.reportIdB,
      comparisonType: formData.comparisonType,
      thresholds: parsedThresholds,
    });
  };

  const schedules: CompareSchedule[] = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            مقارنة التقارير
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            جدولة وإدارة مقارنات التقارير
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          <span>إنشاء مقارنة</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="البحث في المقارنات..."
          className="input-field ps-9"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-rasid-600" />
            <p className="text-sm text-gray-500">جاري تحميل المقارنات...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            خطأ: {(error as Error)?.message || "تعذر تحميل المقارنات"}
          </p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && schedules.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-20 dark:border-gray-700">
          <GitCompareArrows className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            لا توجد مقارنات
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            أنشئ أول مقارنة بين تقريرين
          </p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && schedules.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  الاسم
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  التقرير أ
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  التقرير ب
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  النوع
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  الحالة
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  مفعّل
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  آخر تنفيذ
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  إجراءات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {schedules.map((schedule) => {
                const statusConfig = STATUS_CONFIG[schedule.status] || STATUS_CONFIG.PENDING;
                return (
                  <tr
                    key={schedule.id}
                    className="bg-white transition-colors hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {schedule.name}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {schedule.reportIdA}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {schedule.reportIdB}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {COMPARISON_TYPES.find((t) => t.value === schedule.comparisonType)?.label ||
                        schedule.comparisonType}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig.style}`}
                      >
                        {statusConfig.icon}
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          toggleMutation.mutate({
                            id: schedule.id,
                            active: !schedule.isActive,
                          })
                        }
                        disabled={toggleMutation.isPending}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        {schedule.isActive ? (
                          <ToggleRight className="h-6 w-6 text-green-500" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-gray-400" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {schedule.lastExecutedAt ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(schedule.lastExecutedAt).toLocaleDateString("ar-SA")}
                        </span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">لم يُنفّذ بعد</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {schedule.resultData && (
                          <Link
                            href={`/reports/compare/${schedule.id}/results`}
                            className="rounded-lg p-1.5 text-rasid-600 hover:bg-rasid-50 dark:text-rasid-400 dark:hover:bg-rasid-900/20"
                            title="عرض النتائج"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        )}
                        <button
                          onClick={() => executeMutation.mutate(schedule.id)}
                          disabled={executeMutation.isPending}
                          className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                          title="تنفيذ"
                        >
                          <PlayCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(schedule.id)}
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
        titleAr="إنشاء مقارنة جديدة"
        size="md"
      >
        <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              اسم المقارنة
            </label>
            <input
              type="text"
              className={`input-field ${errors.name ? "border-red-500" : ""}`}
              placeholder="اسم المقارنة"
              {...register("name")}
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              معرّف التقرير الأول
            </label>
            <input
              type="text"
              dir="ltr"
              className={`input-field ${errors.reportIdA ? "border-red-500" : ""}`}
              placeholder="Report A ID"
              {...register("reportIdA")}
            />
            {errors.reportIdA && (
              <p className="mt-1 text-xs text-red-600">{errors.reportIdA.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              معرّف التقرير الثاني
            </label>
            <input
              type="text"
              dir="ltr"
              className={`input-field ${errors.reportIdB ? "border-red-500" : ""}`}
              placeholder="Report B ID"
              {...register("reportIdB")}
            />
            {errors.reportIdB && (
              <p className="mt-1 text-xs text-red-600">{errors.reportIdB.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              نوع المقارنة
            </label>
            <select
              className={`input-field ${errors.comparisonType ? "border-red-500" : ""}`}
              {...register("comparisonType")}
            >
              <option value="">اختر نوع المقارنة...</option>
              {COMPARISON_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
            {errors.comparisonType && (
              <p className="mt-1 text-xs text-red-600">{errors.comparisonType.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              الحدود (JSON - اختياري)
            </label>
            <textarea
              rows={3}
              dir="ltr"
              className="input-field resize-none font-mono text-xs"
              placeholder='{"varianceThreshold": 0.05, "significanceLevel": 0.01}'
              {...register("thresholds")}
            />
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
