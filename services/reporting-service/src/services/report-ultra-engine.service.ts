import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  type ISectionOptions,
} from 'docx';
import { tmpdir } from 'os';
import { basename, extname, join } from 'path';
import {
  REPORT_TOOL_DEFINITIONS,
  validateReportToolContract,
  type ReportContractDirection,
} from './report-tool-contracts';

const PptxGenJS = require('pptxgenjs');

export type ReportMode = 'AUTO' | 'CONTROLLED';
export type ArabicMode = 'BASIC' | 'PROFESSIONAL' | 'ELITE';
export type FidelityMode = 'literal_1to1' | 'smart';
export type DetailLevel = 'brief' | 'standard' | 'deep' | 'audit';
export type Tone = 'formal' | 'neutral' | 'persuasive' | 'urgent';
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted';
export type ArtifactKind = 'docx' | 'pdf' | 'html' | 'pptx' | 'xlsx' | 'png' | 'json';
export type SectionKind =
  | 'cover'
  | 'toc'
  | 'executive_summary'
  | 'body'
  | 'findings'
  | 'recommendations'
  | 'appendix'
  | 'glossary'
  | 'references'
  | 'signoff';
export type BlockKind =
  | 'heading'
  | 'paragraph'
  | 'bullets'
  | 'table'
  | 'chart'
  | 'kpi_cards'
  | 'figure'
  | 'callout'
  | 'quote'
  | 'code'
  | 'appendix_table'
  | 'signature'
  | 'page_break';

export interface ReportActionContext {
  workspace_id: string;
  user_id: string;
  mode: ReportMode;
  arabic_mode: ArabicMode;
  locale: string;
  [key: string]: unknown;
}

export interface ReportAssetRef {
  asset_id: string;
  uri: string;
  mime: string;
  sha256: string;
}

export interface DatasetRef {
  dataset_id: string;
}

export interface DocRef {
  doc_id: string;
  version: number;
}

export interface ArtifactRef {
  artifact_id: string;
  kind: ArtifactKind;
  uri: string;
}

export interface ReportToolRequest<TInputs = Record<string, unknown>, TParams = Record<string, unknown>> {
  request_id: string;
  tool_id: string;
  context: ReportActionContext;
  inputs: TInputs;
  params: TParams;
}

export interface ReportToolResponse<TRefs = Record<string, unknown>> {
  request_id: string;
  tool_id: string;
  status: 'ok' | 'failed';
  refs: TRefs;
  warnings?: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error' }>;
  failure?: { code: string; message: string };
}

interface DatasetTable {
  table_id: string;
  name: string;
  columns: string[];
  rows: Array<Record<string, unknown> & { __row_id: string }>;
}

interface DatasetModel extends DatasetRef {
  assets: ReportAssetRef[];
  tables: DatasetTable[];
  lineage: Record<string, unknown>;
  semantic_tags: string[];
  signature: string;
  synthetic: boolean;
}

interface TemplateModel {
  template_id: string;
  style_tokens: Record<string, unknown>;
  writing_rules: Record<string, unknown>;
  numbering_rules: Record<string, unknown>;
  compliance_rules: Record<string, unknown>;
  source_asset_id: string;
}

interface ReportBlock {
  block_id: string;
  kind: BlockKind;
  style_ref: string;
  content: Record<string, unknown>;
  data_binding_ref?: string;
  rtl_policy: 'auto' | 'force_rtl';
}

interface ReportSection {
  section_id: string;
  index: number;
  title: string;
  kind: SectionKind;
  blocks: ReportBlock[];
  header_footer_overrides?: Record<string, unknown>;
  numbering_scheme?: string;
}

interface DocIR {
  version: string;
  doc_id: string;
  locale: string;
  arabic_mode: ArabicMode;
  page_setup: {
    paper_size: 'A4' | 'Letter';
    margins: { top: number; right: number; bottom: number; left: number };
    rtl: boolean;
  };
  template_refs: {
    brand: string | null;
    report: string | null;
    writing: string | null;
  };
  sections: ReportSection[];
  global_fields: Record<string, unknown>;
  references: Array<Record<string, unknown>>;
  data_bindings: Array<Record<string, unknown>>;
  fingerprints: {
    layout_hash: string;
    style_hash: string;
    writing_hash: string;
    binding_hash: string;
  };
}

interface ReportModel extends DocRef {
  intent: Record<string, unknown>;
  outline: Record<string, unknown> | null;
  doc_ir: DocIR;
  dataset_ids: string[];
  template_id?: string;
  preview_renders: ArtifactRef[];
  preview_hashes: Record<string, string>;
  latest_qa?: { pass: boolean; issues: Array<Record<string, unknown>>; report: Record<string, unknown> };
  literal_hash_report?: Record<string, unknown>;
  content_trace?: Record<string, unknown>;
  template_compliance?: Record<string, unknown>;
  governance?: Record<string, unknown>;
  artifact_ids: string[];
}

interface StoredArtifact {
  artifact: ArtifactRef;
  doc_id: string;
  preview_hashes?: Record<string, string>;
  render_manifest_uri?: string;
  metadata?: Record<string, unknown>;
}

interface EvidencePack {
  evidence_id: string;
  doc_id: string;
  artifact_ids: string[];
  uri: string;
  qa_report: Record<string, unknown> | null;
  parity_report: Record<string, unknown> | null;
  template_compliance: Record<string, unknown> | null;
  literal_diff: Record<string, unknown> | null;
  content_trace: Record<string, unknown> | null;
  preview_artifact_ids: string[];
  action_count: number;
}

const runtimeDir = join(tmpdir(), 'rasid-report-ultra-runtime');
mkdirSync(runtimeDir, { recursive: true });

const datasetStore = new Map<string, DatasetModel>();
const templateStore = new Map<string, TemplateModel>();
const reportStore = new Map<string, ReportModel>();
const artifactStore = new Map<string, StoredArtifact>();
const evidenceStore = new Map<string, EvidencePack>();
const governanceStore = new Map<string, Record<string, unknown>>();
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

function normalizeText(value: string): string {
  return value.normalize('NFC').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function detectArabic(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlDecode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stableToken(value: string): string {
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
  const normalized = valueToText(value).replace(/,/g, '').replace(/[^\d.\-]/g, '');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function detectLanguage(value: string): 'ar' | 'en' | 'mixed' {
  const hasArabic = detectArabic(value);
  const hasLatin = /[A-Za-z]/.test(value);
  if (hasArabic && hasLatin) return 'mixed';
  if (hasArabic) return 'ar';
  return 'en';
}

function detectReportType(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/audit|امتثال|مراجعة|تدقيق/.test(text)) return 'audit';
  if (/technical|تقني|architecture|design/.test(text)) return 'technical';
  if (/memo|مذكرة|government|حكومي/.test(text)) return 'government memo';
  if (/executive|تنفيذي|board|مجلس/.test(text)) return 'executive';
  return 'business';
}

function determineTone(prompt: string, tone?: Tone): Tone {
  if (tone) return tone;
  if (/urgent|عاجل|تصعيد/.test(prompt.toLowerCase())) return 'urgent';
  return 'formal';
}

function determineDetailLevel(prompt: string, detail?: DetailLevel): DetailLevel {
  if (detail) return detail;
  if (/audit|تفصيلي|deep|ملحق/.test(prompt.toLowerCase())) return 'audit';
  return 'standard';
}

function determineClassification(value?: Classification): Classification {
  return value ?? 'internal';
}

function docRef(report: ReportModel): DocRef {
  return { doc_id: report.doc_id, version: report.version };
}

function nextVersion(report: ReportModel): void {
  report.version += 1;
}

function ensureReport(reportRef: DocRef): ReportModel {
  const report = reportStore.get(reportRef.doc_id);
  if (!report) {
    throw new Error(`Report not found: ${reportRef.doc_id}`);
  }
  return report;
}

function recordAction(toolId: string, request: ReportToolRequest, refs: Record<string, unknown>): void {
  actionLog.push({
    action_id: createId('action'),
    tool_id: toolId,
    request_id: request.request_id,
    doc_id: 'doc' in refs ? (refs.doc as DocRef).doc_id : undefined,
    timestamp: new Date().toISOString(),
  });
}

function response<TRefs extends Record<string, unknown>>(
  request: ReportToolRequest,
  refs: TRefs,
  warnings: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error' }> = [],
): ReportToolResponse<TRefs> {
  return {
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  const pushCell = () => {
    row.push(current);
    current = '';
  };

  const pushRow = () => {
    pushCell();
    if (row.some(cell => cell.length > 0)) {
      rows.push(row);
    }
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      pushCell();
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      pushRow();
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}

function columnLetter(index: number): string {
  let result = '';
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function cellReferenceToIndex(reference: string): number {
  const letters = reference.replace(/\d+/g, '');
  let result = 0;
  for (const char of letters) {
    result = result * 26 + (char.charCodeAt(0) - 64);
  }
  return result - 1;
}

async function parseXlsxAsset(buffer: Buffer): Promise<Array<{ name: string; rows: string[][] }>> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!workbookXml || !relsXml) {
    return [];
  }

  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const sharedStrings = sharedStringsXml
    ? Array.from(sharedStringsXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g), match => xmlDecode(match[1]))
    : [];

  const relTargets = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relTargets.set(match[1], `xl/${match[2].replace(/^\.\.\//, '')}`);
  }

  const sheets: Array<{ name: string; rows: string[][] }> = [];

  for (const match of workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const sheetName = xmlDecode(match[1]);
    const relId = match[2];
    const target = relTargets.get(relId);
    if (!target) continue;
    const sheetXml = await zip.file(target)?.async('string');
    if (!sheetXml) continue;

    const rows: string[][] = [];
    for (const rowMatch of sheetXml.matchAll(/<row\b[\s\S]*?<\/row>/g)) {
      const cellValues = new Map<number, string>();
      for (const cellMatch of rowMatch[0].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cellMatch[1];
        const content = cellMatch[2];
        const refMatch = attrs.match(/\br="([^"]+)"/);
        const typeMatch = attrs.match(/\bt="([^"]+)"/);
        const reference = refMatch?.[1] ?? 'A1';
        const type = typeMatch?.[1] ?? 'n';
        const columnIndex = cellReferenceToIndex(reference);
        let value = '';

        if (type === 's') {
          const sharedIndex = Number((content.match(/<v>(\d+)<\/v>/)?.[1]) ?? '-1');
          value = sharedStrings[sharedIndex] ?? '';
        } else if (type === 'inlineStr') {
          value = xmlDecode(content.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '');
        } else {
          value = xmlDecode(content.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '');
        }

        cellValues.set(columnIndex, value);
      }

      if (cellValues.size === 0) continue;
      const maxIndex = Math.max(...cellValues.keys());
      const row = Array.from({ length: maxIndex + 1 }, (_, index) => cellValues.get(index) ?? '');
      rows.push(row);
    }

    if (rows.length > 0) {
      sheets.push({ name: sheetName, rows });
    }
  }

  return sheets;
}

