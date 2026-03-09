'use client';

import React from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export default function Tabs({ tabs, activeTab, onChange, className = '' }: TabsProps) {
  return (
    <div className={`border-b border-gray-200 dark:border-gray-700 ${className}`}>
      <nav className="-mb-px flex gap-1" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={`
              inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors
              ${
                activeTab === tab.id
                  ? 'border-rasid-600 text-rasid-600 dark:border-rasid-400 dark:text-rasid-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }
              ${tab.disabled ? 'cursor-not-allowed opacity-50' : ''}
            `}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
