import { api } from '@/lib/api';

// --- Interfaces ---

export interface FormulaInput {
  fileId: string;
  sheetName: string;
  cell: string;
  formula: string;
}

export interface FormulaResult {
  cell: string;
  formula: string;
  computedValue: unknown;
  type: 'number' | 'string' | 'boolean' | 'date' | 'error';
}

export interface FormulaSuggestInput {
  fileId: string;
  sheetName: string;
  description: string;
  language?: 'ar' | 'en';
}

export interface FormulaSuggestion {
  formula: string;
  explanation: string;
  explanationAr: string;
  confidence: number;
}

export interface FormulaValidateInput {
  formula: string;
  context?: {
    sheetName?: string;
    availableRanges?: string[];
  };
}

export interface FormulaValidationResult {
  valid: boolean;
  errors: { message: string; position?: number }[];
  warnings: { message: string }[];
}

export interface MonteCarloInput {
  fileId: string;
  sheetName: string;
  targetCell: string;
  variableCells: MonteCarloVariable[];
  iterations: number;
  confidenceLevel?: number;
}

export interface MonteCarloVariable {
  cell: string;
  distribution: 'normal' | 'uniform' | 'triangular' | 'lognormal';
  params: Record<string, number>;
}

export interface MonteCarloResult {
  jobId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  result?: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    percentiles: Record<string, number>;
    histogram: { binStart: number; binEnd: number; count: number }[];
    confidenceInterval: { lower: number; upper: number };
    iterations: number;
  };
}

export interface FormattingInput {
  fileId: string;
  sheetName: string;
  range: string;
  formatting: CellFormatting;
}

export interface CellFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  numberFormat?: string;
  alignment?: 'right' | 'center' | 'left';
  direction?: 'rtl' | 'ltr';
  borders?: {
    top?: BorderStyle;
    bottom?: BorderStyle;
    left?: BorderStyle;
    right?: BorderStyle;
  };
  wrapText?: boolean;
  merge?: boolean;
}

export interface BorderStyle {
  style: 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted';
  color: string;
}

export interface FormattingResult {
  applied: boolean;
  range: string;
  cellCount: number;
}

export interface ConditionalFormatInput {
  fileId: string;
  sheetName: string;
  range: string;
  rules: ConditionalRule[];
}

export interface ConditionalRule {
  type: 'cellValue' | 'colorScale' | 'dataBar' | 'iconSet' | 'formula';
  operator?: 'greaterThan' | 'lessThan' | 'between' | 'equal' | 'notEqual';
  values: unknown[];
  formatting: Partial<CellFormatting>;
}

export interface SheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
  usedRange: string;
}

export interface ExcelFileInfo {
  fileId: string;
  fileName: string;
  sheets: SheetInfo[];
  size: number;
}

export interface ReadRangeInput {
  fileId: string;
  sheetName: string;
  range: string;
}

export interface RangeData {
  range: string;
  values: unknown[][];
  formulas: string[][];
  formats: Partial<CellFormatting>[][];
}

interface ApiSuccess<T> {
  success: boolean;
  data: T;
}

interface ApiOk {
  success: boolean;
}

// --- API ---

export const excelApi = {
  // File info
  getFileInfo: (fileId: string) =>
    api.get<ApiSuccess<ExcelFileInfo>>(`/api/v1/excel/${fileId}/info`),

  readRange: (input: ReadRangeInput) =>
    api.post<ApiSuccess<RangeData>>(`/api/v1/excel/${input.fileId}/read`, {
      sheetName: input.sheetName,
      range: input.range,
    }),

  // Formulas
  setFormula: (input: FormulaInput) =>
    api.post<ApiSuccess<FormulaResult>>(`/api/v1/excel/${input.fileId}/formulas`, {
      sheetName: input.sheetName,
      cell: input.cell,
      formula: input.formula,
    }),

  suggestFormula: (input: FormulaSuggestInput) =>
    api.post<ApiSuccess<FormulaSuggestion[]>>(`/api/v1/excel/${input.fileId}/formulas/suggest`, {
      sheetName: input.sheetName,
      description: input.description,
      language: input.language,
    }),

  validateFormula: (input: FormulaValidateInput) =>
    api.post<ApiSuccess<FormulaValidationResult>>('/api/v1/excel/formulas/validate', input),

  // Monte Carlo Simulation
  startMonteCarlo: (input: MonteCarloInput) =>
    api.post<ApiSuccess<MonteCarloResult>>(`/api/v1/excel/${input.fileId}/monte-carlo`, {
      sheetName: input.sheetName,
      targetCell: input.targetCell,
      variableCells: input.variableCells,
      iterations: input.iterations,
      confidenceLevel: input.confidenceLevel,
    }),

  getMonteCarloStatus: (fileId: string, jobId: string) =>
    api.get<ApiSuccess<MonteCarloResult>>(`/api/v1/excel/${fileId}/monte-carlo/${jobId}`),

  // Formatting
  applyFormatting: (input: FormattingInput) =>
    api.post<ApiSuccess<FormattingResult>>(`/api/v1/excel/${input.fileId}/formatting`, {
      sheetName: input.sheetName,
      range: input.range,
      formatting: input.formatting,
    }),

  applyConditionalFormat: (input: ConditionalFormatInput) =>
    api.post<ApiOk>(`/api/v1/excel/${input.fileId}/formatting/conditional`, {
      sheetName: input.sheetName,
      range: input.range,
      rules: input.rules,
    }),

  // Auto-format (AI-driven)
  autoFormat: (fileId: string, sheetName: string) =>
    api.post<ApiSuccess<FormattingResult>>(`/api/v1/excel/${fileId}/formatting/auto`, { sheetName }),
};
