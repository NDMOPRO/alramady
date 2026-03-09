'use client';
import { useState } from 'react';

interface TeamMember {
  name: string;
  role: string;
  email: string;
  status: 'online' | 'offline' | 'busy';
  avatar: string;
}

const members: TeamMember[] = [
  { name: 'أحمد محمد', role: 'مدير المشروع', email: 'ahmed@rasid.sa', status: 'online', avatar: 'أ' },
  { name: 'سارة علي', role: 'محللة بيانات', email: 'sara@rasid.sa', status: 'online', avatar: 'س' },
  { name: 'محمد خالد', role: 'مدقق', email: 'mohammed@rasid.sa', status: 'busy', avatar: 'م' },
  { name: 'فاطمة أحمد', role: 'كاتبة محتوى', email: 'fatima@rasid.sa', status: 'offline', avatar: 'ف' },
  { name: 'عبدالله سعد', role: 'مطور', email: 'abdullah@rasid.sa', status: 'online', avatar: 'ع' },
];

const statusColors = { online: 'bg-green-500', offline: 'bg-gray-400', busy: 'bg-red-500' };
const statusLabels = { online: 'متصل', offline: 'غير متصل', busy: 'مشغول' };

export default function TeamworkPage() {
  const [search, setSearch] = useState('');
  const filtered = members.filter(m => m.name.includes(search) || m.role.includes(search));

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">العمل الجماعي</h1>
          <p className="text-gray-500">Team Collaboration Settings</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + دعوة عضو
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'أعضاء الفريق', value: members.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'متصلون الآن', value: members.filter(m => m.status === 'online').length, color: 'bg-green-50 text-green-700' },
          { label: 'مهام نشطة', value: 18, color: 'bg-purple-50 text-purple-700' },
          { label: 'الفرق', value: 4, color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="بحث عن عضو... / Search member..."
        className="w-full md:w-96 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
      />

      {/* Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((member, i) => (
          <div key={i} className="bg-white rounded-xl shadow border border-gray-100 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-bold">
                  {member.avatar}
                </div>
                <div className={`absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${statusColors[member.status]}`} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{member.name}</h3>
                <p className="text-sm text-gray-500">{member.role}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">البريد</span>
                <span className="text-gray-600">{member.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">الحالة</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  member.status === 'online' ? 'bg-green-100 text-green-700' :
                  member.status === 'busy' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-500'
                }`}>{statusLabels[member.status]}</span>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="flex-1 border border-gray-300 text-sm py-1.5 rounded-lg hover:bg-gray-50">عرض</button>
              <button className="flex-1 bg-blue-600 text-white text-sm py-1.5 rounded-lg hover:bg-blue-700">رسالة</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
