import { createHash, randomUUID } from 'crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, extname, join } from 'path';
import archiver from 'archiver';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import * as XLSX from 'xlsx';
import {
  DASHBOARD_TOOL_DEFINITIONS,
  validateDashboardToolContract,
  type DashboardContractDirection,
} from './dashboard-tool-contracts.js';

export type DashboardMode = 'AUTO' | 'PRO';
export type ArabicMode = 'BASIC' | 'PROFESSIONAL' | 'ELITE';
export type ArtifactKind = 'pdf' | 'pptx' | 'docx' | 'xlsx' | 'html' | 'png' | 'json';
export type WidgetKind =
  | 'kpi'
  | 'chart'
  | 'table'
  | 'pivot'
  | 'text'
  | 'image'
  | 'icon'
  | 'slicer'
  | 'filter_panel'
  | 'map'
  | 'gauge'
  | 'bullet'
  | 'sparkline'
  | 'heatmap'
  | 'treemap'
  | 'waterfall'
  | 'funnel'
  | 'timeline'
  | 'boxplot'
  | 'scatter'
  | 'combo'
  | 'cards_grid'
  | 'narrative'
  | 'embed'
  | 'video';

export interface DashboardActionContext {
  workspace_id: string;
  user_id: string;
  mode: DashboardMode;
  arabic_mode: ArabicMode;
  locale: string;
  [key: string]: unknown;
}

export interface DashboardAssetRef {
  asset_id: string;
  uri: string;
  mime: string;
  sha256: string;
}

export interface DatasetRef {
  dataset_id: string;
}

export interface DashboardRef {
  dashboard_id: string;
  page_count: number;
}

export interface ArtifactRef {
  artifact_id: string;
  kind: ArtifactKind;
  uri: string;
}

export interface DashboardToolRequest<TInputs = Record<string, unknown>, TParams = Record<string, unknown>> {
  request_id: string;
  tool_id: string;
  context: DashboardActionContext;
  inputs: TInputs;
  params: TParams;
}

export interface DashboardToolResponse<TRefs = Record<string, unknown>> {
  request_id: string;
  tool_id: string;
  status: 'ok' | 'failed';
  refs: TRefs;
  warnings?: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error' }>;
  failure?: { code: string; message: string };
}

interface DatasetColumn {
  name: string;
  dtype: 'string' | 'number' | 'date' | 'boolean';
  semantic: string;
}

interface DatasetTable {
  table_id: string;
  name: string;
  columns: DatasetColumn[];
  rows: Array<Record<string, unknown> & { __row_id: string }>;
}

interface DatasetModel extends DatasetRef {
  assets: DashboardAssetRef[];
  tables: DatasetTable[];
  domain: string;
  synthetic: boolean;
  quality_score: number;
  lineage: Record<string, unknown>;
}

interface WidgetModel {
  widget_id: string;
  kind: WidgetKind;
  bbox: { x: number; y: number; w: number; h: number };
  z_index: number;
  style_ref: string;
  title: string;
  chart_kind?: string;
  columns?: string[];
  data_binding_ref?: string;
  interaction_bindings?: string[];
  settings?: Record<string, unknown>;
}

interface DashboardPage {
  page_id: string;
  index: number;
  name: string;
  grid_spec: { columns: number; rows: number; gutters: number; margins: number };
  widgets: WidgetModel[];
}

interface DashboardIR {
  version: string;
  dashboard_id: string;
  pages: DashboardPage[];
  theme_tokens: Record<string, unknown>;
  dataset_bindings: Array<Record<string, unknown>>;
  semantic_model_ref: string | null;
  global_filters: Array<Record<string, unknown>>;
  parameters: Array<Record<string, unknown>>;
  interactions: Array<Record<string, unknown>>;
  fingerprints: {
    layout_hash: string;
    binding_hash: string;
    interaction_hash: string;
  };
}

interface WidgetResult {
  widget_id: string;
  kind: WidgetKind;
  payload: Record<string, unknown>;
}

interface DashboardModel extends DashboardRef {
  intent: Record<string, unknown>;
  ir: DashboardIR;
  widget_results: Map<string, WidgetResult>;
  preview_renders: ArtifactRef[];
  preview_hashes: Record<string, string>;
  bound_dataset_ids: string[];
  published_link_id?: string;
  latest_qa?: { pass: boolean; issues: Array<Record<string, unknown>> };
}

interface StoredArtifact {
  artifact: ArtifactRef;
  dashboard_id?: string;
  export_kind?: ArtifactKind;
  preview_hashes?: Record<string, string>;
  render_manifest_uri?: string;
  metadata?: Record<string, unknown>;
}

interface EvidencePack {
  evidence_id: string;
  dashboard_id: string;
  artifact_ids: string[];
  qa_report: Record<string, unknown> | null;
  parity_report: Record<string, unknown> | null;
  lineage: Record<string, unknown>[];
  actions: Array<Record<string, unknown>>;
  uri: string;
}

const runtimeDir = join(tmpdir(), 'rasid-dashboard-ultra-runtime');
mkdirSync(runtimeDir, { recursive: true });

const datasetStore = new Map<string, DatasetModel>();
const dashboardStore = new Map<string, DashboardModel>();
const artifactStore = new Map<string, StoredArtifact>();
const evidenceStore = new Map<string, EvidencePack>();
const auditStore = new Map<string, Record<string, unknown>>();
const actionLog: Array<Record<string, unknown>> = [];

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
    .replace(/^_+|_+$/g, '') || 'field';
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = valueToText(value).replace(/,/g, '').replace(/[^\d.\-]/g, '');
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : 0;
}

function inferDType(values: unknown[]): DatasetColumn['dtype'] {
  const texts = values.map(valueToText).filter(Boolean);
  if (texts.length === 0) return 'string';
  if (texts.every(value => /^-?\d+(\.\d+)?$/.test(value))) return 'number';
  if (texts.every(value => /^(true|false)$/i.test(value))) return 'boolean';
  if (texts.every(value => !Number.isNaN(Date.parse(value)))) return 'date';
  return 'string';
}

function inferSemantic(name: string): string {
  const lowered = name.toLowerCase();
  if (/date|month|year|quarter|period|تاريخ|شهر|سنة|ربع/.test(lowered)) return 'time';
  if (/revenue|sales|profit|cost|amount|orders|margin|mrr|arr|مبيعات|إيراد|ربح|تكلفة/.test(lowered)) return 'measure';
  if (/region|city|country|segment|category|department|منطقة|مدينة|قسم|فئة/.test(lowered)) return 'dimension';
  if (/customer|client|employee|user|عميل|موظف/.test(lowered)) return 'entity';
  return 'attribute';
}

