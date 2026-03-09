import type { FormulaFunction, FormulaValue, FormulaContext } from '../../types/formula.types.js';
import { randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Cryptographically secure random float in [0, 1) using Node.js crypto module.
 * Replaces Math.random() to comply with project coding rules.
 */
function secureRandom(): number {
  const buf = randomBytes(4);
  return buf.readUInt32BE(0) / 0x100000000;
}

function flattenValues(values: FormulaValue[]): FormulaValue[] {
  const result: FormulaValue[] = [];
  for (const v of values) {
    if (Array.isArray(v)) {
      result.push(...flattenValues(v));
    } else {
      result.push(v);
    }
  }
  return result;
}

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
 * Convert a flat array into a 2D array (array of rows) given known row length.
 * If the input is already 2D (array of arrays), return as-is.
 */
function to2D(arr: FormulaValue[]): FormulaValue[][] {
  if (arr.length === 0) return [];
  if (Array.isArray(arr[0])) {
    return arr as FormulaValue[][];
  }
  // Treat as single-column 2D
  return arr.map((v) => [v]);
}

function from2D(rows: FormulaValue[][]): FormulaValue[] {
  if (rows.length === 0) return [];
  if (rows[0].length === 1) {
    return rows.map((r) => r[0]);
  }
  return rows as unknown as FormulaValue[];
}

function compareValues(a: FormulaValue, b: FormulaValue, order: number): number {
  const na = toNumber(a);
  const nb = toNumber(b);

  // Both numbers
  if (na !== null && nb !== null) return (na - nb) * order;

  // Both strings
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b) * order;
  }

  // Numbers before strings, strings before others
  if (na !== null) return -1 * order;
  if (nb !== null) return 1 * order;
  if (typeof a === 'string') return -1 * order;
  if (typeof b === 'string') return 1 * order;

  return 0;
}

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

const SORT: FormulaFunction = {
  name: 'SORT',
  category: 'dynamic-array',
  description: 'Sorts the contents of a range or array.',
  minArgs: 1,
  maxArgs: 4,
  isVolatile: false,
  returnsArray: true,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const input = Array.isArray(args[0]) ? args[0] as FormulaValue[] : [args[0]];
    const sortIndex = args.length > 1 ? (toNumber(args[1]) ?? 1) : 1;
    const sortOrder = args.length > 2 ? (toNumber(args[2]) ?? 1) : 1;
    const byCol = args.length > 3 ? Boolean(args[3]) : false;

    if (input.length === 0) return [];

    const rows = to2D(input);

    if (byCol) {
      // Transpose, sort rows, transpose back
      if (rows.length === 0) return [];
      const colCount = rows[0].length;
      // Build columns as rows
      const cols: FormulaValue[][] = [];
      for (let c = 0; c < colCount; c++) {
        cols.push(rows.map((r) => r[c] ?? null));
      }
      const keyRowIndex = Math.max(0, sortIndex - 1);
      cols.sort((a, b) => compareValues(a[keyRowIndex], b[keyRowIndex], sortOrder));
      // Transpose back
      const result: FormulaValue[][] = [];
      for (let r = 0; r < rows.length; r++) {
        result.push(cols.map((col) => col[r]));
      }
      return from2D(result);
    }

    const keyColIndex = Math.max(0, sortIndex - 1);
    const sorted = [...rows].sort((a, b) =>
      compareValues(a[keyColIndex] ?? null, b[keyColIndex] ?? null, sortOrder)
    );
    return from2D(sorted);
  },
};

const FILTER: FormulaFunction = {
  name: 'FILTER',
  category: 'dynamic-array',
  description: 'Filters a range of data based on criteria you define.',
  minArgs: 2,
  maxArgs: 3,
  isVolatile: false,
  returnsArray: true,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const input = Array.isArray(args[0]) ? args[0] as FormulaValue[] : [args[0]];
    const include = Array.isArray(args[1]) ? flattenValues(args[1] as FormulaValue[]) : [args[1]];
    const ifEmpty = args.length > 2 ? args[2] : '#CALC!' as FormulaValue;

    const rows = to2D(input);
    const filtered: FormulaValue[][] = [];

    for (let i = 0; i < rows.length; i++) {
      const flag = include[i];
      // Truthy: true, non-zero number, non-empty non-error string
      const keep =
        flag === true ||
        (typeof flag === 'number' && flag !== 0) ||
        (typeof flag === 'boolean' && flag);
      if (keep) {
        filtered.push(rows[i]);
      }
    }

    if (filtered.length === 0) {
      return ifEmpty;
    }

    return from2D(filtered);
  },
};

