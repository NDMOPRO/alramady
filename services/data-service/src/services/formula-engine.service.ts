import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────

type FormulaValue = string | number | boolean | null | Date;

interface FormulaResult {
  value: FormulaValue;
  type: 'number' | 'string' | 'boolean' | 'date' | 'null' | 'error';
  error?: string;
}

interface DerivedColumnResult {
  datasetId: string;
  columnName: string;
  formula: string;
  computedCount: number;
  errorCount: number;
  errors: Array<{ rowIndex: number; error: string }>;
}

interface BatchFormulaInput {
  formula: string;
  rowIndex: number;
}

interface BatchFormulaResult {
  results: Array<{
    rowIndex: number;
    value: FormulaValue;
    error?: string;
  }>;
  totalComputed: number;
  totalErrors: number;
}

// ─── Token types for formula parsing ───────────────────────────────

type FTokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'FUNCTION'
  | 'CELL_REF'
  | 'OPERATOR'
  | 'COMPARISON'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'COLON'
  | 'EOF';

interface FToken {
  type: FTokenType;
  value: string;
  position: number;
}

// ─── Formula Tokenizer ─────────────────────────────────────────────

const FORMULA_FUNCTIONS = new Set([
  'SUM', 'AVERAGE', 'COUNT', 'COUNTA', 'COUNTBLANK', 'IF', 'IFS', 'SWITCH',
  'VLOOKUP', 'INDEX', 'MATCH', 'CONCATENATE', 'CONCAT',
  'LEFT', 'RIGHT', 'MID', 'LEN', 'TRIM', 'UPPER', 'LOWER', 'PROPER',
  'SUBSTITUTE', 'REPLACE', 'FIND', 'SEARCH', 'TEXT', 'VALUE',
  'NOW', 'TODAY', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND',
  'DATEDIF', 'DATE', 'DATEVALUE',
  'AND', 'OR', 'NOT', 'TRUE', 'FALSE',
  'ABS', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'CEILING', 'FLOOR',
  'POWER', 'SQRT', 'LOG', 'LOG10', 'EXP', 'MOD',
  'MAX', 'MIN', 'MEDIAN', 'MODE', 'STDEV', 'VAR',
  'IFERROR', 'ISBLANK', 'ISNUMBER', 'ISTEXT',
]);

function tokenizeFormula(formula: string): FToken[] {
  const tokens: FToken[] = [];
  let pos = 0;
  const input = formula.startsWith('=') ? formula.substring(1) : formula;

  while (pos < input.length) {
    if (/\s/.test(input[pos])) {
      pos++;
      continue;
    }

    // String literals
    if (input[pos] === '"') {
      const start = pos;
      pos++;
      let value = '';
      while (pos < input.length) {
        if (input[pos] === '"' && input[pos + 1] === '"') {
          value += '"';
          pos += 2;
        } else if (input[pos] === '"') {
          pos++;
          break;
        } else {
          value += input[pos];
          pos++;
        }
      }
      tokens.push({ type: 'STRING', value, position: start });
      continue;
    }

    // Numbers
    if (/\d/.test(input[pos]) || (input[pos] === '.' && pos + 1 < input.length && /\d/.test(input[pos + 1]))) {
      const start = pos;
      let numStr = '';
      while (pos < input.length && (/\d/.test(input[pos]) || input[pos] === '.')) {
        numStr += input[pos];
        pos++;
      }
      // Check for percentage
      if (pos < input.length && input[pos] === '%') {
        tokens.push({ type: 'NUMBER', value: String(parseFloat(numStr) / 100), position: start });
        pos++;
      } else {
        tokens.push({ type: 'NUMBER', value: numStr, position: start });
      }
      continue;
    }

    // Identifiers (function names, cell references, column names)
    if (/[a-zA-Z_\u0600-\u06FF]/.test(input[pos])) {
      const start = pos;
      let ident = '';
      while (pos < input.length && /[a-zA-Z0-9_.\u0600-\u06FF]/.test(input[pos])) {
        ident += input[pos];
        pos++;
      }
      const upper = ident.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'BOOLEAN', value: upper, position: start });
      } else if (FORMULA_FUNCTIONS.has(upper)) {
        tokens.push({ type: 'FUNCTION', value: upper, position: start });
      } else {
        tokens.push({ type: 'CELL_REF', value: ident, position: start });
      }
      continue;
    }

    // Bracket column references [Column Name]
    if (input[pos] === '[') {
      const start = pos;
      pos++;
      let ref = '';
      while (pos < input.length && input[pos] !== ']') {
        ref += input[pos];
        pos++;
      }
      if (pos < input.length) pos++;
      tokens.push({ type: 'CELL_REF', value: ref, position: start });
      continue;
    }

    // Comparison operators (must check before single-char operators)
    const twoChar = input.substring(pos, pos + 2);
    if (['<=', '>=', '<>', '!='].includes(twoChar)) {
      tokens.push({ type: 'COMPARISON', value: twoChar === '!=' ? '<>' : twoChar, position: pos });
      pos += 2;
      continue;
    }

    if (input[pos] === '=' || input[pos] === '<' || input[pos] === '>') {
      tokens.push({ type: 'COMPARISON', value: input[pos], position: pos });
      pos++;
      continue;
    }

    // Arithmetic operators
    if (['+', '-', '*', '/', '^', '&'].includes(input[pos])) {
      tokens.push({ type: 'OPERATOR', value: input[pos], position: pos });
      pos++;
      continue;
    }

    // Punctuation
    if (input[pos] === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position: pos });
      pos++;
      continue;
    }
    if (input[pos] === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position: pos });
      pos++;
      continue;
    }
    if (input[pos] === ',') {
      tokens.push({ type: 'COMMA', value: ',', position: pos });
      pos++;
      continue;
    }
    if (input[pos] === ':') {
      tokens.push({ type: 'COLON', value: ':', position: pos });
      pos++;
      continue;
    }

    pos++;
  }

  tokens.push({ type: 'EOF', value: '', position: pos });
  return tokens;
}

