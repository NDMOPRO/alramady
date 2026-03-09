'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  FileSpreadsheet, Calculator, Paintbrush, GitCompare, ToggleLeft,
  ArrowUpRight, TrendingUp, CheckCircle, Clock, FileText,
  Upload, Download, Plus, Sparkles, Loader2, AlertCircle,
} from 'lucide-react';

interface WorkbookItem {
  id: string;
  name: string;
  sheetsJson: unknown;
  formulasJson: unknown;
  createdAt: string;
}

const modules = [
  { title: 'Formula Editor', titleAr: 'محرر الصيغ', href: '/excel/formulas', icon: Calculator, color: 'bg-green-500', desc: 'إنشاء وتحرير الصيغ مع تمييز بناء الجملة' },
  { title: 'Professional Formatting', titleAr: 'التنسيق الاحترافي', href: '/excel/formatting', icon: Paintbrush, color: 'bg-blue-500', desc: 'تنسيقات جاهزة للملفات والتقارير' },
  { title: 'File Matching', titleAr: 'مطابقة الملفات', href: '/excel/matching', icon: GitCompare, color: 'bg-violet-500', desc: 'مطابقة وربط البيانات بين الملفات' },
  { title: 'Easy/Advanced Modes', titleAr: 'الأوضاع', href: '/excel/modes', icon: ToggleLeft, color: 'bg-amber-500', desc: 'التبديل بين الوضع السهل والمتقدم' },
];

export default function ExcelEnginePage() {
  const { data: spreadsheetRes, isLoading: loadingSpreadsheets } = useQuery({
    queryKey: ['excel-spreadsheets'],
    queryFn: () => api.get<{ success: boolean; data: WorkbookItem[]; pagination?: { total: number } }>('/api/v1/excel/spreadsheet'),
  });

  const { data: formulasRes, isLoading: loadingFormulas } = useQuery({
    queryKey: ['excel-formulas-list'],
    queryFn: () => api.get<{ success: boolean; data: WorkbookItem[]; total: number }>('/api/v1/excel/formulas'),
  });

  const { data: matchingRes } = useQuery({
    queryKey: ['excel-matching-list'],
    queryFn: () => api.get<{ success: boolean; data: unknown[]; total: number }>('/api/v1/excel/matching'),
  });

  const workbooks: WorkbookItem[] = (spreadsheetRes as { data?: WorkbookItem[] })?.data ?? [];
  const formulaCount = (formulasRes as { total?: number })?.total ?? 0;
  const matchCount = (matchingRes as { total?: number })?.total ?? 0;
  const loading = loadingSpreadsheets || loadingFormulas;

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-green-50">
            <FileSpreadsheet className="h-7 w-7 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">محرك إكسل</h1>
            <p className="text-lg font-medium text-green-600">Excel Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <Upload className="h-4 w-4" /> رفع ملف
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
            <Plus className="h-4 w-4" /> ملف جديد
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <FileSpreadsheet className="h-5 w-5 text-green-500" />
          <p className="mt-3 text-3xl font-bold text-gray-900">{workbooks.length}</p>
          <p className="text-sm text-gray-500">ملفات إكسل</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <Calculator className="h-5 w-5 text-blue-500" />
          <p className="mt-3 text-3xl font-bold text-gray-900">{formulaCount}</p>
          <p className="text-sm text-gray-500">مصنفات بالصيغ</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <GitCompare className="h-5 w-5 text-violet-500" />
          <p className="mt-3 text-3xl font-bold text-gray-900">{matchCount}</p>
          <p className="text-sm text-gray-500">عمليات مطابقة</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <p className="mt-3 text-3xl font-bold text-green-600">99.9%</p>
          <p className="text-sm text-gray-500">دقة الحسابات</p>
        </div>
      </div>

      {/* Module Cards */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">الوحدات - Modules</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.href} href={mod.href} className="group rounded-xl bg-white p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-green-200 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${mod.color} text-white`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-green-500 transition-colors" />
                </div>
                <h3 className="font-semibold text-gray-900">{mod.titleAr}</h3>
                <p className="text-sm text-gray-400">{mod.title}</p>
                <p className="mt-2 text-xs text-gray-500">{mod.desc}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Files */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">المصنفات الأخيرة - Recent Workbooks</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-green-400" />
          </div>
        ) : workbooks.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p>لا توجد مصنفات بعد. قم برفع ملف إكسل للبدء.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-6 py-3 text-start font-medium text-gray-500">المصنف</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">الأوراق</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">تاريخ الإنشاء</th>
                  <th className="px-6 py-3 text-start font-medium text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {workbooks.map((wb) => {
                  const sheets = Array.isArray(wb.sheetsJson) ? wb.sheetsJson : [];
                  return (
                    <tr key={wb.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <FileSpreadsheet className="h-5 w-5 text-green-500" />
                          <span className="font-medium text-gray-900">{wb.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{sheets.length} ورقة</td>
                      <td className="px-6 py-4 text-gray-500">{new Date(wb.createdAt).toLocaleDateString('ar-SA')}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button className="rounded p-1 hover:bg-gray-100"><Download className="h-4 w-4 text-gray-400" /></button>
                          <button className="rounded p-1 hover:bg-gray-100"><Sparkles className="h-4 w-4 text-gray-400" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
