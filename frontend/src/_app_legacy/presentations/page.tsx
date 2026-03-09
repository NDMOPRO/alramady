'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Presentation, Plus, Layout, Loader2, Download, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import Tabs, { Tab } from '@/components/ui/Tabs';

const tabs: Tab[] = [
  { id: 'list', label: 'عروضي', icon: <Presentation className="h-4 w-4" /> },
  { id: 'create', label: 'إنشاء عرض', icon: <Plus className="h-4 w-4" /> },
  { id: 'templates', label: 'القوالب', icon: <Layout className="h-4 w-4" /> },
];

export default function PresentationsPage() {
  const [activeTab, setActiveTab] = useState('list');
  const [createForm, setCreateForm] = useState({ subject: '', slides: 10, language: 'ar' });

  const { data: presentations, isLoading } = useQuery({
    queryKey: ['presentations'],
    queryFn: () => api.get<{ data: Array<{ id: string; title: string; status: string; slideCount: number; createdAt: string }> }>('/presentation/api/v1/presentations'),
  });

  const { data: templates } = useQuery({
    queryKey: ['presentation-templates'],
    queryFn: () => api.get<{ data: Array<{ id: string; name: string; thumbnail: string }> }>('/template/api/v1/templates?type=presentation'),
    enabled: activeTab === 'templates',
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof createForm) => api.post('/presentation/api/v1/presentations/generate', data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">العروض التقديمية</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">إنشاء عروض احترافية وإنفوجرافيك</p>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'list' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <div className="col-span-full flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-pink-600" /></div>
          ) : (
            (presentations?.data || []).map((pres) => (
              <div key={pres.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="rounded-lg bg-pink-50 dark:bg-pink-900/20 p-2"><Presentation className="h-5 w-5 text-pink-600" /></div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${pres.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{pres.status}</span>
                </div>
                <h3 className="font-medium text-gray-900 dark:text-white mb-1">{pres.title}</h3>
                <p className="text-xs text-gray-500">{pres.slideCount} شريحة</p>
                <div className="mt-3 flex gap-2">
                  <button className="rounded-lg bg-gray-100 dark:bg-gray-800 p-2 hover:bg-gray-200"><Eye className="h-4 w-4" /></button>
                  <button className="rounded-lg bg-gray-100 dark:bg-gray-800 p-2 hover:bg-gray-200"><Download className="h-4 w-4" /></button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'create' && (
        <div className="max-w-lg space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">موضوع العرض</label>
            <input
              value={createForm.subject}
              onChange={(e) => setCreateForm({ ...createForm, subject: e.target.value })}
              placeholder="مثال: عرض أداء الربع الثالث"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">عدد الشرائح</label>
              <input
                type="number"
                value={createForm.slides}
                onChange={(e) => setCreateForm({ ...createForm, slides: parseInt(e.target.value) || 10 })}
                min={3}
                max={50}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اللغة</label>
              <select
                value={createForm.language}
                onChange={(e) => setCreateForm({ ...createForm, language: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <button
            onClick={() => createMutation.mutate(createForm)}
            disabled={createMutation.isPending || !createForm.subject}
            className="w-full rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء العرض'}
          </button>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(templates?.data || []).map((tmpl) => (
            <div key={tmpl.id} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
              <div className="h-32 bg-gradient-to-br from-pink-100 to-purple-100 dark:from-pink-900/20 dark:to-purple-900/20 flex items-center justify-center">
                <Layout className="h-8 w-8 text-pink-400" />
              </div>
              <div className="p-3"><p className="text-sm font-medium">{tmpl.name}</p></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
