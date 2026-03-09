'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Paintbrush, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Palette, Type, Grid3X3, Download, Eye, Save, Undo, Redo,
  ChevronDown, Plus, Sparkles, Check, Table, Loader2,
} from 'lucide-react';

const presets = [
  { id: 1, name: 'تقرير مالي رسمي', nameEn: 'Formal Financial', preview: 'bg-gradient-to-br from-blue-900 to-blue-700', textColor: 'text-white' },
  { id: 2, name: 'تقرير حكومي', nameEn: 'Government Report', preview: 'bg-gradient-to-br from-green-800 to-green-600', textColor: 'text-white' },
  { id: 3, name: 'عرض تسويقي', nameEn: 'Marketing Style', preview: 'bg-gradient-to-br from-purple-600 to-pink-500', textColor: 'text-white' },
  { id: 4, name: 'بسيط واحترافي', nameEn: 'Clean Professional', preview: 'bg-gradient-to-br from-gray-100 to-white', textColor: 'text-gray-800' },
  { id: 5, name: 'تحليلي بألوان', nameEn: 'Colorful Analytics', preview: 'bg-gradient-to-br from-amber-400 to-orange-500', textColor: 'text-white' },
  { id: 6, name: 'داكن أنيق', nameEn: 'Dark Elegant', preview: 'bg-gradient-to-br from-gray-900 to-gray-700', textColor: 'text-white' },
];

const colorPalettes = [
  { name: 'أزرق رسمي', colors: ['#1e3a5f', '#2563eb', '#60a5fa', '#bfdbfe', '#eff6ff'] },
  { name: 'أخضر حكومي', colors: ['#14532d', '#16a34a', '#4ade80', '#bbf7d0', '#f0fdf4'] },
  { name: 'بنفسجي حديث', colors: ['#4c1d95', '#7c3aed', '#a78bfa', '#ddd6fe', '#f5f3ff'] },
  { name: 'رمادي محايد', colors: ['#111827', '#374151', '#6b7280', '#d1d5db', '#f9fafb'] },
];

