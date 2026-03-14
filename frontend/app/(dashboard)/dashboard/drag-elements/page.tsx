"use client";

import React, { Suspense } from "react";
import PremiumRouteShell from "@/components/layout/PremiumRouteShell";
import LegacyDragElementsPage from "./legacy";

export default function DashboardDragElementsPage() {
  return (
    <PremiumRouteShell
      title="السحب والربط المرن"
      subtitle="Dashboard Drag Studio"
      description="بيئة تفاعلية لبناء اللوحة عبر سحب العناصر وربطها بالبيانات مباشرة."
      gradient="from-fuchsia-700 via-pink-700 to-rose-800"
    >
      <Suspense fallback={<div className="flex items-center justify-center p-8">جاري التحميل...</div>}>
        <LegacyDragElementsPage />
      </Suspense>
    </PremiumRouteShell>
  );
}
