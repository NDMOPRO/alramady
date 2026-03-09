'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Paintbrush, BarChart3, PieChart, Activity, Table2, Gauge,
  History, Copy, Save, Database, Plus, Trash2, Loader2,
  CheckCircle2, XCircle, ChevronLeft, Layers, GitBranch,
  Settings2, Sparkles, Target, TrendingUp, ScatterChart,
  LayoutGrid, Hash,
} from 'lucide-react';
import {
  dashboardEngine,
  DashboardItem,
  WidgetItem,
  VersionEntry,
} from '@/lib/api/dashboard-engine.api';

/* ═══════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════ */

const CHART_TYPES = [
  { value: 'BAR_CHART', label: 'عمودي', labelEn: 'Bar Chart', icon: BarChart3 },
  { value: 'LINE_CHART', label: 'خطي', labelEn: 'Line Chart', icon: TrendingUp },
  { value: 'PIE_CHART', label: 'دائري', labelEn: 'Pie Chart', icon: PieChart },
  { value: 'DONUT_CHART', label: 'حلقي', labelEn: 'Donut Chart', icon: Target },
  { value: 'AREA_CHART', label: 'مساحي', labelEn: 'Area Chart', icon: Activity },
  { value: 'SCATTER_PLOT', label: 'نقطي', labelEn: 'Scatter Plot', icon: ScatterChart },
  { value: 'TABLE', label: 'جدول', labelEn: 'Table', icon: Table2 },
  { value: 'KPI_CARD', label: 'بطاقة KPI', labelEn: 'KPI Card', icon: Hash },
  { value: 'GAUGE', label: 'مقياس', labelEn: 'Gauge', icon: Gauge },
] as const;

const AGGREGATIONS = [
  { value: 'SUM', label: 'المجموع', labelEn: 'Sum' },
  { value: 'AVG', label: 'المتوسط', labelEn: 'Average' },
  { value: 'COUNT', label: 'العدد', labelEn: 'Count' },
  { value: 'MIN', label: 'الأدنى', labelEn: 'Minimum' },
  { value: 'MAX', label: 'الأعلى', labelEn: 'Maximum' },
] as const;

const TABS = [
  { id: 'elements', label: 'تعديل العناصر', labelEn: 'Element Editing', icon: Settings2 },
  { id: 'versions', label: 'سجل الإصدارات', labelEn: 'Version History', icon: History },
  { id: 'clone', label: 'نسخ وحالة', labelEn: 'Clone & State', icon: Copy },
  { id: 'binding', label: 'ربط البيانات', labelEn: 'Data Binding', icon: Database },
] as const;

type TabId = typeof TABS[number]['id'];

/* ═══════════════════════════════════════════════════════════════
   Notification Component
   ═══════════════════════════════════════════════════════════════ */

interface Notification {
  id: number;
  type: 'success' | 'error';
  message: string;
}

