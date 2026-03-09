'use client';

import React, { useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Target,
  Layers,
  Eye,
  ScanLine,
  FileText,
  Table2,
  BarChart3,
  LayoutDashboard,
  GitCompare,
  Wand2,
  Languages,
  Globe2,
  ShieldCheck,
  Download,
  Lock,
  Award,
  ImageIcon,
  FileDown,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Settings2,
  Cpu,
  Binary,
  Fingerprint,
  Microscope,
  Palette,
  Type,
  PieChart,
  Filter,
  Grid3X3,
  Box,
  Scan,
  Columns,
  ListOrdered,
  FormInput,
  FileSpreadsheet,
  AreaChart,
  TrendingUp,
  Circle,
  Paintbrush,
  Gauge,
  RotateCcw,
  Maximize,
  Contrast,
  Droplets,
  ZoomIn,
  Hash,
  ArrowLeftRight,
  Replace,
  ClipboardCheck,
  Bug,
  FileSearch,
  Percent,
  BookOpen,
  RefreshCw,
  Shield,
  Zap,
  Database,
  Calculator,
  Calendar,
  Network,
  Sliders,
  Crosshair,
  FlipHorizontal,
  AlignCenter,
  Move,
  Copy,
} from 'lucide-react';
import FileUploader from '@/components/ui/FileUploader';
import {
  analyzeImage,
  extractColors,
  extractText,
  extractLayout,
  extractCharts,
  compareImages,
  computeSSIM,
  computeScore,
  generateDiffReport,
  replicateDocument,
  replicateDashboard,
  replicatePresentation,
  getSuggestions,
  listJobs,
  getJob,
  setMode,
  setStrictMode,
  setStrictConfig,
  capture,
  fingerprint,
  extractStructure,
  inferDataStructure,
  reconstructExcel,
  toLiveSystem,
  imageToDashboard,
  transform,
  exportCDR,
  visualReplicate,
  rtlTransform,
  rtlMirror,
  rtlValidate,
  bindData,
  buildCDR,
  getCDR,
  snapshotCDR,
  getCDRSnapshots,
  verify,
  getFidelityScore,
  getDriftReport,
  roundTripValidate,
  lockLayout,
  unlockLayout,
  xlsxExtractStructure,
  xlsxValidate,
  pptxExtractStructure,
  pptxValidate,
  srcEnforce,
  chartExtract,
  visualReplicationAnalyze,
  visualReplicationReconstructDashboard,
  visualReplicationReconstructPresentation,
  visualReplicationReconstructReport,
  visualReplicationCompare,
  visualReplicationFingerprint,
  executePipeline,
  getPipelineGenerators,
  pixelCompare,
  pixelValidateLoop,
  qualityValidate,
  recognizeFonts,
  generateFromLayout,
  generateFromLayoutUpload,
  getGenerateFromLayoutGenerators,
  extractDataFromLayout,
  getBindableNodes,
  processLargeImage,
  checkLargeImage,
  multiScaleLargeImage,
  processPDF,
  pdfToLayoutGraph,
  localizeArabic,
  type ReplicationMode,
  type ReplicationJob,
  type AnalysisResult,
  type FidelityScore,
  type ComparisonResult,
  type StrictModeSwitches,
  type StrictConfigRequest,
} from '@/lib/api/replication-engine';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface PipelineStage {
  id: string;
  labelAr: string;
  labelEn: string;
  status: 'idle' | 'running' | 'done' | 'error';
  progress: number;
}

