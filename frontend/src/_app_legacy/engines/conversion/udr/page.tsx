'use client';
import { useState } from 'react';

interface UDRRule {
  id: number;
  name: string;
  nameEn: string;
  sourceFormat: string;
  targetFormat: string;
  conditions: string;
  transformations: string;
  active: boolean;
  priority: number;
  usage: number;
}

const initialRules: UDRRule[] = [
  { id: 1, name: 'تحويل تواريخ هجرية', nameEn: 'Hijri Date Conversion', sourceFormat: 'Excel', targetFormat: 'PDF', conditions: 'عمود التاريخ = هجري', transformations: 'تحويل إلى ميلادي مع الاحتفاظ بالهجري', active: true, priority: 1, usage: 89 },
  { id: 2, name: 'تنسيق العملات', nameEn: 'Currency Formatting', sourceFormat: 'CSV', targetFormat: 'Excel', conditions: 'أعمدة رقمية', transformations: 'إضافة رمز العملة وتنسيق الأرقام', active: true, priority: 2, usage: 67 },
  { id: 3, name: 'ترجمة الرؤوس', nameEn: 'Header Translation', sourceFormat: 'JSON', targetFormat: 'XML', conditions: 'رؤوس إنجليزية', transformations: 'ترجمة إلى العربية مع الاحتفاظ بالمفتاح الأصلي', active: true, priority: 3, usage: 45 },
  { id: 4, name: 'دمج الأعمدة', nameEn: 'Column Merge', sourceFormat: 'Excel', targetFormat: 'CSV', conditions: 'أعمدة الاسم الأول + الأخير', transformations: 'دمج في عمود واحد', active: false, priority: 4, usage: 23 },
  { id: 5, name: 'تصفية البيانات الفارغة', nameEn: 'Empty Data Filter', sourceFormat: '*', targetFormat: '*', conditions: 'صفوف بها خلايا فارغة > 50%', transformations: 'حذف الصفوف الفارغة', active: true, priority: 5, usage: 112 },
];

export default function UDRConversionPage() {
  const [rules, setRules] = useState(initialRules);
  const [selectedRule, setSelectedRule] = useState<number | null>(1);

  const toggleRule = (id: number) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  const selected = rules.find(r => r.id === selectedRule);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">قواعد التحويل المخصصة</h1>
          <p className="text-gray-500">UDR - User Defined Rules</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + إنشاء قاعدة
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'القواعد النشطة', value: rules.filter(r => r.active).length, color: 'bg-green-50 text-green-700' },
          { label: 'إجمالي القواعد', value: rules.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'إجمالي التطبيقات', value: rules.reduce((a, r) => a + r.usage, 0), color: 'bg-purple-50 text-purple-700' },
          { label: 'الأكثر استخداماً', value: 'تصفية', color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rules List */}
        <div className="lg:col-span-1 space-y-2">
          {rules.map(rule => (
            <div
              key={rule.id}
              onClick={() => setSelectedRule(rule.id)}
              className={`bg-white rounded-xl border p-4 cursor-pointer transition ${
                selectedRule === rule.id ? 'border-blue-500 shadow-md' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm">{rule.name}</h3>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleRule(rule.id); }}
                  className={`w-10 h-5 rounded-full transition ${rule.active ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow transform transition ${rule.active ? '-translate-x-5' : '-translate-x-0.5'}`} />
                </button>
              </div>
              <p className="text-xs text-gray-400">{rule.nameEn}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono">{rule.sourceFormat}</span>
                <span className="text-gray-400 text-xs">&#8594;</span>
                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-mono">{rule.targetFormat}</span>
                <span className="text-xs text-gray-400 mr-auto">{rule.usage} مرة</span>
              </div>
            </div>
          ))}
        </div>

        {/* Rule Detail */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow p-6">
          {selected ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">{selected.name}</h2>
                  <p className="text-gray-400">{selected.nameEn}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs ${selected.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {selected.active ? 'نشط' : 'غير نشط'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">التنسيق المصدر</p>
                  <p className="font-mono font-bold">{selected.sourceFormat}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">التنسيق الهدف</p>
                  <p className="font-mono font-bold">{selected.targetFormat}</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">الشروط / Conditions</p>
                  <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                    <p className="text-sm">{selected.conditions}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">التحويلات / Transformations</p>
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                    <p className="text-sm">{selected.transformations}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">الأولوية</p>
                  <p className="text-xl font-bold">{selected.priority}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">مرات الاستخدام</p>
                  <p className="text-xl font-bold">{selected.usage}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">تعديل القاعدة</button>
                <button className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">اختبار</button>
                <button className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">نسخ</button>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-12">اختر قاعدة لعرض التفاصيل</p>
          )}
        </div>
      </div>
    </div>
  );
}
