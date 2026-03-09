'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardEngine } from '@/lib/api/dashboard-engine.api';
import type { ShareLink } from '@/lib/api/dashboard-engine.api';
import {
  Layout, BarChart3, PieChart, TrendingUp, Table, Hash,
  Plus, Save, Eye, Undo, Redo, Trash2, Copy, Settings,
  GripVertical, Layers, Type, Image, Filter, Download,
  Share2, FileText, Maximize2, Minimize2, ZoomIn, ZoomOut,
  ChevronDown, X, Check, Code2, Link2, Clipboard, Loader2,
  AlertCircle, Gauge, Map, Activity, Calendar, Sparkles,
  Palette, Move, RefreshCw, ArrowRight, ExternalLink,
  PanelRightOpen, PanelLeftOpen, FileBarChart,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface EditorWidget {
  id: string;
  type: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  column?: string;
  datasetId?: string;
  aggregation?: string;
  formulas?: Array<{ expression: string; resultColumn: string }>;
}

interface HistoryEntry {
  widgets: EditorWidget[];
  label: string;
}

type ExportFormat = 'PDF' | 'PNG' | 'SVG' | 'XLSX';

// ═══════════════════════════════════════════════════════════════
// Widget Library Definitions
// ═══════════════════════════════════════════════════════════════

const WIDGET_CATEGORIES = [
  {
    label: 'الرسوم البيانية',
    labelEn: 'Charts',
    items: [
      { type: 'chart-bar', label: 'رسم عمودي', labelEn: 'Bar Chart', icon: BarChart3 },
      { type: 'chart-pie', label: 'رسم دائري', labelEn: 'Pie Chart', icon: PieChart },
      { type: 'chart-line', label: 'رسم خطي', labelEn: 'Line Chart', icon: TrendingUp },
      { type: 'chart-area', label: 'رسم مساحي', labelEn: 'Area Chart', icon: Activity },
    ],
  },
  {
    label: 'المؤشرات',
    labelEn: 'KPIs & Metrics',
    items: [
      { type: 'kpi', label: 'مؤشر أداء', labelEn: 'KPI Card', icon: Hash },
      { type: 'gauge', label: 'عداد دائري', labelEn: 'Gauge', icon: Gauge },
      { type: 'sparkline', label: 'خط مصغر', labelEn: 'Sparkline', icon: Sparkles },
    ],
  },
  {
    label: 'البيانات',
    labelEn: 'Data',
    items: [
      { type: 'table', label: 'جدول بيانات', labelEn: 'Data Table', icon: Table },
      { type: 'map', label: 'خريطة', labelEn: 'Map', icon: Map },
      { type: 'calendar', label: 'تقويم', labelEn: 'Calendar', icon: Calendar },
    ],
  },
  {
    label: 'العناصر',
    labelEn: 'Elements',
    items: [
      { type: 'text', label: 'نص حر', labelEn: 'Text Block', icon: Type },
      { type: 'image', label: 'صورة', labelEn: 'Image', icon: Image },
      { type: 'filter', label: 'فلتر تفاعلي', labelEn: 'Filter', icon: Filter },
    ],
  },
];

const ALL_WIDGETS = WIDGET_CATEGORIES.flatMap((c) => c.items);

const DEFAULT_WIDGETS: EditorWidget[] = [
  { id: 'w1', type: 'kpi', title: 'اجمالي المبيعات', x: 0, y: 0, w: 1, h: 1, column: 'sales', aggregation: 'sum' },
  { id: 'w2', type: 'kpi', title: 'عدد العملاء', x: 1, y: 0, w: 1, h: 1, column: 'customers', aggregation: 'count' },
  { id: 'w3', type: 'kpi', title: 'نسبة النمو', x: 2, y: 0, w: 1, h: 1, column: 'growth', aggregation: 'avg' },
  { id: 'w4', type: 'kpi', title: 'الطلبات الجديدة', x: 3, y: 0, w: 1, h: 1, column: 'orders', aggregation: 'count' },
  { id: 'w5', type: 'chart-bar', title: 'المبيعات الشهرية', x: 0, y: 1, w: 2, h: 2, column: 'monthly_sales', aggregation: 'sum' },
  { id: 'w6', type: 'chart-pie', title: 'التوزيع حسب المنتج', x: 2, y: 1, w: 2, h: 2, column: 'product', aggregation: 'count' },
  { id: 'w7', type: 'table', title: 'آخر المعاملات', x: 0, y: 3, w: 4, h: 1, column: 'transactions', aggregation: 'none' },
];

const EXPORT_FORMATS: { format: ExportFormat; label: string; icon: typeof FileText }[] = [
  { format: 'PDF', label: 'تصدير PDF', icon: FileText },
  { format: 'PNG', label: 'تصدير PNG', icon: Image },
  { format: 'SVG', label: 'تصدير SVG', icon: Palette },
  { format: 'XLSX', label: 'تصدير Excel', icon: Table },
];

const AGGREGATION_OPTIONS = [
  { value: 'sum', label: 'مجموع', labelEn: 'Sum' },
  { value: 'avg', label: 'متوسط', labelEn: 'Average' },
  { value: 'count', label: 'عدد', labelEn: 'Count' },
  { value: 'min', label: 'أدنى', labelEn: 'Min' },
  { value: 'max', label: 'أعلى', labelEn: 'Max' },
  { value: 'none', label: 'بدون', labelEn: 'None' },
];

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function DashboardEditorPage() {
  const queryClient = useQueryClient();

  // ----- State -----
  const [widgets, setWidgets] = useState<EditorWidget[]>(DEFAULT_WIDGETS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [activeDashboardId] = useState('demo-dashboard-001');

  // Modals
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareHours, setShareHours] = useState(24);

  // Formula editor
  const [formulaExpression, setFormulaExpression] = useState('');
  const [formulaResultCol, setFormulaResultCol] = useState('');

  // Rebind editor
  const [rebindColumn, setRebindColumn] = useState('');
  const [rebindDatasetId, setRebindDatasetId] = useState('');
  const [rebindAggregation, setRebindAggregation] = useState('sum');

  // Resize editor
  const [resizeW, setResizeW] = useState(1);
  const [resizeH, setResizeH] = useState(1);

  // History (Undo/Redo)
  const [history, setHistory] = useState<HistoryEntry[]>([{ widgets: DEFAULT_WIDGETS, label: 'Initial' }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // ----- Derived -----
  const selectedWidget = useMemo(() => widgets.find((w) => w.id === selectedId) ?? null, [widgets, selectedId]);

  // ----- History helpers -----
  const pushHistory = useCallback(
    (newWidgets: EditorWidget[], label: string) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({ widgets: newWidgets, label });
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setWidgets(newWidgets);
    },
    [history, historyIndex],
  );

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setWidgets(history[newIndex].widgets);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setWidgets(history[newIndex].widgets);
    }
  }, [history, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // ═══════════════════════════════════════════════════════════════
  // React Query - Data Fetching
  // ═══════════════════════════════════════════════════════════════

  const editorListQuery = useQuery({
    queryKey: ['editor-sessions'],
    queryFn: () => dashboardEngine.editorList(),
    staleTime: 30_000,
  });

  // ═══════════════════════════════════════════════════════════════
  // React Query - Mutations
  // ═══════════════════════════════════════════════════════════════

  const resizeMutation = useMutation({
    mutationFn: ({ widgetId, newSize }: { widgetId: string; newSize: { w: number; h: number } }) =>
      dashboardEngine.resizeElement(widgetId, activeDashboardId, newSize),
    onSuccess: (_data, vars) => {
      const updated = widgets.map((w) =>
        w.id === vars.widgetId ? { ...w, w: vars.newSize.w, h: vars.newSize.h } : w,
      );
      pushHistory(updated, 'تغيير الحجم');
      queryClient.invalidateQueries({ queryKey: ['editor-sessions'] });
    },
  });

  const shareMutation = useMutation({
    mutationFn: (expiresHours: number) =>
      dashboardEngine.shareInteractiveLink(activeDashboardId, expiresHours),
    onSuccess: (res) => {
      setShareLink(res.data);
    },
  });

  const convertMutation = useMutation({
    mutationFn: () => dashboardEngine.convertToReport(activeDashboardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['editor-sessions'] });
    },
  });

  const rebindMutation = useMutation({
    mutationFn: (args: { widgetId: string; newColumn: string; newDatasetId: string; newAggregation: string }) =>
      dashboardEngine.rebindElement(args.widgetId, args.newColumn, args.newDatasetId, args.newAggregation),
    onSuccess: (_data, vars) => {
      const updated = widgets.map((w) =>
        w.id === vars.widgetId
          ? { ...w, column: vars.newColumn, datasetId: vars.newDatasetId, aggregation: vars.newAggregation }
          : w,
      );
      pushHistory(updated, 'اعادة الربط');
      queryClient.invalidateQueries({ queryKey: ['editor-sessions'] });
    },
  });

  const formulaMutation = useMutation({
    mutationFn: (args: { widgetId: string; expression: string; resultColumn: string }) =>
      dashboardEngine.addCanvasFormula(args.widgetId, args.expression, args.resultColumn),
    onSuccess: (_data, vars) => {
      const updated = widgets.map((w) =>
        w.id === vars.widgetId
          ? { ...w, formulas: [...(w.formulas ?? []), { expression: vars.expression, resultColumn: vars.resultColumn }] }
          : w,
      );
      pushHistory(updated, 'اضافة معادلة');
      setFormulaExpression('');
      setFormulaResultCol('');
    },
  });

  const exportMutation = useMutation({
    mutationFn: (format: string) => dashboardEngine.exportDashboard(activeDashboardId, format),
    onSuccess: () => {
      setShowExportDropdown(false);
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════

  const addWidget = useCallback(
    (type: string) => {
      const lib = ALL_WIDGETS.find((w) => w.type === type);
      const newWidget: EditorWidget = {
        id: `w-${Date.now()}`,
        type,
        title: lib?.label ?? 'عنصر جديد',
        x: 0,
        y: Math.max(0, ...widgets.map((w) => w.y + w.h)),
        w: type.startsWith('chart') || type === 'table' ? 2 : 1,
        h: type.startsWith('chart') ? 2 : 1,
        aggregation: 'sum',
      };
      pushHistory([...widgets, newWidget], `اضافة ${lib?.label ?? type}`);
    },
    [widgets, pushHistory],
  );

  const removeWidget = useCallback(
    (id: string) => {
      pushHistory(
        widgets.filter((w) => w.id !== id),
        'حذف عنصر',
      );
      if (selectedId === id) setSelectedId(null);
    },
    [widgets, selectedId, pushHistory],
  );

  const duplicateWidget = useCallback(
    (id: string) => {
      const src = widgets.find((w) => w.id === id);
      if (!src) return;
      const dup: EditorWidget = { ...src, id: `w-${Date.now()}`, y: src.y + src.h };
      pushHistory([...widgets, dup], 'نسخ عنصر');
    },
    [widgets, pushHistory],
  );

  const getWidgetIcon = (type: string) => {
    const lib = ALL_WIDGETS.find((w) => w.type === type);
    return lib?.icon ?? BarChart3;
  };

  const handleResize = () => {
    if (!selectedId) return;
    resizeMutation.mutate({ widgetId: selectedId, newSize: { w: resizeW, h: resizeH } });
  };

  const handleRebind = () => {
    if (!selectedId) return;
    rebindMutation.mutate({
      widgetId: selectedId,
      newColumn: rebindColumn,
      newDatasetId: rebindDatasetId,
      newAggregation: rebindAggregation,
    });
  };

  const handleFormula = () => {
    if (!selectedId || !formulaExpression || !formulaResultCol) return;
    formulaMutation.mutate({
      widgetId: selectedId,
      expression: formulaExpression,
      resultColumn: formulaResultCol,
    });
  };

  const handleShare = () => {
    shareMutation.mutate(shareHours);
  };

  const copyShareLink = () => {
    if (shareLink?.url) {
      navigator.clipboard.writeText(shareLink.url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white" dir="rtl">
      {/* ───── Gradient Hero Header ───── */}
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-gradient-to-l from-blue-600/30 via-cyan-500/20 to-blue-700/30 backdrop-blur-3xl" />
        <div className="relative flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/30">
              <Layout className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs text-blue-200/70">
                <Link href="/dashboard" className="hover:text-blue-200 transition-colors">محرك لوحة المعلومات</Link>
                <span>/</span>
                <span>المحرر الكامل</span>
              </div>
              <h1 className="text-lg font-bold bg-gradient-to-l from-blue-200 to-cyan-200 bg-clip-text text-transparent">
                محرر اللوحات المتقدم
              </h1>
            </div>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-2">
            {editorListQuery.isLoading && (
              <span className="flex items-center gap-1.5 rounded-full bg-blue-500/20 px-3 py-1 text-xs text-blue-300">
                <Loader2 className="h-3 w-3 animate-spin" /> جاري التحميل...
              </span>
            )}
            {editorListQuery.isError && (
              <span className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-xs text-red-300">
                <AlertCircle className="h-3 w-3" /> خطأ في التحميل
              </span>
            )}
            {editorListQuery.isSuccess && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300">
                <Check className="h-3 w-3" /> متصل
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ───── Top Toolbar (Glassmorphism) ───── */}
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-2 backdrop-blur-xl">
        <div className="flex items-center gap-1">
          {/* Panel toggles */}
          <button
            onClick={() => setShowLeftPanel(!showLeftPanel)}
            className="rounded-lg p-2 text-slate-400 transition-all hover:bg-white/10 hover:text-white"
            title={showLeftPanel ? 'اخفاء مكتبة الأدوات' : 'اظهار مكتبة الأدوات'}
          >
            {showLeftPanel ? <PanelLeftOpen className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>

          <div className="mx-2 h-5 w-px bg-white/10" />

          {/* Undo / Redo */}
          <button
            onClick={undo}
            disabled={!canUndo}
            className="rounded-lg p-2 text-slate-400 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="تراجع / Undo"
          >
            <Undo className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="rounded-lg p-2 text-slate-400 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="اعادة / Redo"
          >
            <Redo className="h-4 w-4" />
          </button>

          <div className="mx-2 h-5 w-px bg-white/10" />

          {/* Preview */}
          <button
            onClick={() => { setIsPreview(!isPreview); setSelectedId(null); }}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              isPreview
                ? 'bg-cyan-500/20 text-cyan-300 shadow-inner shadow-cyan-500/10'
                : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Eye className="h-4 w-4" />
            {isPreview ? 'وضع التحرير' : 'معاينة'}
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Share */}
          <button
            onClick={() => { setShowShareModal(true); setShareLink(null); setShareCopied(false); }}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-all hover:bg-white/10 hover:text-white"
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">مشاركة</span>
          </button>

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-all hover:bg-white/10 hover:text-white"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">تصدير</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {showExportDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportDropdown(false)} />
                <div className="absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl">
                  {EXPORT_FORMATS.map((ef) => {
                    const EfIcon = ef.icon;
                    return (
                      <button
                        key={ef.format}
                        onClick={() => exportMutation.mutate(ef.format)}
                        disabled={exportMutation.isPending}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                      >
                        <EfIcon className="h-4 w-4 text-blue-400" />
                        {ef.label}
                        {exportMutation.isPending && <Loader2 className="h-3 w-3 animate-spin ms-auto" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="mx-2 h-5 w-px bg-white/10" />

          {/* Convert to Report */}
          <button
            onClick={() => convertMutation.mutate()}
            disabled={convertMutation.isPending}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            {convertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
            <span className="hidden md:inline">تحويل لتقرير</span>
          </button>

          {/* Save */}
          <button className="flex items-center gap-2 rounded-lg bg-gradient-to-l from-blue-600 to-cyan-500 px-4 py-1.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:brightness-110">
            <Save className="h-4 w-4" />
            حفظ
          </button>

          {/* Right panel toggle */}
          <button
            onClick={() => setShowRightPanel(!showRightPanel)}
            className="rounded-lg p-2 text-slate-400 transition-all hover:bg-white/10 hover:text-white ms-1"
            title={showRightPanel ? 'اخفاء الخصائص' : 'اظهار الخصائص'}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ───── Main Content Area ───── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ────── Left Panel: Widget Library ────── */}
        {showLeftPanel && !isPreview && (
          <div className="w-64 flex-shrink-0 overflow-y-auto border-l border-white/10 bg-white/[0.03] backdrop-blur-xl">
            <div className="p-4">
              <h3 className="mb-1 text-sm font-bold text-white">مكتبة الأدوات</h3>
              <p className="mb-4 text-[11px] text-slate-500">Widget Library</p>

              {WIDGET_CATEGORIES.map((cat) => (
                <div key={cat.label} className="mb-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400">{cat.label}</span>
                    <span className="text-[10px] text-slate-600">{cat.labelEn}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {cat.items.map((item) => {
                      const WIcon = item.icon;
                      return (
                        <button
                          key={item.type}
                          onClick={() => addWidget(item.type)}
                          className="group flex flex-col items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-all hover:border-blue-500/30 hover:bg-blue-500/10 hover:shadow-lg hover:shadow-blue-500/10"
                        >
                          <WIcon className="h-5 w-5 text-slate-500 transition-colors group-hover:text-blue-400" />
                          <span className="text-[10px] text-slate-400 group-hover:text-blue-300">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ────── Center: Canvas ────── */}
        <div className="flex-1 overflow-auto p-6">
          <div
            className="relative mx-auto min-h-[600px] rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm transition-transform"
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              backgroundImage:
                'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          >
            {/* Stats bar inside canvas */}
            <div className="mb-5 flex items-center gap-4">
              <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-1.5">
                <Layers className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs text-blue-300">{widgets.length} عنصر</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-300">{widgets.filter((w) => w.type.startsWith('chart')).length} رسم بياني</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-violet-500/10 px-3 py-1.5">
                <Hash className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-xs text-violet-300">{widgets.filter((w) => w.type === 'kpi').length} مؤشر</span>
              </div>
            </div>

            {/* Grid layout */}
            <div className="grid grid-cols-4 gap-4">
              {widgets.map((widget) => {
                const WIcon = getWidgetIcon(widget.type);
                const isSelected = selectedId === widget.id && !isPreview;
                return (
                  <div
                    key={widget.id}
                    onClick={() => {
                      if (!isPreview) {
                        setSelectedId(widget.id);
                        setResizeW(widget.w);
                        setResizeH(widget.h);
                        setRebindColumn(widget.column ?? '');
                        setRebindDatasetId(widget.datasetId ?? '');
                        setRebindAggregation(widget.aggregation ?? 'sum');
                      }
                    }}
                    style={{ gridColumn: `span ${Math.min(widget.w, 4)}` }}
                    className={`group relative overflow-hidden rounded-xl border transition-all duration-300 ${
                      isSelected
                        ? 'border-blue-500/60 bg-blue-500/5 shadow-[0_0_24px_rgba(59,130,246,0.15),0_0_48px_rgba(59,130,246,0.08)] ring-1 ring-blue-500/30'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                    } ${!isPreview ? 'cursor-pointer' : ''}`}
                  >
                    {/* Widget header */}
                    <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {!isPreview && (
                          <GripVertical className="h-3.5 w-3.5 cursor-move text-slate-600 transition-colors group-hover:text-slate-400" />
                        )}
                        <WIcon className={`h-4 w-4 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
                        <span className="text-xs font-medium text-slate-300">{widget.title}</span>
                      </div>
                      {!isPreview && isSelected && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); duplicateWidget(widget.id); }}
                            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-blue-400"
                            title="نسخ"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeWidget(widget.id); }}
                            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                            title="حذف"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Widget body */}
                    <div className="p-4">
                      {widget.type === 'kpi' ? (
                        <div className="text-center py-2">
                          <p className="text-3xl font-bold bg-gradient-to-l from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            {widget.id === 'w1' ? '1,250,000' : widget.id === 'w2' ? '3,842' : widget.id === 'w3' ? '+12.5%' : '427'}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">{widget.title}</p>
                          {widget.aggregation && widget.aggregation !== 'none' && (
                            <span className="mt-2 inline-block rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] text-blue-400">
                              {AGGREGATION_OPTIONS.find((a) => a.value === widget.aggregation)?.label ?? widget.aggregation}
                            </span>
                          )}
                        </div>
                      ) : widget.type === 'gauge' ? (
                        <div className="flex items-center justify-center py-4">
                          <Gauge className="h-12 w-12 text-cyan-500/40" />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center py-6">
                          <div className="flex flex-col items-center gap-2">
                            <WIcon className="h-10 w-10 text-slate-700" />
                            <span className="text-[10px] text-slate-600">{widget.column ?? 'غير مربوط'}</span>
                          </div>
                        </div>
                      )}

                      {/* Formula badges */}
                      {widget.formulas && widget.formulas.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {widget.formulas.map((f, i) => (
                            <span key={i} className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[9px] text-violet-400">
                              <Code2 className="inline h-2.5 w-2.5 me-1" />
                              {f.resultColumn}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Selected glow */}
                    {isSelected && (
                      <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-blue-400/20 animate-pulse" style={{ animationDuration: '3s' }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Empty state */}
            {widgets.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20">
                <Layers className="mb-4 h-16 w-16 text-slate-700" />
                <p className="text-lg font-semibold text-slate-500">اللوحة فارغة</p>
                <p className="text-sm text-slate-600">Dashboard is empty</p>
                <p className="mt-2 text-xs text-slate-700">اسحب الأدوات من المكتبة أو اضغط لاضافتها</p>
              </div>
            )}
          </div>
        </div>

        {/* ────── Right Panel: Properties ────── */}
        {showRightPanel && !isPreview && (
          <div className="w-72 flex-shrink-0 overflow-y-auto border-r border-white/10 bg-white/[0.03] backdrop-blur-xl">
            <div className="p-4">
              {selectedWidget ? (
                <>
                  {/* Widget info */}
                  <div className="mb-5">
                    <h3 className="text-sm font-bold text-white">خصائص العنصر</h3>
                    <p className="text-[11px] text-slate-500">Widget Properties</p>
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center gap-3">
                        {(() => { const SIcon = getWidgetIcon(selectedWidget.type); return <SIcon className="h-5 w-5 text-blue-400" />; })()}
                        <div>
                          <p className="text-xs font-semibold text-slate-200">{selectedWidget.title}</p>
                          <p className="text-[10px] text-slate-500">{selectedWidget.type} | ID: {selectedWidget.id.slice(0, 8)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Resize Section ── */}
                  <div className="mb-5">
                    <div className="mb-2 flex items-center gap-2">
                      <Maximize2 className="h-3.5 w-3.5 text-blue-400" />
                      <span className="text-xs font-semibold text-slate-300">تغيير الحجم</span>
                      <span className="text-[10px] text-slate-600">Resize</span>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="mb-1 block text-[10px] text-slate-500">العرض (W)</label>
                          <input
                            type="number"
                            min={1}
                            max={4}
                            value={resizeW}
                            onChange={(e) => setResizeW(Number(e.target.value))}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="mb-1 block text-[10px] text-slate-500">الارتفاع (H)</label>
                          <input
                            type="number"
                            min={1}
                            max={4}
                            value={resizeH}
                            onChange={(e) => setResizeH(Number(e.target.value))}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleResize}
                        disabled={resizeMutation.isPending}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600/20 py-1.5 text-xs font-medium text-blue-300 transition-all hover:bg-blue-600/30 disabled:opacity-50"
                      >
                        {resizeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Move className="h-3 w-3" />}
                        تطبيق الحجم
                      </button>
                    </div>
                  </div>

                  {/* ── Rebind Section ── */}
                  <div className="mb-5">
                    <div className="mb-2 flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-xs font-semibold text-slate-300">اعادة الربط</span>
                      <span className="text-[10px] text-slate-600">Rebind</span>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-500">العمود / Column</label>
                        <input
                          type="text"
                          value={rebindColumn}
                          onChange={(e) => setRebindColumn(e.target.value)}
                          placeholder="اسم العمود..."
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-500">معرف مجموعة البيانات / Dataset ID</label>
                        <input
                          type="text"
                          value={rebindDatasetId}
                          onChange={(e) => setRebindDatasetId(e.target.value)}
                          placeholder="dataset-id..."
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-500">التجميع / Aggregation</label>
                        <select
                          value={rebindAggregation}
                          onChange={(e) => setRebindAggregation(e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500/50"
                        >
                          {AGGREGATION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label} ({opt.labelEn})
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={handleRebind}
                        disabled={rebindMutation.isPending || !rebindColumn}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600/20 py-1.5 text-xs font-medium text-emerald-300 transition-all hover:bg-emerald-600/30 disabled:opacity-50"
                      >
                        {rebindMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                        ربط البيانات
                      </button>
                    </div>
                  </div>

                  {/* ── Formula Section ── */}
                  <div className="mb-5">
                    <div className="mb-2 flex items-center gap-2">
                      <Code2 className="h-3.5 w-3.5 text-violet-400" />
                      <span className="text-xs font-semibold text-slate-300">معادلة Canvas</span>
                      <span className="text-[10px] text-slate-600">Canvas Formula</span>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-500">المعادلة / Expression</label>
                        <textarea
                          value={formulaExpression}
                          onChange={(e) => setFormulaExpression(e.target.value)}
                          placeholder="SUM(col_a) / COUNT(col_b) * 100"
                          rows={3}
                          className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 font-mono text-xs text-cyan-300 placeholder:text-slate-700 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-500">عمود النتيجة / Result Column</label>
                        <input
                          type="text"
                          value={formulaResultCol}
                          onChange={(e) => setFormulaResultCol(e.target.value)}
                          placeholder="calculated_col"
                          dir="ltr"
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-slate-600 outline-none focus:border-violet-500/50"
                        />
                      </div>
                      <button
                        onClick={handleFormula}
                        disabled={formulaMutation.isPending || !formulaExpression || !formulaResultCol}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600/20 py-1.5 text-xs font-medium text-violet-300 transition-all hover:bg-violet-600/30 disabled:opacity-50"
                      >
                        {formulaMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        اضافة معادلة
                      </button>
                    </div>
                  </div>

                  {/* ── Existing Formulas ── */}
                  {selectedWidget.formulas && selectedWidget.formulas.length > 0 && (
                    <div className="mb-5">
                      <span className="mb-2 block text-[10px] text-slate-500">المعادلات المطبقة</span>
                      <div className="space-y-1">
                        {selectedWidget.formulas.map((f, i) => (
                          <div key={i} className="rounded-lg border border-violet-500/10 bg-violet-500/5 px-3 py-2">
                            <p className="font-mono text-[10px] text-violet-300" dir="ltr">{f.expression}</p>
                            <p className="mt-0.5 text-[9px] text-slate-500">
                              <ArrowRight className="inline h-2.5 w-2.5 me-1" />{f.resultColumn}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Quick Actions ── */}
                  <div>
                    <span className="mb-2 block text-[10px] text-slate-500">اجراءات سريعة</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => duplicateWidget(selectedWidget.id)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-2 text-[10px] text-slate-400 transition-all hover:bg-white/10 hover:text-white"
                      >
                        <Copy className="h-3 w-3" /> نسخ
                      </button>
                      <button
                        onClick={() => removeWidget(selectedWidget.id)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/10 bg-red-500/5 py-2 text-[10px] text-red-400 transition-all hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3 w-3" /> حذف
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* No selection state */
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
                    <Settings className="h-7 w-7 text-slate-700" />
                  </div>
                  <p className="text-sm font-semibold text-slate-500">لا يوجد عنصر محدد</p>
                  <p className="text-[11px] text-slate-600">No widget selected</p>
                  <p className="mt-2 text-center text-[10px] text-slate-700">
                    اضغط على أي عنصر في اللوحة لعرض خصائصه وتعديلها
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ───── Bottom Bar ───── */}
      <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.03] px-4 py-1.5 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-slate-600">
            E03.04 Full Editor | {widgets.length} عنصر | الشبكة 4 اعمدة
          </span>
          {convertMutation.isSuccess && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <Check className="h-2.5 w-2.5" /> تم التحويل لتقرير
            </span>
          )}
          {exportMutation.isSuccess && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <Check className="h-2.5 w-2.5" /> تم التصدير بنجاح
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(Math.max(50, zoom - 10))}
            disabled={zoom <= 50}
            className="rounded p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[40px] text-center text-[10px] text-slate-400">{zoom}%</span>
          <button
            onClick={() => setZoom(Math.min(150, zoom + 10))}
            disabled={zoom >= 150}
            className="rounded p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <div className="mx-1 h-4 w-px bg-white/10" />
          <button
            onClick={() => setZoom(100)}
            className="rounded px-2 py-0.5 text-[10px] text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
          >
            Reset
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Share Modal */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowShareModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl"
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400">
                  <Share2 className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">مشاركة تفاعلية</h3>
                  <p className="text-[10px] text-slate-500">Share Interactive Link</p>
                </div>
              </div>
              <button onClick={() => setShowShareModal(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">مدة صلاحية الرابط (بالساعات)</label>
                <div className="flex gap-2">
                  {[6, 12, 24, 48, 72].map((h) => (
                    <button
                      key={h}
                      onClick={() => setShareHours(h)}
                      className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
                        shareHours === h
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                          : 'border border-white/10 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleShare}
                disabled={shareMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-blue-600 to-cyan-500 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:brightness-110 disabled:opacity-50"
              >
                {shareMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> جاري الانشاء...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4" /> انشاء رابط مشاركة
                  </>
                )}
              </button>

              {/* Generated link */}
              {shareLink && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-300">تم انشاء الرابط بنجاح</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={shareLink.url}
                      dir="ltr"
                      className="flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 font-mono text-xs text-cyan-300 outline-none"
                    />
                    <button
                      onClick={copyShareLink}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                        shareCopied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white/10 text-slate-300 hover:bg-white/20'
                      }`}
                    >
                      {shareCopied ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                      {shareCopied ? 'تم النسخ' : 'نسخ'}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    صالح حتى: {new Date(shareLink.expiresAt).toLocaleString('ar-SA')}
                  </p>
                </div>
              )}

              {shareMutation.isError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-xs text-red-300">حدث خطأ في انشاء الرابط. حاول مرة أخرى.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
