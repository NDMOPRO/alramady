'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  dashboardEngine,
  type DragElement,
} from '@/lib/api/dashboard-engine.api';
import {
  GripVertical, BarChart3, PieChart, TrendingUp, Hash, Gauge, Table,
  Activity, Target, Layers, Link2, Bell, ChevronDown, ChevronRight,
  Settings, AlertTriangle, Presentation, Move, Plus, Loader2,
  CheckCircle2, XCircle, RefreshCw, Search, Filter, Eye,
  ArrowDownRight, Zap, Sparkles, LayoutGrid, MousePointerClick,
} from 'lucide-react';

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

interface PaletteItem {
  type: string;
  label: string;
  labelEn: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  borderGradient: string;
}

interface CanvasElement {
  id: string;
  elementType: string;
  label: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  columnName: string;
  dashboardId: string;
}

interface DrillLevel {
  field: string;
  label: string;
}

type PropertiesTab = 'config' | 'drilldown' | 'alerts' | 'links';

interface ToastMessage {
  id: number;
  type: 'success' | 'error';
  text: string;
}

// ════════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════════

const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'chart-bar', label: 'رسم عمودي', labelEn: 'Bar Chart', icon: BarChart3, gradient: 'from-blue-500 to-cyan-400', borderGradient: 'from-blue-400 to-cyan-300' },
  { type: 'chart-pie', label: 'رسم دائري', labelEn: 'Pie Chart', icon: PieChart, gradient: 'from-purple-500 to-pink-400', borderGradient: 'from-purple-400 to-pink-300' },
  { type: 'chart-line', label: 'رسم خطي', labelEn: 'Line Chart', icon: TrendingUp, gradient: 'from-emerald-500 to-teal-400', borderGradient: 'from-emerald-400 to-teal-300' },
  { type: 'kpi', label: 'مؤشر أداء', labelEn: 'KPI Card', icon: Hash, gradient: 'from-orange-500 to-amber-400', borderGradient: 'from-orange-400 to-amber-300' },
  { type: 'gauge', label: 'عداد', labelEn: 'Gauge', icon: Gauge, gradient: 'from-rose-500 to-red-400', borderGradient: 'from-rose-400 to-red-300' },
  { type: 'table', label: 'جدول بيانات', labelEn: 'Data Table', icon: Table, gradient: 'from-indigo-500 to-violet-400', borderGradient: 'from-indigo-400 to-violet-300' },
  { type: 'heatmap', label: 'خريطة حرارية', labelEn: 'Heatmap', icon: Activity, gradient: 'from-red-500 to-orange-400', borderGradient: 'from-red-400 to-orange-300' },
  { type: 'scorecard', label: 'بطاقة أداء', labelEn: 'Scorecard', icon: Target, gradient: 'from-sky-500 to-blue-400', borderGradient: 'from-sky-400 to-blue-300' },
];

const GRID_COLS = 6;
const GRID_ROWS = 8;

const FALLBACK_DASHBOARD_ID = 'default-workspace';

// ════════════════════════════════════════════════════════════════
// Component
// ════════════════════════════════════════════════════════════════

