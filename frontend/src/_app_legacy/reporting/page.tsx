'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  FileText, Sparkles, Code, Palette, GitCompare, ArrowUpRight,
  TrendingUp, Calendar, Clock, Download, Plus, Eye, Mail,
  CheckCircle, Loader2, Settings, AlertCircle,
} from 'lucide-react';

interface RecentReport {
  id: number;
  name: string;
  nameEn: string;
  format: string;
  pages: number;
  generated: string;
  status: string;
}

interface ScheduledReport {
  name: string;
  schedule: string;
  nextRun: string;
  recipients: number;
}

interface ReportingStats {
  totalReports: number;
  scheduledCount: number;
  templateCount: number;
  recipientCount: number;
  growth: string;
}

interface ReportingResponse {
  recentReports: RecentReport[];
  scheduledReports: ScheduledReport[];
  stats: ReportingStats;
}

const modules = [
  { title: 'Easy Mode', titleAr: 'الوضع السهل', href: '/reporting/easy-mode', icon: Sparkles, color: 'bg-orange-500', desc: 'إنشاء تقرير بنقرة واحدة' },
  { title: 'Advanced Mode', titleAr: 'الوضع المتقدم', href: '/reporting/advanced-mode', icon: Code, color: 'bg-red-500', desc: 'منشئ تقارير متقدم' },
  { title: 'Template Gallery', titleAr: 'معرض القوالب', href: '/reporting/templates', icon: Palette, color: 'bg-amber-500', desc: 'قوالب تقارير جاهزة' },
  { title: 'Report Comparison', titleAr: 'مقارنة التقارير', href: '/reporting/compare', icon: GitCompare, color: 'bg-teal-500', desc: 'مقارنة بين تقارير متعددة' },
];

export default function ReportingEnginePage() {
  const [recentReports, setRecentReports] = useState<RecentReport[]>([]);
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);
  const [stats, setStats] = useState<ReportingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ReportingResponse>('/api/reporting')
      .then(res => {
        setRecentReports(res.recentReports);
        setScheduledReports(res.scheduledReports);
        setStats(res.stats);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-orange-50">
            <FileText className="h-7 w-7 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">محرك التقارير</h1>
            <p className="text-lg font-medium text-orange-600">Reporting Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/reporting/easy-mode" className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <Sparkles className="h-4 w-4" /> إنشاء سريع
          </Link>
          <Link href="/reporting/advanced-mode" className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
            <Plus className="h-4 w-4" /> تقرير جديد
          </Link>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <FileText className="h-5 w-5 text-orange-500" />
            <span className="flex items-center text-xs text-green-600"><TrendingUp className="h-3 w-3 me-1" />{stats?.growth ?? '--'}</span>
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900">{stats?.totalReports ?? 0}</p>
          <p className="text-sm text-gray-500">تقارير منشأة</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <Calendar className="h-5 w-5 text-blue-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900">{stats?.scheduledCount ?? 0}</p>
          <p className="text-sm text-gray-500">تقارير مجدولة</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <Palette className="h-5 w-5 text-amber-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900">{stats?.templateCount ?? 0}</p>
          <p className="text-sm text-gray-500">قوالب</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <Mail className="h-5 w-5 text-violet-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900">{stats?.recipientCount ?? 0}</p>
          <p className="text-sm text-gray-500">مستلمون</p>
        </div>
      </div>

      {/* Module Cards */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">الوحدات - Modules</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.href} href={mod.href} className="group rounded-xl bg-white p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-orange-200 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${mod.color} text-white`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-orange-500 transition-colors" />
                </div>
                <h3 className="font-semibold text-gray-900">{mod.titleAr}</h3>
                <p className="text-sm text-gray-400">{mod.title}</p>
                <p className="mt-2 text-xs text-gray-500">{mod.desc}</p>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Reports */}
        <div className="lg:col-span-2 rounded-xl bg-white shadow-sm border border-gray-100">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="font-semibold text-gray-900">التقارير الأخيرة - Recent Reports</h2>
            <button className="text-sm text-orange-600 hover:underline">عرض الكل</button>
          </div>
          <div className="divide-y divide-gray-50">
            {recentReports.map((report) => (
              <div key={report.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  {report.status === 'ready' ? <CheckCircle className="h-5 w-5 text-green-500" /> : <Loader2 className="h-5 w-5 text-orange-500 animate-spin" />}
                  <div>
                    <p className="font-medium text-gray-900">{report.name}</p>
                    <p className="text-xs text-gray-400">{report.nameEn} - {report.format} - {report.pages} صفحة</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{report.generated}</span>
                  {report.status === 'ready' && (
                    <button className="rounded p-1 hover:bg-gray-100"><Download className="h-4 w-4 text-gray-400" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scheduled Reports */}
        <div className="rounded-xl bg-white shadow-sm border border-gray-100">
          <div className="border-b border-gray-100 px-4 py-4">
            <h2 className="font-semibold text-gray-900">التقارير المجدولة</h2>
            <p className="text-xs text-gray-400">Scheduled Reports</p>
          </div>
          <div className="divide-y divide-gray-50">
            {scheduledReports.map((report, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-gray-900 text-sm">{report.name}</p>
                  <Settings className="h-3 w-3 text-gray-300" />
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {report.schedule}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {report.nextRun}</span>
                </div>
                <p className="mt-1 text-xs text-gray-400"><Mail className="inline h-3 w-3 me-1" />{report.recipients} مستلم</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
