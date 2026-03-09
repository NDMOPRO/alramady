'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  className?: string;
}

export default function StatCard({ icon, value, label, trend, className = '' }: StatCardProps) {
  const trendColor =
    trend?.direction === 'up'
      ? 'text-green-600'
      : trend?.direction === 'down'
        ? 'text-red-600'
        : 'text-gray-500';

  const TrendIcon =
    trend?.direction === 'up'
      ? TrendingUp
      : trend?.direction === 'down'
        ? TrendingDown
        : Minus;

  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rasid-50 dark:bg-rasid-900/20">
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-sm font-medium ${trendColor}`}>
            <TrendIcon className="h-4 w-4" />
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}
