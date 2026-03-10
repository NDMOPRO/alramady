import type { FormulaFunction, FormulaValue, FormulaContext } from '../../types/formula.types.js';

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function toString(val: FormulaValue): string {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) return toString(val[0]);
  return String(val);
}

function toNumber(val: FormulaValue): any {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'number') return val;
  if (Array.isArray(val)) return toNumber(val[0]);
  const n = Number(val);
  if (isNaN(n)) return '#VALUE!' as FormulaValue;
  return n;
}

function isError(val: FormulaValue): boolean {
  return typeof val === 'string' && /^#[A-Z/!?]+!?$/.test(val);
}

function flatten(args: FormulaValue[]): FormulaValue[] {
  const result: FormulaValue[] = [];
  for (const arg of args) {
    if (Array.isArray(arg)) {
      result.push(...flatten(arg));
    } else {
      result.push(arg);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Text functions
// ---------------------------------------------------------------------------

export const textFunctions: FormulaFunction[] = [
  // 1. CONCATENATE
  {
    name: 'CONCATENATE',
    category: 'text',
    description: 'Joins several text strings into one text string',
    minArgs: 1,
    maxArgs: 255,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const flat = flatten(args);
      let result = '';
      for (const val of flat) {
        if (isError(val)) return val;
        result += toString(val);
      }
      return result;
    },
  },

  // 2. TEXTJOIN
  {
    name: 'TEXTJOIN',
    category: 'text',
    description: 'Joins text with a delimiter, optionally ignoring empty cells',
    minArgs: 3,
    maxArgs: 255,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const delimiter = toString(args[0]);
      const ignoreEmpty = Boolean(args[1]);
      const texts = flatten(args.slice(2));

      const parts: string[] = [];
      for (const val of texts) {
        if (isError(val)) return val;
        const s = toString(val);
        if (ignoreEmpty && s === '') continue;
        parts.push(s);
      }
      return parts.join(delimiter);
    },
  },

  // 3. LEFT
  {
    name: 'LEFT',
    category: 'text',
    description: 'Returns the leftmost characters from a text value',
    minArgs: 1,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const text = toString(args[0]);
      const numChars = args.length > 1 ? toNumber(args[1]) : 1;
      if (isError(numChars as FormulaValue)) return '#VALUE!' as FormulaValue;
      if (numChars < 0) return '#VALUE!' as FormulaValue;
      return text.substring(0, numChars as number);
    },
  },

  // 4. RIGHT
  {
    name: 'RIGHT',
    category: 'text',
    description: 'Returns the rightmost characters from a text value',
    minArgs: 1,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const text = toString(args[0]);
      const numChars = args.length > 1 ? toNumber(args[1]) : 1;
      if (isError(numChars as FormulaValue)) return '#VALUE!' as FormulaValue;
      if (numChars < 0) return '#VALUE!' as FormulaValue;
      return text.substring(Math.max(0, text.length - (numChars as number)));
    },
  },

  // 5. MID
  {
    name: 'MID',
    category: 'text',
    description: 'Returns a specific number of characters from a text string starting at the position you specify',
    minArgs: 3,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const text = toString(args[0]);
      const startNum = toNumber(args[1]);
      const numChars = toNumber(args[2]);
      if (isError(startNum as FormulaValue) || isError(numChars as FormulaValue)) return '#VALUE!' as FormulaValue;
      if (startNum < 1 || numChars < 0) return '#VALUE!' as FormulaValue;
      // Excel MID is 1-based
      return text.substring(startNum - 1, startNum - 1 + numChars);
    },
  },

  // 6. LEN
  {
    name: 'LEN',
    category: 'text',
    description: 'Returns the number of characters in a text string',
    minArgs: 1,
    maxArgs: 1,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const text = toString(args[0]);
      return text.length;
    },
  },

  // 7. FIND
  {
    name: 'FIND',
    category: 'text',
    description: 'Finds one text value within another (case-sensitive)',
    minArgs: 2,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const findText = toString(args[0]);
      const withinText = toString(args[1]);
      const startNum = args.length > 2 ? toNumber(args[2]) : 1;
      if (isError(startNum as FormulaValue)) return '#VALUE!' as FormulaValue;
      if (startNum < 1 || startNum > withinText.length + 1) return '#VALUE!' as FormulaValue;

      const pos = withinText.indexOf(findText, startNum - 1);
      if (pos === -1) return '#VALUE!' as FormulaValue;
      return pos + 1; // 1-based
    },
  },

  // 8. SEARCH
  {
    name: 'SEARCH',
    category: 'text',
    description: 'Finds one text value within another (case-insensitive, supports wildcards)',
    minArgs: 2,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const findText = toString(args[0]);
      const withinText = toString(args[1]);
      const startNum = args.length > 2 ? toNumber(args[2]) : 1;
      if (isError(startNum as FormulaValue)) return '#VALUE!' as FormulaValue;
      if (startNum < 1 || startNum > withinText.length + 1) return '#VALUE!' as FormulaValue;

      // Convert Excel wildcards to regex: * -> .*, ? -> .
      const escaped = findText
        .replace(/([.+^${}()|[\]\\])/g, '\\$1') // escape regex special chars except * and ?
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

      const regex = new RegExp(escaped, 'i');
      const searchIn = withinText.substring(startNum - 1);
      const match = regex.exec(searchIn);
      if (!match) return '#VALUE!' as FormulaValue;
      return match.index + startNum; // 1-based
    },
  },

  // 9. SUBSTITUTE
  {
    name: 'SUBSTITUTE',
    category: 'text',
    description: 'Substitutes new text for old text in a text string',
    minArgs: 3,
    maxArgs: 4,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const text = toString(args[0]);
      const oldText = toString(args[1]);
      const newText = toString(args[2]);

      if (args.length > 3 && args[3] !== null && args[3] !== undefined) {
        // Replace only the nth occurrence
        const instanceNum = toNumber(args[3]);
        if (isError(instanceNum as FormulaValue)) return '#VALUE!' as FormulaValue;
        if (instanceNum < 1) return '#VALUE!' as FormulaValue;

        let count = 0;
        let idx = -1;
        let searchFrom = 0;
        while (searchFrom <= text.length) {
          idx = text.indexOf(oldText, searchFrom);
          if (idx === -1) break;
          count++;
          if (count === instanceNum) {
            return text.substring(0, idx) + newText + text.substring(idx + oldText.length);
          }
          searchFrom = idx + 1;
        }
        // Instance not found – return original text
        return text;
      }

      // Replace all occurrences
      if (oldText === '') return text;
      return text.split(oldText).join(newText);
    },
  },

  // 10. REPLACE
  {
    name: 'REPLACE',
    category: 'text',
    description: 'Replaces part of a text string with a different text string, based on position',
    minArgs: 4,
    maxArgs: 4,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const oldText = toString(args[0]);
      const startNum = toNumber(args[1]);
      const numChars = toNumber(args[2]);
      const newText = toString(args[3]);
      if (isError(startNum as FormulaValue) || isError(numChars as FormulaValue)) return '#VALUE!' as FormulaValue;
      if (startNum < 1 || numChars < 0) return '#VALUE!' as FormulaValue;

      // Excel REPLACE is 1-based
      const before = oldText.substring(0, startNum - 1);
      const after = oldText.substring(startNum - 1 + numChars);
      return before + newText + after;
    },
  },

  // 11. TRIM
  {
    name: 'TRIM',
    category: 'text',
    description: 'Removes extra spaces from text (leading, trailing, and multiple internal spaces)',
    minArgs: 1,
    maxArgs: 1,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const text = toString(args[0]);
      return text.trim().replace(/\s{2,}/g, ' ');
    },
  },

  // 12. CLEAN
  {
    name: 'CLEAN',
    category: 'text',
    description: 'Removes all non-printable characters from text (char codes 0-31)',
    minArgs: 1,
    maxArgs: 1,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const text = toString(args[0]);
      // Remove characters with code 0–31
      // eslint-disable-next-line no-control-regex
      return text.replace(/[\x00-\x1F]/g, '');
    },
  },

  // 13. UPPER
  {
    name: 'UPPER',
    category: 'text',
    description: 'Converts text to uppercase',
    minArgs: 1,
    maxArgs: 1,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      return toString(args[0]).toUpperCase();
    },
  },

  // 14. LOWER
  {
    name: 'LOWER',
    category: 'text',
    description: 'Converts text to lowercase',
    minArgs: 1,
    maxArgs: 1,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      return toString(args[0]).toLowerCase();
    },
  },

  // 15. PROPER
  {
    name: 'PROPER',
    category: 'text',
    description: 'Capitalizes the first letter of each word in a text value',
    minArgs: 1,
    maxArgs: 1,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const text = toString(args[0]);
      return text.replace(/\S+/g, (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
      );
    },
  },

  // 16. TEXT
  {
    name: 'TEXT',
    category: 'text',
    description: 'Formats a number and converts it to text using a format string',
    minArgs: 2,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const value = toNumber(args[0]);
      if (isError(value as FormulaValue)) return '#VALUE!' as FormulaValue;
      const formatText = toString(args[1]);

      // --- Basic Excel format support ---

      // Percentage format: 0%, 0.00%, etc.
      if (formatText.endsWith('%')) {
        const pctFormat = formatText.slice(0, -1);
        const pctValue = (value as number) * 100;
        const decimals = pctFormat.includes('.') ? pctFormat.split('.')[1].length : 0;
        return pctValue.toFixed(decimals) + '%';
      }

      // Number formats with optional thousands separator and decimals
      // e.g. #,##0  #,##0.00  0.00  0  #,##0.000
      const hasComma = formatText.includes(',');
      const dotIdx = formatText.indexOf('.');
      let decimals = 0;
      if (dotIdx !== -1) {
        // Count zeros/hashes after decimal
        decimals = formatText.length - dotIdx - 1;
      }

      const absVal = Math.abs(value as number);
      let formatted = absVal.toFixed(decimals);

      if (hasComma) {
        // Insert thousands separators into integer part
        const [intPart, decPart] = formatted.split('.');
        const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        formatted = decPart !== undefined ? withCommas + '.' + decPart : withCommas;
      }

      if ((value as number) < 0) {
        formatted = '-' + formatted;
      }

      return formatted;
    },
  },

  // 17. VALUE
  {
    name: 'VALUE',
    category: 'text',
    description: 'Converts a text string that represents a number to a number',
    minArgs: 1,
    maxArgs: 1,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const text = toString(args[0]).trim();
      if (text === '') return 0;

      // Handle percentage
      if (text.endsWith('%')) {
        const num = Number(text.slice(0, -1));
        if (isNaN(num)) return '#VALUE!' as FormulaValue;
        return num / 100;
      }

      // Remove commas (thousands separator) before parsing
      const cleaned = text.replace(/,/g, '');
      const num = Number(cleaned);
      if (isNaN(num)) return '#VALUE!' as FormulaValue;
      return num;
    },
  },

  // 18. REPT
  {
    name: 'REPT',
    category: 'text',
    description: 'Repeats text a given number of times',
    minArgs: 2,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const text = toString(args[0]);
      const times = toNumber(args[1]);
      if (isError(times as FormulaValue)) return '#VALUE!' as FormulaValue;
      if (times < 0) return '#VALUE!' as FormulaValue;
      return text.repeat(Math.floor(times as number));
    },
  },

  // 19. EXACT
  {
    name: 'EXACT',
    category: 'text',
    description: 'Checks whether two text strings are exactly the same (case-sensitive)',
    minArgs: 2,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const text1 = toString(args[0]);
      const text2 = toString(args[1]);
      return text1 === text2;
    },
  },
];
