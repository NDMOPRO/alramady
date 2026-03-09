'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { fetchConversionHistory, fetchSupportedFormats } from '@/lib/api/conversion';

const moduleLinks = [
  { title: 'التحويل الأساسي', titleEn: 'Core Conversion', href: '/convert', desc: 'تحويل الملفات', icon: '⚙️' },
  { title: 'مصفوفة التحويل', titleEn: 'Conversion Matrix', href: '/engines/conversion/matrix', desc: 'تحويل من تنسيق إلى آخر', icon: '🔀' },
  { title: 'قواعد UDR', titleEn: 'UDR Rules', href: '/engines/conversion/udr', desc: 'قواعد التحويل المخصصة', icon: '📐' },
  { title: 'المحول الشامل', titleEn: 'Universal Converter', href: '/convert', desc: 'تحويل أي تنسيق لأي تنسيق', icon: '🔄' },
];

export default function ConversionDashboard() {
  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ['conversion-history-overview'],
    queryFn: () => fetchConversionHistory({ page: 1, limit: 10 }),
  });

  const { data: formats, isLoading: loadingFormats } = useQuery({
    queryKey: ['supported-formats'],
    queryFn: () => fetchSupportedFormats(),
  });

  const isLoading = loadingHistory || loadingFormats;
  const jobs = historyData?.data ?? [];
  const totalConversions = historyData?.total ?? 0;
  const formatCount = formats?.length ?? 0;
  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const successRate = jobs.length > 0 ? Math.round((completedJobs / jobs.length) * 100) : 0;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">محرك التحويل</h1>
          <p className="text-gray-500">Conversion Engine Dashboard</p>
        </div>
        <Link href="/convert" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + تحويل جديد
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي التحويلات', value: isLoading ? null : totalConversions, color: 'bg-blue-50 text-blue-700' },
          { label: 'التنسيقات المدعومة', value: isLoading ? null : formatCount, color: 'bg-green-50 text-green-700' },
          { label: 'نسبة النجاح', value: isLoading ? null : `${successRate}%`, color: 'bg-purple-50 text-purple-700' },
          { label: 'المكتملة', value: isLoading ? null : completedJobs, color: 'bg-amber-50 text-amber-700' },
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

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {moduleLinks.map((mod, i) => (
          <Link key={i} href={mod.href} className="bg-white rounded-xl shadow hover:shadow-lg transition p-5 border border-gray-100">
            <span className="text-3xl">{mod.icon}</span>
            <h3 className="font-bold mt-3">{mod.title}</h3>
            <p className="text-sm text-gray-400">{mod.titleEn}</p>
            <p className="text-xs text-gray-500 mt-1">{mod.desc}</p>
          </Link>
        ))}
      </div>

      {/* Recent Conversions */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-bold mb-4">التحويلات الأخيرة / Recent Conversions</h3>
        {loadingHistory ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">لا توجد تحويلات بعد.</p>
        ) : (
          <div className="space-y-3">
            {jobs.slice(0, 5).map((conv) => (
              <div key={conv.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded font-mono">{conv.sourceFormat}</span>
                  <span className="text-gray-400">&#8594;</span>
                  <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded font-mono">{conv.targetFormat}</span>
                </div>
                <span className="text-sm flex-1">{conv.sourceFileName}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  conv.status === 'completed' ? 'bg-green-100 text-green-700' :
                  conv.status === 'failed' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {conv.status === 'completed' ? 'مكتمل' : conv.status === 'failed' ? 'فشل' : 'جاري'}
                </span>
                <span className="text-xs text-gray-400">{new Date(conv.createdAt).toLocaleDateString('ar-SA')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
