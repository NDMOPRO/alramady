'use client';

import { useState } from 'react';
import { Download, FileText, Film, Image, Share2, Link2, Mail, Cloud, Check, Loader2 } from 'lucide-react';

const exportFormats = [
  { id: 'pptx', name: 'PowerPoint', ext: '.pptx', icon: FileText, desc: 'ملف عرض تقديمي كامل', color: 'text-orange-600 bg-orange-50' },
  { id: 'pdf', name: 'PDF', ext: '.pdf', icon: FileText, desc: 'مستند محمي للطباعة', color: 'text-red-600 bg-red-50' },
  { id: 'video', name: 'فيديو', ext: '.mp4', icon: Film, desc: 'تصدير كفيديو مع انتقالات', color: 'text-purple-600 bg-purple-50' },
  { id: 'images', name: 'صور', ext: '.png', icon: Image, desc: 'كل شريحة كصورة منفصلة', color: 'text-green-600 bg-green-50' },
];

const shareOptions = [
  { id: 'link', name: 'رابط مشاركة', nameEn: 'Share Link', icon: Link2, desc: 'إنشاء رابط عام أو خاص' },
  { id: 'email', name: 'بريد إلكتروني', nameEn: 'Email', icon: Mail, desc: 'إرسال مباشر عبر البريد' },
  { id: 'cloud', name: 'التخزين السحابي', nameEn: 'Cloud Storage', icon: Cloud, desc: 'حفظ في Google Drive أو OneDrive' },
];

const recentExports = [
  { name: 'تقرير_الأداء_Q4.pptx', format: 'PPTX', size: '4.2 MB', date: '2026-03-02', status: 'مكتمل' },
  { name: 'ملخص_المشروع.pdf', format: 'PDF', size: '2.1 MB', date: '2026-03-01', status: 'مكتمل' },
  { name: 'عرض_المبيعات.mp4', format: 'MP4', size: '28 MB', date: '2026-02-28', status: 'قيد التحويل' },
];

export default function ExportSharePage() {
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [quality, setQuality] = useState('high');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">التصدير والمشاركة</h1>
          <p className="text-gray-500">Export & Share - PDF, PPTX, Video, and more</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-white hover:bg-pink-700">
          <Download className="h-4 w-4" />
          تصدير الآن
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">47</p>
          <p className="text-sm text-gray-500">عملية تصدير</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">12</p>
          <p className="text-sm text-gray-500">روابط مشاركة نشطة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">156 MB</p>
          <p className="text-sm text-gray-500">إجمالي الحجم</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">4</p>
          <p className="text-sm text-gray-500">صيغ مدعومة</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Export formats */}
        <div className="rounded-xl bg-white shadow p-6">
          <h2 className="text-lg font-semibold mb-4">صيغ التصدير - Export Formats</h2>
          <div className="space-y-3">
            {exportFormats.map((fmt) => {
              const Icon = fmt.icon;
              return (
                <button
                  key={fmt.id}
                  onClick={() => setSelectedFormat(fmt.id)}
                  className={`flex w-full items-center gap-4 rounded-lg border-2 p-4 text-start transition ${selectedFormat === fmt.id ? 'border-pink-500 bg-pink-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${fmt.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{fmt.name} <span className="text-gray-400 text-sm">{fmt.ext}</span></p>
                    <p className="text-sm text-gray-500">{fmt.desc}</p>
                  </div>
                  {selectedFormat === fmt.id && <Check className="h-5 w-5 text-pink-600" />}
                </button>
              );
            })}
          </div>
          {selectedFormat && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الجودة</label>
                <select value={quality} onChange={(e) => setQuality(e.target.value)} className="w-full rounded-lg border border-gray-200 p-2 text-sm">
                  <option value="high">عالية / High</option>
                  <option value="medium">متوسطة / Medium</option>
                  <option value="low">منخفضة / Low</option>
                </select>
              </div>
              <button className="w-full rounded-lg bg-pink-600 py-2.5 text-white hover:bg-pink-700">
                بدء التصدير
              </button>
            </div>
          )}
        </div>

        {/* Share */}
        <div className="rounded-xl bg-white shadow p-6">
          <h2 className="text-lg font-semibold mb-4">المشاركة - Share</h2>
          <div className="space-y-3">
            {shareOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <button key={opt.id} className="flex w-full items-center gap-4 rounded-lg border border-gray-200 p-4 text-start hover:bg-gray-50 transition">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                    <Icon className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="font-medium">{opt.name}</p>
                    <p className="text-xs text-gray-400">{opt.nameEn} - {opt.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">سجل التصدير - Export History</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="pb-2 text-start font-medium">الملف</th>
                <th className="pb-2 text-start font-medium">الصيغة</th>
                <th className="pb-2 text-start font-medium">الحجم</th>
                <th className="pb-2 text-start font-medium">التاريخ</th>
                <th className="pb-2 text-start font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {recentExports.map((exp, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-3 font-medium">{exp.name}</td>
                  <td className="py-3"><span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{exp.format}</span></td>
                  <td className="py-3 text-gray-500">{exp.size}</td>
                  <td className="py-3 text-gray-500">{exp.date}</td>
                  <td className="py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${exp.status === 'مكتمل' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {exp.status}
                    </span>
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
