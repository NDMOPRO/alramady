'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';
import {
  GitBranch, Plus, Play, Pause, Trash2, Edit, Search,
  RefreshCw, CheckCircle, Clock, AlertTriangle, XCircle,
  ArrowRight, Zap, Settings2, Copy, Eye, ToggleLeft, ToggleRight,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:80';

interface WorkflowStep {
  id: number;
  name: string;
  type: 'trigger' | 'action' | 'condition' | 'notification';
  config: Record<string, string>;
}

interface Workflow {
  id: number;
  name: string;
  nameEn: string;
  description: string;
  status: 'active' | 'inactive' | 'error' | 'draft';
  trigger: string;
  stepsCount: number;
  executionCount: number;
  lastExecution: string;
  lastExecutionStatus: 'success' | 'failed' | 'running';
  createdBy: string;
  steps: WorkflowStep[];
}

interface WorkflowConfig {
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: string;
  steps: { name: string; type: string; action: string }[];
  notifyOnComplete: boolean;
  notifyOnFailure: boolean;
  retryOnFailure: boolean;
  maxRetries: number;
}

const defaultWorkflows: Workflow[] = [
  { id: 1, name: 'معالجة البيانات الواردة', nameEn: 'Incoming Data Processing', description: 'معالجة تلقائية للملفات المرفوعة: تنظيف، تحويل، تحميل', status: 'active', trigger: 'رفع ملف جديد', stepsCount: 5, executionCount: 234, lastExecution: '2026-03-05 17:30', lastExecutionStatus: 'success', createdBy: 'أحمد محمد', steps: [{ id: 1, name: 'استلام الملف', type: 'trigger', config: {} }, { id: 2, name: 'التحقق من الصيغة', type: 'condition', config: {} }, { id: 3, name: 'تنظيف البيانات', type: 'action', config: {} }] },
  { id: 2, name: 'تقرير الأداء الأسبوعي', nameEn: 'Weekly Performance Report', description: 'توليد وإرسال تقرير الأداء تلقائياً كل أسبوع', status: 'active', trigger: 'جدول زمني (أسبوعي)', stepsCount: 4, executionCount: 52, lastExecution: '2026-03-01 08:00', lastExecutionStatus: 'success', createdBy: 'فاطمة أحمد', steps: [{ id: 1, name: 'تجميع البيانات', type: 'action', config: {} }, { id: 2, name: 'توليد التقرير', type: 'action', config: {} }] },
  { id: 3, name: 'تنبيه تجاوز الحد', nameEn: 'Threshold Alert Workflow', description: 'إرسال تنبيه عند تجاوز مؤشر الأداء الحد المسموح', status: 'active', trigger: 'تجاوز KPI', stepsCount: 3, executionCount: 18, lastExecution: '2026-03-05 14:20', lastExecutionStatus: 'success', createdBy: 'خالد سعيد', steps: [{ id: 1, name: 'مراقبة المؤشر', type: 'trigger', config: {} }, { id: 2, name: 'إرسال تنبيه', type: 'notification', config: {} }] },
  { id: 4, name: 'مزامنة قواعد البيانات', nameEn: 'Database Sync Workflow', description: 'مزامنة البيانات بين النظام الرئيسي والنسخ الاحتياطية', status: 'error', trigger: 'جدول زمني (يومي)', stepsCount: 6, executionCount: 89, lastExecution: '2026-03-05 03:00', lastExecutionStatus: 'failed', createdBy: 'محمد عبدالله', steps: [{ id: 1, name: 'فحص الاتصال', type: 'condition', config: {} }, { id: 2, name: 'نقل البيانات', type: 'action', config: {} }] },
  { id: 5, name: 'سير عمل الموافقات', nameEn: 'Approval Workflow', description: 'سير عمل الموافقات على التعديلات والتقارير الحساسة', status: 'draft', trigger: 'طلب موافقة', stepsCount: 4, executionCount: 0, lastExecution: '--', lastExecutionStatus: 'success', createdBy: 'سارة علي', steps: [] },
];

const statusConfig: Record<string, { color: string; label: string; icon: typeof CheckCircle }> = {
  active: { color: 'bg-green-100 text-green-700', label: 'نشط', icon: CheckCircle },
  inactive: { color: 'bg-gray-100 text-gray-600', label: 'غير نشط', icon: Pause },
  error: { color: 'bg-red-100 text-red-700', label: 'خطأ', icon: XCircle },
  draft: { color: 'bg-yellow-100 text-yellow-700', label: 'مسودة', icon: Edit },
};

const execStatusColors: Record<string, string> = {
  success: 'text-green-600',
  failed: 'text-red-600',
  running: 'text-blue-600',
};

export default function AdminWorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [config, setConfig] = useState<WorkflowConfig>({
    name: '',
    description: '',
    triggerType: 'schedule',
    triggerConfig: '',
    steps: [{ name: '', type: 'action', action: '' }],
    notifyOnComplete: true,
    notifyOnFailure: true,
    retryOnFailure: false,
    maxRetries: 3,
  });

  const fetchWorkflows = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/admin/workflows`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
      setWorkflows(res.data?.results ?? defaultWorkflows);
    } catch {
      setWorkflows(defaultWorkflows);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/admin/workflows`, config, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
      fetchWorkflows();
    } catch {
      const newWorkflow: Workflow = {
        id: Date.now(),
        name: config.name,
        nameEn: config.name,
        description: config.description,
        status: 'draft',
        trigger: config.triggerType === 'schedule' ? 'جدول زمني' : config.triggerType === 'event' ? 'حدث' : 'يدوي',
        stepsCount: config.steps.length,
        executionCount: 0,
        lastExecution: '--',
        lastExecutionStatus: 'success',
        createdBy: 'المستخدم الحالي',
        steps: [],
      };
      setWorkflows(prev => [newWorkflow, ...prev]);
    }
    setShowCreateModal(false);
    setConfig({ name: '', description: '', triggerType: 'schedule', triggerConfig: '', steps: [{ name: '', type: 'action', action: '' }], notifyOnComplete: true, notifyOnFailure: true, retryOnFailure: false, maxRetries: 3 });
  };

  const handleToggleWorkflow = async (id: number) => {
    setWorkflows(prev => prev.map(w => {
      if (w.id !== id) return w;
      return { ...w, status: w.status === 'active' ? 'inactive' as const : 'active' as const };
    }));
    try {
      await axios.patch(`${API_URL}/api/admin/workflows/${id}/toggle`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
    } catch { /* optimistic */ }
  };

  const handleRunWorkflow = async (id: number) => {
    try {
      await axios.post(`${API_URL}/api/admin/workflows/${id}/execute`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
      setWorkflows(prev => prev.map(w => w.id === id ? { ...w, lastExecution: 'الآن', lastExecutionStatus: 'running' as const } : w));
    } catch { /* silent */ }
  };

  const handleDeleteWorkflow = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/api/admin/workflows/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
    } catch { /* continue */ }
    setWorkflows(prev => prev.filter(w => w.id !== id));
  };

  const handleDuplicateWorkflow = (workflow: Workflow) => {
    const dup: Workflow = { ...workflow, id: Date.now(), name: `${workflow.name} (نسخة)`, status: 'draft', executionCount: 0, lastExecution: '--' };
    setWorkflows(prev => [dup, ...prev]);
  };

  const addStep = () => {
    setConfig(prev => ({ ...prev, steps: [...prev.steps, { name: '', type: 'action', action: '' }] }));
  };

  const updateStep = (index: number, field: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      steps: prev.steps.map((s, i) => i === index ? { ...s, [field]: value } : s),
    }));
  };

  const removeStep = (index: number) => {
    setConfig(prev => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }));
  };

  const filtered = workflows.filter(w => {
    const matchesSearch = w.name.includes(searchQuery) || w.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) || w.description.includes(searchQuery);
    const matchesStatus = filterStatus === 'all' || w.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/dashboard" className="hover:text-blue-600">لوحة التحكم</Link>
            <span>/</span>
            <Link href="/admin/workflows" className="hover:text-blue-600">الإدارة</Link>
            <span>/</span>
            <span>سير العمل</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة سير العمل</h1>
          <p className="text-gray-500">Workflow Management & Automation</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition">
          <Plus className="h-4 w-4" />
          سير عمل جديد
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي سير العمل', value: workflows.length, icon: GitBranch, color: 'text-blue-600' },
          { label: 'نشطة', value: workflows.filter(w => w.status === 'active').length, icon: Zap, color: 'text-green-600' },
          { label: 'إجمالي التنفيذات', value: workflows.reduce((s, w) => s + w.executionCount, 0), icon: Play, color: 'text-purple-600' },
          { label: 'بها أخطاء', value: workflows.filter(w => w.status === 'error').length, icon: AlertTriangle, color: 'text-red-600' },
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
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="البحث في سير العمل..." className="w-full rounded-lg border border-gray-300 py-2 pr-10 pl-4 rtl:pr-10 rtl:pl-4 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="rounded-lg border border-gray-300 py-2 px-3 text-sm">
          <option value="all">جميع الحالات</option>
          <option value="active">نشط</option>
          <option value="inactive">غير نشط</option>
          <option value="error">خطأ</option>
          <option value="draft">مسودة</option>
        </select>
        <button onClick={fetchWorkflows} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition">
          <RefreshCw className="h-4 w-4" />
          تحديث
        </button>
      </div>

      {/* Workflows List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(workflow => {
            const statusInfo = statusConfig[workflow.status];
            const StatusIcon = statusInfo.icon;
            return (
              <div key={workflow.id} className={`rounded-xl border bg-white overflow-hidden hover:shadow-md transition ${workflow.status === 'error' ? 'border-red-200' : 'border-gray-200'}`}>
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="rounded-lg bg-blue-50 p-2.5">
                        <GitBranch className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-gray-900">{workflow.name}</h3>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusInfo.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mb-1">{workflow.nameEn}</p>
                        <p className="text-sm text-gray-500 mb-3">{workflow.description}</p>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-yellow-500" /> المحفز: {workflow.trigger}</span>
                          <span>{workflow.stepsCount} خطوة</span>
                          <span>{workflow.executionCount} تنفيذ</span>
                          <span className={`flex items-center gap-1 ${execStatusColors[workflow.lastExecutionStatus]}`}>
                            <Clock className="h-3.5 w-3.5" />
                            آخر تنفيذ: {workflow.lastExecution}
                          </span>
                          <span>بواسطة: {workflow.createdBy}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleToggleWorkflow(workflow.id)} className="rounded p-1.5 hover:bg-gray-100 transition" title={workflow.status === 'active' ? 'إيقاف' : 'تفعيل'}>
                        {workflow.status === 'active' ? <ToggleRight className="h-5 w-5 text-green-600" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                      </button>
                      <button onClick={() => handleRunWorkflow(workflow.id)} className="rounded p-1.5 hover:bg-blue-50 text-blue-600 transition" title="تشغيل"><Play className="h-4 w-4" /></button>
                      <button onClick={() => setExpandedId(expandedId === workflow.id ? null : workflow.id)} className="rounded p-1.5 hover:bg-gray-100 text-gray-500 transition" title="تفاصيل"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => handleDuplicateWorkflow(workflow)} className="rounded p-1.5 hover:bg-gray-100 text-gray-500 transition" title="نسخ"><Copy className="h-4 w-4" /></button>
                      <button onClick={() => handleDeleteWorkflow(workflow.id)} className="rounded p-1.5 hover:bg-red-50 text-red-500 transition" title="حذف"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
                {expandedId === workflow.id && workflow.steps.length > 0 && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">خطوات سير العمل</h4>
                    <div className="flex items-center gap-2 overflow-x-auto pb-2">
                      {workflow.steps.map((step, idx) => (
                        <div key={step.id} className="flex items-center gap-2 shrink-0">
                          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
                            <span className="block font-medium text-gray-900">{step.name}</span>
                            <span className="text-gray-400">{step.type === 'trigger' ? 'محفز' : step.type === 'action' ? 'إجراء' : step.type === 'condition' ? 'شرط' : 'إشعار'}</span>
                          </div>
                          {idx < workflow.steps.length - 1 && <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200">
              <GitBranch className="mx-auto h-10 w-10 mb-2" />
              <p>لا توجد سير عمل مطابقة</p>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">إنشاء سير عمل جديد</h2>
            <form onSubmit={handleCreateWorkflow} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم سير العمل</label>
                <input type="text" value={config.name} onChange={e => setConfig(prev => ({ ...prev, name: e.target.value }))} placeholder="مثال: معالجة البيانات الواردة" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
                <textarea value={config.description} onChange={e => setConfig(prev => ({ ...prev, description: e.target.value }))} placeholder="وصف تفصيلي لسير العمل" rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">نوع المحفز</label>
                <select value={config.triggerType} onChange={e => setConfig(prev => ({ ...prev, triggerType: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="schedule">جدول زمني</option>
                  <option value="event">حدث (رفع ملف، تغيير بيانات)</option>
                  <option value="manual">يدوي</option>
                  <option value="webhook">Webhook</option>
                  <option value="threshold">تجاوز حد معين</option>
                </select>
              </div>
              {config.triggerType === 'schedule' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تعبير Cron</label>
                  <input type="text" value={config.triggerConfig} onChange={e => setConfig(prev => ({ ...prev, triggerConfig: e.target.value }))} placeholder="0 8 * * 1 (كل إثنين الساعة 8)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">خطوات سير العمل</label>
                  <button type="button" onClick={addStep} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus className="h-3 w-3" /> إضافة خطوة</button>
                </div>
                <div className="space-y-2">
                  {config.steps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-6 shrink-0">{idx + 1}.</span>
                      <input type="text" value={step.name} onChange={e => updateStep(idx, 'name', e.target.value)} placeholder="اسم الخطوة" className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                      <select value={step.type} onChange={e => updateStep(idx, 'type', e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                        <option value="action">إجراء</option>
                        <option value="condition">شرط</option>
                        <option value="notification">إشعار</option>
                      </select>
                      {config.steps.length > 1 && (
                        <button type="button" onClick={() => removeStep(idx)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={config.notifyOnComplete} onChange={e => setConfig(prev => ({ ...prev, notifyOnComplete: e.target.checked }))} className="rounded border-gray-300" />
                  إشعار عند الإكمال
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={config.notifyOnFailure} onChange={e => setConfig(prev => ({ ...prev, notifyOnFailure: e.target.checked }))} className="rounded border-gray-300" />
                  إشعار عند الفشل
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={config.retryOnFailure} onChange={e => setConfig(prev => ({ ...prev, retryOnFailure: e.target.checked }))} className="rounded border-gray-300" />
                  إعادة المحاولة عند الفشل (حتى {config.maxRetries} محاولات)
                </label>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 transition">إلغاء</button>
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 transition">إنشاء سير العمل</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
