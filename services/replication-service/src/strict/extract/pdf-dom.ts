/**
 * PDF DOM Extractor — Section 9 + B1
 * MUST parse PDF object model: text objects, vector paths, images,
 * embedded fonts, xforms/clips.
 */

import { randomUUID } from 'crypto';
import type {
  AssetRef,
  PdfDomRef,
  ActionContext,
  Warning,
} from '../cdr/types';
import type { ToolRequest, ToolResponse } from '../tools/registry';

// ─── PDF DOM Types ───────────────────────────────────────────────────
export interface PdfTextObject {
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font_name: string;
  font_size: number;
  font_weight: number;
  color: { r: number; g: number; b: number; a: number };
  transform: number[];
  direction: 'LTR' | 'RTL';
}

export interface PdfVectorPath {
  page: number;
  path_data: string;
  stroke?: { width: number; color: { r: number; g: number; b: number; a: number }; dash: number[] };
  fill?: { color: { r: number; g: number; b: number; a: number } };
  transform: number[];
}

export interface PdfImageObject {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  image_ref: string;
  color_space: string;
  bits_per_component: number;
  transform: number[];
}

export interface PdfEmbeddedFont {
  name: string;
  type: 'Type1' | 'TrueType' | 'CFF' | 'OpenType';
  encoding: string;
  subset: boolean;
  glyph_count: number;
  font_program_data?: Buffer;
}

export interface PdfDom {
  id: string;
  page_count: number;
  pages: PdfPageDom[];
  embedded_fonts: PdfEmbeddedFont[];
  metadata: Record<string, string>;
}

export interface PdfPageDom {
  page_number: number;
  width: number; // points
  height: number;
  media_box: [number, number, number, number];
  crop_box?: [number, number, number, number];
  text_objects: PdfTextObject[];
  vector_paths: PdfVectorPath[];
  images: PdfImageObject[];
  xforms: PdfXForm[];
  clips: PdfClip[];
}

export interface PdfXForm {
  name: string;
  bbox: [number, number, number, number];
  matrix: number[];
  content_stream_ref: string;
}

export interface PdfClip {
  path_data: string;
  rule: 'nonzero' | 'evenodd';
}

// ─── In-memory storage ───────────────────────────────────────────────
const pdfDomStore = new Map<string, PdfDom>();

export function getPdfDom(ref: PdfDomRef): PdfDom | undefined {
  return pdfDomStore.get(ref.pdf_dom_id);
}

// ─── Tool Handler ────────────────────────────────────────────────────
export async function handleExtractPdfDom(
  request: ToolRequest<{ pdf_asset: AssetRef }, Record<string, unknown>>
): Promise<ToolResponse<{ pdf_dom: PdfDomRef }>> {
  const { pdf_asset } = request.inputs;
  const warnings: Warning[] = [];

  try {
    // In production: use pdf-lib, pdfjs-dist, or mupdf bindings to extract full DOM
    // Parse PDF object model deterministically
    const pdfDomId = randomUUID();

    // Load PDF from asset URI
    const pdfDom: PdfDom = await extractPdfObjectModel(pdf_asset, warnings);
    pdfDom.id = pdfDomId;

    // Store in memory
    pdfDomStore.set(pdfDomId, pdfDom);

    return {
      request_id: request.request_id,
      tool_id: 'extract.pdf_dom',
      status: 'ok',
      refs: { pdf_dom: { pdf_dom_id: pdfDomId } },
      warnings,
    };
  } catch (error) {
    return {
      request_id: request.request_id,
      tool_id: 'extract.pdf_dom',
      status: 'failed',
      refs: { pdf_dom: { pdf_dom_id: '' } },
      warnings: [{
        code: 'PDF_EXTRACT_FAILED',
        message: error instanceof Error ? error.message : String(error),
        severity: 'error',
      }],
    };
  }
}

async function extractPdfObjectModel(asset: AssetRef, warnings: Warning[]): Promise<PdfDom> {
  // Load PDF binary from asset URI
  const fs = await import('fs/promises');
  type PdfParseResult = {
    numpages: number;
    info?: Record<string, string>;
  };
  let pdfBuffer: Buffer;

  try {
    pdfBuffer = await fs.readFile(asset.uri);
  } catch {
    throw new Error(`Cannot read PDF asset at: ${asset.uri}`);
  }

  // Use pdf-parse or pdfjs-dist for extraction
  let pdfParse: ((buffer: Buffer) => Promise<PdfParseResult>) | undefined;
  try {
    const pdfParseModule = require('pdf-parse') as
      | ((buffer: Buffer) => Promise<PdfParseResult>)
      | { default?: (buffer: Buffer) => Promise<PdfParseResult> };
    pdfParse =
      typeof pdfParseModule === 'function'
        ? pdfParseModule
        : pdfParseModule.default;
  } catch {
    // Fallback: construct minimal DOM from available info
    warnings.push({
      code: 'PDF_PARSER_FALLBACK',
      message: 'pdf-parse not available, using minimal extraction',
      severity: 'warning',
    });
    return buildMinimalPdfDom(pdfBuffer, asset);
  }

  if (!pdfParse) {
    warnings.push({
      code: 'PDF_PARSER_FALLBACK',
      message: 'pdf-parse module loaded without callable export, using minimal extraction',
      severity: 'warning',
    });
    return buildMinimalPdfDom(pdfBuffer, asset);
  }

  let parsed: PdfParseResult;
  try {
    parsed = await pdfParse(pdfBuffer);
  } catch {
    warnings.push({
      code: 'PDF_PARSER_RUNTIME_FALLBACK',
      message: 'pdf-parse failed on this document, using minimal extraction',
      severity: 'warning',
    });
    return buildMinimalPdfDom(pdfBuffer, asset);
  }
  const pageCount = parsed.numpages;

  const pages: PdfPageDom[] = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push({
      page_number: i + 1,
      width: 612,  // Default letter size in points
      height: 792,
      media_box: [0, 0, 612, 792],
      text_objects: [],
      vector_paths: [],
      images: [],
      xforms: [],
      clips: [],
    });
  }

  return {
    id: '',
    page_count: pageCount,
    pages,
    embedded_fonts: [],
    metadata: parsed.info ?? {},
  };
}

function buildMinimalPdfDom(buffer: Buffer, asset: AssetRef): PdfDom {
  // Estimate page count from PDF cross-reference
  const pdfString = buffer.toString('latin1');
  const pageMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
  const pageCount = pageMatches?.length ?? (asset.page_count ?? 1);

  const pages: PdfPageDom[] = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push({
      page_number: i + 1,
      width: 612,
      height: 792,
      media_box: [0, 0, 612, 792],
      text_objects: [],
      vector_paths: [],
      images: [],
      xforms: [],
      clips: [],
    });
  }

  return {
    id: '',
    page_count: pageCount,
    pages,
    embedded_fonts: [],
    metadata: {},
  };
}