function NotificationBanner({ notifications }: { notifications: Notification[] }) {
  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-xl backdrop-blur-md transition-all duration-500 animate-slide-up ${
            n.type === 'success'
              ? 'border border-emerald-200/50 bg-emerald-50/90 text-emerald-800'
              : 'border border-red-200/50 bg-red-50/90 text-red-800'
          }`}
        >
          {n.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          {n.message}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Page Component
   ═══════════════════════════════════════════════════════════════ */

export default function PostEditPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('elements');
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Form state — Element Editing
  const [selectedWidgetId, setSelectedWidgetId] = useState('');
  const [selectedChartType, setSelectedChartType] = useState('BAR_CHART');
  const [selectedAggregation, setSelectedAggregation] = useState('SUM');

  // Form state — Version History
  const [versionDashboardId, setVersionDashboardId] = useState('');

  // Form state — Clone & State
  const [cloneDashboardId, setCloneDashboardId] = useState('');
  const [stateDashboardId, setStateDashboardId] = useState('');
  const [filtersJson, setFiltersJson] = useState('{\n  \n}');

  // Form state — Data Binding
  const [rebindDashboardId, setRebindDashboardId] = useState('');
  const [newDatasetId, setNewDatasetId] = useState('');
  const [addElDashboardId, setAddElDashboardId] = useState('');
  const [addElType, setAddElType] = useState('BAR_CHART');
  const [addElConfigJson, setAddElConfigJson] = useState('{}');
  const [addElPositionJson, setAddElPositionJson] = useState('{ "x": 0, "y": 0, "w": 4, "h": 3 }');
  const [deleteElDashboardId, setDeleteElDashboardId] = useState('');
  const [deleteElWidgetId, setDeleteElWidgetId] = useState('');

  /* ── Notifications helper ── */
  const notify = useCallback((type: 'success' | 'error', message: string) => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  }, []);

  /* ══════════════════════════════════════════════════════════
     Queries
     ══════════════════════════════════════════════════════════ */

  const {
    data: postEditRes,
    isLoading: loadingPostEdit,
    error: postEditError,
  } = useQuery({
    queryKey: ['post-edit-list'],
    queryFn: () => dashboardEngine.postEditList(),
  });

  const {
    data: dashboardsRes,
    isLoading: loadingDashboards,
  } = useQuery({
    queryKey: ['dashboards-list'],
    queryFn: () => dashboardEngine.listDashboards(),
  });

  const {
    data: versionsRes,
    isLoading: loadingVersions,
    error: versionsError,
  } = useQuery({
    queryKey: ['version-history', versionDashboardId],
    queryFn: () => dashboardEngine.getVersionHistory(versionDashboardId),
    enabled: !!versionDashboardId,
  });

  const postEditEntries = postEditRes?.data ?? [];
  const dashboards: DashboardItem[] = dashboardsRes?.data ?? [];
  const versions: VersionEntry[] = versionsRes?.data ?? [];

  /* ══════════════════════════════════════════════════════════
     Mutations
     ══════════════════════════════════════════════════════════ */

  const changeChartTypeMut = useMutation({
    mutationFn: () => dashboardEngine.changeChartType(selectedWidgetId, selectedChartType),
    onSuccess: () => {
      notify('success', 'تم تغيير نوع المخطط بنجاح');
      queryClient.invalidateQueries({ queryKey: ['post-edit-list'] });
    },
    onError: (err: Error) => notify('error', err.message),
  });

  const changeAggregationMut = useMutation({
    mutationFn: () => dashboardEngine.changeAggregation(selectedWidgetId, selectedAggregation),
    onSuccess: () => {
      notify('success', 'تم تغيير التجميع بنجاح');
      queryClient.invalidateQueries({ queryKey: ['post-edit-list'] });
    },
    onError: (err: Error) => notify('error', err.message),
  });

  const cloneMut = useMutation({
    mutationFn: () => dashboardEngine.cloneDashboard(cloneDashboardId),
    onSuccess: () => {
      notify('success', 'تم نسخ اللوحة بنجاح');
      queryClient.invalidateQueries({ queryKey: ['dashboards-list'] });
    },
    onError: (err: Error) => notify('error', err.message),
  });

  const saveStateMut = useMutation({
    mutationFn: () => {
      const filters = JSON.parse(filtersJson) as Record<string, unknown>;
      return dashboardEngine.saveState(stateDashboardId, filters);
    },
    onSuccess: () => notify('success', 'تم حفظ الحالة بنجاح'),
    onError: (err: Error) => notify('error', err.message),
  });

  const rebindMut = useMutation({
    mutationFn: () => dashboardEngine.rebindDashboardData(rebindDashboardId, newDatasetId),
    onSuccess: (res) => {
      notify('success', `تم إعادة الربط - ${res.data.updatedCount} عنصر محدث`);
      queryClient.invalidateQueries({ queryKey: ['post-edit-list'] });
    },
    onError: (err: Error) => notify('error', err.message),
  });

  const addElementMut = useMutation({
    mutationFn: () => {
      const config = JSON.parse(addElConfigJson) as Record<string, unknown>;
      const position = JSON.parse(addElPositionJson) as Record<string, unknown>;
      return dashboardEngine.addElement(addElDashboardId, addElType, config, position);
    },
    onSuccess: () => {
      notify('success', 'تم إضافة العنصر بنجاح');
      queryClient.invalidateQueries({ queryKey: ['post-edit-list'] });
    },
    onError: (err: Error) => notify('error', err.message),
  });

  const deleteElementMut = useMutation({
    mutationFn: () => dashboardEngine.deleteElement(deleteElDashboardId, deleteElWidgetId),
    onSuccess: () => {
      notify('success', 'تم حذف العنصر بنجاح');
      queryClient.invalidateQueries({ queryKey: ['post-edit-list'] });
    },
    onError: (err: Error) => notify('error', err.message),
  });

  /* ══════════════════════════════════════════════════════════
     Derived Stats
     ══════════════════════════════════════════════════════════ */

  const stats = [
    {
      label: 'عناصر ما بعد التحرير',
      labelEn: 'Post-Edit Entries',
      value: Array.isArray(postEditEntries) ? postEditEntries.length : postEditRes?.total ?? 0,
      icon: Paintbrush,
      gradient: 'from-fuchsia-500 to-pink-600',
      bgLight: 'bg-fuchsia-50',
    },
    {
      label: 'اللوحات المتاحة',
      labelEn: 'Available Dashboards',
      value: dashboards.length,
      icon: LayoutGrid,
      gradient: 'from-violet-500 to-purple-600',
      bgLight: 'bg-violet-50',
    },
    {
      label: 'الإصدارات المحفوظة',
      labelEn: 'Saved Versions',
      value: versions.length,
      icon: GitBranch,
      gradient: 'from-blue-500 to-cyan-600',
      bgLight: 'bg-blue-50',
    },
    {
      label: 'أنواع المخططات',
      labelEn: 'Chart Types',
      value: CHART_TYPES.length,
      icon: BarChart3,
      gradient: 'from-amber-500 to-orange-600',
      bgLight: 'bg-amber-50',
    },
  ];

  const isLoading = loadingPostEdit || loadingDashboards;

  /* ══════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen space-y-8 pb-16" dir="rtl">
      <NotificationBanner notifications={notifications} />

      {/* ── Breadcrumb ── */}
      <nav className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/dashboard" className="transition-colors hover:text-fuchsia-600">
          محرك لوحة المعلومات
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180" />
        <span className="font-medium text-gray-700">ما بعد التحرير</span>
      </nav>

      {/* ── Hero Header ── */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-fuchsia-600 via-pink-600 to-rose-600 px-8 py-10">
        <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-pink-300/20 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-40 w-40 rounded-full bg-fuchsia-300/15 blur-2xl" />

        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
              <Paintbrush className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">
                ما بعد التحرير
              </h1>
              <p className="mt-1 text-lg font-medium text-white/70">
                Post-Edit Dashboard Tools
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-md transition-all hover:bg-white/20"
            >
              <Layers className="h-4 w-4" />
              العودة للمحرك
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats Row ── */}
      <section className="grid grid-cols-2 gap-5 lg:grid-cols-4">
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
                <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${stat.bgLight}`}>
                  <Icon className="h-5 w-5 text-gray-600" />
                </div>
                {isLoading ? (
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

      {/* ── Tab Bar with Animated Indicator ── */}
      <section className="relative">
        <div className="flex gap-1 rounded-2xl border border-gray-100/80 bg-white/70 p-1.5 shadow-sm backdrop-blur-xl">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all duration-300 ${
                  isActive
                    ? 'bg-gradient-to-l from-fuchsia-600 to-pink-600 text-white shadow-lg shadow-fuchsia-500/25'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="hidden text-[10px] font-medium opacity-70 lg:inline">
                  {tab.labelEn}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Error State ── */}
      {postEditError && (
        <div className="rounded-2xl border border-red-100 bg-red-50/80 p-6 text-center backdrop-blur-xl">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <p className="text-sm font-semibold text-red-700">
            حدث خطأ في تحميل البيانات
          </p>
          <p className="mt-1 text-xs text-red-500">{(postEditError as Error).message}</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
         TAB 1: Element Editing
         ══════════════════════════════════════════════════════ */}
      {activeTab === 'elements' && (
        <section className="space-y-6">
          <div className="rounded-2xl border border-white/20 bg-white/70 p-8 shadow-sm backdrop-blur-xl">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-50">
                <Settings2 className="h-5 w-5 text-fuchsia-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">تعديل العناصر</h2>
                <p className="text-xs text-gray-400">Element Editing</p>
              </div>
            </div>

            {/* Widget ID Input */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                معرف العنصر <span className="text-xs text-gray-400">Widget ID</span>
              </label>
              <input
                type="text"
                value={selectedWidgetId}
                onChange={(e) => setSelectedWidgetId(e.target.value)}
                placeholder="أدخل معرف العنصر..."
                className="w-full rounded-xl border border-gray-200/60 bg-white/60 px-4 py-3 text-sm text-gray-800 backdrop-blur-md transition-all placeholder:text-gray-400 focus:border-fuchsia-300 focus:outline-none focus:ring-2 focus:ring-fuchsia-200"
              />
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              {/* Change Chart Type */}
              <div className="rounded-2xl border border-gray-100/60 bg-white/50 p-6 backdrop-blur-md">
                <h3 className="mb-4 text-sm font-bold text-gray-800">
                  تغيير نوع المخطط <span className="text-xs text-gray-400">Change Chart Type</span>
                </h3>
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {CHART_TYPES.map((ct) => {
                    const Icon = ct.icon;
                    const isSelected = selectedChartType === ct.value;
                    return (
                      <button
                        key={ct.value}
                        onClick={() => setSelectedChartType(ct.value)}
                        className={`flex flex-col items-center gap-1.5 rounded-xl p-3 text-xs font-medium transition-all duration-200 ${
                          isSelected
                            ? 'border-2 border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700 shadow-md shadow-fuchsia-200/40'
                            : 'border border-gray-100 bg-white/80 text-gray-500 hover:border-fuchsia-200 hover:bg-fuchsia-50/50'
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${isSelected ? 'text-fuchsia-600' : 'text-gray-400'}`} />
                        <span>{ct.label}</span>
                        <span className="text-[9px] text-gray-400">{ct.labelEn}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => changeChartTypeMut.mutate()}
                  disabled={!selectedWidgetId || changeChartTypeMut.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-fuchsia-600 to-pink-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {changeChartTypeMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  تطبيق نوع المخطط
                </button>
              </div>

              {/* Change Aggregation */}
              <div className="rounded-2xl border border-gray-100/60 bg-white/50 p-6 backdrop-blur-md">
                <h3 className="mb-4 text-sm font-bold text-gray-800">
                  تغيير التجميع <span className="text-xs text-gray-400">Change Aggregation</span>
                </h3>
                <div className="mb-4 space-y-2">
                  {AGGREGATIONS.map((agg) => {
                    const isSelected = selectedAggregation === agg.value;
                    return (
                      <button
                        key={agg.value}
                        onClick={() => setSelectedAggregation(agg.value)}
                        className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                          isSelected
                            ? 'border-2 border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700 shadow-md shadow-fuchsia-200/40'
                            : 'border border-gray-100 bg-white/80 text-gray-600 hover:border-fuchsia-200 hover:bg-fuchsia-50/50'
                        }`}
                      >
                        <span>{agg.label}</span>
                        <span className="text-xs text-gray-400">{agg.labelEn}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => changeAggregationMut.mutate()}
                  disabled={!selectedWidgetId || changeAggregationMut.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-fuchsia-600 to-pink-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {changeAggregationMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4" />
                  )}
                  تطبيق التجميع
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
         TAB 2: Version History
         ══════════════════════════════════════════════════════ */}
      {activeTab === 'versions' && (
        <section className="space-y-6">
          <div className="rounded-2xl border border-white/20 bg-white/70 p-8 shadow-sm backdrop-blur-xl">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                <History className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">سجل الإصدارات</h2>
                <p className="text-xs text-gray-400">Version History</p>
              </div>
            </div>

            {/* Dashboard Selector */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                اختر اللوحة <span className="text-xs text-gray-400">Select Dashboard</span>
              </label>
              <select
                value={versionDashboardId}
                onChange={(e) => setVersionDashboardId(e.target.value)}
                className="w-full rounded-xl border border-gray-200/60 bg-white/60 px-4 py-3 text-sm text-gray-800 backdrop-blur-md transition-all focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">-- اختر لوحة --</option>
                {dashboards.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Version Timeline */}
            {!versionDashboardId ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
                  <GitBranch className="h-8 w-8 text-blue-300" />
                </div>
                <p className="text-sm font-semibold text-gray-500">اختر لوحة لعرض الإصدارات</p>
                <p className="mt-1 text-xs text-gray-400">Select a dashboard to view versions</p>
              </div>
            ) : loadingVersions ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            ) : versionsError ? (
              <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center text-sm text-red-600">
                {(versionsError as Error).message}
              </div>
            ) : versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50">
                  <History className="h-8 w-8 text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-500">لا توجد إصدارات محفوظة</p>
                <p className="mt-1 text-xs text-gray-400">No saved versions yet</p>
              </div>
            ) : (
              <div className="relative pr-8">
                {/* Timeline line */}
                <div className="absolute right-3 top-0 h-full w-0.5 bg-gradient-to-b from-fuchsia-400 via-blue-400 to-purple-400" />

                <div className="space-y-6">
                  {versions.map((version, idx) => (
                    <div key={version.id} className="relative flex items-start gap-5">
                      {/* Timeline dot */}
                      <div
                        className={`absolute right-0 top-2 flex h-6 w-6 items-center justify-center rounded-full shadow-md ${
                          idx === 0
                            ? 'bg-gradient-to-br from-fuchsia-500 to-pink-500'
                            : 'bg-gradient-to-br from-blue-400 to-purple-400'
                        }`}
                      >
                        <div className="h-2 w-2 rounded-full bg-white" />
                      </div>

                      {/* Version Card */}
                      <div className="mr-10 flex-1 rounded-2xl border border-gray-100/60 bg-white/60 p-5 backdrop-blur-md transition-all duration-300 hover:border-fuchsia-200 hover:shadow-md">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="rounded-lg bg-gradient-to-l from-fuchsia-50 to-pink-50 px-3 py-1 text-xs font-bold text-fuchsia-600">
                              v{versions.length - idx}
                            </span>
                            <p className="mt-2 text-xs text-gray-500">
                              {new Date(version.savedAt).toLocaleDateString('ar-SA', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              notify('success', `تم استعادة الإصدار v${versions.length - idx}`);
                            }}
                            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 transition-all hover:bg-blue-100 hover:shadow-sm"
                          >
                            استعادة
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-gray-400">
                          ID: {version.id}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
         TAB 3: Clone & State
         ══════════════════════════════════════════════════════ */}
      {activeTab === 'clone' && (
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Clone Dashboard */}
          <div className="rounded-2xl border border-white/20 bg-white/70 p-8 shadow-sm backdrop-blur-xl">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                <Copy className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">نسخ اللوحة</h2>
                <p className="text-xs text-gray-400">Clone Dashboard</p>
              </div>
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                اختر اللوحة للنسخ <span className="text-xs text-gray-400">Select Dashboard</span>
              </label>
              <select
                value={cloneDashboardId}
                onChange={(e) => setCloneDashboardId(e.target.value)}
                className="w-full rounded-xl border border-gray-200/60 bg-white/60 px-4 py-3 text-sm text-gray-800 backdrop-blur-md transition-all focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
              >
                <option value="">-- اختر لوحة --</option>
                {dashboards.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => cloneMut.mutate()}
              disabled={!cloneDashboardId || cloneMut.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-violet-600 to-purple-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cloneMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              نسخ اللوحة
            </button>
          </div>

          {/* Save State */}
          <div className="rounded-2xl border border-white/20 bg-white/70 p-8 shadow-sm backdrop-blur-xl">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                <Save className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">حفظ الحالة</h2>
                <p className="text-xs text-gray-400">Save State</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                اللوحة <span className="text-xs text-gray-400">Dashboard</span>
              </label>
              <select
                value={stateDashboardId}
                onChange={(e) => setStateDashboardId(e.target.value)}
                className="w-full rounded-xl border border-gray-200/60 bg-white/60 px-4 py-3 text-sm text-gray-800 backdrop-blur-md transition-all focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <option value="">-- اختر لوحة --</option>
                {dashboards.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                الفلاتر (JSON) <span className="text-xs text-gray-400">Filters JSON</span>
              </label>
              <textarea
                value={filtersJson}
                onChange={(e) => setFiltersJson(e.target.value)}
                rows={5}
                dir="ltr"
                className="w-full rounded-xl border border-gray-200/60 bg-white/60 px-4 py-3 font-mono text-sm text-gray-800 backdrop-blur-md transition-all placeholder:text-gray-400 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <button
              onClick={() => saveStateMut.mutate()}
              disabled={!stateDashboardId || saveStateMut.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveStateMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              حفظ الحالة
            </button>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
         TAB 4: Data Binding
         ══════════════════════════════════════════════════════ */}
      {activeTab === 'binding' && (
        <section className="space-y-6">
          {/* Rebind Data */}
          <div className="rounded-2xl border border-white/20 bg-white/70 p-8 shadow-sm backdrop-blur-xl">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
                <Database className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">إعادة ربط البيانات</h2>
                <p className="text-xs text-gray-400">Rebind Dashboard Data</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  اللوحة <span className="text-xs text-gray-400">Dashboard</span>
                </label>
                <select
                  value={rebindDashboardId}
                  onChange={(e) => setRebindDashboardId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200/60 bg-white/60 px-4 py-3 text-sm text-gray-800 backdrop-blur-md transition-all focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                >
                  <option value="">-- اختر لوحة --</option>
                  {dashboards.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  معرف مصدر البيانات الجديد <span className="text-xs text-gray-400">New Dataset ID</span>
                </label>
                <input
                  type="text"
                  value={newDatasetId}
                  onChange={(e) => setNewDatasetId(e.target.value)}
                  placeholder="dataset-id..."
                  className="w-full rounded-xl border border-gray-200/60 bg-white/60 px-4 py-3 text-sm text-gray-800 backdrop-blur-md transition-all placeholder:text-gray-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
              </div>
            </div>

            <button
              onClick={() => rebindMut.mutate()}
              disabled={!rebindDashboardId || !newDatasetId || rebindMut.isPending}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-orange-600 to-amber-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rebindMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              إعادة الربط
            </button>
          </div>

          {/* Add / Delete Elements */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Add Element */}
            <div className="rounded-2xl border border-white/20 bg-white/70 p-8 shadow-sm backdrop-blur-xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
                  <Plus className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">إضافة عنصر</h2>
                  <p className="text-xs text-gray-400">Add Element</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  اللوحة <span className="text-xs text-gray-400">Dashboard</span>
                </label>
                <select
                  value={addElDashboardId}
                  onChange={(e) => setAddElDashboardId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200/60 bg-white/60 px-4 py-3 text-sm text-gray-800 backdrop-blur-md transition-all focus:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-200"
                >
                  <option value="">-- اختر لوحة --</option>
                  {dashboards.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  نوع العنصر <span className="text-xs text-gray-400">Element Type</span>
                </label>
                <select
                  value={addElType}
                  onChange={(e) => setAddElType(e.target.value)}
                  className="w-full rounded-xl border border-gray-200/60 bg-white/60 px-4 py-3 text-sm text-gray-800 backdrop-blur-md transition-all focus:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-200"
                >
                  {CHART_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>
                      {ct.label} - {ct.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  إعدادات العنصر (JSON) <span className="text-xs text-gray-400">Config</span>
                </label>
                <textarea
                  value={addElConfigJson}
                  onChange={(e) => setAddElConfigJson(e.target.value)}
                  rows={3}
                  dir="ltr"
                  className="w-full rounded-xl border border-gray-200/60 bg-white/60 px-4 py-3 font-mono text-sm text-gray-800 backdrop-blur-md transition-all focus:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-200"
                />
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  الموضع (JSON) <span className="text-xs text-gray-400">Position</span>
                </label>
                <textarea
                  value={addElPositionJson}
                  onChange={(e) => setAddElPositionJson(e.target.value)}
                  rows={2}
                  dir="ltr"
                  className="w-full rounded-xl border border-gray-200/60 bg-white/60 px-4 py-3 font-mono text-sm text-gray-800 backdrop-blur-md transition-all focus:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-200"
                />
              </div>

              <button
                onClick={() => addElementMut.mutate()}
                disabled={!addElDashboardId || addElementMut.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-green-600 to-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-green-500/25 transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addElementMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                إضافة العنصر
              </button>
            </div>

            {/* Delete Element */}
            <div className="rounded-2xl border border-white/20 bg-white/70 p-8 shadow-sm backdrop-blur-xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">حذف عنصر</h2>
                  <p className="text-xs text-gray-400">Delete Element</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  اللوحة <span className="text-xs text-gray-400">Dashboard</span>
                </label>
                <select
                  value={deleteElDashboardId}
                  onChange={(e) => setDeleteElDashboardId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200/60 bg-white/60 px-4 py-3 text-sm text-gray-800 backdrop-blur-md transition-all focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200"
                >
                  <option value="">-- اختر لوحة --</option>
                  {dashboards.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  معرف العنصر <span className="text-xs text-gray-400">Widget ID</span>
                </label>
                <input
                  type="text"
                  value={deleteElWidgetId}
                  onChange={(e) => setDeleteElWidgetId(e.target.value)}
                  placeholder="أدخل معرف العنصر..."
                  className="w-full rounded-xl border border-gray-200/60 bg-white/60 px-4 py-3 text-sm text-gray-800 backdrop-blur-md transition-all placeholder:text-gray-400 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200"
                />
              </div>

              <button
                onClick={() => deleteElementMut.mutate()}
                disabled={!deleteElDashboardId || !deleteElWidgetId || deleteElementMut.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-red-600 to-rose-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteElementMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                حذف العنصر
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Custom animation styles ── */}
      {/* Animations are defined in globals.css and tailwind.config.ts */}
    </div>
  );
}
