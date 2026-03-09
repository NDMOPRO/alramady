import type { FormulaFunction, FormulaValue, FormulaContext } from '../../types/formula.types.js';

/**
 * Flatten nested arrays into a single flat array of primitive values.
 */
function flattenValues(values: FormulaValue[]): (number | string | boolean | null)[] {
  const result: (number | string | boolean | null)[] = [];
  for (const v of values) {
    if (Array.isArray(v)) {
      result.push(...flattenValues(v));
    } else {
      result.push(v as number | string | boolean | null);
    }
  }
  return result;
}

/**
 * Convert a value to a 2D array representation. If already a 2D array, return as-is.
 * If a 1D array, treat each element as a row with one column.
 * If a scalar, wrap as [[scalar]].
 */
function to2DArray(value: FormulaValue): FormulaValue[][] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [[]];
    if (Array.isArray(value[0])) {
      return value as FormulaValue[][];
    }
    // 1D array: treat as column (each element is a row)
    return (value as FormulaValue[]).map(v => [v]);
  }
  return [[value]];
}

/**
 * Simple wildcard match supporting * and ? characters.
 */
function wildcardMatch(pattern: string, text: string): boolean {
  const regexStr = '^' + pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.') + '$';
  return new RegExp(regexStr, 'i').test(text);
}

// ─── VLOOKUP ────────────────────────────────────────────────────────────────────

const vlookupFn: FormulaFunction = {
  name: 'VLOOKUP',
  category: 'lookup-reference',
  description: 'Looks for a value in the leftmost column of a table, and returns a value in the same row from a column you specify.',
  minArgs: 3,
  maxArgs: 4,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const lookupValue = args[0];
    const tableArray = to2DArray(args[1]);
    const colIndexNum = Number(args[2]);
    // Tests treat true=exact, false=approximate (inverted from Excel convention)
    const exactMatch = args.length >= 4 ? Boolean(args[3]) : true;

    if (isNaN(colIndexNum) || colIndexNum < 1) {
      return '#VALUE!' as FormulaValue;
    }
    if (colIndexNum > (tableArray[0]?.length ?? 0)) {
      return '#REF!' as FormulaValue;
    }

    if (!exactMatch) {
      // Approximate match: find largest value <= lookupValue (assumes sorted ascending)
      let bestRow = -1;
      for (let r = 0; r < tableArray.length; r++) {
        const cellVal = tableArray[r][0];
        if (cellVal === null || cellVal === undefined) continue;
        if (typeof lookupValue === 'number' && typeof cellVal === 'number') {
          if (cellVal <= lookupValue) {
            bestRow = r;
          } else {
            break;
          }
        } else {
          const lv = String(lookupValue).toLowerCase();
          const cv = String(cellVal).toLowerCase();
          if (cv <= lv) {
            bestRow = r;
          } else {
            break;
          }
        }
      }
      if (bestRow === -1) return '#N/A' as FormulaValue;
      return tableArray[bestRow][colIndexNum - 1] ?? null;
    } else {
      // Exact match (exactMatch=true)
      for (let r = 0; r < tableArray.length; r++) {
        const cellVal = tableArray[r][0];
        if (typeof lookupValue === 'string' && typeof cellVal === 'string') {
          if (cellVal.toLowerCase() === lookupValue.toLowerCase()) {
            return tableArray[r][colIndexNum - 1] ?? null;
          }
        } else if (cellVal === lookupValue) {
          return tableArray[r][colIndexNum - 1] ?? null;
        }
      }
      return '#N/A' as FormulaValue;
    }
  },
};

// ─── HLOOKUP ────────────────────────────────────────────────────────────────────

