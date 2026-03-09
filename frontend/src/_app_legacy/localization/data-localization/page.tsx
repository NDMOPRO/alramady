'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { BarChart, PieChart, TrendingUp, Hash, Calendar, DollarSign, Percent, Save, Settings } from 'lucide-react';

const formatSettings = [
  { id: 'numbers', name: 'تنسيق الأرقام', nameEn: 'Number Format', icon: Hash, current: '١٢٣٬٤٥٦٫٧٨', options: ['1,234.56 (Western)', '١٬٢٣٤٫٥٦ (Arabic-Indic)', '1.234,56 (European)'] },
  { id: 'currency', name: 'تنسيق العملة', nameEn: 'Currency Format', icon: DollarSign, current: '١٢٬٣٤٥ ر.س', options: ['12,345 SAR', '١٢٬٣٤٥ ر.س', 'SAR 12,345'] },
  { id: 'percentage', name: 'تنسيق النسب', nameEn: 'Percentage Format', icon: Percent, current: '٪٧٥٫٥', options: ['75.5%', '٪٧٥٫٥', '75,5%'] },
  { id: 'date', name: 'تنسيق التاريخ', nameEn: 'Date Format', icon: Calendar, current: '٤ مارس ٢٠٢٦', options: ['2026-03-04', '٤ مارس ٢٠٢٦', '04/03/2026', '٤ ربيع الأول ١٤٤٧'] },
];

const chartLocalization = [
  { id: 'axis-labels', name: 'تسميات المحاور', nameEn: 'Axis Labels', desc: 'ترجمة تسميات محاور الرسوم البيانية', enabled: true },
  { id: 'legends', name: 'المفاتيح', nameEn: 'Legends', desc: 'ترجمة مفاتيح الرسوم البيانية', enabled: true },
  { id: 'tooltips', name: 'التلميحات', nameEn: 'Tooltips', desc: 'ترجمة تلميحات البيانات', enabled: true },
  { id: 'data-labels', name: 'تسميات البيانات', nameEn: 'Data Labels', desc: 'تنسيق قيم البيانات المعروضة', enabled: true },
  { id: 'axis-direction', name: 'اتجاه المحور', nameEn: 'Axis Direction', desc: 'عكس اتجاه المحور الأفقي لـ RTL', enabled: false },
];

export default function DataLocalizationPage() {
  const [selectedFormat, setSelectedFormat] = useState<Record<string, number>>({
    numbers: 1, currency: 1, percentage: 1, date: 1,
  });
  const [locData, setLocData] = useState<any[]>([]);

  useEffect(() => {
    api.get('/api/localization/data').then((res: any) => setLocData(res.data || [])).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">توطين البيانات والرسوم</h1>
          <p className="text-gray-500">Data & Chart Localization - Localize numbers, dates, and charts</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-white hover:bg-teal-700">
          <Save className="h-4 w-4" />
          حفظ الإعدادات
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">4</p>
          <p className="text-sm text-gray-500">أنواع تنسيقات</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">5</p>
          <p className="text-sm text-gray-500">إعدادات رسوم</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">AR</p>
          <p className="text-sm text-gray-500">اللغة الحالية</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">هجري</p>
          <p className="text-sm text-gray-500">نظام التقويم</p>
        </div>
      </div>

      {/* Format settings */}
      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">تنسيقات البيانات - Data Formats</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {formatSettings.map((fmt) => {
            const Icon = fmt.icon;
            return (
              <div key={fmt.id} className="rounded-lg border p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
                    <Icon className="h-5 w-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{fmt.name}</p>
                    <p className="text-xs text-gray-400">{fmt.nameEn}</p>
                  </div>
                </div>
                <p className="text-lg font-bold text-teal-700 mb-2 font-mono">{fmt.current}</p>
                <select
                  value={selectedFormat[fmt.id]}
                  onChange={(e) => setSelectedFormat({ ...selectedFormat, [fmt.id]: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 p-2 text-sm"
                >
                  {fmt.options.map((opt, i) => (
                    <option key={i} value={i}>{opt}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chart localization */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white shadow p-6">
          <h2 className="text-lg font-semibold mb-4">توطين الرسوم البيانية - Chart Localization</h2>
          <div className="space-y-3">
            {chartLocalization.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.nameEn} - {item.desc}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${item.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {item.enabled ? 'مفعّل' : 'معطّل'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Sample chart preview */}
        <div className="rounded-xl bg-white shadow p-6">
          <h2 className="text-lg font-semibold mb-4">معاينة البيانات المحلية - Localized Preview</h2>
          <div className="space-y-3">
            {locData.map((d) => (
              <div key={d.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">{d.label} <span className="text-xs text-gray-400">({d.labelEn})</span></span>
                  <span className="font-mono text-teal-700">{d.value.toLocaleString('ar-SA')} ر.س</span>
                </div>
                <div className="h-4 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(d.value / 125000) * 100}%`, backgroundColor: d.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-2 text-center text-xs text-gray-500">
            <div className="rounded bg-gray-50 p-2">
              <p className="font-bold text-teal-700 text-base">٤ مارس ٢٠٢٦</p>
              <p>تاريخ التقرير</p>
            </div>
            <div className="rounded bg-gray-50 p-2">
              <p className="font-bold text-teal-700 text-base">٪٢٨٫٨</p>
              <p>نسبة الربح</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
