'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  BarChart3,
  PieChart,
  TrendingUp,
  Table2,
  Layers,
  Map,
  Gauge,
  Type,
  Activity,
  Circle,
  Settings2,
  Maximize2,
  Eye,
  Share2,
  Save,
  Plus,
  GripVertical,
  Trash2,
  ChevronLeft,
  LayoutDashboard,
  Palette,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Sparkles,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { dashboardEngine, type ApiList } from '@/lib/api/dashboard-engine.api';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type WidgetType =
  | 'BAR_CHART'
  | 'LINE_CHART'
  | 'PIE_CHART'
  | 'DONUT_CHART'
  | 'AREA_CHART'
  | 'TABLE'
  | 'KPI_CARD'
  | 'MAP'
  | 'GAUGE'
  | 'TEXT';

interface WidgetDefinition {
  type: WidgetType;
  labelAr: string;
  labelEn: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  iconColor: string;
}

interface CanvasWidget {
  id: string;
  type: WidgetType;
  title: string;
  titleEn: string;
  colSpan: number;
  rowSpan: number;
  dataSource: string;
}

// ═══════════════════════════════════════════════════════════════
// Widget Definitions
// ═══════════════════════════════════════════════════════════════

const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  {
    type: 'BAR_CHART',
    labelAr: 'رسم عمودي',
    labelEn: 'Bar Chart',
    icon: BarChart3,
    gradient: 'from-blue-500 to-cyan-400',
    iconColor: 'text-blue-100',
  },
  {
    type: 'LINE_CHART',
    labelAr: 'رسم خطي',
    labelEn: 'Line Chart',
    icon: TrendingUp,
    gradient: 'from-emerald-500 to-teal-400',
    iconColor: 'text-emerald-100',
  },
  {
    type: 'PIE_CHART',
    labelAr: 'رسم دائري',
    labelEn: 'Pie Chart',
    icon: PieChart,
    gradient: 'from-violet-500 to-purple-400',
    iconColor: 'text-violet-100',
  },
  {
    type: 'DONUT_CHART',
    labelAr: 'رسم حلقي',
    labelEn: 'Donut Chart',
    icon: Circle,
    gradient: 'from-pink-500 to-rose-400',
    iconColor: 'text-pink-100',
  },
  {
    type: 'AREA_CHART',
    labelAr: 'رسم مساحي',
    labelEn: 'Area Chart',
    icon: Activity,
    gradient: 'from-orange-500 to-amber-400',
    iconColor: 'text-orange-100',
  },
  {
    type: 'TABLE',
    labelAr: 'جدول بيانات',
    labelEn: 'Table',
    icon: Table2,
    gradient: 'from-slate-600 to-gray-500',
    iconColor: 'text-slate-100',
  },
  {
    type: 'KPI_CARD',
    labelAr: 'بطاقة مؤشر',
    labelEn: 'KPI Card',
    icon: Layers,
    gradient: 'from-indigo-500 to-blue-400',
    iconColor: 'text-indigo-100',
  },
  {
    type: 'MAP',
    labelAr: 'خريطة',
    labelEn: 'Map',
    icon: Map,
    gradient: 'from-cyan-500 to-sky-400',
    iconColor: 'text-cyan-100',
  },
  {
    type: 'GAUGE',
    labelAr: 'عداد',
    labelEn: 'Gauge',
    icon: Gauge,
    gradient: 'from-red-500 to-orange-400',
    iconColor: 'text-red-100',
  },
  {
    type: 'TEXT',
    labelAr: 'نص توضيحي',
    labelEn: 'Text',
    icon: Type,
    gradient: 'from-gray-500 to-zinc-400',
    iconColor: 'text-gray-100',
  },
];

const DEFAULT_WIDGETS: CanvasWidget[] = [
  { id: 'w-1', type: 'BAR_CHART', title: 'المبيعات الشهرية', titleEn: 'Monthly Sales', colSpan: 2, rowSpan: 1, dataSource: 'sales_2024' },
  { id: 'w-2', type: 'PIE_CHART', title: 'توزيع الاقسام', titleEn: 'Department Distribution', colSpan: 1, rowSpan: 1, dataSource: 'employees' },
  { id: 'w-3', type: 'KPI_CARD', title: 'اجمالي الايرادات', titleEn: 'Total Revenue', colSpan: 1, rowSpan: 1, dataSource: 'transactions' },
  { id: 'w-4', type: 'LINE_CHART', title: 'اتجاه النمو', titleEn: 'Growth Trend', colSpan: 2, rowSpan: 1, dataSource: 'sales_2024' },
  { id: 'w-5', type: 'TABLE', title: 'احدث المعاملات', titleEn: 'Recent Transactions', colSpan: 2, rowSpan: 1, dataSource: 'transactions' },
];

