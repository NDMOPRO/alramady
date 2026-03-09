'use client';
import { useState } from 'react';

interface Theme {
  id: number;
  name: string;
  nameEn: string;
  description: string;
  colors: string[];
  category: string;
  downloads: number;
  active: boolean;
}

const themes: Theme[] = [
  { id: 1, name: 'كلاسيكي رسمي', nameEn: 'Classic Formal', description: 'تصميم رسمي مناسب للتقارير الحكومية', colors: ['bg-blue-800', 'bg-blue-600', 'bg-blue-400', 'bg-gray-100'], category: 'رسمي', downloads: 234, active: true },
  { id: 2, name: 'حديث بسيط', nameEn: 'Modern Minimal', description: 'تصميم عصري بألوان هادئة', colors: ['bg-gray-900', 'bg-gray-600', 'bg-gray-300', 'bg-white'], category: 'عصري', downloads: 189, active: false },
  { id: 3, name: 'أخضر مستدام', nameEn: 'Green Sustainable', description: 'مستوحى من تقارير الاستدامة', colors: ['bg-green-800', 'bg-green-600', 'bg-green-400', 'bg-green-50'], category: 'بيئي', downloads: 156, active: false },
  { id: 4, name: 'ذهبي فاخر', nameEn: 'Gold Premium', description: 'تصميم فاخر للتقارير التنفيذية', colors: ['bg-amber-800', 'bg-amber-600', 'bg-amber-400', 'bg-amber-50'], category: 'فاخر', downloads: 98, active: false },
  { id: 5, name: 'تقني أزرق', nameEn: 'Tech Blue', description: 'مناسب لتقارير التقنية والبيانات', colors: ['bg-cyan-800', 'bg-cyan-600', 'bg-cyan-400', 'bg-cyan-50'], category: 'تقني', downloads: 145, active: false },
  { id: 6, name: 'بنفسجي إبداعي', nameEn: 'Creative Purple', description: 'تصميم إبداعي للعروض التقديمية', colors: ['bg-purple-800', 'bg-purple-600', 'bg-purple-400', 'bg-purple-50'], category: 'إبداعي', downloads: 112, active: false },
];

export default function ThemesPage() {
  const [selectedTheme, setSelectedTheme] = useState<number>(1);
  const [previewOpen, setPreviewOpen] = useState(false);

  const selected = themes.find(t => t.id === selectedTheme);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">معرض السمات</h1>
          <p className="text-gray-500">Theme Gallery - Preview, Customize, Apply</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + إنشاء سمة
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'السمات المتاحة', value: themes.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'السمة النشطة', value: 'كلاسيكي', color: 'bg-green-50 text-green-700' },
          { label: 'إجمالي التحميلات', value: themes.reduce((a, t) => a + t.downloads, 0), color: 'bg-purple-50 text-purple-700' },
          { label: 'سمات مخصصة', value: 3, color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Theme Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {themes.map(theme => (
          <div
            key={theme.id}
            onClick={() => setSelectedTheme(theme.id)}
            className={`bg-white rounded-xl shadow border-2 overflow-hidden cursor-pointer transition ${
              selectedTheme === theme.id ? 'border-blue-500 shadow-lg' : 'border-gray-100 hover:border-gray-300'
            }`}
          >
            {/* Color Preview */}
            <div className="h-24 flex">
              {theme.colors.map((color, j) => (
                <div key={j} className={`flex-1 ${color}`} />
              ))}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-bold text-sm">{theme.name}</h3>
                  <p className="text-xs text-gray-400">{theme.nameEn}</p>
                </div>
                {theme.active && (
                  <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">نشط</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-3">{theme.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{theme.category}</span>
                <span className="text-xs text-gray-400">{theme.downloads} تحميل</span>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={(e) => { e.stopPropagation(); setPreviewOpen(true); }}
                  className="flex-1 border border-gray-300 text-sm py-1.5 rounded-lg hover:bg-gray-50"
                >
                  معاينة
                </button>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-blue-600 text-white text-sm py-1.5 rounded-lg hover:bg-blue-700"
                >
                  {theme.active ? 'مُطبقة' : 'تطبيق'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Modal */}
      {previewOpen && selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreviewOpen(false)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">معاينة: {selected.name}</h2>
              <button onClick={() => setPreviewOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="h-16 flex rounded-lg overflow-hidden mb-4">
              {selected.colors.map((color, j) => (
                <div key={j} className={`flex-1 ${color}`} />
              ))}
            </div>
            <div className="bg-gray-50 rounded-lg p-6 mb-4">
              <h3 className="text-xl font-bold mb-2" style={{ color: '#1e3a5f' }}>نموذج تقرير</h3>
              <p className="text-sm text-gray-600">هذا نموذج يوضح كيف ستبدو السمة عند تطبيقها على المستندات والتقارير</p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {['القسم الأول', 'القسم الثاني', 'القسم الثالث'].map((sec, j) => (
                  <div key={j} className="bg-white rounded p-3 shadow-sm text-center text-sm">{sec}</div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPreviewOpen(false)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm">إغلاق</button>
              <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">تطبيق السمة</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