function inferSemanticTag(columns: string[]): string[] {
  const joined = columns.join(' ').toLowerCase();
  const tags: string[] = [];
  if (/sales|revenue|profit|amount|إيراد|مبيعات|ربح/.test(joined)) tags.push('finance');
  if (/audit|finding|control|ملاحظة|مخالفة/.test(joined)) tags.push('audit');
  if (/date|month|year|تاريخ|شهر|سنة/.test(joined)) tags.push('time');
  if (tags.length === 0) tags.push('general');
  return tags;
}

function buildDatasetFromSheets(
  asset: ReportAssetRef,
  sheets: Array<{ name: string; rows: string[][] }>,
  synthetic = false,
): DatasetModel {
  const datasetId = createId('dataset');
  const tables = sheets
    .filter(sheet => sheet.rows.length >= 1)
    .map((sheet) => {
      const headers = sheet.rows[0].map((value, index) => stableToken(value || `column_${index + 1}`));
      const rows = sheet.rows.slice(1).map((row, rowIndex) => {
        const normalized: Record<string, unknown> & { __row_id: string } = {
          __row_id: createId(`row_${rowIndex + 1}`),
        };
        headers.forEach((header, index) => {
          normalized[header] = row[index] ?? '';
        });
        return normalized;
      });

      return {
        table_id: createId('table'),
        name: sheet.name,
        columns: headers,
        rows,
      } satisfies DatasetTable;
    });

  return {
    dataset_id: datasetId,
    assets: [asset],
    tables,
    lineage: {
      asset_id: asset.asset_id,
      source_name: basename(asset.uri),
      sheet_names: sheets.map(sheet => sheet.name),
    },
    semantic_tags: inferSemanticTag(tables.flatMap(table => table.columns)),
    signature: hashValue({ asset: asset.sha256, sheets }),
    synthetic,
  };
}

async function ingestAsset(asset: ReportAssetRef): Promise<DatasetModel | null> {
  const buffer = readFileSync(asset.uri);
  const extension = extname(asset.uri).toLowerCase();

  if (asset.mime === 'text/csv' || extension === '.csv' || extension === '.txt') {
    return buildDatasetFromSheets(asset, [{ name: basename(asset.uri), rows: parseCsv(buffer.toString('utf8')) }]);
  }

  if (
    asset.mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || extension === '.xlsx'
  ) {
    const sheets = await parseXlsxAsset(buffer);
    return buildDatasetFromSheets(asset, sheets);
  }

  return null;
}

function computeDocFingerprints(docIr: DocIR): DocIR['fingerprints'] {
  return {
    layout_hash: hashValue(docIr.sections.map(section => ({
      section_id: section.section_id,
      kind: section.kind,
      blocks: section.blocks.map(block => ({ kind: block.kind, style_ref: block.style_ref })),
    }))),
    style_hash: hashValue(docIr.sections.flatMap(section => section.blocks.map(block => block.style_ref))),
    writing_hash: hashValue(docIr.sections.flatMap(section => section.blocks.map(block => block.content))),
    binding_hash: hashValue(docIr.data_bindings),
  };
}

function defaultSectionPlan(intent: Record<string, unknown>): Array<{ title: string; kind: SectionKind; blocks: BlockKind[] }> {
  const sections: Array<{ title: string; kind: SectionKind; blocks: BlockKind[] }> = [];
  const detailLevel = intent.detail_level as DetailLevel;
  const objective = String(intent.report_type ?? 'business');

  sections.push({ title: 'Cover', kind: 'cover', blocks: ['heading', 'paragraph'] });
  sections.push({ title: 'Table of Contents', kind: 'toc', blocks: ['heading'] });
  sections.push({ title: 'Executive Summary', kind: 'executive_summary', blocks: ['heading', 'paragraph', 'kpi_cards'] });
  sections.push({ title: objective === 'audit' ? 'Findings' : 'Analysis', kind: 'findings', blocks: ['heading', 'paragraph', 'table', 'chart'] });
  sections.push({ title: 'Recommendations', kind: 'recommendations', blocks: ['heading', 'bullets', 'table'] });
  if (detailLevel === 'deep' || detailLevel === 'audit') {
    sections.push({ title: 'Appendix', kind: 'appendix', blocks: ['heading', 'appendix_table'] });
  }

  return sections;
}

function createDocSkeleton(intent: Record<string, unknown>, outline: Record<string, unknown>, template?: TemplateModel | null): DocIR {
  const docId = createId('doc');
  const language = intent.language as string;
  const rtl = language === 'ar' || language === 'mixed';
  const sections: ReportSection[] = ((outline.sections as Array<Record<string, unknown>>) ?? []).map((section, index) => {
    const blockKinds = (section.blocks as BlockKind[]) ?? ['heading', 'paragraph'];
    const title = String(section.title ?? `Section ${index + 1}`);
    return {
      section_id: createId('section'),
      index: index + 1,
      title,
      kind: (section.kind as SectionKind) ?? 'body',
      blocks: blockKinds.map((kind) => ({
        block_id: createId('block'),
        kind,
        style_ref: kind === 'heading'
          ? 'Heading1'
          : kind === 'paragraph'
            ? 'BodyText'
            : kind === 'table' || kind === 'appendix_table'
              ? 'TableGrid'
              : kind === 'kpi_cards'
                ? 'KpiCard'
                : kind === 'callout'
                  ? 'Callout'
                  : 'BodyText',
        content: kind === 'heading'
          ? { text: title }
          : kind === 'paragraph'
            ? { text: '' }
            : kind === 'bullets'
              ? { items: [] }
              : kind === 'table' || kind === 'appendix_table'
                ? { title, headers: [], rows: [] }
                : kind === 'chart'
                  ? { title, chart_kind: 'bar', points: [] }
                  : kind === 'kpi_cards'
                    ? { items: [] }
                    : { text: '' },
        rtl_policy: rtl ? 'force_rtl' : 'auto',
      })),
      numbering_scheme: template?.numbering_rules?.default_scheme as string | undefined,
    };
  });

  const docIr: DocIR = {
    version: '1.0',
    doc_id: docId,
    locale: String(intent.locale ?? 'ar-SA'),
    arabic_mode: (intent.arabic_mode as ArabicMode) ?? 'ELITE',
    page_setup: {
      paper_size: 'A4',
      margins: { top: 1440, right: 1080, bottom: 1440, left: 1080 },
      rtl,
    },
    template_refs: {
      brand: template?.template_id ?? null,
      report: template?.template_id ?? null,
      writing: template?.template_id ?? null,
    },
    sections,
    global_fields: {
      created_at: new Date().toISOString(),
      classification: intent.classification,
      tone: intent.tone,
      report_type: intent.report_type,
      recipient_title: intent.recipient_title ?? null,
      organization_name: intent.organization_name ?? null,
    },
    references: [],
    data_bindings: [],
    fingerprints: {
      layout_hash: '',
      style_hash: '',
      writing_hash: '',
      binding_hash: '',
    },
  };
  docIr.fingerprints = computeDocFingerprints(docIr);
  return docIr;
}

function summarizeDataset(dataset: DatasetModel | undefined): Record<string, unknown> {
  if (!dataset) {
    return {
      row_count: 0,
      table_count: 0,
      top_dimensions: [],
      top_measures: [],
    };
  }

  const rowCount = dataset.tables.reduce((sum, table) => sum + table.rows.length, 0);
  const columns = dataset.tables.flatMap(table => table.columns);
  const numericColumns = columns.filter(column => /amount|revenue|profit|cost|count|total|score|rate|value|orders|sales|margin/i.test(column));
  const dimensionColumns = columns.filter(column => /date|month|year|region|category|department|segment|status|name|type/i.test(column));

  return {
    row_count: rowCount,
    table_count: dataset.tables.length,
    top_dimensions: dimensionColumns.slice(0, 3),
    top_measures: numericColumns.slice(0, 3),
  };
}

function applyTirRows(
  rows: Array<Record<string, unknown> & { __row_id: string }>,
  steps: Array<Record<string, unknown>>,
): Array<Record<string, unknown> & { __row_id: string }> {
  let nextRows = rows.map(row => ({ ...row }));

  for (const step of steps) {
    const op = String(step.op ?? '').toLowerCase();

    if (op === 'select') {
      const columns = Array.isArray(step.columns) ? step.columns.map(String) : [];
      nextRows = nextRows.map(row => {
        const selected: Record<string, unknown> & { __row_id: string } = { __row_id: row.__row_id };
        columns.forEach((column) => {
          selected[column] = row[column];
        });
        return selected;
      });
      continue;
    }

    if (op === 'rename') {
      const source = String(step.source ?? '');
      const target = stableToken(String(step.target ?? source));
      nextRows = nextRows.map(row => {
        const next: Record<string, unknown> & { __row_id: string } = { __row_id: row.__row_id };
        Object.entries(row).forEach(([key, value]) => {
          if (key === '__row_id') return;
          next[key === source ? target : key] = value;
        });
        return next;
      });
      continue;
    }

    if (op === 'filter') {
      const column = String(step.column ?? '');
      const operator = String(step.operator ?? 'eq');
      const value = step.value;
      nextRows = nextRows.filter((row) => {
        const cell = row[column];
        if (operator === 'eq') return cell === value;
        if (operator === 'neq') return cell !== value;
        if (operator === 'gt') return toNumber(cell) > toNumber(value);
        if (operator === 'gte') return toNumber(cell) >= toNumber(value);
        if (operator === 'lt') return toNumber(cell) < toNumber(value);
        if (operator === 'lte') return toNumber(cell) <= toNumber(value);
        if (operator === 'contains') return valueToText(cell).includes(String(value ?? ''));
        return true;
      });
      continue;
    }

    if (op === 'derive') {
      const column = stableToken(String(step.column ?? 'derived'));
      const source = String(step.source ?? '');
      const multiplier = Number(step.multiplier ?? 1);
      const addend = Number(step.addend ?? 0);
      nextRows = nextRows.map(row => ({
        ...row,
        [column]: toNumber(row[source]) * multiplier + addend,
      }));
      continue;
    }

    if (op === 'sort') {
      const column = String(step.column ?? '');
      const direction = String(step.direction ?? 'asc');
      nextRows = nextRows
        .map((row, index) => ({ row, index }))
        .sort((left, right) => {
          const a = valueToText(left.row[column]);
          const b = valueToText(right.row[column]);
          const compare = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
          if (compare !== 0) {
            return direction === 'desc' ? -compare : compare;
          }
          return left.index - right.index;
        })
        .map(entry => entry.row);
    }
  }

  return nextRows;
}