const DATA_SOURCES = ['sales_2024', 'employees', 'transactions', 'inventory', 'customers'];

// ═══════════════════════════════════════════════════════════════
// Query Client
// ═══════════════════════════════════════════════════════════════

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

// ═══════════════════════════════════════════════════════════════
// Inner Page Component
// ═══════════════════════════════════════════════════════════════

function AdvancedModeInner() {
  const [widgets, setWidgets] = useState<CanvasWidget[]>(DEFAULT_WIDGETS);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(true);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);

  // ── React Query ──
  const {
    data: advancedData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ApiList<Record<string, unknown>>>({
    queryKey: ['dashboard', 'advanced-list'],
    queryFn: () => dashboardEngine.advancedList(),
  });

  const selectedWidget = useMemo(
    () => widgets.find((w) => w.id === selectedWidgetId) ?? null,
    [widgets, selectedWidgetId],
  );

  const selectedDef = useMemo(
    () => (selectedWidget ? WIDGET_DEFINITIONS.find((d) => d.type === selectedWidget.type) : null),
    [selectedWidget],
  );

  // ── Handlers ──
  const handleAddWidget = useCallback(
    (type: WidgetType) => {
      const def = WIDGET_DEFINITIONS.find((d) => d.type === type);
      if (!def) return;
      const newWidget: CanvasWidget = {
        id: `w-${Date.now()}`,
        type,
        title: def.labelAr,
        titleEn: def.labelEn,
        colSpan: type === 'KPI_CARD' || type === 'GAUGE' || type === 'TEXT' ? 1 : 2,
        rowSpan: 1,
        dataSource: DATA_SOURCES[0],
      };
      setWidgets((prev) => [...prev, newWidget]);
      setSelectedWidgetId(newWidget.id);
      setConfigOpen(true);
    },
    [],
  );

  const handleDeleteWidget = useCallback(
    (id: string) => {
      setWidgets((prev) => prev.filter((w) => w.id !== id));
      if (selectedWidgetId === id) {
        setSelectedWidgetId(null);
      }
    },
    [selectedWidgetId],
  );

  const handleUpdateWidget = useCallback(
    (id: string, updates: Partial<CanvasWidget>) => {
      setWidgets((prev) =>
        prev.map((w) => (w.id === id ? { ...w, ...updates } : w)),
      );
    },
    [],
  );

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50/30">
      {/* ── Gradient Hero Header ── */}
      <div className="bg-gradient-to-l from-indigo-600 to-blue-600 px-6 py-6 shadow-xl shadow-indigo-500/20">
        <div className="mx-auto max-w-[1600px]">
          {/* Breadcrumb */}
          <nav className="mb-3 flex items-center gap-2 text-sm text-indigo-200">
            <Link
              href="/dashboard"
              className="flex items-center gap-1 transition-colors hover:text-white"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>محرك لوحة المعلومات</span>
            </Link>
            <ChevronLeft className="h-3 w-3 opacity-50" />
            <span className="font-medium text-white">الوضع المتقدم</span>
          </nav>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                منشئ اللوحات المتقدم
              </h1>
              <p className="mt-0.5 text-sm text-indigo-200">
                Advanced Dashboard Builder
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => refetch()}
                className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20"
              >
                <RefreshCw className="h-4 w-4" />
                <span>تحديث</span>
              </button>
              <button className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20">
                <Eye className="h-4 w-4" />
                <span>معاينة</span>
              </button>
              <button className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20">
                <Share2 className="h-4 w-4" />
                <span>مشاركة</span>
              </button>
              <button className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-indigo-700 shadow-lg shadow-black/10 transition-all hover:bg-indigo-50 hover:shadow-xl">
                <Save className="h-4 w-4" />
                <span>حفظ ونشر</span>
              </button>
            </div>
          </div>

          {/* Stats Row */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { value: widgets.length, label: 'ادوات في اللوحة', labelEn: 'Widgets' },
              { value: DATA_SOURCES.length, label: 'مصادر بيانات', labelEn: 'Data Sources' },
              { value: WIDGET_DEFINITIONS.length, label: 'انواع متاحة', labelEn: 'Widget Types' },
              { value: advancedData?.total ?? '...', label: 'سجلات', labelEn: 'Records' },
            ].map((stat) => (
              <div
                key={stat.labelEn}
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm"
              >
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-indigo-200">
                  {stat.label}{' '}
                  <span className="opacity-60">/ {stat.labelEn}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        {/* Loading State */}
        {isLoading && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-indigo-100 bg-white/70 px-6 py-4 shadow-sm backdrop-blur-sm">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">جاري تحميل البيانات...</p>
              <p className="text-xs text-gray-500">Loading advanced dashboard data</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/80 px-6 py-4 shadow-sm backdrop-blur-sm">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">حدث خطا في تحميل البيانات</p>
              <p className="text-xs text-red-600">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
            <button
              onClick={() => refetch()}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
            >
              اعادة المحاولة
            </button>
          </div>
        )}

        <div className="flex gap-6">
          {/* ════════════════════════════════════════════════════════ */}
          {/* Widget Palette Sidebar */}
          {/* ════════════════════════════════════════════════════════ */}
          <aside
            className={`shrink-0 transition-all duration-300 ${
              paletteCollapsed ? 'w-14' : 'w-72'
            }`}
          >
            <div className="sticky top-6 space-y-4">
              {/* Toggle Button */}
              <button
                onClick={() => setPaletteCollapsed(!paletteCollapsed)}
                className="flex w-full items-center justify-center rounded-xl border border-white/60 bg-white/60 p-2 text-gray-500 shadow-sm backdrop-blur-md transition-all hover:bg-white hover:shadow-md"
              >
                <Palette className="h-4 w-4" />
                {!paletteCollapsed && (
                  <span className="mr-2 text-xs font-medium">لوحة الادوات</span>
                )}
              </button>

              {!paletteCollapsed && (
                <>
                  {/* Widget Palette */}
                  <div className="rounded-2xl border border-white/60 bg-white/60 p-4 shadow-lg shadow-black/5 backdrop-blur-xl">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">اضافة اداة</h3>
                        <p className="text-[10px] text-gray-400">Add Widget</p>
                      </div>
                      <Sparkles className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div className="space-y-1.5">
                      {WIDGET_DEFINITIONS.map((def) => {
                        const Icon = def.icon;
                        return (
                          <button
                            key={def.type}
                            onClick={() => handleAddWidget(def.type)}
                            className="group flex w-full items-center gap-3 rounded-xl border border-transparent bg-white/50 p-2.5 transition-all duration-200 hover:border-indigo-200/50 hover:bg-white hover:shadow-md hover:shadow-indigo-500/5"
                          >
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${def.gradient} shadow-sm transition-transform duration-200 group-hover:scale-110`}
                            >
                              <Icon className={`h-4 w-4 ${def.iconColor}`} />
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-semibold text-gray-800">
                                {def.labelAr}
                              </p>
                              <p className="text-[10px] text-gray-400">
                                {def.labelEn}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Data Sources */}
                  <div className="rounded-2xl border border-white/60 bg-white/60 p-4 shadow-lg shadow-black/5 backdrop-blur-xl">
                    <div className="mb-3">
                      <h3 className="text-sm font-bold text-gray-900">مصادر البيانات</h3>
                      <p className="text-[10px] text-gray-400">Data Sources</p>
                    </div>
                    <div className="space-y-1">
                      {DATA_SOURCES.map((ds) => (
                        <div
                          key={ds}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/80"
                        >
                          <div className="h-2 w-2 rounded-full bg-gradient-to-r from-emerald-400 to-green-500" />
                          <span className="font-mono text-xs text-gray-600">{ds}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </aside>

          {/* ════════════════════════════════════════════════════════ */}
          {/* Canvas Grid Area */}
          {/* ════════════════════════════════════════════════════════ */}
          <main className="min-w-0 flex-1">
            <div
              className="relative min-h-[600px] rounded-2xl border-2 border-dashed border-gray-200/70 bg-white/40 p-5 shadow-inner backdrop-blur-sm"
              style={{
                backgroundImage:
                  'radial-gradient(circle, rgba(99,102,241,0.08) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            >
              {/* Canvas Header */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-400 shadow-sm shadow-green-400/50" />
                  <span className="text-xs font-medium text-gray-500">
                    منطقة التصميم{' '}
                    <span className="text-gray-400">/ Canvas Area</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                  <span>{widgets.length} ادوات</span>
                  <span className="opacity-40">|</span>
                  <span>شبكة 4 اعمدة</span>
                </div>
              </div>

              {/* Widgets Grid */}
              {widgets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-blue-100">
                    <Plus className="h-7 w-7 text-indigo-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">
                    لا توجد ادوات بعد
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    اختر اداة من اللوحة الجانبية لاضافتها
                  </p>
                  <p className="text-[10px] text-gray-300">
                    Select a widget from the sidebar to get started
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-4">
                  {widgets.map((widget) => {
                    const def = WIDGET_DEFINITIONS.find(
                      (d) => d.type === widget.type,
                    );
                    const Icon = def?.icon ?? BarChart3;
                    const isSelected = selectedWidgetId === widget.id;

                    return (
                      <div
                        key={widget.id}
                        onClick={() => {
                          setSelectedWidgetId(widget.id);
                          setConfigOpen(true);
                        }}
                        className={`group relative cursor-pointer rounded-2xl border bg-white/80 p-4 backdrop-blur-sm transition-all duration-200 ${
                          widget.colSpan === 2 ? 'col-span-2' : 'col-span-1'
                        } ${
                          isSelected
                            ? 'ring-2 ring-purple-400/50 shadow-lg shadow-purple-500/20 border-purple-300/50'
                            : 'border-white/60 shadow-md shadow-black/5 hover:shadow-lg hover:shadow-indigo-500/10 hover:border-indigo-200/50'
                        }`}
                      >
                        {/* Widget Header */}
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-3 w-3 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900">
                                {widget.title}
                              </h4>
                              <p className="text-[10px] text-gray-400">
                                {widget.titleEn}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedWidgetId(widget.id);
                                setConfigOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                            >
                              <Maximize2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteWidget(widget.id);
                              }}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Widget Body Placeholder */}
                        <div className="flex items-center justify-center rounded-xl bg-gradient-to-br from-gray-50 to-slate-50 p-8">
                          <div
                            className={`flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${
                              def?.gradient ?? 'from-gray-400 to-gray-500'
                            } shadow-lg`}
                          >
                            <Icon
                              className={`h-7 w-7 ${def?.iconColor ?? 'text-white'}`}
                            />
                          </div>
                        </div>

                        {/* Widget Footer */}
                        <div className="mt-3 flex items-center justify-between">
                          <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-500">
                            {widget.dataSource}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {def?.labelAr}
                          </span>
                        </div>

                        {/* Selected Glow */}
                        {isSelected && (
                          <div className="absolute -inset-[1px] -z-10 rounded-2xl bg-gradient-to-r from-purple-400/20 via-indigo-400/20 to-blue-400/20 blur-sm" />
                        )}
                      </div>
                    );
                  })}

                  {/* Add Widget Placeholder */}
                  <button
                    onClick={() => handleAddWidget('BAR_CHART')}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200/60 p-8 text-gray-400 transition-all duration-200 hover:border-indigo-300 hover:bg-indigo-50/30 hover:text-indigo-500"
                  >
                    <Plus className="h-6 w-6" />
                    <span className="text-xs font-medium">اضافة اداة</span>
                    <span className="text-[10px] opacity-60">Add Widget</span>
                  </button>
                </div>
              )}
            </div>
          </main>

          {/* ════════════════════════════════════════════════════════ */}
          {/* Config Panel for Selected Widget */}
          {/* ════════════════════════════════════════════════════════ */}
          {configOpen && selectedWidget && selectedDef && (
            <aside className="w-80 shrink-0">
              <div className="sticky top-6 rounded-2xl border border-white/60 bg-white/60 shadow-xl shadow-black/5 backdrop-blur-xl">
                {/* Config Header */}
                <div className="flex items-center justify-between border-b border-gray-100/80 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-indigo-500" />
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">اعدادات الاداة</h3>
                      <p className="text-[10px] text-gray-400">Widget Config</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setConfigOpen(false)}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Config Body */}
                <div className="space-y-5 p-5">
                  {/* Widget Type Preview */}
                  <div className="flex items-center gap-3 rounded-xl bg-gradient-to-l from-indigo-50 to-blue-50 p-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${selectedDef.gradient} shadow-md`}
                    >
                      {(() => {
                        const Icon = selectedDef.icon;
                        return <Icon className={`h-5 w-5 ${selectedDef.iconColor}`} />;
                      })()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {selectedDef.labelAr}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {selectedDef.labelEn}
                      </p>
                    </div>
                  </div>

                  {/* Title Field */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                      العنوان <span className="text-gray-400 font-normal">/ Title</span>
                    </label>
                    <input
                      type="text"
                      value={selectedWidget.title}
                      onChange={(e) =>
                        handleUpdateWidget(selectedWidget.id, {
                          title: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-gray-200/80 bg-white/80 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm backdrop-blur-sm transition-all focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  {/* English Title Field */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                      العنوان الانجليزي{' '}
                      <span className="text-gray-400 font-normal">/ English Title</span>
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={selectedWidget.titleEn}
                      onChange={(e) =>
                        handleUpdateWidget(selectedWidget.id, {
                          titleEn: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-gray-200/80 bg-white/80 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm backdrop-blur-sm transition-all focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  {/* Widget Type Selector */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                      نوع الاداة{' '}
                      <span className="text-gray-400 font-normal">/ Widget Type</span>
                    </label>
                    <select
                      value={selectedWidget.type}
                      onChange={(e) =>
                        handleUpdateWidget(selectedWidget.id, {
                          type: e.target.value as WidgetType,
                        })
                      }
                      className="w-full rounded-xl border border-gray-200/80 bg-white/80 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm backdrop-blur-sm transition-all focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      {WIDGET_DEFINITIONS.map((d) => (
                        <option key={d.type} value={d.type}>
                          {d.labelAr} - {d.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Data Source Selector */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                      مصدر البيانات{' '}
                      <span className="text-gray-400 font-normal">/ Data Source</span>
                    </label>
                    <select
                      value={selectedWidget.dataSource}
                      onChange={(e) =>
                        handleUpdateWidget(selectedWidget.id, {
                          dataSource: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-gray-200/80 bg-white/80 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm backdrop-blur-sm transition-all focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      {DATA_SOURCES.map((ds) => (
                        <option key={ds} value={ds}>
                          {ds}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Column Span */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                      عرض الاداة{' '}
                      <span className="text-gray-400 font-normal">/ Column Span</span>
                    </label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4].map((span) => (
                        <button
                          key={span}
                          onClick={() =>
                            handleUpdateWidget(selectedWidget.id, {
                              colSpan: span,
                            })
                          }
                          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                            selectedWidget.colSpan === span
                              ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md shadow-indigo-500/25'
                              : 'border border-gray-200/80 bg-white/60 text-gray-600 hover:border-indigo-200 hover:bg-indigo-50/50'
                          }`}
                        >
                          {span}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Row Span */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                      ارتفاع الاداة{' '}
                      <span className="text-gray-400 font-normal">/ Row Span</span>
                    </label>
                    <div className="flex gap-2">
                      {[1, 2, 3].map((span) => (
                        <button
                          key={span}
                          onClick={() =>
                            handleUpdateWidget(selectedWidget.id, {
                              rowSpan: span,
                            })
                          }
                          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                            selectedWidget.rowSpan === span
                              ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md shadow-indigo-500/25'
                              : 'border border-gray-200/80 bg-white/60 text-gray-600 hover:border-indigo-200 hover:bg-indigo-50/50'
                          }`}
                        >
                          {span}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="border-t border-gray-100/80 pt-4">
                    <button
                      onClick={() => handleDeleteWidget(selectedWidget.id)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200/60 bg-red-50/50 py-2.5 text-sm font-medium text-red-600 transition-all hover:bg-red-100/60 hover:shadow-sm"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>حذف الاداة</span>
                      <span className="text-red-400">/ Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Page Export (with QueryClientProvider)
// ═══════════════════════════════════════════════════════════════

export default function AdvancedModeDashboardPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdvancedModeInner />
    </QueryClientProvider>
  );
}