function resolveAssetPath(uri: string): string {
  if (existsSync(uri)) return uri;
  if (uri.startsWith('file:///')) {
    const candidate = uri.replace('file:///', '');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Asset not found: ${uri}`);
}

function detectDomain(columns: string[]): string {
  const joined = columns.join(' ').toLowerCase();
  if (/revenue|sales|orders|margin|pipeline/.test(joined)) return 'sales';
  if (/budget|expense|invoice|ledger|profit/.test(joined)) return 'finance';
  if (/employee|attendance|salary|department/.test(joined)) return 'hr';
  return 'ops';
}

function requireDataset(ref: DatasetRef | string): DatasetModel {
  const datasetId = typeof ref === 'string' ? ref : ref.dataset_id;
  const dataset = datasetStore.get(datasetId);
  if (!dataset) throw new Error(`Dataset not found: ${datasetId}`);
  return dataset;
}

function requireDashboard(ref: DashboardRef | string): DashboardModel {
  const dashboardId = typeof ref === 'string' ? ref : ref.dashboard_id;
  const dashboard = dashboardStore.get(dashboardId);
  if (!dashboard) throw new Error(`Dashboard not found: ${dashboardId}`);
  return dashboard;
}

function recordAction(toolId: string, requestId: string, refs: Record<string, unknown>): void {
  actionLog.push({
    action_id: createId('action'),
    tool_id: toolId,
    request_id: requestId,
    timestamp: new Date().toISOString(),
    refs,
  });
}

function readCsvTable(filePath: string): DatasetTable[] {
  const workbook = XLSX.readFile(filePath, { raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Array<Record<string, unknown>>;
  const normalizedRows = rows.map((row, index) => ({
    __row_id: `${basename(filePath)}:${index + 1}`,
    ...Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeToken(key), value])),
  }));
  const sample = normalizedRows[0] ?? { __row_id: 'none' };
  const keys = Object.keys(sample).filter(key => key !== '__row_id');
  return [{
    table_id: createId('table'),
    name: normalizeToken(basename(filePath, extname(filePath))),
    columns: keys.map(key => ({
      name: key,
      dtype: inferDType(normalizedRows.map(row => row[key])),
      semantic: inferSemantic(key),
    })),
    rows: normalizedRows,
  }];
}

function readWorkbookTables(filePath: string): DatasetTable[] {
  const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false });
  return workbook.SheetNames.map(sheetName => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null }) as Array<Record<string, unknown>>;
    const normalizedRows = rows.map((row, index) => ({
      __row_id: `${sheetName}:${index + 1}`,
      ...Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeToken(key), value])),
    }));
    const sample = normalizedRows[0] ?? { __row_id: 'none' };
    const keys = Object.keys(sample).filter(key => key !== '__row_id');
    return {
      table_id: createId('table'),
      name: normalizeToken(sheetName),
      columns: keys.map(key => ({
        name: key,
        dtype: inferDType(normalizedRows.map(row => row[key])),
        semantic: inferSemantic(key),
      })),
      rows: normalizedRows,
    };
  }).filter(table => table.rows.length > 0);
}

function buildSyntheticDatasetFromAsset(asset: DashboardAssetRef): DatasetModel {
  const table: DatasetTable = {
    table_id: createId('table'),
    name: `${normalizeToken(basename(asset.uri, extname(asset.uri)))}_synthetic`,
    columns: [
      { name: 'segment', dtype: 'string', semantic: 'dimension' },
      { name: 'value', dtype: 'number', semantic: 'measure' },
      { name: 'state', dtype: 'string', semantic: 'dimension' },
    ],
    rows: [
      { __row_id: `${asset.asset_id}:1`, segment: 'A', value: 120, state: 'default' },
      { __row_id: `${asset.asset_id}:2`, segment: 'B', value: 240, state: 'default' },
      { __row_id: `${asset.asset_id}:3`, segment: 'C', value: 180, state: 'default' },
    ],
  };
  const datasetId = createId('dataset');
  const dataset: DatasetModel = {
    dataset_id: datasetId,
    assets: [asset],
    tables: [table],
    domain: 'synthetic',
    synthetic: true,
    quality_score: 100,
    lineage: {
      source_asset_id: asset.asset_id,
      reconstructed_synthetic: true,
    },
  };
  datasetStore.set(datasetId, dataset);
  return dataset;
}

function ingestAssetsToDatasets(assets: DashboardAssetRef[], strictImport = false): DatasetRef[] {
  return assets.map(asset => {
    const filePath = resolveAssetPath(asset.uri);
    const extension = extname(filePath).toLowerCase();
    let tables: DatasetTable[] = [];
    let synthetic = false;

    if (asset.mime.includes('csv') || extension === '.csv' || extension === '.txt') {
      tables = readCsvTable(filePath);
    } else if (asset.mime.includes('sheet') || asset.mime.includes('excel') || extension === '.xlsx' || extension === '.xlsm' || extension === '.xls') {
      tables = readWorkbookTables(filePath);
    } else if (strictImport && (asset.mime.includes('pdf') || asset.mime.startsWith('image/'))) {
      const syntheticDataset = buildSyntheticDatasetFromAsset(asset);
      return { dataset_id: syntheticDataset.dataset_id };
    } else {
      throw new Error(`Unsupported dashboard asset type: ${asset.mime}`);
    }

    const datasetId = createId('dataset');
    const dataset: DatasetModel = {
      dataset_id: datasetId,
      assets: [asset],
      tables,
      domain: detectDomain(tables.flatMap(table => table.columns.map(column => column.name))),
      synthetic,
      quality_score: 100,
      lineage: {
        asset_id: asset.asset_id,
        tables: tables.map(table => ({ table_id: table.table_id, name: table.name })),
      },
    };
    datasetStore.set(datasetId, dataset);
    return { dataset_id: datasetId };
  });
}

function getPrimaryTable(dataset: DatasetModel): DatasetTable {
  const table = dataset.tables[0];
  if (!table) throw new Error(`Dataset ${dataset.dataset_id} has no tables`);
  return table;
}

function findMeasureColumn(table: DatasetTable): string | null {
  return table.columns.find(column => column.semantic === 'measure')?.name ?? table.columns.find(column => column.dtype === 'number')?.name ?? null;
}

function findTimeColumn(table: DatasetTable): string | null {
  return table.columns.find(column => column.semantic === 'time')?.name ?? null;
}

function findDimensionColumn(table: DatasetTable): string | null {
  return table.columns.find(column => column.semantic === 'dimension')?.name
    ?? table.columns.find(column => column.dtype === 'string')?.name
    ?? null;
}

function generateCatalogItems(catalog: string): Array<Record<string, unknown>> {
  const configMap: Record<string, { count: number; families: string[]; tags: string[] }> = {
    widget_catalog: { count: 1200, families: ['kpi', 'chart', 'table', 'slicer', 'narrative'], tags: ['dashboard', 'interactive', 'executive'] },
    chart_skin_catalog: { count: 250, families: ['bar', 'line', 'area', 'combo', 'scatter'], tags: ['chart', 'rtl', 'performance'] },
    table_style_catalog: { count: 200, families: ['dense', 'executive', 'boardroom', 'compact'], tags: ['table', 'striped', 'clean'] },
    kpi_card_catalog: { count: 400, families: ['minimal', 'executive', 'signal', 'trend'], tags: ['kpi', 'metric', 'cards'] },
    filter_ui_catalog: { count: 120, families: ['chips', 'dropdown', 'sidebar', 'toolbar'], tags: ['filter', 'slicer', 'interactive'] },
    page_layout_catalog: { count: 200, families: ['overview', 'trends', 'breakdown', 'exceptions'], tags: ['layout', 'grid', 'responsive'] },
    icon_pack_catalog: { count: 50, families: ['outline', 'solid', 'brand', 'data'], tags: ['icon', 'vector', 'rtl'] },
    theme_catalog: { count: 100, families: ['executive', 'midnight', 'daylight', 'contrast'], tags: ['theme', 'brand', 'accessible'] },
  };

  const config = configMap[catalog] ?? { count: 80, families: ['default'], tags: ['generic'] };
  return Array.from({ length: config.count }, (_value, index) => {
    const family = config.families[index % config.families.length];
    const density = ['compact', 'balanced', 'airy'][index % 3];
    const palette = ['ocean', 'sand', 'graphite', 'emerald'][index % 4];
    const rtlReady = index % 2 === 0;
    return {
      item_id: `${catalog}_${family}_${index + 1}`,
      catalog,
      family,
      title: `${family}_${density}_${palette}_${index + 1}`,
      tags: [...config.tags, family, density, palette, rtlReady ? 'rtl_ready' : 'ltr_only'],
      density,
      rtl_ready: rtlReady,
      brand_fit: ['high', 'medium', 'high'][index % 3],
      performance_fit: ['high', 'medium', 'low'][index % 3],
      params: {
        spacing_scale: [0.9, 1, 1.1][index % 3],
        corner_radius: [4, 8, 12, 16][index % 4],
        shadow_depth: [0, 1, 2, 3][index % 4],
        palette_mapping: palette,
        typography_scale: [0.95, 1, 1.05][index % 3],
      },
    };
  });
}

function rankCatalogItems(
  items: Array<Record<string, unknown>>,
  query: string,
  context: DashboardActionContext,
): Array<Record<string, unknown>> {
  const tokens = normalizeToken(query).split('_').filter(Boolean);
  return [...items]
    .map(item => {
      const itemId = String(item.item_id ?? '');
      const tags = Array.isArray(item.tags) ? item.tags.map(tag => String(tag)) : [];
      const text = `${String(item.title ?? '')} ${tags.join(' ')}`.toLowerCase();
      const intentMatch = tokens.filter(token => text.includes(token)).length / Math.max(1, tokens.length);
      const dataFit = text.includes('kpi') ? 0.8 : 0.6;
      const rtlFit = context.arabic_mode === 'ELITE' ? ((item.rtl_ready as boolean) ? 1 : 0.3) : 0.7;
      const brandFit = item.brand_fit === 'high' ? 1 : item.brand_fit === 'medium' ? 0.7 : 0.4;
      const layoutFit = text.includes('overview') || text.includes('executive') ? 0.9 : 0.6;
      const performanceFit = item.performance_fit === 'high' ? 1 : item.performance_fit === 'medium' ? 0.7 : 0.4;
      const score = (intentMatch * 0.3) + (dataFit * 0.15) + (rtlFit * 0.15) + (brandFit * 0.15) + (layoutFit * 0.15) + (performanceFit * 0.1);
      return { ...item, item_id: itemId, score: Number(score.toFixed(4)) };
    })
    .sort((left, right) => Number(right.score) - Number(left.score) || String(left.item_id).localeCompare(String(right.item_id)));
}

function detectPageNames(objective: string, locale: string, count: number): string[] {
  const arabic = locale.toLowerCase().startsWith('ar');
  const pages = objective === 'finance'
    ? (arabic ? ['نظرة عامة', 'الاتجاهات', 'التفصيل', 'الاستثناءات'] : ['Overview', 'Trends', 'Breakdown', 'Exceptions'])
    : (arabic ? ['نظرة عامة', 'الاتجاهات', 'التفصيل', 'الفرص'] : ['Overview', 'Trends', 'Breakdown', 'Opportunities']);
  return pages.slice(0, count);
}

function createWidget(kind: WidgetKind, title: string, bbox: WidgetModel['bbox'], zIndex: number, extra: Partial<WidgetModel> = {}): WidgetModel {
  return {
    widget_id: createId('widget'),
    kind,
    title,
    bbox,
    z_index: zIndex,
    style_ref: `${kind}_default`,
    ...extra,
  };
}

function computeFingerprints(pages: DashboardPage[], datasetBindings: Array<Record<string, unknown>>, interactions: Array<Record<string, unknown>>) {
  return {
    layout_hash: hashValue(pages.map(page => page.widgets.map(widget => widget.bbox))),
    binding_hash: hashValue(datasetBindings),
    interaction_hash: hashValue(interactions),
  };
}

function buildDefaultPlan(intent: Record<string, unknown>): Record<string, unknown> {
  const pageCount = Number(intent.page_count ?? 4);
  const locale = String(intent.language ?? 'en');
  const objective = String(intent.objective ?? 'exec_ops');
  const pageNames = detectPageNames(objective, locale, pageCount);
  const pages: DashboardPage[] = pageNames.map((name, index) => ({
    page_id: createId('page'),
    index: index + 1,
    name,
    grid_spec: { columns: 24, rows: 18, gutters: 1, margins: 1 },
    widgets: [
      createWidget('kpi', `${name} KPI 1`, { x: 1, y: 1, w: 5, h: 3 }, 1),
      createWidget('kpi', `${name} KPI 2`, { x: 7, y: 1, w: 5, h: 3 }, 1),
      createWidget('kpi', `${name} KPI 3`, { x: 13, y: 1, w: 5, h: 3 }, 1),
      createWidget('slicer', `${name} Filter`, { x: 19, y: 1, w: 4, h: 3 }, 1),
      createWidget(index === 1 ? 'combo' : 'chart', `${name} Main`, { x: 1, y: 5, w: 14, h: 7 }, 1, { chart_kind: index === 1 ? 'combo' : 'bar' }),
      createWidget('table', `${name} Table`, { x: 16, y: 5, w: 7, h: 7 }, 1),
      createWidget('narrative', `${name} Summary`, { x: 1, y: 13, w: 22, h: 4 }, 1),
    ],
  }));

  const themeTokens = {
    palette: ['#0f172a', '#2563eb', '#06b6d4', '#f59e0b', '#10b981'],
    surface: '#f8fafc',
    panel: '#ffffff',
    text: '#0f172a',
    accent: '#2563eb',
    font_family: locale.toLowerCase().startsWith('ar') ? 'Cairo' : 'Segoe UI',
  };

  const datasetBindings = ((intent.dataset_refs as DatasetRef[] | undefined) ?? []).map(dataset => ({
    dataset_id: dataset.dataset_id,
    role: 'primary',
  }));
  const interactions = [
    { kind: 'global_filter', source_widget_kind: 'slicer' },
    { kind: 'cross_filter', source_widget_kind: 'chart', target_widget_kind: 'table' },
    { kind: 'bookmark', states: ['default', 'filtered'] },
  ];

  return {
    version: '1.0.0',
    page_count: pageCount,
    objective,
    pages,
    theme_tokens: themeTokens,
    dataset_bindings: datasetBindings,
    semantic_model_ref: null,
    global_filters: [],
    parameters: [],
    interactions,
    fingerprints: computeFingerprints(pages, datasetBindings, interactions),
    strict_import: Boolean(intent.strict_import),
    dataset_refs: intent.dataset_refs ?? [],
    export_targets: intent.export_targets ?? ['html', 'pdf', 'pptx'],
  };
}

function applyTirTable(table: DatasetTable, steps: Array<Record<string, unknown>>): DatasetTable {
  let rows = table.rows.map(row => ({ ...row }));
  for (const step of steps) {
    const op = String(step.op ?? '').toLowerCase();
    switch (op) {
      case 'filter': {
        const column = String(step.column);
        const operator = String(step.operator ?? 'eq');
        const value = step.value;
        rows = rows.filter(row => {
          const left = valueToText(row[column]).toLowerCase();
          const right = valueToText(value).toLowerCase();
          if (operator === 'contains') return left.includes(right);
          if (operator === 'gt') return toNumber(row[column]) > toNumber(value);
          if (operator === 'lt') return toNumber(row[column]) < toNumber(value);
          if (operator === 'not_null') return left.length > 0;
          return left === right;
        });
        break;
      }
      case 'derive': {
        const column = String(step.column);
        const source = String(step.source ?? '');
        const multiplier = Number(step.multiplier ?? 1);
        rows = rows.map(row => ({
          ...row,
          [column]: Number((toNumber(row[source]) * multiplier).toFixed(2)),
        }));
        break;
      }
      case 'rename': {
        const source = String(step.column);
        const target = String(step.to);
        rows = rows.map(row => {
          const next = { ...row, [target]: row[source] };
          delete next[source];
          return next;
        });
        break;
      }
      case 'sort': {
        const column = String(step.column);
        const direction = String(step.direction ?? 'asc');
        rows = [...rows].sort((left, right) => {
          const comparison = valueToText(left[column]).localeCompare(valueToText(right[column]), undefined, { numeric: true, sensitivity: 'base' });
          if (comparison === 0) return String(left.__row_id).localeCompare(String(right.__row_id));
          return direction === 'desc' ? -comparison : comparison;
        });
        break;
      }
      default:
        break;
    }
  }
  return {
    ...table,
    rows,
    columns: Object.keys(rows[0] ?? {}).filter(key => key !== '__row_id').map(key => ({
      name: key,
      dtype: inferDType(rows.map(row => row[key])),
      semantic: inferSemantic(key),
    })),
  };
}

function computeWidgetPayload(widget: WidgetModel, datasets: DatasetModel[], mirMeasures: Array<Record<string, unknown>>): WidgetResult {
  const datasetBinding = widget.data_binding_ref;
  const dataset = datasetBinding ? datasets.find(entry => entry.dataset_id === datasetBinding.split(':')[0]) : datasets[0];
  const table = dataset ? getPrimaryTable(dataset) : null;
  const measure = table ? findMeasureColumn(table) : null;
  const time = table ? findTimeColumn(table) : null;
  const dimension = table ? findDimensionColumn(table) : null;

  if (!table) {
    return { widget_id: widget.widget_id, kind: widget.kind, payload: { empty: true } };
  }

  if (widget.kind === 'kpi') {
    const value = measure ? table.rows.reduce((sum, row) => sum + toNumber(row[measure]), 0) : table.rows.length;
    const trend = mirMeasures.length > 0 ? Number((value * 0.08).toFixed(2)) : Number((value * 0.04).toFixed(2));
    return {
      widget_id: widget.widget_id,
      kind: widget.kind,
      payload: { value, trend, label: widget.title, threshold: value >= 0 ? 'positive' : 'negative' },
    };
  }

  if (widget.kind === 'chart' || widget.kind === 'combo' || widget.kind === 'scatter' || widget.kind === 'timeline') {
    const groupField = time ?? dimension ?? table.columns[0]?.name;
    const valueField = measure ?? table.columns.find(column => column.dtype === 'number')?.name ?? table.columns[0]?.name;
    const groups = new Map<string, number>();
    for (const row of table.rows) {
      const key = valueToText(row[groupField]);
      groups.set(key, (groups.get(key) ?? 0) + toNumber(row[valueField]));
    }
    const labels = [...groups.keys()].slice(0, 8);
    return {
      widget_id: widget.widget_id,
      kind: widget.kind,
      payload: {
        labels,
        series: [{ name: valueField, values: labels.map(label => groups.get(label) ?? 0) }],
      },
    };
  }

  if (widget.kind === 'table' || widget.kind === 'pivot') {
    const headers = table.columns.slice(0, 4).map(column => column.name);
    const rows = table.rows.slice(0, 6).map(row => headers.map(header => row[header]));
    return {
      widget_id: widget.widget_id,
      kind: widget.kind,
      payload: { headers, rows },
    };
  }

  if (widget.kind === 'slicer' || widget.kind === 'filter_panel') {
    const field = dimension ?? table.columns[0]?.name;
    const values = [...new Set(table.rows.map(row => valueToText(row[field])))]
      .filter(Boolean)
      .slice(0, 6);
    return {
      widget_id: widget.widget_id,
      kind: widget.kind,
      payload: { field, values, selected: 'all' },
    };
  }

  return {
    widget_id: widget.widget_id,
    kind: widget.kind,
    payload: {
      text: `${widget.title}: ${table.rows.length} rows, ${table.columns.length} columns`,
    },
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderWidget(
  widget: WidgetModel,
  result: WidgetResult | undefined,
  theme: Record<string, unknown>,
  pageWidth: number,
  pageHeight: number,
  grid: DashboardPage['grid_spec'],
): string {
  const cellWidth = pageWidth / grid.columns;
  const cellHeight = pageHeight / grid.rows;
  const x = widget.bbox.x * cellWidth;
  const y = widget.bbox.y * cellHeight;
  const w = widget.bbox.w * cellWidth;
  const h = widget.bbox.h * cellHeight;
  const textColor = String(theme.text ?? '#0f172a');
  const accent = String(theme.accent ?? '#2563eb');
  let content = `<text x="${x + 24}" y="${y + 40}" font-size="28" font-weight="700" fill="${textColor}">${escapeXml(widget.title)}</text>`;

  if (result?.kind === 'kpi') {
    const trendColor = result.payload.threshold === 'positive' ? '#059669' : '#dc2626';
    content += `<text x="${x + 24}" y="${y + 100}" font-size="44" font-weight="700" fill="${textColor}">${escapeXml(String(result.payload.value ?? 0))}</text>`;
    content += `<text x="${x + 24}" y="${y + 136}" font-size="22" fill="${trendColor}">${escapeXml(`${Number(result.payload.trend ?? 0) >= 0 ? '+' : ''}${result.payload.trend ?? 0}`)}</text>`;
  } else if (result && (widget.kind === 'chart' || widget.kind === 'combo' || widget.kind === 'scatter' || widget.kind === 'timeline')) {
    const labels = (result.payload.labels as string[] | undefined) ?? [];
    const values = ((result.payload.series as Array<{ values: number[] }> | undefined)?.[0]?.values) ?? [];
    const maxValue = Math.max(1, ...values, 1);
    const plotX = x + 24;
    const plotY = y + 64;
    const plotW = w - 48;
    const plotH = h - 100;
    const step = plotW / Math.max(1, values.length);
    content += `<line x1="${plotX}" y1="${plotY + plotH}" x2="${plotX + plotW}" y2="${plotY + plotH}" stroke="#94a3b8" stroke-width="2"/>`;
    if (widget.kind === 'combo') {
      const points: string[] = [];
      values.forEach((value, index) => {
        const px = plotX + (step * index) + (step / 2);
        const barHeight = (value / maxValue) * (plotH - 20);
        const py = plotY + plotH - barHeight;
        points.push(`${px},${py}`);
        content += `<rect x="${plotX + (step * index) + 8}" y="${py}" width="${Math.max(8, step - 16)}" height="${barHeight}" fill="#38bdf8" opacity="0.65"/>`;
      });
      content += `<polyline fill="none" stroke="${accent}" stroke-width="4" points="${points.join(' ')}"/>`;
    } else {
      values.forEach((value, index) => {
        const barHeight = (value / maxValue) * (plotH - 20);
        const py = plotY + plotH - barHeight;
        content += `<rect x="${plotX + (step * index) + 8}" y="${py}" width="${Math.max(8, step - 16)}" height="${barHeight}" fill="${accent}" opacity="0.82"/>`;
      });
    }
    labels.forEach((label, index) => {
      content += `<text x="${plotX + (step * index) + 8}" y="${y + h - 16}" font-size="16" fill="#475569">${escapeXml(label.slice(0, 8))}</text>`;
    });
  } else if (result && (widget.kind === 'table' || widget.kind === 'pivot')) {
    const headers = (result.payload.headers as string[] | undefined) ?? [];
    const rows = (result.payload.rows as unknown[][] | undefined) ?? [];
    const columnWidth = (w - 32) / Math.max(1, headers.length);
    headers.forEach((header, index) => {
      content += `<text x="${x + 16 + (index * columnWidth)}" y="${y + 74}" font-size="18" fill="${textColor}">${escapeXml(header)}</text>`;
    });
    rows.forEach((row, rowIndex) => {
      row.forEach((cell, cellIndex) => {
        content += `<text x="${x + 16 + (cellIndex * columnWidth)}" y="${y + 108 + (rowIndex * 28)}" font-size="16" fill="#334155">${escapeXml(valueToText(cell).slice(0, 12))}</text>`;
      });
    });
  } else if (result && (widget.kind === 'slicer' || widget.kind === 'filter_panel')) {
    const values = (result.payload.values as string[] | undefined) ?? [];
    values.forEach((value, index) => {
      const chipX = x + 16 + ((index % 2) * ((w - 32) / 2));
      const chipY = y + 64 + (Math.floor(index / 2) * 32);
      content += `<rect x="${chipX}" y="${chipY}" width="${(w - 48) / 2}" height="24" rx="12" fill="#dbeafe"/>`;
      content += `<text x="${chipX + 12}" y="${chipY + 17}" font-size="16" fill="#1d4ed8">${escapeXml(value.slice(0, 12))}</text>`;
    });
  } else {
    content += `<text x="${x + 24}" y="${y + 88}" font-size="22" fill="#475569">${escapeXml(String(result?.payload.text ?? ''))}</text>`;
  }

  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${String(theme.panel ?? '#ffffff')}" stroke="#cbd5e1" stroke-width="2"/>
    ${content}
  </g>`;
}

async function renderPageToArtifact(
  dashboard: DashboardModel,
  page: DashboardPage,
  dpi: number,
): Promise<{ artifact: ArtifactRef; hash: string }> {
  const width = Math.round(1600 * (dpi / 160));
  const height = Math.round(900 * (dpi / 160));
  const widgetsSvg = page.widgets
    .sort((left, right) => left.z_index - right.z_index)
    .map(widget => renderWidget(
      widget,
      dashboard.widget_results.get(widget.widget_id),
      dashboard.ir.theme_tokens,
      width,
      height,
      page.grid_spec,
    ))
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${String(dashboard.ir.theme_tokens.surface ?? '#f8fafc')}"/>
    <text x="48" y="54" font-size="38" font-weight="700" fill="${String(dashboard.ir.theme_tokens.text ?? '#0f172a')}">${escapeXml(page.name)}</text>
    ${widgetsSvg}
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const artifactId = createId('artifact');
  const outputPath = join(runtimeDir, `${artifactId}.png`);
  writeFileSync(outputPath, buffer);
  const artifact: ArtifactRef = { artifact_id: artifactId, kind: 'png', uri: outputPath };
  artifactStore.set(artifactId, {
    artifact,
    dashboard_id: dashboard.dashboard_id,
    export_kind: 'png',
    preview_hashes: { [page.page_id]: hashBuffer(buffer) },
  });
  return { artifact, hash: hashBuffer(buffer) };
}

async function handleIntentParse(request: DashboardToolRequest<{ prompt: string; assets?: DashboardAssetRef[] }, { strict_import?: boolean; pages_hint?: number }>): Promise<DashboardToolResponse<{ intent: Record<string, unknown> }>> {
  const prompt = request.inputs.prompt.normalize('NFC');
  const normalized = prompt.toLowerCase();
  const strictImport = Boolean(request.params.strict_import);
  const assets = request.inputs.assets ?? [];
  const datasetRefs = assets.length > 0 ? ingestAssetsToDatasets(assets, strictImport) : [];
  const pageCount = request.params.pages_hint
    ?? Number((prompt.match(/\b(\d+)\b/)?.[1] ?? '4'));
  const intent = {
    objective: /finance|مالي|budget|expense|profit/.test(normalized)
      ? 'finance'
      : /sales|مبيعات|pipeline|revenue|orders/.test(normalized)
        ? 'sales'
        : 'exec_ops',
    audience: /executive|board|تنفيذي|إدارة/.test(normalized) ? 'executive' : 'general',
    page_count: Math.max(1, Math.min(50, pageCount)),
    language: request.context.locale.toLowerCase().startsWith('ar') ? 'ar' : 'en',
    strict_import: strictImport,
    prompt,
    dataset_refs: datasetRefs,
    export_targets: ['html', 'pdf', 'pptx', 'xlsx'],
    must_include: [
      'overview',
      /trend|اتجاه/.test(normalized) ? 'trends' : null,
      /exception|استثناء|anomaly/.test(normalized) ? 'exceptions' : null,
    ].filter(Boolean),
  };

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: { intent },
    warnings: [],
  };
}

