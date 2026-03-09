/**
 * Worker script for heavy formula computation.
 * Used by piscina for parallel evaluation when available.
 */

interface WorkerInput {
  expression: string;
  context: Record<string, unknown>;
}

interface WorkerOutput {
  result: unknown;
  error?: string;
}

export default function evaluate(input: WorkerInput): WorkerOutput {
  try {
    const { expression, context } = input;
    const clean = expression.startsWith('=') ? expression.substring(1) : expression;

    // Simple numeric evaluation
    const num = Number(clean);
    if (!isNaN(num) && clean !== '') {
      return { result: num };
    }

    // Basic arithmetic evaluation (safe subset)
    const safeExpr = clean.replace(/[A-Z]+\d+/gi, (ref) => {
      const val = context[ref];
      return val !== undefined ? String(val) : '0';
    });

    // Only allow safe characters for evaluation
    if (/^[\d\s+\-*/().,%]+$/.test(safeExpr)) {
      const result = Function(`"use strict"; return (${safeExpr})`)();
      return { result };
    }

    return { result: clean };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: null, error: message };
  }
}
