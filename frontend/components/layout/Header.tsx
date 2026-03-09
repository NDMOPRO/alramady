"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Menu,
  Search,
  Bell,
  Moon,
  Sun,
  User,
  Settings,
  LogOut,
  ChevronDown,
  Command,
  Sparkles,
} from "lucide-react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useAppearanceStore } from "@/lib/stores/appearance-store";
import { persistUserAppearancePreferences } from "@/lib/api/appearance";
import { resolvePrimaryTitle } from "@/lib/navigation/routes";
import { OFFICIAL_MARK_URL, resolvePlatformName } from "@/lib/branding";

interface HeaderProps {
  onToggleMobileSidebar: () => void;
}

export default function Header({ onToggleMobileSidebar }: HeaderProps) {
  const pathname = usePathname();
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const setAppearanceMode = useAppearanceStore((s) => s.setMode);
  const platformAppearance = useAppearanceStore((s) => s.platformAppearance);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const platformName = resolvePlatformName(platformAppearance?.platformName);
  const userDisplayName = user?.name || "حساب راصد";
  const userRoleLabel = user?.role || "مستخدم المنصة";
  const userInitial = user?.name?.trim()?.charAt(0)?.toUpperCase() || "";

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [engineFromQuery, setEngineFromQuery] = useState<string | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const engineTitle: Record<string, string> = {
    data: "محرك البيانات",
    ai: "محرك الذكاء",
    reports: "محرك التقارير",
    presentations: "محرك العروض",
    library: "مكتبة المصادر",
    settings: "الإعدادات والحوكمة",
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const engine = new URLSearchParams(window.location.search).get("engine");
    setEngineFromQuery(engine);
  }, [pathname]);

  const pageTitle =
    (pathname === "/home" || pathname === "/") && engineFromQuery
      ? engineTitle[engineFromQuery] ?? "الكانفس الموحد"
      : resolvePrimaryTitle(pathname);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  const handleThemeToggle = async () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    setAppearanceMode(nextTheme);

    if (!user?.id) return;

    try {
      await persistUserAppearancePreferences(user.id, { mode: nextTheme });
    } catch {
      setTheme(theme);
      setAppearanceMode(theme);
    }
  };

  const handleQuickCommand = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("rasid:open-assistant", {
        detail: { route: pathname },
      })
    );
  };

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-xl"
      style={{
        background: "var(--app-header-bg)",
        borderColor: "var(--app-border)",
      }}
    >
      <div className="flex h-16 items-center justify-between gap-3 px-3 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileSidebar}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            aria-label="تبديل القائمة"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden sm:block">
            <p className="text-[11px] font-semibold tracking-wider text-[var(--app-text-muted)]">
              {platformName}
            </p>
            <h2 className="text-sm font-bold text-[var(--app-text)]">{pageTitle}</h2>
          </div>
        </div>

        <div className="hidden flex-1 px-4 lg:block">
          <button
            type="button"
            onClick={handleQuickCommand}
            aria-label="فتح راصد الذكي"
            title="فتح راصد الذكي"
            className="mx-auto flex w-full max-w-xl items-center justify-between rounded-xl border px-3 py-2 text-xs shadow-sm transition"
            style={{
              background: "var(--app-surface)",
              borderColor: "var(--app-border)",
              color: "var(--app-text-muted)",
            }}
          >
            <span className="inline-flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span>ابحث أو اكتب أمرًا سريعًا</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
              <Command className="h-3 w-3" />
              K
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => void handleThemeToggle()}
            className="rounded-xl p-2 transition"
            style={{ color: "var(--app-text-muted)" }}
            title={theme === "light" ? "الوضع الداكن" : "الوضع الفاتح"}
          >
            {theme === "light" ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
          </button>

          <div ref={notifRef} className="relative">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative rounded-xl p-2 transition"
              style={{ color: "var(--app-text-muted)" }}
              title="الإشعارات"
            >
              <Bell className="h-4.5 w-4.5" />
              <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500" />
            </button>

            {notificationsOpen && (
              <div className="absolute end-0 top-full z-50 mt-2 w-80 rounded-2xl border p-4 shadow-xl" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
                <h3 className="mb-3 text-sm font-bold text-[var(--app-text)]">
                  إشعارات راصد
                </h3>
                <div className="rounded-xl p-3" style={{ background: "var(--app-surface-muted)" }}>
                  <p className="text-sm text-[var(--app-text-muted)]">
                    لا توجد إشعارات جديدة حاليًا.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div ref={userMenuRef} className="relative ms-1">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-xl border px-2 py-1.5 transition"
              style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}
            >
              <div
                className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, var(--app-primary), var(--app-accent))" }}
                suppressHydrationWarning
              >
                {userInitial ? (
                  userInitial
                ) : (
                  <img src={OFFICIAL_MARK_URL} alt={platformName} className="h-5 w-5 object-contain" />
                )}
              </div>
              <div className="hidden text-start sm:block">
                <p className="text-xs font-semibold text-[var(--app-text)]" suppressHydrationWarning>
                  {userDisplayName}
                </p>
                <p className="text-[10px] text-[var(--app-text-muted)]" suppressHydrationWarning>{userRoleLabel}</p>
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
            </button>

            {userMenuOpen && (
              <div className="absolute end-0 top-full z-50 mt-2 w-56 rounded-2xl border py-1 shadow-xl" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
                <div className="border-b px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
                  <p className="text-sm font-semibold text-[var(--app-text)]">
                    {userDisplayName}
                  </p>
                  <p className="text-xs text-[var(--app-text-muted)]">{user?.email || "user@rasid.sa"}</p>
                </div>
                <button
                  onClick={() => setUserMenuOpen(false)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-black/5"
                  style={{ color: "var(--app-text)" }}
                >
                  <User className="h-4 w-4" />
                  <span>الملف الشخصي</span>
                </button>
                <button
                  onClick={() => setUserMenuOpen(false)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-black/5"
                  style={{ color: "var(--app-text)" }}
                >
                  <Settings className="h-4 w-4" />
                  <span>الإعدادات</span>
                </button>
                <div className="my-1 border-t" style={{ borderColor: "var(--app-border)" }} />
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20"
                >
                  <LogOut className="h-4 w-4" />
                  <span>تسجيل الخروج</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t px-3 py-1.5 text-[11px] text-[var(--app-text-muted)] lg:hidden" style={{ borderColor: "var(--app-border)" }}>
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-cyan-500" />
          {pageTitle}
        </span>
      </div>
    </header>
  );
}
