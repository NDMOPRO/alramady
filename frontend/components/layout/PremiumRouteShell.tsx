"use client";

import React from "react";
import { Sparkles } from "lucide-react";

interface PremiumRouteShellProps {
  title: string;
  subtitle: string;
  description: string;
  gradient: string;
  children: React.ReactNode;
}

export default function PremiumRouteShell({
  title,
  subtitle,
  description,
  gradient,
  children,
}: PremiumRouteShellProps) {
  return (
    <div className="space-y-6" dir="rtl">
      <section className={`relative overflow-hidden rounded-3xl bg-gradient-to-bl ${gradient} px-6 py-8 text-white shadow-xl lg:px-8`}>
        <div className="pointer-events-none absolute -left-14 -top-20 h-56 w-56 rounded-full bg-white/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-12 h-60 w-60 rounded-full bg-white/15 blur-3xl" />
        <div className="relative space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold">
            <Sparkles className="h-4 w-4" />
            <span>{subtitle}</span>
          </div>
          <div>
            <h1 className="text-2xl font-black lg:text-4xl">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/85 lg:text-base">{description}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white/70 p-3 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/70">
        {children}
      </section>
    </div>
  );
}

