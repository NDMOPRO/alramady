'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Palette, FileText, DollarSign, Users, ShoppingCart, Building,
  Heart, Truck, Globe, GraduationCap, Search, Filter, Eye,
  Download, Copy, Star, Plus, Check, BarChart3,
} from 'lucide-react';

const templates = [
  { id: 1, name: 'تقرير مالي ربعي', nameEn: 'Quarterly Financial', icon: DollarSign, color: 'from-blue-700 to-blue-500', pages: 24, uses: 312, rating: 4.9, category: 'مالي' },
  { id: 2, name: 'تقرير أداء الموظفين', nameEn: 'Employee Performance', icon: Users, color: 'from-violet-700 to-violet-500', pages: 15, uses: 245, rating: 4.7, category: 'موارد بشرية' },
  { id: 3, name: 'تحليل المبيعات', nameEn: 'Sales Analysis', icon: ShoppingCart, color: 'from-emerald-700 to-emerald-500', pages: 18, uses: 389, rating: 4.8, category: 'مبيعات' },
  { id: 4, name: 'تقرير الشركة السنوي', nameEn: 'Annual Corporate', icon: Building, color: 'from-gray-800 to-gray-600', pages: 42, uses: 178, rating: 4.9, category: 'مالي' },
  { id: 5, name: 'تقرير صحي', nameEn: 'Healthcare Report', icon: Heart, color: 'from-red-700 to-red-500', pages: 20, uses: 89, rating: 4.5, category: 'صحة' },
  { id: 6, name: 'تقرير سلسلة التوريد', nameEn: 'Supply Chain', icon: Truck, color: 'from-cyan-700 to-cyan-500', pages: 16, uses: 134, rating: 4.6, category: 'عمليات' },
  { id: 7, name: 'تقرير تعليمي', nameEn: 'Education Report', icon: GraduationCap, color: 'from-amber-700 to-amber-500', pages: 22, uses: 67, rating: 4.4, category: 'تعليم' },
  { id: 8, name: 'تقرير أداء عالمي', nameEn: 'Global Performance', icon: Globe, color: 'from-indigo-700 to-indigo-500', pages: 30, uses: 198, rating: 4.7, category: 'تحليل' },
  { id: 9, name: 'ملخص تنفيذي', nameEn: 'Executive Summary', icon: BarChart3, color: 'from-pink-700 to-pink-500', pages: 8, uses: 456, rating: 4.8, category: 'مالي' },
];

const categories = ['الكل', 'مالي', 'موارد بشرية', 'مبيعات', 'عمليات', 'صحة', 'تعليم', 'تحليل'];

export default function ReportTemplatesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filtered = templates.filter(t => {
    const matchesSearch = t.name.includes(searchQuery) || t.nameEn.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'الكل' || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/reporting" className="hover:text-orange-600">محرك التقارير</Link>
            <span>/</span>
            <span>معرض القوالب</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">معرض قوالب التقارير</h1>
          <p className="text-gray-500">Report Template Gallery</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
          <Plus className="h-4 w-4" /> قالب مخصص
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-amber-600">{templates.length}</p>
          <p className="text-sm text-gray-500">قالب متاح</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-blue-600">{categories.length - 1}</p>
          <p className="text-sm text-gray-500">فئات</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-green-600">2,068</p>
          <p className="text-sm text-gray-500">إجمالي الاستخدامات</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-3xl font-bold text-violet-600">4.7</p>
          <p className="text-sm text-gray-500">متوسط التقييم</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="البحث في القوالب..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 ps-10 pe-4 text-sm focus:border-orange-500 focus:outline-none" />
        </div>
        <div className="flex flex-wrap gap-1">
          {categories.map((cat) => (
            <button key={cat} onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === cat ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((template) => {
          const Icon = template.icon;
          return (
            <div key={template.id} className="group rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all">
              <div className={`bg-gradient-to-br ${template.color} p-8 flex flex-col items-center justify-center`}>
                <Icon className="h-10 w-10 text-white/80 mb-2" />
                <div className="flex gap-1">
                  {[1,2,3].map(i => <div key={i} className="h-1 w-6 rounded-full bg-white/30" />)}
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900">{template.name}</h3>
                <p className="text-xs text-gray-400">{template.nameEn}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>{template.pages} صفحة</span>
                  <span>{template.uses} استخدام</span>
                  <span className="flex items-center gap-0.5"><Star className="h-3 w-3 text-amber-400 fill-amber-400" /> {template.rating}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100">
                    <Copy className="h-3 w-3" /> استخدام القالب
                  </button>
                  <button className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50">
                    <Eye className="h-3 w-3 text-gray-400" />
                  </button>
                  <button className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50">
                    <Download className="h-3 w-3 text-gray-400" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