export default function FormattingPage() {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [headerFont, setHeaderFont] = useState('Arial');
  const [headerSize, setHeaderSize] = useState(14);

  const { data: formattingRes } = useQuery({
    queryKey: ['excel-formatting-list'],
    queryFn: () => api.get<{ success: boolean; data: unknown[]; total: number }>('/api/v1/excel/formatting'),
  });

  const savedCount = (formattingRes as { total?: number })?.total ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/excel" className="hover:text-green-600">محرك إكسل</Link>
            <span>/</span>
            <span>التنسيق الاحترافي</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">التنسيق الاحترافي</h1>
          <p className="text-gray-500">Professional Formatting Panel</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <Eye className="h-4 w-4" /> معاينة
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Save className="h-4 w-4" /> تطبيق وحفظ
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-blue-600">{presets.length}</p>
          <p className="text-sm text-gray-500">قوالب جاهزة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-violet-600">{colorPalettes.length}</p>
          <p className="text-sm text-gray-500">لوحات ألوان</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">10</p>
          <p className="text-sm text-gray-500">سمات احترافية</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-amber-600">{savedCount}</p>
          <p className="text-sm text-gray-500">تنسيقات محفوظة</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Format Controls */}
        <div className="lg:col-span-2 space-y-4">
          {/* Toolbar */}
          <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4">
            <h3 className="mb-3 font-semibold text-gray-900">أدوات التنسيق - Formatting Toolbar</h3>
            <div className="flex flex-wrap items-center gap-2">
              <select value={headerFont} onChange={(e) => setHeaderFont(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm">
                <option>Arial</option>
                <option>Tahoma</option>
                <option>Cairo</option>
                <option>Tajawal</option>
              </select>
              <input type="number" value={headerSize} onChange={(e) => setHeaderSize(Number(e.target.value))}
                className="w-16 rounded border border-gray-300 px-2 py-1.5 text-sm text-center" />
              <div className="h-6 w-px bg-gray-200" />
              <button className="rounded p-1.5 hover:bg-gray-100"><Bold className="h-4 w-4" /></button>
              <button className="rounded p-1.5 hover:bg-gray-100"><Italic className="h-4 w-4" /></button>
              <button className="rounded p-1.5 hover:bg-gray-100"><Underline className="h-4 w-4" /></button>
              <div className="h-6 w-px bg-gray-200" />
              <button className="rounded p-1.5 hover:bg-gray-100"><AlignRight className="h-4 w-4" /></button>
              <button className="rounded p-1.5 hover:bg-gray-100"><AlignCenter className="h-4 w-4" /></button>
              <button className="rounded p-1.5 hover:bg-gray-100"><AlignLeft className="h-4 w-4" /></button>
              <div className="h-6 w-px bg-gray-200" />
              <button className="rounded p-1.5 hover:bg-gray-100"><Palette className="h-4 w-4" /></button>
              <button className="rounded p-1.5 hover:bg-gray-100"><Grid3X3 className="h-4 w-4" /></button>
              <div className="h-6 w-px bg-gray-200" />
              <button className="rounded p-1.5 hover:bg-gray-100"><Undo className="h-4 w-4 text-gray-400" /></button>
              <button className="rounded p-1.5 hover:bg-gray-100"><Redo className="h-4 w-4 text-gray-400" /></button>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl bg-white shadow-sm border border-gray-100">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="font-semibold text-gray-900">معاينة التنسيق - Format Preview</h3>
            </div>
            <div className="p-4">
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`${selectedPreset === 1 ? 'bg-blue-900 text-white' : selectedPreset === 2 ? 'bg-green-800 text-white' : 'bg-gray-800 text-white'}`}>
                      <th className="px-4 py-3 text-start">الاسم</th>
                      <th className="px-4 py-3 text-start">القسم</th>
                      <th className="px-4 py-3 text-start">الراتب</th>
                      <th className="px-4 py-3 text-start">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b bg-blue-50/30"><td className="px-4 py-2.5 font-medium">أحمد محمد</td><td className="px-4 py-2.5">تقنية المعلومات</td><td className="px-4 py-2.5">15,000</td><td className="px-4 py-2.5"><span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">نشط</span></td></tr>
                    <tr className="border-b"><td className="px-4 py-2.5 font-medium">فاطمة علي</td><td className="px-4 py-2.5">الموارد البشرية</td><td className="px-4 py-2.5">12,500</td><td className="px-4 py-2.5"><span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">نشط</span></td></tr>
                    <tr className="border-b bg-blue-50/30"><td className="px-4 py-2.5 font-medium">خالد سعد</td><td className="px-4 py-2.5">المالية</td><td className="px-4 py-2.5">18,000</td><td className="px-4 py-2.5"><span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">إجازة</span></td></tr>
                  </tbody>
                  <tfoot>
                    <tr className={`font-bold ${selectedPreset === 1 ? 'bg-blue-100' : selectedPreset === 2 ? 'bg-green-100' : 'bg-gray-100'}`}>
                      <td className="px-4 py-2.5">الإجمالي</td><td className="px-4 py-2.5"></td><td className="px-4 py-2.5">45,500</td><td className="px-4 py-2.5"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="space-y-4">
          {/* Presets */}
          <div className="rounded-xl bg-white shadow-sm border border-gray-100">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="font-semibold text-gray-900">القوالب الجاهزة - Presets</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3">
              {presets.map((preset) => (
                <button key={preset.id} onClick={() => setSelectedPreset(preset.id)}
                  className={`relative rounded-lg p-3 text-center transition-all ${preset.preview} ${
                    selectedPreset === preset.id ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                  }`}>
                  {selectedPreset === preset.id && (
                    <div className="absolute top-1 end-1"><Check className="h-4 w-4 text-white" /></div>
                  )}
                  <p className={`text-xs font-medium ${preset.textColor}`}>{preset.name}</p>
                  <p className={`text-[10px] ${preset.textColor} opacity-70`}>{preset.nameEn}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Color Palettes */}
          <div className="rounded-xl bg-white shadow-sm border border-gray-100">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="font-semibold text-gray-900">لوحات الألوان - Palettes</h3>
            </div>
            <div className="p-3 space-y-3">
              {colorPalettes.map((palette) => (
                <div key={palette.name} className="cursor-pointer rounded-lg p-2 hover:bg-gray-50">
                  <p className="text-xs font-medium text-gray-700 mb-1">{palette.name}</p>
                  <div className="flex gap-1">
                    {palette.colors.map((color) => (
                      <div key={color} className="h-6 flex-1 rounded" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
