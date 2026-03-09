'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { FileText, Plus, Calendar, Send, Download, Loader2, Clock, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import Tabs, { Tab } from '@/components/ui/Tabs';

const tabs: Tab[] = [
  { id: 'list', label: 'تقاريري', icon: <FileText className="h-4 w-4" /> },
  { id: 'generate', label: 'إنشاء تقرير', icon: <Plus className="h-4 w-4" /> },
  { id: 'schedule', label: 'الجدولة', icon: <Calendar className="h-4 w-4" /> },
  { id: 'distribute', label: 'التوزيع', icon: <Send className="h-4 w-4" /> },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('list');
  const [generateForm, setGenerateForm] = useState({ subject: '', format: 'pdf', period: 'monthly' });

  const { data: reports, isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: () => api.get<{ data: Array<{ id: string; title: string; status: string; format: string; createdAt: string }> }>('/reporting/api/v1/reports'),
  });

  const generateMutation = useMutation({
    mutationFn: (data: typeof generateForm) => api.post('/reporting/api/v1/reports/generate', data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">التقارير</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">إنشاء وإدارة التقارير الاحترافية</p>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'list' && (
        <div className="grid gap-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">العنوان</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">الحالة</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">الصيغة</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">التاريخ</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {(reports?.data || []).map((report) => (
                    <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3 font-medium">{report.title}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                          report.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {report.status === 'COMPLETED' ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {report.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{report.format}</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(report.createdAt).toLocaleDateString('ar-SA')}</td>
                      <td className="px-4 py-3"><button className="text-blue-600 hover:text-blue-800"><Download className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'generate' && (
        <div className="max-w-lg space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">موضوع التقرير</label>
            <input
              value={generateForm.subject}
              onChange={(e) => setGenerateForm({ ...generateForm, subject: e.target.value })}
              placeholder="مثال: تقرير المبيعات الشهري"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الصيغة</label>
              <select
                value={generateForm.format}
                onChange={(e) => setGenerateForm({ ...generateForm, format: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              >
                <option value="pdf">PDF</option>
                <option value="docx">Word</option>
                <option value="xlsx">Excel</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الفترة</label>
              <select
                value={generateForm.period}
                onChange={(e) => setGenerateForm({ ...generateForm, period: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              >
                <option value="daily">يومي</option>
                <option value="weekly">أسبوعي</option>
                <option value="monthly">شهري</option>
                <option value="quarterly">ربع سنوي</option>
                <option value="yearly">سنوي</option>
              </select>
            </div>
          </div>
          <button
            onClick={() => generateMutation.mutate(generateForm)}
            disabled={generateMutation.isPending || !generateForm.subject}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {generateMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء التقرير'}
          </button>
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center text-gray-500">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>جدولة التقارير التلقائية - اختر تقريرا من القائمة ثم حدد موعد التوليد التلقائي</p>
        </div>
      )}

      {activeTab === 'distribute' && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center text-gray-500">
          <Send className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>توزيع التقارير عبر البريد الإلكتروني أو مشاركة رابط مباشر</p>
        </div>
      )}
    </div>
  );
}
