import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, extname, join } from 'path';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { create, all } from 'mathjs';
import { EXCEL_TOOL_DEFINITIONS, validateExcelToolContract } from './excel-tool-contracts.js';

const math = create(all, {});

export type EngineMode = 'SMART' | 'PRO';
export type ArabicMode = 'BASIC' | 'PROFESSIONAL' | 'ELITE';
export type ColumnDType = 'string' | 'int' | 'float' | 'bool' | 'date' | 'datetime' | 'currency' | 'percent' | 'json' | 'unknown';
export type RecipeKind = 'TIR' | 'COMPARE' | 'CLEAN' | 'FORMAT';

export interface ExcelActionContext {
  workspace_id: string;
  user_id: string;
  mode: EngineMode;
  arabic_mode: ArabicMode;
  locale: string;
  [key: string]: unknown;
}

export interface ExcelAssetRef {
  asset_id: string;
  uri: string;
  mime: string;
  sha256: string;
  size_bytes: number;
}

export interface DatasetRef {
  dataset_id: string;
  row_count_est: number;
  column_count: number;
}

export interface TableRef {
  table_id: string;
  dataset_id: string;
  name: string;
}

export interface ColumnRef {
  column_id: string;
  table_id: string;
  name: string;
  dtype: ColumnDType;
}

export interface RecipeRef {
  recipe_id: string;
  kind: RecipeKind;
  version: string;
}

export interface ArtifactRef {
  artifact_id: string;
  kind: 'xlsx' | 'csv' | 'parquet' | 'pdf' | 'pptx' | 'dashboard' | 'json';
  uri: string;
}

export interface ToolWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface ExcelToolRequest<TInputs = Record<string, unknown>, TParams = Record<string, unknown>> {
  request_id: string;
  tool_id: string;
  context: ExcelActionContext;
  inputs: TInputs;
  params: TParams;
}

export interface ExcelToolResponse<TRefs = Record<string, unknown>> {
  request_id: string;
  tool_id: string;
  status: 'ok' | 'failed';
  refs: TRefs;
  warnings?: ToolWarning[];
  failure?: {
    code: string;
    message: string;
  };
}

interface ColumnModel extends ColumnRef {
  original_name: string;
  alias?: string;
  semantic_label?: string;
  sensitivity_label?: string;
  null_ratio: number;
  unique_count: number;
  fingerprint: string;
  sample_values: string[];
  table_name: string;
}

interface TableRow extends Record<string, unknown> {
  __row_lineage_id: string;
}

interface TableModel extends TableRef {
  sheet_id: string;
  asset_id?: string;
  columns: ColumnModel[];
  rows: TableRow[];
  formatting?: {
    rtl?: boolean;
    style_level?: 'standard' | 'premium';
  };
}

interface DatasetModel extends DatasetRef {
  assets: ExcelAssetRef[];
  table_ids: string[];
  content_map: Record<string, unknown>;
  quality_summary: Record<string, unknown>;
  domain: string;
  knowledge_graph: Record<string, unknown>;
}

interface RecipeModel extends RecipeRef {
  name: string;
  steps: Array<Record<string, unknown>>;
  source_table_id?: string;
  source_table_name?: string;
  formatting?: TableModel['formatting'];
}

interface ArtifactModel {
  artifact: ArtifactRef;
  dataset_id?: string;
  table_ids?: string[];
  sha256: string;
  evidence_uri?: string;
}

const runtimeDir = join(tmpdir(), 'rasid-excel-ultra-runtime');
mkdirSync(runtimeDir, { recursive: true });

const datasetStore = new Map<string, DatasetModel>();
const tableStore = new Map<string, TableModel>();
const recipeStore = new Map<string, RecipeModel>();
const artifactStore = new Map<string, ArtifactModel>();

function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\-\/\\]+/g, '_')
    .replace(/[^\p{L}\p{N}_]+/gu, '')
    .replace(/^_+|_+$/g, '') || 'column';
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'result' in (value as Record<string, unknown>)) {
    return valueToText((value as Record<string, unknown>).result);
  }
  return JSON.stringify(value);
}

function parseScalar(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  if (!text) return null;
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number.parseFloat(text);
  return text;
}