async function handleCatalogSearch(request: DashboardToolRequest<{ query: string }, { catalog: string; top_k: number }>): Promise<DashboardToolResponse<{ items: Array<Record<string, unknown>> }>> {
  const items = rankCatalogItems(generateCatalogItems(request.params.catalog), request.inputs.query, request.context)
    .slice(0, request.params.top_k);

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: { items },
  };
}

async function handlePlan(request: DashboardToolRequest<{ intent: Record<string, unknown> }, Record<string, never>>): Promise<DashboardToolResponse<{ dashboard_ir_plan: Record<string, unknown> }>> {
  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      dashboard_ir_plan: buildDefaultPlan(request.inputs.intent),
    },
  };
}

async function handleBuild(request: DashboardToolRequest<{ dashboard_ir_plan: Record<string, unknown> }, Record<string, never>>): Promise<DashboardToolResponse<{ dashboard: DashboardRef }>> {
  const dashboardId = createId('dashboard');
  const pages = ((request.inputs.dashboard_ir_plan.pages as DashboardPage[] | undefined) ?? []).map(page => ({
    ...page,
    page_id: page.page_id || createId('page'),
    widgets: page.widgets.map(widget => ({ ...widget, widget_id: widget.widget_id || createId('widget') })),
  }));
  const ir: DashboardIR = {
    version: '1.0.0',
    dashboard_id: dashboardId,
    pages,
    theme_tokens: (request.inputs.dashboard_ir_plan.theme_tokens as Record<string, unknown>) ?? {},
    dataset_bindings: (request.inputs.dashboard_ir_plan.dataset_bindings as Array<Record<string, unknown>>) ?? [],
    semantic_model_ref: (request.inputs.dashboard_ir_plan.semantic_model_ref as string | null) ?? null,
    global_filters: (request.inputs.dashboard_ir_plan.global_filters as Array<Record<string, unknown>>) ?? [],
    parameters: (request.inputs.dashboard_ir_plan.parameters as Array<Record<string, unknown>>) ?? [],
    interactions: (request.inputs.dashboard_ir_plan.interactions as Array<Record<string, unknown>>) ?? [],
    fingerprints: computeFingerprints(
      pages,
      (request.inputs.dashboard_ir_plan.dataset_bindings as Array<Record<string, unknown>>) ?? [],
      (request.inputs.dashboard_ir_plan.interactions as Array<Record<string, unknown>>) ?? [],
    ),
  };
  const dashboard: DashboardModel = {
    dashboard_id: dashboardId,
    page_count: pages.length,
    intent: request.inputs.dashboard_ir_plan,
    ir,
    widget_results: new Map(),
    preview_renders: [],
    preview_hashes: {},
    bound_dataset_ids: [],
  };
  dashboardStore.set(dashboardId, dashboard);
  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: { dashboard: { dashboard_id: dashboardId, page_count: dashboard.page_count } },
  };
}

