"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  Database,
  BarChart3,
  FileText,
  Presentation,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useAppearanceStore } from "@/lib/stores/appearance-store";
import { primaryNavItems } from "@/lib/navigation/routes";
import { OFFICIAL_MARK_URL, resolveLogoUrl, resolvePlatformName, resolvePlatformTagline } from "@/lib/branding";

interface NavItem {
  id: string;
  nameAr: string;
  href: string;
  icon: LucideIcon;
}

const NAV_ICONS: Record<string, LucideIcon> = {
  home: Sparkles,
  data: Database,
  analysis: BarChart3,
  reports: FileText,
  presentations: Presentation,
  library: BookOpen,
  settings: Settings,
};

const mainNavItems: NavItem[] = primaryNavItems.map((item) => ({
  id: item.id,
  nameAr: item.nameAr,
  href: item.href,
  icon: NAV_ICONS[item.id] ?? Sparkles,
}));

interface SidebarProps {
  mobileSidebarOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ mobileSidebarOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const locale = useUIStore((s) => s.locale);
  const platformAppearance = useAppearanceStore((s) => s.platformAppearance);
  const isRTL = locale === "ar";
  const platformName = resolvePlatformName(platformAppearance?.platformName);
  const platformTagline = resolvePlatformTagline(platformAppearance?.headerTitle);
  const logoUrl = resolveLogoUrl(platformAppearance?.logoUrl);

  const isActive = (item: NavItem): boolean => {
    const nav = primaryNavItems.find((n) => n.id === item.id);
    if (!nav) return false;
    if (item.id === "home") {
      return pathname === "/home" || pathname === "/";
    }
    return nav.prefixes.some((prefix) => pathname.startsWith(prefix));
  };

  return (
    <>
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onMobileClose} />
      )}

      <aside
        className={`
          fixed inset-y-0 z-50 flex flex-col shadow-xl transition-all duration-300 lg:static
          ${isRTL ? "right-0" : "left-0"}
          ${sidebarOpen ? "w-64" : "w-20"}
          ${mobileSidebarOpen ? "translate-x-0" : isRTL ? "translate-x-full lg:translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{ background: "var(--app-sidebar-bg)" }}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b px-4" style={{ borderColor: "var(--app-sidebar-border)" }}>
          {sidebarOpen ? (
            <Link href="/home" className="flex items-center gap-3" onClick={onMobileClose}>
              <img src={logoUrl} alt={platformName} className="h-10 w-10 shrink-0 rounded-xl border border-white/10 bg-white object-contain p-1" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white">{platformName}</h1>
                <p className="-mt-1 text-[10px] text-slate-300">{platformTagline}</p>
              </div>
            </Link>
          ) : (
            <Link
              href="/home"
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white p-1 shadow-lg"
              onClick={onMobileClose}
            >
              <img src={OFFICIAL_MARK_URL} alt={platformName} className="h-full w-full object-contain" />
            </Link>
          )}
          <button
            onClick={toggleSidebar}
            className="hidden rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white lg:block"
            aria-label="تبديل الشريط الجانبي"
          >
            {isRTL ? (
              sidebarOpen ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />
            ) : (
              sidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200
                    ${active ? "text-white shadow-sm" : "text-slate-300 hover:bg-white/5 hover:text-white"}
                  `}
                  style={active ? { background: "rgba(255,255,255,0.12)" } : undefined}
                  title={sidebarOpen ? undefined : item.nameAr}
                  onClick={onMobileClose}
                >
                  <Icon
                    className={`h-5 w-5 shrink-0 ${active ? "text-rasid-400" : "text-gray-500 group-hover:text-gray-300"}`}
                  />
                  {sidebarOpen && <span className="truncate">{item.nameAr}</span>}
                  {active && (
                    <div
                      className={`absolute ${isRTL ? "-left-0" : "-right-0"} top-1/2 h-6 w-1 -translate-y-1/2 rounded-full`}
                      style={{ background: "var(--app-accent)" }}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 border-t p-3" style={{ borderColor: "var(--app-sidebar-border)" }}>
          <div className="flex items-center justify-center">
            {sidebarOpen ? (
              <p className="text-xs text-slate-300">{platformAppearance?.footerText || platformTagline}</p>
            ) : (
              <p className="text-[10px] text-slate-300">v3.0</p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