export default function DragElementsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const activeDashboardId = searchParams?.get('dashboardId') || FALLBACK_DASHBOARD_ID;

  // ── State ──
  const [canvasElements, setCanvasElements] = useState<CanvasElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PropertiesTab>('config');
  const [draggingType, setDraggingType] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [searchPalette, setSearchPalette] = useState('');

  // Drill-down form
  const [drillLevels, setDrillLevels] = useState<DrillLevel[]>([{ field: '', label: '' }]);

  // Alert form
  const [alertThreshold, setAlertThreshold] = useState<number>(80);
  const [alertCondition, setAlertCondition] = useState<string>('above');
  const [alertType, setAlertType] = useState<string>('warning');

  // Link form
  const [linkTargetIds, setLinkTargetIds] = useState<string>('');
  const [linkFilterColumn, setLinkFilterColumn] = useState<string>('');

  // Drop form
  const [dropColumnName, setDropColumnName] = useState<string>('value');

  // ── Toast helper ──
  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, text }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // ── Queries ──
  const { data: dragData, isLoading, error, refetch } = useQuery({
    queryKey: ['drag-elements'],
    queryFn: () => dashboardEngine.dragList(),
  });

  const elements: DragElement[] = dragData?.data ?? [];

  // ── Mutations ──
  const dropAndBindMutation = useMutation({
    mutationFn: (params: { elementType: string; columnName: string; position: { x: number; y: number; w: number; h: number } }) =>
      dashboardEngine.dropAndBind(activeDashboardId, params.elementType, params.columnName, params.position),
    onSuccess: (res) => {
      showToast('success', 'تم إسقاط العنصر وربطه بنجاح');
      queryClient.invalidateQueries({ queryKey: ['drag-elements'] });
      if (res.data) {
        const el = res.data;
        setCanvasElements(prev => [...prev, {
          id: el.id,
          elementType: el.elementType,
          label: el.label,
          positionX: el.positionX,
          positionY: el.positionY,
          width: el.width,
          height: el.height,
          columnName: dropColumnName,
          dashboardId: activeDashboardId,
        }]);
      }
    },
    onError: (err: Error) => showToast('error', err.message),
  });

  const linkMutation = useMutation({
    mutationFn: (params: { sourceId: string; targetIds: string[]; filterColumn: string }) =>
      dashboardEngine.linkElements(activeDashboardId, params.sourceId, params.targetIds, params.filterColumn),
    onSuccess: () => {
      showToast('success', 'تم ربط العناصر بنجاح');
      queryClient.invalidateQueries({ queryKey: ['drag-elements'] });
    },
    onError: (err: Error) => showToast('error', err.message),
  });

  const drillDownMutation = useMutation({
    mutationFn: (params: { elementId: string; levels: DrillLevel[] }) =>
      dashboardEngine.configureDrillDown(params.elementId, params.levels),
    onSuccess: () => {
      showToast('success', 'تم تكوين التنقل التفصيلي بنجاح');
      queryClient.invalidateQueries({ queryKey: ['drag-elements'] });
    },
    onError: (err: Error) => showToast('error', err.message),
  });

  const alertMutation = useMutation({
    mutationFn: (params: { elementId: string; threshold: number; condition: string; alertType: string }) =>
      dashboardEngine.configureAlert(params.elementId, params.threshold, params.condition, params.alertType),
    onSuccess: () => {
      showToast('success', 'تم تكوين التنبيه بنجاح');
      queryClient.invalidateQueries({ queryKey: ['drag-elements'] });
    },
    onError: (err: Error) => showToast('error', err.message),
  });

  const updatePositionMutation = useMutation({
    mutationFn: (params: { elementId: string; position: { x: number; y: number; w: number; h: number } }) =>
      dashboardEngine.updatePosition(params.elementId, activeDashboardId, params.position),
    onSuccess: () => {
      showToast('success', 'تم تحديث الموضع بنجاح');
      queryClient.invalidateQueries({ queryKey: ['drag-elements'] });
    },
    onError: (err: Error) => showToast('error', err.message),
  });

  // ── Handlers ──
  const selectedElement = canvasElements.find(el => el.id === selectedElementId) ?? null;

  const handleDragStart = (type: string) => {
    setDraggingType(type);
  };

  const handleDrop = (cellX: number, cellY: number) => {
    if (!draggingType) return;
    const paletteItem = PALETTE_ITEMS.find(p => p.type === draggingType);
    if (!paletteItem) return;

    const position = { x: cellX, y: cellY, w: 2, h: 2 };

    dropAndBindMutation.mutate({
      elementType: draggingType,
      columnName: dropColumnName,
      position,
    });

    // Optimistic add
    const tempId = `temp-${Date.now()}`;
    setCanvasElements(prev => [...prev, {
      id: tempId,
      elementType: draggingType,
      label: paletteItem.label,
      positionX: cellX,
      positionY: cellY,
      width: 2,
      height: 2,
      columnName: dropColumnName,
      dashboardId: activeDashboardId,
    }]);

    setDraggingType(null);
  };

  const handleLinkElements = () => {
    if (!selectedElementId || !linkTargetIds.trim() || !linkFilterColumn.trim()) return;
    const targets = linkTargetIds.split(',').map(s => s.trim()).filter(Boolean);
    linkMutation.mutate({ sourceId: selectedElementId, targetIds: targets, filterColumn: linkFilterColumn });
  };

  const handleConfigureDrillDown = () => {
    if (!selectedElementId) return;
    const validLevels = drillLevels.filter(l => l.field.trim() && l.label.trim());
    if (validLevels.length === 0) return;
    drillDownMutation.mutate({ elementId: selectedElementId, levels: validLevels });
  };

  const handleConfigureAlert = () => {
    if (!selectedElementId) return;
    alertMutation.mutate({ elementId: selectedElementId, threshold: alertThreshold, condition: alertCondition, alertType: alertType });
  };

  const handleUpdatePosition = (elementId: string, x: number, y: number) => {
    const el = canvasElements.find(e => e.id === elementId);
    if (!el) return;
    updatePositionMutation.mutate({ elementId, position: { x, y, w: el.width, h: el.height } });
    setCanvasElements(prev => prev.map(e => e.id === elementId ? { ...e, positionX: x, positionY: y } : e));
  };

  const filteredPalette = PALETTE_ITEMS.filter(item =>
    item.label.includes(searchPalette) || item.labelEn.toLowerCase().includes(searchPalette.toLowerCase()) || item.type.includes(searchPalette)
  );

  const getElementIcon = (type: string) => {
    const item = PALETTE_ITEMS.find(p => p.type === type);
    return item?.icon ?? BarChart3;
  };

  const getElementGradient = (type: string) => {
    const item = PALETTE_ITEMS.find(p => p.type === type);
    return item?.gradient ?? 'from-gray-500 to-gray-400';
  };

  // ════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50/30 to-rose-50/20" dir="rtl">
      {/* ── Toast Messages ── */}
      <div className="fixed top-4 left-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-sm transition-all animate-in slide-in-from-left ${
              toast.type === 'success'
                ? 'bg-emerald-500/90 text-white'
                : 'bg-red-500/90 text-white'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {toast.text}
          </div>
        ))}
      </div>

      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden bg-gradient-to-l from-orange-500 via-orange-600 to-rose-600">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-40" />
        <div className="relative mx-auto max-w-[1600px] px-6 py-8">
          <div className="flex items-center gap-2 text-sm text-orange-100 mb-3">
            <Link href="/dashboard" className="hover:text-white transition-colors">محرك لوحة المعلومات</Link>
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            <span className="text-white font-medium">سحب العناصر</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 shadow-xl">
                <MousePointerClick className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">سحب وإفلات العناصر</h1>
                <p className="text-lg text-orange-100 mt-1">E03.03 Drag Elements - Drop, Bind & Configure</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-2">
                <Layers className="h-4 w-4 text-orange-200" />
                <span className="text-sm text-white font-medium">{canvasElements.length} عنصر</span>
              </div>
              <button
                onClick={() => refetch()}
                className="flex items-center gap-2 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 px-4 py-2.5 text-sm text-white hover:bg-white/25 transition-all"
              >
                <RefreshCw className="h-4 w-4" />
                تحديث
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Layout: 3-column ── */}
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="grid grid-cols-[280px_1fr_340px] gap-5 items-start">

          {/* ════════════ Column 1: Element Palette ════════════ */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-xl overflow-hidden">
              {/* Palette Header */}
              <div className="border-b border-gray-100/80 bg-gradient-to-l from-orange-50 to-rose-50 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 shadow-md">
                    <LayoutGrid className="h-4.5 w-4.5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-800">لوحة العناصر</h2>
                    <p className="text-[11px] text-gray-500">Element Palette</p>
                  </div>
                </div>
                {/* Search */}
                <div className="mt-3 relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="بحث عن عنصر..."
                    value={searchPalette}
                    onChange={e => setSearchPalette(e.target.value)}
                    className="w-full rounded-xl border border-gray-200/80 bg-white/80 backdrop-blur-sm pr-9 pl-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Palette Items */}
              <div className="p-4 space-y-2.5 max-h-[calc(100vh-340px)] overflow-y-auto">
                {filteredPalette.map(item => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.type}
                      draggable
                      onDragStart={() => handleDragStart(item.type)}
                      onDragEnd={() => setDraggingType(null)}
                      className="group relative cursor-grab active:cursor-grabbing"
                    >
                      {/* Gradient border effect */}
                      <div className={`absolute -inset-[1px] rounded-xl bg-gradient-to-l ${item.borderGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                      <div className="relative flex items-center gap-3 rounded-xl bg-white border border-gray-100 px-4 py-3 shadow-sm group-hover:shadow-md group-hover:border-transparent transition-all duration-300">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${item.gradient} shadow-sm group-hover:shadow-md transition-shadow`}>
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                          <p className="text-[10px] text-gray-400">{item.labelEn}</p>
                        </div>
                        <GripVertical className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Column Name Input */}
            <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-lg p-4">
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                اسم العمود للربط
                <span className="text-[10px] text-gray-400 mr-1">Column Name</span>
              </label>
              <input
                type="text"
                value={dropColumnName}
                onChange={e => setDropColumnName(e.target.value)}
                placeholder="مثال: total_sales"
                className="w-full rounded-xl border border-gray-200/80 bg-white/80 backdrop-blur-sm px-3 py-2.5 text-sm text-gray-700 placeholder:text-gray-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
              />
            </div>
          </div>

          {/* ════════════ Column 2: Canvas ════════════ */}
          <div className="space-y-4">
            {/* Action Bar */}
            <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-lg px-5 py-3">
              <button
                onClick={() => {
                  if (!selectedElementId) return;
                  handleLinkElements();
                }}
                disabled={!selectedElementId || linkMutation.isPending}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-l from-orange-500 to-rose-500 px-4 py-2.5 text-sm font-medium text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {linkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                ربط العناصر
              </button>
              <button
                onClick={() => {
                  if (selectedElementId) {
                    const el = canvasElements.find(e => e.id === selectedElementId);
                    if (el) handleUpdatePosition(el.id, el.positionX, el.positionY);
                  }
                }}
                disabled={!selectedElementId || updatePositionMutation.isPending}
                className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/80 backdrop-blur-sm px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {updatePositionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Move className="h-4 w-4" />}
                تحديث الموضع
              </button>
              <button
                className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/80 backdrop-blur-sm px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
              >
                <Presentation className="h-4 w-4" />
                تصدير للعرض
              </button>
              <div className="flex-1" />
              <span className="text-xs text-gray-400">
                {canvasElements.length} عنصر في اللوحة
              </span>
            </div>

            {/* Canvas Area */}
            <div
              className="relative rounded-2xl border-2 border-dashed border-gray-200/80 bg-white/50 backdrop-blur-sm shadow-inner overflow-hidden"
              style={{ minHeight: `${GRID_ROWS * 80 + 40}px` }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const relativeX = e.clientX - rect.left;
                const relativeY = e.clientY - rect.top;
                const cellX = Math.floor(relativeX / (rect.width / GRID_COLS));
                const cellY = Math.floor(relativeY / (rect.height / GRID_ROWS));
                handleDrop(Math.max(0, Math.min(cellX, GRID_COLS - 1)), Math.max(0, Math.min(cellY, GRID_ROWS - 1)));
              }}
            >
              {/* Grid dot pattern */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              />

              {/* Drop Zone Indicator */}
              {draggingType && (
                <div className="absolute inset-0 flex items-center justify-center bg-orange-50/50 border-2 border-orange-300/50 rounded-2xl z-10 pointer-events-none">
                  <div className="flex flex-col items-center gap-2 animate-pulse">
                    <ArrowDownRight className="h-10 w-10 text-orange-400" />
                    <p className="text-sm font-bold text-orange-500">أفلت العنصر هنا</p>
                    <p className="text-xs text-orange-400">Drop element here</p>
                  </div>
                </div>
              )}

              {/* Rendered Canvas Elements */}
              {canvasElements.length === 0 && !draggingType && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                  <MousePointerClick className="h-16 w-16 text-gray-300 mb-4" />
                  <p className="text-lg font-semibold text-gray-400">اسحب العناصر من اللوحة الجانبية</p>
                  <p className="text-sm text-gray-300 mt-1">Drag elements from the palette to start building</p>
                </div>
              )}

              {canvasElements.map(el => {
                const Icon = getElementIcon(el.elementType);
                const gradient = getElementGradient(el.elementType);
                const isSelected = el.id === selectedElementId;
                const cellW = 100 / GRID_COLS;
                const cellH = 100 / GRID_ROWS;

                return (
                  <div
                    key={el.id}
                    onClick={() => setSelectedElementId(el.id)}
                    className={`absolute group cursor-pointer transition-all duration-200 hover:z-20 ${
                      isSelected ? 'z-30 ring-2 ring-orange-400 ring-offset-2' : 'z-10'
                    }`}
                    style={{
                      left: `${el.positionX * cellW}%`,
                      top: `${el.positionY * cellH}%`,
                      width: `${el.width * cellW}%`,
                      height: `${el.height * cellH}%`,
                      padding: '4px',
                    }}
                  >
                    <div className={`h-full w-full rounded-xl border ${isSelected ? 'border-orange-300 bg-orange-50/80' : 'border-gray-200/80 bg-white/90'} backdrop-blur-sm shadow-md hover:shadow-lg transition-all overflow-hidden`}>
                      {/* Element Header */}
                      <div className={`flex items-center gap-2 px-3 py-2 bg-gradient-to-l ${gradient} text-white`}>
                        <Icon className="h-4 w-4" />
                        <span className="text-xs font-bold truncate">{el.label}</span>
                        <GripVertical className="h-3 w-3 mr-auto opacity-60" />
                      </div>
                      {/* Element Body */}
                      <div className="flex items-center justify-center flex-1 p-3">
                        <div className="text-center">
                          <Icon className="h-8 w-8 text-gray-300 mx-auto" />
                          <p className="text-[10px] text-gray-400 mt-1">{el.columnName}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Server Elements */}
              {elements.map(el => {
                const isAlreadyOnCanvas = canvasElements.some(ce => ce.id === el.id);
                if (isAlreadyOnCanvas) return null;
                const Icon = getElementIcon(el.elementType);
                const gradient = getElementGradient(el.elementType);
                const cellW = 100 / GRID_COLS;
                const cellH = 100 / GRID_ROWS;

                return (
                  <div
                    key={el.id}
                    onClick={() => {
                      setSelectedElementId(el.id);
                      setCanvasElements(prev => {
                        if (prev.some(c => c.id === el.id)) return prev;
                        return [...prev, {
                          id: el.id,
                          elementType: el.elementType,
                          label: el.label,
                          positionX: el.positionX,
                          positionY: el.positionY,
                          width: el.width,
                          height: el.height,
                          columnName: '',
                          dashboardId: activeDashboardId,
                        }];
                      });
                    }}
                    className="absolute z-10 cursor-pointer transition-all duration-200 hover:z-20"
                    style={{
                      left: `${el.positionX * cellW}%`,
                      top: `${el.positionY * cellH}%`,
                      width: `${el.width * cellW}%`,
                      height: `${el.height * cellH}%`,
                      padding: '4px',
                    }}
                  >
                    <div className="h-full w-full rounded-xl border border-gray-200/60 bg-white/70 backdrop-blur-sm shadow-sm hover:shadow-md transition-all overflow-hidden">
                      <div className={`flex items-center gap-2 px-3 py-2 bg-gradient-to-l ${gradient} text-white`}>
                        <Icon className="h-4 w-4" />
                        <span className="text-xs font-bold truncate">{el.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Loading / Error */}
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري تحميل العناصر...
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4" />
                خطأ في تحميل العناصر: {(error as Error).message}
                <button onClick={() => refetch()} className="mr-auto text-xs underline hover:no-underline">إعادة المحاولة</button>
              </div>
            )}
          </div>

          {/* ════════════ Column 3: Properties Panel ════════════ */}
          <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-xl overflow-hidden">
            {/* Properties Header */}
            <div className="border-b border-gray-100/80 bg-gradient-to-l from-gray-50 to-orange-50/50 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gray-600 to-gray-800 shadow-md">
                  <Settings className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-800">خصائص العنصر</h2>
                  <p className="text-[11px] text-gray-500">Properties Panel</p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100/80 bg-gray-50/50">
              {([
                { key: 'config' as const, label: 'إعداد', labelEn: 'Config', icon: Settings },
                { key: 'drilldown' as const, label: 'تنقل', labelEn: 'Drill', icon: ChevronDown },
                { key: 'alerts' as const, label: 'تنبيه', labelEn: 'Alerts', icon: Bell },
                { key: 'links' as const, label: 'ربط', labelEn: 'Links', icon: Link2 },
              ]).map(tab => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-[10px] font-medium transition-all border-b-2 ${
                      isActive
                        ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                        : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <TabIcon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="p-5 space-y-4 max-h-[calc(100vh-420px)] overflow-y-auto">
              {!selectedElement ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Eye className="h-10 w-10 text-gray-300 mb-3" />
                  <p className="text-sm font-medium">اختر عنصر من اللوحة</p>
                  <p className="text-xs text-gray-300 mt-1">Select an element to configure</p>
                </div>
              ) : (
                <>
                  {/* Selected Element Info */}
                  <div className="rounded-xl border border-gray-100 bg-gradient-to-l from-gray-50 to-white p-3">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const Icon = getElementIcon(selectedElement.elementType);
                        const grad = getElementGradient(selectedElement.elementType);
                        return (
                          <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${grad} shadow-sm`}>
                            <Icon className="h-5 w-5 text-white" />
                          </div>
                        );
                      })()}
                      <div>
                        <p className="text-sm font-bold text-gray-800">{selectedElement.label}</p>
                        <p className="text-[10px] text-gray-400">{selectedElement.elementType} | {selectedElement.id.slice(0, 12)}...</p>
                      </div>
                    </div>
                  </div>

                  {/* ── Config Tab ── */}
                  {activeTab === 'config' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          الموضع X
                          <span className="text-[10px] text-gray-400 mr-1">Position X</span>
                        </label>
                        <input
                          type="number"
                          value={selectedElement.positionX}
                          onChange={e => setCanvasElements(prev => prev.map(el => el.id === selectedElementId ? { ...el, positionX: Number(e.target.value) } : el))}
                          className="w-full rounded-xl border border-gray-200/80 bg-white/80 backdrop-blur-sm px-3 py-2.5 text-sm text-gray-700 focus:border-orange-300 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          الموضع Y
                          <span className="text-[10px] text-gray-400 mr-1">Position Y</span>
                        </label>
                        <input
                          type="number"
                          value={selectedElement.positionY}
                          onChange={e => setCanvasElements(prev => prev.map(el => el.id === selectedElementId ? { ...el, positionY: Number(e.target.value) } : el))}
                          className="w-full rounded-xl border border-gray-200/80 bg-white/80 backdrop-blur-sm px-3 py-2.5 text-sm text-gray-700 focus:border-orange-300 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">العرض <span className="text-[10px] text-gray-400">W</span></label>
                          <input
                            type="number"
                            value={selectedElement.width}
                            onChange={e => setCanvasElements(prev => prev.map(el => el.id === selectedElementId ? { ...el, width: Number(e.target.value) } : el))}
                            className="w-full rounded-xl border border-gray-200/80 bg-white/80 backdrop-blur-sm px-3 py-2.5 text-sm text-gray-700 focus:border-orange-300 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">الارتفاع <span className="text-[10px] text-gray-400">H</span></label>
                          <input
                            type="number"
                            value={selectedElement.height}
                            onChange={e => setCanvasElements(prev => prev.map(el => el.id === selectedElementId ? { ...el, height: Number(e.target.value) } : el))}
                            className="w-full rounded-xl border border-gray-200/80 bg-white/80 backdrop-blur-sm px-3 py-2.5 text-sm text-gray-700 focus:border-orange-300 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (selectedElement) handleUpdatePosition(selectedElement.id, selectedElement.positionX, selectedElement.positionY);
                        }}
                        disabled={updatePositionMutation.isPending}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-orange-500 to-rose-500 px-4 py-2.5 text-sm font-medium text-white shadow-md hover:shadow-lg disabled:opacity-50 transition-all"
                      >
                        {updatePositionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                        حفظ الموضع
                      </button>
                    </div>
                  )}

                  {/* ── Drill-Down Tab ── */}
                  {activeTab === 'drilldown' && (
                    <div className="space-y-4">
                      <p className="text-xs text-gray-500">
                        قم بتعريف مستويات التنقل التفصيلي
                        <span className="block text-[10px] text-gray-400 mt-0.5">Define drill-down hierarchy levels</span>
                      </p>

                      {drillLevels.map((level, idx) => (
                        <div key={idx} className="rounded-xl border border-gray-100 bg-white/60 backdrop-blur-sm p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-500">المستوى {idx + 1}</span>
                            {drillLevels.length > 1 && (
                              <button
                                onClick={() => setDrillLevels(prev => prev.filter((_, i) => i !== idx))}
                                className="text-[10px] text-red-400 hover:text-red-600"
                              >
                                حذف
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            placeholder="اسم الحقل (field)"
                            value={level.field}
                            onChange={e => {
                              const updated = [...drillLevels];
                              updated[idx] = { ...updated[idx], field: e.target.value };
                              setDrillLevels(updated);
                            }}
                            className="w-full rounded-lg border border-gray-200/80 bg-white/80 px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 focus:border-orange-300 focus:ring-1 focus:ring-orange-100 outline-none transition-all"
                          />
                          <input
                            type="text"
                            placeholder="التسمية (label)"
                            value={level.label}
                            onChange={e => {
                              const updated = [...drillLevels];
                              updated[idx] = { ...updated[idx], label: e.target.value };
                              setDrillLevels(updated);
                            }}
                            className="w-full rounded-lg border border-gray-200/80 bg-white/80 px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 focus:border-orange-300 focus:ring-1 focus:ring-orange-100 outline-none transition-all"
                          />
                        </div>
                      ))}

                      <button
                        onClick={() => setDrillLevels(prev => [...prev, { field: '', label: '' }])}
                        className="flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-600 font-medium transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        إضافة مستوى
                      </button>

                      <button
                        onClick={handleConfigureDrillDown}
                        disabled={drillDownMutation.isPending}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-orange-500 to-rose-500 px-4 py-2.5 text-sm font-medium text-white shadow-md hover:shadow-lg disabled:opacity-50 transition-all"
                      >
                        {drillDownMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
                        حفظ التنقل التفصيلي
                      </button>
                    </div>
                  )}

                  {/* ── Alerts Tab ── */}
                  {activeTab === 'alerts' && (
                    <div className="space-y-4">
                      <p className="text-xs text-gray-500">
                        إعداد تنبيهات ذكية لهذا العنصر
                        <span className="block text-[10px] text-gray-400 mt-0.5">Configure smart alerts for this element</span>
                      </p>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          العتبة
                          <span className="text-[10px] text-gray-400 mr-1">Threshold</span>
                        </label>
                        <input
                          type="number"
                          value={alertThreshold}
                          onChange={e => setAlertThreshold(Number(e.target.value))}
                          className="w-full rounded-xl border border-gray-200/80 bg-white/80 backdrop-blur-sm px-3 py-2.5 text-sm text-gray-700 focus:border-orange-300 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          الشرط
                          <span className="text-[10px] text-gray-400 mr-1">Condition</span>
                        </label>
                        <select
                          value={alertCondition}
                          onChange={e => setAlertCondition(e.target.value)}
                          className="w-full rounded-xl border border-gray-200/80 bg-white/80 backdrop-blur-sm px-3 py-2.5 text-sm text-gray-700 focus:border-orange-300 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                        >
                          <option value="above">أعلى من (Above)</option>
                          <option value="below">أقل من (Below)</option>
                          <option value="equal">يساوي (Equal)</option>
                          <option value="not_equal">لا يساوي (Not Equal)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          نوع التنبيه
                          <span className="text-[10px] text-gray-400 mr-1">Alert Type</span>
                        </label>
                        <select
                          value={alertType}
                          onChange={e => setAlertType(e.target.value)}
                          className="w-full rounded-xl border border-gray-200/80 bg-white/80 backdrop-blur-sm px-3 py-2.5 text-sm text-gray-700 focus:border-orange-300 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                        >
                          <option value="warning">تحذير (Warning)</option>
                          <option value="critical">حرج (Critical)</option>
                          <option value="info">معلومات (Info)</option>
                        </select>
                      </div>

                      <button
                        onClick={handleConfigureAlert}
                        disabled={alertMutation.isPending}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-orange-500 to-rose-500 px-4 py-2.5 text-sm font-medium text-white shadow-md hover:shadow-lg disabled:opacity-50 transition-all"
                      >
                        {alertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                        حفظ التنبيه
                      </button>
                    </div>
                  )}

                  {/* ── Links Tab ── */}
                  {activeTab === 'links' && (
                    <div className="space-y-4">
                      <p className="text-xs text-gray-500">
                        ربط هذا العنصر بعناصر أخرى للتصفية المتبادلة
                        <span className="block text-[10px] text-gray-400 mt-0.5">Link elements for cross-filtering</span>
                      </p>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          معرّفات العناصر المستهدفة
                          <span className="text-[10px] text-gray-400 mr-1">Target Element IDs (comma-separated)</span>
                        </label>
                        <input
                          type="text"
                          value={linkTargetIds}
                          onChange={e => setLinkTargetIds(e.target.value)}
                          placeholder="id1, id2, id3"
                          className="w-full rounded-xl border border-gray-200/80 bg-white/80 backdrop-blur-sm px-3 py-2.5 text-sm text-gray-700 placeholder:text-gray-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          عمود التصفية
                          <span className="text-[10px] text-gray-400 mr-1">Filter Column</span>
                        </label>
                        <input
                          type="text"
                          value={linkFilterColumn}
                          onChange={e => setLinkFilterColumn(e.target.value)}
                          placeholder="مثال: category_id"
                          className="w-full rounded-xl border border-gray-200/80 bg-white/80 backdrop-blur-sm px-3 py-2.5 text-sm text-gray-700 placeholder:text-gray-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                        />
                      </div>

                      {/* Quick-link from canvas elements */}
                      {canvasElements.filter(el => el.id !== selectedElementId).length > 0 && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                            ربط سريع من اللوحة
                            <span className="text-[10px] text-gray-400 mr-1">Quick link from canvas</span>
                          </label>
                          <div className="space-y-1.5 max-h-32 overflow-y-auto">
                            {canvasElements.filter(el => el.id !== selectedElementId).map(el => {
                              const Icon = getElementIcon(el.elementType);
                              const isLinked = linkTargetIds.includes(el.id);
                              return (
                                <button
                                  key={el.id}
                                  onClick={() => {
                                    if (isLinked) {
                                      setLinkTargetIds(prev => prev.split(',').map(s => s.trim()).filter(s => s !== el.id).join(', '));
                                    } else {
                                      setLinkTargetIds(prev => prev ? `${prev}, ${el.id}` : el.id);
                                    }
                                  }}
                                  className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all ${
                                    isLinked
                                      ? 'border-orange-300 bg-orange-50 text-orange-700'
                                      : 'border-gray-200 bg-white/80 text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                  <span className="truncate">{el.label}</span>
                                  {isLinked && <CheckCircle2 className="h-3.5 w-3.5 mr-auto text-orange-500" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={handleLinkElements}
                        disabled={linkMutation.isPending || !linkTargetIds.trim() || !linkFilterColumn.trim()}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-orange-500 to-rose-500 px-4 py-2.5 text-sm font-medium text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {linkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                        ربط العناصر
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
