'use client';

import { useState } from 'react';
import { Palette, Layout, Grid3X3, Columns, Rows, Square, Monitor, Smartphone } from 'lucide-react';

const layouts = [
  { id: 'title', name: 'شريحة عنوان', nameEn: 'Title Slide', icon: Square },
  { id: 'content', name: 'محتوى', nameEn: 'Content', icon: Rows },
  { id: 'two-col', name: 'عمودان', nameEn: 'Two Columns', icon: Columns },
  { id: 'grid', name: 'شبكة', nameEn: 'Grid', icon: Grid3X3 },
  { id: 'comparison', name: 'مقارنة', nameEn: 'Comparison', icon: Layout },
  { id: 'blank', name: 'فارغة', nameEn: 'Blank', icon: Square },
];

const colorSchemes = [
  { id: 'corporate', name: 'مؤسسي', colors: ['#1e3a5f', '#2563eb', '#60a5fa', '#dbeafe'] },
  { id: 'modern', name: 'عصري', colors: ['#0f172a', '#6366f1', '#a78bfa', '#ede9fe'] },
  { id: 'warm', name: 'دافئ', colors: ['#7c2d12', '#ea580c', '#fb923c', '#fff7ed'] },
  { id: 'nature', name: 'طبيعي', colors: ['#14532d', '#16a34a', '#4ade80', '#f0fdf4'] },
  { id: 'elegant', name: 'أنيق', colors: ['#1c1917', '#78716c', '#d6d3d1', '#fafaf9'] },
  { id: 'rasid', name: 'رصيد', colors: ['#1e3a5f', '#3b82f6', '#93c5fd', '#eff6ff'] },
];

export default function SmartDesignPage() {
  const [selectedLayout, setSelectedLayout] = useState('content');
  const [selectedScheme, setSelectedScheme] = useState('rasid');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">التصميم الذكي</h1>
          <p className="text-gray-500">Smart Design - AI-powered layout and theme selection</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-white hover:bg-pink-700">
          <Palette className="h-4 w-4" />
          تطبيق التصميم
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">6</p>
          <p className="text-sm text-gray-500">تخطيطات متاحة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">6</p>
          <p className="text-sm text-gray-500">أنظمة ألوان</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">12</p>
          <p className="text-sm text-gray-500">خطوط مدعومة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">AI</p>
          <p className="text-sm text-gray-500">اقتراحات ذكية</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-xl bg-white shadow p-5">
            <h2 className="text-lg font-semibold mb-3">التخطيطات - Layouts</h2>
            <div className="grid grid-cols-2 gap-2">
              {layouts.map((l) => {
                const Icon = l.icon;
                return (
                  <button
                    key={l.id}
                    onClick={() => setSelectedLayout(l.id)}
                    className={`rounded-lg border-2 p-3 text-center transition ${selectedLayout === l.id ? 'border-pink-500 bg-pink-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <Icon className="mx-auto h-6 w-6 text-gray-600 mb-1" />
                    <p className="text-xs font-medium">{l.name}</p>
                    <p className="text-[10px] text-gray-400">{l.nameEn}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-white shadow p-5">
            <h2 className="text-lg font-semibold mb-3">أنظمة الألوان - Color Schemes</h2>
            <div className="space-y-2">
              {colorSchemes.map((scheme) => (
                <button
                  key={scheme.id}
                  onClick={() => setSelectedScheme(scheme.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border-2 p-2 transition ${selectedScheme === scheme.id ? 'border-pink-500' : 'border-gray-200'}`}
                >
                  <div className="flex gap-1">
                    {scheme.colors.map((c, i) => (
                      <div key={i} className="h-6 w-6 rounded" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span className="text-sm font-medium">{scheme.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl bg-white shadow p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">معاينة - Preview</h2>
              <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
                <button
                  onClick={() => setPreviewMode('desktop')}
                  className={`rounded-md px-3 py-1 text-sm ${previewMode === 'desktop' ? 'bg-white shadow' : ''}`}
                >
                  <Monitor className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPreviewMode('mobile')}
                  className={`rounded-md px-3 py-1 text-sm ${previewMode === 'mobile' ? 'bg-white shadow' : ''}`}
                >
                  <Smartphone className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className={`mx-auto rounded-lg border-2 border-gray-200 bg-gray-50 ${previewMode === 'desktop' ? 'aspect-video' : 'aspect-[9/16] max-w-xs'}`}>
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-gray-400">
                  <Layout className="mx-auto h-12 w-12 mb-2" />
                  <p className="text-sm">معاينة التصميم</p>
                  <p className="text-xs">Design Preview</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
