export interface CellAddress {
  row: number;
  col: number;
  sheet?: string;
  absolute?: { row: boolean; col: boolean };
}

export interface CellRange {
  start: CellAddress;
  end: CellAddress;
  sheet?: string;
}

export interface CellValue {
  value: unknown;
  formula?: string;
  type: CellValueType;
  format?: string;
}

export type CellValueType = 'number' | 'string' | 'boolean' | 'date' | 'error' | 'null';

export interface WorkbookContext {
  workbookId: string;
  sheets: Map<string, SheetData>;
  namedRanges: Map<string, CellRange>;
  metadata: Record<string, unknown>;
}

export interface SheetData {
  name: string;
  index: number;
  cells: Map<string, CellValue>;
  dimensions: SheetDimensions;
  mergedCells: CellRange[];
  hiddenRows: number[];
  hiddenCols: number[];
  frozenPane?: { row: number; col: number };
}

export interface SheetDimensions {
  rowCount: number;
  colCount: number;
  columnWidths: Map<number, number>;
  rowHeights: Map<number, number>;
}

export interface MatchReport {
  overallScore: number;
  dimensionScore: number;
  structureScore: number;
  formattingScore: number;
  formulaScore: number;
  details: MatchDetail[];
}

export interface MatchDetail {
  category: string;
  item: string;
  source: unknown;
  target: unknown;
  match: boolean;
  score: number;
}

export interface Fingerprint {
  hash: string;
  dimensions: Record<string, unknown>;
  structure: Record<string, unknown>;
  formatting: Record<string, unknown>;
  formulas: Record<string, unknown>;
  createdAt: string;
}

export interface BrandIdentity {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  headerFontFamily?: string;
  logo?: string;
  watermark?: string;
}

export interface LocaleConfig {
  locale: string;
  dateFormat: string;
  numberFormat: { decimal: string; thousands: string; currency: string };
  direction: 'ltr' | 'rtl';
  calendar: 'gregorian' | 'hijri';
  firstDayOfWeek: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
}
