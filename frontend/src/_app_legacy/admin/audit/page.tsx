'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';
import {
  Shield, Search, RefreshCw, Download, Filter, Eye,
  Clock, User, Activity, AlertTriangle, CheckCircle,
  LogIn, LogOut, Edit, Trash2, Plus, Lock, Unlock, FileText,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:80';

interface AuditLogEntry {
  id: number;
  timestamp: string;
  user: string;
  userRole: string;
  action: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'export' | 'permission_change' | 'view';
  resource: string;
  resourceId: string;
  details: string;
  ipAddress: string;
  severity: 'info' | 'warning' | 'critical';
}

interface AuditFilters {
  searchQuery: string;
  actionFilter: string;
  severityFilter: string;
  userFilter: string;
  dateFrom: string;
  dateTo: string;
}

const defaultLogs: AuditLogEntry[] = [
  { id: 1, timestamp: '2026-03-05 17:45:12', user: 'أحمد محمد', userRole: 'مدير النظام', action: 'permission_change', resource: 'المستخدمين', resourceId: 'usr_42', details: 'تغيير صلاحيات المستخدم سارة من محرر إلى مدير', ipAddress: '192.168.1.100', severity: 'critical' },
  { id: 2, timestamp: '2026-03-05 17:30:05', user: 'فاطمة أحمد', userRole: 'محلل بيانات', action: 'export', resource: 'التقارير', resourceId: 'rpt_128', details: 'تصدير تقرير المبيعات الشهري بصيغة PDF', ipAddress: '192.168.1.105', severity: 'info' },
  { id: 3, timestamp: '2026-03-05 17:15:33', user: 'خالد سعيد', userRole: 'مدخل بيانات', action: 'delete', resource: 'البيانات', resourceId: 'tbl_sales_old', details: 'حذف جدول بيانات المبيعات القديم (2,300 سجل)', ipAddress: '192.168.1.110', severity: 'critical' },
  { id: 4, timestamp: '2026-03-05 16:50:20', user: 'سارة علي', userRole: 'مدير', action: 'update', resource: 'الإعدادات', resourceId: 'cfg_smtp', details: 'تحديث إعدادات خادم البريد الإلكتروني', ipAddress: '192.168.1.102', severity: 'warning' },
  { id: 5, timestamp: '2026-03-05 16:30:00', user: 'محمد عبدالله', userRole: 'مطور', action: 'create', resource: 'واجهة API', resourceId: 'api_key_new', details: 'إنشاء مفتاح API جديد للتكامل الخارجي', ipAddress: '192.168.1.120', severity: 'warning' },
  { id: 6, timestamp: '2026-03-05 16:00:11', user: 'أحمد محمد', userRole: 'مدير النظام', action: 'login', resource: 'النظام', resourceId: 'session_891', details: 'تسجيل دخول ناجح - المصادقة الثنائية', ipAddress: '192.168.1.100', severity: 'info' },
  { id: 7, timestamp: '2026-03-05 15:45:30', user: 'زائر مجهول', userRole: 'غير معروف', action: 'login', resource: 'النظام', resourceId: 'session_failed', details: 'محاولة تسجيل دخول فاشلة - كلمة مرور خاطئة (3 محاولات)', ipAddress: '10.0.0.55', severity: 'critical' },
  { id: 8, timestamp: '2026-03-05 15:20:00', user: 'فاطمة أحمد', userRole: 'محلل بيانات', action: 'view', resource: 'لوحة المعلومات', resourceId: 'dash_main', details: 'عرض لوحة معلومات الأداء الرئيسية', ipAddress: '192.168.1.105', severity: 'info' },
];

const actionConfig: Record<string, { icon: typeof Activity; color: string; label: string }> = {
  login: { icon: LogIn, color: 'text-green-600 bg-green-50', label: 'تسجيل دخول' },
  logout: { icon: LogOut, color: 'text-gray-600 bg-gray-50', label: 'تسجيل خروج' },
  create: { icon: Plus, color: 'text-blue-600 bg-blue-50', label: 'إنشاء' },
  update: { icon: Edit, color: 'text-yellow-600 bg-yellow-50', label: 'تحديث' },
  delete: { icon: Trash2, color: 'text-red-600 bg-red-50', label: 'حذف' },
  export: { icon: Download, color: 'text-purple-600 bg-purple-50', label: 'تصدير' },
  permission_change: { icon: Lock, color: 'text-orange-600 bg-orange-50', label: 'تغيير صلاحيات' },
  view: { icon: Eye, color: 'text-indigo-600 bg-indigo-50', label: 'عرض' },
};

const severityConfig: Record<string, { color: string; label: string }> = {
  info: { color: 'bg-blue-100 text-blue-700', label: 'معلومات' },
  warning: { color: 'bg-yellow-100 text-yellow-700', label: 'تحذير' },
  critical: { color: 'bg-red-100 text-red-700', label: 'حرج' },
};

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AuditFilters>({
    searchQuery: '',
    actionFilter: 'all',
    severityFilter: 'all',
    userFilter: '',
    dateFrom: '',
    dateTo: '',
  });

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        ...(filters.actionFilter !== 'all' && { action: filters.actionFilter }),
        ...(filters.severityFilter !== 'all' && { severity: filters.severityFilter }),
        ...(filters.searchQuery && { q: filters.searchQuery }),
        ...(filters.userFilter && { user: filters.userFilter }),
        ...(filters.dateFrom && { from: filters.dateFrom }),
        ...(filters.dateTo && { to: filters.dateTo }),
      });
      const res = await axios.get(`${API_URL}/api/admin/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
      });
      setLogs(res.data?.results ?? defaultLogs);
      setTotalCount(res.data?.total ?? defaultLogs.length);
    } catch {
      setLogs(defaultLogs);
      setTotalCount(defaultLogs.length);
    } finally {
      setIsLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExportLogs = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/audit-logs/export`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rasid_token')}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch { /* export failed */ }
  };

  const filteredLogs = logs.filter(log => {
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      const matchesSearch = log.user.includes(filters.searchQuery) || log.details.includes(filters.searchQuery) || log.resource.includes(filters.searchQuery) || log.ipAddress.includes(q);
      if (!matchesSearch) return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/dashboard" className="hover:text-blue-600">لوحة التحكم</Link>
            <span>/</span>
            <Link href="/admin/audit" className="hover:text-blue-600">الإدارة</Link>
            <span>/</span>
            <span>سجل المراجعة</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">سجل المراجعة والتدقيق</h1>
          <p className="text-gray-500">Audit Log Viewer</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition">
            <Filter className="h-4 w-4" />
            فلترة متقدمة
          </button>
          <button onClick={handleExportLogs} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition">
            <Download className="h-4 w-4" />
            تصدير CSV
          </button>
          <button onClick={fetchLogs} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition">
            <RefreshCw className="h-4 w-4" />
            تحديث
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الأحداث', value: totalCount, icon: Activity, color: 'text-blue-600' },
          { label: 'أحداث حرجة', value: logs.filter(l => l.severity === 'critical').length, icon: AlertTriangle, color: 'text-red-600' },
          { label: 'مستخدمون نشطون', value: new Set(logs.map(l => l.user)).size, icon: User, color: 'text-green-600' },
          { label: 'تسجيلات دخول اليوم', value: logs.filter(l => l.action === 'login').length, icon: LogIn, color: 'text-purple-600' },
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

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 rtl:right-3 ltr:left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={filters.searchQuery} onChange={e => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))} placeholder="البحث في السجل — المستخدم، الحدث، العنوان IP..." className="w-full rounded-lg border border-gray-300 py-2 pr-10 pl-4 rtl:pr-10 rtl:pl-4 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
        </div>
        <select value={filters.actionFilter} onChange={e => setFilters(prev => ({ ...prev, actionFilter: e.target.value }))} className="rounded-lg border border-gray-300 py-2 px-3 text-sm">
          <option value="all">جميع الأحداث</option>
          <option value="login">تسجيل دخول</option>
          <option value="create">إنشاء</option>
          <option value="update">تحديث</option>
          <option value="delete">حذف</option>
          <option value="export">تصدير</option>
          <option value="permission_change">تغيير صلاحيات</option>
        </select>
        <select value={filters.severityFilter} onChange={e => setFilters(prev => ({ ...prev, severityFilter: e.target.value }))} className="rounded-lg border border-gray-300 py-2 px-3 text-sm">
          <option value="all">جميع المستويات</option>
          <option value="info">معلومات</option>
          <option value="warning">تحذير</option>
          <option value="critical">حرج</option>
        </select>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">فلترة متقدمة</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">المستخدم</label>
              <input type="text" value={filters.userFilter} onChange={e => setFilters(prev => ({ ...prev, userFilter: e.target.value }))} placeholder="اسم المستخدم" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">من تاريخ</label>
              <input type="date" value={filters.dateFrom} onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">إلى تاريخ</label>
              <input type="date" value={filters.dateTo} onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Timeline */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map(log => {
            const actionInfo = actionConfig[log.action] || actionConfig.view;
            const ActionIcon = actionInfo.icon;
            const sevInfo = severityConfig[log.severity];
            return (
              <div key={log.id} className={`rounded-xl border bg-white p-4 hover:shadow-sm transition cursor-pointer ${log.severity === 'critical' ? 'border-red-200' : 'border-gray-200'}`} onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}>
                <div className="flex items-start gap-4">
                  <div className={`rounded-lg p-2 ${actionInfo.color}`}>
                    <ActionIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <span className="font-medium text-gray-900">{log.user}</span>
                      <span className="text-xs text-gray-400">({log.userRole})</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sevInfo.color}`}>{sevInfo.label}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{actionInfo.label}</span>
                    </div>
                    <p className="text-sm text-gray-600">{log.details}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {log.timestamp}</span>
                      <span>المورد: {log.resource}</span>
                      <span>IP: {log.ipAddress}</span>
                    </div>
                  </div>
                </div>
                {expandedLogId === log.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-gray-400">معرّف المورد:</span> <code className="bg-gray-100 px-1 rounded">{log.resourceId}</code></div>
                    <div><span className="text-gray-400">نوع الحدث:</span> {log.action}</div>
                    <div><span className="text-gray-400">عنوان IP:</span> {log.ipAddress}</div>
                    <div><span className="text-gray-400">الطابع الزمني:</span> {log.timestamp}</div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredLogs.length === 0 && (
            <div className="py-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200">
              <Shield className="mx-auto h-10 w-10 mb-2" />
              <p>لا توجد أحداث مطابقة للفلتر</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalCount > 50 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 transition">السابق</button>
          <span className="text-sm text-gray-600">صفحة {page} من {Math.ceil(totalCount / 50)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(totalCount / 50)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 transition">التالي</button>
        </div>
      )}
    </div>
  );
}
