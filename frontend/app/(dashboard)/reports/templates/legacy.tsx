"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Loader2,
  Search,
  Trash2,
  Eye,
  LayoutGrid,
  Tag,
} from "lucide-react";
import {
  getTemplates,
  createTemplate,
  deleteTemplate,
  getTemplatePreview,
} from "@/lib/api/reporting";
import type { ReportTemplateItem } from "@/lib/api/reporting";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

const createSchema = z.object({
  name: z.string().min(1, "اسم القالب مطلوب"),
  description: z.string().min(1, "الوصف مطلوب"),
  category: z.string().min(1, "التصنيف مطلوب"),
  tags: z.string().optional(),
});

type CreateFormData = z.infer<typeof createSchema>;

export default function TemplateLibraryPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewData, setPreviewData] = useState<{ id: string; content: string } | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["report-template-library", search, categoryFilter],
    queryFn: () =>
      getTemplates({
        search: search || undefined,
        category: categoryFilter || undefined,
      }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description: string; category: string; tags?: string[] }) => createTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-template-library"] });
      setShowCreateModal(false);
      reset();
      toast.success("تم إنشاء القالب بنجاح");
    },
    onError: () => {
      toast.error("فشل إنشاء القالب");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-template-library"] });
      toast.success("تم حذف القالب");
    },
    onError: () => {
      toast.error("فشل حذف القالب");
    },
  });

  const previewMutation = useMutation({
    mutationFn: (id: string) => getTemplatePreview(id),
    onSuccess: (data, id) => {
      setPreviewData({ id, content: data.html });
    },
    onError: () => {
      toast.error("فشل تحميل المعاينة");
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", description: "", category: "", tags: "" },
  });

  const onCreateSubmit = (formData: CreateFormData) => {
    createMutation.mutate({
      name: formData.name,
      description: formData.description,
      category: formData.category,
      tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    });
  };

  const templates: ReportTemplateItem[] = data?.data ?? [];
  const categories: string[] = (data as any)?.categories ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            مكتبة القوالب
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            استعراض وإدارة قوالب التقارير
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          <span>إنشاء قالب</span>
        </button>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="البحث في القوالب..."
            className="input-field ps-9"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="input-field w-full sm:w-48"
        >
          <option value="">كل التصنيفات</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-rasid-600" />
            <p className="text-sm text-gray-500">جاري تحميل القوالب...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            خطأ: {(error as Error)?.message || "تعذر تحميل القوالب"}
          </p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && templates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-20 dark:border-gray-700">
          <LayoutGrid className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            لا توجد قوالب
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            أنشئ أول قالب تقرير
          </p>
        </div>
      )}

      {/* Grid */}
      {!isLoading && !isError && templates.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {template.name}
                  </h3>
                  <span className="mt-1 inline-block rounded-full bg-rasid-50 px-2 py-0.5 text-xs font-medium text-rasid-600 dark:bg-rasid-900/20 dark:text-rasid-400">
                    {template.category}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => previewMutation.mutate(template.id)}
                    disabled={previewMutation.isPending}
                    className="rounded-lg p-1.5 text-rasid-600 hover:bg-rasid-50 dark:text-rasid-400 dark:hover:bg-rasid-900/20"
                    title="معاينة"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(template.id)}
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    title="حذف"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mb-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400 line-clamp-2">
                {template.description}
              </p>
              {template.tags && template.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {template.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      <Modal
        isOpen={!!previewData}
        onClose={() => setPreviewData(null)}
        titleAr="معاينة القالب"
        size="lg"
      >
        {previewData && (
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-gray-700 dark:text-gray-300"
            dangerouslySetInnerHTML={{ __html: previewData.content }}
          />
        )}
      </Modal>

      {/* Create modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        titleAr="إنشاء قالب جديد"
        size="md"
      >
        <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              اسم القالب
            </label>
            <input
              type="text"
              className={`input-field ${errors.name ? "border-red-500" : ""}`}
              placeholder="اسم القالب"
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
              placeholder="وصف القالب..."
              {...register("description")}
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              التصنيف
            </label>
            <input
              type="text"
              className={`input-field ${errors.category ? "border-red-500" : ""}`}
              placeholder="مثال: مالي، إداري، تقني"
              {...register("category")}
            />
            {errors.category && (
              <p className="mt-1 text-xs text-red-600">{errors.category.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              الوسوم (مفصولة بفاصلة)
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="وسم1, وسم2, وسم3"
              {...register("tags")}
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
