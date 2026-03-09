'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  BookMarked,
  CheckCircle2,
  FileText,
  Globe2,
  Languages,
  LayoutPanelTop,
  Loader2,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import {
  applyRtlContent,
  convertToHijri,
  createGlossarySet,
  createGlossaryTerm,
  detectTextLanguage,
  downloadDocumentTranslation,
  fetchDocumentTranslations,
  fetchGlossarySets,
  fetchGlossaryTerms,
  fetchSupportedLanguages,
  fetchTranslationHistory,
  formatCultural,
  localizeDashboardContent,
  localizePresentationContent,
  localizeReportContent,
  runLinguisticQa,
  runLocalizationTest,
  translateDocument,
  translatePlainText,
  type GlossaryTerm,
  type TranslationRequest,
} from '@/lib/api/localization';
import { getReports } from '@/lib/api/reporting';
import { fetchPresentations } from '@/lib/api/presentation';
import { getDashboards } from '@/lib/api/dashboard';

type TabId = 'text' | 'document' | 'glossary' | 'platform';

const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'text', label: 'ترجمة ذكية', icon: Sparkles },
  { id: 'document', label: 'الملفات', icon: FileText },
  { id: 'glossary', label: 'المصطلحات', icon: BookMarked },
  { id: 'platform', label: 'محتوى المنصة', icon: LayoutPanelTop },
];

const toneOptions = [
  { value: 'formal', label: 'رسمي' },
  { value: 'executive', label: 'قيادي' },
  { value: 'governmental', label: 'حكومي' },
  { value: 'technical', label: 'تقني' },
  { value: 'neutral', label: 'محايد' },
] as const;

