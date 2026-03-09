import { logger } from '../../utils/logger.js';

interface CellContext {
  getCellValue: (ref: string) => unknown;
  getCellRange: (startRef: string, endRef: string) => unknown[][];
}

interface DependencyNode {
  cell: string;
  dependsOn: Set<string>;
  dependedBy: Set<string>;
}

interface DAG {
  nodes: Map<string, DependencyNode>;
}

interface RecomputeResult {
  updatedCells: Map<string, unknown>;
  recomputeCount: number;
}

export class SpreadsheetVM {
  evaluateFormula(formula: string, context: CellContext): unknown {
    const trimmed = formula.trim();
    if (!trimmed.startsWith('=')) {
      return this.parseLiteral(trimmed);
    }

    const expr = trimmed.substring(1).trim();
    try {
      return this.evaluateExpression(expr, context);
    } catch (error) {
      logger.error('SpreadsheetVM formula evaluation error', { formula, error: (error as Error).message });
      return `#ERROR: ${(error as Error).message}`;
    }
  }

  buildDependencyDAG(formulas: Map<string, string>): DAG {
    const dag: DAG = { nodes: new Map() };

    // Initialize nodes
    for (const [cell] of formulas) {
      dag.nodes.set(cell, { cell, dependsOn: new Set(), dependedBy: new Set() });
    }

    // Extract dependencies
    for (const [cell, formula] of formulas) {
      if (!formula.startsWith('=')) continue;
      const refs = this.extractCellReferences(formula.substring(1));
      const node = dag.nodes.get(cell)!;

      for (const ref of refs) {
        node.dependsOn.add(ref);
        if (!dag.nodes.has(ref)) {
          dag.nodes.set(ref, { cell: ref, dependsOn: new Set(), dependedBy: new Set() });
        }
        dag.nodes.get(ref)!.dependedBy.add(cell);
      }
    }

    logger.debug('SpreadsheetVM DAG built', { nodeCount: dag.nodes.size });
    return dag;
  }

  detectCircularReferences(dag: DAG): string[] | null {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const circularCells: string[] = [];

    const dfs = (cell: string): boolean => {
      if (inStack.has(cell)) {
        circularCells.push(cell);
        return true;
      }
      if (visited.has(cell)) return false;

      visited.add(cell);
      inStack.add(cell);

      const node = dag.nodes.get(cell);
      if (node) {
        for (const dep of node.dependsOn) {
          if (dfs(dep)) {
            circularCells.push(cell);
            return true;
          }
        }
      }

      inStack.delete(cell);
      return false;
    };

    for (const cell of dag.nodes.keys()) {
      visited.clear();
      inStack.clear();
      dfs(cell);
    }

    if (circularCells.length > 0) {
      logger.warn('SpreadsheetVM circular references detected', { cells: circularCells });
      return [...new Set(circularCells)];
    }
    return null;
  }

  incrementalRecompute(changedCells: Set<string>, dag: DAG, formulas: Map<string, string>, values: Map<string, unknown>): RecomputeResult {
    // Topological sort of affected cells
    const affected = new Set<string>();
    const queue = [...changedCells];

    while (queue.length > 0) {
      const cell = queue.shift()!;
      const node = dag.nodes.get(cell);
      if (node) {
        for (const dependent of node.dependedBy) {
          if (!affected.has(dependent)) {
            affected.add(dependent);
            queue.push(dependent);
          }
        }
      }
    }

    // Topological order among affected cells
    const order = this.topologicalSort(affected, dag);
    const updatedCells = new Map<string, unknown>();

    const context: CellContext = {
      getCellValue: (ref: string) => {
        if (updatedCells.has(ref)) return updatedCells.get(ref);
        return values.get(ref) ?? 0;
      },
      getCellRange: (startRef: string, endRef: string) => {
        return this.expandRange(startRef, endRef, (ref) => {
          if (updatedCells.has(ref)) return updatedCells.get(ref);
          return values.get(ref) ?? 0;
        });
      },
    };

    for (const cell of order) {
      const formula = formulas.get(cell);
      if (formula && formula.startsWith('=')) {
        const result = this.evaluateFormula(formula, context);
        updatedCells.set(cell, result);
        values.set(cell, result);
      }
    }

    logger.debug('SpreadsheetVM incremental recompute', {
      changedCount: changedCells.size,
      affectedCount: affected.size,
      recomputedCount: updatedCells.size,
    });

    return { updatedCells, recomputeCount: updatedCells.size };
  }

