'use client';

import { useState } from 'react';
import { AlignRight, AlignLeft, Layout, Monitor, Smartphone, Tablet, ToggleLeft, ToggleRight, Save, Eye, RotateCcw } from 'lucide-react';

const rtlSettings = [
  { id: 'text-direction', name: 'اتجاه النص', nameEn: 'Text Direction', desc: 'تطبيق RTL على جميع عناصر النص', enabled: true },
  { id: 'mirror-layout', name: 'عكس التخطيط', nameEn: 'Mirror Layout', desc: 'عكس ترتيب العناصر من اليمين لليسار', enabled: true },
  { id: 'mirror-icons', name: 'عكس الأيقونات', nameEn: 'Mirror Icons', desc: 'عكس الأيقونات الاتجاهية (أسهم، إشارات)', enabled: true },
  { id: 'mirror-charts', name: 'عكس الرسوم البيانية', nameEn: 'Mirror Charts', desc: 'عكس محاور الرسوم البيانية', enabled: false },
  { id: 'number-format', name: 'تنسيق الأرقام', nameEn: 'Number Format', desc: 'استخدام الأرقام العربية أو الهندية', enabled: true },
  { id: 'calendar', name: 'التقويم', nameEn: 'Calendar System', desc: 'دعم التقويم الهجري والميلادي', enabled: true },
  { id: 'bidi-support', name: 'دعم ثنائي الاتجاه', nameEn: 'BiDi Support', desc: 'دعم النصوص ثنائية الاتجاه (عربي + إنجليزي)', enabled: true },
];

export default function RTLLayoutPage() {
  const [settings, setSettings] = useState(rtlSettings);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewDir, setPreviewDir] = useState<'rtl' | 'ltr'>('rtl');

  const toggleSetting = (id: string) => {
    setSettings(settings.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const enabledCount = settings.filter(s => s.enabled).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">محرك تخطيط RTL</h1>
          <p className="text-gray-500">RTL Layout Engine - Right-to-left layout management</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-white hover:bg-teal-700">
          <Save className="h-4 w-4" />
          حفظ الإعدادات
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">{enabledCount}</p>
          <p className="text-sm text-gray-500">إعدادات مفعلة</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">{settings.length}</p>
          <p className="text-sm text-gray-500">إجمالي الإعدادات</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">RTL</p>
          <p className="text-sm text-gray-500">الاتجاه الحالي</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow text-center">
          <p className="text-3xl font-bold text-teal-600">BiDi</p>
          <p className="text-sm text-gray-500">ثنائي الاتجاه</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Settings */}
        <div className="rounded-xl bg-white shadow p-6">
          <h2 className="text-lg font-semibold mb-4">إعدادات RTL - RTL Settings</h2>
          <div className="space-y-3">
            {settings.map((s) => (
              <div key={s.id} className={`flex items-center justify-between rounded-lg border p-3 transition ${s.enabled ? 'border-teal-200 bg-teal-50/30' : 'border-gray-200'}`}>
                <div>
                  <p className="font-medium text-sm">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.nameEn}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                </div>
                <button onClick={() => toggleSetting(s.id)} className="shrink-0 ms-3">
                  {s.enabled
                    ? <ToggleRight className="h-7 w-7 text-teal-600" />
                    : <ToggleLeft className="h-7 w-7 text-gray-400" />
                  }
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-xl bg-white shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">معاينة - Preview</h2>
            <div className="flex gap-2">
              <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
                {[
                  { id: 'desktop' as const, icon: Monitor },
                  { id: 'tablet' as const, icon: Tablet },
                  { id: 'mobile' as const, icon: Smartphone },
                ].map((d) => {
                  const Icon = d.icon;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setPreviewDevice(d.id)}
                      className={`rounded-md p-1.5 ${previewDevice === d.id ? 'bg-white shadow' : ''}`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPreviewDir(previewDir === 'rtl' ? 'ltr' : 'rtl')}
                className="flex items-center gap-1 rounded-lg bg-teal-50 px-2 py-1 text-xs text-teal-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {previewDir === 'rtl' ? 'RTL' : 'LTR'}
              </button>
            </div>
          </div>
          <div
            dir={previewDir}
            className={`rounded-lg border-2 border-gray-200 bg-gray-50 p-4 ${previewDevice === 'mobile' ? 'max-w-xs mx-auto' : previewDevice === 'tablet' ? 'max-w-md mx-auto' : ''}`}
          >
            <div className="rounded bg-teal-600 p-3 text-white mb-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">شريط التنقل</span>
                <div className="flex gap-2">
                  <div className="h-3 w-8 rounded bg-teal-400" />
                  <div className="h-3 w-8 rounded bg-teal-400" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded bg-white p-2 shadow-sm text-center">
                <div className="h-4 w-4 rounded bg-teal-200 mx-auto mb-1" />
                <div className="h-2 w-full rounded bg-gray-200" />
              </div>
              <div className="rounded bg-white p-2 shadow-sm text-center">
                <div className="h-4 w-4 rounded bg-teal-200 mx-auto mb-1" />
                <div className="h-2 w-full rounded bg-gray-200" />
              </div>
              <div className="rounded bg-white p-2 shadow-sm text-center">
                <div className="h-4 w-4 rounded bg-teal-200 mx-auto mb-1" />
                <div className="h-2 w-full rounded bg-gray-200" />
              </div>
            </div>
            <div className="rounded bg-white p-3 shadow-sm">
              <div className="h-2 w-3/4 rounded bg-gray-200 mb-2" />
              <div className="h-2 w-full rounded bg-gray-100 mb-1" />
              <div className="h-2 w-5/6 rounded bg-gray-100" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
