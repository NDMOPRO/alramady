'use client';

import React from 'react';
import {
  Menu,
  X,
  Search,
  Bell,
  Moon,
  Sun,
  Languages,
  User,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAppStore } from '@/store/app';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useLocale } from '@/hooks/useLocale';
import Dropdown, { DropdownItem } from '@/components/ui/Dropdown';

interface HeaderProps {
  mobileSidebarOpen: boolean;
  onToggleMobileSidebar: () => void;
}

export default function Header({ mobileSidebarOpen, onToggleMobileSidebar }: HeaderProps) {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const { t, isRTL, toggleLocale } = useLocale();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const userMenuItems: DropdownItem[] = [
    {
      key: 'profile',
      label: t('common.profile'),
      icon: <User className="h-4 w-4" />,
      onClick: () => {},
    },
    {
      key: 'settings',
      label: t('common.settings'),
      icon: <Settings className="h-4 w-4" />,
      onClick: () => {},
    },
    { key: 'divider', label: '', divider: true },
    {
      key: 'logout',
      label: t('common.logout'),
      icon: <LogOut className="h-4 w-4" />,
      danger: true,
      onClick: () => {
        logout();
        window.location.href = '/login';
      },
    },
  ];

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 lg:px-6">
      {/* Left: Mobile menu + Search */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileSidebar}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 lg:hidden"
        >
          {mobileSidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>

        {/* Search bar */}
        <div className="hidden md:block">
          <div className="relative">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('common.search')}
              className="w-64 rounded-lg border border-gray-200 bg-gray-50 py-2 ps-9 pe-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-rasid-500 focus:outline-none focus:ring-1 focus:ring-rasid-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 lg:w-80"
            />
          </div>
        </div>
      </div>

      {/* Center: Platform label */}
      <div className="flex items-center gap-2 md:hidden">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('common.platform')}
        </span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Language toggle */}
        <button
          onClick={toggleLocale}
          className="hidden rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 sm:block"
          title={isRTL ? 'Switch to English' : 'التبديل إلى العربية'}
        >
          <Languages className="h-5 w-5" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          title={theme === 'light' ? t('common.darkMode') : t('common.lightMode')}
        >
          {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </button>

        {/* Notifications */}
        <button
          className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          title={t('common.notifications')}
        >
          <Bell className="h-5 w-5" />
          <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        {/* User menu */}
        <Dropdown trigger={
          <div className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rasid-600 text-sm font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="hidden text-start sm:block">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {user?.name || 'User'}
              </p>
              <p className="text-xs text-gray-400">{user?.role || 'admin'}</p>
            </div>
          </div>
        } items={userMenuItems} />
      </div>
    </header>
  );
}
