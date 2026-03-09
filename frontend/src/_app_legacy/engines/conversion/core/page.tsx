'use client';
import { useState } from 'react';

interface ConversionSetting {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  type: 'toggle' | 'select' | 'number';
  value: boolean | string | number;
  options?: string[];
}

const initialSettings: ConversionSetting[] = [
  { id: 'quality', name: 'جودة الإخراج', nameEn: 'Output Quality', description: 'مستوى جودة الملفات المحولة', type: 'select', value: 'عالية', options: ['منخفضة', 'متوسطة', 'عالية', 'ممتازة'] },
  { id: 'ocr', name: 'التعرف على النص', nameEn: 'OCR Enabled', description: 'تفعيل التعرف الضوئي على الحروف', type: 'toggle', value: true },
  { id: 'preserve', name: 'حفظ التنسيق', nameEn: 'Preserve Formatting', description: 'الحفاظ على التنسيق الأصلي عند التحويل', type: 'toggle', value: true },
  { id: 'compress', name: 'ضغط الملفات', nameEn: 'File Compression', description: 'ضغط الملفات تلقائياً بعد التحويل', type: 'toggle', value: false },
  { id: 'maxSize', name: 'الحد الأقصى للحجم', nameEn: 'Max File Size (MB)', description: 'أقصى حجم مسموح للملف المحول', type: 'number', value: 100 },
  { id: 'lang', name: 'لغة التعرف', nameEn: 'OCR Language', description: 'اللغة المستخدمة في التعرف على النص', type: 'select', value: 'عربي + إنجليزي', options: ['عربي', 'إنجليزي', 'عربي + إنجليزي'] },
  { id: 'watermark', name: 'العلامة المائية', nameEn: 'Watermark', description: 'إضافة علامة مائية على الملفات المحولة', type: 'toggle', value: false },
  { id: 'batch', name: 'التحويل الدفعي', nameEn: 'Batch Processing', description: 'تفعيل التحويل المتعدد للملفات', type: 'toggle', value: true },
];

export default function CoreConversionPage() {
  const [settings, setSettings] = useState(initialSettings);

  const updateSetting = (id: string, value: boolean | string | number) => {
    setSettings(prev => prev.map(s => s.id === id ? { ...s, value } : s));
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إعدادات التحويل الأساسية</h1>
          <p className="text-gray-500">Core Conversion Settings</p>
        </div>
        <div className="flex gap-2">
          <button className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">إعادة تعيين</button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition">حفظ الإعدادات</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'إعدادات نشطة', value: settings.filter(s => s.type === 'toggle' && s.value === true).length, color: 'bg-green-50 text-green-700' },
          { label: 'إجمالي الإعدادات', value: settings.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'جودة الإخراج', value: 'عالية', color: 'bg-purple-50 text-purple-700' },
          { label: 'آخر تحديث', value: 'اليوم', color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Settings List */}
      <div className="bg-white rounded-xl shadow divide-y">
        {settings.map(setting => (
          <div key={setting.id} className="p-5 flex items-center gap-4">
            <div className="flex-1">
              <h3 className="font-medium text-gray-900">{setting.name}</h3>
              <p className="text-xs text-gray-400">{setting.nameEn}</p>
              <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
            </div>
            <div className="min-w-[150px] flex justify-end">
              {setting.type === 'toggle' && (
                <button
                  onClick={() => updateSetting(setting.id, !setting.value)}
                  className={`w-12 h-6 rounded-full transition ${setting.value ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow transform transition ${setting.value ? '-translate-x-6' : '-translate-x-0.5'}`} />
                </button>
              )}
              {setting.type === 'select' && (
                <select
                  value={setting.value as string}
                  onChange={e => updateSetting(setting.id, e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                >
                  {setting.options?.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}
              {setting.type === 'number' && (
                <input
                  type="number"
                  value={setting.value as number}
                  onChange={e => updateSetting(setting.id, parseInt(e.target.value) || 0)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24 text-center"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
