'use client';

import { useState } from 'react';
import { Plug, Database, Cloud, FileSpreadsheet, BarChart3, Globe, Check, X, Settings, RefreshCw } from 'lucide-react';

const integrations = [
  { id: 'data-engine', name: 'محرك البيانات', nameEn: 'Data Engine', icon: Database, status: 'connected', color: 'text-blue-600 bg-blue-50', lastSync: '2026-03-04 09:00' },
  { id: 'excel-engine', name: 'محرك إكسل', nameEn: 'Excel Engine', icon: FileSpreadsheet, status: 'connected', color: 'text-green-600 bg-green-50', lastSync: '2026-03-04 08:30' },
  { id: 'dashboard-engine', name: 'محرك لوحة المعلومات', nameEn: 'Dashboard Engine', icon: BarChart3, status: 'connected', color: 'text-purple-600 bg-purple-50', lastSync: '2026-03-03 18:00' },
  { id: 'cloud-storage', name: 'التخزين السحابي', nameEn: 'Cloud Storage', icon: Cloud, status: 'disconnected', color: 'text-gray-600 bg-gray-50', lastSync: 'لم يتصل بعد' },
  { id: 'localization', name: 'محرك التعريب', nameEn: 'Localization Engine', icon: Globe, status: 'connected', color: 'text-teal-600 bg-teal-50', lastSync: '2026-03-04 07:15' },
];

const apiEndpoints = [
  { method: 'GET', path: '/api/presentations', desc: 'جلب قائمة العروض', status: 'active' },
  { method: 'POST', path: '/api/presentations/create', desc: 'إنشاء عرض جديد', status: 'active' },
  { method: 'PUT', path: '/api/presentations/:id', desc: 'تحديث عرض', status: 'active' },
  { method: 'POST', path: '/api/presentations/export', desc: 'تصدير عرض', status: 'active' },
  { method: 'GET', path: '/api/presentations/templates', desc: 'جلب القوالب', status: 'maintenance' },
];

export default function IntegrationPage() {
  const [activeTab, setActiveTab] = useState<'integrations' | 'api'>('integrations');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إعدادات التكامل</h1>
          <p className="text-gray-500">Integration Settings - Connect with other engines and services</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-white hover:bg-pink-700">
          <Plug className="h-4 w-4" />
          إضافة تكامل
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">5</p>
          <p className="text-sm text-gray-500">تكاملات مُعدَّة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-green-600">4</p>
          <p className="text-sm text-gray-500">متصلة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-red-600">1</p>
          <p className="text-sm text-gray-500">غير متصلة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">5</p>
          <p className="text-sm text-gray-500">نقاط API</p>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('integrations')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'integrations' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500'}`}
        >
          التكاملات - Integrations
        </button>
        <button
          onClick={() => setActiveTab('api')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'api' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500'}`}
        >
          API نقاط النهاية
        </button>
      </div>

      {activeTab === 'integrations' ? (
        <div className="space-y-3">
          {integrations.map((intg) => {
            const Icon = intg.icon;
            return (
              <div key={intg.id} className="flex items-center justify-between rounded-xl bg-white p-5 shadow">
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${intg.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold">{intg.name}</p>
                    <p className="text-sm text-gray-400">{intg.nameEn}</p>
                    <p className="text-xs text-gray-400 mt-0.5">آخر مزامنة: {intg.lastSync}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${intg.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {intg.status === 'connected' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {intg.status === 'connected' ? 'متصل' : 'غير متصل'}
                  </span>
                  <button className="rounded-lg p-2 hover:bg-gray-100"><RefreshCw className="h-4 w-4 text-gray-400" /></button>
                  <button className="rounded-lg p-2 hover:bg-gray-100"><Settings className="h-4 w-4 text-gray-400" /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl bg-white shadow p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="pb-2 text-start font-medium">الطريقة</th>
                  <th className="pb-2 text-start font-medium">المسار</th>
                  <th className="pb-2 text-start font-medium">الوصف</th>
                  <th className="pb-2 text-start font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {apiEndpoints.map((ep, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-mono font-bold ${ep.method === 'GET' ? 'bg-green-100 text-green-700' : ep.method === 'POST' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {ep.method}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-xs">{ep.path}</td>
                    <td className="py-3 text-gray-600">{ep.desc}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${ep.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {ep.status === 'active' ? 'نشط' : 'صيانة'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
