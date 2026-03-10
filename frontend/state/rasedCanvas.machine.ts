import { assign, setup } from "xstate";
import {
  type Attachment,
  type ConversationMessage,
  type JobEntry,
  type JobError,
  type RasedCanvasContext,
  type RasedEvent,
  type Selection,
  initialCanvasContext,
} from "./rasedCanvas.types";

function now() {
  return Date.now();
}

let messageCounter = 0;

function createMessage(params: {
  author: ConversationMessage["author"];
  text?: string;
  attachments?: Attachment[];
  cards?: string[];
}): ConversationMessage {
  messageCounter += 1;
  return {
    id: `msg_${now()}_${messageCounter}`,
    author: params.author,
    text: params.text ?? "",
    createdAt: now(),
    attachments: params.attachments,
    cards: params.cards,
  };
}

function createCardId(kind: string, suffix?: string) {
  const safeSuffix = suffix ? suffix.replace(/[^a-zA-Z0-9_-]+/g, "_") : `${now()}`;
  return `card.${kind}.${safeSuffix}`;
}

function hasPendingAttachments(context: RasedCanvasContext) {
  const lastMessage = context.conversation.messages[context.conversation.messages.length - 1];
  return Boolean(lastMessage?.author === "user" && lastMessage.attachments && lastMessage.attachments.length > 0);
}

function isSubview(view: RasedCanvasContext["nav"]["activeView"]): view is { sub: string } {
  return typeof view === "object" && view !== null && "sub" in view;
}

function isElementSelection(selection: Selection) {
  return ["widget", "table", "column", "slide", "docBlock", "page"].includes(selection.kind);
}

function appendMessage(
  context: RasedCanvasContext,
  message: ConversationMessage
): RasedCanvasContext["conversation"] {
  return {
    ...context.conversation,
    messages: [...context.conversation.messages, message],
  };
}

function updateJob(
  context: RasedCanvasContext,
  jobId: string,
  updater: (job: JobEntry) => JobEntry
): RasedCanvasContext["jobs"] {
  const existing = context.jobs.byId[jobId];
  if (!existing) return context.jobs;

  return {
    byId: {
      ...context.jobs.byId,
      [jobId]: updater(existing),
    },
    activeJobIds: [...context.jobs.activeJobIds],
  };
}

function sidebarTargetFromAction(actionId: string) {
  if (/(template|brand|theme)/i.test(actionId)) {
    return { mode: "full" as const, tab: "templates" as const };
  }
  if (/(export|download)/i.test(actionId)) {
    return { mode: "full" as const, tab: "exports" as const };
  }
  if (/(share|permission|govern)/i.test(actionId)) {
    return { mode: "full" as const, tab: "permissions" as const };
  }
  return null;
}

function ensureRunCard(job: JobEntry, jobId: string) {
  if (job.runCards.length > 0) return job;
  return {
    ...job,
    runCards: [createCardId("run", jobId)],
  };
}

function failureCardFor(jobId: string) {
  return createCardId("diff", jobId);
}

function nextRetryJobId(context: RasedCanvasContext, jobId: string) {
  const prefix = `${jobId}::retry::`;
  const retryCount = Object.keys(context.jobs.byId).filter((existingId) => existingId.startsWith(prefix)).length + 1;
  return `${prefix}${retryCount}`;
}

