import type { Fingerprint, MatchReport, MatchDetail, BrandIdentity, CellRange } from './common.types.js';

export interface ExcelDimensions {
  sheets: Array<{
    name: string;
    rowCount: number;
    colCount: number;
    columnWidths: Record<number, number>;
    rowHeights: Record<number, number>;
    mergedCells: Array<{ start: string; end: string }>;
    frozenPane?: { row: number; col: number };
    hiddenRows: number[];
    hiddenCols: number[];
  }>;
}

export interface ExcelStructure {
  sheets: Array<{
    name: string;
    formulas: Array<{ cell: string; formula: string }>;
    namedRanges: Array<{ name: string; range: string }>;
    conditionalFormats: Array<{ range: string; rules: unknown[] }>;
    dataValidations: Array<{ range: string; rules: unknown }>;
    charts: Array<{ type: string; range: string }>;
    tables: Array<{ name: string; range: string }>;
  }>;
}

export interface MatchColumnConfig {
  sourceColumn: string;
  targetColumn: string;
  matchType: 'exact' | 'fuzzy' | 'contains' | 'regex';
  threshold?: number;
  caseSensitive?: boolean;
}

export interface FuzzyMatchResult {
  sourceRow: number;
  targetRow: number;
  score: number;
  matchedFields: Array<{ field: string; score: number }>;
}

export interface DeduplicationResult {
  totalRows: number;
  uniqueRows: number;
  duplicatesRemoved: number;
  duplicateGroups: Array<{ rows: number[]; key: string }>;
}

export interface ReplicationResult {
  sourceId: string;
  targetId: string;
  replicatedSheets: number;
  replicatedFormulas: number;
  replicatedFormats: number;
  replicatedDimensions: boolean;
  warnings: string[];
}

export interface BrandComplianceResult {
  compliant: boolean;
  score: number;
  checks: Array<{
    name: string;
    passed: boolean;
    expected: unknown;
    actual: unknown;
    message: string;
  }>;
}

export { Fingerprint, MatchReport, MatchDetail, BrandIdentity, CellRange };