async function handleBindData(request: DashboardToolRequest<{ dashboard: DashboardRef; datasets: DatasetRef[]; tir_steps?: Array<Record<string, unknown>>; mir_measures?: Array<Record<string, unknown>> }, Record<string, never>>): Promise<DashboardToolResponse<{ dashboard: DashboardRef }>> {
  const dashboard = requireDashboard(request.inputs.dashboard);
  const datasets = request.inputs.datasets.map(requireDataset);
  const tirSteps = request.inputs.tir_steps ?? [];
  const mirMeasures = request.inputs.mir_measures ?? [];
  const transformedDatasets = datasets.map(dataset => ({
    ...dataset,
    tables: dataset.tables.map(table => applyTirTable(table, tirSteps)),
  }));

  dashboard.bound_dataset_ids = transformedDatasets.map(dataset => dataset.dataset_id);
  dashboard.ir.dataset_bindings = transformedDatasets.map(dataset => ({
    dataset_id: dataset.dataset_id,
    tables: dataset.tables.map(table => table.table_id),
  }));

  for (const page of dashboard.ir.pages) {
    for (const widget of page.widgets) {
      const dataset = transformedDatasets[0];
      if (dataset) {
        const table = getPrimaryTable(dataset);
        widget.data_binding_ref = `${dataset.dataset_id}:${table.table_id}`;
        dashboard.widget_results.set(widget.widget_id, computeWidgetPayload(widget, transformedDatasets, mirMeasures));
      }
    }
  }

  dashboard.ir.fingerprints = computeFingerprints(dashboard.ir.pages, dashboard.ir.dataset_bindings, dashboard.ir.interactions);
  dashboardStore.set(dashboard.dashboard_id, dashboard);

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: { dashboard: { dashboard_id: dashboard.dashboard_id, page_count: dashboard.page_count } },
  };
}