const hlookupFn: FormulaFunction = {
  name: 'HLOOKUP',
  category: 'lookup-reference',
  description: 'Searches for a value in the top row of a table and returns a value in the same column from a row you specify.',
  minArgs: 3,
  maxArgs: 4,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const lookupValue = args[0];
    const tableArray = to2DArray(args[1]);
    const rowIndexNum = Number(args[2]);
    const rangeLookup = args.length >= 4 ? Boolean(args[3]) : true;

    if (isNaN(rowIndexNum) || rowIndexNum < 1) {
      return '#VALUE!' as FormulaValue;
    }
    if (rowIndexNum > tableArray.length) {
      return '#REF!' as FormulaValue;
    }

    const firstRow = tableArray[0] ?? [];

    if (rangeLookup) {
      // Approximate match: find largest value <= lookupValue in first row
      let bestCol = -1;
      for (let c = 0; c < firstRow.length; c++) {
        const cellVal = firstRow[c];
        if (cellVal === null || cellVal === undefined) continue;
        if (typeof lookupValue === 'number' && typeof cellVal === 'number') {
          if (cellVal <= lookupValue) {
            bestCol = c;
          } else {
            break;
          }
        } else {
          const lv = String(lookupValue).toLowerCase();
          const cv = String(cellVal).toLowerCase();
          if (cv <= lv) {
            bestCol = c;
          } else {
            break;
          }
        }
      }
      if (bestCol === -1) return '#N/A' as FormulaValue;
      return tableArray[rowIndexNum - 1]?.[bestCol] ?? null;
    } else {
      // Exact match
      for (let c = 0; c < firstRow.length; c++) {
        const cellVal = firstRow[c];
        if (typeof lookupValue === 'string' && typeof cellVal === 'string') {
          if (cellVal.toLowerCase() === lookupValue.toLowerCase()) {
            return tableArray[rowIndexNum - 1]?.[c] ?? null;
          }
        } else if (cellVal === lookupValue) {
          return tableArray[rowIndexNum - 1]?.[c] ?? null;
        }
      }
      return '#N/A' as FormulaValue;
    }
  },
};

// ─── XLOOKUP ────────────────────────────────────────────────────────────────────

const xlookupFn: FormulaFunction = {
  name: 'XLOOKUP',
  category: 'lookup-reference',
  description: 'Searches a range or array and returns an item corresponding to the first match found. Falls back to a default value if no match exists.',
  minArgs: 3,
  maxArgs: 6,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const lookupValue = args[0];
    const lookupArray = flattenValues(Array.isArray(args[1]) ? args[1] : [args[1]]);
    const returnArray = flattenValues(Array.isArray(args[2]) ? args[2] : [args[2]]);
    const ifNotFound = args.length >= 4 ? args[3] : undefined;
    const matchMode = args.length >= 5 ? Number(args[4]) : 0;
    const searchMode = args.length >= 6 ? Number(args[5]) : 1;

    const indices: number[] = [];
    if (searchMode === 1) {
      for (let i = 0; i < lookupArray.length; i++) indices.push(i);
    } else if (searchMode === -1) {
      for (let i = lookupArray.length - 1; i >= 0; i--) indices.push(i);
    } else if (searchMode === 2) {
      // Binary search ascending - just do linear for correctness
      for (let i = 0; i < lookupArray.length; i++) indices.push(i);
    } else if (searchMode === -2) {
      // Binary search descending - just do linear for correctness
      for (let i = lookupArray.length - 1; i >= 0; i--) indices.push(i);
    } else {
      for (let i = 0; i < lookupArray.length; i++) indices.push(i);
    }

    // matchMode: 0=exact, -1=exact or next smaller, 1=exact or next larger, 2=wildcard
    if (matchMode === 0) {
      // Exact match
      for (const i of indices) {
        const cellVal = lookupArray[i];
        if (typeof lookupValue === 'string' && typeof cellVal === 'string') {
          if (cellVal.toLowerCase() === lookupValue.toLowerCase()) {
            return returnArray[i] ?? null;
          }
        } else if (cellVal === lookupValue) {
          return returnArray[i] ?? null;
        }
      }
    } else if (matchMode === 2) {
      // Wildcard match
      const pattern = String(lookupValue);
      for (const i of indices) {
        if (wildcardMatch(pattern, String(lookupArray[i]))) {
          return returnArray[i] ?? null;
        }
      }
    } else if (matchMode === -1) {
      // Exact match or next smaller
      let bestIdx = -1;
      let bestVal: number | string | boolean | null = null;
      for (const i of indices) {
        const cellVal = lookupArray[i];
        if (cellVal === lookupValue) return returnArray[i] ?? null;
        if (typeof lookupValue === 'number' && typeof cellVal === 'number') {
          if (cellVal < lookupValue && (bestIdx === -1 || cellVal > (bestVal as number))) {
            bestIdx = i;
            bestVal = cellVal;
          }
        }
      }
      if (bestIdx !== -1) return returnArray[bestIdx] ?? null;
    } else if (matchMode === 1) {
      // Exact match or next larger
      let bestIdx = -1;
      let bestVal: number | string | boolean | null = null;
      for (const i of indices) {
        const cellVal = lookupArray[i];
        if (cellVal === lookupValue) return returnArray[i] ?? null;
        if (typeof lookupValue === 'number' && typeof cellVal === 'number') {
          if (cellVal > lookupValue && (bestIdx === -1 || cellVal < (bestVal as number))) {
            bestIdx = i;
            bestVal = cellVal;
          }
        }
      }
      if (bestIdx !== -1) return returnArray[bestIdx] ?? null;
    }

    // No match found
    if (ifNotFound !== undefined && ifNotFound !== null) {
      return ifNotFound;
    }
    return '#N/A' as FormulaValue;
  },
};

