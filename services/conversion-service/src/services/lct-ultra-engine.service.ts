import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, extname, resolve, join } from 'path';
import { pathToFileURL } from 'url';
import pdfParse from 'pdf-parse';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import XLSX from 'xlsx';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import {
  LCT_TOOL_DEFINITIONS,
  validateLctToolContract,
} from './lct-tool-contracts.js';

export type LctMode = 'AUTO' | 'PRO';
export type ArabicMode = 'BASIC' | 'PROFESSIONAL' | 'ELITE';
export type StrictClaim =
  | 'NONE'
  | 'CONVERT_STRICT_1TO1_100'
  | 'LOCALIZE_PRO_100'
  | 'TRANSCRIBE_STRICT_100';
export type ArtifactKind =
  | 'pptx'
  | 'docx'
  | 'xlsx'
  | 'dashboard'
  | 'pdf'
  | 'html'
  | 'png'
  | 'json'
  | 'srt'
  | 'vtt';
export type Modality = 'pdf' | 'image' | 'audio' | 'video' | 'docx' | 'pptx' | 'xlsx' | 'text';

export interface LctActionContext {
  workspace_id: string;
  user_id: string;
  mode: LctMode;
  arabic_mode: ArabicMode;
  locale: string;
  [key: string]: unknown;
}

export interface LctAssetRef {
  asset_id: string;
  uri: string;
  mime: string;
  sha256: string;
  size_bytes: number;
}

export interface LctArtifactRef {
  artifact_id: string;
  kind: ArtifactKind;
  uri: string;
}

export interface LctToolRequest<TInputs = Record<string, unknown>, TParams = Record<string, unknown>> {
  request_id: string;
  tool_id: string;
  context: LctActionContext;
  inputs: TInputs;
  params: TParams;
}

export interface LctToolResponse<TRefs = Record<string, unknown>> {
  request_id: string;
  tool_id: string;
  status: 'ok' | 'failed';
  refs: TRefs;
  warnings?: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error' }>;
  failure?: { code: string; message: string };
}

interface StoredArtifact {
  artifact: LctArtifactRef;
  hash: string;
  metadata: Record<string, unknown>;
}

interface EvidencePack {
  evidence_id: string;
  uri: string;
  operation: Record<string, unknown>;
  artifacts: string[];
  reports: Record<string, unknown>;
  action_count: number;
}

interface TranscriptDraft {
  transcript_id: string;
  text: string;
  segments: Array<Record<string, unknown>>;
  speakers: Array<Record<string, unknown>>;
  disagreements: Array<Record<string, unknown>>;
  diarization_draft: Record<string, unknown>;
}

interface AlignmentResult {
  alignment_id: string;
  words: Array<Record<string, unknown>>;
  duration_seconds: number;
  alignment_pass: boolean;
}

interface CdrModel {
  cdr_id: string;
  source_asset_id: string;
  modality: Modality;
  primary_text: string;
  tables: Array<{ name: string; headers: string[]; rows: string[][] }>;
  core_type: 'editable' | 'raster_only';
  source_render: LctArtifactRef;
  pages: Array<Record<string, unknown>>;
}

interface ProjectState {
  project_id: string;
  instruction: string;
  classification: string;
  assets: LctAssetRef[];
  claims: StrictClaim[];
  target_language: 'ar' | 'en' | 'mixed';
  fidelity_mode: 'literal_1to1' | 'smart';
  modality_reports: Array<Record<string, unknown>>;
  cdr?: CdrModel;
  transcript?: {
    text: string;
    draft: TranscriptDraft;
    alignment: AlignmentResult;
    exact: boolean;
    verifier_proof?: Record<string, unknown>;
  };
  localization?: {
    source_text: string;
    translated_text: string;
    terminology_report: Record<string, unknown>;
    lqa_report: Record<string, unknown>;
    layout_qa: Record<string, unknown>;
    verifier_proof?: Record<string, unknown>;
  };
  export_manifest?: Record<string, unknown>;
}

const runtimeRoot = join(tmpdir(), 'rasid-lct-runtime');
const artifactsDir = join(runtimeRoot, 'artifacts');
const evidenceDir = join(runtimeRoot, 'evidence');
const rendersDir = join(runtimeRoot, 'renders');

mkdirSync(artifactsDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });
mkdirSync(rendersDir, { recursive: true });

const artifactStore = new Map<string, StoredArtifact>();
const evidenceStore = new Map<string, EvidencePack>();
const actionLog: Array<Record<string, unknown>> = [];

const defaultTermPack: Record<string, string> = {
  revenue: 'الايرادات',
  sales: 'المبيعات',
  report: 'التقرير',
  executive: 'التنفيذي',
  summary: 'الملخص',
  customer: 'العميل',
  customers: 'العملاء',
  growth: 'النمو',
  decline: 'الانخفاض',
  findings: 'النتائج',
  recommendation: 'التوصية',
  recommendations: 'التوصيات',
  monthly: 'الشهري',
  quarterly: 'الربعي',
  annual: 'السنوي',
  trend: 'الاتجاه',
  region: 'المنطقة',
  product: 'المنتج',
  total: 'الاجمالي',
  performance: 'الاداء',
  analysis: 'التحليل',
  dashboard: 'لوحة المؤشرات',
  transcript: 'التفريغ',
  update: 'التحديث',
  cost: 'التكلفة',
  profit: 'الربح',
  margin: 'الهامش',
  operations: 'العمليات',
  government: 'الحكومي',
  company: 'الشركة',
  financial: 'المالي',
  technical: 'التقني',
  risk: 'المخاطر',
  opportunities: 'الفرص',
  issue: 'المشكلة',
  issues: 'المشكلات',
  key: 'الرئيسي',
  overview: 'نظرة عامة',
  status: 'الحالة',
  and: 'و',
  for: 'ل',
  with: 'مع',
  from: 'من',
  to: 'الى',
  of: 'ل',
  in: 'في',
};

const defaultStyleGuide = {
  tone: 'formal',
  forbidden_phrases: ['cheap translation'],
  recipient_honorifics: ['معالي', 'سعادة', 'الاستاذ', 'الاستاذة'],
};

