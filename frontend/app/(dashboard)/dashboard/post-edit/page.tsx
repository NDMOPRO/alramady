"use client";

import React from "react";
import PremiumRouteShell from "@/components/layout/PremiumRouteShell";
import LegacyPostEditPage from "./legacy";

export default function DashboardPostEditPage() {
  return (
    <PremiumRouteShell
      title="مرحلة ما بعد التحرير"
      subtitle="Dashboard Post Edit"
      description="تحسين بصري ومراجعة نهائية للعناصر والتنسيق قبل النشر الفعلي."
      gradient="from-orange-700 via-amber-700 to-yellow-800"
    >
      <LegacyPostEditPage />
    </PremiumRouteShell>
  );
}
