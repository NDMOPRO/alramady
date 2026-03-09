import { logicalFunctions } from '../../../services/formula-functions/logical.functions.js';
import type { FormulaContext } from '../../../types/formula.types.js';

const ctx: FormulaContext = { cellValues: new Map() };
const getFunc = (name: string) => logicalFunctions.find(f => f.name === name)!;

// ---------------------------------------------------------------------------
// AND
// ---------------------------------------------------------------------------
describe('AND', () => {
  const fn = getFunc('AND');

  it('should return true when all arguments are truthy', () => {
    expect(fn.execute([true, 1, 'yes'], ctx)).toBe(true);
  });

  it('should return false when any argument is falsy', () => {
    expect(fn.execute([true, false, true], ctx)).toBe(false);
  });

  it('should return true for a single truthy argument', () => {
    expect(fn.execute([true], ctx)).toBe(true);
  });

  it('should return false for a single falsy argument', () => {
    expect(fn.execute([false], ctx)).toBe(false);
  });

  it('should flatten array arguments', () => {
    expect(fn.execute([[true, true], true], ctx)).toBe(true);
    expect(fn.execute([[true, false], true], ctx)).toBe(false);
  });

  it('should treat 0 as false', () => {
    expect(fn.execute([1, 0, 1], ctx)).toBe(false);
  });

  it('should treat empty string as false', () => {
    expect(fn.execute([true, ''], ctx)).toBe(false);
  });

  it('should treat null as false', () => {
    expect(fn.execute([true, null], ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OR
// ---------------------------------------------------------------------------
describe('OR', () => {
  const fn = getFunc('OR');

  it('should return true when any argument is truthy', () => {
    expect(fn.execute([false, false, true], ctx)).toBe(true);
  });

  it('should return false when all arguments are falsy', () => {
    expect(fn.execute([false, 0, '', null], ctx)).toBe(false);
  });

  it('should return true for a single truthy argument', () => {
    expect(fn.execute([1], ctx)).toBe(true);
  });

  it('should return false for a single falsy argument', () => {
    expect(fn.execute([0], ctx)).toBe(false);
  });

  it('should flatten array arguments', () => {
    expect(fn.execute([[false, true], false], ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NOT
// ---------------------------------------------------------------------------
describe('NOT', () => {
  const fn = getFunc('NOT');

  it('should return false for truthy value', () => {
    expect(fn.execute([true], ctx)).toBe(false);
  });

  it('should return true for falsy value', () => {
    expect(fn.execute([false], ctx)).toBe(true);
  });

  it('should return true for 0', () => {
    expect(fn.execute([0], ctx)).toBe(true);
  });

  it('should return false for non-zero number', () => {
    expect(fn.execute([42], ctx)).toBe(false);
  });

  it('should return true for empty string', () => {
    expect(fn.execute([''], ctx)).toBe(true);
  });

  it('should return true for null', () => {
    expect(fn.execute([null], ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// XOR
// ---------------------------------------------------------------------------
describe('XOR', () => {
  const fn = getFunc('XOR');

  it('should return true when odd number of arguments are true', () => {
    expect(fn.execute([true, false, false], ctx)).toBe(true);
  });

  it('should return false when even number of arguments are true', () => {
    expect(fn.execute([true, true], ctx)).toBe(false);
  });

  it('should return true for a single true value', () => {
    expect(fn.execute([true], ctx)).toBe(true);
  });

  it('should return false for a single false value', () => {
    expect(fn.execute([false], ctx)).toBe(false);
  });

  it('should return true for three true values (odd)', () => {
    expect(fn.execute([true, true, true], ctx)).toBe(true);
  });

  it('should flatten array arguments', () => {
    expect(fn.execute([[true, false], true], ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// IFERROR
// ---------------------------------------------------------------------------
describe('IFERROR', () => {
  const fn = getFunc('IFERROR');

  it('should return the alt value when input is an error', () => {
    expect(fn.execute(['#VALUE!', 'fallback'], ctx)).toBe('fallback');
  });

  it('should return the alt value for #DIV/0!', () => {
    expect(fn.execute(['#DIV/0!', 0], ctx)).toBe(0);
  });

  it('should return the alt value for #N/A', () => {
    expect(fn.execute(['#N/A', 'not found'], ctx)).toBe('not found');
  });

  it('should return the original value when it is not an error', () => {
    expect(fn.execute([42, 'fallback'], ctx)).toBe(42);
  });

  it('should return the original value for a normal string', () => {
    expect(fn.execute(['hello', 'fallback'], ctx)).toBe('hello');
  });

  it('should return the original value for boolean', () => {
    expect(fn.execute([true, 'fallback'], ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// IFNA
// ---------------------------------------------------------------------------
describe('IFNA', () => {
  const fn = getFunc('IFNA');

  it('should return the alt value when input is #N/A', () => {
    expect(fn.execute(['#N/A', 'fallback'], ctx)).toBe('fallback');
  });

  it('should return the original value when it is not #N/A', () => {
    expect(fn.execute([42, 'fallback'], ctx)).toBe(42);
  });

  it('should NOT catch other error types', () => {
    expect(fn.execute(['#VALUE!', 'fallback'], ctx)).toBe('#VALUE!');
  });

  it('should NOT catch #REF! errors', () => {
    expect(fn.execute(['#REF!', 'fallback'], ctx)).toBe('#REF!');
  });

  it('should return normal string values as-is', () => {
    expect(fn.execute(['hello', 'fallback'], ctx)).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// IFS
// ---------------------------------------------------------------------------
describe('IFS', () => {
  const fn = getFunc('IFS');

  it('should return the value for the first true condition', () => {
    expect(fn.execute([false, 'A', true, 'B', true, 'C'], ctx)).toBe('B');
  });

  it('should return the value when only condition is true', () => {
    expect(fn.execute([true, 'only'], ctx)).toBe('only');
  });

  it('should return #N/A when no condition is true', () => {
    expect(fn.execute([false, 'A', false, 'B'], ctx)).toBe('#N/A');
  });

  it('should return #VALUE! for odd number of arguments', () => {
    expect(fn.execute([true, 'A', false], ctx)).toBe('#VALUE!');
  });

  it('should evaluate conditions in order and return first match', () => {
    expect(fn.execute([true, 'first', true, 'second'], ctx)).toBe('first');
  });
});

// ---------------------------------------------------------------------------
// SWITCH
// ---------------------------------------------------------------------------
describe('SWITCH', () => {
  const fn = getFunc('SWITCH');

  it('should return the result matching the expression', () => {
    expect(fn.execute([2, 1, 'one', 2, 'two', 3, 'three'], ctx)).toBe('two');
  });

  it('should return the default value when no match is found', () => {
    expect(fn.execute([99, 1, 'one', 2, 'two', 'default'], ctx)).toBe('default');
  });

  it('should return #N/A when no match and no default', () => {
    expect(fn.execute([99, 1, 'one', 2, 'two'], ctx)).toBe('#N/A');
  });

  it('should match the first matching value', () => {
    expect(fn.execute(['A', 'A', 'first', 'A', 'second'], ctx)).toBe('first');
  });

  it('should handle numeric expression matching', () => {
    expect(fn.execute([1, 1, 100, 2, 200], ctx)).toBe(100);
  });

  it('should handle string expression matching', () => {
    expect(fn.execute(['cat', 'dog', 'woof', 'cat', 'meow'], ctx)).toBe('meow');
  });
});

// ---------------------------------------------------------------------------
// IF
// ---------------------------------------------------------------------------
describe('IF', () => {
  const fn = getFunc('IF');

  it('should return trueValue when condition is true', () => {
    expect(fn.execute([true, 'yes', 'no'], ctx)).toBe('yes');
  });

  it('should return falseValue when condition is false', () => {
    expect(fn.execute([false, 'yes', 'no'], ctx)).toBe('no');
  });

  it('should return false as default falseValue when omitted', () => {
    expect(fn.execute([false, 'yes'], ctx)).toBe(false);
  });

  it('should treat 1 as true', () => {
    expect(fn.execute([1, 'yes', 'no'], ctx)).toBe('yes');
  });

  it('should treat 0 as false', () => {
    expect(fn.execute([0, 'yes', 'no'], ctx)).toBe('no');
  });

  it('should treat non-empty string as true', () => {
    expect(fn.execute(['text', 'yes', 'no'], ctx)).toBe('yes');
  });

  it('should treat empty string as false', () => {
    expect(fn.execute(['', 'yes', 'no'], ctx)).toBe('no');
  });

  it('should treat null as false', () => {
    expect(fn.execute([null, 'yes', 'no'], ctx)).toBe('no');
  });
});

// ---------------------------------------------------------------------------
// COUNTIF
// ---------------------------------------------------------------------------
describe('COUNTIF', () => {
  const fn = getFunc('COUNTIF');

  it('should count cells matching a numeric criteria', () => {
    expect(fn.execute([[1, 2, 3, 2, 2], '2'], ctx)).toBe(3);
  });

  it('should count cells matching a text criteria', () => {
    expect(fn.execute([['apple', 'banana', 'apple', 'cherry'], 'apple'], ctx)).toBe(2);
  });

  it('should support greater-than operator', () => {
    expect(fn.execute([[1, 2, 3, 4, 5], '>3'], ctx)).toBe(2);
  });

  it('should support less-than operator', () => {
    expect(fn.execute([[1, 2, 3, 4, 5], '<3'], ctx)).toBe(2);
  });

  it('should support greater-than-or-equal operator', () => {
    expect(fn.execute([[1, 2, 3, 4, 5], '>=3'], ctx)).toBe(3);
  });

  it('should support less-than-or-equal operator', () => {
    expect(fn.execute([[1, 2, 3, 4, 5], '<=3'], ctx)).toBe(3);
  });

  it('should support not-equal operator', () => {
    expect(fn.execute([[1, 2, 3, 2, 1], '<>2'], ctx)).toBe(3);
  });

  it('should support wildcard * in criteria', () => {
    expect(fn.execute([['apple', 'apricot', 'banana'], 'ap*'], ctx)).toBe(2);
  });

  it('should support wildcard ? in criteria', () => {
    expect(fn.execute([['cat', 'car', 'cot'], 'c?t'], ctx)).toBe(2);
  });

  it('should return 0 when no cells match', () => {
    expect(fn.execute([[1, 2, 3], '99'], ctx)).toBe(0);
  });

  it('should handle a single value (non-array) as range', () => {
    expect(fn.execute([5, '5'], ctx)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SUMIF
// ---------------------------------------------------------------------------
describe('SUMIF', () => {
  const fn = getFunc('SUMIF');

  it('should sum values matching numeric criteria', () => {
    expect(fn.execute([[1, 2, 3, 4, 5], '>3'], ctx)).toBe(9);
  });

  it('should sum from a separate sum_range', () => {
    expect(fn.execute([['A', 'B', 'A', 'B'], 'A', [10, 20, 30, 40]], ctx)).toBe(40);
  });

  it('should sum the criteria range itself when sum_range is omitted', () => {
    expect(fn.execute([[10, 20, 30, 40, 50], '>=30'], ctx)).toBe(120);
  });

  it('should return 0 when no cells match', () => {
    expect(fn.execute([[1, 2, 3], '>100'], ctx)).toBe(0);
  });

  it('should support not-equal operator', () => {
    expect(fn.execute([[1, 2, 3, 4, 5], '<>3'], ctx)).toBe(12);
  });

  it('should support equality operator', () => {
    expect(fn.execute([[10, 20, 10, 30], '=10'], ctx)).toBe(20);
  });

  it('should handle a single value (non-array) as range', () => {
    expect(fn.execute([5, '5'], ctx)).toBe(5);
  });

  it('should skip non-numeric sum values', () => {
    expect(fn.execute([['A', 'B', 'A'], 'A', [10, 'text', 30]], ctx)).toBe(40);
  });

  it('should support wildcard text criteria with separate sum_range', () => {
    expect(fn.execute([['apple', 'banana', 'apricot'], 'ap*', [10, 20, 30]], ctx)).toBe(40);
  });
});