export const rasedCanvasMachine = setup({
  types: {
    context: {} as RasedCanvasContext,
    events: {} as RasedEvent,
  },
  guards: {
    canNavigate: ({ context }) => !context.overlays.blockingModalOpen,
    canOpenFocus: ({ context }) => !context.overlays.blockingModalOpen,
    canOpenPalette: ({ context }) => !context.overlays.blockingModalOpen,
    canOpenTour: ({ context }) => !context.overlays.blockingModalOpen,
    canOpenReader: ({ context }) =>
      context.focus.open || context.selection.kind === "artifact",
    canSendComposer: ({ context }) =>
      context.composer.text.trim().length > 0 || hasPendingAttachments(context),
    canSetParticles: ({ context }) => !context.uiEffects.reduceMotion,
    canSetPremiumMotion: ({ context }) => !context.uiEffects.reduceMotion,
    isSidebarHidden: ({ context }) => context.sidebar.mode === "hidden",
    isSidebarPeek: ({ context }) => context.sidebar.mode === "peek",
    isSidebarFull: ({ context }) => context.sidebar.mode === "full",
    isComposerSending: ({ context }) => context.composer.isSending,
    isComposerComposing: ({ context }) =>
      context.composer.isComposing || context.composer.text.trim().length > 0,
    isSelectionNone: ({ context }) => context.selection.kind === "none",
    isFocusOpen: ({ context }) => context.focus.open,
    isOverlayModal: ({ context }) => context.overlays.blockingModalOpen,
    isOverlayTour: ({ context }) => context.overlays.tourOpen,
    isOverlayReader: ({ context }) => context.overlays.previewReaderOpen,
    isOverlayPalette: ({ context }) => context.overlays.commandPaletteOpen,
    hasJobs: ({ context }) => context.jobs.activeJobIds.length > 0,
    canRetryJob: ({ context, event }) => {
      if (event.type !== "JOB/RETRY") return false;
      return context.jobs.byId[event.jobId]?.stage === "failed";
    },
    isProgressValid: ({ event }) =>
      event.type === "JOB/PROGRESS" &&
      event.progressPct >= 0 &&
      event.progressPct <= 100,
    isViewDashboards: ({ context }) => context.nav.activeView === "dashboards",
    isViewDataLake: ({ context }) => context.nav.activeView === "dataLake",
    isViewReports: ({ context }) => context.nav.activeView === "reports",
    isViewLibrary: ({ context }) => context.nav.activeView === "library",
    isViewSettings: ({ context }) => context.nav.activeView === "settings",
    isViewSubview: ({ context }) => isSubview(context.nav.activeView),
  },
  actions: {
    setAppFailure: assign(({ event }) => {
      if (event.type !== "APP/FAIL") return {};
      return {
        appError: event.error,
      };
    }),
    toggleTheme: assign(({ context }) => ({
      theme: context.theme === "dark" ? "light" : "dark",
    })),
    setReduceMotion: assign(({ context, event }) => {
      if (event.type !== "EFFECTS/SET_REDUCE_MOTION") return {};
      return {
        uiEffects: {
          reduceMotion: event.value,
          particlesEnabled: event.value ? false : context.uiEffects.particlesEnabled,
          premiumMotionEnabled: event.value ? false : context.uiEffects.premiumMotionEnabled,
        },
      };
    }),
    setParticles: assign(({ context, event }) => {
      if (event.type !== "EFFECTS/SET_PARTICLES") return {};
      return {
        uiEffects: {
          ...context.uiEffects,
          particlesEnabled: event.value,
        },
      };
    }),
    setPremiumMotion: assign(({ context, event }) => {
      if (event.type !== "EFFECTS/SET_PREMIUM_MOTION") return {};
      return {
        uiEffects: {
          ...context.uiEffects,
          premiumMotionEnabled: event.value,
        },
      };
    }),
    applyNavigation: assign(({ context, event }) => {
      if (event.type !== "NAV/GO") return {};
      return {
        nav: {
          ...context.nav,
          activeView: event.view,
        },
        selection: { kind: "none" as const },
        focus: { open: false as const },
      };
    }),
    toggleNavCollapse: assign(({ context }) => ({
      nav: {
        ...context.nav,
        sidebarCollapsed: !context.nav.sidebarCollapsed,
      },
    })),
    expandNavItem: assign(({ context, event }) => {
      if (event.type !== "NAV/EXPAND_ITEM") return {};
      return {
        nav: {
          ...context.nav,
          expandedNavItems: context.nav.expandedNavItems.includes(event.itemId)
            ? context.nav.expandedNavItems
            : [...context.nav.expandedNavItems, event.itemId],
        },
      };
    }),
    collapseNavItem: assign(({ context, event }) => {
      if (event.type !== "NAV/COLLAPSE_ITEM") return {};
      return {
        nav: {
          ...context.nav,
          expandedNavItems: context.nav.expandedNavItems.filter((itemId) => itemId !== event.itemId),
        },
      };
    }),
    openSidebarExplicit: assign(({ context, event }) => {
      if (event.type !== "SIDEBAR/OPEN") return {};
      const nextMode =
        event.mode ??
        (context.sidebar.mode === "hidden"
          ? "peek"
          : context.sidebar.mode === "peek"
            ? "full"
            : "full");

      return {
        sidebar: {
          mode: nextMode,
          pin: context.sidebar.pin,
          activeTab: event.tab ?? context.sidebar.activeTab,
        },
      };
    }),
    closeSidebar: assign(({ context }) => ({
      sidebar: {
        ...context.sidebar,
        mode: context.sidebar.pin === "pinned" ? "peek" : "hidden",
      },
    })),
    setSidebarMode: assign(({ context, event }) => {
      if (event.type !== "SIDEBAR/SET_MODE") return {};
      return {
        sidebar: {
          ...context.sidebar,
          mode: context.sidebar.pin === "pinned" && event.mode === "hidden" ? "peek" : event.mode,
        },
      };
    }),
    toggleSidebarPin: assign(({ context }) => {
      const nextPin = context.sidebar.pin === "pinned" ? "unpinned" : "pinned";
      return {
        sidebar: {
          ...context.sidebar,
          pin: nextPin,
          mode:
            nextPin === "pinned" && context.sidebar.mode === "hidden"
              ? "peek"
              : context.sidebar.mode,
        },
      };
    }),
    setSidebarTab: assign(({ context, event }) => {
      if (event.type !== "SIDEBAR/SET_TAB") return {};
      return {
        sidebar: {
          ...context.sidebar,
          activeTab: event.tab,
          mode: context.sidebar.mode === "hidden" ? "peek" : context.sidebar.mode,
        },
      };
    }),
    autoPeekSidebarOnDrop: assign(({ context }) => ({
      sidebar: {
        ...context.sidebar,
        mode: context.sidebar.mode === "full" ? "full" : "peek",
      },
    })),
    autoLibrarySidebarOnDropFiles: assign(({ context, event }) => {
      if (event.type !== "DROP/FILES") return {};
      const wantsLibrary = event.files.length >= 2;
      return {
        sidebar: {
          ...context.sidebar,
          mode: context.sidebar.mode === "full" ? "full" : "peek",
          activeTab: wantsLibrary ? "library" : context.sidebar.activeTab,
        },
      };
    }),
    openSidebarForAction: assign(({ context, event }) => {
      if (event.type !== "ACTIONS/SELECT") return {};
      const next = sidebarTargetFromAction(event.actionId);
      if (!next) return {};
      return {
        sidebar: {
          ...context.sidebar,
          mode: next.mode,
          activeTab: next.tab,
        },
      };
    }),
    focusComposer: assign(({ context }) => ({
      composer: {
        ...context.composer,
        isComposing: true,
      },
    })),
    blurComposer: assign(({ context }) => ({
      composer: {
        ...context.composer,
        isComposing: context.composer.text.trim().length > 0,
      },
    })),
    setComposerText: assign(({ context, event }) => {
      if (event.type !== "COMPOSER/SET_TEXT") return {};
      return {
        composer: {
          ...context.composer,
          text: event.text,
          isComposing: true,
        },
      };
    }),
    clearComposer: assign(({ context }) => ({
      composer: {
        ...context.composer,
        text: "",
        isComposing: false,
      },
    })),
    startComposerSend: assign(({ context }) => ({
      composer: {
        ...context.composer,
        isSending: true,
        isComposing: true,
      },
    })),
    finishComposerSend: assign(({ context }) => ({
      composer: {
        ...context.composer,
        text: "",
        isSending: false,
        isComposing: true,
      },
    })),
    failComposerSend: assign(({ context }) => ({
      composer: {
        ...context.composer,
        isSending: false,
        isComposing: true,
      },
    })),
    setDragEnter: assign(({ context }) => ({
      composer: {
        ...context.composer,
        dragOver: true,
      },
    })),
    setDragLeave: assign(({ context }) => ({
      composer: {
        ...context.composer,
        dragOver: false,
      },
    })),
    appendDroppedFilesMessage: assign(({ context, event }) => {
      if (event.type !== "DROP/FILES") return {};
      return {
        composer: {
          ...context.composer,
          dragOver: false,
        },
        conversation: appendMessage(
          context,
          createMessage({
            author: "user",
            attachments: event.files,
            cards: [createCardId("file", event.files[0]?.assetId ?? "upload")],
          })
        ),
      };
    }),
    appendUserMessageFromComposer: assign(({ context }) => {
      const text = context.composer.text.trim();
      if (!text) {
        return {
          conversation: {
            ...context.conversation,
            isAssistantTyping: true,
          },
        };
      }

      return {
        conversation: appendMessage(
          {
            ...context,
            conversation: {
              ...context.conversation,
              isAssistantTyping: true,
            },
          },
          createMessage({
            author: "user",
            text,
          })
        ),
      };
    }),
    appendActionsCardMessage: assign(({ context, event }) => {
      if (event.type !== "ACTIONS/SHOW") return {};
      const cardId = createCardId("actions", event.forMessageId ?? event.forAssetIds?.join("_") ?? "context");
      return {
        conversation: appendMessage(
          context,
          createMessage({
            author: "rased",
            cards: [cardId],
          })
        ),
      };
    }),
    appendPlanCardMessage: assign(({ context, event }) => {
      if (event.type !== "ACTIONS/SELECT") return {};
      return {
        conversation: appendMessage(
          {
            ...context,
            conversation: {
              ...context.conversation,
              isAssistantTyping: true,
            },
          },
          createMessage({
            author: "rased",
            cards: [createCardId("plan", event.actionId)],
          })
        ),
      };
    }),
    stopAssistantTyping: assign(({ context }) => ({
      conversation: {
        ...context.conversation,
        isAssistantTyping: false,
      },
    })),
    setSelection: assign(({ context, event }) => {
      if (event.type !== "SELECT/SET") return {};
      const nextSidebar =
        isElementSelection(event.selection)
          ? {
              ...context.sidebar,
              activeTab: "context" as const,
              mode: context.sidebar.mode === "hidden" ? "peek" : context.sidebar.mode,
            }
          : context.sidebar;

      return {
        selection: event.selection,
        sidebar: nextSidebar,
      };
    }),
    clearSelection: assign({
      selection: { kind: "none" as const },
    }),
    openFocus: assign(({ context, event }) => {
      if (event.type !== "FOCUS/OPEN") return {};
      return {
        focus: {
          open: true,
          artifactId: event.artifactId,
          artifactKind: event.kind,
          stageMode: event.stageMode,
        },
        selection: { kind: "none" as const },
        sidebar: {
          ...context.sidebar,
          mode: context.sidebar.mode === "full" && context.sidebar.pin === "pinned" ? "full" : "peek",
        },
      };
    }),
    closeFocus: assign({
      focus: { open: false as const },
    }),
    setFocusMode: assign(({ context, event }) => {
      if (event.type !== "FOCUS/SET_MODE" || !context.focus.open) return {};
      return {
        focus: {
          ...context.focus,
          stageMode: event.stageMode,
        },
      };
    }),
    openPalette: assign(({ context }) => ({
      overlays: {
        ...context.overlays,
        commandPaletteOpen: true,
        previewReaderOpen: false,
        tourOpen: false,
        blockingModalOpen: false,
        activeModal: undefined,
      },
    })),
    closePalette: assign(({ context }) => ({
      overlays: {
        ...context.overlays,
        commandPaletteOpen: false,
      },
    })),
    openReader: assign(({ context }) => ({
      overlays: {
        ...context.overlays,
        commandPaletteOpen: false,
        previewReaderOpen: true,
        tourOpen: false,
      },
    })),
    closeReader: assign(({ context }) => ({
      overlays: {
        ...context.overlays,
        previewReaderOpen: false,
      },
    })),
    startTour: assign(({ context, event }) => {
      if (event.type !== "TOUR/START") return {};
      return {
        overlays: {
          ...context.overlays,
          commandPaletteOpen: false,
          previewReaderOpen: false,
          tourOpen: true,
          activeTourId: event.tourId,
          tourSteps: event.steps,
          tourStepIndex: 0,
          tourPaused: false,
        },
      };
    }),
    nextTour: assign(({ context }) => ({
      overlays: {
        ...context.overlays,
        tourStepIndex: Math.min((context.overlays.tourStepIndex ?? 0) + 1, Math.max((context.overlays.tourSteps?.length ?? 1) - 1, 0)),
      },
    })),
    prevTour: assign(({ context }) => ({
      overlays: {
        ...context.overlays,
        tourStepIndex: Math.max((context.overlays.tourStepIndex ?? 0) - 1, 0),
      },
    })),
    pauseTour: assign(({ context }) => ({
      overlays: {
        ...context.overlays,
        tourPaused: true,
      },
    })),
    resumeTour: assign(({ context }) => ({
      overlays: {
        ...context.overlays,
        tourPaused: false,
      },
    })),
    endTour: assign(({ context }) => ({
      overlays: {
        ...context.overlays,
        tourOpen: false,
        activeTourId: undefined,
        tourSteps: undefined,
        tourStepIndex: undefined,
        tourPaused: undefined,
      },
    })),
    openModal: assign(({ context, event }) => {
      if (event.type !== "MODAL/OPEN") return {};
      return {
        overlays: {
          ...context.overlays,
          commandPaletteOpen: false,
          previewReaderOpen: false,
          tourOpen: false,
          blockingModalOpen: true,
          activeModal: event.modal,
        },
      };
    }),
    closeModal: assign(({ context }) => ({
      overlays: {
        ...context.overlays,
        blockingModalOpen: false,
        activeModal: undefined,
      },
    })),
    createJob: assign(({ context, event }) => {
      if (event.type !== "JOB/CREATE") return {};
      const entry: JobEntry = {
        jobId: event.jobId,
        createdAt: now(),
        stage: "analyzing",
        progressPct: 0,
        runCards: [],
        previewCards: [],
        resultCards: [],
      };

      return {
        composer: {
          ...context.composer,
          text: "",
          isSending: false,
          isComposing: true,
        },
        jobs: {
          byId: {
            ...context.jobs.byId,
            [event.jobId]: entry,
          },
          activeJobIds: [...context.jobs.activeJobIds, event.jobId],
        },
      };
    }),
    stageJob: assign(({ context, event }) => {
      if (event.type !== "JOB/STAGE") return {};
      const nextJobs = updateJob(context, event.jobId, (job) => {
        const staged = ensureRunCard(job, event.jobId);
        return {
          ...staged,
          stage: event.stage,
        };
      });

      const runCardId = nextJobs.byId[event.jobId]?.runCards[0];
      const nextConversation =
        runCardId && context.jobs.byId[event.jobId]?.runCards.length === 0
          ? appendMessage(
              context,
              createMessage({
                author: "rased",
                cards: [runCardId],
              })
            )
          : context.conversation;

      return {
        jobs: nextJobs,
        conversation: nextConversation,
      };
    }),
    progressJob: assign(({ context, event }) => {
      if (event.type !== "JOB/PROGRESS") return {};
      return {
        jobs: updateJob(context, event.jobId, (job) => ({
          ...job,
          progressPct: event.progressPct,
        })),
      };
    }),
    addPreviewCard: assign(({ context, event }) => {
      if (event.type !== "JOB/PREVIEW_READY") return {};
      const existingJob = context.jobs.byId[event.jobId];
      if (!existingJob) return {};
      return {
        jobs: updateJob(context, event.jobId, (job) => ({
          ...job,
          previewCards: [...job.previewCards, event.previewCardId],
        })),
        conversation: appendMessage(
          context,
          createMessage({
            author: "rased",
            cards: [event.previewCardId],
          })
        ),
      };
    }),
    addResultCard: assign(({ context, event }) => {
      if (event.type !== "JOB/RESULT_READY") return {};
      const existingJob = context.jobs.byId[event.jobId];
      if (!existingJob) return {};
      return {
        jobs: updateJob(context, event.jobId, (job) => ({
          ...job,
          stage: job.stage === "completed" ? "completed" : "exporting",
          artifactIds: event.artifactIds,
          resultCards: [...job.resultCards, event.resultCardId],
        })),
        conversation: appendMessage(
          context,
          createMessage({
            author: "rased",
            cards: [event.resultCardId],
          })
        ),
      };
    }),
    addEvidenceCard: assign(({ context, event }) => {
      if (event.type !== "JOB/EVIDENCE_READY") return {};
      const existingJob = context.jobs.byId[event.jobId];
      if (!existingJob) return {};
      return {
        jobs: updateJob(context, event.jobId, (job) => ({
          ...job,
          stage: "completed",
          evidenceId: event.evidenceId,
        })),
        conversation: appendMessage(
          {
            ...context,
            conversation: {
              ...context.conversation,
              isAssistantTyping: false,
            },
          },
          createMessage({
            author: "rased",
            cards: [event.evidenceCardId],
          })
        ),
      };
    }),
    failJob: assign(({ context, event }) => {
      if (event.type !== "JOB/FAIL") return {};
      return {
        jobs: updateJob(context, event.jobId, (job) => ({
          ...job,
          stage: "failed",
          error: event.error,
        })),
        conversation: appendMessage(
          {
            ...context,
            conversation: {
              ...context.conversation,
              isAssistantTyping: false,
            },
          },
          createMessage({
            author: "rased",
            cards: [failureCardFor(event.jobId)],
          })
        ),
      };
    }),
    cancelJob: assign(({ context, event }) => {
      if (event.type !== "JOB/CANCEL") return {};
      const error: JobError = {
        code: "cancelled",
        message: "تم إيقاف التنفيذ",
      };
      return {
        jobs: updateJob(context, event.jobId, (job) => ({
          ...job,
          stage: "failed",
          error,
        })),
        conversation: {
          ...context.conversation,
          isAssistantTyping: false,
        },
      };
    }),
    retryJob: assign(({ context, event }) => {
      if (event.type !== "JOB/RETRY") return {};
      const retryId = nextRetryJobId(context, event.jobId);
      const entry: JobEntry = {
        jobId: retryId,
        createdAt: now(),
        stage: "analyzing",
        progressPct: 0,
        runCards: [],
        previewCards: [],
        resultCards: [],
      };

      return {
        jobs: {
          byId: {
            ...context.jobs.byId,
            [retryId]: entry,
          },
          activeJobIds: [...context.jobs.activeJobIds, retryId],
        },
        conversation: appendMessage(
          {
            ...context,
            conversation: {
              ...context.conversation,
              isAssistantTyping: true,
            },
          },
          createMessage({
            author: "rased",
            cards: [createCardId("plan", retryId)],
          })
        ),
      };
    }),
    toggleDesignPanel: assign(({ context }) => ({
      dev: {
        ...context.dev,
        designPanelOpen: !context.dev.designPanelOpen,
      },
    })),
  },
}).createMachine({
  id: "rasedCanvas",
  context: initialCanvasContext,
  initial: "booting",
  states: {
    booting: {
      on: {
        "APP/BOOT": { target: "booting" },
        "APP/READY": { target: "running" },
        "APP/FAIL": { target: "crashed", actions: "setAppFailure" },
      },
    },
    running: {
      type: "parallel",
      on: {
        "APP/FAIL": { target: "crashed", actions: "setAppFailure" },
      },
      states: {
        themeAndEffects: {
          initial: "active",
          states: {
            active: {},
          },
          on: {
            "THEME/TOGGLE": { actions: "toggleTheme" },
            "EFFECTS/SET_REDUCE_MOTION": { actions: "setReduceMotion" },
            "EFFECTS/SET_PARTICLES": { guard: "canSetParticles", actions: "setParticles" },
            "EFFECTS/SET_PREMIUM_MOTION": { guard: "canSetPremiumMotion", actions: "setPremiumMotion" },
          },
        },
        navigation: {
          initial: "viewing",
          states: {
            viewing: {
              initial: "chat",
              states: {
                chat: {},
                dashboards: {},
                dataLake: {},
                reports: {},
                library: {},
                settings: {},
                subview: {},
              },
              on: {
                "NAV/GO": { guard: "canNavigate", actions: "applyNavigation" },
                "NAV/TOGGLE_COLLAPSE": { actions: "toggleNavCollapse" },
                "NAV/EXPAND_ITEM": { actions: "expandNavItem" },
                "NAV/COLLAPSE_ITEM": { actions: "collapseNavItem" },
              },
              always: [
                { guard: "isViewDashboards", target: ".dashboards" },
                { guard: "isViewDataLake", target: ".dataLake" },
                { guard: "isViewReports", target: ".reports" },
                { guard: "isViewLibrary", target: ".library" },
                { guard: "isViewSettings", target: ".settings" },
                { guard: "isViewSubview", target: ".subview" },
                { target: ".chat" },
              ],
            },
          },
        },
        sidebar: {
          initial: "hidden",
          states: {
            hidden: {},
            peek: {},
            full: {},
          },
          on: {
            "SIDEBAR/OPEN": { actions: "openSidebarExplicit" },
            "SIDEBAR/CLOSE": { actions: "closeSidebar" },
            "SIDEBAR/TOGGLE_PIN": { actions: "toggleSidebarPin" },
            "SIDEBAR/SET_TAB": { actions: "setSidebarTab" },
            "SIDEBAR/SET_MODE": { actions: "setSidebarMode" },
            "DROP/ENTER": { actions: "autoPeekSidebarOnDrop" },
            "DROP/FILES": { actions: "autoLibrarySidebarOnDropFiles" },
            "ACTIONS/SELECT": { actions: "openSidebarForAction" },
          },
          always: [
            { guard: "isSidebarFull", target: ".full" },
            { guard: "isSidebarPeek", target: ".peek" },
            { target: ".hidden" },
          ],
        },
        composer: {
          initial: "idle",
          states: {
            idle: {},
            composing: {},
            sending: {},
          },
          on: {
            "COMPOSER/FOCUS": { actions: "focusComposer" },
            "COMPOSER/BLUR": { actions: "blurComposer" },
            "COMPOSER/SET_TEXT": { actions: "setComposerText" },
            "COMPOSER/CLEAR": { actions: "clearComposer" },
            "COMPOSER/SEND": {
              guard: ({ context }) =>
                !context.composer.isSending &&
                (context.composer.text.trim().length > 0 || hasPendingAttachments(context)),
              actions: "startComposerSend",
            },
            "DROP/ENTER": { actions: "setDragEnter" },
            "DROP/LEAVE": { actions: "setDragLeave" },
            "DROP/FILES": { actions: "setDragLeave" },
            "JOB/CREATE": { actions: "finishComposerSend" },
            "JOB/FAIL": { actions: "failComposerSend" },
          },
          always: [
            { guard: "isComposerSending", target: ".sending" },
            { guard: "isComposerComposing", target: ".composing" },
            { target: ".idle" },
          ],
        },
        conversation: {
          initial: "ready",
          states: {
            ready: {},
          },
          on: {
            "COMPOSER/SEND": { guard: "canSendComposer", actions: "appendUserMessageFromComposer" },
            "DROP/FILES": { actions: "appendDroppedFilesMessage" },
            "ACTIONS/SHOW": { actions: "appendActionsCardMessage" },
            "ACTIONS/SELECT": { actions: "appendPlanCardMessage" },
            "JOB/EVIDENCE_READY": { actions: "stopAssistantTyping" },
            "JOB/FAIL": { actions: "stopAssistantTyping" },
            "JOB/CANCEL": { actions: "stopAssistantTyping" },
          },
        },
        selection: {
          initial: "none",
          states: {
            none: {},
            selected: {},
          },
          on: {
            "SELECT/SET": { actions: "setSelection" },
            "SELECT/CLEAR": { actions: "clearSelection" },
            "NAV/GO": { guard: "canNavigate", actions: "clearSelection" },
            "FOCUS/OPEN": { guard: "canOpenFocus", actions: "clearSelection" },
          },
          always: [
            { guard: "isSelectionNone", target: ".none" },
            { target: ".selected" },
          ],
        },
        focusStage: {
          initial: "closed",
          states: {
            closed: {},
            open: {},
          },
          on: {
            "FOCUS/OPEN": { guard: "canOpenFocus", actions: "openFocus" },
            "FOCUS/CLOSE": { actions: "closeFocus" },
            "FOCUS/SET_MODE": { actions: "setFocusMode" },
            "NAV/GO": { guard: "canNavigate", actions: "closeFocus" },
          },
          always: [
            { guard: "isFocusOpen", target: ".open" },
            { target: ".closed" },
          ],
        },
        overlays: {
          initial: "none",
          states: {
            none: {},
            palette: {},
            reader: {},
            tour: {},
            modal: {},
          },
          on: {
            "PALETTE/OPEN": { guard: "canOpenPalette", actions: "openPalette" },
            "PALETTE/CLOSE": { actions: "closePalette" },
            "READER/OPEN": { guard: "canOpenReader", actions: "openReader" },
            "READER/CLOSE": { actions: "closeReader" },
            "TOUR/START": { guard: "canOpenTour", actions: "startTour" },
            "TOUR/NEXT": { actions: "nextTour" },
            "TOUR/PREV": { actions: "prevTour" },
            "TOUR/PAUSE": { actions: "pauseTour" },
            "TOUR/RESUME": { actions: "resumeTour" },
            "TOUR/END": { actions: "endTour" },
            "MODAL/OPEN": { actions: "openModal" },
            "MODAL/CLOSE": { actions: "closeModal" },
          },
          always: [
            { guard: "isOverlayModal", target: ".modal" },
            { guard: "isOverlayTour", target: ".tour" },
            { guard: "isOverlayReader", target: ".reader" },
            { guard: "isOverlayPalette", target: ".palette" },
            { target: ".none" },
          ],
        },
        jobs: {
          initial: "idle",
          states: {
            idle: {},
            hasJobs: {},
          },
          on: {
            "JOB/CREATE": { actions: "createJob" },
            "JOB/STAGE": { actions: "stageJob" },
            "JOB/PROGRESS": { guard: "isProgressValid", actions: "progressJob" },
            "JOB/PREVIEW_READY": { actions: "addPreviewCard" },
            "JOB/RESULT_READY": { actions: "addResultCard" },
            "JOB/EVIDENCE_READY": { actions: "addEvidenceCard" },
            "JOB/FAIL": { actions: "failJob" },
            "JOB/CANCEL": { actions: "cancelJob" },
            "JOB/RETRY": { guard: "canRetryJob", actions: "retryJob" },
          },
          always: [
            { guard: "hasJobs", target: ".hasJobs" },
            { target: ".idle" },
          ],
        },
        devOverlays: {
          initial: "closed",
          states: {
            closed: {},
            open: {},
          },
          on: {
            "DEV/DESIGN_PANEL_TOGGLE": { actions: "toggleDesignPanel" },
          },
          always: [
            { guard: ({ context }) => context.dev.designPanelOpen, target: ".open" },
            { target: ".closed" },
          ],
        },
      },
    },
    crashed: {
      type: "final",
    },
  },
});

export type RasedCanvasMachine = typeof rasedCanvasMachine;
