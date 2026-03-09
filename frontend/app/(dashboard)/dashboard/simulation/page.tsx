"use client";

import React from "react";
import PremiumRouteShell from "@/components/layout/PremiumRouteShell";
import LegacySimulationPage from "./legacy";

export default function DashboardSimulationPage() {
  return (
    <PremiumRouteShell
      title="محاكاة وتوليد ذكي"
      subtitle="Dashboard AI Simulation"
      description="اختبار سيناريوهات التصميم والبيانات وتوليد مقترحات محاكاة قبل الإطلاق."
      gradient="from-emerald-700 via-teal-700 to-cyan-800"
    >
      <LegacySimulationPage />
    </PremiumRouteShell>
  );
}
