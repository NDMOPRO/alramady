'use client';

import { useState } from 'react';
import { Upload, Database, LayoutTemplate, FileText, Image, Table, Plus, ArrowRight } from 'lucide-react';

const sources = [
  { id: 'file', title: 'ملفات', titleEn: 'File Upload', desc: 'رفع ملفات Word, PDF, Excel', icon: Upload, color: 'bg-blue-50 text-blue-600', count: 12 },
  { id: 'data', title: 'مصادر البيانات', titleEn: 'Data Sources', desc: 'ربط قواعد بيانات و APIs', icon: Database, color: 'bg-green-50 text-green-600', count: 5 },
  { id: 'template', title: 'القوالب', titleEn: 'Templates', desc: 'استخدام قوالب جاهزة', icon: LayoutTemplate, color: 'bg-purple-50 text-purple-600', count: 24 },
  { id: 'text', title: 'نص مباشر', titleEn: 'Direct Text', desc: 'إدخال محتوى نصي مباشر', icon: FileText, color: 'bg-orange-50 text-orange-600', count: 0 },
  { id: 'image', title: 'وسائط', titleEn: 'Media', desc: 'صور وفيديوهات ورسوم', icon: Image, color: 'bg-pink-50 text-pink-600', count: 38 },
  { id: 'table', title: 'جداول', titleEn: 'Tables', desc: 'استيراد جداول بيانات', icon: Table, color: 'bg-cyan-50 text-cyan-600', count: 8 },
];

const recentImports = [
  { name: 'التقرير_السنوي_2025.docx', source: 'ملف', date: '2026-03-01', slides: 15 },
  { name: 'بيانات_المبيعات_Q4.xlsx', source: 'بيانات', date: '2026-02-28', slides: 8 },
  { name: 'قالب_الشركة_الرسمي.pptx', source: 'قالب', date: '2026-02-25', slides: 22 },
];

export default function MultiSourcePage() {
  const [activeSource, setActiveSource] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إنشاء متعدد المصادر</h1>
          <p className="text-gray-500">Multi-Source Creation - Import from files, data, and templates</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-white hover:bg-pink-700">
          <Plus className="h-4 w-4" />
          عرض جديد
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">87</p>
          <p className="text-sm text-gray-500">ملفات مستوردة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">5</p>
          <p className="text-sm text-gray-500">مصادر متصلة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">24</p>
          <p className="text-sm text-gray-500">قوالب متاحة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">45</p>
          <p className="text-sm text-gray-500">شرائح مُنشأة</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((src) => {
          const Icon = src.icon;
          return (
            <button
              key={src.id}
              onClick={() => setActiveSource(src.id)}
              className={`rounded-xl bg-white p-5 shadow text-start transition hover:shadow-md ${activeSource === src.id ? 'ring-2 ring-pink-500' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${src.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{src.count} عنصر</span>
              </div>
              <h3 className="font-semibold text-gray-900">{src.title}</h3>
              <p className="text-xs text-gray-400 mb-1">{src.titleEn}</p>
              <p className="text-sm text-gray-500">{src.desc}</p>
            </button>
          );
        })}
      </div>

      {activeSource && (
        <div className="rounded-xl border-2 border-dashed border-pink-300 bg-pink-50/50 p-8 text-center">
          <Upload className="mx-auto h-12 w-12 text-pink-400 mb-3" />
          <p className="text-lg font-semibold text-gray-700">اسحب الملفات هنا أو انقر للتحميل</p>
          <p className="text-sm text-gray-500 mt-1">Drag & drop files or click to upload</p>
          <button className="mt-4 rounded-lg bg-pink-600 px-6 py-2 text-white hover:bg-pink-700">
            اختيار الملفات
          </button>
        </div>
      )}

      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">آخر الاستيرادات - Recent Imports</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="pb-2 text-start font-medium">الملف</th>
                <th className="pb-2 text-start font-medium">المصدر</th>
                <th className="pb-2 text-start font-medium">التاريخ</th>
                <th className="pb-2 text-start font-medium">الشرائح</th>
                <th className="pb-2 text-start font-medium">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {recentImports.map((item, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-3 font-medium">{item.name}</td>
                  <td className="py-3">{item.source}</td>
                  <td className="py-3 text-gray-500">{item.date}</td>
                  <td className="py-3">{item.slides} شريحة</td>
                  <td className="py-3">
                    <button className="flex items-center gap-1 text-pink-600 hover:text-pink-700 text-xs">
                      فتح <ArrowRight className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