async function handleRenderPreview(request: DashboardToolRequest<{ dashboard: DashboardRef }, { dpi: number }>): Promise<DashboardToolResponse<{ renders: ArtifactRef[] }>> {
  const dashboard = requireDashboard(request.inputs.dashboard);
  dashboard.preview_renders = [];
  dashboard.preview_hashes = {};

  for (const page of dashboard.ir.pages) {
    const rendered = await renderPageToArtifact(dashboard, page, request.params.dpi);
    dashboard.preview_renders.push(rendered.artifact);
    dashboard.preview_hashes[page.page_id] = rendered.hash;
  }

  dashboardStore.set(dashboard.dashboard_id, dashboard);

  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: { renders: dashboard.preview_renders },
  };
}

function collectQaIssues(dashboard: DashboardModel): Array<Record<string, unknown>> {
  const issues: Array<Record<string, unknown>> = [];
  for (const page of dashboard.ir.pages) {
    for (const widget of page.widgets) {
      if ((widget.kind === 'kpi' || widget.kind === 'chart' || widget.kind === 'combo' || widget.kind === 'table' || widget.kind === 'slicer') && !widget.data_binding_ref) {
        issues.push({ code: 'missing_binding', page_id: page.page_id, widget_id: widget.widget_id });
      }
      if (widget.bbox.x < 0 || widget.bbox.y < 0 || widget.bbox.x + widget.bbox.w > page.grid_spec.columns || widget.bbox.y + widget.bbox.h > page.grid_spec.rows) {
        issues.push({ code: 'out_of_bounds', page_id: page.page_id, widget_id: widget.widget_id });
      }
    }
    for (let leftIndex = 0; leftIndex < page.widgets.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < page.widgets.length; rightIndex += 1) {
        const left = page.widgets[leftIndex];
        const right = page.widgets[rightIndex];
        const overlap = !(left.bbox.x + left.bbox.w <= right.bbox.x
          || right.bbox.x + right.bbox.w <= left.bbox.x
          || left.bbox.y + left.bbox.h <= right.bbox.y
          || right.bbox.y + right.bbox.h <= left.bbox.y);
        if (overlap) {
          issues.push({ code: 'overlap', page_id: page.page_id, widget_ids: [left.widget_id, right.widget_id] });
        }
      }
    }
  }
  return issues;
}

