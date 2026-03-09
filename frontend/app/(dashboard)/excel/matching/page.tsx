'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  GitCompare, FileSpreadsheet, ArrowLeft, ArrowRight, CheckCircle,
  XCircle, AlertTriangle, Upload, Search, Download, Play, Settings,
  Columns, Link2, Unlink, Eye, Plus, Loader2,
} from 'lucide-react';

interface MatchRecord {
  id: string;
  name: string;
  createdAt: string;
}

export default function MatchingPage() {
  const [dragActive, setDragActive] = useState<'source' | 'target' | null>(null);
  const sourceRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: matchRes, isLoading } = useQuery({
    queryKey: ['excel-matching-records'],
    queryFn: () => api.get<{ success: boolean; data: MatchRecord[]; total: number }>('/api/v1/excel/matching'),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<{ success: boolean }>('/api/v1/excel/spreadsheet/upload', formData);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['excel-matching-records'] }),
  });

  const records: MatchRecord[] = (matchRes as { data?: MatchRecord[] })?.data ?? [];
  const total = (matchRes as { total?: number })?.total ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/excel" className="hover:text-green-600">محرك إكسل</Link>
            <span>/</span>
            <span>مطابقة الملفات</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">معالج مطابقة الملفات</h1>
          <p className="text-gray-500">File Matching Wizard</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-violet-600">{total}</p>
          <p className="text-sm text-gray-500">عمليات مطابقة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">99.9%</p>
          <p className="text-sm text-gray-500">دقة بكسل</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-blue-600">36</p>
          <p className="text-sm text-gray-500">بند مطابقة حرفية</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <GitCompare className="h-5 w-5 text-amber-500 mb-1" />
          <p className="text-sm text-gray-500">هيكلية + بصرية</p>
        </div>
      </div>

      {/* Upload Area */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <input ref={sourceRef} type="file" className="hidden" accept=".xlsx,.xls"
            onChange={(e) => { if (e.target.files?.[0]) uploadMutation.mutate(e.target.files[0]); }} />
          <h3 className="mb-3 font-semibold text-gray-900">الملف المصدر - Source File</h3>
          <div
            onClick={() => sourceRef.current?.click()}
            className="flex flex-col items-center rounded-xl border-2 border-dashed p-8 cursor-pointer border-gray-300 hover:border-violet-400 transition-colors"
          >
            <Upload className="mb-2 h-10 w-10 text-gray-300" />
            <p className="text-gray-500">اختر الملف المصدر</p>
            <p className="text-xs text-gray-400 mt-1">Source Excel File (.xlsx)</p>
          </div>
        </div>
        <div>
          <input ref={targetRef} type="file" className="hidden" accept=".xlsx,.xls"
            onChange={(e) => { if (e.target.files?.[0]) uploadMutation.mutate(e.target.files[0]); }} />
          <h3 className="mb-3 font-semibold text-gray-900">الملف الهدف - Target File</h3>
          <div
            onClick={() => targetRef.current?.click()}
            className="flex flex-col items-center rounded-xl border-2 border-dashed p-8 cursor-pointer border-gray-300 hover:border-violet-400 transition-colors"
          >
            <Upload className="mb-2 h-10 w-10 text-gray-300" />
            <p className="text-gray-500">اختر الملف الهدف</p>
            <p className="text-xs text-gray-400 mt-1">Target Excel File (.xlsx)</p>
          </div>
        </div>
      </div>

      {uploadMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-violet-600">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري رفع الملف...
        </div>
      )}

      {/* Matching Features */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4">قدرات المطابقة الحرفية - Literal Matching Capabilities</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[
            'عرض الأعمدة بالبكسل الدقيق',
            'سلامة المعادلات وترتيب الحساب',
            'النطاقات المسماة',
            'قواعد التنسيق الشرطي',
            'حشو الخلايا وسماكة الحدود',
            'إحداثيات تجميد الأجزاء',
            'إزاحات مرتكزات الرسوم البيانية',
            'الأعمدة المخفية وحالات الفلاتر',
            'تطابق في الإحداثيات الدقيقة',
            'تطابق أحجام العناصر ونسبها',
            'تطابق طبقات العناصر وترتيبها',
            'تطابق المحاذاة بالبكسل',
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
              <span className="text-gray-700">{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Match Records */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">سجل عمليات المطابقة - Match History</h2>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>
        ) : records.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <GitCompare className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p>لا توجد عمليات مطابقة بعد</p>
            <p className="text-sm">ارفع ملفين لمقارنتهما</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {records.map((rec) => (
              <div key={rec.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50/50">
                <span className="font-medium text-gray-900">{rec.name}</span>
                <span className="text-xs text-gray-400">{new Date(rec.createdAt).toLocaleDateString('ar-SA')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