function computeMeasures(
  dataset: DatasetModel | undefined,
  measures: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  if (!dataset || dataset.tables.length === 0) return [];
  const table = dataset.tables[0];
  return measures.map((measure) => {
    const op = String(measure.op ?? 'sum');
    const column = String(measure.column ?? '');
    const values = table.rows.map(row => toNumber(row[column]));
    let value = 0;
    if (op === 'sum' || op === 'total') value = values.reduce((sum, entry) => sum + entry, 0);
    if (op === 'avg' || op === 'average') value = values.length ? values.reduce((sum, entry) => sum + entry, 0) / values.length : 0;
    if (op === 'count') value = table.rows.length;
    if (op === 'distinct') value = new Set(table.rows.map(row => valueToText(row[column]))).size;
    if (op === 'max') value = values.length ? Math.max(...values) : 0;
    if (op === 'min') value = values.length ? Math.min(...values) : 0;
    return {
      name: String(measure.name ?? `${op}_${column || 'value'}`),
      op,
      column,
      value,
    };
  });
}

function populateBoundBlocks(
  report: ReportModel,
  dataset: DatasetModel | undefined,
  measures: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const summary = summarizeDataset(dataset);
  const computedMeasures = computeMeasures(dataset, measures);
  const primaryTable = dataset?.tables[0];

  for (const section of report.doc_ir.sections) {
    for (const block of section.blocks) {
      if (block.kind === 'kpi_cards') {
        block.content = {
          items: computedMeasures.slice(0, 4).map(measure => ({
            label: measure.name,
            value: Math.round(Number(measure.value ?? 0) * 100) / 100,
            trend: measure.op === 'sum' ? 'stable' : 'n/a',
          })),
        };
      }

      if ((block.kind === 'table' || block.kind === 'appendix_table') && primaryTable) {
        block.data_binding_ref = primaryTable.table_id;
        block.content = {
          title: block.content.title ?? primaryTable.name,
          headers: primaryTable.columns,
          rows: primaryTable.rows.slice(0, section.kind === 'appendix' ? 20 : 8).map(row => (
            primaryTable.columns.map(column => valueToText(row[column]))
          )),
        };
      }

      if (block.kind === 'chart' && primaryTable) {
        const dimension = primaryTable.columns.find(column => /date|month|year|region|category|department|segment/i.test(column)) ?? primaryTable.columns[0];
        const measureColumn = primaryTable.columns.find(column => /amount|revenue|profit|cost|count|total|sales|orders|margin/i.test(column)) ?? primaryTable.columns[1];
        block.data_binding_ref = primaryTable.table_id;
        block.content = {
          title: block.content.title ?? 'Data Trend',
          chart_kind: /date|month|year/i.test(dimension) ? 'line' : 'bar',
          x_label: dimension,
          y_label: measureColumn,
          points: primaryTable.rows.slice(0, 10).map(row => ({
            label: valueToText(row[dimension]),
            value: toNumber(row[measureColumn]),
          })),
        };
      }
    }
  }

  report.doc_ir.data_bindings = dataset
    ? dataset.tables.map(table => ({
      binding_id: table.table_id,
      dataset_id: dataset.dataset_id,
      table_id: table.table_id,
      row_count: table.rows.length,
      column_count: table.columns.length,
    }))
    : [];
  report.doc_ir.fingerprints = computeDocFingerprints(report.doc_ir);

  return {
    dataset_summary: summary,
    measures: computedMeasures,
  };
}

function toneLexicon(tone: Tone, language: string): { intro: string; recommendationLead: string; closing: string } {
  const arabic = language === 'ar' || language === 'mixed';
  if (arabic) {
    if (tone === 'urgent') {
      return {
        intro: 'يعرض هذا التقرير أهم التطورات الحرجة التي تتطلب معالجة فورية.',
        recommendationLead: 'يوصى بالتنفيذ العاجل للإجراءات التالية:',
        closing: 'وتفضلوا بقبول فائق الاحترام.',
      };
    }
    if (tone === 'persuasive') {
      return {
        intro: 'يبين هذا التقرير الفرص ذات الأثر الأعلى مع ما يدعم اتخاذ القرار.',
        recommendationLead: 'ولتسريع الأثر، نقترح ما يلي:',
        closing: 'مع خالص التقدير.',
      };
    }
    return {
      intro: 'يعرض هذا التقرير ملخصًا تنفيذيًا للبيانات والنتائج ذات الصلة.',
      recommendationLead: 'وتتضمن التوصيات المقترحة ما يلي:',
      closing: 'والسلام عليكم ورحمة الله وبركاته.',
    };
  }

  return {
    intro: 'This report presents a concise executive view of the current evidence and findings.',
    recommendationLead: 'Recommended actions are as follows:',
    closing: 'Respectfully submitted.',
  };
}

function populateSmartNarrative(report: ReportModel, prompt?: string): Record<string, unknown> {
  const intent = report.intent;
  const language = String(intent.language ?? 'en');
  const rtlPolicy: ReportBlock['rtl_policy'] = report.doc_ir.page_setup.rtl ? 'force_rtl' : 'auto';
  const lexicon = toneLexicon((intent.tone as Tone) ?? 'formal', language);
  const dataset = datasetStore.get(report.dataset_ids[0] ?? '');
  const summary = summarizeDataset(dataset);
  const primaryTable = dataset?.tables[0];
  const measures = computeMeasures(dataset, [
    { name: language === 'ar' ? 'إجمالي القيمة' : 'Total Value', op: 'sum', column: primaryTable?.columns.find(column => /amount|revenue|profit|cost|sales|orders|total|margin/i.test(column)) ?? primaryTable?.columns[1] },
    { name: language === 'ar' ? 'عدد السجلات' : 'Row Count', op: 'count' },
  ]);

  const findings: string[] = [];
  if (dataset) {
    findings.push(language === 'ar'
      ? `تم تحليل ${summary.row_count} سجلًا عبر ${summary.table_count} جدولًا.`
      : `The analysis covers ${summary.row_count} records across ${summary.table_count} table(s).`);
  }
  if (summary.top_dimensions && Array.isArray(summary.top_dimensions) && summary.top_dimensions.length > 0) {
    findings.push(language === 'ar'
      ? `أبرز الأبعاد المتاحة: ${(summary.top_dimensions as string[]).join('، ')}.`
      : `Primary available dimensions: ${(summary.top_dimensions as string[]).join(', ')}.`);
  }
  if (summary.top_measures && Array.isArray(summary.top_measures) && summary.top_measures.length > 0) {
    findings.push(language === 'ar'
      ? `أبرز المقاييس: ${(summary.top_measures as string[]).join('، ')}.`
      : `Primary measures: ${(summary.top_measures as string[]).join(', ')}.`);
  }
  if (prompt) {
    findings.push(language === 'ar'
      ? `تمت مواءمة السرد مع الطلب: ${prompt}.`
      : `The narrative was aligned to the requested objective: ${prompt}.`);
  }

  const contentTraceBlocks: Array<Record<string, unknown>> = [];

  for (const section of report.doc_ir.sections) {
    if (section.kind === 'cover') {
      section.blocks = [
        {
          block_id: createId('block'),
          kind: 'heading',
          style_ref: 'Title',
          content: { text: intent.topic },
          rtl_policy: rtlPolicy,
        },
        {
          block_id: createId('block'),
          kind: 'paragraph',
          style_ref: 'BodyText',
          content: { text: lexicon.intro },
          rtl_policy: rtlPolicy,
        },
      ];
    }

    if (section.kind === 'executive_summary') {
      section.blocks = [
        {
          block_id: createId('block'),
          kind: 'heading',
          style_ref: 'Heading1',
          content: { text: section.title },
          rtl_policy: rtlPolicy,
        },
        {
          block_id: createId('block'),
          kind: 'paragraph',
          style_ref: 'BodyText',
          content: { text: findings[0] ?? lexicon.intro },
          rtl_policy: rtlPolicy,
        },
        {
          block_id: createId('block'),
          kind: 'kpi_cards',
          style_ref: 'KpiCard',
          content: {
            items: measures.map(measure => ({
              label: measure.name,
              value: Math.round(Number(measure.value ?? 0) * 100) / 100,
              trend: 'stable',
            })),
          },
          rtl_policy: rtlPolicy,
        },
      ];
    }

    if (section.kind === 'findings' || section.kind === 'body') {
      section.blocks = [
        {
          block_id: createId('block'),
          kind: 'heading',
          style_ref: 'Heading1',
          content: { text: section.title },
          rtl_policy: rtlPolicy,
        },
        ...findings.slice(0, 3).map(text => ({
          block_id: createId('block'),
          kind: 'paragraph' as const,
          style_ref: 'BodyText',
          content: { text },
          data_binding_ref: dataset?.tables[0]?.table_id,
          rtl_policy: rtlPolicy,
        })),
        primaryTable
          ? {
            block_id: createId('block'),
            kind: 'table' as const,
            style_ref: 'TableGrid',
            content: {
              title: primaryTable.name,
              headers: primaryTable.columns,
              rows: primaryTable.rows.slice(0, 8).map(row => primaryTable.columns.map(column => valueToText(row[column]))),
            },
            data_binding_ref: primaryTable.table_id,
            rtl_policy: rtlPolicy,
          }
          : {
            block_id: createId('block'),
            kind: 'callout' as const,
            style_ref: 'Callout',
            content: { text: language === 'ar' ? 'بيانات مطلوبة' : 'Data required' },
            rtl_policy: rtlPolicy,
          },
        primaryTable
          ? {
            block_id: createId('block'),
            kind: 'chart' as const,
            style_ref: 'Chart',
            content: {
              title: language === 'ar' ? 'اتجاه المؤشر الأساسي' : 'Primary Trend',
              chart_kind: 'bar',
              points: primaryTable.rows.slice(0, 6).map((row) => ({
                label: valueToText(row[primaryTable.columns[0]]),
                value: toNumber(row[primaryTable.columns[1]]),
              })),
            },
            data_binding_ref: primaryTable.table_id,
            rtl_policy: rtlPolicy,
          }
          : {
            block_id: createId('block'),
            kind: 'paragraph' as const,
            style_ref: 'BodyText',
            content: { text: language === 'ar' ? 'لا توجد بيانات كافية لإنشاء مخطط.' : 'Insufficient data to build a chart.' },
            rtl_policy: rtlPolicy,
          },
      ];
    }

    if (section.kind === 'recommendations') {
      section.blocks = [
        {
          block_id: createId('block'),
          kind: 'heading',
          style_ref: 'Heading1',
          content: { text: section.title },
          rtl_policy: rtlPolicy,
        },
        {
          block_id: createId('block'),
          kind: 'paragraph',
          style_ref: 'BodyText',
          content: { text: lexicon.recommendationLead },
          rtl_policy: rtlPolicy,
        },
        {
          block_id: createId('block'),
          kind: 'bullets',
          style_ref: 'BodyText',
          content: {
            items: language === 'ar'
              ? [
                'اعتماد مراجعة دورية لمصادر البيانات والربط.',
                'تثبيت أصحاب المسؤولية والجدول الزمني في مصفوفة تنفيذ.',
                'متابعة المؤشرات الحرجة عبر لوحة تنفيذية محدثة.',
              ]
              : [
                'Establish a periodic review for data sources and joins.',
                'Assign owners and target dates in an execution tracker.',
                'Track critical metrics through an updated executive dashboard.',
              ],
          },
          rtl_policy: rtlPolicy,
        },
        {
          block_id: createId('block'),
          kind: 'table',
          style_ref: 'TableGrid',
          content: {
            title: language === 'ar' ? 'مصفوفة التوصيات' : 'Recommendation Matrix',
            headers: language === 'ar' ? ['التوصية', 'المالك', 'الأولوية', 'الجدول الزمني'] : ['Recommendation', 'Owner', 'Priority', 'Timeline'],
            rows: language === 'ar'
              ? [
                ['مراجعة جودة البيانات', 'Data Owner', 'عالية', 'Placeholder'],
                ['تحسين التتبع الشهري', 'PMO', 'متوسطة', 'Placeholder'],
              ]
              : [
                ['Review data quality', 'Data Owner', 'High', 'Placeholder'],
                ['Improve monthly tracking', 'PMO', 'Medium', 'Placeholder'],
              ],
          },
          rtl_policy: rtlPolicy,
        },
      ];
    }

    if (section.kind === 'appendix') {
      section.blocks = [
        {
          block_id: createId('block'),
          kind: 'heading',
          style_ref: 'Heading1',
          content: { text: section.title },
          rtl_policy: rtlPolicy,
        },
        primaryTable
          ? {
            block_id: createId('block'),
            kind: 'appendix_table',
            style_ref: 'TableGrid',
            content: {
              title: primaryTable.name,
              headers: primaryTable.columns,
              rows: primaryTable.rows.slice(0, 20).map(row => primaryTable.columns.map(column => valueToText(row[column]))),
            },
            data_binding_ref: primaryTable.table_id,
            rtl_policy: rtlPolicy,
          }
          : {
            block_id: createId('block'),
            kind: 'paragraph',
            style_ref: 'BodyText',
            content: { text: language === 'ar' ? 'لا توجد ملاحق بيانات متاحة.' : 'No appendix data is currently available.' },
            rtl_policy: rtlPolicy,
          },
      ];
    }
  }

  for (const section of report.doc_ir.sections) {
    for (const block of section.blocks) {
      contentTraceBlocks.push({
        block_id: block.block_id,
        section_id: section.section_id,
        source: block.data_binding_ref
          ? { dataset_id: dataset?.dataset_id, table_id: block.data_binding_ref }
          : { prompt: prompt ?? report.intent.prompt },
      });
    }
  }

  report.doc_ir.references = (report.intent.citation_mode === 'on' || report.intent.citation_mode === true)
    ? contentTraceBlocks
      .filter(entry => 'dataset_id' in (entry.source as Record<string, unknown>))
      .map(entry => ({
        source_id: createId('source'),
        block_id: entry.block_id,
        dataset_id: (entry.source as Record<string, unknown>).dataset_id,
        table_id: (entry.source as Record<string, unknown>).table_id,
      }))
    : [];
  report.doc_ir.fingerprints = computeDocFingerprints(report.doc_ir);

  return {
    blocks: contentTraceBlocks,
    generated_at: new Date().toISOString(),
  };
}

