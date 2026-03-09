"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Wand2,
  Code2,
  Move,
  Blocks,
  Gauge,
  Sparkles,
  ArrowLeft,
  Library,
  Activity,
  ExternalLink,
  Clock,
} from "lucide-react";
import { useSourceLibraryStore } from "@/lib/stores/source-library-store";
import SourceContextBanner from "@/components/workspaces/SourceContextBanner";
import ReplicationSessionBanner from "@/components/workspaces/ReplicationSessionBanner";
import ReplicationArtifactBanner from "@/components/workspaces/ReplicationArtifactBanner";
import ArtifactQuickApplyPanel from "@/components/workspaces/ArtifactQuickApplyPanel";
import WorkspaceBootstrapNotice from "@/components/workspaces/WorkspaceBootstrapNotice";
import WorkspaceGeneratedDraftPanel from "@/components/workspaces/WorkspaceGeneratedDraftPanel";
import { getDashboards, type Dashboard } from "@/lib/api/dashboard";


const modules = [
  {
    title: "Easy Mode",
    subtitle: "إنشاء سريع",
    route: "/dashboard/easy-mode",
    desc: "أنشئ لوحة خلال دقائق من وصف مختصر أو مصدر جاهز.",
    icon: <Wand2 className="h-5 w-5" />,
    tone: "from-violet-500 to-fuchsia-600",
  },
  {
    title: "Advanced Mode",
    subtitle: "تحكم احترافي",
    route: "/dashboard/advanced-mode",
    desc: "تحكم كامل في العناصر، الاستعلامات، وسلوك الواجهة.",
    icon: <Code2 className="h-5 w-5" />,
    tone: "from-blue-500 to-indigo-600",
  },
  {
    title: "Drag Studio",
    subtitle: "سحب وإفلات",
    route: "/dashboard/drag-elements",
    desc: "ابنِ اللوحة بصريًا عبر سحب العناصر وربطها بالبيانات.",
    icon: <Move className="h-5 w-5" />,
    tone: "from-cyan-500 to-sky-600",
  },
  {
    title: "Template Engine",
    subtitle: "قوالب ذكية",
    route: "/dashboard/templates",
    desc: "ابدأ من قوالب جاهزة وأعد ضبطها حسب هوية مشروعك.",
    icon: <Blocks className="h-5 w-5" />,
    tone: "from-amber-500 to-orange-600",
  },
  {
    title: "Simulation",
    subtitle: "محاكاة",
    route: "/dashboard/simulation",
    desc: "اختبر سيناريوهات وتحويلات قبل النشر النهائي.",
    icon: <Activity className="h-5 w-5" />,
    tone: "from-emerald-500 to-teal-600",
  },
  {
    title: "Performance",
    subtitle: "أداء",
    route: "/dashboard/performance",
    desc: "قياس وتحسين السرعة وتجربة الاستخدام للوحة.",
    icon: <Gauge className="h-5 w-5" />,
    tone: "from-rose-500 to-pink-600",
  },
];

export default function DashboardWorkspacePage() {
  const router = useRouter();
  const sources = useSourceLibraryStore((s) => s.sources);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboards() {
      try {
        const result = await getDashboards({ page: 1, pageSize: 10 });
        setDashboards(result.data);
      } catch {
        // API may not be reachable
      } finally {
        setLoading(false);
      }
    }
    loadDashboards();
  }, []);

  return (
    <div className="space-y-6" dir="rtl">
      <SourceContextBanner workspaceLabel="استوديو الـ Dashboard" />
      <ReplicationSessionBanner />
      <ReplicationArtifactBanner />
      <ArtifactQuickApplyPanel workspace="dashboard" />
      <WorkspaceBootstrapNotice workspace="dashboard" />
      <WorkspaceGeneratedDraftPanel workspace="dashboard" />

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-bl from-violet-700 via-indigo-700 to-blue-700 px-6 py-8 text-white shadow-xl lg:px-8">
        <div className="pointer-events-none absolute -left-14 -top-20 h-56 w-56 rounded-full bg-white/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-22 -right-12 h-60 w-60 rounded-full bg-violet-200/25 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              <LayoutDashboard className="h-4 w-4" />
              <span>Dashboard Intelligence Workspace</span>
            </div>
            <h1 className="text-2xl font-black lg:text-4xl">استوديو Dashboards</h1>
            <p className="mt-2 max-w-2xl text-sm text-violet-100 lg:text-base">
              بناء لوحات Ultra Premium بالسحب والإفلات، وربط مباشر مع مكتبتك المصدرية العالمية.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
              <p className="text-xl font-black">{sources.length}</p>
              <p className="text-xs text-violet-100">مصادر متاحة</p>
            </div>
            {!loading && (
              <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
                <p className="text-xl font-black">{dashboards.length}</p>
                <p className="text-xs text-violet-100">لوحة مؤشرات</p>
              </div>
            )}
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
              <p className="text-xl font-black">{modules.length}</p>
              <p className="text-xs text-violet-100">وحدات بناء</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <button
            key={mod.title}
            type="button"
            onClick={() => router.push(mod.route)}
            className="group rounded-2xl border border-gray-200 bg-white p-5 text-right shadow-sm transition hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
          >
            <div className={`mb-3 inline-flex rounded-lg bg-gradient-to-l p-2 text-white ${mod.tone}`}>{mod.icon}</div>
            <p className="text-base font-bold text-gray-900 dark:text-white">{mod.subtitle}</p>
            <p className="text-xs font-semibold text-violet-600 dark:text-violet-300">{mod.title}</p>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{mod.desc}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-rasid-700 dark:text-rasid-300">
              <span>الدخول للمسار</span>
              <ArrowLeft className="h-3.5 w-3.5" />
            </div>
          </button>
        ))}
      </section>

      {/* Existing Dashboards from API */}
      {!loading && dashboards.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 text-base font-bold text-gray-900 dark:text-white">اللوحات الحالية</h2>
          <div className="space-y-2">
            {dashboards.map((db) => (
              <button
                key={db.id}
                type="button"
                onClick={() => router.push(`/dashboard/${db.id}`)}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-right transition hover:border-violet-300 dark:border-gray-600 dark:bg-gray-700/40"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{db.nameAr || db.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="h-3 w-3" />
                    <span>{db.widgetCount} عنصر • {new Date(db.updatedAt).toLocaleDateString("ar-SA")}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${db.isPublic ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"}`}>
                    {db.isPublic ? "عامة" : "خاصة"}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">تشغيل سريع من المكتبة</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ابدأ لوحة جديدة من أي مصدر مرفوع.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push("/library")}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Library className="h-3.5 w-3.5" />
              <span>فتح المكتبة</span>
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/editor")}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-violet-500"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>لوحة جديدة</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
