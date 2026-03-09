import { lookupReferenceFunctions } from '../../../services/formula-functions/lookup-reference.functions.js';
import type { FormulaContext } from '../../../types/formula.types.js';

const ctx: FormulaContext = { cellValues: new Map() };
const getFunc = (name: string) => lookupReferenceFunctions.find(f => f.name === name)!;

describe('Lookup & Reference Functions', () => {
  describe('VLOOKUP', () => {
    const vlookup = getFunc('VLOOKUP');

    it('should find exact match in first column', () => {
      const table = [[1, 'A'], [2, 'B'], [3, 'C']];
      const result = vlookup.execute([2, table, 2, true], ctx);
      expect(result).toBe('B');
    });

    it('should return #N/A for exact match not found', () => {
      const table = [[1, 'A'], [2, 'B']];
      const result = vlookup.execute([5, table, 2, true], ctx);
      expect(result).toBe('#N/A');
    });

    it('should handle approximate match', () => {
      const table = [[1, 'A'], [3, 'B'], [5, 'C']];
      const result = vlookup.execute([4, table, 2, false], ctx);
      expect(result).toBe('B');
    });
  });

  describe('HLOOKUP', () => {
    const hlookup = getFunc('HLOOKUP');

    it('should find value in first row', () => {
      const table = [['A', 'B', 'C'], [1, 2, 3], [4, 5, 6]];
      const result = hlookup.execute(['B', table, 2, true], ctx);
      expect(result).toBe(2);
    });
  });

  describe('INDEX', () => {
    const index = getFunc('INDEX');

    it('should return value at row and column', () => {
      const arr = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
      const result = index.execute([arr, 2, 3], ctx);
      expect(result).toBe(6);
    });

    it('should return #REF! for out of range', () => {
      const arr = [[1, 2], [3, 4]];
      const result = index.execute([arr, 5, 1], ctx);
      expect(result).toBe('#REF!');
    });
  });

  describe('MATCH', () => {
    const match = getFunc('MATCH');

    it('should find exact match position', () => {
      const arr = ['A', 'B', 'C', 'D'];
      const result = match.execute(['C', arr, 0], ctx);
      expect(result).toBe(3);
    });

    it('should return #N/A when not found', () => {
      const arr = ['A', 'B', 'C'];
      const result = match.execute(['Z', arr, 0], ctx);
      expect(result).toBe('#N/A');
    });
  });

  describe('XLOOKUP', () => {
    const xlookup = getFunc('XLOOKUP');

    it('should find exact match', () => {
      const lookup = ['A', 'B', 'C'];
      const returns = [10, 20, 30];
      const result = xlookup.execute(['B', lookup, returns], ctx);
      expect(result).toBe(20);
    });

    it('should return if_not_found when no match', () => {
      const lookup = ['A', 'B'];
      const returns = [10, 20];
      const result = xlookup.execute(['Z', lookup, returns, 'Not Found'], ctx);
      expect(result).toBe('Not Found');
    });
  });

  describe('CHOOSE', () => {
    const choose = getFunc('CHOOSE');

    it('should return value at index', () => {
      const result = choose.execute([2, 'first', 'second', 'third'], ctx);
      expect(result).toBe('second');
    });
  });

  describe('ROW', () => {
    const row = getFunc('ROW');

    it('should return row number from reference', () => {
      const result = row.execute(['A5'], ctx);
      expect(result).toBe(5);
    });
  });

  describe('COLUMN', () => {
    const column = getFunc('COLUMN');

    it('should return column number from reference', () => {
      const result = column.execute(['C1'], ctx);
      expect(result).toBe(3);
    });
  });

  describe('ROWS', () => {
    const rows = getFunc('ROWS');

    it('should count rows in array', () => {
      const arr = [[1, 2], [3, 4], [5, 6]];
      const result = rows.execute([arr], ctx);
      expect(result).toBe(3);
    });
  });

  describe('COLUMNS', () => {
    const columns = getFunc('COLUMNS');

    it('should count columns in array', () => {
      const arr = [[1, 2, 3], [4, 5, 6]];
      const result = columns.execute([arr], ctx);
      expect(result).toBe(3);
    });
  });

  describe('TRANSPOSE', () => {
    const transpose = getFunc('TRANSPOSE');

    it('should flip rows and columns', () => {
      const arr = [[1, 2, 3], [4, 5, 6]];
      const result = transpose.execute([arr], ctx);
      expect(result).toEqual([[1, 4], [2, 5], [3, 6]]);
    });
  });
});
