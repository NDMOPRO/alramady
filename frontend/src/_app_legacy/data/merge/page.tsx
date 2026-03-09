'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';
import {
  Merge, Plus, Play, Search, Download, RefreshCw, Trash2,
  Eye, CheckCircle, Clock, AlertTriangle, Table2, Link2, Settings2,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:80';

interface MergeJob {
  id: number;
  name: string;
  nameEn: string;
  leftTable: string;
  rightTable: string;
  joinType: 'inner' | 'left' | 'right' | 'full' | 'cross';
  matchKey: string;
  status: 'completed' | 'running' | 'failed' | 'pending';
  matchedRows: number;
  unmatchedRows: number;
  outputTable: string;
  lastRun: string;
}

interface MergeConfig {
  name: string;
  leftTable: string;
  rightTable: string;
  joinType: string;
  leftKey: string;
  rightKey: string;
  matchMode: 'exact' | 'fuzzy' | 'pattern';
  fuzzyThreshold: number;
  outputName: string;
  includeUnmatched: boolean;
}

const defaultJobs: MergeJob[] = [
  { id: 1, name: 'دمج بيانات الموظفين مع الرواتب', nameEn: 'Employees + Salaries Merge', leftTable: 'employees', rightTable: 'salaries', joinType: 'inner', matchKey: 'employee_id', status: 'completed', matchedRows: 4500, unmatchedRows: 23, outputTable: 'emp_salary_merged', lastRun: 'منذ ساعة' },
  { id: 2, name: 'ربط العملاء بالطلبات', nameEn: 'Customers + Orders Join', leftTable: 'customers', rightTable: 'orders_2024', joinType: 'left', matchKey: 'customer_id', status: 'completed', matchedRows: 12400, unmatchedRows: 340, outputTable: 'customer_orders_view', lastRun: 'منذ 3 ساعات' },
  { id: 3, name: 'مطابقة المنتجات مع المخزون', nameEn: 'Products + Inventory Match', leftTable: 'products', rightTable: 'inventory', joinType: 'full', matchKey: 'sku', status: 'running', matchedRows: 8200, unmatchedRows: 0, outputTable: 'product_inventory', lastRun: 'جاري التنفيذ' },
  { id: 4, name: 'ربط الفروع مع المناطق', nameEn: 'Branches + Regions Lookup', leftTable: 'branches', rightTable: 'regions', joinType: 'left', matchKey: 'region_code', status: 'failed', matchedRows: 0, unmatchedRows: 0, outputTable: 'branch_region_map', lastRun: 'فشل - مفتاح غير موجود' },
];

const joinTypeLabels: Record<string, string> = {
  inner: 'تقاطع (INNER)',
  left: 'يسار (LEFT)',
  right: 'يمين (RIGHT)',
  full: 'كامل (FULL)',
  cross: 'متقاطع (CROSS)',
};

const statusConfig: Record<string, { color: string; label: string }> = {
  completed: { color: 'bg-green-100 text-green-700', label: 'مكتمل' },
  running: { color: 'bg-blue-100 text-blue-700', label: 'جاري' },
  failed: { color: 'bg-red-100 text-red-700', label: 'فشل' },
  pending: { color: 'bg-yellow-100 text-yellow-700', label: 'قيد الانتظار' },
};

export default function DataMergePage() {
  const [jobs, setJobs] = useState<MergeJob[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewJobId, setPreviewJobId] = useState<number | null>(null);
  const [config, setConfig] = useState<MergeConfig>({
    name: '',
    leftTable: '',
    rightTable: '',
    joinType: 'inner',
    leftKey: '',
    rightKey: '',
    matchMode: 'exact',
    fuzzyThreshold: 80,
    outputName: '',
    includeUnmatched: false,
  });

  const fetchJobs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/data/merge-jobs`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
      setJobs(res.data?.results ?? defaultJobs);
    } catch {
      setJobs(defaultJobs);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleCreateMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/data/merge-jobs`, config, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
      fetchJobs();
    } catch {
      const newJob: MergeJob = {
        id: Date.now(),
        name: config.name,
        nameEn: config.name,
        leftTable: config.leftTable,
        rightTable: config.rightTable,
        joinType: config.joinType as MergeJob['joinType'],
        matchKey: `${config.leftKey} = ${config.rightKey}`,
        status: 'pending',
        matchedRows: 0,
        unmatchedRows: 0,
        outputTable: config.outputName,
        lastRun: 'لم يبدأ',
      };
      setJobs(prev => [newJob, ...prev]);
    }
    setShowCreateModal(false);
    setConfig({ name: '', leftTable: '', rightTable: '', joinType: 'inner', leftKey: '', rightKey: '', matchMode: 'exact', fuzzyThreshold: 80, outputName: '', includeUnmatched: false });
  };

  const handleRunJob = async (id: number) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'running' as const, lastRun: 'جاري التنفيذ' } : j));
    try {
      await axios.post(`${API_URL}/api/data/merge-jobs/${id}/run`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
    } catch { /* optimistic update already applied */ }
  };

  const handleDeleteJob = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/api/data/merge-jobs/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
    } catch { /* continue */ }
    setJobs(prev => prev.filter(j => j.id !== id));
  };

  const filtered = jobs.filter(j =>
    j.name.includes(searchQuery) || j.nameEn.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/data" className="hover:text-blue-600">محرك البيانات</Link>
            <span>/</span>
            <span>دمج البيانات</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">دمج وربط البيانات</h1>
          <p className="text-gray-500">Dataset Merge & Join — VLOOKUP-style Matching</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition">
          <Plus className="h-4 w-4" />
          عملية دمج جديدة
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي عمليات الدمج', value: jobs.length, icon: Link2, color: 'text-blue-600' },
          { label: 'صفوف متطابقة', value: jobs.reduce((s, j) => s + j.matchedRows, 0).toLocaleString(), icon: CheckCircle, color: 'text-green-600' },
          { label: 'صفوف غير متطابقة', value: jobs.reduce((s, j) => s + j.unmatchedRows, 0).toLocaleString(), icon: AlertTriangle, color: 'text-yellow-600' },
          { label: 'جاري التنفيذ', value: jobs.filter(j => j.status === 'running').length, icon: Clock, color: 'text-purple-600' },
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
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="البحث في عمليات الدمج..." className="w-full rounded-lg border border-gray-300 py-2 pr-10 pl-4 rtl:pr-10 rtl:pl-4 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
        </div>
        <button onClick={fetchJobs} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition">
          <RefreshCw className="h-4 w-4" />
          تحديث
        </button>
      </div>

      {/* Jobs List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(job => (
            <div key={job.id} className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900">{job.name}</h3>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig[job.status].color}`}>
                      {statusConfig[job.status].label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">{job.nameEn}</p>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Table2 className="h-4 w-4 text-gray-400" />
                      <span className="font-mono text-xs text-blue-600">{job.leftTable}</span>
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">{joinTypeLabels[job.joinType]}</span>
                      <span className="font-mono text-xs text-green-600">{job.rightTable}</span>
                    </div>
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-500">المفتاح: <code className="bg-gray-100 px-1 rounded text-xs">{job.matchKey}</code></span>
                    <span className="text-gray-400">|</span>
                    <span className="text-green-600">{job.matchedRows.toLocaleString()} متطابق</span>
                    {job.unmatchedRows > 0 && <span className="text-yellow-600">{job.unmatchedRows.toLocaleString()} غير متطابق</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 mr-4 rtl:mr-0 rtl:ml-4">
                  <button onClick={() => handleRunJob(job.id)} className="rounded p-1.5 hover:bg-blue-50 text-blue-600 transition" title="تشغيل"><Play className="h-4 w-4" /></button>
                  <button onClick={() => setPreviewJobId(previewJobId === job.id ? null : job.id)} className="rounded p-1.5 hover:bg-gray-100 text-gray-500 transition" title="معاينة"><Eye className="h-4 w-4" /></button>
                  <button className="rounded p-1.5 hover:bg-gray-100 text-gray-500 transition" title="تحميل"><Download className="h-4 w-4" /></button>
                  <button onClick={() => handleDeleteJob(job.id)} className="rounded p-1.5 hover:bg-red-50 text-red-500 transition" title="حذف"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {previewJobId === job.id && (
                <div className="mt-4 rounded-lg bg-gray-50 p-4 border">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">معاينة النتائج</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead><tr className="border-b"><th className="pb-1 text-right text-gray-500">الجدول الناتج</th><th className="pb-1 text-right text-gray-500">آخر تشغيل</th><th className="pb-1 text-right text-gray-500">الحالة</th></tr></thead>
                      <tbody><tr><td className="py-1 font-mono">{job.outputTable}</td><td className="py-1">{job.lastRun}</td><td className="py-1">{statusConfig[job.status].label}</td></tr></tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200">
              <Merge className="mx-auto h-10 w-10 mb-2" />
              <p>لا توجد عمليات دمج مطابقة</p>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">عملية دمج جديدة</h2>
            <form onSubmit={handleCreateMerge} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم العملية</label>
                <input type="text" value={config.name} onChange={e => setConfig(prev => ({ ...prev, name: e.target.value }))} placeholder="مثال: دمج الموظفين مع الأقسام" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الجدول الأيسر</label>
                  <input type="text" value={config.leftTable} onChange={e => setConfig(prev => ({ ...prev, leftTable: e.target.value }))} placeholder="اسم الجدول" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الجدول الأيمن</label>
                  <input type="text" value={config.rightTable} onChange={e => setConfig(prev => ({ ...prev, rightTable: e.target.value }))} placeholder="اسم الجدول" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">نوع الربط</label>
                <select value={config.joinType} onChange={e => setConfig(prev => ({ ...prev, joinType: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="inner">تقاطع (INNER JOIN)</option>
                  <option value="left">يسار (LEFT JOIN)</option>
                  <option value="right">يمين (RIGHT JOIN)</option>
                  <option value="full">كامل (FULL JOIN)</option>
                  <option value="cross">متقاطع (CROSS JOIN)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">مفتاح الجدول الأيسر</label>
                  <input type="text" value={config.leftKey} onChange={e => setConfig(prev => ({ ...prev, leftKey: e.target.value }))} placeholder="مثال: employee_id" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">مفتاح الجدول الأيمن</label>
                  <input type="text" value={config.rightKey} onChange={e => setConfig(prev => ({ ...prev, rightKey: e.target.value }))} placeholder="مثال: emp_id" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">وضع المطابقة</label>
                <select value={config.matchMode} onChange={e => setConfig(prev => ({ ...prev, matchMode: e.target.value as MergeConfig['matchMode'] }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="exact">مطابقة تامة (Exact)</option>
                  <option value="fuzzy">مطابقة تقريبية (Fuzzy)</option>
                  <option value="pattern">نمط (Pattern/Regex)</option>
                </select>
              </div>
              {config.matchMode === 'fuzzy' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">حد التشابه: {config.fuzzyThreshold}%</label>
                  <input type="range" min={50} max={100} value={config.fuzzyThreshold} onChange={e => setConfig(prev => ({ ...prev, fuzzyThreshold: Number(e.target.value) }))} className="w-full" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم الجدول الناتج</label>
                <input type="text" value={config.outputName} onChange={e => setConfig(prev => ({ ...prev, outputName: e.target.value }))} placeholder="اسم الناتج" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={config.includeUnmatched} onChange={e => setConfig(prev => ({ ...prev, includeUnmatched: e.target.checked }))} className="rounded border-gray-300" />
                تضمين الصفوف غير المتطابقة
              </label>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 transition">إلغاء</button>
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 transition">إنشاء عملية الدمج</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
