"use client";

import React from "react";
import { Bot, MousePointer2, Play, Sparkles, X } from "lucide-react";
import type { RasedTourStep } from "@/lib/api/ai";
import { findRasedElement } from "@/lib/rased-ui";

interface TargetBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getTargetBox(targetId: string | null): TargetBox | null {
  if (!targetId || typeof window === "undefined") return null;
  const element = findRasedElement(targetId);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function RasedGuidedTourOverlay({
  open,
  sessionId,
  steps,
  stepIndex,
  mode,
  reduceMotion,
  onNext,
  onClose,
  onDoIt,
}: {
  open: boolean;
  sessionId: string | null;
  steps: RasedTourStep[];
  stepIndex: number;
  mode: "explain" | "coach" | "executor";
  reduceMotion: boolean;
  onNext: () => void;
  onClose: () => void;
  onDoIt?: (step: RasedTourStep) => void;
}) {
  const step = open ? steps[stepIndex] ?? null : null;
  const [targetBox, setTargetBox] = React.useState<TargetBox | null>(null);

  React.useEffect(() => {
    if (!open || !step) {
      setTargetBox(null);
      return undefined;
    }

    const sync = () => setTargetBox(getTargetBox(step.target_rased_id));
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open, step]);

  if (!open || !step) return null;

  const calloutStyle: React.CSSProperties = targetBox
    ? {
        top: Math.min(window.innerHeight - 240, targetBox.top + targetBox.height + 16),
        left: Math.min(window.innerWidth - 420, Math.max(24, targetBox.left)),
      }
    : {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none">
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]" />
      {targetBox ? (
        <div
          className={`absolute rounded-[28px] border-2 border-cyan-300 shadow-[0_0_0_9999px_rgba(15,23,42,0.42)] ${reduceMotion ? "" : "transition-all duration-300"}`}
          style={{
            top: targetBox.top - 8,
            left: targetBox.left - 8,
            width: targetBox.width + 16,
            height: targetBox.height + 16,
          }}
        />
      ) : null}

      <div
        className={`pointer-events-auto absolute w-full max-w-[420px] rounded-[28px] border border-white/10 bg-slate-950/96 p-5 text-white shadow-2xl ${reduceMotion ? "" : "animate-[fadeIn_.24s_ease-out]"}`}
        style={calloutStyle}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-cyan-500/15 p-2 text-cyan-200">
              {mode === "executor" ? <Play className="h-5 w-5" /> : mode === "coach" ? <MousePointer2 className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
            </span>
            <div>
              <p className="text-[11px] font-black tracking-[0.18em] text-cyan-200">Guided Tour</p>
              <h3 className="mt-1 text-base font-black">{step.title}</h3>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:border-cyan-300 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-7 text-slate-200">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-black text-slate-200">
            {stepIndex + 1}/{steps.length}
            {sessionId ? ` · ${sessionId.slice(-6)}` : ""}
          </div>
          <div className="flex items-center gap-2">
            {mode !== "explain" ? (
              <button
                type="button"
                onClick={() => onDoIt?.(step)}
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-500/15 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-500/25"
              >
                <Sparkles className="h-4 w-4" />
                <span>{mode === "executor" ? "نفّذ" : "جرّب"}</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-slate-950 transition hover:-translate-y-0.5"
            >
              <span>{stepIndex + 1 >= steps.length ? "إنهاء" : "التالي"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

