import type { FormulaFunction, FormulaValue, FormulaContext } from '../../types/formula.types.js';

// ── Helpers ────────────────────────────────────────────────────────────

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

function toBool(val: FormulaValue): boolean {
  if (val === 0 || val === null || val === false || val === '' || val === 'false') {
    return false;
  }
  return true;
}

// ── Criteria matching helper (used by COUNTIF / SUMIF) ─────────────────

function matchesCriteria(value: FormulaValue, criteria: string): boolean {
  // Operator-based criteria: >, <, >=, <=, <>, =
  const operatorMatch = criteria.match(/^(>=|<=|<>|>|<|=)(.*)$/);
  if (operatorMatch) {
    const [, operator, operand] = operatorMatch;
    const numOperand = Number(operand);
    const numValue = Number(value);
    const useNumeric = !isNaN(numOperand) && !isNaN(numValue);

    switch (operator) {
      case '>':
        return useNumeric ? numValue > numOperand : String(value) > operand;
      case '<':
        return useNumeric ? numValue < numOperand : String(value) < operand;
      case '>=':
        return useNumeric ? numValue >= numOperand : String(value) >= operand;
      case '<=':
        return useNumeric ? numValue <= numOperand : String(value) <= operand;
      case '<>':
        return useNumeric ? numValue !== numOperand : String(value).toLowerCase() !== operand.toLowerCase();
      case '=':
        return useNumeric ? numValue === numOperand : String(value).toLowerCase() === operand.toLowerCase();
      default:
        return false;
    }
  }

  // Numeric equality
  const numCriteria = Number(criteria);
  if (!isNaN(numCriteria) && criteria !== '') {
    return Number(value) === numCriteria;
  }

  // Wildcard text matching: * (any chars) and ? (single char)
  const escaped = criteria.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  const regex = new RegExp(`^${pattern}$`, 'i');
  return regex.test(String(value));
}

// ── Function implementations ───────────────────────────────────────────