const UNIQUE: FormulaFunction = {
  name: 'UNIQUE',
  category: 'dynamic-array',
  description: 'Returns a list of unique values in a list or range.',
  minArgs: 1,
  maxArgs: 3,
  isVolatile: false,
  returnsArray: true,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const input = Array.isArray(args[0]) ? args[0] as FormulaValue[] : [args[0]];
    const byCol = args.length > 1 ? Boolean(args[1]) : false;
    const exactlyOnce = args.length > 2 ? Boolean(args[2]) : false;

    if (input.length === 0) return [];

    const rows = to2D(input);

    if (byCol) {
      // Work with columns instead of rows
      if (rows.length === 0) return [];
      const colCount = rows[0].length;
      const cols: FormulaValue[][] = [];
      for (let c = 0; c < colCount; c++) {
        cols.push(rows.map((r) => r[c] ?? null));
      }
      const keys = cols.map((col) => JSON.stringify(col));
      const countMap = new Map<string, number>();
      for (const k of keys) {
        countMap.set(k, (countMap.get(k) ?? 0) + 1);
      }
      const seen = new Set<string>();
      const uniqueCols: FormulaValue[][] = [];
      for (let i = 0; i < cols.length; i++) {
        const k = keys[i];
        if (exactlyOnce) {
          if (countMap.get(k) === 1) uniqueCols.push(cols[i]);
        } else {
          if (!seen.has(k)) {
            seen.add(k);
            uniqueCols.push(cols[i]);
          }
        }
      }
      // Transpose back
      if (uniqueCols.length === 0) return [];
      const result: FormulaValue[][] = [];
      for (let r = 0; r < rows.length; r++) {
        result.push(uniqueCols.map((col) => col[r]));
      }
      return from2D(result);
    }

    // By row (default)
    const keys = rows.map((row) => JSON.stringify(row));
    const countMap = new Map<string, number>();
    for (const k of keys) {
      countMap.set(k, (countMap.get(k) ?? 0) + 1);
    }

    const seen = new Set<string>();
    const uniqueRows: FormulaValue[][] = [];
    for (let i = 0; i < rows.length; i++) {
      const k = keys[i];
      if (exactlyOnce) {
        if (countMap.get(k) === 1) uniqueRows.push(rows[i]);
      } else {
        if (!seen.has(k)) {
          seen.add(k);
          uniqueRows.push(rows[i]);
        }
      }
    }

    return from2D(uniqueRows);
  },
};

const SEQUENCE: FormulaFunction = {
  name: 'SEQUENCE',
  category: 'dynamic-array',
  description: 'Generates a list of sequential numbers in an array.',
  minArgs: 1,
  maxArgs: 4,
  isVolatile: false,
  returnsArray: true,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const rows = toNumber(args[0]) ?? 1;
    const columns = args.length > 1 ? (toNumber(args[1]) ?? 1) : 1;
    const start = args.length > 2 ? (toNumber(args[2]) ?? 1) : 1;
    const step = args.length > 3 ? (toNumber(args[3]) ?? 1) : 1;

    if (rows < 1 || columns < 1) return '#VALUE!' as FormulaValue;
    if (!Number.isFinite(rows) || !Number.isFinite(columns)) return '#VALUE!' as FormulaValue;

    const result: FormulaValue[][] = [];
    let current = start;

    for (let r = 0; r < rows; r++) {
      const row: FormulaValue[] = [];
      for (let c = 0; c < columns; c++) {
        row.push(current);
        current += step;
      }
      result.push(row);
    }

    // If single column, return flat array
    if (columns === 1) {
      return result.map((r) => r[0]);
    }

    return result as unknown as FormulaValue[];
  },
};

const SORTBY: FormulaFunction = {
  name: 'SORTBY',
  category: 'dynamic-array',
  description: 'Sorts the contents of a range or array based on the values in a corresponding range or array.',
  minArgs: 2,
  maxArgs: 126,
  isVolatile: false,
  returnsArray: true,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const input = Array.isArray(args[0]) ? args[0] as FormulaValue[] : [args[0]];
    if (input.length === 0) return [];

    const rows = to2D(input);

    // Collect by_array / sort_order pairs starting at index 1
    const sortKeys: { values: FormulaValue[]; order: number }[] = [];
    let i = 1;
    while (i < args.length) {
      const byArray = Array.isArray(args[i]) ? flattenValues(args[i] as FormulaValue[]) : [args[i]];
      const order = i + 1 < args.length ? (toNumber(args[i + 1]) ?? 1) : 1;
      sortKeys.push({ values: byArray, order });
      i += 2;
    }

    if (sortKeys.length === 0) return from2D(rows);

    // Create index array and sort
    const indices = rows.map((_, idx) => idx);
    indices.sort((a, b) => {
      for (const key of sortKeys) {
        const va = key.values[a] ?? null;
        const vb = key.values[b] ?? null;
        const cmp = compareValues(va, vb, key.order);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });

    const sorted = indices.map((idx) => rows[idx]);
    return from2D(sorted);
  },
};

