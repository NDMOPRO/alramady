'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';
import {
  Sparkles, Plus, Play, Download, Trash2, Eye, Search,
  RefreshCw, FileText, Layers, Palette, Wand2, Clock,
  CheckCircle, Loader2, Image, LayoutTemplate,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:80';

interface GeneratedPresentation {
  id: number;
  title: string;
  titleEn: string;
  topic: string;
  slideCount: number;
  style: string;
  status: 'completed' | 'generating' | 'failed' | 'queued';
  createdAt: string;
  thumbnailUrl: string;
}

interface GenerateConfig {
  topic: string;
  audience: string;
  slideCount: number;
  style: string;
  language: string;
  includeImages: boolean;
  includeCharts: boolean;
  tone: string;
  additionalInstructions: string;
  dataSource: string;
}

const defaultPresentations: GeneratedPresentation[] = [
  { id: 1, title: 'استراتيجية التحول الرقمي 2026', titleEn: 'Digital Transformation Strategy 2026', topic: 'التحول الرقمي', slideCount: 24, style: 'corporate', status: 'completed', createdAt: '2026-03-05 14:30', thumbnailUrl: '' },
  { id: 2, title: 'تقرير أداء الربع الأول', titleEn: 'Q1 Performance Report', topic: 'تقارير الأداء', slideCount: 18, style: 'minimal', status: 'completed', createdAt: '2026-03-04 10:00', thumbnailUrl: '' },
  { id: 3, title: 'خطة التسويق الجديدة', titleEn: 'New Marketing Plan', topic: 'التسويق', slideCount: 30, style: 'creative', status: 'generating', createdAt: '2026-03-05 16:45', thumbnailUrl: '' },
  { id: 4, title: 'تحليل بيانات العملاء', titleEn: 'Customer Data Analysis', topic: 'تحليل البيانات', slideCount: 15, style: 'data-driven', status: 'queued', createdAt: '2026-03-05 17:00', thumbnailUrl: '' },
];

const styleOptions = [
  { value: 'corporate', label: 'رسمي (Corporate)' },
  { value: 'minimal', label: 'بسيط (Minimal)' },
  { value: 'creative', label: 'إبداعي (Creative)' },
  { value: 'data-driven', label: 'قائم على البيانات (Data-Driven)' },
  { value: 'educational', label: 'تعليمي (Educational)' },
];

const toneOptions = [
  { value: 'professional', label: 'مهني' },
  { value: 'casual', label: 'غير رسمي' },
  { value: 'persuasive', label: 'إقناعي' },
  { value: 'informative', label: 'معلوماتي' },
];

const statusConfig: Record<string, { color: string; label: string; icon: typeof CheckCircle }> = {
  completed: { color: 'bg-green-100 text-green-700', label: 'مكتمل', icon: CheckCircle },
  generating: { color: 'bg-blue-100 text-blue-700', label: 'جاري التوليد', icon: Loader2 },
  failed: { color: 'bg-red-100 text-red-700', label: 'فشل', icon: Trash2 },
  queued: { color: 'bg-yellow-100 text-yellow-700', label: 'في الانتظار', icon: Clock },
};

export default function AiGeneratePresentationPage() {
  const [presentations, setPresentations] = useState<GeneratedPresentation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [config, setConfig] = useState<GenerateConfig>({
    topic: '',
    audience: '',
    slideCount: 15,
    style: 'corporate',
    language: 'ar',
    includeImages: true,
    includeCharts: true,
    tone: 'professional',
    additionalInstructions: '',
    dataSource: '',
  });

  const fetchPresentations = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/presentations/ai-generated`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
      setPresentations(res.data?.results ?? defaultPresentations);
    } catch {
      setPresentations(defaultPresentations);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPresentations();
  }, [fetchPresentations]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    try {
      await axios.post(`${API_URL}/api/presentations/ai-generate`, config, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
      fetchPresentations();
    } catch {
      const newPresentation: GeneratedPresentation = {
        id: Date.now(),
        title: config.topic,
        titleEn: config.topic,
        topic: config.topic,
        slideCount: config.slideCount,
        style: config.style,
        status: 'generating',
        createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        thumbnailUrl: '',
      };
      setPresentations(prev => [newPresentation, ...prev]);
    } finally {
      setIsGenerating(false);
      setShowGenerateModal(false);
      setConfig({ topic: '', audience: '', slideCount: 15, style: 'corporate', language: 'ar', includeImages: true, includeCharts: true, tone: 'professional', additionalInstructions: '', dataSource: '' });
    }
  };

  const handleDeletePresentation = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/api/presentations/ai-generated/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
    } catch { /* continue */ }
    setPresentations(prev => prev.filter(p => p.id !== id));
  };

  const handleDownload = async (id: number) => {
    try {
      const res = await axios.get(`${API_URL}/api/presentations/ai-generated/${id}/download`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `presentation_${id}.pptx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch { /* download failed silently */ }
  };

  const filtered = presentations.filter(p =>
    p.title.includes(searchQuery) || p.titleEn.toLowerCase().includes(searchQuery.toLowerCase()) || p.topic.includes(searchQuery)
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/presentation" className="hover:text-blue-600">العروض التقديمية</Link>
            <span>/</span>
            <span>توليد بالذكاء الاصطناعي</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">توليد العروض بالذكاء الاصطناعي</h1>
          <p className="text-gray-500">AI-Powered Slide Generation</p>
        </div>
        <button onClick={() => setShowGenerateModal(true)} className="flex items-center gap-2 rounded-lg bg-gradient-to-l from-purple-600 to-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:from-purple-700 hover:to-blue-700 transition shadow-md">
          <Sparkles className="h-4 w-4" />
          توليد عرض جديد
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي العروض', value: presentations.length, icon: Layers, color: 'text-blue-600' },
          { label: 'مكتملة', value: presentations.filter(p => p.status === 'completed').length, icon: CheckCircle, color: 'text-green-600' },
          { label: 'جاري التوليد', value: presentations.filter(p => p.status === 'generating').length, icon: Loader2, color: 'text-purple-600' },
          { label: 'إجمالي الشرائح', value: presentations.reduce((s, p) => s + p.slideCount, 0), icon: LayoutTemplate, color: 'text-indigo-600' },
        ].map((stat, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{stat.label}</span>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 rtl:right-3 ltr:left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="البحث في العروض المولدة..." className="w-full rounded-lg border border-gray-300 py-2 pr-10 pl-4 rtl:pr-10 rtl:pl-4 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
        </div>
        <button onClick={fetchPresentations} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition">
          <RefreshCw className="h-4 w-4" />
          تحديث
        </button>
      </div>

      {/* Presentations Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(pres => {
            const statusInfo = statusConfig[pres.status];
            const StatusIcon = statusInfo.icon;
            return (
              <div key={pres.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-lg transition group">
                <div className="h-36 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center relative">
                  <Layers className="h-12 w-12 text-white/30" />
                  <div className="absolute top-3 left-3 rtl:left-auto rtl:right-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="absolute bottom-3 right-3 rtl:right-auto rtl:left-3 bg-black/40 text-white text-xs px-2 py-1 rounded">
                    {pres.slideCount} شريحة
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{pres.title}</h3>
                  <p className="text-xs text-gray-400 mb-2">{pres.titleEn}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                    <Palette className="h-3.5 w-3.5" />
                    <span>{styleOptions.find(s => s.value === pres.style)?.label ?? pres.style}</span>
                    <span className="text-gray-300">|</span>
                    <Clock className="h-3.5 w-3.5" />
                    <span>{pres.createdAt}</span>
                  </div>
                  <div className="flex items-center gap-1 pt-2 border-t border-gray-100">
                    <button className="rounded p-1.5 hover:bg-blue-50 text-blue-600 transition flex-1 flex items-center justify-center gap-1 text-xs" title="معاينة"><Eye className="h-4 w-4" /> معاينة</button>
                    <button onClick={() => handleDownload(pres.id)} className="rounded p-1.5 hover:bg-green-50 text-green-600 transition flex-1 flex items-center justify-center gap-1 text-xs" title="تحميل"><Download className="h-4 w-4" /> تحميل</button>
                    <button onClick={() => handleDeletePresentation(pres.id)} className="rounded p-1.5 hover:bg-red-50 text-red-500 transition" title="حذف"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200">
              <Sparkles className="mx-auto h-10 w-10 mb-2" />
              <p>لا توجد عروض مولدة بعد</p>
            </div>
          )}
        </div>
      )}

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <Wand2 className="h-5 w-5 text-purple-600" />
              <h2 className="text-lg font-bold text-gray-900">توليد عرض تقديمي بالذكاء الاصطناعي</h2>
            </div>
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الموضوع</label>
                <input type="text" value={config.topic} onChange={e => setConfig(prev => ({ ...prev, topic: e.target.value }))} placeholder="مثال: استراتيجية التحول الرقمي" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الجمهور المستهدف</label>
                <input type="text" value={config.audience} onChange={e => setConfig(prev => ({ ...prev, audience: e.target.value }))} placeholder="مثال: مجلس الإدارة، فريق العمل" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">عدد الشرائح</label>
                  <input type="number" min={5} max={50} value={config.slideCount} onChange={e => setConfig(prev => ({ ...prev, slideCount: Number(e.target.value) }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">النمط</label>
                  <select value={config.style} onChange={e => setConfig(prev => ({ ...prev, style: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    {styleOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">اللغة</label>
                  <select value={config.language} onChange={e => setConfig(prev => ({ ...prev, language: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                    <option value="both">ثنائي اللغة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">النبرة</label>
                  <select value={config.tone} onChange={e => setConfig(prev => ({ ...prev, tone: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    {toneOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">مصدر البيانات (اختياري)</label>
                <input type="text" value={config.dataSource} onChange={e => setConfig(prev => ({ ...prev, dataSource: e.target.value }))} placeholder="اسم الجدول أو مصدر البيانات" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">تعليمات إضافية</label>
                <textarea value={config.additionalInstructions} onChange={e => setConfig(prev => ({ ...prev, additionalInstructions: e.target.value }))} placeholder="أي ملاحظات أو تعليمات خاصة للذكاء الاصطناعي..." rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={config.includeImages} onChange={e => setConfig(prev => ({ ...prev, includeImages: e.target.checked }))} className="rounded border-gray-300" />
                  <Image className="h-4 w-4 text-gray-400" />
                  تضمين صور توضيحية
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={config.includeCharts} onChange={e => setConfig(prev => ({ ...prev, includeCharts: e.target.checked }))} className="rounded border-gray-300" />
                  <FileText className="h-4 w-4 text-gray-400" />
                  تضمين رسوم بيانية
                </label>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowGenerateModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 transition">إلغاء</button>
                <button type="submit" disabled={isGenerating} className="flex items-center gap-2 rounded-lg bg-gradient-to-l from-purple-600 to-blue-600 px-4 py-2 text-sm text-white hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50">
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isGenerating ? 'جاري التوليد...' : 'توليد العرض'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