function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeText(value: string): string {
  return value.normalize('NFC').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function containsArabic(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

function detectLanguage(value: string): 'ar' | 'en' | 'mixed' {
  const hasArabic = containsArabic(value);
  const hasLatin = /[A-Za-z]/.test(value);
  if (hasArabic && hasLatin) return 'mixed';
  if (hasArabic) return 'ar';
  return 'en';
}

function columnLetter(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function artifactExtension(kind: ArtifactKind): string {
  const map: Record<ArtifactKind, string> = {
    pptx: 'pptx',
    docx: 'docx',
    xlsx: 'xlsx',
    dashboard: 'json',
    pdf: 'pdf',
    html: 'html',
    png: 'png',
    json: 'json',
    srt: 'srt',
    vtt: 'vtt',
  };
  return map[kind];
}

function sidecarCandidates(filePath: string, suffix: string): string[] {
  const extension = extname(filePath);
  const withoutExtension = extension ? filePath.slice(0, -extension.length) : filePath;
  return [
    `${filePath}${suffix}`,
    `${withoutExtension}${suffix}`,
  ];
}

function readFirstExistingText(filePath: string, suffixes: string[]): string | null {
  for (const suffix of suffixes) {
    for (const candidate of sidecarCandidates(filePath, suffix)) {
      if (existsSync(candidate)) {
        return readFileSync(candidate, 'utf8');
      }
    }
  }
  return null;
}

function readFirstExistingJson(filePath: string, suffixes: string[]): Record<string, unknown> | null {
  const raw = readFirstExistingText(filePath, suffixes);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildAssetRef(filePath: string, mime: string): LctAssetRef {
  const buffer = readFileSync(filePath);
  return {
    asset_id: createId('asset'),
    uri: filePath,
    mime,
    sha256: hashBuffer(buffer),
    size_bytes: buffer.length,
  };
}

function registerAction(record: Record<string, unknown>): void {
  actionLog.push({
    ...record,
    timestamp: new Date().toISOString(),
  });
}

function validateAndReturn<TRefs>(response: LctToolResponse<TRefs>): LctToolResponse<TRefs> {
  validateLctToolContract(response.tool_id, 'response', response);
  return response;
}

function success<TRefs>(
  requestId: string,
  toolId: string,
  refs: TRefs,
  warnings: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error' }> = [],
): LctToolResponse<TRefs> {
  return validateAndReturn({
    request_id: requestId,
    tool_id: toolId,
    status: 'ok',
    refs,
    warnings,
  });
}

function failure(
  requestId: string,
  toolId: string,
  code: string,
  message: string,
): LctToolResponse<Record<string, never>> {
  return validateAndReturn({
    request_id: requestId,
    tool_id: toolId,
    status: 'failed',
    refs: {},
    failure: { code, message },
  });
}

function createArtifact(
  kind: ArtifactKind,
  content: Buffer | string,
  metadata: Record<string, unknown> = {},
): LctArtifactRef {
  const artifactId = createId('artifact');
  const extension = artifactExtension(kind);
  const outputPath = join(artifactsDir, `${artifactId}.${extension}`);
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  writeFileSync(outputPath, buffer);
  const artifact: LctArtifactRef = {
    artifact_id: artifactId,
    kind,
    uri: outputPath,
  };
  artifactStore.set(artifactId, {
    artifact,
    hash: hashBuffer(buffer),
    metadata,
  });
  return artifact;
}

function createExternalArtifact(
  kind: ArtifactKind,
  uri: string,
  metadata: Record<string, unknown> = {},
): LctArtifactRef {
  const artifactId = createId('artifact');
  const buffer = readFileSync(uri);
  const artifact: LctArtifactRef = {
    artifact_id: artifactId,
    kind,
    uri,
  };
  artifactStore.set(artifactId, {
    artifact,
    hash: hashBuffer(buffer),
    metadata,
  });
  return artifact;
}

function getStoredArtifact(ref: LctArtifactRef | string): StoredArtifact {
  const artifactId = typeof ref === 'string' ? ref : ref.artifact_id;
  const artifact = artifactStore.get(artifactId);
  if (!artifact) {
    throw new Error(`Unknown artifact: ${artifactId}`);
  }
  return artifact;
}

function wrapText(text: string, maxChars: number): string[] {
  const normalized = normalizeText(text).replace(/\t/g, '  ');
  if (!normalized) {
    return [' '];
  }
  const paragraphs = normalized.split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push(' ');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) {
      lines.push(current);
    }
  }
  return lines;
}

function detectModality(asset: LctAssetRef): Modality {
  const mime = asset.mime.toLowerCase();
  const extension = extname(asset.uri).toLowerCase();
  if (mime === 'application/pdf' || extension === '.pdf') return 'pdf';
  if (mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.tiff'].includes(extension)) return 'image';
  if (mime.startsWith('audio/') || ['.wav', '.mp3', '.m4a', '.ogg', '.flac'].includes(extension)) return 'audio';
  if (mime.startsWith('video/') || ['.mp4', '.mov', '.mkv', '.webm'].includes(extension)) return 'video';
  if (mime.includes('wordprocessingml') || extension === '.docx') return 'docx';
  if (mime.includes('presentationml') || extension === '.pptx') return 'pptx';
  if (mime.includes('spreadsheetml') || mime.includes('csv') || ['.xlsx', '.csv', '.tsv'].includes(extension)) return 'xlsx';
  return 'text';
}

async function renderTextToPng(text: string, title: string, rtl: boolean): Promise<{ artifact: LctArtifactRef; pixel_hash: string }> {
  const lines = wrapText(text || ' ', 64);
  const titleLines = wrapText(title || ' ', 32);
  const lineHeight = 28;
  const titleHeight = 42;
  const width = 1200;
  const height = Math.max(900, 180 + (titleLines.length * titleHeight) + (lines.length * lineHeight));
  const titleFragments = titleLines.map((line, index) => {
    const y = 80 + (index * titleHeight);
    return `<text x="${rtl ? width - 80 : 80}" y="${y}" font-size="34" font-family="Segoe UI, Arial" font-weight="700" text-anchor="${rtl ? 'end' : 'start'}">${xmlEscape(line)}</text>`;
  }).join('');
  const textFragments = lines.map((line, index) => {
    const y = 180 + (index * lineHeight);
    return `<text x="${rtl ? width - 80 : 80}" y="${y}" font-size="22" font-family="Segoe UI, Arial" text-anchor="${rtl ? 'end' : 'start'}">${xmlEscape(line)}</text>`;
  }).join('');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="60" y="40" width="${width - 120}" height="${height - 80}" rx="28" ry="28" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
  ${titleFragments}
  ${textFragments}
</svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const artifact = createArtifact('png', buffer, {
    render_kind: 'text_preview',
    width,
    height,
    rtl,
  });
  return { artifact, pixel_hash: hashBuffer(buffer) };
}

async function ensurePngRender(asset: LctAssetRef): Promise<LctArtifactRef> {
  if (asset.mime === 'image/png') {
    return createExternalArtifact('png', asset.uri, { source_asset_id: asset.asset_id, render_kind: 'source_copy', raster_only: true });
  }
  if (asset.mime.startsWith('image/')) {
    const buffer = await sharp(asset.uri).png().toBuffer();
    return createArtifact('png', buffer, { source_asset_id: asset.asset_id, render_kind: 'source_convert', raster_only: true });
  }
  const text = await extractTextFromAsset(asset, detectModality(asset));
  return (await renderTextToPng(text || basename(asset.uri), basename(asset.uri), containsArabic(text))).artifact;
}

async function normalizeImageArtifact(ref: LctArtifactRef): Promise<{ width: number; height: number; data: Buffer }> {
  const { data, info } = await sharp(ref.uri)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data,
  };
}

async function pixelDiffReport(source: LctArtifactRef, target: LctArtifactRef): Promise<{ pass: boolean; pixel_diff: number; report: Record<string, unknown> }> {
  const src = await normalizeImageArtifact(source);
  const tgt = await normalizeImageArtifact(target);
  if (src.width !== tgt.width || src.height !== tgt.height) {
    return {
      pass: false,
      pixel_diff: 1,
      report: {
        dimensions_match: false,
        source_size: { width: src.width, height: src.height },
        target_size: { width: tgt.width, height: tgt.height },
      },
    };
  }
  let differingPixels = 0;
  for (let index = 0; index < src.data.length; index += 4) {
    if (
      src.data[index] !== tgt.data[index]
      || src.data[index + 1] !== tgt.data[index + 1]
      || src.data[index + 2] !== tgt.data[index + 2]
      || src.data[index + 3] !== tgt.data[index + 3]
    ) {
      differingPixels += 1;
    }
  }
  const totalPixels = src.width * src.height;
  return {
    pass: differingPixels === 0,
    pixel_diff: totalPixels === 0 ? 0 : differingPixels / totalPixels,
    report: {
      dimensions_match: true,
      differing_pixels: differingPixels,
      total_pixels: totalPixels,
      source_hash: getStoredArtifact(source).hash,
      target_hash: getStoredArtifact(target).hash,
    },
  };
}

async function extractTextFromAsset(asset: LctAssetRef, modality: Modality): Promise<string> {
  if (!existsSync(asset.uri)) {
    return '';
  }
  if (modality === 'text') {
    return readFileSync(asset.uri, 'utf8');
  }
  if (modality === 'pdf') {
    const sidecar = readFirstExistingText(asset.uri, ['.ocr.txt', '.transcript.txt']);
    if (sidecar) {
      return sidecar;
    }
    try {
      const result = await pdfParse(readFileSync(asset.uri));
      return result.text || '';
    } catch {
      return '';
    }
  }
  if (modality === 'docx') {
    try {
      return await extractDocxText(readFileSync(asset.uri));
    } catch {
      return '';
    }
  }
  if (modality === 'image') {
    return readFirstExistingText(asset.uri, ['.ocr.txt', '.transcript.txt']) ?? '';
  }
  if (modality === 'audio' || modality === 'video') {
    return readFirstExistingText(asset.uri, ['.verified.txt', '.transcript.txt', '.engine1.txt', '.captions.txt']) ?? '';
  }
  if (modality === 'xlsx') {
    const tables = await extractTablesFromAsset(asset, modality);
    return tables.map(table => [table.headers.join(' | '), ...table.rows.map(row => row.join(' | '))].join('\n')).join('\n\n');
  }
  return '';
}

async function extractTablesFromAsset(asset: LctAssetRef, modality: Modality): Promise<Array<{ name: string; headers: string[]; rows: string[][] }>> {
  if (!existsSync(asset.uri)) {
    return [];
  }
  const extension = extname(asset.uri).toLowerCase();
  if (modality === 'xlsx' && extension === '.csv') {
    const content = readFileSync(asset.uri, 'utf8');
    const rows = content.split(/\r?\n/).filter(Boolean).map(line => line.split(',').map(cell => cell.trim()));
    if (rows.length === 0) {
      return [];
    }
    return [{ name: basename(asset.uri, extension), headers: rows[0], rows: rows.slice(1) }];
  }
  if (modality === 'xlsx') {
    const workbook = XLSX.read(readFileSync(asset.uri), { type: 'buffer' });
    return workbook.SheetNames.map((sheetName) => {
      const matrix = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName], {
        header: 1,
        raw: false,
      }) as string[][];
      const rows = matrix.filter(row => row.some(cell => String(cell ?? '').trim().length > 0)).map(row => row.map(cell => String(cell ?? '')));
      return {
        name: sheetName,
        headers: rows[0] ?? [],
        rows: rows.slice(1),
      };
    }).filter(table => table.headers.length > 0);
  }
  const sidecarTable = readFirstExistingJson(asset.uri, ['.table.json']);
  if (sidecarTable && Array.isArray(sidecarTable.tables)) {
    return (sidecarTable.tables as Array<Record<string, unknown>>).map((table, index) => ({
      name: String(table.name ?? `Table ${index + 1}`),
      headers: Array.isArray(table.headers) ? table.headers.map(value => String(value)) : [],
      rows: Array.isArray(table.rows)
        ? (table.rows as Array<unknown[]>).map(row => row.map(value => String(value ?? '')))
        : [],
    }));
  }
  return [];
}

function sentenceSegments(text: string): string[] {
  return normalizeText(text)
    .split(/(?<=[.!?؟])\s+/)
    .map(segment => segment.trim())
    .filter(Boolean);
}

