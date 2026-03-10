// ─── Rased Canvas FSM – Parallel Root Machine (XState v5) ────────────────────
import { assign, setup } from "xstate";
import {
  type RasedCanvasContext,
  type RasedCanvasEvent,
  type JobEntry,
  initialCanvasContext,
} from "./rasedCanvas.types";

// ─── Machine Definition ──────────────────────────────────────────────────────

export const rasedCanvasMachine = setup({
  types: {
    context: {} as RasedCanvasContext,
    events: {} as RasedCanvasEvent,
  },
  guards: {
    isModalClosed: ({ context }) => context.modalId === null,
  },
  actions: {
    setCrashError: assign({
      bootError: ({ event }) => (event as Extract<RasedCanvasEvent, { type: "APP/CRASH" }>).error,
    }),
    toggleThemeToDark: assign({ theme: "dark" as const }),
    toggleThemeToLight: assign({ theme: "light" as const }),
    setReduceMotion: assign({
      reduceMotion: ({ event }) => (event as Extract<RasedCanvasEvent, { type: "THEME/SET_REDUCE_MOTION" }>).enabled,
    }),
    openSidebar: assign({ sidebarOpen: true }),
    closeSidebar: assign({ sidebarOpen: false }),
    setSidebarTab: assign({
      sidebarTab: ({ event }) => (event as Extract<RasedCanvasEvent, { type: "SIDEBAR/SET_TAB" }>).tab,
    }),
    toggleSidebarPin: assign({
      sidebarPinned: ({ context }) => !context.sidebarPinned,
    }),
    setComposerText: assign({
      composerText: ({ event }) => (event as Extract<RasedCanvasEvent, { type: "COMPOSER/SET_TEXT" }>).text,
    }),
    clearComposer: assign({ composerText: "" }),
    addUserMessageFromComposer: assign({
      conversation: ({ context }) => [
        ...context.conversation,
        { role: "user" as const, content: context.composerText, timestamp: Date.now() },
      ],
    }),
    dropEnter: assign({ dropActive: true }),
    dropLeave: assign({ dropActive: false }),
    dropFiles: assign({
      dropActive: false,
      droppedFiles: ({ event }) => (event as Extract<RasedCanvasEvent, { type: "DROP/FILES" }>).files,
    }),
    showActions: assign({
      actions: ({ event }) => (event as Extract<RasedCanvasEvent, { type: "ACTIONS/SHOW" }>).actions,
      selectedActionId: null,
    }),
    selectAction: assign({
      selectedActionId: ({ event }) => (event as Extract<RasedCanvasEvent, { type: "ACTIONS/SELECT" }>).actionId,
    }),
    dismissActions: assign({ actions: [] as RasedCanvasContext["actions"], selectedActionId: null }),
    createJob: assign({
      jobs: ({ context, event }) => {
        const e = event as Extract<RasedCanvasEvent, { type: "JOB/CREATE" }>;
        const entry: JobEntry = {
          jobId: e.jobId, label: e.label, stage: "created", progress: 0,
          previewUrl: null, result: null, evidence: null, error: null, status: "running",
        };
        return { ...context.jobs, [e.jobId]: entry };
      },
      activeJobId: ({ event }) => (event as Extract<RasedCanvasEvent, { type: "JOB/CREATE" }>).jobId,
    }),
    updateJobStage: assign({
      jobs: ({ context, event }) => {
        const e = event as Extract<RasedCanvasEvent, { type: "JOB/STAGE" }>;
        const job = context.jobs[e.jobId];
        if (!job) return context.jobs;
        return { ...context.jobs, [e.jobId]: { ...job, stage: e.stage } };
      },
    }),
    updateJobProgress: assign({
      jobs: ({ context, event }) => {
        const e = event as Extract<RasedCanvasEvent, { type: "JOB/PROGRESS" }>;
        const job = context.jobs[e.jobId];
        if (!job) return context.jobs;
        return { ...context.jobs, [e.jobId]: { ...job, progress: e.progress } };
      },
    }),
    setJobPreview: assign({
      jobs: ({ context, event }) => {
        const e = event as Extract<RasedCanvasEvent, { type: "JOB/PREVIEW_READY" }>;
        const job = context.jobs[e.jobId];
        if (!job) return context.jobs;
        return { ...context.jobs, [e.jobId]: { ...job, previewUrl: e.previewUrl, status: "preview" as const } };
      },
    }),
    setJobResult: assign({
      jobs: ({ context, event }) => {
        const e = event as Extract<RasedCanvasEvent, { type: "JOB/RESULT_READY" }>;
        const job = context.jobs[e.jobId];
        if (!job) return context.jobs;
        return { ...context.jobs, [e.jobId]: { ...job, result: e.result, status: "done" as const } };
      },
    }),
    setJobEvidence: assign({
      jobs: ({ context, event }) => {
        const e = event as Extract<RasedCanvasEvent, { type: "JOB/EVIDENCE_READY" }>;
        const job = context.jobs[e.jobId];
        if (!job) return context.jobs;
        return { ...context.jobs, [e.jobId]: { ...job, evidence: e.evidence } };
      },
    }),
    failJob: assign({
      jobs: ({ context, event }) => {
        const e = event as Extract<RasedCanvasEvent, { type: "JOB/FAIL" }>;
        const job = context.jobs[e.jobId];
        if (!job) return context.jobs;
        return { ...context.jobs, [e.jobId]: { ...job, error: e.error, status: "failed" as const } };
      },
    }),
    openFocus: assign({
      focusJobId: ({ event }) => (event as Extract<RasedCanvasEvent, { type: "FOCUS/OPEN" }>).jobId,
    }),
    closeFocus: assign({ focusJobId: null }),
    openModal: assign({
      modalId: ({ event }) => (event as Extract<RasedCanvasEvent, { type: "MODAL/OPEN" }>).modalId,
      modalProps: ({ event }) => (event as Extract<RasedCanvasEvent, { type: "MODAL/OPEN" }>).props ?? null,
    }),
    closeModal: assign({ modalId: null, modalProps: null }),
    addUserMessage: assign({
      conversation: ({ context, event }) => {
        const e = event as Extract<RasedCanvasEvent, { type: "CONVERSATION/ADD_USER" }>;
        return [...context.conversation, { role: "user" as const, content: e.text, timestamp: Date.now() }];
      },
    }),
    addAssistantMessage: assign({
      conversation: ({ context, event }) => {
        const e = event as Extract<RasedCanvasEvent, { type: "CONVERSATION/ADD_ASSISTANT" }>;
        return [...context.conversation, { role: "assistant" as const, content: e.text, timestamp: Date.now() }];
      },
    }),
    appendStreamChunk: assign({
      streamBuffer: ({ context, event }) =>
        context.streamBuffer + (event as Extract<RasedCanvasEvent, { type: "CONVERSATION/STREAM_CHUNK" }>).chunk,
    }),
    flushStream: assign({
      conversation: ({ context }) =>
        context.streamBuffer
          ? [...context.conversation, { role: "assistant" as const, content: context.streamBuffer, timestamp: Date.now() }]
          : context.conversation,
      streamBuffer: "",
    }),
  },
}).createMachine({
  id: "rasedCanvas",
  context: initialCanvasContext,
  initial: "booting",
  states: {
    booting: {
      on: {
        "APP/READY": { target: "running" },
        "APP/CRASH": { target: "crashed", actions: "setCrashError" },
      },
    },

    running: {
      type: "parallel",
      states: {
        // ── Region: Theme & Effects ────────────────────────────────────
        themeAndEffects: {
          initial: "dark",
          states: {
            dark: {
              on: { "THEME/TOGGLE": { target: "light", actions: "toggleThemeToLight" } },
            },
            light: {
              on: { "THEME/TOGGLE": { target: "dark", actions: "toggleThemeToDark" } },
            },
          },
          on: {
            "THEME/SET_REDUCE_MOTION": { actions: "setReduceMotion" },
          },
        },

        // ── Region: Navigation ─────────────────────────────────────────
        navigation: {
          initial: "idle",
          states: {
            idle: {
              on: {
                "NAV/GO": { guard: "isModalClosed", target: "idle" },
              },
            },
          },
        },

        // ── Region: Sidebar ────────────────────────────────────────────
        sidebar: {
          initial: "closed",
          states: {
            open: {
              on: { "SIDEBAR/CLOSE": { target: "closed", actions: "closeSidebar" } },
            },
            closed: {
              on: { "SIDEBAR/OPEN": { target: "open", actions: "openSidebar" } },
            },
          },
          on: {
            "SIDEBAR/SET_TAB": { actions: "setSidebarTab" },
            "SIDEBAR/TOGGLE_PIN": { actions: "toggleSidebarPin" },
          },
        },

        // ── Region: Composer ───────────────────────────────────────────
        composer: {
          initial: "idle",
          states: {
            idle: {
              on: {
                "COMPOSER/SET_TEXT": { actions: "setComposerText" },
                "COMPOSER/SEND": {
                  target: "sending",
                  actions: ["addUserMessageFromComposer", "clearComposer"],
                },
                "COMPOSER/CLEAR": { actions: "clearComposer" },
              },
            },
            sending: {
              on: {
                "CONVERSATION/STREAM_END": { target: "idle" },
                "COMPOSER/SET_TEXT": { actions: "setComposerText" },
              },
            },
          },
          on: {
            "DROP/ENTER": { actions: "dropEnter" },
            "DROP/LEAVE": { actions: "dropLeave" },
            "DROP/FILES": { actions: "dropFiles" },
          },
        },

        // ── Region: Conversation ───────────────────────────────────────
        conversation: {
          initial: "idle",
          states: {
            idle: {
              on: {
                "CONVERSATION/ADD_USER": { actions: "addUserMessage" },
                "CONVERSATION/ADD_ASSISTANT": { target: "idle", actions: "addAssistantMessage" },
                "CONVERSATION/STREAM_CHUNK": { target: "streaming", actions: "appendStreamChunk" },
              },
            },
            streaming: {
              on: {
                "CONVERSATION/STREAM_CHUNK": { actions: "appendStreamChunk" },
                "CONVERSATION/STREAM_END": { target: "idle", actions: "flushStream" },
              },
            },
          },
        },

        // ── Region: Selection / Actions ────────────────────────────────
        selection: {
          initial: "none",
          states: {
            none: {
              on: { "ACTIONS/SHOW": { target: "choosing", actions: "showActions" } },
            },
            choosing: {
              on: {
                "ACTIONS/SELECT": { target: "chosen", actions: "selectAction" },
                "ACTIONS/DISMISS": { target: "none", actions: "dismissActions" },
              },
            },
            chosen: {
              on: {
                "ACTIONS/SHOW": { target: "choosing", actions: "showActions" },
                "ACTIONS/DISMISS": { target: "none", actions: "dismissActions" },
              },
            },
          },
        },

        // ── Region: Focus Stage (one at a time) ───────────────────────
        focusStage: {
          initial: "closed",
          states: {
            closed: {
              on: {
                "FOCUS/OPEN": { guard: "isModalClosed", target: "open", actions: "openFocus" },
              },
            },
            open: {
              on: {
                "FOCUS/CLOSE": { target: "closed", actions: "closeFocus" },
                "FOCUS/OPEN": { guard: "isModalClosed", target: "open", actions: "openFocus" },
              },
            },
          },
        },

        // ── Region: Overlays / Modals (one blocking modal) ────────────
        overlays: {
          initial: "none",
          states: {
            none: {
              on: { "MODAL/OPEN": { target: "blocking", actions: "openModal" } },
            },
            blocking: {
              on: { "MODAL/CLOSE": { target: "none", actions: "closeModal" } },
            },
          },
        },

        // ── Region: Jobs ───────────────────────────────────────────────
        jobs: {
          initial: "idle",
          states: {
            idle: {
              on: { "JOB/CREATE": { target: "active", actions: "createJob" } },
            },
            active: {
              on: {
                "JOB/CREATE": { actions: "createJob" },
                "JOB/STAGE": { actions: "updateJobStage" },
                "JOB/PROGRESS": { actions: "updateJobProgress" },
                "JOB/PREVIEW_READY": { actions: "setJobPreview" },
                "JOB/RESULT_READY": { actions: "setJobResult" },
                "JOB/EVIDENCE_READY": { actions: "setJobEvidence" },
                "JOB/FAIL": { actions: "failJob" },
              },
            },
          },
        },
      },

      on: {
        "APP/CRASH": { target: "crashed", actions: "setCrashError" },
      },
    },

    crashed: {
      type: "final",
    },
  },
});

export type RasedCanvasMachine = typeof rasedCanvasMachine;
