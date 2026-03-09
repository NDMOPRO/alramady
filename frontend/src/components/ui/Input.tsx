'use client';

import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  iconStart?: React.ReactNode;
  iconEnd?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, iconStart, iconEnd, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {iconStart && (
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-gray-400">
              {iconStart}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              block w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-gray-900
              transition-colors duration-150
              placeholder:text-gray-400
              focus:border-rasid-500 focus:outline-none focus:ring-2 focus:ring-rasid-500/20
              disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500
              dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100
              ${iconStart ? 'ps-10' : ''}
              ${iconEnd ? 'pe-10' : ''}
              ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-gray-300'}
              ${className}
            `}
            {...props}
          />
          {iconEnd && (
            <div className="absolute inset-y-0 end-0 flex items-center pe-3 text-gray-400">
              {iconEnd}
            </div>
          )}
        </div>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        {helperText && !error && (
          <p className="mt-1 text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
