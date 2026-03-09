"use client";

import React from "react";
import PremiumRouteShell from "@/components/layout/PremiumRouteShell";
import LegacyDashboardTemplatesPage from "./legacy";

export default function DashboardTemplatesPage() {
  return (
    <PremiumRouteShell
      title="مكتبة قوالب الداشبورد"
      subtitle="Dashboard Templates"
      description="قوالب جاهزة قابلة للتخصيص الفوري بما يتوافق مع هوية المؤسسة والبيانات الحية."
      gradient="from-amber-700 via-orange-700 to-rose-800"
    >
      <LegacyDashboardTemplatesPage />
    </PremiumRouteShell>
  );
}
