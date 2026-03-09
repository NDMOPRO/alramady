"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  ScanSearch,
  ShieldCheck,
  Fingerprint,
  Microscope,
  ArrowLeft,
  Image,
  FileText,
  LayoutDashboard,
  Languages,
  Sparkles,
} from "lucide-react";
import { useSourceLibraryStore } from "@/lib/stores/source-library-store";
import SourceContextBanner from "@/components/workspaces/SourceContextBanner";


const strictPillars = [
  {
    title: "CDR + Layout Graph",
    desc: "إعادة بناء الهيكل التصميمي كتمثيل حي قابل للتحرير.",
    icon: <Fingerprint className="h-5 w-5" />,
    tone: "from-cyan-500 to-blue-600",
  },
  {
    title: "Dual Verification Gate",
    desc: "تحقق بنيوي + تحقق بصري قبل قبول أي مخرج.",
    icon: <ShieldCheck className="h-5 w-5" />,
    tone: "from-emerald-500 to-teal-600",
  },
  {
    title: "Hard Failure Policy",
    desc: "رفض تلقائي إذا هبطت الدقة تحت العتبات المحددة.",
    icon: <Microscope className="h-5 w-5" />,
    tone: "from-orange-500 to-red-600",
  },
];

const quickRoutes = [
  { title: "بدء مطابقة جديدة", route: "/replicate", icon: <ScanSearch className="h-4 w-4" /> },
  { title: "المبدأ الأساسي", route: "/replication/core-principle", icon: <ShieldCheck className="h-4 w-4" /> },
  { title: "مراحل المطابقة", route: "/replication/match-phases", icon: <Microscope className="h-4 w-4" /> },
  { title: "التحقق المزدوج", route: "/replication/dual-verify", icon: <Fingerprint className="h-4 w-4" /> },
];

export default function ReplicationWorkspacePage() {
  const router = useRouter();
  const sources = useSourceLibraryStore((s) => s.sources);

  const replicationSources = sources.filter(
    (s) => s.sourceType === "image" || s.sourceType === "pdf" || s.sourceType === "presentation"
  );

  return (
    <div className="space-y-6" dir="rtl">
      <SourceContextBanner workspaceLabel="محرك التطابق الحرفي" />

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-bl from-cyan-800 via-blue-800 to-indigo-800 px-6 py-8 text-white shadow-xl lg:px-8">
        <div className="pointer-events-none absolute -left-14 -top-20 h-56 w-56 rounded-full bg-white/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-12 h-60 w-60 rounded-full bg-cyan-200/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              <ScanSearch className="h-4 w-4" />
              <span>STRICT 1:1 Replication Core</span>
            </div>
            <h1 className="text-2xl font-black lg:text-4xl">محرك التطابق الحرفي</h1>
            <p className="mt-2 max-w-2xl text-sm text-cyan-100 lg:text-base">
              تحويل صورة/PDF/عرض إلى مخرجات حيّة (Dashboard/Report/Presentation) مع تطابق صارم 1:1.
            </p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-center">
            <p className="text-xl font-black">{replicationSources.length}</p>
            <p className="text-xs text-cyan-100">مصادر جاهزة للمطابقة</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {strictPillars.map((pillar) => (
          <div
            key={pillar.title}
            className="rounded-2xl border border-gray-200 bg-white p-5 text-right shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <div className={`mb-3 inline-flex rounded-lg bg-gradient-to-l p-2 text-white ${pillar.tone}`}>{pillar.icon}</div>
            <p className="text-base font-bold text-gray-900 dark:text-white">{pillar.title}</p>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{pillar.desc}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">تشغيل سريع</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {quickRoutes.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => router.push(item.route)}
                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-300"
                >
                  <span className="inline-flex items-center gap-2">{item.icon}{item.title}</span>
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs font-bold text-violet-700 transition hover:bg-violet-100 dark:border-violet-900/50 dark:bg-violet-900/20 dark:text-violet-300"
              >
                <LayoutDashboard className="mx-auto mb-1 h-4 w-4" />
                تحويل إلى Dashboard
              </button>
              <button
                type="button"
                onClick={() => router.push("/reports")}
                className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-xs font-bold text-orange-700 transition hover:bg-orange-100 dark:border-orange-900/50 dark:bg-orange-900/20 dark:text-orange-300"
              >
                <FileText className="mx-auto mb-1 h-4 w-4" />
                تحويل إلى Report
              </button>
              <button
                type="button"
                onClick={() => router.push("/localization")}
                className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-xs font-bold text-teal-700 transition hover:bg-teal-100 dark:border-teal-900/50 dark:bg-teal-900/20 dark:text-teal-300"
              >
                <Languages className="mx-auto mb-1 h-4 w-4" />
                تعريب تصميمي
              </button>
            </div>
          </div>
        </div>

        <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 lg:col-span-2">
          <h3 className="mb-3 text-base font-bold text-gray-900 dark:text-white">مصادر المطابقة</h3>
          {replicationSources.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              لا توجد ملفات مناسبة للمطابقة بعد.
            </div>
          ) : (
            <div className="space-y-2">
              {replicationSources.slice(0, 10).map((source) => (
                <div
                  key={source.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-600 dark:bg-gray-700/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">{source.name}</p>
                    <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                      {source.sourceType.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => router.push("/replicate")}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 py-2.5 text-xs font-bold text-white transition hover:bg-cyan-500"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>بدء مطابقة صارمة الآن</span>
          </button>

          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-gray-200 bg-gray-50 py-2 dark:border-gray-600 dark:bg-gray-700/40">
              <Image className="mx-auto mb-1 h-4 w-4 text-cyan-500" />
              <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">Image → Live</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 py-2 dark:border-gray-600 dark:bg-gray-700/40">
              <FileText className="mx-auto mb-1 h-4 w-4 text-cyan-500" />
              <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">PDF → Live</p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
