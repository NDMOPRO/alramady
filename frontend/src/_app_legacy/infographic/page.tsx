"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Image,
  Palette,
  BarChart,
  Type,
  Shapes,
  Download,
  Layout,
  Wand2,
  PenTool,
  Loader2,
} from "lucide-react";
import { fetchInfographics } from "@/lib/api/infographic";

const modules = [
  { title: "Layout Designer", titleAr: "مصمم التخطيط", icon: Layout },
  { title: "Data Visualization", titleAr: "تصور البيانات", icon: BarChart },
  { title: "Icon Library", titleAr: "مكتبة الأيقونات", icon: Shapes },
  { title: "Typography Engine", titleAr: "محرك الطباعة", icon: Type },
  { title: "Color Palette Manager", titleAr: "مدير لوحة الألوان", icon: Palette },
  { title: "Export Engine", titleAr: "محرك التصدير", icon: Download },
  { title: "AI Generator", titleAr: "المولد بالذكاء الاصطناعي", icon: Wand2 },
];

const quickLinks = [
  { href: "/infographics", icon: PenTool, label: "الإنفوجرافيك", labelEn: "All Infographics" },
];

export default function InfographicEnginePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["infographics-overview"],
    queryFn: () => fetchInfographics({ page: 1, limit: 100 }),
  });

  const infographics = data?.data ?? [];
  const total = data?.total ?? 0;
  const draftCount = infographics.filter((i) => i.status === "draft").length;
  const publishedCount = infographics.filter((i) => i.status === "published").length;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-50">
            <Image className="h-7 w-7 text-cyan-600" />
          </div>
          <div>
            <h1 className="page-title">محرك الإنفوجرافيك</h1>
            <p className="text-lg font-medium text-cyan-600">Infographic Engine</p>
          </div>
        </div>
        <p className="page-description mt-4">
          إنشاء إنفوجرافيك مرئي مع تخطيطات مبنية على البيانات وتعيين الأيقونات وإخراج SVG متجاوب
          للطباعة والويب.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="section-card text-center">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-400" /> : (
            <p className="text-3xl font-bold text-cyan-600">{total}</p>
          )}
          <p className="text-sm text-gray-500">إنفوجرافيك منشأ</p>
        </div>
        <div className="section-card text-center">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-400" /> : (
            <p className="text-3xl font-bold text-cyan-600">{publishedCount}</p>
          )}
          <p className="text-sm text-gray-500">منشور</p>
        </div>
        <div className="section-card text-center">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-400" /> : (
            <p className="text-3xl font-bold text-cyan-600">{draftCount}</p>
          )}
          <p className="text-sm text-gray-500">مسودات</p>
        </div>
        <div className="section-card text-center">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-400" /> : (
            <p className="text-3xl font-bold text-cyan-600">
              {infographics.length > 0
                ? new Date(infographics[0].updatedAt).toLocaleDateString("ar-SA")
                : "--"}
            </p>
          )}
          <p className="text-sm text-gray-500">آخر تحديث</p>
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
              className="section-card flex items-center gap-3 transition hover:shadow-md hover:border-cyan-200"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-50">
                <Icon className="h-5 w-5 text-cyan-600" />
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
          const Icon = mod.icon;
          return (
            <div key={mod.title} className="section-card">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50">
                  <Icon className="h-5 w-5 text-cyan-600" />
                </div>
                <span className="rounded-full bg-cyan-100 px-2.5 py-0.5 text-xs font-medium text-cyan-700">
                  نشط
                </span>
              </div>
              <h3 className="mb-1 font-semibold text-gray-900">{mod.titleAr}</h3>
              <p className="mb-2 text-sm font-medium text-gray-400">{mod.title}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
