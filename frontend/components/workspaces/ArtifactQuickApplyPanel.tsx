"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, Loader2, Wand2 } from "lucide-react";
import type {
  ReplicationArtifact,
  ReplicationTargetOutput,
  WorkspaceBootstrapContext,
} from "@/lib/types/replication";
import {
  buildWorkspaceDraftFromArtifact,
  saveWorkspaceDraft,
} from "@/lib/workspaces/bootstrap-engine";

const BOOTSTRAP_KEY = "rasid_workspace_bootstrap_v1";

interface ArtifactQuickApplyPanelProps {
  workspace: ReplicationTargetOutput;
}

export default function ArtifactQuickApplyPanel({ workspace }: ArtifactQuickApplyPanelProps) {
  const [artifact, setArtifact] = useState<ReplicationArtifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const outputMatch = artifact?.targetOutput === workspace;
  const isBlocked = artifact?.status === "blocked";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const artifactId = new URLSearchParams(window.location.search).get("replicationArtifact");
    if (!artifactId) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/replication/artifact/${artifactId}`);
        const json = (await res.json()) as { success?: boolean; data?: ReplicationArtifact };
        if (!cancelled && res.ok && json.success && json.data) {
          setArtifact(json.data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const modelSummary = useMemo(() => {
    if (!artifact) return "";
    const m = artifact.outputModel;
    if (m.kind === "dashboard") {
      return `Widgets: ${m.widgets.length} • Filters: ${m.filters.length} • Refresh: ${m.refreshMode}`;
    }
    if (m.kind === "report") {
      return `Sections: ${m.sections.length} • TOC: ${m.toc ? "yes" : "no"} • Pages~ ${m.pageCountEstimate}`;
    }
    if (m.kind === "presentation") {
      return `Slides: ${m.slides.length} • Theme: ${m.theme} • Notes: ${m.speakerNotes ? "yes" : "no"}`;
    }
    if (m.kind === "excel") {
      return `Sheets: ${m.sheets.length} • Pivots: ${m.pivotTables} • Named ranges: ${m.namedRanges}`;
    }
    return `RTL transforms: ${m.rtlTransforms} • Mirrored charts: ${m.mirroredCharts} • Locks: ${m.terminologyLocks}`;
  }, [artifact]);

  const applyArtifact = () => {
    if (!artifact || !outputMatch || isBlocked) return;
    setApplying(true);
    try {
      const draft = buildWorkspaceDraftFromArtifact(artifact);
      saveWorkspaceDraft(draft);
      const payload: WorkspaceBootstrapContext = {
        workspace,
        artifact,
        appliedAt: new Date().toISOString(),
      };
      localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(payload));
      window.dispatchEvent(new CustomEvent("rasid-bootstrap-applied"));
      setApplied(true);
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
        <span className="inline-flex items-center gap-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          جاري تحميل حزمة المطابقة...
        </span>
      </div>
    );
  }

  if (!artifact) return null;

  return (
    <section
      className={`rounded-2xl border p-4 ${
        outputMatch && !isBlocked
          ? "border-indigo-200 bg-indigo-50/70 dark:border-indigo-900/50 dark:bg-indigo-900/20"
          : "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-900/20"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1 text-xs font-bold text-gray-800 dark:text-gray-200">
            <Link2 className="h-3.5 w-3.5" />
            Artifact {artifact.id}
          </p>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{modelSummary}</p>
          {!outputMatch && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              الحزمة موجهة إلى {artifact.targetOutput} وليس {workspace}
            </p>
          )}
          {isBlocked && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              هذه الحزمة محظورة بسبب فشل عتبات الجودة
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={applyArtifact}
          disabled={!outputMatch || isBlocked || applying}
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
        >
          {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          <span>{applied ? "تم تفعيل الحزمة" : "تفعيل الحزمة في هذه المساحة"}</span>
          {applied ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
        </button>
      </div>
    </section>
  );
}
