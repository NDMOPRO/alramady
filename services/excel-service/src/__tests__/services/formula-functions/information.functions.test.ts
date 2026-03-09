import { informationFunctions } from '../../../services/formula-functions/information.functions.js';
import type { FormulaContext } from '../../../types/formula.types.js';

const ctx: FormulaContext = { cellValues: new Map() };
const getFunc = (name: string) => informationFunctions.find(f => f.name === name)!;

describe('information functions', () => {
  describe('ISNUMBER', () => {
    it('should return true for a number', () => {
      expect(getFunc('ISNUMBER').execute([42], ctx)).toBe(true);
    });

    it('should return true for zero', () => {
      expect(getFunc('ISNUMBER').execute([0], ctx)).toBe(true);
    });

    it('should return false for a string', () => {
      expect(getFunc('ISNUMBER').execute(['hello'], ctx)).toBe(false);
    });

    it('should return false for a boolean', () => {
      expect(getFunc('ISNUMBER').execute([true], ctx)).toBe(false);
    });

    it('should return false for null', () => {
      expect(getFunc('ISNUMBER').execute([null], ctx)).toBe(false);
    });

    it('should return false for a numeric string', () => {
      expect(getFunc('ISNUMBER').execute(['123'], ctx)).toBe(false);
    });
  });

  describe('ISTEXT', () => {
    it('should return true for a plain text string', () => {
      expect(getFunc('ISTEXT').execute(['hello'], ctx)).toBe(true);
    });

    it('should return false for a number', () => {
      expect(getFunc('ISTEXT').execute([42], ctx)).toBe(false);
    });

    it('should return false for a boolean', () => {
      expect(getFunc('ISTEXT').execute([true], ctx)).toBe(false);
    });

    it('should return false for an error string', () => {
      expect(getFunc('ISTEXT').execute(['#VALUE!'], ctx)).toBe(false);
    });

    it('should return false for a numeric string', () => {
      // The implementation treats pure-numeric strings as non-text
      expect(getFunc('ISTEXT').execute(['123'], ctx)).toBe(false);
    });

    it('should return false for null', () => {
      expect(getFunc('ISTEXT').execute([null], ctx)).toBe(false);
    });
  });

  describe('ISBLANK', () => {
    it('should return true for null', () => {
      expect(getFunc('ISBLANK').execute([null], ctx)).toBe(true);
    });

    it('should return true for undefined', () => {
      expect(getFunc('ISBLANK').execute([undefined as any], ctx)).toBe(true);
    });

    it('should return true for an empty string', () => {
      expect(getFunc('ISBLANK').execute([''], ctx)).toBe(true);
    });

    it('should return false for zero', () => {
      expect(getFunc('ISBLANK').execute([0], ctx)).toBe(false);
    });

    it('should return false for a non-empty string', () => {
      expect(getFunc('ISBLANK').execute(['text'], ctx)).toBe(false);
    });

    it('should return false for false', () => {
      expect(getFunc('ISBLANK').execute([false], ctx)).toBe(false);
    });
  });

  describe('ISERROR', () => {
    it('should return true for #VALUE!', () => {
      expect(getFunc('ISERROR').execute(['#VALUE!'], ctx)).toBe(true);
    });

    it('should return true for #REF!', () => {
      expect(getFunc('ISERROR').execute(['#REF!'], ctx)).toBe(true);
    });

    it('should return true for #N/A', () => {
      expect(getFunc('ISERROR').execute(['#N/A'], ctx)).toBe(true);
    });

    it('should return true for #DIV/0!', () => {
      expect(getFunc('ISERROR').execute(['#DIV/0!'], ctx)).toBe(true);
    });

    it('should return true for #NUM!', () => {
      expect(getFunc('ISERROR').execute(['#NUM!'], ctx)).toBe(true);
    });

    it('should return false for a regular string', () => {
      expect(getFunc('ISERROR').execute(['hello'], ctx)).toBe(false);
    });

    it('should return false for a number', () => {
      expect(getFunc('ISERROR').execute([42], ctx)).toBe(false);
    });

    it('should return false for null', () => {
      expect(getFunc('ISERROR').execute([null], ctx)).toBe(false);
    });
  });

  describe('ISNA', () => {
    it('should return true for #N/A', () => {
      expect(getFunc('ISNA').execute(['#N/A'], ctx)).toBe(true);
    });

    it('should return false for other error types', () => {
      expect(getFunc('ISNA').execute(['#VALUE!'], ctx)).toBe(false);
      expect(getFunc('ISNA').execute(['#REF!'], ctx)).toBe(false);
      expect(getFunc('ISNA').execute(['#DIV/0!'], ctx)).toBe(false);
    });

    it('should return false for a number', () => {
      expect(getFunc('ISNA').execute([0], ctx)).toBe(false);
    });

    it('should return false for a regular string', () => {
      expect(getFunc('ISNA').execute(['hello'], ctx)).toBe(false);
    });
  });

  describe('TYPE', () => {
    it('should return 1 for a number', () => {
      expect(getFunc('TYPE').execute([42], ctx)).toBe(1);
    });

    it('should return 2 for a text string', () => {
      expect(getFunc('TYPE').execute(['hello'], ctx)).toBe(2);
    });

    it('should return 4 for a boolean', () => {
      expect(getFunc('TYPE').execute([true], ctx)).toBe(4);
      expect(getFunc('TYPE').execute([false], ctx)).toBe(4);
    });

    it('should return 16 for an error value', () => {
      expect(getFunc('TYPE').execute(['#VALUE!'], ctx)).toBe(16);
      expect(getFunc('TYPE').execute(['#N/A'], ctx)).toBe(16);
      expect(getFunc('TYPE').execute(['#REF!'], ctx)).toBe(16);
    });

    it('should return 64 for an array', () => {
      expect(getFunc('TYPE').execute([[1, 2, 3]], ctx)).toBe(64);
    });

    it('should return 1 for null (empty cell)', () => {
      expect(getFunc('TYPE').execute([null], ctx)).toBe(1);
    });
  });
});
