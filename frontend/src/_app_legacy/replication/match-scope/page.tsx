'use client';

import { useState } from 'react';
import { Crosshair, ToggleLeft, ToggleRight, Save, Type, Palette, Layout, BarChart, Image, Table } from 'lucide-react';

const scopeItems = [
  { id: 'layout', name: 'التخطيط العام', nameEn: 'Overall Layout', icon: Layout, enabled: true, desc: 'مطابقة ترتيب العناصر ومواضعها' },
  { id: 'typography', name: 'الطباعة والخطوط', nameEn: 'Typography & Fonts', icon: Type, enabled: true, desc: 'أحجام الخطوط والأنماط والتنسيق' },
  { id: 'colors', name: 'الألوان والتدرجات', nameEn: 'Colors & Gradients', icon: Palette, enabled: true, desc: 'ألوان الخلفية والنصوص والحدود' },
  { id: 'charts', name: 'الرسوم البيانية', nameEn: 'Charts & Graphs', icon: BarChart, enabled: false, desc: 'أنواع الرسوم والبيانات المعروضة' },
  { id: 'images', name: 'الصور والوسائط', nameEn: 'Images & Media', icon: Image, enabled: true, desc: 'مطابقة الصور ومواضعها وأحجامها' },
  { id: 'tables', name: 'الجداول', nameEn: 'Tables', icon: Table, enabled: true, desc: 'بنية الجداول والتنسيق والبيانات' },
];

const scopeProfiles = [
  { id: 'full', name: 'نطاق كامل', nameEn: 'Full Scope', count: 6 },
  { id: 'visual', name: 'مرئي فقط', nameEn: 'Visual Only', count: 3 },
  { id: 'data', name: 'بيانات فقط', nameEn: 'Data Only', count: 2 },
  { id: 'custom', name: 'مخصص', nameEn: 'Custom', count: 5 },
];

export default function MatchScopePage() {
  const [items, setItems] = useState(scopeItems);
  const [activeProfile, setActiveProfile] = useState('custom');

  const toggleItem = (id: string) => {
    setItems(items.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item));
    setActiveProfile('custom');
  };

  const enabledCount = items.filter(i => i.enabled).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">نطاق المطابقة</h1>
          <p className="text-gray-500">Match Scope Settings - Define what elements to replicate</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
          <Save className="h-4 w-4" />
          حفظ النطاق
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-indigo-600">{enabledCount}</p>
          <p className="text-sm text-gray-500">عناصر مفعّلة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-indigo-600">{items.length}</p>
          <p className="text-sm text-gray-500">إجمالي العناصر</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-indigo-600">4</p>
          <p className="text-sm text-gray-500">ملفات نطاق</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-indigo-600">مخصص</p>
          <p className="text-sm text-gray-500">الملف الحالي</p>
        </div>
      </div>

      {/* Profiles */}
      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-3">ملفات النطاق المحفوظة - Scope Profiles</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {scopeProfiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveProfile(p.id)}
              className={`rounded-lg border-2 p-3 text-center transition ${activeProfile === p.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <p className="font-semibold text-sm">{p.name}</p>
              <p className="text-xs text-gray-400">{p.nameEn}</p>
              <p className="text-xs text-gray-500 mt-1">{p.count} عناصر</p>
            </button>
          ))}
        </div>
      </div>

      {/* Scope items */}
      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">عناصر النطاق - Scope Elements</h2>
        <div className="space-y-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className={`flex items-center justify-between rounded-lg border p-4 transition ${item.enabled ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200'}`}>
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.enabled ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.nameEn}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
                <button onClick={() => toggleItem(item.id)} className="shrink-0">
                  {item.enabled
                    ? <ToggleRight className="h-8 w-8 text-indigo-600" />
                    : <ToggleLeft className="h-8 w-8 text-gray-400" />
                  }
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
