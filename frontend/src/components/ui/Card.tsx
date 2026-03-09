'use client';

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 ${
        padding ? 'p-6' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', actions }: CardHeaderProps) {
  return (
    <div className={`flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-700 ${className}`}>
      <div>{children}</div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className = '' }: CardBodyProps) {
  return <div className={`py-4 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }: CardFooterProps) {
  return (
    <div className={`flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 ${className}`}>
      {children}
    </div>
  );
}
