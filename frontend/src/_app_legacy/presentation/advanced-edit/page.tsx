'use client';

import { useState } from 'react';
import {
  Edit3, Type, Image, BarChart, Table, Shapes, AlignCenter, AlignLeft, AlignRight,
  Bold, Italic, Underline, Plus, Trash2, Copy, Layers, ZoomIn, ZoomOut, Undo, Redo,
} from 'lucide-react';

const tools = [
  { id: 'text', icon: Type, label: 'نص' },
  { id: 'image', icon: Image, label: 'صورة' },
  { id: 'chart', icon: BarChart, label: 'رسم بياني' },
  { id: 'table', icon: Table, label: 'جدول' },
  { id: 'shape', icon: Shapes, label: 'شكل' },
];

const slides = [
  { id: 1, title: 'شريحة العنوان', elements: 3 },
  { id: 2, title: 'المقدمة', elements: 5 },
  { id: 3, title: 'البيانات الرئيسية', elements: 8 },
  { id: 4, title: 'التحليل', elements: 6 },
  { id: 5, title: 'الخلاصة', elements: 4 },
];

export default function AdvancedEditPage() {
  const [activeSlide, setActiveSlide] = useState(1);
  const [activeTool, setActiveTool] = useState('text');
  const [zoom, setZoom] = useState(100);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المحرر المتقدم</h1>
          <p className="text-gray-500">Advanced Slide Editor - Full editing capabilities</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">معاينة</button>
          <button className="rounded-lg bg-pink-600 px-4 py-2 text-sm text-white hover:bg-pink-700">حفظ التغييرات</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">5</p>
          <p className="text-sm text-gray-500">شرائح</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">26</p>
          <p className="text-sm text-gray-500">عنصر</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">3</p>
          <p className="text-sm text-gray-500">طبقات</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">{zoom}%</p>
          <p className="text-sm text-gray-500">مستوى التكبير</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow">
        <div className="flex items-center gap-1 border-e pe-2">
          <button className="rounded p-1.5 hover:bg-gray-100"><Undo className="h-4 w-4" /></button>
          <button className="rounded p-1.5 hover:bg-gray-100"><Redo className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-1 border-e pe-2">
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTool(t.id)}
                className={`rounded p-1.5 ${activeTool === t.id ? 'bg-pink-100 text-pink-600' : 'hover:bg-gray-100'}`}
                title={t.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 border-e pe-2">
          <button className="rounded p-1.5 hover:bg-gray-100"><Bold className="h-4 w-4" /></button>
          <button className="rounded p-1.5 hover:bg-gray-100"><Italic className="h-4 w-4" /></button>
          <button className="rounded p-1.5 hover:bg-gray-100"><Underline className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-1 border-e pe-2">
          <button className="rounded p-1.5 hover:bg-gray-100"><AlignRight className="h-4 w-4" /></button>
          <button className="rounded p-1.5 hover:bg-gray-100"><AlignCenter className="h-4 w-4" /></button>
          <button className="rounded p-1.5 hover:bg-gray-100"><AlignLeft className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-1 ms-auto">
          <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="rounded p-1.5 hover:bg-gray-100"><ZoomOut className="h-4 w-4" /></button>
          <span className="text-sm text-gray-600 min-w-[3rem] text-center">{zoom}%</span>
          <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="rounded p-1.5 hover:bg-gray-100"><ZoomIn className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
        {/* Slide panel */}
        <div className="rounded-xl bg-white shadow p-3 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">الشرائح</h3>
            <button className="rounded p-1 hover:bg-gray-100"><Plus className="h-4 w-4" /></button>
          </div>
          {slides.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSlide(s.id)}
              className={`w-full rounded-lg border-2 p-2 text-start text-xs transition ${activeSlide === s.id ? 'border-pink-500 bg-pink-50' : 'border-gray-200'}`}
            >
              <div className="aspect-video rounded bg-gray-100 mb-1 flex items-center justify-center text-gray-400 text-[10px]">
                {s.id}
              </div>
              <p className="font-medium truncate">{s.title}</p>
              <p className="text-gray-400">{s.elements} عناصر</p>
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div className="rounded-xl bg-white shadow p-4">
          <div className="aspect-video rounded-lg border-2 border-gray-200 bg-gray-50 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <Edit3 className="mx-auto h-16 w-16 mb-3" />
              <p className="text-lg">منطقة التحرير - شريحة {activeSlide}</p>
              <p className="text-sm">Editing Canvas - Slide {activeSlide}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
