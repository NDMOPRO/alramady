import { logger } from '../../utils/logger.js';

type ASTNodeType = 'BinaryOp' | 'UnaryOp' | 'FunctionCall' | 'CellRef' | 'Range' | 'Literal' | 'StringLiteral';

interface ASTNode {
  type: ASTNodeType;
  value?: unknown;
  operator?: string;
  left?: ASTNode;
  right?: ASTNode;
  operand?: ASTNode;
  functionName?: string;
  args?: ASTNode[];
  startRef?: string;
  endRef?: string;
  ref?: string;
}

type TokenType = 'NUMBER' | 'STRING' | 'CELL_REF' | 'FUNCTION' | 'OPERATOR' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'COLON' | 'BOOLEAN' | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

interface EvalContext {
  getCellValue: (ref: string) => unknown;
  getCellRange: (startRef: string, endRef: string) => unknown[][];
}

export class FormulaASTEngine {
  parse(formula: string): ASTNode {
    const expr = formula.startsWith('=') ? formula.substring(1) : formula;
    const tokens = this.tokenize(expr);
    const parser = new Parser(tokens);
    const ast = parser.parseExpression();

    if (parser.currentIndex < tokens.length - 1) {
      logger.warn('FormulaASTEngine: tokens remaining after parse', {
        remaining: tokens.length - parser.currentIndex,
      });
    }

    logger.debug('FormulaASTEngine parsed formula', { formula, astType: ast.type });
    return ast;
  }

  evaluate(ast: ASTNode, context: EvalContext): unknown {
    switch (ast.type) {
      case 'Literal':
        return ast.value;
      case 'StringLiteral':
        return ast.value;
      case 'CellRef':
        return context.getCellValue(ast.ref!);
      case 'Range': {
        const rangeData = context.getCellRange(ast.startRef!, ast.endRef!);
        // Flatten to 1D if single row or column
        if (rangeData.length === 1) return rangeData[0];
        if (rangeData.every(r => r.length === 1)) return rangeData.map(r => r[0]);
        return rangeData;
      }
      case 'UnaryOp': {
        const operand = this.evaluate(ast.operand!, context);
        if (ast.operator === '-') return -(operand as number);
        if (ast.operator === '+') return +(operand as number);
        throw new Error(`Unknown unary operator: ${ast.operator}`);
      }
      case 'BinaryOp': {
        const left = this.evaluate(ast.left!, context);
        const right = this.evaluate(ast.right!, context);
        return this.applyBinaryOp(ast.operator!, left, right);
      }
      case 'FunctionCall': {
        const evaluatedArgs = ast.args!.map(arg => this.evaluate(arg, context));
        return this.evaluateBuiltinFunction(ast.functionName!, evaluatedArgs, ast.args!, context);
      }
      default:
        throw new Error(`Unknown AST node type: ${ast.type}`);
    }
  }

  getDependencies(ast: ASTNode): string[] {
    const deps: string[] = [];
    this.collectDependencies(ast, deps);
    return [...new Set(deps)];
  }

  private collectDependencies(node: ASTNode, deps: string[]): void {
    switch (node.type) {
      case 'CellRef':
        deps.push(node.ref!);
        break;
      case 'Range':
        deps.push(...this.expandRange(node.startRef!, node.endRef!));
        break;
      case 'BinaryOp':
        this.collectDependencies(node.left!, deps);
        this.collectDependencies(node.right!, deps);
        break;
      case 'UnaryOp':
        this.collectDependencies(node.operand!, deps);
        break;
      case 'FunctionCall':
        for (const arg of node.args!) {
          this.collectDependencies(arg, deps);
        }
        break;
    }
  }

  private applyBinaryOp(op: string, left: unknown, right: unknown): unknown {
    if (op === '&') return String(left ?? '') + String(right ?? '');

    const l = Number(left);
    const r = Number(right);

    switch (op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/': return r === 0 ? '#DIV/0!' : l / r;
      case '^': return Math.pow(l, r);
      case '>': return l > r;
      case '<': return l < r;
      case '>=': return l >= r;
      case '<=': return l <= r;
      case '=': return left === right;
      case '<>': return left !== right;
      default:
        throw new Error(`Unknown operator: ${op}`);
    }
  }

