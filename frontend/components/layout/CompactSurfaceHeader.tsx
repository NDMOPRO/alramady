"use client";

import React from "react";

interface CompactSurfaceHeaderMetric {
  label: string;
  value: string;
}

interface CompactSurfaceHeaderProps {
  badge: string;
  title: string;
  description: string;
  metrics?: CompactSurfaceHeaderMetric[];
  accentClassName?: string;
}

export default function CompactSurfaceHeader({
  badge,
  title,
  description,
  metrics = [],
  accentClassName = "border-cyan-200 bg-cyan-50 text-cyan-800",
}: CompactSurfaceHeaderProps) {
  return (
    <section className="rased-panel rased-motion-rise">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold ${accentClassName}`}>
            <span>{badge}</span>
          </div>
          <h1 className="mt-3 text-2xl font-black text-slate-950 lg:text-[2rem]">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">{description}</p>
        </div>

        {metrics.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {metrics.map((metric) => (
              <div key={`${metric.label}-${metric.value}`} className="rased-chip">
                {metric.label} {metric.value}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
