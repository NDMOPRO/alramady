"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Brain,
  Sparkles,
  Send,
  Bot,
  ShieldCheck,
  Activity,
  GitBranch,
  Gauge,
  ArrowLeft,
} from "lucide-react";
import SourceContextBanner from "@/components/workspaces/SourceContextBanner";


interface CapabilityCard {
  title: string;
  description: string;
  route: string;
  icon: React.ReactNode;
  tone: string;
}

const capabilities: CapabilityCard[] = [
  {
    title: "تحليل ذكي متعدد الخطوات",
    description: "تفكيك الطلب إلى خطة تنفيذ وتشغيلها على المحركات المناسبة.",
    route: "/ai?engine=analysis",
    icon: <Brain className="h-5 w-5" />,
    tone: "from-cyan-500 to-blue-600",
  },
  {
    title: "تحليل السبب الجذري",
    description: "اكتشاف العوامل المؤثرة وبناء سيناريوهات تفسيرية قابلة للتنفيذ.",
    route: "/ai?engine=analysis",
    icon: <Activity className="h-5 w-5" />,
    tone: "from-emerald-500 to-teal-600",
  },
  {
    title: "حوكمة وتدقيق مخرجات الذكاء الاصطناعي",
    description: "فحص التوافق، التتبع، وضبط جودة النتائج قبل النشر.",
    route: "/admin/settings?tab=governance",
    icon: <ShieldCheck className="h-5 w-5" />,
    tone: "from-orange-500 to-red-600",
  },
  {
    title: "تشغيل مسارات مترابطة",
    description: "ربط البيانات مع الداشبورد والتقارير والعروض في تدفق واحد.",
    route: "/ai?engine=replication",
    icon: <GitBranch className="h-5 w-5" />,
    tone: "from-violet-500 to-fuchsia-600",
  },
];

export default function AnalysisWorkspacePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  const runObserver = () => {
    const value = prompt.trim();
    if (value) {
      localStorage.setItem("rasid_pending_prompt", value);
    }
    router.push("/ai?engine=analysis");
  };

  return (
    <div className="space-y-6" dir="rtl">
      <SourceContextBanner workspaceLabel="مساحة التحليل" />

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-bl from-slate-900 via-indigo-900 to-blue-900 px-6 py-8 text-white shadow-xl lg:px-8">
        <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-cyan-400/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-14 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="relative space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold">
            <Gauge className="h-4 w-4" />
            <span>مركز التحليل</span>
          </div>
          <div>
            <h1 className="text-2xl font-black lg:text-4xl">مساحة التحليل الذكي</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-200 lg:text-base">
              من هنا تدير ذكاء المنصة بالكامل: التحليل، الاستدلال، الحوكمة، وربط المخرجات عبر كل المحركات.
            </p>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
            <div className="flex flex-col gap-2 lg:flex-row">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runObserver();
                  }
                }}
                placeholder="اكتب أمر التحليل المطلوب..."
                className="flex-1 rounded-xl border border-white/20 bg-slate-900/40 px-4 py-3 text-sm text-white placeholder:text-slate-300 focus:border-cyan-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={runObserver}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-cyan-400"
              >
                <Send className="h-4 w-4" />
                <span>تشغيل الراصد</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {capabilities.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => router.push(item.route)}
            className="group rounded-2xl border border-gray-200 bg-white p-5 text-right shadow-sm transition hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
          >
            <div className={`mb-3 inline-flex rounded-lg bg-gradient-to-l p-2 text-white ${item.tone}`}>{item.icon}</div>
            <p className="text-base font-bold text-gray-900 dark:text-white">{item.title}</p>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{item.description}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-rasid-700 dark:text-rasid-300">
              <span>فتح</span>
              <ArrowLeft className="h-3.5 w-3.5" />
            </div>
          </button>
        ))}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">وضع التحليل السريع</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">اختر مسارًا مباشرًا وابدأ فورًا.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/ai?engine=replication")}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-900/50 dark:bg-cyan-900/20 dark:text-cyan-300"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>تحليل التطابق 1:1</span>
            </button>
            <button
              type="button"
              onClick={() => router.push("/ai?engine=dashboard")}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100 dark:border-violet-900/50 dark:bg-violet-900/20 dark:text-violet-300"
            >
              <Bot className="h-3.5 w-3.5" />
              <span>تحليل الداشبورد</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
