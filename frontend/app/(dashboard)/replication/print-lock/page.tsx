'use client';

import { useState } from 'react';
import { Lock, Unlock, Printer, Shield, ToggleLeft, ToggleRight, Save, AlertTriangle, FileCheck } from 'lucide-react';

const lockSettings = [
  { id: 'margins', name: 'هوامش الصفحة', nameEn: 'Page Margins', desc: 'قفل الهوامش العلوية والسفلية والجانبية', locked: true },
  { id: 'headers', name: 'رأس وتذييل', nameEn: 'Headers & Footers', desc: 'قفل محتوى وتنسيق الرأس والتذييل', locked: true },
  { id: 'fonts', name: 'الخطوط والأحجام', nameEn: 'Fonts & Sizes', desc: 'قفل نوع الخط والحجم عند الطباعة', locked: true },
  { id: 'colors', name: 'ألوان الطباعة', nameEn: 'Print Colors', desc: 'ضمان تطابق الألوان عند الطباعة', locked: false },
  { id: 'scaling', name: 'التحجيم', nameEn: 'Scaling', desc: 'قفل نسبة التحجيم ومنع التغيير التلقائي', locked: true },
  { id: 'orientation', name: 'اتجاه الصفحة', nameEn: 'Orientation', desc: 'قفل الاتجاه (عمودي/أفقي)', locked: true },
  { id: 'page-breaks', name: 'فواصل الصفحات', nameEn: 'Page Breaks', desc: 'قفل مواضع فواصل الصفحات', locked: false },
  { id: 'watermark', name: 'العلامة المائية', nameEn: 'Watermark', desc: 'تطبيق علامة مائية محمية عند الطباعة', locked: true },
];

export default function PrintLockPage() {
  const [settings, setSettings] = useState(lockSettings);

  const toggleSetting = (id: string) => {
    setSettings(settings.map(s => s.id === id ? { ...s, locked: !s.locked } : s));
  };

  const lockedCount = settings.filter(s => s.locked).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إعدادات قفل الطباعة</h1>
          <p className="text-gray-500">Print Lock Settings - Ensure print output consistency</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
          <Save className="h-4 w-4" />
          حفظ الإعدادات
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-indigo-600">{lockedCount}</p>
          <p className="text-sm text-gray-500">إعدادات مقفلة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-gray-400">{settings.length - lockedCount}</p>
          <p className="text-sm text-gray-500">إعدادات مفتوحة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-green-600">12</p>
          <p className="text-sm text-gray-500">طباعة ناجحة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-indigo-600">A4</p>
          <p className="text-sm text-gray-500">حجم الورق</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => setSettings(settings.map(s => ({ ...s, locked: true })))}
          className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100"
        >
          <Lock className="h-4 w-4" /> قفل الكل
        </button>
        <button
          onClick={() => setSettings(settings.map(s => ({ ...s, locked: false })))}
          className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700 hover:bg-green-100"
        >
          <Unlock className="h-4 w-4" /> فتح الكل
        </button>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-100">
          <Printer className="h-4 w-4" /> طباعة تجريبية
        </button>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-100">
          <FileCheck className="h-4 w-4" /> فحص التوافق
        </button>
      </div>

      {/* Settings list */}
      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">إعدادات القفل - Lock Settings</h2>
        <div className="space-y-3">
          {settings.map((s) => (
            <div key={s.id} className={`flex items-center justify-between rounded-lg border p-4 transition ${s.locked ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200'}`}>
              <div className="flex items-center gap-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.locked ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                  {s.locked ? <Lock className="h-5 w-5 text-indigo-600" /> : <Unlock className="h-5 w-5 text-gray-400" />}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.nameEn}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                </div>
              </div>
              <button onClick={() => toggleSetting(s.id)} className="shrink-0">
                {s.locked
                  ? <ToggleRight className="h-8 w-8 text-indigo-600" />
                  : <ToggleLeft className="h-8 w-8 text-gray-400" />
                }
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-yellow-800">ملاحظة حول قفل الطباعة</p>
          <p className="text-xs text-yellow-700 mt-1">
            الإعدادات المقفلة تضمن أن المخرجات المطبوعة تطابق التصميم الأصلي. فتح إعداد قد يسبب اختلافات بين المعاينة والطباعة الفعلية.
          </p>
          <p className="text-xs text-yellow-600 mt-1">Locked settings ensure printed output matches the original design. Unlocking may cause print discrepancies.</p>
        </div>
      </div>
    </div>
  );
}
