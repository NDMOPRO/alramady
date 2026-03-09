import {
  parseCellAddress,
  cellAddressToString,
  parseRange,
  colNumberToLetter,
  letterToColNumber,
  expandRange,
  flattenValues,
  toNumber,
} from '../../utils/cell-utils.js';

describe('cell-utils', () => {
  describe('parseCellAddress', () => {
    it('should parse a simple cell reference like A1', () => {
      const result = parseCellAddress('A1');
      expect(result).not.toBeNull();
      expect(result!.col).toBe(1);
      expect(result!.row).toBe(1);
    });

    it('should parse a multi-letter column reference like AB10', () => {
      const result = parseCellAddress('AB10');
      expect(result).not.toBeNull();
      expect(result!.col).toBe(28); // A=1, B=2, AB=28
      expect(result!.row).toBe(10);
    });

    it('should parse absolute references like $A$1', () => {
      const result = parseCellAddress('$A$1');
      expect(result).not.toBeNull();
      expect(result!.col).toBe(1);
      expect(result!.row).toBe(1);
      expect(result!.absolute?.col).toBe(true);
      expect(result!.absolute?.row).toBe(true);
    });

    it('should return null for invalid references', () => {
      expect(parseCellAddress('')).toBeNull();
      expect(parseCellAddress('123')).toBeNull();
      expect(parseCellAddress('hello world')).toBeNull();
    });

    it('should handle lowercase cell references', () => {
      const result = parseCellAddress('b5');
      expect(result).not.toBeNull();
      expect(result!.col).toBe(2);
      expect(result!.row).toBe(5);
    });
  });

  describe('cellAddressToString', () => {
    it('should convert a simple address to string', () => {
      const result = cellAddressToString({ col: 1, row: 1 });
      expect(result).toBe('A1');
    });

    it('should convert a multi-letter column address', () => {
      const result = cellAddressToString({ col: 28, row: 10 });
      expect(result).toBe('AB10');
    });

    it('should include dollar signs for absolute references', () => {
      const result = cellAddressToString({ col: 1, row: 1, absolute: { col: true, row: true } });
      expect(result).toBe('$A$1');
    });

    it('should handle mixed absolute references', () => {
      const result = cellAddressToString({ col: 3, row: 5, absolute: { col: true, row: false } });
      expect(result).toBe('$C5');
    });
  });

  describe('parseRange', () => {
    it('should parse a valid range like A1:B5', () => {
      const result = parseRange('A1:B5');
      expect(result).not.toBeNull();
      expect(result!.start.col).toBe(1);
      expect(result!.start.row).toBe(1);
      expect(result!.end.col).toBe(2);
      expect(result!.end.row).toBe(5);
    });

    it('should return null for a single cell (no colon)', () => {
      expect(parseRange('A1')).toBeNull();
    });

    it('should return null for invalid range', () => {
      expect(parseRange('A1:invalid')).toBeNull();
    });
  });

  describe('colNumberToLetter', () => {
    it('should convert 1 to A', () => {
      expect(colNumberToLetter(1)).toBe('A');
    });

    it('should convert 26 to Z', () => {
      expect(colNumberToLetter(26)).toBe('Z');
    });

    it('should convert 27 to AA', () => {
      expect(colNumberToLetter(27)).toBe('AA');
    });

    it('should convert 28 to AB', () => {
      expect(colNumberToLetter(28)).toBe('AB');
    });

    it('should convert 52 to AZ', () => {
      expect(colNumberToLetter(52)).toBe('AZ');
    });

    it('should convert 702 to ZZ', () => {
      expect(colNumberToLetter(702)).toBe('ZZ');
    });

    it('should return A for 0 (edge case)', () => {
      expect(colNumberToLetter(0)).toBe('A');
    });
  });

  describe('letterToColNumber', () => {
    it('should convert A to 1', () => {
      expect(letterToColNumber('A')).toBe(1);
    });

    it('should convert Z to 26', () => {
      expect(letterToColNumber('Z')).toBe(26);
    });

    it('should convert AA to 27', () => {
      expect(letterToColNumber('AA')).toBe(27);
    });

    it('should convert AB to 28', () => {
      expect(letterToColNumber('AB')).toBe(28);
    });

    it('should convert AZ to 52', () => {
      expect(letterToColNumber('AZ')).toBe(52);
    });

    it('should be the inverse of colNumberToLetter', () => {
      for (const n of [1, 5, 26, 27, 52, 100, 702]) {
        const letter = colNumberToLetter(n);
        expect(letterToColNumber(letter)).toBe(n);
      }
    });
  });

  describe('expandRange', () => {
    it('should expand a single-cell range', () => {
      const cells = expandRange({
        start: { col: 1, row: 1 },
        end: { col: 1, row: 1 },
      });
      expect(cells).toHaveLength(1);
      expect(cells[0]).toEqual({ row: 1, col: 1 });
    });

    it('should expand a multi-cell range', () => {
      const cells = expandRange({
        start: { col: 1, row: 1 },
        end: { col: 3, row: 2 },
      });
      // 3 cols x 2 rows = 6 cells
      expect(cells).toHaveLength(6);
      expect(cells).toContainEqual({ row: 1, col: 1 });
      expect(cells).toContainEqual({ row: 1, col: 2 });
      expect(cells).toContainEqual({ row: 1, col: 3 });
      expect(cells).toContainEqual({ row: 2, col: 1 });
      expect(cells).toContainEqual({ row: 2, col: 2 });
      expect(cells).toContainEqual({ row: 2, col: 3 });
    });

    it('should expand a single column range', () => {
      const cells = expandRange({
        start: { col: 2, row: 1 },
        end: { col: 2, row: 4 },
      });
      expect(cells).toHaveLength(4);
      cells.forEach((cell) => expect(cell.col).toBe(2));
    });
  });

  describe('flattenValues', () => {
    it('should return a flat array unchanged', () => {
      expect(flattenValues([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('should flatten nested arrays', () => {
      expect(flattenValues([1, [2, 3], [4, [5]]])).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle empty arrays', () => {
      expect(flattenValues([])).toEqual([]);
    });

    it('should handle deeply nested arrays', () => {
      expect(flattenValues([[[1]], [[2]], [[3]]])).toEqual([1, 2, 3]);
    });

    it('should handle mixed types', () => {
      expect(flattenValues([1, 'hello', [true, null]])).toEqual([1, 'hello', true, null]);
    });
  });

  describe('toNumber', () => {
    it('should convert a numeric string to number', () => {
      expect(toNumber('42')).toBe(42);
    });

    it('should convert a float string', () => {
      expect(toNumber('3.14')).toBeCloseTo(3.14);
    });

    it('should return null for null/undefined/empty string', () => {
      expect(toNumber(null)).toBeNull();
      expect(toNumber(undefined)).toBeNull();
      expect(toNumber('')).toBeNull();
    });

    it('should return null for non-numeric string', () => {
      expect(toNumber('abc')).toBeNull();
    });

    it('should convert boolean true to 1 and false to 0', () => {
      expect(toNumber(true)).toBe(1);
      expect(toNumber(false)).toBe(0);
    });

    it('should pass through actual numbers', () => {
      expect(toNumber(99)).toBe(99);
      expect(toNumber(0)).toBe(0);
      expect(toNumber(-5)).toBe(-5);
    });
  });
});
