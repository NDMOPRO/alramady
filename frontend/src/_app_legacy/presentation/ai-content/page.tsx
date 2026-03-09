'use client';

import { useState } from 'react';
import { Wand2, Send, Sparkles, FileText, BarChart, ListChecks, Clock, Zap } from 'lucide-react';

const promptTemplates = [
  { id: 1, title: 'ملخص تنفيذي', titleEn: 'Executive Summary', icon: FileText, prompt: 'أنشئ ملخصاً تنفيذياً من...' },
  { id: 2, title: 'تحليل بيانات', titleEn: 'Data Analysis', icon: BarChart, prompt: 'حلل البيانات التالية...' },
  { id: 3, title: 'خطة عمل', titleEn: 'Action Plan', icon: ListChecks, prompt: 'أنشئ خطة عمل لـ...' },
  { id: 4, title: 'مقارنة', titleEn: 'Comparison', icon: Zap, prompt: 'قارن بين...' },
];

const recentGenerations = [
  { title: 'ملخص تقرير الأداء Q4', slides: 8, date: '2026-03-02', status: 'مكتمل' },
  { title: 'تحليل بيانات المبيعات', slides: 12, date: '2026-03-01', status: 'مكتمل' },
  { title: 'خطة التحول الرقمي 2026', slides: 15, date: '2026-02-28', status: 'قيد المراجعة' },
];

export default function AIContentPage() {
  const [prompt, setPrompt] = useState('');
  const [slideCount, setSlideCount] = useState(10);
  const [tone, setTone] = useState('professional');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إنشاء المحتوى بالذكاء الاصطناعي</h1>
          <p className="text-gray-500">AI Content Generation - Create slides with AI prompts</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-700">
          <Sparkles className="h-4 w-4" />
          AI مُفعَّل
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">156</p>
          <p className="text-sm text-gray-500">شرائح مُنشأة بـ AI</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">23</p>
          <p className="text-sm text-gray-500">عروض مُولَّدة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">94%</p>
          <p className="text-sm text-gray-500">نسبة الرضا</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">~2 د</p>
          <p className="text-sm text-gray-500">متوسط وقت الإنشاء</p>
        </div>
      </div>

      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">إنشاء عرض جديد - Generate New Presentation</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">وصف المحتوى المطلوب</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="صف العرض التقديمي المطلوب... مثال: أنشئ عرضاً تقديمياً عن استراتيجية التحول الرقمي للمؤسسة يتضمن التحديات والحلول والجدول الزمني"
              className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
              rows={4}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">عدد الشرائح</label>
              <input
                type="number"
                value={slideCount}
                onChange={(e) => setSlideCount(Number(e.target.value))}
                min={3}
                max={50}
                className="w-full rounded-lg border border-gray-200 p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">نبرة المحتوى</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full rounded-lg border border-gray-200 p-2 text-sm"
              >
                <option value="professional">رسمي / Professional</option>
                <option value="casual">غير رسمي / Casual</option>
                <option value="academic">أكاديمي / Academic</option>
                <option value="creative">إبداعي / Creative</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">اللغة</label>
              <select className="w-full rounded-lg border border-gray-200 p-2 text-sm">
                <option value="ar">العربية</option>
                <option value="en">English</option>
                <option value="both">ثنائي اللغة / Bilingual</option>
              </select>
            </div>
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-pink-600 px-6 py-2.5 text-white hover:bg-pink-700">
            <Wand2 className="h-4 w-4" />
            إنشاء بالذكاء الاصطناعي
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">قوالب الأوامر السريعة - Prompt Templates</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {promptTemplates.map((tmpl) => {
            const Icon = tmpl.icon;
            return (
              <button
                key={tmpl.id}
                onClick={() => setPrompt(tmpl.prompt)}
                className="rounded-xl bg-white p-4 shadow text-start hover:shadow-md transition"
              >
                <Icon className="h-8 w-8 text-pink-500 mb-2" />
                <h3 className="font-semibold text-gray-900">{tmpl.title}</h3>
                <p className="text-xs text-gray-400">{tmpl.titleEn}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">العروض المُولَّدة مؤخراً - Recent Generations</h2>
        <div className="space-y-3">
          {recentGenerations.map((gen, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-50">
                  <Sparkles className="h-5 w-5 text-pink-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{gen.title}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Clock className="h-3 w-3" /> {gen.date}
                    <span>|</span>
                    {gen.slides} شريحة
                  </div>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${gen.status === 'مكتمل' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {gen.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
