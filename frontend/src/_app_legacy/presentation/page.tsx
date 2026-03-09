"use client";

import { useState, useEffect } from 'react';
import Link from "next/link";
import { api } from '@/lib/api';
import {
  Presentation,
  Layers,
  BarChart,
  Type,
  ImageIcon,
  Palette,
  Play,
  Download,
  Wand2,
  Upload,
  Sparkles,
  Edit3,
  Share2,
  Users,
  Plug,
  ArrowLeft,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface PresentationStats {
  totalPresentations: number;
  totalSlides: number;
  availableThemes: number;
  lastExport: string;
}

interface Module {
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  status: string;
}

interface PresentationResponse {
  stats: PresentationStats;
  modules: Module[];
}

const iconMap: Record<string, any> = {
  Layers, BarChart, Type, ImageIcon, Palette, Play, Download, Wand2,
  Upload, Sparkles, Edit3, Share2, Users, Plug,
};

const quickLinks = [
  { href: "/presentation/multi-source", icon: Upload, label: "إنشاء متعدد المصادر", labelEn: "Multi-Source Creation" },
  { href: "/presentation/ai-content", icon: Sparkles, label: "إنشاء بالذكاء الاصطناعي", labelEn: "AI Content" },
  { href: "/presentation/smart-design", icon: Palette, label: "التصميم الذكي", labelEn: "Smart Design" },
  { href: "/presentation/advanced-edit", icon: Edit3, label: "المحرر المتقدم", labelEn: "Advanced Editor" },
  { href: "/presentation/animation", icon: Play, label: "الرسوم المتحركة", labelEn: "Animation" },
  { href: "/presentation/export-share", icon: Share2, label: "التصدير والمشاركة", labelEn: "Export & Share" },
  { href: "/presentation/collaboration", icon: Users, label: "التعاون الفوري", labelEn: "Collaboration" },
  { href: "/presentation/integration", icon: Plug, label: "التكامل", labelEn: "Integration" },
];

export default function PresentationEnginePage() {
  const [stats, setStats] = useState<PresentationStats | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PresentationResponse>('/api/presentation')
      .then(res => {
        setStats(res.stats);
        setModules(res.modules);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-pink-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-pink-50">
            <Presentation className="h-7 w-7 text-pink-600" />
          </div>
          <div>
            <h1 className="page-title">محرك العروض التقديمية</h1>
            <p className="text-lg font-medium text-pink-600">Presentation Engine</p>
          </div>
        </div>
        <p className="page-description mt-4">
          إنشاء عروض PowerPoint آلية مع شرائح مبنية على البيانات والرسوم البيانية المدمجة والربط الديناميكي
          للمحتوى وقوالب العلامة التجارية. يدعم السمات المخصصة والرسوم المتحركة وإنشاء الشرائح بالذكاء الاصطناعي.
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-pink-600">{stats?.totalPresentations ?? 0}</p>
          <p className="text-sm text-gray-500">عروض تقديمية</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-pink-600">{stats?.totalSlides ?? 0}</p>
          <p className="text-sm text-gray-500">شرائح منشأة</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-pink-600">{stats?.availableThemes ?? 0}</p>
          <p className="text-sm text-gray-500">سمات متاحة</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-pink-600">{stats?.lastExport ?? '--'}</p>
          <p className="text-sm text-gray-500">آخر تصدير</p>
        </div>
      </div>

      <h2 className="section-title mb-4 text-2xl">الوصول السريع - Quick Access</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="section-card flex items-center gap-3 transition hover:shadow-md hover:border-pink-200"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-50">
                <Icon className="h-5 w-5 text-pink-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{link.label}</p>
                <p className="text-[10px] text-gray-400">{link.labelEn}</p>
              </div>
            </Link>
          );
        })}
      </div>

      <h2 className="section-title mb-6 text-2xl">الوحدات - Modules</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          const Icon = iconMap[mod.icon] || Layers;
          return (
            <div key={mod.title} className="section-card">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-50">
                  <Icon className="h-5 w-5 text-pink-600" />
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                  {mod.status === "planned" ? "مخطط" : "نشط"}
                </span>
              </div>
              <h3 className="mb-1 font-semibold text-gray-900">{mod.titleAr}</h3>
              <p className="mb-2 text-sm font-medium text-gray-400">{mod.title}</p>
              <p className="text-sm leading-relaxed text-gray-600">{mod.descriptionAr}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
