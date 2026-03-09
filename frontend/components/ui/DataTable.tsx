"use client";

import React, { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Inbox,
} from "lucide-react";

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  isLoading?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyMessage?: string;
  emptyMessageAr?: string;
}

function SkeletonRow({ colCount }: { colCount: number }) {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      {Array.from({ length: colCount }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="skeleton h-4 w-full max-w-[200px] rounded" />
        </td>
      ))}
    </tr>
  );
}

export default function DataTable<T>({
  data,
  columns,
  isLoading = false,
  searchPlaceholder = "بحث...",
  pageSize = 10,
  emptyMessage = "No data found",
  emptyMessageAr = "لا توجد بيانات",
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
  });

  const currentPage = table.getState().pagination.pageIndex + 1;
  const totalPages = table.getPageCount();

  return (
    <div className="w-full">
      {/* Search bar */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="input-field ps-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
              >
                {headerGroup.headers.map((header) => {
                  const isSortable = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          className={`inline-flex items-center gap-1.5 ${
                            isSortable ? "cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200" : ""
                          }`}
                          onClick={header.column.getToggleSortingHandler()}
                          disabled={!isSortable}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {isSortable && (
                            <span className="text-gray-300 dark:text-gray-600">
                              {sortDir === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5 text-rasid-600" />
                              ) : sortDir === "desc" ? (
                                <ArrowDown className="h-3.5 w-3.5 text-rasid-600" />
                              ) : (
                                <ArrowUpDown className="h-3.5 w-3.5" />
                              )}
                            </span>
                          )}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <SkeletonRow key={i} colCount={columns.length} />
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-3">
                    <Inbox className="h-12 w-12 text-gray-300 dark:text-gray-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {emptyMessageAr}
                      </p>
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {emptyMessage}
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="bg-white transition-colors hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-4 py-3 text-gray-700 dark:text-gray-300"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {`${table.getState().pagination.pageIndex * pageSize + 1}-${Math.min(
              (table.getState().pagination.pageIndex + 1) * pageSize,
              table.getFilteredRowModel().rows.length
            )} من ${table.getFilteredRowModel().rows.length}`}
          </p>

          <div className="flex items-center gap-1">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-gray-800"
              title="First page"
            >
              <ChevronsRight className="h-4 w-4 rtl-flip" />
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-gray-800"
              title="Previous page"
            >
              <ChevronRight className="h-4 w-4 rtl-flip" />
            </button>

            <span className="mx-2 text-sm text-gray-600 dark:text-gray-400">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-gray-800"
              title="Next page"
            >
              <ChevronLeft className="h-4 w-4 rtl-flip" />
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-gray-800"
              title="Last page"
            >
              <ChevronsLeft className="h-4 w-4 rtl-flip" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
