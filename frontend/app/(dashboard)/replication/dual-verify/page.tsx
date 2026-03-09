'use client';

import { useState } from 'react';
import { ShieldCheck, UserCheck, Bot, CheckCircle2, XCircle, Clock, ArrowRight, Eye, ThumbsUp, ThumbsDown } from 'lucide-react';

const verificationQueue = [
  { id: 1, doc: 'التقرير السنوي 2025', aiScore: 97, aiStatus: 'pass', humanStatus: 'approved', reviewer: 'أحمد محمد', date: '2026-03-03' },
  { id: 2, doc: 'لوحة المبيعات Q4', aiScore: 94, aiStatus: 'pass', humanStatus: 'pending', reviewer: '--', date: '2026-03-04' },
  { id: 3, doc: 'تقرير الأداء الشهري', aiScore: 82, aiStatus: 'warning', humanStatus: 'pending', reviewer: '--', date: '2026-03-04' },
  { id: 4, doc: 'ملخص الميزانية', aiScore: 71, aiStatus: 'fail', humanStatus: 'rejected', reviewer: 'سارة العلي', date: '2026-03-02' },
  { id: 5, doc: 'تقرير المخاطر', aiScore: 96, aiStatus: 'pass', humanStatus: 'approved', reviewer: 'خالد الحربي', date: '2026-03-01' },
];

export default function DualVerifyPage() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const filtered = filter === 'all' ? verificationQueue : verificationQueue.filter(v => v.humanStatus === filter);

  const approved = verificationQueue.filter(v => v.humanStatus === 'approved').length;
  const pending = verificationQueue.filter(v => v.humanStatus === 'pending').length;
  const rejected = verificationQueue.filter(v => v.humanStatus === 'rejected').length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">بوابة التحقق المزدوج</h1>
          <p className="text-gray-500">Dual Verification Gate - AI + Human review pipeline</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
          <ShieldCheck className="h-4 w-4" />
          مراجعة المعلق
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-indigo-600">{verificationQueue.length}</p>
          <p className="text-sm text-gray-500">إجمالي التحققات</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-green-600">{approved}</p>
          <p className="text-sm text-gray-500">موافق عليها</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-yellow-600">{pending}</p>
          <p className="text-sm text-gray-500">معلقة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-red-600">{rejected}</p>
          <p className="text-sm text-gray-500">مرفوضة</p>
        </div>
      </div>

      {/* Dual gate visualization */}
      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">آلية التحقق المزدوج - Dual Verification Flow</h2>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-center min-w-[140px]">
            <Bot className="mx-auto h-8 w-8 text-blue-600 mb-1" />
            <p className="font-semibold text-sm">تحقق AI</p>
            <p className="text-xs text-gray-400">AI Verification</p>
          </div>
          <ArrowRight className="h-6 w-6 text-gray-400 shrink-0" />
          <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4 text-center min-w-[140px]">
            <ShieldCheck className="mx-auto h-8 w-8 text-gray-400 mb-1" />
            <p className="font-semibold text-sm">بوابة القرار</p>
            <p className="text-xs text-gray-400">Decision Gate</p>
          </div>
          <ArrowRight className="h-6 w-6 text-gray-400 shrink-0" />
          <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4 text-center min-w-[140px]">
            <UserCheck className="mx-auto h-8 w-8 text-green-600 mb-1" />
            <p className="font-semibold text-sm">مراجعة بشرية</p>
            <p className="text-xs text-gray-400">Human Review</p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'all' as const, label: 'الكل', count: verificationQueue.length },
          { id: 'pending' as const, label: 'معلق', count: pending },
          { id: 'approved' as const, label: 'موافق', count: approved },
          { id: 'rejected' as const, label: 'مرفوض', count: rejected },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${filter === f.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Queue */}
      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">قائمة التحقق - Verification Queue</h2>
        <div className="space-y-3">
          {filtered.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg text-sm font-bold ${v.aiScore >= 90 ? 'bg-green-100 text-green-700' : v.aiScore >= 75 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                    {v.aiScore}%
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">AI</p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{v.doc}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                    <span>{v.date}</span>
                    {v.reviewer !== '--' && <span>المراجع: {v.reviewer}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-xs ${v.humanStatus === 'approved' ? 'bg-green-100 text-green-700' : v.humanStatus === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {v.humanStatus === 'approved' ? 'موافق' : v.humanStatus === 'rejected' ? 'مرفوض' : 'معلق'}
                </span>
                {v.humanStatus === 'pending' && (
                  <div className="flex gap-1">
                    <button className="rounded p-1.5 hover:bg-green-50" title="موافقة"><ThumbsUp className="h-4 w-4 text-green-600" /></button>
                    <button className="rounded p-1.5 hover:bg-red-50" title="رفض"><ThumbsDown className="h-4 w-4 text-red-600" /></button>
                    <button className="rounded p-1.5 hover:bg-gray-100" title="معاينة"><Eye className="h-4 w-4 text-gray-400" /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
