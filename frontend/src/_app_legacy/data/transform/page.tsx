'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';
import {
  Shuffle, Plus, Play, Trash2, Search, Download, RefreshCw,
  ArrowRightLeft, Layers, BarChart3, CheckCircle, Clock, AlertTriangle,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:80';

interface TransformOperation {
  id: number;
  name: string;
  nameEn: string;
  type: 'merge' | 'pivot' | 'aggregate' | 'reshape' | 'transpose';
  sourceTable: string;
  outputTable: string;
  status: 'completed' | 'running' | 'failed' | 'draft';
  rowsProcessed: number;
  lastRun: string;
}

interface TransformConfig {
  operationType: string;
  sourceTable: string;
  outputName: string;
  groupByColumns: string[];
  aggregateFunction: string;
  pivotColumn: string;
  valueColumn: string;
}

const defaultOperations: TransformOperation[] = [
  { id: 1, name: 'تجميع المبيعات الشهرية', nameEn: 'Monthly Sales Aggregation', type: 'aggregate', sourceTable: 'sales_2024', outputTable: 'monthly_sales_summary', status: 'completed', rowsProcessed: 45000, lastRun: 'منذ ساعة' },
  { id: 2, name: 'محور بيانات العملاء', nameEn: 'Customer Data Pivot', type: 'pivot', sourceTable: 'customers', outputTable: 'customer_pivot_view', status: 'completed', rowsProcessed: 12800, lastRun: 'منذ 3 ساعات' },
  { id: 3, name: 'دمج جداول المخزون', nameEn: 'Inventory Merge', type: 'merge', sourceTable: 'inventory_a, inventory_b', outputTable: 'inventory_merged', status: 'running', rowsProcessed: 8900, lastRun: 'جاري التنفيذ' },
  { id: 4, name: 'إعادة تشكيل البيانات المالية', nameEn: 'Financial Data Reshape', type: 'reshape', sourceTable: 'finance_raw', outputTable: 'finance_structured', status: 'failed', rowsProcessed: 0, lastRun: 'فشل' },
  { id: 5, name: 'تبديل صفوف وأعمدة التقارير', nameEn: 'Report Transpose', type: 'transpose', sourceTable: 'quarterly_report', outputTable: 'transposed_report', status: 'draft', rowsProcessed: 0, lastRun: '--' },
];

const typeLabels: Record<string, string> = {
  merge: 'دمج',
  pivot: 'محور',
  aggregate: 'تجميع',
  reshape: 'إعادة تشكيل',
  transpose: 'تبديل',
};

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  running: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
  draft: 'bg-gray-100 text-gray-600',
};