  private evaluateBuiltinFunction(name: string, evaluatedArgs: unknown[], rawArgs: ASTNode[], context: EvalContext): unknown {
    const flatNums = (args: unknown[]): number[] => {
      const result: number[] = [];
      for (const arg of args) {
        if (Array.isArray(arg)) {
          result.push(...flatNums(arg));
        } else {
          const n = Number(arg);
          if (!isNaN(n)) result.push(n);
        }
      }
      return result;
    };

    switch (name.toUpperCase()) {
      case 'SUM': {
        const nums = flatNums(evaluatedArgs);
        return nums.reduce((a, b) => a + b, 0);
      }
      case 'AVERAGE': {
        const nums = flatNums(evaluatedArgs);
        return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      }
      case 'COUNT': {
        const nums = flatNums(evaluatedArgs);
        return nums.length;
      }
      case 'MIN': {
        const nums = flatNums(evaluatedArgs);
        return nums.length > 0 ? Math.min(...nums) : 0;
      }
      case 'MAX': {
        const nums = flatNums(evaluatedArgs);
        return nums.length > 0 ? Math.max(...nums) : 0;
      }
      case 'IF': {
        const condition = evaluatedArgs[0];
        const truthy = condition !== false && condition !== 0 && condition !== '' && condition !== null;
        return truthy ? evaluatedArgs[1] : (evaluatedArgs[2] ?? false);
      }
      case 'ABS':
        return Math.abs(Number(evaluatedArgs[0]));
      case 'ROUND': {
        const val = Number(evaluatedArgs[0]);
        const digits = evaluatedArgs.length > 1 ? Number(evaluatedArgs[1]) : 0;
        const factor = Math.pow(10, digits);
        return Math.round(val * factor) / factor;
      }
      case 'CONCATENATE':
      case 'CONCAT':
        return evaluatedArgs.map(a => String(a ?? '')).join('');
      case 'LEN':
        return String(evaluatedArgs[0] ?? '').length;
      case 'LEFT':
        return String(evaluatedArgs[0] ?? '').substring(0, Number(evaluatedArgs[1] ?? 1));
      case 'RIGHT': {
        const s = String(evaluatedArgs[0] ?? '');
        const n = Number(evaluatedArgs[1] ?? 1);
        return s.substring(s.length - n);
      }
      case 'MID': {
        const s = String(evaluatedArgs[0] ?? '');
        const start = Number(evaluatedArgs[1] ?? 1) - 1;
        const len = Number(evaluatedArgs[2] ?? 1);
        return s.substring(start, start + len);
      }
      case 'VLOOKUP': {
        const lookupValue = evaluatedArgs[0];
        const tableArray = evaluatedArgs[1] as unknown[][];
        const colIndex = Number(evaluatedArgs[2]) - 1;
        const exactMatch = evaluatedArgs.length > 3 ? evaluatedArgs[3] === false || evaluatedArgs[3] === 0 : false;
        if (!Array.isArray(tableArray)) return '#VALUE!';
        for (const row of tableArray) {
          if (Array.isArray(row) && (row[0] === lookupValue || (!exactMatch && String(row[0]) >= String(lookupValue)))) {
            return row[colIndex] ?? '#N/A';
          }
        }
        return '#N/A';
      }
      case 'INDEX': {
        const arr = evaluatedArgs[0] as unknown[][];
        const rowIdx = Number(evaluatedArgs[1]) - 1;
        const colIdx = evaluatedArgs.length > 2 ? Number(evaluatedArgs[2]) - 1 : 0;
        if (!Array.isArray(arr)) return '#VALUE!';
        if (Array.isArray(arr[0])) return arr[rowIdx]?.[colIdx] ?? '#REF!';
        return (arr as unknown[])[rowIdx] ?? '#REF!';
      }
      case 'MATCH': {
        const lookupValue = evaluatedArgs[0];
        const lookupArray = evaluatedArgs[1];
        const flat = Array.isArray(lookupArray) ? (lookupArray as unknown[]).flat() : [];
        const idx = flat.indexOf(lookupValue);
        return idx >= 0 ? idx + 1 : '#N/A';
      }
      case 'COUNTIF': {
        const rangeVals = flatNums(Array.isArray(evaluatedArgs[0]) ? evaluatedArgs[0] as unknown[] : [evaluatedArgs[0]]);
        const criteria = evaluatedArgs[1];
        return rangeVals.filter(v => v === Number(criteria)).length;
      }
      case 'SUMIF': {
        const rangeVals = Array.isArray(evaluatedArgs[0]) ? (evaluatedArgs[0] as unknown[]).flat() : [evaluatedArgs[0]];
        const criteria = evaluatedArgs[1];
        const sumVals = evaluatedArgs.length > 2
          ? (Array.isArray(evaluatedArgs[2]) ? (evaluatedArgs[2] as unknown[]).flat() : [evaluatedArgs[2]])
          : rangeVals;
        let sum = 0;
        for (let i = 0; i < rangeVals.length; i++) {
          if (rangeVals[i] === criteria || Number(rangeVals[i]) === Number(criteria)) {
            sum += Number(sumVals[i] ?? 0);
          }
        }
        return sum;
      }
      case 'POWER':
        return Math.pow(Number(evaluatedArgs[0]), Number(evaluatedArgs[1]));
      case 'SQRT':
        return Math.sqrt(Number(evaluatedArgs[0]));
      case 'LOG':
        return evaluatedArgs.length > 1
          ? Math.log(Number(evaluatedArgs[0])) / Math.log(Number(evaluatedArgs[1]))
          : Math.log10(Number(evaluatedArgs[0]));
      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }

  private tokenize(expr: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const src = expr.trim();

    while (i < src.length) {
      const ch = src[i];

      // Whitespace
      if (/\s/.test(ch)) { i++; continue; }

      // String literal
      if (ch === '"') {
        let str = '';
        i++; // skip opening quote
        while (i < src.length && src[i] !== '"') {
          str += src[i];
          i++;
        }
        i++; // skip closing quote
        tokens.push({ type: 'STRING', value: str });
        continue;
      }

      // Number
      if (/\d/.test(ch) || (ch === '.' && i + 1 < src.length && /\d/.test(src[i + 1]))) {
        let num = '';
        while (i < src.length && (/\d/.test(src[i]) || src[i] === '.')) {
          num += src[i];
          i++;
        }
        tokens.push({ type: 'NUMBER', value: num });
        continue;
      }

      // Identifiers: cell refs, functions, booleans
      if (/[A-Za-z_]/.test(ch)) {
        let ident = '';
        while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) {
          ident += src[i];
          i++;
        }

        const upper = ident.toUpperCase();
        if (upper === 'TRUE' || upper === 'FALSE') {
          tokens.push({ type: 'BOOLEAN', value: upper });
        } else if (i < src.length && src[i] === '(') {
          tokens.push({ type: 'FUNCTION', value: upper });
        } else if (/^[A-Z]+\d+$/i.test(ident)) {
          tokens.push({ type: 'CELL_REF', value: ident.toUpperCase() });
        } else {
          // Treat as a function name if followed later by paren, else cell ref
          tokens.push({ type: 'CELL_REF', value: ident.toUpperCase() });
        }
        continue;
      }

      // Multi-char operators
      if (ch === '<' || ch === '>') {
        let op = ch;
        i++;
        if (i < src.length && (src[i] === '=' || src[i] === '>')) {
          op += src[i];
          i++;
        }
        tokens.push({ type: 'OPERATOR', value: op });
        continue;
      }

      // Single-char operators and punctuation
      if ('+-*/^&='.includes(ch)) {
        tokens.push({ type: 'OPERATOR', value: ch });
        i++;
        continue;
      }
      if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
      if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }
      if (ch === ',') { tokens.push({ type: 'COMMA', value: ',' }); i++; continue; }
      if (ch === ':') { tokens.push({ type: 'COLON', value: ':' }); i++; continue; }

      throw new Error(`Unexpected character: '${ch}' at position ${i}`);
    }

