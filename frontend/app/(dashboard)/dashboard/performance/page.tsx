"use client";

import React from "react";
import PremiumRouteShell from "@/components/layout/PremiumRouteShell";
import LegacyPerformancePage from "./legacy";

export default function DashboardPerformancePage() {
  return (
    <PremiumRouteShell
      title="تحليل أداء اللوحات"
      subtitle="Dashboard Performance"
      description="مراقبة المؤشرات الزمنية، التحميل، وكفاءة الاستعلام لتحسين الأداء."
      gradient="from-slate-700 via-gray-700 to-zinc-800"
    >
      <LegacyPerformancePage />
    </PremiumRouteShell>
  );
}
