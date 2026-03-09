"use client";

import React, { useEffect, useState } from "react";
import { ClipboardList, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReplicationTargetOutput } from "@/lib/types/replication";
import {
  clearWorkspaceDraft,
  loadWorkspaceDraft,
  type WorkspaceGeneratedDraft,
} from "@/lib/workspaces/bootstrap-engine";

interface WorkspaceGeneratedDraftPanelProps {
  workspace: ReplicationTargetOutput;
}

function priorityLabel(priority: WorkspaceGeneratedDraft["items"][number]["priority"]): string {
  if (priority === "high") return "عالي";
  if (priority === "medium") return "متوسط";
  return "منخفض";
}

function priorityClass(priority: WorkspaceGeneratedDraft["items"][number]["priority"]): string {
  if (priority === "high") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300";
  }
  if (priority === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300";
}

export default function WorkspaceGeneratedDraftPanel({
  workspace,
}: WorkspaceGeneratedDraftPanelProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<WorkspaceGeneratedDraft | null>(null);

  useEffect(() => {
    const load = () => {
      setDraft(loadWorkspaceDraft(workspace));
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
    clearWorkspaceDraft(workspace);
    setDraft(null);
    window.dispatchEvent(new CustomEvent("rasid-bootstrap-applied"));
  };

  const openWorkspaceFlow = () => {
    if (!draft) return;
    if (workspace === "presentation") {
      localStorage.setItem(
        "rasid_pending_prompt",
        `أنشئ عرضًا احترافيًا وفق المسودة: ${draft.summary}`
      );
      router.push("/observer");
      return;
    }
    if (workspace === "localized") {
      router.push("/localization");
      return;
    }
    if (workspace === "excel") {
      router.push("/excel/matching");
      return;
    }
    if (workspace === "report") {
      router.push("/reports/advanced-mode");
      return;
    }
    router.push("/dashboard/editor");
  };

  if (!draft) return null;

  return (
    <section className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900/40 dark:bg-cyan-900/10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1 text-xs font-bold text-cyan-800 dark:text-cyan-300">
            <Sparkles className="h-3.5 w-3.5" />
            مسودة عمل مولدة وجاهزة للتحرير
          </p>
          <p className="mt-1 text-xs text-cyan-700 dark:text-cyan-400">
            {draft.summary} • Source {draft.sourceName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openWorkspaceFlow}
            className="inline-flex items-center gap-1 rounded-lg border border-cyan-300 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-800 dark:text-cyan-300 dark:hover:bg-cyan-900/30"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>فتح مسار التنفيذ</span>
          </button>
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 rounded-lg border border-cyan-300 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-800 dark:text-cyan-300 dark:hover:bg-cyan-900/30"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>مسح المسودة</span>
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {draft.items.slice(0, 9).map((item) => (
          <article
            key={item.id}
            className="rounded-xl border border-white/70 bg-white/80 p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900/50"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
                <ClipboardList className="h-3.5 w-3.5" />
                {item.type}
              </p>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${priorityClass(item.priority)}`}>
                {priorityLabel(item.priority)}
              </span>
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{item.title}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.details}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
