"use client";

import React, { createContext, useEffect, type ReactNode } from "react";
import { useActor } from "@xstate/react";
import { rasedCanvasMachine } from "./rasedCanvas.machine";
import type { RasedCanvasContext, RasedEvent } from "./rasedCanvas.types";

// ─── Context Type ────────────────────────────────────────────────────────────

export interface RasedCanvasContextValue {
  state: RasedCanvasContext;
  /** Current top-level state value: "booting" | "running" | "crashed" */
  phase: string;
  /** Send an event to the machine */
  send: (event: RasedEvent) => void;
}

export const RasedCanvasCtx = createContext<RasedCanvasContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
}

export function RasedCanvasProvider({ children }: Props) {
  const [snapshot, send] = useActor(rasedCanvasMachine);

  // Auto-boot: transition from booting → running on mount
  useEffect(() => {
    if (typeof snapshot.value === "string" && snapshot.value === "booting") {
      send({ type: "APP/READY" });
    }
  }, [snapshot.value, send]);

  const ctx: RasedCanvasContextValue = {
    state: snapshot.context,
    phase: typeof snapshot.value === "string" ? snapshot.value : "running",
    send,
  };

  return (
    <RasedCanvasCtx.Provider value={ctx}>
      {children}
    </RasedCanvasCtx.Provider>
  );
}
