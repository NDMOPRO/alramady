'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Database, Upload, Table, Filter, Brain, Columns, BookOpen, Eye, Layers,
  ArrowUpRight, Clock, CheckCircle, AlertTriangle, Loader2, GitBranch,
  Network, PenTool, BarChart3, FileSearch, Sparkles,
} from 'lucide-react';
import { getDatasets, getDataSources } from '@/lib/api/data';

const tabs = [
  { key: 'upload', label: 'الاستيراد', labelEn: 'Upload', icon: Upload, href: '/data/import' },
  { key: 'preview', label: 'القراءة', labelEn: 'Preview', icon: BookOpen, href: '/data/reading' },
  { key: 'columns', label: 'الأعمدة', labelEn: 'Columns', icon: Columns, href: '/data/columns' },
  { key: 'tables', label: 'الجداول', labelEn: 'Tables', icon: Table, href: '/data/tables' },
  { key: 'canvas', label: 'اللوحة', labelEn: 'Canvas', icon: PenTool, href: '/data/visual-processing' },
  { key: 'clean', label: 'التنظيف', labelEn: 'Clean', icon: Filter, href: '/data/cleansing' },
  { key: 'classify', label: 'التصنيف', labelEn: 'Classify', icon: Brain, href: '/data/classification' },
  { key: 'datasets', label: 'المجموعات', labelEn: 'Datasets', icon: Database, href: '/data/sources' },
  { key: 'relations', label: 'العلاقات', labelEn: 'Relations', icon: GitBranch, href: '/data/relations' },
  { key: 'semantic', label: 'الدلالي', labelEn: 'Semantic', icon: Network, href: '/data/semantic' },
];

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

export default function DataEnginePage() {
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const { data: datasetsData, isLoading: loadingDatasets } = useQuery({
    queryKey: ['datasets-overview'],
    queryFn: () => getDatasets({ page: 1, pageSize: 100 }),
  });

  const { data: sources, isLoading: loadingSources } = useQuery({
    queryKey: ['data-sources-overview'],
    queryFn: () => getDataSources(),
  });

  const isLoading = loadingDatasets || loadingSources;
  const datasets = datasetsData?.data ?? [];
  const totalRecords = datasets.reduce((sum: number, d) => sum + (d.rowCount || 0), 0);
  const sourceCount = sources?.length ?? 0;
  const activeDatasets = datasets.filter(d => d.status === 'active').length;
  const processingDatasets = datasets.filter(d => d.status === 'processing').length;

  const formatRecords = (n: number) => {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50">
            <Database className="h-7 w-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">محرك البيانات والملفات</h1>
            <p className="text-lg font-medium text-blue-600">Data & Files Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/data/import" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + استيراد بيانات
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <Database className="h-5 w-5 text-blue-500" />
          {isLoading ? <Loader2 className="mt-3 h-6 w-6 animate-spin text-gray-300" /> : (
            <p className="mt-3 text-3xl font-bold text-gray-900">{sourceCount}</p>
          )}
          <p className="text-sm text-gray-500">مصادر البيانات</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <Layers className="h-5 w-5 text-violet-500" />
          {isLoading ? <Loader2 className="mt-3 h-6 w-6 animate-spin text-gray-300" /> : (
            <p className="mt-3 text-3xl font-bold text-gray-900">{formatRecords(totalRecords)}</p>
          )}
          <p className="text-sm text-gray-500">إجمالي السجلات</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <CheckCircle className="h-5 w-5 text-green-500" />
          {isLoading ? <Loader2 className="mt-3 h-6 w-6 animate-spin text-gray-300" /> : (
            <p className="mt-3 text-3xl font-bold text-green-600">{activeDatasets}</p>
          )}
          <p className="text-sm text-gray-500">مجموعات نشطة</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <Clock className="h-5 w-5 text-orange-500" />
          {isLoading ? <Loader2 className="mt-3 h-6 w-6 animate-spin text-gray-300" /> : (
            <p className="mt-3 text-3xl font-bold text-gray-900">{processingDatasets}</p>
          )}
          <p className="text-sm text-gray-500">عمليات جارية</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100">
        <div className="flex overflow-x-auto border-b border-gray-100 px-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                onMouseEnter={() => setActiveTab(tab.key)}
                onMouseLeave={() => setActiveTab(null)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                <span className="text-xs text-gray-400">{tab.labelEn}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Module Cards Grid */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">الوحدات - Modules</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Link key={tab.key} href={tab.href} className="group rounded-xl bg-white p-5 shadow-sm border border-gray-100 transition-all hover:shadow-md hover:border-blue-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500 text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                </div>
                <h3 className="font-semibold text-gray-900">{tab.label}</h3>
                <p className="text-sm text-gray-400">{tab.labelEn}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Datasets */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">مجموعات البيانات الأخيرة - Recent Datasets</h2>
          <Link href="/data/sources" className="text-sm text-blue-600 hover:underline">عرض الكل</Link>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : datasets.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            لا توجد مجموعات بيانات بعد. قم باستيراد بيانات للبدء.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {datasets.slice(0, 5).map((ds) => (
              <div key={ds.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  {ds.status === 'active' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {ds.status === 'error' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                  {ds.status === 'processing' && <Clock className="h-4 w-4 text-amber-500" />}
                  {ds.status === 'archived' && <Database className="h-4 w-4 text-gray-400" />}
                  <div>
                    <p className="text-sm font-medium text-gray-900">{ds.nameAr || ds.name}</p>
                    <p className="text-xs text-gray-400">{ds.format?.toUpperCase()} - {formatSize(ds.fileSize || 0)} - {(ds.rowCount || 0).toLocaleString()} صف</p>
                  </div>
                </div>
                <span className="text-xs text-gray-400">{new Date(ds.updatedAt).toLocaleDateString('ar-SA')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
