'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Sparkles, Code, MousePointerClick, Layout, Paintbrush, Palette,
  Cpu, Gauge, ArrowUpLeft, BarChart3, PieChart, Eye, BookTemplate,
  Plus, Loader2, Settings, LayoutDashboard, Layers,
} from 'lucide-react';
import { dashboardEngine, DashboardItem, TemplateItem } from '@/lib/api/dashboard-engine.api';

/* ═══════════════════════════════════════════════════════════════
   Module definitions — 8 sub-pages
   ═══════════════════════════════════════════════════════════════ */

const modules = [
  {
    title: 'Easy Mode',
    titleAr: 'الوضع السهل',
    href: '/dashboard/easy-mode',
    icon: Sparkles,
    gradient: 'from-violet-500 to-purple-600',
    desc: 'إنشاء لوحة بنقرة واحدة بذكاء اصطناعي',
  },
  {
    title: 'Advanced Mode',
    titleAr: 'الوضع المتقدم',
    href: '/dashboard/advanced-mode',
    icon: Code,
    gradient: 'from-indigo-500 to-blue-600',
    desc: 'تحكّم كامل بكل تفصيل في لوحتك',
  },
  {
    title: 'Drag Elements',
    titleAr: 'السحب والربط',
    href: '/dashboard/drag-elements',
    icon: MousePointerClick,
    gradient: 'from-fuchsia-500 to-pink-600',
    desc: 'اسحب العناصر واربطها بالبيانات مباشرة',
  },
  {
    title: 'Full Editor',
    titleAr: 'محرر متكامل',
    href: '/dashboard/editor',
    icon: Layout,
    gradient: 'from-blue-500 to-cyan-600',
    desc: 'محرر احترافي بالسحب والإفلات المتقدم',
  },
  {
    title: 'Post-Edit',
    titleAr: 'ما بعد التحرير',
    href: '/dashboard/post-edit',
    icon: Paintbrush,
    gradient: 'from-amber-500 to-orange-600',
    desc: 'عدّل الأنماط والمخططات بعد الإنشاء',
  },
  {
    title: 'Template Library',
    titleAr: 'مكتبة القوالب',
    href: '/dashboard/templates',
    icon: Palette,
    gradient: 'from-pink-500 to-rose-600',
    desc: 'قوالب جاهزة واحترافية لجميع القطاعات',
  },
  {
    title: 'AI Simulation',
    titleAr: 'المحاكاة الذكية',
    href: '/dashboard/simulation',
    icon: Cpu,
    gradient: 'from-emerald-500 to-teal-600',
    desc: 'حاكِ لوحات من صور أو أوامر نصية بالذكاء الاصطناعي',
  },
  {
    title: 'Performance',
    titleAr: 'الأداء والتحسين',
    href: '/dashboard/performance',
    icon: Gauge,
    gradient: 'from-purple-500 to-violet-600',
    desc: 'راقب الأداء وحسّن السرعة والتجميعات',
  },
];

/* ═══════════════════════════════════════════════════════════════
   Page Component
   ═══════════════════════════════════════════════════════════════ */

