'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { dashboardEngine } from '@/lib/api/dashboard-engine.api';
import {
  Gauge, Zap, Database, Layers, Package, Play, Plus, Trash2,
  Loader2, CheckCircle, XCircle, AlertTriangle, Timer, Server,
  BarChart3, Activity, ArrowUpLeft, RefreshCw, Search, Clock,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface SemanticMetric {
  name: string;
  aggregation: string;
  column: string;
}

interface PerformanceMetrics {
  metrics: SemanticMetric[];
}

interface BatchOperationInput {
  dashboardId: string;
  type: string;
}

interface BatchResultItem {
  type: string;
  dashboardId: string;
  success: boolean;
  error?: string;
}

interface BatchResult {
  total: number;
  processed: number;
  results: BatchResultItem[];
}

/* ═══════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════ */

export default function PerformanceOptimizationPage() {
  /* ── Local state for form inputs ── */
  const [semanticDashboardId, setSemanticDashboardId] = useState('');
  const [precomputeDashboardId, setPrecomputeDashboardId] = useState('');
  const [optimizedDashboardId, setOptimizedDashboardId] = useState('');
  const [batchOperations, setBatchOperations] = useState<BatchOperationInput[]>([]);
  const [newBatchDashboardId, setNewBatchDashboardId] = useState('');
  const [newBatchType, setNewBatchType] = useState('aggregate');

  /* ── Triggers for on-demand queries ── */
  const [semanticEnabled, setSemanticEnabled] = useState(false);
  const [optimizedEnabled, setOptimizedEnabled] = useState(false);

  /* ── Performance list query ── */
  const {
    data: performanceRes,
    isLoading: loadingPerformance,
  } = useQuery({
    queryKey: ['performance-list'],
    queryFn: () => dashboardEngine.performanceList(),
  });

  const performanceEntries = performanceRes?.data ?? [];

  /* ── Semantic layer query (on-demand) ── */
  const {
    data: semanticRes,
    isLoading: loadingSemantic,
    isError: semanticError,
    error: semanticErrorObj,
    refetch: refetchSemantic,
  } = useQuery({
    queryKey: ['semantic-layer', semanticDashboardId],
    queryFn: () => dashboardEngine.getSemanticLayer(semanticDashboardId),
    enabled: semanticEnabled && semanticDashboardId.trim().length > 0,
  });

  const semanticMetrics: SemanticMetric[] =
    (semanticRes?.data as PerformanceMetrics)?.metrics ?? semanticRes?.data?.metrics ?? [];

  /* ── Optimized data query (on-demand) ── */
  const {
    data: optimizedRes,
    isLoading: loadingOptimized,
    isError: optimizedError,
    error: optimizedErrorObj,
    refetch: refetchOptimized,
  } = useQuery({
    queryKey: ['optimized-data', optimizedDashboardId],
    queryFn: () => dashboardEngine.getOptimizedData(optimizedDashboardId),
    enabled: optimizedEnabled && optimizedDashboardId.trim().length > 0,
  });

  const optimizedData = optimizedRes?.data ?? null;

  /* ── Precompute mutation ── */
  const precomputeMutation = useMutation({
    mutationFn: (dashboardId: string) => dashboardEngine.precomputeAggregations(dashboardId),
  });

  /* ── Batch process mutation ── */
  const batchMutation = useMutation({
    mutationFn: (operations: BatchOperationInput[]) => dashboardEngine.batchProcess(operations),
  });

  const batchResult: BatchResult | null = batchMutation.data?.data ?? null;

  /* ── Handlers ── */
  const handleSemanticFetch = () => {
    if (!semanticDashboardId.trim()) return;
    setSemanticEnabled(true);
    setTimeout(() => refetchSemantic(), 0);
  };

  const handleOptimizedFetch = () => {
    if (!optimizedDashboardId.trim()) return;
    setOptimizedEnabled(true);
    setTimeout(() => refetchOptimized(), 0);
  };

  const handlePrecompute = () => {
    if (!precomputeDashboardId.trim()) return;
    precomputeMutation.mutate(precomputeDashboardId);
  };

  const addBatchOperation = () => {
    if (!newBatchDashboardId.trim()) return;
    setBatchOperations((prev) => [
      ...prev,
      { dashboardId: newBatchDashboardId.trim(), type: newBatchType },
    ]);
    setNewBatchDashboardId('');
  };

  const removeBatchOperation = (index: number) => {
    setBatchOperations((prev) => prev.filter((_, i) => i !== index));
  };

  const handleBatchSubmit = () => {
    if (batchOperations.length === 0) return;
    batchMutation.mutate(batchOperations);
  };

  /* ── Stats calculations ── */
  const entriesCount = performanceEntries.length;
  const cachedQueries = Array.isArray(performanceEntries)
    ? performanceEntries.filter((e: Record<string, unknown>) => e.cached === true).length
    : 0;
  const precomputedCount = Array.isArray(performanceEntries)
    ? performanceEntries.filter((e: Record<string, unknown>) => e.precomputed === true).length
    : 0;

  const stats = [
    {
      label: 'إجمالي السجلات',
      labelEn: 'Total Entries',
      value: entriesCount,
      icon: Database,
      gradient: 'from-emerald-500 to-green-600',
      bgLight: 'bg-emerald-50',
    },
    {
      label: 'استعلامات مخزنة',
      labelEn: 'Cached Queries',
      value: cachedQueries,
      icon: Zap,
      gradient: 'from-amber-500 to-yellow-600',
      bgLight: 'bg-amber-50',
    },
    {
      label: 'محسوبة مسبقاً',
      labelEn: 'Precomputed',
      value: precomputedCount,
      icon: Server,
      gradient: 'from-blue-500 to-indigo-600',
      bgLight: 'bg-blue-50',
    },
  ];

  /* ═══════════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen space-y-8 pb-16">
      {/* ── Hero Header ── */}
      <section className="animate-fade-in relative overflow-hidden rounded-2xl bg-gradient-to-bl from-emerald-500 via-green-600 to-green-700 px-8 py-10">
        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-40 w-40 rounded-full bg-lime-400/15 blur-2xl" />
        {/* Gauge decorative ring */}
        <div className="pointer-events-none absolute right-12 top-6 h-32 w-32 rounded-full border-4 border-white/10" />
        <div className="pointer-events-none absolute right-16 top-10 h-24 w-24 rounded-full border-2 border-dashed border-white/5" />

        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
              <Gauge className="h-8 w-8 text-white" />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm text-white/60">
                <Link href="/dashboard" className="hover:text-white/90 transition-colors">
                  محرك لوحة المعلومات
                </Link>
                <span>/</span>
                <span className="text-white/80">الأداء والتحسين</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">
                الأداء والتحسين
              </h1>
              <p className="mt-1 text-lg font-medium text-white/70">
                Performance & Optimization
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white/80 backdrop-blur-md">
              <Activity className="h-4 w-4" />
              <span>{entriesCount} سجل أداء</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stat Cards ── */}
      <section
        className="animate-fade-in grid grid-cols-1 gap-5 sm:grid-cols-3"
        style={{ animationDelay: '100ms' }}
      >
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.labelEn}
              className="group relative overflow-hidden rounded-2xl bg-white p-[1px] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <div
                className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${stat.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
              />
              <div className="relative rounded-2xl bg-white p-6">
                <div
                  className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${stat.bgLight}`}
                >
                  <Icon className="h-5 w-5 text-gray-600" />
                </div>
                {loadingPerformance ? (
                  <Loader2 className="mt-2 h-7 w-7 animate-spin text-gray-300" />
                ) : (
                  <p className="text-3xl font-extrabold text-gray-900">{stat.value}</p>
                )}
                <p className="mt-1 text-sm font-semibold text-gray-700">{stat.label}</p>
                <p className="text-xs text-gray-400">{stat.labelEn}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Feature Panels Grid ── */}
      <section
        className="animate-fade-in grid grid-cols-1 gap-6 lg:grid-cols-2"
        style={{ animationDelay: '200ms' }}
      >
        {/* ═══ Panel A: Semantic Layer ═══ */}
        <div className="overflow-hidden rounded-2xl border border-gray-100/80 bg-white/70 shadow-sm backdrop-blur-xl">
          {/* Panel header */}
          <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-md">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">الطبقة الدلالية</h3>
              <p className="text-xs text-gray-400">Semantic Layer</p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {/* Input */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="معرف اللوحة (Dashboard ID)..."
                  value={semanticDashboardId}
                  onChange={(e) => {
                    setSemanticDashboardId(e.target.value);
                    setSemanticEnabled(false);
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2.5 pr-10 pl-4 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <button
                onClick={handleSemanticFetch}
                disabled={!semanticDashboardId.trim() || loadingSemantic}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-l from-emerald-500 to-green-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-600/25 transition-all hover:shadow-lg hover:shadow-emerald-600/35 disabled:opacity-50 disabled:shadow-none"
              >
                {loadingSemantic ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Layers className="h-4 w-4" />
                )}
                جلب
              </button>
            </div>

            {/* Error state */}
            {semanticError && (
              <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/60 p-4">
                <XCircle className="h-5 w-5 shrink-0 text-red-500" />
                <p className="text-sm text-red-600">
                  {(semanticErrorObj as Error)?.message ?? 'حدث خطأ أثناء جلب الطبقة الدلالية'}
                </p>
              </div>
            )}

            {/* Loading */}
            {loadingSemantic && (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                <p className="mt-3 text-sm text-gray-400">جاري تحليل الطبقة الدلالية...</p>
              </div>
            )}

            {/* Results */}
            {!loadingSemantic && semanticMetrics.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  المقاييس ({semanticMetrics.length})
                </p>
                <div className="grid gap-2">
                  {semanticMetrics.map((metric, idx) => (
                    <div
                      key={`${metric.name}-${idx}`}
                      className="group flex items-center justify-between rounded-xl border border-gray-100 bg-gradient-to-l from-gray-50/50 to-white p-3.5 transition-all duration-200 hover:border-emerald-200 hover:shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
                          <BarChart3 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800">{metric.name}</p>
                          <p className="text-xs text-gray-400">{metric.column}</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                        {metric.aggregation}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {semanticEnabled && !loadingSemantic && !semanticError && semanticMetrics.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                  <Layers className="h-7 w-7 text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-500">لا توجد مقاييس</p>
                <p className="mt-1 text-xs text-gray-400">No metrics found for this dashboard</p>
              </div>
            )}

            {/* Idle state */}
            {!semanticEnabled && !loadingSemantic && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
                  <Layers className="h-7 w-7 text-emerald-300" />
                </div>
                <p className="text-sm text-gray-400">ادخل معرف اللوحة واضغط جلب</p>
                <p className="mt-1 text-xs text-gray-300">Enter dashboard ID and fetch</p>
              </div>
            )}
          </div>
        </div>

        {/* ═══ Panel B: Precompute Aggregations ═══ */}
        <div className="overflow-hidden rounded-2xl border border-gray-100/80 bg-white/70 shadow-sm backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md">
              <Timer className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">الحساب المسبق</h3>
              <p className="text-xs text-gray-400">Precompute Aggregations</p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="معرف اللوحة (Dashboard ID)..."
                  value={precomputeDashboardId}
                  onChange={(e) => setPrecomputeDashboardId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2.5 pr-10 pl-4 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <button
                onClick={handlePrecompute}
                disabled={!precomputeDashboardId.trim() || precomputeMutation.isPending}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-l from-blue-500 to-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition-all hover:shadow-lg hover:shadow-blue-600/35 disabled:opacity-50 disabled:shadow-none"
              >
                {precomputeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                تنفيذ
              </button>
            </div>

            {/* Precompute error */}
            {precomputeMutation.isError && (
              <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/60 p-4">
                <XCircle className="h-5 w-5 shrink-0 text-red-500" />
                <p className="text-sm text-red-600">
                  {(precomputeMutation.error as Error)?.message ?? 'حدث خطأ أثناء الحساب المسبق'}
                </p>
              </div>
            )}

            {/* Precompute loading */}
            {precomputeMutation.isPending && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full border-4 border-blue-100" />
                  <div className="absolute inset-0 h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-blue-500" />
                  <Server className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-blue-500" />
                </div>
                <p className="mt-4 text-sm text-gray-400">جاري حساب التجميعات...</p>
                <p className="text-xs text-gray-300">Computing aggregations...</p>
              </div>
            )}

            {/* Precompute success */}
            {precomputeMutation.isSuccess && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-green-100 bg-green-50/60 p-4">
                  <CheckCircle className="h-5 w-5 shrink-0 text-green-500" />
                  <div>
                    <p className="text-sm font-bold text-green-700">تم الحساب المسبق بنجاح</p>
                    <p className="text-xs text-green-500">Precomputation completed successfully</p>
                  </div>
                </div>
                {precomputeMutation.data?.data && (
                  <div className="rounded-xl border border-blue-100 bg-gradient-to-l from-blue-50/50 to-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                          <Server className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800">نتيجة الحساب المسبق</p>
                          <p className="text-xs text-gray-400">Precompute Result</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700">
                        {typeof precomputeMutation.data.data === 'object'
                          ? JSON.stringify(precomputeMutation.data.data)
                          : String(precomputeMutation.data.data)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Idle state */}
            {!precomputeMutation.isPending &&
              !precomputeMutation.isSuccess &&
              !precomputeMutation.isError && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                    <Timer className="h-7 w-7 text-blue-300" />
                  </div>
                  <p className="text-sm text-gray-400">ادخل معرف اللوحة واضغط تنفيذ</p>
                  <p className="mt-1 text-xs text-gray-300">
                    Enter dashboard ID and execute precomputation
                  </p>
                </div>
              )}
          </div>
        </div>

        {/* ═══ Panel C: Optimized Data ═══ */}
        <div className="overflow-hidden rounded-2xl border border-gray-100/80 bg-white/70 shadow-sm backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-md">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">البيانات المحسنة</h3>
              <p className="text-xs text-gray-400">Optimized Data</p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="معرف اللوحة (Dashboard ID)..."
                  value={optimizedDashboardId}
                  onChange={(e) => {
                    setOptimizedDashboardId(e.target.value);
                    setOptimizedEnabled(false);
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2.5 pr-10 pl-4 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
                />
              </div>
              <button
                onClick={handleOptimizedFetch}
                disabled={!optimizedDashboardId.trim() || loadingOptimized}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-l from-amber-500 to-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-amber-600/25 transition-all hover:shadow-lg hover:shadow-amber-600/35 disabled:opacity-50 disabled:shadow-none"
              >
                {loadingOptimized ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                جلب
              </button>
            </div>

            {/* Error */}
            {optimizedError && (
              <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/60 p-4">
                <XCircle className="h-5 w-5 shrink-0 text-red-500" />
                <p className="text-sm text-red-600">
                  {(optimizedErrorObj as Error)?.message ?? 'حدث خطأ أثناء جلب البيانات المحسنة'}
                </p>
              </div>
            )}

            {/* Loading */}
            {loadingOptimized && (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                <p className="mt-3 text-sm text-gray-400">جاري جلب البيانات المحسنة...</p>
              </div>
            )}

            {/* Results */}
            {!loadingOptimized && optimizedData && (
              <div className="space-y-3">
                {/* Cached status indicator */}
                <div className="flex items-center gap-4">
                  <div
                    className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold ${
                      optimizedData.cached
                        ? 'bg-green-50 text-green-600'
                        : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        optimizedData.cached ? 'bg-green-500 animate-pulse' : 'bg-amber-500'
                      }`}
                    />
                    {optimizedData.cached ? 'مخزنة مؤقتاً (Cached)' : 'غير مخزنة (Not Cached)'}
                  </div>
                  {optimizedData.rowCount !== undefined && (
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                      {optimizedData.rowCount} صف
                    </span>
                  )}
                </div>

                {/* Data preview table */}
                {(optimizedData as any).rows && Array.isArray((optimizedData as any).rows) && (optimizedData as any).rows.length > 0 && (
                  <div className="overflow-hidden rounded-xl border border-gray-100">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gradient-to-l from-gray-50/80 to-white">
                            {Object.keys((optimizedData as any).rows[0]).map((key) => (
                              <th
                                key={key}
                                className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wider text-gray-500"
                              >
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(optimizedData as any).rows.slice(0, 10).map(
                            (row: Record<string, unknown>, idx: number) => (
                              <tr
                                key={idx}
                                className={`border-b border-gray-50 transition-colors hover:bg-amber-50/30 ${
                                  idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                                }`}
                              >
                                {Object.values(row).map((val, vIdx) => (
                                  <td key={vIdx} className="px-4 py-2.5 text-gray-600">
                                    {val !== null && val !== undefined ? String(val) : '-'}
                                  </td>
                                ))}
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Data preview when rows is not array - show raw */}
                {(optimizedData as any).rows === undefined && optimizedData.data && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                    <pre className="overflow-x-auto text-xs text-gray-600 leading-relaxed" dir="ltr">
                      {JSON.stringify(optimizedData.data, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Fallback raw display */}
                {!(optimizedData as any).rows && !optimizedData.data && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                    <pre className="overflow-x-auto text-xs text-gray-600 leading-relaxed" dir="ltr">
                      {JSON.stringify(optimizedData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Empty */}
            {optimizedEnabled && !loadingOptimized && !optimizedError && !optimizedData && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                  <Zap className="h-7 w-7 text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-500">لا توجد بيانات محسنة</p>
                <p className="mt-1 text-xs text-gray-400">No optimized data found</p>
              </div>
            )}

            {/* Idle */}
            {!optimizedEnabled && !loadingOptimized && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
                  <Zap className="h-7 w-7 text-amber-300" />
                </div>
                <p className="text-sm text-gray-400">ادخل معرف اللوحة واضغط جلب</p>
                <p className="mt-1 text-xs text-gray-300">Enter dashboard ID and fetch</p>
              </div>
            )}
          </div>
        </div>

        {/* ═══ Panel D: Batch Processing ═══ */}
        <div className="overflow-hidden rounded-2xl border border-gray-100/80 bg-white/70 shadow-sm backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-md">
              <Package className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">المعالجة الدفعية</h3>
              <p className="text-xs text-gray-400">Batch Processing</p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {/* Add operation form */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="معرف اللوحة (Dashboard ID)..."
                  value={newBatchDashboardId}
                  onChange={(e) => setNewBatchDashboardId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2.5 pr-10 pl-4 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-purple-400 focus:bg-white focus:ring-2 focus:ring-purple-100"
                />
              </div>
              <select
                value={newBatchType}
                onChange={(e) => setNewBatchType(e.target.value)}
                className="rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5 text-sm text-gray-700 outline-none transition-all focus:border-purple-400 focus:bg-white focus:ring-2 focus:ring-purple-100"
              >
                <option value="aggregate">تجميع (Aggregate)</option>
                <option value="optimize">تحسين (Optimize)</option>
                <option value="cache">تخزين (Cache)</option>
                <option value="precompute">حساب مسبق (Precompute)</option>
              </select>
              <button
                onClick={addBatchOperation}
                disabled={!newBatchDashboardId.trim()}
                className="flex items-center gap-1 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm font-bold text-purple-600 transition-all hover:bg-purple-100 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                اضف
              </button>
            </div>

            {/* Operations queue */}
            {batchOperations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  طابور العمليات ({batchOperations.length})
                </p>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/30 p-3">
                  {batchOperations.map((op, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-3 transition-all duration-200 hover:border-purple-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-xs font-bold text-purple-600">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-700">{op.dashboardId}</p>
                          <p className="text-xs text-gray-400">{op.type}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeBatchOperation(idx)}
                        className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submit batch */}
            <button
              onClick={handleBatchSubmit}
              disabled={batchOperations.length === 0 || batchMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-purple-500 to-violet-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-purple-600/25 transition-all hover:shadow-lg hover:shadow-purple-600/35 disabled:opacity-50 disabled:shadow-none"
            >
              {batchMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري المعالجة...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  تنفيذ المعالجة الدفعية ({batchOperations.length} عمليات)
                </>
              )}
            </button>

            {/* Batch error */}
            {batchMutation.isError && (
              <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/60 p-4">
                <XCircle className="h-5 w-5 shrink-0 text-red-500" />
                <p className="text-sm text-red-600">
                  {(batchMutation.error as Error)?.message ?? 'حدث خطأ أثناء المعالجة الدفعية'}
                </p>
              </div>
            )}

            {/* Batch loading progress */}
            {batchMutation.isPending && (
              <div className="space-y-3">
                <div className="h-2 overflow-hidden rounded-full bg-purple-100">
                  <div className="h-full animate-pulse rounded-full bg-gradient-to-l from-purple-500 to-violet-600" style={{ width: '60%' }} />
                </div>
                <p className="text-center text-xs text-gray-400">جاري معالجة العمليات...</p>
              </div>
            )}

            {/* Batch results */}
            {batchResult && (
              <div className="space-y-3">
                {/* Summary */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 rounded-full bg-purple-50 px-4 py-1.5 text-xs font-bold text-purple-600">
                    <Package className="h-3.5 w-3.5" />
                    الإجمالي: {batchResult.total}
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-green-50 px-4 py-1.5 text-xs font-bold text-green-600">
                    <CheckCircle className="h-3.5 w-3.5" />
                    تمت المعالجة: {batchResult.processed}
                  </div>
                </div>

                {/* Individual results */}
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/30 p-3">
                  {batchResult.results.map((result, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between rounded-lg border p-3 transition-all ${
                        result.success
                          ? 'border-green-100 bg-green-50/40'
                          : 'border-red-100 bg-red-50/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {result.success ? (
                          <CheckCircle className="h-5 w-5 shrink-0 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 shrink-0 text-red-500" />
                        )}
                        <div>
                          <p className="text-sm font-semibold text-gray-700">
                            {result.dashboardId}
                          </p>
                          <p className="text-xs text-gray-400">{result.type}</p>
                        </div>
                      </div>
                      {result.success ? (
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-600">
                          نجح
                        </span>
                      ) : (
                        <span
                          className="max-w-[200px] truncate rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600"
                          title={result.error}
                        >
                          {result.error ?? 'فشل'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Idle - no operations */}
            {batchOperations.length === 0 && !batchResult && !batchMutation.isPending && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50">
                  <Package className="h-7 w-7 text-purple-300" />
                </div>
                <p className="text-sm text-gray-400">اضف عمليات للطابور ثم نفذها دفعة واحدة</p>
                <p className="mt-1 text-xs text-gray-300">Add operations to queue, then execute</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Performance Entries Table ── */}
      <section className="animate-fade-in" style={{ animationDelay: '300ms' }}>
        <div className="overflow-hidden rounded-2xl border border-gray-100/80 bg-white/80 shadow-sm backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-7 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                <Activity className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">سجلات الأداء</h2>
                <p className="text-xs text-gray-400">Performance Entries</p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">
              {entriesCount} سجل
            </span>
          </div>

          {loadingPerformance ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                <p className="text-sm text-gray-400">جاري تحميل السجلات...</p>
              </div>
            </div>
          ) : performanceEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
                <Gauge className="h-8 w-8 text-emerald-300" />
              </div>
              <p className="text-base font-semibold text-gray-500">لا توجد سجلات أداء</p>
              <p className="mt-1 text-sm text-gray-400">No performance entries yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-7 py-3.5 text-start text-xs font-bold uppercase tracking-wider text-gray-500">
                      المعرف
                    </th>
                    <th className="px-7 py-3.5 text-start text-xs font-bold uppercase tracking-wider text-gray-500">
                      اللوحة
                    </th>
                    <th className="px-7 py-3.5 text-start text-xs font-bold uppercase tracking-wider text-gray-500">
                      الحالة
                    </th>
                    <th className="px-7 py-3.5 text-start text-xs font-bold uppercase tracking-wider text-gray-500">
                      التاريخ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {performanceEntries.slice(0, 20).map(
                    (entry: Record<string, unknown>, idx: number) => (
                      <tr
                        key={String(entry.id ?? idx)}
                        className={`border-b border-gray-50 transition-colors hover:bg-emerald-50/30 ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                        }`}
                      >
                        <td className="px-7 py-4 font-mono text-xs text-gray-500">
                          {String(entry.id ?? '-')}
                        </td>
                        <td className="px-7 py-4">
                          <p className="font-bold text-gray-900">
                            {String(entry.dashboardId ?? entry.name ?? '-')}
                          </p>
                        </td>
                        <td className="px-7 py-4">
                          {entry.cached ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-600">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                              مخزن
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-600">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                              غير مخزن
                            </span>
                          )}
                        </td>
                        <td className="px-7 py-4 text-gray-500 text-xs">
                          {entry.createdAt
                            ? new Date(String(entry.createdAt)).toLocaleDateString('ar-SA', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : entry.updatedAt
                            ? new Date(String(entry.updatedAt)).toLocaleDateString('ar-SA', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '-'}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
