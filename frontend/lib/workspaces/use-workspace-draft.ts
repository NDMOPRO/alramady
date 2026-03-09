"use client";

import { useEffect, useState } from "react";
import type { ReplicationTargetOutput } from "@/lib/types/replication";
import {
  loadWorkspaceDraft,
  type WorkspaceGeneratedDraft,
} from "@/lib/workspaces/bootstrap-engine";

export function useWorkspaceDraft(
  workspace: ReplicationTargetOutput
): WorkspaceGeneratedDraft | null {
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

  return draft;
}
