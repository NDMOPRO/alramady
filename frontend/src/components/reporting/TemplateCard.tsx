'use client';

import React from 'react';
import { Eye, Trash2, Check } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  isPublic: boolean;
}

interface TemplateCardProps {
  template: Template;
  onPreview: (id: string) => void;
  onDelete: (id: string) => void;
  onSelect?: (id: string) => void;
}

export default function TemplateCard({ template, onPreview, onDelete, onSelect }: TemplateCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800" dir="rtl">
      <div className="mb-2 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {template.name}
          </h3>
          <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            {template.category}
          </span>
        </div>
        {template.isPublic && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            عام
          </span>
        )}
      </div>

      <p className="mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400 line-clamp-2">
        {template.description}
      </p>

      {template.tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {template.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
        <button
          type="button"
          onClick={() => onPreview(template.id)}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <Eye className="h-3.5 w-3.5" />
          معاينة
        </button>
        <button
          type="button"
          onClick={() => onDelete(template.id)}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
          حذف
        </button>
        {onSelect && (
          <button
            type="button"
            onClick={() => onSelect(template.id)}
            className="mr-auto inline-flex items-center gap-1 rounded-lg bg-rasid-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rasid-700 dark:bg-rasid-500 dark:hover:bg-rasid-600"
          >
            <Check className="h-3.5 w-3.5" />
            اختيار
          </button>
        )}
      </div>
    </div>
  );
}