async function handleQaValidate(request: DashboardToolRequest<{ dashboard: DashboardRef }, { must_pass_all: true }>): Promise<DashboardToolResponse<{ pass: boolean; issues: Array<Record<string, unknown>> }>> {
  const dashboard = requireDashboard(request.inputs.dashboard);
  const issues = collectQaIssues(dashboard);
  dashboard.latest_qa = { pass: issues.length === 0, issues };
  dashboardStore.set(dashboard.dashboard_id, dashboard);
  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      pass: issues.length === 0,
      issues,
    },
  };
}

async function handleQaAutofix(request: DashboardToolRequest<{ dashboard: DashboardRef; issues: Array<Record<string, unknown>> }, Record<string, never>>): Promise<DashboardToolResponse<{ dashboard: DashboardRef; fix_log: Array<Record<string, unknown>> }>> {
  const dashboard = requireDashboard(request.inputs.dashboard);
  const fixLog: Array<Record<string, unknown>> = [];
  for (const issue of request.inputs.issues) {
    if (issue.code === 'overlap' && Array.isArray(issue.widget_ids)) {
      const page = dashboard.ir.pages.find(entry => entry.page_id === issue.page_id);
      const widget = page?.widgets.find(entry => entry.widget_id === issue.widget_ids[1]);
      if (widget && page) {
        const others = page.widgets.filter(entry => entry.widget_id !== widget.widget_id);
        let placed = false;
        for (let y = 0; y <= page.grid_spec.rows - widget.bbox.h && !placed; y += 1) {
          for (let x = 0; x <= page.grid_spec.columns - widget.bbox.w && !placed; x += 1) {
            const candidate = { ...widget.bbox, x, y };
            const collision = others.some(other => !(
              candidate.x + candidate.w <= other.bbox.x
              || other.bbox.x + other.bbox.w <= candidate.x
              || candidate.y + candidate.h <= other.bbox.y
              || other.bbox.y + other.bbox.h <= candidate.y
            ));
            if (!collision) {
              widget.bbox = candidate;
              placed = true;
            }
          }
        }
        if (!placed) {
          widget.bbox.y = Math.max(0, Math.min(page.grid_spec.rows - widget.bbox.h, widget.bbox.y));
        }
        fixLog.push({ issue: 'overlap', widget_id: widget.widget_id, action: 'move_down' });
      }
    }
    if (issue.code === 'out_of_bounds') {
      const page = dashboard.ir.pages.find(entry => entry.page_id === issue.page_id);
      const widget = page?.widgets.find(entry => entry.widget_id === issue.widget_id);
      if (widget && page) {
        widget.bbox.x = Math.max(0, Math.min(widget.bbox.x, page.grid_spec.columns - widget.bbox.w));
        widget.bbox.y = Math.max(0, Math.min(widget.bbox.y, page.grid_spec.rows - widget.bbox.h));
        fixLog.push({ issue: 'out_of_bounds', widget_id: widget.widget_id, action: 'clamp_bbox' });
      }
    }
    if (issue.code === 'missing_binding') {
      const page = dashboard.ir.pages.find(entry => entry.page_id === issue.page_id);
      const widget = page?.widgets.find(entry => entry.widget_id === issue.widget_id);
      const dataset = dashboard.bound_dataset_ids[0] ? requireDataset(dashboard.bound_dataset_ids[0]) : undefined;
      if (widget && dataset) {
        widget.data_binding_ref = `${dataset.dataset_id}:${getPrimaryTable(dataset).table_id}`;
        dashboard.widget_results.set(widget.widget_id, computeWidgetPayload(widget, [dataset], []));
        fixLog.push({ issue: 'missing_binding', widget_id: widget.widget_id, action: 'auto_bind_primary_dataset' });
      }
    }
  }
  dashboard.latest_qa = { pass: collectQaIssues(dashboard).length === 0, issues: collectQaIssues(dashboard) };
  dashboardStore.set(dashboard.dashboard_id, dashboard);
  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      dashboard: { dashboard_id: dashboard.dashboard_id, page_count: dashboard.page_count },
      fix_log: fixLog,
    },
  };
}

