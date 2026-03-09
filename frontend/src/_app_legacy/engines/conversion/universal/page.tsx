'use client';
import { useState } from 'react';

const supportedFormats = ['PDF', 'Word', 'Excel', 'CSV', 'JSON', 'XML', 'HTML', 'TXT', 'PNG', 'JPG', 'SVG', 'Markdown'];

interface ConversionJob {
  id: number;
  fileName: string;
  fromFormat: string;
  toFormat: string;
  status: 'queued' | 'converting' | 'done' | 'failed';
  progress: number;
  size: string;
}

const initialJobs: ConversionJob[] = [
  { id: 1, fileName: 'تقرير_سنوي.pdf', fromFormat: 'PDF', toFormat: 'Word', status: 'done', progress: 100, size: '2.4 MB' },
  { id: 2, fileName: 'بيانات_المبيعات.xlsx', fromFormat: 'Excel', toFormat: 'CSV', status: 'done', progress: 100, size: '1.8 MB' },
  { id: 3, fileName: 'محضر_الاجتماع.docx', fromFormat: 'Word', toFormat: 'PDF', status: 'converting', progress: 65, size: '340 KB' },
  { id: 4, fileName: 'واجهة_البيانات.json', fromFormat: 'JSON', toFormat: 'XML', status: 'queued', progress: 0, size: '128 KB' },
];

export default function UniversalConverterPage() {
  const [fromFormat, setFromFormat] = useState('PDF');
  const [toFormat, setToFormat] = useState('Word');
  const [jobs, setJobs] = useState(initialJobs);
  const [isDragging, setIsDragging] = useState(false);

  const statusConfig: Record<string, { label: string; color: string }> = {
    queued: { label: 'في الانتظار', color: 'bg-gray-100 text-gray-600' },
    converting: { label: 'جاري التحويل', color: 'bg-blue-100 text-blue-700' },
    done: { label: 'مكتمل', color: 'bg-green-100 text-green-700' },
    failed: { label: 'فشل', color: 'bg-red-100 text-red-700' },
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المحول الشامل</h1>
          <p className="text-gray-500">Universal Converter Interface</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          مسح الكل
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'تحويلات مكتملة', value: jobs.filter(j => j.status === 'done').length, color: 'bg-green-50 text-green-700' },
          { label: 'قيد التحويل', value: jobs.filter(j => j.status === 'converting').length, color: 'bg-blue-50 text-blue-700' },
          { label: 'في الانتظار', value: jobs.filter(j => j.status === 'queued').length, color: 'bg-amber-50 text-amber-700' },
          { label: 'التنسيقات المدعومة', value: supportedFormats.length, color: 'bg-purple-50 text-purple-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Converter */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-bold mb-4">تحويل جديد / New Conversion</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* From Format */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">من تنسيق / From</label>
            <select
              value={fromFormat}
              onChange={e => setFromFormat(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {supportedFormats.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Arrow */}
          <div className="flex items-end justify-center pb-2">
            <div className="text-2xl text-blue-500">&#8596;</div>
          </div>

          {/* To Format */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">إلى تنسيق / To</label>
            <select
              value={toFormat}
              onChange={e => setToFormat(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {supportedFormats.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => { e.preventDefault(); setIsDragging(false); }}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
          }`}
        >
          <p className="text-lg font-medium text-gray-600">اسحب الملفات هنا للتحويل</p>
          <p className="text-sm text-gray-400 mt-1">Drag files here to convert from {fromFormat} to {toFormat}</p>
          <button className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-700">أو اختر ملفات</button>
        </div>
      </div>

      {/* Jobs Queue */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-bold mb-4">قائمة التحويلات / Conversion Queue</h3>
        <div className="space-y-3">
          {jobs.map(job => (
            <div key={job.id} className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-center gap-4 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{job.fromFormat}</span>
                  <span className="text-gray-400">&#8594;</span>
                  <span className="text-xs font-mono bg-green-100 text-green-700 px-2 py-0.5 rounded">{job.toFormat}</span>
                </div>
                <span className="text-sm flex-1">{job.fileName}</span>
                <span className="text-xs text-gray-400">{job.size}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[job.status].color}`}>
                  {statusConfig[job.status].label}
                </span>
                {job.status === 'done' && (
                  <button className="text-blue-600 text-xs hover:underline">تحميل</button>
                )}
              </div>
              {(job.status === 'converting' || job.status === 'queued') && (
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${job.status === 'converting' ? 'bg-blue-500' : 'bg-gray-400'}`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