// ─── Formula Evaluator (Recursive Descent) ─────────────────────────

class FormulaEvaluator {
  private tokens: FToken[];
  private pos: number;
  private row: Record<string, unknown>;
  private allData: Record<string, unknown>[];
  private rowIndex: number;

  constructor(
    tokens: FToken[],
    row: Record<string, unknown>,
    allData: Record<string, unknown>[],
    rowIndex: number
  ) {
    this.tokens = tokens;
    this.pos = 0;
    this.row = row;
    this.allData = allData;
    this.rowIndex = rowIndex;
  }

  evaluate(): FormulaValue {
    const result = this.parseExpression();
    return result;
  }

  private current(): FToken {
    return this.tokens[this.pos] || { type: 'EOF', value: '', position: -1 };
  }

  private advance(): FToken {
    const tok = this.current();
    this.pos++;
    return tok;
  }

  private parseExpression(): FormulaValue {
    return this.parseComparison();
  }

  private parseComparison(): FormulaValue {
    let left = this.parseConcatenation();

    while (this.current().type === 'COMPARISON') {
      const op = this.advance().value;
      const right = this.parseConcatenation();
      left = this.doComparison(left, op, right);
    }

    return left;
  }

  private parseConcatenation(): FormulaValue {
    let left = this.parseAddition();

    while (this.current().type === 'OPERATOR' && this.current().value === '&') {
      this.advance();
      const right = this.parseAddition();
      left = String(left ?? '') + String(right ?? '');
    }

    return left;
  }

  private parseAddition(): FormulaValue {
    let left = this.parseMultiplication();

    while (this.current().type === 'OPERATOR' && (this.current().value === '+' || this.current().value === '-')) {
      const op = this.advance().value;
      const right = this.parseMultiplication();
      const numLeft = this.toNumber(left);
      const numRight = this.toNumber(right);
      left = op === '+' ? numLeft + numRight : numLeft - numRight;
    }

    return left;
  }

  private parseMultiplication(): FormulaValue {
    let left = this.parsePower();

    while (this.current().type === 'OPERATOR' && (this.current().value === '*' || this.current().value === '/')) {
      const op = this.advance().value;
      const right = this.parsePower();
      const numLeft = this.toNumber(left);
      const numRight = this.toNumber(right);
      if (op === '/' && numRight === 0) {
        throw new Error('#DIV/0!');
      }
      left = op === '*' ? numLeft * numRight : numLeft / numRight;
    }

    return left;
  }

  private parsePower(): FormulaValue {
    let base = this.parseUnary();

    while (this.current().type === 'OPERATOR' && this.current().value === '^') {
      this.advance();
      const exp = this.parseUnary();
      base = Math.pow(this.toNumber(base), this.toNumber(exp));
    }

    return base;
  }

