import { mathTrigFunctions } from '../../../services/formula-functions/math-trig.functions.js';
import type { FormulaContext } from '../../../types/formula.types.js';

const ctx: FormulaContext = { cellValues: new Map() };
const getFunc = (name: string) => mathTrigFunctions.find(f => f.name === name)!;

describe('Math & Trig Functions', () => {
  // -----------------------------------------------------------------------
  // SUM
  // -----------------------------------------------------------------------
  describe('SUM', () => {
    const SUM = getFunc('SUM');

    it('should sum basic numbers', () => {
      expect(SUM.execute([1, 2, 3], ctx)).toBe(6);
    });

    it('should return 0 for empty values', () => {
      expect(SUM.execute([null, null], ctx)).toBe(0);
    });

    it('should handle mixed types (booleans coerced, non-numeric strings skipped)', () => {
      expect(SUM.execute([1, true, false, 'hello', '5'], ctx)).toBe(7);
    });

    it('should handle a single value', () => {
      expect(SUM.execute([42], ctx)).toBe(42);
    });

    it('should handle nested arrays', () => {
      expect(SUM.execute([[1, 2], [3, 4]], ctx)).toBe(10);
    });

    it('should handle negative numbers', () => {
      expect(SUM.execute([-1, -2, 3], ctx)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // AVERAGE
  // -----------------------------------------------------------------------
  describe('AVERAGE', () => {
    const AVERAGE = getFunc('AVERAGE');

    it('should compute basic average', () => {
      expect(AVERAGE.execute([2, 4, 6], ctx)).toBe(4);
    });

    it('should return #DIV/0! when no numeric values are found', () => {
      expect(AVERAGE.execute([null, 'abc'], ctx)).toBe('#DIV/0!');
    });

    it('should average a single value', () => {
      expect(AVERAGE.execute([10], ctx)).toBe(10);
    });

    it('should skip non-numeric strings', () => {
      expect(AVERAGE.execute([10, 20, 'text'], ctx)).toBe(15);
    });
  });

  // -----------------------------------------------------------------------
  // MIN
  // -----------------------------------------------------------------------
  describe('MIN', () => {
    const MIN = getFunc('MIN');

    it('should return the minimum of basic values', () => {
      expect(MIN.execute([3, 1, 2], ctx)).toBe(1);
    });

    it('should handle negative values', () => {
      expect(MIN.execute([-5, -1, 0, 3], ctx)).toBe(-5);
    });

    it('should return the value itself for a single value', () => {
      expect(MIN.execute([7], ctx)).toBe(7);
    });

    it('should return 0 when no numeric values are present', () => {
      expect(MIN.execute([null], ctx)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // MAX
  // -----------------------------------------------------------------------
  describe('MAX', () => {
    const MAX = getFunc('MAX');

    it('should return the maximum of basic values', () => {
      expect(MAX.execute([3, 1, 2], ctx)).toBe(3);
    });

    it('should handle negative values', () => {
      expect(MAX.execute([-5, -1, -3], ctx)).toBe(-1);
    });

    it('should return the value itself for a single value', () => {
      expect(MAX.execute([7], ctx)).toBe(7);
    });

    it('should return 0 when no numeric values are present', () => {
      expect(MAX.execute([null], ctx)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // ROUND
  // -----------------------------------------------------------------------
  describe('ROUND', () => {
    const ROUND = getFunc('ROUND');

    it('should round to positive decimal places', () => {
      expect(ROUND.execute([2.345, 2], ctx)).toBe(2.35);
    });

    it('should round with 0 decimal places', () => {
      expect(ROUND.execute([2.5, 0], ctx)).toBe(3);
    });

    it('should round with negative decimal places (tens)', () => {
      expect(ROUND.execute([1234, -2], ctx)).toBe(1200);
    });

    it('should round 0.5 up (half-up)', () => {
      expect(ROUND.execute([1.5, 0], ctx)).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // ROUNDUP
  // -----------------------------------------------------------------------
  describe('ROUNDUP', () => {
    const ROUNDUP = getFunc('ROUNDUP');

    it('should round up positive numbers away from zero', () => {
      expect(ROUNDUP.execute([2.321, 2], ctx)).toBe(2.33);
    });

    it('should round up negative numbers away from zero', () => {
      expect(ROUNDUP.execute([-2.321, 2], ctx)).toBe(-2.33);
    });

    it('should round up with negative decimal places', () => {
      expect(ROUNDUP.execute([1234, -2], ctx)).toBe(1300);
    });
  });

  // -----------------------------------------------------------------------
  // ROUNDDOWN
  // -----------------------------------------------------------------------
  describe('ROUNDDOWN', () => {
    const ROUNDDOWN = getFunc('ROUNDDOWN');

    it('should round down positive numbers toward zero', () => {
      expect(ROUNDDOWN.execute([2.789, 2], ctx)).toBe(2.78);
    });

    it('should round down negative numbers toward zero', () => {
      expect(ROUNDDOWN.execute([-2.789, 2], ctx)).toBe(-2.78);
    });

    it('should round down with negative decimal places', () => {
      expect(ROUNDDOWN.execute([1289, -2], ctx)).toBe(1200);
    });
  });

  // -----------------------------------------------------------------------
  // INT
  // -----------------------------------------------------------------------
  describe('INT', () => {
    const INT = getFunc('INT');

    it('should floor positive numbers', () => {
      expect(INT.execute([5.9], ctx)).toBe(5);
    });

    it('should floor negative numbers toward negative infinity', () => {
      expect(INT.execute([-5.1], ctx)).toBe(-6);
    });

    it('should return integer unchanged', () => {
      expect(INT.execute([3], ctx)).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // MOD
  // -----------------------------------------------------------------------
  describe('MOD', () => {
    const MOD = getFunc('MOD');

    it('should compute basic modulo', () => {
      expect(MOD.execute([10, 3], ctx)).toBe(1);
    });

    it('should return #DIV/0! for divisor 0', () => {
      expect(MOD.execute([10, 0], ctx)).toBe('#DIV/0!');
    });

    it('should handle negative dividend (result sign matches divisor)', () => {
      expect(MOD.execute([-7, 3], ctx)).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // POWER
  // -----------------------------------------------------------------------
  describe('POWER', () => {
    const POWER = getFunc('POWER');

    it('should compute basic power', () => {
      expect(POWER.execute([2, 3], ctx)).toBe(8);
    });

    it('should compute fractional exponent', () => {
      expect(POWER.execute([4, 0.5], ctx)).toBe(2);
    });

    it('should return #NUM! for non-finite result', () => {
      expect(POWER.execute([0, -1], ctx)).toBe('#NUM!');
    });

    it('should handle zero exponent', () => {
      expect(POWER.execute([5, 0], ctx)).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // SQRT
  // -----------------------------------------------------------------------
  describe('SQRT', () => {
    const SQRT = getFunc('SQRT');

    it('should compute square root of positive number', () => {
      expect(SQRT.execute([9], ctx)).toBe(3);
    });

    it('should return #NUM! for negative number', () => {
      expect(SQRT.execute([-4], ctx)).toBe('#NUM!');
    });

    it('should return 0 for SQRT(0)', () => {
      expect(SQRT.execute([0], ctx)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // ABS
  // -----------------------------------------------------------------------
  describe('ABS', () => {
    const ABS = getFunc('ABS');

    it('should return absolute value of positive number', () => {
      expect(ABS.execute([5], ctx)).toBe(5);
    });

    it('should return absolute value of negative number', () => {
      expect(ABS.execute([-5], ctx)).toBe(5);
    });

    it('should return 0 for ABS(0)', () => {
      expect(ABS.execute([0], ctx)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // CEILING
  // -----------------------------------------------------------------------
  describe('CEILING', () => {
    const CEILING = getFunc('CEILING');

    it('should round up positive number to nearest significance', () => {
      expect(CEILING.execute([2.1, 1], ctx)).toBe(3);
    });

    it('should round up to nearest 0.5', () => {
      expect(CEILING.execute([2.1, 0.5], ctx)).toBe(2.5);
    });

    it('should return 0 when significance is 0', () => {
      expect(CEILING.execute([5, 0], ctx)).toBe(0);
    });

    it('should return #NUM! for positive number with negative significance', () => {
      expect(CEILING.execute([5, -1], ctx)).toBe('#NUM!');
    });

    it('should handle negative number with negative significance', () => {
      expect(CEILING.execute([-4.1, -1], ctx)).toBe(-5);
    });
  });

  // -----------------------------------------------------------------------
  // FLOOR
  // -----------------------------------------------------------------------
  describe('FLOOR', () => {
    const FLOOR = getFunc('FLOOR');

    it('should round down positive number to nearest significance', () => {
      expect(FLOOR.execute([2.9, 1], ctx)).toBe(2);
    });

    it('should round down to nearest 0.5', () => {
      expect(FLOOR.execute([2.7, 0.5], ctx)).toBe(2.5);
    });

    it('should return 0 when significance is 0', () => {
      expect(FLOOR.execute([5, 0], ctx)).toBe(0);
    });

    it('should return #NUM! for positive number with negative significance', () => {
      expect(FLOOR.execute([5, -1], ctx)).toBe('#NUM!');
    });

    it('should handle negative number with negative significance', () => {
      expect(FLOOR.execute([-4.1, -1], ctx)).toBe(-4);
    });
  });

  // -----------------------------------------------------------------------
  // SUBTOTAL
  // -----------------------------------------------------------------------
  describe('SUBTOTAL', () => {
    const SUBTOTAL = getFunc('SUBTOTAL');

    it('function 1 (AVERAGE) should compute average', () => {
      expect(SUBTOTAL.execute([1, 10, 20, 30], ctx)).toBe(20);
    });

    it('function 2 (COUNT) should count numeric values', () => {
      expect(SUBTOTAL.execute([2, 10, 'abc', 30], ctx)).toBe(2);
    });

    it('function 3 (COUNTA) should count non-null values', () => {
      expect(SUBTOTAL.execute([3, 10, 'abc', null, 30], ctx)).toBe(3);
    });

    it('function 4 (MAX) should return maximum', () => {
      expect(SUBTOTAL.execute([4, 10, 20, 5], ctx)).toBe(20);
    });

    it('function 5 (MIN) should return minimum', () => {
      expect(SUBTOTAL.execute([5, 10, 20, 5], ctx)).toBe(5);
    });

    it('function 6 (PRODUCT) should return product', () => {
      expect(SUBTOTAL.execute([6, 2, 3, 4], ctx)).toBe(24);
    });

    it('function 7 (STDEV) should compute sample standard deviation', () => {
      const result = SUBTOTAL.execute([7, 2, 4, 4, 4, 5, 5, 7, 9], ctx);
      expect(result).toBeCloseTo(2, 0);
    });

    it('function 8 (STDEVP) should compute population standard deviation', () => {
      const result = SUBTOTAL.execute([8, 2, 4, 4, 4, 5, 5, 7, 9], ctx);
      expect(typeof result).toBe('number');
    });

    it('function 9 (SUM) should compute sum', () => {
      expect(SUBTOTAL.execute([9, 1, 2, 3], ctx)).toBe(6);
    });

    it('function 10 (VAR) should compute sample variance', () => {
      const result = SUBTOTAL.execute([10, 2, 4, 6], ctx);
      expect(result).toBeCloseTo(4, 5);
    });

    it('function 11 (VARP) should compute population variance', () => {
      const result = SUBTOTAL.execute([11, 2, 4, 6], ctx);
      expect(typeof result).toBe('number');
      expect(result).toBeCloseTo(2.6667, 3);
    });

    it('should return #VALUE! for invalid function number', () => {
      expect(SUBTOTAL.execute([99, 1, 2, 3], ctx)).toBe('#VALUE!');
    });
  });

  // -----------------------------------------------------------------------
  // AGGREGATE
  // -----------------------------------------------------------------------
  describe('AGGREGATE', () => {
    const AGGREGATE = getFunc('AGGREGATE');

    it('should compute SUM via function_num 9 with option 0', () => {
      expect(AGGREGATE.execute([9, 0, 1, 2, 3], ctx)).toBe(6);
    });

    it('should compute AVERAGE via function_num 1 with option 0', () => {
      expect(AGGREGATE.execute([1, 0, 10, 20, 30], ctx)).toBe(20);
    });

    it('should ignore errors when option is 2', () => {
      expect(AGGREGATE.execute([9, 2, 1, '#VALUE!', 3], ctx)).toBe(4);
    });

    it('should compute MEDIAN via function_num 12', () => {
      expect(AGGREGATE.execute([12, 0, 1, 3, 5], ctx)).toBe(3);
    });

    it('should return #VALUE! for unsupported function number', () => {
      expect(AGGREGATE.execute([99, 0, 1, 2], ctx)).toBe('#VALUE!');
    });
  });
});
