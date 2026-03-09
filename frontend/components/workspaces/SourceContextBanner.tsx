"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Link2, LibraryBig } from "lucide-react";
import { useSourceLibraryStore } from "@/lib/stores/source-library-store";

function formatBytes(size: number): string {
  if (size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
}

interface SourceContextBannerProps {
  workspaceLabel: string;
}

export default function SourceContextBanner({ workspaceLabel }: SourceContextBannerProps) {
  const router = useRouter();
  const sources = useSourceLibraryStore((s) => s.sources);
  const [sourceId, setSourceId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const value = new URLSearchParams(window.location.search).get("source");
    setSourceId(value);
  }, []);

  const source = useMemo(() => {
    if (!sourceId) return null;
    return sources.find((item) => item.id === sourceId) ?? null;
  }, [sourceId, sources]);

  if (!source) return null;

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900/50 dark:bg-sky-900/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="rounded-lg bg-sky-100 p-2 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
            <Link2 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-bold text-sky-900 dark:text-sky-100">
              تم ربط مصدر من راصد الذكي إلى {workspaceLabel}
            </p>
            <p className="text-xs text-sky-700 dark:text-sky-200">
              {source.name} • {source.sourceType.toUpperCase()} • {formatBytes(source.size)}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push("/home?engine=library")}
          className="inline-flex items-center gap-1 rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-900/40"
        >
          <LibraryBig className="h-3.5 w-3.5" />
          <span>فتح المصدر من المكتبة</span>
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
