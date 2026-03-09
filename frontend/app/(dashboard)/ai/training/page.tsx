'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  Cpu,
  Settings2,
  BarChart3,
  Archive,
  Rocket,
  Activity,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingDown,
  Play,
  Star,
  ArrowUpCircle,
  ArchiveRestore,
  Split,
  Wand2,
  Download,
  GitBranch,
  Shield,
  Gauge,
  AlertTriangle,
  RotateCcw,
  Eye,
} from 'lucide-react';
import {
  fetchDatasets,
  createDataset,
  deleteDataset,
  fetchDatasetStatistics,
  splitDataset,
  augmentDataset,
  fetchModelConfigurations,
  createModelConfiguration,
  validateModelConfiguration,
  startTraining,
  fetchBaseModels,
  fetchRegisteredModels,
  registerModel,
  promoteModel,
  archiveModel,
  fetchModelHistory,
  compareRegisteredModels,
  deployModel,
  fetchDeployments,
  rollbackDeployment,
  fetchTrainingMetrics,
  fetchTrainingAnomalies,
  fetchTrainingAlerts,
  acknowledgeAlert,
  runEvaluation,
  fetchEvaluations,
  type TrainingDataset,
  type DatasetStatistics,
  type ModelConfiguration,
  type RegisteredModel,
  type Deployment,
  type TrainingMetrics,
  type TrainingAlert,
  type EvaluationResult,
} from '@/lib/api/training';

type TabKey = 'datasets' | 'builder' | 'training' | 'evaluation' | 'registry' | 'deploy' | 'monitor';

const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'datasets', label: 'مجموعات البيانات', icon: <Database className="h-4 w-4" /> },
  { key: 'builder', label: 'بناء النماذج', icon: <Cpu className="h-4 w-4" /> },
  { key: 'training', label: 'التدريب والضبط', icon: <Settings2 className="h-4 w-4" /> },
  { key: 'evaluation', label: 'التقييم', icon: <BarChart3 className="h-4 w-4" /> },
  { key: 'registry', label: 'سجل النماذج', icon: <Archive className="h-4 w-4" /> },
  { key: 'deploy', label: 'النشر', icon: <Rocket className="h-4 w-4" /> },
  { key: 'monitor', label: 'المراقبة', icon: <Activity className="h-4 w-4" /> },
];

