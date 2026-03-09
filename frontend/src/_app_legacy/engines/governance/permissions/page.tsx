'use client';
import { useState } from 'react';

interface Role {
  name: string;
  nameEn: string;
  users: number;
  permissions: Record<string, boolean>;
}

const permissionKeys = ['قراءة', 'كتابة', 'تعديل', 'حذف', 'تصدير', 'إدارة'];
const permissionKeysEn = ['Read', 'Write', 'Edit', 'Delete', 'Export', 'Admin'];

const initialRoles: Role[] = [
  { name: 'مدير النظام', nameEn: 'System Admin', users: 3, permissions: { 'قراءة': true, 'كتابة': true, 'تعديل': true, 'حذف': true, 'تصدير': true, 'إدارة': true } },
  { name: 'مدقق', nameEn: 'Auditor', users: 8, permissions: { 'قراءة': true, 'كتابة': true, 'تعديل': true, 'حذف': false, 'تصدير': true, 'إدارة': false } },
  { name: 'محلل', nameEn: 'Analyst', users: 15, permissions: { 'قراءة': true, 'كتابة': true, 'تعديل': false, 'حذف': false, 'تصدير': true, 'إدارة': false } },
  { name: 'مشاهد', nameEn: 'Viewer', users: 22, permissions: { 'قراءة': true, 'كتابة': false, 'تعديل': false, 'حذف': false, 'تصدير': false, 'إدارة': false } },
];

export default function PermissionsPage() {
  const [roles, setRoles] = useState(initialRoles);

  const togglePermission = (roleIdx: number, perm: string) => {
    setRoles(prev => prev.map((r, i) => i === roleIdx ? { ...r, permissions: { ...r.permissions, [perm]: !r.permissions[perm] } } : r));
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مصفوفة الصلاحيات</h1>
          <p className="text-gray-500">RBAC Permissions Matrix</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + إضافة دور
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'الأدوار', value: roles.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'المستخدمون', value: roles.reduce((a, r) => a + r.users, 0), color: 'bg-green-50 text-green-700' },
          { label: 'الصلاحيات', value: permissionKeys.length, color: 'bg-purple-50 text-purple-700' },
          { label: 'آخر تحديث', value: 'اليوم', color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Permissions Matrix */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-right p-4 font-medium text-gray-700 min-w-[200px]">الدور / Role</th>
              <th className="p-4 font-medium text-gray-700 text-center">المستخدمون</th>
              {permissionKeys.map((perm, i) => (
                <th key={perm} className="p-4 font-medium text-gray-700 text-center">
                  <div>{perm}</div>
                  <div className="text-xs text-gray-400 font-normal">{permissionKeysEn[i]}</div>
                </th>
              ))}
              <th className="p-4 font-medium text-gray-700 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role, ri) => (
              <tr key={ri} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="p-4">
                  <div className="font-medium">{role.name}</div>
                  <div className="text-xs text-gray-400">{role.nameEn}</div>
                </td>
                <td className="p-4 text-center">
                  <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">{role.users}</span>
                </td>
                {permissionKeys.map(perm => (
                  <td key={perm} className="p-4 text-center">
                    <button
                      onClick={() => togglePermission(ri, perm)}
                      className={`w-6 h-6 rounded border-2 transition ${
                        role.permissions[perm]
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {role.permissions[perm] && <span className="text-xs">&#10003;</span>}
                    </button>
                  </td>
                ))}
                <td className="p-4 text-center">
                  <button className="text-blue-600 hover:text-blue-700 text-sm">تعديل</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
