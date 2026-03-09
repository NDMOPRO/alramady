'use client';

import { useState } from 'react';
import { Target, Settings, Sliders, CheckCircle2, AlertTriangle, Info, Save } from 'lucide-react';

const principles = [
  { id: 'exact', name: 'تطابق تام', nameEn: 'Exact Match', desc: 'مطابقة كل بكسل وقيمة بدقة 100%', accuracy: '100%', speed: 'بطيء' },
  { id: 'structural', name: 'تطابق هيكلي', nameEn: 'Structural Match', desc: 'مطابقة البنية والتخطيط مع تسامح بسيط', accuracy: '95%', speed: 'متوسط' },
  { id: 'semantic', name: 'تطابق دلالي', nameEn: 'Semantic Match', desc: 'مطابقة المعنى والمحتوى مع مرونة في الشكل', accuracy: '85%', speed: 'سريع' },
  { id: 'adaptive', name: 'تطابق تكيُّفي', nameEn: 'Adaptive Match', desc: 'تعلم ذاتي يتكيف مع أنماط المستخدم', accuracy: 'متغير', speed: 'متغير' },
];

const thresholds = [
  { label: 'حد التطابق الأدنى', labelEn: 'Minimum Match Threshold', value: 90, unit: '%' },
  { label: 'تسامح اللون', labelEn: 'Color Tolerance', value: 5, unit: '%' },
  { label: 'تسامح الموضع', labelEn: 'Position Tolerance', value: 2, unit: 'px' },
  { label: 'تسامح الحجم', labelEn: 'Size Tolerance', value: 3, unit: '%' },
];

export default function CorePrinciplePage() {
  const [selectedPrinciple, setSelectedPrinciple] = useState('exact');
  const [thresholdValues, setThresholdValues] = useState([90, 5, 2, 3]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مبدأ المطابقة الأساسي</h1>
          <p className="text-gray-500">Core Matching Principle - Configure replication accuracy</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
          <Save className="h-4 w-4" />
          حفظ الإعدادات
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-indigo-600">4</p>
          <p className="text-sm text-gray-500">مبادئ متاحة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-indigo-600">90%</p>
          <p className="text-sm text-gray-500">حد التطابق</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-green-600">98.5%</p>
          <p className="text-sm text-gray-500">دقة آخر تشغيل</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-indigo-600">تام</p>
          <p className="text-sm text-gray-500">المبدأ الحالي</p>
        </div>
      </div>

      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">اختيار المبدأ - Select Principle</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {principles.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPrinciple(p.id)}
              className={`rounded-xl border-2 p-5 text-start transition ${selectedPrinciple === p.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <Target className={`h-6 w-6 ${selectedPrinciple === p.id ? 'text-indigo-600' : 'text-gray-400'}`} />
                {selectedPrinciple === p.id && <CheckCircle2 className="h-5 w-5 text-indigo-600" />}
              </div>
              <h3 className="font-semibold text-gray-900">{p.name}</h3>
              <p className="text-xs text-gray-400 mb-1">{p.nameEn}</p>
              <p className="text-sm text-gray-500 mb-3">{p.desc}</p>
              <div className="flex gap-4 text-xs">
                <span className="text-gray-500">الدقة: <span className="font-bold text-gray-700">{p.accuracy}</span></span>
                <span className="text-gray-500">السرعة: <span className="font-bold text-gray-700">{p.speed}</span></span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-white shadow p-6">
        <h2 className="text-lg font-semibold mb-4">حدود التسامح - Tolerance Thresholds</h2>
        <div className="space-y-5">
          {thresholds.map((t, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className="text-xs text-gray-400 ms-2">{t.labelEn}</span>
                </div>
                <span className="text-sm font-bold text-indigo-600">{thresholdValues[i]}{t.unit}</span>
              </div>
              <input
                type="range"
                min={0}
                max={t.unit === 'px' ? 20 : 100}
                value={thresholdValues[i]}
                onChange={(e) => {
                  const newValues = [...thresholdValues];
                  newValues[i] = Number(e.target.value);
                  setThresholdValues(newValues);
                }}
                className="w-full"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-yellow-800">تنبيه: تغيير المبدأ الأساسي</p>
          <p className="text-xs text-yellow-700 mt-1">
            تغيير مبدأ المطابقة سيؤثر على جميع عمليات النسخ المستقبلية. تأكد من اختبار الإعدادات الجديدة قبل تطبيقها على الإنتاج.
          </p>
          <p className="text-xs text-yellow-600 mt-1">Changing the core principle affects all future replications. Test new settings before production.</p>
        </div>
      </div>
    </div>
  );
}
