import type { RasedUiStateSnapshot, RasedTourStep } from "@/lib/api/ai";
import type { RasedCanvasContextValue } from "@/state/RasedCanvasProvider";
import type { SidebarTab } from "@/state/rasedCanvas.types";

export interface BuildHomeUiSnapshotArgs {
  canvas: RasedCanvasContextValue["state"];
  activeSidebarTab: string;
  bundleSummary?: string | null;
  resultTitle?: string | null;
  resultStatus?: "success" | "error" | null;
  evidenceReady?: boolean;
}

export function buildHomeUiSnapshot(args: BuildHomeUiSnapshotArgs): RasedUiStateSnapshot {
  const activeJobId = args.canvas.jobs.activeJobIds[args.canvas.jobs.activeJobIds.length - 1] ?? null;
  const activeJob = activeJobId ? args.canvas.jobs.byId[activeJobId] ?? null : null;

  return {
    selection: {
      kind: args.canvas.focus.open ? "focus" : args.canvas.selection.kind,
      selection: args.canvas.selection,
      focus_artifact_id: args.canvas.focus.open ? args.canvas.focus.artifactId : null,
      active_sidebar_tab: args.activeSidebarTab,
    },
    open_panels: [
      ...(args.canvas.sidebar.mode !== "hidden" ? [`sidebar:${args.activeSidebarTab}`] : []),
      ...(args.canvas.overlays.commandPaletteOpen ? ["palette:command"] : []),
      ...(args.canvas.overlays.blockingModalOpen && args.canvas.overlays.activeModal ? [`modal:${args.canvas.overlays.activeModal}`] : []),
    ],
    focus_stage: {
      open: args.canvas.focus.open,
      artifact_id: args.canvas.focus.open ? args.canvas.focus.artifactId : null,
      result_title: args.resultTitle ?? null,
    },
    running_jobs: activeJob
      ? [
          {
            job_id: activeJob.jobId,
            stage: activeJob.stage,
            progress: activeJob.progressPct,
            evidence_id: activeJob.evidenceId ?? null,
          },
        ]
      : [],
    artifacts: args.resultTitle
      ? [
          {
            title: args.resultTitle,
            status: args.resultStatus ?? "success",
            evidence_ready: args.evidenceReady ?? false,
          },
        ]
      : [],
    permissions_context: {
      can_export: true,
      can_share: Boolean(args.evidenceReady),
    },
    active_template: null,
    active_brand: args.bundleSummary ?? null,
  };
}

export function findRasedElement(targetId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(`[data-rased-id="${targetId}"]`);
}

export function scrollToRasedElement(targetId: string, reduceMotion: boolean) {
  const element = findRasedElement(targetId);
  if (!element) return false;
  element.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });
  return true;
}

export function pulseRasedElement(targetId: string) {
  const element = findRasedElement(targetId);
  if (!element) return () => undefined;

  element.classList.add("rased-tour-pulse");
  return () => element.classList.remove("rased-tour-pulse");
}

export function applyRasedUiActions(
  actions: Array<{
    type: "open_sidebar" | "close_sidebar" | "open_focus" | "close_focus" | "select" | "set_control" | "scroll_to" | "highlight";
    target_rased_id?: string;
    value?: unknown;
  }>,
  send: RasedCanvasContextValue["send"],
  options: {
    reduceMotion: boolean;
    onSelectSidebarTab?: (tab: string) => void;
    onOpenFocus?: (jobId: string) => void;
  }
) {
  let applied = 0;
  const cleanups: Array<() => void> = [];

  for (const action of actions) {
    switch (action.type) {
      case "open_sidebar":
        send({ type: "SIDEBAR/OPEN" });
        applied += 1;
        break;
      case "close_sidebar":
        send({ type: "SIDEBAR/CLOSE" });
        applied += 1;
        break;
      case "open_focus":
        if (typeof action.value === "string" && options.onOpenFocus) {
          options.onOpenFocus(action.value);
          applied += 1;
        }
        break;
      case "close_focus":
        send({ type: "FOCUS/CLOSE" });
        applied += 1;
        break;
      case "select":
        if (typeof action.value === "string") {
          send({ type: "SELECT/SET", selection: { kind: "card", cardId: action.value } });
          applied += 1;
        }
        break;
      case "set_control":
        if (typeof action.value === "string" && options.onSelectSidebarTab) {
          options.onSelectSidebarTab(action.value as SidebarTab);
          applied += 1;
        }
        break;
      case "scroll_to":
        if (action.target_rased_id && scrollToRasedElement(action.target_rased_id, options.reduceMotion)) {
          applied += 1;
        }
        break;
      case "highlight":
        if (action.target_rased_id) {
          cleanups.push(pulseRasedElement(action.target_rased_id));
          applied += 1;
        }
        break;
      default:
        break;
    }
  }

  return {
    applied,
    cleanup: () => cleanups.forEach((cleanup) => cleanup()),
  };
}

export function buildHomeGuidedTour(args: {
  bundleAvailable: boolean;
  hasResult: boolean;
  focusReady: boolean;
  actionId?: string | null;
  mode: "explain" | "coach" | "executor";
}): RasedTourStep[] {
  const firstActionId = args.actionId ? `action.${args.actionId}` : "composer.input";
  const steps: RasedTourStep[] = [
    {
      step_id: "step-01",
      target_rased_id: firstActionId,
      title: args.bundleAvailable ? "هذه هي البداية الأنسب" : "ابدأ من هنا",
      body: args.bundleAvailable
        ? "راصد حدد الإجراء الأقرب لسياق الملف الحالي."
        : "اكتب الطلب أو أسقط الملف داخل هذا الـCanvas.",
      action: args.bundleAvailable
        ? { type: "scroll_to" }
        : { type: "highlight" },
    },
    {
      step_id: "step-02",
      target_rased_id: "sidebar.toggle",
      title: "افتح لوحة السياق عند الحاجة",
      body: "كل الأدوات الإضافية تبقى في نفس الشاشة داخل الـSidebar.",
      action: { type: "open_sidebar" },
    },
  ];

  if (args.hasResult) {
    steps.push({
      step_id: "step-03",
      target_rased_id: "result.open_focus",
      title: "افتح النتيجة داخل Focus Stage",
      body: "المعاينة والتحرير يحدثان داخل نفس الصفحة بدون انتقال.",
      action: args.focusReady ? { type: "highlight" } : { type: "scroll_to" },
    });
  }

  if (args.focusReady) {
    steps.push({
      step_id: "step-04",
      target_rased_id: "focus.export",
      title: "التصدير محفوظ هنا",
      body: "عند قفل التحقق ستجد التصدير والمشاركة داخل نفس المرحلة.",
      action: { type: "highlight" },
    });
  }

  return steps;
}
