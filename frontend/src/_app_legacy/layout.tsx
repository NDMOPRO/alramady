'use client';

import './globals.css';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import Breadcrumb from '@/components/layout/Breadcrumb';
import AuthGuard from '@/components/auth/AuthGuard';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/app';
import { useLocale } from '@/hooks/useLocale';

const AUTH_PAGES = ['/login', '/register'];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const theme = useAppStore((s) => s.theme);
  const { locale, isRTL, dir } = useLocale();

  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));
  const lang = locale;

  return (
    <html lang={lang} dir={dir} className={theme === 'dark' ? 'dark' : ''} suppressHydrationWarning>
      <head>
        <title>Rasid - منصة رصيد</title>
        <meta
          name="description"
          content="Rasid Platform - منصة رصيد للبيانات والتقارير"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="font-arabic bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <ToastProvider>
          <AuthGuard>
            {isAuthPage ? (
              /* Auth pages render without sidebar/header */
              children
            ) : (
              /* App shell with sidebar + header */
              <div className="flex h-screen overflow-hidden">
                <Sidebar
                  mobileSidebarOpen={mobileSidebarOpen}
                  onMobileClose={() => setMobileSidebarOpen(false)}
                />

                <div className="flex flex-1 flex-col overflow-hidden">
                  <Header
                    mobileSidebarOpen={mobileSidebarOpen}
                    onToggleMobileSidebar={() =>
                      setMobileSidebarOpen(!mobileSidebarOpen)
                    }
                  />

                  <main className="flex-1 overflow-y-auto p-4 lg:p-8">
                    <Breadcrumb />
                    {children}
                  </main>
                </div>
              </div>
            )}
          </AuthGuard>
        </ToastProvider>
      </body>
    </html>
  );
}
