'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowRight,
  Download,
  FileImage,
  FileText,
  Image,
  Loader2,
  AlertCircle,
  Layers,
} from 'lucide-react';
import { fetchInfographic, exportInfographic, type InfographicElement } from '@/lib/api/infographic';
import { renderPreview, getRenderStatus, type RenderJob } from '@/lib/api/rendering';

const elementTypeLabels: Record<string, string> = {
  text: 'نص',
  image: 'صورة',
  icon: 'أيقونة',
  chart: 'مخطط',
  shape: 'شكل',
  divider: 'فاصل',
};

export default function InfographicViewerPage() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const infographicId = typeof params?.id === "string" ? params.id : "";
  const [isExporting, setIsExporting] = useState(false);
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const handleRenderPreview = async () => {
    setIsRendering(true);
    try {
      const job = await renderPreview({ templateId: infographicId, format: 'png', width: 1080, height: 1920 });
      setRenderJob(job);
      if (job.status === 'pending' || job.status === 'processing') {
        const status = await getRenderStatus(job.jobId);
        setRenderJob(status);
      }
    } catch (err) {
      console.error('Render preview failed:', err);
    } finally {
      setIsRendering(false);
    }
  };

  const { data: infographic, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['infographic', infographicId],
    queryFn: () => fetchInfographic(infographicId),
    enabled: !!infographicId,
  });

  const handleExport = async (format: 'png' | 'svg' | 'pdf') => {
    setIsExporting(true);
    try {
      const blob = await exportInfographic(infographicId, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${infographic?.name ?? 'infographic'}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-rasid-600" />
        <span className="ms-3 text-gray-500">جاري تحميل الإنفوجرافيك...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-red-700 dark:text-red-400">{error instanceof Error ? error.message : 'حدث خطأ'}</p>
        <button onClick={() => refetch()} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">إعادة المحاولة</button>
      </div>
    );
  }

  const elements = infographic?.elements ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/infographics')} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <ArrowRight className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{infographic?.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{infographic?.width}x{infographic?.height} - {elements.length} عناصر</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRenderPreview} disabled={isRendering} className="inline-flex items-center gap-2 rounded-lg border border-sky-300 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-600 dark:text-sky-300 dark:hover:bg-sky-900" data-testid="infographic-render-preview">
            {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
            معاينة العرض
          </button>
          <button onClick={() => handleExport('png')} disabled={isExporting} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
            تصدير PNG
          </button>
          <button onClick={() => handleExport('svg')} disabled={isExporting} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            تصدير SVG
          </button>
          <button onClick={() => handleExport('pdf')} disabled={isExporting} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            تصدير PDF
          </button>
        </div>
      </div>

      <div className="grid h-[calc(100vh-220px)] grid-cols-12 gap-4">
        {/* Preview */}
        <div className="col-span-8 flex items-center justify-center overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
          {infographic?.previewUrl ? (
            <img src={infographic.previewUrl} alt={infographic.name} className="max-h-full max-w-full rounded-lg shadow-lg" />
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <Image className="h-20 w-20" />
              <p>لا توجد معاينة متاحة</p>
            </div>
          )}
        </div>

        {/* Element List */}
        <div className="col-span-4 overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
            العناصر ({elements.length})
          </h2>
          {elements.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Layers className="h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="text-xs text-gray-400">لا توجد عناصر</p>
            </div>
          )}
          <div className="space-y-2">
            {elements.map((el: InfographicElement, idx: number) => (
              <div key={el.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {idx + 1}. {elementTypeLabels[el.type] || el.type}
                  </span>
                  <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-600 dark:text-gray-300">
                    {el.type}
                  </span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span>الموقع: ({el.x}, {el.y})</span>
                  <span>الحجم: {el.width}x{el.height}</span>
                </div>
                {el.content && (
                  <p className="mt-1 truncate text-xs text-gray-600 dark:text-gray-400">{el.content}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