export default function DataTransformPage() {
  const [operations, setOperations] = useState<TransformOperation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [config, setConfig] = useState<TransformConfig>({
    operationType: 'aggregate',
    sourceTable: '',
    outputName: '',
    groupByColumns: [],
    aggregateFunction: 'SUM',
    pivotColumn: '',
    valueColumn: '',
  });

  const fetchOperations = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/data/transforms`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
      setOperations(res.data?.results ?? defaultOperations);
    } catch {
      setOperations(defaultOperations);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  const handleCreateTransform = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/data/transforms`, config, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
      setShowCreateModal(false);
      setConfig({ operationType: 'aggregate', sourceTable: '', outputName: '', groupByColumns: [], aggregateFunction: 'SUM', pivotColumn: '', valueColumn: '' });
      fetchOperations();
    } catch {
      const newOp: TransformOperation = {
        id: Date.now(),
        name: config.outputName,
        nameEn: config.outputName,
        type: config.operationType as TransformOperation['type'],
        sourceTable: config.sourceTable,
        outputTable: config.outputName,
        status: 'draft',
        rowsProcessed: 0,
        lastRun: '--',
      };
      setOperations(prev => [newOp, ...prev]);
      setShowCreateModal(false);
    }
  };

  const handleRunOperation = async (id: number) => {
    setOperations(prev => prev.map(op => op.id === id ? { ...op, status: 'running' as const, lastRun: 'جاري التنفيذ' } : op));
    try {
      await axios.post(`${API_URL}/api/data/transforms/${id}/run`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
    } catch { /* optimistic UI already updated */ }
  };

  const handleDeleteOperation = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/api/data/transforms/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
    } catch { /* continue with local delete */ }
    setOperations(prev => prev.filter(op => op.id !== id));
  };

  const filtered = operations.filter(op => {
    const matchesSearch = op.name.includes(searchQuery) || op.nameEn.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || op.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/data" className="hover:text-blue-600">محرك البيانات</Link>
            <span>/</span>
            <span>تحويل البيانات</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">تحويل البيانات</h1>
          <p className="text-gray-500">Data Transformation — دمج، محور، تجميع</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition">
          <Plus className="h-4 w-4" />
          عملية تحويل جديدة
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي العمليات', value: operations.length, icon: Layers, color: 'text-blue-600' },
          { label: 'مكتملة', value: operations.filter(o => o.status === 'completed').length, icon: CheckCircle, color: 'text-green-600' },
          { label: 'قيد التنفيذ', value: operations.filter(o => o.status === 'running').length, icon: Clock, color: 'text-yellow-600' },
          { label: 'فاشلة', value: operations.filter(o => o.status === 'failed').length, icon: AlertTriangle, color: 'text-red-600' },
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

      {/* Search & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 rtl:right-3 ltr:left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="البحث في العمليات..." className="w-full rounded-lg border border-gray-300 py-2 pr-10 pl-4 rtl:pr-10 rtl:pl-4 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="rounded-lg border border-gray-300 py-2 px-3 text-sm">
          <option value="all">جميع الأنواع</option>
          <option value="merge">دمج</option>
          <option value="pivot">محور</option>
          <option value="aggregate">تجميع</option>
          <option value="reshape">إعادة تشكيل</option>
          <option value="transpose">تبديل</option>
        </select>
        <button onClick={fetchOperations} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition">
          <RefreshCw className="h-4 w-4" />
          تحديث
        </button>
      </div>

      {/* Operations Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right font-medium text-gray-600">اسم العملية</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">النوع</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">الجدول المصدر</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">الصفوف</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">الحالة</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">آخر تشغيل</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(op => (
                <tr key={op.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{op.name}</p>
                    <p className="text-xs text-gray-400">{op.nameEn}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                      <ArrowRightLeft className="h-3 w-3" />
                      {typeLabels[op.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{op.sourceTable}</td>
                  <td className="px-4 py-3 text-gray-600">{op.rowsProcessed.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[op.status]}`}>
                      {op.status === 'completed' ? 'مكتمل' : op.status === 'running' ? 'جاري' : op.status === 'failed' ? 'فشل' : 'مسودة'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{op.lastRun}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleRunOperation(op.id)} className="rounded p-1.5 hover:bg-blue-50 text-blue-600 transition" title="تشغيل">
                        <Play className="h-4 w-4" />
                      </button>
                      <button className="rounded p-1.5 hover:bg-gray-100 text-gray-500 transition" title="تحميل النتائج">
                        <Download className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDeleteOperation(op.id)} className="rounded p-1.5 hover:bg-red-50 text-red-500 transition" title="حذف">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              <Shuffle className="mx-auto h-10 w-10 mb-2" />
              <p>لا توجد عمليات تحويل مطابقة</p>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">عملية تحويل جديدة</h2>
            <form onSubmit={handleCreateTransform} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">نوع العملية</label>
                <select value={config.operationType} onChange={e => setConfig(prev => ({ ...prev, operationType: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="aggregate">تجميع (Aggregate)</option>
                  <option value="pivot">محور (Pivot)</option>
                  <option value="merge">دمج (Merge)</option>
                  <option value="reshape">إعادة تشكيل (Reshape)</option>
                  <option value="transpose">تبديل (Transpose)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الجدول المصدر</label>
                <input type="text" value={config.sourceTable} onChange={e => setConfig(prev => ({ ...prev, sourceTable: e.target.value }))} placeholder="اسم الجدول المصدر" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم الجدول الناتج</label>
                <input type="text" value={config.outputName} onChange={e => setConfig(prev => ({ ...prev, outputName: e.target.value }))} placeholder="اسم الناتج" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              {config.operationType === 'aggregate' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">دالة التجميع</label>
                    <select value={config.aggregateFunction} onChange={e => setConfig(prev => ({ ...prev, aggregateFunction: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <option value="SUM">مجموع (SUM)</option>
                      <option value="AVG">متوسط (AVG)</option>
                      <option value="COUNT">عدد (COUNT)</option>
                      <option value="MIN">أدنى (MIN)</option>
                      <option value="MAX">أقصى (MAX)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">عمود القيمة</label>
                    <input type="text" value={config.valueColumn} onChange={e => setConfig(prev => ({ ...prev, valueColumn: e.target.value }))} placeholder="مثال: amount" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </>
              )}
              {config.operationType === 'pivot' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">عمود المحور</label>
                  <input type="text" value={config.pivotColumn} onChange={e => setConfig(prev => ({ ...prev, pivotColumn: e.target.value }))} placeholder="مثال: category" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 transition">إلغاء</button>
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 transition">إنشاء العملية</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
