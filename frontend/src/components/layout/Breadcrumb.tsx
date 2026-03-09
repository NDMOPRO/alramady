'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { useLocale } from '@/hooks/useLocale';

const pathLabels: Record<string, { en: string; ar: string }> = {
  data: { en: 'Data Engine', ar: 'محرك البيانات' },
  excel: { en: 'Excel Engine', ar: 'محرك إكسل' },
  dashboard: { en: 'Dashboard Engine', ar: 'محرك لوحة المعلومات' },
  reporting: { en: 'Reporting Engine', ar: 'محرك التقارير' },
  presentation: { en: 'Presentation Engine', ar: 'محرك العروض التقديمية' },
  infographic: { en: 'Infographic Engine', ar: 'محرك الإنفوجرافيك' },
  replication: { en: 'Replication Engine', ar: 'محرك النسخ' },
  localization: { en: 'Localization Engine', ar: 'محرك التعريب' },
  ai: { en: 'AI Engine', ar: 'محرك الذكاء الاصطناعي' },
  governance: { en: 'Governance Engine', ar: 'محرك الحوكمة' },
  library: { en: 'Library Engine', ar: 'محرك المكتبة' },
  template: { en: 'Template Engine', ar: 'محرك القوالب' },
  conversion: { en: 'Conversion Engine', ar: 'محرك التحويل' },
  login: { en: 'Login', ar: 'تسجيل الدخول' },
  register: { en: 'Register', ar: 'إنشاء حساب' },
  settings: { en: 'Settings', ar: 'الإعدادات' },
};

export default function Breadcrumb() {
  const pathname = usePathname();
  const { isRTL } = useLocale();

  if (pathname === '/') return null;

  const segments = pathname.split('/').filter(Boolean);

  return (
    <nav className="mb-4 flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
      <Link
        href="/"
        className="flex items-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <Home className="h-3.5 w-3.5" />
        <span>{isRTL ? 'الرئيسية' : 'Home'}</span>
      </Link>

      {segments.map((segment, index) => {
        const href = '/' + segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        const labelObj = pathLabels[segment];
        const label = labelObj
          ? isRTL ? labelObj.ar : labelObj.en
          : segment.charAt(0).toUpperCase() + segment.slice(1);

        return (
          <React.Fragment key={href}>
            <ChevronRight className="h-3.5 w-3.5 text-gray-300 rtl:rotate-180" />
            {isLast ? (
              <span className="font-medium text-gray-700 dark:text-gray-200">
                {label}
              </span>
            ) : (
              <Link
                href={href}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