export default function DashboardEnginePage() {
  /* ── Data fetching ── */
  const {
    data: dashboardsRes,
    isLoading: loadingDashboards,
  } = useQuery({
    queryKey: ['dashboard-engine-list'],
    queryFn: () => dashboardEngine.listDashboards(),
  });

  const {
    data: templatesRes,
    isLoading: loadingTemplates,
  } = useQuery({
    queryKey: ['dashboard-engine-templates'],
    queryFn: () => dashboardEngine.templateList(),
  });

  const {
    data: performanceRes,
    isLoading: loadingPerformance,
  } = useQuery({
    queryKey: ['dashboard-engine-performance'],
    queryFn: () => dashboardEngine.performanceList(),
  });

  const dashboards: DashboardItem[] = dashboardsRes?.data ?? [];
  const templates: TemplateItem[] = templatesRes?.data ?? [];
  const performanceEntries = performanceRes?.data ?? [];

  const totalDashboards = dashboards.length;
  const totalWidgets = 0; // widgets counted from separate endpoint
  const publishedCount = dashboards.filter((d) => d.status === 'published').length;
  const templatesCount = templates.length;

  const isLoading = loadingDashboards || loadingTemplates || loadingPerformance;

  /* ── Stat cards config ── */
  const stats = [
    {
      label: 'إجمالي اللوحات',
      labelEn: 'Total Dashboards',
      value: totalDashboards,
      icon: BarChart3,
      gradient: 'from-violet-500 to-purple-600',
      bgLight: 'bg-violet-50',
    },
    {
      label: 'إجمالي الأدوات',
      labelEn: 'Total Widgets',
      value: totalWidgets,
      icon: PieChart,
      gradient: 'from-indigo-500 to-blue-600',
      bgLight: 'bg-indigo-50',
    },
    {
      label: 'لوحات منشورة',
      labelEn: 'Published',
      value: publishedCount,
      icon: Eye,
      gradient: 'from-emerald-500 to-teal-600',
      bgLight: 'bg-emerald-50',
    },
    {
      label: 'القوالب',
      labelEn: 'Templates',
      value: templatesCount,
      icon: BookTemplate,
      gradient: 'from-amber-500 to-orange-600',
      bgLight: 'bg-amber-50',
    },
  ];

  /* ════════════════════════════════════════════════════════════
     Render
     ════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen space-y-8 pb-16">
      {/* ── Hero Header with Glassmorphism ── */}
      <section className="animate-fade-in relative overflow-hidden rounded-2xl bg-gradient-to-bl from-violet-600 via-purple-600 to-indigo-700 px-8 py-10">
        {/* Decorative blurred orbs */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-40 w-40 rounded-full bg-fuchsia-400/15 blur-2xl" />

        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
              <LayoutDashboard className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">
                محرك لوحات المعلومات
              </h1>
              <p className="mt-1 text-lg font-medium text-white/70">
                Dashboard Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/easy-mode"
              className="flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-md transition-all hover:bg-white/20"
            >
              <Sparkles className="h-4 w-4" />
              إنشاء سريع
            </Link>
            <Link
              href="/dashboard/editor"
              className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-purple-700 shadow-lg shadow-purple-900/30 transition-all hover:shadow-xl hover:shadow-purple-900/40"
            >
              <Plus className="h-4 w-4" />
              لوحة جديدة
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stat Cards with Gradient Borders ── */}
      <section className="animate-fade-in grid grid-cols-2 gap-5 lg:grid-cols-4" style={{ animationDelay: '100ms' }}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.labelEn}
              className="group relative overflow-hidden rounded-2xl bg-white p-[1px] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              {/* Gradient border effect */}
              <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${stat.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
              <div className="relative rounded-2xl bg-white p-6">
                <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${stat.bgLight}`}>
                  <Icon className={`h-5 w-5 bg-gradient-to-br ${stat.gradient} bg-clip-text`} style={{ color: 'inherit' }} />
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

      {/* ── Module Cards (8 cards) ── */}
      <section className="animate-fade-in" style={{ animationDelay: '200ms' }}>
        <div className="mb-5 flex items-center gap-3">
          <Layers className="h-5 w-5 text-purple-600" />
          <h2 className="text-xl font-bold text-gray-900">الوحدات</h2>
          <span className="text-sm text-gray-400">Modules</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link
                key={mod.href}
                href={mod.href}
                className="group relative overflow-hidden rounded-2xl border border-gray-100/80 bg-white/70 p-6 shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-purple-200 hover:shadow-xl"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${mod.gradient} shadow-md`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <ArrowUpLeft className="h-5 w-5 text-gray-200 transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 group-hover:text-purple-500" />
                </div>
                <h3 className="text-base font-bold text-gray-900">{mod.titleAr}</h3>
                <p className="text-xs font-medium text-purple-500/70">{mod.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{mod.desc}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Recent Dashboards Table ── */}
      <section className="animate-fade-in" style={{ animationDelay: '300ms' }}>
        <div className="overflow-hidden rounded-2xl border border-gray-100/80 bg-white/80 shadow-sm backdrop-blur-xl">
          {/* Table Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-7 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
                <BarChart3 className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">اللوحات الأخيرة</h2>
                <p className="text-xs text-gray-400">Recent Dashboards</p>
              </div>
            </div>
            <Link
              href="/dashboard/editor"
              className="rounded-lg bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-600 transition-colors hover:bg-purple-100"
            >
              عرض الكل
            </Link>
          </div>

          {/* Table Body */}
          {loadingDashboards ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                <p className="text-sm text-gray-400">جاري تحميل اللوحات...</p>
              </div>
            </div>
          ) : dashboards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-50">
                <LayoutDashboard className="h-8 w-8 text-purple-300" />
              </div>
              <p className="text-base font-semibold text-gray-500">لا توجد لوحات بعد</p>
              <p className="mt-1 text-sm text-gray-400">أنشئ لوحة معلومات جديدة للبدء</p>
              <Link
                href="/dashboard/easy-mode"
                className="mt-5 flex items-center gap-2 rounded-xl bg-gradient-to-l from-violet-600 to-purple-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-purple-600/30 transition-all hover:shadow-xl"
              >
                <Plus className="h-4 w-4" />
                إنشاء أول لوحة
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-7 py-3.5 text-start text-xs font-bold uppercase tracking-wider text-gray-500">
                      اسم اللوحة
                    </th>
                    <th className="px-7 py-3.5 text-start text-xs font-bold uppercase tracking-wider text-gray-500">
                      الإصدار
                    </th>
                    <th className="px-7 py-3.5 text-start text-xs font-bold uppercase tracking-wider text-gray-500">
                      آخر تعديل
                    </th>
                    <th className="px-7 py-3.5 text-start text-xs font-bold uppercase tracking-wider text-gray-500">
                      الحالة
                    </th>
                    <th className="px-7 py-3.5 text-start text-xs font-bold uppercase tracking-wider text-gray-500">
                      إجراءات
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dashboards.slice(0, 8).map((db, idx) => (
                    <tr
                      key={db.id}
                      className={`border-b border-gray-50 transition-colors hover:bg-purple-50/40 ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                      }`}
                    >
                      <td className="px-7 py-4">
                        <p className="font-bold text-gray-900">{db.name}</p>
                        {db.description && (
                          <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{db.description}</p>
                        )}
                      </td>
                      <td className="px-7 py-4">
                        <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600">
                          v{db.version ?? 1}
                        </span>
                      </td>
                      <td className="px-7 py-4 text-gray-500">
                        {new Date(db.updatedAt).toLocaleDateString('ar-SA', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-7 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                            db.status === 'published'
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${
                              db.status === 'published' ? 'bg-emerald-500' : 'bg-gray-400'
                            }`}
                          />
                          {db.status === 'published' ? 'منشور' : 'مسودة'}
                        </span>
                      </td>
                      <td className="px-7 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/${db.id}`}
                            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-purple-50 hover:text-purple-600"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <Link
                            href={`/dashboard/${db.id}/edit`}
                            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-purple-50 hover:text-purple-600"
                          >
                            <Settings className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