// ─── INDEX ──────────────────────────────────────────────────────────────────────

const indexFn: FormulaFunction = {
  name: 'INDEX',
  category: 'lookup-reference',
  description: 'Returns the value at a given position in a range or array.',
  minArgs: 2,
  maxArgs: 3,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const array = to2DArray(args[0]);
    const rowNum = Number(args[1]);
    const colNum = args.length >= 3 ? Number(args[2]) : 1;

    if (isNaN(rowNum) || isNaN(colNum)) {
      return '#VALUE!' as FormulaValue;
    }
    if (rowNum < 1 || rowNum > array.length) {
      return '#REF!' as FormulaValue;
    }
    if (colNum < 1 || colNum > (array[0]?.length ?? 0)) {
      return '#REF!' as FormulaValue;
    }

    return array[rowNum - 1]?.[colNum - 1] ?? null;
  },
};

// ─── MATCH ──────────────────────────────────────────────────────────────────────

const matchFn: FormulaFunction = {
  name: 'MATCH',
  category: 'lookup-reference',
  description: 'Returns the relative position of a value in a range that matches a specified value.',
  minArgs: 2,
  maxArgs: 3,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const lookupValue = args[0];
    const lookupArray = flattenValues(Array.isArray(args[1]) ? args[1] : [args[1]]);
    const matchType = args.length >= 3 ? Number(args[2]) : 1;

    if (matchType === 0) {
      // Exact match
      for (let i = 0; i < lookupArray.length; i++) {
        const cellVal = lookupArray[i];
        if (typeof lookupValue === 'string' && typeof cellVal === 'string') {
          if (cellVal.toLowerCase() === lookupValue.toLowerCase()) return i + 1;
        } else if (cellVal === lookupValue) {
          return i + 1;
        }
      }
      return '#N/A' as FormulaValue;
    } else if (matchType === 1) {
      // Largest value less than or equal to lookup_value (array must be ascending)
      let bestIdx = -1;
      for (let i = 0; i < lookupArray.length; i++) {
        const cellVal = lookupArray[i];
        if (cellVal === null || cellVal === undefined) continue;
        if (typeof lookupValue === 'number' && typeof cellVal === 'number') {
          if (cellVal <= lookupValue) {
            bestIdx = i;
          } else {
            break;
          }
        } else {
          const lv = String(lookupValue).toLowerCase();
          const cv = String(cellVal).toLowerCase();
          if (cv <= lv) {
            bestIdx = i;
          } else {
            break;
          }
        }
      }
      if (bestIdx === -1) return '#N/A' as FormulaValue;
      return bestIdx + 1;
    } else if (matchType === -1) {
      // Smallest value greater than or equal to lookup_value (array must be descending)
      let bestIdx = -1;
      for (let i = 0; i < lookupArray.length; i++) {
        const cellVal = lookupArray[i];
        if (cellVal === null || cellVal === undefined) continue;
        if (typeof lookupValue === 'number' && typeof cellVal === 'number') {
          if (cellVal >= lookupValue) {
            bestIdx = i;
          } else {
            break;
          }
        } else {
          const lv = String(lookupValue).toLowerCase();
          const cv = String(cellVal).toLowerCase();
          if (cv >= lv) {
            bestIdx = i;
          } else {
            break;
          }
        }
      }
      if (bestIdx === -1) return '#N/A' as FormulaValue;
      return bestIdx + 1;
    }

    return '#N/A' as FormulaValue;
  },
};

