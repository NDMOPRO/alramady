'use client';

import React from 'react';
import { FileText, FileType, Globe, Sheet } from 'lucide-react';

interface FormatSelectorProps {
  formats?: string[];
  value: string | string[];
  onChange: (v: string | string[]) => void;
  multiple?: boolean;
}

const FORMAT_META: Record<string, { label: string; icon: React.ElementType }> = {
  pdf: { label: 'PDF', icon: FileText },
  word: { label: 'Word', icon: FileType },
  html: { label: 'HTML', icon: Globe },
  excel: { label: 'Excel', icon: Sheet },
};

export default function FormatSelector({
  formats = ['pdf', 'word', 'html', 'excel'],
  value,
  onChange,
  multiple = false,
}: FormatSelectorProps) {
  const selected = Array.isArray(value) ? value : [value];

  const toggle = (fmt: string) => {
    if (multiple) {
      const next = selected.includes(fmt)
        ? selected.filter((f) => f !== fmt)
        : [...selected, fmt];
      onChange(next);
    } else {
      onChange(fmt);
    }
  };

  return (
    <div className="flex flex-wrap gap-2" dir="rtl">
      {formats.map((fmt) => {
        const meta = FORMAT_META[fmt] ?? { label: fmt.toUpperCase(), icon: FileText };
        const Icon = meta.icon;
        const isActive = selected.includes(fmt);

        return (
          <button
            key={fmt}
            type="button"
            onClick={() => toggle(fmt)}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-rasid-500 bg-rasid-50 text-rasid-700 dark:border-rasid-400 dark:bg-rasid-900/20 dark:text-rasid-300'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <Icon className="h-4 w-4" />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
