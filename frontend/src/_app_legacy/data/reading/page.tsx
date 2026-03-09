'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  BookOpen, Search, Filter, Download, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Maximize2, List, Grid3X3, Table, Eye,
  FileSpreadsheet, ArrowUpDown, Settings, Loader2, AlertCircle,
} from 'lucide-react';

interface DataRow {
  id: number;
  [key: string]: any;
}

interface DatasetResponse {
  data: DataRow[];
  total: number;
  columns: string[];
  page: number;
  pageSize: number;
}

export default function DataReadingPage() {
  const [viewMode, setViewMode] = useState<'table' | 'card' | 'raw'>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [fontSize, setFontSize] = useState(14);
  const [selectedTable, setSelectedTable] = useState('employees');
  const [data, setData] = useState<DataRow[]>([]);
  const [total, setTotal] = useState(0);
  const [columnNames, setColumnNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get<DatasetResponse>(`/api/data/datasets?table=${selectedTable}&page=${currentPage}&search=${encodeURIComponent(searchQuery)}`)
      .then(res => {
        setData(res.data);
        setTotal(res.total);
        setColumnNames(res.columns);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedTable, currentPage, searchQuery]);

  const filtered = data;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/data" className="hover:text-blue-600">محرك البيانات</Link>
            <span>/</span>
            <span>قراءة البيانات</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">قراءة البيانات التفاعلية</h1>
          <p className="text-gray-500">Interactive Data Reading View</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <Download className="h-4 w-4" /> تصدير
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <Maximize2 className="h-4 w-4" /> ملء الشاشة
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-amber-600">{filtered.length}</p>
          <p className="text-sm text-gray-500">سجلات معروضة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-blue-600">{columnNames.length}</p>
          <p className="text-sm text-gray-500">أعمدة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">{currentPage}</p>
          <p className="text-sm text-gray-500">الصفحة الحالية</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-violet-600">{selectedTable}</p>
          <p className="text-sm text-gray-500">الجدول المحدد</p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-sm border border-gray-100">
        <select value={selectedTable} onChange={(e) => { setSelectedTable(e.target.value); setCurrentPage(1); }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
          <option value="employees">employees</option>
          <option value="departments">departments</option>
          <option value="sales_2024">sales_2024</option>
        </select>
        <div className="h-6 w-px bg-gray-200" />
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="البحث في البيانات..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 ps-10 pe-4 text-sm focus:border-amber-500 focus:outline-none" />
        </div>
        <div className="h-6 w-px bg-gray-200" />
        <div className="flex items-center gap-1">
          <button onClick={() => setViewMode('table')} className={`rounded p-2 ${viewMode === 'table' ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:bg-gray-100'}`}>
            <Table className="h-4 w-4" />
          </button>
          <button onClick={() => setViewMode('card')} className={`rounded p-2 ${viewMode === 'card' ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:bg-gray-100'}`}>
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button onClick={() => setViewMode('raw')} className={`rounded p-2 ${viewMode === 'raw' ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:bg-gray-100'}`}>
            <List className="h-4 w-4" />
          </button>
        </div>
        <div className="h-6 w-px bg-gray-200" />
        <div className="flex items-center gap-1">
          <button onClick={() => setFontSize(Math.max(10, fontSize - 1))} className="rounded p-1 hover:bg-gray-100"><ZoomOut className="h-4 w-4 text-gray-400" /></button>
          <span className="text-xs text-gray-500 w-8 text-center">{fontSize}</span>
          <button onClick={() => setFontSize(Math.min(20, fontSize + 1))} className="rounded p-1 hover:bg-gray-100"><ZoomIn className="h-4 w-4 text-gray-400" /></button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
        </div>
      )}

      {/* Table View */}
      {!loading && viewMode === 'table' && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: `${fontSize}px` }}>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {columnNames.map((col) => (
                    <th key={col} className="px-4 py-3 text-start font-medium text-gray-500">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-amber-50/30">
                    {columnNames.map((col) => (
                      <td key={col} className="px-4 py-2.5 text-gray-600">{String(row[col] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Card View */}
      {!loading && viewMode === 'card' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((row) => (
            <div key={row.id} className="rounded-xl bg-white p-4 shadow-sm border border-gray-100 hover:border-amber-200">
              <div className="space-y-1 text-sm">
                {columnNames.map((col) => (
                  <div key={col} className="flex justify-between">
                    <span className="text-gray-400">{col}:</span>
                    <span className="text-gray-700">{String(row[col] ?? '')}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Raw View */}
      {!loading && viewMode === 'raw' && (
        <div className="rounded-xl bg-gray-900 p-4 shadow-sm overflow-auto">
          <pre className="text-green-400" style={{ fontSize: `${fontSize}px` }}>
            {JSON.stringify(filtered, null, 2)}
          </pre>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">عرض {filtered.length} من {total} سجل</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
          <span className="rounded-lg bg-amber-600 px-3 py-1 text-sm font-medium text-white">{currentPage}</span>
          <button onClick={() => setCurrentPage(currentPage + 1)} className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
