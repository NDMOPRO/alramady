"use client";

import Link from "next/link";
import {
  Database,
  FileSpreadsheet,
  BarChart3,
  FileText,
  Presentation,
  Image,
  Copy,
  Globe,
  Brain,
  Shield,
  BookOpen,
  LayoutTemplate,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Activity,
  Users,
  FolderOpen,
  Zap,
} from "lucide-react";

const engines = [
  {
    name: "Data Engine",
    nameAr: "محرك البيانات",
    description: "Centralized data ingestion, validation, cleansing, and storage with support for multiple data sources and formats.",
    descriptionAr: "استيعاب البيانات المركزي والتحقق والتنظيف والتخزين مع دعم مصادر وتنسيقات بيانات متعددة.",
    href: "/data",
    icon: Database,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  {
    name: "Excel Engine",
    nameAr: "محرك إكسل",
    description: "Advanced Excel file processing, generation, and manipulation with formula support, pivot tables, and automated reporting.",
    descriptionAr: "معالجة ملفات إكسل المتقدمة والإنشاء والتعديل مع دعم الصيغ والجداول المحورية والتقارير الآلية.",
    href: "/excel",
    icon: FileSpreadsheet,
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
  },
  {
    name: "Dashboard Engine",
    nameAr: "محرك لوحة المعلومات",
    description: "Interactive dashboard creation with real-time data visualization, drill-down capabilities, and customizable widgets.",
    descriptionAr: "إنشاء لوحات معلومات تفاعلية مع تصور البيانات في الوقت الفعلي وإمكانيات التنقل والأدوات القابلة للتخصيص.",
    href: "/dashboard",
    icon: BarChart3,
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
  },
  {
    name: "Reporting Engine",
    nameAr: "محرك التقارير",
    description: "Automated report generation with scheduling, templating, and multi-format output including PDF, Word, and HTML.",
    descriptionAr: "إنشاء التقارير الآلية مع الجدولة والقوالب والإخراج متعدد التنسيقات بما في ذلك PDF وWord وHTML.",
    href: "/reporting",
    icon: FileText,
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-200",
  },
  {
    name: "Presentation Engine",
    nameAr: "محرك العروض التقديمية",
    description: "Automated PowerPoint generation with data-driven slides, charts, dynamic content binding, and branding templates.",
    descriptionAr: "إنشاء عروض PowerPoint آلية مع شرائح مبنية على البيانات والرسوم البيانية والربط الديناميكي للمحتوى وقوالب العلامة التجارية.",
    href: "/presentation",
    icon: Presentation,
    color: "text-pink-600",
    bg: "bg-pink-50",
    border: "border-pink-200",
  },
  {
    name: "Infographic Engine",
    nameAr: "محرك الإنفوجرافيك",
    description: "Visual infographic generation with data-driven layouts, icon mapping, and responsive SVG output for print and web.",
    descriptionAr: "إنشاء إنفوجرافيك مرئي مع تخطيطات مبنية على البيانات وتعيين الأيقونات وإخراج SVG متجاوب للطباعة والويب.",
    href: "/infographic",
    icon: Image,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    border: "border-cyan-200",
  },
  {
    name: "Replication Engine",
    nameAr: "محرك النسخ",
    description: "Data replication and synchronization across multiple databases, ensuring consistency, conflict resolution, and audit trails.",
    descriptionAr: "نسخ البيانات ومزامنتها عبر قواعد بيانات متعددة مع ضمان الاتساق وحل التعارضات ومسارات التدقيق.",
    href: "/replication",
    icon: Copy,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
  },
  {
    name: "Localization Engine",
    nameAr: "محرك التعريب",
    description: "Multi-language support with Arabic-first localization, RTL handling, translation management, and cultural adaptation.",
    descriptionAr: "دعم متعدد اللغات مع التعريب العربي أولاً ومعالجة RTL وإدارة الترجمة والتكيف الثقافي.",
    href: "/localization",
    icon: Globe,
    color: "text-teal-600",
    bg: "bg-teal-50",
    border: "border-teal-200",
  },
  {
    name: "AI Engine",
    nameAr: "محرك الذكاء الاصطناعي",
    description: "AI-powered analytics with NLP, predictive modeling, anomaly detection, and intelligent data summarization.",
    descriptionAr: "تحليلات مدعومة بالذكاء الاصطناعي مع معالجة اللغة الطبيعية والنمذجة التنبؤية وكشف الحالات الشاذة والتلخيص الذكي.",
    href: "/ai",
    icon: Brain,
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
  },
  {
    name: "Governance Engine",
    nameAr: "محرك الحوكمة",
    description: "Data governance with role-based access control, audit logging, compliance tracking, and data quality monitoring.",
    descriptionAr: "حوكمة البيانات مع التحكم في الوصول القائم على الأدوار وتسجيل التدقيق وتتبع الامتثال ومراقبة جودة البيانات.",
    href: "/governance",
    icon: Shield,
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
  },
  {
    name: "Library Engine",
    nameAr: "محرك المكتبة",
    description: "Centralized asset library for managing shared resources, templates, components, icons, and reusable content blocks.",
    descriptionAr: "مكتبة أصول مركزية لإدارة الموارد المشتركة والقوالب والمكونات والأيقونات وكتل المحتوى القابلة لإعادة الاستخدام.",
    href: "/library",
    icon: BookOpen,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  {
    name: "Template Engine",
    nameAr: "محرك القوالب",
    description: "Template management system for creating, versioning, and distributing document and report templates across the platform.",
    descriptionAr: "نظام إدارة القوالب لإنشاء وإصدار وتوزيع قوالب المستندات والتقارير عبر المنصة.",
    href: "/template",
    icon: LayoutTemplate,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  {
    name: "Conversion Engine",
    nameAr: "محرك التحويل",
    description: "File format conversion supporting PDF, DOCX, XLSX, PPTX, HTML, CSV, JSON, and image formats with batch processing.",
    descriptionAr: "تحويل تنسيقات الملفات بدعم PDF وDOCX وXLSX وPPTX وHTML وCSV وJSON وتنسيقات الصور مع المعالجة الدفعية.",
    href: "/conversion",
    icon: RefreshCw,
    color: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-200",
  },
];

const stats = [
  { label: "Engines", labelAr: "المحركات", value: "13", icon: Zap },
  { label: "Active Users", labelAr: "المستخدمون النشطون", value: "0", icon: Users },
  { label: "Projects", labelAr: "المشاريع", value: "0", icon: FolderOpen },
  { label: "System Status", labelAr: "حالة النظام", value: "Online", icon: Activity },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl">
      {/* Hero Section */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rasid-600 text-xl font-bold text-white">
            R
          </div>
          <div>
            <h1 className="page-title">Rasid Platform</h1>
            <p className="page-description">
              منصة رصيد المتكاملة لإدارة البيانات والتقارير والتحليلات
            </p>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="section-card flex items-center gap-4"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rasid-50">
                <Icon className="h-6 w-6 text-rasid-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.labelAr}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Engines Grid */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">المحركات - Engines</h2>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
          13 محرك
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {engines.map((engine) => {
          const Icon = engine.icon;
          return (
            <Link key={engine.href} href={engine.href} className="group">
              <div className={`engine-card border ${engine.border} group-hover:border-opacity-100`}>
                <div className="mb-4 flex items-start justify-between">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${engine.bg}`}>
                    <Icon className={`h-6 w-6 ${engine.color}`} />
                  </div>
                  <ArrowLeft className="h-5 w-5 text-gray-300 transition-transform group-hover:-translate-x-1 group-hover:text-rasid-500 rtl:rotate-180 rtl:group-hover:translate-x-1" />
                </div>
                <h3 className="mb-1 text-lg font-semibold text-gray-900">
                  {engine.nameAr}
                </h3>
                <p className="mb-1 text-sm font-medium text-gray-500">
                  {engine.name}
                </p>
                <p className="text-sm leading-relaxed text-gray-600">
                  {engine.descriptionAr}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
