'use client';

import { useState } from 'react';
import { Layers, ArrowDown, CheckCircle2, Circle, Clock, Play, Settings, RotateCcw } from 'lucide-react';

const phases = [
  {
    id: 1, name: 'التحليل الهيكلي', nameEn: 'Structural Analysis',
    desc: 'تحليل بنية المستند الأصلي وتحديد العناصر',
    status: 'completed', duration: '2.3s', accuracy: '99%',
    steps: ['قراءة المستند', 'تحديد العناصر', 'بناء خريطة هيكلية']
  },
  {
    id: 2, name: 'استخراج الأنماط', nameEn: 'Style Extraction',
    desc: 'استخراج الأنماط البصرية والتنسيقات',
    status: 'completed', duration: '1.8s', accuracy: '97%',
    steps: ['استخراج الألوان', 'تحليل الخطوط', 'رصد التنسيقات']
  },
  {
    id: 3, name: 'مطابقة المحتوى', nameEn: 'Content Matching',
    desc: 'مطابقة المحتوى النصي والبيانات',
    status: 'running', duration: '3.1s', accuracy: '94%',
    steps: ['مطابقة النصوص', 'مطابقة البيانات', 'التحقق من الدقة']
  },
  {
    id: 4, name: 'إعادة البناء', nameEn: 'Reconstruction',
    desc: 'إعادة بناء المستند المُكرر',
    status: 'pending', duration: '--', accuracy: '--',
    steps: ['تجميع العناصر', 'تطبيق الأنماط', 'ضبط التخطيط']
  },
  {
    id: 5, name: 'التحقق النهائي', nameEn: 'Final Verification',
    desc: 'مقارنة شاملة بين الأصل والنسخة',
    status: 'pending', duration: '--', accuracy: '--',
    steps: ['مقارنة بصرية', 'مقارنة بيانات', 'تقرير الجودة']
  },
];

export default function MatchPhasesPage() {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(3);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'running': return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
      default: return <Circle className="h-5 w-5 text-gray-300" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return { text: 'مكتمل', class: 'bg-green-100 text-green-700' };
      case 'running': return { text: 'قيد التشغيل', class: 'bg-blue-100 text-blue-700' };
      default: return { text: 'معلق', class: 'bg-gray-100 text-gray-500' };
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مراحل المطابقة المتعددة</h1>
          <p className="text-gray-500">Multi-Phase Matching Pipeline - Step-by-step replication</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
            <RotateCcw className="h-4 w-4" /> إعادة تشغيل
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
            <Play className="h-4 w-4" /> بدء المطابقة
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-indigo-600">5</p>
          <p className="text-sm text-gray-500">مراحل</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-green-600">2</p>
          <p className="text-sm text-gray-500">مكتملة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-blue-600">1</p>
          <p className="text-sm text-gray-500">قيد التشغيل</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-indigo-600">7.2s</p>
          <p className="text-sm text-gray-500">الوقت المنقضي</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl bg-white shadow p-4">
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="font-medium">التقدم الإجمالي - Overall Progress</span>
          <span className="text-indigo-600 font-bold">50%</span>
        </div>
        <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: '50%' }} />
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-3">
        {phases.map((phase, index) => {
          const statusInfo = getStatusLabel(phase.status);
          return (
            <div key={phase.id}>
              <button
                onClick={() => setExpandedPhase(expandedPhase === phase.id ? null : phase.id)}
                className="w-full rounded-xl bg-white shadow p-5 text-start hover:shadow-md transition"
              >
                <div className="flex items-center gap-4">
                  {getStatusIcon(phase.status)}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{phase.name}</h3>
                      <span className="text-xs text-gray-400">{phase.nameEn}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${statusInfo.class}`}>{statusInfo.text}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{phase.desc}</p>
                  </div>
                  <div className="text-end shrink-0">
                    <p className="text-sm font-medium">{phase.duration}</p>
                    <p className="text-xs text-gray-400">الدقة: {phase.accuracy}</p>
                  </div>
                </div>
              </button>
              {expandedPhase === phase.id && (
                <div className="ms-10 mt-2 rounded-lg bg-gray-50 p-4 border border-gray-200">
                  <p className="text-sm font-medium mb-2">الخطوات التفصيلية:</p>
                  <div className="space-y-2">
                    {phase.steps.map((step, si) => (
                      <div key={si} className="flex items-center gap-2 text-sm">
                        {phase.status === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : phase.status === 'running' && si === 0 ? (
                          <Clock className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-gray-300" />
                        )}
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {index < phases.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDown className="h-4 w-4 text-gray-300" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