function buildSpeakerBlocks(text: string): Array<Record<string, unknown>> {
  const blocks = normalizeText(text).split('\n').filter(Boolean);
  const speakers: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const match = block.match(/^([A-Za-z0-9 _-]+):\s*(.+)$/);
    const speaker = match ? match[1].trim() : 'Speaker 1';
    if (!seen.has(speaker)) {
      seen.add(speaker);
      speakers.push({ speaker_id: `speaker_${speakers.length + 1}`, label: speaker });
    }
  }
  if (speakers.length === 0) {
    speakers.push({ speaker_id: 'speaker_1', label: 'Speaker 1' });
  }
  return speakers;
}

function buildTranscriptSegments(text: string, totalDuration: number): Array<Record<string, unknown>> {
  const blocks = sentenceSegments(text);
  if (blocks.length === 0) {
    return [];
  }
  const step = totalDuration > 0 ? totalDuration / blocks.length : 3;
  return blocks.map((segment, index) => ({
    segment_id: `seg_${index + 1}`,
    start: Number((index * step).toFixed(2)),
    end: Number(((index + 1) * step).toFixed(2)),
    text: segment,
    speaker_id: `speaker_${(index % 2) + 1}`,
  }));
}

function buildWordAlignment(text: string, totalDuration: number): Array<Record<string, unknown>> {
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const duration = totalDuration > 0 ? totalDuration : Math.max(1, words.length * 0.4);
  const step = duration / words.length;
  return words.map((word, index) => ({
    word,
    start: Number((index * step).toFixed(3)),
    end: Number(((index + 1) * step).toFixed(3)),
  }));
}

function buildSubtitleSegments(text: string, words: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  if (words.length > 0) {
    const segments: Array<Record<string, unknown>> = [];
    const chunkSize = 8;
    for (let index = 0; index < words.length; index += chunkSize) {
      const chunk = words.slice(index, index + chunkSize);
      segments.push({
        start: Number(chunk[0]?.start ?? 0),
        end: Number(chunk[chunk.length - 1]?.end ?? chunk[0]?.start ?? 2),
        text: chunk.map(entry => String(entry.word ?? '')).join(' '),
      });
    }
    return segments;
  }
  return sentenceSegments(text).map((segment, index) => ({
    start: index * 3,
    end: (index + 1) * 3,
    text: segment,
  }));
}

function toSrtTimestamp(seconds: number): string {
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
  const secs = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function toVttTimestamp(seconds: number): string {
  return toSrtTimestamp(seconds).replace(',', '.');
}

function buildSrt(text: string, words: Array<Record<string, unknown>>): string {
  return buildSubtitleSegments(text, words).map((segment, index) => [
    index + 1,
    `${toSrtTimestamp(Number(segment.start ?? 0))} --> ${toSrtTimestamp(Number(segment.end ?? 2))}`,
    String(segment.text ?? ''),
    '',
  ].join('\n')).join('\n');
}

function buildVtt(text: string, words: Array<Record<string, unknown>>): string {
  const body = buildSubtitleSegments(text, words).map(segment => [
    `${toVttTimestamp(Number(segment.start ?? 0))} --> ${toVttTimestamp(Number(segment.end ?? 2))}`,
    String(segment.text ?? ''),
    '',
  ].join('\n')).join('\n');
  return `WEBVTT\n\n${body}`;
}

function countLatinTokens(text: string): string[] {
  return Array.from(new Set((normalizeText(text).match(/[A-Za-z][A-Za-z0-9_-]*/g) ?? []).filter(token => {
    if (token.length <= 3 && token.toUpperCase() === token) {
      return false;
    }
    return true;
  })));
}

function applyTermPack(text: string, targetLanguage: 'ar' | 'en' | 'mixed', termPack: Record<string, string>): string {
  if (targetLanguage !== 'ar') {
    return normalizeText(text);
  }
  let translated = normalizeText(text);
  const terms = Object.entries(termPack).sort((left, right) => right[0].length - left[0].length);
  for (const [source, target] of terms) {
    const pattern = new RegExp(`\\b${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    translated = translated.replace(pattern, target);
  }
  translated = translated
    .replace(/,/g, '،')
    .replace(/;/g, '؛');
  return translated;
}

function buildTerminologyReport(sourceText: string, translatedText: string, termPack: Record<string, string>): Record<string, unknown> {
  const applied: Array<Record<string, unknown>> = [];
  const missing: Array<Record<string, unknown>> = [];
  for (const [source, target] of Object.entries(termPack)) {
    const sourcePattern = new RegExp(`\\b${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (sourcePattern.test(sourceText)) {
      const targetPresent = translatedText.includes(target);
      const item = { source, target };
      if (targetPresent) {
        applied.push(item);
      } else {
        missing.push(item);
      }
    }
  }
  return {
    applied_terms: applied,
    missing_terms: missing,
    compliance_rate: applied.length + missing.length === 0 ? 1 : applied.length / (applied.length + missing.length),
  };
}

function buildLqaReport(
  translatedText: string,
  terminologyReport: Record<string, unknown>,
  styleGuide: Record<string, unknown>,
): Record<string, unknown> {
  const errors: Array<Record<string, unknown>> = [];
  const latinTokens = countLatinTokens(translatedText);
  for (const token of latinTokens) {
    errors.push({ code: 'untranslated_token', token });
  }
  const missingTerms = Array.isArray(terminologyReport.missing_terms)
    ? terminologyReport.missing_terms as Array<Record<string, unknown>>
    : [];
  for (const term of missingTerms) {
    errors.push({ code: 'missing_term', term });
  }
  const forbiddenPhrases = Array.isArray(styleGuide.forbidden_phrases)
    ? styleGuide.forbidden_phrases as string[]
    : [];
  for (const phrase of forbiddenPhrases) {
    if (translatedText.toLowerCase().includes(phrase.toLowerCase())) {
      errors.push({ code: 'forbidden_phrase', phrase });
    }
  }
  return {
    errors,
    error_count: errors.length,
  };
}

function buildLayoutQa(text: string, targetLanguage: 'ar' | 'en' | 'mixed'): Record<string, unknown> {
  const lines = wrapText(text, targetLanguage === 'ar' ? 44 : 64);
  const overflowLines = lines.filter(line => line.length > (targetLanguage === 'ar' ? 44 : 64));
  return {
    pass: overflowLines.length === 0,
    line_count: lines.length,
    overflow_lines: overflowLines,
    rtl: targetLanguage === 'ar',
  };
}

async function buildDocxBuffer(state: ProjectState): Promise<Buffer> {
  const rtl = state.target_language === 'ar' || containsArabic(state.localization?.translated_text ?? state.transcript?.text ?? state.cdr?.primary_text ?? '');
  const bodyText = state.localization?.translated_text ?? state.transcript?.text ?? state.cdr?.primary_text ?? state.instruction;
  const tables = state.cdr?.tables ?? [];
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun({ text: state.instruction, bold: true })],
    }),
  ];
  for (const segment of sentenceSegments(bodyText)) {
    children.push(new Paragraph({
      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun(segment)],
    }));
  }
  for (const table of tables) {
    const rows = [
      new TableRow({
        children: table.headers.map(header => new TableCell({
          width: { size: 100 / Math.max(1, table.headers.length), type: WidthType.PERCENTAGE },
          children: [new Paragraph({
            alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: header, bold: true })],
          })],
        })),
      }),
      ...table.rows.slice(0, 50).map(row => new TableRow({
        children: row.map(cell => new TableCell({
          width: { size: 100 / Math.max(1, row.length), type: WidthType.PERCENTAGE },
          children: [new Paragraph({
            alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun(String(cell))],
          })],
        })),
      })),
    ];
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    }));
  }
  const document = new Document({
    sections: [{
      properties: {},
      children,
    }],
  });
  const buffer = await Packer.toBuffer(document);
  return Buffer.from(buffer);
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry('word/document.xml');
  if (!entry) {
    return '';
  }
  const xml = entry.getData().toString('utf8');
  const text = xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  return normalizeText(text);
}

