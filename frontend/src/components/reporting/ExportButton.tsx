'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Download, Loader2, ChevronDown } from 'lucide-react';

interface ExportButtonProps {
  onExport: (format: string) => void;
  loading?: boolean;
  loadingFormat?: string;
  formats?: string[];
}

const FORMAT_LABELS: Record<string, string> = {
  pdf: 'PDF',
  word: 'Word',
  html: 'HTML',
  excel: 'Excel',
};

export default function ExportButton({
  onExport,
  loading = false,
  loadingFormat,
  formats = ['pdf', 'word', 'html', 'excel'],
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        <Download className="h-4 w-4" />
        تصدير
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute start-0 z-10 mt-1 min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {formats.map((fmt) => {
            const isLoading = loading && loadingFormat === fmt;
            return (
              <button
                key={fmt}
                type="button"
                disabled={loading}
                onClick={() => {
                  onExport(fmt);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 text-gray-400" />
                )}
                {FORMAT_LABELS[fmt] ?? fmt.toUpperCase()}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