function computeTemplateCompliance(report: ReportModel): Record<string, unknown> {
  if (!report.template_id) {
    return { pass: true, reason: 'no_template_lock' };
  }

  const template = templateStore.get(report.template_id);
  if (!template) {
    return { pass: false, reason: 'template_missing' };
  }

  const allowedStyles = new Set(Object.keys((template.style_tokens.styles as Record<string, unknown>) ?? {
    Title: true,
    Heading1: true,
    BodyText: true,
    TableGrid: true,
    KpiCard: true,
    Callout: true,
    Chart: true,
  }));
  const violations = report.doc_ir.sections.flatMap(section =>
    section.blocks
      .filter(block => !allowedStyles.has(block.style_ref))
      .map(block => ({ section_id: section.section_id, block_id: block.block_id, style_ref: block.style_ref })),
  );
  return {
    pass: violations.length === 0,
    template_id: template.template_id,
    violations,
  };
}

function blockPlainText(block: ReportBlock): string {
  if (block.kind === 'heading' || block.kind === 'paragraph' || block.kind === 'callout' || block.kind === 'quote' || block.kind === 'signature') {
    return String(block.content.text ?? '');
  }
  if (block.kind === 'bullets') {
    return ((block.content.items as string[]) ?? []).join('\n');
  }
  if (block.kind === 'kpi_cards') {
    return ((block.content.items as Array<Record<string, unknown>>) ?? [])
      .map(item => `${item.label}: ${item.value}`)
      .join('\n');
  }
  if (block.kind === 'table' || block.kind === 'appendix_table') {
    const headers = ((block.content.headers as string[]) ?? []).join(' | ');
    const rows = ((block.content.rows as string[][]) ?? []).map(row => row.join(' | ')).join('\n');
    return [String(block.content.title ?? ''), headers, rows].filter(Boolean).join('\n');
  }
  if (block.kind === 'chart') {
    return String(block.content.title ?? '');
  }
  return '';
}

