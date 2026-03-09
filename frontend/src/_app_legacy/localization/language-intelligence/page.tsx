'use client';

import { useState } from 'react';
import { Languages, ScanSearch, ArrowLeftRight, Globe, CheckCircle2, Clock, Sparkles, FileText } from 'lucide-react';

const languages = [
  { code: 'ar', name: 'العربية', nameEn: 'Arabic', detected: 245, translated: 230, accuracy: 98 },
  { code: 'en', name: 'الإنجليزية', nameEn: 'English', detected: 180, translated: 180, accuracy: 99 },
  { code: 'fr', name: 'الفرنسية', nameEn: 'French', detected: 12, translated: 10, accuracy: 95 },
  { code: 'ur', name: 'الأردية', nameEn: 'Urdu', detected: 8, translated: 6, accuracy: 92 },
];

const recentTranslations = [
  { id: 1, doc: 'التقرير السنوي', from: 'العربية', to: 'الإنجليزية', status: 'completed', accuracy: 97, date: '2026-03-04' },
  { id: 2, doc: 'ملخص المشروع', from: 'الإنجليزية', to: 'العربية', status: 'completed', accuracy: 96, date: '2026-03-03' },
  { id: 3, doc: 'بيان الميزانية', from: 'العربية', to: 'الفرنسية', status: 'in-progress', accuracy: 0, date: '2026-03-04' },
  { id: 4, doc: 'دليل المستخدم', from: 'الإنجليزية', to: 'العربية', status: 'queued', accuracy: 0, date: '2026-03-04' },
];

export default function LanguageIntelligencePage() {
  const [sourceText, setSourceText] = useState('');
  const [sourceLang, setSourceLang] = useState('ar');
  const [targetLang, setTargetLang] = useState('en');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الذكاء اللغوي</h1>
          <p className="text-gray-500">Language Intelligence - Detection & translation</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-teal-100 px-3 py-1 text-sm text-teal-700">
          <Sparkles className="h-4 w-4" />
          AI مُفعَّل
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">4</p>
          <p className="text-sm text-gray-500">لغات مدعومة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">445</p>
          <p className="text-sm text-gray-500">نصوص مكتشفة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">426</p>
          <p className="text-sm text-gray-500">ترجمات مكتملة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">97%</p>
          <p className="text-sm text-gray-500">دقة الترجمة</p>
        </div>
      </div>

      {/* Translation tool */}
      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">أداة الترجمة - Translation Tool</h2>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
                <option value="ar">العربية</option>
                <option value="en">English</option>
                <option value="fr">Francais</option>
                <option value="auto">كشف تلقائي</option>
              </select>
              <button className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700">
                <ScanSearch className="h-3.5 w-3.5" /> كشف اللغة
              </button>
            </div>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="أدخل النص المراد ترجمته..."
              className="w-full rounded-lg border border-gray-200 p-3 text-sm min-h-[120px]"
            />
          </div>
          <div className="flex items-center justify-center">
            <button
              onClick={() => { setSourceLang(targetLang); setTargetLang(sourceLang); }}
              className="rounded-full border border-gray-200 p-2 hover:bg-gray-50"
            >
              <ArrowLeftRight className="h-5 w-5 text-gray-400" />
            </button>
          </div>
          <div>
            <div className="mb-2">
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
                <option value="en">English</option>
                <option value="ar">العربية</option>
                <option value="fr">Francais</option>
              </select>
            </div>
            <div className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm min-h-[120px] text-gray-400">
              الترجمة ستظهر هنا...
            </div>
          </div>
        </div>
        <button className="mt-3 flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-white hover:bg-teal-700">
          <Languages className="h-4 w-4" /> ترجمة
        </button>
      </div>

      {/* Language stats */}
      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">إحصائيات اللغات - Language Statistics</h2>
        <div className="space-y-4">
          {languages.map((lang) => (
            <div key={lang.code} className="flex items-center gap-4">
              <div className="w-24">
                <p className="font-medium text-sm">{lang.name}</p>
                <p className="text-xs text-gray-400">{lang.nameEn}</p>
              </div>
              <div className="flex-1">
                <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full rounded-full bg-teal-500" style={{ width: `${lang.accuracy}%` }} />
                </div>
              </div>
              <div className="text-end w-20">
                <p className="text-sm font-bold text-teal-600">{lang.accuracy}%</p>
                <p className="text-xs text-gray-400">{lang.detected} نص</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent translations */}
      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">الترجمات الأخيرة - Recent Translations</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="pb-2 text-start font-medium">المستند</th>
                <th className="pb-2 text-start font-medium">من</th>
                <th className="pb-2 text-start font-medium">إلى</th>
                <th className="pb-2 text-start font-medium">الدقة</th>
                <th className="pb-2 text-start font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {recentTranslations.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="py-3 font-medium">{t.doc}</td>
                  <td className="py-3">{t.from}</td>
                  <td className="py-3">{t.to}</td>
                  <td className="py-3">{t.accuracy > 0 ? `${t.accuracy}%` : '--'}</td>
                  <td className="py-3">
                    <span className={`flex items-center gap-1 text-xs ${t.status === 'completed' ? 'text-green-600' : t.status === 'in-progress' ? 'text-blue-600' : 'text-gray-400'}`}>
                      {t.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                      {t.status === 'completed' ? 'مكتمل' : t.status === 'in-progress' ? 'جارٍ' : 'في الانتظار'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
