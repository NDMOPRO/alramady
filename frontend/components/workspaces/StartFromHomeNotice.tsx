"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Home, PanelTopOpen } from "lucide-react";

interface AdvancedLink {
  label: string;
  href: string;
}

interface StartFromHomeNoticeProps {
  title?: string;
  description?: string;
  advancedLinks: AdvancedLink[];
}

export default function StartFromHomeNotice({
  title = "ابدأ من الصفحة الرئيسية",
  description = "طبقة الأوامر الذكية متاحة في الرئيسية فقط لتقليل التشتت.",
  advancedLinks,
}: StartFromHomeNoticeProps) {
  const router = useRouter();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-900/40 dark:bg-cyan-900/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-cyan-900 dark:text-cyan-100">{title}</p>
          <p className="mt-1 text-xs text-cyan-700 dark:text-cyan-300">{description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="inline-flex items-center gap-1 rounded-lg border border-cyan-300 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-800 dark:text-cyan-200 dark:hover:bg-cyan-900/30"
          >
            <Home className="h-3.5 w-3.5" />
            <span>الذهاب للرئيسية</span>
          </button>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-cyan-300 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-800 dark:text-cyan-200 dark:hover:bg-cyan-900/30"
          >
            <PanelTopOpen className="h-3.5 w-3.5" />
            <span>وضع متقدم</span>
          </button>
        </div>
      </div>

      {advancedOpen && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {advancedLinks.map((link) => (
            <button
              key={link.href + link.label}
              type="button"
              onClick={() => router.push(link.href)}
              className="inline-flex items-center justify-between rounded-xl border border-cyan-200 bg-white px-3 py-2 text-right text-xs font-semibold text-cyan-800 transition hover:bg-cyan-50 dark:border-cyan-900/40 dark:bg-slate-900/40 dark:text-cyan-200 dark:hover:bg-cyan-900/20"
            >
              <span>{link.label}</span>
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
