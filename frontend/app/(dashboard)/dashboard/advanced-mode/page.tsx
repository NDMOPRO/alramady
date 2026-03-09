"use client";

import React from "react";
import PremiumRouteShell from "@/components/layout/PremiumRouteShell";
import LegacyAdvancedModePage from "./legacy";

export default function DashboardAdvancedModePage() {
  return (
    <PremiumRouteShell
      title="التحكم المتقدم للوحة"
      subtitle="Dashboard Advanced Mode"
      description="ضبط تفصيلي للعناصر والاستعلامات والمنطق التشغيلي لتحقيق أفضل تجربة تفاعلية."
      gradient="from-indigo-700 via-blue-700 to-slate-800"
    >
      <LegacyAdvancedModePage />
    </PremiumRouteShell>
  );
}
