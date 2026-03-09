'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles, FileText, Table, BarChart3, Download, Eye,
  CheckCircle, Loader2, Wand2, ArrowRight, Calendar,
  DollarSign, Users, Package, TrendingUp, PieChart,
} from 'lucide-react';

const reportTypes = [
  { id: 1, name: 'تقرير مالي', nameEn: 'Financial Report', icon: DollarSign, color: 'bg-blue-500' },
  { id: 2, name: 'تقرير موظفين', nameEn: 'HR Report', icon: Users, color: 'bg-violet-500' },
  { id: 3, name: 'تقرير مبيعات', nameEn: 'Sales Report', icon: TrendingUp, color: 'bg-green-500' },
  { id: 4, name: 'تقرير مخزون', nameEn: 'Inventory Report', icon: Package, color: 'bg-amber-500' },
];

const dataSources = [
  { id: 1, name: 'employees', label: 'الموظفين', records: '1,250' },
  { id: 2, name: 'sales_2024', label: 'المبيعات 2024', records: '45,000' },
  { id: 3, name: 'inventory', label: 'المخزون', records: '8,900' },
  { id: 4, name: 'transactions', label: 'المعاملات', records: '120,000' },
];

const formatOptions = [
  { id: 'pdf', label: 'PDF', desc: 'مستند محمول' },
  { id: 'docx', label: 'Word', desc: 'مستند وورد' },
  { id: 'xlsx', label: 'Excel', desc: 'جدول إكسل' },
  { id: 'html', label: 'HTML', desc: 'صفحة ويب' },
];

export default function EasyModeReportingPage() {
  const [step, setStep] = useState<'type' | 'data' | 'format' | 'generating' | 'done'>('type');
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [selectedSource, setSelectedSource] = useState<number | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);

  const handleGenerate = () => {
    setStep('generating');
    setTimeout(() => setStep('done'), 2500);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
          <Link href="/reporting" className="hover:text-orange-600">محرك التقارير</Link>
          <span>/</span>
          <span>الوضع السهل</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">إنشاء تقرير بنقرة واحدة</h1>
        <p className="text-gray-500">One-Click Report Generator</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-orange-600">4</p>
          <p className="text-sm text-gray-500">أنواع تقارير</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-blue-600">4</p>
          <p className="text-sm text-gray-500">صيغ تصدير</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">~45s</p>
          <p className="text-sm text-gray-500">وقت الإنشاء</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-violet-600">AI</p>
          <p className="text-sm text-gray-500">تحليل ذكي</p>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm border border-gray-100">
        {['نوع التقرير', 'مصدر البيانات', 'الصيغة', 'إنشاء'].map((label, i) => {
          const stepOrder = ['type', 'data', 'format', 'generating'];
          const currentIdx = stepOrder.indexOf(step === 'done' ? 'generating' : step);
          return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                i <= currentIdx ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>{i < currentIdx ? <CheckCircle className="h-4 w-4" /> : i + 1}</div>
              <span className="hidden sm:block text-xs text-gray-600">{label}</span>
              {i < 3 && <div className="mx-1 h-px flex-1 bg-gray-200" />}
            </div>
          );
        })}
      </div>

      {step === 'type' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">1. اختر نوع التقرير</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {reportTypes.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => setSelectedType(t.id)}
                  className={`flex flex-col items-center gap-3 rounded-xl p-6 border-2 transition-all ${
                    selectedType === t.id ? 'border-orange-500 bg-orange-50 shadow-md' : 'border-gray-200 bg-white hover:border-orange-300'
                  }`}>
                  <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${t.color} text-white`}>
                    <Icon className="h-7 w-7" />
                  </div>
                  <p className="font-semibold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.nameEn}</p>
                </button>
              );
            })}
          </div>
          {selectedType && (
            <button onClick={() => setStep('data')} className="flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-orange-700">
              التالي <ArrowRight className="h-4 w-4 rotate-180" />
            </button>
          )}
        </div>
      )}

      {step === 'data' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">2. اختر مصدر البيانات</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {dataSources.map((ds) => (
              <button key={ds.id} onClick={() => setSelectedSource(ds.id)}
                className={`flex items-center justify-between rounded-xl p-4 border-2 transition-all ${
                  selectedSource === ds.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-300'
                }`}>
                <div className="flex items-center gap-3">
                  <Table className="h-5 w-5 text-gray-400" />
                  <div className="text-start">
                    <p className="font-medium text-gray-900">{ds.label}</p>
                    <p className="text-xs text-gray-400 font-mono">{ds.name}</p>
                  </div>
                </div>
                <span className="text-sm text-gray-500">{ds.records}</span>
              </button>
            ))}
          </div>
          {selectedSource && (
            <button onClick={() => setStep('format')} className="flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-orange-700">
              التالي <ArrowRight className="h-4 w-4 rotate-180" />
            </button>
          )}
        </div>
      )}

      {step === 'format' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">3. اختر صيغة التصدير</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {formatOptions.map((f) => (
              <button key={f.id} onClick={() => setSelectedFormat(f.id)}
                className={`rounded-xl p-4 border-2 text-center transition-all ${
                  selectedFormat === f.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-300'
                }`}>
                <p className="text-lg font-bold text-gray-900">{f.label}</p>
                <p className="text-xs text-gray-400">{f.desc}</p>
              </button>
            ))}
          </div>
          {selectedFormat && (
            <button onClick={handleGenerate} className="flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-orange-700">
              <Wand2 className="h-4 w-4" /> إنشاء التقرير
            </button>
          )}
        </div>
      )}

      {step === 'generating' && (
        <div className="rounded-xl bg-white p-12 shadow-sm border border-gray-100 text-center">
          <Loader2 className="mx-auto h-16 w-16 text-orange-500 animate-spin mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">جاري إنشاء التقرير...</h2>
          <p className="text-gray-500 mt-2">Generating your report with AI analysis...</p>
          <div className="mt-6 mx-auto w-64 h-2 rounded-full bg-gray-200">
            <div className="h-2 rounded-full bg-orange-600 animate-pulse" style={{ width: '65%' }} />
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-green-50 border border-green-200 p-6 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-3" />
            <h2 className="text-xl font-semibold text-green-800">تم إنشاء التقرير بنجاح!</h2>
            <p className="text-green-600 mt-1">Report generated successfully - 24 pages</p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button className="flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-orange-700">
              <Download className="h-4 w-4" /> تحميل التقرير
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm hover:bg-gray-50">
              <Eye className="h-4 w-4" /> معاينة
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