  private evaluateExpression(expr: string, context: CellContext): unknown {
    const trimmed = expr.trim();

    // String literal
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1);
    }

    // Function call
    const funcMatch = trimmed.match(/^([A-Z_]+)\s*\((.+)\)$/s);
    if (funcMatch) {
      const funcName = funcMatch[1];
      const argsStr = funcMatch[2];
      return this.evaluateFunction(funcName, argsStr, context);
    }

    // Binary operations (handle +, -, *, /, ^, &)
    // Find the lowest precedence operator outside parentheses
    const opResult = this.findBinaryOperator(trimmed);
    if (opResult) {
      const left = this.evaluateExpression(opResult.left, context);
      const right = this.evaluateExpression(opResult.right, context);
      return this.applyOperator(opResult.operator, left, right);
    }

    // Parenthesized expression
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      return this.evaluateExpression(trimmed.slice(1, -1), context);
    }

    // Unary minus
    if (trimmed.startsWith('-')) {
      const val = this.evaluateExpression(trimmed.substring(1), context);
      return -(val as number);
    }

    // Cell reference
    if (/^[A-Z]+\d+$/i.test(trimmed)) {
      return context.getCellValue(trimmed.toUpperCase());
    }

    // Number
    const num = parseFloat(trimmed);
    if (!isNaN(num)) return num;

    // Boolean
    if (trimmed.toUpperCase() === 'TRUE') return true;
    if (trimmed.toUpperCase() === 'FALSE') return false;

    return trimmed;
  }

  private evaluateFunction(name: string, argsStr: string, context: CellContext): unknown {
    const args = this.splitFunctionArgs(argsStr);

    switch (name) {
      case 'SUM': {
        const values = this.collectNumericValues(args, context);
        return values.reduce((a, b) => a + b, 0);
      }
      case 'AVERAGE': {
        const values = this.collectNumericValues(args, context);
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      }
      case 'COUNT': {
        const values = this.collectNumericValues(args, context);
        return values.length;
      }
      case 'MIN': {
        const values = this.collectNumericValues(args, context);
        return values.length > 0 ? Math.min(...values) : 0;
      }
      case 'MAX': {
        const values = this.collectNumericValues(args, context);
        return values.length > 0 ? Math.max(...values) : 0;
      }
      case 'IF': {
        if (args.length < 2) throw new Error('IF requires at least 2 arguments');
        const condition = this.evaluateExpression(args[0], context);
        if (this.isTruthy(condition)) {
          return this.evaluateExpression(args[1], context);
        }
        return args.length > 2 ? this.evaluateExpression(args[2], context) : false;
      }
      case 'VLOOKUP': {
        if (args.length < 3) throw new Error('VLOOKUP requires at least 3 arguments');
        const lookupValue = this.evaluateExpression(args[0], context);
        const rangeMatch = args[1].trim().match(/^([A-Z]+\d+):([A-Z]+\d+)$/i);
        if (!rangeMatch) throw new Error('VLOOKUP: invalid range');
        const range = context.getCellRange(rangeMatch[1].toUpperCase(), rangeMatch[2].toUpperCase());
        const colIndex = Number(this.evaluateExpression(args[2], context)) - 1;
        const exactMatch = args.length > 3 ? !this.isTruthy(this.evaluateExpression(args[3], context)) : false;

        for (const row of range) {
          if (row[0] === lookupValue || (!exactMatch && row[0] !== undefined && String(row[0]) >= String(lookupValue))) {
            return row[colIndex] ?? '#N/A';
          }
        }
        return '#N/A';
      }
      case 'INDEX': {
        if (args.length < 3) throw new Error('INDEX requires 3 arguments');
        const rangeMatch = args[0].trim().match(/^([A-Z]+\d+):([A-Z]+\d+)$/i);
        if (!rangeMatch) throw new Error('INDEX: invalid range');
        const range = context.getCellRange(rangeMatch[1].toUpperCase(), rangeMatch[2].toUpperCase());
        const rowIdx = Number(this.evaluateExpression(args[1], context)) - 1;
        const colIdx = Number(this.evaluateExpression(args[2], context)) - 1;
        if (rowIdx < 0 || rowIdx >= range.length) return '#REF!';
        if (colIdx < 0 || colIdx >= (range[0]?.length ?? 0)) return '#REF!';
        return range[rowIdx][colIdx];
      }
      case 'MATCH': {
        if (args.length < 2) throw new Error('MATCH requires at least 2 arguments');
        const lookupValue = this.evaluateExpression(args[0], context);
        const rangeMatch = args[1].trim().match(/^([A-Z]+\d+):([A-Z]+\d+)$/i);
        if (!rangeMatch) throw new Error('MATCH: invalid range');
        const range = context.getCellRange(rangeMatch[1].toUpperCase(), rangeMatch[2].toUpperCase());
        const matchType = args.length > 2 ? Number(this.evaluateExpression(args[2], context)) : 1;

        const flatValues = range.map(r => r[0]);
        if (matchType === 0) {
          const idx = flatValues.indexOf(lookupValue);
          return idx >= 0 ? idx + 1 : '#N/A';
        }
        // For matchType 1 or -1, find closest
        for (let i = 0; i < flatValues.length; i++) {
          if (flatValues[i] === lookupValue) return i + 1;
        }
        return '#N/A';
      }
      case 'COUNTIF': {
        if (args.length < 2) throw new Error('COUNTIF requires 2 arguments');
        const rangeMatch = args[0].trim().match(/^([A-Z]+\d+):([A-Z]+\d+)$/i);
        if (!rangeMatch) throw new Error('COUNTIF: invalid range');
        const range = context.getCellRange(rangeMatch[1].toUpperCase(), rangeMatch[2].toUpperCase());
        const criteria = this.evaluateExpression(args[1], context);
        let count = 0;
        for (const row of range) {
          for (const val of row) {
            if (this.matchesCriteria(val, criteria)) count++;
          }
        }
        return count;
      }
      case 'SUMIF': {
        if (args.length < 2) throw new Error('SUMIF requires at least 2 arguments');
        const rangeMatch = args[0].trim().match(/^([A-Z]+\d+):([A-Z]+\d+)$/i);
        if (!rangeMatch) throw new Error('SUMIF: invalid range');
        const criteriaRange = context.getCellRange(rangeMatch[1].toUpperCase(), rangeMatch[2].toUpperCase());
        const criteria = this.evaluateExpression(args[1], context);

        let sumRange = criteriaRange;
        if (args.length > 2) {
          const sumRangeMatch = args[2].trim().match(/^([A-Z]+\d+):([A-Z]+\d+)$/i);
          if (sumRangeMatch) {
            sumRange = context.getCellRange(sumRangeMatch[1].toUpperCase(), sumRangeMatch[2].toUpperCase());
          }
        }

        let sum = 0;
        for (let i = 0; i < criteriaRange.length; i++) {
          for (let j = 0; j < criteriaRange[i].length; j++) {
            if (this.matchesCriteria(criteriaRange[i][j], criteria)) {
              const sumVal = sumRange[i]?.[j];
              if (typeof sumVal === 'number') sum += sumVal;
              else if (typeof sumVal === 'string') {
                const n = parseFloat(sumVal);
                if (!isNaN(n)) sum += n;
              }
            }
          }
        }
        return sum;
      }
      case 'ABS':
        return Math.abs(Number(this.evaluateExpression(args[0], context)));
      case 'ROUND': {
        const val = Number(this.evaluateExpression(args[0], context));
        const digits = args.length > 1 ? Number(this.evaluateExpression(args[1], context)) : 0;
        const factor = Math.pow(10, digits);
        return Math.round(val * factor) / factor;
      }
      case 'CONCATENATE':
      case 'CONCAT':
        return args.map(a => String(this.evaluateExpression(a, context))).join('');
      case 'LEN':
        return String(this.evaluateExpression(args[0], context)).length;
      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }

  private collectNumericValues(args: string[], context: CellContext): number[] {
    const values: number[] = [];
    for (const arg of args) {
      const rangeMatch = arg.trim().match(/^([A-Z]+\d+):([A-Z]+\d+)$/i);
      if (rangeMatch) {
        const range = context.getCellRange(rangeMatch[1].toUpperCase(), rangeMatch[2].toUpperCase());
        for (const row of range) {
          for (const val of row) {
            const n = typeof val === 'number' ? val : parseFloat(val as string);
            if (!isNaN(n)) values.push(n);
          }
        }
      } else {
        const val = this.evaluateExpression(arg, context);
        const n = typeof val === 'number' ? val : parseFloat(val as string);
        if (!isNaN(n)) values.push(n);
      }
    }
    return values;
  }

  private matchesCriteria(value: unknown, criteria: unknown): boolean {
    if (typeof criteria === 'string') {
      const opMatch = criteria.match(/^([><=!]+)(.*)/);
      if (opMatch) {
        const op = opMatch[1];
        const cmpVal = parseFloat(opMatch[2]);
        const numVal = typeof value === 'number' ? value : parseFloat(value as string);
        if (isNaN(numVal) || isNaN(cmpVal)) return false;
        switch (op) {
          case '>': return numVal > cmpVal;
          case '<': return numVal < cmpVal;
          case '>=': return numVal >= cmpVal;
          case '<=': return numVal <= cmpVal;
          case '<>': case '!=': return numVal !== cmpVal;
          case '=': return numVal === cmpVal;
        }
      }
    }
    return value === criteria;
  }

  private findBinaryOperator(expr: string): { left: string; operator: string; right: string } | null {
    let parenDepth = 0;
    // Search from right to left for lowest precedence operators: &, +/-, */
    const precedences = [['&'], ['+', '-'], ['*', '/'], ['^']];

    for (const ops of precedences) {
      for (let i = expr.length - 1; i >= 0; i--) {
        const ch = expr[i];
        if (ch === ')') parenDepth++;
        else if (ch === '(') parenDepth--;
        else if (parenDepth === 0 && ops.includes(ch) && i > 0) {
          // Ensure it's not a unary minus
          if (ch === '-' && (i === 0 || '(+-*/^&,'.includes(expr[i - 1].trim()))) continue;
          return {
            left: expr.substring(0, i).trim(),
            operator: ch,
            right: expr.substring(i + 1).trim(),
          };
        }
      }
    }
    return null;
  }

  private applyOperator(op: string, left: unknown, right: unknown): unknown {
    if (op === '&') return String(left) + String(right);
    const l = Number(left);
    const r = Number(right);
    switch (op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/':
        if (r === 0) return '#DIV/0!';
        return l / r;
      case '^': return Math.pow(l, r);
      default: return 0;
    }
  }

  private splitFunctionArgs(argsStr: string): string[] {
    const args: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of argsStr) {
      if (ch === '(' ) { depth++; current += ch; }
      else if (ch === ')') { depth--; current += ch; }
      else if (ch === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) args.push(current.trim());
    return args;
  }

  private extractCellReferences(expr: string): string[] {
    const refs: string[] = [];
    // Match ranges like A1:B5 and individual cells like A1
    const rangePattern = /([A-Z]+\d+):([A-Z]+\d+)/gi;
    const cellPattern = /\b([A-Z]+\d+)\b/gi;

    let match;
    while ((match = rangePattern.exec(expr)) !== null) {
      const expanded = this.expandRangeRefs(match[1].toUpperCase(), match[2].toUpperCase());
      refs.push(...expanded);
    }

    while ((match = cellPattern.exec(expr)) !== null) {
      const ref = match[1].toUpperCase();
      if (!refs.includes(ref)) refs.push(ref);
    }
    return refs;
  }

  private expandRangeRefs(start: string, end: string): string[] {
    const startCol = this.colToIndex(start.replace(/\d+/g, ''));
    const endCol = this.colToIndex(end.replace(/\d+/g, ''));
    const startRow = parseInt(start.replace(/[A-Z]+/gi, ''), 10);
    const endRow = parseInt(end.replace(/[A-Z]+/gi, ''), 10);

    const refs: string[] = [];
    for (let col = startCol; col <= endCol; col++) {
      for (let row = startRow; row <= endRow; row++) {
        refs.push(`${this.indexToCol(col)}${row}`);
      }
    }
    return refs;
  }

  private expandRange(start: string, end: string, getValue: (ref: string) => unknown): unknown[][] {
    const startCol = this.colToIndex(start.replace(/\d+/g, ''));
    const endCol = this.colToIndex(end.replace(/\d+/g, ''));
    const startRow = parseInt(start.replace(/[A-Z]+/gi, ''), 10);
    const endRow = parseInt(end.replace(/[A-Z]+/gi, ''), 10);

    const result: unknown[][] = [];
    for (let row = startRow; row <= endRow; row++) {
      const rowData: unknown[] = [];
      for (let col = startCol; col <= endCol; col++) {
        const ref = `${this.indexToCol(col)}${row}`;
        rowData.push(getValue(ref));
      }
      result.push(rowData);
    }
    return result;
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

  private topologicalSort(cells: Set<string>, dag: DAG): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (cell: string) => {
      if (visited.has(cell)) return;
      if (visiting.has(cell)) return; // circular — skip
      visiting.add(cell);
      const node = dag.nodes.get(cell);
      if (node) {
        for (const dep of node.dependsOn) {
          if (cells.has(dep)) visit(dep);
        }
      }
      visiting.delete(cell);
      visited.add(cell);
      sorted.push(cell);
    };

    for (const cell of cells) visit(cell);
    return sorted;
  }

  private isTruthy(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0 && value !== 'FALSE';
    return value !== null && value !== undefined;
  }

  private parseLiteral(value: string): unknown {
    const num = parseFloat(value);
    if (!isNaN(num) && String(num) === value) return num;
    if (value.toUpperCase() === 'TRUE') return true;
    if (value.toUpperCase() === 'FALSE') return false;
    return value;
  }
}
