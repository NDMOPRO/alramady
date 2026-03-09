'use client';

import { useState } from 'react';
import {
  Image, LayoutTemplate, Palette, Type, BarChart, PieChart, TrendingUp,
  Shapes, Move, Plus, Download, Eye, Grid3X3, Layers, Wand2, GripVertical,
} from 'lucide-react';

const templates = [
  { id: 1, name: 'إحصائيات', nameEn: 'Statistics', category: 'data' },
  { id: 2, name: 'خط زمني', nameEn: 'Timeline', category: 'process' },
  { id: 3, name: 'مقارنة', nameEn: 'Comparison', category: 'data' },
  { id: 4, name: 'هرمي', nameEn: 'Hierarchy', category: 'org' },
  { id: 5, name: 'خريطة ذهنية', nameEn: 'Mind Map', category: 'process' },
  { id: 6, name: 'دائري', nameEn: 'Circular', category: 'process' },
  { id: 7, name: 'تقرير سنوي', nameEn: 'Annual Report', category: 'report' },
  { id: 8, name: 'خريطة جغرافية', nameEn: 'Geo Map', category: 'data' },
];

const elements = [
  { id: 'chart-bar', icon: BarChart, label: 'رسم أعمدة', labelEn: 'Bar Chart' },
  { id: 'chart-pie', icon: PieChart, label: 'رسم دائري', labelEn: 'Pie Chart' },
  { id: 'chart-line', icon: TrendingUp, label: 'رسم خطي', labelEn: 'Line Chart' },
  { id: 'text', icon: Type, label: 'نص', labelEn: 'Text' },
  { id: 'shape', icon: Shapes, label: 'شكل', labelEn: 'Shape' },
  { id: 'image', icon: Image, label: 'صورة', labelEn: 'Image' },
  { id: 'icon', icon: Grid3X3, label: 'أيقونة', labelEn: 'Icon' },
  { id: 'divider', icon: GripVertical, label: 'فاصل', labelEn: 'Divider' },
];

const colorPalettes = [
  { id: 'corporate', name: 'مؤسسي', colors: ['#1e3a5f', '#3b82f6', '#93c5fd', '#dbeafe', '#eff6ff'] },
  { id: 'sunset', name: 'غروب', colors: ['#7c2d12', '#ea580c', '#fb923c', '#fed7aa', '#fff7ed'] },
  { id: 'forest', name: 'غابة', colors: ['#14532d', '#16a34a', '#4ade80', '#bbf7d0', '#f0fdf4'] },
  { id: 'royal', name: 'ملكي', colors: ['#312e81', '#6366f1', '#a78bfa', '#c4b5fd', '#ede9fe'] },
];

export default function ProfessionalInfographicPage() {
  const [activeTab, setActiveTab] = useState<'templates' | 'elements' | 'colors'>('templates');
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [selectedPalette, setSelectedPalette] = useState('corporate');

  const tabs = [
    { id: 'templates' as const, label: 'القوالب', labelEn: 'Templates', icon: LayoutTemplate },
    { id: 'elements' as const, label: 'العناصر', labelEn: 'Elements', icon: Layers },
    { id: 'colors' as const, label: 'الألوان', labelEn: 'Colors', icon: Palette },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مُنشئ الإنفوجرافيك الاحترافي</h1>
          <p className="text-gray-500">Professional Infographic Builder - Templates, drag-drop, data visualization</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
            <Eye className="h-4 w-4" /> معاينة
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
            <Download className="h-4 w-4" /> تصدير
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-white hover:bg-cyan-700">
            <Wand2 className="h-4 w-4" /> إنشاء بالذكاء الاصطناعي
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-cyan-600">8</p>
          <p className="text-sm text-gray-500">قوالب جاهزة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-cyan-600">8</p>
          <p className="text-sm text-gray-500">عناصر للسحب</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-cyan-600">4</p>
          <p className="text-sm text-gray-500">لوحات ألوان</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-cyan-600">AI</p>
          <p className="text-sm text-gray-500">إنشاء ذكي</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Sidebar panel */}
        <div className="rounded-xl bg-white shadow">
          <div className="flex border-b">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium border-b-2 -mb-px ${activeTab === tab.id ? 'border-cyan-600 text-cyan-600' : 'border-transparent text-gray-500'}`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="p-4">
            {activeTab === 'templates' && (
              <div className="grid grid-cols-2 gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className={`rounded-lg border-2 p-3 text-center transition ${selectedTemplate === t.id ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className="aspect-[3/4] rounded bg-gray-100 mb-2 flex items-center justify-center">
                      <LayoutTemplate className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-xs font-medium">{t.name}</p>
                    <p className="text-[10px] text-gray-400">{t.nameEn}</p>
                  </button>
                ))}
              </div>
            )}
            {activeTab === 'elements' && (
              <div className="space-y-2">
                {elements.map((el) => {
                  const Icon = el.icon;
                  return (
                    <div
                      key={el.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 cursor-grab hover:bg-gray-50 transition"
                    >
                      <Move className="h-4 w-4 text-gray-300" />
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-50">
                        <Icon className="h-4 w-4 text-cyan-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{el.label}</p>
                        <p className="text-[10px] text-gray-400">{el.labelEn}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {activeTab === 'colors' && (
              <div className="space-y-3">
                {colorPalettes.map((pal) => (
                  <button
                    key={pal.id}
                    onClick={() => setSelectedPalette(pal.id)}
                    className={`w-full rounded-lg border-2 p-3 text-start transition ${selectedPalette === pal.id ? 'border-cyan-500' : 'border-gray-200'}`}
                  >
                    <p className="text-sm font-medium mb-2">{pal.name}</p>
                    <div className="flex gap-1">
                      {pal.colors.map((c, i) => (
                        <div key={i} className="h-6 flex-1 rounded" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="rounded-xl bg-white shadow p-4">
          <div className="aspect-[3/4] max-h-[700px] rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <Image className="mx-auto h-16 w-16 mb-3" />
              <p className="text-lg font-medium">منطقة التصميم</p>
              <p className="text-sm">Design Canvas</p>
              <p className="text-xs mt-2">اختر قالباً أو اسحب العناصر لبدء التصميم</p>
              <p className="text-xs">Choose a template or drag elements to start</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
