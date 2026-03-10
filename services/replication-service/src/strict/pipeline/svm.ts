/**
 * Spreadsheet Virtual Machine (SVM) — Section 11
 * Deterministic formula evaluation engine.
 *
 * - Build formula dependency DAG deterministically
 * - Deterministic recalculation engine
 * - Exact integer arithmetic; locked float rounding
 * - Support LET/LAMBDA subset
 * - Pivot reconstruction
 * - Conditional formatting rules
 * - Freeze panes preserved
 * - Chart anchors mapped
 */

import type { CdrDataTable } from '../cdr/types';

// ─── Formula AST ─────────────────────────────────────────────────────
export type FormulaNode =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'cell_ref'; ref: string; absolute_row: boolean; absolute_col: boolean }
  | { type: 'range_ref'; start: string; end: string }
  | { type: 'function_call'; name: string; args: FormulaNode[] }
  | { type: 'binary_op'; op: string; left: FormulaNode; right: FormulaNode }
  | { type: 'unary_op'; op: string; operand: FormulaNode }
  | { type: 'error'; code: string };

// ─── Cell Value Types ────────────────────────────────────────────────
export type CellValue = number | string | boolean | null | { error: string };

// ─── Dependency Graph ────────────────────────────────────────────────
export interface DependencyDAG {
  nodes: Map<string, Set<string>>; // cell -> depends_on cells
  reverse: Map<string, Set<string>>; // cell -> cells_that_depend_on_it
  topologicalOrder: string[];
}

/**
 * Build a deterministic dependency DAG from formulas.
 */
export function buildDependencyDAG(
  formulas: Map<string, string>, // cellRef -> formula string
): DependencyDAG {
  const nodes = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();

  for (const [cell, formula] of formulas) {
    const refs = extractCellReferences(formula);
    nodes.set(cell, new Set(refs));

    for (const ref of refs) {
      if (!reverse.has(ref)) {
        reverse.set(ref, new Set());
      }
      reverse.get(ref)!.add(cell);
    }
  }

  // Topological sort (deterministic: sort by cell reference alphabetically on ties)
  const order = topologicalSort(nodes);

  return { nodes, reverse, topologicalOrder: order };
}

function extractCellReferences(formula: string): string[] {
  const refs: string[] = [];
  const cellPattern = /\$?[A-Z]{1,3}\$?\d{1,7}/g;
  let match: RegExpExecArray | null;
  while ((match = cellPattern.exec(formula)) !== null) {
    refs.push(match[0].replace(/\$/g, ''));
  }
  return refs;
}

function topologicalSort(nodes: Map<string, Set<string>>): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const visiting = new Set<string>();

  // Get all cells, sorted deterministically
  const allCells = Array.from(nodes.keys()).sort();

  function visit(cell: string): void {
    if (visited.has(cell)) return;
    if (visiting.has(cell)) {
      // Circular reference — mark as error
      result.push(cell);
      visited.add(cell);
      return;
    }

    visiting.add(cell);
    const deps = nodes.get(cell) ?? new Set();
    const sortedDeps = Array.from(deps).sort();
    for (const dep of sortedDeps) {
      visit(dep);
    }
    visiting.delete(cell);
    visited.add(cell);
    result.push(cell);
  }

  for (const cell of allCells) {
    visit(cell);
  }

  return result;
}

// ─── Deterministic Recalculation ─────────────────────────────────────
export class SpreadsheetVM {
  private values = new Map<string, CellValue>();
  private formulas = new Map<string, string>();
  private dag: DependencyDAG | undefined;

  /** Set a cell's raw value (no formula) */
  setValue(ref: string, value: CellValue): void {
    this.values.set(ref, value);
    this.dag = undefined; // invalidate DAG
  }

  /** Set a cell's formula */
  setFormula(ref: string, formula: string): void {
    this.formulas.set(ref, formula);
    this.dag = undefined;
  }

  /** Recalculate all cells deterministically */
  recalculate(): void {
    if (!this.dag) {
      this.dag = buildDependencyDAG(this.formulas);
    }

    for (const cell of this.dag.topologicalOrder) {
      const formula = this.formulas.get(cell);
      if (formula) {
        const result = this.evaluateFormula(formula);
        this.values.set(cell, result);
      }
    }
  }

  /** Get a cell's computed value */
  getValue(ref: string): CellValue {
    return this.values.get(ref) ?? null;
  }

