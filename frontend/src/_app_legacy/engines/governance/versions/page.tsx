'use client';
import { useState } from 'react';

interface Version {
  id: string;
  version: string;
  title: string;
  author: string;
  timestamp: string;
  changes: number;
  status: 'current' | 'published' | 'draft' | 'archived';
  description: string;
}

const versions: Version[] = [
  { id: '1', version: 'v2.4.0', title: 'الإصدار الحالي', author: 'أحمد محمد', timestamp: '2025-03-04 09:00', changes: 12, status: 'current', description: 'تحديثات على محرك الذكاء الاصطناعي وإصلاحات' },
  { id: '2', version: 'v2.3.1', title: 'إصلاح أخطاء', author: 'عبدالله سعد', timestamp: '2025-03-01 14:30', changes: 5, status: 'published', description: 'إصلاح مشاكل في التصدير والطباعة' },
  { id: '3', version: 'v2.3.0', title: 'تحديث القوالب', author: 'سارة علي', timestamp: '2025-02-25 10:00', changes: 18, status: 'published', description: 'إضافة 8 قوالب جديدة وتحسين المحرر' },
  { id: '4', version: 'v2.2.0', title: 'محرك التحويل', author: 'محمد خالد', timestamp: '2025-02-15 11:00', changes: 24, status: 'published', description: 'إطلاق محرك التحويل الشامل' },
  { id: '5', version: 'v2.5.0-beta', title: 'إصدار تجريبي', author: 'فاطمة أحمد', timestamp: '2025-03-04 12:00', changes: 8, status: 'draft', description: 'ميزات جديدة قيد التطوير' },
  { id: '6', version: 'v2.1.0', title: 'تحديث الحوكمة', author: 'أحمد محمد', timestamp: '2025-01-20 09:00', changes: 15, status: 'archived', description: 'تحسينات نظام الصلاحيات والتدقيق' },
];

const statusConfig: Record<string, { label: string; color: string }> = {
  current: { label: 'الحالي', color: 'bg-green-100 text-green-700' },
  published: { label: 'منشور', color: 'bg-blue-100 text-blue-700' },
  draft: { label: 'مسودة', color: 'bg-amber-100 text-amber-700' },
  archived: { label: 'مؤرشف', color: 'bg-gray-100 text-gray-500' },
};

export default function VersionsPage() {
  const [selected, setSelected] = useState<string | null>('1');

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">تاريخ الإصدارات</h1>
          <p className="text-gray-500">Version History Timeline</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + إنشاء إصدار
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'الإصدار الحالي', value: 'v2.4.0', color: 'bg-green-50 text-green-700' },
          { label: 'إجمالي الإصدارات', value: versions.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'إجمالي التغييرات', value: versions.reduce((a, v) => a + v.changes, 0), color: 'bg-purple-50 text-purple-700' },
          { label: 'المسودات', value: versions.filter(v => v.status === 'draft').length, color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl shadow p-6">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute top-0 bottom-0 right-6 w-0.5 bg-gray-200" />

          <div className="space-y-6">
            {versions.map((ver) => (
              <div
                key={ver.id}
                onClick={() => setSelected(selected === ver.id ? null : ver.id)}
                className="relative pr-16 cursor-pointer"
              >
                {/* Timeline dot */}
                <div className={`absolute right-4 w-5 h-5 rounded-full border-2 border-white shadow ${
                  ver.status === 'current' ? 'bg-green-500' :
                  ver.status === 'draft' ? 'bg-amber-500' :
                  ver.status === 'archived' ? 'bg-gray-400' : 'bg-blue-500'
                }`} />

                <div className={`rounded-xl border p-4 transition ${
                  selected === ver.id ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono font-bold text-blue-600">{ver.version}</span>
                    <span className="font-medium">{ver.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[ver.status].color}`}>
                      {statusConfig[ver.status].label}
                    </span>
                    <span className="text-xs text-gray-400 mr-auto">{ver.timestamp}</span>
                  </div>
                  {selected === ver.id && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-600 mb-2">{ver.description}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>المؤلف: {ver.author}</span>
                        <span>{ver.changes} تغيير</span>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-blue-700">عرض التفاصيل</button>
                        <button className="border border-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50">مقارنة</button>
                        {ver.status !== 'current' && (
                          <button className="border border-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50">استعادة</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
