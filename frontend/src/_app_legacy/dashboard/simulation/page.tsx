'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  dashboardEngine,
  type ChartSuggestion,
  type DesignTokens,
  type DashboardItem,
  type ApiRes,
  type ApiList,
} from '@/lib/api/dashboard-engine.api';
import {
  Brain,
  Image,
  MessageSquareText,
  Gauge,
  Paintbrush,
  Sparkles,
  Send,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  BarChart3,
  PieChart,
  TrendingUp,
  Clock,
  Palette,
  Type,
  Layers,
  Zap,
  RefreshCw,
  ChevronLeft,
  Activity,
  Network,
  Cpu,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface SimulationListItem {
  id: string;
  type: string;
  status: string;
  createdAt: string;
}

interface PerformanceResult {
  estimatedRenderTime: string;
  recommendations: string[];
}

/* ═══════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════ */

function AiSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'h-5 w-5', md: 'h-8 w-8', lg: 'h-12 w-12' };
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <div className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-500`} />
        <div className={`absolute inset-0 ${sizeClasses[size]} animate-ping rounded-full border border-cyan-400 opacity-20`} />
      </div>
      <p className="text-sm text-cyan-300 animate-pulse">جاري المعالجة بالذكاء الاصطناعي...</p>
    </div>
  );
}

function NeuralDecoration() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-10">
      <svg className="absolute -top-20 -end-20 h-64 w-64 text-cyan-400" viewBox="0 0 200 200">
        <circle cx="40" cy="40" r="4" fill="currentColor" />
        <circle cx="100" cy="30" r="4" fill="currentColor" />
        <circle cx="160" cy="50" r="4" fill="currentColor" />
        <circle cx="60" cy="100" r="4" fill="currentColor" />
        <circle cx="130" cy="90" r="4" fill="currentColor" />
        <circle cx="170" cy="130" r="4" fill="currentColor" />
        <circle cx="40" cy="160" r="4" fill="currentColor" />
        <circle cx="110" cy="150" r="4" fill="currentColor" />
        <circle cx="160" cy="170" r="4" fill="currentColor" />
        <line x1="40" y1="40" x2="100" y2="30" stroke="currentColor" strokeWidth="0.5" />
        <line x1="100" y1="30" x2="160" y2="50" stroke="currentColor" strokeWidth="0.5" />
        <line x1="40" y1="40" x2="60" y2="100" stroke="currentColor" strokeWidth="0.5" />
        <line x1="100" y1="30" x2="130" y2="90" stroke="currentColor" strokeWidth="0.5" />
        <line x1="160" y1="50" x2="170" y2="130" stroke="currentColor" strokeWidth="0.5" />
        <line x1="60" y1="100" x2="130" y2="90" stroke="currentColor" strokeWidth="0.5" />
        <line x1="130" y1="90" x2="170" y2="130" stroke="currentColor" strokeWidth="0.5" />
        <line x1="60" y1="100" x2="40" y2="160" stroke="currentColor" strokeWidth="0.5" />
        <line x1="130" y1="90" x2="110" y2="150" stroke="currentColor" strokeWidth="0.5" />
        <line x1="170" y1="130" x2="160" y2="170" stroke="currentColor" strokeWidth="0.5" />
        <line x1="40" y1="160" x2="110" y2="150" stroke="currentColor" strokeWidth="0.5" />
        <line x1="110" y1="150" x2="160" y2="170" stroke="currentColor" strokeWidth="0.5" />
      </svg>
      <svg className="absolute -bottom-10 -start-10 h-48 w-48 text-blue-400" viewBox="0 0 200 200">
        <circle cx="30" cy="60" r="3" fill="currentColor" />
        <circle cx="90" cy="40" r="3" fill="currentColor" />
        <circle cx="150" cy="60" r="3" fill="currentColor" />
        <circle cx="50" cy="120" r="3" fill="currentColor" />
        <circle cx="120" cy="110" r="3" fill="currentColor" />
        <circle cx="80" cy="170" r="3" fill="currentColor" />
        <line x1="30" y1="60" x2="90" y2="40" stroke="currentColor" strokeWidth="0.5" />
        <line x1="90" y1="40" x2="150" y2="60" stroke="currentColor" strokeWidth="0.5" />
        <line x1="30" y1="60" x2="50" y2="120" stroke="currentColor" strokeWidth="0.5" />
        <line x1="90" y1="40" x2="120" y2="110" stroke="currentColor" strokeWidth="0.5" />
        <line x1="50" y1="120" x2="120" y2="110" stroke="currentColor" strokeWidth="0.5" />
        <line x1="50" y1="120" x2="80" y2="170" stroke="currentColor" strokeWidth="0.5" />
        <line x1="120" y1="110" x2="80" y2="170" stroke="currentColor" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
      <AlertCircle className="h-8 w-8 text-red-400" />
      <p className="text-sm text-red-300">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/30 transition-colors">
          <RefreshCw className="h-3 w-3" /> اعادة المحاولة
        </button>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-8 text-center">
      <Brain className="h-10 w-10 text-gray-500" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl ${className}`}>
      <NeuralDecoration />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function PerformanceMeter({ value, label }: { value: number; label: string }) {
  const getColor = (v: number) => {
    if (v < 30) return 'from-green-400 to-emerald-500';
    if (v < 60) return 'from-yellow-400 to-amber-500';
    return 'from-red-400 to-rose-500';
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-24 w-24">
        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="40" fill="none"
            stroke="url(#meter-grad)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${(value / 100) * 251.2} 251.2`}
          />
          <defs>
            <linearGradient id="meter-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={value < 30 ? '#4ade80' : value < 60 ? '#facc15' : '#f87171'} />
              <stop offset="100%" stopColor={value < 30 ? '#10b981' : value < 60 ? '#f59e0b' : '#e11d48'} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white">{value}%</span>
        </div>
      </div>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  );
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <div className="group relative flex flex-col items-center gap-1">
      <div
        className="h-10 w-10 rounded-lg border border-white/20 shadow-lg transition-transform group-hover:scale-110"
        style={{ backgroundColor: color }}
      />
      <span className="text-[10px] font-mono text-gray-400">{color}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Chart icon helper
   ═══════════════════════════════════════════════════════════════ */

function chartIcon(type: string) {
  switch (type?.toLowerCase()) {
    case 'bar': return <BarChart3 className="h-6 w-6 text-cyan-400" />;
    case 'pie': return <PieChart className="h-6 w-6 text-violet-400" />;
    case 'line': return <TrendingUp className="h-6 w-6 text-emerald-400" />;
    default: return <BarChart3 className="h-6 w-6 text-blue-400" />;
  }
}

/* ═══════════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════════ */

export default function SimulationPage() {
  /* ---- form state ---- */
  const [imageJson, setImageJson] = useState('');
  const [imageDatasetId, setImageDatasetId] = useState('');
  const [promptText, setPromptText] = useState('');
  const [promptDatasetId, setPromptDatasetId] = useState('');
  const [perfDatasetId, setPerfDatasetId] = useState('');
  const [tokensJson, setTokensJson] = useState('');

  /* ---- active tab for mobile ---- */
  const [activeSection, setActiveSection] = useState<'image' | 'prompt' | 'perf' | 'tokens'>('image');

  /* ---- queries ---- */
  const simulationsQuery = useQuery<ApiList<Record<string, unknown>>>({
    queryKey: ['simulation-list'],
    queryFn: () => dashboardEngine.simulationList(),
  });

  /* ---- mutations ---- */
  const simulateImageMutation = useMutation<ApiRes<DashboardItem>, Error, { imageAnalysis: Record<string, unknown>; datasetId: string }>({
    mutationFn: ({ imageAnalysis, datasetId }) => dashboardEngine.simulateFromImage(imageAnalysis, datasetId),
  });

  const chartFromPromptMutation = useMutation<ApiRes<ChartSuggestion>, Error, { prompt: string; datasetId: string }>({
    mutationFn: ({ prompt, datasetId }) => dashboardEngine.generateChartFromPrompt(prompt, datasetId),
  });

  const performanceMutation = useMutation<ApiRes<PerformanceResult>, Error, string>({
    mutationFn: (datasetId) => dashboardEngine.simulatePerformance(datasetId),
  });

  const tokensMutation = useMutation<ApiRes<DesignTokens>, Error, Record<string, unknown>>({
    mutationFn: (imageAnalysis) => dashboardEngine.extractDesignTokens(imageAnalysis),
  });

  /* ---- handlers ---- */
  function handleSimulateImage() {
    try {
      const parsed = JSON.parse(imageJson);
      simulateImageMutation.mutate({ imageAnalysis: parsed, datasetId: imageDatasetId });
    } catch {
      simulateImageMutation.reset();
    }
  }

  function handleChartFromPrompt() {
    if (!promptText.trim() || !promptDatasetId.trim()) return;
    chartFromPromptMutation.mutate({ prompt: promptText, datasetId: promptDatasetId });
  }

  function handlePerformance() {
    if (!perfDatasetId.trim()) return;
    performanceMutation.mutate(perfDatasetId);
  }

  function handleExtractTokens() {
    try {
      const parsed = JSON.parse(tokensJson);
      tokensMutation.mutate(parsed);
    } catch {
      tokensMutation.reset();
    }
  }

  /* ---- derived ---- */
  const totalSimulations = simulationsQuery.data?.total ?? 0;
  const simulations = simulationsQuery.data?.data ?? [];

  const sectionTabs: { key: typeof activeSection; label: string; labelEn: string; icon: React.ReactNode }[] = [
    { key: 'image', label: 'محاكاة من صورة', labelEn: 'Image Sim', icon: <Image className="h-4 w-4" /> },
    { key: 'prompt', label: 'رسم من نص', labelEn: 'Chart Prompt', icon: <MessageSquareText className="h-4 w-4" /> },
    { key: 'perf', label: 'الاداء', labelEn: 'Performance', icon: <Gauge className="h-4 w-4" /> },
    { key: 'tokens', label: 'رموز التصميم', labelEn: 'Tokens', icon: <Paintbrush className="h-4 w-4" /> },
  ];

  /* ---- render time to numeric for meter ---- */
  function renderTimeToPercent(rt: string): number {
    const ms = parseFloat(rt);
    if (isNaN(ms)) return 50;
    if (ms < 200) return 15;
    if (ms < 500) return 35;
    if (ms < 1000) return 55;
    if (ms < 3000) return 75;
    return 90;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 text-white" dir="rtl">
      {/* Neural BG pattern */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.08),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(59,130,246,0.06),transparent_60%)]" />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* ─── Breadcrumb ─── */}
        <nav className="flex items-center gap-2 text-sm text-gray-400">
          <Link href="/dashboard" className="hover:text-cyan-400 transition-colors">محرك لوحة المعلومات</Link>
          <ChevronLeft className="h-4 w-4 rotate-180" />
          <span className="text-cyan-300">المحاكاة الذكية</span>
        </nav>

        {/* ─── Hero Header ─── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-cyan-500 to-blue-600 p-8 sm:p-10">
          <NeuralDecoration />
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                <Brain className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white sm:text-3xl">المحاكاة الذكية</h1>
                <p className="mt-1 text-sm text-white/70">External Simulation Engine - E03.07</p>
                <p className="mt-0.5 text-xs text-white/50">
                  محاكاة لوحات المعلومات من الصور والنصوص واستخراج رموز التصميم وتحليل الاداء
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur-sm px-4 py-2">
                <Network className="h-5 w-5 text-white/70" />
                <div>
                  <p className="text-lg font-bold text-white">{totalSimulations}</p>
                  <p className="text-[10px] text-white/60">عملية محاكاة</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur-sm px-4 py-2">
                <Cpu className="h-5 w-5 text-white/70" />
                <div>
                  <p className="text-lg font-bold text-white">4</p>
                  <p className="text-[10px] text-white/60">ادوات ذكية</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Stats Row ─── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { icon: <Image className="h-5 w-5" />, value: totalSimulations, label: 'محاكاة مكتملة', labelEn: 'Completed', color: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/20', textColor: 'text-cyan-400' },
            { icon: <MessageSquareText className="h-5 w-5" />, value: simulations.length, label: 'محاكاة نشطة', labelEn: 'Active', color: 'from-violet-500/20 to-violet-600/10 border-violet-500/20', textColor: 'text-violet-400' },
            { icon: <Gauge className="h-5 w-5" />, value: '0ms', label: 'متوسط الاستجابة', labelEn: 'Avg Response', color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/20', textColor: 'text-emerald-400' },
            { icon: <Paintbrush className="h-5 w-5" />, value: '4', label: 'ادوات محاكاة', labelEn: 'Sim Tools', color: 'from-amber-500/20 to-amber-600/10 border-amber-500/20', textColor: 'text-amber-400' },
          ].map((stat, i) => (
            <div key={i} className={`rounded-xl border bg-gradient-to-br ${stat.color} p-4 backdrop-blur-sm`}>
              <div className={`mb-2 ${stat.textColor}`}>{stat.icon}</div>
              <p className={`text-2xl font-bold ${stat.textColor}`}>{stat.value}</p>
              <p className="text-xs text-gray-400">{stat.label}</p>
              <p className="text-[10px] text-gray-500">{stat.labelEn}</p>
            </div>
          ))}
        </div>

        {/* ─── Section Tabs (mobile) ─── */}
        <div className="flex gap-2 overflow-x-auto pb-2 lg:hidden">
          {sectionTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                activeSection === tab.key
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ─── Feature Cards Grid ─── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* ══════════════════════════════════════════════════════
             1) Simulate from Image
             ══════════════════════════════════════════════════════ */}
          <div className={activeSection === 'image' ? '' : 'hidden lg:block'}>
            <GlassCard className="h-full">
              <div className="border-b border-white/10 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600">
                    <Image className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">محاكاة من صورة</h2>
                    <p className="text-xs text-gray-400">Simulate from Image</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-300">
                    تحليل الصورة <span className="text-gray-500">(Image Analysis JSON)</span>
                  </label>
                  <textarea
                    value={imageJson}
                    onChange={(e) => setImageJson(e.target.value)}
                    placeholder='{"layout": "grid", "charts": ["bar", "pie"], "colors": ["#3b82f6"]}'
                    rows={4}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 backdrop-blur-sm focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-300">
                    معرف مجموعة البيانات <span className="text-gray-500">(Dataset ID)</span>
                  </label>
                  <input
                    type="text"
                    value={imageDatasetId}
                    onChange={(e) => setImageDatasetId(e.target.value)}
                    placeholder="dataset-uuid-here"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-gray-500 backdrop-blur-sm focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 font-mono"
                    dir="ltr"
                  />
                </div>
                <button
                  onClick={handleSimulateImage}
                  disabled={simulateImageMutation.isPending || !imageJson.trim() || !imageDatasetId.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-cyan-500 to-blue-600 px-4 py-3 text-sm font-bold text-white transition-all hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {simulateImageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {simulateImageMutation.isPending ? 'جاري المحاكاة...' : 'بدء المحاكاة'}
                </button>

                {/* Result */}
                {simulateImageMutation.isPending && (
                  <div className="py-4"><AiSpinner /></div>
                )}
                {simulateImageMutation.isError && (
                  <ErrorState
                    message={simulateImageMutation.error?.message || 'فشلت المحاكاة'}
                    onRetry={() => simulateImageMutation.reset()}
                  />
                )}
                {simulateImageMutation.isSuccess && simulateImageMutation.data?.data && (
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-cyan-400">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="text-sm font-semibold">تم انشاء اللوحة بنجاح</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg bg-white/5 p-3">
                        <span className="text-gray-400">المعرف</span>
                        <p className="mt-1 font-mono text-cyan-300 truncate">{simulateImageMutation.data.data.id}</p>
                      </div>
                      <div className="rounded-lg bg-white/5 p-3">
                        <span className="text-gray-400">الاسم</span>
                        <p className="mt-1 text-white">{simulateImageMutation.data.data.name}</p>
                      </div>
                      {simulateImageMutation.data.data.slug && (
                        <div className="rounded-lg bg-white/5 p-3">
                          <span className="text-gray-400">Slug</span>
                          <p className="mt-1 font-mono text-gray-300">{simulateImageMutation.data.data.slug}</p>
                        </div>
                      )}
                      {simulateImageMutation.data.data.status && (
                        <div className="rounded-lg bg-white/5 p-3">
                          <span className="text-gray-400">الحالة</span>
                          <p className="mt-1 text-emerald-400">{simulateImageMutation.data.data.status}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {!simulateImageMutation.isPending && !simulateImageMutation.isError && !simulateImageMutation.isSuccess && (
                  <EmptyState message="ادخل بيانات تحليل الصورة ومعرف البيانات لبدء المحاكاة" />
                )}
              </div>
            </GlassCard>
          </div>

          {/* ══════════════════════════════════════════════════════
             2) Chart from Prompt
             ══════════════════════════════════════════════════════ */}
          <div className={activeSection === 'prompt' ? '' : 'hidden lg:block'}>
            <GlassCard className="h-full">
              <div className="border-b border-white/10 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
                    <MessageSquareText className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">انشاء رسم من نص</h2>
                    <p className="text-xs text-gray-400">Generate Chart from Prompt</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4 p-5">
                {/* Chat-style prompt */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs text-gray-400">
                    <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                    <span>وصف الرسم البياني الذي تريده</span>
                  </div>
                  <div className="flex gap-2">
                    <textarea
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      placeholder="مثال: اريد رسم بياني دائري يوضح توزيع المبيعات حسب المنطقة..."
                      rows={3}
                      className="flex-1 rounded-lg border-0 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none resize-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-300">
                    معرف مجموعة البيانات <span className="text-gray-500">(Dataset ID)</span>
                  </label>
                  <input
                    type="text"
                    value={promptDatasetId}
                    onChange={(e) => setPromptDatasetId(e.target.value)}
                    placeholder="dataset-uuid-here"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-gray-500 backdrop-blur-sm focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30 font-mono"
                    dir="ltr"
                  />
                </div>
                <button
                  onClick={handleChartFromPrompt}
                  disabled={chartFromPromptMutation.isPending || !promptText.trim() || !promptDatasetId.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-violet-500 to-purple-600 px-4 py-3 text-sm font-bold text-white transition-all hover:shadow-lg hover:shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {chartFromPromptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {chartFromPromptMutation.isPending ? 'جاري التوليد...' : 'توليد الرسم'}
                </button>

                {/* Result */}
                {chartFromPromptMutation.isPending && (
                  <div className="py-4"><AiSpinner /></div>
                )}
                {chartFromPromptMutation.isError && (
                  <ErrorState
                    message={chartFromPromptMutation.error?.message || 'فشل التوليد'}
                    onRetry={() => chartFromPromptMutation.reset()}
                  />
                )}
                {chartFromPromptMutation.isSuccess && chartFromPromptMutation.data?.data && (() => {
                  const chart = chartFromPromptMutation.data.data;
                  return (
                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-4">
                      <div className="flex items-center gap-2 text-violet-400">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="text-sm font-semibold">تم توليد اقتراح الرسم</span>
                      </div>
                      <div className="flex items-center gap-4 rounded-lg bg-white/5 p-4">
                        {chartIcon(chart.type)}
                        <div>
                          <p className="text-sm font-medium text-white">نوع الرسم: <span className="text-violet-300">{chart.type}</span></p>
                          <p className="text-xs text-gray-400 mt-0.5">التجميع: <span className="text-violet-300">{chart.aggregation}</span></p>
                        </div>
                      </div>
                      {chart.config && Object.keys(chart.config).length > 0 && (
                        <div className="rounded-lg bg-white/5 p-3">
                          <p className="text-xs font-medium text-gray-400 mb-2">الاعدادات <span className="text-gray-500">(Config)</span></p>
                          <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto" dir="ltr">
                            {JSON.stringify(chart.config, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {!chartFromPromptMutation.isPending && !chartFromPromptMutation.isError && !chartFromPromptMutation.isSuccess && (
                  <EmptyState message="اكتب وصفاً للرسم البياني المطلوب وسيقوم الذكاء الاصطناعي باقتراح النوع والاعدادات" />
                )}
              </div>
            </GlassCard>
          </div>

          {/* ══════════════════════════════════════════════════════
             3) Performance Simulation
             ══════════════════════════════════════════════════════ */}
          <div className={activeSection === 'perf' ? '' : 'hidden lg:block'}>
            <GlassCard className="h-full">
              <div className="border-b border-white/10 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600">
                    <Gauge className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">محاكاة الاداء</h2>
                    <p className="text-xs text-gray-400">Performance Simulation</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-300">
                    معرف مجموعة البيانات <span className="text-gray-500">(Dataset ID)</span>
                  </label>
                  <input
                    type="text"
                    value={perfDatasetId}
                    onChange={(e) => setPerfDatasetId(e.target.value)}
                    placeholder="dataset-uuid-here"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-gray-500 backdrop-blur-sm focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 font-mono"
                    dir="ltr"
                  />
                </div>
                <button
                  onClick={handlePerformance}
                  disabled={performanceMutation.isPending || !perfDatasetId.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-500 to-green-600 px-4 py-3 text-sm font-bold text-white transition-all hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {performanceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                  {performanceMutation.isPending ? 'جاري التحليل...' : 'تحليل الاداء'}
                </button>

                {/* Result */}
                {performanceMutation.isPending && (
                  <div className="py-4"><AiSpinner /></div>
                )}
                {performanceMutation.isError && (
                  <ErrorState
                    message={performanceMutation.error?.message || 'فشل تحليل الاداء'}
                    onRetry={() => performanceMutation.reset()}
                  />
                )}
                {performanceMutation.isSuccess && performanceMutation.data?.data && (() => {
                  const perf = performanceMutation.data.data;
                  return (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-4">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="text-sm font-semibold">نتائج تحليل الاداء</span>
                      </div>
                      {/* Meter */}
                      <div className="flex justify-center py-2">
                        <PerformanceMeter
                          value={renderTimeToPercent(perf.estimatedRenderTime)}
                          label="مؤشر الاداء"
                        />
                      </div>
                      <div className="rounded-lg bg-white/5 p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Clock className="h-4 w-4 text-emerald-400" />
                          <span className="text-xs text-gray-400">وقت العرض المتوقع</span>
                        </div>
                        <p className="mt-1 text-xl font-bold text-white" dir="ltr">{perf.estimatedRenderTime}</p>
                      </div>
                      {/* Recommendations */}
                      {perf.recommendations && perf.recommendations.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-400 mb-2">التوصيات <span className="text-gray-500">(Recommendations)</span></p>
                          <ul className="space-y-2">
                            {perf.recommendations.map((rec: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-2 rounded-lg bg-white/5 p-3 text-sm">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                                <span className="text-gray-300">{rec}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(!perf.recommendations || perf.recommendations.length === 0) && (
                        <p className="text-center text-xs text-gray-500">لا توجد توصيات - الاداء ممتاز</p>
                      )}
                    </div>
                  );
                })()}
                {!performanceMutation.isPending && !performanceMutation.isError && !performanceMutation.isSuccess && (
                  <EmptyState message="ادخل معرف مجموعة البيانات لتحليل الاداء المتوقع" />
                )}
              </div>
            </GlassCard>
          </div>

          {/* ══════════════════════════════════════════════════════
             4) Extract Design Tokens
             ══════════════════════════════════════════════════════ */}
          <div className={activeSection === 'tokens' ? '' : 'hidden lg:block'}>
            <GlassCard className="h-full">
              <div className="border-b border-white/10 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600">
                    <Paintbrush className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">استخراج رموز التصميم</h2>
                    <p className="text-xs text-gray-400">Extract Design Tokens</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-300">
                    تحليل الصورة <span className="text-gray-500">(Image Analysis JSON)</span>
                  </label>
                  <textarea
                    value={tokensJson}
                    onChange={(e) => setTokensJson(e.target.value)}
                    placeholder='{"imageUrl": "...", "dominantColors": ["#3b82f6"], "hasText": true}'
                    rows={4}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 backdrop-blur-sm focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30 font-mono"
                    dir="ltr"
                  />
                </div>
                <button
                  onClick={handleExtractTokens}
                  disabled={tokensMutation.isPending || !tokensJson.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-amber-500 to-orange-600 px-4 py-3 text-sm font-bold text-white transition-all hover:shadow-lg hover:shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {tokensMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {tokensMutation.isPending ? 'جاري الاستخراج...' : 'استخراج الرموز'}
                </button>

                {/* Result */}
                {tokensMutation.isPending && (
                  <div className="py-4"><AiSpinner /></div>
                )}
                {tokensMutation.isError && (
                  <ErrorState
                    message={tokensMutation.error?.message || 'فشل استخراج الرموز'}
                    onRetry={() => tokensMutation.reset()}
                  />
                )}
                {tokensMutation.isSuccess && tokensMutation.data?.data && (() => {
                  const tokens = tokensMutation.data.data;
                  return (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-4">
                      <div className="flex items-center gap-2 text-amber-400">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="text-sm font-semibold">تم استخراج رموز التصميم</span>
                      </div>

                      {/* Colors */}
                      {tokens.colors && tokens.colors.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Palette className="h-4 w-4 text-amber-400" />
                            <span className="text-xs font-medium text-gray-400">الالوان <span className="text-gray-500">(Colors)</span></span>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {tokens.colors.map((color: string, idx: number) => (
                              <ColorSwatch key={idx} color={color} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Font + Theme */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-white/5 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Type className="h-3.5 w-3.5 text-amber-400" />
                            <span className="text-[10px] text-gray-500">الخط (Font)</span>
                          </div>
                          <p className="text-sm font-medium text-white">{tokens.font || '-'}</p>
                        </div>
                        <div className="rounded-lg bg-white/5 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Layers className="h-3.5 w-3.5 text-amber-400" />
                            <span className="text-[10px] text-gray-500">القالب (Theme)</span>
                          </div>
                          <p className="text-sm font-medium text-white">{tokens.themeId || '-'}</p>
                        </div>
                      </div>

                      {/* Border Radius + Shadow */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-white/5 p-3">
                          <span className="text-[10px] text-gray-500">الحواف (Border Radius)</span>
                          <div className="mt-1 flex items-center gap-2">
                            <div
                              className="h-8 w-8 border-2 border-amber-400/50 bg-white/10"
                              style={{ borderRadius: `${tokens.borderRadius ?? 0}px` }}
                            />
                            <span className="text-sm font-mono text-white">{tokens.borderRadius ?? 0}px</span>
                          </div>
                        </div>
                        <div className="rounded-lg bg-white/5 p-3">
                          <span className="text-[10px] text-gray-500">الظل (Shadow Level)</span>
                          <p className="mt-1 text-sm font-medium text-white">{tokens.shadowLevel || '-'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {!tokensMutation.isPending && !tokensMutation.isError && !tokensMutation.isSuccess && (
                  <EmptyState message="ادخل بيانات تحليل الصورة لاستخراج رموز التصميم" />
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}
