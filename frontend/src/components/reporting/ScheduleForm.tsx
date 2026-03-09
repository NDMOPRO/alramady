'use client';

import React, { useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';

interface ScheduleFormProps {
  defaultValues?: { cron: string; enabled: boolean; formats: string[] };
  onSubmit: (data: { cron: string; enabled: boolean; formats: string[] }) => void;
  loading?: boolean;
}

const CRON_EXAMPLES = [
  { label: 'يومياً الساعة 8 صباحاً', value: '0 8 * * *' },
  { label: 'أسبوعياً (الأحد)', value: '0 9 * * 0' },
  { label: 'شهرياً (اليوم الأول)', value: '0 9 1 * *' },
];

const FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'word', label: 'Word' },
  { value: 'html', label: 'HTML' },
  { value: 'excel', label: 'Excel' },
];

export default function ScheduleForm({ defaultValues, onSubmit, loading = false }: ScheduleFormProps) {
  const [cron, setCron] = useState(defaultValues?.cron ?? '0 9 * * *');
  const [enabled, setEnabled] = useState(defaultValues?.enabled ?? true);
  const [formats, setFormats] = useState<string[]>(defaultValues?.formats ?? ['pdf']);

  const toggleFormat = (fmt: string) => {
    setFormats((prev) => prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ cron, enabled, formats });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" dir="rtl">
      {/* Cron input */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          <Clock className="ml-1 inline h-4 w-4" />
          تعبير Cron
        </label>
        <input
          type="text"
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          dir="ltr"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          placeholder="0 9 * * *"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {CRON_EXAMPLES.map((ex) => (
            <button
              key={ex.value}
              type="button"
              onClick={() => setCron(ex.value)}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                cron === ex.value
                  ? 'border-rasid-500 bg-rasid-50 text-rasid-700 dark:border-rasid-400 dark:bg-rasid-900/20 dark:text-rasid-300'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
              }`}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            enabled ? 'bg-rasid-600' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? 'start-5' : 'start-0.5'
            }`}
          />
        </button>
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {enabled ? 'مفعّل' : 'معطّل'}
        </span>
      </div>

      {/* Format checkboxes */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">صيغ التصدير</p>
        <div className="flex flex-wrap gap-3">
          {FORMAT_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={formats.includes(opt.value)}
                onChange={() => toggleFormat(opt.value)}
                className="h-4 w-4 rounded border-gray-300 text-rasid-600 focus:ring-rasid-500 dark:border-gray-600"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || formats.length === 0}
        className="inline-flex items-center gap-2 rounded-lg bg-rasid-600 px-4 py-2 text-sm font-medium text-white hover:bg-rasid-700 disabled:opacity-50 dark:bg-rasid-500 dark:hover:bg-rasid-600"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        حفظ الجدولة
      </button>
    </form>
  );
}
