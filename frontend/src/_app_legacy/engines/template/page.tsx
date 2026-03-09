'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { fetchTemplates, fetchTemplateCategories } from '@/lib/api/template';

export default function TemplateDashboard() {
  const { data: templatesData, isLoading: loadingTemplates } = useQuery({
    queryKey: ['templates-overview'],
    queryFn: () => fetchTemplates({ page: 1, limit: 100 }),
  });

  const { data: categories, isLoading: loadingCategories } = useQuery({
    queryKey: ['template-categories-overview'],
    queryFn: () => fetchTemplateCategories(),
  });

  const isLoading = loadingTemplates || loadingCategories;
  const templates = templatesData?.data ?? [];
  const totalTemplates = templatesData?.total ?? 0;
  const cats = categories ?? [];
  const totalUsage = templates.reduce((sum, t) => sum + (t.usageCount || 0), 0);
  const mostUsed = templates.length > 0
    ? [...templates].sort((a, b) => b.usageCount - a.usageCount)[0]
    : null;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">محرك القوالب</h1>
          <p className="text-gray-500">Template Engine Dashboard</p>
        </div>
        <Link href="/templates/create" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + إنشاء قالب
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي القوالب', value: isLoading ? null : totalTemplates, color: 'bg-blue-50 text-blue-700' },
          { label: 'الأكثر استخداماً', value: isLoading ? null : (mostUsed?.nameAr || mostUsed?.name || '—'), color: 'bg-green-50 text-green-700' },
          { label: 'التصنيفات', value: isLoading ? null : cats.length, color: 'bg-purple-50 text-purple-700' },
          { label: 'إجمالي الاستخدامات', value: isLoading ? null : totalUsage, color: 'bg-amber-50 text-amber-700' },
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

      {/* Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <div className="col-span-4 flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : cats.length === 0 ? (
          <div className="col-span-4 text-center text-sm text-gray-400 py-8">لا توجد تصنيفات بعد.</div>
        ) : (
          cats.map((cat) => (
            <div key={cat.id} className="bg-white rounded-xl shadow border border-gray-100 p-5 hover:shadow-lg transition cursor-pointer">
              <h3 className="font-bold mt-1">{cat.nameAr || cat.name}</h3>
              <p className="text-sm text-gray-400">{cat.name}</p>
              <p className="text-xs text-blue-600 mt-2">{cat.count} قالب</p>
            </div>
          ))
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/templates" className="bg-gradient-to-l from-purple-50 to-blue-50 rounded-xl p-6 border border-purple-100 hover:shadow-lg transition">
          <h3 className="font-bold text-lg">معرض القوالب</h3>
          <p className="text-sm text-gray-400">Template Gallery</p>
          <p className="text-sm text-gray-600 mt-2">استعراض وتخصيص وتطبيق القوالب المتاحة</p>
          <span className="text-blue-600 text-sm mt-3 inline-block">استعراض ←</span>
        </Link>
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <h3 className="font-bold text-lg mb-4">القوالب الأخيرة / Recent Templates</h3>
          {loadingTemplates ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">لا توجد قوالب بعد.</p>
          ) : (
            <div className="space-y-3">
              {templates.slice(0, 3).map((tmpl) => (
                <div key={tmpl.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{tmpl.nameAr || tmpl.name}</p>
                    <p className="text-xs text-gray-400">{tmpl.categoryAr || tmpl.category}</p>
                  </div>
                  <span className="text-xs text-gray-400">{tmpl.usageCount} استخدام</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
