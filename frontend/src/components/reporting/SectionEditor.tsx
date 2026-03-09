'use client';

import React, { useState } from 'react';
import { GripVertical, ChevronDown, ChevronUp } from 'lucide-react';

type SectionType = 'text' | 'table' | 'chart' | 'header';

interface Section {
  id: string;
  title: string;
  type: SectionType;
  content: string;
  order: number;
}

interface SectionEditorProps {
  sections: Section[];
  onEdit: (sectionId: string, data: Partial<Section>) => void;
  onReorder: (sections: Section[]) => void;
}

const TYPE_OPTIONS: { value: SectionType; label: string }[] = [
  { value: 'header', label: 'عنوان' },
  { value: 'text', label: 'نص' },
  { value: 'table', label: 'جدول' },
  { value: 'chart', label: 'رسم بياني' },
];

const typeBadgeColor: Record<SectionType, string> = {
  header: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  text: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  table: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  chart: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export default function SectionEditor({ sections, onEdit, onReorder }: SectionEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sorted = [...sections].sort((a, b) => a.order - b.order);

  const move = (idx: number, dir: -1 | 1) => {
    if (idx + dir < 0 || idx + dir >= sorted.length) return;
    const next = [...sorted];
    [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
    onReorder(next.map((s, i) => ({ ...s, order: i })));
  };

  return (
    <div className="space-y-2" dir="rtl">
      {sorted.map((section, idx) => (
        <div
          key={section.id}
          className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        >
          <div
            className="flex cursor-pointer items-center gap-3 p-3"
            onClick={() => setExpandedId(expandedId === section.id ? null : section.id)}
          >
            <GripVertical className="h-4 w-4 shrink-0 text-gray-400" />
            <div className="flex items-center gap-1">
              <button type="button" onClick={(e) => { e.stopPropagation(); move(idx, -1); }} className="p-0.5 text-gray-400 hover:text-gray-600">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); move(idx, 1); }} className="p-0.5 text-gray-400 hover:text-gray-600">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
              {section.title}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeColor[section.type]}`}>
              {TYPE_OPTIONS.find((o) => o.value === section.type)?.label}
            </span>
          </div>

          {expandedId === section.id && (
            <div className="border-t border-gray-200 p-3 dark:border-gray-700">
              <div className="mb-3 flex items-center gap-2">
                <label className="text-xs text-gray-500 dark:text-gray-400">النوع:</label>
                <select
                  value={section.type}
                  onChange={(e) => onEdit(section.id, { type: e.target.value as SectionType })}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={section.content}
                onChange={(e) => onEdit(section.id, { content: e.target.value })}
                rows={4}
                className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                placeholder="محتوى القسم..."
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
