'use client';

import React, { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Upload,
  Download,
  Image,
  Loader2,
  AlertCircle,
  Palette,
  Layers,
  Maximize,
  BarChart3,
  FileText,
  LayoutDashboard,
  Presentation,
  FileSpreadsheet,
  Database,
  Sparkles,
  ScanText,
  Copy,
  Wand2,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
} from 'lucide-react';
import FileUploader from '@/components/ui/FileUploader';
import {
  replicateImage,
  downloadReplica,
  enhanceImage,
  extractDocument,
  type ReplicationJob,
  type ReplicationMode,
  type EnhanceResult,
  type ExtractResult,
} from '@/lib/api/replication';

// --- Constants ---

type TabKey = 'visual' | 'extract';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'visual', label: 'المطابقة البصرية', icon: <Copy className="h-4 w-4" /> },
  { key: 'extract', label: 'تفريغ المستندات', icon: <ScanText className="h-4 w-4" /> },
];

const MODE_OPTIONS: Array<{
  value: ReplicationMode;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'STRICT_REPLICATION',
    label: 'المطابقة الحرفية',
    sublabel: 'Strict Replication',
    icon: <Copy className="h-5 w-5" />,
  },
  {
    value: 'PROFESSIONAL_CREATION',
    label: 'الإنشاء الاحترافي',
    sublabel: 'Professional Creation',
    icon: <Sparkles className="h-5 w-5" />,
  },
  {
    value: 'HYBRID',
    label: 'هجين',
    sublabel: 'Hybrid',
    icon: <Layers className="h-5 w-5" />,
  },
];

const complexityLabels: Record<string, string> = {
  low: 'منخفض',
  medium: 'متوسط',
  high: 'عالي',
};
const complexityColors: Record<string, string> = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// --- Match Indicator ---

function MatchIndicator({ score }: { score: number }) {
  const color =
    score >= 95
      ? 'text-green-600 dark:text-green-400'
      : score >= 80
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400';
  const bgColor =
    score >= 95
      ? 'bg-green-100 dark:bg-green-900/30'
      : score >= 80
        ? 'bg-yellow-100 dark:bg-yellow-900/30'
        : 'bg-red-100 dark:bg-red-900/30';
  const ringColor =
    score >= 95
      ? 'stroke-green-500'
      : score >= 80
        ? 'stroke-yellow-500'
        : 'stroke-red-500';

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-28 w-28">
        <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="8"
            className="stroke-gray-200 dark:stroke-gray-700"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className={ringColor}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-2xl font-bold ${color}`}>{score.toFixed(1)}%</span>
        </div>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${bgColor} ${color}`}>
        {score >= 95 ? 'مطابقة ممتازة' : score >= 80 ? 'مطابقة جيدة' : 'يحتاج تحسين'}
      </span>
    </div>
  );
}

// --- Main Page ---

