import Decimal from 'decimal.js';
import type { FormulaFunction, FormulaValue, FormulaContext } from '../../types/formula.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively flatten nested FormulaValue arrays into a flat list. */
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

/** Return only numeric entries from a flat list, coercing booleans. */
function extractNumbers(values: FormulaValue[]): number[] {
  const nums: number[] = [];
  for (const v of flattenValues(values)) {
    if (typeof v === 'number') {
      nums.push(v);
    } else if (typeof v === 'boolean') {
      nums.push(v ? 1 : 0);
    } else if (typeof v === 'string') {
      const n = Number(v);
      if (v !== '' && !Number.isNaN(n)) {
        nums.push(n);
      }
    }
    // null, errors, non-numeric strings are silently skipped
  }
  return nums;
}

/** Coerce a single FormulaValue to a number or throw #VALUE! */
function toNumber(v: FormulaValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null) return 0;
  if (typeof v === 'string') {
    const n = Number(v);
    if (v !== '' && !Number.isNaN(n)) return n;
  }
  return '#VALUE!' as never;
}

function requireNumber(v: FormulaValue, label = 'argument'): number {
  const n = toNumber(v);
  if (typeof n === 'string') throw new Error('#VALUE!');
  return n;
}

/** Check if a value is a FormulaError string. */
function isError(v: FormulaValue): boolean {
  if (typeof v !== 'string') return false;
  return (
    v === '#VALUE!' ||
    v === '#REF!' ||
    v === '#N/A' ||
    v === '#DIV/0!' ||
    v === '#NUM!' ||
    v === '#NAME?' ||
    v === '#NULL!' ||
    v === '#CALC!'
  );
}

// ---------------------------------------------------------------------------
// SUM
// ---------------------------------------------------------------------------
const SUM: FormulaFunction = {
  name: 'SUM',
  category: 'math-trig',
  description: 'Adds all the numbers in a range of cells.',
  minArgs: 1,
  maxArgs: 255,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const nums = extractNumbers(args);
    let total = new Decimal(0);
    for (const n of nums) {
      total = total.plus(n);
    }
    return total.toNumber();
  },
};

// ---------------------------------------------------------------------------
// AVERAGE
// ---------------------------------------------------------------------------
const AVERAGE: FormulaFunction = {
  name: 'AVERAGE',
  category: 'math-trig',
  description: 'Returns the average (arithmetic mean) of the arguments.',
  minArgs: 1,
  maxArgs: 255,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const nums = extractNumbers(args);
    if (nums.length === 0) {
      return '#DIV/0!';
    }
    let total = new Decimal(0);
    for (const n of nums) {
      total = total.plus(n);
    }
    return total.dividedBy(nums.length).toNumber();
  },
};

// ---------------------------------------------------------------------------
// MIN
// ---------------------------------------------------------------------------
const MIN: FormulaFunction = {
  name: 'MIN',
  category: 'math-trig',
  description: 'Returns the smallest number in a set of values.',
  minArgs: 1,
  maxArgs: 255,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const nums = extractNumbers(args);
    if (nums.length === 0) return 0;
    return Math.min(...nums);
  },
};

// ---------------------------------------------------------------------------
// MAX
// ---------------------------------------------------------------------------
const MAX: FormulaFunction = {
  name: 'MAX',
  category: 'math-trig',
  description: 'Returns the largest number in a set of values.',
  minArgs: 1,
  maxArgs: 255,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const nums = extractNumbers(args);
    if (nums.length === 0) return 0;
    return Math.max(...nums);
  },
};

// ---------------------------------------------------------------------------
// ROUND
// ---------------------------------------------------------------------------
const ROUND: FormulaFunction = {
  name: 'ROUND',
  category: 'math-trig',
  description: 'Rounds a number to a specified number of digits.',
  minArgs: 2,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const value = requireNumber(args[0]);
    const digits = requireNumber(args[1]);
    if (digits < 0) {
      const factor = new Decimal(10).pow(-digits);
      return new Decimal(value).div(factor).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(factor).toNumber();
    }
    return new Decimal(value).toDecimalPlaces(digits, Decimal.ROUND_HALF_UP).toNumber();
  },
};