function buildChartSvg(title: string, points: Array<{ label: string; value: number }>, rtl: boolean): string {
  const width = 960;
  const height = 360;
  const padding = 60;
  const maxValue = Math.max(1, ...points.map(point => point.value));
  const barWidth = Math.max(24, Math.floor((width - padding * 2) / Math.max(points.length, 1) * 0.7));

  const bars = points.map((point, index) => {
    const slot = (width - padding * 2) / Math.max(points.length, 1);
    const x = rtl
      ? width - padding - (index + 1) * slot + (slot - barWidth) / 2
      : padding + index * slot + (slot - barWidth) / 2;
    const barHeight = Math.round(((height - padding * 2) * point.value) / maxValue);
    const y = height - padding - barHeight;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="8" fill="#1f6feb" />
      <text x="${x + barWidth / 2}" y="${height - padding + 20}" font-size="14" text-anchor="middle" fill="#2d3748">${xmlEscape(point.label)}</text>
      <text x="${x + barWidth / 2}" y="${y - 8}" font-size="13" text-anchor="middle" fill="#2d3748">${point.value}</text>
    `;
  }).join('');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <text x="${rtl ? width - padding : padding}" y="36" font-size="24" font-weight="700" text-anchor="${rtl ? 'end' : 'start'}" fill="#0f172a">${xmlEscape(title)}</text>
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#cbd5e1" stroke-width="2"/>
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#cbd5e1" stroke-width="2"/>
      ${bars}
    </svg>
  `;
}

function buildHtmlForReport(report: ReportModel): string {
  const rtl = report.doc_ir.page_setup.rtl;
  const direction = rtl ? 'rtl' : 'ltr';
  const textAlign = rtl ? 'right' : 'left';
  const sectionsHtml = report.doc_ir.sections.map((section) => {
    const blocksHtml = section.blocks.map((block) => {
      if (block.kind === 'heading') {
        return `<h2>${xmlEscape(String(block.content.text ?? section.title))}</h2>`;
      }
      if (block.kind === 'paragraph' || block.kind === 'callout' || block.kind === 'quote' || block.kind === 'signature') {
        return `<p>${xmlEscape(String(block.content.text ?? ''))}</p>`;
      }
      if (block.kind === 'bullets') {
        const items = ((block.content.items as string[]) ?? []).map(item => `<li>${xmlEscape(item)}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      if (block.kind === 'kpi_cards') {
        const items = ((block.content.items as Array<Record<string, unknown>>) ?? []).map(item => `
          <div class="kpi-card">
            <div class="kpi-label">${xmlEscape(String(item.label ?? ''))}</div>
            <div class="kpi-value">${xmlEscape(String(item.value ?? ''))}</div>
          </div>
        `).join('');
        return `<div class="kpi-grid">${items}</div>`;
      }
      if (block.kind === 'table' || block.kind === 'appendix_table') {
        const headers = ((block.content.headers as string[]) ?? []).map(header => `<th>${xmlEscape(header)}</th>`).join('');
        const rows = ((block.content.rows as string[][]) ?? []).map(row => `<tr>${row.map(cell => `<td>${xmlEscape(cell)}</td>`).join('')}</tr>`).join('');
        return `<div class="table-block"><div class="table-title">${xmlEscape(String(block.content.title ?? ''))}</div><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }
      if (block.kind === 'chart') {
        const svg = buildChartSvg(
          String(block.content.title ?? 'Chart'),
          ((block.content.points as Array<Record<string, unknown>>) ?? []).map(point => ({
            label: String(point.label ?? ''),
            value: Number(point.value ?? 0),
          })),
          rtl,
        );
        return `<div class="chart-block">${svg}</div>`;
      }
      return '';
    }).join('');
    return `<section class="report-section"><h1>${xmlEscape(section.title)}</h1>${blocksHtml}</section>`;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="${xmlEscape(String(report.intent.language ?? 'en'))}" dir="${direction}">
      <head>
        <meta charset="utf-8" />
        <title>${xmlEscape(String(report.intent.topic ?? 'Report'))}</title>
        <style>
          body { font-family: "Segoe UI", Tahoma, sans-serif; margin: 0; background: #eef2f7; color: #0f172a; direction: ${direction}; text-align: ${textAlign}; }
          .page { width: 920px; margin: 24px auto; background: #fff; padding: 48px 56px; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12); }
          .report-section { margin-bottom: 48px; }
          h1, h2 { margin: 0 0 16px; }
          p, li { font-size: 15px; line-height: 1.8; }
          .kpi-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
          .kpi-card { border: 1px solid #dbe3ee; border-radius: 14px; padding: 18px; background: #f8fbff; }
          .kpi-label { font-size: 13px; color: #475569; margin-bottom: 8px; }
          .kpi-value { font-size: 28px; font-weight: 700; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 13px; }
          th { background: #eff6ff; }
          .table-title { font-weight: 700; margin-top: 8px; }
          .chart-block svg { width: 100%; height: auto; }
        </style>
      </head>
      <body>
        <div class="page">${sectionsHtml}</div>
      </body>
    </html>
  `;
}

async function renderPreview(report: ReportModel): Promise<{ artifacts: ArtifactRef[]; hashes: Record<string, string> }> {
  const artifacts: ArtifactRef[] = [];
  const hashes: Record<string, string> = {};
  const rtl = report.doc_ir.page_setup.rtl;

  for (const section of report.doc_ir.sections) {
    let y = 90;
    const blocksSvg = section.blocks.map((block) => {
      let svg = '';
      if (block.kind === 'heading') {
        svg = `<text x="${rtl ? 1110 : 90}" y="${y}" font-size="32" font-weight="700" text-anchor="${rtl ? 'end' : 'start'}" fill="#0f172a">${xmlEscape(String(block.content.text ?? section.title))}</text>`;
        y += 52;
      } else if (block.kind === 'paragraph' || block.kind === 'callout' || block.kind === 'quote' || block.kind === 'signature') {
        const lines = (String(block.content.text ?? '').match(/.{1,90}(\s|$)/g) ?? ['']).map(line => line.trim());
        svg = lines.map((line, index) => `<text x="${rtl ? 1110 : 90}" y="${y + index * 26}" font-size="18" text-anchor="${rtl ? 'end' : 'start'}" fill="#334155">${xmlEscape(line)}</text>`).join('');
        y += Math.max(26, lines.length * 26) + 12;
      } else if (block.kind === 'bullets') {
        const items = ((block.content.items as string[]) ?? []).slice(0, 6);
        svg = items.map((item, index) => `
          <text x="${rtl ? 1090 : 120}" y="${y + index * 26}" font-size="18" text-anchor="${rtl ? 'end' : 'start'}" fill="#334155">${xmlEscape(item)}</text>
          <circle cx="${rtl ? 1110 : 102}" cy="${y + index * 26 - 4}" r="4" fill="#2563eb" />
        `).join('');
        y += Math.max(26, items.length * 26) + 12;
      } else if (block.kind === 'kpi_cards') {
        const items = ((block.content.items as Array<Record<string, unknown>>) ?? []).slice(0, 4);
        svg = items.map((item, index) => {
          const x = 90 + (index % 2) * 300;
          const cardY = y + Math.floor(index / 2) * 118;
          return `
            <rect x="${x}" y="${cardY}" width="260" height="92" rx="18" fill="#f8fbff" stroke="#cbd5e1" />
            <text x="${x + 20}" y="${cardY + 28}" font-size="14" fill="#64748b">${xmlEscape(String(item.label ?? ''))}</text>
            <text x="${x + 20}" y="${cardY + 64}" font-size="30" font-weight="700" fill="#0f172a">${xmlEscape(String(item.value ?? ''))}</text>
          `;
        }).join('');
        y += Math.ceil(items.length / 2) * 118 + 16;
      } else if (block.kind === 'table' || block.kind === 'appendix_table') {
        const headers = ((block.content.headers as string[]) ?? []).slice(0, 5);
        const rows = ((block.content.rows as string[][]) ?? []).slice(0, 6);
        const tableWidth = 1020;
        const cellWidth = Math.floor(tableWidth / Math.max(headers.length, 1));
        const x = 90;
        let inner = `<text x="${rtl ? 1110 : x}" y="${y}" font-size="20" font-weight="700" text-anchor="${rtl ? 'end' : 'start'}" fill="#0f172a">${xmlEscape(String(block.content.title ?? ''))}</text>`;
        y += 24;
        headers.forEach((header, index) => {
          const cellX = x + index * cellWidth;
          inner += `<rect x="${cellX}" y="${y}" width="${cellWidth}" height="34" fill="#eff6ff" stroke="#cbd5e1" />`;
          inner += `<text x="${cellX + cellWidth / 2}" y="${y + 22}" font-size="13" text-anchor="middle" fill="#0f172a">${xmlEscape(header)}</text>`;
        });
        rows.forEach((row, rowIndex) => {
          row.slice(0, headers.length).forEach((cell, columnIndex) => {
            const cellX = x + columnIndex * cellWidth;
            const cellY = y + 34 + rowIndex * 28;
            inner += `<rect x="${cellX}" y="${cellY}" width="${cellWidth}" height="28" fill="#ffffff" stroke="#cbd5e1" />`;
            inner += `<text x="${cellX + 8}" y="${cellY + 18}" font-size="12" fill="#334155">${xmlEscape(cell)}</text>`;
          });
        });
        svg = inner;
        y += 34 + rows.length * 28 + 18;
      } else if (block.kind === 'chart') {
        const chartSvg = buildChartSvg(
          String(block.content.title ?? 'Chart'),
          ((block.content.points as Array<Record<string, unknown>>) ?? []).map(point => ({
            label: String(point.label ?? ''),
            value: Number(point.value ?? 0),
          })),
          rtl,
        );
        svg = `<g transform="translate(90, ${y}) scale(0.92)">${chartSvg.replace('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="360">', '').replace('</svg>', '')}</g>`;
        y += 340;
      }
      return svg;
    }).join('');

    const pageSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600">
        <rect width="100%" height="100%" fill="#eef2f7" />
        <rect x="36" y="36" width="1128" height="1528" rx="26" fill="#ffffff" />
        <text x="${rtl ? 1110 : 90}" y="70" font-size="18" font-weight="600" text-anchor="${rtl ? 'end' : 'start'}" fill="#64748b">${xmlEscape(String(report.intent.topic ?? 'Report'))}</text>
        ${blocksSvg}
      </svg>
    `;

    const buffer = await sharp(Buffer.from(pageSvg)).png().toBuffer();
    const artifactId = createId('artifact');
    const artifactPath = join(runtimeDir, `${artifactId}.png`);
    writeFileSync(artifactPath, buffer);
    const artifact: ArtifactRef = { artifact_id: artifactId, kind: 'png', uri: artifactPath };
    artifacts.push(artifact);
    hashes[section.section_id] = hashBuffer(buffer);
    artifactStore.set(artifactId, { artifact, doc_id: report.doc_id, preview_hashes: { [section.section_id]: hashes[section.section_id] } });
  }

  report.preview_renders = artifacts;
  report.preview_hashes = hashes;
  return { artifacts, hashes };
}

async function chartImageBuffer(block: ReportBlock, rtl: boolean): Promise<Buffer> {
  const svg = buildChartSvg(
    String(block.content.title ?? 'Chart'),
    ((block.content.points as Array<Record<string, unknown>>) ?? []).map(point => ({
      label: String(point.label ?? ''),
      value: Number(point.value ?? 0),
    })),
    rtl,
  );
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function buildDocxBuffer(report: ReportModel): Promise<Buffer> {
  const rtl = report.doc_ir.page_setup.rtl;
  const sections: ISectionOptions[] = [];

  for (const section of report.doc_ir.sections) {
    const children: Array<Paragraph | Table> = [];
    if (section.kind === 'toc') {
      children.push(new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        bidirectional: rtl,
      }));
      children.push(new TableOfContents(rtl ? 'جدول المحتويات' : 'Table of Contents', {
        hyperlink: true,
        headingStyleRange: '1-3',
      }));
    } else {
      for (const block of section.blocks) {
        if (block.kind === 'heading') {
          children.push(new Paragraph({
            text: String(block.content.text ?? section.title),
            heading: HeadingLevel.HEADING_1,
            alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            bidirectional: rtl,
            spacing: { after: 200 },
          }));
          continue;
        }

        if (block.kind === 'paragraph' || block.kind === 'callout' || block.kind === 'quote' || block.kind === 'signature') {
          children.push(new Paragraph({
            children: [new TextRun(String(block.content.text ?? ''))],
            alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            bidirectional: rtl,
            spacing: { after: 160 },
          }));
          continue;
        }

        if (block.kind === 'bullets') {
          const items = ((block.content.items as string[]) ?? []);
          items.forEach((item) => {
            children.push(new Paragraph({
              children: [new TextRun(item)],
              bullet: { level: 0 },
              alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              bidirectional: rtl,
            }));
          });
          continue;
        }

        if (block.kind === 'kpi_cards') {
          const rows = ((block.content.items as Array<Record<string, unknown>>) ?? []).map(item => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(String(item.label ?? ''))] }),
              new TableCell({ children: [new Paragraph(String(item.value ?? ''))] }),
            ],
          }));
          children.push(new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(rtl ? 'المؤشر' : 'Metric')] }),
                  new TableCell({ children: [new Paragraph(rtl ? 'القيمة' : 'Value')] }),
                ],
              }),
              ...rows,
            ],
            width: { size: 100, type: WidthType.PERCENTAGE },
            visuallyRightToLeft: rtl,
          }));
          continue;
        }

        if (block.kind === 'table' || block.kind === 'appendix_table') {
          const headers = ((block.content.headers as string[]) ?? []);
          const rows = ((block.content.rows as string[][]) ?? []);
          const tableRows = [
            new TableRow({
              children: headers.map(header => new TableCell({
                children: [new Paragraph({ text: header, bidirectional: rtl })],
              })),
            }),
            ...rows.map(row => new TableRow({
              children: row.map(cell => new TableCell({
                children: [new Paragraph({ text: cell, bidirectional: rtl })],
              })),
            })),
          ];
          children.push(new Paragraph({
            text: String(block.content.title ?? ''),
            alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            bidirectional: rtl,
            spacing: { after: 80 },
          }));
          children.push(new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            visuallyRightToLeft: rtl,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
              left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
              right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
            },
          }));
          continue;
        }

        if (block.kind === 'chart') {
          const imageBuffer = await chartImageBuffer(block, rtl);
          children.push(new Paragraph({
            text: String(block.content.title ?? ''),
            alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            bidirectional: rtl,
          }));
          children.push(new Paragraph({
            children: [
              new ImageRun({
                data: imageBuffer,
                transformation: { width: 520, height: 220 },
              }),
            ],
            alignment: AlignmentType.CENTER,
          }));
          continue;
        }
      }
    }

    sections.push({
      properties: {
        page: {
          margin: report.doc_ir.page_setup.margins,
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [new TextRun(String(report.intent.topic ?? 'Report'))],
              alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              bidirectional: rtl,
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun(String(report.doc_ir.global_fields.classification ?? '')),
              ],
              alignment: AlignmentType.CENTER,
              bidirectional: rtl,
            }),
          ],
        }),
      },
      children,
    });
  }

  const document = new Document({ sections });
  return Buffer.from(await Packer.toBuffer(document));
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) return '';
  const reconstructed = documentXml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, text: string) => xmlDecode(text))
    .replace(/<[^>]+>/g, '');
  return normalizeText(reconstructed).replace(/\n+$/g, '');
}

