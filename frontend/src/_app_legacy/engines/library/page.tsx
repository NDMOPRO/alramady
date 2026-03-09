'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { fetchAssets, fetchFolders } from '@/lib/api/library';

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

export default function LibraryDashboard() {
  const { data: assetsData, isLoading: loadingAssets } = useQuery({
    queryKey: ['library-assets-overview'],
    queryFn: () => fetchAssets({ page: 1, limit: 100 }),
  });

  const { data: folders, isLoading: loadingFolders } = useQuery({
    queryKey: ['library-folders-overview'],
    queryFn: () => fetchFolders(),
  });

  const isLoading = loadingAssets || loadingFolders;
  const assets = assetsData?.data ?? [];
  const totalAssets = assetsData?.total ?? 0;
  const imageCount = assets.filter(a => a.type === 'image').length;
  const docCount = assets.filter(a => a.type === 'document').length;
  const totalSize = assets.reduce((sum, a) => sum + (a.size || 0), 0);
  const folderCount = folders?.length ?? 0;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">محرك المكتبة</h1>
          <p className="text-gray-500">Library Engine Dashboard</p>
        </div>
        <Link href="/library/upload" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + رفع ملف
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الملفات', value: isLoading ? null : totalAssets, color: 'bg-blue-50 text-blue-700' },
          { label: 'الصور', value: isLoading ? null : imageCount, color: 'bg-green-50 text-green-700' },
          { label: 'المستندات', value: isLoading ? null : docCount, color: 'bg-purple-50 text-purple-700' },
          { label: 'المساحة المستخدمة', value: isLoading ? null : formatSize(totalSize), color: 'bg-amber-50 text-amber-700' },
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

      {/* Quick Access */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/library" className="bg-white rounded-xl shadow hover:shadow-lg transition p-6 border border-gray-100">
          <h3 className="font-bold text-gray-900 text-lg">مكتبة الوسائط</h3>
          <p className="text-sm text-gray-400">Media Library</p>
          <p className="text-sm text-gray-500 mt-2">إدارة الصور والفيديوهات والملفات بعرض شبكي أو قائمة مع البحث والتصنيف</p>
          <span className="text-blue-600 text-sm mt-3 inline-block">استعراض ←</span>
        </Link>
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <h3 className="font-bold text-gray-900 text-lg">التنظيم</h3>
          <p className="text-sm text-gray-400 mb-4">Organization</p>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>المجلدات</span>
                <span className="text-gray-600 font-medium">{folderCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>إجمالي الأصول</span>
                <span className="text-gray-600 font-medium">{totalAssets}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>الحجم الإجمالي</span>
                <span className="text-gray-600 font-medium">{formatSize(totalSize)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Files */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-bold mb-4">الملفات الأخيرة / Recent Files</h3>
        {loadingAssets ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : assets.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">لا توجد ملفات بعد.</p>
        ) : (
          <div className="space-y-2">
            {assets.slice(0, 5).map((file) => (
              <div key={file.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition cursor-pointer">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                  {file.type.slice(0, 3)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-gray-400">{file.type} - {formatSize(file.size)}</p>
                </div>
                <span className="text-xs text-gray-400">{new Date(file.createdAt).toLocaleDateString('ar-SA')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