function toNumeric(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  const normalized = text.replace(/,/g, '').replace(/[^\d.\-]/g, '');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getArrayCell<T>(row: T[], index: number): T | null {
  return index < row.length ? row[index] ?? null : null;
}

function detectSensitivity(name: string, samples: string[]): string | undefined {
  const value = `${name} ${samples.join(' ')}`.toLowerCase();
  if (/email|@/.test(value)) return 'pii_email';
  if (/phone|mobile|\+966|\d{9,}/.test(value)) return 'pii_phone';
  if (/national|ssn|passport|هوية/.test(value)) return 'pii_id';
  return undefined;
}

function inferDomain(headers: string[]): string {
  const joined = headers.join(' ').toLowerCase();
  if (/revenue|sales|region|customer|profit|mrr|arr/.test(joined)) return 'sales';
  if (/employee|salary|department|attendance|vacation/.test(joined)) return 'hr';
  if (/invoice|ledger|expense|budget|gl|payable/.test(joined)) return 'finance';
  return 'ops';
}

function inferSemanticLabel(name: string, samples: string[]): string {
  const value = `${name} ${samples.join(' ')}`.toLowerCase();
  if (/customer|client|عميل/.test(value)) return /id|code|رقم/.test(value) ? 'customer_id' : 'customer';
  if (/region|city|country|state|منطقة|مدينة|دولة/.test(value)) return 'region';
  if (/date|month|year|quarter|period|تاريخ|شهر|ربع|سنة/.test(value)) return 'time';
  if (/revenue|sales|profit|cost|amount|price|budget|expense|مبيعات|ربح|تكلفة/.test(value)) return 'measure';
  if (/employee|staff|dept|department|employee_id|موظف|قسم/.test(value)) return /id|رقم/.test(value) ? 'employee_id' : 'employee';
  return normalizeToken(name);
}

function inferDType(values: unknown[], name: string): ColumnDType {
  const texts = values.map(valueToText).filter(Boolean);
  if (texts.length === 0) return 'unknown';
  if (/id|code|رقم/.test(name.toLowerCase())) return 'string';
  if (texts.every(value => /^(true|false)$/i.test(value))) return 'bool';
  if (texts.every(value => /^-?\d+$/.test(value))) return 'int';
  if (texts.every(value => /^-?\d+(\.\d+)?$/.test(value))) return 'float';
  if (texts.every(value => /^-?\d+(\.\d+)?%$/.test(value))) return 'percent';
  if (texts.every(value => !Number.isNaN(Date.parse(value)))) {
    return texts.some(value => value.includes('T') || value.includes(':')) ? 'datetime' : 'date';
  }
  if (texts.every(value => /^{.*}$|^\[.*\]$/.test(value))) return 'json';
  if (/amount|revenue|sales|cost|price|budget|expense|profit/i.test(name)) return 'currency';
  return 'string';
}

function computeFingerprint(name: string, dtype: ColumnDType, values: unknown[]): string {
  const sample = values.slice(0, 25).map(valueToText);
  const shape = sample.map(value => value.replace(/[A-Za-z\u0600-\u06FF]+/g, 'A').replace(/\d+/g, '9'));
  return hashValue({
    name: normalizeToken(name),
    dtype,
    shape,
    unique: new Set(sample).size,
  });
}

function tokenize(value: string): string[] {
  return normalizeToken(value).split('_').filter(Boolean);
}

function jaccard(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter(token => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function stableSortRows(rows: TableRow[], column: string, direction: 'asc' | 'desc' = 'asc'): TableRow[] {
  return [...rows].sort((left, right) => {
    const leftValue = left[column];
    const rightValue = right[column];
    const leftComparable = valueToText(leftValue);
    const rightComparable = valueToText(rightValue);
    if (leftComparable === rightComparable) {
      return left.__row_lineage_id.localeCompare(right.__row_lineage_id);
    }
    const sortValue = leftComparable.localeCompare(rightComparable, undefined, { numeric: true, sensitivity: 'base' });
    return direction === 'asc' ? sortValue : -sortValue;
  });
}

function sheetSafeName(name: string, usedNames: Set<string>): string {
  const base = name.replace(/[:\\/?*\[\]]/g, '_').slice(0, 31) || 'Sheet';
  let candidate = base;
  let index = 1;
  while (usedNames.has(candidate)) {
    const suffix = `_${index}`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function makeDatasetRef(dataset: DatasetModel): DatasetRef {
  return {
    dataset_id: dataset.dataset_id,
    row_count_est: dataset.row_count_est,
    column_count: dataset.column_count,
  };
}

function makeTableRef(table: TableModel): TableRef {
  return {
    table_id: table.table_id,
    dataset_id: table.dataset_id,
    name: table.name,
  };
}

function makeRecipeRef(recipe: RecipeModel): RecipeRef {
  return {
    recipe_id: recipe.recipe_id,
    kind: recipe.kind,
    version: recipe.version,
  };
}

function requireDataset(refOrId: DatasetRef | string): DatasetModel {
  const id = typeof refOrId === 'string' ? refOrId : refOrId.dataset_id;
  const dataset = datasetStore.get(id);
  if (!dataset) throw new Error(`Dataset not found: ${id}`);
  return dataset;
}

function requireTable(refOrId: TableRef | string): TableModel {
  const id = typeof refOrId === 'string' ? refOrId : refOrId.table_id;
  const table = tableStore.get(id);
  if (!table) throw new Error(`Table not found: ${id}`);
  return table;
}

function requireRecipe(refOrId: RecipeRef | string): RecipeModel {
  const id = typeof refOrId === 'string' ? refOrId : refOrId.recipe_id;
  const recipe = recipeStore.get(id);
  if (!recipe) throw new Error(`Recipe not found: ${id}`);
  return recipe;
}

function requireColumn(ref: ColumnRef): ColumnModel {
  const table = requireTable(ref.table_id);
  const column = table.columns.find(entry => entry.column_id === ref.column_id);
  if (!column) throw new Error(`Column not found: ${ref.column_id}`);
  return column;
}

function resolveAssetPath(uri: string): string {
  if (existsSync(uri)) return uri;
  if (uri.startsWith('file:///')) {
    const normalized = uri.replace('file:///', '');
    if (existsSync(normalized)) return normalized;
  }
  if (uri.startsWith('file://')) {
    const normalized = uri.replace('file://', '');
    if (existsSync(normalized)) return normalized;
  }
  throw new Error(`Asset not found on disk: ${uri}`);
}

function detectHeaderRow(rows: unknown[][]): number {
  const scanRows = rows.slice(0, Math.min(rows.length, 10));
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  scanRows.forEach((row, index) => {
    const cells = row.map(valueToText);
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length === 0) return;
    const stringRatio = nonEmpty.filter(value => Number.isNaN(Number(value))).length / nonEmpty.length;
    const uniqueRatio = new Set(nonEmpty.map(value => value.toLowerCase())).size / nonEmpty.length;
    const emptyPenalty = (cells.length - nonEmpty.length) / Math.max(1, cells.length);
    const score = (stringRatio * 0.6) + (uniqueRatio * 0.3) - (emptyPenalty * 0.2);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function buildColumnModels(
  tableId: string,
  tableName: string,
  rows: TableRow[],
  existingColumns: ColumnModel[] = [],
): ColumnModel[] {
  const keys = rows.length > 0
    ? Object.keys(rows[0]).filter(key => key !== '__row_lineage_id')
    : existingColumns.map(column => column.name);

  return keys.map((key, index) => {
    const existing = existingColumns.find(column => column.name === key);
    const values = rows.map(row => row[key]);
    const sampleValues = values.map(valueToText).filter(Boolean).slice(0, 25);
    const dtype = inferDType(values, key);
    const nullCount = values.filter(value => value === null || value === undefined || valueToText(value) === '').length;
    return {
      column_id: existing?.column_id ?? createId(`col${index}`),
      table_id: tableId,
      name: key,
      dtype,
      original_name: existing?.original_name ?? key,
      alias: existing?.alias,
      semantic_label: existing?.semantic_label ?? inferSemanticLabel(key, sampleValues),
      sensitivity_label: existing?.sensitivity_label ?? detectSensitivity(key, sampleValues),
      null_ratio: values.length === 0 ? 0 : nullCount / values.length,
      unique_count: new Set(values.map(valueToText)).size,
      fingerprint: computeFingerprint(key, dtype, values),
      sample_values: sampleValues,
      table_name: tableName,
    };
  });
}

function buildContentMap(dataset: DatasetModel, tables: TableModel[]): Record<string, unknown> {
  return {
    dataset_id: dataset.dataset_id,
    assets: dataset.assets.map(asset => ({
      asset_id: asset.asset_id,
      mime: asset.mime,
      uri: asset.uri,
      tables: tables
        .filter(table => table.asset_id === asset.asset_id)
        .map(table => ({
          table_id: table.table_id,
          sheet_id: table.sheet_id,
          name: table.name,
          row_count: table.rows.length,
          column_count: table.columns.length,
          columns: table.columns.map(column => ({
            column_id: column.column_id,
            name: column.name,
            alias: column.alias,
            dtype: column.dtype,
            semantic_label: column.semantic_label,
            sensitivity_label: column.sensitivity_label,
          })),
        })),
    })),
  };
}

function buildQualitySummary(tables: TableModel[]): Record<string, unknown> {
  const qualityDetails = tables.map(table => {
    const rowCount = table.rows.length;
    const duplicateRows = new Set<string>();
    let duplicates = 0;

    for (const row of table.rows) {
      const signature = hashValue(Object.fromEntries(
        Object.entries(row).filter(([key]) => key !== '__row_lineage_id'),
      ));
      if (duplicateRows.has(signature)) {
        duplicates += 1;
      } else {
        duplicateRows.add(signature);
      }
    }

    const nullRatio = table.columns.length === 0
      ? 0
      : table.columns.reduce((sum, column) => sum + column.null_ratio, 0) / table.columns.length;
    const sensitiveColumns = table.columns.filter(column => column.sensitivity_label).map(column => column.name);
    const score = Math.max(0, Math.round(100 - (nullRatio * 40) - ((duplicates / Math.max(1, rowCount)) * 30) - (sensitiveColumns.length * 2)));

    return {
      table_id: table.table_id,
      table_name: table.name,
      row_count: rowCount,
      column_count: table.columns.length,
      null_ratio_avg: Number(nullRatio.toFixed(4)),
      duplicate_rows: duplicates,
      sensitive_columns: sensitiveColumns,
      quality_score: score,
    };
  });

  return {
    total_tables: tables.length,
    total_rows: tables.reduce((sum, table) => sum + table.rows.length, 0),
    total_columns: tables.reduce((sum, table) => sum + table.columns.length, 0),
    average_quality_score: qualityDetails.length === 0
      ? 0
      : Math.round(qualityDetails.reduce((sum, entry) => sum + Number(entry.quality_score), 0) / qualityDetails.length),
    tables: qualityDetails,
  };
}

function buildKnowledgeGraph(tables: TableModel[]): Record<string, unknown> {
  const keyColumns = tables.flatMap(table => table.columns
    .filter(column => column.unique_count >= Math.max(1, Math.floor(table.rows.length * 0.8)) && column.null_ratio < 0.1)
    .map(column => ({
      table_id: table.table_id,
      table_name: table.name,
      column_name: column.name,
      semantic_label: column.semantic_label,
    })));

  const timeDimensions = tables.flatMap(table => table.columns
    .filter(column => column.semantic_label === 'time' || column.dtype === 'date' || column.dtype === 'datetime')
    .map(column => ({
      table_id: table.table_id,
      column_name: column.name,
    })));

  return {
    entities: tables.map(table => ({
      table_id: table.table_id,
      table_name: table.name,
      semantic_tags: [...new Set(table.columns.map(column => column.semantic_label).filter(Boolean))],
    })),
    keys: keyColumns,
    time_dimensions: timeDimensions,
  };
}

function refreshDataset(datasetId: string): DatasetModel {
  const dataset = requireDataset(datasetId);
  const tables = dataset.table_ids
    .map(tableId => tableStore.get(tableId))
    .filter((table): table is TableModel => Boolean(table));

  dataset.row_count_est = tables.reduce((sum, table) => sum + table.rows.length, 0);
  dataset.column_count = tables.reduce((sum, table) => sum + table.columns.length, 0);
  dataset.domain = inferDomain(tables.flatMap(table => table.columns.map(column => column.name)));
  dataset.content_map = buildContentMap(dataset, tables);
  dataset.quality_summary = buildQualitySummary(tables);
  dataset.knowledge_graph = buildKnowledgeGraph(tables);
  datasetStore.set(dataset.dataset_id, dataset);
  return dataset;
}

function registerTable(table: TableModel): TableModel {
  table.columns = buildColumnModels(table.table_id, table.name, table.rows, table.columns);
  tableStore.set(table.table_id, table);
  refreshDataset(table.dataset_id);
  return table;
}

function readCsvMatrix(filePath: string): unknown[][] {
  const content = readFileSync(filePath, 'utf8');
  const parsed = Papa.parse<string[]>(content, {
    skipEmptyLines: 'greedy',
  });
  return parsed.data.map(row => row.map(cell => parseScalar(cell)));
}

function readWorkbookMatrices(filePath: string): Array<{ sheetName: string; rows: unknown[][] }> {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  return workbook.SheetNames.map(sheetName => ({
    sheetName,
    rows: (XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      blankrows: false,
      raw: false,
    }) as unknown[][]).map(row => row.map(cell => parseScalar(cell))),
  })).filter(sheet => sheet.rows.some(row => row.some(value => value !== null && value !== '')));
}

function matrixToTable(
  datasetId: string,
  asset: ExcelAssetRef,
  sheetName: string,
  rows: unknown[][],
): TableModel | null {
  const normalizedRows = rows
    .map(row => row.map(cell => parseScalar(cell)))
    .filter(row => row.some(value => value !== null && valueToText(value) !== ''));

  if (normalizedRows.length === 0) return null;

  const headerRowIndex = detectHeaderRow(normalizedRows);
  const headerRow = normalizedRows[headerRowIndex];
  const dataRows = normalizedRows.slice(headerRowIndex + 1)
    .filter(row => row.some(value => value !== null && valueToText(value) !== ''));

  const headers = headerRow.map((value, index) => {
    const base = normalizeToken(valueToText(value) || `column_${index + 1}`);
    return base || `column_${index + 1}`;
  });

  const uniqueHeaders = headers.map((header, index) => {
    const collisions = headers.slice(0, index).filter(previous => previous === header).length;
    return collisions === 0 ? header : `${header}_${collisions + 1}`;
  });

  const tableId = createId('table');
  const tableName = `${basename(asset.uri, extname(asset.uri))}_${normalizeToken(sheetName)}`.slice(0, 64);
  const lineagedRows: TableRow[] = dataRows.map((row, rowIndex) => {
    const record: TableRow = {
      __row_lineage_id: `${asset.asset_id}:${sheetName}:${rowIndex + 1}`,
    };
    uniqueHeaders.forEach((header, columnIndex) => {
      record[header] = getArrayCell(row, columnIndex);
    });
    return record;
  });

  const table: TableModel = {
    table_id: tableId,
    dataset_id: datasetId,
    name: tableName || `table_${sheetName}`,
    sheet_id: `${asset.asset_id}:${sheetName}`,
    asset_id: asset.asset_id,
    columns: [],
    rows: lineagedRows,
  };

  return registerTable(table);
}

function collectColumns(dataset: DatasetModel): ColumnModel[] {
  return dataset.table_ids.flatMap(tableId => {
    const table = tableStore.get(tableId);
    return table ? table.columns : [];
  });
}

function columnSimilarity(left: ColumnModel, right: ColumnModel): number {
  const nameSim = jaccard(tokenize(left.alias ?? left.name), tokenize(right.alias ?? right.name));
  const patternSim = left.dtype === right.dtype ? 1 : 0.4;
  const statsSim = 1 - Math.min(1, Math.abs(left.null_ratio - right.null_ratio));
  const overlapLeft = new Set(left.sample_values.map(value => value.toLowerCase()));
  const overlapRight = new Set(right.sample_values.map(value => value.toLowerCase()));
  const overlapCount = [...overlapLeft].filter(value => overlapRight.has(value)).length;
  const overlap = overlapLeft.size === 0 && overlapRight.size === 0
    ? 0
    : overlapCount / Math.max(1, Math.min(overlapLeft.size, overlapRight.size));
  return Number(((nameSim * 0.45) + (patternSim * 0.15) + (statsSim * 0.15) + (overlap * 0.25)).toFixed(4));
}

function canonicalNameFor(columns: ColumnModel[]): string {
  const priorityPatterns: Array<[RegExp, string]> = [
    [/(customer|client|عميل).*(id|code|رقم)|(^customer_id$)/, 'customer_id'],
    [/(employee|staff|موظف).*(id|code|رقم)|(^employee_id$)/, 'employee_id'],
    [/(region|city|country|منطقة|مدينة|دولة)/, 'region'],
    [/(date|month|year|quarter|period|تاريخ|شهر|سنة|ربع)/, 'period'],
    [/(revenue|sales|profit|amount|cost|price|مبيعات|ربح|تكلفة)/, 'amount'],
  ];

  const normalizedCandidates = columns.map(column => normalizeToken(column.alias ?? column.name));
  for (const [pattern, label] of priorityPatterns) {
    if (normalizedCandidates.some(candidate => pattern.test(candidate))) {
      return label;
    }
  }

  return [...normalizedCandidates].sort((left, right) => left.length - right.length || left.localeCompare(right))[0] ?? 'column';
}

function buildJoinSuggestions(dataset: DatasetModel): Array<Record<string, unknown>> {
  const tables = dataset.table_ids
    .map(tableId => tableStore.get(tableId))
    .filter((table): table is TableModel => Boolean(table));
  const suggestions: Array<Record<string, unknown>> = [];

  for (let leftIndex = 0; leftIndex < tables.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < tables.length; rightIndex += 1) {
      const leftTable = tables[leftIndex];
      const rightTable = tables[rightIndex];

      for (const leftColumn of leftTable.columns) {
        for (const rightColumn of rightTable.columns) {
          const similarity = columnSimilarity(leftColumn, rightColumn);
          if (similarity < 0.55) continue;

          const leftSet = new Set(leftTable.rows.map(row => valueToText(row[leftColumn.name])).filter(Boolean).slice(0, 250));
          const rightSet = new Set(rightTable.rows.map(row => valueToText(row[rightColumn.name])).filter(Boolean).slice(0, 250));
          const overlap = leftSet.size === 0 || rightSet.size === 0
            ? 0
            : [...leftSet].filter(value => rightSet.has(value)).length / Math.max(1, Math.min(leftSet.size, rightSet.size));
          const uniquenessLeft = leftTable.rows.length === 0 ? 0 : leftColumn.unique_count / leftTable.rows.length;
          const uniquenessRight = rightTable.rows.length === 0 ? 0 : rightColumn.unique_count / rightTable.rows.length;
          const nullPenalty = 1 - Math.max(leftColumn.null_ratio, rightColumn.null_ratio);
          const typeCompatibility = leftColumn.dtype === rightColumn.dtype ? 1 : 0.5;
          const score = Number(((uniquenessLeft * 0.25) + (uniquenessRight * 0.25) + (nullPenalty * 0.15) + (typeCompatibility * 0.1) + (overlap * 0.15) + (similarity * 0.1)).toFixed(4));

          suggestions.push({
            left_table_id: leftTable.table_id,
            right_table_id: rightTable.table_id,
            left_table_name: leftTable.name,
            right_table_name: rightTable.name,
            key_columns: [leftColumn.name, rightColumn.name],
            join_type: score > 0.75 ? 'inner' : 'left',
            confidence: score,
            reason: `${leftColumn.name} ~ ${rightColumn.name}`,
          });
        }
      }
    }
  }

  return suggestions
    .sort((left, right) => Number(right.confidence) - Number(left.confidence))
    .slice(0, 12);
}

function normalizeRows(rows: TableRow[]): TableRow[] {
  return rows.map(row => ({ ...row }));
}

function compareValue(left: unknown, right: unknown, operator: string): boolean {
  const leftText = valueToText(left).toLowerCase();
  const rightText = valueToText(right).toLowerCase();
  const leftNumeric = toNumeric(left);
  const rightNumeric = toNumeric(right);

  switch (operator) {
    case 'eq':
      return leftText === rightText;
    case 'neq':
      return leftText !== rightText;
    case 'gt':
      return leftNumeric > rightNumeric;
    case 'gte':
      return leftNumeric >= rightNumeric;
    case 'lt':
      return leftNumeric < rightNumeric;
    case 'lte':
      return leftNumeric <= rightNumeric;
    case 'contains':
      return leftText.includes(rightText);
    case 'not_null':
      return leftText.length > 0;
    case 'is_null':
      return leftText.length === 0;
    default:
      return leftText === rightText;
  }
}

function evaluateExpression(expression: string, row: TableRow): unknown {
  const trimmed = expression.trim();
  if (!trimmed) return null;
  const scope: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (key === '__row_lineage_id') continue;
    scope[normalizeToken(key)] = value;
  }

  const normalizedExpression = trimmed.replace(/\[([^\]]+)\]/g, (_match, columnName: string) => normalizeToken(columnName));
  if (/^concat\(/i.test(normalizedExpression)) {
    const args = normalizedExpression
      .replace(/^concat\(/i, '')
      .replace(/\)$/g, '')
      .split(',')
      .map(part => part.trim());
    return args.map(part => {
      if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
        return part.slice(1, -1);
      }
      return valueToText(scope[normalizeToken(part)]);
    }).join('');
  }

  try {
    return math.evaluate(normalizedExpression, scope);
  } catch {
    return null;
  }
}

function castValue(value: unknown, dtype: string): unknown {
  switch (dtype) {
    case 'string':
      return valueToText(value);
    case 'int':
      return Math.trunc(toNumeric(value));
    case 'float':
    case 'currency':
      return Number(toNumeric(value).toFixed(2));
    case 'percent': {
      const numeric = valueToText(value).endsWith('%') ? toNumeric(value) / 100 : toNumeric(value);
      return Number(numeric.toFixed(4));
    }
    case 'bool':
      return ['true', '1', 'yes', 'y'].includes(valueToText(value).toLowerCase());
    case 'date':
    case 'datetime': {
      const parsed = Date.parse(valueToText(value));
      if (Number.isNaN(parsed)) return null;
      return new Date(parsed).toISOString();
    }
    default:
      return value;
  }
}

function applyTirStep(rows: TableRow[], step: Record<string, unknown>): TableRow[] {
  const op = String(step.op ?? step.kind ?? '').toLowerCase();
  if (!op) return rows;

  switch (op) {
    case 'rename': {
      const source = String(step.column);
      const target = String(step.to);
      return rows.map(row => {
        const nextRow = { ...row };
        nextRow[target] = nextRow[source];
        delete nextRow[source];
        return nextRow;
      });
    }
    case 'select': {
      const columns = Array.isArray(step.columns) ? step.columns.map(String) : [];
      return rows.map(row => {
        const nextRow: TableRow = { __row_lineage_id: row.__row_lineage_id };
        for (const column of columns) {
          nextRow[column] = row[column];
        }
        return nextRow;
      });
    }
    case 'filter': {
      const column = String(step.column);
      const operator = String(step.operator ?? 'eq');
      const value = step.value;
      return rows.filter(row => compareValue(row[column], value, operator));
    }
    case 'derive': {
      const column = String(step.column);
      const expression = String(step.expression ?? '');
      return rows.map(row => ({
        ...row,
        [column]: evaluateExpression(expression, row),
      }));
    }
    case 'cast': {
      const column = String(step.column);
      const dtype = String(step.dtype ?? 'string');
      return rows.map(row => ({
        ...row,
        [column]: castValue(row[column], dtype),
      }));
    }
    case 'sort': {
      const column = String(step.column);
      const direction = String(step.direction ?? 'asc') === 'desc' ? 'desc' : 'asc';
      return stableSortRows(rows, column, direction);
    }
    case 'dedupe': {
      const columns = Array.isArray(step.columns) && step.columns.length > 0
        ? step.columns.map(String)
        : Object.keys(rows[0] ?? {}).filter(key => key !== '__row_lineage_id');
      const seen = new Set<string>();
      return rows.filter(row => {
        const signature = hashValue(columns.map(column => valueToText(row[column])));
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      });
    }
    case 'split': {
      const column = String(step.column);
      const delimiter = String(step.delimiter ?? ',');
      const into = Array.isArray(step.into) && step.into.length > 0
        ? step.into.map(String)
        : [`${column}_1`, `${column}_2`];
      return rows.map(row => {
        const parts = valueToText(row[column]).split(delimiter);
        const nextRow = { ...row };
        into.forEach((target, index) => {
          nextRow[target] = parts[index] ?? null;
        });
        return nextRow;
      });
    }
    case 'merge': {
      const columns = Array.isArray(step.columns) ? step.columns.map(String) : [];
      const into = String(step.into ?? 'merged');
      const separator = String(step.separator ?? ' ');
      return rows.map(row => ({
        ...row,
        [into]: columns.map(column => valueToText(row[column])).filter(Boolean).join(separator),
      }));
    }
    case 'impute': {
      const column = String(step.column);
      const strategy = String(step.strategy ?? 'constant');
      const constantValue = step.value ?? null;
      const nonEmpty = rows.map(row => row[column]).filter(value => valueToText(value) !== '');
      let fillValue: unknown = constantValue;

      if (strategy === 'zero') fillValue = 0;
      if (strategy === 'empty') fillValue = '';
      if (strategy === 'mean') {
        const numericValues = nonEmpty.map(toNumeric);
        fillValue = numericValues.length === 0 ? 0 : Number((numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length).toFixed(2));
      }
      if (strategy === 'mode') {
        const frequency = new Map<string, number>();
        for (const value of nonEmpty.map(valueToText)) {
          frequency.set(value, (frequency.get(value) ?? 0) + 1);
        }
        fillValue = [...frequency.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? '';
      }

      return rows.map(row => ({
        ...row,
        [column]: valueToText(row[column]) === '' ? fillValue : row[column],
      }));
    }
    case 'group': {
      const by = Array.isArray(step.by) ? step.by.map(String) : [];
      const aggregations = Array.isArray(step.aggregations) ? step.aggregations as Array<Record<string, unknown>> : [];
      const groups = new Map<string, TableRow[]>();
      for (const row of rows) {
        const key = by.map(column => valueToText(row[column])).join('||');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)?.push(row);
      }
      return [...groups.entries()].map(([key, groupedRows], index) => {
        const nextRow: TableRow = {
          __row_lineage_id: `group:${index}`,
        };
        by.forEach((column, columnIndex) => {
          nextRow[column] = key.split('||')[columnIndex] ?? null;
        });
        aggregations.forEach(aggregation => {
          const source = String(aggregation.column ?? aggregation.source);
          const into = String(aggregation.into ?? `${String(aggregation.func ?? 'sum')}_${source}`);
          const func = String(aggregation.func ?? 'sum');
          const values = groupedRows.map(row => row[source]);
          switch (func) {
            case 'count':
              nextRow[into] = groupedRows.length;
              break;
            case 'avg':
              nextRow[into] = groupedRows.length === 0 ? 0 : Number((values.map(toNumeric).reduce((sum, value) => sum + value, 0) / groupedRows.length).toFixed(2));
              break;
            case 'max':
              nextRow[into] = Math.max(...values.map(toNumeric));
              break;
            case 'min':
              nextRow[into] = Math.min(...values.map(toNumeric));
              break;
            case 'distinct_count':
              nextRow[into] = new Set(values.map(valueToText)).size;
              break;
            default:
              nextRow[into] = Number(values.map(toNumeric).reduce((sum, value) => sum + value, 0).toFixed(2));
              break;
          }
        });
        return nextRow;
      });
    }
    default:
      return rows;
  }
}

function createTableModel(datasetId: string, name: string, rows: TableRow[]): TableModel {
  return registerTable({
    table_id: createId('table'),
    dataset_id: datasetId,
    name,
    sheet_id: createId('sheet'),
    columns: [],
    rows,
  });
}

function ensureDataset(datasetId: string): DatasetModel {
  return datasetStore.get(datasetId) ?? (() => {
    const dataset: DatasetModel = {
      dataset_id: datasetId,
      row_count_est: 0,
      column_count: 0,
      assets: [],
      table_ids: [],
      content_map: {},
      quality_summary: {},
      domain: 'ops',
      knowledge_graph: {},
    };
    datasetStore.set(datasetId, dataset);
    return dataset;
  })();
}

function tableKey(row: TableRow, columns: string[]): string {
  return columns.map(column => valueToText(row[column])).join('||');
}

function splitArgs(argsText: string): string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  for (const char of argsText) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function columnNameToNumber(name: string): number {
  return [...name.toUpperCase()].reduce((sum, char) => (sum * 26) + (char.charCodeAt(0) - 64), 0);
}

function numberToColumnName(value: number): string {
  let current = value;
  let output = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    current = Math.floor((current - 1) / 26);
  }
  return output;
}

function expandRange(rangeText: string): string[] {
  const [start, end] = rangeText.split(':');
  if (!end) return [start];
  const startMatch = start.match(/^([A-Z]+)(\d+)$/i);
  const endMatch = end.match(/^([A-Z]+)(\d+)$/i);
  if (!startMatch || !endMatch) return [start];
  const startColumn = columnNameToNumber(startMatch[1]);
  const endColumn = columnNameToNumber(endMatch[1]);
  const startRow = Number.parseInt(startMatch[2], 10);
  const endRow = Number.parseInt(endMatch[2], 10);
  const refs: string[] = [];
  for (let column = startColumn; column <= endColumn; column += 1) {
    for (let row = startRow; row <= endRow; row += 1) {
      refs.push(`${numberToColumnName(column)}${row}`);
    }
  }
  return refs;
}

function excelValueToScalar(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    if ('result' in value) return excelValueToScalar(value.result as ExcelJS.CellValue);
    if ('text' in value) return value.text;
    if ('richText' in value) return value.richText.map(fragment => fragment.text).join('');
    if ('hyperlink' in value) {
      const linkValue = value as { text?: string; hyperlink?: string };
      return linkValue.text ?? linkValue.hyperlink ?? null;
    }
  }
  return value;
}

