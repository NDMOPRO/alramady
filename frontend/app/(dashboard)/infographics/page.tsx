'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Sparkles,
  Image,
  Calendar,
  Loader2,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import Modal from '@/components/ui/Modal';
import {
  fetchInfographics,
  createInfographic,
  aiGenerateInfographic,
  deleteInfographic,
  type Infographic,
} from '@/lib/api/infographic';

const statusColors: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  published: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  archived: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const statusLabels: Record<string, string> = {
  draft: 'مسودة',
  published: 'منشور',
  archived: 'مؤرشف',
};

export default function InfographicsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [aiStyle, setAiStyle] = useState('modern');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['infographics', search],
    queryFn: () => fetchInfographics({ search, limit: 50 }),
  });

  const createMutation = useMutation({
    mutationFn: createInfographic,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['infographics'] });
      setShowCreateModal(false);
      setNewName('');
      setNewDesc('');
      router.push(`/infographics/${created.id}`);
    },
  });

  const aiMutation = useMutation({
    mutationFn: aiGenerateInfographic,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['infographics'] });
      setShowAiModal(false);
      setAiTopic('');
      router.push(`/infographics/${created.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInfographic,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['infographics'] }),
  });

  const infographics = data?.data ?? [];

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-rose-500 via-pink-500 to-fuchsia-600 px-8 py-8">
        <div className="pointer-events-none absolute -left-20 -top-20 h-60 w-60 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-rose-400/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
              <Image className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                الإنفوجرافيك
              </h1>
              <p className="mt-0.5 text-sm font-medium text-white/70">
                Infographic Designer
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowAiModal(true)} className="flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-md transition-all hover:bg-white/20">
              <Sparkles className="h-4 w-4" />
              توليد بالذكاء الاصطناعي
            </button>
            <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-pink-700 shadow-lg shadow-pink-900/30 transition-all hover:shadow-xl hover:shadow-pink-900/40">
              <Plus className="h-4 w-4" />
              إنشاء جديد
            </button>
          </div>
        </div>
      </div>

      <div className="relative max-w-md">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في الإنفوجرافيك..." className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-rasid-500 focus:outline-none focus:ring-1 focus:ring-rasid-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-rasid-600" />
          <span className="ms-3 text-gray-500">جاري التحميل...</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-red-200 bg-red-50 py-12 dark:border-red-800 dark:bg-red-900/20">
          <AlertCircle className="h-10 w-10 text-red-500" />
          <p className="text-sm text-red-700 dark:text-red-400">{error instanceof Error ? error.message : 'حدث خطأ'}</p>
          <button onClick={() => refetch()} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">إعادة المحاولة</button>
        </div>
      )}

      {!isLoading && !isError && infographics.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <Image className="h-16 w-16 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400">لا توجد إنفوجرافيك بعد</p>
        </div>
      )}

      {!isLoading && !isError && infographics.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {infographics.map((ig: Infographic) => (
            <div key={ig.id} onClick={() => router.push(`/infographics/${ig.id}`)} className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-rasid-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-rasid-600">
              <div className="mb-3 aspect-[3/4] w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700">
                {ig.thumbnailUrl ? (
                  <img src={ig.thumbnailUrl} alt={ig.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Image className="h-12 w-12 text-gray-300 dark:text-gray-500" />
                  </div>
                )}
              </div>
              <h3 className="mb-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{ig.name}</h3>
              <div className="mb-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span>{ig.width}x{ig.height}</span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(ig.createdAt), 'dd MMM yyyy', { locale: ar })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[ig.status]}`}>{statusLabels[ig.status]}</span>
                <button onClick={(e) => handleDelete(e, ig.id)} className="rounded-lg p-1.5 text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/20" title="حذف">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} titleAr="إنشاء إنفوجرافيك جديد" footer={
        <>
          <button onClick={() => setShowCreateModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">إلغاء</button>
          <button onClick={() => createMutation.mutate({ name: newName, description: newDesc, width: 1080, height: 1920 })} disabled={createMutation.isPending || !newName.trim()} className="inline-flex items-center gap-2 rounded-lg bg-rasid-600 px-4 py-2 text-sm text-white hover:bg-rasid-700 disabled:opacity-50">
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            إنشاء
          </button>
        </>
      }>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">الاسم</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="اسم الإنفوجرافيك" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">الوصف</label>
            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="وصف الإنفوجرافيك" rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
        </div>
      </Modal>

      <Modal isOpen={showAiModal} onClose={() => setShowAiModal(false)} titleAr="توليد إنفوجرافيك بالذكاء الاصطناعي" footer={
        <>
          <button onClick={() => setShowAiModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">إلغاء</button>
          <button onClick={() => aiMutation.mutate({ topic: aiTopic, style: aiStyle, language: 'ar', dataPoints: [] })} disabled={aiMutation.isPending || !aiTopic.trim()} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50">
            {aiMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            توليد
          </button>
        </>
      }>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">الموضوع</label>
            <input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="أدخل الموضوع" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">النمط</label>
            <select value={aiStyle} onChange={(e) => setAiStyle(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="modern">عصري</option>
              <option value="flat">مسطح</option>
              <option value="3d">ثلاثي الأبعاد</option>
              <option value="minimal">بسيط</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
