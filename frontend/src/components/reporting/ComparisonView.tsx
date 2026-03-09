'use client';

import React from 'react';
import { Equal, PenLine, Plus, Minus } from 'lucide-react';

interface SectionDiff {
  sectionId: string;
  title: string;
  status: 'identical' | 'modified' | 'added' | 'removed';
  before?: string;
  after?: string;
}

interface ComparisonSummary {
  total: number;
  identical: number;
  modified: number;
  added: number;
  removed: number;
  matchPercent: number;
}

interface ComparisonViewProps {
  resultData: { summary: ComparisonSummary; sectionDiffs: SectionDiff[] } | null;
  loading?: boolean;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  identical: { color: 'text-green-700 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', icon: Equal, label: 'مطابق' },
  modified: { color: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20', icon: PenLine, label: 'معدّل' },
  added: { color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: Plus, label: 'مضاف' },
  removed: { color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', icon: Minus, label: 'محذوف' },
};

export default function ComparisonView({ resultData, loading = false }: ComparisonViewProps) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800" dir="rtl">
        <div className="flex gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 flex-1 rounded-lg bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
        <div className="h-32 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  if (!resultData) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800" dir="rtl">
        <p className="text-sm text-gray-500 dark:text-gray-400">لا توجد بيانات مقارنة</p>
      </div>
    );
  }

  const { summary, sectionDiffs } = resultData;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'الإجمالي', value: summary.total, cls: 'text-gray-900 dark:text-gray-100' },
          { label: 'مطابق', value: summary.identical, cls: 'text-green-600' },
          { label: 'معدّل', value: summary.modified, cls: 'text-yellow-600' },
          { label: 'مضاف', value: summary.added, cls: 'text-blue-600' },
          { label: 'محذوف', value: summary.removed, cls: 'text-red-600' },
          { label: 'نسبة التطابق', value: `${summary.matchPercent}%`, cls: 'text-rasid-600' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-gray-200 bg-white p-3 text-center dark:border-gray-700 dark:bg-gray-800">
            <p className={`text-lg font-bold ${stat.cls}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Section diffs */}
      <div className="space-y-2">
        {sectionDiffs.map((diff) => {
          const cfg = STATUS_CONFIG[diff.status];
          const Icon = cfg.icon;
          return (
            <div key={diff.sectionId} className={`rounded-lg border border-gray-200 dark:border-gray-700 ${cfg.bg}`}>
              <div className="flex items-center gap-2 p-3">
                <Icon className={`h-4 w-4 ${cfg.color}`} />
                <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{diff.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
              </div>
              {diff.status === 'modified' && diff.before != null && diff.after != null && (
                <div className="grid grid-cols-2 gap-px border-t border-gray-200 dark:border-gray-700">
                  <div className="bg-red-50/50 p-3 dark:bg-red-900/10">
                    <p className="mb-1 text-xs font-medium text-red-600 dark:text-red-400">قبل</p>
                    <p className="whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-300">{diff.before}</p>
                  </div>
                  <div className="bg-green-50/50 p-3 dark:bg-green-900/10">
                    <p className="mb-1 text-xs font-medium text-green-600 dark:text-green-400">بعد</p>
                    <p className="whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-300">{diff.after}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
