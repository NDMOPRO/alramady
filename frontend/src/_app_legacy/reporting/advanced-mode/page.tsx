'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Code, FileText, Plus, Save, Eye, Download, Trash2,
  Settings, Type, Image, Table, BarChart3, Minus,
  AlignLeft, AlignCenter, AlignRight, Bold, Italic,
  ChevronUp, ChevronDown, Copy, Layers, Filter,
  PieChart, Calendar, Database,
} from 'lucide-react';

type Section = {
  id: number;
  type: 'header' | 'text' | 'table' | 'chart' | 'image' | 'kpi' | 'pagebreak';
  title: string;
  content?: string;
};

export default function AdvancedModeReportingPage() {
  const [sections, setSections] = useState<Section[]>([
    { id: 1, type: 'header', title: 'عنوان التقرير', content: 'التقرير المالي الربعي Q4 2024' },
    { id: 2, type: 'text', title: 'ملخص تنفيذي', content: 'يقدم هذا التقرير تحليلاً شاملاً للأداء المالي...' },
    { id: 3, type: 'kpi', title: 'مؤشرات الأداء الرئيسية' },
    { id: 4, type: 'chart', title: 'الإيرادات الشهرية' },
    { id: 5, type: 'table', title: 'بيانات المبيعات التفصيلية' },
    { id: 6, type: 'text', title: 'التوصيات', content: 'بناءً على التحليل أعلاه، نوصي بـ...' },
  ]);
  const [selectedId, setSelectedId] = useState<number | null>(1);
  const [reportTitle, setReportTitle] = useState('التقرير المالي الربعي');

  const sectionTypes = [
    { type: 'header', label: 'عنوان', icon: Type },
    { type: 'text', label: 'نص', icon: AlignLeft },
    { type: 'table', label: 'جدول', icon: Table },
    { type: 'chart', label: 'رسم بياني', icon: BarChart3 },
    { type: 'image', label: 'صورة', icon: Image },
    { type: 'kpi', label: 'مؤشرات', icon: Layers },
  ];

  const getIcon = (type: string) => {
    const s = sectionTypes.find(st => st.type === type);
    return s?.icon || Type;
  };

  const addSection = (type: string) => {
    const newSection: Section = {
      id: Date.now(),
      type: type as Section['type'],
      title: sectionTypes.find(s => s.type === type)?.label || 'قسم جديد',
    };
    setSections([...sections, newSection]);
  };

  const removeSection = (id: number) => {
    setSections(sections.filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/reporting" className="hover:text-orange-600">محرك التقارير</Link>
            <span>/</span>
            <span>الوضع المتقدم</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">منشئ التقارير المتقدم</h1>
          <p className="text-gray-500">Advanced Report Builder</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <Eye className="h-4 w-4" /> معاينة
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <Download className="h-4 w-4" /> تصدير
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
            <Save className="h-4 w-4" /> حفظ
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-red-600">{sections.length}</p>
          <p className="text-sm text-gray-500">أقسام التقرير</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-blue-600">{sections.filter(s => s.type === 'chart').length}</p>
          <p className="text-sm text-gray-500">رسوم بيانية</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">{sections.filter(s => s.type === 'table').length}</p>
          <p className="text-sm text-gray-500">جداول</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-amber-600">~24</p>
          <p className="text-sm text-gray-500">صفحة تقريبية</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Section Toolbox */}
        <div className="space-y-4">
          <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4">
            <h3 className="mb-3 font-semibold text-gray-900 text-sm">إضافة قسم</h3>
            <div className="grid grid-cols-2 gap-2">
              {sectionTypes.map((st) => {
                const Icon = st.icon;
                return (
                  <button key={st.type} onClick={() => addSection(st.type)}
                    className="flex flex-col items-center gap-1 rounded-lg p-3 border border-gray-100 hover:bg-orange-50 hover:border-orange-200 transition-colors">
                    <Icon className="h-5 w-5 text-orange-500" />
                    <span className="text-xs text-gray-600">{st.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Report Settings */}
          <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4">
            <h3 className="mb-3 font-semibold text-gray-900 text-sm">إعدادات التقرير</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">عنوان التقرير</label>
                <input type="text" value={reportTitle} onChange={(e) => setReportTitle(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">التاريخ</label>
                <input type="date" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">حجم الصفحة</label>
                <select className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                  <option>A4</option>
                  <option>Letter</option>
                  <option>A3</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">الاتجاه</label>
                <select className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                  <option>عمودي (Portrait)</option>
                  <option>أفقي (Landscape)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Report Builder Canvas */}
        <div className="lg:col-span-3">
          <div className="rounded-xl bg-white shadow-sm border border-gray-200 min-h-[600px]">
            {/* Toolbar */}
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2">
              <button className="rounded p-1.5 hover:bg-gray-100"><Bold className="h-4 w-4 text-gray-500" /></button>
              <button className="rounded p-1.5 hover:bg-gray-100"><Italic className="h-4 w-4 text-gray-500" /></button>
              <div className="h-5 w-px bg-gray-200" />
              <button className="rounded p-1.5 hover:bg-gray-100"><AlignRight className="h-4 w-4 text-gray-500" /></button>
              <button className="rounded p-1.5 hover:bg-gray-100"><AlignCenter className="h-4 w-4 text-gray-500" /></button>
              <button className="rounded p-1.5 hover:bg-gray-100"><AlignLeft className="h-4 w-4 text-gray-500" /></button>
              <div className="h-5 w-px bg-gray-200" />
              <select className="rounded border border-gray-300 px-2 py-1 text-xs">
                <option>Arial</option>
                <option>Cairo</option>
                <option>Tahoma</option>
              </select>
              <input type="number" defaultValue={12} className="w-12 rounded border border-gray-300 px-1 py-1 text-xs text-center" />
            </div>

            {/* Sections */}
            <div className="p-4 space-y-3">
              {sections.map((section) => {
                const Icon = getIcon(section.type);
                return (
                  <div key={section.id}
                    onClick={() => setSelectedId(section.id)}
                    className={`rounded-lg border p-4 cursor-pointer transition-all ${
                      selectedId === section.id ? 'border-orange-400 bg-orange-50/30 shadow-sm' : 'border-gray-200 hover:border-orange-200'
                    }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium text-gray-700">{section.title}</span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-400">{section.type}</span>
                      </div>
                      {selectedId === section.id && (
                        <div className="flex items-center gap-1">
                          <button className="rounded p-0.5 hover:bg-gray-100"><ChevronUp className="h-3 w-3 text-gray-400" /></button>
                          <button className="rounded p-0.5 hover:bg-gray-100"><ChevronDown className="h-3 w-3 text-gray-400" /></button>
                          <button className="rounded p-0.5 hover:bg-gray-100"><Copy className="h-3 w-3 text-gray-400" /></button>
                          <button onClick={(e) => { e.stopPropagation(); removeSection(section.id); }} className="rounded p-0.5 hover:bg-red-50"><Trash2 className="h-3 w-3 text-red-400" /></button>
                        </div>
                      )}
                    </div>
                    {section.type === 'header' && (
                      <h2 className="text-xl font-bold text-gray-900">{section.content}</h2>
                    )}
                    {section.type === 'text' && (
                      <p className="text-sm text-gray-600">{section.content}</p>
                    )}
                    {section.type === 'chart' && (
                      <div className="flex items-center justify-center rounded bg-gray-50 py-8">
                        <BarChart3 className="h-10 w-10 text-gray-300" />
                      </div>
                    )}
                    {section.type === 'table' && (
                      <div className="flex items-center justify-center rounded bg-gray-50 py-8">
                        <Table className="h-10 w-10 text-gray-300" />
                      </div>
                    )}
                    {section.type === 'kpi' && (
                      <div className="grid grid-cols-4 gap-2">
                        {['1.2M', '3,200', '+15%', '94%'].map((v, i) => (
                          <div key={i} className="rounded bg-orange-50 p-2 text-center">
                            <p className="text-lg font-bold text-orange-700">{v}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {section.type === 'image' && (
                      <div className="flex items-center justify-center rounded bg-gray-50 py-8">
                        <Image className="h-10 w-10 text-gray-300" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
