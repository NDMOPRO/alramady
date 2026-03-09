'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  dashboardEngine,
  type ApiList,
  type TemplateItem,
} from '@/lib/api/dashboard-engine.api';
import {
  Sparkles,
  BarChart3,
  PieChart,
  TrendingUp,
  Layout,
  Layers,
  Database,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Eye,
  Download,
  Wand2,
  AlertCircle,
  Loader2,
  ChevronLeft,
  Zap,
  LayoutDashboard,
  Table2,
  FileBarChart,
  Activity,
  Target,
  Gauge,
  CircleDot,
  Star,
  Crown,
  Rocket,
  RefreshCw,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type WizardStep = 'template' | 'dataset' | 'generate' | 'preview';

interface StepDefinition {
  id: WizardStep;
  labelAr: string;
  labelEn: string;
  icon: React.ElementType;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const WIZARD_STEPS: StepDefinition[] = [
  { id: 'template', labelAr: 'اختيار القالب', labelEn: 'Select Template', icon: Layout },
  { id: 'dataset', labelAr: 'تحديد البيانات', labelEn: 'Select Dataset', icon: Database },
  { id: 'generate', labelAr: 'إنشاء تلقائي', labelEn: 'Auto-Generate', icon: Wand2 },
  { id: 'preview', labelAr: 'معاينة النتيجة', labelEn: 'Preview Result', icon: Eye },
];

const CATEGORY_ICON_MAP: Record<string, React.ElementType> = {
  financial: BarChart3,
  sales: TrendingUp,
  hr: Layers,
  analytics: Activity,
  operations: Gauge,
  marketing: Target,
  healthcare: CircleDot,
  ecommerce: FileBarChart,
  default: LayoutDashboard,
};

const TEMPLATE_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-sky-600',
  'from-fuchsia-500 to-purple-600',
  'from-lime-500 to-green-600',
];

// ═══════════════════════════════════════════════════════════════
// Helper: get icon for template category
// ═══════════════════════════════════════════════════════════════

function getCategoryIcon(category: string): React.ElementType {
  const key = category.toLowerCase().replace(/\s+/g, '');
  for (const [k, v] of Object.entries(CATEGORY_ICON_MAP)) {
    if (key.includes(k)) return v;
  }
  return CATEGORY_ICON_MAP.default;
}

function getGradient(index: number): string {
  return TEMPLATE_GRADIENTS[index % TEMPLATE_GRADIENTS.length];
}

// ═══════════════════════════════════════════════════════════════
// Component: Glassmorphism Stepper
// ═══════════════════════════════════════════════════════════════

function GlassStepper({
  currentStep,
  completedSteps,
}: {
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;
}) {
  const currentIndex = WIZARD_STEPS.findIndex((s) => s.id === currentStep);
  const progressPercent = ((currentIndex + 1) / WIZARD_STEPS.length) * 100;

  return (
    <div className="relative rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-6 shadow-2xl overflow-hidden">
      {/* Gradient progress bar at top */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
        <div
          className="h-full bg-gradient-to-l from-emerald-400 via-teal-400 to-cyan-400 transition-all duration-700 ease-out rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-2">
        {WIZARD_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isActive = step.id === currentStep;
          const isCompleted = completedSteps.has(step.id);
          const isPast = idx < currentIndex;

          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
              {/* Step circle */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`
                    relative flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-500
                    ${isActive
                      ? 'bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/30 scale-110'
                      : isCompleted || isPast
                        ? 'bg-gradient-to-br from-emerald-500/80 to-teal-600/80 shadow-md'
                        : 'bg-white/10 border border-white/20'
                    }
                  `}
                >
                  {isCompleted || isPast ? (
                    <CheckCircle className="h-5 w-5 text-white" />
                  ) : (
                    <Icon className={`h-5 w-5 ${isActive ? 'text-white' : 'text-white/40'}`} />
                  )}
                  {isActive && (
                    <span className="absolute -inset-1 rounded-xl border-2 border-emerald-400/50 animate-pulse" />
                  )}
                </div>
                <div className="text-center">
                  <p className={`text-xs font-semibold ${isActive ? 'text-white' : isPast || isCompleted ? 'text-white/80' : 'text-white/40'}`}>
                    {step.labelAr}
                  </p>
                  <p className={`text-[10px] ${isActive ? 'text-white/80' : 'text-white/30'}`}>
                    {step.labelEn}
                  </p>
                </div>
              </div>

              {/* Connector line */}
              {idx < WIZARD_STEPS.length - 1 && (
                <div className="flex-1 mx-3 h-0.5 rounded-full overflow-hidden bg-white/10">
                  <div
                    className={`h-full bg-gradient-to-l from-emerald-400 to-teal-400 transition-all duration-700 ${
                      idx < currentIndex ? 'w-full' : 'w-0'
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Component: Premium Error Banner
// ═══════════════════════════════════════════════════════════════

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-red-200/50 bg-gradient-to-l from-red-50 via-rose-50 to-pink-50 p-5 shadow-lg">
      <div className="absolute inset-0 bg-gradient-to-l from-red-500/5 to-transparent" />
      <div className="relative flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-500/20">
          <AlertCircle className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-red-900">حدث خطأ</p>
          <p className="text-sm text-red-700 mt-0.5 truncate">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors shadow-md"
          >
            <RefreshCw className="h-4 w-4" />
            إعادة المحاولة
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Component: Premium Loading Skeleton
// ═══════════════════════════════════════════════════════════════

function TemplateSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <div className="h-14 w-14 rounded-xl bg-gray-200 mb-4" />
          <div className="h-4 w-3/4 rounded bg-gray-200 mb-2" />
          <div className="h-3 w-1/2 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Component: Generation Animation
// ═══════════════════════════════════════════════════════════════

function GenerationAnimation() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      {/* Outer ring */}
      <div className="relative flex h-40 w-40 items-center justify-center">
        {/* Spinning outer ring */}
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 border-r-teal-400 animate-spin" />
        {/* Pulsing middle ring */}
        <div className="absolute inset-3 rounded-full border-2 border-emerald-300/40 animate-pulse" />
        {/* Counter-spinning inner ring */}
        <div
          className="absolute inset-6 rounded-full border-4 border-transparent border-b-teal-500 border-l-emerald-400"
          style={{ animation: 'spin 1.5s linear infinite reverse' }}
        />
        {/* Center icon */}
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-xl shadow-emerald-500/30">
          <Wand2 className="h-8 w-8 text-white animate-pulse" />
        </div>
      </div>

      <div className="mt-8 text-center space-y-3">
        <h2 className="text-2xl font-bold text-gray-900">
          جاري الإنشاء التلقائي...
        </h2>
        <p className="text-gray-500 text-sm">
          Auto-generating your dashboard with AI
        </p>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pt-4">
          {['تحليل البيانات', 'تصميم المخطط', 'ربط المؤشرات', 'تحسين العرض'].map(
            (label, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                  style={{
                    animation: `pulse 1.5s ease-in-out ${i * 0.3}s infinite`,
                  }}
                />
                <span className="text-xs text-gray-400 hidden sm:inline">{label}</span>
                {i < 3 && <span className="text-gray-200 hidden sm:inline">|</span>}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Component: Success / Celebration State
// ═══════════════════════════════════════════════════════════════

function SuccessCelebration() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-10 text-center shadow-2xl">
      {/* Decorative confetti-like particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${4 + (i % 4) * 3}px`,
              height: `${4 + (i % 4) * 3}px`,
              background:
                i % 4 === 0
                  ? '#fbbf24'
                  : i % 4 === 1
                    ? '#f472b6'
                    : i % 4 === 2
                      ? '#a78bfa'
                      : '#34d399',
              top: `${5 + (i * 17) % 90}%`,
              left: `${3 + (i * 23) % 94}%`,
              opacity: 0.5,
              animation: `pulse ${1.5 + (i % 3) * 0.5}s ease-in-out ${(i % 5) * 0.2}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Stars */}
      <div className="absolute top-4 right-8 animate-pulse">
        <Star className="h-6 w-6 text-yellow-300/60" fill="currentColor" />
      </div>
      <div className="absolute top-12 left-12 animate-pulse" style={{ animationDelay: '0.5s' }}>
        <Star className="h-4 w-4 text-yellow-300/40" fill="currentColor" />
      </div>
      <div className="absolute bottom-8 right-16 animate-pulse" style={{ animationDelay: '1s' }}>
        <Star className="h-5 w-5 text-yellow-300/50" fill="currentColor" />
      </div>

      <div className="relative">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm shadow-inner">
          <CheckCircle className="h-10 w-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">
          تم الإنشاء بنجاح!
        </h2>
        <p className="text-emerald-100 text-lg">
          Dashboard Created Successfully
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 text-white/80 text-sm">
          <Rocket className="h-4 w-4" />
          <span>لوحتك جاهزة للاستخدام الآن</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════════════════════════

export default function EasyModeDashboardPage() {
  const [currentStep, setCurrentStep] = useState<WizardStep>('template');
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStep>>(new Set());
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [generatedDashboardId, setGeneratedDashboardId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // ─── Fetch templates ───
  const {
    data: templatesData,
    isLoading: templatesLoading,
    error: templatesError,
    refetch: refetchTemplates,
  } = useQuery<ApiList<TemplateItem>>({
    queryKey: ['dashboard-engine', 'templates'],
    queryFn: () => dashboardEngine.templateList(),
  });

  // ─── Fetch easy list (datasets / easy dashboards) ───
  const {
    data: easyData,
    isLoading: easyLoading,
    error: easyError,
    refetch: refetchEasy,
  } = useQuery<ApiList<Record<string, unknown>>>({
    queryKey: ['dashboard-engine', 'easy-list'],
    queryFn: () => dashboardEngine.easyList(),
  });

  const templates = templatesData?.data ?? [];
  const datasets = easyData?.data ?? [];

  // ─── Navigation helpers ───
  const markComplete = useCallback(
    (step: WizardStep) => {
      setCompletedSteps((prev) => new Set([...prev, step]));
    },
    []
  );

  const goToStep = useCallback(
    (step: WizardStep) => {
      setCurrentStep(step);
    },
    []
  );

  const handleSelectTemplate = useCallback(
    (id: string) => {
      setSelectedTemplateId(id);
    },
    []
  );

  const handleSelectDataset = useCallback(
    (id: string) => {
      setSelectedDatasetId(id);
    },
    []
  );

  const handleNextFromTemplate = useCallback(() => {
    if (!selectedTemplateId) return;
    markComplete('template');
    goToStep('dataset');
  }, [selectedTemplateId, markComplete, goToStep]);

  const handleNextFromDataset = useCallback(() => {
    if (!selectedTemplateId || !selectedDatasetId) return;
    markComplete('dataset');
    goToStep('generate');

    // Trigger generation
    setGenerationError(null);
    dashboardEngine
      .createFromTemplate(selectedTemplateId, `easy-${Date.now()}`, selectedDatasetId)
      .then((res) => {
        setGeneratedDashboardId(res.data.id);
        markComplete('generate');
        goToStep('preview');
      })
      .catch((err: Error) => {
        setGenerationError(err.message);
        goToStep('dataset');
      });
  }, [selectedTemplateId, selectedDatasetId, markComplete, goToStep]);

  const handleReset = useCallback(() => {
    setCurrentStep('template');
    setCompletedSteps(new Set());
    setSelectedTemplateId(null);
    setSelectedDatasetId(null);
    setGeneratedDashboardId(null);
    setGenerationError(null);
  }, []);

  // ─── Derived state ───
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const selectedDataset = datasets.find(
    (d) => (d as Record<string, unknown>).id === selectedDatasetId
  );
  const hasError = templatesError || easyError || generationError;

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50">
      {/* ═══════════ Premium Hero Section ═══════════ */}
      <div className="relative overflow-hidden bg-gradient-to-l from-emerald-600 via-teal-600 to-emerald-700">
        {/* Decorative background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-emerald-400/5 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 py-10">
          {/* Premium Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-emerald-200/70 mb-6">
            <Link
              href="/dashboard"
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              محرك لوحة المعلومات
            </Link>
            <span className="bg-gradient-to-b from-emerald-300/60 to-teal-300/60 bg-clip-text text-transparent font-bold">
              /
            </span>
            <span className="text-white font-medium">الوضع السهل</span>
          </nav>

          {/* Title + Description */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm shadow-lg">
                  <Sparkles className="h-6 w-6 text-yellow-300" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white">
                    إنشاء لوحة بنقرة واحدة
                  </h1>
                  <p className="text-emerald-200/80 text-sm mt-0.5">
                    One-Click Dashboard Creator
                  </p>
                </div>
              </div>
              <p className="text-emerald-100/60 max-w-xl text-sm leading-relaxed">
                اختر قالبًا جاهزًا، حدد مصدر البيانات، واترك الذكاء الاصطناعي يبني لوحتك التفاعلية خلال ثوانٍ
              </p>
            </div>

            {/* Quick stats */}
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 px-5 py-3 text-center">
                <p className="text-2xl font-bold text-white">{templates.length}</p>
                <p className="text-xs text-emerald-200/60">قوالب متاحة</p>
              </div>
              <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 px-5 py-3 text-center">
                <p className="text-2xl font-bold text-white">{datasets.length}</p>
                <p className="text-xs text-emerald-200/60">مصادر بيانات</p>
              </div>
              <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 px-5 py-3 text-center">
                <div className="flex items-center gap-1">
                  <Zap className="h-4 w-4 text-yellow-300" />
                  <p className="text-2xl font-bold text-white">AI</p>
                </div>
                <p className="text-xs text-emerald-200/60">ذكاء اصطناعي</p>
              </div>
            </div>
          </div>

          {/* ═══════════ Glassmorphism Stepper ═══════════ */}
          <GlassStepper currentStep={currentStep} completedSteps={completedSteps} />
        </div>
      </div>

      {/* ═══════════ Main Content ═══════════ */}
      <div className="mx-auto max-w-7xl px-6 py-10 space-y-8">
        {/* Error banners */}
        {templatesError && (
          <ErrorBanner
            message={(templatesError as Error).message}
            onRetry={() => refetchTemplates()}
          />
        )}
        {easyError && (
          <ErrorBanner
            message={(easyError as Error).message}
            onRetry={() => refetchEasy()}
          />
        )}
        {generationError && (
          <ErrorBanner
            message={generationError}
            onRetry={() => {
              setGenerationError(null);
              goToStep('dataset');
            }}
          />
        )}

        {/* ══════════════════════════════════════════════
            Step 1: Select Template
        ══════════════════════════════════════════════ */}
        {currentStep === 'template' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Crown className="h-5 w-5 text-amber-500" />
                  اختر نوع اللوحة
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Choose a template that matches your needs
                </p>
              </div>
              {selectedTemplateId && (
                <span className="text-sm text-emerald-600 bg-emerald-50 rounded-full px-4 py-1.5 font-medium border border-emerald-100">
                  تم الاختيار
                </span>
              )}
            </div>

            {templatesLoading ? (
              <TemplateSkeleton />
            ) : templates.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 p-16 text-center">
                <Layout className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium">لا توجد قوالب متاحة حاليًا</p>
                <p className="text-sm text-gray-400 mt-1">No templates available</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {templates.map((template, idx) => {
                  const Icon = getCategoryIcon(template.category);
                  const gradient = getGradient(idx);
                  const isSelected = selectedTemplateId === template.id;

                  return (
                    <button
                      key={template.id}
                      onClick={() => handleSelectTemplate(template.id)}
                      className={`
                        group relative flex flex-col rounded-2xl border-2 p-6 text-right transition-all duration-300
                        ${isSelected
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-xl shadow-emerald-500/10 scale-[1.02]'
                          : 'border-white/80 bg-white/70 backdrop-blur-sm hover:border-emerald-300 hover:shadow-lg hover:scale-[1.01] shadow-sm'
                        }
                      `}
                    >
                      {/* Glass overlay on hover */}
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                      {/* Premium badge */}
                      {template.isPremium && (
                        <div className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          <Crown className="h-3 w-3" />
                          Premium
                        </div>
                      )}

                      {/* Selected indicator */}
                      {isSelected && (
                        <div className="absolute top-3 left-3 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 shadow-md">
                          <CheckCircle className="h-4 w-4 text-white" />
                        </div>
                      )}

                      {/* Icon with gradient background */}
                      <div
                        className={`
                          relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${gradient}
                          shadow-lg transition-transform duration-300 group-hover:scale-110
                        `}
                      >
                        <Icon className="h-7 w-7 text-white" />
                        <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-[1px]" />
                      </div>

                      <div className="mt-4 relative">
                        <p className="font-bold text-gray-900 text-base leading-relaxed">
                          {template.name}
                        </p>
                        {template.description && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                            {template.description}
                          </p>
                        )}
                        <div className="mt-3 flex items-center justify-between">
                          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-500">
                            {template.category}
                          </span>
                          {template.isPublic && (
                            <span className="text-[10px] text-gray-400">
                              عام
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Next button */}
            {selectedTemplateId && (
              <div className="flex justify-start pt-2">
                <button
                  onClick={handleNextFromTemplate}
                  className="group flex items-center gap-3 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-8 py-3.5 text-sm font-bold text-white shadow-xl shadow-emerald-500/20 hover:shadow-2xl hover:shadow-emerald-500/30 transition-all duration-300 hover:scale-[1.02]"
                >
                  التالي: تحديد البيانات
                  <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            Step 2: Select Dataset
        ══════════════════════════════════════════════ */}
        {currentStep === 'dataset' && (
          <div className="space-y-6">
            {/* Selected template summary */}
            {selectedTemplate && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
                  <Layout className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-emerald-900">
                    القالب المختار: {selectedTemplate.name}
                  </p>
                  <p className="text-xs text-emerald-600">{selectedTemplate.category}</p>
                </div>
                <button
                  onClick={() => goToStep('template')}
                  className="text-xs text-emerald-600 hover:text-emerald-800 underline underline-offset-2"
                >
                  تغيير
                </button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Database className="h-5 w-5 text-blue-500" />
                  حدد مصدر البيانات
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Select the dataset to populate your dashboard
                </p>
              </div>
            </div>

            {easyLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
              </div>
            ) : datasets.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 p-16 text-center">
                <Database className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium">لا توجد مصادر بيانات متاحة</p>
                <p className="text-sm text-gray-400 mt-1">No datasets available</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {datasets.map((ds, idx) => {
                  const dsId = String((ds as Record<string, unknown>).id ?? idx);
                  const dsName = String(
                    (ds as Record<string, unknown>).name ??
                    (ds as Record<string, unknown>).title ??
                    `Dataset ${idx + 1}`
                  );
                  const dsDescription = String(
                    (ds as Record<string, unknown>).description ?? ''
                  );
                  const isSelected = selectedDatasetId === dsId;

                  return (
                    <button
                      key={dsId}
                      onClick={() => handleSelectDataset(dsId)}
                      className={`
                        group relative flex items-start gap-4 rounded-2xl border-2 p-5 text-right transition-all duration-300
                        ${isSelected
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-xl shadow-emerald-500/10'
                          : 'border-gray-100 bg-white hover:border-emerald-300 hover:shadow-lg shadow-sm'
                        }
                      `}
                    >
                      <div
                        className={`
                          flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-all duration-300
                          ${isSelected
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md'
                            : 'bg-gray-100 group-hover:bg-gradient-to-br group-hover:from-emerald-400 group-hover:to-teal-500'
                          }
                        `}
                      >
                        <Table2
                          className={`h-5 w-5 transition-colors ${
                            isSelected ? 'text-white' : 'text-gray-400 group-hover:text-white'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 truncate">{dsName}</p>
                        {dsDescription && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                            {dsDescription}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 shrink-0">
                          <CheckCircle className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => goToStep('template')}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              >
                <ArrowRight className="h-4 w-4" />
                السابق
              </button>
              {selectedDatasetId && (
                <button
                  onClick={handleNextFromDataset}
                  className="group flex items-center gap-3 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-8 py-3.5 text-sm font-bold text-white shadow-xl shadow-emerald-500/20 hover:shadow-2xl hover:shadow-emerald-500/30 transition-all duration-300 hover:scale-[1.02]"
                >
                  <Wand2 className="h-4 w-4" />
                  إنشاء اللوحة تلقائيًا
                </button>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            Step 3: Auto-Generate (Animation)
        ══════════════════════════════════════════════ */}
        {currentStep === 'generate' && (
          <div className="rounded-3xl border border-gray-100 bg-white shadow-xl overflow-hidden">
            <GenerationAnimation />
          </div>
        )}

        {/* ══════════════════════════════════════════════
            Step 4: Preview Result
        ══════════════════════════════════════════════ */}
        {currentStep === 'preview' && generatedDashboardId && (
          <div className="space-y-8">
            {/* Success celebration */}
            <SuccessCelebration />

            {/* Dashboard preview card */}
            <div className="rounded-3xl border border-gray-100 bg-white shadow-xl overflow-hidden">
              <div className="border-b border-gray-100 bg-gray-50/50 px-8 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
                    <FileBarChart className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">معاينة اللوحة</h3>
                    <p className="text-xs text-gray-400">Dashboard Preview</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
                  ID: {generatedDashboardId.slice(0, 8)}...
                </span>
              </div>

              <div className="p-8">
                {/* KPI preview placeholders */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
                  {[
                    { label: 'المؤشر الرئيسي', color: 'from-blue-500 to-indigo-600' },
                    { label: 'الأداء العام', color: 'from-emerald-500 to-teal-600' },
                    { label: 'معدل النمو', color: 'from-violet-500 to-purple-600' },
                    { label: 'الإجمالي', color: 'from-amber-500 to-orange-600' },
                  ].map((kpi, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-5 text-center shadow-sm"
                    >
                      <div
                        className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${kpi.color} shadow-md`}
                      >
                        <Activity className="h-5 w-5 text-white" />
                      </div>
                      <p className="text-lg font-bold text-gray-900">--</p>
                      <p className="text-xs text-gray-400 mt-1">{kpi.label}</p>
                    </div>
                  ))}
                </div>

                {/* Chart area placeholders */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6 h-48 flex flex-col items-center justify-center">
                    <BarChart3 className="h-12 w-12 text-gray-200 mb-2" />
                    <p className="text-sm text-gray-300">مخطط عمودي</p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6 h-48 flex flex-col items-center justify-center">
                    <PieChart className="h-12 w-12 text-gray-200 mb-2" />
                    <p className="text-sm text-gray-300">مخطط دائري</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href={`/dashboard/editor?id=${generatedDashboardId}`}
                className="group flex items-center gap-3 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-8 py-3.5 text-sm font-bold text-white shadow-xl shadow-emerald-500/20 hover:shadow-2xl hover:shadow-emerald-500/30 transition-all duration-300 hover:scale-[1.02]"
              >
                <Eye className="h-4 w-4" />
                فتح في المحرر المتقدم
              </Link>
              <button className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
                <Download className="h-4 w-4" />
                تصدير اللوحة
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              >
                <RefreshCw className="h-4 w-4" />
                إنشاء لوحة جديدة
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
