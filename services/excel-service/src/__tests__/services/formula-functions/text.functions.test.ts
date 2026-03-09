import { textFunctions } from '../../../services/formula-functions/text.functions.js';
import type { FormulaContext } from '../../../types/formula.types.js';

const ctx: FormulaContext = { cellValues: new Map() };
const getFunc = (name: string) => textFunctions.find(f => f.name === name)!;

// ---------------------------------------------------------------------------
// CONCATENATE
// ---------------------------------------------------------------------------
describe('CONCATENATE', () => {
  const fn = getFunc('CONCATENATE');

  it('should join multiple strings', () => {
    expect(fn.execute(['Hello', ' ', 'World'], ctx)).toBe('Hello World');
  });

  it('should handle a single argument', () => {
    expect(fn.execute(['Only'], ctx)).toBe('Only');
  });

  it('should convert numbers to strings', () => {
    expect(fn.execute(['Value: ', 42], ctx)).toBe('Value: 42');
  });

  it('should handle null and undefined as empty strings', () => {
    expect(fn.execute(['A', null, 'B'], ctx)).toBe('AB');
  });

  it('should flatten array arguments', () => {
    expect(fn.execute([['A', 'B'], 'C'], ctx)).toBe('ABC');
  });

  it('should propagate errors', () => {
    expect(fn.execute(['Hello', '#VALUE!'], ctx)).toBe('#VALUE!');
  });
});

// ---------------------------------------------------------------------------
// TEXTJOIN
// ---------------------------------------------------------------------------
describe('TEXTJOIN', () => {
  const fn = getFunc('TEXTJOIN');

  it('should join text with a delimiter', () => {
    expect(fn.execute([', ', false, 'A', 'B', 'C'], ctx)).toBe('A, B, C');
  });

  it('should ignore empty cells when flag is true', () => {
    expect(fn.execute(['-', true, 'A', '', 'B', '', 'C'], ctx)).toBe('A-B-C');
  });

  it('should keep empty cells when flag is false', () => {
    expect(fn.execute(['-', false, 'A', '', 'B'], ctx)).toBe('A--B');
  });

  it('should flatten nested arrays', () => {
    expect(fn.execute([',', false, ['X', 'Y'], 'Z'], ctx)).toBe('X,Y,Z');
  });

  it('should propagate errors from values', () => {
    expect(fn.execute([',', false, 'A', '#REF!'], ctx)).toBe('#REF!');
  });
});

// ---------------------------------------------------------------------------
// LEFT
// ---------------------------------------------------------------------------
describe('LEFT', () => {
  const fn = getFunc('LEFT');

  it('should return one character by default', () => {
    expect(fn.execute(['Hello'], ctx)).toBe('H');
  });

  it('should return the specified number of leftmost characters', () => {
    expect(fn.execute(['Hello', 3], ctx)).toBe('Hel');
  });

  it('should return empty string when numChars is 0', () => {
    expect(fn.execute(['Hello', 0], ctx)).toBe('');
  });

  it('should return #VALUE! for negative numChars', () => {
    expect(fn.execute(['Hello', -1], ctx)).toBe('#VALUE!');
  });

  it('should handle numChars larger than text length', () => {
    expect(fn.execute(['Hi', 10], ctx)).toBe('Hi');
  });
});

// ---------------------------------------------------------------------------
// RIGHT
// ---------------------------------------------------------------------------
describe('RIGHT', () => {
  const fn = getFunc('RIGHT');

  it('should return one character by default', () => {
    expect(fn.execute(['Hello'], ctx)).toBe('o');
  });

  it('should return the specified number of rightmost characters', () => {
    expect(fn.execute(['Hello', 3], ctx)).toBe('llo');
  });

  it('should return empty string when numChars is 0', () => {
    expect(fn.execute(['Hello', 0], ctx)).toBe('');
  });

  it('should return #VALUE! for negative numChars', () => {
    expect(fn.execute(['Hello', -1], ctx)).toBe('#VALUE!');
  });

  it('should handle numChars larger than text length', () => {
    expect(fn.execute(['Hi', 10], ctx)).toBe('Hi');
  });
});