// ---------------------------------------------------------------------------
// ROUNDUP
// ---------------------------------------------------------------------------
const ROUNDUP: FormulaFunction = {
  name: 'ROUNDUP',
  category: 'math-trig',
  description: 'Rounds a number up, away from zero.',
  minArgs: 2,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const value = requireNumber(args[0]);
    const digits = requireNumber(args[1]);
    if (digits < 0) {
      const factor = new Decimal(10).pow(-digits);
      return new Decimal(value).div(factor).toDecimalPlaces(0, Decimal.ROUND_UP).mul(factor).toNumber();
    }
    return new Decimal(value).toDecimalPlaces(digits, Decimal.ROUND_UP).toNumber();
  },
};

// ---------------------------------------------------------------------------
// ROUNDDOWN
// ---------------------------------------------------------------------------
const ROUNDDOWN: FormulaFunction = {
  name: 'ROUNDDOWN',
  category: 'math-trig',
  description: 'Rounds a number down, toward zero.',
  minArgs: 2,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const value = requireNumber(args[0]);
    const digits = requireNumber(args[1]);
    if (digits < 0) {
      const factor = new Decimal(10).pow(-digits);
      return new Decimal(value).div(factor).toDecimalPlaces(0, Decimal.ROUND_DOWN).mul(factor).toNumber();
    }
    return new Decimal(value).toDecimalPlaces(digits, Decimal.ROUND_DOWN).toNumber();
  },
};

// ---------------------------------------------------------------------------
// INT
// ---------------------------------------------------------------------------
const INT_FN: FormulaFunction = {
  name: 'INT',
  category: 'math-trig',
  description: 'Rounds a number down to the nearest integer.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const value = requireNumber(args[0]);
    // Excel INT floors towards negative infinity
    return Math.floor(value);
  },
};

// ---------------------------------------------------------------------------
// MOD
// ---------------------------------------------------------------------------
const MOD: FormulaFunction = {
  name: 'MOD',
  category: 'math-trig',
  description: 'Returns the remainder after number is divided by divisor.',
  minArgs: 2,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const number = requireNumber(args[0]);
    const divisor = requireNumber(args[1]);
    if (divisor === 0) {
      return '#DIV/0!';
    }
    // Excel MOD: result has the same sign as the divisor
    // MOD(n, d) = n - d * INT(n / d)
    const result = new Decimal(number).minus(
      new Decimal(divisor).times(Math.floor(number / divisor)),
    );
    return result.toNumber();
  },
};

// ---------------------------------------------------------------------------
// POWER
// ---------------------------------------------------------------------------
const POWER: FormulaFunction = {
  name: 'POWER',
  category: 'math-trig',
  description: 'Returns the result of a number raised to a power.',
  minArgs: 2,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const base = requireNumber(args[0]);
    const exponent = requireNumber(args[1]);
    const result = Math.pow(base, exponent);
    if (!Number.isFinite(result)) {
      return '#NUM!';
    }
    return result;
  },
};

// ---------------------------------------------------------------------------
// SQRT
// ---------------------------------------------------------------------------
const SQRT: FormulaFunction = {
  name: 'SQRT',
  category: 'math-trig',
  description: 'Returns a positive square root.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const value = requireNumber(args[0]);
    if (value < 0) {
      return '#NUM!';
    }
    return new Decimal(value).sqrt().toNumber();
  },
};

// ---------------------------------------------------------------------------
// ABS
// ---------------------------------------------------------------------------
const ABS: FormulaFunction = {
  name: 'ABS',
  category: 'math-trig',
  description: 'Returns the absolute value of a number.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const value = requireNumber(args[0]);
    return Math.abs(value);
  },
};

// ---------------------------------------------------------------------------
// CEILING
// ---------------------------------------------------------------------------
const CEILING: FormulaFunction = {
  name: 'CEILING',
  category: 'math-trig',
  description: 'Rounds a number up to the nearest multiple of significance.',
  minArgs: 2,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const number = requireNumber(args[0]);
    const significance = requireNumber(args[1]);
    if (significance === 0) return 0;
    if (number > 0 && significance < 0) {
      return '#NUM!';
    }
    const d = new Decimal(number);
    const s = new Decimal(significance);
    // Ceiling: round away from zero to next multiple
    return d.dividedBy(s).ceil().times(s).toNumber();
  },
};

