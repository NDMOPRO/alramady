'use client';

import { useState } from 'react';
import { Users, MessageSquare, Eye, Edit3, Clock, UserPlus, Shield, Video } from 'lucide-react';

const collaborators = [
  { name: 'أحمد محمد', email: 'ahmed@company.sa', role: 'محرر', status: 'متصل', avatar: 'أ' },
  { name: 'سارة العلي', email: 'sara@company.sa', role: 'مشاهد', status: 'متصل', avatar: 'س' },
  { name: 'خالد الحربي', email: 'khaled@company.sa', role: 'محرر', status: 'غير متصل', avatar: 'خ' },
  { name: 'نورة السعيد', email: 'noura@company.sa', role: 'مالك', status: 'متصل', avatar: 'ن' },
];

const activityLog = [
  { user: 'أحمد محمد', action: 'عدّل الشريحة 3', time: 'منذ 2 دقيقة', type: 'edit' },
  { user: 'سارة العلي', action: 'أضافت تعليقاً على الشريحة 5', time: 'منذ 5 دقائق', type: 'comment' },
  { user: 'نورة السعيد', action: 'غيّرت تصميم القالب', time: 'منذ 15 دقيقة', type: 'edit' },
  { user: 'خالد الحربي', action: 'شاهد العرض', time: 'منذ ساعة', type: 'view' },
];

const comments = [
  { user: 'سارة العلي', slide: 5, text: 'يرجى تحديث البيانات في هذه الشريحة', time: 'منذ 5 دقائق', resolved: false },
  { user: 'أحمد محمد', slide: 3, text: 'تم تعديل الرسم البياني', time: 'منذ 10 دقائق', resolved: true },
  { user: 'نورة السعيد', slide: 1, text: 'العنوان يحتاج إلى تعديل', time: 'منذ 30 دقيقة', resolved: false },
];

export default function CollaborationPage() {
  const [showInvite, setShowInvite] = useState(false);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">التعاون الفوري</h1>
          <p className="text-gray-500">Real-time Collaboration - Work together seamlessly</p>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-white hover:bg-pink-700"
        >
          <UserPlus className="h-4 w-4" />
          دعوة متعاون
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">4</p>
          <p className="text-sm text-gray-500">المتعاونون</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-green-600">3</p>
          <p className="text-sm text-gray-500">متصل الآن</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">3</p>
          <p className="text-sm text-gray-500">تعليقات نشطة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">12</p>
          <p className="text-sm text-gray-500">تعديلات اليوم</p>
        </div>
      </div>

      {showInvite && (
        <div className="rounded-xl bg-white shadow p-6">
          <h2 className="text-lg font-semibold mb-3">دعوة متعاون جديد - Invite Collaborator</h2>
          <div className="flex gap-3">
            <input
              type="email"
              placeholder="أدخل البريد الإلكتروني..."
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="editor">محرر / Editor</option>
              <option value="viewer">مشاهد / Viewer</option>
              <option value="commenter">معلق / Commenter</option>
            </select>
            <button className="rounded-lg bg-pink-600 px-4 py-2 text-sm text-white hover:bg-pink-700">إرسال دعوة</button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Collaborators */}
        <div className="rounded-xl bg-white shadow p-6">
          <h2 className="text-lg font-semibold mb-4">المتعاونون - Collaborators</h2>
          <div className="space-y-3">
            {collaborators.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 text-pink-700 font-bold">
                      {c.avatar}
                    </div>
                    <div className={`absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-white ${c.status === 'متصل' ? 'bg-green-500' : 'bg-gray-400'}`} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.email}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${c.role === 'مالك' ? 'bg-purple-100 text-purple-700' : c.role === 'محرر' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                  {c.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Log */}
        <div className="rounded-xl bg-white shadow p-6">
          <h2 className="text-lg font-semibold mb-4">سجل النشاط - Activity Log</h2>
          <div className="space-y-3">
            {activityLog.map((act, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${act.type === 'edit' ? 'bg-blue-100' : act.type === 'comment' ? 'bg-yellow-100' : 'bg-gray-100'}`}>
                  {act.type === 'edit' ? <Edit3 className="h-4 w-4 text-blue-600" /> : act.type === 'comment' ? <MessageSquare className="h-4 w-4 text-yellow-600" /> : <Eye className="h-4 w-4 text-gray-600" />}
                </div>
                <div>
                  <p className="text-sm"><span className="font-medium">{act.user}</span> {act.action}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Clock className="h-3 w-3" /> {act.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comments */}
      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">التعليقات - Comments</h2>
        <div className="space-y-3">
          {comments.map((c, i) => (
            <div key={i} className={`flex items-start justify-between rounded-lg border p-3 ${c.resolved ? 'bg-gray-50 opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                <MessageSquare className="mt-0.5 h-5 w-5 text-pink-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{c.user} <span className="text-gray-400 font-normal">- شريحة {c.slide}</span></p>
                  <p className="text-sm text-gray-600 mt-0.5">{c.text}</p>
                  <p className="text-xs text-gray-400 mt-1">{c.time}</p>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs shrink-0 ${c.resolved ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                {c.resolved ? 'محلول' : 'مفتوح'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
