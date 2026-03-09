'use client';
import { useState, useCallback } from 'react';

interface AnalyzedFile {
  name: string;
  type: string;
  size: string;
  status: 'pending' | 'analyzing' | 'done';
  insights?: string[];
}

export default function FileUnderstandingPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<AnalyzedFile[]>([
    { name: 'تقرير_الميزانية_2025.pdf', type: 'PDF', size: '2.4 MB', status: 'done', insights: ['يحتوي على 45 جدولاً مالياً', 'تم تحديد 12 مؤشر أداء', 'نسبة التوافق 92%'] },
    { name: 'بيانات_المبيعات.xlsx', type: 'Excel', size: '1.8 MB', status: 'done', insights: ['بيانات 3 سنوات', 'نمو بنسبة 15%', '8 فئات منتجات'] },
    { name: 'محضر_الاجتماع.docx', type: 'Word', size: '340 KB', status: 'analyzing' },
  ]);
  const [selectedFile, setSelectedFile] = useState<number | null>(0);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const newFiles: AnalyzedFile[] = Array.from(e.dataTransfer.files).map(f => ({
      name: f.name,
      type: f.type.split('/')[1]?.toUpperCase() || 'FILE',
      size: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
      status: 'pending' as const,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">فهم الملفات</h1>
          <p className="text-gray-500">File Understanding - AI-Powered Analysis</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + رفع ملف جديد
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'ملفات محللة', value: 89, color: 'bg-blue-50 text-blue-700' },
          { label: 'رؤى مستخرجة', value: 342, color: 'bg-green-50 text-green-700' },
          { label: 'قيد التحليل', value: 3, color: 'bg-amber-50 text-amber-700' },
          { label: 'أنواع مدعومة', value: 15, color: 'bg-purple-50 text-purple-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
        }`}
      >
        <div className="text-4xl mb-3">📁</div>
        <p className="font-medium text-gray-700">اسحب الملفات وأفلتها هنا</p>
        <p className="text-sm text-gray-400 mt-1">Drag & drop files here or click to browse</p>
        <p className="text-xs text-gray-400 mt-2">PDF, Word, Excel, CSV, JSON, XML</p>
      </div>

      {/* File List + Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* File List */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow p-4">
          <h3 className="font-bold mb-3">الملفات المرفوعة / Uploaded Files</h3>
          <div className="space-y-2">
            {files.map((file, i) => (
              <button
                key={i}
                onClick={() => setSelectedFile(i)}
                className={`w-full text-right p-3 rounded-lg border transition ${
                  selectedFile === i ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium truncate">{file.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    file.status === 'done' ? 'bg-green-100 text-green-700' :
                    file.status === 'analyzing' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {file.status === 'done' ? 'مكتمل' : file.status === 'analyzing' ? 'جاري التحليل' : 'في الانتظار'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{file.type} - {file.size}</p>
              </button>
            ))}
          </div>
        </div>

        {/* AI Insights */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow p-6">
          <h3 className="font-bold mb-4">رؤى الذكاء الاصطناعي / AI Insights</h3>
          {selectedFile !== null && files[selectedFile] ? (
            <div>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="font-medium">{files[selectedFile].name}</p>
                <p className="text-sm text-gray-500">{files[selectedFile].type} - {files[selectedFile].size}</p>
              </div>
              {files[selectedFile].insights ? (
                <div className="space-y-3">
                  {files[selectedFile].insights!.map((insight, j) => (
                    <div key={j} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                      <span className="text-blue-500 mt-0.5">&#9679;</span>
                      <span className="text-sm">{insight}</span>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-4">
                    <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">تحليل متقدم</button>
                    <button className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">تصدير التقرير</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32">
                  <div className="text-center text-gray-400">
                    <div className="animate-spin text-2xl mb-2">&#9696;</div>
                    <p className="text-sm">جاري تحليل الملف...</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-12">اختر ملفاً لعرض الرؤى</p>
          )}
        </div>
      </div>
    </div>
  );
}