function scalarToCellValue(value: unknown): ExcelJS.CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
    return value;
  }
  return valueToText(value);
}

function scalarToFormulaResult(value: unknown): string | number | boolean | Date | ExcelJS.CellErrorValue | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
    return value;
  }
  return valueToText(value);
}

function evaluateWorkbookFormula(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  formulaText: string,
  cache: Map<string, unknown>,
  visiting: Set<string>,
): unknown {
  let expression = formulaText.startsWith('=') ? formulaText.slice(1) : formulaText;

  const resolveCell = (sheetRef: string, cellRef: string): unknown => {
    const key = `${sheetRef}!${cellRef}`;
    if (cache.has(key)) return cache.get(key);
    if (visiting.has(key)) {
      throw new Error(`Circular reference detected: ${key}`);
    }
    visiting.add(key);
    const worksheet = workbook.getWorksheet(sheetRef);
    if (!worksheet) return 0;
    const cell = worksheet.getCell(cellRef);
    const value = cell.value;
    let result: unknown;
    if (value && typeof value === 'object' && 'formula' in value) {
      const formula = String(value.formula ?? '');
      result = evaluateWorkbookFormula(workbook, sheetRef, formula, cache, visiting);
      cell.value = { formula, result: scalarToFormulaResult(result) };
    } else {
      result = excelValueToScalar(value);
    }
    cache.set(key, result);
    visiting.delete(key);
    return result;
  };

  const evaluateArgument = (argument: string): unknown => {
    const trimmed = argument.trim();
    if (/^[A-Z]+\d+:[A-Z]+\d+$/i.test(trimmed)) {
      return expandRange(trimmed).map(ref => resolveCell(sheetName, ref));
    }
    if (/^[A-Za-z0-9_]+![A-Z]+\d+$/i.test(trimmed)) {
      const [sheetRef, cellRef] = trimmed.split('!');
      return resolveCell(sheetRef, cellRef);
    }
    if (/^[A-Z]+\d+$/i.test(trimmed)) {
      return resolveCell(sheetName, trimmed);
    }
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    return toNumeric(trimmed);
  };

  const resolveFunction = (name: string, argsText: string): string => {
    const args = splitArgs(argsText).map(evaluateArgument).flat();
    switch (name.toUpperCase()) {
      case 'SUM':
        return String(args.map(toNumeric).reduce((sum, value) => sum + value, 0));
      case 'AVERAGE':
        return String(args.length === 0 ? 0 : args.map(toNumeric).reduce((sum, value) => sum + value, 0) / args.length);
      case 'MIN':
        return String(args.length === 0 ? 0 : Math.min(...args.map(toNumeric)));
      case 'MAX':
        return String(args.length === 0 ? 0 : Math.max(...args.map(toNumeric)));
      case 'IF': {
        const [condition, onTrue, onFalse] = splitArgs(argsText);
        const normalizedCondition = evaluateWorkbookFormula(workbook, sheetName, condition, cache, visiting);
        return JSON.stringify(normalizedCondition ? evaluateArgument(onTrue) : evaluateArgument(onFalse));
      }
      default:
        return '0';
    }
  };

  while (/\b(SUM|AVERAGE|MIN|MAX|IF)\(([^()]*)\)/i.test(expression)) {
    expression = expression.replace(/\b(SUM|AVERAGE|MIN|MAX|IF)\(([^()]*)\)/gi, (_match, name: string, argsText: string) => resolveFunction(name, argsText));
  }

  expression = expression.replace(/([A-Za-z0-9_]+)!([A-Z]+\d+)/g, (_match, sheetRef: string, cellRef: string) => JSON.stringify(resolveCell(sheetRef, cellRef)));
  expression = expression.replace(/\b([A-Z]+\d+)\b/g, (_match, cellRef: string) => JSON.stringify(resolveCell(sheetName, cellRef)));

  try {
    return math.evaluate(expression);
  } catch {
    return expression;
  }
}

