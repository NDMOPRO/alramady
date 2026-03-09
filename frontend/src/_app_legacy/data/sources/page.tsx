'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database, FileSpreadsheet, FileJson, Globe, Server, HardDrive,
  Plus, Search, Download, CheckCircle, XCircle, Clock,
  RefreshCw, Trash2, Eye, Loader2, AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';

interface DataSourceItem {
  id: string;
  name: string;
  description: string;
  sourceType: string;
  format: string;
  status: string;
  rowCount: number;
  columnCount: number;
  sizeBytes: number;
  qualityScore: number;
  category: string;
  createdAt: string;
  updatedAt: string;
}

const typeIcons: Record<string, typeof Database> = {
  database: Database,
  file: FileSpreadsheet,
  api: Globe,
  stream: Server,
  storage: HardDrive,
};

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  active: { label: 'نشط', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  processing: { label: 'معالجة', color: 'bg-amber-100 text-amber-700', icon: Clock },
  error: { label: 'خطأ', color: 'bg-red-100 text-red-700', icon: XCircle },
  archived: { label: 'مؤرشف', color: 'bg-gray-100 text-gray-700', icon: Database },
};

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

function formatCount(n: number): string {
  if (!n) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

export default function DataSourcesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const queryClient = useQueryClient();

  const { data: response, isLoading, isError } = useQuery({
    queryKey: ['data-sources', searchQuery, filterStatus],
    queryFn: () => api.get<{ success: boolean; data: DataSourceItem[] }>(
      `/api/v1/data/sources?search=${encodeURIComponent(searchQuery)}&status=${filterStatus === 'all' ? '' : filterStatus}`
    ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/data/sources/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['data-sources'] }),
  });

  const sources: DataSourceItem[] = (response as { data?: DataSourceItem[] })?.data ?? [];

  const filtered = sources.filter((s) => {
    const matchesSearch = !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || s.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const activeCount = sources.filter(s => s.status === 'active').length;
  const processingCount = sources.filter(s => s.status === 'processing').length;
  const errorCount = sources.filter(s => s.status === 'error').length;

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/data" className="hover:text-blue-600">محرك البيانات</Link>
            <span>/</span>
            <span>مجموعات البيانات</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">مجموعات البيانات</h1>
          <p className="text-gray-500">Datasets Management</p>
        </div>
        <Link
          href="/data/import"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          استيراد بيانات جديدة
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-blue-600">{sources.length}</p>
          <p className="text-sm text-gray-500">إجمالي المجموعات</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">{activeCount}</p>
          <p className="text-sm text-gray-500">مجموعات نشطة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-amber-600">{processingCount}</p>
          <p className="text-sm text-gray-500">قيد المعالجة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-red-600">{errorCount}</p>
          <p className="text-sm text-gray-500">بها أخطاء</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="البحث في المجموعات..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 ps-10 pe-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">جميع الحالات</option>
          <option value="active">نشط</option>
          <option value="processing">معالجة</option>
          <option value="error">خطأ</option>
          <option value="archived">مؤرشف</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center gap-2 py-16 text-red-500">
            <AlertCircle className="h-5 w-5" />
            <span>فشل في تحميل البيانات</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-6 py-3 text-start font-medium text-gray-500">المجموعة</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">النوع</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">الحالة</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">السجلات</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">الحجم</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">الجودة</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((source) => {
                  const Icon = typeIcons[source.sourceType] || Database;
                  const status = statusConfig[source.status] || statusConfig.active;
                  const StatusIcon = status.icon;
                  const quality = source.qualityScore ?? 0;
                  return (
                    <tr key={source.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                            <Icon className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{source.name}</p>
                            <p className="text-xs text-gray-400">{source.category || source.format || source.sourceType}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{(source.format || source.sourceType || '').toUpperCase()}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-700">{formatCount(source.rowCount)}</td>
                      <td className="px-6 py-4 text-gray-500">{formatSize(source.sizeBytes)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 rounded-full bg-gray-200">
                            <div
                              className={`h-2 rounded-full ${quality >= 90 ? 'bg-green-500' : quality >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${quality}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{quality ? `${quality}%` : '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <Link href={`/data/reading?id=${source.id}`} className="rounded p-1 hover:bg-gray-100" title="عرض">
                            <Eye className="h-4 w-4 text-gray-400" />
                          </Link>
                          <button
                            onClick={() => deleteMutation.mutate(source.id)}
                            className="rounded p-1 hover:bg-red-50"
                            title="حذف"
                          >
                            <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && filtered.length === 0 && !isError && (
          <div className="py-12 text-center text-gray-400">
            لا توجد مجموعات بيانات. قم باستيراد بيانات للبدء.
          </div>
        )}
      </div>
    </div>
  );
}
