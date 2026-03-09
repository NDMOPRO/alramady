'use client';

import { useState } from 'react';
import { Type, Save, Eye, Settings, Check } from 'lucide-react';

const fonts = [
  { id: 'cairo', name: 'Cairo', nameAr: 'كايرو', sample: 'بسم الله الرحمن الرحيم', category: 'sans-serif', weight: '200-900' },
  { id: 'tajawal', name: 'Tajawal', nameAr: 'تجوال', sample: 'بسم الله الرحمن الرحيم', category: 'sans-serif', weight: '200-900' },
  { id: 'noto-kufi', name: 'Noto Kufi Arabic', nameAr: 'نوتو كوفي', sample: 'بسم الله الرحمن الرحيم', category: 'sans-serif', weight: '100-900' },
  { id: 'amiri', name: 'Amiri', nameAr: 'أميري', sample: 'بسم الله الرحمن الرحيم', category: 'serif', weight: '400-700' },
  { id: 'scheherazade', name: 'Scheherazade', nameAr: 'شهرزاد', sample: 'بسم الله الرحمن الرحيم', category: 'serif', weight: '400-700' },
  { id: 'ibm-plex', name: 'IBM Plex Sans Arabic', nameAr: 'آي بي إم بلكس', sample: 'بسم الله الرحمن الرحيم', category: 'sans-serif', weight: '100-700' },
];

const typographySettings = [
  { id: 'line-height', name: 'ارتفاع السطر', nameEn: 'Line Height', value: '1.8', options: ['1.4', '1.6', '1.8', '2.0', '2.2'] },
  { id: 'letter-spacing', name: 'التباعد بين الحروف', nameEn: 'Letter Spacing', value: 'normal', options: ['tight', 'normal', 'wide'] },
  { id: 'word-spacing', name: 'التباعد بين الكلمات', nameEn: 'Word Spacing', value: 'normal', options: ['tight', 'normal', 'wide'] },
  { id: 'text-rendering', name: 'عرض النص', nameEn: 'Text Rendering', value: 'optimizeLegibility', options: ['auto', 'optimizeSpeed', 'optimizeLegibility'] },
];

const sizeScale = [
  { name: 'عنوان رئيسي', nameEn: 'H1', size: '32px', weight: '700' },
  { name: 'عنوان ثانوي', nameEn: 'H2', size: '24px', weight: '700' },
  { name: 'عنوان فرعي', nameEn: 'H3', size: '20px', weight: '600' },
  { name: 'نص عادي', nameEn: 'Body', size: '16px', weight: '400' },
  { name: 'نص صغير', nameEn: 'Small', size: '14px', weight: '400' },
  { name: 'تسمية', nameEn: 'Caption', size: '12px', weight: '400' },
];

export default function ArabicTypographyPage() {
  const [selectedFont, setSelectedFont] = useState('cairo');
  const [settingValues, setSettingValues] = useState<Record<string, string>>({
    'line-height': '1.8',
    'letter-spacing': 'normal',
    'word-spacing': 'normal',
    'text-rendering': 'optimizeLegibility',
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إعدادات الطباعة العربية</h1>
          <p className="text-gray-500">Arabic Typography Settings - Fonts, sizes, and rendering</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-white hover:bg-teal-700">
          <Save className="h-4 w-4" />
          حفظ الإعدادات
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">6</p>
          <p className="text-sm text-gray-500">خطوط متاحة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">6</p>
          <p className="text-sm text-gray-500">مقاسات نصية</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">Cairo</p>
          <p className="text-sm text-gray-500">الخط الحالي</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">1.8</p>
          <p className="text-sm text-gray-500">ارتفاع السطر</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Font selector */}
        <div className="rounded-xl bg-white shadow p-6">
          <h2 className="text-lg font-semibold mb-4">اختيار الخط - Font Selection</h2>
          <div className="space-y-2">
            {fonts.map((font) => (
              <button
                key={font.id}
                onClick={() => setSelectedFont(font.id)}
                className={`w-full rounded-lg border-2 p-4 text-start transition ${selectedFont === font.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="font-semibold text-sm">{font.nameAr}</span>
                    <span className="text-xs text-gray-400 ms-2">{font.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{font.category}</span>
                    {selectedFont === font.id && <Check className="h-4 w-4 text-teal-600" />}
                  </div>
                </div>
                <p className="text-lg text-gray-700">{font.sample}</p>
                <p className="text-xs text-gray-400 mt-1">الأوزان: {font.weight}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Typography settings & scale */}
        <div className="space-y-6">
          <div className="rounded-xl bg-white shadow p-6">
            <h2 className="text-lg font-semibold mb-4">إعدادات الطباعة - Typography Settings</h2>
            <div className="space-y-4">
              {typographySettings.map((s) => (
                <div key={s.id}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium">{s.name} <span className="text-xs text-gray-400">({s.nameEn})</span></label>
                  </div>
                  <select
                    value={settingValues[s.id]}
                    onChange={(e) => setSettingValues({ ...settingValues, [s.id]: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 p-2 text-sm"
                  >
                    {s.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white shadow p-6">
            <h2 className="text-lg font-semibold mb-4">سلم المقاسات - Type Scale</h2>
            <div className="space-y-3">
              {sizeScale.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p style={{ fontSize: s.size, fontWeight: Number(s.weight) }} className="text-gray-900 leading-tight">
                      {s.name}
                    </p>
                    <p className="text-xs text-gray-400">{s.nameEn}</p>
                  </div>
                  <div className="text-end">
                    <p className="text-xs font-mono text-gray-500">{s.size}</p>
                    <p className="text-xs text-gray-400">وزن: {s.weight}</p>
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
