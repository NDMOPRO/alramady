'use client';
import { useState } from 'react';

interface Integration {
  id: string;
  name: string;
  nameEn: string;
  engine: string;
  status: 'active' | 'inactive' | 'error';
  lastSync: string;
  description: string;
}

const integrations: Integration[] = [
  { id: '1', name: 'محرك الذكاء الاصطناعي', nameEn: 'AI Engine', engine: 'AI', status: 'active', lastSync: 'منذ 5 دقائق', description: 'تكامل مع تحليلات الذكاء الاصطناعي' },
  { id: '2', name: 'محرك التحويل', nameEn: 'Conversion Engine', engine: 'Conversion', status: 'active', lastSync: 'منذ 10 دقائق', description: 'ربط تنسيقات التحويل' },
  { id: '3', name: 'محرك المكتبة', nameEn: 'Library Engine', engine: 'Library', status: 'active', lastSync: 'منذ 15 دقيقة', description: 'مزامنة الأصول والوسائط' },
  { id: '4', name: 'محرك القوالب', nameEn: 'Template Engine', engine: 'Template', status: 'inactive', lastSync: 'منذ ساعتين', description: 'ربط القوالب والسمات' },
  { id: '5', name: 'نظام خارجي - SAP', nameEn: 'SAP External', engine: 'External', status: 'error', lastSync: 'فشل', description: 'تكامل مع نظام SAP' },
];

const statusConfig = {
  active: { label: 'نشط', color: 'bg-green-100 text-green-700' },
  inactive: { label: 'غير نشط', color: 'bg-gray-100 text-gray-500' },
  error: { label: 'خطأ', color: 'bg-red-100 text-red-700' },
};

export default function IntegrationPage() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">لوحة التكامل</h1>
          <p className="text-gray-500">Cross-Engine Integration Panel</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + إضافة تكامل
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'تكاملات نشطة', value: integrations.filter(i => i.status === 'active').length, color: 'bg-green-50 text-green-700' },
          { label: 'إجمالي التكاملات', value: integrations.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'أخطاء', value: integrations.filter(i => i.status === 'error').length, color: 'bg-red-50 text-red-700' },
          { label: 'آخر مزامنة', value: '5 د', color: 'bg-purple-50 text-purple-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {integrations.map(intg => (
          <div
            key={intg.id}
            onClick={() => setSelected(selected === intg.id ? null : intg.id)}
            className={`bg-white rounded-xl shadow border cursor-pointer transition ${
              selected === intg.id ? 'border-blue-500' : 'border-gray-100 hover:border-gray-200'
            }`}
          >
            <div className="flex items-center gap-4 p-5">
              <div className={`w-3 h-3 rounded-full ${intg.status === 'active' ? 'bg-green-500' : intg.status === 'error' ? 'bg-red-500' : 'bg-gray-400'}`} />
              <div className="flex-1">
                <h3 className="font-bold text-sm">{intg.name}</h3>
                <p className="text-xs text-gray-400">{intg.nameEn}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${statusConfig[intg.status].color}`}>
                {statusConfig[intg.status].label}
              </span>
              <span className="text-xs text-gray-400">{intg.lastSync}</span>
            </div>
            {selected === intg.id && (
              <div className="border-t p-5 bg-gray-50">
                <p className="text-sm text-gray-600 mb-3">{intg.description}</p>
                <div className="flex gap-2">
                  <button className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">مزامنة الآن</button>
                  <button className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm hover:bg-white">إعدادات</button>
                  {intg.status === 'error' && (
                    <button className="border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-sm hover:bg-red-50">عرض الخطأ</button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
