import type { FormulaFunction, FormulaValue, FormulaContext } from '../../types/formula.types.js';
import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

const COUNT: FormulaFunction = {
  name: 'COUNT',
  category: 'statistical',
  description: 'Counts the number of cells that contain numbers.',
  minArgs: 1,
  maxArgs: 255,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const flat = flattenValues(args);
    let count = 0;
    for (const v of flat) {
      if (toNumber(v) !== null) count++;
    }
    return count;
  },
};

const COUNTA: FormulaFunction = {
  name: 'COUNTA',
  category: 'statistical',
  description: 'Counts the number of non-empty values.',
  minArgs: 1,
  maxArgs: 255,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const flat = flattenValues(args);
    let count = 0;
    for (const v of flat) {
      if (v !== null && v !== undefined && v !== '') count++;
    }
    return count;
  },
};

const COUNTBLANK: FormulaFunction = {
  name: 'COUNTBLANK',
  category: 'statistical',
  description: 'Counts the number of blank cells in a range.',
  minArgs: 1,
  maxArgs: 1,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const flat = flattenValues(args);
    let count = 0;
    for (const v of flat) {
      if (v === null || v === undefined || v === '') count++;
    }
    return count;
  },
};

const MEDIAN: FormulaFunction = {
  name: 'MEDIAN',
  category: 'statistical',
  description: 'Returns the median of the given numbers.',
  minArgs: 1,
  maxArgs: 255,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const flat = flattenValues(args);
    const nums: number[] = [];
    for (const v of flat) {
      const n = toNumber(v);
      if (n !== null) nums.push(n);
    }
    if (nums.length === 0) return '#NUM!' as FormulaValue;
    nums.sort((a, b) => a - b);
    const mid = Math.floor(nums.length / 2);
    if (nums.length % 2 === 0) {
      return new Decimal(nums[mid - 1]).plus(nums[mid]).div(2).toNumber();
    }
    return nums[mid];
  },
};

const MODE: FormulaFunction = {
  name: 'MODE',
  category: 'statistical',
  description: 'Returns the most frequently occurring value in a data set.',
  minArgs: 1,
  maxArgs: 255,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const flat = flattenValues(args);
    const nums: number[] = [];
    for (const v of flat) {
      const n = toNumber(v);
      if (n !== null) nums.push(n);
    }
    if (nums.length === 0) return '#N/A' as FormulaValue;

    const freq = new Map<number, number>();
    for (const n of nums) {
      freq.set(n, (freq.get(n) ?? 0) + 1);
    }

    let maxCount = 0;
    let modeVal: number | null = null;
    for (const [val, count] of freq) {
      if (count > maxCount) {
        maxCount = count;
        modeVal = val;
      }
    }

    if (maxCount <= 1) return '#N/A' as FormulaValue;
    return modeVal!;
  },
};

const STDEV: FormulaFunction = {
  name: 'STDEV',
  category: 'statistical',
  description: 'Estimates standard deviation based on a sample (uses n-1).',
  minArgs: 1,
  maxArgs: 255,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const flat = flattenValues(args);
    const nums: Decimal[] = [];
    for (const v of flat) {
      const n = toNumber(v);
      if (n !== null) nums.push(new Decimal(n));
    }
    if (nums.length < 2) return '#DIV/0!' as FormulaValue;

    const mean = nums.reduce((a, b) => a.plus(b), new Decimal(0)).div(nums.length);
    const sumSqDiff = nums.reduce((acc, x) => acc.plus(x.minus(mean).pow(2)), new Decimal(0));
    const variance = sumSqDiff.div(nums.length - 1);
    return variance.sqrt().toNumber();
  },
};

const VAR: FormulaFunction = {
  name: 'VAR',
  category: 'statistical',
  description: 'Estimates variance based on a sample (uses n-1).',
  minArgs: 1,
  maxArgs: 255,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const flat = flattenValues(args);
    const nums: Decimal[] = [];
    for (const v of flat) {
      const n = toNumber(v);
      if (n !== null) nums.push(new Decimal(n));
    }
    if (nums.length < 2) return '#DIV/0!' as FormulaValue;

    const mean = nums.reduce((a, b) => a.plus(b), new Decimal(0)).div(nums.length);
    const sumSqDiff = nums.reduce((acc, x) => acc.plus(x.minus(mean).pow(2)), new Decimal(0));
    return sumSqDiff.div(nums.length - 1).toNumber();
  },
};

const LARGE: FormulaFunction = {
  name: 'LARGE',
  category: 'statistical',
  description: 'Returns the k-th largest value in a data set.',
  minArgs: 2,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const flat = flattenValues(Array.isArray(args[0]) ? args[0] as FormulaValue[] : [args[0]]);
    const nums: number[] = [];
    for (const v of flat) {
      const n = toNumber(v);
      if (n !== null) nums.push(n);
    }

    const k = toNumber(args[1]);
    if (k === null || k < 1 || k > nums.length || !Number.isInteger(k)) {
      return '#NUM!' as FormulaValue;
    }

    nums.sort((a, b) => b - a);
    return nums[k - 1];
  },
};

