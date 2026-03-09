'use client';
import { useState } from 'react';

interface KPI {
  id: number;
  name: string;
  nameEn: string;
  value: number;
  target: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  category: string;
  aiGenerated: boolean;
}

const kpis: KPI[] = [
  { id: 1, name: 'معدل النمو', nameEn: 'Growth Rate', value: 15.2, target: 20, unit: '%', trend: 'up', category: 'مالي', aiGenerated: true },
  { id: 2, name: 'رضا العملاء', nameEn: 'Customer Satisfaction', value: 88, target: 90, unit: '%', trend: 'up', category: 'عملاء', aiGenerated: false },
  { id: 3, name: 'كفاءة التشغيل', nameEn: 'Operational Efficiency', value: 92, target: 95, unit: '%', trend: 'stable', category: 'تشغيل', aiGenerated: true },
  { id: 4, name: 'معدل التحويل', nameEn: 'Conversion Rate', value: 3.8, target: 5, unit: '%', trend: 'down', category: 'مبيعات', aiGenerated: true },
  { id: 5, name: 'تكلفة الاستحواذ', nameEn: 'Acquisition Cost', value: 245, target: 200, unit: 'ر.س', trend: 'down', category: 'مالي', aiGenerated: true },
  { id: 6, name: 'وقت الاستجابة', nameEn: 'Response Time', value: 1.2, target: 1, unit: 's', trend: 'up', category: 'تشغيل', aiGenerated: false },
];

const categories = ['الكل', 'مالي', 'عملاء', 'تشغيل', 'مبيعات'];

export default function KPIAdvancedPage() {
  const [filter, setFilter] = useState('الكل');
  const [showAIOnly, setShowAIOnly] = useState(false);

  const filtered = kpis.filter(k =>
    (filter === 'الكل' || k.category === filter) &&
    (!showAIOnly || k.aiGenerated)
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مؤشرات الأداء المتقدمة</h1>
          <p className="text-gray-500">Advanced KPI Dashboard - AI-Generated Metrics</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + إنشاء مؤشر
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي المؤشرات', value: 32, color: 'bg-blue-50 text-blue-700' },
          { label: 'مؤشرات AI', value: 18, color: 'bg-purple-50 text-purple-700' },
          { label: 'ضمن الهدف', value: '72%', color: 'bg-green-50 text-green-700' },
          { label: 'تحتاج اهتمام', value: 5, color: 'bg-red-50 text-red-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                filter === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 mr-auto">
          <input type="checkbox" checked={showAIOnly} onChange={e => setShowAIOnly(e.target.checked)} className="rounded" />
          مؤشرات AI فقط
        </label>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(kpi => {
          const progress = Math.min((kpi.value / kpi.target) * 100, 100);
          const isOnTarget = kpi.value >= kpi.target * 0.9;
          return (
            <div key={kpi.id} className="bg-white rounded-xl shadow border border-gray-100 p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-gray-900">{kpi.name}</h3>
                  <p className="text-xs text-gray-400">{kpi.nameEn}</p>
                </div>
                <div className="flex items-center gap-2">
                  {kpi.aiGenerated && (
                    <span className="bg-purple-100 text-purple-600 text-xs px-2 py-0.5 rounded-full">AI</span>
                  )}
                  <span className={`text-sm ${kpi.trend === 'up' ? 'text-green-600' : kpi.trend === 'down' ? 'text-red-600' : 'text-gray-400'}`}>
                    {kpi.trend === 'up' ? '&#9650;' : kpi.trend === 'down' ? '&#9660;' : '&#9644;'}
                  </span>
                </div>
              </div>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-3xl font-bold">{kpi.value}</span>
                <span className="text-sm text-gray-400 mb-1">{kpi.unit}</span>
                <span className="text-xs text-gray-400 mb-1 mr-auto">الهدف: {kpi.target}{kpi.unit}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${isOnTarget ? 'bg-green-500' : 'bg-amber-500'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-gray-400">{kpi.category}</span>
                <span className={`text-xs ${isOnTarget ? 'text-green-600' : 'text-amber-600'}`}>
                  {progress.toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