async function ingestBatch(request: ExcelToolRequest<{ assets: ExcelAssetRef[] }, { read_all_sheets: true }>): Promise<ExcelToolResponse<{ dataset: DatasetRef }>> {
  const dataset: DatasetModel = {
    dataset_id: createId('dataset'),
    row_count_est: 0,
    column_count: 0,
    assets: request.inputs.assets,
    table_ids: [],
    content_map: {},
    quality_summary: {},
    domain: 'ops',
    knowledge_graph: {},
  };
  datasetStore.set(dataset.dataset_id, dataset);

  for (const asset of request.inputs.assets) {
    const filePath = resolveAssetPath(asset.uri);
    const extension = extname(filePath).toLowerCase();
    const mime = asset.mime.toLowerCase();
    let tables: TableModel[] = [];

    if (mime.includes('csv') || extension === '.csv' || extension === '.txt') {
      const table = matrixToTable(dataset.dataset_id, asset, basename(filePath, extname(filePath)), readCsvMatrix(filePath));
      tables = table ? [table] : [];
    } else if (mime.includes('sheet') || mime.includes('excel') || extension === '.xlsx' || extension === '.xlsm' || extension === '.xls') {
      tables = readWorkbookMatrices(filePath)
        .map(sheet => matrixToTable(dataset.dataset_id, asset, sheet.sheetName, sheet.rows))
        .filter((table): table is TableModel => Boolean(table));
    } else {
      throw new Error(`Unsupported asset type for ingest: ${asset.mime}`);
    }

    dataset.table_ids.push(...tables.map(table => table.table_id));
  }

  refreshDataset(dataset.dataset_id);

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      dataset: makeDatasetRef(requireDataset(dataset.dataset_id)),
    },
    warnings: [],
  };
}