async function createArtifact(
  report: ReportModel,
  kind: ArtifactKind,
  extension: string,
  buffer: Buffer | string,
  metadata?: Record<string, unknown>,
): Promise<ArtifactRef> {
  const artifactId = createId('artifact');
  const artifactPath = join(runtimeDir, `${artifactId}.${extension}`);
  writeFileSync(artifactPath, buffer);
  const preview = report.preview_renders.length > 0 ? { ...report.preview_hashes } : (await renderPreview(report)).hashes;
  const manifestId = createId('manifest');
  const manifestPath = join(runtimeDir, `${manifestId}.json`);
  writeFileSync(manifestPath, JSON.stringify({
    doc_id: report.doc_id,
    kind,
    preview_hashes: preview,
    metadata: metadata ?? {},
  }, null, 2), 'utf8');
  const artifact: ArtifactRef = { artifact_id: artifactId, kind, uri: artifactPath };
  artifactStore.set(artifactId, {
    artifact,
    doc_id: report.doc_id,
    preview_hashes: preview,
    render_manifest_uri: manifestPath,
    metadata,
  });
  report.artifact_ids.push(artifactId);
  return artifact;
}

async function writePdfArtifact(report: ReportModel): Promise<ArtifactRef> {
  const preview = await renderPreview(report);
  const pdf = new PDFDocument({ autoFirstPage: false, margin: 0 });
  const chunks: Buffer[] = [];
  pdf.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  for (const render of preview.artifacts) {
    const image = readFileSync(render.uri);
    const meta = await sharp(image).metadata();
    pdf.addPage({ size: [meta.width ?? 1200, meta.height ?? 1600], margin: 0 });
    pdf.image(image, 0, 0, { width: meta.width ?? 1200, height: meta.height ?? 1600 });
  }
  pdf.end();
  const buffer = await completed;
  return createArtifact(report, 'pdf', 'pdf', buffer, { preview_count: preview.artifacts.length });
}

async function writeHtmlArtifact(report: ReportModel): Promise<ArtifactRef> {
  const html = buildHtmlForReport(report);
  return createArtifact(report, 'html', 'html', html, { sections: report.doc_ir.sections.length });
}

async function writeDocxArtifact(report: ReportModel): Promise<ArtifactRef> {
  const buffer = await buildDocxBuffer(report);
  const extractedText = await extractTextFromDocx(buffer);
  return createArtifact(report, 'docx', 'docx', buffer, {
    extracted_text_hash: hashValue(extractedText),
    font_requirements: report.doc_ir.page_setup.rtl ? ['Segoe UI', 'Arial'] : ['Segoe UI'],
  });
}

