'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Workflow,
  Plus,
  Play,
  Pause,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useUIStore } from '@/lib/stores/ui-store';
import { governanceApi } from '@/lib/api/client';

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  actions: string[];
  enabled: boolean;
  lastRun: string | null;
  runCount: number;
  createdAt: string;
}

async function fetchRules(): Promise<AutomationRule[]> {
  const res = await governanceApi.get('/automation/rules');
  return res.data?.data || [];
}

async function toggleRule(id: string, enabled: boolean): Promise<void> {
  await governanceApi.patch(`/automation/rules/${id}`, { enabled });
}

async function deleteRule(id: string): Promise<void> {
  await governanceApi.delete(`/automation/rules/${id}`);
}

const triggerLabels: Record<string, { en: string; ar: string }> = {
  on_upload: { en: 'On File Upload', ar: 'عند رفع ملف' },
  on_schedule: { en: 'Scheduled', ar: 'مجدول' },
  on_threshold: { en: 'Threshold Alert', ar: 'تنبيه حد' },
  on_change: { en: 'On Data Change', ar: 'عند تغيير البيانات' },
  manual: { en: 'Manual', ar: 'يدوي' },
};

export default function AutomationPage() {
  const locale = useUIStore((s) => s.locale);
  const isRTL = locale === 'ar';
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: rules, isLoading, error } = useQuery({
    queryKey: ['automation-rules'],
    queryFn: fetchRules,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleRule(id, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automation-rules'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automation-rules'] }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-sky-500 via-blue-500 to-indigo-600 px-8 py-8">
        <div className="pointer-events-none absolute -left-20 -top-20 h-60 w-60 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
              <Workflow className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                {isRTL ? 'الأتمتة' : 'Automation'}
              </h1>
              <p className="mt-0.5 text-sm font-medium text-white/70">
                {isRTL ? 'إنشاء وإدارة قواعد الأتمتة' : 'Create and manage automation rules'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-blue-700 shadow-lg shadow-blue-900/30 transition-all hover:shadow-xl hover:shadow-blue-900/40"
          >
            <Plus className="h-4 w-4" />
            {isRTL ? 'قاعدة جديدة' : 'New Rule'}
          </button>
        </div>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-sm text-red-700 dark:text-red-400">
            {isRTL ? 'فشل تحميل قواعد الأتمتة' : 'Failed to load automation rules'}
          </p>
        </div>
      )}

      {/* Rules List */}
      {rules && rules.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 py-20 dark:border-gray-700">
          <Workflow className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400">
            {isRTL ? 'لا توجد قواعد أتمتة بعد' : 'No automation rules yet'}
          </p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            {isRTL ? 'أنشئ قاعدة جديدة للبدء' : 'Create a new rule to get started'}
          </p>
        </div>
      )}

      {rules && rules.length > 0 && (
        <div className="space-y-3">
          {rules.map((rule) => {
            const trigger = triggerLabels[rule.trigger] || { en: rule.trigger, ar: rule.trigger };
            return (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      rule.enabled
                        ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-400 dark:bg-gray-800'
                    }`}
                  >
                    {rule.enabled ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{rule.name}</h3>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {isRTL ? trigger.ar : trigger.en}
                      </span>
                      <span>
                        {isRTL ? `${rule.runCount} تنفيذ` : `${rule.runCount} runs`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                    className={`rounded-lg p-2 transition-colors ${
                      rule.enabled
                        ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                        : 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                    }`}
                    title={rule.enabled ? (isRTL ? 'إيقاف' : 'Pause') : (isRTL ? 'تشغيل' : 'Enable')}
                  >
                    {rule.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(isRTL ? 'هل تريد حذف هذه القاعدة؟' : 'Delete this rule?')) {
                        deleteMutation.mutate(rule.id);
                      }
                    }}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50 transition-colors dark:hover:bg-red-900/20"
                    title={isRTL ? 'حذف' : 'Delete'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