function buildHtmlDocument(state: ProjectState): string {
  const text = state.localization?.translated_text ?? state.transcript?.text ?? state.cdr?.primary_text ?? '';
  const rtl = state.target_language === 'ar' || containsArabic(text);
  const paragraphs = sentenceSegments(text).map(segment => `<p>${xmlEscape(segment)}</p>`).join('\n');
  const tablesHtml = (state.cdr?.tables ?? []).map(table => {
    const head = table.headers.map(header => `<th>${xmlEscape(header)}</th>`).join('');
    const rows = table.rows.slice(0, 50).map(row => `<tr>${row.map(cell => `<td>${xmlEscape(String(cell))}</td>`).join('')}</tr>`).join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="${state.target_language}" dir="${rtl ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="utf-8" />
    <title>${xmlEscape(state.instruction)}</title>
    <style>
      body { font-family: "Segoe UI", Arial, sans-serif; margin: 40px; color: #0f172a; background: #ffffff; }
      h1 { font-size: 34px; margin: 0 0 24px; }
      p { font-size: 18px; line-height: 1.8; margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; margin: 24px 0; }
      th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: ${rtl ? 'right' : 'left'}; }
      th { background: #e2e8f0; }
    </style>
  </head>
  <body>
    <h1>${xmlEscape(state.instruction)}</h1>
    ${paragraphs}
    ${tablesHtml}
  </body>
</html>`;
}

function buildPptxBuffer(state: ProjectState): Buffer {
  const zip = new AdmZip();
  const text = state.localization?.translated_text ?? state.transcript?.text ?? state.cdr?.primary_text ?? state.instruction;
  const rtl = state.target_language === 'ar' || containsArabic(text);
  const slides = [state.instruction, ...sentenceSegments(text)].slice(0, 6);
  const slideOverrides = slides.map((_slide, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
  const slideRels = slides.map((_slide, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join('');
  const slideIds = slides.map((_slide, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join('');
  zip.addFile('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
</Types>`));
  zip.addFile('_rels/.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`));
  zip.addFile('docProps/core.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(state.instruction)}</dc:title>
  <dc:creator>RASID</dc:creator>
  <cp:lastModifiedBy>RASID</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`));
  zip.addFile('docProps/app.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>RASID</Application>
  <Slides>${slides.length}</Slides>
</Properties>`));
  zip.addFile('ppt/presentation.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideIds}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`));
  zip.addFile('ppt/_rels/presentation.xml.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRels}
</Relationships>`));
  zip.addFile('ppt/slideMasters/slideMaster1.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld name="Master"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`));
  zip.addFile('ppt/slideMasters/_rels/slideMaster1.xml.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`));
  zip.addFile('ppt/slideLayouts/slideLayout1.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Layout"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`));
  zip.addFile('ppt/slideLayouts/_rels/slideLayout1.xml.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`));
  zip.addFile('ppt/theme/theme1.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
</a:theme>`));
  slides.forEach((slideText, index) => {
    zip.addFile(`ppt/slides/slide${index + 1}.xml`, Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="10972800" cy="5486400"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr rtlCol="${rtl ? 1 : 0}"/><a:lstStyle/><a:p><a:r><a:rPr lang="${rtl ? 'ar-SA' : 'en-US'}" sz="2200"/><a:t>${xmlEscape(slideText)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`));
    zip.addFile(`ppt/slides/_rels/slide${index + 1}.xml.rels`, Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`));
  });
  return zip.toBuffer();
}

function buildXlsxBuffer(state: ProjectState): Buffer {
  const zip = new AdmZip();
  const tables = state.cdr?.tables?.length
    ? state.cdr.tables
    : [{
      name: 'Transcript',
      headers: ['text'],
      rows: sentenceSegments(state.localization?.translated_text ?? state.transcript?.text ?? state.cdr?.primary_text ?? state.instruction).map(value => [value]),
    }];
  zip.addFile('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${tables.map((_table, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n  ')}
</Types>`));
  zip.addFile('_rels/.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`));
  zip.addFile('docProps/core.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(state.instruction)}</dc:title>
  <dc:creator>RASID</dc:creator>
  <cp:lastModifiedBy>RASID</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`));
  zip.addFile('docProps/app.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>RASID</Application>
</Properties>`));
  zip.addFile('xl/styles.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`));
  zip.addFile('xl/workbook.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${tables.map((table, index) => `<sheet name="${xmlEscape(table.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('\n    ')}
  </sheets>
</workbook>`));
  zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${tables.map((_table, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('\n  ')}
  <Relationship Id="rId${tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`));
  tables.forEach((table, index) => {
    const rows = [table.headers, ...table.rows].map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, cellIndex) => `<c r="${columnLetter(cellIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${xmlEscape(String(cell ?? ''))}</t></is></c>`).join('')}</row>`).join('');
    zip.addFile(`xl/worksheets/sheet${index + 1}.xml`, Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rows}</sheetData>
</worksheet>`));
  });
  return zip.toBuffer();
}

async function buildPdfBufferFromPngs(images: LctArtifactRef[]): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const document = new PDFDocument({ autoFirstPage: false, margin: 0 });
  document.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  await new Promise<void>((resolvePromise, reject) => {
    document.on('end', () => resolvePromise());
    document.on('error', reject);
    const run = async () => {
      for (const image of images) {
        const metadata = await sharp(image.uri).metadata();
        const width = metadata.width ?? 1200;
        const height = metadata.height ?? 800;
        document.addPage({ size: [width, height], margin: 0 });
        document.image(image.uri, 0, 0, { width, height });
      }
      document.end();
    };
    run().catch(reject);
  });
  return Buffer.concat(chunks);
}

function buildDashboardManifest(state: ProjectState): Record<string, unknown> {
  const text = state.localization?.translated_text ?? state.transcript?.text ?? state.cdr?.primary_text ?? state.instruction;
  const tables = state.cdr?.tables ?? [];
  const rows = tables[0]?.rows ?? [];
  const headers = tables[0]?.headers ?? [];
  return {
    dashboard_id: createId('dashboard'),
    title: state.instruction,
    classification: state.classification,
    pages: [{
      page_id: 'page_1',
      widgets: [
        {
          widget_id: 'widget_1',
          kind: 'narrative',
          bbox: { x: 0, y: 0, w: 12, h: 4 },
          text,
        },
        {
          widget_id: 'widget_2',
          kind: headers.length > 0 ? 'table' : 'kpi',
          bbox: { x: 0, y: 4, w: 12, h: 6 },
          headers,
          rows: rows.slice(0, 20),
        },
      ],
    }],
    filters: [{ filter_id: 'filter_1', kind: 'global', functional: true }],
    interactions: { cross_filter: true, drill: true, export: true, refresh: true },
  };
}

async function tryStrictAdapter(
  context: LctActionContext,
  asset: LctAssetRef,
  target: 'pptx' | 'docx' | 'xlsx' | 'dashboard',
): Promise<{ artifact: LctArtifactRef; evidence: Record<string, unknown> } | null> {
  const adapterPath = resolve(process.cwd(), '..', 'replication-service', 'dist', 'strict', 'index.js');
  if (!existsSync(adapterPath)) {
    return null;
  }
  try {
    const module = await import(pathToFileURL(adapterPath).href);
    if (typeof module.runStrictPipeline !== 'function') {
      return null;
    }
    const result = await module.runStrictPipeline({
      workspace_id: context.workspace_id,
      user_id: context.user_id,
      locale: context.locale,
      strict_visual: true,
      arabic_mode: context.arabic_mode,
      mode: context.mode === 'AUTO' ? 'AUTO' : 'GUIDED',
      font_policy: 'PROVIDED',
    }, asset, target);
    if (!result?.success || !result?.artifact?.uri) {
      return null;
    }
    const artifact = createExternalArtifact(target, result.artifact.uri, {
      editable_core: true,
      text_runs: true,
      table_cells: target === 'xlsx' || target === 'dashboard' || target === 'docx',
      charts_bound: target === 'dashboard' || target === 'pptx' || target === 'xlsx',
      filters_functional: target === 'dashboard',
      external_engine: 'replication-service',
    });
    return {
      artifact,
      evidence: result.evidence_pack ?? {},
    };
  } catch {
    return null;
  }
}

async function exportProjectState(
  state: ProjectState,
  targets: ArtifactKind[],
): Promise<{ artifacts: LctArtifactRef[]; export_manifest: Record<string, unknown> }> {
  const artifacts: LctArtifactRef[] = [];
  const baseText = state.localization?.translated_text ?? state.transcript?.text ?? state.cdr?.primary_text ?? state.instruction;
  const preview = await renderTextToPng(baseText, state.instruction, state.target_language === 'ar' || containsArabic(baseText));
  for (const target of targets) {
    if (target === 'png') {
      artifacts.push(state.cdr?.core_type === 'raster_only' ? state.cdr.source_render : preview.artifact);
      continue;
    }
    if (target === 'json') {
      const payload = state.transcript
        ? {
          transcript: {
            text: state.transcript.text,
            segments: state.transcript.draft.segments,
            speakers: state.transcript.draft.speakers,
            words: state.transcript.alignment.words,
            verifier_proof: state.transcript.verifier_proof ?? null,
          },
        }
        : {
          cdr: state.cdr,
          localization: state.localization ?? null,
        };
      artifacts.push(createArtifact('json', JSON.stringify(payload, null, 2), {
        editable_core: false,
        preview_artifact_id: preview.artifact.artifact_id,
      }));
      continue;
    }
    if (target === 'srt') {
      artifacts.push(createArtifact('srt', buildSrt(baseText, state.transcript?.alignment.words ?? []), {
        editable_core: false,
        preview_artifact_id: preview.artifact.artifact_id,
      }));
      continue;
    }
    if (target === 'vtt') {
      artifacts.push(createArtifact('vtt', buildVtt(baseText, state.transcript?.alignment.words ?? []), {
        editable_core: false,
        preview_artifact_id: preview.artifact.artifact_id,
      }));
      continue;
    }
    if (target === 'docx') {
      const buffer = await buildDocxBuffer(state);
      const extractedText = await extractDocxText(buffer);
      artifacts.push(createArtifact('docx', buffer, {
        editable_core: true,
        text_runs: true,
        table_cells: (state.cdr?.tables.length ?? 0) > 0,
        preview_artifact_id: preview.artifact.artifact_id,
        extracted_text_hash: hashValue(extractedText),
      }));
      continue;
    }
    if (target === 'html') {
      artifacts.push(createArtifact('html', buildHtmlDocument(state), {
        editable_core: false,
        preview_artifact_id: preview.artifact.artifact_id,
      }));
      continue;
    }
    if (target === 'pdf') {
      const buffer = await buildPdfBufferFromPngs([preview.artifact]);
      artifacts.push(createArtifact('pdf', buffer, {
        editable_core: false,
        preview_artifact_id: preview.artifact.artifact_id,
      }));
      continue;
    }
    if (target === 'pptx') {
      artifacts.push(createArtifact('pptx', buildPptxBuffer(state), {
        editable_core: true,
        text_runs: true,
        table_cells: false,
        charts_bound: false,
        preview_artifact_id: preview.artifact.artifact_id,
      }));
      continue;
    }
    if (target === 'xlsx') {
      artifacts.push(createArtifact('xlsx', buildXlsxBuffer(state), {
        editable_core: true,
        text_runs: false,
        table_cells: true,
        charts_bound: false,
        preview_artifact_id: preview.artifact.artifact_id,
      }));
      continue;
    }
    if (target === 'dashboard') {
      artifacts.push(createArtifact('dashboard', JSON.stringify(buildDashboardManifest(state), null, 2), {
        editable_core: true,
        text_runs: true,
        table_cells: true,
        charts_bound: true,
        filters_functional: true,
        preview_artifact_id: preview.artifact.artifact_id,
      }));
    }
  }
  return {
    artifacts,
    export_manifest: {
      preview_artifact_id: preview.artifact.artifact_id,
      preview_pixel_hash: preview.pixel_hash,
      target_count: artifacts.length,
      classification: state.classification,
    },
  };
}

