'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Eye, Upload, Play, Pause, CheckCircle, Clock, AlertTriangle,
  Image, FileText, Scan, Settings, Plus, Loader2,
  ArrowRight, RefreshCw, PenTool,
} from 'lucide-react';
import { api } from '@/lib/api';

interface VisualPipeline {
  id: string;
  name: string;
  description: string;
  steps: string[];
  status: string;
  processedCount: number;
  accuracy: number;
  createdAt: string;
}

interface ProcessedFile {
  id: string;
  name: string;
  format: string;
  status: string;
  confidence: number;
  createdAt: string;
}

export default function VisualProcessingPage() {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: pipelinesRes, isLoading: loadingPipelines } = useQuery({
    queryKey: ['visual-pipelines'],
    queryFn: () => api.get<{ success: boolean; data: VisualPipeline[] }>('/api/v1/data/visual-processing'),
  });

  const { data: datasetsRes, isLoading: loadingDatasets } = useQuery({
    queryKey: ['datasets-for-canvas'],
    queryFn: () => api.get<{ success: boolean; data: { id: string; name: string }[] }>('/api/v1/data/sources'),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<{ success: boolean }>('/api/v1/data/import/auto', formData);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visual-pipelines'] }),
  });

  const pipelines: VisualPipeline[] = (pipelinesRes as { data?: VisualPipeline[] })?.data ?? [];
  const datasets = (datasetsRes as { data?: { id: string; name: string }[] })?.data ?? [];

  const totalProcessed = pipelines.reduce((s, p) => s + (p.processedCount || 0), 0);
  const avgAccuracy = pipelines.length > 0
    ? Math.round(pipelines.filter(p => p.accuracy > 0).reduce((s, p) => s + p.accuracy, 0) / Math.max(1, pipelines.filter(p => p.accuracy > 0).length))
    : 0;
  const activeCount = pipelines.filter(p => p.status === 'active').length;

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
      <input ref={fileInputRef} type="file" className="hidden" multiple accept="image/*,.pdf"
        onChange={(e) => {
          if (e.target.files) Array.from(e.target.files).forEach(f => uploadMutation.mutate(f));
        }}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/data" className="hover:text-blue-600">محرك البيانات</Link>
            <span>/</span>
            <span>لوحة المعالجة البصرية</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">لوحة المعالجة البصرية</h1>
          <p className="text-gray-500">Data Canvas & Visual Processing</p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          <Plus className="h-4 w-4" /> معالجة ملفات جديدة
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-rose-600">{pipelines.length}</p>
          <p className="text-sm text-gray-500">خطوط المعالجة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-blue-600">{totalProcessed.toLocaleString()}</p>
          <p className="text-sm text-gray-500">ملفات تمت معالجتها</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">{avgAccuracy}%</p>
          <p className="text-sm text-gray-500">متوسط الدقة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-amber-600">{activeCount}</p>
          <p className="text-sm text-gray-500">خطوط نشطة</p>
        </div>
      </div>

      {/* Canvas Drop Zone */}
      <div
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer ${
          dragActive ? 'border-rose-500 bg-rose-50' : 'border-gray-300 hover:border-rose-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files) Array.from(e.dataTransfer.files).forEach(f => uploadMutation.mutate(f));
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploadMutation.isPending ? (
          <>
            <Loader2 className="mb-3 h-12 w-12 animate-spin text-rose-400" />
            <p className="font-medium text-gray-700">جاري المعالجة...</p>
          </>
        ) : (
          <>
            <PenTool className="mb-3 h-12 w-12 text-gray-300" />
            <p className="text-lg font-medium text-gray-700">لوحة البيانات البصرية</p>
            <p className="text-sm text-gray-400">اسحب ملفات، أعمدة، فلاتر، عمليات حسابية، أو علاقات ربط</p>
            <p className="mt-1 text-xs text-gray-400">Data Canvas - Drag files, columns, filters, calculations, and relationships</p>
            <button
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className="mt-4 rounded-lg bg-rose-600 px-6 py-2 text-sm font-medium text-white hover:bg-rose-700"
            >
              اختيار ملفات
            </button>
          </>
        )}
      </div>

      {/* Dataset Quick Access */}
      {datasets.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">مجموعات البيانات المتاحة</h2>
          <div className="flex flex-wrap gap-2">
            {datasets.slice(0, 10).map((ds: { id: string; name: string }) => (
              <Link
                key={ds.id}
                href={`/data/reading?id=${ds.id}`}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:border-rose-300 hover:bg-rose-50 transition-colors"
              >
                {ds.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pipelines */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">خطوط المعالجة - Processing Pipelines</h2>
        {loadingPipelines ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-rose-400" />
          </div>
        ) : pipelines.length === 0 ? (
          <div className="rounded-xl bg-white p-12 shadow-sm border border-gray-100 text-center text-gray-400">
            <Scan className="mx-auto mb-4 h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">لا توجد خطوط معالجة</p>
            <p className="text-sm">قم بسحب ملفات لإنشاء خط معالجة تلقائي</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pipelines.map((pipeline) => (
              <div key={pipeline.id} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{pipeline.name}</h3>
                    <p className="text-sm text-gray-400">{pipeline.description}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    pipeline.status === 'active' ? 'bg-green-100 text-green-700' :
                    pipeline.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {pipeline.status === 'active' ? 'نشط' : pipeline.status === 'paused' ? 'متوقف' : 'مسودة'}
                  </span>
                </div>
                {Array.isArray(pipeline.steps) && pipeline.steps.length > 0 && (
                  <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
                    {pipeline.steps.map((step: string, i: number) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="whitespace-nowrap rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{step}</span>
                        {i < pipeline.steps.length - 1 && <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{(pipeline.processedCount || 0).toLocaleString()} ملف</span>
                  {pipeline.accuracy > 0 && (
                    <span className={`font-medium ${pipeline.accuracy >= 90 ? 'text-green-600' : 'text-amber-600'}`}>
                      دقة {pipeline.accuracy}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