async function writePptxArtifact(report: ReportModel): Promise<ArtifactRef> {
  const preview = report.preview_renders.length > 0 ? report.preview_renders : (await renderPreview(report)).artifacts;
  const zip = new JSZip();
  const slides = report.doc_ir.sections.slice(0, 6);
  const slideOverrides = slides.map((_section, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
  const slideRels = slides.map((_section, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join('');
  const sldIds = slides.map((_section, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join('');

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.folder('docProps')?.file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(String(report.intent.topic ?? 'Report'))}</dc:title>
  <dc:creator>RASID</dc:creator>
  <cp:lastModifiedBy>RASID</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`);
  zip.folder('docProps')?.file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>RASID</Application>
  <Slides>${slides.length}</Slides>
</Properties>`);

  zip.folder('ppt')?.file('presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${sldIds}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);
  zip.folder('ppt')?.folder('_rels')?.file('presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRels}
</Relationships>`);
  zip.folder('ppt')?.folder('slideMasters')?.file('slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld name="Master"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`);
  zip.folder('ppt')?.folder('slideMasters')?.folder('_rels')?.file('slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`);
  zip.folder('ppt')?.folder('slideLayouts')?.file('slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Layout"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`);
  zip.folder('ppt')?.folder('slideLayouts')?.folder('_rels')?.file('slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);
  zip.folder('ppt')?.folder('theme')?.file('theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="RASID Theme">
  <a:themeElements>
    <a:clrScheme name="RASID">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="0F172A"/></a:dk2>
      <a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="2563EB"/></a:accent1>
      <a:accent2><a:srgbClr val="0F766E"/></a:accent2>
      <a:accent3><a:srgbClr val="7C3AED"/></a:accent3>
      <a:accent4><a:srgbClr val="EA580C"/></a:accent4>
      <a:accent5><a:srgbClr val="BE123C"/></a:accent5>
      <a:accent6><a:srgbClr val="475569"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink>
      <a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="RASID">
      <a:majorFont><a:latin typeface="Segoe UI"/><a:ea typeface="Segoe UI"/><a:cs typeface="Segoe UI"/></a:majorFont>
      <a:minorFont><a:latin typeface="Segoe UI"/><a:ea typeface="Segoe UI"/><a:cs typeface="Segoe UI"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="RASID"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme>
  </a:themeElements>
</a:theme>`);

  const slidesFolder = zip.folder('ppt')?.folder('slides');
  const slideRelsFolder = slidesFolder?.folder('_rels');
  slides.forEach((section, index) => {
    const title = xmlEscape(section.title);
    const bodyText = xmlEscape(section.blocks
      .filter(block => block.kind === 'paragraph' || block.kind === 'bullets')
      .map(block => block.kind === 'bullets'
        ? ((block.content.items as string[]) ?? []).join(' | ')
        : String(block.content.text ?? ''))
      .join(' ').slice(0, 480));
    slidesFolder?.file(`slide${index + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="274320"/><a:ext cx="10972800" cy="685800"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr rtlCol="${report.doc_ir.page_setup.rtl ? 1 : 0}"/><a:lstStyle/><a:p><a:r><a:rPr lang="ar-SA" sz="2800" b="1"/><a:t>${title}</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="1143000"/><a:ext cx="10972800" cy="4572000"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr rtlCol="${report.doc_ir.page_setup.rtl ? 1 : 0}"/><a:lstStyle/><a:p><a:r><a:rPr lang="ar-SA" sz="1800"/><a:t>${bodyText}</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`);
    slideRelsFolder?.file(`slide${index + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`);
  });

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return createArtifact(report, 'pptx', 'pptx', buffer, {
    slide_count: slides.length,
    preview_count: preview.length,
  });
}

async function writeSimpleXlsx(
  sheets: Array<{ name: string; rows: Array<Array<string | number>>; hidden?: boolean }>,
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n  ')}
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.folder('docProps')?.file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>RASID Report Export</dc:title>
  <dc:creator>RASID</dc:creator>
  <cp:lastModifiedBy>RASID</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`);
  zip.folder('docProps')?.file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>RASID</Application>
</Properties>`);
  zip.folder('xl')?.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`);
  zip.folder('xl')?.file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"${sheet.hidden ? ' state="hidden"' : ''}/>`).join('\n    ')}
  </sheets>
</workbook>`);
  zip.folder('xl')?.folder('_rels')?.file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('\n  ')}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  const worksheets = zip.folder('xl')?.folder('worksheets');
  sheets.forEach((sheet, sheetIndex) => {
    const rowsXml = sheet.rows.map((row, rowIndex) => {
      const cellsXml = row.map((cell, cellIndex) => {
        const cellRef = `${columnLetter(cellIndex)}${rowIndex + 1}`;
        if (typeof cell === 'number') {
          return `<c r="${cellRef}"><v>${cell}</v></c>`;
        }
        return `<c r="${cellRef}" t="inlineStr"><is><t>${xmlEscape(String(cell))}</t></is></c>`;
      }).join('');
      return `<row r="${rowIndex + 1}">${cellsXml}</row>`;
    }).join('');
    worksheets?.file(`sheet${sheetIndex + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowsXml}</sheetData>
</worksheet>`);
  });

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function writeXlsxArtifact(report: ReportModel): Promise<ArtifactRef> {
  const dataset = datasetStore.get(report.dataset_ids[0] ?? '');
  const sheets: Array<{ name: string; rows: Array<Array<string | number>>; hidden?: boolean }> = dataset?.tables.map(table => ({
    name: table.name,
    rows: [
      table.columns,
      ...table.rows.slice(0, 200).map(row => table.columns.map(column => {
        const value = row[column];
        return typeof value === 'number' ? value : valueToText(value);
      })),
    ] as Array<Array<string | number>>,
  })) ?? [];
  sheets.push({
    name: 'Lineage',
    hidden: true,
    rows: [
      ['doc_id', report.doc_id],
      ['dataset_ids', report.dataset_ids.join(',')],
      ['binding_hash', report.doc_ir.fingerprints.binding_hash],
      ['classification', String(report.governance?.classification ?? report.intent.classification ?? '')],
    ],
  });
  const buffer = await writeSimpleXlsx(sheets);
  return createArtifact(report, 'xlsx', 'xlsx', buffer, { sheet_count: sheets.length });
}

async function validateReport(report: ReportModel): Promise<{ pass: boolean; issues: Array<Record<string, unknown>>; report: Record<string, unknown> }> {
  const issues: Array<Record<string, unknown>> = [];
  const textBlocks = report.doc_ir.sections.flatMap(section => section.blocks.map(block => blockPlainText(block))).filter(Boolean);
  const hasArabic = textBlocks.some(text => detectArabic(text));
  const hasDataBinding = report.doc_ir.data_bindings.length > 0 || report.doc_ir.sections.every(section => section.blocks.every(block => !['table', 'chart', 'kpi_cards', 'appendix_table'].includes(block.kind)));

  if (report.doc_ir.sections.length === 0) {
    issues.push({ code: 'no_sections', message: 'Document must contain at least one section.' });
  }

  for (const section of report.doc_ir.sections) {
    if (section.blocks.length === 0) {
      issues.push({ code: 'empty_section', message: 'Section has no blocks.', section_id: section.section_id });
    }
    const hasHeading = section.blocks.some(block => block.kind === 'heading');
    if (section.kind !== 'toc' && !hasHeading) {
      issues.push({ code: 'missing_heading', message: 'Section requires a heading block.', section_id: section.section_id });
    }
    for (const block of section.blocks) {
      if ((block.kind === 'paragraph' || block.kind === 'heading') && !String(block.content.text ?? '').trim()) {
        issues.push({ code: 'empty_text', message: 'Text block is empty.', section_id: section.section_id, block_id: block.block_id });
      }
      if ((block.kind === 'table' || block.kind === 'appendix_table') && (((block.content.headers as string[]) ?? []).length === 0)) {
        issues.push({ code: 'table_without_headers', message: 'Table block has no headers.', section_id: section.section_id, block_id: block.block_id });
      }
      if (block.kind === 'chart' && (((block.content.points as Array<Record<string, unknown>>) ?? []).length === 0)) {
        issues.push({ code: 'chart_without_points', message: 'Chart block has no data points.', section_id: section.section_id, block_id: block.block_id });
      }
    }
  }

  if (hasArabic && report.doc_ir.arabic_mode !== 'ELITE') {
    issues.push({ code: 'arabic_mode_not_elite', message: 'Arabic content requires ELITE mode.' });
  }

  if (!hasDataBinding) {
    issues.push({ code: 'missing_binding', message: 'Data-bound blocks require valid dataset bindings.' });
  }

  if (report.literal_hash_report && report.literal_hash_report.literal_hash_in !== report.literal_hash_report.literal_hash_out) {
    issues.push({ code: 'literal_mismatch', message: 'Literal hash mismatch detected.' });
  }

  report.template_compliance = computeTemplateCompliance(report);
  if (report.template_compliance.pass === false) {
    issues.push({ code: 'template_non_compliant', message: 'Template compliance failed.', details: report.template_compliance });
  }

  return {
    pass: issues.length === 0,
    issues,
    report: {
      layout: { pass: !issues.some(issue => ['no_sections', 'empty_section', 'missing_heading', 'table_without_headers'].includes(String(issue.code))) },
      arabic: { pass: !issues.some(issue => String(issue.code) === 'arabic_mode_not_elite') },
      data: { pass: !issues.some(issue => ['missing_binding', 'chart_without_points'].includes(String(issue.code))) },
      writing: { pass: !issues.some(issue => ['empty_text', 'literal_mismatch', 'template_non_compliant'].includes(String(issue.code))) },
    },
  };
}

function autofixReport(report: ReportModel, issues: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const fixLog: Array<Record<string, unknown>> = [];

  for (const issue of issues) {
    const code = String(issue.code ?? '');
    if (code === 'empty_section') {
      const section = report.doc_ir.sections.find(entry => entry.section_id === issue.section_id);
      if (section) {
        section.blocks.push({
          block_id: createId('block'),
          kind: 'heading',
          style_ref: 'Heading1',
          content: { text: section.title },
          rtl_policy: report.doc_ir.page_setup.rtl ? 'force_rtl' : 'auto',
        });
        section.blocks.push({
          block_id: createId('block'),
          kind: 'paragraph',
          style_ref: 'BodyText',
          content: { text: report.doc_ir.page_setup.rtl ? 'تمت إضافة محتوى افتراضي لاستكمال القسم.' : 'Default content was added to complete the section.' },
          rtl_policy: report.doc_ir.page_setup.rtl ? 'force_rtl' : 'auto',
        });
        fixLog.push({ code, section_id: section.section_id, action: 'insert_default_blocks' });
      }
    }

    if (code === 'missing_heading') {
      const section = report.doc_ir.sections.find(entry => entry.section_id === issue.section_id);
      if (section) {
        section.blocks.unshift({
          block_id: createId('block'),
          kind: 'heading',
          style_ref: 'Heading1',
          content: { text: section.title },
          rtl_policy: report.doc_ir.page_setup.rtl ? 'force_rtl' : 'auto',
        });
        fixLog.push({ code, section_id: section.section_id, action: 'prepend_heading' });
      }
    }

    if (code === 'empty_text') {
      for (const section of report.doc_ir.sections) {
        const block = section.blocks.find(entry => entry.block_id === issue.block_id);
        if (block && (block.kind === 'paragraph' || block.kind === 'heading')) {
          block.content.text = block.kind === 'heading'
            ? section.title
            : report.doc_ir.page_setup.rtl ? 'تمت إضافة نص افتراضي.' : 'Default narrative added.';
          fixLog.push({ code, block_id: block.block_id, action: 'fill_text' });
          break;
        }
      }
    }

    if (code === 'table_without_headers') {
      for (const section of report.doc_ir.sections) {
        const block = section.blocks.find(entry => entry.block_id === issue.block_id);
        if (block && (block.kind === 'table' || block.kind === 'appendix_table')) {
          block.content.headers = [report.doc_ir.page_setup.rtl ? 'حقل' : 'Field', report.doc_ir.page_setup.rtl ? 'قيمة' : 'Value'];
          block.content.rows = [[report.doc_ir.page_setup.rtl ? 'بيانات' : 'Data', report.doc_ir.page_setup.rtl ? 'مطلوبة' : 'Required']];
          fixLog.push({ code, block_id: block.block_id, action: 'seed_table' });
          break;
        }
      }
    }

    if (code === 'chart_without_points') {
      for (const section of report.doc_ir.sections) {
        const block = section.blocks.find(entry => entry.block_id === issue.block_id);
        if (block && block.kind === 'chart') {
          block.content.points = [
            { label: report.doc_ir.page_setup.rtl ? 'الفترة 1' : 'Period 1', value: 1 },
            { label: report.doc_ir.page_setup.rtl ? 'الفترة 2' : 'Period 2', value: 2 },
          ];
          fixLog.push({ code, block_id: block.block_id, action: 'seed_chart' });
          break;
        }
      }
    }
  }

  report.doc_ir.fingerprints = computeDocFingerprints(report.doc_ir);
  return fixLog;
}

export async function executeReportTool(request: ReportToolRequest): Promise<ReportToolResponse> {
  validateReportToolContract(request.tool_id, 'request', request);
  const warnings: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error' }> = [];

  switch (request.tool_id) {
    case 'report.intent_parse': {
      const inputs = request.inputs as { prompt: string; assets?: ReportAssetRef[]; datasets?: DatasetRef[] };
      const params = request.params as {
        fidelity_mode: FidelityMode;
        template_id?: string;
        classification?: Classification;
        detail_level?: DetailLevel;
        tone?: Tone;
      };
      const datasetRefs: DatasetRef[] = [];
      for (const asset of inputs.assets ?? []) {
        const dataset = await ingestAsset(asset);
        if (dataset) {
          datasetStore.set(dataset.dataset_id, dataset);
          datasetRefs.push({ dataset_id: dataset.dataset_id });
        } else if (asset.mime.startsWith('image/') || asset.mime.includes('pdf')) {
          warnings.push({
            code: 'strict_import_pending',
            message: 'PDF/Image strict import is registered in intent metadata and requires strict replication runtime to complete.',
            severity: 'warning',
          });
        }
      }
      for (const dataset of inputs.datasets ?? []) {
        datasetRefs.push(dataset);
      }

      const language = detectLanguage(inputs.prompt);
      const intent = {
        topic: inputs.prompt.split('\n')[0].slice(0, 140),
        prompt: inputs.prompt,
        report_type: detectReportType(inputs.prompt),
        language,
        tone: determineTone(inputs.prompt, params.tone),
        detail_level: determineDetailLevel(inputs.prompt, params.detail_level),
        fidelity_mode: params.fidelity_mode,
        classification: determineClassification(params.classification),
        template_id: params.template_id ?? null,
        locale: request.context.locale,
        arabic_mode: request.context.arabic_mode,
        citation_mode: /citation|reference|مرجع|استشهاد/.test(inputs.prompt.toLowerCase()) ? 'on' : 'off',
        dataset_refs: datasetRefs,
        recipient_title: /معالي/.test(inputs.prompt) ? 'معالي' : /سعادة/.test(inputs.prompt) ? 'سعادة' : null,
        strict_insert_requests: (inputs.assets ?? [])
          .filter(asset => asset.mime.startsWith('image/') || asset.mime.includes('pdf'))
          .map(asset => ({ asset_id: asset.asset_id, strict_mode: 'STRICT_1TO1_100' })),
      };
      const result = response(request, { intent }, warnings);
      validateReportToolContract(request.tool_id, 'response', result);
      recordAction(request.tool_id, request, result.refs);
      return result;
    }

    case 'report.template_extract': {
      const asset = (request.inputs as { template_docx: ReportAssetRef }).template_docx;
      const buffer = readFileSync(asset.uri);
      const zip = await JSZip.loadAsync(buffer);
      const stylesXml = await zip.file('word/styles.xml')?.async('string') ?? '';
      const numberingXml = await zip.file('word/numbering.xml')?.async('string') ?? '';
      const documentXml = await zip.file('word/document.xml')?.async('string') ?? '';
      const templateId = createId('template');
      const styles = Array.from(stylesXml.matchAll(/<w:style[^>]*w:styleId="([^"]+)"/g), match => match[1]);
      const fonts = Array.from(stylesXml.matchAll(/<w:rFonts[^>]*w:ascii="([^"]+)"/g), match => match[1]);
      const baseStyles = ['Title', 'Heading1', 'BodyText', 'TableGrid', 'KpiCard', 'Callout', 'Chart'];

      const template: TemplateModel = {
        template_id: templateId,
        style_tokens: {
          styles: Object.fromEntries(Array.from(new Set([...baseStyles, ...styles])).map(style => [style, true])),
          fonts: fonts.length > 0 ? Array.from(new Set(fonts)) : ['Segoe UI'],
        },
        writing_rules: {
          tone_lexicon: detectArabic(documentXml) ? 'arabic_formal' : 'english_formal',
          preferred_terminology: detectArabic(documentXml) ? ['التقرير', 'النتائج', 'التوصيات'] : ['report', 'findings', 'recommendations'],
          forbidden_phrases: [],
        },
        numbering_rules: {
          abstract_num_count: Array.from(numberingXml.matchAll(/<w:abstractNum\b/g)).length,
          list_count: Array.from(numberingXml.matchAll(/<w:num\b/g)).length,
          default_scheme: Array.from(numberingXml.matchAll(/<w:lvlText[^>]*w:val="([^"]+)"/g), match => match[1])[0] ?? '%1.',
        },
        compliance_rules: {
          headers_present: Array.from(zip.file(/word\/header\d+\.xml/)).length > 0,
          footers_present: Array.from(zip.file(/word\/footer\d+\.xml/)).length > 0,
          toc_present: /TOC/.test(documentXml),
        },
        source_asset_id: asset.asset_id,
      };

      templateStore.set(templateId, template);
      const result = response(request, {
        template_id: templateId,
        style_tokens: template.style_tokens,
        writing_rules: template.writing_rules,
        numbering_rules: template.numbering_rules,
        compliance_rules: template.compliance_rules,
      });
      validateReportToolContract(request.tool_id, 'response', result);
      recordAction(request.tool_id, request, result.refs);
      return result;
    }

    case 'report.plan_outline': {
      const intent = (request.inputs as { intent: Record<string, unknown> }).intent;
      const outline = {
        ...intent,
        sections: defaultSectionPlan(intent).map(section => ({
          title: section.title,
          kind: section.kind,
          blocks: section.blocks,
        })),
      };
      const result = response(request, { outline });
      validateReportToolContract(request.tool_id, 'response', result);
      recordAction(request.tool_id, request, result.refs);
      return result;
    }

    case 'report.build_doc_ir': {
      const inputs = request.inputs as { outline: Record<string, unknown>; template_id?: string };
      const template = inputs.template_id ? templateStore.get(inputs.template_id) ?? null : null;
      const doc_ir = createDocSkeleton(inputs.outline, inputs.outline, template);
      const report: ReportModel = {
        doc_id: doc_ir.doc_id,
        version: 1,
        intent: inputs.outline,
        outline: inputs.outline,
        doc_ir,
        dataset_ids: [],
        template_id: template?.template_id,
        preview_renders: [],
        preview_hashes: {},
        artifact_ids: [],
      };
      report.template_compliance = computeTemplateCompliance(report);
      reportStore.set(report.doc_id, report);
      const result = response(request, { doc: docRef(report), doc_ir: report.doc_ir });
      validateReportToolContract(request.tool_id, 'response', result);
      recordAction(request.tool_id, request, result.refs);
      return result;
    }

    case 'report.bind_data': {
      const inputs = request.inputs as {
        doc: DocRef;
        datasets?: DatasetRef[];
        tir_steps?: Array<Record<string, unknown>>;
        mir_measures?: Array<Record<string, unknown>>;
      };
      const report = ensureReport(inputs.doc);
      const dataset = inputs.datasets?.[0] ? datasetStore.get(inputs.datasets[0].dataset_id) : undefined;
      if (dataset) {
        const transformed: DatasetModel = {
          ...dataset,
          tables: dataset.tables.map(table => ({
            ...table,
            rows: applyTirRows(table.rows, inputs.tir_steps ?? []),
          })),
        };
        datasetStore.set(dataset.dataset_id, transformed);
        report.dataset_ids = [transformed.dataset_id, ...(inputs.datasets ?? []).slice(1).map(entry => entry.dataset_id)];
        populateBoundBlocks(report, transformed, inputs.mir_measures ?? []);
      } else {
        report.dataset_ids = (inputs.datasets ?? []).map(entry => entry.dataset_id);
      }
      nextVersion(report);
      const result = response(request, { doc: docRef(report), doc_ir: report.doc_ir });
      validateReportToolContract(request.tool_id, 'response', result);
      recordAction(request.tool_id, request, result.refs);
      return result;
    }

    case 'report.generate_content_literal': {
      const inputs = request.inputs as { doc: DocRef; user_text: string };
      const report = ensureReport(inputs.doc);
      const lines = normalizeText(inputs.user_text).split('\n');
      report.doc_ir.sections = [{
        section_id: createId('section'),
        index: 1,
        title: '',
        kind: 'body',
        blocks: lines.map(line => ({
          block_id: createId('block'),
          kind: 'paragraph',
          style_ref: 'BodyText',
          content: { text: line },
          rtl_policy: report.doc_ir.page_setup.rtl ? 'force_rtl' : 'auto',
        })),
      }];
      report.doc_ir.references = [];
      report.doc_ir.data_bindings = [];
      report.doc_ir.fingerprints = computeDocFingerprints(report.doc_ir);
      nextVersion(report);
      const buffer = await buildDocxBuffer(report);
      const extractedText = await extractTextFromDocx(buffer);
      report.literal_hash_report = {
        literal_hash_in: hashValue(normalizeText(inputs.user_text).replace(/\n+$/g, '')),
        literal_hash_out: hashValue(normalizeText(extractedText).replace(/\n+$/g, '')),
        extracted_text: extractedText,
      };
      const result = response(request, { doc: docRef(report), literal_hash_report: report.literal_hash_report });
      validateReportToolContract(request.tool_id, 'response', result);
      recordAction(request.tool_id, request, result.refs);
      return result;
    }

    case 'report.generate_content_smart': {
      const inputs = request.inputs as { doc: DocRef; prompt?: string };
      const report = ensureReport(inputs.doc);
      report.content_trace = populateSmartNarrative(report, inputs.prompt);
      nextVersion(report);
      const result = response(request, { doc: docRef(report), content_trace: report.content_trace });
      validateReportToolContract(request.tool_id, 'response', result);
      recordAction(request.tool_id, request, result.refs);
      return result;
    }

    case 'report.qa_validate': {
      const report = ensureReport((request.inputs as { doc: DocRef }).doc);
      const qa = await validateReport(report);
      report.latest_qa = qa;
      const result = response(request, { pass: qa.pass, issues: qa.issues, report: qa.report });
      validateReportToolContract(request.tool_id, 'response', result);
      recordAction(request.tool_id, request, result.refs);
      return result;
    }

    case 'report.qa_autofix': {
      const inputs = request.inputs as { doc: DocRef; issues: Array<Record<string, unknown>> };
      const report = ensureReport(inputs.doc);
      const fix_log = autofixReport(report, inputs.issues);
      nextVersion(report);
      const result = response(request, { doc: docRef(report), fix_log });
      validateReportToolContract(request.tool_id, 'response', result);
      recordAction(request.tool_id, request, result.refs);
      return result;
    }

    case 'report.export_docx':
    case 'report.export_pdf':
    case 'report.export_html':
    case 'report.export_pptx':
    case 'report.export_xlsx': {
      const report = ensureReport((request.inputs as { doc: DocRef }).doc);
      const artifact = request.tool_id === 'report.export_docx'
        ? await writeDocxArtifact(report)
        : request.tool_id === 'report.export_pdf'
          ? await writePdfArtifact(report)
          : request.tool_id === 'report.export_html'
            ? await writeHtmlArtifact(report)
            : request.tool_id === 'report.export_pptx'
              ? await writePptxArtifact(report)
              : await writeXlsxArtifact(report);
      const result = response(request, { artifact });
      validateReportToolContract(request.tool_id, 'response', result);
      recordAction(request.tool_id, request, result.refs);
      return result;
    }

    case 'report.render_parity_verify': {
      const inputs = request.inputs as { doc: DocRef; artifacts: ArtifactRef[] };
      const report = ensureReport(inputs.doc);
      const preview = report.preview_renders.length > 0 ? report.preview_hashes : (await renderPreview(report)).hashes;
      const checks = inputs.artifacts.map((artifact) => {
        const stored = artifactStore.get(artifact.artifact_id);
        const pass = hashValue(stored?.preview_hashes ?? {}) === hashValue(preview);
        return {
          artifact_id: artifact.artifact_id,
          kind: artifact.kind,
          pass,
        };
      });
      const parity = {
        pass: checks.every(check => check.pass),
        checks,
      };
      const result = response(request, { pass: parity.pass, report: parity });
      validateReportToolContract(request.tool_id, 'response', result);
      recordAction(request.tool_id, request, result.refs);
      return result;
    }

    case 'report.classify_and_govern': {
      const inputs = request.inputs as { doc: DocRef; permissions?: Record<string, unknown>; share_policy?: Record<string, unknown> };
      const params = request.params as { classification: Classification; approvals_enabled?: boolean };
      const report = ensureReport(inputs.doc);
      const governance = {
        classification: params.classification,
        approvals_enabled: params.approvals_enabled ?? false,
        state: params.approvals_enabled ? 'review' : 'draft',
        permissions: inputs.permissions ?? { view: ['workspace'], edit: [request.context.user_id] },
        share_policy: inputs.share_policy ?? { export: true, external_share: false },
        audit_entry_id: createId('audit'),
        timestamp: new Date().toISOString(),
      };
      governanceStore.set(report.doc_id, governance);
      report.governance = governance;
      nextVersion(report);
      const result = response(request, { doc: docRef(report), governance });
      validateReportToolContract(request.tool_id, 'response', result);
      recordAction(request.tool_id, request, result.refs);
      return result;
    }

    case 'report.evidence_pack': {
      const inputs = request.inputs as {
        doc: DocRef;
        artifacts?: ArtifactRef[];
        qa_report?: Record<string, unknown>;
        parity_report?: Record<string, unknown>;
        template_compliance?: Record<string, unknown>;
        literal_diff?: Record<string, unknown>;
        content_trace?: Record<string, unknown>;
      };
      const report = ensureReport(inputs.doc);
      const preview = report.preview_renders.length > 0 ? report.preview_renders : (await renderPreview(report)).artifacts;
      const evidenceId = createId('evidence');
      const evidencePath = join(runtimeDir, `${evidenceId}.json`);
      const payload = {
        evidence_id: evidenceId,
        doc_id: report.doc_id,
        artifact_ids: (inputs.artifacts ?? []).map(artifact => artifact.artifact_id),
        preview_artifact_ids: preview.map(artifact => artifact.artifact_id),
        qa_report: inputs.qa_report ?? report.latest_qa?.report ?? null,
        parity_report: inputs.parity_report ?? null,
        template_compliance: inputs.template_compliance ?? report.template_compliance ?? null,
        literal_diff: inputs.literal_diff ?? report.literal_hash_report ?? null,
        content_trace: inputs.content_trace ?? report.content_trace ?? null,
        action_graph_snapshot: actionLog.filter(entry => entry.doc_id === report.doc_id),
        lineage_ids: report.dataset_ids,
      };
      writeFileSync(evidencePath, JSON.stringify(payload, null, 2), 'utf8');
      const stored: EvidencePack = {
        evidence_id: evidenceId,
        doc_id: report.doc_id,
        artifact_ids: payload.artifact_ids,
        uri: evidencePath,
        qa_report: payload.qa_report,
        parity_report: payload.parity_report,
        template_compliance: payload.template_compliance,
        literal_diff: payload.literal_diff,
        content_trace: payload.content_trace,
        preview_artifact_ids: payload.preview_artifact_ids,
        action_count: payload.action_graph_snapshot.length,
      };
      evidenceStore.set(evidenceId, stored);
      const result = response(request, { evidence_id: evidenceId });
      validateReportToolContract(request.tool_id, 'response', result);
      recordAction(request.tool_id, request, result.refs);
      return result;
    }

    default:
      throw new Error(`Unsupported report tool: ${request.tool_id}`);
  }
}

export function listReportTools() {
  return [...REPORT_TOOL_DEFINITIONS];
}

export function getReport(docId: string): ReportModel | undefined {
  return reportStore.get(docId);
}

export function getDataset(datasetId: string): DatasetModel | undefined {
  return datasetStore.get(datasetId);
}

export function getTemplate(templateId: string): TemplateModel | undefined {
  return templateStore.get(templateId);
}

export function getArtifact(artifactId: string): StoredArtifact | undefined {
  return artifactStore.get(artifactId);
}

export function getEvidence(evidenceId: string): EvidencePack | undefined {
  return evidenceStore.get(evidenceId);
}

export function resetReportUltraEngine(): void {
  datasetStore.clear();
  templateStore.clear();
  reportStore.clear();
  artifactStore.clear();
  evidenceStore.clear();
  governanceStore.clear();
  actionLog.length = 0;
  if (existsSync(runtimeDir)) {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
  mkdirSync(runtimeDir, { recursive: true });
}

export type { ReportContractDirection };