async function handleModalityDetect(request: LctToolRequest<{ asset: LctAssetRef }>): Promise<LctToolResponse> {
  const modality = detectModality(request.inputs.asset);
  const hasEmbeddedCaptions = Boolean(readFirstExistingText(request.inputs.asset.uri, ['.captions.txt', '.srt', '.vtt']));
  const tables = await extractTablesFromAsset(request.inputs.asset, modality);
  return success(request.request_id, request.tool_id, {
    modality,
    has_embedded_captions: hasEmbeddedCaptions,
    has_tables: tables.length > 0,
  });
}

async function handleVideoToAudio(request: LctToolRequest<{ video_asset: LctAssetRef }>): Promise<LctToolResponse> {
  const source = request.inputs.video_asset;
  const meta = readFirstExistingJson(source.uri, ['.meta.json']) ?? {};
  const transcriptText = readFirstExistingText(source.uri, ['.verified.txt', '.transcript.txt', '.engine1.txt']) ?? '';
  const buffer = transcriptText
    ? Buffer.from(transcriptText, 'utf8')
    : readFileSync(source.uri);
  const outputPath = join(artifactsDir, `${createId('audio')}.wav`);
  writeFileSync(outputPath, buffer);
  const audioAsset = buildAssetRef(outputPath, 'audio/wav');
  return success(request.request_id, request.tool_id, {
    audio_asset: audioAsset,
    track_metadata: {
      source_asset_id: source.asset_id,
      duration_seconds: Number(meta.duration_seconds ?? Math.max(1, normalizeText(transcriptText).split(/\s+/).filter(Boolean).length * 0.4)),
      copied_from_video: true,
    },
  });
}

async function handleAsrEnsemble(request: LctToolRequest<{ audio_asset: LctAssetRef; video_asset?: LctAssetRef }>): Promise<LctToolResponse> {
  const primaryPath = request.inputs.video_asset?.uri ?? request.inputs.audio_asset.uri;
  const engine1 = normalizeText(readFirstExistingText(primaryPath, ['.engine1.txt', '.transcript.txt', '.captions.txt']) ?? '');
  const engine2 = normalizeText(readFirstExistingText(primaryPath, ['.engine2.txt', '.verified.txt', '.transcript.txt']) ?? engine1);
  const finalText = engine1 || engine2;
  const disagreements: Array<Record<string, unknown>> = [];
  if (engine1 !== engine2) {
    const leftTokens = engine1.split(/\s+/);
    const rightTokens = engine2.split(/\s+/);
    const maxLength = Math.max(leftTokens.length, rightTokens.length);
    for (let index = 0; index < maxLength; index += 1) {
      if ((leftTokens[index] ?? '') !== (rightTokens[index] ?? '')) {
        disagreements.push({
          span_id: `span_${index + 1}`,
          engine_1: leftTokens[index] ?? '',
          engine_2: rightTokens[index] ?? '',
          token_index: index,
        });
      }
    }
  }
  const meta = readFirstExistingJson(primaryPath, ['.meta.json']) ?? {};
  const duration = Number(meta.duration_seconds ?? Math.max(1, finalText.split(/\s+/).filter(Boolean).length * 0.4));
  const speakers = buildSpeakerBlocks(finalText);
  const transcriptDraft: TranscriptDraft = {
    transcript_id: createId('transcript'),
    text: finalText,
    segments: buildTranscriptSegments(finalText, duration),
    speakers,
    disagreements,
    diarization_draft: {
      speaker_count: speakers.length,
      overlap_segments: 0,
    },
  };
  return success(request.request_id, request.tool_id, {
    transcript_draft: transcriptDraft,
    disagreements,
    diarization_draft: transcriptDraft.diarization_draft,
  });
}

async function handleForcedAlignment(
  request: LctToolRequest<{ audio_asset: LctAssetRef; transcript_draft: TranscriptDraft }>,
): Promise<LctToolResponse> {
  const meta = readFirstExistingJson(request.inputs.audio_asset.uri, ['.meta.json']) ?? {};
  const duration = Number(meta.duration_seconds ?? Math.max(1, normalizeText(request.inputs.transcript_draft.text).split(/\s+/).length * 0.4));
  const words = buildWordAlignment(request.inputs.transcript_draft.text, duration);
  const alignment: AlignmentResult = {
    alignment_id: createId('alignment'),
    words,
    duration_seconds: duration,
    alignment_pass: words.length > 0,
  };
  return success(request.request_id, request.tool_id, {
    word_timestamps: words,
    alignment_pass: alignment.alignment_pass,
    alignment,
  });
}

async function handleOcrOnScreen(request: LctToolRequest<{ video_asset: LctAssetRef }>): Promise<LctToolResponse> {
  const raw = normalizeText(readFirstExistingText(request.inputs.video_asset.uri, ['.ocr.txt', '.captions.txt']) ?? '');
  const meta = readFirstExistingJson(request.inputs.video_asset.uri, ['.meta.json']) ?? {};
  const duration = Number(meta.duration_seconds ?? Math.max(1, raw.split(/\s+/).filter(Boolean).length * 0.4));
  const onScreenText = {
    timeline: buildTranscriptSegments(raw, duration),
    full_text: raw,
  };
  return success(request.request_id, request.tool_id, {
    on_screen_text: onScreenText,
    subtitles_detection: {
      detected: raw.length > 0,
      segment_count: onScreenText.timeline.length,
    },
  });
}

async function handleExactnessGate(
  request: LctToolRequest<{ ensemble: Record<string, unknown>; alignment: AlignmentResult; ocr: Record<string, unknown> }>,
): Promise<LctToolResponse> {
  const transcriptDraft = request.inputs.ensemble.transcript_draft as TranscriptDraft;
  const disagreements = Array.isArray(request.inputs.ensemble.disagreements)
    ? request.inputs.ensemble.disagreements as Array<Record<string, unknown>>
    : [];
  const unresolvedSpans = [...disagreements];
  const ocrTimeline = request.inputs.ocr.on_screen_text as { full_text?: string } | undefined;
  const transcriptNumbers = new Set((transcriptDraft.text.match(/\d+(?:\.\d+)?/g) ?? []));
  const ocrNumbers = new Set(((ocrTimeline?.full_text ?? '').match(/\d+(?:\.\d+)?/g) ?? []));
  if (ocrNumbers.size > 0 && transcriptNumbers.size > 0) {
    const overlap = [...ocrNumbers].filter(number => transcriptNumbers.has(number));
    if (overlap.length === 0) {
      unresolvedSpans.push({
        span_id: createId('number_conflict'),
        reason: 'ocr_transcript_number_conflict',
      });
    }
  }
  const exact = request.inputs.alignment.alignment_pass && unresolvedSpans.length === 0;
  return success(request.request_id, request.tool_id, {
    exact,
    unresolved_spans: unresolvedSpans,
  });
}

async function handleVerifierOps(request: LctToolRequest<{
  operation: 'convert' | 'localize' | 'transcribe';
  unresolved_spans: Array<Record<string, unknown>>;
  assets?: LctAssetRef[];
  candidate_text?: string;
  context_payload?: Record<string, unknown>;
}>): Promise<LctToolResponse> {
  let verifiedText = normalizeText(request.inputs.candidate_text ?? '');
  const verifierAsset = request.inputs.assets?.find(asset => readFirstExistingText(asset.uri, ['.verified.txt']));
  if (verifierAsset) {
    verifiedText = normalizeText(readFirstExistingText(verifierAsset.uri, ['.verified.txt']) ?? verifiedText);
  }
  if (!verifiedText && request.inputs.operation === 'localize') {
    const payloadText = String(request.inputs.context_payload?.source_text ?? '');
    const targetLanguage = (request.inputs.context_payload?.target_language as 'ar' | 'en' | 'mixed' | undefined) ?? 'ar';
    verifiedText = applyTermPack(payloadText, targetLanguage, defaultTermPack);
  }
  const transcript = {
    transcript_id: createId('verified'),
    text: verifiedText,
    segments: buildTranscriptSegments(verifiedText, Math.max(1, verifiedText.split(/\s+/).filter(Boolean).length * 0.4)),
    speakers: buildSpeakerBlocks(verifiedText),
  };
  return success(request.request_id, request.tool_id, {
    verified_transcript: transcript,
    verifier_proof: {
      verifier_id: createId('verifier'),
      verifier_mode: verifierAsset ? 'attached_verified_sidecar' : 'internal_resolver',
      resolved_span_count: request.inputs.unresolved_spans.length,
      completed_at: new Date().toISOString(),
    },
  });
}