export const logicalFunctions: FormulaFunction[] = [
  // 1. AND
  {
    name: 'AND',
    category: 'logical',
    description: 'Returns TRUE if all arguments evaluate to TRUE.',
    minArgs: 1,
    maxArgs: 255,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const flat = flattenValues(args);
      for (const v of flat) {
        if (!toBool(v)) {
          return false;
        }
      }
      return true;
    },
  },

  // 2. OR
  {
    name: 'OR',
    category: 'logical',
    description: 'Returns TRUE if any argument evaluates to TRUE.',
    minArgs: 1,
    maxArgs: 255,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const flat = flattenValues(args);
      for (const v of flat) {
        if (toBool(v)) {
          return true;
        }
      }
      return false;
    },
  },

  // 3. NOT
  {
    name: 'NOT',
    category: 'logical',
    description: 'Reverses the logical value of its argument.',
    minArgs: 1,
    maxArgs: 1,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      return !toBool(args[0]);
    },
  },

  // 4. XOR
  {
    name: 'XOR',
    category: 'logical',
    description: 'Returns TRUE if an odd number of arguments evaluate to TRUE.',
    minArgs: 1,
    maxArgs: 255,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const flat = flattenValues(args);
      let trueCount = 0;
      for (const v of flat) {
        if (toBool(v)) {
          trueCount++;
        }
      }
      return trueCount % 2 === 1;
    },
  },

  // 5. IFERROR
  {
    name: 'IFERROR',
    category: 'logical',
    description: 'Returns alt_value if value is an error, otherwise returns value.',
    minArgs: 2,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const value = args[0];
      const altValue = args[1];
      if (typeof value === 'string' && value.startsWith('#')) {
        return altValue;
      }
      return value;
    },
  },

  // 6. IFNA
  {
    name: 'IFNA',
    category: 'logical',
    description: 'Returns alt_value if value is #N/A, otherwise returns value.',
    minArgs: 2,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const value = args[0];
      const altValue = args[1];
      if (value === '#N/A') {
        return altValue;
      }
      return value;
    },
  },

  // 7. IFS
  {
    name: 'IFS',
    category: 'logical',
    description: 'Checks multiple conditions and returns the value for the first TRUE condition.',
    minArgs: 2,
    maxArgs: 254,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      if (args.length % 2 !== 0) {
        return '#VALUE!' as FormulaValue;
      }
      for (let i = 0; i < args.length; i += 2) {
        if (toBool(args[i])) {
          return args[i + 1];
        }
      }
      return '#N/A' as FormulaValue;
    },
  },

  // 8. SWITCH
  {
    name: 'SWITCH',
    category: 'logical',
    description: 'Evaluates an expression against a list of values and returns the corresponding result.',
    minArgs: 3,
    maxArgs: 254,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const expression = args[0];
      const remaining = args.slice(1);
      const hasDefault = remaining.length % 2 === 1;
      const pairCount = hasDefault ? remaining.length - 1 : remaining.length;

      for (let i = 0; i < pairCount; i += 2) {
        if (remaining[i] === expression) {
          return remaining[i + 1];
        }
      }

      if (hasDefault) {
        return remaining[remaining.length - 1];
      }

      return '#N/A' as FormulaValue;
    },
  },

  // 9. IF
  {
    name: 'IF',
    category: 'logical',
    description: 'Returns one value if a condition is TRUE and another if FALSE.',
    minArgs: 2,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const condition = toBool(args[0]);
      const trueValue = args[1];
      const falseValue = args.length >= 3 ? args[2] : false;
      return condition ? trueValue : falseValue;
    },
  },

  // 10. COUNTIF
  {
    name: 'COUNTIF',
    category: 'logical',
    description: 'Counts the number of cells in a range that match the given criteria.',
    minArgs: 2,
    maxArgs: 2,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const range = Array.isArray(args[0]) ? flattenValues([args[0]]) : [args[0]];
      const criteria = String(args[1]);
      let count = 0;

      for (const cell of range) {
        if (matchesCriteria(cell, criteria)) {
          count++;
        }
      }

      return count;
    },
  },

  // 11. SUMIF
  {
    name: 'SUMIF',
    category: 'logical',
    description: 'Sums the values in a range that match the given criteria.',
    minArgs: 2,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const range = Array.isArray(args[0]) ? flattenValues([args[0]]) : [args[0]];
      const criteria = String(args[1]);
      const sumRange = args.length >= 3 && args[2] != null
        ? (Array.isArray(args[2]) ? flattenValues([args[2]]) : [args[2]])
        : range;

      let sum = 0;

      for (let i = 0; i < range.length; i++) {
        if (matchesCriteria(range[i], criteria)) {
          const sumVal = i < sumRange.length ? sumRange[i] : 0;
          const num = Number(sumVal);
          if (!isNaN(num)) {
            sum += num;
          }
        }
      }

      return sum;
    },
  },

  // 12. COUNTIFS
  {
    name: 'COUNTIFS',
    category: 'logical',
    description: 'Counts cells that match multiple criteria across multiple ranges. Each pair of arguments is a criteria_range and criteria.',
    minArgs: 2,
    maxArgs: 254,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      if (args.length % 2 !== 0) {
        return '#VALUE!' as FormulaValue;
      }

      const pairCount = args.length / 2;
      const ranges: FormulaValue[][] = [];
      const criteriaList: string[] = [];

      for (let p = 0; p < pairCount; p++) {
        const range = Array.isArray(args[p * 2]) ? flattenValues([args[p * 2]]) : [args[p * 2]];
        const criteria = String(args[p * 2 + 1]);
        ranges.push(range);
        criteriaList.push(criteria);
      }

      // All ranges must have the same length
      const length = ranges[0].length;
      let count = 0;

      for (let i = 0; i < length; i++) {
        let allMatch = true;
        for (let p = 0; p < pairCount; p++) {
          const cellVal = i < ranges[p].length ? ranges[p][i] : null;
          if (!matchesCriteria(cellVal, criteriaList[p])) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) count++;
      }

      return count;
    },
  },

  // 13. SUMIFS
  {
    name: 'SUMIFS',
    category: 'logical',
    description: 'Sums values in a range that meet multiple criteria. First argument is the sum_range, followed by criteria_range/criteria pairs.',
    minArgs: 3,
    maxArgs: 255,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      if (args.length < 3 || (args.length - 1) % 2 !== 0) {
        return '#VALUE!' as FormulaValue;
      }

      const sumRange = Array.isArray(args[0]) ? flattenValues([args[0]]) : [args[0]];
      const pairCount = (args.length - 1) / 2;
      const ranges: FormulaValue[][] = [];
      const criteriaList: string[] = [];

      for (let p = 0; p < pairCount; p++) {
        const range = Array.isArray(args[1 + p * 2]) ? flattenValues([args[1 + p * 2]]) : [args[1 + p * 2]];
        const criteria = String(args[2 + p * 2]);
        ranges.push(range);
        criteriaList.push(criteria);
      }

      const length = sumRange.length;
      let sum = 0;

      for (let i = 0; i < length; i++) {
        let allMatch = true;
        for (let p = 0; p < pairCount; p++) {
          const cellVal = i < ranges[p].length ? ranges[p][i] : null;
          if (!matchesCriteria(cellVal, criteriaList[p])) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          const num = Number(sumRange[i]);
          if (!isNaN(num)) {
            sum += num;
          }
        }
      }

      return sum;
    },
  },

  // 14. AVERAGEIF
  {
    name: 'AVERAGEIF',
    category: 'logical',
    description: 'Returns the average of cells in a range that meet a single criterion.',
    minArgs: 2,
    maxArgs: 3,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      const range = Array.isArray(args[0]) ? flattenValues([args[0]]) : [args[0]];
      const criteria = String(args[1]);
      const avgRange = args.length >= 3 && args[2] != null
        ? (Array.isArray(args[2]) ? flattenValues([args[2]]) : [args[2]])
        : range;

      let sum = 0;
      let count = 0;

      for (let i = 0; i < range.length; i++) {
        if (matchesCriteria(range[i], criteria)) {
          const val = i < avgRange.length ? avgRange[i] : 0;
          const num = Number(val);
          if (!isNaN(num)) {
            sum += num;
            count++;
          }
        }
      }

      if (count === 0) {
        return '#DIV/0!' as FormulaValue;
      }

      return sum / count;
    },
  },

  // 15. AVERAGEIFS
  {
    name: 'AVERAGEIFS',
    category: 'logical',
    description: 'Returns the average of cells that meet multiple criteria. First argument is the average_range, followed by criteria_range/criteria pairs.',
    minArgs: 3,
    maxArgs: 255,
    isVolatile: false,
    returnsArray: false,
    execute: (args: FormulaValue[], _context: FormulaContext): FormulaValue => {
      if (args.length < 3 || (args.length - 1) % 2 !== 0) {
        return '#VALUE!' as FormulaValue;
      }

      const avgRange = Array.isArray(args[0]) ? flattenValues([args[0]]) : [args[0]];
      const pairCount = (args.length - 1) / 2;
      const ranges: FormulaValue[][] = [];
      const criteriaList: string[] = [];

      for (let p = 0; p < pairCount; p++) {
        const range = Array.isArray(args[1 + p * 2]) ? flattenValues([args[1 + p * 2]]) : [args[1 + p * 2]];
        const criteria = String(args[2 + p * 2]);
        ranges.push(range);
        criteriaList.push(criteria);
      }

      const length = avgRange.length;
      let sum = 0;
      let count = 0;

      for (let i = 0; i < length; i++) {
        let allMatch = true;
        for (let p = 0; p < pairCount; p++) {
          const cellVal = i < ranges[p].length ? ranges[p][i] : null;
          if (!matchesCriteria(cellVal, criteriaList[p])) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          const num = Number(avgRange[i]);
          if (!isNaN(num)) {
            sum += num;
            count++;
          }
        }
      }

      if (count === 0) {
        return '#DIV/0!' as FormulaValue;
      }

      return sum / count;
    },
  },
];
