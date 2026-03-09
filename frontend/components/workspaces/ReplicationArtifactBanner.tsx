"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Package2, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReplicationArtifact } from "@/lib/types/replication";

export default function ReplicationArtifactBanner() {
  const router = useRouter();
  const [artifact, setArtifact] = useState<ReplicationArtifact | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const artifactId = new URLSearchParams(window.location.search).get("replicationArtifact");
    if (!artifactId) return;

    let cancelled = false;
    const load = async () => {
      const res = await fetch(`/api/replication/artifact/${artifactId}`);
      const json = (await res.json()) as { success?: boolean; data?: ReplicationArtifact };
      if (!cancelled && res.ok && json.success && json.data) {
        setArtifact(json.data);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const manifestSections = useMemo(() => {
    if (!artifact) return [] as string[];
    if (artifact.outputModel.kind === "dashboard") {
      return artifact.outputModel.widgets.slice(0, 4).map((w) => `${w.type}:${w.binding}`);
    }
    if (artifact.outputModel.kind === "report") {
      return artifact.outputModel.sections.map((s) => `${s.title} (${s.blocks})`);
    }
    if (artifact.outputModel.kind === "presentation") {
      return artifact.outputModel.slides.slice(0, 4).map((s) => `${s.id}:${s.layout}`);
    }
    if (artifact.outputModel.kind === "excel") {
      return artifact.outputModel.sheets.map((s) => `${s.name} (${s.columns}c)`);
    }
    return [
      `base:${artifact.outputModel.baseLocale}`,
      `target:${artifact.outputModel.targetLocale}`,
      `rtl:${artifact.outputModel.rtlTransforms}`,
    ];
  }, [artifact]);

  const downloadManifest = async () => {
    if (!artifact) return;
    const res = await fetch(`/api/replication/artifact/${artifact.id}/download`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `replication_artifact_${artifact.id}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (!artifact) return null;

  const approved = artifact.status === "approved";

  return (
    <section
      className={`rounded-2xl border p-4 ${
        approved
          ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-900/20"
          : "border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-900/20"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div
            className={`mb-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              approved
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
            }`}
          >
            {approved ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            {approved ? "Artifact معتمد" : "Artifact محظور"}
          </div>
          <p className={`text-sm font-bold ${approved ? "text-emerald-900 dark:text-emerald-100" : "text-red-900 dark:text-red-100"}`}>
            حزمة مخرج المطابقة: {artifact.id}
          </p>
          <p className={`text-xs ${approved ? "text-emerald-800 dark:text-emerald-200" : "text-red-800 dark:text-red-200"}`}>
            Components {artifact.packageInfo.componentCount} • Bindings {artifact.packageInfo.dataBindingCount} •
            Charts {artifact.packageInfo.chartCount} • Tables {artifact.packageInfo.tableCount}
          </p>
          <p className={`mt-1 text-[11px] ${approved ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
            Output Model: {artifact.outputModel.kind}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {manifestSections.slice(0, 4).map((item) => (
              <span
                key={item}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  approved
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                }`}
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadManifest}
            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              approved
                ? "border-emerald-300 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                : "border-red-300 text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-900/40"
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            <span>تحميل Manifest</span>
          </button>
          <button
            type="button"
            onClick={() => router.push(`/replicate?source=${encodeURIComponent(artifact.source.id)}`)}
            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              approved
                ? "border-emerald-300 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                : "border-red-300 text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-900/40"
            }`}
          >
            <Package2 className="h-3.5 w-3.5" />
            <span>العودة للجلسة</span>
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