async function inspectPreflight(request: ExcelToolRequest<{ dataset: DatasetRef }, Record<string, never>>): Promise<ExcelToolResponse<{ content_map: Record<string, unknown>; quality_summary: Record<string, unknown>; join_suggestions: Array<Record<string, unknown>> }>> {
  const dataset = requireDataset(request.inputs.dataset);
  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      content_map: dataset.content_map,
      quality_summary: dataset.quality_summary,
      join_suggestions: buildJoinSuggestions(dataset),
    },
  };
}

async function buildCatalog(request: ExcelToolRequest<{ dataset: DatasetRef }, Record<string, never>>): Promise<ExcelToolResponse<{ columns: ColumnRef[] }>> {
  const dataset = requireDataset(request.inputs.dataset);
  const columns = collectColumns(dataset).map(column => ({
    column_id: column.column_id,
    table_id: column.table_id,
    name: column.name,
    dtype: column.dtype,
  }));

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      columns,
    },
  };
}

async function unifyColumns(request: ExcelToolRequest<{ columns: ColumnRef[] }, { apply_mode: 'smart_apply' | 'pro_suggest_only' }>): Promise<ExcelToolResponse<{ synonym_groups: Array<Record<string, unknown>> }>> {
  const columnModels = request.inputs.columns.map(requireColumn);
  const groups: Array<{ columns: ColumnModel[]; scores: number[] }> = [];
  const used = new Set<string>();

  for (const column of columnModels) {
    if (used.has(column.column_id)) continue;
    const group = { columns: [column], scores: [1] };
    used.add(column.column_id);

    for (const candidate of columnModels) {
      if (used.has(candidate.column_id)) continue;
      const similarity = columnSimilarity(column, candidate);
      if (similarity >= 0.72) {
        group.columns.push(candidate);
        group.scores.push(similarity);
        used.add(candidate.column_id);
      }
    }

    groups.push(group);
  }

  const synonymGroups = groups
    .filter(group => group.columns.length > 1)
    .map(group => {
      const canonical_name = canonicalNameFor(group.columns);
      if (request.params.apply_mode === 'smart_apply') {
        group.columns.forEach(column => {
          column.alias = canonical_name;
          column.semantic_label = canonical_name;
        });
      }
      return {
        canonical_name,
        confidence: Number((group.scores.reduce((sum, score) => sum + score, 0) / group.scores.length).toFixed(4)),
        columns: group.columns.map(column => ({
          column_id: column.column_id,
          table_id: column.table_id,
          source_name: column.name,
          alias: column.alias ?? canonical_name,
        })),
      };
    });

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      synonym_groups: synonymGroups,
    },
    warnings: [],
  };
}