// ---------------------------------------------------------------------------
// FLOOR
// ---------------------------------------------------------------------------
const FLOOR: FormulaFunction = {
  name: 'FLOOR',
  category: 'math-trig',
  description: 'Rounds a number down to the nearest multiple of significance.',
  minArgs: 2,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const number = requireNumber(args[0]);
    const significance = requireNumber(args[1]);
    if (significance === 0) return 0;
    if (number > 0 && significance < 0) {
      return '#NUM!';
    }
    const d = new Decimal(number);
    const s = new Decimal(significance);
    return d.dividedBy(s).floor().times(s).toNumber();
  },
};

// ---------------------------------------------------------------------------
// SUBTOTAL helpers
// ---------------------------------------------------------------------------

/** Map function_num (1-11) to the corresponding aggregation. */
function computeSubtotalFn(fnNum: number, values: FormulaValue[]): FormulaValue {
  const nums = extractNumbers(values);

  switch (fnNum) {
    case 1: // AVERAGE
    case 101: {
      if (nums.length === 0) return '#DIV/0!';
      let sum = new Decimal(0);
      for (const n of nums) sum = sum.plus(n);
      return sum.dividedBy(nums.length).toNumber();
    }
    case 2: // COUNT
    case 102:
      return nums.length;
    case 3: // COUNTA
    case 103: {
      const flat = flattenValues(values);
      return flat.filter((v) => v !== null).length;
    }
    case 4: // MAX
    case 104:
      return nums.length === 0 ? 0 : Math.max(...nums);
    case 5: // MIN
    case 105:
      return nums.length === 0 ? 0 : Math.min(...nums);
    case 6: // PRODUCT
    case 106: {
      if (nums.length === 0) return 0;
      let product = new Decimal(1);
      for (const n of nums) product = product.times(n);
      return product.toNumber();
    }
    case 7: // STDEV (sample)
    case 107: {
      if (nums.length < 2) return '#DIV/0!';
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance = nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / (nums.length - 1);
      return Math.sqrt(variance);
    }
    case 8: // STDEVP (population)
    case 108: {
      if (nums.length === 0) return '#DIV/0!';
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance = nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / nums.length;
      return Math.sqrt(variance);
    }
    case 9: // SUM
    case 109: {
      let sum = new Decimal(0);
      for (const n of nums) sum = sum.plus(n);
      return sum.toNumber();
    }
    case 10: // VAR (sample)
    case 110: {
      if (nums.length < 2) return '#DIV/0!';
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      return nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / (nums.length - 1);
    }
    case 11: // VARP (population)
    case 111: {
      if (nums.length === 0) return '#DIV/0!';
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      return nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / nums.length;
    }
    default:
      return '#VALUE!';
  }
}

// ---------------------------------------------------------------------------
// SUBTOTAL
// ---------------------------------------------------------------------------
const SUBTOTAL: FormulaFunction = {
  name: 'SUBTOTAL',
  category: 'math-trig',
  description:
    'Returns a subtotal in a list or database. Function_num 1-11 (or 101-111) selects the aggregation function.',
  minArgs: 2,
  maxArgs: 255,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const fnNum = requireNumber(args[0]);
    const values = args.slice(1);
    return computeSubtotalFn(fnNum, values);
  },
};

