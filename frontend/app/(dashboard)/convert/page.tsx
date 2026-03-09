'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  Download,
  ArrowLeftRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import FileUploader from '@/components/ui/FileUploader';
import {
  convertFile,
  fetchConversionHistory,
  downloadConversionResult,
  fetchSupportedFormats,
  deleteConversionJob,
  type ConversionJob,
} from '@/lib/api/conversion';

const statusLabels: Record<string, string> = {
  pending: 'قيد الانتظار',
  processing: 'جاري المعالجة',
  completed: 'مكتمل',
  failed: 'فشل',
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-yellow-500" />,
  processing: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
};

export default function ConvertPage() {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState('');

  const { data: historyData, isLoading: historyLoading, isError: historyError, error: historyErr, refetch: refetchHistory } = useQuery({
    queryKey: ['conversion-history'],
    queryFn: () => fetchConversionHistory({ limit: 50 }),
  });

  const { data: formats } = useQuery({
    queryKey: ['supported-formats'],
    queryFn: fetchSupportedFormats,
  });

  const convertMutation = useMutation({
    mutationFn: convertFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversion-history'] });
      setSelectedFile(null);
      setTargetFormat('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteConversionJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversion-history'] }),
  });

  const handleFileSelect = async (files: File[]) => {
    if (files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const handleConvert = () => {
    if (!selectedFile || !targetFormat) return;
    convertMutation.mutate({ file: selectedFile, targetFormat });
  };

  const handleDownload = async (job: ConversionJob) => {
    try {
      const blob = await downloadConversionResult(job.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = job.sourceFileName.replace(/\.[^/.]+$/, '');
      a.download = `${baseName}.${job.targetFormat}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const history = historyData?.data ?? [];
  const supportedFormats = formats ?? [];
  const sourceExt = selectedFile?.name.split('.').pop()?.toLowerCase() ?? '';
  const matchedFormat = supportedFormats.find((f) => f.extension === sourceExt);
  const availableTargets = matchedFormat?.targets ?? [];

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-indigo-500 via-violet-500 to-purple-600 px-8 py-8">
        <div className="pointer-events-none absolute -left-20 -top-20 h-60 w-60 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
            <ArrowLeftRight className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              تحويل الملفات
            </h1>
            <p className="mt-0.5 text-sm font-medium text-white/70">
              File Conversion Engine
            </p>
          </div>
        </div>
      </div>

      {/* Conversion Form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Source File */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">رفع الملف المصدر</h3>
            {selectedFile ? (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700">
                <FileText className="h-8 w-8 text-rasid-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button onClick={() => setSelectedFile(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-600">
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <FileUploader
                onUpload={handleFileSelect}
                maxFiles={1}
                labelAr="رفع الملف"
                descriptionAr="اسحب الملف وأفلته هنا"
              />
            )}
          </div>

          {/* Target Format */}
          <div className="flex flex-col items-center justify-center">
            <ArrowLeftRight className="mb-3 h-8 w-8 text-gray-400" />
            <div className="w-full">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">التنسيق المستهدف</label>
              <select
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value)}
                disabled={!selectedFile}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">اختر التنسيق</option>
                {availableTargets.map((t) => (
                  <option key={t} value={t}>{t.toUpperCase()}</option>
                ))}
                {availableTargets.length === 0 && selectedFile && (
                  <option disabled>لا توجد تنسيقات متاحة</option>
                )}
              </select>
            </div>
          </div>

          {/* Convert Button */}
          <div className="flex flex-col items-center justify-center">
            <button
              onClick={handleConvert}
              disabled={!selectedFile || !targetFormat || convertMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-rasid-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-rasid-700 disabled:opacity-50"
            >
              {convertMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  جاري التحويل...
                </>
              ) : (
                <>
                  <ArrowLeftRight className="h-5 w-5" />
                  تحويل
                </>
              )}
            </button>
            {convertMutation.isError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">فشل التحويل. حاول مرة أخرى.</p>
            )}
          </div>
        </div>
      </div>

      {/* History */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">سجل التحويلات</h2>

        {historyLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-rasid-600" />
            <span className="ms-2 text-gray-500">جاري التحميل...</span>
          </div>
        )}

        {historyError && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 py-8 dark:border-red-800 dark:bg-red-900/20">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <p className="text-sm text-red-700 dark:text-red-400">{historyErr instanceof Error ? historyErr.message : 'حدث خطأ'}</p>
            <button onClick={() => refetchHistory()} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700">إعادة المحاولة</button>
          </div>
        )}

        {!historyLoading && !historyError && history.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 dark:text-gray-400">لا توجد تحويلات سابقة</p>
          </div>
        )}

        {!historyLoading && !historyError && history.length > 0 && (
          <div className="space-y-2">
            {history.map((job: ConversionJob) => (
              <div key={job.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                {statusIcons[job.status]}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{job.sourceFileName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {job.sourceFormat.toUpperCase()} &rarr; {job.targetFormat.toUpperCase()} - {statusLabels[job.status]}
                  </p>
                </div>
                <span className="text-xs text-gray-400">{format(new Date(job.createdAt), 'dd MMM yyyy HH:mm', { locale: ar })}</span>
                <div className="flex gap-1">
                  {job.status === 'completed' && (
                    <button onClick={() => handleDownload(job)} className="rounded-lg p-2 text-rasid-600 hover:bg-rasid-50 dark:hover:bg-rasid-900/20" title="تحميل">
                      <Download className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => deleteMutation.mutate(job.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20" title="حذف">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