async function suggestJoins(request: ExcelToolRequest<{ dataset: DatasetRef }, Record<string, never>>): Promise<ExcelToolResponse<{ suggestions: Array<Record<string, unknown>> }>> {
  const dataset = requireDataset(request.inputs.dataset);
  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      suggestions: buildJoinSuggestions(dataset),
    },
  };
}

async function createEmptyTable(request: ExcelToolRequest<Record<string, never>, { name: string }>): Promise<ExcelToolResponse<{ table: TableRef }>> {
  const dataset = ensureDataset(createId('dataset'));
  const table = registerTable({
    table_id: createId('table'),
    dataset_id: dataset.dataset_id,
    name: normalizeToken(request.params.name),
    sheet_id: createId('sheet'),
    columns: [],
    rows: [],
  });
  dataset.table_ids.push(table.table_id);
  refreshDataset(dataset.dataset_id);

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      table: makeTableRef(table),
    },
  };
}

async function addColumn(request: ExcelToolRequest<{ target_table: TableRef; source_column: ColumnRef }, { align_mode: 'append_rows_by_similarity' | 'join_by_key' | 'add_as_side_column'; join_key_columns?: string[] }>): Promise<ExcelToolResponse<{ table: TableRef }>> {
  const target = requireTable(request.inputs.target_table);
  const sourceColumn = requireColumn(request.inputs.source_column);
  const sourceTable = requireTable(sourceColumn.table_id);
  const targetColumnName = sourceColumn.alias ?? sourceColumn.name;
  const nextRows = normalizeRows(target.rows);

  if (target.rows.length === 0) {
    const rowsFromSource = sourceTable.rows.map(row => ({
      __row_lineage_id: row.__row_lineage_id,
      [targetColumnName]: row[sourceColumn.name],
      ...(request.params.align_mode === 'join_by_key' && Array.isArray(request.params.join_key_columns)
        ? Object.fromEntries(request.params.join_key_columns.map(key => [key, row[key]]))
        : {}),
    }));
    target.rows = rowsFromSource;
    registerTable(target);
  } else if (request.params.align_mode === 'add_as_side_column') {
    if (target.rows.length !== sourceTable.rows.length) {
      throw new Error('add_as_side_column requires identical row counts');
    }
    target.rows = nextRows.map((row, index) => ({
      ...row,
      [targetColumnName]: sourceTable.rows[index][sourceColumn.name],
    }));
    registerTable(target);
  } else if (request.params.align_mode === 'join_by_key') {
    const keys = request.params.join_key_columns ?? [];
    if (keys.length === 0) throw new Error('join_by_key requires join_key_columns');
    const sourceMap = new Map<string, TableRow>();
    for (const row of sourceTable.rows) {
      const key = tableKey(row, keys);
      if (!sourceMap.has(key)) {
        sourceMap.set(key, row);
      }
    }
    target.rows = nextRows.map(row => {
      const match = sourceMap.get(tableKey(row, keys));
      return {
        ...row,
        [targetColumnName]: match ? match[sourceColumn.name] : null,
      };
    });
    registerTable(target);
  } else {
    const existingColumns = target.columns.map(column => column.name);
    const baseRowTemplate = Object.fromEntries(existingColumns.map(column => [column, null]));
    const appendedRows = sourceTable.rows.map(row => ({
      __row_lineage_id: `${row.__row_lineage_id}:append`,
      ...baseRowTemplate,
      [targetColumnName]: row[sourceColumn.name],
    }));
    target.rows = [...nextRows, ...appendedRows];
    registerTable(target);
  }

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      table: makeTableRef(target),
    },
  };
}

async function applyTir(request: ExcelToolRequest<{ table: TableRef; tir_steps: Array<Record<string, unknown>> }, { preview_rows: number }>): Promise<ExcelToolResponse<{ table: TableRef; recipe: RecipeRef }>> {
  const sourceTable = requireTable(request.inputs.table);
  let rows = normalizeRows(sourceTable.rows);

  for (const step of request.inputs.tir_steps) {
    rows = applyTirStep(rows, step);
  }

  const resultTable = createTableModel(sourceTable.dataset_id, `${sourceTable.name}_result`, rows);
  const dataset = requireDataset(sourceTable.dataset_id);
  dataset.table_ids.push(resultTable.table_id);
  refreshDataset(dataset.dataset_id);

  const recipe: RecipeModel = {
    recipe_id: createId('recipe'),
    kind: 'TIR',
    version: '1.0.0',
    name: `${sourceTable.name}_tir`,
    steps: request.inputs.tir_steps,
    source_table_id: sourceTable.table_id,
    source_table_name: sourceTable.name,
  };
  recipeStore.set(recipe.recipe_id, recipe);

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      table: makeTableRef(resultTable),
      recipe: makeRecipeRef(recipe),
    },
  };
}

async function recalcWorkbook(request: ExcelToolRequest<{ workbook_asset: ExcelAssetRef }, { deterministic: true }>): Promise<ExcelToolResponse<{ artifact: ArtifactRef }>> {
  const workbook = new ExcelJS.Workbook();
  const inputPath = resolveAssetPath(request.inputs.workbook_asset.uri);
  await workbook.xlsx.readFile(inputPath);

  const cache = new Map<string, unknown>();
  const visiting = new Set<string>();
  let recalculatedCells = 0;

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        const value = cell.value;
        if (value && typeof value === 'object' && 'formula' in value) {
          const formula = String(value.formula ?? '');
          const result = evaluateWorkbookFormula(workbook, worksheet.name, formula, cache, visiting);
          cell.value = {
            formula,
            result: scalarToFormulaResult(result),
          };
          recalculatedCells += 1;
        }
      });
    });
  }

  const artifactId = createId('artifact');
  const artifactPath = join(runtimeDir, `${artifactId}.xlsx`);
  await workbook.xlsx.writeFile(artifactPath);
  const buffer = readFileSync(artifactPath);
  const evidencePath = join(runtimeDir, `${artifactId}.json`);
  writeFileSync(evidencePath, JSON.stringify({
    artifact_id: artifactId,
    source_asset_id: request.inputs.workbook_asset.asset_id,
    recalculated_cells: recalculatedCells,
    supported_functions: ['SUM', 'AVERAGE', 'MIN', 'MAX', 'IF', 'arithmetic'],
    deterministic: true,
  }, null, 2), 'utf8');

  const artifact: ArtifactRef = {
    artifact_id: artifactId,
    kind: 'xlsx',
    uri: artifactPath,
  };
  artifactStore.set(artifactId, {
    artifact,
    sha256: hashBuffer(buffer),
    evidence_uri: evidencePath,
  });

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      artifact,
    },
  };
}

