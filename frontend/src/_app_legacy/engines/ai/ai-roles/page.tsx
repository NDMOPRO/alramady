'use client';
import { useState } from 'react';

interface AIRole {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  icon: string;
  active: boolean;
  tasks: number;
  accuracy: string;
}

const initialRoles: AIRole[] = [
  { id: 'analyst', title: 'محلل بيانات', titleEn: 'Data Analyst', description: 'تحليل البيانات واستخراج الرؤى والأنماط', icon: '📊', active: true, tasks: 234, accuracy: '96%' },
  { id: 'auditor', title: 'مدقق', titleEn: 'Auditor', description: 'التدقيق والتحقق من صحة البيانات والتقارير', icon: '🔍', active: true, tasks: 156, accuracy: '98%' },
  { id: 'advisor', title: 'مستشار', titleEn: 'Advisor', description: 'تقديم توصيات واقتراحات استراتيجية', icon: '💡', active: true, tasks: 89, accuracy: '92%' },
  { id: 'writer', title: 'كاتب محتوى', titleEn: 'Content Writer', description: 'كتابة وتحرير التقارير والمحتوى', icon: '✍️', active: false, tasks: 67, accuracy: '90%' },
  { id: 'translator', title: 'مترجم', titleEn: 'Translator', description: 'ترجمة المحتوى بين العربية والإنجليزية', icon: '🌐', active: false, tasks: 45, accuracy: '94%' },
];

export default function AIRolesPage() {
  const [roles, setRoles] = useState(initialRoles);
  const [selectedRole, setSelectedRole] = useState<string | null>('analyst');

  const toggleRole = (id: string) => {
    setRoles(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  const selected = roles.find(r => r.id === selectedRole);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">أدوار الذكاء الاصطناعي</h1>
          <p className="text-gray-500">AI Roles - Specialized AI Personas</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + إضافة دور جديد
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'الأدوار النشطة', value: roles.filter(r => r.active).length, color: 'bg-green-50 text-green-700' },
          { label: 'إجمالي المهام', value: roles.reduce((a, r) => a + r.tasks, 0), color: 'bg-blue-50 text-blue-700' },
          { label: 'متوسط الدقة', value: '94%', color: 'bg-purple-50 text-purple-700' },
          { label: 'إجمالي الأدوار', value: roles.length, color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Roles Grid + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roles List */}
        <div className="lg:col-span-1 space-y-3">
          {roles.map((role) => (
            <div
              key={role.id}
              onClick={() => setSelectedRole(role.id)}
              className={`bg-white rounded-xl border p-4 cursor-pointer transition ${
                selectedRole === role.id ? 'border-blue-500 shadow-md' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{role.icon}</span>
                  <div>
                    <h3 className="font-bold text-sm">{role.title}</h3>
                    <p className="text-xs text-gray-400">{role.titleEn}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleRole(role.id); }}
                  className={`w-10 h-5 rounded-full transition ${role.active ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow transform transition ${role.active ? '-translate-x-5' : '-translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Role Detail */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow p-6">
          {selected ? (
            <div>
              <div className="flex items-center gap-4 mb-6">
                <span className="text-4xl">{selected.icon}</span>
                <div>
                  <h2 className="text-xl font-bold">{selected.title}</h2>
                  <p className="text-gray-400">{selected.titleEn}</p>
                </div>
                <span className={`mr-auto px-3 py-1 rounded-full text-xs ${selected.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {selected.active ? 'نشط' : 'غير نشط'}
                </span>
              </div>
              <p className="text-gray-600 mb-6">{selected.description}</p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">المهام المنجزة</p>
                  <p className="text-2xl font-bold">{selected.tasks}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">دقة الأداء</p>
                  <p className="text-2xl font-bold">{selected.accuracy}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">تعديل الإعدادات</button>
                <button className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">عرض السجل</button>
                <button className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">اختبار الدور</button>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-12">اختر دوراً لعرض التفاصيل</p>
          )}
        </div>
      </div>
    </div>
  );
}
