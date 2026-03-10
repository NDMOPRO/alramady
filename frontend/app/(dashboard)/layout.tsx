"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { isE2EAuthBypassed } from "@/lib/auth/e2e";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (isE2EAuthBypassed()) {
      return;
    }

    // Check both store state and localStorage directly to avoid race conditions
    const storedToken = typeof window !== "undefined" ? localStorage.getItem("rasid_token") : null;
    if (!isAuthenticated && !token && !storedToken) {
      router.replace("/login");
    }
  }, [isAuthenticated, token, router]);

  return <>{children}</>;
}
