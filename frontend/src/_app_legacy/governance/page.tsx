"use client";

import {
  Shield,
  Lock,
  FileSearch,
  Scale,
  BarChart2,
  Users,
  Eye,
  Bell,
  ClipboardCheck,
} from "lucide-react";

const modules = [
  {
    title: "Access Control",
    titleAr: "التحكم في الوصول",
    description: "Role-based access control (RBAC) with fine-grained permissions, resource-level policies, and group management.",
    descriptionAr: "التحكم في الوصول القائم على الأدوار (RBAC) مع أذونات دقيقة وسياسات على مستوى الموارد وإدارة المجموعات.",
    icon: Lock,
    status: "planned",
  },
  {
    title: "Audit Logging",
    titleAr: "تسجيل التدقيق",
    description: "Comprehensive audit logs with user actions, data changes, API calls, and system events with retention policies.",
    descriptionAr: "سجلات تدقيق شاملة مع إجراءات المستخدم وتغييرات البيانات واستدعاءات API وأحداث النظام مع سياسات الاحتفاظ.",
    icon: FileSearch,
    status: "planned",
  },
  {
    title: "Compliance Manager",
    titleAr: "مدير الامتثال",
    description: "Compliance tracking for NCA, PDPL, ISO 27001, and custom regulatory frameworks with automated assessments.",
    descriptionAr: "تتبع الامتثال لـ NCA وPDPL وISO 27001 والأطر التنظيمية المخصصة مع التقييمات الآلية.",
    icon: Scale,
    status: "planned",
  },
  {
    title: "Data Quality Monitor",
    titleAr: "مراقب جودة البيانات",
    description: "Continuous data quality monitoring with completeness, accuracy, consistency, and timeliness metrics.",
    descriptionAr: "مراقبة مستمرة لجودة البيانات مع مقاييس الاكتمال والدقة والاتساق والتوقيت.",
    icon: BarChart2,
    status: "planned",
  },
  {
    title: "User Management",
    titleAr: "إدارة المستخدمين",
    description: "User lifecycle management with SSO integration, LDAP/AD sync, multi-factor authentication, and session control.",
    descriptionAr: "إدارة دورة حياة المستخدم مع تكامل SSO ومزامنة LDAP/AD والمصادقة متعددة العوامل والتحكم في الجلسات.",
    icon: Users,
    status: "planned",
  },
  {
    title: "Data Privacy",
    titleAr: "خصوصية البيانات",
    description: "Data masking, anonymization, pseudonymization, and encryption with configurable privacy policies.",
    descriptionAr: "إخفاء البيانات وإزالة الهوية والتسمية المستعارة والتشفير مع سياسات خصوصية قابلة للتكوين.",
    icon: Eye,
    status: "planned",
  },
  {
    title: "Alert System",
    titleAr: "نظام التنبيهات",
    description: "Configurable alerts for security events, policy violations, data quality issues, and system anomalies.",
    descriptionAr: "تنبيهات قابلة للتكوين لأحداث الأمان وانتهاكات السياسة ومشاكل جودة البيانات وحالات النظام الشاذة.",
    icon: Bell,
    status: "planned",
  },
  {
    title: "Policy Engine",
    titleAr: "محرك السياسات",
    description: "Define and enforce data governance policies with automated compliance checks and violation workflows.",
    descriptionAr: "تعريف وتنفيذ سياسات حوكمة البيانات مع فحوصات الامتثال الآلية وسير عمل الانتهاكات.",
    icon: ClipboardCheck,
    status: "planned",
  },
];

export default function GovernanceEnginePage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-50">
            <Shield className="h-7 w-7 text-red-600" />
          </div>
          <div>
            <h1 className="page-title">محرك الحوكمة</h1>
            <p className="text-lg font-medium text-red-600">Governance Engine</p>
          </div>
        </div>
        <p className="page-description mt-4">
          حوكمة البيانات مع التحكم في الوصول القائم على الأدوار وتسجيل التدقيق وتتبع الامتثال ومراقبة
          جودة البيانات. يدعم المعايير التنظيمية السعودية وسياسات خصوصية البيانات والتنبيهات الأمنية.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-red-600">0</p>
          <p className="text-sm text-gray-500">مستخدمون</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-red-600">0</p>
          <p className="text-sm text-gray-500">أدوار</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-red-600">0</p>
          <p className="text-sm text-gray-500">سياسات نشطة</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-green-600">--</p>
          <p className="text-sm text-gray-500">نسبة الامتثال</p>
        </div>
      </div>

      <h2 className="section-title mb-6 text-2xl">الوحدات - Modules</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <div key={mod.title} className="section-card">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                  <Icon className="h-5 w-5 text-red-600" />
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
