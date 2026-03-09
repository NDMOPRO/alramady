'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  GitCompare, FileText, ArrowLeftRight, CheckCircle, XCircle,
  AlertTriangle, Download, Eye, Plus, Search, Filter,
  TrendingUp, TrendingDown, Minus, BarChart3, Table,
} from 'lucide-react';

const reports = [
  { id: 1, name: 'التقرير المالي Q3 2024', pages: 24, date: '2024-10-15', format: 'PDF' },
  { id: 2, name: 'التقرير المالي Q4 2024', pages: 26, date: '2025-01-15', format: 'PDF' },
  { id: 3, name: 'تقرير المبيعات - نوفمبر', pages: 18, date: '2024-12-01', format: 'PDF' },
  { id: 4, name: 'تقرير المبيعات - ديسمبر', pages: 20, date: '2025-01-01', format: 'PDF' },
];

const comparisonData = [
  { metric: 'إجمالي الإيرادات', metricEn: 'Total Revenue', left: '4.2M', right: '4.8M', change: '+14.3%', direction: 'up' },
  { metric: 'صافي الربح', metricEn: 'Net Profit', left: '1.1M', right: '1.3M', change: '+18.2%', direction: 'up' },
  { metric: 'عدد العملاء', metricEn: 'Customers', left: '2,890', right: '3,200', change: '+10.7%', direction: 'up' },
  { metric: 'متوسط قيمة الطلب', metricEn: 'Avg Order Value', left: '1,450', right: '1,380', change: '-4.8%', direction: 'down' },
  { metric: 'نسبة الإرجاع', metricEn: 'Return Rate', left: '3.2%', right: '2.8%', change: '-12.5%', direction: 'down' },
  { metric: 'رضا العملاء', metricEn: 'Customer Satisfaction', left: '4.3', right: '4.5', change: '+4.7%', direction: 'up' },
  { metric: 'معدل التحويل', metricEn: 'Conversion Rate', left: '2.8%', right: '2.8%', change: '0%', direction: 'neutral' },
];

export default function ReportComparePage() {
  const [leftReport, setLeftReport] = useState<number>(1);
  const [rightReport, setRightReport] = useState<number>(2);
  const [showComparison, setShowComparison] = useState(true);

  const leftR = reports.find(r => r.id === leftReport);
  const rightR = reports.find(r => r.id === rightReport);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/reporting" className="hover:text-orange-600">محرك التقارير</Link>
            <span>/</span>
            <span>مقارنة التقارير</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">مقارنة التقارير</h1>
          <p className="text-gray-500">Report Comparison View</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <Download className="h-4 w-4" /> تصدير المقارنة
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-teal-600">7</p>
          <p className="text-sm text-gray-500">مقاييس للمقارنة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">5</p>
          <p className="text-sm text-gray-500">تحسن</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-red-600">1</p>
          <p className="text-sm text-gray-500">تراجع</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-gray-600">1</p>
          <p className="text-sm text-gray-500">بدون تغيير</p>
        </div>
      </div>

      {/* Report Selectors */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">التقرير الأول (A)</h3>
          <select value={leftReport} onChange={(e) => setLeftReport(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none">
            {reports.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {leftR && <p className="mt-2 text-xs text-gray-400">{leftR.format} - {leftR.pages} صفحة - {leftR.date}</p>}
        </div>
        <div className="flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100">
            <ArrowLeftRight className="h-6 w-6 text-teal-600" />
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">التقرير الثاني (B)</h3>
          <select value={rightReport} onChange={(e) => setRightReport(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none">
            {reports.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {rightR && <p className="mt-2 text-xs text-gray-400">{rightR.format} - {rightR.pages} صفحة - {rightR.date}</p>}
        </div>
      </div>

      {/* Comparison Table */}
      {showComparison && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="font-semibold text-gray-900">جدول المقارنة - Comparison Table</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-6 py-3 text-start font-medium text-gray-500">المقياس</th>
                  <th className="px-6 py-3 text-start font-medium text-blue-600">التقرير A</th>
                  <th className="px-6 py-3 text-start font-medium text-teal-600">التقرير B</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">التغيير</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">الاتجاه</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {comparisonData.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{row.metric}</p>
                      <p className="text-xs text-gray-400">{row.metricEn}</p>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-700">{row.left}</td>
                    <td className="px-6 py-4 font-medium text-gray-700">{row.right}</td>
                    <td className="px-6 py-4">
                      <span className={`font-medium ${
                        row.direction === 'up' ? 'text-green-600' :
                        row.direction === 'down' ? (row.metric === 'نسبة الإرجاع' ? 'text-green-600' : 'text-red-600') :
                        'text-gray-500'
                      }`}>{row.change}</span>
                    </td>
                    <td className="px-6 py-4">
                      {row.direction === 'up' && <TrendingUp className="h-5 w-5 text-green-500" />}
                      {row.direction === 'down' && <TrendingDown className={`h-5 w-5 ${row.metric === 'نسبة الإرجاع' ? 'text-green-500' : 'text-red-500'}`} />}
                      {row.direction === 'neutral' && <Minus className="h-5 w-5 text-gray-400" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-green-50 border border-green-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <h3 className="font-semibold text-green-800">تحسينات - Improvements</h3>
          </div>
          <ul className="space-y-1 text-sm text-green-700">
            <li>+ إجمالي الإيرادات ارتفع 14.3%</li>
            <li>+ صافي الربح ارتفع 18.2%</li>
            <li>+ عدد العملاء ارتفع 10.7%</li>
            <li>+ رضا العملاء ارتفع 4.7%</li>
            <li>+ نسبة الإرجاع انخفضت 12.5%</li>
          </ul>
        </div>
        <div className="rounded-xl bg-red-50 border border-red-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="font-semibold text-red-800">تراجعات - Declines</h3>
          </div>
          <ul className="space-y-1 text-sm text-red-700">
            <li>- متوسط قيمة الطلب انخفض 4.8%</li>
          </ul>
        </div>
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Minus className="h-5 w-5 text-gray-600" />
            <h3 className="font-semibold text-gray-800">بدون تغيير - Unchanged</h3>
          </div>
          <ul className="space-y-1 text-sm text-gray-700">
            <li>= معدل التحويل ثابت عند 2.8%</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
