'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Filter, Plus, Play, Pause, CheckCircle, XCircle, Clock, AlertTriangle,
  Search, Download, RefreshCw, Trash2, Edit, Eye, Sparkles, TrendingUp,
  Zap, BarChart3, Loader2, AlertCircle,
} from 'lucide-react';

interface Rule {
  id: number;
  name: string;
  nameEn: string;
  table: string;
  status: string;
  matches: number;
  lastRun: string;
  severity: string;
}

interface Job {
  id: number;
  name: string;
  progress: number;
  status: string;
  records: string;
  fixed: string;
  time: string;
}

interface QualityScore {
  table: string;
  score: number;
  completeness: number;
  accuracy: number;
  consistency: number;
}

interface CleansingStats {
  activeRules: number;
  fixedIssues: number;
  qualityScore: number;
  monthlyImprovement: string;
}

interface CleansingResponse {
  rules: Rule[];
  jobs: Job[];
  qualityScores: QualityScore[];
  stats: CleansingStats;
}

export default function DataCleansingPage() {
  const [activeTab, setActiveTab] = useState<'rules' | 'jobs' | 'quality'>('rules');
  const [searchQuery, setSearchQuery] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [qualityScores, setQualityScores] = useState<QualityScore[]>([]);
  const [stats, setStats] = useState<CleansingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<CleansingResponse>('/api/data/cleansing')
      .then(res => {
        setRules(res.rules);
        setJobs(res.jobs);
        setQualityScores(res.qualityScores);
        setStats(res.stats);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleRunRule = async (ruleId: number) => {
    try {
      await api.post('/api/data/cleanse', { ruleId });
      const res = await api.get<CleansingResponse>('/api/data/cleansing');
      setRules(res.rules);
      setJobs(res.jobs);
    } catch (err: any) {
      setError(err.message);
    }
  };

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
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/data" className="hover:text-blue-600">محرك البيانات</Link>
            <span>/</span>
            <span>تنظيف البيانات</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">تنظيف البيانات</h1>
          <p className="text-gray-500">Data Cleansing Engine</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <Sparkles className="h-4 w-4" /> تنظيف ذكي
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
            <Plus className="h-4 w-4" /> قاعدة جديدة
          </button>
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
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-2"><Zap className="h-5 w-5 text-orange-500" /></div>
          <p className="text-3xl font-bold text-orange-600">{stats?.activeRules ?? 0}</p>
          <p className="text-sm text-gray-500">قواعد نشطة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-2"><CheckCircle className="h-5 w-5 text-green-500" /></div>
          <p className="text-3xl font-bold text-green-600">{stats?.fixedIssues ?? 0}</p>
          <p className="text-sm text-gray-500">مشاكل تم إصلاحها</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-2"><BarChart3 className="h-5 w-5 text-blue-500" /></div>
          <p className="text-3xl font-bold text-blue-600">{stats?.qualityScore ?? 0}%</p>
          <p className="text-sm text-gray-500">درجة الجودة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-2"><TrendingUp className="h-5 w-5 text-violet-500" /></div>
          <p className="text-3xl font-bold text-violet-600">{stats?.monthlyImprovement ?? '--'}</p>
          <p className="text-sm text-gray-500">تحسن هذا الشهر</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'rules' as const, label: 'القواعد', labelEn: 'Rules' },
          { key: 'jobs' as const, label: 'المهام', labelEn: 'Jobs' },
          { key: 'quality' as const, label: 'درجات الجودة', labelEn: 'Quality Scores' },
        ].map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? 'border-orange-600 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label} <span className="text-xs text-gray-400">({tab.labelEn})</span>
          </button>
        ))}
      </div>

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="البحث في القواعد..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 ps-10 pe-4 text-sm focus:border-orange-500 focus:outline-none" />
          </div>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-6 py-3 text-start font-medium text-gray-500">القاعدة</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">الجدول</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">الحالة</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">المطابقات</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">الأهمية</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">آخر تشغيل</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{rule.name}</p>
                      <p className="text-xs text-gray-400">{rule.nameEn}</p>
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-600">{rule.table}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        rule.status === 'active' ? 'bg-green-100 text-green-700' :
                        rule.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {rule.status === 'active' ? 'نشط' : rule.status === 'paused' ? 'متوقف' : 'خطأ'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-700">{rule.matches}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        rule.severity === 'high' ? 'bg-red-100 text-red-600' :
                        rule.severity === 'medium' ? 'bg-amber-100 text-amber-600' :
                        'bg-blue-100 text-blue-600'
                      }`}>{rule.severity === 'high' ? 'عالي' : rule.severity === 'medium' ? 'متوسط' : 'منخفض'}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{rule.lastRun}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleRunRule(rule.id)} className="rounded p-1 hover:bg-gray-100"><Play className="h-4 w-4 text-green-500" /></button>
                        <button className="rounded p-1 hover:bg-gray-100"><Edit className="h-4 w-4 text-gray-400" /></button>
                        <button className="rounded p-1 hover:bg-red-50"><Trash2 className="h-4 w-4 text-gray-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Jobs Tab */}
      {activeTab === 'jobs' && (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {job.status === 'completed' && <CheckCircle className="h-5 w-5 text-green-500" />}
                  {job.status === 'running' && <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />}
                  {job.status === 'queued' && <Clock className="h-5 w-5 text-gray-400" />}
                  <div>
                    <p className="font-medium text-gray-900">{job.name}</p>
                    <p className="text-xs text-gray-400">{job.records} سجل - {job.fixed} تم إصلاحه - {job.time}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  job.status === 'completed' ? 'bg-green-100 text-green-700' :
                  job.status === 'running' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-500'
                }`}>{job.status === 'completed' ? 'مكتمل' : job.status === 'running' ? 'جاري' : 'قيد الانتظار'}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div className={`h-2 rounded-full transition-all ${
                  job.status === 'completed' ? 'bg-green-500' : job.status === 'running' ? 'bg-blue-500' : 'bg-gray-300'
                }`} style={{ width: `${job.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quality Tab */}
      {activeTab === 'quality' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {qualityScores.map((item) => (
            <div key={item.table} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-mono font-semibold text-gray-900">{item.table}</h3>
                <span className={`text-2xl font-bold ${item.score >= 95 ? 'text-green-600' : item.score >= 85 ? 'text-amber-600' : 'text-red-600'}`}>
                  {item.score}%
                </span>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'الاكتمال', value: item.completeness },
                  { label: 'الدقة', value: item.accuracy },
                  { label: 'الاتساق', value: item.consistency },
                ].map((metric) => (
                  <div key={metric.label} className="flex items-center gap-2">
                    <span className="w-16 text-xs text-gray-500">{metric.label}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-gray-200">
                      <div className={`h-1.5 rounded-full ${metric.value >= 95 ? 'bg-green-500' : metric.value >= 85 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${metric.value}%` }} />
                    </div>
                    <span className="text-xs font-medium text-gray-600">{metric.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