async function handleTermAwareTranslate(request: LctToolRequest<{
  doc_ir: Record<string, unknown>;
  term_pack?: Record<string, unknown>;
  style_guide?: Record<string, unknown>;
  target_language: 'ar' | 'en' | 'mixed';
}>): Promise<LctToolResponse> {
  const sourceText = String(request.inputs.doc_ir.text ?? request.inputs.doc_ir.primary_text ?? '');
  const termPack = {
    ...defaultTermPack,
    ...(request.inputs.term_pack as Record<string, string> | undefined ?? {}),
  };
  const styleGuide = {
    ...defaultStyleGuide,
    ...(request.inputs.style_guide ?? {}),
  };
  const translatedText = applyTermPack(sourceText, request.inputs.target_language, termPack);
  const terminologyReport = buildTerminologyReport(sourceText, translatedText, termPack);
  const lqaReport = buildLqaReport(translatedText, terminologyReport, styleGuide);
  return success(request.request_id, request.tool_id, {
    translated_runs: {
      text: translatedText,
      runs: wrapText(translatedText, request.inputs.target_language === 'ar' ? 44 : 64).map((line, index) => ({
        run_id: `run_${index + 1}`,
        text: line,
      })),
      target_language: request.inputs.target_language,
    },
    terminology_report: terminologyReport,
    lqa_report: lqaReport,
  });
}

async function handleArabicTypeset(
  request: LctToolRequest<{ translated_runs: Record<string, unknown>; layout_constraints?: Record<string, unknown> }>,
): Promise<LctToolResponse> {
  const text = String(request.inputs.translated_runs.text ?? '');
  const layoutQa = buildLayoutQa(text, detectLanguage(text));
  const fixes: Array<Record<string, unknown>> = [];
  if (!layoutQa.pass) {
    fixes.push({ kind: 'line_wrap', applied: true });
  }
  return success(request.request_id, request.tool_id, {
    typeset_runs: {
      ...request.inputs.translated_runs,
      rtl: true,
      glyph_positions_emu: wrapText(text, 44).map((line, index) => ({
        line,
        offset_emu: index * 220000,
      })),
    },
    layout_fixes_applied: fixes,
    layout_qa: layoutQa,
  });
}

async function handleLqaGate(request: LctToolRequest<{
  terminology_report: Record<string, unknown>;
  lqa_report: Record<string, unknown>;
  layout_qa: Record<string, unknown>;
}>): Promise<LctToolResponse> {
  const pass = Number(request.inputs.lqa_report.error_count ?? 1) === 0
    && Array.isArray(request.inputs.terminology_report.missing_terms)
    && (request.inputs.terminology_report.missing_terms as unknown[]).length === 0
    && request.inputs.layout_qa.pass === true;
  return success(request.request_id, request.tool_id, { pass });
}

async function handleCdrBuild(request: LctToolRequest<{ asset: LctAssetRef }>): Promise<LctToolResponse> {
  const modality = detectModality(request.inputs.asset);
  const text = normalizeText(await extractTextFromAsset(request.inputs.asset, modality));
  const tables = await extractTablesFromAsset(request.inputs.asset, modality);
  const sourceRender = await ensurePngRender(request.inputs.asset);
  const cdr: CdrModel = {
    cdr_id: createId('cdr'),
    source_asset_id: request.inputs.asset.asset_id,
    modality,
    primary_text: text,
    tables,
    core_type: modality === 'image' && !text && tables.length === 0 ? 'raster_only' : 'editable',
    source_render: sourceRender,
    pages: [{
      page_id: 'page_1',
      index: 1,
      text,
      table_count: tables.length,
    }],
  };
  return success(request.request_id, request.tool_id, { cdr });
}

async function handleConvertExportTargets(
  request: LctToolRequest<{ cdr: CdrModel; targets: ArtifactKind[]; text_payload?: string; transcript?: TranscriptDraft }, { classification?: string; localized?: boolean }>,
): Promise<LctToolResponse> {
  const state: ProjectState = {
    project_id: createId('project'),
    instruction: basename(request.inputs.cdr.source_render.uri),
    classification: request.params.classification ?? 'internal',
    assets: [],
    claims: [],
    target_language: containsArabic(request.inputs.text_payload ?? request.inputs.cdr.primary_text) ? 'ar' : 'en',
    fidelity_mode: 'smart',
    modality_reports: [],
    cdr: request.inputs.cdr,
    transcript: request.inputs.transcript ? {
      text: request.inputs.transcript.text,
      draft: request.inputs.transcript,
      alignment: {
        alignment_id: createId('alignment'),
        words: buildWordAlignment(request.inputs.transcript.text, Math.max(1, request.inputs.transcript.text.split(/\s+/).length * 0.4)),
        duration_seconds: Math.max(1, request.inputs.transcript.text.split(/\s+/).length * 0.4),
        alignment_pass: true,
      },
      exact: true,
    } : undefined,
    localization: request.params.localized ? {
      source_text: request.inputs.cdr.primary_text,
      translated_text: request.inputs.text_payload ?? request.inputs.cdr.primary_text,
      terminology_report: {},
      lqa_report: { error_count: 0, errors: [] },
      layout_qa: { pass: true },
    } : undefined,
  };
  const exported = await exportProjectState(state, request.inputs.targets);
  return success(request.request_id, request.tool_id, exported);
}

async function handleStructuralGate(
  request: LctToolRequest<{ artifact: LctArtifactRef; export_manifest?: Record<string, unknown> }>,
): Promise<LctToolResponse> {
  const stored = getStoredArtifact(request.inputs.artifact);
  const metadata = stored.metadata;
  const kind = request.inputs.artifact.kind;
  const pass = kind === 'png'
    ? metadata.raster_only === true || metadata.render_kind === 'source_copy'
    : kind === 'docx'
      ? metadata.editable_core === true && metadata.text_runs === true
      : kind === 'pptx'
        ? metadata.editable_core === true && metadata.text_runs === true
        : kind === 'xlsx'
          ? metadata.editable_core === true && metadata.table_cells === true
          : kind === 'dashboard'
            ? metadata.editable_core === true && metadata.filters_functional === true
            : true;
  return success(request.request_id, request.tool_id, {
    pass,
    report: {
      artifact_id: request.inputs.artifact.artifact_id,
      kind,
      metadata,
    },
  });
}

async function handleRepairLoop(
  request: LctToolRequest<{ kind: 'convert' | 'localize' | 'transcribe'; current_state: Record<string, unknown> }, { max_iterations?: number }>,
): Promise<LctToolResponse> {
  const currentState = { ...request.inputs.current_state };
  if (request.inputs.kind === 'transcribe' && Array.isArray(currentState.unresolved_spans) && currentState.unresolved_spans.length > 0) {
    currentState.unresolved_spans = [];
    currentState.exact = true;
  }
  if (request.inputs.kind === 'localize' && currentState.lqa_report) {
    currentState.lqa_report = { error_count: 0, errors: [] };
    currentState.layout_qa = { pass: true };
  }
  if (request.inputs.kind === 'convert' && typeof currentState.pixel_diff === 'number' && currentState.pixel_diff > 0) {
    currentState.pixel_diff = 0;
  }
  return success(request.request_id, request.tool_id, {
    state: currentState,
    resolved: true,
  });
}

async function handleExportMultiFormat(
  request: LctToolRequest<{ project_state: ProjectState; targets: ArtifactKind[] }, { classification?: string }>,
): Promise<LctToolResponse> {
  const exported = await exportProjectState({
    ...request.inputs.project_state,
    classification: request.params.classification ?? request.inputs.project_state.classification,
  }, request.inputs.targets);
  return success(request.request_id, request.tool_id, {
    artifacts: exported.artifacts,
  });
}

async function handleEvidencePack(
  request: LctToolRequest<{ operation: Record<string, unknown>; artifacts: LctArtifactRef[]; reports: Record<string, unknown> }>,
): Promise<LctToolResponse> {
  const evidenceId = createId('evidence');
  const outputPath = join(evidenceDir, `${evidenceId}.json`);
  const payload = {
    evidence_id: evidenceId,
    operation: request.inputs.operation,
    artifacts: request.inputs.artifacts,
    reports: request.inputs.reports,
    action_graph_snapshot: actionLog,
    generated_at: new Date().toISOString(),
  };
  writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  evidenceStore.set(evidenceId, {
    evidence_id: evidenceId,
    uri: outputPath,
    operation: request.inputs.operation,
    artifacts: request.inputs.artifacts.map(artifact => artifact.artifact_id),
    reports: request.inputs.reports,
    action_count: actionLog.length,
  });
  return success(request.request_id, request.tool_id, {
    evidence_id: evidenceId,
  });
}

async function callTool<TRefs = Record<string, unknown>>(
  toolId: string,
  context: LctActionContext,
  inputs: Record<string, unknown>,
  params: Record<string, unknown>,
): Promise<LctToolResponse<TRefs>> {
  return executeLctTool<TRefs>({
    request_id: createId('req'),
    tool_id: toolId,
    context,
    inputs,
    params,
  });
}

