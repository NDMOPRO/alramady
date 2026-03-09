'use client';
import { useState } from 'react';

interface ComparisonItem {
  field: string;
  fieldEn: string;
  valueA: string;
  valueB: string;
  match: boolean;
}

const comparisonData: ComparisonItem[] = [
  { field: 'إجمالي الإيرادات', fieldEn: 'Total Revenue', valueA: '2,450,000 ر.س', valueB: '2,680,000 ر.س', match: false },
  { field: 'عدد العملاء', fieldEn: 'Customer Count', valueA: '1,234', valueB: '1,234', match: true },
  { field: 'معدل النمو', fieldEn: 'Growth Rate', valueA: '12.5%', valueB: '15.2%', match: false },
  { field: 'المصروفات التشغيلية', fieldEn: 'Operating Expenses', valueA: '890,000 ر.س', valueB: '920,000 ر.س', match: false },
  { field: 'صافي الربح', fieldEn: 'Net Profit', valueA: '1,560,000 ر.س', valueB: '1,760,000 ر.س', match: false },
  { field: 'عدد الموظفين', fieldEn: 'Employee Count', valueA: '156', valueB: '156', match: true },
  { field: 'رضا العملاء', fieldEn: 'Customer Satisfaction', valueA: '88%', valueB: '91%', match: false },
];

export default function ComparePage() {
  const [sourceA, setSourceA] = useState('تقرير الربع الثالث 2024');
  const [sourceB, setSourceB] = useState('تقرير الربع الرابع 2024');
  const [showDiffOnly, setShowDiffOnly] = useState(false);

  const displayed = showDiffOnly ? comparisonData.filter(c => !c.match) : comparisonData;
  const matchRate = Math.round((comparisonData.filter(c => c.match).length / comparisonData.length) * 100);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">أداة المقارنة المتقدمة</h1>
          <p className="text-gray-500">Advanced Comparison Tool</p>
        </div>
        <div className="flex gap-2">
          <button className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">تصدير المقارنة</button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition">+ مقارنة جديدة</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الحقول', value: comparisonData.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'متطابقة', value: comparisonData.filter(c => c.match).length, color: 'bg-green-50 text-green-700' },
          { label: 'مختلفة', value: comparisonData.filter(c => !c.match).length, color: 'bg-red-50 text-red-700' },
          { label: 'نسبة التطابق', value: `${matchRate}%`, color: 'bg-purple-50 text-purple-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Source Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <label className="text-sm font-medium text-blue-700 mb-2 block">المصدر أ / Source A</label>
          <select value={sourceA} onChange={e => setSourceA(e.target.value)} className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option>تقرير الربع الثالث 2024</option>
            <option>تقرير الربع الثاني 2024</option>
            <option>تقرير الربع الأول 2024</option>
          </select>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <label className="text-sm font-medium text-green-700 mb-2 block">المصدر ب / Source B</label>
          <select value={sourceB} onChange={e => setSourceB(e.target.value)} className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option>تقرير الربع الرابع 2024</option>
            <option>تقرير الربع الثالث 2024</option>
            <option>تقرير الربع الثاني 2024</option>
          </select>
        </div>
      </div>

      {/* Filter */}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showDiffOnly} onChange={e => setShowDiffOnly(e.target.checked)} className="rounded" />
        عرض الاختلافات فقط / Show differences only
      </label>

      {/* Comparison Table */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-right p-4 font-medium text-gray-700">الحقل</th>
              <th className="text-center p-4 font-medium text-blue-700 bg-blue-50/50">المصدر أ</th>
              <th className="text-center p-4 font-medium text-green-700 bg-green-50/50">المصدر ب</th>
              <th className="text-center p-4 font-medium text-gray-700">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((item, i) => (
              <tr key={i} className={`border-t ${item.match ? '' : 'bg-amber-50/30'}`}>
                <td className="p-4">
                  <div className="font-medium text-sm">{item.field}</div>
                  <div className="text-xs text-gray-400">{item.fieldEn}</div>
                </td>
                <td className="p-4 text-center text-sm bg-blue-50/20">{item.valueA}</td>
                <td className="p-4 text-center text-sm bg-green-50/20">{item.valueB}</td>
                <td className="p-4 text-center">
                  <span className={`text-xs px-2 py-1 rounded-full ${item.match ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {item.match ? 'متطابق' : 'مختلف'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
