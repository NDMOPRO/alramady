"use client";

import React from "react";
import PremiumRouteShell from "@/components/layout/PremiumRouteShell";
import LegacyEditorPage from "./legacy";

export default function DashboardEditorPage() {
  return (
    <PremiumRouteShell
      title="محرر الداشبورد الاحترافي"
      subtitle="Dashboard Full Editor"
      description="بيئة تحرير كاملة بالسحب والإفلات لبناء لوحات مؤسسية عالية الجودة."
      gradient="from-blue-700 via-cyan-700 to-teal-800"
    >
      <LegacyEditorPage />
    </PremiumRouteShell>
  );
}
