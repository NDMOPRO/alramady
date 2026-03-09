'use client';
import { useState } from 'react';

interface ProductLevel {
  id: number;
  name: string;
  nameEn: string;
  tier: string;
  features: number;
  maxUsers: number;
  currentUsers: number;
  price: string;
  active: boolean;
}

const levels: ProductLevel[] = [
  { id: 1, name: 'أساسي', nameEn: 'Basic', tier: 'Tier 1', features: 10, maxUsers: 5, currentUsers: 3, price: 'مجاني', active: true },
  { id: 2, name: 'احترافي', nameEn: 'Professional', tier: 'Tier 2', features: 25, maxUsers: 25, currentUsers: 18, price: '500 ر.س/شهر', active: true },
  { id: 3, name: 'متقدم', nameEn: 'Advanced', tier: 'Tier 3', features: 50, maxUsers: 100, currentUsers: 67, price: '1,500 ر.س/شهر', active: true },
  { id: 4, name: 'مؤسسي', nameEn: 'Enterprise', tier: 'Tier 4', features: 80, maxUsers: 500, currentUsers: 234, price: '5,000 ر.س/شهر', active: true },
  { id: 5, name: 'مخصص', nameEn: 'Custom', tier: 'Tier 5', features: 100, maxUsers: 9999, currentUsers: 45, price: 'حسب الطلب', active: false },
];

export default function ProductLevelsPage() {
  const [selectedLevel, setSelectedLevel] = useState<number>(3);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مستويات المنتج</h1>
          <p className="text-gray-500">Product Level Management</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + إضافة مستوى
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'المستويات النشطة', value: levels.filter(l => l.active).length, color: 'bg-green-50 text-green-700' },
          { label: 'إجمالي المستخدمين', value: levels.reduce((a, l) => a + l.currentUsers, 0), color: 'bg-blue-50 text-blue-700' },
          { label: 'أعلى مستوى مستخدم', value: 'مؤسسي', color: 'bg-purple-50 text-purple-700' },
          { label: 'إجمالي الميزات', value: 100, color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Level Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {levels.map(level => (
          <div
            key={level.id}
            onClick={() => setSelectedLevel(level.id)}
            className={`rounded-xl border-2 p-5 cursor-pointer transition ${
              selectedLevel === level.id ? 'border-blue-500 bg-blue-50 shadow-lg' : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="text-center mb-3">
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{level.tier}</span>
              <h3 className="font-bold text-lg mt-2">{level.name}</h3>
              <p className="text-xs text-gray-400">{level.nameEn}</p>
            </div>
            <div className="text-center text-blue-600 font-bold text-lg mb-4">{level.price}</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">الميزات</span>
                <span className="font-medium">{level.features}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">المستخدمون</span>
                <span className="font-medium">{level.currentUsers}/{level.maxUsers}</span>
              </div>
            </div>
            {/* Usage bar */}
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-blue-500"
                  style={{ width: `${Math.min((level.currentUsers / level.maxUsers) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div className="mt-3 text-center">
              <span className={`text-xs px-2 py-0.5 rounded-full ${level.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {level.active ? 'نشط' : 'غير نشط'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
