'use client';

import React, { useMemo } from 'react';
import { FileText } from 'lucide-react';

interface ReportType {
  id: string;
  name: string;
  nameAr: string;
  category: string;
  description: string;
}

interface ReportTypeSelectorProps {
  types: ReportType[];
  value: string;
  onChange: (id: string) => void;
}

export default function ReportTypeSelector({ types, value, onChange }: ReportTypeSelectorProps) {
  const grouped = useMemo(() => {
    const map: Record<string, ReportType[]> = {};
    types.forEach((t) => {
      if (!map[t.category]) map[t.category] = [];
      map[t.category].push(t);
    });
    return map;
  }, [types]);

  return (
    <div className="space-y-4" dir="rtl">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h3 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
            {category}
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange(t.id)}
                className={`flex items-start gap-3 rounded-lg border p-3 text-start transition-colors ${
                  value === t.id
                    ? 'border-rasid-500 bg-rasid-50 dark:border-rasid-400 dark:bg-rasid-900/20'
                    : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
                }`}
              >
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t.nameAr || t.name}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {t.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
