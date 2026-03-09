'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';
import {
  CalendarClock, Plus, Play, Pause, Trash2, Edit, Search,
  RefreshCw, CheckCircle, Clock, AlertTriangle, Mail, FileText,
  Bell, Settings2,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:80';

interface ScheduledReport {
  id: number;
  name: string;
  nameEn: string;
  reportType: 'dashboard' | 'pdf' | 'excel' | 'email';
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  nextRun: string;
  lastRun: string;
  status: 'active' | 'paused' | 'error';
  recipients: string[];
  createdBy: string;
}

interface ScheduleConfig {
  name: string;
  reportId: string;
  reportType: string;
  frequency: string;
  dayOfWeek: string;
  dayOfMonth: string;
  time: string;
  recipients: string;
  format: string;
  includeCharts: boolean;
  notifyOnFailure: boolean;
}

const defaultSchedules: ScheduledReport[] = [
  { id: 1, name: 'تقرير المبيعات اليومي', nameEn: 'Daily Sales Report', reportType: 'pdf', frequency: 'daily', nextRun: '2026-03-06 08:00', lastRun: '2026-03-05 08:00', status: 'active', recipients: ['admin@rasid.sa', 'sales@rasid.sa'], createdBy: 'أحمد محمد' },
  { id: 2, name: 'ملخص الأداء الأسبوعي', nameEn: 'Weekly Performance Summary', reportType: 'excel', frequency: 'weekly', nextRun: '2026-03-08 09:00', lastRun: '2026-03-01 09:00', status: 'active', recipients: ['manager@rasid.sa'], createdBy: 'فاطمة أحمد' },
  { id: 3, name: 'تقرير المخزون الشهري', nameEn: 'Monthly Inventory Report', reportType: 'email', frequency: 'monthly', nextRun: '2026-04-01 07:00', lastRun: '2026-03-01 07:00', status: 'active', recipients: ['inventory@rasid.sa', 'ops@rasid.sa'], createdBy: 'خالد سعيد' },
  { id: 4, name: 'لوحة المؤشرات الربعية', nameEn: 'Quarterly KPI Dashboard', reportType: 'dashboard', frequency: 'quarterly', nextRun: '2026-04-01 06:00', lastRun: '2026-01-01 06:00', status: 'paused', recipients: ['ceo@rasid.sa'], createdBy: 'سارة علي' },
  { id: 5, name: 'تقرير الحوكمة', nameEn: 'Governance Report', reportType: 'pdf', frequency: 'weekly', nextRun: '--', lastRun: 'فشل في الإرسال', status: 'error', recipients: ['compliance@rasid.sa'], createdBy: 'محمد عبدالله' },
];

const frequencyLabels: Record<string, string> = {
  daily: 'يومي',
  weekly: 'أسبوعي',
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
};

const reportTypeIcons: Record<string, typeof FileText> = {
  dashboard: Settings2,
  pdf: FileText,
  excel: FileText,
  email: Mail,
};

const statusConfig: Record<string, { color: string; label: string }> = {
  active: { color: 'bg-green-100 text-green-700', label: 'نشط' },
  paused: { color: 'bg-yellow-100 text-yellow-700', label: 'متوقف' },
  error: { color: 'bg-red-100 text-red-700', label: 'خطأ' },
};

export default function ReportsSchedulePage() {
  const [schedules, setSchedules] = useState<ScheduledReport[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [config, setConfig] = useState<ScheduleConfig>({
    name: '',
    reportId: '',
    reportType: 'pdf',
    frequency: 'daily',
    dayOfWeek: '0',
    dayOfMonth: '1',
    time: '08:00',
    recipients: '',
    format: 'pdf',
    includeCharts: true,
    notifyOnFailure: true,
  });

  const fetchSchedules = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/reports/schedules`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
      setSchedules(res.data?.results ?? defaultSchedules);
    } catch {
      setSchedules(defaultSchedules);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const recipientList = config.recipients.split(',').map(r => r.trim()).filter(Boolean);
    try {
      await axios.post(`${API_URL}/api/reports/schedules`, { ...config, recipients: recipientList }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
      fetchSchedules();
    } catch {
      const newSchedule: ScheduledReport = {
        id: Date.now(),
        name: config.name,
        nameEn: config.name,
        reportType: config.reportType as ScheduledReport['reportType'],
        frequency: config.frequency as ScheduledReport['frequency'],
        nextRun: 'قيد الحساب',
        lastRun: '--',
        status: 'active',
        recipients: recipientList,
        createdBy: 'المستخدم الحالي',
      };
      setSchedules(prev => [newSchedule, ...prev]);
    }
    setShowCreateModal(false);
    setConfig({ name: '', reportId: '', reportType: 'pdf', frequency: 'daily', dayOfWeek: '0', dayOfMonth: '1', time: '08:00', recipients: '', format: 'pdf', includeCharts: true, notifyOnFailure: true });
  };

  const handleToggleStatus = async (id: number) => {
    setSchedules(prev => prev.map(s => {
      if (s.id !== id) return s;
      return { ...s, status: s.status === 'active' ? 'paused' as const : 'active' as const };
    }));
    try {
      await axios.patch(`${API_URL}/api/reports/schedules/${id}/toggle`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
    } catch { /* optimistic update */ }
  };

  const handleDeleteSchedule = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/api/reports/schedules/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
    } catch { /* continue */ }
    setSchedules(prev => prev.filter(s => s.id !== id));
  };

  const handleRunNow = async (id: number) => {
    try {
      await axios.post(`${API_URL}/api/reports/schedules/${id}/run`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, lastRun: 'الآن' } : s));
    } catch { /* silent */ }
  };

  const filtered = schedules.filter(s => {
    const matchesSearch = s.name.includes(searchQuery) || s.nameEn.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || s.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/reporting" className="hover:text-blue-600">التقارير</Link>
            <span>/</span>
            <span>الجدولة</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">جدولة التقارير</h1>
          <p className="text-gray-500">Scheduled Reports Management</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition">
          <Plus className="h-4 w-4" />
          جدولة تقرير جديد
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'تقارير مجدولة', value: schedules.length, icon: CalendarClock, color: 'text-blue-600' },
          { label: 'نشطة', value: schedules.filter(s => s.status === 'active').length, icon: CheckCircle, color: 'text-green-600' },
          { label: 'متوقفة', value: schedules.filter(s => s.status === 'paused').length, icon: Clock, color: 'text-yellow-600' },
          { label: 'أخطاء', value: schedules.filter(s => s.status === 'error').length, icon: AlertTriangle, color: 'text-red-600' },
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
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="البحث في التقارير المجدولة..." className="w-full rounded-lg border border-gray-300 py-2 pr-10 pl-4 rtl:pr-10 rtl:pl-4 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="rounded-lg border border-gray-300 py-2 px-3 text-sm">
          <option value="all">جميع الحالات</option>
          <option value="active">نشط</option>
          <option value="paused">متوقف</option>
          <option value="error">خطأ</option>
        </select>
        <button onClick={fetchSchedules} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition">
          <RefreshCw className="h-4 w-4" />
          تحديث
        </button>
      </div>

      {/* Schedules List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(schedule => {
            const TypeIcon = reportTypeIcons[schedule.reportType] || FileText;
            return (
              <div key={schedule.id} className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="rounded-lg bg-blue-50 p-2.5">
                      <TypeIcon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-gray-900">{schedule.name}</h3>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig[schedule.status].color}`}>
                          {statusConfig[schedule.status].label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">{schedule.nameEn}</p>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {frequencyLabels[schedule.frequency]}
                        </span>
                        <span>التشغيل التالي: <strong className="text-gray-700">{schedule.nextRun}</strong></span>
                        <span>آخر تشغيل: {schedule.lastRun}</span>
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          {schedule.recipients.length} مستلم
                        </span>
                        <span>بواسطة: {schedule.createdBy}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleRunNow(schedule.id)} className="rounded p-1.5 hover:bg-blue-50 text-blue-600 transition" title="تشغيل الآن"><Play className="h-4 w-4" /></button>
                    <button onClick={() => handleToggleStatus(schedule.id)} className="rounded p-1.5 hover:bg-yellow-50 text-yellow-600 transition" title={schedule.status === 'active' ? 'إيقاف' : 'تفعيل'}>
                      {schedule.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button className="rounded p-1.5 hover:bg-gray-100 text-gray-500 transition" title="تعديل"><Edit className="h-4 w-4" /></button>
                    <button onClick={() => handleDeleteSchedule(schedule.id)} className="rounded p-1.5 hover:bg-red-50 text-red-500 transition" title="حذف"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200">
              <CalendarClock className="mx-auto h-10 w-10 mb-2" />
              <p>لا توجد تقارير مجدولة</p>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">جدولة تقرير جديد</h2>
            <form onSubmit={handleCreateSchedule} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم الجدولة</label>
                <input type="text" value={config.name} onChange={e => setConfig(prev => ({ ...prev, name: e.target.value }))} placeholder="مثال: تقرير المبيعات اليومي" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">نوع التقرير</label>
                  <select value={config.reportType} onChange={e => setConfig(prev => ({ ...prev, reportType: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    <option value="pdf">PDF</option>
                    <option value="excel">Excel</option>
                    <option value="email">بريد إلكتروني</option>
                    <option value="dashboard">لوحة معلومات</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">التكرار</label>
                  <select value={config.frequency} onChange={e => setConfig(prev => ({ ...prev, frequency: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    <option value="daily">يومي</option>
                    <option value="weekly">أسبوعي</option>
                    <option value="monthly">شهري</option>
                    <option value="quarterly">ربع سنوي</option>
                  </select>
                </div>
              </div>
              {config.frequency === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">يوم الأسبوع</label>
                  <select value={config.dayOfWeek} onChange={e => setConfig(prev => ({ ...prev, dayOfWeek: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    <option value="0">الأحد</option>
                    <option value="1">الإثنين</option>
                    <option value="2">الثلاثاء</option>
                    <option value="3">الأربعاء</option>
                    <option value="4">الخميس</option>
                    <option value="5">الجمعة</option>
                    <option value="6">السبت</option>
                  </select>
                </div>
              )}
              {(config.frequency === 'monthly' || config.frequency === 'quarterly') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">يوم الشهر</label>
                  <input type="number" min={1} max={28} value={config.dayOfMonth} onChange={e => setConfig(prev => ({ ...prev, dayOfMonth: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">وقت التشغيل</label>
                <input type="time" value={config.time} onChange={e => setConfig(prev => ({ ...prev, time: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المستلمون (مفصولين بفواصل)</label>
                <input type="text" value={config.recipients} onChange={e => setConfig(prev => ({ ...prev, recipients: e.target.value }))} placeholder="email1@example.com, email2@example.com" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={config.includeCharts} onChange={e => setConfig(prev => ({ ...prev, includeCharts: e.target.checked }))} className="rounded border-gray-300" />
                  تضمين الرسوم البيانية
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={config.notifyOnFailure} onChange={e => setConfig(prev => ({ ...prev, notifyOnFailure: e.target.checked }))} className="rounded border-gray-300" />
                  إشعار عند الفشل
                </label>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 transition">إلغاء</button>
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 transition">إنشاء الجدولة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
