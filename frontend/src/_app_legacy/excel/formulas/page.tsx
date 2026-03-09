'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Calculator, Play, Copy, Save, BookOpen, Search, ChevronDown,
  Plus, Trash2, CheckCircle, AlertCircle, Code, Sparkles, History,
  Loader2,
} from 'lucide-react';

interface FormulaFunction {
  name: string;
  category: string;
  description: string;
  minArgs: number;
  maxArgs: number;
}

interface WorkbookFormula {
  id: string;
  name: string;
  formulasJson: Record<string, unknown>;
  createdAt: string;
}

export default function FormulasPage() {
  const [formula, setFormula] = useState('=SUM(A1:A10)');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [evalResult, setEvalResult] = useState<string | null>(null);

  const { data: functionsRes, isLoading: loadingFunctions } = useQuery({
    queryKey: ['excel-v2-functions'],
    queryFn: () => api.get<{ success: boolean; data: { functions: FormulaFunction[] } }>('/api/v1/excel/formulas/v2/functions'),
  });

  const { data: workbooksRes, isLoading: loadingWorkbooks } = useQuery({
    queryKey: ['excel-formula-workbooks'],
    queryFn: () => api.get<{ success: boolean; data: WorkbookFormula[] }>('/api/v1/excel/formulas'),
  });

  const evalMutation = useMutation({
    mutationFn: (expr: string) => api.post<{ success: boolean; data: unknown }>('/api/v1/excel/formulas/parse', { formula: expr }),
    onSuccess: (res) => {
      const data = (res as { data?: unknown })?.data;
      setEvalResult(JSON.stringify(data, null, 2));
    },
    onError: (err) => setEvalResult(`Error: ${err.message}`),
  });

  const functions: FormulaFunction[] = (functionsRes as { data?: { functions?: FormulaFunction[] } })?.data?.functions ?? [];
  const workbooks: WorkbookFormula[] = (workbooksRes as { data?: WorkbookFormula[] })?.data ?? [];

  const categories = [...new Set(functions.map(f => f.category))];
  const activeCategory = selectedCategory || categories[0] || '';
  const filteredFunctions = functions.filter(f =>
    f.category === activeCategory &&
    (!searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const categoryLabels: Record<string, string> = {
    'math-trig': 'الرياضيات',
    'statistical': 'الإحصائية',
    'text': 'النصوص',
    'lookup-reference': 'البحث',
    'logical': 'المنطقية',
    'date-time': 'التاريخ',
    'financial': 'المالية',
    'information': 'المعلومات',
    'engineering': 'الهندسية',
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/excel" className="hover:text-green-600">محرك إكسل</Link>
            <span>/</span>
            <span>محرر الصيغ</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">محرر الصيغ</h1>
          <p className="text-gray-500">Formula Editor with Syntax Highlighting</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <History className="h-4 w-4" /> السجل
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
            <Sparkles className="h-4 w-4" /> إنشاء بالذكاء الاصطناعي
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">{functions.length}</p>
          <p className="text-sm text-gray-500">دالة متاحة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-blue-600">{categories.length}</p>
          <p className="text-sm text-gray-500">فئات</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-violet-600">{workbooks.length}</p>
          <p className="text-sm text-gray-500">مصنفات بالصيغ</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-amber-600">∞</p>
          <p className="text-sm text-gray-500">دقة الحساب</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Editor Area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Formula Editor */}
          <div className="rounded-xl bg-white shadow-sm border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="font-semibold text-gray-900">محرر الصيغ - Formula Editor</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => evalMutation.mutate(formula)} className="rounded p-1.5 hover:bg-gray-100" title="تشغيل">
                  {evalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin text-green-600" /> : <Play className="h-4 w-4 text-green-600" />}
                </button>
                <button onClick={() => navigator.clipboard?.writeText(formula)} className="rounded p-1.5 hover:bg-gray-100" title="نسخ"><Copy className="h-4 w-4 text-gray-400" /></button>
              </div>
            </div>
            <div className="p-4">
              <div className="rounded-lg bg-gray-900 p-4 font-mono">
                <textarea
                  value={formula}
                  onChange={(e) => setFormula(e.target.value)}
                  className="w-full bg-transparent text-green-400 text-lg focus:outline-none resize-none"
                  rows={3}
                  dir="ltr"
                />
              </div>
              {evalResult && (
                <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
                  <p className="text-xs text-gray-400 mb-1">النتيجة:</p>
                  <pre className="font-mono text-gray-800 whitespace-pre-wrap" dir="ltr">{evalResult}</pre>
                </div>
              )}
            </div>
          </div>

          {/* Workbooks with formulas */}
          <div className="rounded-xl bg-white shadow-sm border border-gray-100">
            <div className="border-b border-gray-100 px-6 py-3">
              <h3 className="font-semibold text-gray-900">المصنفات التي تحتوي صيغ - Workbooks with Formulas</h3>
            </div>
            {loadingWorkbooks ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-green-400" /></div>
            ) : workbooks.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">لا توجد مصنفات بعد</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {workbooks.map((wb) => (
                  <div key={wb.id} className="px-6 py-3 hover:bg-gray-50/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900">{wb.name}</span>
                      <span className="text-xs text-gray-400">{new Date(wb.createdAt).toLocaleDateString('ar-SA')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Function Library */}
        <div className="space-y-4">
          <div className="rounded-xl bg-white shadow-sm border border-gray-100">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="font-semibold text-gray-900 mb-2">مكتبة الدوال - Function Library</h3>
              <div className="relative">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="بحث عن دالة..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 ps-10 pe-4 text-sm focus:border-green-500 focus:outline-none" />
              </div>
            </div>
            <div className="p-3">
              {loadingFunctions ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-green-400" /></div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {categories.map((cat) => (
                      <button key={cat} onClick={() => setSelectedCategory(cat)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          activeCategory === cat ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>
                        {categoryLabels[cat] || cat}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {filteredFunctions.map((func) => (
                      <button key={func.name} onClick={() => setFormula(`=${func.name}(`)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-start hover:bg-green-50 transition-colors">
                        <div>
                          <span className="font-mono text-sm font-medium text-gray-900">{func.name}</span>
                          <p className="text-xs text-gray-400 truncate max-w-[180px]">{func.description}</p>
                        </div>
                        <Code className="h-3 w-3 text-gray-300 shrink-0" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