interface SectionProps {
  id: string;
  titleAr: string;
  titleEn: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Collapsible Section Component
// ─────────────────────────────────────────────────────────────

function Section({ id, titleAr, titleEn, icon, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-start transition hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
            {icon}
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{titleAr}</h2>
            <p className="text-sm text-indigo-600 dark:text-indigo-400">{titleEn}</p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>
      {open && <div className="border-t border-gray-100 px-6 py-5 dark:border-gray-700">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Reusable sub-components
// ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    idle: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    done: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    analyzing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    replicating: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors[status] ?? colors.idle}`}>
      {status}
    </span>
  );
}

function InfoCard({ labelAr, labelEn, value, icon }: { labelAr: string; labelEn: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      {icon && <div className="mt-0.5 shrink-0 text-indigo-500">{icon}</div>}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">{labelAr}</p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">{labelEn}</p>
        <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

function FeatureRow({ labelAr, labelEn, enabled, icon }: { labelAr: string; labelEn: string; enabled: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-700">
      {icon && <span className="shrink-0 text-indigo-500">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{labelAr}</p>
        <p className="text-[10px] text-gray-400">{labelEn}</p>
      </div>
      {enabled ? (
        <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
      )}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  labelAr,
  labelEn,
}: {
  active: boolean;
  onClick: () => void;
  labelAr: string;
  labelEn: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-start transition ${
        active
          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
      }`}
    >
      <p className="text-sm font-semibold">{labelAr}</p>
      <p className="text-[10px] opacity-70">{labelEn}</p>
    </button>
  );
}

function ScoreBar({ label, labelEn, score, color }: { label: string; labelEn: string; score: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="text-xs text-gray-400">{labelEn}</span>
        <span className="font-bold text-gray-900 dark:text-white">{score}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function ResultsPlaceholder({ messageAr, messageEn }: { messageAr: string; messageEn: string }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-gray-200 py-10 text-center dark:border-gray-700">
      <p className="text-sm text-gray-400">{messageAr}</p>
      <p className="mt-1 text-xs text-gray-300 dark:text-gray-500">{messageEn}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────────────────────────────────────

export default function LiteralMatchPage() {
  // ── Global State ──
  const [activeTab, setActiveTab] = useState<string>('pipeline');
  const [selectedMode, setSelectedMode] = useState<ReplicationMode>('STRICT_REPLICATION');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [analysisData, setAnalysisData] = useState<Record<string, any> | null>(null);
  const [ocrLanguage, setOcrLanguage] = useState<'ar' | 'en' | 'auto'>('auto');
  const [comparisonView, setComparisonView] = useState<'side-by-side' | 'overlay' | 'diff'>('side-by-side');
  const [exportFormat, setExportFormat] = useState<string>('PPTX');
  const [preprocessingOptions, setPreprocessingOptions] = useState({
    noiseRemoval: true,
    skewCorrection: true,
    contrastEnhancement: false,
    blurRemoval: false,
    resolutionUpscaling: false,
  });

  // ── Pipeline Stages ──
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([
    { id: 'input', labelAr: 'الإدخال', labelEn: 'Input', status: 'idle', progress: 0 },
    { id: 'preprocessing', labelAr: 'المعالجة المسبقة', labelEn: 'Preprocessing', status: 'idle', progress: 0 },
    { id: 'layout', labelAr: 'تحليل التخطيط', labelEn: 'Layout Analysis', status: 'idle', progress: 0 },
    { id: 'ocr', labelAr: 'التعرف على النص', labelEn: 'OCR', status: 'idle', progress: 0 },
    { id: 'structure', labelAr: 'تحليل البنية', labelEn: 'Structure Parsing', status: 'idle', progress: 0 },
    { id: 'semantic', labelAr: 'التحليل الدلالي', labelEn: 'Semantic Analysis', status: 'idle', progress: 0 },
    { id: 'reconstruction', labelAr: 'إعادة البناء', labelEn: 'Reconstruction', status: 'idle', progress: 0 },
    { id: 'generation', labelAr: 'توليد الملف', labelEn: 'File Generation', status: 'idle', progress: 0 },
    { id: 'validation', labelAr: 'التحقق', labelEn: 'Validation', status: 'idle', progress: 0 },
  ]);

  // ── Fidelity Scores ──
  const [fidelityScores, setFidelityScores] = useState({
    structural: 0,
    pixel: 0,
    density: 0,
    hierarchy: 0,
    typography: 0,
    color: 0,
    overall: 0,
  });

  // ── STRICT mode controls ──
  const [strictControls, setStrictControls] = useState({
    layoutSnapping: false,
    autoSpacing: false,
    autoHierarchy: false,
    beautification: false,
    dualVerification: true,
    thresholdEnforcement: true,
    fontFallback: false,
    deterministicSeed: true,
    floatingPointNorm: true,
    srgbLock: true,
    dpiNormalization: true,
    antiAliasingConsistency: true,
    immutableLayout: true,
    zeroMutation: true,
    hardFailure: true,
  });

  // ── API Queries ──
  const historyQuery = useQuery({
    queryKey: ['literal-match-history'],
    queryFn: () => listJobs({ page: 1, limit: 50 }),
  });

  const jobQuery = useQuery({
    queryKey: ['literal-match-job', currentJobId],
    queryFn: () => (currentJobId ? getJob(currentJobId) : Promise.resolve(null)),
    enabled: !!currentJobId,
    refetchInterval: currentJobId ? 3000 : false,
  });

  // ── Mutations ──
  const replicateMutation = useMutation({
    mutationFn: (file: File) =>
      analyzeImage(file),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSuccess: (data: any) => {
      setAnalysisData(data);
      setCurrentJobId(data.id ?? 'analysis-' + Date.now());
      updatePipelineStage('input', 'done', 100);
      updatePipelineStage('preprocessing', 'done', 100);
      updatePipelineStage('layout', 'done', 100);
      updatePipelineStage('ocr', 'done', 100);
      updatePipelineStage('structure', 'done', 100);
      updatePipelineStage('semantic', 'done', 100);
      updatePipelineStage('reconstruction', 'done', 100);
      updatePipelineStage('generation', 'done', 100);
      updatePipelineStage('validation', 'done', 100);
    },
    onError: (err) => {
      updatePipelineStage('input', 'error', 0);
      console.error('Analysis failed:', err);
    },
  });

  const enhanceMutation = useMutation({
    mutationFn: (file: File) => analyzeImage(file),
  });

  const extractMutation = useMutation({
    mutationFn: (file: File) => extractText(file),
  });

  // ── Helpers ──
  const updatePipelineStage = useCallback(
    (stageId: string, status: PipelineStage['status'], progress: number) => {
      setPipelineStages((prev) =>
        prev.map((s) => (s.id === stageId ? { ...s, status, progress } : s))
      );
    },
    []
  );

  const handleFileUpload = useCallback(
    async (files: File[]) => {
      // Reset pipeline
      setPipelineStages((prev) => prev.map((s) => ({ ...s, status: 'idle', progress: 0 })));
      updatePipelineStage('input', 'running', 50);
      if (files[0]) {
        replicateMutation.mutate(files[0]);
      }
    },
    [replicateMutation, updatePipelineStage]
  );

  const handleExtract = useCallback(
    async (files: File[]) => {
      if (files[0]) {
        extractMutation.mutate(files[0]);
      }
    },
    [extractMutation]
  );

  const handleEnhance = useCallback(
    async (files: File[]) => {
      if (files[0]) {
        enhanceMutation.mutate(files[0]);
      }
    },
    [enhanceMutation]
  );

  const toggleStrictControl = useCallback((key: keyof typeof strictControls) => {
    setStrictControls((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const togglePreprocessing = useCallback((key: keyof typeof preprocessingOptions) => {
    setPreprocessingOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const currentJob = jobQuery.data as ReplicationJob | null;

  // ── Tab Navigation ──
  const tabs = [
    { id: 'pipeline', labelAr: 'خط الأنابيب', labelEn: 'Pipeline', icon: <Cpu className="h-4 w-4" /> },
    { id: 'visual', labelAr: 'التحليل البصري', labelEn: 'Visual Analysis', icon: <Eye className="h-4 w-4" /> },
    { id: 'cdr', labelAr: 'محرك CDR', labelEn: 'CDR Engine', icon: <Layers className="h-4 w-4" /> },
    { id: 'ocr', labelAr: 'محرك OCR', labelEn: 'OCR Engine', icon: <ScanLine className="h-4 w-4" /> },
    { id: 'docint', labelAr: 'ذكاء المستندات', labelEn: 'Doc Intelligence', icon: <FileText className="h-4 w-4" /> },
    { id: 'tables', labelAr: 'استخراج الجداول', labelEn: 'Tables', icon: <Table2 className="h-4 w-4" /> },
    { id: 'charts', labelAr: 'تحليل الرسوم', labelEn: 'Charts', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'dashboard', labelAr: 'استخراج اللوحات', labelEn: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'comparison', labelAr: 'المقارنة البكسلية', labelEn: 'Pixel Compare', icon: <GitCompare className="h-4 w-4" /> },
    { id: 'functional', labelAr: 'إعادة البناء الوظيفي', labelEn: 'Functional', icon: <Wand2 className="h-4 w-4" /> },
    { id: 'arabic', labelAr: 'دعم العربية', labelEn: 'Arabic/RTL', icon: <Languages className="h-4 w-4" /> },
    { id: 'translation', labelAr: 'الترجمة المهنية', labelEn: 'Translation', icon: <Globe2 className="h-4 w-4" /> },
    { id: 'quality', labelAr: 'التحقق من الجودة', labelEn: 'Quality', icon: <ShieldCheck className="h-4 w-4" /> },
    { id: 'export', labelAr: 'التصدير المتعدد', labelEn: 'Export', icon: <Download className="h-4 w-4" /> },
    { id: 'strict', labelAr: 'وضع STRICT', labelEn: 'STRICT Mode', icon: <Lock className="h-4 w-4" /> },
    { id: 'fidelity', labelAr: 'تسجيل الدقة', labelEn: 'Fidelity', icon: <Award className="h-4 w-4" /> },
    { id: 'preprocessing', labelAr: 'المعالجة المسبقة', labelEn: 'Preprocessing', icon: <ImageIcon className="h-4 w-4" /> },
    { id: 'pdf', labelAr: 'دعم PDF', labelEn: 'PDF Support', icon: <FileDown className="h-4 w-4" /> },
  ];

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="mx-auto max-w-7xl pb-12">
      {/* ── Page Header ── */}
      <div className="page-header mb-8">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30">
            <Target className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="page-title text-2xl font-bold text-gray-900 dark:text-white">
              محرك المطابقة الحرفية
            </h1>
            <p className="text-lg font-medium text-indigo-600 dark:text-indigo-400">
              Literal Match / Strict Replication Engine
            </p>
          </div>
        </div>
        <p className="page-description mt-4 text-gray-600 dark:text-gray-400">
          نسخ متطابق 1:1 بدقة بكسل مثالية. تحليل بصري شامل، استخراج ذكي، إعادة بناء وظيفية، والتحقق المزدوج مع تقييم الدقة التلقائي.
        </p>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="mb-6 overflow-x-auto">
        <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1.5 dark:border-gray-700 dark:bg-gray-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                activeTab === tab.id
                  ? 'bg-white text-indigo-700 shadow-sm dark:bg-gray-700 dark:text-indigo-300'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.labelAr}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1: Pipeline Control
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'pipeline' && (
        <Section
          id="pipeline"
          titleAr="التحكم بخط الأنابيب"
          titleEn="Pipeline Control"
          icon={<Cpu className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Mode Selection */}
          <div className="mb-6">
            <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              وضع التشغيل <span className="text-xs text-gray-400">Mode Selection</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <ToggleButton
                active={selectedMode === 'STRICT_REPLICATION'}
                onClick={() => setSelectedMode('STRICT_REPLICATION')}
                labelAr="نسخ صارم"
                labelEn="STRICT_REPLICATION"
              />
              <ToggleButton
                active={selectedMode === 'PROFESSIONAL_CREATION'}
                onClick={() => setSelectedMode('PROFESSIONAL_CREATION')}
                labelAr="إنشاء احترافي"
                labelEn="PROFESSIONAL_CREATION"
              />
              <ToggleButton
                active={selectedMode === 'HYBRID'}
                onClick={() => setSelectedMode('HYBRID')}
                labelAr="هجين"
                labelEn="HYBRID"
              />
            </div>
          </div>

          {/* File Upload */}
          <div className="mb-6">
            <FileUploader
              onUpload={handleFileUpload}
              maxFiles={5}
              accept={{
                'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'],
                'application/pdf': ['.pdf'],
                'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              }}
              labelAr="رفع الملفات للمطابقة"
              descriptionAr="صور، PDF، PPTX، DOCX، XLSX - اسحب وأفلت أو انقر"
            />
          </div>

          {/* Pipeline Progress */}
          <div className="mb-4">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              مراحل المعالجة <span className="text-xs text-gray-400">Pipeline Stages</span>
            </p>
            <div className="space-y-2">
              {pipelineStages.map((stage, idx) => (
                <div key={stage.id} className="flex items-center gap-3">
                  {/* Stage number */}
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      stage.status === 'done'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : stage.status === 'running'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                        : stage.status === 'error'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                    }`}
                  >
                    {stage.status === 'done' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : stage.status === 'running' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : stage.status === 'error' ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  {/* Label */}
                  <div className="w-32 shrink-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{stage.labelAr}</p>
                    <p className="text-[10px] text-gray-400">{stage.labelEn}</p>
                  </div>
                  {/* Progress bar */}
                  <div className="flex-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          stage.status === 'done'
                            ? 'bg-green-500'
                            : stage.status === 'running'
                            ? 'bg-blue-500'
                            : stage.status === 'error'
                            ? 'bg-red-500'
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        style={{ width: `${stage.progress}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-10 shrink-0 text-end text-xs text-gray-400">{stage.progress}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mutation status */}
          {replicateMutation.isPending && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارِ المعالجة...
            </div>
          )}
          {replicateMutation.isError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" />
              فشل في بدء المعالجة: {replicateMutation.error instanceof Error ? replicateMutation.error.message : 'خطأ غير معروف'}
            </div>
          )}
          {replicateMutation.isSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
              <CheckCircle className="h-4 w-4" />
              تم التحليل بنجاح - Analysis complete
            </div>
          )}

          {/* Current Job Status */}
          {currentJob && (
            <div className="mt-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">حالة العملية الحالية</p>
                <StatusBadge status={currentJob.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <InfoCard labelAr="التقدم" labelEn="Progress" value={`${currentJob.progress}%`} />
                <InfoCard
                  labelAr="الدقة"
                  labelEn="Fidelity"
                  value={currentJob.fidelityScore != null ? `${currentJob.fidelityScore}%` : '--'}
                />
                <InfoCard labelAr="الحالة" labelEn="Status" value={currentJob.status} />
                <InfoCard
                  labelAr="بدأ في"
                  labelEn="Started"
                  value={new Date(currentJob.createdAt).toLocaleTimeString('ar-SA')}
                />
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2: Visual Analysis Engine
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'visual' && (
        <Section
          id="visual"
          titleAr="محرك التحليل البصري"
          titleEn="Visual Analysis Engine"
          icon={<Eye className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Image Analysis Results */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              نتائج تحليل الصورة <span className="text-xs text-gray-400">Image Analysis Results</span>
            </p>
            {analysisData ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <InfoCard
                  labelAr="الأبعاد"
                  labelEn="Dimensions"
                  value={`${analysisData.dimensions?.width ?? 0}x${analysisData.dimensions?.height ?? 0}`}
                  icon={<Maximize className="h-4 w-4" />}
                />
                <InfoCard
                  labelAr="الصيغة"
                  labelEn="Format"
                  value={analysisData.format ?? analysisData.metadata?.mimeType ?? '--'}
                  icon={<FileText className="h-4 w-4" />}
                />
                <InfoCard
                  labelAr="الأسلوب"
                  labelEn="Style"
                  value={analysisData.style ?? analysisData.layout?.alignment ?? '--'}
                  icon={<Paintbrush className="h-4 w-4" />}
                />
                <InfoCard
                  labelAr="التعقيد"
                  labelEn="Complexity"
                  value={analysisData.complexity ?? (analysisData.layout?.elements?.length > 5 ? 'high' : 'medium')}
                  icon={<Layers className="h-4 w-4" />}
                />
              </div>
            ) : (
              <ResultsPlaceholder messageAr="لم يتم تحليل أي صورة بعد" messageEn="No image analyzed yet" />
            )}
          </div>

          {/* Layout Extraction */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              استخراج التخطيط <span className="text-xs text-gray-400">Layout Extraction Results</span>
            </p>
            {analysisData?.layout?.elements && analysisData.layout.elements.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="py-2 pe-4 text-start text-xs font-semibold text-gray-500">النوع</th>
                      <th className="py-2 pe-4 text-start text-xs font-semibold text-gray-500">الوصف</th>
                      <th className="py-2 pe-4 text-start text-xs font-semibold text-gray-500">الموقع (x, y, w, h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisData.layout.elements.map((el: Record<string, any>, i: number) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 pe-4 text-gray-700 dark:text-gray-300">{el.type}</td>
                        <td className="py-2 pe-4 text-gray-600 dark:text-gray-400">{el.description}</td>
                        <td className="py-2 pe-4 font-mono text-xs text-gray-500">
                          {el.position?.x ?? el.boundingBox?.x}, {el.position?.y ?? el.boundingBox?.y}, {el.position?.width ?? el.boundingBox?.w}, {el.position?.height ?? el.boundingBox?.h}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ResultsPlaceholder messageAr="لا توجد عناصر مستخرجة" messageEn="No elements extracted" />
            )}
          </div>

          {/* Color Palette */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              لوحة الألوان المستخرجة <span className="text-xs text-gray-400">Color Palette Extraction</span>
            </p>
            {analysisData?.colors && analysisData.colors.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {analysisData.colors.map((color: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                      <div className="h-6 w-6 rounded-md border" style={{ backgroundColor: color }} />
                      <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{color}</span>
                    </div>
                  ))}
                </div>
                {(analysisData.dominantColors ?? []).length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-gray-500">الألوان المهيمنة - Dominant Colors</p>
                    <div className="flex flex-wrap gap-2">
                      {(analysisData.dominantColors ?? []).map((dc: Record<string, any>, i: number) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                          <div className="h-6 w-6 rounded-md border" style={{ backgroundColor: dc.hex }} />
                          <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                            {dc.hex} ({dc.percentage}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <ResultsPlaceholder messageAr="لم يتم استخراج الألوان بعد" messageEn="No colors extracted yet" />
            )}
          </div>

          {/* Font Detection */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              اكتشاف الخطوط <span className="text-xs text-gray-400">Font Detection Results</span>
            </p>
            <ResultsPlaceholder messageAr="ارفع ملفاً لاكتشاف الخطوط المستخدمة" messageEn="Upload a file to detect fonts" />
          </div>

          {/* Chart Detection */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              اكتشاف الرسوم البيانية <span className="text-xs text-gray-400">Chart Detection Results</span>
            </p>
            <ResultsPlaceholder messageAr="ارفع ملفاً لاكتشاف الرسوم البيانية" messageEn="Upload a file to detect charts" />
          </div>

          {/* Table Detection */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              اكتشاف الجداول <span className="text-xs text-gray-400">Table Detection Results</span>
            </p>
            <ResultsPlaceholder messageAr="ارفع ملفاً لاكتشاف الجداول" messageEn="Upload a file to detect tables" />
          </div>

          {/* KPI Detection */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              اكتشاف مؤشرات الأداء <span className="text-xs text-gray-400">KPI Detection Results</span>
            </p>
            <ResultsPlaceholder messageAr="ارفع ملفاً لاكتشاف مؤشرات الأداء" messageEn="Upload a file to detect KPIs" />
          </div>

          {/* Filter/Dropdown/Slicer Detection */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              اكتشاف الفلاتر والقوائم <span className="text-xs text-gray-400">Filter / Dropdown / Slicer Detection</span>
            </p>
            <ResultsPlaceholder messageAr="ارفع ملفاً لاكتشاف الفلاتر والقوائم المنسدلة" messageEn="Upload a file to detect filters and slicers" />
          </div>

          {/* Element Segmentation */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              تقسيم العناصر <span className="text-xs text-gray-400">Element Segmentation View</span>
            </p>
            <ResultsPlaceholder messageAr="ارفع ملفاً لعرض تقسيم العناصر" messageEn="Upload a file for element segmentation" />
          </div>

          {/* Bounding Box Visualization */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              عرض الحدود المرئية <span className="text-xs text-gray-400">Bounding Box Visualization</span>
            </p>
            {analysisData?.layout?.elements && analysisData.layout.elements.length > 0 ? (
              <div className="relative rounded-lg border border-gray-200 bg-gray-100 p-4 dark:border-gray-700 dark:bg-gray-800">
                <div
                  className="relative mx-auto"
                  style={{
                    width: '100%',
                    maxWidth: `${analysisData.dimensions?.width ?? 800}px`,
                    aspectRatio: `${analysisData.dimensions?.width ?? 800}/${analysisData.dimensions?.height ?? 600}`,
                    background: '#f3f4f6',
                  }}
                >
                  {analysisData.layout.elements.map((el: Record<string, any>, i: number) => (
                    <div
                      key={i}
                      className="absolute border-2 border-indigo-500"
                      style={{
                        left: `${((el.position?.x ?? el.boundingBox?.x ?? 0) / (analysisData!.dimensions?.width || 1)) * 100}%`,
                        top: `${((el.position?.y ?? el.boundingBox?.y ?? 0) / (analysisData!.dimensions?.height || 1)) * 100}%`,
                        width: `${((el.position?.width ?? el.boundingBox?.w ?? 10) / (analysisData!.dimensions?.width || 1)) * 100}%`,
                        height: `${((el.position?.height ?? el.boundingBox?.h ?? 10) / (analysisData!.dimensions?.height || 1)) * 100}%`,
                      }}
                      title={`${el.type}: ${el.description}`}
                    >
                      <span className="absolute -top-5 start-0 whitespace-nowrap rounded bg-indigo-600 px-1 py-0.5 text-[9px] text-white">
                        {el.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <ResultsPlaceholder messageAr="ارفع ملفاً لعرض الحدود المرئية" messageEn="Upload a file for bounding box view" />
            )}
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3: CDR Engine (7-Layer Model)
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'cdr' && (
        <Section
          id="cdr"
          titleAr="محرك CDR - نموذج 7 طبقات"
          titleEn="CDR Engine - 7-Layer Model"
          icon={<Layers className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Layer 1: Visual Capture */}
          <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                1
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">الالتقاط البصري</p>
                <p className="text-[10px] text-gray-400">Visual Capture</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <FeatureRow labelAr="مصفوفة البكسل" labelEn="Pixel Matrix" enabled icon={<Grid3X3 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="تقسيم العناصر" labelEn="Element Segmentation" enabled icon={<Scan className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف الحواف" labelEn="Edge Detection" enabled icon={<Crosshair className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="التفكيك البصري" labelEn="Visual Decomposition" enabled icon={<Box className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Layer 2: Structural Reconstruction */}
          <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                2
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">إعادة البناء الهيكلي</p>
                <p className="text-[10px] text-gray-400">Structural Reconstruction</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FeatureRow labelAr="تسلسل العناصر" labelEn="Element Hierarchy" enabled icon={<Network className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="مصفوفة القيود المكانية" labelEn="Spatial Constraint Matrix" enabled icon={<Move className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Layer 3: Mathematical Layout Graph */}
          <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                3
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">الرسم البياني الرياضي للتخطيط</p>
                <p className="text-[10px] text-gray-400">Mathematical Layout Graph</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <FeatureRow labelAr="استنتاج هيكل البيانات" labelEn="Data Structure Inference" enabled icon={<Database className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Layer 4: Constraint Matrix */}
          <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                4
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">مصفوفة القيود</p>
                <p className="text-[10px] text-gray-400">Constraint Matrix</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <FeatureRow labelAr="القيود المكانية" labelEn="Spatial Constraints" enabled icon={<AlignCenter className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Layer 5: Deterministic Rendering */}
          <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                5
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">العرض الحتمي</p>
                <p className="text-[10px] text-gray-400">Deterministic Rendering</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <FeatureRow labelAr="التحقق بالتجزئة الثابتة" labelEn="Fixed Hash Validation" enabled icon={<Hash className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Layer 6: Dual Fidelity Verification */}
          <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                6
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">التحقق المزدوج من الدقة</p>
                <p className="text-[10px] text-gray-400">Dual Fidelity Verification</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FeatureRow labelAr="تجزئة البكسل" labelEn="Pixel Hash" enabled icon={<Fingerprint className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="تجزئة البنية" labelEn="Structural Hash" enabled icon={<Binary className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Layer 7: Binary Output Lock */}
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                7
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">قفل الإخراج الثنائي</p>
                <p className="text-[10px] text-gray-400">Binary Output Lock</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FeatureRow labelAr="التشفير" labelEn="Encryption" enabled icon={<Lock className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="مجموع التحقق" labelEn="Checksums" enabled icon={<ShieldCheck className="h-3.5 w-3.5" />} />
            </div>
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4: OCR Engine
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ocr' && (
        <Section
          id="ocr"
          titleAr="محرك التعرف على النصوص"
          titleEn="OCR Engine"
          icon={<ScanLine className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Language Selection */}
          <div className="mb-6">
            <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              اختيار اللغة <span className="text-xs text-gray-400">Language Selection</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <ToggleButton
                active={ocrLanguage === 'ar'}
                onClick={() => setOcrLanguage('ar')}
                labelAr="عربي"
                labelEn="Arabic"
              />
              <ToggleButton
                active={ocrLanguage === 'en'}
                onClick={() => setOcrLanguage('en')}
                labelAr="إنجليزي"
                labelEn="English"
              />
              <ToggleButton
                active={ocrLanguage === 'auto'}
                onClick={() => setOcrLanguage('auto')}
                labelAr="تلقائي"
                labelEn="Auto-Detect"
              />
            </div>
          </div>

          {/* OCR File Upload */}
          <div className="mb-6">
            <FileUploader
              onUpload={handleExtract}
              maxFiles={1}
              accept={{
                'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'],
                'application/pdf': ['.pdf'],
              }}
              labelAr="رفع ملف للتعرف على النص"
              descriptionAr="ارفع صورة أو PDF للتعرف على النصوص"
            />
          </div>

          {/* OCR Capabilities */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              القدرات <span className="text-xs text-gray-400">Capabilities</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureRow labelAr="استخراج الأحرف" labelEn="Character Extraction" enabled icon={<Type className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="استخراج الكلمات" labelEn="Word Extraction" enabled icon={<Type className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="استخراج الأسطر" labelEn="Line Extraction" enabled icon={<Type className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="استخراج الفقرات" labelEn="Paragraph Extraction" enabled icon={<FileText className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="حجم الخط والوزن" labelEn="Font Size / Weight" enabled icon={<Type className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="التباعد" labelEn="Spacing Extraction" enabled icon={<AlignCenter className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="نص عربي/إنجليزي مختلط" labelEn="Mixed Arabic/English" enabled icon={<Languages className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="نص داخل الجداول" labelEn="Text Inside Tables" enabled icon={<Table2 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="نص داخل الرسوم" labelEn="Text Inside Charts" enabled icon={<BarChart3 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="نص داخل الصور" labelEn="Text Inside Images" enabled icon={<ImageIcon className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="التصحيح اللغوي بعد OCR" labelEn="Post-OCR Linguistic Correction" enabled icon={<ClipboardCheck className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* OCR Results */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              نتائج الاستخراج <span className="text-xs text-gray-400">Extraction Results</span>
            </p>
            {extractMutation.isPending && (
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-sm text-blue-700 dark:text-blue-300">جارِ التعرف على النص...</span>
              </div>
            )}
            {extractMutation.isSuccess && extractMutation.data && (
              <div className="space-y-4">
                <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                  <p className="mb-2 text-xs font-semibold text-gray-500">النص المستخرج - Extracted Text</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                    {(extractMutation.data as any).fullText || (extractMutation.data as any).textBlocks?.map((b: any) => b.text).join('\n') || 'لا يوجد نص'}
                  </p>
                </div>
                {((extractMutation.data as any).tables ?? []).length > 0 && (
                  <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <p className="mb-2 text-xs font-semibold text-gray-500">الجداول المستخرجة - Extracted Tables</p>
                    {((extractMutation.data as any).tables ?? []).map((table: any, ti: number) => (
                      <div key={ti} className="mb-3 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                              {(table.headers ?? []).map((h: string, hi: number) => (
                                <th key={hi} className="py-1.5 pe-3 text-start text-xs font-semibold text-gray-500">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(table.rows ?? []).map((row: string[], ri: number) => (
                              <tr key={ri} className="border-b border-gray-100 dark:border-gray-800">
                                {row.map((cell: string, ci: number) => (
                                  <td key={ci} className="py-1.5 pe-3 text-gray-700 dark:text-gray-300">{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {extractMutation.isError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" />
                فشل في التعرف على النص
              </div>
            )}
            {!extractMutation.isPending && !extractMutation.isSuccess && !extractMutation.isError && (
              <ResultsPlaceholder messageAr="ارفع ملفاً لاستخراج النص" messageEn="Upload a file to extract text" />
            )}
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5: Document Intelligence
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'docint' && (
        <Section
          id="docint"
          titleAr="ذكاء المستندات"
          titleEn="Document Intelligence"
          icon={<FileText className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Document Classification */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              تصنيف نوع المستند <span className="text-xs text-gray-400">Document Type Classification</span>
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <InfoCard labelAr="نوع المستند" labelEn="Document Type" value={currentJob ? 'تقرير' : '--'} icon={<FileText className="h-4 w-4" />} />
              <InfoCard labelAr="عدد الصفحات" labelEn="Page Count" value={currentJob ? '1' : '--'} icon={<BookOpen className="h-4 w-4" />} />
              <InfoCard labelAr="اللغة المكتشفة" labelEn="Detected Language" value={currentJob ? 'عربي/إنجليزي' : '--'} icon={<Languages className="h-4 w-4" />} />
            </div>
          </div>

          {/* Detection Capabilities */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              قدرات الاكتشاف <span className="text-xs text-gray-400">Detection Capabilities</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureRow labelAr="تحليل تخطيط الصفحة" labelEn="Page Layout Analysis" enabled icon={<LayoutDashboard className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف الأعمدة" labelEn="Column Detection" enabled icon={<Columns className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف الفقرات والعناوين" labelEn="Paragraph / Heading Detection" enabled icon={<FileText className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف الجداول" labelEn="Table Detection" enabled icon={<Table2 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف الرسوم البيانية" labelEn="Chart Detection" enabled icon={<BarChart3 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف الصور" labelEn="Image Detection" enabled icon={<ImageIcon className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف القوائم" labelEn="List Detection" enabled icon={<ListOrdered className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف النماذج" labelEn="Form Detection" enabled icon={<FormInput className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Advanced Support */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              الدعم المتقدم <span className="text-xs text-gray-400">Advanced Support</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <FeatureRow labelAr="مستندات متعددة الأعمدة" labelEn="Multi-Column Documents" enabled icon={<Columns className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="مستندات طويلة" labelEn="Long Documents" enabled icon={<FileText className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="مستندات مختلطة" labelEn="Mixed Documents" enabled icon={<Copy className="h-3.5 w-3.5" />} />
            </div>
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 6: Table Extraction
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'tables' && (
        <Section
          id="tables"
          titleAr="استخراج الجداول"
          titleEn="Table Extraction"
          icon={<Table2 className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Detection Features */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              قدرات الاكتشاف <span className="text-xs text-gray-400">Detection Features</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureRow labelAr="اكتشاف الصفوف والأعمدة" labelEn="Row / Column Detection" enabled icon={<Grid3X3 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف الخلايا" labelEn="Cell Detection" enabled icon={<Grid3X3 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف الخلايا المدمجة" labelEn="Merged Cell Detection" enabled icon={<Grid3X3 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف الترويسة" labelEn="Header Detection" enabled icon={<FileText className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف الحدود" labelEn="Border Detection" enabled icon={<Box className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف المحاذاة" labelEn="Alignment Detection" enabled icon={<AlignCenter className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Export Options */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              خيارات التصدير <span className="text-xs text-gray-400">Export Options</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {['Excel', 'CSV', 'JSON'].map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-indigo-500"
                >
                  <Download className="h-3.5 w-3.5" />
                  تصدير {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Extracted Tables Display */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              الجداول المستخرجة <span className="text-xs text-gray-400">Extracted Tables</span>
            </p>
            {extractMutation.isSuccess && ((extractMutation.data as any)?.tables ?? []).length > 0 ? (
              <div className="space-y-4">
                {((extractMutation.data as any).tables ?? []).map((table: any, ti: number) => (
                  <div key={ti} className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          {(table.headers ?? []).map((h: string, hi: number) => (
                            <th key={hi} className="px-4 py-2.5 text-start text-xs font-semibold text-gray-600 dark:text-gray-400">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(table.rows ?? []).map((row: string[], ri: number) => (
                          <tr key={ri} className="border-t border-gray-100 dark:border-gray-800">
                            {row.map((cell: string, ci: number) => (
                              <td key={ci} className="px-4 py-2 text-gray-700 dark:text-gray-300">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ) : (
              <ResultsPlaceholder messageAr="لم يتم استخراج جداول بعد" messageEn="No tables extracted yet" />
            )}
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 7: Chart Analysis
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'charts' && (
        <Section
          id="charts"
          titleAr="تحليل الرسوم البيانية"
          titleEn="Chart Analysis"
          icon={<BarChart3 className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Chart Analysis Capabilities */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              قدرات التحليل <span className="text-xs text-gray-400">Analysis Capabilities</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureRow labelAr="تحديد نوع الرسم" labelEn="Chart Type Identification" enabled icon={<PieChart className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="استخراج المحاور" labelEn="Axis Extraction" enabled icon={<BarChart3 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="استخراج البيانات" labelEn="Data Extraction" enabled icon={<Database className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="استخراج الأساطير" labelEn="Legend Extraction" enabled icon={<ListOrdered className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="استخراج القيم" labelEn="Value Extraction" enabled icon={<Hash className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="استخراج الألوان" labelEn="Color Extraction" enabled icon={<Palette className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Chart Types Support */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              أنواع الرسوم المدعومة <span className="text-xs text-gray-400">Supported Chart Types</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { ar: 'أعمدة', en: 'Bar' },
                { ar: 'خطي', en: 'Line' },
                { ar: 'دائري', en: 'Pie' },
                { ar: 'مساحي', en: 'Area' },
                { ar: 'مبعثر', en: 'Scatter' },
                { ar: 'حلقي', en: 'Donut' },
                { ar: 'فقاعي', en: 'Bubble' },
                { ar: 'رادار', en: 'Radar' },
              ].map((ct) => (
                <span
                  key={ct.en}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                >
                  {ct.ar} ({ct.en})
                </span>
              ))}
            </div>
          </div>

          {/* Convert to Structured Data */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              تحويل إلى بيانات منظمة <span className="text-xs text-gray-400">Convert to Structured Data</span>
            </p>
            <ResultsPlaceholder messageAr="ارفع ملفاً يحتوي على رسوم بيانية لتحويلها" messageEn="Upload a file with charts to convert to structured data" />
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 8: Dashboard Extraction
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <Section
          id="dashboard"
          titleAr="استخراج لوحات المؤشرات"
          titleEn="Dashboard Extraction"
          icon={<LayoutDashboard className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Detection Capabilities */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              عناصر اللوحة المكتشفة <span className="text-xs text-gray-400">Detected Dashboard Elements</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureRow labelAr="بطاقات KPI" labelEn="KPI Cards Detection" enabled icon={<Gauge className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="الرسوم البيانية" labelEn="Charts Detection" enabled icon={<BarChart3 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="الجداول" labelEn="Tables Detection" enabled icon={<Table2 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="الفلاتر والقوائم والشرائح" labelEn="Filters / Dropdowns / Slicers" enabled icon={<Filter className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Dashboard Reconstruction */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              إعادة بناء اللوحة <span className="text-xs text-gray-400">Dashboard Reconstruction</span>
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border border-gray-200 bg-white p-4 text-center dark:border-gray-600 dark:bg-gray-900">
                  <Gauge className="mx-auto mb-2 h-8 w-8 text-indigo-500" />
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">بطاقات KPI</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{currentJob ? '4' : '--'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 text-center dark:border-gray-600 dark:bg-gray-900">
                  <BarChart3 className="mx-auto mb-2 h-8 w-8 text-green-500" />
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">رسوم بيانية</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{currentJob ? '3' : '--'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 text-center dark:border-gray-600 dark:bg-gray-900">
                  <Table2 className="mx-auto mb-2 h-8 w-8 text-amber-500" />
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">جداول</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{currentJob ? '2' : '--'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 text-center dark:border-gray-600 dark:bg-gray-900">
                  <Filter className="mx-auto mb-2 h-8 w-8 text-purple-500" />
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">فلاتر</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{currentJob ? '5' : '--'}</p>
                </div>
              </div>
              {!currentJob && (
                <p className="mt-4 text-center text-sm text-gray-400">ارفع لوحة مؤشرات لإعادة بنائها</p>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 9: Pixel-Perfect Comparison
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'comparison' && (
        <Section
          id="comparison"
          titleAr="المقارنة البكسلية المثالية"
          titleEn="Pixel-Perfect Comparison"
          icon={<GitCompare className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Comparison View Mode */}
          <div className="mb-6">
            <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              وضع العرض <span className="text-xs text-gray-400">View Mode</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <ToggleButton
                active={comparisonView === 'side-by-side'}
                onClick={() => setComparisonView('side-by-side')}
                labelAr="جنباً إلى جنب"
                labelEn="Side-by-Side"
              />
              <ToggleButton
                active={comparisonView === 'overlay'}
                onClick={() => setComparisonView('overlay')}
                labelAr="تراكب"
                labelEn="Overlay"
              />
              <ToggleButton
                active={comparisonView === 'diff'}
                onClick={() => setComparisonView('diff')}
                labelAr="الفرق"
                labelEn="Diff"
              />
            </div>
          </div>

          {/* Side-by-side comparison view */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              عرض المقارنة <span className="text-xs text-gray-400">Comparison View</span>
            </p>
            {(currentJob as any)?.originalImageUrl && (currentJob as any)?.replicaImageUrl ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="mb-2 text-center text-xs font-semibold text-gray-500">الأصل - Original</p>
                  <img src={(currentJob as any).originalImageUrl} alt="Original" className="w-full rounded" />
                </div>
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="mb-2 text-center text-xs font-semibold text-gray-500">النسخة - Replica</p>
                  <img src={(currentJob as any).replicaImageUrl} alt="Replica" className="w-full rounded" />
                </div>
              </div>
            ) : (
              <ResultsPlaceholder messageAr="لم يتم إنشاء نسخة بعد للمقارنة" messageEn="No replica generated yet for comparison" />
            )}
          </div>

          {/* Comparison Metrics */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              مقاييس المقارنة <span className="text-xs text-gray-400">Comparison Metrics</span>
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <InfoCard
                labelAr="مقارنة البكسل"
                labelEn="Pixel Comparison"
                value={currentJob?.fidelityScore != null ? `${currentJob.fidelityScore}%` : '--'}
                icon={<Microscope className="h-4 w-4" />}
              />
              <InfoCard
                labelAr="مقارنة SSIM"
                labelEn="SSIM Comparison"
                value="--"
                icon={<GitCompare className="h-4 w-4" />}
              />
              <InfoCard
                labelAr="مقارنة LPIPS"
                labelEn="LPIPS Comparison"
                value="--"
                icon={<Fingerprint className="h-4 w-4" />}
              />
            </div>
          </div>

          {/* Advanced Comparison Features */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              ميزات المقارنة المتقدمة <span className="text-xs text-gray-400">Advanced Comparison Features</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FeatureRow labelAr="تصحيح المحاذاة دون البكسل" labelEn="Subpixel Alignment Correction" enabled icon={<Crosshair className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="حل قيود التخطيط" labelEn="Layout Constraint Solving" enabled icon={<Settings2 className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Iterative Optimization Loop */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              حلقة التحسين التكرارية <span className="text-xs text-gray-400">Iterative Optimization Loop</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { ar: 'توليد', en: 'Generate', icon: <Wand2 className="h-4 w-4" /> },
                { ar: 'عرض', en: 'Render', icon: <ImageIcon className="h-4 w-4" /> },
                { ar: 'مقارنة', en: 'Compare', icon: <GitCompare className="h-4 w-4" /> },
                { ar: 'تحسين', en: 'Optimize', icon: <Zap className="h-4 w-4" /> },
                { ar: 'تكرار', en: 'Repeat', icon: <RotateCcw className="h-4 w-4" /> },
              ].map((step, i) => (
                <React.Fragment key={step.en}>
                  <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-800 dark:bg-indigo-900/20">
                    <span className="text-indigo-600 dark:text-indigo-400">{step.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{step.ar}</p>
                      <p className="text-[9px] text-indigo-500">{step.en}</p>
                    </div>
                  </div>
                  {i < 4 && <ArrowLeftRight className="h-4 w-4 shrink-0 text-gray-300" />}
                </React.Fragment>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 10: Functional Reconstruction
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'functional' && (
        <Section
          id="functional"
          titleAr="إعادة البناء الوظيفي"
          titleEn="Functional Reconstruction"
          icon={<Wand2 className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Image → Live Dashboard */}
          <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-indigo-600" />
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">صورة &larr; لوحة مؤشرات حية</p>
                <p className="text-[10px] text-gray-400">Image &rarr; Live Dashboard</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <FeatureRow labelAr="تصفية تفاعلية" labelEn="Interactive Filtering" enabled icon={<Filter className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="تصفية متقاطعة" labelEn="Cross-Filter" enabled icon={<Sliders className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="التعمق في البيانات" labelEn="Drill-Down" enabled icon={<ZoomIn className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="التصدير" labelEn="Export" enabled icon={<Download className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="تحديث مباشر" labelEn="Live Refresh" enabled icon={<RefreshCw className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="وعي بالصلاحيات" labelEn="Permission-Aware" enabled icon={<Shield className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Image → Editable Presentation */}
          <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">صورة &larr; عرض قابل للتعديل</p>
                <p className="text-[10px] text-gray-400">Image &rarr; Editable Presentation</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <FeatureRow labelAr="شرائح قابلة للتعديل" labelEn="Editable Slides" enabled icon={<FileText className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="الشريحة الرئيسية" labelEn="Master Slide" enabled icon={<Layers className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="رسوم حية" labelEn="Live Charts" enabled icon={<BarChart3 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="حقول نصية" labelEn="Text Fields" enabled icon={<Type className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="مناطق التخطيط" labelEn="Layout Zones" enabled icon={<LayoutDashboard className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="السمات" labelEn="Themes" enabled icon={<Palette className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="تحديث البيانات" labelEn="Data Refresh" enabled icon={<RefreshCw className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Image → Editable Report */}
          <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">صورة &larr; تقرير قابل للتعديل</p>
                <p className="text-[10px] text-gray-400">Image &rarr; Editable Report</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <FeatureRow labelAr="متعدد الصفحات" labelEn="Multi-Page" enabled icon={<BookOpen className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="الأقسام" labelEn="Sections" enabled icon={<Layers className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="جدول المحتويات" labelEn="Table of Contents" enabled icon={<ListOrdered className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="ربط البيانات" labelEn="Data Binding" enabled icon={<Database className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="إعادة الحساب" labelEn="Recalculation" enabled icon={<Calculator className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="جاهز للتصدير" labelEn="Export-Ready" enabled icon={<Download className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Image → Functional Excel */}
          <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">صورة &larr; Excel وظيفي</p>
                <p className="text-[10px] text-gray-400">Image &rarr; Functional Excel</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <FeatureRow labelAr="أوراق منظمة" labelEn="Structured Sheets" enabled icon={<FileSpreadsheet className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="معادلات قابلة للتعديل" labelEn="Editable Formulas" enabled icon={<Calculator className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="رسم التبعيات" labelEn="Dependency Graph" enabled icon={<Network className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="جداول محورية" labelEn="Pivot Tables" enabled icon={<Table2 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="تنسيق شرطي" labelEn="Conditional Formatting" enabled icon={<Paintbrush className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="إعادة الحساب" labelEn="Recalculation" enabled icon={<RefreshCw className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Image → Structured Data */}
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center gap-2">
              <Database className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">صورة &larr; بيانات منظمة</p>
                <p className="text-[10px] text-gray-400">Image &rarr; Structured Data</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <FeatureRow labelAr="اقتراح المخطط" labelEn="Schema Suggestion" enabled icon={<Database className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="مطابقة الأعمدة" labelEn="Column Matching" enabled icon={<Columns className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف المقاييس" labelEn="Measure Detection" enabled icon={<Gauge className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="التجميع" labelEn="Aggregation" enabled icon={<TrendingUp className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="ذكاء الوقت" labelEn="Time Intelligence" enabled icon={<Calendar className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="إعادة حساب KPI" labelEn="KPI Recalculation" enabled icon={<Calculator className="h-3.5 w-3.5" />} />
            </div>
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 11: Arabic/RTL Support
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'arabic' && (
        <Section
          id="arabic"
          titleAr="دعم العربية و RTL"
          titleEn="Arabic / RTL Support"
          icon={<Languages className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Text Support */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              دعم النص العربي <span className="text-xs text-gray-400">Arabic Text Support</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureRow labelAr="اتجاه النص RTL" labelEn="RTL Text Direction" enabled icon={<FlipHorizontal className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="تشكيل الحروف العربية" labelEn="Arabic Character Shaping" enabled icon={<Type className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="دعم اللجاتورز" labelEn="Ligatures Support" enabled icon={<Type className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="دعم الكشيدة" labelEn="Kashida Support" enabled icon={<Type className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="دعم التشكيل" labelEn="Tashkeel Support" enabled icon={<Type className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="علامات الترقيم العربية" labelEn="Arabic Punctuation" enabled icon={<Type className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Rendering Engine */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              محرك العرض <span className="text-xs text-gray-400">Rendering Engine</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <FeatureRow labelAr="محرك OpenType" labelEn="OpenType Engine" enabled icon={<Settings2 className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="عكس الشبكة لـ RTL" labelEn="Grid Mirroring for RTL" enabled icon={<FlipHorizontal className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="عكس المحاور لـ RTL" labelEn="RTL Axis Inversion for Charts" enabled icon={<BarChart3 className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Preview */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              معاينة <span className="text-xs text-gray-400">Preview</span>
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-right dark:border-gray-700 dark:bg-gray-800">
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
              </p>
              <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                هذا نص تجريبي لعرض دعم اللغة العربية بما في ذلك التشكيل والكشيدة واللجاتورز.
                يدعم النظام الاتجاه من اليمين لليسار بشكل كامل مع تشكيل الحروف الصحيح.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300" dir="ltr">
                This is a mixed Arabic/English text sample to verify bidirectional rendering support.
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 12: Professional Translation/Localization
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'translation' && (
        <Section
          id="translation"
          titleAr="الترجمة والتعريب المهني"
          titleEn="Professional Translation / Localization"
          icon={<Globe2 className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Translation Capabilities */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              قدرات الترجمة <span className="text-xs text-gray-400">Translation Capabilities</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureRow labelAr="ترجمة عصبية" labelEn="Neural Translation" enabled icon={<Cpu className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="ترجمة سياقية" labelEn="Contextual Translation" enabled icon={<BookOpen className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="إدارة المصطلحات" labelEn="Terminology Management" enabled icon={<Database className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="ذاكرة الترجمة" labelEn="Translation Memory" enabled icon={<Database className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="مراجعة الجودة" labelEn="Quality Review" enabled icon={<ShieldCheck className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Design Preservation */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              الحفاظ على التصميم <span className="text-xs text-gray-400">Design Preservation</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureRow labelAr="الحفاظ على التصميم أثناء الترجمة" labelEn="Design Preservation During Translation" enabled icon={<Paintbrush className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="ضبط طول النص" labelEn="Text Length Adjustment" enabled icon={<ArrowLeftRight className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="التفاف النص" labelEn="Text Wrapping" enabled icon={<Type className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="إعادة توزيع العناصر" labelEn="Element Redistribution" enabled icon={<Move className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="منع تجاوز الحاوية" labelEn="Container Overflow Prevention" enabled icon={<Box className="h-3.5 w-3.5" />} />
            </div>
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 13: Quality Validation
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'quality' && (
        <Section
          id="quality"
          titleAr="التحقق من الجودة"
          titleEn="Quality Validation"
          icon={<ShieldCheck className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Error Detection */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              اكتشاف الأخطاء <span className="text-xs text-gray-400">Error Detection</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureRow labelAr="اكتشاف النص المفقود" labelEn="Missing Text Detection" enabled icon={<FileSearch className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف التكرار" labelEn="Duplication Detection" enabled icon={<Copy className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="أخطاء اللغة" labelEn="Language Errors" enabled icon={<Bug className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="أخطاء الترجمة" labelEn="Translation Errors" enabled icon={<AlertTriangle className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="مشاكل التخطيط" labelEn="Layout Problems" enabled icon={<LayoutDashboard className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اكتشاف تجاوز النص" labelEn="Text Overflow Detection" enabled icon={<Box className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Scoring */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              تسجيل التكافؤ <span className="text-xs text-gray-400">Equivalence Scoring</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FeatureRow labelAr="التكافؤ الهيكلي" labelEn="Structural Equivalence Scoring" enabled icon={<Percent className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="انحراف الكثافة" labelEn="Density Deviation Scoring" enabled icon={<Percent className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="الحفاظ على التسلسل الهرمي" labelEn="Hierarchy Preservation Scoring" enabled icon={<Percent className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="سلامة المكونات" labelEn="Component Integrity Validation" enabled icon={<ShieldCheck className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Advanced Validation */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              التحقق المتقدم <span className="text-xs text-gray-400">Advanced Validation</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FeatureRow labelAr="التحقق من ربط البيانات" labelEn="Data-Binding Verification" enabled icon={<Database className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="اختبار الانحدار عبر الصيغ" labelEn="Cross-Format Regression Testing" enabled icon={<Replace className="h-3.5 w-3.5" />} />
            </div>
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 14: Multi-Format Export
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'export' && (
        <Section
          id="export"
          titleAr="التصدير المتعدد الصيغ"
          titleEn="Multi-Format Export"
          icon={<Download className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Format Selection */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              اختيار صيغة التصدير <span className="text-xs text-gray-400">Export Format Selection</span>
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
              {['PPTX', 'XLSX', 'DOCX', 'HTML', 'PDF', 'JSON', 'CSV', 'SVG', 'PNG'].map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setExportFormat(fmt)}
                  className={`rounded-lg border px-3 py-3 text-center text-sm font-bold transition ${
                    exportFormat === fmt
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Preservation Guarantees */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              ضمانات الحفاظ <span className="text-xs text-gray-400">Preservation Guarantees</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureRow labelAr="الحفاظ على الخطوط" labelEn="Font Preservation" enabled icon={<Type className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="الحفاظ على الألوان" labelEn="Color Preservation" enabled icon={<Palette className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="الحفاظ على الحجم" labelEn="Size Preservation" enabled icon={<Maximize className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="الحفاظ على التباعد" labelEn="Spacing Preservation" enabled icon={<AlignCenter className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="الحفاظ على الطبقات" labelEn="Layer Preservation" enabled icon={<Layers className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="الحفاظ على التخطيط" labelEn="Layout Preservation" enabled icon={<LayoutDashboard className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Export Button */}
          <div className="flex justify-center">
            <button
              type="button"
              disabled={!currentJob}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-5 w-5" />
              تصدير بصيغة {exportFormat}
              <span className="text-xs opacity-70">Export as {exportFormat}</span>
            </button>
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 15: STRICT Mode Controls
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'strict' && (
        <Section
          id="strict"
          titleAr="تحكمات وضع STRICT"
          titleEn="STRICT Mode Controls"
          icon={<Lock className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          <div className="mb-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/10">
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              وضع الدقة القصوى - Maximum Fidelity Mode
            </p>
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              هذه التحكمات تضمن دقة 1:1 مطلقة. تعطيل أي منها قد يؤثر على دقة النسخ.
            </p>
          </div>

          {/* Disabled Features (should stay OFF for strict) */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              ميزات معطلة (يجب أن تبقى مغلقة) <span className="text-xs text-gray-400">Disabled Features (must stay OFF)</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([
                { key: 'layoutSnapping' as const, ar: 'تعطيل محاذاة التخطيط', en: 'Layout Snapping Disable' },
                { key: 'autoSpacing' as const, ar: 'تعطيل التباعد التلقائي', en: 'Auto-Spacing Disable' },
                { key: 'autoHierarchy' as const, ar: 'تعطيل إعادة التوازن الهرمي', en: 'Auto-Hierarchy Rebalance Disable' },
                { key: 'beautification' as const, ar: 'عزل التحسين الجمالي', en: 'Beautification Isolation' },
                { key: 'fontFallback' as const, ar: 'حظر الخط البديل', en: 'Font Fallback Prohibition' },
              ]).map((ctrl) => (
                <div
                  key={ctrl.key}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{ctrl.ar}</p>
                    <p className="text-[10px] text-gray-400">{ctrl.en}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleStrictControl(ctrl.key)}
                    className={`relative h-6 w-11 rounded-full transition ${
                      strictControls[ctrl.key]
                        ? 'bg-red-500'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        strictControls[ctrl.key]
                          ? 'translate-x-5 rtl:-translate-x-0.5'
                          : 'translate-x-0.5 rtl:-translate-x-5'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Enabled Features (should stay ON for strict) */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              ميزات مفعلة (يجب أن تبقى مفتوحة) <span className="text-xs text-gray-400">Enabled Features (must stay ON)</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([
                { key: 'dualVerification' as const, ar: 'بوابة التحقق المزدوج', en: 'Dual Verification Gate' },
                { key: 'thresholdEnforcement' as const, ar: 'إنفاذ العتبة (رفض صارم)', en: 'Threshold Enforcement (Hard Reject)' },
                { key: 'deterministicSeed' as const, ar: 'بذرة عشوائية حتمية', en: 'Deterministic Random Seed' },
                { key: 'floatingPointNorm' as const, ar: 'تطبيع الفاصلة العائمة', en: 'Floating-Point Normalization' },
                { key: 'srgbLock' as const, ar: 'قفل فضاء ألوان sRGB', en: 'sRGB Color Space Lock' },
                { key: 'dpiNormalization' as const, ar: 'تطبيع DPI', en: 'DPI Normalization' },
                { key: 'antiAliasingConsistency' as const, ar: 'اتساق مضاد التعرج', en: 'Anti-Aliasing Consistency' },
                { key: 'immutableLayout' as const, ar: 'قفل التخطيط غير القابل للتغيير', en: 'Immutable Layout Lock' },
                { key: 'zeroMutation' as const, ar: 'سياسة عدم التغيير أثناء التشغيل', en: 'Zero Runtime Mutation Policy' },
                { key: 'hardFailure' as const, ar: 'فشل صارم عند خرق الدقة', en: 'Hard Failure on Fidelity Breach' },
              ]).map((ctrl) => (
                <div
                  key={ctrl.key}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{ctrl.ar}</p>
                    <p className="text-[10px] text-gray-400">{ctrl.en}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleStrictControl(ctrl.key)}
                    className={`relative h-6 w-11 rounded-full transition ${
                      strictControls[ctrl.key]
                        ? 'bg-green-500'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        strictControls[ctrl.key]
                          ? 'translate-x-5 rtl:-translate-x-0.5'
                          : 'translate-x-0.5 rtl:-translate-x-5'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 16: Fidelity Scoring
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'fidelity' && (
        <Section
          id="fidelity"
          titleAr="تسجيل الدقة"
          titleEn="Fidelity Scoring"
          icon={<Award className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Score Bars */}
          <div className="mb-6 space-y-3">
            <ScoreBar
              label="الدرجة الهيكلية"
              labelEn="Structural Score"
              score={fidelityScores.structural}
              color="bg-blue-500"
            />
            <ScoreBar
              label="درجة البكسل"
              labelEn="Pixel Score"
              score={fidelityScores.pixel}
              color="bg-indigo-500"
            />
            <ScoreBar
              label="درجة الكثافة"
              labelEn="Density Score"
              score={fidelityScores.density}
              color="bg-purple-500"
            />
            <ScoreBar
              label="درجة التسلسل الهرمي"
              labelEn="Hierarchy Score"
              score={fidelityScores.hierarchy}
              color="bg-violet-500"
            />
            <ScoreBar
              label="درجة الطباعة"
              labelEn="Typography Score"
              score={fidelityScores.typography}
              color="bg-fuchsia-500"
            />
            <ScoreBar
              label="درجة الألوان"
              labelEn="Color Score"
              score={fidelityScores.color}
              color="bg-pink-500"
            />
          </div>

          {/* Overall Score */}
          <div className="mb-6 rounded-lg border-2 border-indigo-200 bg-indigo-50 p-6 text-center dark:border-indigo-800 dark:bg-indigo-900/20">
            <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">الدرجة الإجمالية - Overall Score</p>
            <p className="mt-2 text-5xl font-black text-indigo-700 dark:text-indigo-300">
              {fidelityScores.overall}%
            </p>
            {fidelityScores.overall > 0 && fidelityScores.overall < 95 && (
              <div className="mt-3 flex items-center justify-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                أقل من العتبة المطلوبة (95%) - Below required threshold
              </div>
            )}
          </div>

          {/* Automated Rejection */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              الرفض التلقائي عند خرق العتبة <span className="text-xs text-gray-400">Automated Rejection on Threshold Breach</span>
            </p>
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">عتبة الرفض الحالية</p>
                  <p className="text-[10px] text-gray-400">Current Rejection Threshold</p>
                </div>
                <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300">95%</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div className="h-full w-[95%] rounded-full bg-red-400" />
              </div>
              <p className="mt-1 text-xs text-gray-400">أي نتيجة أقل من 95% يتم رفضها تلقائياً</p>
            </div>
          </div>

          {/* Audit Log */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              سجل التدقيق <span className="text-xs text-gray-400">Audit Log</span>
            </p>
            {historyQuery.data && historyQuery.data.data.length > 0 ? (
              <div className="space-y-2">
                {historyQuery.data.data.slice(0, 10).map((job) => (
                  <div key={job.id} className="flex items-center gap-3 rounded-lg border border-gray-100 px-4 py-2.5 dark:border-gray-700">
                    {job.status === 'completed' ? (
                      <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                    ) : job.status === 'failed' ? (
                      <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                    ) : (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-700 dark:text-gray-300">#{job.id.slice(0, 8)}</p>
                    </div>
                    <span className="text-xs text-gray-400">
                      {job.fidelityScore != null ? `${job.fidelityScore}%` : '--'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(job.createdAt).toLocaleDateString('ar-SA')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <ResultsPlaceholder messageAr="لا يوجد سجل تدقيق بعد" messageEn="No audit log entries yet" />
            )}
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 17: Image Preprocessing
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'preprocessing' && (
        <Section
          id="preprocessing"
          titleAr="المعالجة المسبقة للصور"
          titleEn="Image Preprocessing"
          icon={<ImageIcon className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* Preprocessing Options */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              خيارات المعالجة <span className="text-xs text-gray-400">Preprocessing Options</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([
                { key: 'noiseRemoval' as const, ar: 'إزالة الضوضاء', en: 'Noise Removal', icon: <Droplets className="h-3.5 w-3.5" /> },
                { key: 'skewCorrection' as const, ar: 'تصحيح الميل', en: 'Skew Correction', icon: <RotateCcw className="h-3.5 w-3.5" /> },
                { key: 'contrastEnhancement' as const, ar: 'تعزيز التباين', en: 'Contrast Enhancement', icon: <Contrast className="h-3.5 w-3.5" /> },
                { key: 'blurRemoval' as const, ar: 'إزالة التشويش', en: 'Blur Removal', icon: <Circle className="h-3.5 w-3.5" /> },
                { key: 'resolutionUpscaling' as const, ar: 'رفع الدقة', en: 'Resolution Upscaling', icon: <ZoomIn className="h-3.5 w-3.5" /> },
              ]).map((opt) => (
                <div
                  key={opt.key}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-500">{opt.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{opt.ar}</p>
                      <p className="text-[10px] text-gray-400">{opt.en}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePreprocessing(opt.key)}
                    className={`relative h-6 w-11 rounded-full transition ${
                      preprocessingOptions[opt.key]
                        ? 'bg-indigo-500'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        preprocessingOptions[opt.key]
                          ? 'translate-x-5 rtl:-translate-x-0.5'
                          : 'translate-x-0.5 rtl:-translate-x-5'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Enhance Upload */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              تحسين الصورة <span className="text-xs text-gray-400">Enhance Image</span>
            </p>
            <FileUploader
              onUpload={handleEnhance}
              maxFiles={1}
              accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'] }}
              labelAr="رفع صورة للتحسين"
              descriptionAr="ارفع صورة لتطبيق المعالجة المسبقة والتحسين"
            />
            {enhanceMutation.isPending && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                جارِ التحسين...
              </div>
            )}
            {enhanceMutation.isSuccess && enhanceMutation.data && (
              <div className="mt-3 space-y-2">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                  <p className="text-sm font-semibold text-green-700 dark:text-green-300">تم التحسين بنجاح</p>
                  <ul className="mt-2 space-y-1">
                    {((enhanceMutation.data as any).improvements ?? ['تم التحليل']).map((imp: string, i: number) => (
                      <li key={i} className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle className="h-3 w-3" />
                        {imp}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {enhanceMutation.isError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" />
                فشل في التحسين
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 18: PDF Support
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'pdf' && (
        <Section
          id="pdf"
          titleAr="دعم PDF"
          titleEn="PDF Support"
          icon={<FileDown className="h-5 w-5 text-indigo-600" />}
          defaultOpen
        >
          {/* PDF Types */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              أنواع PDF المدعومة <span className="text-xs text-gray-400">Supported PDF Types</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <FeatureRow labelAr="PDF قابل للبحث" labelEn="Searchable PDF" enabled icon={<FileSearch className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="PDF ممسوح ضوئياً" labelEn="Scanned PDF" enabled icon={<Scan className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="PDF هجين" labelEn="Hybrid PDF" enabled icon={<Copy className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* Extraction Capabilities */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              قدرات الاستخراج <span className="text-xs text-gray-400">Extraction Capabilities</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureRow labelAr="استخراج النص" labelEn="Text Extraction" enabled icon={<Type className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="استخراج الصور" labelEn="Image Extraction" enabled icon={<ImageIcon className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="استخراج الرسومات المتجهة" labelEn="Vector Extraction" enabled icon={<AreaChart className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="استخراج الخطوط" labelEn="Font Extraction" enabled icon={<Type className="h-3.5 w-3.5" />} />
              <FeatureRow labelAr="استخراج الطبقات" labelEn="Layer Extraction" enabled icon={<Layers className="h-3.5 w-3.5" />} />
            </div>
          </div>

          {/* PDF Upload */}
          <div>
            <FileUploader
              onUpload={handleExtract}
              maxFiles={1}
              accept={{ 'application/pdf': ['.pdf'] }}
              labelAr="رفع ملف PDF"
              descriptionAr="ارفع ملف PDF لتحليله واستخراج المحتوى"
            />
            {extractMutation.isPending && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                جارِ تحليل PDF...
              </div>
            )}
            {extractMutation.isSuccess && extractMutation.data && (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                <p className="mb-2 text-sm font-semibold text-green-700 dark:text-green-300">نتائج استخراج PDF</p>
                <div className="grid grid-cols-3 gap-3">
                  <InfoCard
                    labelAr="النص المستخرج"
                    labelEn="Extracted Text"
                    value={(extractMutation.data as any).fullText ? `${(extractMutation.data as any).fullText.length} حرف` : `${(extractMutation.data as any).textBlocks?.length ?? 0} كتلة`}
                  />
                  <InfoCard
                    labelAr="الجداول"
                    labelEn="Tables"
                    value={((extractMutation.data as any).tables ?? []).length}
                  />
                  <InfoCard
                    labelAr="الصور"
                    labelEn="Images"
                    value={((extractMutation.data as any).images ?? []).length}
                  />
                </div>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
