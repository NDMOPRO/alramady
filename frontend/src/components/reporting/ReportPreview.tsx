'use client';

import React from 'react';
import { BarChart3 } from 'lucide-react';

interface Section {
  id: string;
  title: string;
  type: 'text' | 'table' | 'chart' | 'header';
  content: string;
  order: number;
}

interface ReportPreviewProps {
  sections: Section[];
  loading?: boolean;
}

function SkeletonBlock({ wide = false }: { wide?: boolean }) {
  return (
    <div className="animate-pulse space-y-2">
      <div className={`h-4 rounded bg-gray-200 dark:bg-gray-700 ${wide ? 'w-3/4' : 'w-1/3'}`} />
      {wide && <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-700" />}
      {wide && <div className="h-3 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />}
    </div>
  );
}

function renderTable(content: string) {
  try {
    const data = JSON.parse(content) as string[][];
    if (!Array.isArray(data) || data.length === 0) return <p className="text-sm text-gray-500">لا توجد بيانات</p>;
    const [header, ...rows] = data;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-300 dark:border-gray-600">
              {header.map((h: string, i: number) => (
                <th key={i} className="px-3 py-2 text-start font-medium text-gray-700 dark:text-gray-300">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: string[], ri: number) => (
              <tr key={ri} className="border-b border-gray-100 dark:border-gray-700">
                {row.map((cell: string, ci: number) => (
                  <td key={ci} className="px-3 py-2 text-gray-600 dark:text-gray-400">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } catch {
    return <p className="text-sm text-gray-500">{content}</p>;
  }
}

export default function ReportPreview({ sections, loading = false }: ReportPreviewProps) {
  if (loading) {
    return (
      <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800" dir="rtl">
        {[1, 2, 3].map((i) => (
          <SkeletonBlock key={i} wide={i !== 1} />
        ))}
      </div>
    );
  }

  const sorted = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800" dir="rtl">
      {sorted.map((section) => (
        <div key={section.id}>
          {section.type === 'header' && (
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{section.content || section.title}</h2>
          )}
          {section.type === 'text' && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">{section.title}</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600 dark:text-gray-400">{section.content}</p>
            </div>
          )}
          {section.type === 'table' && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{section.title}</h3>
              {renderTable(section.content)}
            </div>
          )}
          {section.type === 'chart' && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{section.title}</h3>
              <div className="flex h-40 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-900/50">
                <div className="text-center text-gray-400">
                  <BarChart3 className="mx-auto h-8 w-8" />
                  <p className="mt-1 text-xs">رسم بياني</p>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
