'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Brain, Upload, FileSpreadsheet, FileText, FileJson, Image, File,
  CheckCircle, Clock, AlertTriangle, Search, Sparkles,
  Tag, Eye, Trash2, Loader2, AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';

interface ClassifiedFile {
  id: string;
  name: string;
  format: string;
  sizeBytes: number;
  category: string;
  status: string;
  tags: string[];
  qualityScore: number;
  createdAt: string;
}

const formatIcons: Record<string, typeof File> = {
  xlsx: FileSpreadsheet, xls: FileSpreadsheet, csv: FileText,
  json: FileJson, pdf: File, png: Image, jpg: Image, jpeg: Image,
  docx: FileText, doc: FileText, txt: FileText,
};

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

export default function ClassificationPage() {
  const [dragActive, setDragActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: classResponse, isLoading } = useQuery({
    queryKey: ['classification-files'],
    queryFn: () => api.get<{ success: boolean; data: ClassifiedFile[] }>('/api/v1/data/classification'),
  });

  const classifyMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<{ success: boolean; data: ClassifiedFile }>('/api/v1/data/import/auto', formData);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['classification-files'] }),
  });

  const files: ClassifiedFile[] = (classResponse as { data?: ClassifiedFile[] })?.data ?? [];

  const filtered = files.filter((f) => {
    const matchesSearch = !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.category || '').includes(searchQuery);
    const matchesStatus = filterStatus === 'all' || f.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const classifiedCount = files.filter(f => f.category).length;
  const pendingCount = files.filter(f => !f.category).length;
  const avgQuality = files.length > 0
    ? Math.round(files.reduce((s, f) => s + (f.qualityScore || 0), 0) / files.length)
    : 0;

  // Group by category
  const categoryGroups = files.reduce<Record<string, number>>((acc, f) => {
    const cat = f.category || 'غير مصنف';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const categoryColors = ['bg-blue-500', 'bg-red-500', 'bg-purple-500', 'bg-green-500', 'bg-amber-500', 'bg-gray-500'];

  const handleFileUpload = async (file: File) => {
    classifyMutation.mutate(file);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
      <input ref={fileInputRef} type="file" className="hidden" multiple
        onChange={(e) => {
          const fileList = e.target.files;
          if (fileList) Array.from(fileList).forEach(handleFileUpload);
        }}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/data" className="hover:text-blue-600">محرك البيانات</Link>
            <span>/</span>
            <span>التصنيف الذكي</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">التصنيف الذكي بالذكاء الاصطناعي</h1>
          <p className="text-gray-500">AI File Classification</p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700"
        >
          <Sparkles className="h-4 w-4" /> تصنيف ملفات جديدة
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-pink-600">{files.length}</p>
          <p className="text-sm text-gray-500">إجمالي الملفات</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">{classifiedCount}</p>
          <p className="text-sm text-gray-500">مصنفة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-amber-600">{pendingCount}</p>
          <p className="text-sm text-gray-500">قيد الانتظار</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-blue-600">{avgQuality}%</p>
          <p className="text-sm text-gray-500">متوسط الجودة</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Drop Zone */}
          <div
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer ${
              dragActive ? 'border-pink-500 bg-pink-50' : 'border-gray-300 hover:border-pink-400'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const droppedFiles = e.dataTransfer.files;
              if (droppedFiles) Array.from(droppedFiles).forEach(handleFileUpload);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            {classifyMutation.isPending ? (
              <>
                <Loader2 className="mb-2 h-10 w-10 animate-spin text-pink-400" />
                <p className="font-medium text-gray-700">جاري التصنيف...</p>
              </>
            ) : (
              <>
                <Upload className="mb-2 h-10 w-10 text-gray-300" />
                <p className="font-medium text-gray-700">اسحب الملفات هنا للتصنيف التلقائي</p>
                <p className="text-sm text-gray-400">Drag files here for automatic AI classification</p>
              </>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="البحث..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 ps-10 pe-4 text-sm focus:border-pink-500 focus:outline-none" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
              <option value="all">الكل</option>
              <option value="active">نشط</option>
              <option value="processing">معالجة</option>
              <option value="error">خطأ</option>
            </select>
          </div>

          {/* Files Table */}
          <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-pink-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                لا توجد ملفات. قم بسحب ملفات للتصنيف التلقائي.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-3 text-start font-medium text-gray-500">الملف</th>
                    <th className="px-4 py-3 text-start font-medium text-gray-500">التصنيف</th>
                    <th className="px-4 py-3 text-start font-medium text-gray-500">الجودة</th>
                    <th className="px-4 py-3 text-start font-medium text-gray-500">الوسوم</th>
                    <th className="px-4 py-3 text-start font-medium text-gray-500">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((file) => {
                    const ext = file.format?.toLowerCase() || file.name.split('.').pop()?.toLowerCase() || '';
                    const Icon = formatIcons[ext] || File;
                    const quality = file.qualityScore || 0;
                    const tags: string[] = Array.isArray(file.tags) ? file.tags : [];
                    return (
                      <tr key={file.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Icon className="h-5 w-5 text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900 text-xs">{file.name}</p>
                              <p className="text-xs text-gray-400">{(file.format || ext).toUpperCase()} - {formatSize(file.sizeBytes)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {file.category ? (
                            <span className="text-gray-700">{file.category}</span>
                          ) : (
                            <span className="text-gray-400 italic">غير مصنف</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {quality > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-12 rounded-full bg-gray-200">
                                <div className={`h-1.5 rounded-full ${quality >= 90 ? 'bg-green-500' : quality >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${quality}%` }} />
                              </div>
                              <span className="text-xs">{quality}%</span>
                            </div>
                          ) : <span className="text-gray-400">--</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {tags.map((tag: string) => (
                              <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{tag}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Link href={`/data/reading?id=${file.id}`} className="rounded p-1 hover:bg-gray-100">
                              <Eye className="h-4 w-4 text-gray-400" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Sidebar - Categories */}
        <div className="space-y-4">
          <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
            <h3 className="mb-4 font-semibold text-gray-900">التصنيفات - Categories</h3>
            <div className="space-y-3">
              {Object.entries(categoryGroups).map(([name, count], i) => (
                <div key={name} className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${categoryColors[i % categoryColors.length]}`} />
                  <span className="flex-1 text-sm text-gray-700">{name}</span>
                  <span className="text-sm font-medium text-gray-500">{count}</span>
                </div>
              ))}
              {Object.keys(categoryGroups).length === 0 && (
                <p className="text-sm text-gray-400">لا توجد تصنيفات بعد</p>
              )}
            </div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 p-5 text-white">
            <Brain className="mb-3 h-8 w-8" />
            <h3 className="font-semibold">التصنيف بالذكاء الاصطناعي</h3>
            <p className="mt-1 text-sm text-pink-100">يقوم النظام بتصنيف الملفات تلقائيا باستخدام GPT-4o</p>
            <p className="mt-1 text-xs text-pink-200">يحدد نوع كل ملف: مالي، موارد بشرية، مبيعات، مشاريع...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