    tokens.push({ type: 'EOF', value: '' });
    return tokens;
  }

  private expandRange(start: string, end: string): string[] {
    const startCol = this.colToIndex(start.replace(/\d+/g, ''));
    const endCol = this.colToIndex(end.replace(/\d+/g, ''));
    const startRow = parseInt(start.replace(/[A-Z]+/gi, ''), 10);
    const endRow = parseInt(end.replace(/[A-Z]+/gi, ''), 10);
    const refs: string[] = [];
    for (let c = startCol; c <= endCol; c++) {
      for (let r = startRow; r <= endRow; r++) {
        refs.push(`${this.indexToCol(c)}${r}`);
      }
    }
    return refs;
  }

  private colToIndex(col: string): number {
    let idx = 0;
    for (let i = 0; i < col.length; i++) {
      idx = idx * 26 + (col.charCodeAt(i) - 64);
    }
    return idx;
  }

  private indexToCol(idx: number): string {
    let col = '';
    let n = idx;
    while (n > 0) {
      const rem = (n - 1) % 26;
      col = String.fromCharCode(65 + rem) + col;
      n = Math.floor((n - 1) / 26);
    }
    return col;
  }
}

class Parser {
  private tokens: Token[];
  public currentIndex: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.currentIndex = 0;
  }

  private peek(): Token {
    return this.tokens[this.currentIndex] ?? { type: 'EOF', value: '' };
  }

  private consume(expectedType?: TokenType): Token {
    const token = this.peek();
    if (expectedType && token.type !== expectedType) {
      throw new Error(`Expected ${expectedType} but got ${token.type} ('${token.value}')`);
    }
    this.currentIndex++;
    return token;
  }

  parseExpression(): ASTNode {
    return this.parseComparison();
  }

  private parseComparison(): ASTNode {
    let left = this.parseConcatenation();
    while (this.peek().type === 'OPERATOR' && ['=', '<', '>', '<=', '>=', '<>'].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseConcatenation();
      left = { type: 'BinaryOp', operator: op, left, right };
    }
    return left;
  }

  private parseConcatenation(): ASTNode {
    let left = this.parseAddSub();
    while (this.peek().type === 'OPERATOR' && this.peek().value === '&') {
      this.consume();
      const right = this.parseAddSub();
      left = { type: 'BinaryOp', operator: '&', left, right };
    }
    return left;
  }

  private parseAddSub(): ASTNode {
    let left = this.parseMulDiv();
    while (this.peek().type === 'OPERATOR' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value;
      const right = this.parseMulDiv();
      left = { type: 'BinaryOp', operator: op, left, right };
    }
    return left;
  }

  private parseMulDiv(): ASTNode {
    let left = this.parsePower();
    while (this.peek().type === 'OPERATOR' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.consume().value;
      const right = this.parsePower();
      left = { type: 'BinaryOp', operator: op, left, right };
    }
    return left;
  }

  private parsePower(): ASTNode {
    let left = this.parseUnary();
    while (this.peek().type === 'OPERATOR' && this.peek().value === '^') {
      this.consume();
      const right = this.parseUnary();
      left = { type: 'BinaryOp', operator: '^', left, right };
    }
    return left;
  }

  private parseUnary(): ASTNode {
    if (this.peek().type === 'OPERATOR' && (this.peek().value === '-' || this.peek().value === '+')) {
      const op = this.consume().value;
      const operand = this.parseUnary();
      return { type: 'UnaryOp', operator: op, operand };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ASTNode {
    const token = this.peek();

    // Number literal
    if (token.type === 'NUMBER') {
      this.consume();
      return { type: 'Literal', value: parseFloat(token.value) };
    }

    // String literal
    if (token.type === 'STRING') {
      this.consume();
      return { type: 'StringLiteral', value: token.value };
    }

    // Boolean
    if (token.type === 'BOOLEAN') {
      this.consume();
      return { type: 'Literal', value: token.value === 'TRUE' };
    }

    // Function call
    if (token.type === 'FUNCTION') {
      const funcName = this.consume().value;
      this.consume('LPAREN');
      const args: ASTNode[] = [];
      if (this.peek().type !== 'RPAREN') {
        args.push(this.parseExpression());
        while (this.peek().type === 'COMMA') {
          this.consume();
          args.push(this.parseExpression());
        }
      }
      this.consume('RPAREN');
      return { type: 'FunctionCall', functionName: funcName, args };
    }

    // Cell reference (possibly a range)
    if (token.type === 'CELL_REF') {
      const cellRef = this.consume().value;
      if (this.peek().type === 'COLON') {
        this.consume(); // consume ':'
        const endRef = this.consume('CELL_REF').value;
        return { type: 'Range', startRef: cellRef, endRef };
      }
      return { type: 'CellRef', ref: cellRef };
    }

    // Parenthesized expression
    if (token.type === 'LPAREN') {
      this.consume();
      const expr = this.parseExpression();
      this.consume('RPAREN');
      return expr;
    }

    throw new Error(`Unexpected token: ${token.type} ('${token.value}')`);
  }
}