  private parseUnary(): FormulaValue {
    if (this.current().type === 'OPERATOR' && this.current().value === '-') {
      this.advance();
      return -this.toNumber(this.parsePrimary());
    }
    if (this.current().type === 'OPERATOR' && this.current().value === '+') {
      this.advance();
      return this.toNumber(this.parsePrimary());
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaValue {
    const tok = this.current();

    // Number
    if (tok.type === 'NUMBER') {
      this.advance();
      return parseFloat(tok.value);
    }

    // String
    if (tok.type === 'STRING') {
      this.advance();
      return tok.value;
    }

    // Boolean
    if (tok.type === 'BOOLEAN') {
      this.advance();
      return tok.value === 'TRUE';
    }

    // Function call
    if (tok.type === 'FUNCTION') {
      return this.parseFunction();
    }

    // Cell/column reference
    if (tok.type === 'CELL_REF') {
      this.advance();
      return this.resolveReference(tok.value);
    }

    // Parenthesized expression
    if (tok.type === 'LPAREN') {
      this.advance();
      const value = this.parseExpression();
      if (this.current().type === 'RPAREN') this.advance();
      return value;
    }

    throw new Error(`Unexpected token at position ${tok.position}: ${tok.type} '${tok.value}'`);
  }

  private parseFunction(): FormulaValue {
    const funcName = this.advance().value;
    if (this.current().type !== 'LPAREN') {
      throw new Error(`Expected '(' after function ${funcName}`);
    }
    this.advance(); // skip (

    const args: FormulaValue[] = [];
    if (this.current().type !== 'RPAREN') {
      args.push(this.parseExpression());
      while (this.current().type === 'COMMA') {
        this.advance();
        args.push(this.parseExpression());
      }
    }
    if (this.current().type === 'RPAREN') this.advance();

    return this.callFunction(funcName, args);
  }

  private callFunction(name: string, args: FormulaValue[]): FormulaValue {
    switch (name) {
      // Math aggregates
      case 'SUM':
        return this.fnSum(args);
      case 'AVERAGE':
        return this.fnAverage(args);
      case 'COUNT':
        return this.fnCount(args);
      case 'COUNTA':
        return args.filter(a => a !== null && a !== '').length;
      case 'COUNTBLANK':
        return args.filter(a => a === null || a === '' || a === undefined).length;
      case 'MAX':
        return this.fnMax(args);
      case 'MIN':
        return this.fnMin(args);
      case 'MEDIAN':
        return this.fnMedian(args);

      // Math
      case 'ABS':
        return Math.abs(this.toNumber(args[0]));
      case 'ROUND':
        return this.fnRound(args);
      case 'ROUNDUP': {
        const val = this.toNumber(args[0]);
        const decimals = args.length > 1 ? this.toNumber(args[1]) : 0;
        const factor = Math.pow(10, decimals);
        return Math.ceil(val * factor) / factor;
      }
      case 'ROUNDDOWN': {
        const val = this.toNumber(args[0]);
        const decimals = args.length > 1 ? this.toNumber(args[1]) : 0;
        const factor = Math.pow(10, decimals);
        return Math.floor(val * factor) / factor;
      }
      case 'CEILING': {
        const val = this.toNumber(args[0]);
        const sig = args.length > 1 ? this.toNumber(args[1]) : 1;
        return sig === 0 ? 0 : Math.ceil(val / sig) * sig;
      }
      case 'FLOOR': {
        const val = this.toNumber(args[0]);
        const sig = args.length > 1 ? this.toNumber(args[1]) : 1;
        return sig === 0 ? 0 : Math.floor(val / sig) * sig;
      }
      case 'POWER':
        return Math.pow(this.toNumber(args[0]), this.toNumber(args[1]));
      case 'SQRT':
        return Math.sqrt(this.toNumber(args[0]));
      case 'LOG':
        return args.length > 1
          ? Math.log(this.toNumber(args[0])) / Math.log(this.toNumber(args[1]))
          : Math.log(this.toNumber(args[0]));
      case 'LOG10':
        return Math.log10(this.toNumber(args[0]));
      case 'EXP':
        return Math.exp(this.toNumber(args[0]));
      case 'MOD': {
        const divisor = this.toNumber(args[1]);
        if (divisor === 0) throw new Error('#DIV/0!');
        return this.toNumber(args[0]) % divisor;
      }

      // Logical
      case 'IF':
        return this.toBool(args[0]) ? (args[1] ?? true) : (args[2] ?? false);
      case 'IFS':
        return this.fnIfs(args);
      case 'SWITCH':
        return this.fnSwitch(args);
      case 'AND':
        return args.every(a => this.toBool(a));
      case 'OR':
        return args.some(a => this.toBool(a));
      case 'NOT':
        return !this.toBool(args[0]);
      case 'IFERROR':
        return args[0] !== null ? args[0] : (args[1] ?? null);
      case 'ISBLANK':
        return args[0] === null || args[0] === '' || args[0] === undefined;
      case 'ISNUMBER':
        return typeof args[0] === 'number' || (typeof args[0] === 'string' && !isNaN(Number(args[0])));
      case 'ISTEXT':
        return typeof args[0] === 'string';

      // String
      case 'CONCATENATE':
      case 'CONCAT':
        return args.map(a => String(a ?? '')).join('');
      case 'LEFT':
        return String(args[0] ?? '').substring(0, this.toNumber(args[1] ?? 1));
      case 'RIGHT': {
        const str = String(args[0] ?? '');
        const count = this.toNumber(args[1] ?? 1);
        return str.substring(Math.max(0, str.length - count));
      }
      case 'MID': {
        const str = String(args[0] ?? '');
        const start = this.toNumber(args[1] ?? 1) - 1;
        const length = this.toNumber(args[2] ?? 1);
        return str.substring(start, start + length);
      }
      case 'LEN':
        return String(args[0] ?? '').length;
      case 'TRIM':
        return String(args[0] ?? '').trim();
      case 'UPPER':
        return String(args[0] ?? '').toUpperCase();
      case 'LOWER':
        return String(args[0] ?? '').toLowerCase();
      case 'PROPER':
        return String(args[0] ?? '')
          .toLowerCase()
          .replace(/\b\w/g, c => c.toUpperCase());
      case 'SUBSTITUTE': {
        const text = String(args[0] ?? '');
        const oldText = String(args[1] ?? '');
        const newText = String(args[2] ?? '');
        if (args.length > 3) {
          const nth = this.toNumber(args[3]);
          let count = 0;
          return text.replace(new RegExp(this.escapeRegex(oldText), 'g'), (match) => {
            count++;
            return count === nth ? newText : match;
          });
        }
        return text.split(oldText).join(newText);
      }
      case 'REPLACE': {
        const text = String(args[0] ?? '');
        const start = this.toNumber(args[1] ?? 1) - 1;
        const numChars = this.toNumber(args[2] ?? 0);
        const replacement = String(args[3] ?? '');
        return text.substring(0, start) + replacement + text.substring(start + numChars);
      }
      case 'FIND': {
        const findText = String(args[0] ?? '');
        const within = String(args[1] ?? '');
        const startPos = args.length > 2 ? this.toNumber(args[2]) - 1 : 0;
        const idx = within.indexOf(findText, startPos);
        if (idx === -1) throw new Error('#VALUE!');
        return idx + 1;
      }
      case 'SEARCH': {
        const findText = String(args[0] ?? '').toLowerCase();
        const within = String(args[1] ?? '').toLowerCase();
        const startPos = args.length > 2 ? this.toNumber(args[2]) - 1 : 0;
        const idx = within.indexOf(findText, startPos);
        if (idx === -1) throw new Error('#VALUE!');
        return idx + 1;
      }
      case 'TEXT':
        return this.fnText(args);
      case 'VALUE':
        return this.toNumber(args[0]);

      // Date
      case 'NOW':
        return new Date();
      case 'TODAY':
        return new Date(new Date().toISOString().split('T')[0]);
      case 'YEAR':
        return this.toDate(args[0]).getFullYear();
      case 'MONTH':
        return this.toDate(args[0]).getMonth() + 1;
      case 'DAY':
        return this.toDate(args[0]).getDate();
      case 'HOUR':
        return this.toDate(args[0]).getHours();
      case 'MINUTE':
        return this.toDate(args[0]).getMinutes();
      case 'SECOND':
        return this.toDate(args[0]).getSeconds();
      case 'DATE':
        return new Date(this.toNumber(args[0]), this.toNumber(args[1]) - 1, this.toNumber(args[2]));
      case 'DATEVALUE':
        return this.toDate(args[0]);
      case 'DATEDIF':
        return this.fnDatedif(args);

      // Lookup
      case 'VLOOKUP':
        return this.fnVlookup(args);
      case 'INDEX':
        return this.fnIndex(args);
      case 'MATCH':
        return this.fnMatch(args);

      // Statistical
      case 'STDEV':
        return this.fnStdev(args);
      case 'VAR':
        return this.fnVariance(args);
      case 'MODE':
        return this.fnMode(args);

      // Boolean constructors
      case 'TRUE':
        return true;
      case 'FALSE':
        return false;

      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }

  // ─── Function implementations ──────────────────────────────────

  private fnSum(args: FormulaValue[]): number {
    let total = 0;
    for (const arg of args) {
      if (typeof arg === 'number') total += arg;
      else if (typeof arg === 'string' && !isNaN(Number(arg))) total += Number(arg);
    }
    return total;
  }

  private fnAverage(args: FormulaValue[]): number {
    const nums: number[] = [];
    for (const arg of args) {
      const n = Number(arg);
      if (!isNaN(n) && arg !== null && arg !== '') nums.push(n);
    }
    if (nums.length === 0) throw new Error('#DIV/0!');
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  private fnCount(args: FormulaValue[]): number {
    return args.filter(a => {
      if (a === null || a === undefined) return false;
      return typeof a === 'number' || !isNaN(Number(a));
    }).length;
  }

  private fnMax(args: FormulaValue[]): number {
    const nums = args.map(a => Number(a)).filter(n => !isNaN(n));
    if (nums.length === 0) return 0;
    return Math.max(...nums);
  }

  private fnMin(args: FormulaValue[]): number {
    const nums = args.map(a => Number(a)).filter(n => !isNaN(n));
    if (nums.length === 0) return 0;
    return Math.min(...nums);
  }

  private fnMedian(args: FormulaValue[]): number {
    const nums = args.map(a => Number(a)).filter(n => !isNaN(n)).sort((a, b) => a - b);
    if (nums.length === 0) return 0;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
  }

  private fnStdev(args: FormulaValue[]): number {
    const nums = args.map(a => Number(a)).filter(n => !isNaN(n));
    if (nums.length < 2) return 0;
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance = nums.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / (nums.length - 1);
    return Math.sqrt(variance);
  }

  private fnVariance(args: FormulaValue[]): number {
    const nums = args.map(a => Number(a)).filter(n => !isNaN(n));
    if (nums.length < 2) return 0;
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    return nums.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / (nums.length - 1);
  }

  private fnMode(args: FormulaValue[]): FormulaValue {
    const freq = new Map<string, number>();
    for (const a of args) {
      if (a !== null && a !== undefined) {
        const key = String(a);
        freq.set(key, (freq.get(key) || 0) + 1);
      }
    }
    let maxCount = 0;
    let modeVal: string | null = null;
    for (const [val, count] of freq) {
      if (count > maxCount) {
        maxCount = count;
        modeVal = val;
      }
    }
    if (modeVal === null) return null;
    const num = Number(modeVal);
    return isNaN(num) ? modeVal : num;
  }

  private fnRound(args: FormulaValue[]): number {
    const value = this.toNumber(args[0]);
    const decimals = args.length > 1 ? this.toNumber(args[1]) : 0;
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  private fnIfs(args: FormulaValue[]): FormulaValue {
    for (let i = 0; i < args.length - 1; i += 2) {
      if (this.toBool(args[i])) {
        return args[i + 1] ?? null;
      }
    }
    throw new Error('#N/A');
  }

  private fnSwitch(args: FormulaValue[]): FormulaValue {
    if (args.length < 2) throw new Error('#VALUE!');
    const expression = args[0];
    for (let i = 1; i < args.length - 1; i += 2) {
      if (String(expression) === String(args[i])) {
        return args[i + 1] ?? null;
      }
    }
    // Default value (last odd argument)
    if (args.length % 2 === 0) {
      return args[args.length - 1] ?? null;
    }
    throw new Error('#N/A');
  }

  private fnVlookup(args: FormulaValue[]): FormulaValue {
    const lookupValue = args[0];
    const colIndex = this.toNumber(args[2]) - 1;
    const exactMatch = args.length > 3 ? this.toBool(args[3]) === false : true;

    // Look up in all data rows
    const columns = this.allData.length > 0 ? Object.keys(this.allData[0]) : [];
    if (colIndex < 0 || colIndex >= columns.length) throw new Error('#REF!');

    const searchCol = columns[0];
    const returnCol = columns[colIndex];

    for (const row of this.allData) {
      const cellVal = row[searchCol];
      if (exactMatch) {
        if (String(cellVal ?? '').toLowerCase() === String(lookupValue ?? '').toLowerCase()) {
          return row[returnCol] as FormulaValue;
        }
      } else {
        if (Number(cellVal) <= Number(lookupValue)) {
          return row[returnCol] as FormulaValue;
        }
      }
    }
    throw new Error('#N/A');
  }

  private fnIndex(args: FormulaValue[]): FormulaValue {
    const rowNum = this.toNumber(args[1]) - 1;
    const colNum = args.length > 2 ? this.toNumber(args[2]) - 1 : 0;

    if (rowNum < 0 || rowNum >= this.allData.length) throw new Error('#REF!');
    const targetRow = this.allData[rowNum];
    const columns = Object.keys(targetRow);
    if (colNum < 0 || colNum >= columns.length) throw new Error('#REF!');

    return targetRow[columns[colNum]] as FormulaValue;
  }

  private fnMatch(args: FormulaValue[]): number {
    const lookupValue = args[0];
    const columns = this.allData.length > 0 ? Object.keys(this.allData[0]) : [];
    const searchCol = columns.length > 0 ? columns[0] : '';

    for (let i = 0; i < this.allData.length; i++) {
      const cellVal = this.allData[i][searchCol];
      if (String(cellVal ?? '').toLowerCase() === String(lookupValue ?? '').toLowerCase()) {
        return i + 1;
      }
    }
    throw new Error('#N/A');
  }

  private fnText(args: FormulaValue[]): string {
    const value = args[0];
    const format = String(args[1] ?? '');

    if (value instanceof Date) {
      return this.formatDate(value, format);
    }

    const num = Number(value);
    if (!isNaN(num)) {
      if (format.includes('.')) {
        const decimals = format.split('.')[1]?.length || 0;
        return num.toFixed(decimals);
      }
      if (format.includes('%')) {
        return (num * 100).toFixed(0) + '%';
      }
      return String(num);
    }

    return String(value ?? '');
  }

  private fnDatedif(args: FormulaValue[]): number {
    const startDate = this.toDate(args[0]);
    const endDate = this.toDate(args[1]);
    const unit = String(args[2] ?? 'D').toUpperCase();

    const diffMs = endDate.getTime() - startDate.getTime();

    switch (unit) {
      case 'D':
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
      case 'M':
        return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
      case 'Y':
        return endDate.getFullYear() - startDate.getFullYear();
      default:
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private resolveReference(ref: string): FormulaValue {
    // Direct column name
    if (ref in this.row) {
      return this.row[ref] as FormulaValue;
    }

    // Case-insensitive lookup
    const lower = ref.toLowerCase();
    for (const [key, value] of Object.entries(this.row)) {
      if (key.toLowerCase() === lower) {
        return value as FormulaValue;
      }
    }

    // Try column with spaces replaced
    const withSpaces = ref.replace(/_/g, ' ');
    for (const [key, value] of Object.entries(this.row)) {
      if (key.toLowerCase() === withSpaces.toLowerCase()) {
        return value as FormulaValue;
      }
    }

    return null;
  }

  private toNumber(val: FormulaValue): number {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'boolean') return val ? 1 : 0;
    if (val instanceof Date) return val.getTime();
    const n = Number(val);
    if (isNaN(n)) return 0;
    return n;
  }

  private toBool(val: FormulaValue): boolean {
    if (val === null || val === undefined || val === '' || val === 0 || val === false) return false;
    if (typeof val === 'string' && val.toUpperCase() === 'FALSE') return false;
    return true;
  }

  private toDate(val: FormulaValue): Date {
    if (val instanceof Date) return val;
    if (typeof val === 'number') return new Date(val);
    if (typeof val === 'string') {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
    throw new Error('#VALUE!');
  }

  private formatDate(date: Date, format: string): string {
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return format
      .replace('YYYY', yyyy)
      .replace('yyyy', yyyy)
      .replace('MM', mm)
      .replace('mm', mm)
      .replace('DD', dd)
      .replace('dd', dd);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private doComparison(left: FormulaValue, op: string, right: FormulaValue): boolean {
    const numLeft = Number(left);
    const numRight = Number(right);
    const canCompareNumbers = !isNaN(numLeft) && !isNaN(numRight) && left !== null && right !== null && left !== '' && right !== '';

    switch (op) {
      case '=':
        return canCompareNumbers ? numLeft === numRight : String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();
      case '<>':
        return canCompareNumbers ? numLeft !== numRight : String(left ?? '').toLowerCase() !== String(right ?? '').toLowerCase();
      case '<':
        return canCompareNumbers ? numLeft < numRight : String(left ?? '') < String(right ?? '');
      case '>':
        return canCompareNumbers ? numLeft > numRight : String(left ?? '') > String(right ?? '');
      case '<=':
        return canCompareNumbers ? numLeft <= numRight : String(left ?? '') <= String(right ?? '');
      case '>=':
        return canCompareNumbers ? numLeft >= numRight : String(left ?? '') >= String(right ?? '');
      default:
        return false;
    }
  }
}

// ─── Service ───────────────────────────────────────────────────────

export class FormulaEngineService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  evaluateFormula(
    formula: string,
    data: Record<string, unknown>[],
    rowIndex?: number
  ): FormulaResult {
    try {
      const idx = rowIndex ?? 0;
      const row = data[idx] || {};
      const tokens = tokenizeFormula(formula);
      const evaluator = new FormulaEvaluator(tokens, row, data, idx);
      const value = evaluator.evaluate();

      return {
        value,
        type: this.getValueType(value),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        value: null,
        type: 'error',
        error: message,
      };
    }
  }

  async createDerivedColumn(
    datasetId: string,
    name: string,
    formula: string,
    tenantId: string
  ): Promise<DerivedColumnResult> {
    logger.info('Creating derived column', { datasetId, name, formula, tenantId });

    // Verify dataset
    const dataset = await this.prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    if (!dataset) throw new Error(`Dataset '${datasetId}' not found`);

    // Load all rows
    const rows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });

    const allData = rows.map(r => r.data as Record<string, unknown>);

    // Evaluate formula for each row
    const errors: Array<{ rowIndex: number; error: string }> = [];
    let computedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const result = this.evaluateFormula(formula, allData, i);
      if (result.type === 'error') {
        errors.push({ rowIndex: i, error: result.error || 'Unknown error' });
      } else {
        const updatedData = { ...(rows[i].data as Record<string, unknown>), [name]: result.value };
        await this.prisma.dataRow.update({
          where: { id: rows[i].id },
          data: { data: updatedData },
        });
        computedCount++;
      }
    }

    // Add column metadata
    const maxPosition = dataset.columns.reduce((max, c) => Math.max(max, c.position || 0), 0);
    await this.prisma.datasetColumn.create({
      data: {
        id: crypto.randomUUID(),
        datasetId,
        name,
        originalName: `=${formula}`,
        dataType: 'computed',
        inferredType: 'mixed',
        position: maxPosition + 1,
        nullable: true,
        metadata: { formula, isComputed: true },
      },
    });

    // Audit
    await this.logAudit(tenantId, 'derived_column_create', JSON.stringify({ datasetId, name, formula }));

    logger.info('Derived column created', { datasetId, name, computedCount, errorCount: errors.length });

    return {
      datasetId,
      columnName: name,
      formula,
      computedCount,
      errorCount: errors.length,
      errors: errors.slice(0, 50),
    };
  }

  evaluateBatch(
    formulas: BatchFormulaInput[],
    data: Record<string, unknown>[]
  ): BatchFormulaResult {
    const results: BatchFormulaResult['results'] = [];
    let totalErrors = 0;

    for (const entry of formulas) {
      const result = this.evaluateFormula(entry.formula, data, entry.rowIndex);
      if (result.type === 'error') {
        totalErrors++;
        results.push({
          rowIndex: entry.rowIndex,
          value: null,
          error: result.error,
        });
      } else {
        results.push({
          rowIndex: entry.rowIndex,
          value: result.value,
        });
      }
    }

    return {
      results,
      totalComputed: results.length - totalErrors,
      totalErrors,
    };
  }

  private getValueType(value: FormulaValue): FormulaResult['type'] {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') return 'string';
    if (value instanceof Date) return 'date';
    return 'string';
  }

  private async logAudit(tenantId: string, action: string, details: string): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          userId: '00000000-0000-0000-0000-000000000000',
          action,
          entityType: 'dataset',
          detailsJson: { action, details, timestamp: new Date().toISOString() },
        },
      });
    } catch (err) {
      logger.warn('Failed to write audit log', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
