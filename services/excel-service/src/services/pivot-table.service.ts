import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import * as mathjs from 'mathjs';
import { z } from 'zod';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { v4: uuidv4 } = require('uuid') as { v4: () => string };
import { prisma } from '../utils/prisma';
import { Prisma } from '@prisma/client';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const AggregationFunctionSchema = z.enum([
  'SUM',
  'COUNT',
  'AVERAGE',
  'MIN',
  'MAX',
  'COUNT_DISTINCT',
  'MEDIAN',
]);

const SortDirectionSchema = z.enum(['asc', 'desc']);

const SortConfigSchema = z.object({
  by: z.enum(['value', 'label']),
  direction: SortDirectionSchema,
});

const FilterFieldSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains', 'notContains']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
});

const ValueFieldSchema = z.object({
  field: z.string().min(1),
  aggregation: AggregationFunctionSchema,
  alias: z.string().optional(),
  calculatedFormula: z.string().optional(),
});

const CreatePivotTableSchema = z.object({
  workbookId: z.string().uuid(),
  sourceSheet: z.string().min(1),
  name: z.string().min(1).max(255),
  rowFields: z.array(z.string().min(1)).min(1),
  columnFields: z.array(z.string().min(1)).default([]),
  valueFields: z.array(ValueFieldSchema).min(1),
  filterFields: z.array(FilterFieldSchema).default([]),
  showGrandTotalRows: z.boolean().default(true),
  showGrandTotalColumns: z.boolean().default(true),
  showSubtotals: z.boolean().default(true),
  rowSort: SortConfigSchema.optional(),
  columnSort: SortConfigSchema.optional(),
});

const RefreshPivotSchema = z.object({
  pivotId: z.string().uuid(),
});

const GetPivotDataSchema = z.object({
  pivotId: z.string().uuid(),
});

const DeletePivotTableSchema = z.object({
  pivotId: z.string().uuid(),
});

const UpdatePivotConfigSchema = z.object({
  pivotId: z.string().uuid(),
  rowFields: z.array(z.string().min(1)).min(1).optional(),
  columnFields: z.array(z.string().min(1)).optional(),
  valueFields: z.array(ValueFieldSchema).min(1).optional(),
  filterFields: z.array(FilterFieldSchema).optional(),
  showGrandTotalRows: z.boolean().optional(),
  showGrandTotalColumns: z.boolean().optional(),
  showSubtotals: z.boolean().optional(),
  rowSort: SortConfigSchema.optional(),
  columnSort: SortConfigSchema.optional(),
});

const DrillDownSchema = z.object({
  pivotId: z.string().uuid(),
  rowKeys: z.array(z.string()),
  columnKeys: z.array(z.string()),
  valueFieldIndex: z.number().int().min(0).default(0),
});

const ExportPivotSchema = z.object({
  pivotId: z.string().uuid(),
  sheetName: z.string().min(1).max(31).default('Pivot Export'),
});

// ─── Internal Types ────────────────────────────────────────────────────────────

type AggregationFunction = z.infer<typeof AggregationFunctionSchema>;

interface FilterField {
  field: string;
  operator: string;
  value: string | number | boolean | Array<string | number>;
}

interface ValueFieldConfig {
  field: string;
  aggregation: AggregationFunction;
  alias?: string;
  calculatedFormula?: string;
}

interface SortConfig {
  by: 'value' | 'label';
  direction: 'asc' | 'desc';
}

interface PivotConfig {
  workbookId: string;
  sourceSheet: string;
  name: string;
  rowFields: string[];
  columnFields: string[];
  valueFields: ValueFieldConfig[];
  filterFields: FilterField[];
  showGrandTotalRows: boolean;
  showGrandTotalColumns: boolean;
  showSubtotals: boolean;
  rowSort?: SortConfig;
  columnSort?: SortConfig;
}

interface PivotCell {
  rowKeys: string[];
  columnKeys: string[];
  values: number[];
  aggregatedValues: Record<string, number | null>;
}

interface PivotResult {
  headers: string[];
  columnHeaders: string[];
  rows: PivotRow[];
  grandTotals: Record<string, number | null>;
  columnGrandTotals: Record<string, number | null>;
  metadata: {
    rowCount: number;
    columnCount: number;
    uniqueRowGroups: number;
    uniqueColumnGroups: number;
    processedRows: number;
  };
}

interface PivotRow {
  rowKeys: string[];
  subtotalLabel?: string;
  isSubtotal?: boolean;
  isGrandTotal?: boolean;
  cells: Record<string, Record<string, number | null>>;
  rowTotals: Record<string, number | null>;
}

interface StoredPivot {
  id: string;
  config: PivotConfig;
  result?: PivotResult;
  createdAt: string;
  updatedAt: string;
}

// ─── Aggregation Engine ────────────────────────────────────────────────────────

function aggregateValues(values: number[], func: AggregationFunction): number | null {
  const numericValues = values.filter((v) => typeof v === 'number' && !isNaN(v) && isFinite(v));

  if (func === 'COUNT') {
    return values.length;
  }
  if (func === 'COUNT_DISTINCT') {
    return new Set(values.map((v) => String(v))).size;
  }
  if (numericValues.length === 0) {
    return null;
  }

  switch (func) {
    case 'SUM': {
      return numericValues.reduce((acc, v) => acc.plus(new Decimal(v)), new Decimal(0)).toNumber();
    }
    case 'AVERAGE': {
      const sum = numericValues.reduce((acc, v) => acc.plus(new Decimal(v)), new Decimal(0));
      return sum.dividedBy(new Decimal(numericValues.length)).toNumber();
    }
    case 'MIN': {
      return Math.min(...numericValues);
    }
    case 'MAX': {
      return Math.max(...numericValues);
    }
    case 'MEDIAN': {
      const sorted = [...numericValues].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        return new Decimal(sorted[mid - 1]).plus(new Decimal(sorted[mid])).dividedBy(2).toNumber();
      }
      return sorted[mid];
    }
    default:
      return null;
  }
}

