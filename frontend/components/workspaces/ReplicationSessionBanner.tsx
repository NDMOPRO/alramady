"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, ShieldCheck, XCircle } from "lucide-react";

type SessionStatus = "queued" | "processing" | "completed" | "rejected";

interface SessionData {
  id: string;
  source: {
    id: string;
    name: string;
    sourceType: string;
  };
  targetOutput: string;
  status: SessionStatus;
  fidelity: {
    structural: number;
    pixel: number;
    density: number;
    hierarchy: number;
  };
}

function statusMeta(status: SessionStatus): { label: string; cls: string; icon: React.ReactNode } {
  if (status === "completed") {
    return {
      label: "جلسة مكتملة",
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    };
  }
  if (status === "rejected") {
    return {
      label: "جلسة مرفوضة",
      cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
      icon: <XCircle className="h-3.5 w-3.5" />,
    };
  }
  return {
    label: "جلسة قيد المعالجة",
    cls: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    icon: <Clock3 className="h-3.5 w-3.5" />,
  };
}

export default function ReplicationSessionBanner() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sessionId = new URLSearchParams(window.location.search).get("replicationSession");
    if (!sessionId) return;

    let cancelled = false;
    const load = async () => {
      const res = await fetch(`/api/replication/session/${sessionId}`);
      const json = (await res.json()) as { success?: boolean; data?: SessionData };
      if (!cancelled && res.ok && json.success && json.data) {
        setSession(json.data);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!session) return null;

  const meta = statusMeta(session.status);

  return (
    <section className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-900/50 dark:bg-cyan-900/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className={`mb-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.cls}`}>
            {meta.icon}
            {meta.label}
          </div>
          <p className="text-sm font-bold text-cyan-900 dark:text-cyan-100">
            ناتج من محرك التطابق الحرفي: {session.source.name}
          </p>
          <p className="text-xs text-cyan-800 dark:text-cyan-200">
            Fidelity S {(session.fidelity.structural * 100).toFixed(1)}% • P {(session.fidelity.pixel * 100).toFixed(1)}% • D{" "}
            {(session.fidelity.density * 100).toFixed(1)}% • H {(session.fidelity.hierarchy * 100).toFixed(1)}%
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push(`/replicate?source=${encodeURIComponent(session.source.id)}`)}
          className="inline-flex items-center gap-1 rounded-lg border border-cyan-300 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-800 dark:text-cyan-200 dark:hover:bg-cyan-900/40"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>فتح جلسة المطابقة</span>
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}

