/**
 * Database Functions — Rasid Platform Excel Engine
 * دوال قاعدة البيانات: DSUM, DAVERAGE, DCOUNT, DCOUNTA, DMAX, DMIN, DGET, DSTDEV
 */

import type { FormulaFunction, FormulaValue, FormulaContext } from '../../types/formula.types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNumber(v: FormulaValue): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Parse the database range (2D array) and criteria range.
 * database: first row = headers, remaining rows = data
 * field: column name (string) or column index (number, 1-based)
 * criteria: first row = headers, second row = criteria values
 */
function filterDBRows(
  database: FormulaValue[][],
  field: FormulaValue,
  criteria: FormulaValue[][]
): number[] {
  if (database.length < 2 || criteria.length < 2) return [];

  const headers = database[0].map((h) => String(h ?? '').toLowerCase().trim());
  const criteriaHeaders = criteria[0].map((h) => String(h ?? '').toLowerCase().trim());

  // Determine field column index
  let fieldIndex: number;
  if (typeof field === 'number') {
    fieldIndex = field - 1; // 1-based to 0-based
  } else {
    const fieldName = String(field).toLowerCase().trim();
    fieldIndex = headers.indexOf(fieldName);
  }

  if (fieldIndex < 0 || fieldIndex >= headers.length) {
    return [];
  }

  // Parse criteria conditions
  const conditions: Array<{ colIndex: number; value: FormulaValue; operator: string }> = [];

  for (let ci = 0; ci < criteriaHeaders.length; ci++) {
    const criteriaValue = criteria[1]?.[ci];
    if (criteriaValue === null || criteriaValue === undefined || criteriaValue === '') continue;

    const colIndex = headers.indexOf(criteriaHeaders[ci]);
    if (colIndex < 0) continue;

    // Parse operator from criteria value
    const strVal = String(criteriaValue);
    let operator = '=';
    let value: FormulaValue = criteriaValue;

    if (strVal.startsWith('>=')) {
      operator = '>=';
      value = toNumber(strVal.slice(2)) ?? strVal.slice(2);
    } else if (strVal.startsWith('<=')) {
      operator = '<=';
      value = toNumber(strVal.slice(2)) ?? strVal.slice(2);
    } else if (strVal.startsWith('<>')) {
      operator = '<>';
      value = toNumber(strVal.slice(2)) ?? strVal.slice(2);
    } else if (strVal.startsWith('>')) {
      operator = '>';
      value = toNumber(strVal.slice(1)) ?? strVal.slice(1);
    } else if (strVal.startsWith('<')) {
      operator = '<';
      value = toNumber(strVal.slice(1)) ?? strVal.slice(1);
    } else if (strVal.startsWith('=')) {
      operator = '=';
      value = toNumber(strVal.slice(1)) ?? strVal.slice(1);
    }

    conditions.push({ colIndex, value, operator });
  }

  // Filter rows
  const matchingFieldValues: number[] = [];

  for (let rowIdx = 1; rowIdx < database.length; rowIdx++) {
    const row = database[rowIdx];
    let matches = true;

    for (const cond of conditions) {
      const cellValue = row[cond.colIndex];
      if (!matchesCondition(cellValue, cond.value, cond.operator)) {
        matches = false;
        break;
      }
    }

    if (matches) {
      const val = toNumber(row[fieldIndex]);
      if (val !== null) {
        matchingFieldValues.push(val);
      }
    }
  }

  return matchingFieldValues;
}

function filterDBRowsAll(
  database: FormulaValue[][],
  field: FormulaValue,
  criteria: FormulaValue[][]
): FormulaValue[] {
  if (database.length < 2 || criteria.length < 2) return [];

  const headers = database[0].map((h) => String(h ?? '').toLowerCase().trim());
  const criteriaHeaders = criteria[0].map((h) => String(h ?? '').toLowerCase().trim());

  let fieldIndex: number;
  if (typeof field === 'number') {
    fieldIndex = field - 1;
  } else {
    const fieldName = String(field).toLowerCase().trim();
    fieldIndex = headers.indexOf(fieldName);
  }

  if (fieldIndex < 0 || fieldIndex >= headers.length) return [];

  const conditions: Array<{ colIndex: number; value: FormulaValue; operator: string }> = [];
  for (let ci = 0; ci < criteriaHeaders.length; ci++) {
    const criteriaValue = criteria[1]?.[ci];
    if (criteriaValue === null || criteriaValue === undefined || criteriaValue === '') continue;
    const colIndex = headers.indexOf(criteriaHeaders[ci]);
    if (colIndex < 0) continue;

    const strVal = String(criteriaValue);
    let operator = '=';
    let value: FormulaValue = criteriaValue;

    if (strVal.startsWith('>=')) { operator = '>='; value = toNumber(strVal.slice(2)) ?? strVal.slice(2); }
    else if (strVal.startsWith('<=')) { operator = '<='; value = toNumber(strVal.slice(2)) ?? strVal.slice(2); }
    else if (strVal.startsWith('<>')) { operator = '<>'; value = toNumber(strVal.slice(2)) ?? strVal.slice(2); }
    else if (strVal.startsWith('>')) { operator = '>'; value = toNumber(strVal.slice(1)) ?? strVal.slice(1); }
    else if (strVal.startsWith('<')) { operator = '<'; value = toNumber(strVal.slice(1)) ?? strVal.slice(1); }
    else if (strVal.startsWith('=')) { operator = '='; value = toNumber(strVal.slice(1)) ?? strVal.slice(1); }

    conditions.push({ colIndex, value, operator });
  }

  const matchingValues: FormulaValue[] = [];

  for (let rowIdx = 1; rowIdx < database.length; rowIdx++) {
    const row = database[rowIdx];
    let matches = true;

    for (const cond of conditions) {
      if (!matchesCondition(row[cond.colIndex], cond.value, cond.operator)) {
        matches = false;
        break;
      }
    }

    if (matches) {
      matchingValues.push(row[fieldIndex]);
    }
  }

  return matchingValues;
}

