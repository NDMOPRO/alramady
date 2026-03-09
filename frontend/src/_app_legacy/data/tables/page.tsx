'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import {
  Table, Plus, Search, Download, Upload, Edit, Trash2, Eye, MoreVertical,
  ChevronDown, ChevronUp, Settings, Copy, Filter,
} from 'lucide-react';

const tables = [
  { id: 1, name: 'employees', nameAr: 'الموظفين', rows: 1250, columns: 12, size: '2.4 MB', lastModified: '2024-01-15', status: 'active' },
  { id: 2, name: 'departments', nameAr: 'الأقسام', rows: 25, columns: 8, size: '45 KB', lastModified: '2024-01-10', status: 'active' },
  { id: 3, name: 'sales_2024', nameAr: 'مبيعات 2024', rows: 45000, columns: 18, size: '12.8 MB', lastModified: '2024-01-14', status: 'active' },
  { id: 4, name: 'inventory', nameAr: 'المخزون', rows: 8900, columns: 15, size: '5.2 MB', lastModified: '2024-01-12', status: 'active' },
  { id: 5, name: 'customers', nameAr: 'العملاء', rows: 3200, columns: 22, size: '8.1 MB', lastModified: '2024-01-08', status: 'archived' },
  { id: 6, name: 'transactions', nameAr: 'المعاملات', rows: 120000, columns: 10, size: '34.5 MB', lastModified: '2024-01-15', status: 'active' },
];

export default function TablesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [tableData, setTableData] = useState<any[]>([]);

  useEffect(() => {
    api.get('/api/data/tables').then((res: any) => setTableData(res.data || [])).catch(() => {});
  }, []);

  const filtered = tables.filter(t =>
    t.name.includes(searchQuery.toLowerCase()) || t.nameAr.includes(searchQuery)
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/data" className="hover:text-blue-600">محرك البيانات</Link>
            <span>/</span>
            <span>إدارة الجداول</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة الجداول</h1>
          <p className="text-gray-500">Table Management</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/data/import" className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <Upload className="h-4 w-4" /> استيراد
          </Link>
          <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> جدول جديد
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-violet-600">{tables.length}</p>
          <p className="text-sm text-gray-500">إجمالي الجداول</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-blue-600">{tables.reduce((a, t) => a + t.rows, 0).toLocaleString()}</p>
          <p className="text-sm text-gray-500">إجمالي السجلات</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">{tables.filter(t => t.status === 'active').length}</p>
          <p className="text-sm text-gray-500">جداول نشطة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-gray-600">63 MB</p>
          <p className="text-sm text-gray-500">الحجم الإجمالي</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="البحث في الجداول..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 ps-10 pe-4 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
          <Filter className="h-4 w-4" /> تصفية
        </button>
      </div>

      {/* Tables List */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-6 py-3 text-start font-medium text-gray-500">الجدول</th>
              <th className="px-6 py-3 text-start font-medium text-gray-500">السجلات</th>
              <th className="px-6 py-3 text-start font-medium text-gray-500">الأعمدة</th>
              <th className="px-6 py-3 text-start font-medium text-gray-500">الحجم</th>
              <th className="px-6 py-3 text-start font-medium text-gray-500">آخر تعديل</th>
              <th className="px-6 py-3 text-start font-medium text-gray-500">الحالة</th>
              <th className="px-6 py-3 text-start font-medium text-gray-500">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((table) => (
              <tr key={table.id} className={`hover:bg-gray-50/50 cursor-pointer transition-colors ${selectedTable === table.id ? 'bg-blue-50/50' : ''}`}
                onClick={() => setSelectedTable(selectedTable === table.id ? null : table.id)}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Table className="h-4 w-4 text-violet-500" />
                    <div>
                      <p className="font-medium text-gray-900">{table.nameAr}</p>
                      <p className="text-xs text-gray-400 font-mono">{table.name}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 font-medium text-gray-700">{table.rows.toLocaleString()}</td>
                <td className="px-6 py-4 text-gray-600">{table.columns}</td>
                <td className="px-6 py-4 text-gray-600">{table.size}</td>
                <td className="px-6 py-4 text-gray-500">{table.lastModified}</td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    table.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>{table.status === 'active' ? 'نشط' : 'مؤرشف'}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button className="rounded p-1 hover:bg-gray-100" title="عرض"><Eye className="h-4 w-4 text-gray-400" /></button>
                    <button className="rounded p-1 hover:bg-gray-100" title="تعديل"><Edit className="h-4 w-4 text-gray-400" /></button>
                    <button className="rounded p-1 hover:bg-gray-100" title="نسخ"><Copy className="h-4 w-4 text-gray-400" /></button>
                    <button className="rounded p-1 hover:bg-gray-100" title="تصدير"><Download className="h-4 w-4 text-gray-400" /></button>
                    <button className="rounded p-1 hover:bg-red-50" title="حذف"><Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inline Data Editor */}
      {selectedTable === 1 && (
        <div className="rounded-xl bg-white shadow-sm border border-blue-200">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-3">
            <h3 className="font-semibold text-gray-900">بيانات جدول الموظفين - Inline Editor</h3>
            <div className="flex items-center gap-2">
              <button className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-600 hover:bg-blue-100">+ إضافة صف</button>
              <button className="rounded bg-green-50 px-3 py-1 text-xs text-green-600 hover:bg-green-100">حفظ التغييرات</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-start font-medium text-gray-500">ID</th>
                  <th className="px-4 py-2 text-start font-medium text-gray-500">الاسم</th>
                  <th className="px-4 py-2 text-start font-medium text-gray-500">القسم</th>
                  <th className="px-4 py-2 text-start font-medium text-gray-500">الراتب</th>
                  <th className="px-4 py-2 text-start font-medium text-gray-500">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tableData.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50/30">
                    <td className="px-4 py-2 text-gray-400">{row.id}</td>
                    <td className="px-4 py-2">
                      <input
                        defaultValue={row.name}
                        className="w-full rounded border border-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        defaultValue={row.department}
                        className="w-full rounded border border-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        defaultValue={row.salary.toString()}
                        className="w-full rounded border border-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${row.status === 'نشط' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
