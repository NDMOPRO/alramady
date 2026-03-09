"use client";

import {
  BookOpen,
  FolderOpen,
  ImageIcon,
  FileText,
  Search,
  Tag,
  Upload,
  Share2,
  Star,
} from "lucide-react";

const modules = [
  {
    title: "Asset Browser",
    titleAr: "متصفح الأصول",
    description: "Browse and search all shared assets with grid/list views, filtering, sorting, and preview capabilities.",
    descriptionAr: "تصفح والبحث في جميع الأصول المشتركة مع طرق عرض الشبكة/القائمة والتصفية والفرز وإمكانيات المعاينة.",
    icon: FolderOpen,
    status: "planned",
  },
  {
    title: "Media Library",
    titleAr: "مكتبة الوسائط",
    description: "Manage images, icons, logos, and graphics with tagging, categorization, and usage tracking.",
    descriptionAr: "إدارة الصور والأيقونات والشعارات والرسومات مع الوسم والتصنيف وتتبع الاستخدام.",
    icon: ImageIcon,
    status: "planned",
  },
  {
    title: "Document Library",
    titleAr: "مكتبة المستندات",
    description: "Centralized document storage with versioning, check-in/check-out, metadata, and full-text search.",
    descriptionAr: "تخزين مستندات مركزي مع الإصدارات والسحب/الإيداع والبيانات الوصفية والبحث في النص الكامل.",
    icon: FileText,
    status: "planned",
  },
  {
    title: "Search Engine",
    titleAr: "محرك البحث",
    description: "Full-text search across all library assets with faceted filtering, relevance ranking, and saved searches.",
    descriptionAr: "بحث نصي كامل عبر جميع أصول المكتبة مع التصفية متعددة الأوجه وترتيب الصلة وعمليات البحث المحفوظة.",
    icon: Search,
    status: "planned",
  },
  {
    title: "Tagging System",
    titleAr: "نظام الوسوم",
    description: "Hierarchical tagging with auto-suggestion, tag groups, synonyms, and taxonomy management.",
    descriptionAr: "وسم هرمي مع الاقتراح التلقائي ومجموعات الوسوم والمرادفات وإدارة التصنيف.",
    icon: Tag,
    status: "planned",
  },
  {
    title: "Upload Manager",
    titleAr: "مدير التحميل",
    description: "Bulk upload with drag-and-drop, progress tracking, format validation, and automatic metadata extraction.",
    descriptionAr: "تحميل مجمع بالسحب والإفلات مع تتبع التقدم والتحقق من التنسيق واستخراج البيانات الوصفية التلقائي.",
    icon: Upload,
    status: "planned",
  },
  {
    title: "Sharing & Permissions",
    titleAr: "المشاركة والأذونات",
    description: "Share assets with teams and individuals with configurable access levels and expiration dates.",
    descriptionAr: "مشاركة الأصول مع الفرق والأفراد مع مستويات وصول قابلة للتكوين وتواريخ انتهاء الصلاحية.",
    icon: Share2,
    status: "planned",
  },
  {
    title: "Favorites & Collections",
    titleAr: "المفضلة والمجموعات",
    description: "Organize assets into personal and shared collections with favorites, bookmarks, and quick access shortcuts.",
    descriptionAr: "تنظيم الأصول في مجموعات شخصية ومشتركة مع المفضلة والإشارات المرجعية واختصارات الوصول السريع.",
    icon: Star,
    status: "planned",
  },
];

export default function LibraryEnginePage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-50">
            <BookOpen className="h-7 w-7 text-amber-600" />
          </div>
          <div>
            <h1 className="page-title">محرك المكتبة</h1>
            <p className="text-lg font-medium text-amber-600">Library Engine</p>
          </div>
        </div>
        <p className="page-description mt-4">
          مكتبة أصول مركزية لإدارة الموارد المشتركة والقوالب والمكونات والأيقونات وكتل المحتوى القابلة
          لإعادة الاستخدام. توفر بحثاً نصياً كاملاً ونظام وسوم هرمي ومشاركة مع الفرق.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-amber-600">0</p>
          <p className="text-sm text-gray-500">إجمالي الأصول</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-amber-600">0</p>
          <p className="text-sm text-gray-500">مستندات</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-amber-600">0</p>
          <p className="text-sm text-gray-500">وسائط</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-amber-600">0</p>
          <p className="text-sm text-gray-500">مجموعات</p>
        </div>
      </div>

      <h2 className="section-title mb-6 text-2xl">الوحدات - Modules</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <div key={mod.title} className="section-card">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                  <Icon className="h-5 w-5 text-amber-600" />
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
