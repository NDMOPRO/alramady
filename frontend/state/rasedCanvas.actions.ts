// ─── Rased Canvas FSM – Action Type Re-exports ──────────────────────────────
//
// All action implementations are defined inline in rasedCanvas.machine.ts
// using XState v5's `setup({ actions: { ... } })` pattern for full type safety.
//
// This file re-exports types and context utilities for external consumers
// that may need to build custom actions or extend the machine.

export { initialCanvasContext } from "./rasedCanvas.types";
export type {
  RasedCanvasContext,
  RasedEvent,
  JobEntry,
  JobEvidence,
  ConversationMessage,
} from "./rasedCanvas.types";
