"use client";

import "./globals.css";
import React, { useState, useEffect } from "react";
import { Space_Grotesk, Tajawal } from "next/font/google";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import AppearanceBootstrap from "@/components/layout/AppearanceBootstrap";
import { ToastProvider } from "@/components/ui/Toast";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { OFFICIAL_PLATFORM_NAME, OFFICIAL_PLATFORM_TAGLINE } from "@/lib/branding";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const tajawal = Tajawal({
  subsets: ["arabic"],
  variable: "--font-tajawal",
  weight: ["300", "400", "500", "700", "800"],
  display: "swap",
});

const AUTH_PAGES = ["/login", "/register", "/(auth)"];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const theme = useUIStore((s) => s.theme);
  const setLocale = useUIStore((s) => s.setLocale);
  const initialize = useAuthStore((s) => s.initialize);

  const locale = "ar";
  const isRTL = true;
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));
  const isImmersiveHome = false;

  useEffect(() => {
    initialize();
    setLocale("ar");
  }, [initialize, setLocale]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  return (
    <html
      lang={locale}
      dir={isRTL ? "rtl" : "ltr"}
      className={`${spaceGrotesk.variable} ${tajawal.variable} ${theme === "dark" ? "dark" : ""}`}
      suppressHydrationWarning
    >
      <head>
        <title>{`${OFFICIAL_PLATFORM_NAME} - ${OFFICIAL_PLATFORM_TAGLINE}`}</title>
        <meta
          name="description"
          content={`${OFFICIAL_PLATFORM_NAME} - ${OFFICIAL_PLATFORM_TAGLINE}`}
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/rasid-mark.svg" type="image/svg+xml" />
      </head>
      <body className={`${isRTL ? "font-arabic" : "font-sans"} antialiased`}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AppearanceBootstrap />
            {isAuthPage ? (
              <main className="min-h-screen">{children}</main>
            ) : isImmersiveHome ? (
              <main className="relative min-h-screen overflow-y-auto">
                <div className="app-shell-glow pointer-events-none absolute inset-0 -z-10" />
                {children}
              </main>
            ) : (
              <div className="relative flex h-screen overflow-hidden">
                <div className="app-shell-glow pointer-events-none absolute inset-0 -z-10" />
                <Sidebar
                  mobileSidebarOpen={mobileSidebarOpen}
                  onMobileClose={() => setMobileSidebarOpen(false)}
                />
                <div className="flex flex-1 flex-col overflow-hidden">
                  <Header
                    onToggleMobileSidebar={() =>
                      setMobileSidebarOpen(!mobileSidebarOpen)
                    }
                  />
                  <main className="flex-1 overflow-y-auto p-3 lg:p-6">
                    {children}
                  </main>
                </div>
              </div>
            )}
          </ToastProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