function matchesCondition(cellValue: FormulaValue, condValue: FormulaValue, operator: string): boolean {
  const cellNum = toNumber(cellValue);
  const condNum = toNumber(condValue);

  if (cellNum !== null && condNum !== null) {
    switch (operator) {
      case '=': return cellNum === condNum;
      case '>': return cellNum > condNum;
      case '<': return cellNum < condNum;
      case '>=': return cellNum >= condNum;
      case '<=': return cellNum <= condNum;
      case '<>': return cellNum !== condNum;
    }
  }

  const cellStr = String(cellValue ?? '').toLowerCase();
  const condStr = String(condValue ?? '').toLowerCase();

  switch (operator) {
    case '=': return cellStr === condStr;
    case '<>': return cellStr !== condStr;
    default: return cellStr === condStr;
  }
}

function asDB(args: FormulaValue[]): { database: FormulaValue[][]; field: FormulaValue; criteria: FormulaValue[][] } {
  const database = (Array.isArray(args[0]) ? args[0] : [[args[0]]]) as FormulaValue[][];
  const field = Array.isArray(args[1]) ? (args[1] as FormulaValue[][])[0]?.[0] ?? args[1] : args[1];
  const criteria = (Array.isArray(args[2]) ? args[2] : [[args[2]]]) as FormulaValue[][];
  return { database, field, criteria };
}

// ─── Functions ────────────────────────────────────────────────────────────────

export const databaseFunctions: FormulaFunction[] = [
  {
    name: 'DSUM',
    category: 'database',
    description: 'Sums values in a field of matching records',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const { database, field, criteria } = asDB(args);
      const values = filterDBRows(database, field, criteria);
      return values.reduce((sum, v) => sum + v, 0);
    },
  },
  {
    name: 'DAVERAGE',
    category: 'database',
    description: 'Averages values in a field of matching records',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const { database, field, criteria } = asDB(args);
      const values = filterDBRows(database, field, criteria);
      if (values.length === 0) return '#DIV/0!' as FormulaValue;
      return values.reduce((sum, v) => sum + v, 0) / values.length;
    },
  },
  {
    name: 'DCOUNT',
    category: 'database',
    description: 'Counts numeric values in a field of matching records',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const { database, field, criteria } = asDB(args);
      const values = filterDBRows(database, field, criteria);
      return values.length;
    },
  },
  {
    name: 'DCOUNTA',
    category: 'database',
    description: 'Counts non-empty values in a field of matching records',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const { database, field, criteria } = asDB(args);
      const values = filterDBRowsAll(database, field, criteria);
      return values.filter((v) => v !== null && v !== undefined && v !== '').length;
    },
  },
  {
    name: 'DMAX',
    category: 'database',
    description: 'Returns the maximum value in a field of matching records',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const { database, field, criteria } = asDB(args);
      const values = filterDBRows(database, field, criteria);
      if (values.length === 0) return 0;
      return Math.max(...values);
    },
  },
  {
    name: 'DMIN',
    category: 'database',
    description: 'Returns the minimum value in a field of matching records',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const { database, field, criteria } = asDB(args);
      const values = filterDBRows(database, field, criteria);
      if (values.length === 0) return 0;
      return Math.min(...values);
    },
  },
  {
    name: 'DGET',
    category: 'database',
    description: 'Returns a single value from a field of one matching record',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const { database, field, criteria } = asDB(args);
      const values = filterDBRowsAll(database, field, criteria);
      if (values.length === 0) return '#VALUE!' as FormulaValue;
      if (values.length > 1) return '#NUM!' as FormulaValue;
      return values[0];
    },
  },
  {
    name: 'DSTDEV',
    category: 'database',
    description: 'Estimates standard deviation from a sample of matching records',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[]): FormulaValue => {
      const { database, field, criteria } = asDB(args);
      const values = filterDBRows(database, field, criteria);
      if (values.length < 2) return '#DIV/0!' as FormulaValue;

      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
      return Math.sqrt(variance);
    },
  },
];