const domainOptions = [
  { value: 'general', label: 'عام' },
  { value: 'business', label: 'أعمال' },
  { value: 'financial', label: 'مالي' },
  { value: 'technical', label: 'تقني' },
  { value: 'government', label: 'حكومي' },
] as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 ${className}`}>{children}</div>;
}

type TextTranslationView = {
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  glossaryApplied?: boolean;
  contextApplied?: boolean;
};

export default function LocalizationPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('text');
  const [dragActive, setDragActive] = useState(false);

  const [sourceText, setSourceText] = useState('Revenue grew 18% year over year and the executive dashboard must remain visually balanced.');
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('ar');
  const [domain, setDomain] = useState<TranslationRequest['domain']>('business');
  const [toneLevel, setToneLevel] = useState<NonNullable<TranslationRequest['toneLevel']>>('executive');
  const [styleGuide, setStyleGuide] = useState('استخدم لغة عربية طبيعية ورصينة مع الحفاظ على التوازن البصري والمصطلحات القيادية.');
  const [selectedGlossaryId, setSelectedGlossaryId] = useState('');
  const [translationResult, setTranslationResult] = useState<TextTranslationView | null>(null);
  const [rtlPreview, setRtlPreview] = useState('');
  const [qaScore, setQaScore] = useState<number | null>(null);
  const [layoutPassed, setLayoutPassed] = useState<boolean | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState('');
  const [documentPreview, setDocumentPreview] = useState('');

  const [newGlossary, setNewGlossary] = useState({ name: '', sourceLang: 'en', targetLang: 'ar', domain: 'business' });
  const [newTerm, setNewTerm] = useState({ source: '', target: '', context: '' });

  const [contentType, setContentType] = useState<'report' | 'presentation' | 'dashboard'>('report');
  const [contentId, setContentId] = useState('');
  const [targetLocale, setTargetLocale] = useState('ar-SA');
  const [platformResult, setPlatformResult] = useState('');
  const [cultureResult, setCultureResult] = useState('');
  const [hijriResult, setHijriResult] = useState('');

  const languagesQuery = useQuery({ queryKey: ['localization', 'languages'], queryFn: fetchSupportedLanguages });
  const glossariesQuery = useQuery({ queryKey: ['localization', 'glossaries'], queryFn: fetchGlossarySets });
  const glossaryTermsQuery = useQuery({
    queryKey: ['localization', 'glossary-terms', selectedGlossaryId],
    queryFn: () => fetchGlossaryTerms(selectedGlossaryId),
    enabled: Boolean(selectedGlossaryId),
  });
  const historyQuery = useQuery({ queryKey: ['localization', 'history'], queryFn: () => fetchTranslationHistory({ limit: 6 }) });
  const docsQuery = useQuery({ queryKey: ['localization', 'documents'], queryFn: () => fetchDocumentTranslations({ limit: 6 }) });
  const reportsQuery = useQuery({ queryKey: ['localization', 'reports'], queryFn: () => getReports({ limit: 20 }), enabled: activeTab === 'platform' });
  const presentationsQuery = useQuery({ queryKey: ['localization', 'presentations'], queryFn: () => fetchPresentations({ limit: 20 }), enabled: activeTab === 'platform' });
  const dashboardsQuery = useQuery({ queryKey: ['localization', 'dashboards'], queryFn: () => getDashboards({ limit: 20 }), enabled: activeTab === 'platform' });

  const supportedLanguages = languagesQuery.data && languagesQuery.data.length > 0
    ? languagesQuery.data
    : [{ code: 'ar', nameAr: 'العربية' }, { code: 'en', nameAr: 'الإنجليزية' }, { code: 'fr', nameAr: 'الفرنسية' }];

  const items = useMemo(() => {
    if (contentType === 'report') return reportsQuery.data?.data ?? [];
    if (contentType === 'presentation') return presentationsQuery.data?.data ?? [];
    return dashboardsQuery.data?.data ?? [];
  }, [contentType, dashboardsQuery.data, presentationsQuery.data, reportsQuery.data]);

  const translateMutation = useMutation({
    mutationFn: translatePlainText,
    onSuccess: async (result) => {
      setTranslationResult({
        sourceText,
        translatedText: result.translatedText,
        sourceLang: result.sourceLang,
        targetLang: result.targetLang,
        glossaryApplied: result.glossaryApplied,
        contextApplied: result.contextApplied,
      });
      const [rtl, qa, layout] = await Promise.all([
        applyRtlContent(result.translatedText),
        runLinguisticQa({
          sourceText,
          translatedText: result.translatedText,
          sourceLanguage: result.sourceLang,
          targetLanguage: result.targetLang,
          glossary: (glossaryTermsQuery.data ?? []).map((term: GlossaryTerm) => ({ source: term.source, target: term.target })),
        }),
        runLocalizationTest({
          components: [{ id: 'primary', text: result.translatedText, containerWidth: 720, containerHeight: 220, fontSize: 18, direction: result.sourceLang === 'ar' ? 'rtl' : 'ltr' }],
          targetDirection: result.targetLang === 'ar' ? 'rtl' : 'ltr',
        }),
      ]);
      setRtlPreview(rtl);
      setQaScore(qa.qualityScore);
      setLayoutPassed(layout.allPassed);
      queryClient.invalidateQueries({ queryKey: ['localization', 'history'] });
      toast.success('اكتملت الترجمة السياقية');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'تعذر تنفيذ الترجمة'),
  });

  const documentMutation = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error('اختر ملفًا أولاً');
      return translateDocument(selectedFile, sourceLang, targetLang, selectedGlossaryId || undefined);
    },
    onSuccess: (result) => {
      setDocumentId(result.id);
      setDocumentPreview(result.extractedText || '');
      queryClient.invalidateQueries({ queryKey: ['localization', 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['localization', 'history'] });
      toast.success('تم حفظ الملف المترجم في الخلفية');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'تعذر ترجمة الملف'),
  });

  const createGlossaryMutation = useMutation({
    mutationFn: createGlossarySet,
    onSuccess: (result) => {
      setSelectedGlossaryId(result.id);
      setNewGlossary({ name: '', sourceLang: 'en', targetLang: 'ar', domain: 'business' });
      queryClient.invalidateQueries({ queryKey: ['localization', 'glossaries'] });
      toast.success('تم إنشاء المجموعة');
    },
  });

  const addTermMutation = useMutation({
    mutationFn: () => createGlossaryTerm(selectedGlossaryId, { source: newTerm.source, target: newTerm.target, context: newTerm.context || undefined }),
    onSuccess: () => {
      setNewTerm({ source: '', target: '', context: '' });
      queryClient.invalidateQueries({ queryKey: ['localization', 'glossary-terms', selectedGlossaryId] });
      queryClient.invalidateQueries({ queryKey: ['localization', 'glossaries'] });
      toast.success('تم حفظ المصطلح');
    },
  });

  const platformMutation = useMutation({
    mutationFn: async () => {
      if (!contentId) throw new Error('اختر عنصرًا من المنصة');
      if (contentType === 'report') return localizeReportContent(contentId, targetLocale);
      if (contentType === 'presentation') return localizePresentationContent(contentId, targetLocale);
      return localizeDashboardContent(contentId, targetLocale);
    },
    onSuccess: async (result) => {
      setPlatformResult(JSON.stringify(result, null, 2));
      const [formatted, hijri] = await Promise.all([
        formatCultural('15890.75', 'currency', targetLocale, 'SAR'),
        convertToHijri(new Date().toISOString().slice(0, 10)),
      ]);
      setCultureResult(formatted.formatted);
      setHijriResult(hijri.hijri);
      queryClient.invalidateQueries({ queryKey: ['localization', 'history'] });
      toast.success('اكتمل تعريب العنصر المحدد');
    },
  });

  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setTranslationResult(null);
  };

  return (
    <div dir="rtl" className="space-y-6">
      <Card className="overflow-hidden border-cyan-200 bg-[radial-gradient(circle_at_top_right,_rgba(6,182,212,0.22),_transparent_38%),linear-gradient(135deg,_#ffffff_0%,_#f0fdfa_45%,_#ecfeff_100%)] dark:border-cyan-900/50 dark:bg-[radial-gradient(circle_at_top_right,_rgba(8,145,178,0.25),_transparent_35%),linear-gradient(135deg,_#020617_0%,_#083344_100%)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-4 py-1.5 text-xs font-bold text-cyan-700 dark:border-white/10 dark:bg-slate-950/40 dark:text-cyan-300">
              <Languages className="h-4 w-4" />
              تعريب عربي احترافي بسياق وذاكرة ومصطلحات
            </div>
            <h1 className="mt-4 text-3xl font-black text-slate-950 dark:text-white">مركز التعريب الذكي</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              ترجمة سياقية تحفظ المعنى والبنية وتعيد استخدام المصطلحات المعتمدة، مع تشغيل حقيقي لتعريب الملفات والتقارير والعروض ولوحات المؤشرات.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:min-w-[18rem]">
            <Card className="p-4"><div className="text-xs text-slate-500">السجل</div><div className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">{historyQuery.data?.total ?? 0}</div></Card>
            <Card className="p-4"><div className="text-xs text-slate-500">الملفات</div><div className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">{docsQuery.data?.total ?? 0}</div></Card>
          </div>
        </div>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="p-2">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cx('inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition', activeTab === tab.id ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900')}>
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </Card>

          {activeTab === 'text' && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <Card>
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">ترجمة سياقية بذاكرة ومجموعة مصطلحات</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">{supportedLanguages.map((lang) => <option key={lang.code} value={lang.code}>{lang.nameAr}</option>)}</select>
                  <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">{supportedLanguages.map((lang) => <option key={lang.code} value={lang.code}>{lang.nameAr}</option>)}</select>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button onClick={swapLanguages} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-bold dark:border-slate-800"><ArrowLeftRight className="h-4 w-4" />تبديل</button>
                  <button onClick={() => detectTextLanguage(sourceText).then((r) => { setSourceLang(r.language); toast.success(`تم التعرف على ${r.language.toUpperCase()}`); }).catch(() => toast.error('تعذر كشف اللغة'))} className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-700 dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:text-cyan-300"><Globe2 className="h-4 w-4" />كشف اللغة</button>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <select value={domain} onChange={(e) => setDomain(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">{domainOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  <select value={toneLevel} onChange={(e) => setToneLevel(e.target.value as typeof toneLevel)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">{toneOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  <select value={selectedGlossaryId} onChange={(e) => setSelectedGlossaryId(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"><option value="">بدون مجموعة</option>{(glossariesQuery.data ?? []).map((glossary) => <option key={glossary.id} value={glossary.id}>{glossary.name}</option>)}</select>
                </div>
                <textarea value={styleGuide} onChange={(e) => setStyleGuide(e.target.value)} rows={3} className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 dark:border-slate-800 dark:bg-slate-900" />
                <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} rows={9} dir={sourceLang === 'ar' ? 'rtl' : 'ltr'} className="mt-4 w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-8 dark:border-slate-800 dark:bg-slate-900" />
                <button onClick={() => translateMutation.mutate({ text: sourceText, sourceLang, targetLang, glossaryId: selectedGlossaryId || undefined, domain, toneLevel, styleGuide, preserveLayout: true, formality: toneLevel === 'neutral' ? 'neutral' : 'formal' })} disabled={translateMutation.isPending} className="mt-5 inline-flex items-center gap-2 rounded-full bg-cyan-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
                  {translateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}ترجمة احترافية
                </button>
              </Card>

              <Card>
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">المخرج العربي والتحقق</h2>
                <div className="mt-5 min-h-[15rem] rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm leading-8 dark:border-slate-800 dark:bg-slate-900" dir={targetLang === 'ar' ? 'rtl' : 'ltr'}>
                  {translationResult?.translatedText || 'سيظهر هنا الناتج بعد تنفيذ الترجمة.'}
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <Card className="p-4"><div className="text-xs text-slate-500">السياق</div><div className="mt-2 text-lg font-black">{translationResult?.contextApplied ? 'مفعل' : '...'}</div></Card>
                  <Card className="p-4"><div className="text-xs text-slate-500">المراجعة</div><div className="mt-2 text-lg font-black">{qaScore !== null ? `${qaScore}%` : '...'}</div></Card>
                  <Card className="p-4"><div className="text-xs text-slate-500">المصطلحات</div><div className="mt-2 text-lg font-black">{translationResult?.glossaryApplied ? 'مطبقة' : '...'}</div></Card>
                </div>
                {rtlPreview && <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-8 dark:border-slate-800 dark:bg-slate-900" dir="rtl">{rtlPreview}</div>}
              </Card>
            </div>
          )}

          {activeTab === 'document' && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <Card>
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">تعريب الملفات مع الحفاظ على البنية</h2>
                <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  الصيغ المدعومة حاليًا للاستخراج الفعلي: TXT وMD وCSV وJSON وHTML. لا يتم عرض نجاح وهمي للصيغ غير المدعومة.
                </p>
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragActive(false);
                    const file = event.dataTransfer.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                    }
                  }}
                  className={cx(
                    'mt-5 rounded-[1.75rem] border-2 border-dashed p-8 text-center transition',
                    dragActive ? 'border-cyan-500 bg-cyan-50 dark:border-cyan-400 dark:bg-cyan-950/20' : 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                  )}
                >
                  <UploadCloud className="mx-auto h-10 w-10 text-cyan-600 dark:text-cyan-300" />
                  <div className="mt-4 text-base font-black text-slate-900 dark:text-slate-100">اسحب الملف هنا أو اختره يدويًا</div>
                  <p className="mt-2 text-sm text-slate-500">عند الرفع يتم إرسال الملف مباشرة إلى خدمة التوطين لاستخراج النص وترجمته وتسجيل النتيجة.</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.csv,.json,.html,.htm,text/plain,text/markdown,text/csv,application/json,text/html"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        setSelectedFile(file);
                      }
                    }}
                  />
                  <button onClick={() => fileInputRef.current?.click()} className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-950">
                    <FileText className="h-4 w-4" />
                    اختيار ملف
                  </button>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                    <option value="auto">كشف تلقائي</option>
                    {supportedLanguages.map((lang) => <option key={lang.code} value={lang.code}>{lang.nameAr}</option>)}
                  </select>
                  <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                    {supportedLanguages.map((lang) => <option key={lang.code} value={lang.code}>{lang.nameAr}</option>)}
                  </select>
                </div>
                {selectedFile && (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                    الملف المحدد: <span className="font-black">{selectedFile.name}</span> ({Math.round(selectedFile.size / 1024)} كيلوبايت)
                  </div>
                )}
                <button onClick={() => documentMutation.mutate()} disabled={documentMutation.isPending || !selectedFile} className="mt-5 inline-flex items-center gap-2 rounded-full bg-cyan-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
                  {documentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  رفع وتعريب الملف
                </button>
              </Card>

              <Card>
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">الأثر الفعلي للملفات</h2>
                <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500">معرّف الوظيفة</div>
                  <div className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">{documentId || 'لم يبدأ بعد'}</div>
                </div>
                <div className="mt-4 min-h-[12rem] rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm leading-8 dark:border-slate-800 dark:bg-slate-900" dir="rtl">
                  {documentPreview || 'سيظهر هنا النص المستخرج من الملف بعد التنفيذ الفعلي.'}
                </div>
                <div className="mt-5 space-y-3">
                  {(docsQuery.data?.data ?? []).map((doc) => (
                    <div key={doc.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-slate-900 dark:text-slate-100">{doc.fileName}</div>
                          <div className="mt-1 text-xs text-slate-500">{doc.sourceLang.toUpperCase()} ← {doc.targetLang.toUpperCase()} • {doc.wordCount} كلمة</div>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              const blob = await downloadDocumentTranslation(doc.id);
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `${doc.fileName.replace(/\.[^.]+$/, '')}-ar.txt`;
                              link.click();
                              URL.revokeObjectURL(url);
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : 'تعذر تنزيل الملف');
                            }
                          }}
                          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold dark:border-slate-700"
                        >
                          تنزيل الناتج
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'glossary' && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <Card>
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">مجموعات المصطلحات والأسلوب</h2>
                <div className="mt-5 grid gap-4">
                  <input value={newGlossary.name} onChange={(e) => setNewGlossary((current) => ({ ...current, name: e.target.value }))} placeholder="اسم المجموعة" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <select value={newGlossary.sourceLang} onChange={(e) => setNewGlossary((current) => ({ ...current, sourceLang: e.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                      {supportedLanguages.map((lang) => <option key={lang.code} value={lang.code}>{lang.nameAr}</option>)}
                    </select>
                    <select value={newGlossary.targetLang} onChange={(e) => setNewGlossary((current) => ({ ...current, targetLang: e.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                      {supportedLanguages.map((lang) => <option key={lang.code} value={lang.code}>{lang.nameAr}</option>)}
                    </select>
                  </div>
                  <select value={newGlossary.domain} onChange={(e) => setNewGlossary((current) => ({ ...current, domain: e.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                    {domainOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <button onClick={() => createGlossaryMutation.mutate(newGlossary)} disabled={createGlossaryMutation.isPending || !newGlossary.name.trim()} className="inline-flex items-center gap-2 rounded-full bg-cyan-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
                    {createGlossaryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookMarked className="h-4 w-4" />}
                    إنشاء مجموعة
                  </button>
                </div>

                <div className="mt-6 space-y-3">
                  {(glossariesQuery.data ?? []).map((glossary) => (
                    <button key={glossary.id} onClick={() => setSelectedGlossaryId(glossary.id)} className={cx('flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-right transition', selectedGlossaryId === glossary.id ? 'border-cyan-500 bg-cyan-50 dark:border-cyan-500 dark:bg-cyan-950/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950')}>
                      <div>
                        <div className="text-sm font-black text-slate-900 dark:text-slate-100">{glossary.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{glossary.sourceLang.toUpperCase()} → {glossary.targetLang.toUpperCase()} • {glossary.termCount} مصطلح</div>
                      </div>
                      {selectedGlossaryId === glossary.id && <CheckCircle2 className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />}
                    </button>
                  ))}
                </div>
              </Card>

              <Card>
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">ترسيخ المعاني المعتمدة</h2>
                <div className="mt-5 grid gap-4">
                  <input value={newTerm.source} onChange={(e) => setNewTerm((current) => ({ ...current, source: e.target.value }))} placeholder="المصطلح الأصلي" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
                  <input value={newTerm.target} onChange={(e) => setNewTerm((current) => ({ ...current, target: e.target.value }))} placeholder="المقابل العربي المعتمد" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
                  <textarea value={newTerm.context} onChange={(e) => setNewTerm((current) => ({ ...current, context: e.target.value }))} rows={3} placeholder="سياق الاستخدام أو التفضيل الأسلوبي" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 dark:border-slate-800 dark:bg-slate-900" />
                  <button onClick={() => addTermMutation.mutate()} disabled={addTermMutation.isPending || !selectedGlossaryId || !newTerm.source.trim() || !newTerm.target.trim()} className="inline-flex items-center gap-2 rounded-full bg-cyan-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
                    {addTermMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookMarked className="h-4 w-4" />}
                    حفظ المصطلح
                  </button>
                </div>
                <div className="mt-6 space-y-3">
                  {(glossaryTermsQuery.data ?? []).map((term) => (
                    <div key={term.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-slate-900 dark:text-slate-100">{term.source}</div>
                          <div className="mt-1 text-sm text-cyan-700 dark:text-cyan-300">{term.target}</div>
                        </div>
                        <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-500 dark:border-slate-700">{term.status}</span>
                      </div>
                      {term.context && <div className="mt-3 text-xs leading-6 text-slate-500">{term.context}</div>}
                    </div>
                  ))}
                  {selectedGlossaryId && (glossaryTermsQuery.data?.length ?? 0) === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">لا توجد مصطلحات بعد في المجموعة المحددة.</div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'platform' && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <Card>
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">تعريب التقارير والعروض ولوحات المؤشرات</h2>
                <div className="mt-5 grid gap-4">
                  <select value={contentType} onChange={(e) => { setContentType(e.target.value as typeof contentType); setContentId(''); }} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                    <option value="report">تقرير</option>
                    <option value="presentation">عرض تقديمي</option>
                    <option value="dashboard">لوحة مؤشرات</option>
                  </select>
                  <select value={contentId} onChange={(e) => setContentId(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                    <option value="">اختر عنصرًا من المنصة</option>
                    {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <select value={targetLocale} onChange={(e) => setTargetLocale(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                    <option value="ar-SA">العربية - السعودية</option>
                    <option value="ar-EG">العربية - مصر</option>
                    <option value="ar-AE">العربية - الإمارات</option>
                  </select>
                  <button onClick={() => platformMutation.mutate()} disabled={platformMutation.isPending || !contentId} className="inline-flex items-center gap-2 rounded-full bg-cyan-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
                    {platformMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutPanelTop className="h-4 w-4" />}
                    تعريب المحتوى المحدد
                  </button>
                </div>
                <div className="mt-6 space-y-3">
                  {items.map((item) => (
                    <button key={item.id} onClick={() => setContentId(item.id)} className={cx('flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-right transition', contentId === item.id ? 'border-cyan-500 bg-cyan-50 dark:border-cyan-500 dark:bg-cyan-950/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950')}>
                      <div>
                        <div className="text-sm font-black text-slate-900 dark:text-slate-100">{item.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.description || 'لا يوجد وصف إضافي'}</div>
                      </div>
                      {contentId === item.id && <CheckCircle2 className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />}
                    </button>
                  ))}
                </div>
              </Card>

              <Card>
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">نتيجة التنفيذ والتحقق الثقافي</h2>
                <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm leading-7 dark:border-slate-800 dark:bg-slate-900" dir="rtl">
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-7 text-slate-700 dark:text-slate-200">{platformResult || 'سيظهر هنا ناتج تعريب العنصر المحدد من المنصة.'}</pre>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <Card className="p-4">
                    <div className="text-xs text-slate-500">تنسيق رقمي/مالي</div>
                    <div className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">{cultureResult || '...'}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs text-slate-500">التاريخ الهجري</div>
                    <div className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">{hijriResult || '...'}</div>
                  </Card>
                </div>
              </Card>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100">آخر التنفيذات</h2>
            <div className="mt-4 space-y-3">
              {(historyQuery.data?.data ?? []).map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300">{item.workflowType}</span>
                    <span className="text-[11px] text-slate-500">{new Date(item.createdAt).toLocaleString('ar-SA')}</span>
                  </div>
                  <div className="mt-3 line-clamp-3 text-sm leading-7 text-slate-700 dark:text-slate-200">{item.translatedText || item.sourceText}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100">ضمان الاتساق العربي</h2>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                يتم تمرير الترجمة عبر ذاكرة ترجمة حقيقية ومجموعات مصطلحات قابلة لإعادة الاستخدام.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                يتم التحقق من سلامة RTL والجودة اللغوية قبل اعتماد الناتج في الواجهة.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                اللغات المدعومة حاليًا: <span className="font-black text-slate-900 dark:text-slate-100">{supportedLanguages.length}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