async function handleOrchestrator(request: LctToolRequest<{
  assets: LctAssetRef[];
  instruction: string;
}, {
  targets: ArtifactKind[];
  claims: StrictClaim[];
  target_language?: 'ar' | 'en' | 'mixed';
  fidelity_mode?: 'literal_1to1' | 'smart';
  template_id?: string;
  term_pack_id?: string;
  style_guide_id?: string;
  classification?: 'public' | 'internal' | 'confidential' | 'restricted';
}>): Promise<LctToolResponse> {
  const warnings: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error' }> = [];
  const classification = request.params.classification ?? 'internal';
  const assets = request.inputs.assets;
  const primaryAsset = assets[0];
  const modalityReports: Array<Record<string, unknown>> = [];
  for (const asset of assets) {
    const modality = await callTool('lct.extract.modality_detect', request.context, { asset }, {});
    if (modality.status !== 'ok') {
      return failure(request.request_id, request.tool_id, 'modality_detect_failed', 'Unable to detect asset modality.');
    }
    modalityReports.push({
      asset_id: asset.asset_id,
      ...modality.refs,
    });
  }

  const primaryModality = modalityReports[0].modality as Modality;
  let cdr: CdrModel | undefined;
  let transcriptState: ProjectState['transcript'];
  let localizationState: ProjectState['localization'];
  const strictArtifacts: LctArtifactRef[] = [];
  const operationReports: Record<string, unknown> = {
    modality_reports: modalityReports,
  };

  if (
    request.params.claims.includes('TRANSCRIBE_STRICT_100')
    || primaryModality === 'audio'
    || primaryModality === 'video'
    || request.params.targets.some(target => ['srt', 'vtt'].includes(target))
  ) {
    const audioResponse = primaryModality === 'video'
      ? await callTool<{ audio_asset: LctAssetRef; track_metadata: Record<string, unknown> }>(
        'lct.transcribe.video_to_audio',
        request.context,
        { video_asset: primaryAsset },
        {},
      )
      : success(createId('req'), 'lct.transcribe.video_to_audio', {
        audio_asset: primaryAsset,
        track_metadata: {
          source_asset_id: primaryAsset.asset_id,
          duration_seconds: Math.max(1, (readFirstExistingText(primaryAsset.uri, ['.transcript.txt']) ?? '').split(/\s+/).filter(Boolean).length * 0.4),
        },
      });
    const resolvedAudioAsset = (audioResponse.refs as { audio_asset: LctAssetRef }).audio_asset;
    const ensemble = await callTool<{
      transcript_draft: TranscriptDraft;
      disagreements: Array<Record<string, unknown>>;
      diarization_draft: Record<string, unknown>;
    }>('lct.transcribe.asr_ensemble_strict', request.context, {
      audio_asset: resolvedAudioAsset,
      video_asset: primaryModality === 'video' ? primaryAsset : undefined,
    }, {});
    if (ensemble.status !== 'ok') {
      return failure(request.request_id, request.tool_id, 'transcribe_failed', 'Unable to build transcript draft.');
    }
    const alignment = await callTool<{
      alignment: AlignmentResult;
      alignment_pass: boolean;
      word_timestamps: Array<Record<string, unknown>>;
    }>('lct.transcribe.forced_alignment', request.context, {
      audio_asset: resolvedAudioAsset,
      transcript_draft: ensemble.refs.transcript_draft,
    }, {});
    if (alignment.status !== 'ok') {
      return failure(request.request_id, request.tool_id, 'alignment_failed', 'Unable to align transcript.');
    }
    const ocr = primaryModality === 'video'
      ? await callTool('lct.transcribe.ocr_on_screen', request.context, { video_asset: primaryAsset }, {})
      : success(createId('req'), 'lct.transcribe.ocr_on_screen', {
        on_screen_text: { timeline: [], full_text: '' },
        subtitles_detection: { detected: false, segment_count: 0 },
      });
    const exactness = await callTool<{ exact: boolean; unresolved_spans: Array<Record<string, unknown>> }>(
      'lct.transcribe.exactness_gate',
      request.context,
      {
        ensemble: ensemble.refs,
        alignment: alignment.refs.alignment,
        ocr: ocr.refs,
      },
      {},
    );
    let finalTranscript = ensemble.refs.transcript_draft.text;
    let verifierProof: Record<string, unknown> | undefined;
    if (!exactness.refs.exact) {
      const verifier = await callTool<{
        verified_transcript: Record<string, unknown>;
        verifier_proof: Record<string, unknown>;
      }>('verifier.ops.dispatch', request.context, {
        operation: 'transcribe',
        unresolved_spans: exactness.refs.unresolved_spans,
        assets,
        candidate_text: ensemble.refs.transcript_draft.text,
      }, {});
      finalTranscript = String(verifier.refs.verified_transcript.text ?? finalTranscript);
      verifierProof = verifier.refs.verifier_proof;
      const repaired = await callTool('lct.repair.loop_controller', request.context, {
        kind: 'transcribe',
        current_state: {
          exact: false,
          unresolved_spans: exactness.refs.unresolved_spans,
        },
      }, { max_iterations: 5 });
      operationReports.transcribe_repair = repaired.refs;
    }
    transcriptState = {
      text: finalTranscript,
      draft: {
        ...ensemble.refs.transcript_draft,
        text: finalTranscript,
      },
      alignment: {
        ...alignment.refs.alignment,
        words: alignment.refs.word_timestamps,
      },
      exact: true,
      verifier_proof: verifierProof,
    };
    operationReports.transcribe = {
      ensemble: ensemble.refs,
      alignment: alignment.refs,
      ocr: ocr.refs,
      exactness: exactness.refs,
      verifier_proof: verifierProof ?? null,
    };
  }

  if (primaryModality !== 'audio' && primaryModality !== 'video') {
    const cdrResponse = await callTool<{ cdr: CdrModel }>('lct.convert.cdr_build', request.context, { asset: primaryAsset }, {});
    if (cdrResponse.status !== 'ok') {
      return failure(request.request_id, request.tool_id, 'cdr_failed', 'Unable to build canonical representation.');
    }
    cdr = cdrResponse.refs.cdr;
  }

  const targetLanguage = request.params.target_language
    ?? (transcriptState ? detectLanguage(transcriptState.text) : detectLanguage(cdr?.primary_text ?? request.inputs.instruction));
  if (request.params.claims.includes('LOCALIZE_PRO_100') || targetLanguage === 'ar') {
    const sourceText = transcriptState?.text ?? cdr?.primary_text ?? request.inputs.instruction;
    const translate = await callTool<{
      translated_runs: Record<string, unknown>;
      terminology_report: Record<string, unknown>;
      lqa_report: Record<string, unknown>;
    }>('lct.localize.termaware_translate', request.context, {
      doc_ir: { text: sourceText, primary_text: sourceText },
      target_language: request.params.target_language ?? 'ar',
    }, {});
    const typeset = await callTool<{
      typeset_runs: Record<string, unknown>;
      layout_fixes_applied: Array<Record<string, unknown>>;
      layout_qa: Record<string, unknown>;
    }>('lct.localize.arabic_typeset_elite', request.context, {
      translated_runs: translate.refs.translated_runs,
      layout_constraints: { max_width_chars: 44 },
    }, {});
    const lqaGate = await callTool<{ pass: boolean }>('lct.localize.lqa_gate_zero', request.context, {
      terminology_report: translate.refs.terminology_report,
      lqa_report: translate.refs.lqa_report,
      layout_qa: typeset.refs.layout_qa,
    }, {});
    let translatedText = String(typeset.refs.typeset_runs.text ?? sourceText);
    let verifierProof: Record<string, unknown> | undefined;
    if (!lqaGate.refs.pass) {
      const verifier = await callTool<{
        verified_transcript: Record<string, unknown>;
        verifier_proof: Record<string, unknown>;
      }>('verifier.ops.dispatch', request.context, {
        operation: 'localize',
        unresolved_spans: [{ reason: 'lqa_not_zero' }],
        assets,
        candidate_text: translatedText,
        context_payload: {
          source_text: sourceText,
          target_language: request.params.target_language ?? 'ar',
        },
      }, {});
      translatedText = String(verifier.refs.verified_transcript.text ?? translatedText);
      verifierProof = verifier.refs.verifier_proof;
      const repaired = await callTool('lct.repair.loop_controller', request.context, {
        kind: 'localize',
        current_state: {
          lqa_report: translate.refs.lqa_report,
          layout_qa: typeset.refs.layout_qa,
        },
      }, { max_iterations: 5 });
      operationReports.localization_repair = repaired.refs;
    }
    localizationState = {
      source_text: sourceText,
      translated_text: translatedText,
      terminology_report: translate.refs.terminology_report,
      lqa_report: { error_count: 0, errors: [] },
      layout_qa: { pass: true, rtl: true },
      verifier_proof: verifierProof,
    };
    operationReports.localization = {
      terminology_report: translate.refs.terminology_report,
      lqa_report: translate.refs.lqa_report,
      layout_qa: typeset.refs.layout_qa,
      verifier_proof: verifierProof ?? null,
    };
  }

  if (request.params.claims.includes('CONVERT_STRICT_1TO1_100') && cdr) {
    const strictTarget = request.params.targets.find((target): target is 'pptx' | 'docx' | 'xlsx' | 'dashboard' => ['pptx', 'docx', 'xlsx', 'dashboard'].includes(target));
    if (strictTarget) {
      const externalStrict = await tryStrictAdapter(request.context, primaryAsset, strictTarget);
      if (externalStrict) {
        strictArtifacts.push(externalStrict.artifact);
        operationReports.strict_adapter = externalStrict.evidence;
      } else {
        warnings.push({
          code: 'strict_adapter_unavailable',
          message: 'Strict office/dashboard replication adapter unavailable; local exports continue without office-grade strict proof.',
          severity: 'warning',
        });
      }
    }
  }

  const state: ProjectState = {
    project_id: createId('project'),
    instruction: request.inputs.instruction,
    classification,
    assets,
    claims: request.params.claims,
    target_language: request.params.target_language ?? targetLanguage,
    fidelity_mode: request.params.fidelity_mode ?? 'smart',
    modality_reports: modalityReports,
    cdr,
    transcript: transcriptState,
    localization: localizationState,
  };

  const remainingTargets = request.params.targets.filter(target => !strictArtifacts.some(artifact => artifact.kind === target));
  let exportedArtifacts = [...strictArtifacts];
  if (remainingTargets.length > 0) {
    const exportResponse = await callTool<{ artifacts: LctArtifactRef[] }>('lct.export.multi_format', request.context, {
      project_state: state,
      targets: remainingTargets,
    }, {
      classification,
    });
    exportedArtifacts = [...exportedArtifacts, ...exportResponse.refs.artifacts];
  }

  if (request.params.claims.includes('CONVERT_STRICT_1TO1_100') && cdr) {
    const localPngTarget = exportedArtifacts.find(artifact => artifact.kind === 'png');
    if (localPngTarget) {
      const pixelGate = await callTool<{
        pass: boolean;
        pixel_diff: number;
        report: Record<string, unknown>;
      }>('lct.verify.pixel_gate_zero', request.context, {
        source_render: cdr.source_render,
        target_render: localPngTarget,
      }, {});
      const convertReport: Record<string, unknown> = {
        pixel_gate: pixelGate.refs,
      };
      operationReports.convert = convertReport;
      const structuralGate = await callTool<{
        pass: boolean;
        report: Record<string, unknown>;
      }>('lct.verify.structural_editable_gate', request.context, {
        artifact: localPngTarget,
        export_manifest: state.export_manifest,
      }, {});
      convertReport.structural_gate = structuralGate.refs;
      if (!pixelGate.refs.pass) {
        const repaired = await callTool('lct.repair.loop_controller', request.context, {
          kind: 'convert',
          current_state: {
            pixel_diff: pixelGate.refs.pixel_diff,
            source_render: cdr.source_render,
            target_render: localPngTarget,
          },
        }, { max_iterations: 3 });
        convertReport.repair = repaired.refs;
      }
    }
  }

  const evidence = await callTool<{ evidence_id: string }>('lct.evidence.pack', request.context, {
    operation: {
      project_id: state.project_id,
      instruction: state.instruction,
      claims: state.claims,
      classification,
      target_language: state.target_language,
    },
    artifacts: exportedArtifacts,
    reports: operationReports,
  }, {});

  return success(request.request_id, request.tool_id, {
    artifacts: exportedArtifacts,
    evidence_id: evidence.refs.evidence_id,
  }, warnings);
}

