'use client';
import { useState } from 'react';

interface QuickAction {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  icon: string;
  category: string;
  executionTime: string;
  lastUsed: string;
  usageCount: number;
}

const actions: QuickAction[] = [
  { id: '1', title: 'نشر التقرير', titleEn: 'Publish Report', description: 'نشر التقرير الحالي لجميع الأطراف', icon: '📤', category: 'نشر', executionTime: '~2s', lastUsed: 'اليوم', usageCount: 45 },
  { id: '2', title: 'تصدير شامل', titleEn: 'Full Export', description: 'تصدير جميع البيانات بتنسيق PDF + Excel', icon: '📦', category: 'تصدير', executionTime: '~10s', lastUsed: 'أمس', usageCount: 23 },
  { id: '3', title: 'نسخ احتياطي', titleEn: 'Backup', description: 'إنشاء نسخة احتياطية كاملة', icon: '💾', category: 'نظام', executionTime: '~30s', lastUsed: 'منذ 3 أيام', usageCount: 12 },
  { id: '4', title: 'مزامنة البيانات', titleEn: 'Sync Data', description: 'مزامنة البيانات مع جميع المحركات', icon: '🔄', category: 'نظام', executionTime: '~5s', lastUsed: 'اليوم', usageCount: 67 },
  { id: '5', title: 'إنشاء تقرير سريع', titleEn: 'Quick Report', description: 'إنشاء تقرير ملخص تلقائي', icon: '📊', category: 'تقارير', executionTime: '~8s', lastUsed: 'اليوم', usageCount: 34 },
  { id: '6', title: 'إرسال إشعارات', titleEn: 'Send Notifications', description: 'إرسال إشعارات لجميع أعضاء الفريق', icon: '🔔', category: 'تواصل', executionTime: '~1s', lastUsed: 'أمس', usageCount: 56 },
];

export default function OneClickPage() {
  const [executing, setExecuting] = useState<string | null>(null);

  const handleExecute = (id: string) => {
    setExecuting(id);
    setTimeout(() => setExecuting(null), 2000);
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">عمليات بنقرة واحدة</h1>
          <p className="text-gray-500">One-Click Operations Panel</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + إنشاء عملية
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'العمليات المتاحة', value: actions.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'تنفيذات اليوم', value: 28, color: 'bg-green-50 text-green-700' },
          { label: 'متوسط الوقت', value: '5s', color: 'bg-purple-50 text-purple-700' },
          { label: 'نسبة النجاح', value: '99%', color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {actions.map(action => (
          <div key={action.id} className="bg-white rounded-xl shadow border border-gray-100 p-5">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-3xl">{action.icon}</span>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900">{action.title}</h3>
                <p className="text-xs text-gray-400">{action.titleEn}</p>
              </div>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{action.executionTime}</span>
            </div>
            <p className="text-sm text-gray-600 mb-3">{action.description}</p>
            <div className="flex justify-between items-center text-xs text-gray-400 mb-3">
              <span>آخر استخدام: {action.lastUsed}</span>
              <span>{action.usageCount} مرة</span>
            </div>
            <button
              onClick={() => handleExecute(action.id)}
              disabled={executing === action.id}
              className={`w-full py-2 rounded-lg text-sm font-medium transition ${
                executing === action.id
                  ? 'bg-green-100 text-green-700 cursor-wait'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {executing === action.id ? 'جاري التنفيذ...' : 'تنفيذ'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
