'use client';

import React, { useState } from 'react';
import { Search, Filter, Download, RefreshCw } from 'lucide-react';
import Table, { Column } from '@/components/ui/Table';
import Button from '@/components/ui/Button';
import { useDebounce } from '@/hooks/useDebounce';

interface DataGridProps<T> {
  title?: string;
  columns: Column<T>[];
  data: T[];
  keyField?: string;
  total?: number;
  loading?: boolean;
  searchable?: boolean;
  onSearch?: (query: string) => void;
  onRefresh?: () => void;
  onExport?: () => void;
  onFilter?: () => void;
  selectable?: boolean;
  actions?: React.ReactNode;
  emptyMessage?: string;
}

export default function DataGrid<T extends Record<string, any>>({
  title,
  columns,
  data,
  keyField = 'id',
  total,
  loading = false,
  searchable = true,
  onSearch,
  onRefresh,
  onExport,
  onFilter,
  selectable = false,
  actions,
  emptyMessage,
}: DataGridProps<T>) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const debouncedSearch = useDebounce(search, 300);

  React.useEffect(() => {
    onSearch?.(debouncedSearch);
  }, [debouncedSearch, onSearch]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {title && (
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h3>
          )}
          {total !== undefined && (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {total}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {searchable && (
            <div className="relative">
              <Search className="absolute start-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-48 rounded-lg border border-gray-200 bg-white py-2 ps-9 pe-3 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 sm:w-64"
              />
            </div>
          )}
          {onFilter && (
            <Button variant="outline" size="sm" icon={<Filter className="h-4 w-4" />} onClick={onFilter}>
              Filter
            </Button>
          )}
          {onExport && (
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={onExport}>
              Export
            </Button>
          )}
          {onRefresh && (
            <Button variant="ghost" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={onRefresh} />
          )}
          {actions}
        </div>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        data={data}
        keyField={keyField}
        selectable={selectable}
        selectedRows={selectedRows}
        onSelectionChange={setSelectedRows}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        loading={loading}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
