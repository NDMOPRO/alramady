'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export default function Select({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchable = false,
  error,
  disabled = false,
  className = '',
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const filteredOptions = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex w-full items-center justify-between rounded-lg border bg-white px-3.5 py-2.5 text-sm
          transition-colors duration-150
          focus:border-rasid-500 focus:outline-none focus:ring-2 focus:ring-rasid-500/20
          disabled:cursor-not-allowed disabled:bg-gray-50
          dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100
          ${error ? 'border-red-500' : 'border-gray-300'}
        `}
      >
        <span className={selectedOption ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
          {searchable && (
            <div className="border-b border-gray-100 p-2 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border border-gray-200 bg-gray-50 py-2 ps-8 pe-3 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="Search..."
                  autoFocus
                />
              </div>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No options found</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange?.(option.value);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <span>{option.label}</span>
                  {option.value === value && <Check className="h-4 w-4 text-rasid-600" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
