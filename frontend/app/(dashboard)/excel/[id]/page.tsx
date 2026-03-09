"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Loader2,
  AlertCircle,
  Save,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Download,
  FileSpreadsheet,
  Palette,
  Type,
} from "lucide-react";
import { getWorkbookById, getSheetData, updateCells, formatCells, exportWorkbook } from "@/lib/api/excel";
import type { Cell, CellFormat, SheetData } from "@/lib/api/excel";
import { useToast } from "@/components/ui/Toast";

const COL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function colLabel(index: number): string {
  if (index < 26) return COL_LETTERS[index];
  return COL_LETTERS[Math.floor(index / 26) - 1] + COL_LETTERS[index % 26];
}

export default function ExcelEditorPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const workbookId = params.id as string;

  const [activeSheetId, setActiveSheetId] = useState<string>("");
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [formulaBarValue, setFormulaBarValue] = useState("");
  const [localCells, setLocalCells] = useState<Map<string, Cell>>(new Map());
  const [pendingChanges, setPendingChanges] = useState<Cell[]>([]);
  const editInputRef = useRef<HTMLInputElement>(null);

  const { data: workbook, isLoading: wbLoading, isError: wbError } = useQuery({
    queryKey: ["workbook", workbookId],
    queryFn: () => getWorkbookById(workbookId),
    enabled: !!workbookId,
  });

  useEffect(() => {
    if (workbook?.sheets && workbook.sheets.length > 0 && !activeSheetId) {
      setActiveSheetId(workbook.sheets[0].id);
    }
  }, [workbook, activeSheetId]);

  const { data: sheetData, isLoading: sheetLoading } = useQuery({
    queryKey: ["sheet-data", workbookId, activeSheetId],
    queryFn: () => getSheetData(workbookId, activeSheetId),
    enabled: !!workbookId && !!activeSheetId,
  });

  useEffect(() => {
    if (sheetData?.cells) {
      const cellMap = new Map<string, Cell>();
      sheetData.cells.forEach((cell) => {
        cellMap.set(`${cell.row}-${cell.col}`, cell);
      });
      setLocalCells(cellMap);
      setPendingChanges([]);
    }
  }, [sheetData]);

  const saveMutation = useMutation({
    mutationFn: () => updateCells(workbookId, activeSheetId, pendingChanges),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sheet-data", workbookId, activeSheetId] });
      setPendingChanges([]);
      toast.success("تم حفظ التغييرات");
    },
    onError: () => {
      toast.error("فشل حفظ التغييرات");
    },
  });

  const formatMutation = useMutation({
    mutationFn: (payload: { cells: Array<{ row: number; col: number; format: CellFormat }> }) =>
      formatCells(workbookId, activeSheetId, payload.cells),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sheet-data", workbookId, activeSheetId] });
      toast.success("تم تطبيق التنسيق");
    },
  });

  const rowCount = sheetData?.rowCount || 50;
  const colCount = sheetData?.columnCount || 20;

  const getCellValue = useCallback(
    (row: number, col: number): string => {
      const cell = localCells.get(`${row}-${col}`);
      if (!cell) return "";
      return cell.formula || String(cell.value ?? "");
    },
    [localCells]
  );

  const getCellDisplay = useCallback(
    (row: number, col: number): string => {
      const cell = localCells.get(`${row}-${col}`);
      if (!cell) return "";
      return String(cell.value ?? "");
    },
    [localCells]
  );

  const getCellFormat = useCallback(
    (row: number, col: number): CellFormat | undefined => {
      const cell = localCells.get(`${row}-${col}`);
      return cell?.format;
    },
    [localCells]
  );

  const handleCellClick = (row: number, col: number) => {
    setSelectedCell({ row, col });
    setFormulaBarValue(getCellValue(row, col));
    setEditingCell(null);
  };

  const handleCellDoubleClick = (row: number, col: number) => {
    setEditingCell({ row, col });
    setFormulaBarValue(getCellValue(row, col));
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const commitCellEdit = (row: number, col: number, value: string) => {
    const isFormula = value.startsWith("=");
    const cell: Cell = {
      row,
      col,
      value: isFormula ? null : value,
      formula: isFormula ? value : undefined,
    };
    setLocalCells((prev) => {
      const next = new Map(prev);
      next.set(`${row}-${col}`, cell);
      return next;
    });
    setPendingChanges((prev) => [...prev.filter((c) => c.row !== row || c.col !== col), cell]);
    setEditingCell(null);
  };

  const handleFormulaBarKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && selectedCell) {
      commitCellEdit(selectedCell.row, selectedCell.col, formulaBarValue);
    }
    if (e.key === "Escape") {
      if (selectedCell) setFormulaBarValue(getCellValue(selectedCell.row, selectedCell.col));
      setEditingCell(null);
    }
  };

  const applyFormat = (formatProp: keyof CellFormat, value: unknown) => {
    if (!selectedCell) return;
    const currentFormat = getCellFormat(selectedCell.row, selectedCell.col) || {};
    const newFormat: CellFormat = { ...currentFormat, [formatProp]: value };

    setLocalCells((prev) => {
      const next = new Map(prev);
      const key = `${selectedCell.row}-${selectedCell.col}`;
      const existing = next.get(key) || { row: selectedCell.row, col: selectedCell.col, value: "" };
      next.set(key, { ...existing, format: newFormat });
      return next;
    });

    formatMutation.mutate({
      cells: [{ row: selectedCell.row, col: selectedCell.col, format: newFormat }],
    });
  };

  const handleExport = async (format: "xlsx" | "csv" | "pdf") => {
    try {
      const blob = await exportWorkbook(workbookId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workbook?.name || "workbook"}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`تم التصدير بصيغة ${format.toUpperCase()}`);
    } catch {
      toast.error("فشل التصدير");
    }
  };

  const selectedCellRef = selectedCell ? `${colLabel(selectedCell.col)}${selectedCell.row + 1}` : "";
  const displayRows = Math.min(rowCount, 100);
  const displayCols = Math.min(colCount, 30);

  if (wbLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-rasid-600" />
          <p className="text-sm text-gray-500">جاري تحميل المصنف...</p>
        </div>
      </div>
    );
  }

  if (wbError || !workbook) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-sm font-medium text-red-600 dark:text-red-400">فشل تحميل المصنف</p>
        <button onClick={() => router.back()} className="btn-primary px-4 py-2">
          العودة
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Link
            href="/excel"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <ArrowRight className="h-5 w-5 rtl:rotate-180" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {workbook.nameAr || workbook.name}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport("xlsx")}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Download className="h-3.5 w-3.5" />
            تصدير
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={pendingChanges.length === 0 || saveMutation.isPending}
            className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span>حفظ {pendingChanges.length > 0 && `(${pendingChanges.length})`}</span>
          </button>
        </div>
      </div>

      {/* Formatting toolbar */}
      <div className="flex items-center gap-1 border-b border-gray-200 py-1.5 dark:border-gray-700">
        <button
          onClick={() => {
            const current = getCellFormat(selectedCell?.row ?? 0, selectedCell?.col ?? 0);
            applyFormat("bold", !current?.bold);
          }}
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          title="غامق"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            const current = getCellFormat(selectedCell?.row ?? 0, selectedCell?.col ?? 0);
            applyFormat("italic", !current?.italic);
          }}
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          title="مائل"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            const current = getCellFormat(selectedCell?.row ?? 0, selectedCell?.col ?? 0);
            applyFormat("underline", !current?.underline);
          }}
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          title="تسطير"
        >
          <Underline className="h-4 w-4" />
        </button>
        <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />
        <button
          onClick={() => applyFormat("textAlign", "right")}
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          title="محاذاة يمين"
        >
          <AlignRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => applyFormat("textAlign", "center")}
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          title="محاذاة وسط"
        >
          <AlignCenter className="h-4 w-4" />
        </button>
        <button
          onClick={() => applyFormat("textAlign", "left")}
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          title="محاذاة يسار"
        >
          <AlignLeft className="h-4 w-4" />
        </button>
        <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />
        <label className="flex items-center gap-1 rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer" title="لون الخط">
          <Type className="h-4 w-4" />
          <input
            type="color"
            className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
            onChange={(e) => applyFormat("fontColor", e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1 rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer" title="لون الخلفية">
          <Palette className="h-4 w-4" />
          <input
            type="color"
            className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
            onChange={(e) => applyFormat("backgroundColor", e.target.value)}
          />
        </label>
      </div>

      {/* Formula bar */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-2 py-1 dark:border-gray-700">
        <span className="min-w-[50px] rounded bg-gray-100 px-2 py-1 text-center text-xs font-mono font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
          {selectedCellRef || "---"}
        </span>
        <span className="text-xs text-gray-400">fx</span>
        <input
          type="text"
          value={formulaBarValue}
          onChange={(e) => setFormulaBarValue(e.target.value)}
          onKeyDown={handleFormulaBarKeyDown}
          className="flex-1 rounded border-0 bg-transparent px-2 py-1 text-sm text-gray-800 outline-none focus:ring-1 focus:ring-rasid-500 dark:text-gray-200"
          placeholder="أدخل قيمة أو معادلة..."
          dir="ltr"
        />
      </div>

      {/* Sheet tabs */}
      {workbook.sheets && workbook.sheets.length > 0 && (
        <div className="flex items-center gap-0 border-b border-gray-200 dark:border-gray-700">
          {workbook.sheets.map((sheet) => (
            <button
              key={sheet.id}
              onClick={() => setActiveSheetId(sheet.id)}
              className={`border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
                activeSheetId === sheet.id
                  ? "border-rasid-600 bg-white text-rasid-600 dark:bg-gray-800 dark:text-rasid-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {sheetLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-rasid-600" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-max border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky start-0 z-20 w-12 border border-gray-200 bg-gray-100 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                  #
                </th>
                {Array.from({ length: displayCols }).map((_, c) => (
                  <th
                    key={c}
                    className="min-w-[100px] border border-gray-200 bg-gray-100 px-2 py-1.5 text-center font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                  >
                    {colLabel(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: displayRows }).map((_, r) => (
                <tr key={r}>
                  <td className="sticky start-0 z-10 border border-gray-200 bg-gray-50 px-2 py-1 text-center font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    {r + 1}
                  </td>
                  {Array.from({ length: displayCols }).map((_, c) => {
                    const isSelected = selectedCell?.row === r && selectedCell?.col === c;
                    const isEditing = editingCell?.row === r && editingCell?.col === c;
                    const format = getCellFormat(r, c);
                    const cellStyle: React.CSSProperties = {};
                    if (format?.bold) cellStyle.fontWeight = "bold";
                    if (format?.italic) cellStyle.fontStyle = "italic";
                    if (format?.underline) cellStyle.textDecoration = "underline";
                    if (format?.fontColor) cellStyle.color = format.fontColor;
                    if (format?.backgroundColor) cellStyle.backgroundColor = format.backgroundColor;
                    if (format?.textAlign) cellStyle.textAlign = format.textAlign;

                    return (
                      <td
                        key={c}
                        onClick={() => handleCellClick(r, c)}
                        onDoubleClick={() => handleCellDoubleClick(r, c)}
                        className={`border border-gray-200 px-2 py-1 dark:border-gray-700 ${
                          isSelected
                            ? "ring-2 ring-inset ring-rasid-500"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                        style={cellStyle}
                      >
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            defaultValue={getCellValue(r, c)}
                            className="w-full border-0 bg-transparent p-0 text-xs outline-none"
                            dir="auto"
                            onBlur={(e) => commitCellEdit(r, c, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                commitCellEdit(r, c, (e.target as HTMLInputElement).value);
                              }
                              if (e.key === "Escape") {
                                setEditingCell(null);
                              }
                            }}
                          />
                        ) : (
                          <span className="block truncate">{getCellDisplay(r, c)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
