'use client';
import { useState } from 'react';

interface Suggestion {
  id: number;
  type: 'grammar' | 'style' | 'structure' | 'content';
  original: string;
  suggested: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
}

const initialSuggestions: Suggestion[] = [
  { id: 1, type: 'grammar', original: 'تم اجراء المراجعة', suggested: 'تم إجراء المراجعة', reason: 'تصحيح الهمزة', status: 'pending' },
  { id: 2, type: 'style', original: 'النتائج كانت جيدة جداً', suggested: 'أظهرت النتائج أداءً متميزاً', reason: 'أسلوب أكثر احترافية', status: 'pending' },
  { id: 3, type: 'structure', original: 'الفقرة الثالثة في القسم الثاني', suggested: 'نقل الفقرة إلى القسم الأول', reason: 'تحسين التسلسل المنطقي', status: 'accepted' },
  { id: 4, type: 'content', original: 'لم يتم ذكر المعايير', suggested: 'إضافة مرجعية للمعيار ISO 9001', reason: 'اكتمال المحتوى', status: 'pending' },
];

const typeLabels: Record<string, { label: string; color: string }> = {
  grammar: { label: 'نحوي', color: 'bg-red-100 text-red-700' },
  style: { label: 'أسلوبي', color: 'bg-blue-100 text-blue-700' },
  structure: { label: 'هيكلي', color: 'bg-purple-100 text-purple-700' },
  content: { label: 'محتوى', color: 'bg-green-100 text-green-700' },
};

export default function AIEditingPage() {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [filterType, setFilterType] = useState<string>('all');

  const updateStatus = (id: number, status: 'accepted' | 'rejected') => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  };

  const filtered = filterType === 'all' ? suggestions : suggestions.filter(s => s.type === filterType);
  const pending = suggestions.filter(s => s.status === 'pending').length;
  const accepted = suggestions.filter(s => s.status === 'accepted').length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">التحرير الذكي</h1>
          <p className="text-gray-500">AI-Assisted Editing Suggestions</p>
        </div>
        <div className="flex gap-2">
          <button className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">قبول الكل</button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition">تحليل مستند</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الاقتراحات', value: suggestions.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'في الانتظار', value: pending, color: 'bg-amber-50 text-amber-700' },
          { label: 'مقبولة', value: accepted, color: 'bg-green-50 text-green-700' },
          { label: 'جودة المستند', value: '87%', color: 'bg-purple-50 text-purple-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[{ key: 'all', label: 'الكل' }, ...Object.entries(typeLabels).map(([k, v]) => ({ key: k, label: v.label }))].map(f => (
          <button
            key={f.key}
            onClick={() => setFilterType(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              filterType === f.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Suggestions List */}
      <div className="space-y-4">
        {filtered.map(suggestion => (
          <div key={suggestion.id} className={`bg-white rounded-xl shadow border p-5 transition ${
            suggestion.status === 'accepted' ? 'border-green-200 bg-green-50/30' :
            suggestion.status === 'rejected' ? 'border-red-200 bg-red-50/30 opacity-60' :
            'border-gray-100'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-xs px-2 py-0.5 rounded-full ${typeLabels[suggestion.type].color}`}>
                {typeLabels[suggestion.type].label}
              </span>
              <span className="text-sm text-gray-500">{suggestion.reason}</span>
              <span className={`mr-auto text-xs px-2 py-0.5 rounded-full ${
                suggestion.status === 'accepted' ? 'bg-green-100 text-green-700' :
                suggestion.status === 'rejected' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-500'
              }`}>
                {suggestion.status === 'accepted' ? 'مقبول' : suggestion.status === 'rejected' ? 'مرفوض' : 'في الانتظار'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
              <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                <p className="text-xs text-red-500 mb-1">النص الأصلي</p>
                <p className="text-sm line-through text-red-700">{suggestion.original}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                <p className="text-xs text-green-500 mb-1">النص المقترح</p>
                <p className="text-sm text-green-700">{suggestion.suggested}</p>
              </div>
            </div>

            {suggestion.status === 'pending' && (
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => updateStatus(suggestion.id, 'rejected')}
                  className="border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-sm hover:bg-red-50"
                >
                  رفض
                </button>
                <button
                  onClick={() => updateStatus(suggestion.id, 'accepted')}
                  className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700"
                >
                  قبول
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