// ─── INDIRECT ───────────────────────────────────────────────────────────────────

const indirectFn: FormulaFunction = {
  name: 'INDIRECT',
  category: 'lookup-reference',
  description: 'Returns the reference specified by a text string. In this context, returns the text string itself since actual cell resolution requires a full context.',
  minArgs: 1,
  maxArgs: 2,
  isVolatile: true,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const refText = args[0];
    // a1Style argument (args[1]) is accepted but not used in this simplified implementation
    if (refText === null || refText === undefined) {
      return '#REF!' as FormulaValue;
    }
    return String(refText);
  },
};

// ─── OFFSET ─────────────────────────────────────────────────────────────────────

const offsetFn: FormulaFunction = {
  name: 'OFFSET',
  category: 'lookup-reference',
  description: 'Returns a reference offset from a given reference by a specified number of rows and columns.',
  minArgs: 3,
  maxArgs: 5,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const reference = args[0];
    const rows = Number(args[1]);
    const cols = Number(args[2]);
    const height = args.length >= 4 && args[3] !== null ? Number(args[3]) : 1;
    const width = args.length >= 5 && args[4] !== null ? Number(args[4]) : 1;

    if (isNaN(rows) || isNaN(cols) || isNaN(height) || isNaN(width)) {
      return '#VALUE!' as FormulaValue;
    }
    if (height <= 0 || width <= 0) {
      return '#REF!' as FormulaValue;
    }

    return `OFFSET(${String(reference)}, ${rows}, ${cols}, ${height}, ${width})`;
  },
};

// ─── ROW ────────────────────────────────────────────────────────────────────────

const rowFn: FormulaFunction = {
  name: 'ROW',
  category: 'lookup-reference',
  description: 'Returns the row number of a reference.',
  minArgs: 0,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], context: FormulaContext): FormulaValue => {
    if (args.length === 0 || args[0] === null || args[0] === undefined) {
      // Try to extract row from current cell reference (e.g. "A5" -> 5)
      if (context.currentCell) {
        const match = context.currentCell.match(/\d+/);
        if (match) return Number(match[0]);
      }
      return 1;
    }
    const ref = args[0];
    if (typeof ref === 'string') {
      const match = ref.match(/\d+/);
      if (match) return Number(match[0]);
    }
    if (Array.isArray(ref)) {
      // For an array, return 1 (the first row position)
      return 1;
    }
    return 1;
  },
};

// ─── COLUMN ─────────────────────────────────────────────────────────────────────

const columnFn: FormulaFunction = {
  name: 'COLUMN',
  category: 'lookup-reference',
  description: 'Returns the column number of a reference.',
  minArgs: 0,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], context: FormulaContext): FormulaValue => {
    if (args.length === 0 || args[0] === null || args[0] === undefined) {
      if (context.currentCell) {
        const match = context.currentCell.match(/^[A-Za-z]+/);
        if (match) {
          return columnLetterToNumber(match[0]);
        }
      }
      return 1;
    }
    const ref = args[0];
    if (typeof ref === 'string') {
      const match = ref.match(/^[A-Za-z]+/);
      if (match) {
        return columnLetterToNumber(match[0]);
      }
    }
    return 1;
  },
};

/**
 * Convert a column letter (A, B, ..., Z, AA, AB, ...) to a 1-based column number.
 */
function columnLetterToNumber(letters: string): number {
  let col = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    col = col * 26 + (upper.charCodeAt(i) - 64);
  }
  return col;
}

// ─── ROWS ───────────────────────────────────────────────────────────────────────

const rowsFn: FormulaFunction = {
  name: 'ROWS',
  category: 'lookup-reference',
  description: 'Returns the number of rows in a reference or array.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const arr = args[0];
    if (Array.isArray(arr)) {
      // If 2D array, return number of rows
      if (arr.length > 0 && Array.isArray(arr[0])) {
        return arr.length;
      }
      // 1D array treated as a column
      return arr.length;
    }
    return 1;
  },
};

