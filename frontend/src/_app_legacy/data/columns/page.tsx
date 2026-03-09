'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Columns, Search, Plus, Download, Edit, Trash2, Eye, Settings,
  ArrowUpDown, Lock, Unlock, Hash, Type, Calendar, ToggleLeft,
  ChevronDown, Save, Filter, Loader2, AlertCircle,
} from 'lucide-react';

type Column = {
  id: number;
  name: string;
  nameAr: string;
  table: string;
  type: string;
  nullable: boolean;
  unique: boolean;
  indexed: boolean;
  description: string;
};

interface ColumnsResponse {
  columns: Column[];
  tables: string[];
  stats: {
    totalColumns: number;
    totalTables: number;
    indexedColumns: number;
    uniqueColumns: number;
  };
}

const typeIconMap: Record<string, any> = {
  Integer: Hash,
  Decimal: Hash,
  String: Type,
  Date: Calendar,
  Boolean: ToggleLeft,
};

export default function ColumnsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTable, setSelectedTable] = useState('employees');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [tableOptions, setTableOptions] = useState<string[]>([]);
  const [stats, setStats] = useState<ColumnsResponse['stats'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get<ColumnsResponse>(`/api/data/columns/${selectedTable}`)
      .then(res => {
        setColumns(res.columns);
        setTableOptions(res.tables);
        setStats(res.stats);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedTable]);

  const filtered = columns.filter(c =>
    c.name.includes(searchQuery.toLowerCase()) || c.nameAr.includes(searchQuery)
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/data" className="hover:text-blue-600">محرك البيانات</Link>
            <span>/</span>
            <span>التحكم بالأعمدة</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">مركز التحكم بالأعمدة</h1>
          <p className="text-gray-500">Column Control Center</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <Download className="h-4 w-4" /> تصدير المخطط
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700">
            <Plus className="h-4 w-4" /> عمود جديد
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
          <p className="text-3xl font-bold text-cyan-600">{stats?.totalColumns ?? 0}</p>
          <p className="text-sm text-gray-500">إجمالي الأعمدة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-blue-600">{stats?.totalTables ?? 0}</p>
          <p className="text-sm text-gray-500">جداول</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">{stats?.indexedColumns ?? 0}</p>
          <p className="text-sm text-gray-500">أعمدة مفهرسة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-violet-600">{stats?.uniqueColumns ?? 0}</p>
          <p className="text-sm text-gray-500">أعمدة فريدة</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium">
          {tableOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="البحث في الأعمدة..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 ps-10 pe-4 text-sm focus:border-cyan-500 focus:outline-none" />
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
          <Filter className="h-4 w-4" /> تصفية متقدمة
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-cyan-500 animate-spin" />
        </div>
      )}

      {/* Columns Table */}
      {!loading && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-start font-medium text-gray-500">العمود</th>
                  <th className="px-4 py-3 text-start font-medium text-gray-500">النوع</th>
                  <th className="px-4 py-3 text-start font-medium text-gray-500">Nullable</th>
                  <th className="px-4 py-3 text-start font-medium text-gray-500">فريد</th>
                  <th className="px-4 py-3 text-start font-medium text-gray-500">مفهرس</th>
                  <th className="px-4 py-3 text-start font-medium text-gray-500">الوصف</th>
                  <th className="px-4 py-3 text-start font-medium text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((col) => {
                  const TypeIcon = typeIconMap[col.type] || Hash;
                  return (
                    <tr key={col.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <TypeIcon className="h-4 w-4 text-cyan-500" />
                          <div>
                            <p className="font-mono font-medium text-gray-900">{col.name}</p>
                            <p className="text-xs text-gray-400">{col.nameAr}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{col.type}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {col.nullable ? <Unlock className="h-4 w-4 text-amber-500 mx-auto" /> : <Lock className="h-4 w-4 text-gray-300 mx-auto" />}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {col.unique ? <span className="text-green-500 font-bold text-xs">U</span> : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {col.indexed ? <span className="text-blue-500 font-bold text-xs">IDX</span> : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{col.description}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button className="rounded p-1 hover:bg-gray-100"><Edit className="h-4 w-4 text-gray-400" /></button>
                          <button className="rounded p-1 hover:bg-gray-100"><Settings className="h-4 w-4 text-gray-400" /></button>
                          <button className="rounded p-1 hover:bg-red-50"><Trash2 className="h-4 w-4 text-gray-400" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
