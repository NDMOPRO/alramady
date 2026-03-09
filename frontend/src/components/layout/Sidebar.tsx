'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Database,
  BarChart3,
  FileText,
  Presentation,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Languages,
  LucideIcon,
} from 'lucide-react';
import { useAppStore } from '@/store/app';
import { useLocale } from '@/hooks/useLocale';

interface NavItem {
  name: string;
  nameAr: string;
  href: string;
  icon: LucideIcon;
  color: string;
}

const navItems: NavItem[] = [
  { name: 'Home', nameAr: 'الرئيسية', href: '/home', icon: Home, color: 'text-cyan-600' },
  { name: 'Data', nameAr: 'البيانات', href: '/data', icon: Database, color: 'text-blue-600' },
  { name: 'Analysis', nameAr: 'التحليل', href: '/analysis', icon: BarChart3, color: 'text-indigo-600' },
  { name: 'Reports', nameAr: 'التقارير', href: '/reports', icon: FileText, color: 'text-orange-600' },
  { name: 'Presentations', nameAr: 'العروض التقديمية', href: '/presentations', icon: Presentation, color: 'text-pink-600' },
  { name: 'Library', nameAr: 'المكتبة', href: '/library', icon: BookOpen, color: 'text-amber-600' },
  { name: 'Settings', nameAr: 'الإعدادات', href: '/settings', icon: Settings, color: 'text-gray-600' },
];

interface SidebarProps {
  mobileSidebarOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ mobileSidebarOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const { isRTL, toggleLocale } = useLocale();

  return (
    <>
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 z-50 flex flex-col border-gray-200 bg-white shadow-sm transition-all duration-300 lg:static
          dark:border-gray-700 dark:bg-gray-900
          ${isRTL ? 'right-0 border-l' : 'left-0 border-r'}
          ${sidebarOpen ? 'w-72' : 'w-20'}
          ${mobileSidebarOpen ? 'translate-x-0' : isRTL ? 'translate-x-full lg:translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-700">
          {sidebarOpen ? (
            <Link href="/home" className="flex items-center gap-2" onClick={onMobileClose}>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-rasid-600 to-rasid-700 text-lg font-bold text-white shadow-md">
                R
              </div>
              <div>
                <h1 className="text-lg font-bold text-rasid-700 dark:text-rasid-400">
                  {isRTL ? 'راصد' : 'Rasid'}
                </h1>
                <p className="-mt-1 text-[10px] text-gray-400">
                  {isRTL ? 'منصة الذكاء للبيانات' : 'Data Intelligence'}
                </p>
              </div>
            </Link>
          ) : (
            <Link
              href="/home"
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-rasid-600 to-rasid-700 text-lg font-bold text-white shadow-md"
              onClick={onMobileClose}
            >
              R
            </Link>
          )}
          <button
            onClick={toggleSidebar}
            className="hidden rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 lg:block"
            aria-label="Toggle sidebar"
          >
            {isRTL ? (
              sidebarOpen ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />
            ) : (
              sidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/home'
                  ? pathname === '/home' || pathname === '/'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
                  title={sidebarOpen ? undefined : (isRTL ? item.nameAr : item.name)}
                  onClick={onMobileClose}
                >
                  <Icon className={`h-5 w-5 shrink-0 ${isActive ? item.color : ''}`} />
                  {sidebarOpen && <span>{isRTL ? item.nameAr : item.name}</span>}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-gray-200 p-3 dark:border-gray-700">
          <button
            onClick={toggleLocale}
            className="sidebar-link w-full justify-center"
            title={isRTL ? 'Switch to English' : 'التبديل إلى العربية'}
          >
            <Languages className="h-5 w-5 shrink-0" />
            {sidebarOpen && <span>{isRTL ? 'English' : 'العربية'}</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