// ─── Filter Engine ─────────────────────────────────────────────────────────────

function applyFilter(cellValue: unknown, filter: FilterField): boolean {
  const raw = cellValue !== null && cellValue !== undefined ? cellValue : '';
  const strRaw = String(raw);
  const numRaw = Number(raw);
  const isNumeric = !isNaN(numRaw) && strRaw !== '';

  switch (filter.operator) {
    case 'eq':
      return isNumeric ? numRaw === Number(filter.value) : strRaw === String(filter.value);
    case 'neq':
      return isNumeric ? numRaw !== Number(filter.value) : strRaw !== String(filter.value);
    case 'gt':
      return isNumeric && numRaw > Number(filter.value);
    case 'gte':
      return isNumeric && numRaw >= Number(filter.value);
    case 'lt':
      return isNumeric && numRaw < Number(filter.value);
    case 'lte':
      return isNumeric && numRaw <= Number(filter.value);
    case 'in': {
      const arr = Array.isArray(filter.value) ? filter.value : [filter.value];
      return arr.some((v) => String(v) === strRaw);
    }
    case 'nin': {
      const arr = Array.isArray(filter.value) ? filter.value : [filter.value];
      return !arr.some((v) => String(v) === strRaw);
    }
    case 'contains':
      return strRaw.toLowerCase().includes(String(filter.value).toLowerCase());
    case 'notContains':
      return !strRaw.toLowerCase().includes(String(filter.value).toLowerCase());
    default:
      return true;
  }
}

function passesAllFilters(row: Record<string, unknown>, filters: FilterField[]): boolean {
  for (const filter of filters) {
    if (!applyFilter(row[filter.field], filter)) {
      return false;
    }
  }
  return true;
}

// ─── Calculated Field Evaluator ────────────────────────────────────────────────

function evaluateCalculatedField(
  formula: string,
  scope: Record<string, number | null>
): number | null {
  try {
    const mathScope: Record<string, number> = {};
    for (const [key, val] of Object.entries(scope)) {
      const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
      mathScope[safeKey] = val ?? 0;
    }
    const safeFormula = formula.replace(/[^a-zA-Z0-9_]/g, (c) => {
      if (c in scope) return '_';
      return c;
    });
    const cleanedFormula = formula.replace(
      /([a-zA-Z][a-zA-Z0-9\s_]*)/g,
      (match) => {
        const trimmed = match.trim();
        const safeKeyName = trimmed.replace(/[^a-zA-Z0-9_]/g, '_');
        if (trimmed in scope) {
          mathScope[safeKeyName] = scope[trimmed] ?? 0;
          return safeKeyName;
        }
        return match;
      }
    );
    void safeFormula;
    const result = mathjs.evaluate(cleanedFormula, mathScope);
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Source Data Reader ────────────────────────────────────────────────────────

async function readSourceData(
  workbookId: string,
  sourceSheetName: string
): Promise<Array<Record<string, unknown>>> {
  // Primary path: read from ExcelCell records (individual cell values with sheetIndex)
  // We need to map sourceSheetName to a sheetIndex via the excelWorkbook metadata
  const workbookRecord = await prisma.excelWorkbook.findUnique({
    where: { id: workbookId },
  });

  if (workbookRecord) {
    const metadata = workbookRecord.metadata
      ? JSON.parse(workbookRecord.metadata as string)
      : { sheets: [] };

    const sheetsArray: Array<{ name: string; index?: number }> = metadata.sheets || [];
    const sheetEntry = sheetsArray.find(
      (s) => s.name === sourceSheetName
    );
    const sheetIndex = sheetEntry?.index ?? sheetsArray.findIndex((s) => s.name === sourceSheetName);
    const resolvedSheetIndex = sheetIndex >= 0 ? sheetIndex + 1 : 1;

    const cells = await prisma.excelCell.findMany({
      where: { workbookId, sheetIndex: resolvedSheetIndex },
      orderBy: [{ row: 'asc' }, { col: 'asc' }],
    });

    if (cells.length > 0) {
      // Build a column index from row 1 (headers)
      const headerCells = cells.filter((c: typeof cells[0]) => c.row === 1);
      const headers = new Map<number, string>();
      for (const hc of headerCells) {
        headers.set(hc.col, hc.value !== null ? String(hc.value) : `Col${hc.col}`);
      }

      if (headers.size === 0) {
        return [];
      }

      // Group data cells by row
      const dataCells = cells.filter((c: typeof cells[0]) => c.row > 1);
      const rowMap = new Map<number, Map<number, string | null>>();
      for (const cell of dataCells) {
        if (!rowMap.has(cell.row)) {
          rowMap.set(cell.row, new Map());
        }
        rowMap.get(cell.row)!.set(cell.col, cell.value);
      }

      const rows: Array<Record<string, unknown>> = [];
      for (const [, colMap] of rowMap) {
        const record: Record<string, unknown> = {};
        for (const [col, header] of headers) {
          const raw = colMap.get(col) ?? null;
          if (raw !== null) {
            const num = Number(raw);
            record[header] = !isNaN(num) && raw !== '' ? num : raw;
          } else {
            record[header] = null;
          }
        }
        rows.push(record);
      }
      return rows;
    }

    // Fallback: load from binary fileData via ExcelJS
    if (workbookRecord.fileData) {
      const wb = new ExcelJS.Workbook();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await wb.xlsx.load(workbookRecord.fileData as any);
      const ws = wb.getWorksheet(sourceSheetName);
      if (!ws) {
        throw new Error(`Sheet "${sourceSheetName}" not found in workbook ${workbookId}`);
      }

      const headers: string[] = [];
      const dataRows: Array<Record<string, unknown>> = [];

      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            headers[colNumber - 1] = String(cell.value ?? `Col${colNumber}`);
          });
        } else {
          const record: Record<string, unknown> = {};
          row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const header = headers[colNumber - 1] ?? `Col${colNumber}`;
            const raw = cell.result !== undefined ? cell.result : cell.value;
            record[header] = raw;
          });
          dataRows.push(record);
        }
      });

      return dataRows;
    }
  }

  // Secondary path: read from Workbook.sheetsJson (JSON field)
  const workbookJsonRecord = await prisma.workbook.findUnique({
    where: { id: workbookId },
  });

  if (!workbookJsonRecord) {
    throw new Error(`Workbook not found: ${workbookId}`);
  }

  const sheetsJsonData = workbookJsonRecord.sheetsJson as Record<string, unknown> | unknown[] | null;
  if (!sheetsJsonData) {
    return [];
  }

  const sheetsArray = Array.isArray(sheetsJsonData)
    ? sheetsJsonData
    : (sheetsJsonData as { sheets?: unknown[] }).sheets ?? [];

  const sheetData = (sheetsArray as Array<Record<string, unknown>>).find(
    (s) => s['name'] === sourceSheetName
  );

  if (!sheetData) {
    throw new Error(`Sheet "${sourceSheetName}" not found in workbook ${workbookId}`);
  }

  const sheetRows = sheetData['rows'] as unknown[][] | undefined;
  const sheetColumns = sheetData['columns'] as string[] | undefined;

  if (!sheetRows || sheetRows.length === 0) {
    return [];
  }

  // Determine headers: use sheetColumns if present, else use first row
  let headers: string[];
  let dataStartIndex = 0;

  if (sheetColumns && sheetColumns.length > 0) {
    headers = sheetColumns;
    dataStartIndex = 0;
  } else {
    const firstRow = sheetRows[0];
    headers = firstRow.map((v, i) => (v !== null && v !== undefined ? String(v) : `Col${i + 1}`));
    dataStartIndex = 1;
  }

  const resultRows: Array<Record<string, unknown>> = [];
  for (let i = dataStartIndex; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    const record: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const raw = row[j] !== undefined ? row[j] : null;
      if (raw !== null) {
        const num = Number(raw);
        record[headers[j]] = !isNaN(num) && String(raw) !== '' ? num : raw;
      } else {
        record[headers[j]] = null;
      }
    }
    resultRows.push(record);
  }

  return resultRows;
}