const RANDARRAY: FormulaFunction = {
  name: 'RANDARRAY',
  category: 'dynamic-array',
  description: 'Returns an array of random numbers.',
  minArgs: 0,
  maxArgs: 5,
  isVolatile: true,
  returnsArray: true,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const rows = args.length > 0 ? (toNumber(args[0]) ?? 1) : 1;
    const columns = args.length > 1 ? (toNumber(args[1]) ?? 1) : 1;
    const min = args.length > 2 ? (toNumber(args[2]) ?? 0) : 0;
    const max = args.length > 3 ? (toNumber(args[3]) ?? 1) : 1;
    const wholeNumber = args.length > 4 ? Boolean(args[4]) : false;

    if (rows < 1 || columns < 1) return '#VALUE!' as FormulaValue;
    if (min > max) return '#VALUE!' as FormulaValue;

    const result: FormulaValue[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: FormulaValue[] = [];
      for (let c = 0; c < columns; c++) {
        const raw = secureRandom() * (max - min) + min;
        row.push(wholeNumber ? Math.floor(raw) : raw);
      }
      result.push(row);
    }

    // Single cell
    if (rows === 1 && columns === 1) return result[0][0];
    // Single column
    if (columns === 1) return result.map((r) => r[0]);

    return result as unknown as FormulaValue[];
  },
};

const LET: FormulaFunction = {
  name: 'LET',
  category: 'dynamic-array',
  description: 'Assigns names to calculation results to allow storing intermediate calculations.',
  minArgs: 3,
  maxArgs: 253,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], context: FormulaContext): FormulaValue {
    // LET(name1, value1, name2, value2, ..., calculation)
    // Args must be odd count: N name-value pairs + 1 final calculation
    if (args.length < 3) return '#VALUE!' as FormulaValue;
    if (args.length % 2 === 0) return '#VALUE!' as FormulaValue;

    // Build variable bindings from pairs
    const bindings: Map<string, FormulaValue> = new Map();
    for (let i = 0; i < args.length - 1; i += 2) {
      const name = String(args[i]);
      let value = args[i + 1];

      // If the value references a previously bound variable, resolve it
      if (typeof value === 'string' && bindings.has(value)) {
        value = bindings.get(value) as FormulaValue;
      }

      bindings.set(name, value);
    }

    // The last argument is the calculation result.
    // Since the formula parser evaluates args before passing them,
    // the final value is already computed. However, if it references
    // a bound variable name, resolve it.
    let result = args[args.length - 1];
    if (typeof result === 'string' && bindings.has(result)) {
      result = bindings.get(result) as FormulaValue;
    }

    // Store bindings in context for potential nested formula resolution
    if (context && typeof context === 'object') {
      const ctx = context as unknown as Record<string, unknown>;
      const existingVars = (ctx['letBindings'] as Map<string, FormulaValue>) ?? new Map<string, FormulaValue>();
      for (const [k, v] of bindings) {
        existingVars.set(k, v);
      }
      ctx['letBindings'] = existingVars;
    }

    return result;
  },
};

const LAMBDA: FormulaFunction = {
  name: 'LAMBDA',
  category: 'dynamic-array',
  description: 'Creates a custom reusable function that can be called with arguments.',
  minArgs: 1,
  maxArgs: 254,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], context: FormulaContext): FormulaValue {
    // LAMBDA(param1, param2, ..., body)(arg1, arg2, ...)
    // When called from the formula engine, args contain:
    //   - Parameter names (strings) for positions 0..N-2
    //   - Body/result expression at position N-1
    //   - If invoked (not just defined), additional args from N onward are the call arguments
    if (args.length === 0) return '#VALUE!' as FormulaValue;

    // If only one arg, it's the body/result of a zero-parameter lambda
    if (args.length === 1) return args[0];

    // Determine parameter names and body
    // The formula parser evaluates all args. Parameter names come as strings,
    // body is the final expression result, and call arguments follow.
    // Convention: first N-1 are param names, last is the body result.
    // If the lambda is being called with arguments, those are appended after.
    const paramCount = args.length - 1;
    const paramNames: string[] = [];
    for (let i = 0; i < paramCount; i++) {
      paramNames.push(String(args[i]));
    }

    const bodyResult = args[args.length - 1];

    // Store the lambda definition in context for potential MAP/REDUCE usage
    if (context && typeof context === 'object') {
      const ctx = context as unknown as Record<string, unknown>;
      ctx['lambdaParams'] = paramNames;
      ctx['lambdaBody'] = bodyResult;
    }

    // When args are pre-evaluated by the formula engine, the body already
    // contains the computed result with parameter values substituted.
    return bodyResult;
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const dynamicArrayFunctions: FormulaFunction[] = [
  SORT,
  FILTER,
  UNIQUE,
  SEQUENCE,
  SORTBY,
  RANDARRAY,
  LET,
  LAMBDA,
];