async function ensurePreview(dashboard: DashboardModel): Promise<void> {
  if (dashboard.preview_renders.length === dashboard.ir.pages.length && dashboard.preview_renders.length > 0) return;
  const response = await handleRenderPreview({
    request_id: createId('req'),
    tool_id: 'dashboard.render_preview',
    context: {
      workspace_id: 'system',
      user_id: 'system',
      mode: 'AUTO',
      arabic_mode: 'ELITE',
      locale: 'en-US',
    },
    inputs: { dashboard: { dashboard_id: dashboard.dashboard_id, page_count: dashboard.page_count } },
    params: { dpi: 160 },
  });
  dashboard.preview_renders = response.refs.renders;
}

async function writeDocxFromDashboard(dashboard: DashboardModel, outputPath: string): Promise<void> {
  const output = createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);

  const titles = dashboard.ir.pages.map(page => `<w:p><w:r><w:t>${page.name}</w:t></w:r></w:p>`).join('');
  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`, { name: '[Content_Types].xml' });
  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`, { name: '_rels/.rels' });
  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${titles}<w:sectPr/></w:body>
</w:document>`, { name: 'word/document.xml' });
  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>RASID Dashboard Engine</Application></Properties>`, { name: 'docProps/app.xml' });
  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${dashboard.intent.prompt ?? 'Dashboard Report'}</dc:title>
</cp:coreProperties>`, { name: 'docProps/core.xml' });

  await archive.finalize();
  await new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);
  });
}

async function writePptxFromDashboard(dashboard: DashboardModel, outputPath: string): Promise<void> {
  const output = createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);

  const slideOverrides = dashboard.ir.pages.map((_page, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
  const slideRels = dashboard.ir.pages.map((_page, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join('');
  const sldIds = dashboard.ir.pages.map((_page, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join('');

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${slideOverrides}
</Types>`, { name: '[Content_Types].xml' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`, { name: '_rels/.rels' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${sldIds}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`, { name: 'ppt/presentation.xml' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRels}
</Relationships>`, { name: 'ppt/_rels/presentation.xml.rels' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld name="Master">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`, { name: 'ppt/slideMasters/slideMaster1.xml' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`, { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Layout">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`, { name: 'ppt/slideLayouts/slideLayout1.xml' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`, { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="RASID Theme">
  <a:themeElements>
    <a:clrScheme name="RASID">
      <a:dk1><a:srgbClr val="0F172A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1E293B"/></a:dk2><a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="2563EB"/></a:accent1><a:accent2><a:srgbClr val="06B6D4"/></a:accent2>
      <a:accent3><a:srgbClr val="10B981"/></a:accent3><a:accent4><a:srgbClr val="F59E0B"/></a:accent4>
      <a:accent5><a:srgbClr val="7C3AED"/></a:accent5><a:accent6><a:srgbClr val="DC2626"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="RASID Fonts"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="RASID Format"><a:fillStyleLst><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="lt2"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements>
</a:theme>`, { name: 'ppt/theme/theme1.xml' });

  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>RASID Dashboard Engine</Application><Slides>${dashboard.ir.pages.length}</Slides></Properties>`, { name: 'docProps/app.xml' });
  archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${escapeXml(String(dashboard.intent.prompt ?? 'Dashboard Export'))}</dc:title>
</cp:coreProperties>`, { name: 'docProps/core.xml' });

  dashboard.ir.pages.forEach((page, index) => {
    const widgetText = page.widgets.map(widget => `${widget.title} (${widget.kind})`).join(' | ');
    archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="274320"/><a:ext cx="10972800" cy="914400"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" b="1"/><a:t>${escapeXml(page.name)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="1371600"/><a:ext cx="10972800" cy="4114800"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1800"/><a:t>${escapeXml(widgetText)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`, { name: `ppt/slides/slide${index + 1}.xml` });

    archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`, { name: `ppt/slides/_rels/slide${index + 1}.xml.rels` });
  });

  await archive.finalize();
  await new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);
  });
}

