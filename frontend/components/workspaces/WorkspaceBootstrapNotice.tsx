"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Trash2 } from "lucide-react";
import type { ReplicationTargetOutput, WorkspaceBootstrapContext } from "@/lib/types/replication";
import { clearWorkspaceDraft } from "@/lib/workspaces/bootstrap-engine";

const BOOTSTRAP_KEY = "rasid_workspace_bootstrap_v1";

interface WorkspaceBootstrapNoticeProps {
  workspace: ReplicationTargetOutput;
}

export default function WorkspaceBootstrapNotice({ workspace }: WorkspaceBootstrapNoticeProps) {
  const [context, setContext] = useState<WorkspaceBootstrapContext | null>(null);

  useEffect(() => {
    const load = () => {
      if (typeof window === "undefined") return;
      const raw = localStorage.getItem(BOOTSTRAP_KEY);
      if (!raw) {
        setContext(null);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as WorkspaceBootstrapContext;
        if (parsed.workspace === workspace) {
          setContext(parsed);
        } else {
          setContext(null);
        }
      } catch {
        setContext(null);
      }
    };

    load();
    window.addEventListener("storage", load);
    window.addEventListener("rasid-bootstrap-applied", load as EventListener);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("rasid-bootstrap-applied", load as EventListener);
    };
  }, [workspace]);

  const clear = () => {
    localStorage.removeItem(BOOTSTRAP_KEY);
    clearWorkspaceDraft(workspace);
    window.dispatchEvent(new CustomEvent("rasid-bootstrap-applied"));
    setContext(null);
  };

  if (!context) return null;

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-900/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            تم تطبيق حزمة المطابقة على هذه المساحة
          </p>
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
            Artifact {context.artifact.id} • Model {context.artifact.outputModel.kind} • Source {context.artifact.source.name}
          </p>
        </div>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>إزالة التطبيق</span>
        </button>
      </div>
    </section>
  );
}
