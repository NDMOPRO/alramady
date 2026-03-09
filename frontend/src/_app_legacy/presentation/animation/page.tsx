'use client';

import { useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Clock, Zap, ArrowDownRight, ArrowUpRight, Repeat, Settings } from 'lucide-react';

const animationTypes = [
  { id: 'fade', name: 'تلاشي', nameEn: 'Fade', category: 'entrance' },
  { id: 'slide-in', name: 'انزلاق للداخل', nameEn: 'Slide In', category: 'entrance' },
  { id: 'zoom', name: 'تكبير', nameEn: 'Zoom', category: 'entrance' },
  { id: 'bounce', name: 'ارتداد', nameEn: 'Bounce', category: 'emphasis' },
  { id: 'pulse', name: 'نبض', nameEn: 'Pulse', category: 'emphasis' },
  { id: 'shake', name: 'اهتزاز', nameEn: 'Shake', category: 'emphasis' },
  { id: 'fade-out', name: 'تلاشي للخارج', nameEn: 'Fade Out', category: 'exit' },
  { id: 'slide-out', name: 'انزلاق للخارج', nameEn: 'Slide Out', category: 'exit' },
];

const transitions = [
  { id: 'none', name: 'بدون', nameEn: 'None' },
  { id: 'fade', name: 'تلاشي', nameEn: 'Fade' },
  { id: 'slide', name: 'انزلاق', nameEn: 'Slide' },
  { id: 'wipe', name: 'مسح', nameEn: 'Wipe' },
  { id: 'morph', name: 'تحول', nameEn: 'Morph' },
];

export default function AnimationPage() {
  const [playing, setPlaying] = useState(false);
  const [selectedTransition, setSelectedTransition] = useState('fade');
  const [duration, setDuration] = useState(0.5);
  const [activeCategory, setActiveCategory] = useState('entrance');

  const categories = [
    { id: 'entrance', label: 'دخول', labelEn: 'Entrance', icon: ArrowDownRight },
    { id: 'emphasis', label: 'تأكيد', labelEn: 'Emphasis', icon: Zap },
    { id: 'exit', label: 'خروج', labelEn: 'Exit', icon: ArrowUpRight },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الرسوم المتحركة والتفاعل</h1>
          <p className="text-gray-500">Animation & Interaction Builder</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-white hover:bg-pink-700">
          <Settings className="h-4 w-4" />
          تطبيق على الكل
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">18</p>
          <p className="text-sm text-gray-500">رسوم متحركة مُطبَّقة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">5</p>
          <p className="text-sm text-gray-500">انتقالات شرائح</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">{duration}s</p>
          <p className="text-sm text-gray-500">المدة الافتراضية</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-pink-600">8</p>
          <p className="text-sm text-gray-500">أنواع متاحة</p>
        </div>
      </div>

      {/* Preview with controls */}
      <div className="rounded-xl bg-white shadow p-6">
        <div className="aspect-video rounded-lg bg-gray-900 mb-4 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <Play className="mx-auto h-16 w-16 mb-2" />
            <p>معاينة الرسوم المتحركة</p>
            <p className="text-sm">Animation Preview</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button className="rounded-full p-2 hover:bg-gray-100"><SkipBack className="h-5 w-5" /></button>
          <button
            onClick={() => setPlaying(!playing)}
            className="rounded-full bg-pink-600 p-3 text-white hover:bg-pink-700"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button className="rounded-full p-2 hover:bg-gray-100"><SkipForward className="h-5 w-5" /></button>
          <div className="ms-4 flex items-center gap-2 text-sm text-gray-500">
            <Clock className="h-4 w-4" />
            <span>00:00 / 00:30</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Animations */}
        <div className="rounded-xl bg-white shadow p-5">
          <h2 className="text-lg font-semibold mb-3">رسوم العناصر - Element Animations</h2>
          <div className="flex gap-2 mb-4">
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm ${activeCategory === cat.id ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'}`}
                >
                  <Icon className="h-4 w-4" /> {cat.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {animationTypes.filter(a => a.category === activeCategory).map((anim) => (
              <button key={anim.id} className="rounded-lg border border-gray-200 p-3 text-start hover:border-pink-300 hover:bg-pink-50 transition">
                <p className="font-medium text-sm">{anim.name}</p>
                <p className="text-xs text-gray-400">{anim.nameEn}</p>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <label className="text-sm font-medium text-gray-700">المدة (ثانية)</label>
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.1}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full mt-1"
            />
            <span className="text-sm text-gray-500">{duration}s</span>
          </div>
        </div>

        {/* Transitions */}
        <div className="rounded-xl bg-white shadow p-5">
          <h2 className="text-lg font-semibold mb-3">انتقالات الشرائح - Slide Transitions</h2>
          <div className="space-y-2">
            {transitions.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTransition(t.id)}
                className={`flex w-full items-center justify-between rounded-lg border-2 p-3 transition ${selectedTransition === t.id ? 'border-pink-500 bg-pink-50' : 'border-gray-200'}`}
              >
                <div>
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.nameEn}</p>
                </div>
                {selectedTransition === t.id && <div className="h-3 w-3 rounded-full bg-pink-500" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
