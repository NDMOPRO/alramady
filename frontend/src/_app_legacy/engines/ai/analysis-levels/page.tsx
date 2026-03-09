'use client';
import { useState } from 'react';

interface AnalysisLevel {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  features: string[];
  color: string;
  bgColor: string;
  usage: number;
  maxUsage: number;
}

const levels: AnalysisLevel[] = [
  {
    id: 'basic',
    title: 'تحليل أساسي',
    titleEn: 'Basic Analysis',
    description: 'تحليل سريع للبيانات الأساسية مع ملخصات بسيطة ورسوم بيانية أولية',
    features: ['ملخص البيانات', 'رسوم بيانية أساسية', 'تصدير PDF', 'تصفية بسيطة'],
    color: 'text-green-700',
    bgColor: 'bg-green-50 border-green-200',
    usage: 450,
    maxUsage: 1000,
  },
  {
    id: 'intermediate',
    title: 'تحليل متوسط',
    titleEn: 'Intermediate Analysis',
    description: 'تحليل متعمق مع مقارنات واكتشاف الأنماط والتنبؤات الأولية',
    features: ['تحليل الاتجاهات', 'اكتشاف الأنماط', 'مقارنات متقدمة', 'تنبؤات أولية', 'تقارير تفصيلية'],
    color: 'text-blue-700',
    bgColor: 'bg-blue-50 border-blue-200',
    usage: 280,
    maxUsage: 500,
  },
  {
    id: 'advanced',
    title: 'تحليل متقدم',
    titleEn: 'Advanced Analysis',
    description: 'تحليل شامل بالذكاء الاصطناعي مع تنبؤات دقيقة وتوصيات استراتيجية',
    features: ['تعلم آلي', 'تنبؤات متقدمة', 'توصيات ذكية', 'تحليل المخاطر', 'محاكاة سيناريوهات', 'تقارير تنفيذية'],
    color: 'text-purple-700',
    bgColor: 'bg-purple-50 border-purple-200',
    usage: 120,
    maxUsage: 200,
  },
];

export default function AnalysisLevelsPage() {
  const [selectedLevel, setSelectedLevel] = useState<string>('intermediate');

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مستويات التحليل</h1>
          <p className="text-gray-500">Analysis Levels - Choose Your Depth</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          بدء تحليل جديد
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي التحليلات', value: 850, color: 'bg-blue-50 text-blue-700' },
          { label: 'تحليلات اليوم', value: 34, color: 'bg-green-50 text-green-700' },
          { label: 'المستوى الأكثر استخداماً', value: 'أساسي', color: 'bg-amber-50 text-amber-700' },
          { label: 'متوسط الدقة', value: '94%', color: 'bg-purple-50 text-purple-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Level Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {levels.map((level) => (
          <div
            key={level.id}
            onClick={() => setSelectedLevel(level.id)}
            className={`rounded-xl border-2 p-6 cursor-pointer transition-all ${
              selectedLevel === level.id ? level.bgColor + ' shadow-lg scale-[1.02]' : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className={`text-lg font-bold ${selectedLevel === level.id ? level.color : 'text-gray-900'}`}>
                  {level.title}
                </h3>
                <p className="text-sm text-gray-400">{level.titleEn}</p>
              </div>
              {selectedLevel === level.id && (
                <span className={`text-xs px-2 py-1 rounded-full ${level.bgColor} ${level.color}`}>مُختار</span>
              )}
            </div>
            <p className="text-sm text-gray-600 mb-4">{level.description}</p>

            {/* Usage Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>الاستخدام</span>
                <span>{level.usage} / {level.maxUsage}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${level.id === 'basic' ? 'bg-green-500' : level.id === 'intermediate' ? 'bg-blue-500' : 'bg-purple-500'}`}
                  style={{ width: `${(level.usage / level.maxUsage) * 100}%` }}
                />
              </div>
            </div>

            {/* Features */}
            <ul className="space-y-1">
              {level.features.map((feature, j) => (
                <li key={j} className="text-sm text-gray-600 flex items-center gap-2">
                  <span className="text-green-500">&#10003;</span>
                  {feature}
                </li>
              ))}
            </ul>

            <button className={`w-full mt-4 py-2 rounded-lg text-sm font-medium transition ${
              selectedLevel === level.id
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>
              {selectedLevel === level.id ? 'ابدأ التحليل' : 'اختر هذا المستوى'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
