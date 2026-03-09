'use client';
import { useState } from 'react';

interface AuditEntry {
  id: number;
  action: string;
  actionEn: string;
  user: string;
  engine: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  details: string;
}

const auditLog: AuditEntry[] = [
  { id: 1, action: 'تسجيل دخول', actionEn: 'Login', user: 'أحمد محمد', engine: 'النظام', timestamp: '2025-03-04 09:15', severity: 'info', details: 'تسجيل دخول ناجح من 192.168.1.100' },
  { id: 2, action: 'تعديل صلاحيات', actionEn: 'Modify Permissions', user: 'سارة علي', engine: 'الحوكمة', timestamp: '2025-03-04 09:20', severity: 'warning', details: 'تعديل صلاحيات دور المدقق - إضافة صلاحية الحذف' },
  { id: 3, action: 'حذف ملف', actionEn: 'Delete File', user: 'محمد خالد', engine: 'المكتبة', timestamp: '2025-03-04 09:30', severity: 'critical', details: 'حذف ملف التقرير السنوي 2024' },
  { id: 4, action: 'تصدير بيانات', actionEn: 'Export Data', user: 'فاطمة أحمد', engine: 'التحويل', timestamp: '2025-03-04 10:00', severity: 'info', details: 'تصدير بيانات المبيعات - PDF' },
  { id: 5, action: 'تحديث قالب', actionEn: 'Update Template', user: 'عبدالله سعد', engine: 'القوالب', timestamp: '2025-03-04 10:15', severity: 'info', details: 'تحديث قالب التقرير الرسمي v2' },
  { id: 6, action: 'محاولة وصول مرفوضة', actionEn: 'Access Denied', user: 'مجهول', engine: 'النظام', timestamp: '2025-03-04 10:30', severity: 'critical', details: 'محاولة وصول غير مصرح بها من عنوان خارجي' },
];

const severityConfig = {
  info: { label: 'معلومات', color: 'bg-blue-100 text-blue-700' },
  warning: { label: 'تحذير', color: 'bg-amber-100 text-amber-700' },
  critical: { label: 'حرج', color: 'bg-red-100 text-red-700' },
};

export default function AuditPage() {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = auditLog.filter(entry =>
    (severityFilter === 'all' || entry.severity === severityFilter) &&
    (searchTerm === '' || entry.action.includes(searchTerm) || entry.user.includes(searchTerm) || entry.details.includes(searchTerm))
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">سجل التدقيق</h1>
          <p className="text-gray-500">Audit Log Viewer</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          تصدير السجل
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الأحداث', value: '1,250', color: 'bg-blue-50 text-blue-700' },
          { label: 'أحداث اليوم', value: 87, color: 'bg-green-50 text-green-700' },
          { label: 'تحذيرات', value: 12, color: 'bg-amber-50 text-amber-700' },
          { label: 'أحداث حرجة', value: 3, color: 'bg-red-50 text-red-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <input
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="بحث في السجل... / Search audit log..."
          className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <div className="flex gap-2">
          {[{ key: 'all', label: 'الكل' }, { key: 'info', label: 'معلومات' }, { key: 'warning', label: 'تحذير' }, { key: 'critical', label: 'حرج' }].map(f => (
            <button
              key={f.key}
              onClick={() => setSeverityFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                severityFilter === f.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 text-sm">
              <th className="text-right p-3 font-medium text-gray-600">الوقت</th>
              <th className="text-right p-3 font-medium text-gray-600">الإجراء</th>
              <th className="text-right p-3 font-medium text-gray-600">المستخدم</th>
              <th className="text-right p-3 font-medium text-gray-600">المحرك</th>
              <th className="text-right p-3 font-medium text-gray-600">الأهمية</th>
              <th className="text-right p-3 font-medium text-gray-600">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(entry => (
              <tr key={entry.id} className="border-t border-gray-100 hover:bg-gray-50 text-sm">
                <td className="p-3 text-gray-500 whitespace-nowrap">{entry.timestamp}</td>
                <td className="p-3">
                  <div className="font-medium">{entry.action}</div>
                  <div className="text-xs text-gray-400">{entry.actionEn}</div>
                </td>
                <td className="p-3 text-gray-700">{entry.user}</td>
                <td className="p-3 text-gray-500">{entry.engine}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${severityConfig[entry.severity].color}`}>
                    {severityConfig[entry.severity].label}
                  </span>
                </td>
                <td className="p-3 text-gray-500 max-w-[300px] truncate">{entry.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