// ---------------------------------------------------------------------------
// AGGREGATE
// ---------------------------------------------------------------------------
const AGGREGATE: FormulaFunction = {
  name: 'AGGREGATE',
  category: 'math-trig',
  description:
    'Returns an aggregate in a list or database with options for ignoring error values and hidden rows.',
  minArgs: 3,
  maxArgs: 255,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const fnNum = requireNumber(args[0]);
    const options = requireNumber(args[1]);
    let values = args.slice(2);

    // Options bitmask (simplified):
    //  0 – ignore nothing
    //  1 – ignore hidden rows (no-op in formula engine without row visibility info)
    //  2 – ignore error values
    //  3 – ignore hidden rows and error values
    //  4 – ignore nothing
    //  5 – ignore hidden rows
    //  6 – ignore error values
    //  7 – ignore hidden rows and error values
    const ignoreErrors = options === 2 || options === 3 || options === 6 || options === 7;

    if (ignoreErrors) {
      const flat = flattenValues(values);
      values = flat.filter((v) => !isError(v));
    }

    // AGGREGATE function_num mapping (1-19, we support 1-11 same as SUBTOTAL)
    // 1=AVERAGE, 2=COUNT, 3=COUNTA, 4=MAX, 5=MIN, 6=PRODUCT,
    // 7=STDEV.S, 8=STDEV.P, 9=SUM, 10=VAR.S, 11=VAR.P
    // 12=MEDIAN, 13=MODE.SNGL, 14=LARGE, 15=SMALL, 16=PERCENTILE.INC,
    // 17=QUARTILE.INC, 18=PERCENTILE.EXC, 19=QUARTILE.EXC
    // We implement 1-11 via computeSubtotalFn; 12-19 are extended.

    if (fnNum >= 1 && fnNum <= 11) {
      return computeSubtotalFn(fnNum, values);
    }

    const nums = extractNumbers(values).sort((a, b) => a - b);

    switch (fnNum) {
      case 12: {
        // MEDIAN
        if (nums.length === 0) return '#NUM!';
        const mid = Math.floor(nums.length / 2);
        return nums.length % 2 === 0
          ? (nums[mid - 1] + nums[mid]) / 2
          : nums[mid];
      }
      case 13: {
        // MODE.SNGL – most frequent value
        if (nums.length === 0) return '#NUM!';
        const freq = new Map<number, number>();
        let maxFreq = 0;
        let mode = nums[0];
        for (const n of nums) {
          const f = (freq.get(n) ?? 0) + 1;
          freq.set(n, f);
          if (f > maxFreq) {
            maxFreq = f;
            mode = n;
          }
        }
        if (maxFreq === 1) return '#N/A';
        return mode;
      }
      case 14: {
        // LARGE(array, k)
        if (nums.length === 0) return '#NUM!';
        const k = requireNumber(values[values.length - 1]);
        if (k < 1 || k > nums.length) return '#NUM!';
        const descending = [...nums].sort((a, b) => b - a);
        return descending[k - 1];
      }
      case 15: {
        // SMALL(array, k)
        if (nums.length === 0) return '#NUM!';
        const k = requireNumber(values[values.length - 1]);
        if (k < 1 || k > nums.length) return '#NUM!';
        return nums[k - 1];
      }
      case 16: {
        // PERCENTILE.INC
        if (nums.length === 0) return '#NUM!';
        const pct = requireNumber(values[values.length - 1]);
        if (pct < 0 || pct > 1) return '#NUM!';
        const rank = pct * (nums.length - 1);
        const lower = Math.floor(rank);
        const upper = Math.ceil(rank);
        if (lower === upper) return nums[lower];
        return nums[lower] + (nums[upper] - nums[lower]) * (rank - lower);
      }
      case 17: {
        // QUARTILE.INC
        if (nums.length === 0) return '#NUM!';
        const quart = requireNumber(values[values.length - 1]);
        if (quart < 0 || quart > 4) return '#NUM!';
        const pctVal = quart / 4;
        const rank = pctVal * (nums.length - 1);
        const lower = Math.floor(rank);
        const upper = Math.ceil(rank);
        if (lower === upper) return nums[lower];
        return nums[lower] + (nums[upper] - nums[lower]) * (rank - lower);
      }
      case 18: {
        // PERCENTILE.EXC
        if (nums.length === 0) return '#NUM!';
        const pct = requireNumber(values[values.length - 1]);
        if (pct <= 0 || pct >= 1) return '#NUM!';
        const rank = pct * (nums.length + 1) - 1;
        if (rank < 0 || rank >= nums.length) return '#NUM!';
        const lower = Math.floor(rank);
        const upper = Math.ceil(rank);
        if (lower === upper) return nums[lower];
        return nums[lower] + (nums[upper] - nums[lower]) * (rank - lower);
      }
      case 19: {
        // QUARTILE.EXC
        if (nums.length === 0) return '#NUM!';
        const quart = requireNumber(values[values.length - 1]);
        if (quart < 1 || quart > 3) return '#NUM!';
        const pctVal = quart / 4;
        const rank = pctVal * (nums.length + 1) - 1;
        if (rank < 0 || rank >= nums.length) return '#NUM!';
        const lower = Math.floor(rank);
        const upper = Math.ceil(rank);
        if (lower === upper) return nums[lower];
        return nums[lower] + (nums[upper] - nums[lower]) * (rank - lower);
      }
      default:
        return '#VALUE!';
    }
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const mathTrigFunctions: FormulaFunction[] = [
  MIN,
  MAX,
  ROUND,
  ROUNDUP,
  ROUNDDOWN,
  INT_FN,
  MOD,
  POWER,
  SQRT,
  ABS,
  CEILING,
  FLOOR,
  SUBTOTAL,
  AGGREGATE,
  SUM,
  AVERAGE,
];
