"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Globe,
  Languages,
  AlignRight,
  Type,
  BarChart,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { fetchTranslations, fetchLocales } from "@/lib/api/localization";

const quickLinks = [
  { href: "/localization/language-intelligence", icon: Languages, label: "الذكاء اللغوي", labelEn: "Language Intelligence" },
  { href: "/localization/rtl-layout", icon: AlignRight, label: "تخطيط RTL", labelEn: "RTL Layout" },
  { href: "/localization/arabic-typography", icon: Type, label: "الطباعة العربية", labelEn: "Arabic Typography" },
  { href: "/localization/data-localization", icon: BarChart, label: "توطين البيانات", labelEn: "Data Localization" },
  { href: "/localization/quality-gate", icon: ShieldCheck, label: "بوابة الجودة", labelEn: "Quality Gate" },
];

export default function LocalizationEnginePage() {
  const { data: translationsData, isLoading: loadingTranslations } = useQuery({
    queryKey: ["translations-overview"],
    queryFn: () => fetchTranslations({ page: 1, limit: 1000 }),
  });

  const { data: locales, isLoading: loadingLocales } = useQuery({
    queryKey: ["locales-overview"],
    queryFn: () => fetchLocales(),
  });

  const isLoading = loadingTranslations || loadingLocales;
  const totalKeys = translationsData?.total ?? 0;
  const translations = translationsData?.data ?? [];
  const localeCount = locales?.length ?? 0;
  const activeLocales = locales?.filter((l) => l.isActive).length ?? 0;
  const pendingTranslations = translations.filter((t) => !t.valueAr || !t.valueEn).length;
  const completionRatio = totalKeys > 0
    ? Math.round(((totalKeys - pendingTranslations) / totalKeys) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-50">
            <Globe className="h-7 w-7 text-teal-600" />
          </div>
          <div>
            <h1 className="page-title">محرك التعريب</h1>
            <p className="text-lg font-medium text-teal-600">Localization Engine</p>
          </div>
        </div>
        <p className="page-description mt-4">
          دعم متعدد اللغات مع التعريب العربي أولاً ومعالجة RTL وإدارة الترجمة والتكيف الثقافي.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="section-card text-center">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-teal-400" /> : (
            <p className="text-3xl font-bold text-teal-600">{activeLocales}</p>
          )}
          <p className="text-sm text-gray-500">لغات نشطة</p>
        </div>
        <div className="section-card text-center">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-teal-400" /> : (
            <p className="text-3xl font-bold text-teal-600">{totalKeys}</p>
          )}
          <p className="text-sm text-gray-500">مفاتيح ترجمة</p>
        </div>
        <div className="section-card text-center">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-teal-400" /> : (
            <p className="text-3xl font-bold text-amber-600">{pendingTranslations}</p>
          )}
          <p className="text-sm text-gray-500">ترجمات معلقة</p>
        </div>
        <div className="section-card text-center">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-teal-400" /> : (
            <p className="text-3xl font-bold text-teal-600">{completionRatio}%</p>
          )}
          <p className="text-sm text-gray-500">نسبة الاكتمال</p>
        </div>
      </div>

      <h2 className="section-title mb-4 text-2xl">الوصول السريع - Quick Access</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="section-card flex flex-col items-center gap-2 p-4 text-center transition hover:shadow-md hover:border-teal-200"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
                <Icon className="h-5 w-5 text-teal-600" />
              </div>
              <p className="text-xs font-semibold text-gray-900">{link.label}</p>
              <p className="text-[10px] text-gray-400">{link.labelEn}</p>
            </Link>
          );
        })}
      </div>

      {/* Recent translations */}
      <h2 className="section-title mb-4 text-2xl">الترجمات الأخيرة - Recent Translations</h2>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
        </div>
      ) : translations.length === 0 ? (
        <div className="section-card py-12 text-center text-sm text-gray-400">
          لا توجد ترجمات بعد.
        </div>
      ) : (
        <div className="space-y-2">
          {translations.slice(0, 5).map((t) => (
            <div key={t.id} className="section-card flex items-center gap-4 p-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{t.key}</p>
                <p className="text-xs text-gray-400">{t.namespace}</p>
              </div>
              <div className="text-end">
                <p className="text-xs text-gray-600">{t.valueAr || "—"}</p>
                <p className="text-xs text-gray-400">{t.valueEn || "—"}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