export default function ReplicatePage() {
  const router = useRouter();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('visual');

  // Visual matching state
  const [mode, setMode] = useState<ReplicationMode>('STRICT_REPLICATION');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [job, setJob] = useState<ReplicationJob | null>(null);
  const [enhanceResult, setEnhanceResult] = useState<EnhanceResult | null>(null);

  // Document extraction state
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const [extractLang, setExtractLang] = useState<string>('ar');
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);

  // Mutations
  const replicateMutation = useMutation({
    mutationFn: replicateImage,
    onSuccess: (result) => {
      setJob(result);
    },
  });

  const enhanceMutation = useMutation({
    mutationFn: enhanceImage,
    onSuccess: (result) => {
      setEnhanceResult(result);
    },
  });

  const extractMutation = useMutation({
    mutationFn: ({ file, language }: { file: File; language: string }) =>
      extractDocument(file, { language }),
    onSuccess: (result) => {
      setExtractResult(result);
    },
  });

  // Handlers
  const handleFileSelect = useCallback(async (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      setJob(null);
      setEnhanceResult(null);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  }, []);

  const handleReplicate = useCallback(() => {
    if (!selectedFile) return;
    replicateMutation.mutate({ file: selectedFile, mode });
  }, [selectedFile, mode, replicateMutation]);

  const handleEnhance = useCallback(() => {
    if (!selectedFile) return;
    enhanceMutation.mutate(selectedFile);
  }, [selectedFile, enhanceMutation]);

  const handleDownload = useCallback(async () => {
    if (!job) return;
    try {
      const blob = await downloadReplica(job.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `replica-${job.id}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }, [job]);

  const handleExtractFileSelect = useCallback(async (files: File[]) => {
    if (files.length > 0) {
      setExtractFile(files[0]);
      setExtractResult(null);
    }
  }, []);

  const handleExtract = useCallback(() => {
    if (!extractFile) return;
    extractMutation.mutate({ file: extractFile, language: extractLang });
  }, [extractFile, extractLang, extractMutation]);

  const analysis = job?.analysisResults;
  const isProcessing =
    replicateMutation.isPending ||
    (job && ['pending', 'analyzing', 'replicating'].includes(job.status));

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-cyan-500 via-blue-500 to-indigo-600 px-8 py-8">
        <div className="pointer-events-none absolute -left-20 -top-20 h-60 w-60 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
              <Image className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                استنساخ الصور
              </h1>
              <p className="mt-0.5 text-sm font-medium text-white/70">
                Image Replication
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800/50">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-rasid-600 shadow-sm dark:bg-gray-700 dark:text-rasid-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ============ Visual Matching Tab ============ */}
      {activeTab === 'visual' && (
        <>
          {/* Mode Selection */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
              وضع الاستنساخ
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  className={`flex items-center gap-3 rounded-xl border-2 p-4 text-start transition-all ${
                    mode === opt.value
                      ? 'border-rasid-500 bg-rasid-50 dark:border-rasid-400 dark:bg-rasid-900/20'
                      : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      mode === opt.value
                        ? 'bg-rasid-100 text-rasid-600 dark:bg-rasid-800 dark:text-rasid-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {opt.icon}
                  </div>
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        mode === opt.value
                          ? 'text-rasid-700 dark:text-rasid-300'
                          : 'text-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {opt.label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{opt.sublabel}</p>
                  </div>
                  {mode === opt.value && (
                    <Check className="ms-auto h-5 w-5 shrink-0 text-rasid-500" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Upload Section */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  رفع الصورة الأصلية
                </h3>
                <FileUploader
                  onUpload={handleFileSelect}
                  maxFiles={1}
                  accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.svg', '.webp'] }}
                  labelAr="رفع الصورة"
                  descriptionAr="اسحب الصورة وأفلتها هنا"
                />
              </div>
              <div className="flex flex-col items-center justify-center gap-4">
                {selectedFile && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    الملف:{' '}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {selectedFile.name}
                    </span>
                  </p>
                )}

                {/* Enhancement info */}
                {enhanceResult && (
                  <div className="w-full rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                    <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400">
                      <Sparkles className="h-4 w-4" />
                      تم تحسين الصورة
                    </div>
                    <ul className="space-y-0.5">
                      {enhanceResult.improvements.map((imp, idx) => (
                        <li
                          key={idx}
                          className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400"
                        >
                          <Check className="h-3 w-3 shrink-0" />
                          {imp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3">
                  {/* Enhance button */}
                  <button
                    onClick={handleEnhance}
                    disabled={!selectedFile || enhanceMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-xl border border-rasid-200 bg-rasid-50 px-5 py-2.5 text-sm font-medium text-rasid-700 shadow-sm transition hover:bg-rasid-100 disabled:opacity-50 dark:border-rasid-700 dark:bg-rasid-900/20 dark:text-rasid-300 dark:hover:bg-rasid-900/40"
                  >
                    {enhanceMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جاري التحسين...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        تحسين الصورة
                      </>
                    )}
                  </button>

                  {/* Replicate button */}
                  <button
                    onClick={handleReplicate}
                    disabled={!selectedFile || !!isProcessing}
                    className="inline-flex items-center gap-2 rounded-xl bg-rasid-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-rasid-700 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        {job?.status === 'analyzing'
                          ? 'جاري التحليل...'
                          : job?.status === 'replicating'
                            ? 'جاري الاستنساخ...'
                            : 'جاري المعالجة...'}
                      </>
                    ) : (
                      <>
                        <Layers className="h-5 w-5" />
                        بدء الاستنساخ
                      </>
                    )}
                  </button>
                </div>

                {replicateMutation.isError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    فشل الاستنساخ. حاول مرة أخرى.
                  </div>
                )}
                {enhanceMutation.isError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    فشل تحسين الصورة. حاول مرة أخرى.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Side-by-Side Comparison */}
          {(previewUrl || job?.replicaImageUrl) && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  المقارنة
                </h3>
                {job?.fidelityScore != null && <MatchIndicator score={job.fidelityScore} />}
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Original */}
                <div>
                  <h4 className="mb-2 text-center text-sm font-medium text-gray-600 dark:text-gray-400">
                    الأصلية
                  </h4>
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Original"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <Image className="h-16 w-16 text-gray-300" />
                    )}
                  </div>
                </div>
                {/* Replica */}
                <div>
                  <h4 className="mb-2 text-center text-sm font-medium text-gray-600 dark:text-gray-400">
                    النسخة
                  </h4>
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700">
                    {job?.replicaImageUrl ? (
                      <img
                        src={job.replicaImageUrl}
                        alt="Replica"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : isProcessing ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-10 w-10 animate-spin text-rasid-600" />
                        <p className="text-sm text-gray-500">جاري الاستنساخ...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Image className="h-16 w-16 text-gray-300" />
                        <p className="text-xs text-gray-400">ستظهر النسخة هنا</p>
                      </div>
                    )}
                  </div>
                  {job?.replicaImageUrl && (
                    <div className="mt-3 text-center">
                      <button
                        onClick={handleDownload}
                        className="inline-flex items-center gap-2 rounded-lg bg-rasid-600 px-4 py-2 text-sm text-white hover:bg-rasid-700"
                      >
                        <Download className="h-4 w-4" />
                        تحميل النسخة
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Conversion Buttons - shown after successful replication */}
          {job?.status === 'completed' && job.replicaImageUrl && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                تحويل النتيجة
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <button
                  onClick={() =>
                    router.push(`/dashboard?source=replication&jobId=${job.id}`)
                  }
                  className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center transition hover:border-blue-300 hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
                >
                  <LayoutDashboard className="h-6 w-6 text-blue-500" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    تحويل للوحة بيانات
                  </span>
                </button>
                <button
                  onClick={() =>
                    router.push(`/presentations?source=replication&jobId=${job.id}`)
                  }
                  className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center transition hover:border-purple-300 hover:bg-purple-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-purple-500 dark:hover:bg-purple-900/20"
                >
                  <Presentation className="h-6 w-6 text-purple-500" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    تحويل لعرض تقديمي
                  </span>
                </button>
                <button
                  onClick={() =>
                    router.push(`/reports?source=replication&jobId=${job.id}`)
                  }
                  className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center transition hover:border-orange-300 hover:bg-orange-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-orange-500 dark:hover:bg-orange-900/20"
                >
                  <FileText className="h-6 w-6 text-orange-500" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    تحويل لتقرير
                  </span>
                </button>
                <button
                  onClick={() =>
                    router.push(`/excel?source=replication&jobId=${job.id}`)
                  }
                  className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center transition hover:border-green-300 hover:bg-green-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-green-500 dark:hover:bg-green-900/20"
                >
                  <FileSpreadsheet className="h-6 w-6 text-green-500" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    تحويل لإكسل
                  </span>
                </button>
                <button
                  onClick={() =>
                    router.push(`/data?source=replication&jobId=${job.id}&action=link`)
                  }
                  className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-cyan-500 dark:hover:bg-cyan-900/20"
                >
                  <Database className="h-6 w-6 text-cyan-500" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    ربط بيانات
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Analysis Results */}
          {analysis && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                نتائج التحليل
              </h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                {/* Dimensions */}
                <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
                  <div className="mb-2 flex items-center gap-2">
                    <Maximize className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      الأبعاد
                    </span>
                  </div>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {analysis.dimensions.width} x {analysis.dimensions.height}
                  </p>
                  <p className="text-xs text-gray-500">التنسيق: {analysis.format}</p>
                </div>

                {/* Complexity */}
                <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
                  <div className="mb-2 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      التعقيد
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${complexityColors[analysis.complexity]}`}
                  >
                    {complexityLabels[analysis.complexity]}
                  </span>
                  <p className="mt-1 text-xs text-gray-500">النمط: {analysis.style}</p>
                </div>

                {/* Color Palette */}
                <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
                  <div className="mb-2 flex items-center gap-2">
                    <Palette className="h-4 w-4 text-pink-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      لوحة الألوان
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.colorPalette.map((color, idx) => (
                      <div
                        key={idx}
                        className="h-6 w-6 rounded-md border border-gray-200 shadow-sm dark:border-gray-500"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>

                {/* Dominant Colors */}
                <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
                  <div className="mb-2 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      الألوان السائدة
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {analysis.dominantColors.map((dc, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 rounded border border-gray-200 dark:border-gray-500"
                          style={{ backgroundColor: dc.hex }}
                        />
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {dc.hex}
                        </span>
                        <span className="ms-auto text-xs font-medium text-gray-500">
                          {dc.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Detected Elements */}
              {analysis.elements.length > 0 && (
                <div className="mt-6">
                  <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    العناصر المكتشفة ({analysis.elements.length})
                  </h4>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {analysis.elements.map((el, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-gray-200 p-3 dark:border-gray-600"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {el.type}
                          </span>
                          <span className="text-xs text-gray-400">
                            {el.boundingBox.w}x{el.boundingBox.h}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {el.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {!previewUrl && !job && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                <Image className="h-12 w-12 text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400">ارفع صورة لبدء الاستنساخ</p>
            </div>
          )}
        </>
      )}

      {/* ============ Document Extraction Tab ============ */}
      {activeTab === 'extract' && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  رفع المستند
                </h3>
                <FileUploader
                  onUpload={handleExtractFileSelect}
                  maxFiles={1}
                  accept={{
                    'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp'],
                    'application/pdf': ['.pdf'],
                  }}
                  labelAr="رفع مستند أو صورة"
                  descriptionAr="اسحب الملف وأفلته هنا (صورة أو PDF)"
                />
              </div>
              <div className="flex flex-col items-center justify-center gap-4">
                {extractFile && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    الملف:{' '}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {extractFile.name}
                    </span>
                  </p>
                )}

                {/* Language selector */}
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">لغة المستند:</span>
                  <div className="flex gap-1 rounded-lg border border-gray-200 p-0.5 dark:border-gray-600">
                    <button
                      onClick={() => setExtractLang('ar')}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                        extractLang === 'ar'
                          ? 'bg-rasid-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      عربي
                    </button>
                    <button
                      onClick={() => setExtractLang('en')}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                        extractLang === 'en'
                          ? 'bg-rasid-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      English
                    </button>
                    <button
                      onClick={() => setExtractLang('auto')}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                        extractLang === 'auto'
                          ? 'bg-rasid-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      تلقائي
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleExtract}
                  disabled={!extractFile || extractMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-rasid-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-rasid-700 disabled:opacity-50"
                >
                  {extractMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      جاري التفريغ...
                    </>
                  ) : (
                    <>
                      <ScanText className="h-5 w-5" />
                      بدء التفريغ
                    </>
                  )}
                </button>

                {extractMutation.isError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    فشل تفريغ المستند. حاول مرة أخرى.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Extraction Results */}
          {extractResult && (
            <div className="space-y-4">
              {/* Extracted Text */}
              {extractResult.text && (
                <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    <FileText className="h-5 w-5 text-rasid-500" />
                    النص المستخرج
                  </h3>
                  <div
                    dir="auto"
                    className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  >
                    {extractResult.text}
                  </div>
                </div>
              )}

              {/* Extracted Tables */}
              {extractResult.tables.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    <FileSpreadsheet className="h-5 w-5 text-green-500" />
                    الجداول المستخرجة ({extractResult.tables.length})
                  </h3>
                  <div className="space-y-4">
                    {extractResult.tables.map((table, tIdx) => (
                      <div
                        key={tIdx}
                        className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600"
                      >
                        <table className="min-w-full text-sm">
                          {table.headers.length > 0 && (
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700">
                                {table.headers.map((h, hIdx) => (
                                  <th
                                    key={hIdx}
                                    className="px-4 py-2 text-start text-xs font-semibold text-gray-700 dark:text-gray-300"
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                          )}
                          <tbody>
                            {table.rows.map((row, rIdx) => (
                              <tr
                                key={rIdx}
                                className="border-b border-gray-100 last:border-0 dark:border-gray-700"
                              >
                                {row.map((cell, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="px-4 py-2 text-gray-800 dark:text-gray-200"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Extracted Images */}
              {extractResult.images.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    <Image className="h-5 w-5 text-blue-500" />
                    الصور المستخرجة ({extractResult.images.length})
                  </h3>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {extractResult.images.map((img, iIdx) => (
                      <div
                        key={iIdx}
                        className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600"
                      >
                        <img
                          src={img.url}
                          alt={img.description}
                          className="aspect-square w-full object-cover"
                        />
                        <p className="p-2 text-xs text-gray-500 dark:text-gray-400">
                          {img.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state for extraction */}
          {!extractResult && !extractMutation.isPending && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                <ScanText className="h-12 w-12 text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400">
                ارفع مستند أو صورة لاستخراج النصوص والجداول
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                يدعم العربية والإنجليزية - OCR متقدم
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