async function exportDashboardArtifact(dashboard: DashboardModel, exportKind: Exclude<ArtifactKind, 'json'>): Promise<ArtifactRef> {
  await ensurePreview(dashboard);
  const artifactId = createId('artifact');
  const outputPath = join(runtimeDir, `${artifactId}.${exportKind}`);
  const previewHashes = { ...dashboard.preview_hashes };

  if (exportKind === 'html') {
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${dashboard.intent.prompt ?? 'Dashboard'}</title>
<style>body{font-family:Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;margin:0}nav{display:flex;gap:8px;padding:16px;background:#111827;position:sticky;top:0}button{padding:8px 12px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;cursor:pointer}.page{display:none;padding:24px}.page.active{display:block}img{max-width:100%;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.2)}</style>
</head><body><nav>${dashboard.ir.pages.map((page, index) => `<button onclick="showPage(${index})">${page.name}</button>`).join('')}</nav>
${dashboard.preview_renders.map((render, index) => `<section class="page ${index === 0 ? 'active' : ''}" id="page-${index}"><img src="${render.uri.replace(/\\/g, '/')}" alt="page-${index}"/></section>`).join('')}
<script>function showPage(i){document.querySelectorAll('.page').forEach((el,idx)=>el.classList.toggle('active',idx===i));}</script></body></html>`;
    writeFileSync(outputPath, html, 'utf8');
  } else if (exportKind === 'pdf') {
    const doc = new PDFDocument({ autoFirstPage: false, size: [1600, 900], margin: 0 });
    const stream = createWriteStream(outputPath);
    doc.pipe(stream);
    dashboard.preview_renders.forEach(render => {
      doc.addPage({ size: [1600, 900], margin: 0 });
      doc.image(render.uri, 0, 0, { fit: [1600, 900] });
    });
    doc.end();
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });
  } else if (exportKind === 'pptx') {
    await writePptxFromDashboard(dashboard, outputPath);
  } else if (exportKind === 'xlsx') {
    const workbook = XLSX.utils.book_new();
    dashboard.ir.pages.forEach(page => {
      const pageRows: unknown[][] = [['widget_id', 'kind', 'title', 'binding']];
      page.widgets.forEach(widget => {
        pageRows.push([widget.widget_id, widget.kind, widget.title, widget.data_binding_ref ?? '']);
      });
      const sheet = XLSX.utils.aoa_to_sheet(pageRows);
      XLSX.utils.book_append_sheet(workbook, sheet, page.name.slice(0, 31));
    });
    const lineageSheet = XLSX.utils.json_to_sheet(dashboard.bound_dataset_ids.map(datasetId => ({ dataset_id: datasetId })));
    XLSX.utils.book_append_sheet(workbook, lineageSheet, 'lineage_meta');
    XLSX.writeFile(workbook, outputPath);
  } else if (exportKind === 'docx') {
    await writeDocxFromDashboard(dashboard, outputPath);
  } else if (exportKind === 'png') {
    writeFileSync(outputPath, readFileSync(dashboard.preview_renders[0].uri));
  }

  const manifestPath = join(runtimeDir, `${artifactId}.manifest.json`);
  writeFileSync(manifestPath, JSON.stringify({
    artifact_id: artifactId,
    dashboard_id: dashboard.dashboard_id,
    export_kind: exportKind,
    preview_hashes: previewHashes,
    preview_renders: dashboard.preview_renders,
  }, null, 2), 'utf8');

  const artifact: ArtifactRef = { artifact_id: artifactId, kind: exportKind, uri: outputPath };
  artifactStore.set(artifactId, {
    artifact,
    dashboard_id: dashboard.dashboard_id,
    export_kind: exportKind,
    preview_hashes: previewHashes,
    render_manifest_uri: manifestPath,
  });
  return artifact;
}

async function handlePublish(request: DashboardToolRequest<{ dashboard: DashboardRef; share_policy: Record<string, unknown>; permissions: Record<string, unknown> }, Record<string, never>>): Promise<DashboardToolResponse<{ link_ref: ArtifactRef; audit_entry_id: string }>> {
  const dashboard = requireDashboard(request.inputs.dashboard);
  const htmlArtifact = await exportDashboardArtifact(dashboard, 'html');
  const auditId = createId('audit');
  const linkArtifact: ArtifactRef = { artifact_id: createId('link'), kind: 'json', uri: join(runtimeDir, `${auditId}.publish.json`) };
  writeFileSync(linkArtifact.uri, JSON.stringify({
    dashboard_id: dashboard.dashboard_id,
    html_uri: htmlArtifact.uri,
    share_policy: request.inputs.share_policy,
    permissions: request.inputs.permissions,
  }, null, 2), 'utf8');
  auditStore.set(auditId, {
    audit_entry_id: auditId,
    dashboard_id: dashboard.dashboard_id,
    action: 'publish',
    share_policy: request.inputs.share_policy,
    permissions: request.inputs.permissions,
    timestamp: new Date().toISOString(),
  });
  dashboard.published_link_id = linkArtifact.artifact_id;
  dashboardStore.set(dashboard.dashboard_id, dashboard);
  artifactStore.set(linkArtifact.artifact_id, {
    artifact: linkArtifact,
    dashboard_id: dashboard.dashboard_id,
    export_kind: 'json',
  });
  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      link_ref: linkArtifact,
      audit_entry_id: auditId,
    },
  };
}

async function handleExport(request: DashboardToolRequest<{ dashboard: DashboardRef }, { export_kind: Exclude<ArtifactKind, 'json'> }>): Promise<DashboardToolResponse<{ artifact: ArtifactRef }>> {
  const dashboard = requireDashboard(request.inputs.dashboard);
  const artifact = await exportDashboardArtifact(dashboard, request.params.export_kind);
  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: { artifact },
  };
}

async function handleParityVerify(request: DashboardToolRequest<{ dashboard: DashboardRef; artifact: ArtifactRef }, Record<string, never>>): Promise<DashboardToolResponse<{ pass: boolean; report: Record<string, unknown> }>> {
  const dashboard = requireDashboard(request.inputs.dashboard);
  await ensurePreview(dashboard);
  const artifact = artifactStore.get(request.inputs.artifact.artifact_id);
  if (!artifact) throw new Error(`Artifact not found: ${request.inputs.artifact.artifact_id}`);
  const mismatches = Object.entries(dashboard.preview_hashes)
    .filter(([pageId, hash]) => artifact.preview_hashes?.[pageId] !== hash)
    .map(([pageId, hash]) => ({ page_id: pageId, expected_hash: hash, actual_hash: artifact.preview_hashes?.[pageId] ?? null }));
  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      pass: mismatches.length === 0,
      report: {
        artifact_id: request.inputs.artifact.artifact_id,
        mismatches,
      },
    },
  };
}

async function handleEvidencePack(request: DashboardToolRequest<{ dashboard: DashboardRef; artifacts?: ArtifactRef[]; qa_report?: Record<string, unknown>; parity_report?: Record<string, unknown> }, Record<string, never>>): Promise<DashboardToolResponse<{ evidence_id: string }>> {
  const dashboard = requireDashboard(request.inputs.dashboard);
  const artifactIds = (request.inputs.artifacts ?? [])
    .map(artifact => artifact.artifact_id);
  const evidenceId = createId('evidence');
  const evidencePath = join(runtimeDir, `${evidenceId}.json`);
  const evidence: EvidencePack = {
    evidence_id: evidenceId,
    dashboard_id: dashboard.dashboard_id,
    artifact_ids: artifactIds,
    qa_report: request.inputs.qa_report ?? dashboard.latest_qa ?? null,
    parity_report: request.inputs.parity_report ?? null,
    lineage: dashboard.bound_dataset_ids.map(datasetId => requireDataset(datasetId).lineage),
    actions: actionLog.filter(entry => JSON.stringify(entry.refs).includes(dashboard.dashboard_id)),
    uri: evidencePath,
  };
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
  evidenceStore.set(evidenceId, evidence);
  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: { evidence_id: evidenceId },
  };
}

const handlers: Record<string, (request: DashboardToolRequest<any, any>) => Promise<DashboardToolResponse<any>>> = {
  'dashboard.intent_parse': handleIntentParse,
  'dashboard.catalog_search': handleCatalogSearch,
  'dashboard.plan': handlePlan,
  'dashboard.build': handleBuild,
  'dashboard.bind_data': handleBindData,
  'dashboard.render_preview': handleRenderPreview,
  'dashboard.qa_validate': handleQaValidate,
  'dashboard.qa_autofix': handleQaAutofix,
  'dashboard.publish': handlePublish,
  'dashboard.export': handleExport,
  'dashboard.parity_verify': handleParityVerify,
  'dashboard.evidence_pack': handleEvidencePack,
};

export async function executeDashboardTool<TRefs = Record<string, unknown>>(request: DashboardToolRequest): Promise<DashboardToolResponse<TRefs>> {
  validateDashboardToolContract(request.tool_id, 'request' as DashboardContractDirection, request);
  const handler = handlers[request.tool_id];
  if (!handler) {
    throw new Error(`Dashboard tool not implemented: ${request.tool_id}`);
  }
  const response = await handler(request);
  validateDashboardToolContract(request.tool_id, 'response' as DashboardContractDirection, response);
  recordAction(request.tool_id, request.request_id, response.refs);
  return response as DashboardToolResponse<TRefs>;
}

export function listDashboardTools() {
  return [...DASHBOARD_TOOL_DEFINITIONS];
}

export function getDashboard(dashboardId: string): DashboardModel | undefined {
  return dashboardStore.get(dashboardId);
}

export function getDataset(datasetId: string): DatasetModel | undefined {
  return datasetStore.get(datasetId);
}

export function getArtifact(artifactId: string): StoredArtifact | undefined {
  return artifactStore.get(artifactId);
}

export function getEvidence(evidenceId: string): EvidencePack | undefined {
  return evidenceStore.get(evidenceId);
}

export function resetDashboardUltraEngine(): void {
  datasetStore.clear();
  dashboardStore.clear();
  artifactStore.clear();
  evidenceStore.clear();
  auditStore.clear();
  actionLog.length = 0;
  if (existsSync(runtimeDir)) {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
  mkdirSync(runtimeDir, { recursive: true });
}