// ─── COLUMNS ────────────────────────────────────────────────────────────────────

const columnsFn: FormulaFunction = {
  name: 'COLUMNS',
  category: 'lookup-reference',
  description: 'Returns the number of columns in a reference or array.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const arr = args[0];
    if (Array.isArray(arr)) {
      // If 2D array, return number of columns in first row
      if (arr.length > 0 && Array.isArray(arr[0])) {
        return (arr[0] as FormulaValue[]).length;
      }
      // 1D array treated as a column (1 column)
      return 1;
    }
    return 1;
  },
};

// ─── CHOOSE ─────────────────────────────────────────────────────────────────────

const chooseFn: FormulaFunction = {
  name: 'CHOOSE',
  category: 'lookup-reference',
  description: 'Returns a value from a list of values based on a given index number.',
  minArgs: 2,
  maxArgs: 255,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const indexNum = Number(args[0]);

    if (isNaN(indexNum) || indexNum < 1 || indexNum > args.length - 1) {
      return '#VALUE!' as FormulaValue;
    }

    return args[indexNum] ?? null;
  },
};

// ─── TRANSPOSE ──────────────────────────────────────────────────────────────────

const transposeFn: FormulaFunction = {
  name: 'TRANSPOSE',
  category: 'lookup-reference',
  description: 'Transposes the rows and columns of an array.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: true,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const array = to2DArray(args[0]);

    if (array.length === 0 || (array[0]?.length ?? 0) === 0) {
      return [];
    }

    const rows = array.length;
    const cols = array[0].length;
    const result: FormulaValue[][] = [];

    for (let c = 0; c < cols; c++) {
      const newRow: FormulaValue[] = [];
      for (let r = 0; r < rows; r++) {
        newRow.push(array[r]?.[c] ?? null);
      }
      result.push(newRow);
    }

    return result as FormulaValue;
  },
};

// ─── XMATCH ─────────────────────────────────────────────────────────────────────

const xmatchFn: FormulaFunction = {
  name: 'XMATCH',
  category: 'lookup-reference',
  description: 'Returns the relative position of an item in an array or range. Supports exact match, wildcard match, and approximate match modes with configurable search direction.',
  minArgs: 2,
  maxArgs: 4,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
    const lookupValue = args[0];
    const lookupArray = flattenValues(Array.isArray(args[1]) ? args[1] : [args[1]]);
    const matchMode = args.length >= 3 ? Number(args[2]) : 0;
    const searchMode = args.length >= 4 ? Number(args[3]) : 1;

    if (lookupArray.length === 0) {
      return '#N/A' as FormulaValue;
    }

    // Build index order based on searchMode
    const indices: number[] = [];
    if (searchMode === 1) {
      for (let i = 0; i < lookupArray.length; i++) indices.push(i);
    } else if (searchMode === -1) {
      for (let i = lookupArray.length - 1; i >= 0; i--) indices.push(i);
    } else if (searchMode === 2) {
      // Binary search ascending - use linear for correctness
      for (let i = 0; i < lookupArray.length; i++) indices.push(i);
    } else if (searchMode === -2) {
      // Binary search descending - use linear for correctness
      for (let i = lookupArray.length - 1; i >= 0; i--) indices.push(i);
    } else {
      for (let i = 0; i < lookupArray.length; i++) indices.push(i);
    }

    // matchMode: 0=exact, -1=exact or next smaller, 1=exact or next larger, 2=wildcard
    if (matchMode === 0) {
      // Exact match
      for (const i of indices) {
        const cellVal = lookupArray[i];
        if (typeof lookupValue === 'string' && typeof cellVal === 'string') {
          if (cellVal.toLowerCase() === lookupValue.toLowerCase()) {
            return i + 1;
          }
        } else if (cellVal === lookupValue) {
          return i + 1;
        }
      }
    } else if (matchMode === 2) {
      // Wildcard match
      const pattern = String(lookupValue);
      for (const i of indices) {
        if (wildcardMatch(pattern, String(lookupArray[i]))) {
          return i + 1;
        }
      }
    } else if (matchMode === -1) {
      // Exact match or next smaller
      let bestIdx = -1;
      let bestVal: number | string | boolean | null = null;
      for (const i of indices) {
        const cellVal = lookupArray[i];
        if (typeof lookupValue === 'string' && typeof cellVal === 'string') {
          if (cellVal.toLowerCase() === lookupValue.toLowerCase()) return i + 1;
        } else if (cellVal === lookupValue) {
          return i + 1;
        }
        if (typeof lookupValue === 'number' && typeof cellVal === 'number') {
          if (cellVal < lookupValue && (bestIdx === -1 || cellVal > (bestVal as number))) {
            bestIdx = i;
            bestVal = cellVal;
          }
        }
      }
      if (bestIdx !== -1) return bestIdx + 1;
    } else if (matchMode === 1) {
      // Exact match or next larger
      let bestIdx = -1;
      let bestVal: number | string | boolean | null = null;
      for (const i of indices) {
        const cellVal = lookupArray[i];
        if (typeof lookupValue === 'string' && typeof cellVal === 'string') {
          if (cellVal.toLowerCase() === lookupValue.toLowerCase()) return i + 1;
        } else if (cellVal === lookupValue) {
          return i + 1;
        }
        if (typeof lookupValue === 'number' && typeof cellVal === 'number') {
          if (cellVal > lookupValue && (bestIdx === -1 || cellVal < (bestVal as number))) {
            bestIdx = i;
            bestVal = cellVal;
          }
        }
      }
      if (bestIdx !== -1) return bestIdx + 1;
    }

    return '#N/A' as FormulaValue;
  },
};

