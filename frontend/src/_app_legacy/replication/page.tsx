"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Copy,
  Target,
  Crosshair,
  Layers,
  Image,
  Lock,
  ShieldCheck,
  Loader2,
  CheckCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { fetchReplicationHistory } from "@/lib/api/replication";

const quickLinks = [
  { href: "/replicate", icon: Target, label: "بدء نسخ جديد", labelEn: "New Replication" },
  { href: "/replication/core-principle", icon: Crosshair, label: "مبدأ المطابقة", labelEn: "Core Principle" },
  { href: "/replication/match-phases", icon: Layers, label: "مراحل المطابقة", labelEn: "Match Phases" },
  { href: "/replication/image-matching", icon: Image, label: "المطابقة البصرية", labelEn: "Image Matching" },
  { href: "/replication/print-lock", icon: Lock, label: "قفل الطباعة", labelEn: "Print Lock" },
  { href: "/replication/dual-verify", icon: ShieldCheck, label: "التحقق المزدوج", labelEn: "Dual Verify" },
];

export default function ReplicationEnginePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["replication-overview"],
    queryFn: () => fetchReplicationHistory({ page: 1, limit: 100 }),
  });

  const jobs = data?.data ?? [];
  const total = data?.total ?? 0;
  const completedJobs = jobs.filter((j) => j.status === "completed").length;
  const pendingJobs = jobs.filter((j) => j.status === "pending" || j.status === "analyzing" || j.status === "replicating").length;
  const avgFidelity = jobs.filter((j) => j.fidelityScore != null).length > 0
    ? (jobs.filter((j) => j.fidelityScore != null).reduce((sum, j) => sum + (j.fidelityScore || 0), 0) / jobs.filter((j) => j.fidelityScore != null).length).toFixed(1)
    : "--";

  return (
    <div className="mx-auto max-w-7xl">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-50">
            <Copy className="h-7 w-7 text-indigo-600" />
          </div>
          <div>
            <h1 className="page-title">محرك النسخ المتطابق</h1>
            <p className="text-lg font-medium text-indigo-600">Replication Engine</p>
          </div>
        </div>
        <p className="page-description mt-4">
          محرك النسخ المتطابق 1:1 لإعادة إنتاج المستندات والصور بدقة بكسل مثالية مع التحقق المزدوج.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="section-card text-center">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-400" /> : (
            <p className="text-3xl font-bold text-indigo-600">{total}</p>
          )}
          <p className="text-sm text-gray-500">إجمالي عمليات النسخ</p>
        </div>
        <div className="section-card text-center">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-400" /> : (
            <p className="text-3xl font-bold text-green-600">{completedJobs}</p>
          )}
          <p className="text-sm text-gray-500">مكتملة</p>
        </div>
        <div className="section-card text-center">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-400" /> : (
            <p className="text-3xl font-bold text-amber-600">{pendingJobs}</p>
          )}
          <p className="text-sm text-gray-500">قيد التنفيذ</p>
        </div>
        <div className="section-card text-center">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-400" /> : (
            <p className="text-3xl font-bold text-indigo-600">{avgFidelity}%</p>
          )}
          <p className="text-sm text-gray-500">متوسط الدقة</p>
        </div>
      </div>

      <h2 className="section-title mb-4 text-2xl">الوصول السريع - Quick Access</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="section-card flex flex-col items-center gap-2 p-4 text-center transition hover:shadow-md hover:border-indigo-200"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
                <Icon className="h-5 w-5 text-indigo-600" />
              </div>
              <p className="text-xs font-semibold text-gray-900">{link.label}</p>
              <p className="text-[10px] text-gray-400">{link.labelEn}</p>
            </Link>
          );
        })}
      </div>

      {/* Recent Jobs */}
      <h2 className="section-title mb-4 text-2xl">العمليات الأخيرة - Recent Jobs</h2>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="section-card py-12 text-center text-sm text-gray-400">
          لا توجد عمليات نسخ بعد. ابدأ بنسخ جديد.
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.slice(0, 5).map((job) => (
            <div key={job.id} className="section-card flex items-center gap-4 p-4">
              {job.status === "completed" && <CheckCircle className="h-5 w-5 text-green-500" />}
              {(job.status === "pending" || job.status === "analyzing" || job.status === "replicating") && <Clock className="h-5 w-5 text-amber-500" />}
              {job.status === "failed" && <AlertTriangle className="h-5 w-5 text-red-500" />}
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">عملية نسخ #{job.id.slice(0, 8)}</p>
                <p className="text-xs text-gray-400">
                  {job.status === "completed" ? "مكتملة" : job.status === "failed" ? "فاشلة" : "قيد التنفيذ"}
                  {job.fidelityScore != null && ` - دقة: ${job.fidelityScore}%`}
                </p>
              </div>
              <span className="text-xs text-gray-400">{new Date(job.createdAt).toLocaleDateString("ar-SA")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
