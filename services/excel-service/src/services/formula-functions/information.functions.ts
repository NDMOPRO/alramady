import type { FormulaFunction, FormulaValue, FormulaContext } from '../../types/formula.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isErrorValue(v: FormulaValue): boolean {
  return typeof v === 'string' && v.startsWith('#');
}

function isNumericString(v: string): boolean {
  if (v.trim() === '') return false;
  return !Number.isNaN(Number(v));
}

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

const ISNUMBER: FormulaFunction = {
  name: 'ISNUMBER',
  category: 'information',
  description: 'Returns TRUE if the value is a number.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const v = args[0];
    return typeof v === 'number';
  },
};

const ISTEXT: FormulaFunction = {
  name: 'ISTEXT',
  category: 'information',
  description: 'Returns TRUE if the value is text (not a number-string).',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const v = args[0];
    if (typeof v !== 'string') return false;
    if (isErrorValue(v)) return false;
    if (isNumericString(v)) return false;
    return true;
  },
};

const ISBLANK: FormulaFunction = {
  name: 'ISBLANK',
  category: 'information',
  description: 'Returns TRUE if the value is blank (null, undefined, or empty string).',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const v = args[0];
    return v === null || v === undefined || v === '';
  },
};

const ISERROR: FormulaFunction = {
  name: 'ISERROR',
  category: 'information',
  description: 'Returns TRUE if the value is any error value.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    return isErrorValue(args[0]);
  },
};

const ISNA: FormulaFunction = {
  name: 'ISNA',
  category: 'information',
  description: 'Returns TRUE if the value is the #N/A error value.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    return args[0] === '#N/A';
  },
};

const TYPE: FormulaFunction = {
  name: 'TYPE',
  category: 'information',
  description: 'Returns a number indicating the data type of a value.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const v = args[0];
    if (typeof v === 'number') return 1;
    if (typeof v === 'boolean') return 4;
    if (Array.isArray(v)) return 64;
    if (typeof v === 'string') {
      if (isErrorValue(v)) return 16;
      return 2;
    }
    // null / undefined treated as number (empty cell = 0 in Excel TYPE)
    return 1;
  },
};

const CELL: FormulaFunction = {
  name: 'CELL',
  category: 'information',
  description: 'Returns information about the formatting, location, or contents of a cell.',
  minArgs: 1,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], context: FormulaContext): FormulaValue {
    const infoType = typeof args[0] === 'string' ? args[0].toLowerCase() : '';
    // The reference is the second arg if provided, otherwise current cell
    const reference = args.length > 1 && typeof args[1] === 'string' ? args[1] : (context.currentCell ?? 'A1');

    // Parse column letter and row number from a cell reference like "B3"
    const match = reference.match(/^([A-Za-z]+)(\d+)$/);
    const colLetters = match ? match[1].toUpperCase() : 'A';
    const rowNum = match ? parseInt(match[2], 10) : 1;

    // Convert column letters to column number (A=1, B=2, ..., Z=26, AA=27)
    let colNum = 0;
    for (let i = 0; i < colLetters.length; i++) {
      colNum = colNum * 26 + (colLetters.charCodeAt(i) - 64);
    }

    switch (infoType) {
      case 'address':
        return `$${colLetters}$${rowNum}`;
      case 'col':
        return colNum;
      case 'row':
        return rowNum;
      case 'type': {
        // "b" for blank, "l" for label (text), "v" for value
        const cellValue = context.cellValues.get(reference);
        if (cellValue === null || cellValue === undefined || cellValue === '') return 'b';
        if (typeof cellValue === 'string' && !isErrorValue(cellValue)) return 'l';
        return 'v';
      }
      case 'width':
        // Default column width in Excel is 8.43 characters; return 8 as simplified int
        return 8;
      case 'format':
        // Simplified: return "G" for General format
        return 'G';
      default:
        return '#VALUE!';
    }
  },
};

const INFO: FormulaFunction = {
  name: 'INFO',
  category: 'information',
  description: 'Returns information about the current operating environment.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const typeText = typeof args[0] === 'string' ? args[0].toLowerCase() : '';

    switch (typeText) {
      case 'directory':
        return 'C:\\';
      case 'numfile':
        return 1;
      case 'origin':
        return '$A:$A$1';
      case 'osversion':
        return 'Windows (64-bit) NT 10.00';
      case 'recalc':
        return 'Automatic';
      case 'release':
        return '16.0';
      case 'system':
        return 'pcdos';
      default:
        return '#VALUE!';
    }
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const informationFunctions: FormulaFunction[] = [
  ISNUMBER,
  ISTEXT,
  ISBLANK,
  ISERROR,
  ISNA,
  TYPE,
  CELL,
  INFO,
];
