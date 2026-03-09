export type FormulaValue = number | string | boolean | null | FormulaError | FormulaValue[];

export type FormulaError = '#VALUE!' | '#REF!' | '#N/A' | '#DIV/0!' | '#NUM!' | '#NAME?' | '#NULL!' | '#CALC!';

export interface FormulaFunction {
  name: string;
  category: FormulaCategory;
  description: string;
  minArgs: number;
  maxArgs: number;
  isVolatile: boolean;
  returnsArray: boolean;
  execute: (args: FormulaValue[], context: FormulaContext) => FormulaValue;
}

export type FormulaCategory =
  | 'math-trig'
  | 'statistical'
  | 'statistical-advanced'
  | 'lookup-reference'
  | 'text'
  | 'date-time'
  | 'logical'
  | 'financial'
  | 'information'
  | 'dynamic-array'
  | 'database';

export interface FormulaContext {
  cellValues: Map<string, unknown>;
  namedRanges?: Map<string, string>;
  workbookId?: string;
  sheetName?: string;
  currentCell?: string;
}

export interface FormulaOptimization {
  original: string;
  optimized: string;
  reason: string;
  impact: 'high' | 'medium' | 'low';
}

export interface FormulaAuditResult {
  cell: string;
  formula: string;
  issues: FormulaIssue[];
  complexity: number;
  volatileDependencies: string[];
}

export interface FormulaIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

export interface BatchEvalRequest {
  formulas: Array<{ id: string; expression: string; context?: Record<string, unknown> }>;
}

export interface BatchEvalResult {
  id: string;
  result: FormulaValue;
  error?: string;
  executionTimeMs: number;
}

export interface BusinessLogicModel {
  inputs: Array<{ cell: string; name: string; type: string }>;
  outputs: Array<{ cell: string; name: string; formula: string }>;
  rules: Array<{ description: string; formula: string; cells: string[] }>;
  dependencies: Array<{ from: string; to: string }>;
}
