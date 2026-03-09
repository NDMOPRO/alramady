import { statisticalFunctions } from '../../../services/formula-functions/statistical.functions.js';
import type { FormulaContext } from '../../../types/formula.types.js';

const ctx: FormulaContext = { cellValues: new Map() };
const getFunc = (name: string) => statisticalFunctions.find(f => f.name === name)!;

describe('Statistical Functions', () => {
  // -----------------------------------------------------------------------
  // COUNT
  // -----------------------------------------------------------------------
  describe('COUNT', () => {
    const COUNT = getFunc('COUNT');

    it('should count numeric values', () => {
      expect(COUNT.execute([1, 2, 3], ctx)).toBe(3);
    });

    it('should not count non-numeric strings', () => {
      expect(COUNT.execute([1, 'hello', 3], ctx)).toBe(2);
    });

    it('should count numeric strings', () => {
      expect(COUNT.execute(['5', '10'], ctx)).toBe(2);
    });

    it('should not count null or empty strings', () => {
      expect(COUNT.execute([null, '', 1], ctx)).toBe(1);
    });

    it('should count booleans as numeric', () => {
      expect(COUNT.execute([true, false, 1], ctx)).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // COUNTA
  // -----------------------------------------------------------------------
  describe('COUNTA', () => {
    const COUNTA = getFunc('COUNTA');

    it('should count all non-empty values', () => {
      expect(COUNTA.execute([1, 'text', true], ctx)).toBe(3);
    });

    it('should not count null or empty strings', () => {
      expect(COUNTA.execute([1, null, '', 'text'], ctx)).toBe(2);
    });

    it('should count false as non-empty', () => {
      expect(COUNTA.execute([false], ctx)).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // COUNTBLANK
  // -----------------------------------------------------------------------
  describe('COUNTBLANK', () => {
    const COUNTBLANK = getFunc('COUNTBLANK');

    it('should count blank (null, empty string) cells', () => {
      expect(COUNTBLANK.execute([[null, '', 1, 'text']], ctx)).toBe(2);
    });

    it('should return 0 when no blanks exist', () => {
      expect(COUNTBLANK.execute([[1, 2, 3]], ctx)).toBe(0);
    });

    it('should count all blanks in an all-blank range', () => {
      expect(COUNTBLANK.execute([[null, null, '']], ctx)).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // MEDIAN
  // -----------------------------------------------------------------------
  describe('MEDIAN', () => {
    const MEDIAN = getFunc('MEDIAN');

    it('should return median for odd count', () => {
      expect(MEDIAN.execute([1, 3, 5], ctx)).toBe(3);
    });

    it('should return median for even count (average of two middle)', () => {
      expect(MEDIAN.execute([1, 2, 3, 4], ctx)).toBe(2.5);
    });

    it('should handle unsorted input', () => {
      expect(MEDIAN.execute([5, 1, 3], ctx)).toBe(3);
    });

    it('should return #NUM! for no numeric values', () => {
      expect(MEDIAN.execute(['abc'], ctx)).toBe('#NUM!');
    });

    it('should return the value itself for a single number', () => {
      expect(MEDIAN.execute([42], ctx)).toBe(42);
    });
  });

  // -----------------------------------------------------------------------
  // MODE
  // -----------------------------------------------------------------------
  describe('MODE', () => {
    const MODE = getFunc('MODE');

    it('should return the most frequent value', () => {
      expect(MODE.execute([1, 2, 2, 3, 3, 3], ctx)).toBe(3);
    });

    it('should return #N/A when no duplicates exist', () => {
      expect(MODE.execute([1, 2, 3, 4], ctx)).toBe('#N/A');
    });

    it('should return #N/A for empty numeric input', () => {
      expect(MODE.execute(['abc'], ctx)).toBe('#N/A');
    });

    it('should return the first mode when multiple modes tie', () => {
      // 2 appears twice, 3 appears twice -- first to reach maxCount wins
      const result = MODE.execute([2, 2, 3, 3], ctx);
      expect(result).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // STDEV
  // -----------------------------------------------------------------------
  describe('STDEV', () => {
    const STDEV = getFunc('STDEV');

    it('should compute sample standard deviation', () => {
      // STDEV([2,4,4,4,5,5,7,9]) = 2.138...
      const result = STDEV.execute([2, 4, 4, 4, 5, 5, 7, 9], ctx);
      expect(result).toBeCloseTo(2.1381, 3);
    });

    it('should return #DIV/0! for fewer than 2 values', () => {
      expect(STDEV.execute([5], ctx)).toBe('#DIV/0!');
    });

    it('should return 0 for identical values', () => {
      expect(STDEV.execute([3, 3, 3], ctx)).toBeCloseTo(0, 10);
    });
  });

  // -----------------------------------------------------------------------
  // VAR
  // -----------------------------------------------------------------------
  describe('VAR', () => {
    const VAR = getFunc('VAR');

    it('should compute sample variance', () => {
      // VAR([2,4,6]) = 4
      expect(VAR.execute([2, 4, 6], ctx)).toBeCloseTo(4, 5);
    });

    it('should return #DIV/0! for fewer than 2 values', () => {
      expect(VAR.execute([5], ctx)).toBe('#DIV/0!');
    });

    it('should return 0 for identical values', () => {
      expect(VAR.execute([7, 7, 7], ctx)).toBeCloseTo(0, 10);
    });
  });

  // -----------------------------------------------------------------------
  // LARGE
  // -----------------------------------------------------------------------
  describe('LARGE', () => {
    const LARGE = getFunc('LARGE');

    it('should return the 1st largest value', () => {
      expect(LARGE.execute([[5, 3, 8, 1], 1], ctx)).toBe(8);
    });

    it('should return the 2nd largest value', () => {
      expect(LARGE.execute([[5, 3, 8, 1], 2], ctx)).toBe(5);
    });

    it('should return the smallest when k equals count', () => {
      expect(LARGE.execute([[5, 3, 8, 1], 4], ctx)).toBe(1);
    });

    it('should return #NUM! when k is out of range', () => {
      expect(LARGE.execute([[1, 2], 5], ctx)).toBe('#NUM!');
    });

    it('should return #NUM! when k is 0', () => {
      expect(LARGE.execute([[1, 2, 3], 0], ctx)).toBe('#NUM!');
    });
  });

  // -----------------------------------------------------------------------
  // SMALL
  // -----------------------------------------------------------------------
  describe('SMALL', () => {
    const SMALL = getFunc('SMALL');

    it('should return the 1st smallest value', () => {
      expect(SMALL.execute([[5, 3, 8, 1], 1], ctx)).toBe(1);
    });

    it('should return the 2nd smallest value', () => {
      expect(SMALL.execute([[5, 3, 8, 1], 2], ctx)).toBe(3);
    });

    it('should return the largest when k equals count', () => {
      expect(SMALL.execute([[5, 3, 8, 1], 4], ctx)).toBe(8);
    });

    it('should return #NUM! when k is out of range', () => {
      expect(SMALL.execute([[1, 2], 5], ctx)).toBe('#NUM!');
    });
  });

  // -----------------------------------------------------------------------
  // RANK
  // -----------------------------------------------------------------------
  describe('RANK', () => {
    const RANK = getFunc('RANK');

    it('should return descending rank by default', () => {
      // In descending: 8 is rank 1, 5 is rank 2, 3 is rank 3, 1 is rank 4
      expect(RANK.execute([5, [5, 3, 8, 1]], ctx)).toBe(2);
    });

    it('should return ascending rank when order is non-zero', () => {
      // In ascending: 1 is rank 1, 3 is rank 2, 5 is rank 3, 8 is rank 4
      expect(RANK.execute([5, [5, 3, 8, 1], 1], ctx)).toBe(3);
    });

    it('should return rank 1 for the largest in descending', () => {
      expect(RANK.execute([8, [5, 3, 8, 1]], ctx)).toBe(1);
    });

    it('should return #N/A if value not found in range', () => {
      expect(RANK.execute([99, [1, 2, 3]], ctx)).toBe('#N/A');
    });
  });

  // -----------------------------------------------------------------------
  // PERCENTILE
  // -----------------------------------------------------------------------
  describe('PERCENTILE', () => {
    const PERCENTILE = getFunc('PERCENTILE');

    it('should return min for k=0', () => {
      expect(PERCENTILE.execute([[1, 2, 3, 4, 5], 0], ctx)).toBe(1);
    });

    it('should return max for k=1', () => {
      expect(PERCENTILE.execute([[1, 2, 3, 4, 5], 1], ctx)).toBe(5);
    });

    it('should return median for k=0.5', () => {
      expect(PERCENTILE.execute([[1, 2, 3, 4, 5], 0.5], ctx)).toBe(3);
    });

    it('should interpolate for k=0.25', () => {
      // rank = 0.25 * 4 = 1, so nums[1] = 2
      expect(PERCENTILE.execute([[1, 2, 3, 4, 5], 0.25], ctx)).toBe(2);
    });

    it('should return #NUM! for k out of range', () => {
      expect(PERCENTILE.execute([[1, 2, 3], 1.5], ctx)).toBe('#NUM!');
      expect(PERCENTILE.execute([[1, 2, 3], -0.1], ctx)).toBe('#NUM!');
    });

    it('should return #NUM! for empty data', () => {
      expect(PERCENTILE.execute([[], 0.5], ctx)).toBe('#NUM!');
    });
  });

  // -----------------------------------------------------------------------
  // QUARTILE
  // -----------------------------------------------------------------------
  describe('QUARTILE', () => {
    const QUARTILE = getFunc('QUARTILE');

    it('should return min for quart=0', () => {
      expect(QUARTILE.execute([[1, 2, 3, 4, 5], 0], ctx)).toBe(1);
    });

    it('should return Q1 for quart=1', () => {
      expect(QUARTILE.execute([[1, 2, 3, 4, 5], 1], ctx)).toBe(2);
    });

    it('should return median for quart=2', () => {
      expect(QUARTILE.execute([[1, 2, 3, 4, 5], 2], ctx)).toBe(3);
    });

    it('should return Q3 for quart=3', () => {
      expect(QUARTILE.execute([[1, 2, 3, 4, 5], 3], ctx)).toBe(4);
    });

    it('should return max for quart=4', () => {
      expect(QUARTILE.execute([[1, 2, 3, 4, 5], 4], ctx)).toBe(5);
    });

    it('should return #NUM! for invalid quartile number', () => {
      expect(QUARTILE.execute([[1, 2, 3], 5], ctx)).toBe('#NUM!');
      expect(QUARTILE.execute([[1, 2, 3], -1], ctx)).toBe('#NUM!');
    });
  });

  // -----------------------------------------------------------------------
  // FORECAST
  // -----------------------------------------------------------------------
  describe('FORECAST', () => {
    const FORECAST = getFunc('FORECAST');

    it('should compute basic linear regression forecast', () => {
      // known_y = [1,2,3], known_x = [1,2,3] => slope=1, intercept=0
      // FORECAST(4, ...) = 4
      expect(FORECAST.execute([4, [1, 2, 3], [1, 2, 3]], ctx)).toBe(4);
    });

    it('should handle y = 2x + 1 relationship', () => {
      // known_x = [1,2,3], known_y = [3,5,7] => slope=2, intercept=1
      // FORECAST(5, ...) = 2*5 + 1 = 11
      expect(FORECAST.execute([5, [3, 5, 7], [1, 2, 3]], ctx)).toBe(11);
    });

    it('should return #N/A when x and y arrays differ in length', () => {
      expect(FORECAST.execute([5, [1, 2], [1, 2, 3]], ctx)).toBe('#N/A');
    });

    it('should return #DIV/0! when all known_x values are the same', () => {
      expect(FORECAST.execute([5, [1, 2, 3], [2, 2, 2]], ctx)).toBe('#DIV/0!');
    });

    it('should return #VALUE! for non-numeric x', () => {
      expect(FORECAST.execute(['abc', [1, 2], [1, 2]], ctx)).toBe('#VALUE!');
    });

    it('should return #N/A for empty arrays', () => {
      expect(FORECAST.execute([5, [], []], ctx)).toBe('#N/A');
    });
  });
});