const SMALL: FormulaFunction = {
  name: 'SMALL',
  category: 'statistical',
  description: 'Returns the k-th smallest value in a data set.',
  minArgs: 2,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const flat = flattenValues(Array.isArray(args[0]) ? args[0] as FormulaValue[] : [args[0]]);
    const nums: number[] = [];
    for (const v of flat) {
      const n = toNumber(v);
      if (n !== null) nums.push(n);
    }

    const k = toNumber(args[1]);
    if (k === null || k < 1 || k > nums.length || !Number.isInteger(k)) {
      return '#NUM!' as FormulaValue;
    }

    nums.sort((a, b) => a - b);
    return nums[k - 1];
  },
};

const RANK: FormulaFunction = {
  name: 'RANK',
  category: 'statistical',
  description: 'Returns the rank of a number in a list of numbers.',
  minArgs: 2,
  maxArgs: 3,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const value = toNumber(args[0]);
    if (value === null) return '#VALUE!' as FormulaValue;

    const flat = flattenValues(Array.isArray(args[1]) ? args[1] as FormulaValue[] : [args[1]]);
    const nums: number[] = [];
    for (const v of flat) {
      const n = toNumber(v);
      if (n !== null) nums.push(n);
    }

    if (nums.length === 0) return '#N/A' as FormulaValue;

    const order = args[2] !== undefined ? toNumber(args[2]) : 0;
    const ascending = order !== null && order !== 0;

    // Check that value exists in the range
    if (!nums.includes(value)) return '#N/A' as FormulaValue;

    if (ascending) {
      nums.sort((a, b) => a - b);
    } else {
      nums.sort((a, b) => b - a);
    }

    return nums.indexOf(value) + 1;
  },
};

const PERCENTILE: FormulaFunction = {
  name: 'PERCENTILE',
  category: 'statistical',
  description: 'Returns the k-th percentile of values in a range.',
  minArgs: 2,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const flat = flattenValues(Array.isArray(args[0]) ? args[0] as FormulaValue[] : [args[0]]);
    const nums: number[] = [];
    for (const v of flat) {
      const n = toNumber(v);
      if (n !== null) nums.push(n);
    }

    const k = toNumber(args[1]);
    if (k === null || k < 0 || k > 1) return '#NUM!' as FormulaValue;
    if (nums.length === 0) return '#NUM!' as FormulaValue;

    nums.sort((a, b) => a - b);
    const n = nums.length;

    if (k === 0) return nums[0];
    if (k === 1) return nums[n - 1];

    const rank = k * (n - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    const frac = rank - lower;

    if (lower === upper) return nums[lower];
    return new Decimal(nums[lower]).plus(new Decimal(frac).times(nums[upper] - nums[lower])).toNumber();
  },
};

const QUARTILE: FormulaFunction = {
  name: 'QUARTILE',
  category: 'statistical',
  description: 'Returns the quartile of a data set.',
  minArgs: 2,
  maxArgs: 2,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], context: FormulaContext): FormulaValue {
    const quart = toNumber(args[1]);
    if (quart === null || quart < 0 || quart > 4 || !Number.isInteger(quart)) {
      return '#NUM!' as FormulaValue;
    }

    // Delegate to PERCENTILE with k = quart / 4
    const k = quart / 4;
    return PERCENTILE.execute([args[0], k], context);
  },
};

const FORECAST: FormulaFunction = {
  name: 'FORECAST',
  category: 'statistical',
  description: 'Calculates a future value by using linear regression.',
  minArgs: 3,
  maxArgs: 3,
  isVolatile: false,
  returnsArray: false,
  execute(args: FormulaValue[], _context: FormulaContext): FormulaValue {
    const x = toNumber(args[0]);
    if (x === null) return '#VALUE!' as FormulaValue;

    const flatY = flattenValues(Array.isArray(args[1]) ? args[1] as FormulaValue[] : [args[1]]);
    const flatX = flattenValues(Array.isArray(args[2]) ? args[2] as FormulaValue[] : [args[2]]);

    const knownY: Decimal[] = [];
    const knownX: Decimal[] = [];

    for (const v of flatY) {
      const n = toNumber(v);
      if (n !== null) knownY.push(new Decimal(n));
    }
    for (const v of flatX) {
      const n = toNumber(v);
      if (n !== null) knownX.push(new Decimal(n));
    }

    if (knownY.length !== knownX.length || knownY.length === 0) {
      return '#N/A' as FormulaValue;
    }

    const n = knownY.length;
    const meanX = knownX.reduce((a, b) => a.plus(b), new Decimal(0)).div(n);
    const meanY = knownY.reduce((a, b) => a.plus(b), new Decimal(0)).div(n);

    let numerator = new Decimal(0);
    let denominator = new Decimal(0);

    for (let i = 0; i < n; i++) {
      const dx = knownX[i].minus(meanX);
      const dy = knownY[i].minus(meanY);
      numerator = numerator.plus(dx.times(dy));
      denominator = denominator.plus(dx.pow(2));
    }

    if (denominator.isZero()) return '#DIV/0!' as FormulaValue;

    const slope = numerator.div(denominator);
    const intercept = meanY.minus(slope.times(meanX));

    return slope.times(x).plus(intercept).toNumber();
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const statisticalFunctions: FormulaFunction[] = [
  COUNT,
  COUNTA,
  COUNTBLANK,
  MEDIAN,
  MODE,
  STDEV,
  VAR,
  LARGE,
  SMALL,
  RANK,
  PERCENTILE,
  QUARTILE,
  FORECAST,
];
