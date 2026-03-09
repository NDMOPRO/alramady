'use client';

import React, { useState, useRef, useEffect } from 'react';

export interface DropdownItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  onClick?: () => void;
}

interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end';
  className?: string;
}

export default function Dropdown({
  trigger,
  items,
  align = 'end',
  className = '',
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative inline-block ${className}`} ref={ref}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>

      {isOpen && (
        <div
          className={`absolute z-50 mt-2 min-w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800 ${
            align === 'end' ? 'end-0' : 'start-0'
          }`}
        >
          {items.map((item) =>
            item.divider ? (
              <div key={item.key} className="my-1 border-t border-gray-100 dark:border-gray-700" />
            ) : (
              <button
                key={item.key}
                disabled={item.disabled}
                onClick={() => {
                  item.onClick?.();
                  setIsOpen(false);
                }}
                className={`
                  flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors
                  ${item.disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}
                  ${item.danger ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}
                `}
              >
                {item.icon && <span className="shrink-0">{item.icon}</span>}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