async function datasetDiff(request: ExcelToolRequest<{ left: TableRef; right: TableRef }, { key_columns: string[] }>): Promise<ExcelToolResponse<{ diff_table: TableRef }>> {
  const left = requireTable(request.inputs.left);
  const right = requireTable(request.inputs.right);
  const keys = request.params.key_columns;
  const leftMap = new Map<string, TableRow>();
  const rightMap = new Map<string, TableRow>();

  for (const row of left.rows) {
    const key = tableKey(row, keys);
    if (!leftMap.has(key)) leftMap.set(key, row);
  }
  for (const row of right.rows) {
    const key = tableKey(row, keys);
    if (!rightMap.has(key)) rightMap.set(key, row);
  }

  const allKeys = [...new Set([...leftMap.keys(), ...rightMap.keys()])].sort();
  const diffRows: TableRow[] = allKeys.map((key, index) => {
    const leftRow = leftMap.get(key);
    const rightRow = rightMap.get(key);
    let changeType = 'unchanged';
    if (!leftRow && rightRow) changeType = 'added';
    else if (leftRow && !rightRow) changeType = 'removed';
    else if (hashValue(leftRow) !== hashValue(rightRow)) changeType = 'modified';

    return {
      __row_lineage_id: `diff:${index + 1}`,
      change_type: changeType,
      key,
      old_values: leftRow ? JSON.stringify(leftRow) : null,
      new_values: rightRow ? JSON.stringify(rightRow) : null,
    };
  }).filter(row => row.change_type !== 'unchanged');

  const diffTable = createTableModel(left.dataset_id, `${left.name}_diff`, diffRows);
  const dataset = requireDataset(left.dataset_id);
  dataset.table_ids.push(diffTable.table_id);
  refreshDataset(dataset.dataset_id);

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      diff_table: makeTableRef(diffTable),
    },
  };
}

async function beautifyExcel(request: ExcelToolRequest<{ table: TableRef }, { rtl: boolean; style_level?: 'standard' | 'premium' }>): Promise<ExcelToolResponse<{ recipe: RecipeRef }>> {
  const table = requireTable(request.inputs.table);
  table.formatting = {
    rtl: request.params.rtl,
    style_level: request.params.style_level ?? 'premium',
  };
  registerTable(table);

  const recipe: RecipeModel = {
    recipe_id: createId('recipe'),
    kind: 'FORMAT',
    version: '1.0.0',
    name: `${table.name}_format`,
    steps: [{
      op: 'beautify',
      rtl: request.params.rtl,
      style_level: request.params.style_level ?? 'premium',
    }],
    source_table_id: table.table_id,
    source_table_name: table.name,
    formatting: table.formatting,
  };
  recipeStore.set(recipe.recipe_id, recipe);

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      recipe: makeRecipeRef(recipe),
    },
  };
}

async function exportXlsx(request: ExcelToolRequest<{ tables: TableRef[] }, { include_lineage_sheet: true }>): Promise<ExcelToolResponse<{ artifact: ArtifactRef }>> {
  const workbook = new ExcelJS.Workbook();
  const usedNames = new Set<string>();
  const tables = request.inputs.tables.map(requireTable);
  const lineageRows: string[][] = [['table_id', 'dataset_id', 'table_name', 'row_lineage_id']];

  for (const table of tables) {
    const worksheet = workbook.addWorksheet(sheetSafeName(table.name, usedNames));
    const headers = table.columns.map(column => column.alias ?? column.name);
    worksheet.addRow(headers);
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: table.formatting?.style_level === 'standard' ? 'FF475569' : 'FF0F172A' } };

    for (const row of table.rows) {
      worksheet.addRow(table.columns.map(column => row[column.name]));
      lineageRows.push([table.table_id, table.dataset_id, table.name, row.__row_lineage_id]);
    }

    worksheet.autoFilter = {
      from: 'A1',
      to: `${numberToColumnName(Math.max(1, headers.length))}${Math.max(1, table.rows.length + 1)}`,
    };
    worksheet.views = [{ rightToLeft: Boolean(table.formatting?.rtl), state: 'frozen', ySplit: 1 }] as ExcelJS.WorksheetView[];
    worksheet.columns = table.columns.map(column => ({
      key: column.name,
      width: Math.min(40, Math.max(12, Math.max(column.name.length + 2, ...table.rows.slice(0, 50).map(row => valueToText(row[column.name]).length + 2)))),
      style: column.dtype === 'currency'
        ? { numFmt: '#,##0.00' }
        : column.dtype === 'percent'
          ? { numFmt: '0.00%' }
          : {},
    }));
  }

  if (request.params.include_lineage_sheet) {
    const lineageSheet = workbook.addWorksheet(sheetSafeName('lineage_meta', usedNames));
    lineageSheet.state = 'veryHidden';
    lineageRows.forEach(row => lineageSheet.addRow(row));
  }

  const artifactId = createId('artifact');
  const artifactPath = join(runtimeDir, `${artifactId}.xlsx`);
  await workbook.xlsx.writeFile(artifactPath);
  const fileBuffer = readFileSync(artifactPath);
  const evidencePath = join(runtimeDir, `${artifactId}.json`);
  writeFileSync(evidencePath, JSON.stringify({
    artifact_id: artifactId,
    generated_at: new Date().toISOString(),
    tables: tables.map(table => ({
      table_id: table.table_id,
      table_name: table.name,
      row_count: table.rows.length,
      column_count: table.columns.length,
      formatting: table.formatting ?? null,
    })),
    include_lineage_sheet: true,
    sha256: hashBuffer(fileBuffer),
  }, null, 2), 'utf8');

  const artifact: ArtifactRef = {
    artifact_id: artifactId,
    kind: 'xlsx',
    uri: artifactPath,
  };
  artifactStore.set(artifactId, {
    artifact,
    dataset_id: tables[0]?.dataset_id,
    table_ids: tables.map(table => table.table_id),
    sha256: hashBuffer(fileBuffer),
    evidence_uri: evidencePath,
  });

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      artifact,
    },
  };
}

async function saveRecipe(request: ExcelToolRequest<{ table?: TableRef; recipe: Record<string, unknown>; kind: RecipeKind }, { name: string }>): Promise<ExcelToolResponse<{ recipe: RecipeRef }>> {
  const table = request.inputs.table ? requireTable(request.inputs.table) : undefined;
  const recipePayload = request.inputs.recipe;
  const steps = Array.isArray(recipePayload.steps) ? recipePayload.steps as Array<Record<string, unknown>> : [recipePayload];
  const recipe: RecipeModel = {
    recipe_id: createId('recipe'),
    kind: request.inputs.kind,
    version: '1.0.0',
    name: request.params.name,
    steps,
    source_table_id: table?.table_id,
    source_table_name: table?.name,
  };
  recipeStore.set(recipe.recipe_id, recipe);

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      recipe: makeRecipeRef(recipe),
    },
  };
}

