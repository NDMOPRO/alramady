"use client";

import { useContext } from "react";
import { RasedCanvasCtx, type RasedCanvasContextValue } from "./RasedCanvasProvider";

/**
 * Access the Rased Canvas FSM from any component inside <RasedCanvasProvider>.
 *
 * @example
 * const { state, send, phase, matches } = useRasedCanvas();
 * send({ type: "SIDEBAR/OPEN" });
 */
export function useRasedCanvas(): RasedCanvasContextValue {
  const ctx = useContext(RasedCanvasCtx);
  if (!ctx) {
    throw new Error(
      "useRasedCanvas must be used inside <RasedCanvasProvider>. " +
      "Wrap your page or layout with <RasedCanvasProvider>."
    );
  }
  return ctx;
}
