'use client';

import { useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Play, RefreshCw, FileSearch, Clock } from 'lucide-react';

const qualityChecks = [
  { id: 1, name: 'تناسق الترجمة', nameEn: 'Translation Consistency', desc: 'فحص تناسق المصطلحات المترجمة', status: 'pass', score: 98 },
  { id: 2, name: 'اكتمال الترجمة', nameEn: 'Translation Completeness', desc: 'التأكد من ترجمة جميع النصوص', status: 'pass', score: 100 },
  { id: 3, name: 'صحة RTL', nameEn: 'RTL Correctness', desc: 'التحقق من صحة اتجاه النص', status: 'pass', score: 97 },
  { id: 4, name: 'تنسيق الأرقام', nameEn: 'Number Formatting', desc: 'فحص تنسيق الأرقام والتواريخ', status: 'warning', score: 85 },
  { id: 5, name: 'الإملاء والنحو', nameEn: 'Spelling & Grammar', desc: 'فحص الأخطاء الإملائية والنحوية', status: 'pass', score: 96 },
  { id: 6, name: 'طول النص', nameEn: 'Text Length', desc: 'التحقق من تجاوز النص للحدود المسموحة', status: 'fail', score: 72 },
  { id: 7, name: 'الخطوط المفقودة', nameEn: 'Missing Fonts', desc: 'التأكد من توفر جميع الخطوط المطلوبة', status: 'pass', score: 100 },
  { id: 8, name: 'الصور النصية', nameEn: 'Text in Images', desc: 'كشف نصوص غير مترجمة في الصور', status: 'warning', score: 80 },
];

const recentReports = [
  { id: 1, doc: 'التقرير السنوي 2025', date: '2026-03-04', overall: 94, checks: 8, passed: 6, warnings: 1, failed: 1 },
  { id: 2, doc: 'لوحة المبيعات', date: '2026-03-03', overall: 98, checks: 8, passed: 8, warnings: 0, failed: 0 },
  { id: 3, doc: 'دليل المستخدم', date: '2026-03-02', overall: 87, checks: 8, passed: 5, warnings: 2, failed: 1 },
];

export default function QualityGatePage() {
  const [running, setRunning] = useState(false);

  const passCount = qualityChecks.filter(c => c.status === 'pass').length;
  const warnCount = qualityChecks.filter(c => c.status === 'warning').length;
  const failCount = qualityChecks.filter(c => c.status === 'fail').length;
  const overallScore = Math.round(qualityChecks.reduce((sum, c) => sum + c.score, 0) / qualityChecks.length);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">بوابة جودة التعريب</h1>
          <p className="text-gray-500">Localization Quality Gate - Automated quality checks</p>
        </div>
        <button
          onClick={() => setRunning(!running)}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-white hover:bg-teal-700"
        >
          {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'جارٍ الفحص...' : 'بدء الفحص'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className={`text-3xl font-bold ${overallScore >= 90 ? 'text-green-600' : overallScore >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>{overallScore}%</p>
          <p className="text-sm text-gray-500">الجودة الإجمالية</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-green-600">{passCount}</p>
          <p className="text-sm text-gray-500">فحوصات ناجحة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-yellow-600">{warnCount}</p>
          <p className="text-sm text-gray-500">تحذيرات</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-red-600">{failCount}</p>
          <p className="text-sm text-gray-500">فشل</p>
        </div>
      </div>

      {/* Overall progress */}
      <div className="rounded-xl bg-white shadow p-4">
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="font-medium">درجة الجودة - Quality Score</span>
          <span className={`font-bold ${overallScore >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>{overallScore}%</span>
        </div>
        <div className="h-4 rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${overallScore >= 90 ? 'bg-green-500' : overallScore >= 75 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${overallScore}%` }}
          />
        </div>
      </div>

      {/* Quality checks */}
      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">فحوصات الجودة - Quality Checks</h2>
        <div className="space-y-3">
          {qualityChecks.map((check) => (
            <div key={check.id} className={`flex items-center justify-between rounded-lg border p-4 ${check.status === 'fail' ? 'border-red-200 bg-red-50/30' : check.status === 'warning' ? 'border-yellow-200 bg-yellow-50/30' : ''}`}>
              <div className="flex items-center gap-3">
                {check.status === 'pass' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                ) : check.status === 'warning' ? (
                  <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                )}
                <div>
                  <p className="font-medium text-sm">{check.name}</p>
                  <p className="text-xs text-gray-400">{check.nameEn} - {check.desc}</p>
                </div>
              </div>
              <div className="text-end shrink-0">
                <p className={`text-lg font-bold ${check.score >= 90 ? 'text-green-600' : check.score >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>{check.score}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent reports */}
      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">تقارير سابقة - Previous Reports</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="pb-2 text-start font-medium">المستند</th>
                <th className="pb-2 text-start font-medium">التاريخ</th>
                <th className="pb-2 text-start font-medium">الجودة</th>
                <th className="pb-2 text-start font-medium">ناجح</th>
                <th className="pb-2 text-start font-medium">تحذير</th>
                <th className="pb-2 text-start font-medium">فاشل</th>
              </tr>
            </thead>
            <tbody>
              {recentReports.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-3 font-medium">{r.doc}</td>
                  <td className="py-3 text-gray-500">{r.date}</td>
                  <td className="py-3">
                    <span className={`font-bold ${r.overall >= 90 ? 'text-green-600' : r.overall >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>{r.overall}%</span>
                  </td>
                  <td className="py-3 text-green-600">{r.passed}</td>
                  <td className="py-3 text-yellow-600">{r.warnings}</td>
                  <td className="py-3 text-red-600">{r.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
