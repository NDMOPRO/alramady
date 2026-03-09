import { dynamicArrayFunctions } from '../../../services/formula-functions/dynamic-array.functions.js';
import type { FormulaContext } from '../../../types/formula.types.js';

const ctx: FormulaContext = { cellValues: new Map() };
const getFunc = (name: string) => dynamicArrayFunctions.find(f => f.name === name)!;

describe('Dynamic Array Functions', () => {
  describe('SORT', () => {
    const sort = getFunc('SORT');

    it('should sort array ascending by default', () => {
      const arr = [[3, 'C'], [1, 'A'], [2, 'B']];
      const result = sort.execute([arr], ctx) as any[][];
      expect(result[0][0]).toBe(1);
      expect(result[1][0]).toBe(2);
      expect(result[2][0]).toBe(3);
    });

    it('should sort descending when specified', () => {
      const arr = [[1, 'A'], [3, 'C'], [2, 'B']];
      const result = sort.execute([arr, 1, -1], ctx) as any[][];
      expect(result[0][0]).toBe(3);
    });
  });

  describe('FILTER', () => {
    const filter = getFunc('FILTER');

    it('should filter rows by boolean array', () => {
      const arr = [[1, 'A'], [2, 'B'], [3, 'C']];
      const include = [true, false, true];
      const result = filter.execute([arr, include], ctx) as any[][];
      expect(result).toHaveLength(2);
      expect(result[0][0]).toBe(1);
      expect(result[1][0]).toBe(3);
    });
  });

  describe('UNIQUE', () => {
    const unique = getFunc('UNIQUE');

    it('should return unique rows', () => {
      const arr = [[1, 'A'], [2, 'B'], [1, 'A'], [3, 'C']];
      const result = unique.execute([arr], ctx) as any[][];
      expect(result).toHaveLength(3);
    });
  });

  describe('SEQUENCE', () => {
    const sequence = getFunc('SEQUENCE');

    it('should generate sequence', () => {
      const result = sequence.execute([3, 1, 1, 1], ctx);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should generate 2D sequence', () => {
      const result = sequence.execute([2, 3, 1, 1], ctx) as any[][];
      expect(result).toEqual([[1, 2, 3], [4, 5, 6]]);
    });
  });

  describe('RANDARRAY', () => {
    const randarray = getFunc('RANDARRAY');

    it('should generate random array of specified dimensions', () => {
      const result = randarray.execute([2, 3], ctx) as any[][];
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(3);
      result.flat().forEach(val => {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      });
    });

    it('should generate whole numbers when specified', () => {
      const result = randarray.execute([3, 1, 1, 10, true], ctx) as any[];
      result.flat().forEach(val => {
        expect(Number.isInteger(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(1);
        expect(val).toBeLessThanOrEqual(10);
      });
    });
  });

  describe('LET', () => {
    const letFn = getFunc('LET');

    it('should return the last argument', () => {
      const result = letFn.execute(['x', 10, 'y', 20, 30], ctx);
      expect(result).toBe(30);
    });
  });

  describe('SORTBY', () => {
    const sortby = getFunc('SORTBY');

    it('should sort array by another array', () => {
      const arr = [['A'], ['B'], ['C']];
      const byArr = [3, 1, 2];
      const result = sortby.execute([arr, byArr, 1], ctx) as any[][];
      expect(result[0][0]).toBe('B');
      expect(result[1][0]).toBe('C');
      expect(result[2][0]).toBe('A');
    });
  });
});
