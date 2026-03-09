'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Network, Search, Loader2, Plus, BarChart3, Tag, Layers, Calculator,
  BookOpen, AlertCircle, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';

interface MetricDefinition {
  id: string;
  name: string;
  nameAr: string;
  formula: string;
  datasetId: string;
  datasetName: string;
  description: string;
  type: 'measure' | 'dimension' | 'calculated';
}

interface DimensionDefinition {
  id: string;
  name: string;
  nameAr: string;
  datasetId: string;
  column: string;
  hierarchy: string[];
}

type ActiveTab = 'metrics' | 'dimensions' | 'calculations' | 'model';

export default function SemanticPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('metrics');
  const [showAddMetric, setShowAddMetric] = useState(false);
  const [newMetric, setNewMetric] = useState({ name: '', nameAr: '', formula: '', datasetId: '', description: '' });

  const { data: datasetsRes, isLoading: loadingDatasets } = useQuery({
    queryKey: ['datasets-for-semantic'],
    queryFn: () => api.get<{ success: boolean; data: { id: string; name: string }[] }>('/api/v1/data/sources'),
  });

  const { data: kpisRes, isLoading: loadingKpis, refetch: refetchKpis } = useQuery({
    queryKey: ['kpi-registry'],
    queryFn: () => api.get<{ success: boolean; data: MetricDefinition[] }>('/api/v1/data/kpi-registry'),
  });

  const discoverMutation = useMutation({
    mutationFn: (datasetId: string) =>
      api.post<{ success: boolean; data: { metrics: MetricDefinition[]; dimensions: DimensionDefinition[] } }>(
        '/api/v1/data/semantic-discovery/discover',
        { datasetId }
      ),
  });

  const datasets = (datasetsRes as { data?: { id: string; name: string }[] })?.data ?? [];
  const kpis = (kpisRes as { data?: MetricDefinition[] })?.data ?? [];

  const tabItems: { key: ActiveTab; label: string; labelEn: string; icon: typeof BarChart3 }[] = [
    { key: 'metrics', label: 'المقاييس', labelEn: 'Metrics', icon: BarChart3 },
    { key: 'dimensions', label: 'الأبعاد', labelEn: 'Dimensions', icon: Layers },
    { key: 'calculations', label: 'الحسابات', labelEn: 'Calculations', icon: Calculator },
    { key: 'model', label: 'النموذج الدلالي', labelEn: 'Semantic Model', icon: Network },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
          <Link href="/data" className="hover:text-blue-600">محرك البيانات</Link>
          <span>/</span>
          <span>الطبقة الدلالية</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">الطبقة الدلالية للبيانات</h1>
            <p className="text-gray-500">Semantic Data Layer</p>
          </div>
          <button
            onClick={() => setShowAddMetric(!showAddMetric)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            إضافة مقياس
          </button>
        </div>
      </div>

      {/* Inner Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {tabItems.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Add Metric Form */}
      {showAddMetric && (
        <div className="rounded-xl bg-white p-5 shadow-sm border border-blue-200">
          <h3 className="font-semibold text-gray-900 mb-4">إضافة مقياس جديد</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم بالعربية</label>
              <input
                type="text"
                value={newMetric.nameAr}
                onChange={(e) => setNewMetric({ ...newMetric, nameAr: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="مثال: إجمالي المبيعات"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم بالإنجليزية</label>
              <input
                type="text"
                value={newMetric.name}
                onChange={(e) => setNewMetric({ ...newMetric, name: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. Total Sales"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">مجموعة البيانات</label>
              <select
                value={newMetric.datasetId}
                onChange={(e) => setNewMetric({ ...newMetric, datasetId: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">اختر مجموعة...</option>
                {datasets.map((ds: { id: string; name: string }) => (
                  <option key={ds.id} value={ds.id}>{ds.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">المعادلة</label>
              <input
                type="text"
                value={newMetric.formula}
                onChange={(e) => setNewMetric({ ...newMetric, formula: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                dir="ltr"
                placeholder="SUM(amount)"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
              <textarea
                value={newMetric.description}
                onChange={(e) => setNewMetric({ ...newMetric, description: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                rows={2}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button
              onClick={() => setShowAddMetric(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              إلغاء
            </button>
            <button
              onClick={async () => {
                try {
                  await api.post('/api/v1/data/kpi-registry', newMetric);
                  setShowAddMetric(false);
                  setNewMetric({ name: '', nameAr: '', formula: '', datasetId: '', description: '' });
                  refetchKpis();
                } catch {
                  // handled by API layer
                }
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              حفظ المقياس
            </button>
          </div>
        </div>
      )}

      {/* Content based on active tab */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100 min-h-[400px]">
        {activeTab === 'metrics' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">سجل المقاييس - Metric Registry</h3>
              <div className="flex items-center gap-2">
                <select
                  onChange={(e) => {
                    if (e.target.value) discoverMutation.mutate(e.target.value);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                >
                  <option value="">اكتشاف تلقائي من...</option>
                  {datasets.map((ds: { id: string; name: string }) => (
                    <option key={ds.id} value={ds.id}>{ds.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {loadingKpis ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              </div>
            ) : kpis.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <BarChart3 className="h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">لا توجد مقاييس مسجلة</p>
                <p className="text-sm">أضف مقياسا جديدا أو استخدم الاكتشاف التلقائي</p>
              </div>
            ) : (
              <div className="space-y-3">
                {kpis.map((kpi: MetricDefinition) => (
                  <div key={kpi.id} className="rounded-lg border border-gray-200 p-4 hover:border-blue-200 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{kpi.nameAr || kpi.name}</p>
                        <p className="text-xs text-gray-400">{kpi.name}</p>
                      </div>
                      <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600" dir="ltr">
                        {kpi.formula}
                      </span>
                    </div>
                    {kpi.description && (
                      <p className="mt-2 text-sm text-gray-500">{kpi.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'dimensions' && (
          <div className="p-5">
            <h3 className="font-semibold text-gray-900 mb-4">سجل الأبعاد - Dimension Registry</h3>
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Layers className="h-16 w-16 mb-4 opacity-30" />
              <p className="text-lg font-medium">الأبعاد تُستخرج تلقائيا</p>
              <p className="text-sm">اختر مجموعة بيانات واستخدم الاكتشاف التلقائي</p>
              <select
                onChange={(e) => {
                  if (e.target.value) discoverMutation.mutate(e.target.value);
                }}
                className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm"
              >
                <option value="">اكتشاف الأبعاد من...</option>
                {datasets.map((ds: { id: string; name: string }) => (
                  <option key={ds.id} value={ds.id}>{ds.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {activeTab === 'calculations' && (
          <div className="p-5">
            <h3 className="font-semibold text-gray-900 mb-4">محرك الحسابات - Calculation Engine</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { name: 'SUM', nameAr: 'مجموع', desc: 'حساب المجموع لعمود رقمي' },
                { name: 'AVG', nameAr: 'متوسط', desc: 'حساب المتوسط الحسابي' },
                { name: 'COUNT', nameAr: 'عدد', desc: 'حساب عدد السجلات' },
                { name: 'MIN', nameAr: 'أقل', desc: 'إيجاد القيمة الأصغر' },
                { name: 'MAX', nameAr: 'أكبر', desc: 'إيجاد القيمة الأكبر' },
                { name: 'MEDIAN', nameAr: 'وسيط', desc: 'حساب القيمة الوسيطة' },
                { name: 'STDEV', nameAr: 'انحراف معياري', desc: 'حساب الانحراف المعياري' },
                { name: 'PERCENTILE', nameAr: 'مئوي', desc: 'حساب النسبة المئوية' },
                { name: 'GROWTH', nameAr: 'نمو', desc: 'حساب معدل النمو الزمني' },
              ].map((fn) => (
                <div key={fn.name} className="rounded-lg border border-gray-200 p-4 hover:border-blue-200 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Calculator className="h-4 w-4 text-blue-500" />
                    <span className="font-mono text-sm font-medium text-gray-900">{fn.name}</span>
                    <span className="text-xs text-gray-400">{fn.nameAr}</span>
                  </div>
                  <p className="text-xs text-gray-500">{fn.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'model' && (
          <div className="p-5">
            <h3 className="font-semibold text-gray-900 mb-4">النموذج الدلالي للأعمال - Business Semantic Model</h3>
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Network className="h-16 w-16 mb-4 opacity-30" />
              <p className="text-lg font-medium">النموذج الدلالي يُبنى تلقائيا</p>
              <p className="text-sm">من المقاييس والأبعاد المسجلة</p>
              <p className="mt-2 text-xs">Metric Registry + Dimension Registry + Calculation Engine</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