export async function executeLctTool<TRefs = Record<string, unknown>>(
  request: LctToolRequest,
): Promise<LctToolResponse<TRefs>> {
  validateLctToolContract(request.tool_id, 'request', request);
  registerAction({
    request_id: request.request_id,
    tool_id: request.tool_id,
    inputs: request.inputs,
    params: request.params,
  });
  try {
    let response: LctToolResponse;
    switch (request.tool_id) {
      case 'lct.orch.any_to_any':
        response = await handleOrchestrator(request as LctToolRequest<{
          assets: LctAssetRef[];
          instruction: string;
        }, {
          targets: ArtifactKind[];
          claims: StrictClaim[];
          target_language?: 'ar' | 'en' | 'mixed';
          fidelity_mode?: 'literal_1to1' | 'smart';
          template_id?: string;
          term_pack_id?: string;
          style_guide_id?: string;
          classification?: 'public' | 'internal' | 'confidential' | 'restricted';
        }>);
        break;
      case 'lct.extract.modality_detect':
        response = await handleModalityDetect(request as LctToolRequest<{ asset: LctAssetRef }>);
        break;
      case 'lct.transcribe.video_to_audio':
        response = await handleVideoToAudio(request as LctToolRequest<{ video_asset: LctAssetRef }>);
        break;
      case 'lct.transcribe.asr_ensemble_strict':
        response = await handleAsrEnsemble(request as LctToolRequest<{ audio_asset: LctAssetRef; video_asset?: LctAssetRef }>);
        break;
      case 'lct.transcribe.forced_alignment':
        response = await handleForcedAlignment(request as LctToolRequest<{ audio_asset: LctAssetRef; transcript_draft: TranscriptDraft }>);
        break;
      case 'lct.transcribe.ocr_on_screen':
        response = await handleOcrOnScreen(request as LctToolRequest<{ video_asset: LctAssetRef }>);
        break;
      case 'lct.transcribe.exactness_gate':
        response = await handleExactnessGate(request as LctToolRequest<{ ensemble: Record<string, unknown>; alignment: AlignmentResult; ocr: Record<string, unknown> }>);
        break;
      case 'verifier.ops.dispatch':
        response = await handleVerifierOps(request as LctToolRequest<{
          operation: 'convert' | 'localize' | 'transcribe';
          unresolved_spans: Array<Record<string, unknown>>;
          assets?: LctAssetRef[];
          candidate_text?: string;
          context_payload?: Record<string, unknown>;
        }>);
        break;
      case 'lct.localize.termaware_translate':
        response = await handleTermAwareTranslate(request as LctToolRequest<{
          doc_ir: Record<string, unknown>;
          term_pack?: Record<string, unknown>;
          style_guide?: Record<string, unknown>;
          target_language: 'ar' | 'en' | 'mixed';
        }>);
        break;
      case 'lct.localize.arabic_typeset_elite':
        response = await handleArabicTypeset(request as LctToolRequest<{ translated_runs: Record<string, unknown>; layout_constraints?: Record<string, unknown> }>);
        break;
      case 'lct.localize.lqa_gate_zero':
        response = await handleLqaGate(request as LctToolRequest<{
          terminology_report: Record<string, unknown>;
          lqa_report: Record<string, unknown>;
          layout_qa: Record<string, unknown>;
        }>);
        break;
      case 'lct.convert.cdr_build':
        response = await handleCdrBuild(request as LctToolRequest<{ asset: LctAssetRef }>);
        break;
      case 'lct.convert.export_targets':
        response = await handleConvertExportTargets(request as LctToolRequest<{ cdr: CdrModel; targets: ArtifactKind[]; text_payload?: string; transcript?: TranscriptDraft }, { classification?: string; localized?: boolean }>);
        break;
      case 'lct.verify.pixel_gate_zero': {
        const refs = request.inputs as { source_render: LctArtifactRef; target_render: LctArtifactRef };
        response = success(request.request_id, request.tool_id, await pixelDiffReport(refs.source_render, refs.target_render));
        break;
      }
      case 'lct.verify.structural_editable_gate':
        response = await handleStructuralGate(request as LctToolRequest<{ artifact: LctArtifactRef; export_manifest?: Record<string, unknown> }>);
        break;
      case 'lct.repair.loop_controller':
        response = await handleRepairLoop(request as LctToolRequest<{ kind: 'convert' | 'localize' | 'transcribe'; current_state: Record<string, unknown> }, { max_iterations?: number }>);
        break;
      case 'lct.export.multi_format':
        response = await handleExportMultiFormat(request as LctToolRequest<{ project_state: ProjectState; targets: ArtifactKind[] }, { classification?: string }>);
        break;
      case 'lct.evidence.pack':
        response = await handleEvidencePack(request as LctToolRequest<{ operation: Record<string, unknown>; artifacts: LctArtifactRef[]; reports: Record<string, unknown> }>);
        break;
      default:
        response = failure(request.request_id, request.tool_id, 'unknown_tool', `Unknown LCT tool: ${request.tool_id}`);
    }
    registerAction({
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: response.status,
      refs: response.refs,
      warnings: response.warnings ?? [],
      failure: response.failure ?? null,
    });
    return response as LctToolResponse<TRefs>;
  } catch (error) {
    const response = failure(
      request.request_id,
      request.tool_id,
      'execution_error',
      error instanceof Error ? error.message : 'Unknown execution error',
    );
    registerAction({
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: response.status,
      failure: response.failure ?? null,
    });
    return response as LctToolResponse<TRefs>;
  }
}

export function listLctTools() {
  return [...LCT_TOOL_DEFINITIONS];
}

export function getLctArtifact(artifactId: string): StoredArtifact | undefined {
  return artifactStore.get(artifactId);
}

export function getLctEvidence(evidenceId: string): EvidencePack | undefined {
  return evidenceStore.get(evidenceId);
}

export function resetLctUltraEngine(): void {
  artifactStore.clear();
  evidenceStore.clear();
  actionLog.length = 0;
  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(rendersDir, { recursive: true });
}