async function applyRecipe(request: ExcelToolRequest<{ recipe: RecipeRef; dataset: DatasetRef }, Record<string, never>>): Promise<ExcelToolResponse<{ table: TableRef; recipe: RecipeRef }>> {
  const recipe = requireRecipe(request.inputs.recipe);
  const dataset = requireDataset(request.inputs.dataset);
  const targetTable = dataset.table_ids
    .map(tableId => tableStore.get(tableId))
    .filter((table): table is TableModel => Boolean(table))
    .find(table => table.name === recipe.source_table_name)
    ?? dataset.table_ids.map(tableId => tableStore.get(tableId)).find((table): table is TableModel => Boolean(table));

  if (!targetTable) throw new Error(`No table available in dataset ${dataset.dataset_id}`);

  if (recipe.kind === 'FORMAT') {
    targetTable.formatting = recipe.formatting ?? { rtl: false, style_level: 'premium' };
    registerTable(targetTable);
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        table: makeTableRef(targetTable),
        recipe: makeRecipeRef(recipe),
      },
    };
  }

  let rows = normalizeRows(targetTable.rows);
  for (const step of recipe.steps) {
    rows = applyTirStep(rows, step);
  }
  const resultTable = createTableModel(dataset.dataset_id, `${targetTable.name}_${normalizeToken(recipe.name)}`, rows);
  dataset.table_ids.push(resultTable.table_id);
  refreshDataset(dataset.dataset_id);

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      table: makeTableRef(resultTable),
      recipe: makeRecipeRef(recipe),
    },
  };
}

function buildRecommendedOutputs(dataset: DatasetModel): Array<Record<string, unknown>> {
  return [
    { kind: 'xlsx', reason: 'full_workbook_export' },
    { kind: 'dashboard', reason: dataset.table_ids.length > 1 ? 'multi_table_kpis' : 'single_table_monitoring' },
    { kind: 'pptx', reason: 'executive_summary' },
  ];
}

function buildRecommendedRecipes(dataset: DatasetModel): Array<Record<string, unknown>> {
  const suggestions = buildJoinSuggestions(dataset);
  const recipes: Array<Record<string, unknown>> = [{
    name: 'quality_cleanup',
    kind: 'CLEAN',
    tir_steps: [{ op: 'dedupe' }],
  }];

  if (suggestions.length > 0) {
    recipes.push({
      name: 'join_master_table',
      kind: 'TIR',
      join_plan: suggestions[0],
    });
  }

  const firstTable = dataset.table_ids.map(tableId => tableStore.get(tableId)).find((table): table is TableModel => Boolean(table));
  const measureColumn = firstTable?.columns.find(column => column.semantic_label === 'measure');
  const timeColumn = firstTable?.columns.find(column => column.semantic_label === 'time');
  if (firstTable && measureColumn) {
    recipes.push({
      name: 'summary_kpi',
      kind: 'TIR',
      tir_steps: [{
        op: 'group',
        by: timeColumn ? [timeColumn.name] : [],
        aggregations: [{ func: 'sum', column: measureColumn.name, into: `sum_${measureColumn.name}` }],
      }],
    });
  }

  return recipes;
}

async function parseIntent(request: ExcelToolRequest<{ prompt: string; dataset?: DatasetRef }, Record<string, never>>): Promise<ExcelToolResponse<{ analysis_report: Record<string, unknown>; recommended_recipes: Array<Record<string, unknown>>; recommended_outputs: Array<Record<string, unknown>> }>> {
  const prompt = request.inputs.prompt.normalize('NFC');
  const normalized = prompt.toLowerCase();
  const dataset = request.inputs.dataset ? requireDataset(request.inputs.dataset) : undefined;
  const objective = /compare|قارن|مقارنة/.test(normalized)
    ? 'comparison'
    : /dashboard|لوحة|kpi/.test(normalized)
      ? 'dashboard'
      : /forecast|predict|تنبؤ/.test(normalized)
        ? 'forecast'
        : 'analysis';
  const recommendedRecipes = dataset ? buildRecommendedRecipes(dataset) : [];
  const recommendedOutputs = dataset ? buildRecommendedOutputs(dataset) : [{ kind: 'xlsx', reason: 'default_export' }];

  if (/clean|نظف|تنظيف/.test(normalized)) {
    recommendedRecipes.unshift({
      name: 'clean_text_and_dedupe',
      kind: 'CLEAN',
      tir_steps: [
        { op: 'dedupe' },
        { op: 'impute', column: 'status', strategy: 'mode' },
      ],
    });
  }
  if (/chart|graph|مخطط/.test(normalized)) {
    recommendedOutputs.push({ kind: 'dashboard', reason: 'chart_requested' });
  }

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      analysis_report: {
        objective,
        prompt,
        domain: dataset?.domain ?? 'unknown',
        data_needs: /chart|kpi|مخطط|مؤشر/.test(normalized) ? ['measure', 'time'] : [],
        join_plan: dataset ? buildJoinSuggestions(dataset)[0] ?? null : null,
        mode: request.context.mode,
      },
      recommended_recipes: recommendedRecipes,
      recommended_outputs: recommendedOutputs,
    },
  };
}

async function autoAnalyze(request: ExcelToolRequest<{ dataset: DatasetRef }, Record<string, never>>): Promise<ExcelToolResponse<{ analysis_report: Record<string, unknown>; recommended_recipes: Array<Record<string, unknown>>; recommended_outputs: Array<Record<string, unknown>> }>> {
  const dataset = requireDataset(request.inputs.dataset);
  const quality = dataset.quality_summary as { average_quality_score?: number; tables?: Array<Record<string, unknown>> };
  const joins = buildJoinSuggestions(dataset);
  const executiveSummary = `Dataset ${dataset.dataset_id} يحتوي على ${dataset.row_count_est} صف و ${dataset.column_count} عمود عبر ${dataset.table_ids.length} جداول.`;

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      analysis_report: {
        executive_summary: executiveSummary,
        domain: dataset.domain,
        quality_score: quality.average_quality_score ?? 0,
        issues: (quality.tables ?? [])
          .filter(entry => Number(entry.quality_score ?? 100) < 90)
          .map(entry => ({
            table_id: entry.table_id,
            issue: 'quality_below_threshold',
            quality_score: entry.quality_score,
          })),
        sensitive_columns: collectColumns(dataset)
          .filter(column => column.sensitivity_label)
          .map(column => ({
            table_id: column.table_id,
            column_name: column.name,
            sensitivity: column.sensitivity_label,
          })),
        join_suggestions: joins,
        knowledge_graph: dataset.knowledge_graph,
      },
      recommended_recipes: buildRecommendedRecipes(dataset),
      recommended_outputs: buildRecommendedOutputs(dataset),
    },
  };
}

const handlers: Record<string, (request: ExcelToolRequest<any, any>) => Promise<ExcelToolResponse<any>>> = {
  'data.ingest.batch': ingestBatch,
  'data.inspect.preflight': inspectPreflight,
  'catalog.build': buildCatalog,
  'catalog.unify_columns': unifyColumns,
  'relation.suggest_joins': suggestJoins,
  'canvas.table.create_empty': createEmptyTable,
  'canvas.table.add_column': addColumn,
  'expr.tir.apply': applyTir,
  'excel.svm.recalc': recalcWorkbook,
  'compare.dataset_diff': datasetDiff,
  'format.excel.beautify': beautifyExcel,
  'export.xlsx': exportXlsx,
  'recipe.save': saveRecipe,
  'recipe.apply': applyRecipe,
  'ai.excel.intent_parse': parseIntent,
  'ai.excel.auto_analyze': autoAnalyze,
};

export async function executeExcelTool<TRefs = Record<string, unknown>>(request: ExcelToolRequest): Promise<ExcelToolResponse<TRefs>> {
  validateExcelToolContract(request.tool_id, 'request', request);
  const handler = handlers[request.tool_id];
  if (!handler) {
    throw new Error(`Excel tool not implemented: ${request.tool_id}`);
  }
  const response = await handler(request);
  validateExcelToolContract(request.tool_id, 'response', response);
  return response as ExcelToolResponse<TRefs>;
}

export function listExcelTools() {
  return [...EXCEL_TOOL_DEFINITIONS];
}

export function getDataset(datasetId: string): DatasetModel | undefined {
  return datasetStore.get(datasetId);
}

export function getTable(tableId: string): TableModel | undefined {
  return tableStore.get(tableId);
}

export function getRecipe(recipeId: string): RecipeModel | undefined {
  return recipeStore.get(recipeId);
}

export function getArtifact(artifactId: string): ArtifactModel | undefined {
  return artifactStore.get(artifactId);
}

export function resetExcelUltraEngine(): void {
  datasetStore.clear();
  tableStore.clear();
  recipeStore.clear();
  artifactStore.clear();
  if (existsSync(runtimeDir)) {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
  mkdirSync(runtimeDir, { recursive: true });
}