// ---------------------------------------------------------------------------
// MID
// ---------------------------------------------------------------------------
describe('MID', () => {
  const fn = getFunc('MID');

  it('should extract characters from the middle (1-based)', () => {
    expect(fn.execute(['Hello World', 7, 5], ctx)).toBe('World');
  });

  it('should extract from start position 1', () => {
    expect(fn.execute(['ABCDEF', 1, 3], ctx)).toBe('ABC');
  });

  it('should return #VALUE! when startNum is less than 1', () => {
    expect(fn.execute(['Hello', 0, 3], ctx)).toBe('#VALUE!');
  });

  it('should return #VALUE! when numChars is negative', () => {
    expect(fn.execute(['Hello', 1, -1], ctx)).toBe('#VALUE!');
  });

  it('should handle numChars exceeding remaining length', () => {
    expect(fn.execute(['Hi', 1, 100], ctx)).toBe('Hi');
  });
});

// ---------------------------------------------------------------------------
// LEN
// ---------------------------------------------------------------------------
describe('LEN', () => {
  const fn = getFunc('LEN');

  it('should return the length of a string', () => {
    expect(fn.execute(['Hello'], ctx)).toBe(5);
  });

  it('should return 0 for an empty string', () => {
    expect(fn.execute([''], ctx)).toBe(0);
  });

  it('should convert numbers to strings before measuring', () => {
    expect(fn.execute([12345], ctx)).toBe(5);
  });

  it('should treat null as empty string', () => {
    expect(fn.execute([null], ctx)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FIND
// ---------------------------------------------------------------------------
describe('FIND', () => {
  const fn = getFunc('FIND');

  it('should find substring position (1-based, case-sensitive)', () => {
    expect(fn.execute(['World', 'Hello World'], ctx)).toBe(7);
  });

  it('should be case-sensitive', () => {
    expect(fn.execute(['world', 'Hello World'], ctx)).toBe('#VALUE!');
  });

  it('should support a start position', () => {
    // FIND('l','Hello World',5): start at pos 5 ('o'), next 'l' at pos 10
    expect(fn.execute(['l', 'Hello World', 5], ctx)).toBe(10);
  });

  it('should return #VALUE! when text is not found', () => {
    expect(fn.execute(['xyz', 'Hello'], ctx)).toBe('#VALUE!');
  });

  it('should return #VALUE! when startNum is less than 1', () => {
    expect(fn.execute(['H', 'Hello', 0], ctx)).toBe('#VALUE!');
  });

  it('should find empty string at start position', () => {
    expect(fn.execute(['', 'Hello'], ctx)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SEARCH
// ---------------------------------------------------------------------------
describe('SEARCH', () => {
  const fn = getFunc('SEARCH');

  it('should find substring position case-insensitively', () => {
    expect(fn.execute(['world', 'Hello World'], ctx)).toBe(7);
  });

  it('should support wildcard * (any characters)', () => {
    expect(fn.execute(['H*d', 'Hello World'], ctx)).toBe(1);
  });

  it('should support wildcard ? (single character)', () => {
    expect(fn.execute(['W?rld', 'Hello World'], ctx)).toBe(7);
  });

  it('should support a start position', () => {
    // SEARCH('l','Hello World',5): start at pos 5, next 'l' at pos 10
    expect(fn.execute(['l', 'Hello World', 5], ctx)).toBe(10);
  });

  it('should return #VALUE! when not found', () => {
    expect(fn.execute(['xyz', 'Hello'], ctx)).toBe('#VALUE!');
  });

  it('should return #VALUE! when startNum is less than 1', () => {
    expect(fn.execute(['H', 'Hello', 0], ctx)).toBe('#VALUE!');
  });
});

// ---------------------------------------------------------------------------
// SUBSTITUTE
// ---------------------------------------------------------------------------
describe('SUBSTITUTE', () => {
  const fn = getFunc('SUBSTITUTE');

  it('should replace all occurrences by default', () => {
    expect(fn.execute(['aaa', 'a', 'b'], ctx)).toBe('bbb');
  });

  it('should replace only the nth occurrence when instance is specified', () => {
    expect(fn.execute(['aaa', 'a', 'b', 2], ctx)).toBe('aba');
  });

  it('should return original text when instance exceeds occurrence count', () => {
    expect(fn.execute(['ab', 'a', 'x', 5], ctx)).toBe('ab');
  });

  it('should return original text when oldText is empty and replacing all', () => {
    expect(fn.execute(['Hello', '', 'x'], ctx)).toBe('Hello');
  });

  it('should return #VALUE! for negative instance number', () => {
    expect(fn.execute(['Hello', 'l', 'r', -1], ctx)).toBe('#VALUE!');
  });

  it('should handle no match gracefully', () => {
    expect(fn.execute(['Hello', 'xyz', 'abc'], ctx)).toBe('Hello');
  });
});

// ---------------------------------------------------------------------------
// REPLACE
// ---------------------------------------------------------------------------
describe('REPLACE', () => {
  const fn = getFunc('REPLACE');

  it('should replace characters by position (1-based)', () => {
    expect(fn.execute(['Hello World', 7, 5, 'There'], ctx)).toBe('Hello There');
  });

  it('should insert text when numChars is 0', () => {
    expect(fn.execute(['AB', 2, 0, 'X'], ctx)).toBe('AXB');
  });

  it('should return #VALUE! when startNum is less than 1', () => {
    expect(fn.execute(['Hello', 0, 2, 'X'], ctx)).toBe('#VALUE!');
  });

  it('should return #VALUE! when numChars is negative', () => {
    expect(fn.execute(['Hello', 1, -1, 'X'], ctx)).toBe('#VALUE!');
  });

  it('should handle replacement at the very start', () => {
    expect(fn.execute(['Hello', 1, 5, 'Bye'], ctx)).toBe('Bye');
  });
});

// ---------------------------------------------------------------------------
// TRIM
// ---------------------------------------------------------------------------
describe('TRIM', () => {
  const fn = getFunc('TRIM');

  it('should remove leading and trailing spaces', () => {
    expect(fn.execute(['  Hello  '], ctx)).toBe('Hello');
  });

  it('should collapse multiple internal spaces to one', () => {
    expect(fn.execute(['Hello    World'], ctx)).toBe('Hello World');
  });

  it('should handle already-trimmed text', () => {
    expect(fn.execute(['Clean'], ctx)).toBe('Clean');
  });

  it('should return empty string for whitespace-only input', () => {
    expect(fn.execute(['     '], ctx)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// CLEAN
// ---------------------------------------------------------------------------
describe('CLEAN', () => {
  const fn = getFunc('CLEAN');

  it('should remove non-printable characters (codes 0-31)', () => {
    const input = 'Hello\x00\x01\x1FWorld';
    expect(fn.execute([input], ctx)).toBe('HelloWorld');
  });

  it('should leave printable characters intact', () => {
    expect(fn.execute(['Normal text!'], ctx)).toBe('Normal text!');
  });

  it('should handle empty string', () => {
    expect(fn.execute([''], ctx)).toBe('');
  });

  it('should remove tab and newline characters', () => {
    expect(fn.execute(['A\tB\nC'], ctx)).toBe('ABC');
  });
});

// ---------------------------------------------------------------------------
// UPPER
// ---------------------------------------------------------------------------
describe('UPPER', () => {
  const fn = getFunc('UPPER');

  it('should convert text to uppercase', () => {
    expect(fn.execute(['hello'], ctx)).toBe('HELLO');
  });

  it('should leave already uppercase text unchanged', () => {
    expect(fn.execute(['HELLO'], ctx)).toBe('HELLO');
  });

  it('should handle mixed case', () => {
    expect(fn.execute(['Hello World'], ctx)).toBe('HELLO WORLD');
  });

  it('should convert number to string then uppercase', () => {
    expect(fn.execute([123], ctx)).toBe('123');
  });
});

// ---------------------------------------------------------------------------
// LOWER
// ---------------------------------------------------------------------------
describe('LOWER', () => {
  const fn = getFunc('LOWER');

  it('should convert text to lowercase', () => {
    expect(fn.execute(['HELLO'], ctx)).toBe('hello');
  });

  it('should leave already lowercase text unchanged', () => {
    expect(fn.execute(['hello'], ctx)).toBe('hello');
  });

  it('should handle mixed case', () => {
    expect(fn.execute(['Hello World'], ctx)).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// PROPER
// ---------------------------------------------------------------------------
describe('PROPER', () => {
  const fn = getFunc('PROPER');

  it('should capitalize the first letter of each word', () => {
    expect(fn.execute(['hello world'], ctx)).toBe('Hello World');
  });

  it('should lowercase the remaining letters of each word', () => {
    expect(fn.execute(['HELLO WORLD'], ctx)).toBe('Hello World');
  });

  it('should handle single word', () => {
    expect(fn.execute(['hello'], ctx)).toBe('Hello');
  });

  it('should handle mixed casing', () => {
    expect(fn.execute(['hELLO wORLD'], ctx)).toBe('Hello World');
  });
});

// ---------------------------------------------------------------------------
// TEXT
// ---------------------------------------------------------------------------
describe('TEXT', () => {
  const fn = getFunc('TEXT');

  it('should format a number with fixed decimals', () => {
    expect(fn.execute([1234.5, '0.00'], ctx)).toBe('1234.50');
  });

  it('should format with thousands separator', () => {
    expect(fn.execute([1234567, '#,##0'], ctx)).toBe('1,234,567');
  });

  it('should format with thousands separator and decimals', () => {
    expect(fn.execute([1234.5, '#,##0.00'], ctx)).toBe('1,234.50');
  });

  it('should format as percentage', () => {
    expect(fn.execute([0.75, '0%'], ctx)).toBe('75%');
  });

  it('should format as percentage with decimals', () => {
    expect(fn.execute([0.1234, '0.00%'], ctx)).toBe('12.34%');
  });

  it('should handle negative numbers', () => {
    expect(fn.execute([-1234.5, '#,##0.00'], ctx)).toBe('-1,234.50');
  });

  it('should return #VALUE! for non-numeric input', () => {
    expect(fn.execute(['abc', '0.00'], ctx)).toBe('#VALUE!');
  });

  it('should format integer with no decimals', () => {
    expect(fn.execute([42, '0'], ctx)).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// VALUE
// ---------------------------------------------------------------------------
describe('VALUE', () => {
  const fn = getFunc('VALUE');

  it('should convert a numeric string to a number', () => {
    expect(fn.execute(['123.45'], ctx)).toBe(123.45);
  });

  it('should handle thousands separators', () => {
    expect(fn.execute(['1,234,567'], ctx)).toBe(1234567);
  });

  it('should handle percentages', () => {
    expect(fn.execute(['75%'], ctx)).toBe(0.75);
  });

  it('should return 0 for empty string', () => {
    expect(fn.execute([''], ctx)).toBe(0);
  });

  it('should return #VALUE! for non-numeric text', () => {
    expect(fn.execute(['abc'], ctx)).toBe('#VALUE!');
  });

  it('should trim whitespace before parsing', () => {
    expect(fn.execute(['  42  '], ctx)).toBe(42);
  });

  it('should handle negative numbers', () => {
    expect(fn.execute(['-100'], ctx)).toBe(-100);
  });
});

// ---------------------------------------------------------------------------
// REPT
// ---------------------------------------------------------------------------
describe('REPT', () => {
  const fn = getFunc('REPT');

  it('should repeat text the specified number of times', () => {
    expect(fn.execute(['Ab', 3], ctx)).toBe('AbAbAb');
  });

  it('should return empty string when times is 0', () => {
    expect(fn.execute(['X', 0], ctx)).toBe('');
  });

  it('should return #VALUE! for negative times', () => {
    expect(fn.execute(['X', -1], ctx)).toBe('#VALUE!');
  });

  it('should floor fractional repeat count', () => {
    expect(fn.execute(['X', 2.9], ctx)).toBe('XX');
  });

  it('should handle single repetition', () => {
    expect(fn.execute(['Hello', 1], ctx)).toBe('Hello');
  });
});

// ---------------------------------------------------------------------------
// EXACT
// ---------------------------------------------------------------------------
describe('EXACT', () => {
  const fn = getFunc('EXACT');

  it('should return true for identical strings', () => {
    expect(fn.execute(['Hello', 'Hello'], ctx)).toBe(true);
  });

  it('should return false for case differences', () => {
    expect(fn.execute(['Hello', 'hello'], ctx)).toBe(false);
  });

  it('should return false for different strings', () => {
    expect(fn.execute(['ABC', 'XYZ'], ctx)).toBe(false);
  });

  it('should return true for two empty strings', () => {
    expect(fn.execute(['', ''], ctx)).toBe(true);
  });

  it('should compare number converted to string', () => {
    expect(fn.execute([123, '123'], ctx)).toBe(true);
  });
});
