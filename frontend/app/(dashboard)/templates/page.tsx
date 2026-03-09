'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Star,
  Users,
  Loader2,
  AlertCircle,
  LayoutTemplate,
  Crown,
  Search,
  Filter,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import {
  fetchTemplates,
  fetchTemplateCategories,
  createTemplate,
  rateTemplate,
  type Template,
} from '@/lib/api/template';

const typeLabels: Record<string, string> = {
  presentation: 'عرض تقديمي',
  infographic: 'إنفوجرافيك',
  report: 'تقرير',
  dashboard: 'لوحة بيانات',
};

const typeColors: Record<string, string> = {
  presentation: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  infographic: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  report: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  dashboard: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

function StarRating({ rating, onRate }: { rating: number; onRate?: (val: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((val) => (
        <button
          key={val}
          onClick={() => onRate?.(val)}
          disabled={!onRate}
          className={`${onRate ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <Star
            className={`h-3.5 w-3.5 ${val <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
          />
        </button>
      ))}
    </div>
  );
}

export default function TemplatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNameAr, setNewNameAr] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDescAr, setNewDescAr] = useState('');
  const [newType, setNewType] = useState<Template['type']>('presentation');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['templates', search, filterType, filterCategory],
    queryFn: () => fetchTemplates({ search, type: filterType || undefined, category: filterCategory || undefined, limit: 50 }),
  });

  const { data: categories } = useQuery({
    queryKey: ['template-categories'],
    queryFn: fetchTemplateCategories,
  });

  const createMutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setShowCreateModal(false);
      setNewName('');
      setNewNameAr('');
      setNewDesc('');
      setNewDescAr('');
    },
  });

  const rateMutation = useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number }) => rateTemplate(id, rating),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });

  const templates = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-fuchsia-500 via-purple-500 to-violet-600 px-8 py-8">
        <div className="pointer-events-none absolute -left-20 -top-20 h-60 w-60 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
              <LayoutTemplate className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                معرض القوالب
              </h1>
              <p className="mt-0.5 text-sm font-medium text-white/70">
                Template Gallery
              </p>
            </div>
          </div>
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-purple-700 shadow-lg shadow-purple-900/30 transition-all hover:shadow-xl hover:shadow-purple-900/40">
            <Plus className="h-4 w-4" />
            إنشاء قالب جديد
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في القوالب..." className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pe-4 ps-10 text-sm placeholder-gray-400 focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <option value="">جميع الأنواع</option>
          <option value="presentation">عرض تقديمي</option>
          <option value="infographic">إنفوجرافيك</option>
          <option value="report">تقرير</option>
          <option value="dashboard">لوحة بيانات</option>
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <option value="">جميع الفئات</option>
          {(categories ?? []).map((cat) => (
            <option key={cat.id} value={cat.name}>{cat.nameAr}</option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-rasid-600" />
          <span className="ms-3 text-gray-500">جاري التحميل...</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-red-200 bg-red-50 py-12 dark:border-red-800 dark:bg-red-900/20">
          <AlertCircle className="h-10 w-10 text-red-500" />
          <p className="text-sm text-red-700 dark:text-red-400">{error instanceof Error ? error.message : 'حدث خطأ'}</p>
          <button onClick={() => refetch()} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">إعادة المحاولة</button>
        </div>
      )}

      {!isLoading && !isError && templates.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20">
          <LayoutTemplate className="h-16 w-16 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400">لا توجد قوالب</p>
        </div>
      )}

      {!isLoading && !isError && templates.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {templates.map((t: Template) => (
            <div key={t.id} className="group rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
              <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-gray-100 dark:bg-gray-700">
                {t.thumbnailUrl ? (
                  <img src={t.thumbnailUrl} alt={t.nameAr} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <LayoutTemplate className="h-10 w-10 text-gray-300 dark:text-gray-500" />
                  </div>
                )}
                {t.isPremium && (
                  <div className="absolute end-2 top-2 rounded-full bg-yellow-400 p-1.5">
                    <Crown className="h-3.5 w-3.5 text-yellow-900" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[t.type]}`}>{typeLabels[t.type]}</span>
                  <StarRating rating={t.rating} onRate={(val) => rateMutation.mutate({ id: t.id, rating: val })} />
                </div>
                <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{t.nameAr}</h3>
                <p className="mb-3 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{t.descriptionAr}</p>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                    <Users className="h-3.5 w-3.5" />
                    {t.usageCount} استخدام
                  </span>
                  <button
                    onClick={() => router.push(`/presentations?templateId=${t.id}`)}
                    className="rounded-lg bg-rasid-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rasid-700"
                  >
                    استخدام القالب
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} titleAr="إنشاء قالب جديد" size="lg" footer={
        <>
          <button onClick={() => setShowCreateModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">إلغاء</button>
          <button onClick={() => createMutation.mutate({ name: newName, nameAr: newNameAr, description: newDesc, descriptionAr: newDescAr, type: newType, category: '', categoryAr: '', tags: [] })} disabled={createMutation.isPending || !newNameAr.trim()} className="inline-flex items-center gap-2 rounded-lg bg-rasid-600 px-4 py-2 text-sm text-white hover:bg-rasid-700 disabled:opacity-50">
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            إنشاء
          </button>
        </>
      }>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">الاسم (عربي)</label>
            <input value={newNameAr} onChange={(e) => setNewNameAr(e.target.value)} placeholder="اسم القالب" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name (English)</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Template name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">الوصف (عربي)</label>
            <textarea value={newDescAr} onChange={(e) => setNewDescAr(e.target.value)} placeholder="وصف القالب" rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description (English)</label>
            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Template description" rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">النوع</label>
            <select value={newType} onChange={(e) => setNewType(e.target.value as Template['type'])} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="presentation">عرض تقديمي</option>
              <option value="infographic">إنفوجرافيك</option>
              <option value="report">تقرير</option>
              <option value="dashboard">لوحة بيانات</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
