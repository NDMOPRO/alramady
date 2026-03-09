"use client";

import React from "react";
import PremiumRouteShell from "@/components/layout/PremiumRouteShell";
import LegacyEasyModePage from "./legacy";

export default function DashboardEasyModePage() {
  return (
    <PremiumRouteShell
      title="لوحات سريعة بالذكاء"
      subtitle="Dashboard Easy Mode"
      description="مسار إنشاء سريع للوحة احترافية اعتمادًا على وصفك أو المصادر الجاهزة في المكتبة."
      gradient="from-violet-700 via-purple-700 to-fuchsia-800"
    >
      <LegacyEasyModePage />
    </PremiumRouteShell>
  );
}