const statusLabels: Record<string, string> = {
  pending: 'قيد الانتظار', running: 'قيد التشغيل', completed: 'مكتمل', failed: 'فشل',
  cancelled: 'ملغي', ready: 'جاهز', draft: 'مسودة', registered: 'مسجل',
  staging: 'اختبار', production: 'إنتاج', archived: 'مؤرشف', active: 'نشط',
  deploying: 'قيد النشر', draining: 'قيد الإيقاف', rolled_back: 'تم التراجع',
  validated: 'تم التحقق', invalid: 'غير صالح', building: 'قيد البناء',
  deprecated: 'متقادم',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  ready: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  registered: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  staging: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  production: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  archived: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  deploying: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  validated: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  invalid: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  building: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[status] || statusColors.draft}`}>
      {status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'completed' && <CheckCircle className="h-3 w-3" />}
      {status === 'failed' && <XCircle className="h-3 w-3" />}
      {status === 'pending' && <Clock className="h-3 w-3" />}
      {status === 'active' && <CheckCircle className="h-3 w-3" />}
      {statusLabels[status] || status}
    </span>
  );
}

function MetricCard({ label, value, icon, color = 'text-rasid-600' }: { label: string; value: string | number; icon: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        {icon}
        {label}
      </div>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

// ── Datasets Tab ────────────────────────────────────────────────────

function DatasetsTab() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [newDataset, setNewDataset] = useState({ name: '', description: '', taskType: 'classification', language: 'ar' });

  const { data: datasetsRes, isLoading, isError, error } = useQuery({
    queryKey: ['training-datasets'],
    queryFn: () => fetchDatasets({ limit: 50 }),
  });

  const { data: stats } = useQuery({
    queryKey: ['dataset-stats', selectedDatasetId],
    queryFn: () => fetchDatasetStatistics(selectedDatasetId!),
    enabled: !!selectedDatasetId,
  });

  const createMutation = useMutation({
    mutationFn: createDataset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-datasets'] });
      setShowCreate(false);
      setNewDataset({ name: '', description: '', taskType: 'classification', language: 'ar' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDataset,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['training-datasets'] }),
  });

  const splitMutation = useMutation({
    mutationFn: ({ id, config }: { id: string; config: { trainRatio: number; validationRatio: number; testRatio: number } }) =>
      splitDataset(id, config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dataset-stats'] }),
  });

  const augmentMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      augmentDataset(id, { techniques: ['synonym_replacement', 'diacritics_removal'], maxAugmentPerSample: 2 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-datasets'] });
      queryClient.invalidateQueries({ queryKey: ['dataset-stats'] });
    },
  });

  const datasets = datasetsRes?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">مجموعات البيانات التدريبية</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="inline-flex items-center gap-2 rounded-xl bg-rasid-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-rasid-700">
          <Plus className="h-4 w-4" />
          إنشاء مجموعة
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">مجموعة بيانات جديدة</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">اسم المجموعة</label>
              <input value={newDataset.name} onChange={(e) => setNewDataset({ ...newDataset, name: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">نوع المهمة</label>
              <select value={newDataset.taskType} onChange={(e) => setNewDataset({ ...newDataset, taskType: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="classification">تصنيف</option>
                <option value="regression">انحدار</option>
                <option value="ner">التعرف على الكيانات</option>
                <option value="text-generation">توليد نص</option>
                <option value="summarization">تلخيص</option>
                <option value="translation">ترجمة</option>
                <option value="question-answering">الإجابة على الأسئلة</option>
                <option value="sentiment">تحليل المشاعر</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">اللغة</label>
              <select value={newDataset.language} onChange={(e) => setNewDataset({ ...newDataset, language: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="ar">عربي</option>
                <option value="en">إنجليزي</option>
                <option value="mixed">مختلط</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">الوصف</label>
              <input value={newDataset.description} onChange={(e) => setNewDataset({ ...newDataset, description: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">إلغاء</button>
            <button onClick={() => createMutation.mutate(newDataset)} disabled={createMutation.isPending || !newDataset.name.trim()} className="inline-flex items-center gap-2 rounded-lg bg-rasid-600 px-4 py-2 text-sm text-white hover:bg-rasid-700 disabled:opacity-50">
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              إنشاء
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-rasid-600" /><span className="ms-3 text-gray-500">جاري التحميل...</span></div>}
      {isError && <div className="flex flex-col items-center gap-4 rounded-xl border border-red-200 bg-red-50 py-12 dark:border-red-800 dark:bg-red-900/20"><AlertCircle className="h-10 w-10 text-red-500" /><p className="text-sm text-red-700 dark:text-red-400">{error instanceof Error ? error.message : 'حدث خطأ'}</p></div>}
      {!isLoading && !isError && datasets.length === 0 && <div className="flex flex-col items-center gap-3 py-20"><Database className="h-16 w-16 text-gray-300 dark:text-gray-600" /><p className="text-gray-500 dark:text-gray-400">لا توجد مجموعات بيانات</p></div>}

      {!isLoading && datasets.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">الاسم</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">المهمة</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">اللغة</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">العينات</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">الإصدار</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">الحالة</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {datasets.map((ds: TrainingDataset) => (
                <tr key={ds.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${selectedDatasetId === ds.id ? 'bg-rasid-50 dark:bg-rasid-900/10' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                    <button onClick={() => setSelectedDatasetId(selectedDatasetId === ds.id ? null : ds.id)} className="hover:text-rasid-600">{ds.name}</button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{ds.taskType}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{ds.language === 'ar' ? 'عربي' : ds.language === 'en' ? 'إنجليزي' : 'مختلط'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{ds.sampleCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">v{ds.version}</td>
                  <td className="px-4 py-3"><StatusBadge status={ds.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => splitMutation.mutate({ id: ds.id, config: { trainRatio: 0.8, validationRatio: 0.1, testRatio: 0.1 } })} title="تقسيم" className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20">
                        <Split className="h-4 w-4" />
                      </button>
                      <button onClick={() => augmentMutation.mutate({ id: ds.id })} title="تعزيز البيانات" className="rounded p-1.5 text-gray-400 hover:bg-purple-50 hover:text-purple-600 dark:hover:bg-purple-900/20">
                        <Wand2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteMutation.mutate(ds.id)} title="حذف" className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedDatasetId && stats && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">إحصائيات المجموعة</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="إجمالي العينات" value={stats.totalSamples.toLocaleString()} icon={<Database className="h-3 w-3" />} />
            <MetricCard label="جودة البيانات" value={`${Math.round(stats.qualityScore * 100)}%`} icon={<Star className="h-3 w-3" />} color="text-yellow-600" />
            <MetricCard label="العينات المعززة" value={stats.augmentedSamples} icon={<Wand2 className="h-3 w-3" />} color="text-purple-600" />
            <MetricCard label="متوسط الجودة" value={stats.avgQuality.toFixed(2)} icon={<Gauge className="h-3 w-3" />} color="text-blue-600" />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">توزيع التقسيم</p>
              <div className="mt-2 flex gap-2">
                <span className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">تدريب: {stats.splitDistribution.train}</span>
                <span className="rounded-md bg-orange-50 px-2 py-1 text-xs text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">تحقق: {stats.splitDistribution.validation}</span>
                <span className="rounded-md bg-green-50 px-2 py-1 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-400">اختبار: {stats.splitDistribution.test}</span>
                {stats.splitDistribution.unassigned > 0 && <span className="rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-400">غير مقسم: {stats.splitDistribution.unassigned}</span>}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">توزيع الجودة</p>
              <div className="mt-2 flex gap-2">
                <span className="rounded-md bg-green-50 px-2 py-1 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-400">عالية: {stats.qualityDistribution.high}</span>
                <span className="rounded-md bg-yellow-50 px-2 py-1 text-xs text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">متوسطة: {stats.qualityDistribution.medium}</span>
                <span className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">منخفضة: {stats.qualityDistribution.low}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Model Builder Tab ──────────────────────────────────────────────

function ModelBuilderTab() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState({ name: '', datasetId: '', baseModel: 'gpt-4o-mini-2024-07-18', taskType: 'classification', epochs: 3, batchSize: 8, learningRateMultiplier: 1.0 });

  const { data: datasetsRes } = useQuery({ queryKey: ['training-datasets'], queryFn: () => fetchDatasets({ limit: 100 }) });
  const { data: configs, isLoading: configsLoading } = useQuery({ queryKey: ['model-configs'], queryFn: () => fetchModelConfigurations() });
  const { data: baseModels } = useQuery({ queryKey: ['base-models'], queryFn: fetchBaseModels });

  const createConfigMutation = useMutation({
    mutationFn: createModelConfiguration,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['model-configs'] }); setConfig({ ...config, name: '' }); },
  });

  const validateMutation = useMutation({ mutationFn: (id: string) => validateModelConfiguration(id) });
  const trainMutation = useMutation({ mutationFn: (id: string) => startTraining(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['model-configs'] }) });

  const datasets = datasetsRes?.data ?? [];
  const configurations = configs?.data ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">بناء نموذج جديد</h2>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">اسم النموذج</label>
            <input value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} placeholder="مصنف المستندات v1" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">مجموعة البيانات</label>
            <select value={config.datasetId} onChange={(e) => setConfig({ ...config, datasetId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="">اختر مجموعة...</option>
              {datasets.map((ds: TrainingDataset) => <option key={ds.id} value={ds.id}>{ds.name} ({ds.sampleCount} عينة)</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">النموذج الأساسي</label>
            <select value={config.baseModel} onChange={(e) => setConfig({ ...config, baseModel: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              {(baseModels || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              {!baseModels && <>
                <option value="gpt-4o-mini-2024-07-18">GPT-4o Mini</option>
                <option value="gpt-4o-2024-08-06">GPT-4o</option>
                <option value="gpt-3.5-turbo-0125">GPT-3.5 Turbo</option>
              </>}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">نوع المهمة</label>
            <select value={config.taskType} onChange={(e) => setConfig({ ...config, taskType: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="classification">تصنيف</option>
              <option value="ner">التعرف على الكيانات</option>
              <option value="text-generation">توليد نص</option>
              <option value="summarization">تلخيص</option>
              <option value="translation">ترجمة</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">عدد الحقب</label>
            <input type="number" min={1} max={50} value={config.epochs} onChange={(e) => setConfig({ ...config, epochs: parseInt(e.target.value) || 3 })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">معدل التعلم</label>
            <input type="number" step="0.1" min={0.01} max={10} value={config.learningRateMultiplier} onChange={(e) => setConfig({ ...config, learningRateMultiplier: parseFloat(e.target.value) || 1.0 })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={() => createConfigMutation.mutate({ name: config.name, datasetId: config.datasetId, baseModel: config.baseModel, taskType: config.taskType, hyperparameters: { epochs: config.epochs, batchSize: config.batchSize, learningRateMultiplier: config.learningRateMultiplier } })} disabled={createConfigMutation.isPending || !config.datasetId || !config.name} className="inline-flex items-center gap-2 rounded-xl bg-rasid-600 px-6 py-2.5 text-sm font-medium text-white shadow-md transition hover:bg-rasid-700 disabled:opacity-50">
            {createConfigMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            إنشاء تكوين
          </button>
        </div>
      </div>

      {configsLoading && <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-rasid-600" /></div>}

      {configurations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">التكوينات الحالية</h3>
          {configurations.map((cfg: ModelConfiguration) => (
            <div key={cfg.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{cfg.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{cfg.baseModel} | {cfg.taskType} | {cfg.hyperparameters.epochs} حقب</p>
                <p className="text-xs text-gray-400">الوقت المتوقع: {cfg.estimatedTrainingTime} دقيقة | التكلفة: ${cfg.estimatedCost}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={cfg.status} />
                <button onClick={() => validateMutation.mutate(cfg.id)} className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400">
                  <Shield className="inline h-3 w-3 me-1" />تحقق
                </button>
                {(cfg.status === 'validated' || cfg.status === 'draft') && (
                  <button onClick={() => trainMutation.mutate(cfg.id)} disabled={trainMutation.isPending} className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400">
                    <Play className="inline h-3 w-3 me-1" />تدريب
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {validateMutation.isSuccess && validateMutation.data && (
        <div className={`rounded-lg p-4 ${validateMutation.data.isValid ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          <p className={`text-sm font-medium ${validateMutation.data.isValid ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {validateMutation.data.isValid ? 'التكوين صالح للتدريب' : 'التكوين يحتوي على أخطاء'}
          </p>
          {validateMutation.data.errors.map((err, i) => <p key={i} className="mt-1 text-xs text-red-600 dark:text-red-400">- {err}</p>)}
          {validateMutation.data.warnings.map((w, i) => <p key={i} className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">- {w}</p>)}
          {validateMutation.data.recommendations.map((r, i) => <p key={i} className="mt-1 text-xs text-blue-600 dark:text-blue-400">- {r}</p>)}
        </div>
      )}
    </div>
  );
}

// ── Training Tab ──────────────────────────────────────────────────

function TrainingTab() {
  const { data: configs, isLoading } = useQuery({ queryKey: ['model-configs'], queryFn: () => fetchModelConfigurations({ limit: 50 }), refetchInterval: 10000 });
  const configurations = configs?.data ?? [];
  const activeConfigs = configurations.filter((c: ModelConfiguration) => ['building', 'validated', 'draft'].includes(c.status));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">التدريب والضبط</h2>
      {isLoading && <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-rasid-600" /></div>}
      {!isLoading && activeConfigs.length === 0 && <div className="flex flex-col items-center gap-3 py-20"><Settings2 className="h-16 w-16 text-gray-300 dark:text-gray-600" /><p className="text-gray-500 dark:text-gray-400">لا توجد مهام تدريب نشطة. أنشئ تكوين من تبويب بناء النماذج.</p></div>}
      {activeConfigs.length > 0 && (
        <div className="space-y-3">
          {activeConfigs.map((cfg: ModelConfiguration) => (
            <div key={cfg.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rasid-100 dark:bg-rasid-900/30"><Cpu className="h-5 w-5 text-rasid-600" /></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{cfg.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{cfg.baseModel} | {cfg.taskType} | {cfg.hyperparameters.epochs} حقب</p>
                  </div>
                </div>
                <StatusBadge status={cfg.status} />
              </div>
              <div className="mt-3 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                <span>الوقت المتوقع: {cfg.estimatedTrainingTime} دقيقة</span>
                <span>التكلفة المقدرة: ${cfg.estimatedCost}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Evaluation Tab ──────────────────────────────────────────────

function EvaluationTab() {
  const [evalConfig, setEvalConfig] = useState({ modelId: '', datasetId: '', metrics: ['accuracy', 'f1', 'precision', 'recall'] });
  const { data: datasetsRes } = useQuery({ queryKey: ['training-datasets'], queryFn: () => fetchDatasets({ limit: 100 }) });
  const { data: evalsRes, isLoading } = useQuery({ queryKey: ['evaluations'], queryFn: () => fetchEvaluations({ limit: 20 }) });

  const evalMutation = useMutation({ mutationFn: runEvaluation });

  const datasets = datasetsRes?.data ?? [];
  const evaluations = evalsRes?.data ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">تقييم النماذج</h2>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">معرف النموذج</label>
            <input value={evalConfig.modelId} onChange={(e) => setEvalConfig({ ...evalConfig, modelId: e.target.value })} placeholder="ft:gpt-4o-mini:rasid:model-name" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">مجموعة بيانات الاختبار</label>
            <select value={evalConfig.datasetId} onChange={(e) => setEvalConfig({ ...evalConfig, datasetId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="">اختر...</option>
              {datasets.map((ds: TrainingDataset) => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">المقاييس</label>
          <div className="flex flex-wrap gap-2">
            {['accuracy', 'precision', 'recall', 'f1', 'bleu', 'rouge', 'exact_match', 'arabic_morphological_accuracy'].map((m) => (
              <label key={m} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-1.5 text-xs dark:bg-gray-700">
                <input type="checkbox" checked={evalConfig.metrics.includes(m)} onChange={(e) => setEvalConfig({ ...evalConfig, metrics: e.target.checked ? [...evalConfig.metrics, m] : evalConfig.metrics.filter((x) => x !== m) })} className="rounded border-gray-300" />
                <span className="text-gray-700 dark:text-gray-300">{m}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={() => evalMutation.mutate(evalConfig)} disabled={evalMutation.isPending || !evalConfig.modelId || !evalConfig.datasetId} className="inline-flex items-center gap-2 rounded-xl bg-rasid-600 px-6 py-2.5 text-sm font-medium text-white shadow-md hover:bg-rasid-700 disabled:opacity-50">
            {evalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            تقييم
          </button>
        </div>
      </div>

      {evalMutation.isSuccess && evalMutation.data && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">نتائج التقييم</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(evalMutation.data.metrics).map(([key, val]) => (
              <div key={key} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">{key}</p>
                <p className="mt-1 text-xl font-bold text-rasid-600">{(val as number * 100).toFixed(1)}%</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">العينات المقيمة: {evalMutation.data.evaluatedSamples} | المدة: {Math.round(evalMutation.data.duration / 1000)} ثانية</p>
        </div>
      )}

      {!isLoading && evaluations.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">التقييمات السابقة</h3>
          <div className="space-y-2">
            {evaluations.map((ev: EvaluationResult) => (
              <div key={ev.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                <div>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{ev.modelId}</p>
                  <p className="text-xs text-gray-500">{new Date(ev.createdAt).toLocaleDateString('ar-SA')} | {ev.evaluatedSamples} عينة</p>
                </div>
                <div className="flex gap-2">
                  {Object.entries(ev.metrics).slice(0, 3).map(([k, v]) => (
                    <span key={k} className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">{k}: {((v as number) * 100).toFixed(1)}%</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Registry Tab ──────────────────────────────────────────────────

function RegistryTab() {
  const queryClient = useQueryClient();
  const { data: modelsRes, isLoading } = useQuery({ queryKey: ['model-registry'], queryFn: () => fetchRegisteredModels({ limit: 50 }) });

  const promoteMutation = useMutation({ mutationFn: ({ id, target }: { id: string; target: 'staging' | 'production' }) => promoteModel(id, target), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['model-registry'] }) });
  const archiveMutation = useMutation({ mutationFn: archiveModel, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['model-registry'] }) });

  const models = modelsRes?.data ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">سجل النماذج</h2>
      {isLoading && <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-rasid-600" /></div>}
      {!isLoading && models.length === 0 && <div className="flex flex-col items-center gap-3 py-20"><Archive className="h-16 w-16 text-gray-300 dark:text-gray-600" /><p className="text-gray-500 dark:text-gray-400">لا توجد نماذج مسجلة</p></div>}

      {models.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {models.map((model: RegisteredModel) => (
            <div key={model.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{model.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">v{model.version} | {model.baseModel}</p>
                </div>
                <StatusBadge status={model.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">{model.taskType}</span>
                {Object.entries(model.metrics).slice(0, 3).map(([key, val]) => (
                  <span key={key} className="rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                    {key}: {typeof val === 'number' ? (val < 1 ? (val * 100).toFixed(1) + '%' : val.toFixed(3)) : val}
                  </span>
                ))}
              </div>
              {model.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {model.tags.map((tag) => <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">{tag}</span>)}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                {model.status === 'registered' && (
                  <button onClick={() => promoteMutation.mutate({ id: model.id, target: 'staging' })} className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400">
                    <ArrowUpCircle className="h-3 w-3" /> ترقية للاختبار
                  </button>
                )}
                {model.status === 'staging' && (
                  <button onClick={() => promoteMutation.mutate({ id: model.id, target: 'production' })} className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400">
                    <Rocket className="h-3 w-3" /> ترقية للإنتاج
                  </button>
                )}
                {!['archived', 'deprecated'].includes(model.status) && (
                  <button onClick={() => archiveMutation.mutate(model.id)} className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400">
                    <ArchiveRestore className="h-3 w-3" /> أرشفة
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Deploy Tab ──────────────────────────────────────────────────

function DeployTab() {
  const queryClient = useQueryClient();
  const [deployConfig, setDeployConfig] = useState<{ registeredModelId: string; environment: 'staging' | 'production'; strategy: 'direct' | 'canary' | 'ab_test' }>({ registeredModelId: '', environment: 'staging', strategy: 'direct' });

  const { data: modelsRes } = useQuery({ queryKey: ['model-registry'], queryFn: () => fetchRegisteredModels({ status: 'staging' }) });
  const { data: deploymentsRes, isLoading } = useQuery({ queryKey: ['deployments'], queryFn: () => fetchDeployments({ limit: 20 }) });

  const deployMutation = useMutation({ mutationFn: deployModel, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployments'] }) });
  const rollbackMutation = useMutation({ mutationFn: rollbackDeployment, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployments'] }) });

  const models = modelsRes?.data ?? [];
  const deployments = deploymentsRes?.data ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">نشر النماذج</h2>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">النموذج</label>
            <select value={deployConfig.registeredModelId} onChange={(e) => setDeployConfig({ ...deployConfig, registeredModelId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="">اختر نموذج...</option>
              {models.map((m: RegisteredModel) => <option key={m.id} value={m.id}>{m.name} v{m.version}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">البيئة</label>
            <select value={deployConfig.environment} onChange={(e) => setDeployConfig({ ...deployConfig, environment: e.target.value as 'staging' | 'production' })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="staging">اختبار (Staging)</option>
              <option value="production">إنتاج (Production)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">استراتيجية النشر</label>
            <select value={deployConfig.strategy} onChange={(e) => setDeployConfig({ ...deployConfig, strategy: e.target.value as 'direct' | 'canary' | 'ab_test' })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="direct">مباشر</option>
              <option value="canary">تدريجي (Canary)</option>
              <option value="ab_test">اختبار A/B</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={() => deployMutation.mutate(deployConfig)} disabled={deployMutation.isPending || !deployConfig.registeredModelId} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-md hover:shadow-lg disabled:opacity-50">
            {deployMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            نشر النموذج
          </button>
        </div>
      </div>

      {deployments.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">عمليات النشر</h3>
          <div className="space-y-3">
            {deployments.map((dep: Deployment) => (
              <div key={dep.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{dep.modelId}</p>
                    <p className="text-xs text-gray-500">{dep.environment} | {dep.strategy} | {new Date(dep.createdAt).toLocaleDateString('ar-SA')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={dep.status} />
                    {dep.healthStatus.isHealthy ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-red-500" />}
                    {dep.status === 'active' && (
                      <button onClick={() => rollbackMutation.mutate(dep.id)} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400">
                        <RotateCcw className="inline h-3 w-3 me-1" />تراجع
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-gray-500">
                  <span>الطلبات: {dep.metrics.totalRequests}</span>
                  <span>نسبة النجاح: {dep.metrics.totalRequests > 0 ? Math.round((dep.metrics.successfulRequests / dep.metrics.totalRequests) * 100) : 0}%</span>
                  <span>زمن الاستجابة: {dep.metrics.avgResponseTime.toFixed(0)}ms</span>
                  <span>الحد: {dep.rateLimits.requestsPerMinute}/دقيقة</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Monitor Tab ──────────────────────────────────────────────────

function MonitorTab() {
  const [selectedJobId, setSelectedJobId] = useState('');
  const queryClient = useQueryClient();

  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['training-metrics', selectedJobId],
    queryFn: () => fetchTrainingMetrics(selectedJobId),
    enabled: !!selectedJobId,
    refetchInterval: selectedJobId ? 10000 : false,
  });

  const { data: anomalies } = useQuery({
    queryKey: ['training-anomalies', selectedJobId],
    queryFn: () => fetchTrainingAnomalies(selectedJobId),
    enabled: !!selectedJobId,
  });

  const { data: alerts } = useQuery({
    queryKey: ['training-alerts', selectedJobId],
    queryFn: () => fetchTrainingAlerts(selectedJobId),
    enabled: !!selectedJobId,
  });

  const ackMutation = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['training-alerts'] }),
  });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">مراقبة التدريب</h2>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">معرف المهمة (Job ID)</label>
        <input value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} placeholder="أدخل معرف مهمة التدريب" className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
      </div>

      {selectedJobId && metricsLoading && <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-rasid-600" /></div>}

      {metricsData && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="التقدم" value={`${Math.round(metricsData.progress * 100)}%`} icon={<Gauge className="h-3 w-3" />} />
            <MetricCard label="الحقبة" value={`${metricsData.currentEpoch}/${metricsData.totalEpochs}`} icon={<Activity className="h-3 w-3" />} color="text-blue-600" />
            <MetricCard label="خسارة التدريب" value={metricsData.trainLoss.length > 0 ? metricsData.trainLoss[metricsData.trainLoss.length - 1].toFixed(4) : '-'} icon={<TrendingDown className="h-3 w-3" />} color="text-orange-600" />
            <MetricCard label="الحالة" value={statusLabels[metricsData.status] || metricsData.status} icon={<Eye className="h-3 w-3" />} color={metricsData.status === 'running' ? 'text-blue-600' : metricsData.status === 'succeeded' ? 'text-green-600' : 'text-gray-600'} />
          </div>

          {metricsData.trainLoss.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">تاريخ الخسارة</h3>
              <div className="flex h-32 items-end gap-1">
                {metricsData.trainLoss.map((loss, i) => (
                  <div key={i} className="flex-1 rounded-t bg-rasid-500 opacity-80 transition hover:opacity-100" style={{ height: `${Math.min(100, (loss / Math.max(...metricsData.trainLoss)) * 100)}%` }} title={`Step ${i + 1}: ${loss.toFixed(4)}`} />
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 text-xs text-gray-500">
            الوقت المنقضي: {Math.round(metricsData.elapsedTime / 60)} دقيقة | الوقت المتبقي: {Math.round(metricsData.estimatedTimeRemaining / 60)} دقيقة
          </div>
        </div>
      )}

      {anomalies && anomalies.length > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-yellow-800 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4" /> الشذوذات المكتشفة ({anomalies.length})
          </h3>
          <div className="space-y-2">
            {anomalies.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 rounded px-1.5 py-0.5 font-medium ${a.severity === 'critical' ? 'bg-red-100 text-red-700' : a.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>{a.severity}</span>
                <span className="text-gray-700 dark:text-gray-300">{a.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {alerts && alerts.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">التنبيهات ({alerts.filter((a: TrainingAlert) => !a.acknowledged).length} غير مقروءة)</h3>
          <div className="space-y-2">
            {alerts.map((alert: TrainingAlert) => (
              <div key={alert.id} className={`flex items-center justify-between rounded-lg p-2.5 text-xs ${alert.acknowledged ? 'bg-gray-50 dark:bg-gray-800' : 'bg-blue-50 dark:bg-blue-900/10'}`}>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 font-medium ${alert.severity === 'critical' ? 'bg-red-100 text-red-700' : alert.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>{alert.severity}</span>
                  <span className="text-gray-700 dark:text-gray-300">{alert.message}</span>
                </div>
                {!alert.acknowledged && (
                  <button onClick={() => ackMutation.mutate(alert.id)} className="rounded bg-gray-100 px-2 py-1 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400">قراءة</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────

export default function TrainingCenterPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('datasets');

  const tabComponents: Record<TabKey, React.ReactNode> = {
    datasets: <DatasetsTab />,
    builder: <ModelBuilderTab />,
    training: <TrainingTab />,
    evaluation: <EvaluationTab />,
    registry: <RegistryTab />,
    deploy: <DeployTab />,
    monitor: <MonitorTab />,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">مركز تدريب الذكاء الاصطناعي</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">إدارة مجموعات البيانات وتدريب ونشر نماذج الذكاء الاصطناعي</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? 'bg-white text-rasid-700 shadow-sm dark:bg-gray-700 dark:text-rasid-400'
                : 'text-gray-600 hover:bg-white/50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {tabComponents[activeTab]}
    </div>
  );
}
