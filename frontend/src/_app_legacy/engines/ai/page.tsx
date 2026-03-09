'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { fetchChatSessions, fetchKnowledgeBases } from '@/lib/api/ai';

const engineModules = [
  { title: 'فهم الملفات', titleEn: 'File Understanding', desc: 'تحليل الملفات بالذكاء الاصطناعي', href: '/engines/ai/file-understanding' },
  { title: 'استعلام حر', titleEn: 'Free Query', desc: 'أسئلة حرة عن البيانات', href: '/engines/ai/free-query' },
  { title: 'مستويات التحليل', titleEn: 'Analysis Levels', desc: 'أساسي، متوسط، متقدم', href: '/engines/ai/analysis-levels' },
  { title: 'أدوار الذكاء', titleEn: 'AI Roles', desc: 'محلل، مدقق، مستشار', href: '/engines/ai/ai-roles' },
  { title: 'مؤشرات متقدمة', titleEn: 'Advanced KPIs', desc: 'مؤشرات أداء بالذكاء الاصطناعي', href: '/engines/ai/kpi-advanced' },
  { title: 'تحرير ذكي', titleEn: 'AI Editing', desc: 'اقتراحات تحرير ذكية', href: '/engines/ai/ai-editing' },
];

export default function AIEngineDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'recent'>('overview');

  const { data: sessionsData, isLoading: loadingSessions } = useQuery({
    queryKey: ['ai-sessions-overview'],
    queryFn: () => fetchChatSessions({ page: 1, limit: 10 }),
  });

  const { data: kbData, isLoading: loadingKB } = useQuery({
    queryKey: ['ai-kb-overview'],
    queryFn: () => fetchKnowledgeBases({ page: 1, limit: 100 }),
  });

  const isLoading = loadingSessions || loadingKB;
  const sessions = sessionsData?.data ?? [];
  const totalSessions = sessionsData?.total ?? 0;
  const knowledgeBases = kbData?.data ?? [];
  const totalKBs = kbData?.total ?? 0;
  const totalMessages = sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">محرك الذكاء الاصطناعي</h1>
          <p className="text-gray-500">AI Engine Dashboard</p>
        </div>
        <Link href="/ai/chat" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + جلسة جديدة
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'الجلسات', labelEn: 'Sessions', value: isLoading ? null : totalSessions, color: 'bg-blue-50 text-blue-700' },
          { label: 'الرسائل', labelEn: 'Messages', value: isLoading ? null : totalMessages, color: 'bg-green-50 text-green-700' },
          { label: 'قواعد المعرفة', labelEn: 'Knowledge Bases', value: isLoading ? null : totalKBs, color: 'bg-purple-50 text-purple-700' },
          { label: 'الحالة', labelEn: 'Status', value: 'نشط', color: 'bg-amber-50 text-amber-700' },
        ].map((stat, i) => (
          <div key={i} className={`${stat.color} rounded-xl p-4`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium">{stat.label}</p>
                <p className="text-xs opacity-70">{stat.labelEn}</p>
              </div>
            </div>
            {stat.value === null ? (
              <Loader2 className="mt-2 h-6 w-6 animate-spin opacity-50" />
            ) : (
              <p className="text-3xl font-bold mt-2">{stat.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-medium border-b-2 transition ${activeTab === 'overview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
        >
          نظرة عامة
        </button>
        <button
          onClick={() => setActiveTab('recent')}
          className={`px-4 py-2 font-medium border-b-2 transition ${activeTab === 'recent' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
        >
          الجلسات الأخيرة
        </button>
      </div>

      {/* Engine Cards */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {engineModules.map((engine, i) => (
            <Link
              key={i}
              href={engine.href}
              className="bg-white rounded-xl shadow hover:shadow-lg transition p-6 border border-gray-100"
            >
              <h3 className="font-bold text-gray-900">{engine.title}</h3>
              <p className="text-sm text-gray-400">{engine.titleEn}</p>
              <p className="text-sm text-gray-500 mt-2">{engine.desc}</p>
            </Link>
          ))}
        </div>
      )}

      {activeTab === 'recent' && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="font-bold mb-4">الجلسات الأخيرة / Recent Sessions</h3>
          {loadingSessions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">لا توجد جلسات بعد.</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <div className="flex-1">
                    <p className="text-sm">{session.title}</p>
                    <p className="text-xs text-gray-400">{session.messageCount} رسالة</p>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(session.updatedAt).toLocaleDateString('ar-SA')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
