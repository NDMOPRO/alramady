'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  dashboardEngine,
  TemplateItem,
  KPIDefinition,
  CompareResult,
} from '@/lib/api/dashboard-engine.api';
import {
  LayoutTemplate,
  Search,
  Filter,
  Eye,
  Copy,
  Star,
  Plus,
  Crown,
  Globe2,
  Layers,
  FolderOpen,
  X,
  ArrowLeftRight,
  Sparkles,
  Zap,
  ChevronLeft,
  Check,
  Loader2,
  AlertCircle,
  TrendingUp,
  Calculator,
  Tag,
  FileBarChart,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   Modal Wrapper
   ═══════════════════════════════════════════════════════════════ */
function GlassModal({
  open,
  onClose,
  title,
  titleEn,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  titleEn: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative w-full max-w-lg rounded-2xl border border-white/20 bg-white/90 p-6 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute start-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-xl font-bold text-gray-900 mb-0.5">{title}</h3>
        <p className="text-xs text-gray-400 mb-5">{titleEn}</p>
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Input helper
   ═══════════════════════════════════════════════════════════════ */
function FormInput({
  label,
  labelEn,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  labelEn: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-gray-700 mb-1">
        {label} <span className="text-[10px] text-gray-400 font-normal">({labelEn})</span>
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 focus:outline-none transition-all backdrop-blur-sm"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════════ */
export default function TemplatesPage() {
  const queryClient = useQueryClient();

  // ── State ──
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');

  // Modals
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Save as template form
  const [saveDashboardId, setSaveDashboardId] = useState('');
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveCategory, setSaveCategory] = useState('');

  // Create from template form
  const [createTemplateId, setCreateTemplateId] = useState('');
  const [createName, setCreateName] = useState('');
  const [createDatasetId, setCreateDatasetId] = useState('');

  // Compare
  const [compareId1, setCompareId1] = useState('');
  const [compareId2, setCompareId2] = useState('');
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);

  // Auto KPIs
  const [kpiDatasetId, setKpiDatasetId] = useState('');
  const [kpiResults, setKpiResults] = useState<KPIDefinition[] | null>(null);

  // ── Queries ──
  const {
    data: templatesData,
    isLoading: templatesLoading,
    error: templatesError,
  } = useQuery({
    queryKey: ['templates'],
    queryFn: () => dashboardEngine.templateList(),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['template-categories'],
    queryFn: () => dashboardEngine.getCategories(),
  });

  const templates: TemplateItem[] = templatesData?.data ?? [];
  const categories: string[] = categoriesData?.data ?? [];

  // ── Mutations ──
  const saveTemplateMut = useMutation({
    mutationFn: () =>
      dashboardEngine.saveAsTemplate(saveDashboardId, saveName, saveDescription, saveCategory),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['template-categories'] });
      setShowSaveModal(false);
      setSaveDashboardId('');
      setSaveName('');
      setSaveDescription('');
      setSaveCategory('');
    },
  });

  const createFromTemplateMut = useMutation({
    mutationFn: () =>
      dashboardEngine.createFromTemplate(createTemplateId, createName, createDatasetId),
    onSuccess: () => {
      setShowCreateModal(false);
      setCreateTemplateId('');
      setCreateName('');
      setCreateDatasetId('');
    },
  });

  const compareMut = useMutation({
    mutationFn: () => dashboardEngine.compareDashboards(compareId1, compareId2),
    onSuccess: (res) => setCompareResult(res.data),
  });

  const kpiMut = useMutation({
    mutationFn: () => dashboardEngine.autoGenerateKPIs(kpiDatasetId),
    onSuccess: (res) => setKpiResults(res.data),
  });

  // ── Derived ──
  const filtered = useMemo(() => {
    return templates.filter((t) => {
      const matchesSearch =
        !searchQuery ||
        t.name.includes(searchQuery) ||
        (t.description ?? '').includes(searchQuery);
      const matchesCategory =
        selectedCategory === 'الكل' || t.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [templates, searchQuery, selectedCategory]);

  const premiumCount = templates.filter((t) => t.isPremium).length;
  const publicCount = templates.filter((t) => t.isPublic).length;

  // ── Category gradient map ──
  const catGradients = [
    'from-pink-500 to-rose-400',
    'from-violet-500 to-purple-400',
    'from-blue-500 to-cyan-400',
    'from-emerald-500 to-teal-400',
    'from-amber-500 to-orange-400',
    'from-red-500 to-pink-400',
    'from-indigo-500 to-blue-400',
    'from-fuchsia-500 to-pink-400',
  ];
  const getCatGradient = (idx: number) => catGradients[idx % catGradients.length];

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      {/* ═══ Breadcrumb ═══ */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/dashboard" className="hover:text-pink-500 transition-colors">
          محرك لوحة المعلومات
        </Link>
        <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
        <span className="text-gray-600 font-medium">مكتبة القوالب</span>
      </div>

      {/* ═══ Hero Header ═══ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-bl from-pink-500 to-rose-600 p-8 lg:p-10 shadow-2xl shadow-pink-500/20">
        {/* Decorative circles */}
        <div className="absolute -top-20 -end-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 start-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute top-1/2 end-1/4 h-32 w-32 rounded-full bg-rose-300/20 blur-2xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                <LayoutTemplate className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-white tracking-tight">
                  مكتبة القوالب
                </h1>
                <p className="text-sm text-pink-100/80">Template Library</p>
              </div>
            </div>
            <p className="text-pink-100/70 text-sm max-w-lg leading-relaxed">
              قوالب احترافية جاهزة للاستخدام الفوري. احفظ لوحاتك كقوالب قابلة
              لاعادة الاستخدام، قارن بين اللوحات، واولّد مؤشرات الاداء تلقائياً.
            </p>
          </div>
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-2 rounded-2xl bg-white/20 px-6 py-3 text-sm font-bold text-white backdrop-blur-sm border border-white/30 hover:bg-white/30 transition-all shadow-lg hover:shadow-xl self-start"
          >
            <Plus className="h-4 w-4" />
            حفظ كقالب جديد
          </button>
        </div>
      </div>

      {/* ═══ Stats Row ═══ */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            value: templates.length,
            label: 'اجمالي القوالب',
            labelEn: 'Total Templates',
            icon: Layers,
            gradient: 'from-pink-500 to-rose-500',
            bg: 'bg-pink-50',
          },
          {
            value: categories.length,
            label: 'الفئات',
            labelEn: 'Categories',
            icon: FolderOpen,
            gradient: 'from-violet-500 to-purple-500',
            bg: 'bg-violet-50',
          },
          {
            value: premiumCount,
            label: 'قوالب مميزة',
            labelEn: 'Premium',
            icon: Crown,
            gradient: 'from-amber-500 to-yellow-500',
            bg: 'bg-amber-50',
          },
          {
            value: publicCount,
            label: 'قوالب عامة',
            labelEn: 'Public',
            icon: Globe2,
            gradient: 'from-emerald-500 to-teal-500',
            bg: 'bg-emerald-50',
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.labelEn}
              className={`group relative overflow-hidden rounded-2xl ${stat.bg} border border-white/60 p-5 shadow-sm hover:shadow-md transition-all`}
            >
              <div className={`absolute -top-4 -end-4 h-16 w-16 rounded-full bg-gradient-to-br ${stat.gradient} opacity-10 blur-xl group-hover:opacity-20 transition-opacity`} />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className={`text-3xl font-extrabold bg-gradient-to-br ${stat.gradient} bg-clip-text text-transparent`}>
                    {stat.value}
                  </p>
                  <p className="text-sm font-semibold text-gray-700 mt-1">{stat.label}</p>
                  <p className="text-[10px] text-gray-400">{stat.labelEn}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${stat.gradient} shadow-md`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ Search & Filter ═══ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="ابحث في القوالب ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-gray-200 bg-white/70 py-3 ps-11 pe-4 text-sm text-gray-700 placeholder:text-gray-300 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 focus:outline-none backdrop-blur-sm transition-all shadow-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400 shrink-0" />
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedCategory('الكل')}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                selectedCategory === 'الكل'
                  ? 'bg-gradient-to-l from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/25'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              الكل
            </button>
            {categories.map((cat, idx) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  selectedCategory === cat
                    ? `bg-gradient-to-l ${getCatGradient(idx)} text-white shadow-md`
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Loading / Error ═══ */}
      {templatesLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
          <p className="text-sm text-gray-400">جاري تحميل القوالب...</p>
        </div>
      )}

      {templatesError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-600 font-semibold">خطا في تحميل القوالب</p>
          <p className="text-xs text-red-400 mt-1">
            {templatesError instanceof Error ? templatesError.message : 'Unknown error'}
          </p>
        </div>
      )}

      {/* ═══ Template Grid ═══ */}
      {!templatesLoading && !templatesError && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((template) => (
            <div
              key={template.id}
              className="group relative overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-xl hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              {/* Gradient top border */}
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-l from-pink-500 via-rose-400 to-fuchsia-500" />

              {/* Thumbnail / placeholder */}
              <div className="relative h-36 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden">
                {template.thumbnail ? (
                  <img
                    src={template.thumbnail}
                    alt={template.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <LayoutTemplate className="h-10 w-10 text-gray-300 group-hover:text-pink-300 transition-colors" />
                    <span className="text-[10px] text-gray-300">معاينة القالب</span>
                  </div>
                )}

                {/* Badges */}
                <div className="absolute top-3 end-3 flex flex-col gap-1.5">
                  {template.isPremium && (
                    <span className="flex items-center gap-1 rounded-full bg-gradient-to-l from-amber-400 to-yellow-500 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 shadow-md shadow-amber-500/20">
                      <Crown className="h-3 w-3" />
                      مميز
                    </span>
                  )}
                  {!template.isPremium && (
                    <span className="rounded-full bg-white/80 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-semibold text-gray-500 border border-gray-200">
                      مجاني
                    </span>
                  )}
                </div>

                {/* Category badge */}
                <div className="absolute bottom-3 start-3">
                  <span className="rounded-full bg-white/80 backdrop-blur-sm px-3 py-1 text-[10px] font-semibold text-gray-600 border border-gray-200 flex items-center gap-1">
                    <Tag className="h-2.5 w-2.5" />
                    {template.category}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <h3 className="font-bold text-gray-900 text-sm leading-tight mb-1 line-clamp-1">
                  {template.name}
                </h3>
                {template.description && (
                  <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 mb-3">
                    {template.description}
                  </p>
                )}
                {!template.description && <div className="mb-3" />}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setCreateTemplateId(template.id);
                      setShowCreateModal(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-l from-pink-500 to-rose-500 px-3 py-2 text-xs font-bold text-white shadow-md shadow-pink-500/20 hover:shadow-lg hover:shadow-pink-500/30 transition-all"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    استخدام القالب
                  </button>
                  <button className="flex items-center justify-center rounded-xl border border-gray-200 p-2 hover:bg-gray-50 hover:border-pink-200 transition-all group/eye">
                    <Eye className="h-4 w-4 text-gray-400 group-hover/eye:text-pink-500 transition-colors" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && !templatesLoading && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 gap-3">
              <Search className="h-10 w-10 text-gray-200" />
              <p className="text-sm text-gray-400 font-semibold">لا توجد قوالب مطابقة</p>
              <p className="text-xs text-gray-300">No matching templates</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ Compare Dashboards Section ═══ */}
      <div className="rounded-3xl border border-white/60 bg-white/70 p-6 lg:p-8 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 shadow-md">
            <ArrowLeftRight className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">مقارنة اللوحات</h2>
            <p className="text-xs text-gray-400">Compare Dashboards</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <FormInput
            label="معرّف اللوحة الاولى"
            labelEn="Dashboard ID 1"
            value={compareId1}
            onChange={setCompareId1}
            placeholder="ادخل معرّف اللوحة الاولى"
          />
          <FormInput
            label="معرّف اللوحة الثانية"
            labelEn="Dashboard ID 2"
            value={compareId2}
            onChange={setCompareId2}
            placeholder="ادخل معرّف اللوحة الثانية"
          />
        </div>

        <button
          onClick={() => compareMut.mutate()}
          disabled={!compareId1 || !compareId2 || compareMut.isPending}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-l from-indigo-500 to-blue-500 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-500/20 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {compareMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowLeftRight className="h-4 w-4" />
          )}
          مقارنة
        </button>

        {compareMut.isError && (
          <p className="mt-3 text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            {compareMut.error instanceof Error ? compareMut.error.message : 'حدث خطا'}
          </p>
        )}

        {/* Compare Result */}
        {compareResult && (
          <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Dashboard 1 */}
              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-blue-50 p-5">
                <p className="text-xs text-indigo-400 font-semibold mb-1">اللوحة الاولى</p>
                <p className="font-bold text-gray-900 text-sm">{compareResult.dashboard1.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">ID: {compareResult.dashboard1.id}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-lg bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-600">
                    {compareResult.dashboard1.elementsCount} عنصر
                  </span>
                </div>
              </div>
              {/* Dashboard 2 */}
              <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-5">
                <p className="text-xs text-blue-400 font-semibold mb-1">اللوحة الثانية</p>
                <p className="font-bold text-gray-900 text-sm">{compareResult.dashboard2.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">ID: {compareResult.dashboard2.id}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-bold text-blue-600">
                    {compareResult.dashboard2.elementsCount} عنصر
                  </span>
                </div>
              </div>
            </div>

            {/* Common & Differences */}
            <div className="rounded-2xl border border-gray-100 bg-white/60 p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-gray-700">
                    عناصر مشتركة:{' '}
                    <span className="text-emerald-600">{compareResult.commonElements}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-gray-700">
                    اختلافات:{' '}
                    <span className="text-amber-600">{compareResult.differences.length}</span>
                  </span>
                </div>
              </div>

              {compareResult.differences.length > 0 && (
                <div className="space-y-2">
                  {compareResult.differences.map((diff, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-2.5"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-700">
                        {i + 1}
                      </span>
                      <p className="text-xs text-amber-800 leading-relaxed">{diff}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ Auto KPIs Section ═══ */}
      <div className="rounded-3xl border border-white/60 bg-white/70 p-6 lg:p-8 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-md">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">توليد المؤشرات تلقائياً</h2>
            <p className="text-xs text-gray-400">Auto-Generate KPIs</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-end gap-4">
          <div className="flex-1 w-full">
            <FormInput
              label="معرّف مجموعة البيانات"
              labelEn="Dataset ID"
              value={kpiDatasetId}
              onChange={setKpiDatasetId}
              placeholder="ادخل معرّف مجموعة البيانات"
            />
          </div>
          <button
            onClick={() => kpiMut.mutate()}
            disabled={!kpiDatasetId || kpiMut.isPending}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-500 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all mb-4"
          >
            {kpiMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            توليد المؤشرات
          </button>
        </div>

        {kpiMut.isError && (
          <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            {kpiMut.error instanceof Error ? kpiMut.error.message : 'حدث خطا'}
          </p>
        )}

        {/* KPI Results */}
        {kpiResults && kpiResults.length > 0 && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {kpiResults.map((kpi, idx) => (
              <div
                key={idx}
                className="group relative overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-teal-50/50 p-5 hover:shadow-md transition-all"
              >
                <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-l from-emerald-400 to-teal-400" />

                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{kpi.nameAr}</p>
                    <p className="text-[10px] text-gray-400">{kpi.name}</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calculator className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <code className="text-[11px] text-gray-600 bg-white/60 rounded-lg px-2 py-0.5 border border-gray-100 font-mono truncate">
                      {kpi.formula}
                    </code>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <FileBarChart className="h-3 w-3" />
                      {kpi.column}
                    </span>
                    <span>{kpi.unit}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5">{kpi.format}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {kpiResults && kpiResults.length === 0 && (
          <div className="mt-6 text-center py-8">
            <p className="text-sm text-gray-400">لم يتم العثور على مؤشرات لهذه البيانات</p>
          </div>
        )}
      </div>

      {/* ═══ Save as Template Modal ═══ */}
      <GlassModal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title="حفظ كقالب جديد"
        titleEn="Save as Template"
      >
        <FormInput
          label="معرّف اللوحة"
          labelEn="Dashboard ID"
          value={saveDashboardId}
          onChange={setSaveDashboardId}
          placeholder="ادخل معرّف اللوحة"
        />
        <FormInput
          label="اسم القالب"
          labelEn="Template Name"
          value={saveName}
          onChange={setSaveName}
          placeholder="مثال: لوحة المبيعات التنفيذية"
        />
        <FormInput
          label="الوصف"
          labelEn="Description"
          value={saveDescription}
          onChange={setSaveDescription}
          placeholder="وصف مختصر للقالب"
        />
        <FormInput
          label="الفئة"
          labelEn="Category"
          value={saveCategory}
          onChange={setSaveCategory}
          placeholder="مثال: مالي، موارد بشرية، تسويق"
        />

        {saveTemplateMut.isError && (
          <p className="mb-3 text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            {saveTemplateMut.error instanceof Error ? saveTemplateMut.error.message : 'حدث خطا'}
          </p>
        )}

        <button
          onClick={() => saveTemplateMut.mutate()}
          disabled={!saveDashboardId || !saveName || !saveCategory || saveTemplateMut.isPending}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-pink-500 to-rose-500 py-3 text-sm font-bold text-white shadow-md shadow-pink-500/20 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saveTemplateMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Star className="h-4 w-4" />
          )}
          حفظ القالب
        </button>
      </GlassModal>

      {/* ═══ Create from Template Modal ═══ */}
      <GlassModal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreateTemplateId('');
        }}
        title="انشاء لوحة من قالب"
        titleEn="Create from Template"
      >
        <FormInput
          label="معرّف القالب"
          labelEn="Template ID"
          value={createTemplateId}
          onChange={setCreateTemplateId}
          placeholder="معرّف القالب"
        />
        <FormInput
          label="اسم اللوحة الجديدة"
          labelEn="New Dashboard Name"
          value={createName}
          onChange={setCreateName}
          placeholder="اسم اللوحة الجديدة"
        />
        <FormInput
          label="معرّف مجموعة البيانات"
          labelEn="Dataset ID"
          value={createDatasetId}
          onChange={setCreateDatasetId}
          placeholder="معرّف مجموعة البيانات المطلوبة"
        />

        {createFromTemplateMut.isError && (
          <p className="mb-3 text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            {createFromTemplateMut.error instanceof Error
              ? createFromTemplateMut.error.message
              : 'حدث خطا'}
          </p>
        )}

        <button
          onClick={() => createFromTemplateMut.mutate()}
          disabled={
            !createTemplateId || !createName || !createDatasetId || createFromTemplateMut.isPending
          }
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-pink-500 to-rose-500 py-3 text-sm font-bold text-white shadow-md shadow-pink-500/20 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {createFromTemplateMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          انشاء اللوحة
        </button>
      </GlassModal>
    </div>
  );
}
