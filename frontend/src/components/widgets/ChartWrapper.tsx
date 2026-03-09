'use client';

import React from 'react';
import Spinner from '@/components/ui/Spinner';

interface ChartWrapperProps {
  title?: string;
  subtitle?: string;
  loading?: boolean;
  error?: string | null;
  actions?: React.ReactNode;
  height?: string;
  children: React.ReactNode;
  className?: string;
}

export default function ChartWrapper({
  title,
  subtitle,
  loading = false,
  error = null,
  actions,
  height = 'h-80',
  children,
  className = '',
}: ChartWrapperProps) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}
    >
      {/* Header */}
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            {title && (
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* Chart area */}
      <div className={`relative p-6 ${height}`}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-red-500">
            {error}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