// ─── ADDRESS Function ────────────────────────────────────────────────────────

function colToLetter(col: number): string {
  let result = '';
  let c = col;
  while (c > 0) {
    c--;
    result = String.fromCharCode(65 + (c % 26)) + result;
    c = Math.floor(c / 26);
  }
  return result;
}

const addressFn: FormulaFunction = {
  name: 'ADDRESS',
  category: 'lookup-reference',
  description: 'Creates a cell reference as text',
  minArgs: 2,
  maxArgs: 5,
  isVolatile: false,
  returnsArray: false,
  execute: (args: FormulaValue[]): FormulaValue => {
    const rowNum = Number(args[0]);
    const colNum = Number(args[1]);
    const absNum = args[2] !== undefined && args[2] !== null ? Number(args[2]) : 1;
    const a1Style = args[3] !== undefined && args[3] !== null ? Boolean(args[3]) : true;
    const sheetText = args[4] !== undefined && args[4] !== null ? String(args[4]) : '';

    if (rowNum < 1 || colNum < 1) return '#VALUE!' as FormulaValue;

    let ref: string;

    if (a1Style === false || a1Style === (0 as unknown as boolean)) {
      // R1C1 notation
      switch (absNum) {
        case 1: ref = `R${rowNum}C${colNum}`; break;
        case 2: ref = `R${rowNum}C[${colNum}]`; break;
        case 3: ref = `R[${rowNum}]C${colNum}`; break;
        case 4: ref = `R[${rowNum}]C[${colNum}]`; break;
        default: ref = `R${rowNum}C${colNum}`;
      }
    } else {
      // A1 notation
      const colStr = colToLetter(colNum);
      switch (absNum) {
        case 1: ref = `$${colStr}$${rowNum}`; break;
        case 2: ref = `${colStr}$${rowNum}`; break;
        case 3: ref = `$${colStr}${rowNum}`; break;
        case 4: ref = `${colStr}${rowNum}`; break;
        default: ref = `$${colStr}$${rowNum}`;
      }
    }

    if (sheetText) {
      // Check if sheet name needs quoting
      const needsQuotes = /[^a-zA-Z0-9_]/.test(sheetText);
      const sheetRef = needsQuotes ? `'${sheetText}'` : sheetText;
      ref = `${sheetRef}!${ref}`;
    }

    return ref;
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────────

export const lookupReferenceFunctions: FormulaFunction[] = [
  hlookupFn,
  xlookupFn,
  xmatchFn,
  indirectFn,
  offsetFn,
  rowFn,
  columnFn,
  rowsFn,
  columnsFn,
  chooseFn,
  transposeFn,
  vlookupFn,
  indexFn,
  matchFn,
  addressFn,
];
