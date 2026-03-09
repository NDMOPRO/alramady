'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Workflow, Plus, Play, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import Tabs, { Tab } from '@/components/ui/Tabs';

const tabs: Tab[] = [
  { id: 'workflows', label: 'سير العمل', icon: <Workflow className="h-4 w-4" /> },
  { id: 'create', label: 'إنشاء', icon: <Plus className="h-4 w-4" /> },
  { id: 'history', label: 'سجل التنفيذ', icon: <Clock className="h-4 w-4" /> },
];

export default function AutomationPage() {
  const [activeTab, setActiveTab] = useState('workflows');
  const [createForm, setCreateForm] = useState({ name: '', trigger: 'manual', steps: '' });

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => api.get<{ data: Array<{ id: string; name: string; status: string; triggerType: string; lastRunAt: string }> }>('/governance/api/v1/governance/workflows'),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof createForm) => api.post('/governance/api/v1/governance/workflows', data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">الأتمتة</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">إدارة سير العمل والعمليات التلقائية</p>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'workflows' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <div className="col-span-full flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-lime-600" /></div>
          ) : (
            (workflows?.data || []).map((wf) => (
              <div key={wf.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start justify-between mb-3">
                  <Workflow className="h-5 w-5 text-lime-600" />
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    wf.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>{wf.status}</span>
                </div>
                <h3 className="font-medium text-gray-900 dark:text-white mb-1">{wf.name}</h3>
                <p className="text-xs text-gray-500">المحفز: {wf.triggerType}</p>
                {wf.lastRunAt && <p className="text-xs text-gray-400 mt-1">آخر تشغيل: {new Date(wf.lastRunAt).toLocaleDateString('ar-SA')}</p>}
                <button className="mt-3 flex items-center gap-1 rounded-lg bg-lime-50 dark:bg-lime-900/20 px-3 py-1.5 text-xs text-lime-700 hover:bg-lime-100">
                  <Play className="h-3 w-3" /> تشغيل
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'create' && (
        <div className="max-w-lg space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اسم سير العمل</label>
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="مثال: تقرير أسبوعي تلقائي"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">المحفز</label>
            <select
              value={createForm.trigger}
              onChange={(e) => setCreateForm({ ...createForm, trigger: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            >
              <option value="manual">يدوي</option>
              <option value="schedule">مجدول</option>
              <option value="event">حدث</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الخطوات (وصف)</label>
            <textarea
              value={createForm.steps}
              onChange={(e) => setCreateForm({ ...createForm, steps: e.target.value })}
              placeholder="صف خطوات سير العمل..."
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
          </div>
          <button
            onClick={() => createMutation.mutate(createForm)}
            disabled={createMutation.isPending || !createForm.name}
            className="w-full rounded-lg bg-lime-600 px-4 py-2 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء سير العمل'}
          </button>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center text-gray-500">
          <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>سجل تنفيذ سير العمل - يعرض آخر العمليات المنفذة ونتائجها</p>
        </div>
      )}
    </div>
  );
}
