'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  ToggleLeft, ToggleRight, Sparkles, Code, FileSpreadsheet, Calculator,
  Paintbrush, GitCompare, ArrowRight, CheckCircle, Star, Zap,
  Settings, BookOpen, Play, Loader2,
} from 'lucide-react';

const easyFeatures = [
  { icon: Sparkles, title: 'إنشاء تلقائي', titleEn: 'Auto Generate', desc: 'إنشاء صيغ وتنسيقات بنقرة واحدة' },
  { icon: Paintbrush, title: 'تنسيق ذكي', titleEn: 'Smart Format', desc: 'تنسيق احترافي للجداول تلقائياً' },
  { icon: GitCompare, title: 'مطابقة سريعة', titleEn: 'Quick Match', desc: 'مطابقة ملفات بسحب وإفلات' },
  { icon: Calculator, title: 'حسابات مبسطة', titleEn: 'Simple Calc', desc: 'واجهة حسابات سهلة الاستخدام' },
];

const advancedFeatures = [
  { icon: Code, title: 'محرر صيغ متقدم', titleEn: 'Advanced Editor', desc: 'تحرير مع تلوين بناء الجملة' },
  { icon: Settings, title: 'تحكم كامل', titleEn: 'Full Control', desc: 'تحكم كامل في جميع الإعدادات' },
  { icon: Zap, title: 'أتمتة مخصصة', titleEn: 'Custom Automation', desc: 'إنشاء سيناريوهات أتمتة مخصصة' },
  { icon: BookOpen, title: 'API مباشر', titleEn: 'Direct API', desc: 'الوصول المباشر لواجهة البرمجة' },
];

const quickActions = [
  { title: 'إنشاء جدول جديد', titleEn: 'New Table', icon: FileSpreadsheet, color: 'bg-green-500' },
  { title: 'حساب مجاميع', titleEn: 'Sum Totals', icon: Calculator, color: 'bg-blue-500' },
  { title: 'تنسيق تقرير', titleEn: 'Format Report', icon: Paintbrush, color: 'bg-violet-500' },
  { title: 'مطابقة ملفات', titleEn: 'Match Files', icon: GitCompare, color: 'bg-amber-500' },
];

export default function ModesPage() {
  const [mode, setMode] = useState<'easy' | 'advanced'>('easy');

  const { data: modesRes } = useQuery({
    queryKey: ['excel-modes-list'],
    queryFn: () => api.get<{ success: boolean; data: unknown[]; total: number }>('/api/v1/excel/modes'),
  });

  const modesTotal = (modesRes as { total?: number })?.total ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/excel" className="hover:text-green-600">محرك إكسل</Link>
            <span>/</span>
            <span>الأوضاع</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">أوضاع العمل</h1>
          <p className="text-gray-500">Easy / Advanced Mode Toggle</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">{mode === 'easy' ? 'سهل' : 'متقدم'}</p>
          <p className="text-sm text-gray-500">الوضع الحالي</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-blue-600">{quickActions.length}</p>
          <p className="text-sm text-gray-500">إجراءات سريعة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-violet-600">{mode === 'easy' ? easyFeatures.length : advancedFeatures.length}</p>
          <p className="text-sm text-gray-500">ميزات متاحة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-amber-600">{modesTotal}</p>
          <p className="text-sm text-gray-500">أوضاع محفوظة</p>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-4 rounded-xl bg-white p-3 shadow-sm border border-gray-100">
          <button onClick={() => setMode('easy')}
            className={`flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-all ${
              mode === 'easy' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-100'
            }`}>
            <Sparkles className="h-5 w-5" />
            <div className="text-start">
              <p>الوضع السهل</p>
              <p className={`text-xs ${mode === 'easy' ? 'text-green-200' : 'text-gray-400'}`}>Easy Mode</p>
            </div>
          </button>
          <button onClick={() => setMode(mode === 'easy' ? 'advanced' : 'easy')} className="p-1">
            {mode === 'easy' ? <ToggleLeft className="h-8 w-8 text-green-500" /> : <ToggleRight className="h-8 w-8 text-violet-500" />}
          </button>
          <button onClick={() => setMode('advanced')}
            className={`flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-all ${
              mode === 'advanced' ? 'bg-violet-600 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-100'
            }`}>
            <Code className="h-5 w-5" />
            <div className="text-start">
              <p>الوضع المتقدم</p>
              <p className={`text-xs ${mode === 'advanced' ? 'text-violet-200' : 'text-gray-400'}`}>Advanced Mode</p>
            </div>
          </button>
        </div>
      </div>

      {/* Mode Content */}
      {mode === 'easy' ? (
        <div className="space-y-6">
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">إجراءات سريعة - Quick Actions</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button key={action.title} className="flex flex-col items-center gap-3 rounded-xl bg-white p-6 shadow-sm border border-gray-100 hover:shadow-md hover:border-green-200 transition-all">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${action.color} text-white`}>
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-gray-900">{action.title}</p>
                      <p className="text-xs text-gray-400">{action.titleEn}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">ميزات الوضع السهل - Easy Mode Features</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {easyFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="flex items-start gap-4 rounded-xl bg-white p-5 shadow-sm border border-gray-100">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600 shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{feature.title}</h3>
                      <p className="text-xs text-gray-400">{feature.titleEn}</p>
                      <p className="mt-1 text-sm text-gray-500">{feature.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">ميزات الوضع المتقدم - Advanced Features</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {advancedFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="flex items-start gap-4 rounded-xl bg-white p-5 shadow-sm border border-gray-100">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-600 shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{feature.title}</h3>
                      <p className="text-xs text-gray-400">{feature.titleEn}</p>
                      <p className="mt-1 text-sm text-gray-500">{feature.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl bg-gray-900 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-300">وحدة التحكم - Console</h3>
              <button className="flex items-center gap-1 rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700">
                <Play className="h-3 w-3" /> تشغيل
              </button>
            </div>
            <pre className="text-green-400 text-sm font-mono" dir="ltr">
{`// Excel Engine API
const result = await excel.formula({
  range: "A1:D100",
  formula: "=SUMIFS(amount, dept, 'IT')",
  format: "currency_sar"
});
console.log(result); // { value: 145000, formatted: "145,000 ر.س" }`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
