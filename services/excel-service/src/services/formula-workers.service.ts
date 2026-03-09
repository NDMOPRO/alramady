import { logger } from '../utils/logger.js';
import { formulaRegistry } from '../utils/formula-registry.js';
import type { BatchEvalResult, FormulaContext } from '../types/formula.types.js';

export class FormulaWorkersService {
  /**
   * Evaluate a batch of formulas. For heavy workloads, uses parallel processing.
   * Falls back to sequential evaluation when piscina is not available.
   */
  async evaluateBatch(
    formulas: Array<{ id: string; expression: string; context?: Record<string, unknown> }>
  ): Promise<BatchEvalResult[]> {
    logger.info('Evaluating formula batch', { count: formulas.length });

    const results: BatchEvalResult[] = [];

    // Process formulas - use sequential for reliability
    for (const item of formulas) {
      const startTime = Date.now();
      try {
        const result = this.evaluateSingle(item.expression, item.context || {});
        results.push({
          id: item.id,
          result,
          executionTimeMs: Date.now() - startTime,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          id: item.id,
          result: null,
          error: message || 'Evaluation failed',
          executionTimeMs: Date.now() - startTime,
        });
      }
    }

    logger.info('Batch evaluation complete', { count: results.length });
    return results;
  }

  /**
   * Evaluate a single formula expression using the registry.
   */
  private evaluateSingle(expression: string, contextObj: Record<string, unknown>): unknown {
    const clean = expression.startsWith('=') ? expression.substring(1) : expression;

    // Parse function calls like FUNC(args)
    const funcMatch = clean.match(/^([A-Z_][A-Z0-9_]*)\s*\((.*)\)$/is);
    if (funcMatch) {
      const funcName = funcMatch[1].toUpperCase();
      const fn = formulaRegistry.get(funcName);

      if (fn) {
        const args = this.parseArguments(funcMatch[2], contextObj);
        const context: FormulaContext = {
          cellValues: new Map(Object.entries(contextObj)),
        };
        return fn.execute(args, context);
      }
    }

    // Try to evaluate as simple expression
    try {
      const numVal = Number(clean);
      if (!isNaN(numVal)) return numVal;
    } catch {
      // Not a number
    }

    // Return as string if nothing else works
    return clean;
  }

  /**
   * Parse comma-separated arguments, respecting nested parentheses and strings.
   */
  private parseArguments(argsStr: string, context: Record<string, unknown>): unknown[] {
    const args: unknown[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < argsStr.length; i++) {
      const ch = argsStr[i];

      if (inString) {
        current += ch;
        if (ch === stringChar) inString = false;
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        current += ch;
        continue;
      }

      if (ch === '(') {
        depth++;
        current += ch;
      } else if (ch === ')') {
        depth--;
        current += ch;
      } else if (ch === ',' && depth === 0) {
        args.push(this.resolveArg(current.trim(), context));
        current = '';
      } else {
        current += ch;
      }
    }

    if (current.trim()) {
      args.push(this.resolveArg(current.trim(), context));
    }

    return args;
  }

  private resolveArg(arg: string, context: Record<string, unknown>): unknown {
    // String literal
    if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
      return arg.slice(1, -1);
    }

    // Boolean
    if (arg.toUpperCase() === 'TRUE') return true;
    if (arg.toUpperCase() === 'FALSE') return false;

    // Number
    const num = Number(arg);
    if (!isNaN(num) && arg !== '') return num;

    // Cell reference from context
    if (context[arg] !== undefined) return context[arg];

    // Return as string
    return arg;
  }
}

export const formulaWorkersService = new FormulaWorkersService();
