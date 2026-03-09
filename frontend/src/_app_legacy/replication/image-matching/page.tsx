'use client';

import { useState } from 'react';
import { Image, Upload, ScanLine, CheckCircle2, XCircle, Eye, ZoomIn, Columns } from 'lucide-react';

const matchResults = [
  { id: 1, area: 'الرأس / Header', similarity: 98, status: 'pass', details: 'تطابق شبه تام في الشعار والعنوان' },
  { id: 2, area: 'الرسم البياني / Chart', similarity: 95, status: 'pass', details: 'تطابق في النوع والبيانات مع اختلاف طفيف في الألوان' },
  { id: 3, area: 'الجدول / Table', similarity: 92, status: 'pass', details: 'بنية متطابقة مع اختلاف بسيط في التنسيق' },
  { id: 4, area: 'التذييل / Footer', similarity: 78, status: 'warning', details: 'اختلاف في رقم الصفحة والتاريخ' },
  { id: 5, area: 'الصور / Images', similarity: 65, status: 'fail', details: 'صورة مفقودة في الجانب الأيسر' },
];

export default function ImageMatchingPage() {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'overlay' | 'diff'>('side-by-side');

  const overallScore = Math.round(matchResults.reduce((sum, r) => sum + r.similarity, 0) / matchResults.length);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المطابقة البصرية</h1>
          <p className="text-gray-500">Image-Based Dashboard Matching - Visual comparison</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
          <ScanLine className="h-4 w-4" />
          بدء المسح
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className={`text-3xl font-bold ${overallScore >= 90 ? 'text-green-600' : overallScore >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>{overallScore}%</p>
          <p className="text-sm text-gray-500">التطابق الإجمالي</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-green-600">3</p>
          <p className="text-sm text-gray-500">مناطق متطابقة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-yellow-600">1</p>
          <p className="text-sm text-gray-500">تحذيرات</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-red-600">1</p>
          <p className="text-sm text-gray-500">فشل</p>
        </div>
      </div>

      {/* Upload area */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/30 p-8 text-center">
          <Upload className="mx-auto h-10 w-10 text-indigo-400 mb-2" />
          <p className="font-medium text-gray-700">المستند الأصلي</p>
          <p className="text-sm text-gray-500">Original Document</p>
          <button className="mt-3 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm text-white">رفع ملف</button>
        </div>
        <div className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/30 p-8 text-center">
          <Upload className="mx-auto h-10 w-10 text-indigo-400 mb-2" />
          <p className="font-medium text-gray-700">المستند المُكرر</p>
          <p className="text-sm text-gray-500">Replicated Document</p>
          <button className="mt-3 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm text-white">رفع ملف</button>
        </div>
      </div>

      {/* View mode */}
      <div className="rounded-xl bg-white shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">المقارنة البصرية - Visual Comparison</h2>
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {[
              { id: 'side-by-side' as const, label: 'جنباً لجنب', icon: Columns },
              { id: 'overlay' as const, label: 'تراكب', icon: Eye },
              { id: 'diff' as const, label: 'فروقات', icon: ZoomIn },
            ].map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id)}
                  className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs ${viewMode === mode.id ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {mode.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className={`${viewMode === 'side-by-side' ? 'grid grid-cols-2 gap-4' : ''}`}>
          <div className="aspect-video rounded-lg bg-gray-100 flex items-center justify-center border">
            <div className="text-center text-gray-400">
              <Image className="mx-auto h-10 w-10 mb-1" />
              <p className="text-sm">الأصل</p>
            </div>
          </div>
          {viewMode === 'side-by-side' && (
            <div className="aspect-video rounded-lg bg-gray-100 flex items-center justify-center border">
              <div className="text-center text-gray-400">
                <Image className="mx-auto h-10 w-10 mb-1" />
                <p className="text-sm">النسخة</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">نتائج المطابقة - Match Results</h2>
        <div className="space-y-3">
          {matchResults.map((r) => (
            <div key={r.id} className={`flex items-center justify-between rounded-lg border p-4 ${r.status === 'fail' ? 'border-red-200 bg-red-50/30' : r.status === 'warning' ? 'border-yellow-200 bg-yellow-50/30' : ''}`}>
              <div className="flex items-center gap-3">
                {r.status === 'pass' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : r.status === 'warning' ? <CheckCircle2 className="h-5 w-5 text-yellow-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
                <div>
                  <p className="font-medium text-sm">{r.area}</p>
                  <p className="text-xs text-gray-500">{r.details}</p>
                </div>
              </div>
              <div className="text-end">
                <p className={`text-lg font-bold ${r.similarity >= 90 ? 'text-green-600' : r.similarity >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>{r.similarity}%</p>
                <p className="text-xs text-gray-400">تطابق</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
