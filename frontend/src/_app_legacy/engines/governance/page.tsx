'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { getRoles, getAuditLogs } from '@/lib/api/governance';

const moduleLinks = [
  { title: 'الصلاحيات', titleEn: 'Permissions', href: '/engines/governance/permissions', icon: '🔐' },
  { title: 'العمل الجماعي', titleEn: 'Teamwork', href: '/engines/governance/teamwork', icon: '👥' },
  { title: 'التكامل', titleEn: 'Integration', href: '/engines/governance/integration', icon: '🔗' },
  { title: 'بنقرة واحدة', titleEn: 'One-Click', href: '/engines/governance/one-click', icon: '⚡' },
  { title: 'سجل التدقيق', titleEn: 'Audit Log', href: '/engines/governance/audit', icon: '📋' },
  { title: 'المقارنة', titleEn: 'Compare', href: '/engines/governance/compare', icon: '🔀' },
  { title: 'الإصدارات', titleEn: 'Versions', href: '/engines/governance/versions', icon: '📦' },
  { title: 'مستويات المنتج', titleEn: 'Product Levels', href: '/engines/governance/product-levels', icon: '📊' },
];

export default function GovernanceDashboard() {
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const { data: roles, isLoading: loadingRoles } = useQuery({
    queryKey: ['governance-roles'],
    queryFn: () => getRoles(),
  });

  const { data: auditData, isLoading: loadingAudit } = useQuery({
    queryKey: ['governance-audit-overview'],
    queryFn: () => getAuditLogs({ page: 1, pageSize: 5 }),
  });

  const isLoading = loadingRoles || loadingAudit;
  const roleCount = roles?.length ?? 0;
  const auditLogs = auditData?.data ?? [];
  const totalAuditEvents = auditData?.total ?? 0;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">محرك الحوكمة</h1>
          <p className="text-gray-500">Governance Engine Dashboard</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('grid')} className={`px-3 py-2 rounded-lg text-sm ${view === 'grid' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>شبكة</button>
          <button onClick={() => setView('list')} className={`px-3 py-2 rounded-lg text-sm ${view === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>قائمة</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'الأدوار المحددة', value: isLoading ? null : roleCount, color: 'bg-green-50 text-green-700' },
          { label: 'أحداث التدقيق', value: isLoading ? null : totalAuditEvents, color: 'bg-purple-50 text-purple-700' },
          { label: 'الوحدات', value: 8, color: 'bg-blue-50 text-blue-700' },
          { label: 'الحالة', value: 'نشط', color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            {s.value === null ? (
              <Loader2 className="mt-2 h-6 w-6 animate-spin opacity-50" />
            ) : (
              <p className="text-3xl font-bold mt-1">{s.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Modules */}
      {view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {moduleLinks.map((mod, i) => (
            <Link key={i} href={mod.href} className="bg-white rounded-xl shadow hover:shadow-lg transition p-5 border border-gray-100">
              <div className="text-3xl mb-3">{mod.icon}</div>
              <h3 className="font-bold text-gray-900">{mod.title}</h3>
              <p className="text-sm text-gray-400">{mod.titleEn}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {moduleLinks.map((mod, i) => (
            <Link key={i} href={mod.href} className="flex items-center gap-4 p-4 border-b border-gray-100 hover:bg-gray-50 transition">
              <span className="text-2xl">{mod.icon}</span>
              <div className="flex-1">
                <h3 className="font-bold text-sm">{mod.title}</h3>
                <p className="text-xs text-gray-400">{mod.titleEn}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Recent Activity - from real audit log */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-bold mb-4">النشاط الأخير / Recent Activity</h3>
        {loadingAudit ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : auditLogs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">لا توجد أحداث بعد.</p>
        ) : (
          <div className="space-y-3">
            {auditLogs.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <div className="flex-1">
                  <p className="text-sm">{item.action} - {item.resource}</p>
                  <p className="text-xs text-gray-400">{item.userName}</p>
                </div>
                <span className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleDateString('ar-SA')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