// ─── Pivot Computation Engine ──────────────────────────────────────────────────

function computePivot(
  sourceRows: Array<Record<string, unknown>>,
  config: PivotConfig
): PivotResult {
  // Apply filters
  const filteredRows = sourceRows.filter((row) => passesAllFilters(row, config.filterFields));

  // Collect unique column group keys
  const columnGroupSets: Set<string>[] = config.columnFields.map(() => new Set<string>());
  const uniqueColumnKeys = new Set<string>();

  for (const row of filteredRows) {
    if (config.columnFields.length > 0) {
      const colKey = config.columnFields
        .map((f) => String(row[f] ?? ''))
        .join('\x00');
      uniqueColumnKeys.add(colKey);
      config.columnFields.forEach((f, i) => {
        columnGroupSets[i].add(String(row[f] ?? ''));
      });
    }
  }

  // Sort column keys
  let sortedColumnKeys = Array.from(uniqueColumnKeys);
  if (config.columnSort) {
    sortedColumnKeys.sort((a, b) => {
      const aLabel = a.split('\x00').join(' | ');
      const bLabel = b.split('\x00').join(' | ');
      const cmp = aLabel.localeCompare(bLabel, 'ar');
      return config.columnSort!.direction === 'asc' ? cmp : -cmp;
    });
  } else {
    sortedColumnKeys.sort((a, b) => a.localeCompare(b, 'ar'));
  }

  // Accumulate values per (rowGroupKey, colGroupKey)
  // Structure: rowKey -> colKey -> valueFieldIndex -> [raw values]
  const accumulator = new Map<string, Map<string, Map<number, unknown[]>>>();

  for (const row of filteredRows) {
    const rowKey = config.rowFields.map((f) => String(row[f] ?? '')).join('\x00');
    const colKey =
      config.columnFields.length > 0
        ? config.columnFields.map((f) => String(row[f] ?? '')).join('\x00')
        : '__all__';

    if (!accumulator.has(rowKey)) {
      accumulator.set(rowKey, new Map());
    }
    const colMap = accumulator.get(rowKey)!;

    if (!colMap.has(colKey)) {
      colMap.set(colKey, new Map());
    }
    const valueMap = colMap.get(colKey)!;

    for (let vi = 0; vi < config.valueFields.length; vi++) {
      const vf = config.valueFields[vi];
      if (!valueMap.has(vi)) {
        valueMap.set(vi, []);
      }
      const rawVal = row[vf.field];
      valueMap.get(vi)!.push(rawVal);
    }
  }

  // Determine ordered row groups
  let rowGroupKeys = Array.from(accumulator.keys());

  if (config.rowSort) {
    if (config.rowSort.by === 'label') {
      rowGroupKeys.sort((a, b) => {
        const cmp = a.localeCompare(b, 'ar');
        return config.rowSort!.direction === 'asc' ? cmp : -cmp;
      });
    } else {
      // Sort by first value field grand total
      rowGroupKeys.sort((a, b) => {
        const aTotal = computeRowGrandTotal(accumulator.get(a)!, config.valueFields, 0);
        const bTotal = computeRowGrandTotal(accumulator.get(b)!, config.valueFields, 0);
        const aVal = aTotal ?? 0;
        const bVal = bTotal ?? 0;
        return config.rowSort!.direction === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }
  }

  // Build final pivot rows
  const pivotRows: PivotRow[] = [];

  // Column totals accumulator: colKey -> valueFieldIndex -> raw values
  const columnTotalsAccum = new Map<string, Map<number, unknown[]>>();

  for (const rowKey of rowGroupKeys) {
    const colMap = accumulator.get(rowKey)!;
    const rowKeys = rowKey.split('\x00');

    const cells: Record<string, Record<string, number | null>> = {};
    const rowTotals: Record<string, number | null> = {};

    // For each value field, compute aggregated values per column group
    for (let vi = 0; vi < config.valueFields.length; vi++) {
      const vf = config.valueFields[vi];
      const vfLabel = vf.alias ?? vf.field;
      cells[vfLabel] = {};

      // Row total raw accumulator per value field
      const rowTotalRaws: unknown[] = [];

      const effectiveColKeys =
        config.columnFields.length > 0 ? sortedColumnKeys : ['__all__'];

      for (const colKey of effectiveColKeys) {
        const colLabel =
          colKey === '__all__' ? vfLabel : `${colKey.split('\x00').join(' | ')} | ${vfLabel}`;

        const valueMap = colMap.get(colKey);
        const raws = valueMap?.get(vi) ?? [];
        rowTotalRaws.push(...raws);

        // Accumulate into column totals
        if (!columnTotalsAccum.has(colKey)) {
          columnTotalsAccum.set(colKey, new Map());
        }
        const ctMap = columnTotalsAccum.get(colKey)!;
        if (!ctMap.has(vi)) {
          ctMap.set(vi, []);
        }
        ctMap.get(vi)!.push(...raws);

        // Evaluate calculated formula if present
        let aggValue: number | null;
        if (vf.calculatedFormula) {
          const scope: Record<string, number | null> = {};
          for (let ovi = 0; ovi < config.valueFields.length; ovi++) {
            const ovf = config.valueFields[ovi];
            const ovfLabel = ovf.alias ?? ovf.field;
            const oRaws = colMap.get(colKey)?.get(ovi) ?? [];
            const nums = oRaws.map((r) => Number(r)).filter((n) => !isNaN(n));
            scope[ovfLabel] = aggregateValues(nums, ovf.aggregation);
          }
          aggValue = evaluateCalculatedField(vf.calculatedFormula, scope);
        } else {
          const nums = raws.map((r) => Number(r)).filter((n) => !isNaN(n));
          aggValue = aggregateValues(nums, vf.aggregation);
        }

        cells[vfLabel][colLabel] = aggValue;
      }

      // Compute row grand total
      if (config.showGrandTotalColumns) {
        const totalNums = rowTotalRaws.map((r) => Number(r)).filter((n) => !isNaN(n));
        rowTotals[vfLabel] = aggregateValues(totalNums, vf.aggregation);
      }
    }

    pivotRows.push({
      rowKeys,
      cells,
      rowTotals,
    });
  }

  // Build subtotals for hierarchical row fields (when more than one row field)
  const finalRows: PivotRow[] = [];
  if (config.showSubtotals && config.rowFields.length > 1) {
    // Group by first row field to create subtotals
    const firstFieldGroups = new Map<string, PivotRow[]>();
    for (const pr of pivotRows) {
      const firstKey = pr.rowKeys[0];
      if (!firstFieldGroups.has(firstKey)) {
        firstFieldGroups.set(firstKey, []);
      }
      firstFieldGroups.get(firstKey)!.push(pr);
    }

    for (const [firstKey, groupRows] of firstFieldGroups) {
      finalRows.push(...groupRows);

      // Build subtotal row for this first-key group
      const subtotalCells: Record<string, Record<string, number | null>> = {};
      const subtotalRowTotals: Record<string, number | null> = {};

      for (let vi = 0; vi < config.valueFields.length; vi++) {
        const vf = config.valueFields[vi];
        const vfLabel = vf.alias ?? vf.field;
        subtotalCells[vfLabel] = {};

        const effectiveColKeys =
          config.columnFields.length > 0 ? sortedColumnKeys : ['__all__'];

        for (const colKey of effectiveColKeys) {
          const colLabel =
            colKey === '__all__'
              ? vfLabel
              : `${colKey.split('\x00').join(' | ')} | ${vfLabel}`;

          const combinedRaws: number[] = [];
          for (const row of groupRows) {
            const cellVal = row.cells[vfLabel]?.[colLabel];
            if (cellVal !== null && cellVal !== undefined) {
              combinedRaws.push(cellVal);
            }
          }
          subtotalCells[vfLabel][colLabel] = aggregateValues(combinedRaws, vf.aggregation);
        }

        if (config.showGrandTotalColumns) {
          const totalVals = Object.values(subtotalCells[vfLabel]).filter(
            (v): v is number => v !== null
          );
          subtotalRowTotals[vfLabel] = aggregateValues(totalVals, vf.aggregation);
        }
      }

      finalRows.push({
        rowKeys: [firstKey],
        subtotalLabel: `Subtotal: ${firstKey}`,
        isSubtotal: true,
        cells: subtotalCells,
        rowTotals: subtotalRowTotals,
      });
    }
  } else {
    finalRows.push(...pivotRows);
  }

  // Compute grand totals per column
  const grandTotals: Record<string, number | null> = {};
  const columnGrandTotals: Record<string, number | null> = {};

  if (config.showGrandTotalRows) {
    const effectiveColKeys =
      config.columnFields.length > 0 ? sortedColumnKeys : ['__all__'];

    for (let vi = 0; vi < config.valueFields.length; vi++) {
      const vf = config.valueFields[vi];
      const vfLabel = vf.alias ?? vf.field;

      for (const colKey of effectiveColKeys) {
        const colLabel =
          colKey === '__all__'
            ? vfLabel
            : `${colKey.split('\x00').join(' | ')} | ${vfLabel}`;

        const ctMap = columnTotalsAccum.get(colKey);
        const raws = ctMap?.get(vi) ?? [];
        const nums = raws.map((r) => Number(r)).filter((n) => !isNaN(n));
        grandTotals[colLabel] = aggregateValues(nums, vf.aggregation);
      }
    }

    // Column grand totals: total across all column keys per value field
    if (config.showGrandTotalColumns) {
      for (let vi = 0; vi < config.valueFields.length; vi++) {
        const vf = config.valueFields[vi];
        const vfLabel = vf.alias ?? vf.field;
        const allRaws: unknown[] = [];
        for (const ctMap of columnTotalsAccum.values()) {
          allRaws.push(...(ctMap.get(vi) ?? []));
        }
        const nums = allRaws.map((r) => Number(r)).filter((n) => !isNaN(n));
        columnGrandTotals[vfLabel] = aggregateValues(nums, vf.aggregation);
      }
    }
  }

  // Build header list
  const columnHeaders: string[] = [];
  if (config.columnFields.length > 0) {
    for (const colKey of sortedColumnKeys) {
      for (const vf of config.valueFields) {
        const vfLabel = vf.alias ?? vf.field;
        columnHeaders.push(`${colKey.split('\x00').join(' | ')} | ${vfLabel}`);
      }
    }
  } else {
    for (const vf of config.valueFields) {
      columnHeaders.push(vf.alias ?? vf.field);
    }
  }

  const headers = [...config.rowFields, ...columnHeaders];
  if (config.showGrandTotalColumns) {
    for (const vf of config.valueFields) {
      headers.push(`Grand Total | ${vf.alias ?? vf.field}`);
    }
  }

  return {
    headers,
    columnHeaders,
    rows: finalRows,
    grandTotals,
    columnGrandTotals,
    metadata: {
      rowCount: finalRows.length,
      columnCount: columnHeaders.length,
      uniqueRowGroups: rowGroupKeys.length,
      uniqueColumnGroups: sortedColumnKeys.length || 1,
      processedRows: filteredRows.length,
    },
  };
}

function computeRowGrandTotal(
  colMap: Map<string, Map<number, unknown[]>>,
  valueFields: ValueFieldConfig[],
  valueFieldIndex: number
): number | null {
  const vf = valueFields[valueFieldIndex];
  if (!vf) return null;
  const allRaws: unknown[] = [];
  for (const valueMap of colMap.values()) {
    allRaws.push(...(valueMap.get(valueFieldIndex) ?? []));
  }
  const nums = allRaws.map((r) => Number(r)).filter((n) => !isNaN(n));
  return aggregateValues(nums, vf.aggregation);
}

// ─── Pivot Storage Helpers ────────────────────────────────────────────────────

async function storePivot(pivot: StoredPivot): Promise<void> {
  const cacheKey = `pivot:${pivot.id}`;
  await cacheSet(cacheKey, pivot, 3600);

  // Persist to workbook sheetsJson metadata under a _pivots key
  // We store pivot metadata in the workbook record's sheets JSON
  // using a dedicated _pivots array to avoid polluting sheet data
  try {
    const record = await prisma.excelWorkbook.findUnique({
      where: { id: pivot.config.workbookId },
    });
    if (record) {
      const metadata = record.metadata
        ? JSON.parse(record.metadata as string)
        : {};
      if (!Array.isArray(metadata._pivots)) {
        metadata._pivots = [];
      }
      const existingIndex = metadata._pivots.findIndex((p: StoredPivot) => p.id === pivot.id);
      if (existingIndex >= 0) {
        metadata._pivots[existingIndex] = pivot;
      } else {
        metadata._pivots.push(pivot);
      }
      await prisma.excelWorkbook.update({
        where: { id: record.id },
        data: { metadata: JSON.stringify(metadata) },
      });
      return;
    }
  } catch {
    // excelWorkbook may not exist, fall through to workbook
  }

  // Fallback: store in workbook.sheetsJson JSON field
  const workbook = await prisma.workbook.findUnique({
    where: { id: pivot.config.workbookId },
  });
  if (workbook) {
    const sheets = (workbook.sheetsJson as Record<string, unknown>) ?? {};
    const pivots: StoredPivot[] = Array.isArray(
      (sheets as Record<string, unknown>)['_pivots']
    )
      ? ((sheets as Record<string, unknown>)['_pivots'] as StoredPivot[])
      : [];

    const existingIndex = pivots.findIndex((p) => p.id === pivot.id);
    if (existingIndex >= 0) {
      pivots[existingIndex] = pivot;
    } else {
      pivots.push(pivot);
    }
    (sheets as Record<string, unknown>)['_pivots'] = pivots;
    await prisma.workbook.update({
      where: { id: workbook.id },
      data: { sheetsJson: sheets as Prisma.InputJsonValue },
    });
  }
}

async function loadPivot(pivotId: string): Promise<StoredPivot | null> {
  const cacheKey = `pivot:${pivotId}`;
  const cached = await cacheGet<StoredPivot>(cacheKey);
  if (cached) return cached;

  // Search across excelWorkbook metadata
  const workbookRecords = await prisma.excelWorkbook.findMany({
    where: { metadata: { not: null } },
    select: { id: true, metadata: true },
  });

  for (const record of workbookRecords) {
    try {
      const metadata = record.metadata
        ? JSON.parse(record.metadata as string)
        : {};
      const pivots: StoredPivot[] = metadata._pivots ?? [];
      const found = pivots.find((p) => p.id === pivotId);
      if (found) {
        await cacheSet(cacheKey, found, 3600);
        return found;
      }
    } catch {
      continue;
    }
  }

  // Fallback: search in workbook.sheetsJson
  const workbooks = await prisma.workbook.findMany({
    where: { sheetsJson: { not: undefined } },
    select: { id: true, sheetsJson: true },
  });

  for (const wb of workbooks) {
    try {
      const sheets = wb.sheetsJson as Record<string, unknown>;
      const pivots: StoredPivot[] = Array.isArray(sheets['_pivots'])
        ? (sheets['_pivots'] as StoredPivot[])
        : [];
      const found = pivots.find((p) => p.id === pivotId);
      if (found) {
        await cacheSet(cacheKey, found, 3600);
        return found;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function removePivotFromStorage(pivotId: string, workbookId: string): Promise<void> {
  const cacheKey = `pivot:${pivotId}`;
  await cacheDel(cacheKey);

  try {
    const record = await prisma.excelWorkbook.findUnique({
      where: { id: workbookId },
    });
    if (record && record.metadata) {
      const metadata = JSON.parse(record.metadata as string);
      if (Array.isArray(metadata._pivots)) {
        metadata._pivots = metadata._pivots.filter((p: StoredPivot) => p.id !== pivotId);
        await prisma.excelWorkbook.update({
          where: { id: workbookId },
          data: { metadata: JSON.stringify(metadata) },
        });
        return;
      }
    }
  } catch {
    // fall through
  }

  const workbook = await prisma.workbook.findUnique({
    where: { id: workbookId },
  });
  if (workbook && workbook.sheetsJson) {
    const sheets = workbook.sheetsJson as Record<string, unknown>;
    if (Array.isArray(sheets['_pivots'])) {
      sheets['_pivots'] = (sheets['_pivots'] as StoredPivot[]).filter(
        (p) => p.id !== pivotId
      );
      await prisma.workbook.update({
        where: { id: workbookId },
        data: { sheetsJson: sheets as Prisma.InputJsonValue },
      });
    }
  }
}

// ─── Service Class ────────────────────────────────────────────────────────────

export class PivotTableService {
  /**
   * Create a new pivot table from source sheet data.
   * Reads actual cell data from either ExcelCell records or workbook sheetsJson.
   * Computes row/column groupings, aggregations, subtotals, and grand totals.
   * Stores the pivot configuration and result for future retrieval.
   */
  async createPivotTable(
    input: z.infer<typeof CreatePivotTableSchema>
  ): Promise<{ pivotId: string; result: PivotResult }> {
    const validated = CreatePivotTableSchema.parse(input);
    const pivotId = uuidv4();

    logger.info('Creating pivot table', {
      pivotId,
      workbookId: validated.workbookId,
      sourceSheet: validated.sourceSheet,
      rowFields: validated.rowFields,
      columnFields: validated.columnFields,
      valueFields: validated.valueFields.map((v) => v.field),
    });

    const config: PivotConfig = {
      workbookId: validated.workbookId,
      sourceSheet: validated.sourceSheet,
      name: validated.name,
      rowFields: validated.rowFields,
      columnFields: validated.columnFields,
      valueFields: validated.valueFields,
      filterFields: validated.filterFields,
      showGrandTotalRows: validated.showGrandTotalRows,
      showGrandTotalColumns: validated.showGrandTotalColumns,
      showSubtotals: validated.showSubtotals,
      rowSort: validated.rowSort,
      columnSort: validated.columnSort,
    };

    const sourceRows = await readSourceData(validated.workbookId, validated.sourceSheet);

    if (sourceRows.length === 0) {
      logger.warn('Source sheet has no data rows', { workbookId: validated.workbookId, sourceSheet: validated.sourceSheet });
    }

    const result = computePivot(sourceRows, config);

    const now = new Date().toISOString();
    const storedPivot: StoredPivot = {
      id: pivotId,
      config,
      result,
      createdAt: now,
      updatedAt: now,
    };

    await storePivot(storedPivot);

    logger.info('Pivot table created successfully', {
      pivotId,
      rowCount: result.metadata.rowCount,
      columnCount: result.metadata.columnCount,
      processedRows: result.metadata.processedRows,
    });

    return { pivotId, result };
  }

  /**
   * Refresh an existing pivot table by re-reading the source data and
   * recomputing the result with the stored configuration.
   */
  async refreshPivot(
    input: z.infer<typeof RefreshPivotSchema>
  ): Promise<{ pivotId: string; result: PivotResult; refreshedAt: string }> {
    const { pivotId } = RefreshPivotSchema.parse(input);

    logger.info('Refreshing pivot table', { pivotId });

    const stored = await loadPivot(pivotId);
    if (!stored) {
      throw new Error(`Pivot table not found: ${pivotId}`);
    }

    const sourceRows = await readSourceData(stored.config.workbookId, stored.config.sourceSheet);
    const result = computePivot(sourceRows, stored.config);

    const refreshedAt = new Date().toISOString();
    const updated: StoredPivot = {
      ...stored,
      result,
      updatedAt: refreshedAt,
    };

    await storePivot(updated);

    logger.info('Pivot table refreshed', {
      pivotId,
      rowCount: result.metadata.rowCount,
      processedRows: result.metadata.processedRows,
    });

    return { pivotId, result, refreshedAt };
  }

  /**
   * Retrieve the computed pivot data for an existing pivot table.
   * Returns cached result when available.
   */
  async getPivotData(
    input: z.infer<typeof GetPivotDataSchema>
  ): Promise<{ pivotId: string; config: PivotConfig; result: PivotResult; updatedAt: string }> {
    const { pivotId } = GetPivotDataSchema.parse(input);

    logger.info('Getting pivot data', { pivotId });

    const stored = await loadPivot(pivotId);
    if (!stored) {
      throw new Error(`Pivot table not found: ${pivotId}`);
    }

    if (!stored.result) {
      // Result was not computed yet; compute it now
      const sourceRows = await readSourceData(stored.config.workbookId, stored.config.sourceSheet);
      const result = computePivot(sourceRows, stored.config);
      stored.result = result;
      stored.updatedAt = new Date().toISOString();
      await storePivot(stored);
    }

    return {
      pivotId,
      config: stored.config,
      result: stored.result,
      updatedAt: stored.updatedAt,
    };
  }

  /**
   * Delete a pivot table and evict its cache entry.
   */
  async deletePivotTable(
    input: z.infer<typeof DeletePivotTableSchema>
  ): Promise<{ pivotId: string; deleted: boolean }> {
    const { pivotId } = DeletePivotTableSchema.parse(input);

    logger.info('Deleting pivot table', { pivotId });

    const stored = await loadPivot(pivotId);
    if (!stored) {
      throw new Error(`Pivot table not found: ${pivotId}`);
    }

    await removePivotFromStorage(pivotId, stored.config.workbookId);

    logger.info('Pivot table deleted', { pivotId });
    return { pivotId, deleted: true };
  }

  /**
   * Update the configuration of an existing pivot table and recompute the result.
   */
  async updatePivotConfig(
    input: z.infer<typeof UpdatePivotConfigSchema>
  ): Promise<{ pivotId: string; result: PivotResult; updatedAt: string }> {
    const validated = UpdatePivotConfigSchema.parse(input);

    logger.info('Updating pivot config', { pivotId: validated.pivotId });

    const stored = await loadPivot(validated.pivotId);
    if (!stored) {
      throw new Error(`Pivot table not found: ${validated.pivotId}`);
    }

    const updatedConfig: PivotConfig = {
      ...stored.config,
      ...(validated.rowFields !== undefined && { rowFields: validated.rowFields }),
      ...(validated.columnFields !== undefined && { columnFields: validated.columnFields }),
      ...(validated.valueFields !== undefined && { valueFields: validated.valueFields }),
      ...(validated.filterFields !== undefined && { filterFields: validated.filterFields }),
      ...(validated.showGrandTotalRows !== undefined && { showGrandTotalRows: validated.showGrandTotalRows }),
      ...(validated.showGrandTotalColumns !== undefined && { showGrandTotalColumns: validated.showGrandTotalColumns }),
      ...(validated.showSubtotals !== undefined && { showSubtotals: validated.showSubtotals }),
      ...(validated.rowSort !== undefined && { rowSort: validated.rowSort }),
      ...(validated.columnSort !== undefined && { columnSort: validated.columnSort }),
    };

    const sourceRows = await readSourceData(updatedConfig.workbookId, updatedConfig.sourceSheet);
    const result = computePivot(sourceRows, updatedConfig);

    const updatedAt = new Date().toISOString();
    const updated: StoredPivot = {
      ...stored,
      config: updatedConfig,
      result,
      updatedAt,
    };

    await storePivot(updated);

    logger.info('Pivot config updated', {
      pivotId: validated.pivotId,
      rowCount: result.metadata.rowCount,
    });

    return { pivotId: validated.pivotId, result, updatedAt };
  }

  /**
   * Drill down into a specific pivot cell to return the underlying raw source rows
   * that contributed to the aggregated value at (rowKeys, columnKeys) for a given value field.
   */
  async drillDown(
    input: z.infer<typeof DrillDownSchema>
  ): Promise<{
    pivotId: string;
    rowKeys: string[];
    columnKeys: string[];
    valueField: ValueFieldConfig;
    detailRows: Array<Record<string, unknown>>;
    rowCount: number;
  }> {
    const validated = DrillDownSchema.parse(input);

    logger.info('Drilling down pivot cell', {
      pivotId: validated.pivotId,
      rowKeys: validated.rowKeys,
      columnKeys: validated.columnKeys,
      valueFieldIndex: validated.valueFieldIndex,
    });

    const stored = await loadPivot(validated.pivotId);
    if (!stored) {
      throw new Error(`Pivot table not found: ${validated.pivotId}`);
    }

    const config = stored.config;
    const vf = config.valueFields[validated.valueFieldIndex];
    if (!vf) {
      throw new Error(
        `Value field index ${validated.valueFieldIndex} out of range for pivot ${validated.pivotId}`
      );
    }

    const sourceRows = await readSourceData(config.workbookId, config.sourceSheet);

    // Filter rows that match the drill-down keys
    const detailRows = sourceRows.filter((row) => {
      // Must pass global filters
      if (!passesAllFilters(row, config.filterFields)) return false;

      // Must match all row field keys
      for (let i = 0; i < config.rowFields.length && i < validated.rowKeys.length; i++) {
        const field = config.rowFields[i];
        if (String(row[field] ?? '') !== validated.rowKeys[i]) {
          return false;
        }
      }

      // Must match all column field keys (if any)
      if (validated.columnKeys.length > 0 && config.columnFields.length > 0) {
        for (let i = 0; i < config.columnFields.length && i < validated.columnKeys.length; i++) {
          const field = config.columnFields[i];
          if (String(row[field] ?? '') !== validated.columnKeys[i]) {
            return false;
          }
        }
      }

      return true;
    });

    logger.info('Drill-down complete', {
      pivotId: validated.pivotId,
      rowCount: detailRows.length,
    });

    return {
      pivotId: validated.pivotId,
      rowKeys: validated.rowKeys,
      columnKeys: validated.columnKeys,
      valueField: vf,
      detailRows,
      rowCount: detailRows.length,
    };
  }

  /**
   * Export the computed pivot result as a new sheet in the workbook.
   * Writes the pivot layout (headers, data rows, subtotals, grand totals)
   * into an ExcelJS worksheet and persists the updated workbook binary.
   */
  async exportPivotToSheet(
    input: z.infer<typeof ExportPivotSchema>
  ): Promise<{
    pivotId: string;
    sheetName: string;
    workbookId: string;
    rowsWritten: number;
  }> {
    const validated = ExportPivotSchema.parse(input);

    logger.info('Exporting pivot to sheet', {
      pivotId: validated.pivotId,
      sheetName: validated.sheetName,
    });

    const stored = await loadPivot(validated.pivotId);
    if (!stored) {
      throw new Error(`Pivot table not found: ${validated.pivotId}`);
    }

    let result = stored.result;
    if (!result) {
      const sourceRows = await readSourceData(stored.config.workbookId, stored.config.sourceSheet);
      result = computePivot(sourceRows, stored.config);
      stored.result = result;
      stored.updatedAt = new Date().toISOString();
      await storePivot(stored);
    }

    const { config } = stored;

    // Load workbook binary for export
    const workbookRecord = await prisma.excelWorkbook.findUnique({
      where: { id: config.workbookId },
    });

    const wb = new ExcelJS.Workbook();
    if (workbookRecord?.fileData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await wb.xlsx.load(workbookRecord.fileData as any);
    }

    // Remove existing sheet with the same name to avoid duplicates
    const existingSheet = wb.getWorksheet(validated.sheetName);
    if (existingSheet) {
      wb.removeWorksheet(existingSheet.id);
    }

    const ws = wb.addWorksheet(validated.sheetName, {
      properties: { defaultColWidth: 16 },
    });

    // Style constants
    const HEADER_FILL: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E79' },
    };
    const SUBTOTAL_FILL: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFBDD7EE' },
    };
    const GRAND_TOTAL_FILL: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    const WHITE_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
    const DARK_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF1F4E79' } };
    const BOLD_WHITE: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
    const NUM_FMT = '#,##0.00';

    // Write header row
    const headerRow = ws.addRow(result.headers);
    headerRow.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = WHITE_FONT;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF1F4E79' } },
      };
    });
    headerRow.height = 24;

    let rowsWritten = 1;

    // Write data rows
    for (const pivotRow of result.rows) {
      const rowValues: (string | number | null)[] = [];

      // Row key cells
      for (const rk of pivotRow.rowKeys) {
        rowValues.push(rk);
      }
      // Pad to rowFields length if subtotal (fewer keys)
      while (rowValues.length < config.rowFields.length) {
        rowValues.push('');
      }

      // Column value cells
      for (const colHeader of result.columnHeaders) {
        let found: number | null = null;
        for (const [vfLabel, colCells] of Object.entries(pivotRow.cells)) {
          for (const [cellKey, cellVal] of Object.entries(colCells)) {
            if (cellKey === colHeader || cellKey === vfLabel) {
              found = cellVal;
              break;
            }
          }
          if (found !== null) break;
        }
        rowValues.push(found);
      }

      // Grand total columns
      if (config.showGrandTotalColumns && Object.keys(pivotRow.rowTotals).length > 0) {
        for (const vf of config.valueFields) {
          const vfLabel = vf.alias ?? vf.field;
          rowValues.push(pivotRow.rowTotals[vfLabel] ?? null);
        }
      }

      const excelRow = ws.addRow(rowValues);

      if (pivotRow.isSubtotal) {
        excelRow.eachCell((cell, colNum) => {
          if (colNum > config.rowFields.length) {
            cell.fill = SUBTOTAL_FILL;
            cell.font = DARK_FONT;
            cell.numFmt = NUM_FMT;
          } else {
            cell.font = DARK_FONT;
          }
        });
      } else if (pivotRow.isGrandTotal) {
        excelRow.eachCell((cell, colNum) => {
          cell.fill = GRAND_TOTAL_FILL;
          cell.font = BOLD_WHITE;
          if (colNum > config.rowFields.length) {
            cell.numFmt = NUM_FMT;
          }
        });
      } else {
        excelRow.eachCell((cell, colNum) => {
          if (colNum > config.rowFields.length && typeof cell.value === 'number') {
            cell.numFmt = NUM_FMT;
          }
        });
      }

      rowsWritten++;
    }

    // Write grand total row
    if (config.showGrandTotalRows) {
      const grandTotalValues: (string | number | null)[] = ['Grand Total'];
      for (let i = 1; i < config.rowFields.length; i++) {
        grandTotalValues.push('');
      }

      for (const colHeader of result.columnHeaders) {
        grandTotalValues.push(result.grandTotals[colHeader] ?? null);
      }

      if (config.showGrandTotalColumns) {
        for (const vf of config.valueFields) {
          const vfLabel = vf.alias ?? vf.field;
          grandTotalValues.push(result.columnGrandTotals[vfLabel] ?? null);
        }
      }

      const grandTotalRow = ws.addRow(grandTotalValues);
      grandTotalRow.eachCell((cell, colNum) => {
        cell.fill = GRAND_TOTAL_FILL;
        cell.font = BOLD_WHITE;
        if (colNum > config.rowFields.length && typeof cell.value === 'number') {
          cell.numFmt = NUM_FMT;
        }
      });
      grandTotalRow.height = 20;
      rowsWritten++;
    }

    // Auto-fit columns (approximate)
    ws.columns.forEach((col) => {
      if (col && col.eachCell) {
        let maxLen = 12;
        col.eachCell({ includeEmpty: false }, (cell) => {
          const cellLen = cell.value !== null && cell.value !== undefined ? String(cell.value).length : 0;
          if (cellLen > maxLen) maxLen = cellLen;
        });
        col.width = Math.min(maxLen + 2, 40);
      }
    });

    // Freeze first row
    ws.views = [{ state: 'frozen', xSplit: config.rowFields.length, ySplit: 1, topLeftCell: `A2` }];

    // Persist updated workbook
    const arrayBuffer = await wb.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (workbookRecord) {
      await prisma.excelWorkbook.update({
        where: { id: config.workbookId },
        data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
      });
    } else {
      // Update metadata in workbook record
      const workbook = await prisma.workbook.findUnique({ where: { id: config.workbookId } });
      if (workbook) {
        const sheets = (workbook.sheetsJson as Record<string, unknown>) ?? {};
        const sheetsArray = Array.isArray(sheets)
          ? (sheets as unknown[])
          : Array.isArray(sheets['sheets'])
          ? (sheets['sheets'] as unknown[])
          : [];
        const existingSheetIdx = (sheetsArray as Array<Record<string, unknown>>).findIndex(
          (s) => s['name'] === validated.sheetName
        );
        const sheetEntry: Record<string, unknown> = {
          name: validated.sheetName,
          type: 'pivot',
          pivotId: validated.pivotId,
          rowCount: rowsWritten,
        };
        if (existingSheetIdx >= 0) {
          (sheetsArray as Array<Record<string, unknown>>)[existingSheetIdx] = sheetEntry;
        } else {
          (sheetsArray as Array<Record<string, unknown>>).push(sheetEntry);
        }
        await prisma.workbook.update({
          where: { id: config.workbookId },
          data: { sheetsJson: (Array.isArray(workbook.sheetsJson) ? sheetsArray : { ...sheets, sheets: sheetsArray }) as unknown as Prisma.InputJsonValue },
        });
      }
    }

    await cacheDel(`workbook:${config.workbookId}:*`);

    logger.info('Pivot exported to sheet', {
      pivotId: validated.pivotId,
      sheetName: validated.sheetName,
      workbookId: config.workbookId,
      rowsWritten,
    });

    return {
      pivotId: validated.pivotId,
      sheetName: validated.sheetName,
      workbookId: config.workbookId,
      rowsWritten,
    };
  }
}

export const pivotTableService = new PivotTableService();