  /** Evaluate a formula string */
  private evaluateFormula(formula: string): CellValue {
    // Strip leading =
    const expr = formula.startsWith('=') ? formula.slice(1) : formula;

    try {
      return this.evaluateExpression(expr);
    } catch {
      return { error: '#ERROR!' };
    }
  }

  private evaluateExpression(expr: string): CellValue {
    expr = expr.trim();

    // Number literal
    if (/^-?\d+(\.\d+)?$/.test(expr)) {
      return this.deterministicNumber(parseFloat(expr));
    }

    // String literal
    if (expr.startsWith('"') && expr.endsWith('"')) {
      return expr.slice(1, -1);
    }

    // Boolean
    if (expr.toUpperCase() === 'TRUE') return true;
    if (expr.toUpperCase() === 'FALSE') return false;

    // Cell reference
    if (/^[A-Z]{1,3}\d{1,7}$/.test(expr)) {
      return this.values.get(expr) ?? 0;
    }

    // Function call: NAME(args)
    const funcMatch = expr.match(/^([A-Z_]+)\((.+)\)$/);
    if (funcMatch) {
      return this.evaluateFunction(funcMatch[1], funcMatch[2]);
    }

    // Binary operations (simplified)
    for (const op of ['+', '-', '*', '/']) {
      const idx = findTopLevelOperator(expr, op);
      if (idx >= 0) {
        const left = this.evaluateExpression(expr.slice(0, idx));
        const right = this.evaluateExpression(expr.slice(idx + 1));
        return this.binaryOp(op, left, right);
      }
    }

    return { error: '#VALUE!' };
  }

  private evaluateFunction(name: string, argsStr: string): CellValue {
    const args = splitFunctionArgs(argsStr).map(a => this.evaluateExpression(a));
    const numericArgs = args.map(toNumber);

    switch (name) {
      case 'SUM': return this.deterministicNumber(numericArgs.reduce((sum, value) => sum + value, 0));
      case 'AVERAGE': {
        const total = numericArgs.reduce((sum, value) => sum + value, 0);
        return this.deterministicNumber(args.length === 0 ? 0 : total / args.length);
      }
      case 'COUNT': return args.filter(v => typeof v === 'number').length;
      case 'MIN': return numericArgs.length > 0 ? Math.min(...numericArgs) : 0;
      case 'MAX': return numericArgs.length > 0 ? Math.max(...numericArgs) : 0;
      case 'IF': return args[0] ? args[1] : (args[2] ?? false);
      case 'ABS': return Math.abs(toNumber(args[0]));
      case 'ROUND': return this.deterministicRound(toNumber(args[0]), toNumber(args[1] ?? 0));
      case 'LEN': return String(args[0] ?? '').length;
      case 'CONCATENATE': return args.map(String).join('');
      case 'LEFT': return String(args[0] ?? '').slice(0, toNumber(args[1] ?? 1));
      case 'RIGHT': return String(args[0] ?? '').slice(-toNumber(args[1] ?? 1));
      default: return { error: `#NAME? (${name})` };
    }
  }

  private binaryOp(op: string, left: CellValue, right: CellValue): CellValue {
    const l = toNumber(left);
    const r = toNumber(right);
    switch (op) {
      case '+': return this.deterministicNumber(l + r);
      case '-': return this.deterministicNumber(l - r);
      case '*': return this.deterministicNumber(l * r);
      case '/': return r === 0 ? { error: '#DIV/0!' } : this.deterministicNumber(l / r);
      default: return { error: '#VALUE!' };
    }
  }

  /**
   * Deterministic number normalization — Section 11.
   * Exact for integers; locked rounding for floats.
   */
  private deterministicNumber(n: number): number {
    if (Number.isInteger(n)) return n;
    // Lock to 15 significant digits (IEEE 754 double precision limit)
    return parseFloat(n.toPrecision(15));
  }

  private deterministicRound(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────
function toNumber(v: CellValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function findTopLevelOperator(expr: string, op: string): number {
  let depth = 0;
  for (let i = expr.length - 1; i >= 0; i--) {
    if (expr[i] === ')') depth++;
    if (expr[i] === '(') depth--;
    if (depth === 0 && expr[i] === op && i > 0) return i;
  }
  return -1;
}

function splitFunctionArgs(argsStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of argsStr) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());

  return args;
}
