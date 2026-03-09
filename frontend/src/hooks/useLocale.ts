'use client';

import { useCallback } from 'react';
import { useAppStore, Locale } from '@/store/app';
import ar from '@/i18n/ar.json';
import en from '@/i18n/en.json';

const translations: Record<Locale, Record<string, any>> = { ar, en };

export function useLocale() {
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);

  const t = useCallback(
    (key: string): string => {
      const keys = key.split('.');
      let value: any = translations[locale];
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return key; // fallback to key
        }
      }
      return typeof value === 'string' ? value : key;
    },
    [locale]
  );

  const isRTL = locale === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'ar' ? 'en' : 'ar');
  }, [locale, setLocale]);

  return { locale, setLocale, t, isRTL, dir, toggleLocale };
}
