"use client";

import {
  LayoutTemplate,
  PenTool,
  GitBranch,
  Package,
  Eye,
  Copy,
  Settings,
  FolderTree,
  Sparkles,
} from "lucide-react";

const modules = [
  {
    title: "Template Designer",
    titleAr: "مصمم القوالب",
    description: "Visual template designer with drag-and-drop blocks, dynamic variables, and conditional sections.",
    descriptionAr: "مصمم قوالب مرئي مع كتل السحب والإفلات والمتغيرات النائبة والأقسام الشرطية.",
    icon: PenTool,
    status: "planned",
  },
  {
    title: "Version Control",
    titleAr: "التحكم في الإصدارات",
    description: "Template versioning with branching, diff comparison, rollback, and release management.",
    descriptionAr: "إصدار القوالب مع التفريع ومقارنة الفروقات والتراجع وإدارة الإصدارات.",
    icon: GitBranch,
    status: "planned",
  },
  {
    title: "Template Registry",
    titleAr: "سجل القوالب",
    description: "Centralized registry for publishing, discovering, and installing templates across the platform.",
    descriptionAr: "سجل مركزي لنشر واكتشاف وتثبيت القوالب عبر المنصة.",
    icon: Package,
    status: "planned",
  },
  {
    title: "Preview Engine",
    titleAr: "محرك المعاينة",
    description: "Live template preview with sample data binding, responsive viewport testing, and print preview.",
    descriptionAr: "معاينة حية للقوالب مع ربط بيانات العينة واختبار نافذة العرض المتجاوبة ومعاينة الطباعة.",
    icon: Eye,
    status: "planned",
  },
  {
    title: "Template Cloning",
    titleAr: "استنساخ القوالب",
    description: "Clone and customize existing templates with inheritance, overrides, and child template support.",
    descriptionAr: "استنساخ وتخصيص القوالب الحالية مع الوراثة والتجاوزات ودعم القوالب الفرعية.",
    icon: Copy,
    status: "planned",
  },
  {
    title: "Variable System",
    titleAr: "نظام المتغيرات",
    description: "Dynamic variable system with types, defaults, validation, computed values, and conditional logic.",
    descriptionAr: "نظام متغيرات ديناميكي مع الأنواع والقيم الافتراضية والتحقق والقيم المحسوبة والمنطق الشرطي.",
    icon: Settings,
    status: "planned",
  },
  {
    title: "Category Manager",
    titleAr: "مدير الفئات",
    description: "Organize templates into categories with hierarchical taxonomy, tagging, and metadata.",
    descriptionAr: "تنظيم القوالب في فئات مع تصنيف هرمي ووسم وبيانات وصفية.",
    icon: FolderTree,
    status: "planned",
  },
  {
    title: "AI Template Generator",
    titleAr: "مولد القوالب بالذكاء الاصطناعي",
    description: "AI-assisted template creation from natural language descriptions with automatic layout and styling suggestions.",
    descriptionAr: "إنشاء قوالب بمساعدة الذكاء الاصطناعي من أوصاف اللغة الطبيعية مع اقتراحات التخطيط والتنسيق التلقائية.",
    icon: Sparkles,
    status: "planned",
  },
];

export default function TemplateEnginePage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50">
            <LayoutTemplate className="h-7 w-7 text-emerald-600" />
          </div>
          <div>
            <h1 className="page-title">محرك القوالب</h1>
            <p className="text-lg font-medium text-emerald-600">Template Engine</p>
          </div>
        </div>
        <p className="page-description mt-4">
          نظام إدارة القوالب لإنشاء وإصدار وتوزيع قوالب المستندات والتقارير عبر المنصة.
          يوفر مصمم قوالب مرئي والتحكم في الإصدارات وسجل مركزي ومولد قوالب بالذكاء الاصطناعي.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-emerald-600">0</p>
          <p className="text-sm text-gray-500">قوالب</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-emerald-600">0</p>
          <p className="text-sm text-gray-500">إصدارات</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-emerald-600">0</p>
          <p className="text-sm text-gray-500">فئات</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-emerald-600">0</p>
          <p className="text-sm text-gray-500">استخدامات</p>
        </div>
      </div>

      <h2 className="section-title mb-6 text-2xl">الوحدات - Modules</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <div key={mod.title} className="section-card">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                  <Icon className="h-5 w-5 text-emerald-600" />
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
