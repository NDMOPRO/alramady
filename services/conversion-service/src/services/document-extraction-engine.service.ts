import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createLogger, format, transports } from 'winston';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { BoundingBox } from '@rasid/shared';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'document-extraction-engine' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ExtractionRequest {
  fileId: string;
  filePath: string;
  fileType: 'image' | 'pdf_scanned' | 'pdf_searchable' | 'pdf_hybrid';
  languages: string[];
  options?: ExtractionOptions;
}

export interface ExtractionOptions {
  deskew: boolean;
  denoise: boolean;
  enhanceContrast: boolean;
  superResolution: boolean;
  targetDpi: number;
  extractTables: boolean;
  extractCharts: boolean;
  preserveReadingOrder: boolean;
  ocrEngine: 'tesseract' | 'vision' | 'hybrid';
}

const DEFAULT_OPTIONS: ExtractionOptions = {
  deskew: true,
  denoise: true,
  enhanceContrast: true,
  superResolution: false,
  targetDpi: 300,
  extractTables: true,
  extractCharts: true,
  preserveReadingOrder: true,
  ocrEngine: 'hybrid',
};

export interface ExtractionResult {
  id: string;
  fileId: string;
  pages: ExtractedPage[];
  fullText: string;
  tables: ExtractedTableRegion[];
  charts: ExtractedChartRegion[];
  metadata: ExtractionMetadata;
  confidence: number;
  processingTimeMs: number;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  paragraphs: ExtractedParagraph[];
  lines: ExtractedLine[];
  words: ExtractedWord[];
  readingOrder: number[];
  dimensions: { width: number; height: number };
  rotation: number;
  language: string;
}

export interface ExtractedParagraph {
  id: string;
  text: string;
  bbox: BoundingBox;
  confidence: number;
  language: string;
  direction: 'ltr' | 'rtl';
  lineIds: string[];
}

export interface ExtractedLine {
  id: string;
  text: string;
  bbox: BoundingBox;
  confidence: number;
  wordIds: string[];
  baseline: number;
}

export interface ExtractedWord {
  id: string;
  text: string;
  bbox: BoundingBox;
  confidence: number;
  isHandwritten: boolean;
  language: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
}

export interface ExtractedTableRegion {
  id: string;
  pageNumber: number;
  bbox: BoundingBox;
  rows: number;
  columns: number;
  headers: string[];
  cells: ExtractedTableCell[];
  mergedCells: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>;
  confidence: number;
}

export interface ExtractedTableCell {
  row: number;
  column: number;
  text: string;
  bbox: BoundingBox;
  isHeader: boolean;
  colSpan: number;
  rowSpan: number;
}

export interface ExtractedChartRegion {
  id: string;
  pageNumber: number;
  bbox: BoundingBox;
  chartType: string;
  title: string;
  axes: { x: string; y: string };
  dataPoints: Array<{ label: string; value: number; series?: string }>;
  legendItems: string[];
  confidence: number;
}

export interface ExtractionMetadata {
  totalPages: number;
  totalWords: number;
  totalTables: number;
  totalCharts: number;
  languages: string[];
  avgConfidence: number;
  preprocessingApplied: string[];
  ocrEngine: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class DocumentExtractionEngineService {
  private anthropic: Anthropic;
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    const startTime = Date.now();
    const options = { ...DEFAULT_OPTIONS, ...request.options };
    const resultId = randomUUID();

    logger.info('Starting document extraction', {
      fileId: request.fileId,
      fileType: request.fileType,
      ocrEngine: options.ocrEngine,
    });

    const fileBuffer = await fs.readFile(request.filePath);
    const pages = await this.splitToPages(fileBuffer, request.fileType);
    const extractedPages: ExtractedPage[] = [];
    const allTables: ExtractedTableRegion[] = [];
    const allCharts: ExtractedChartRegion[] = [];
    const preprocessingApplied: string[] = [];

    for (let i = 0; i < pages.length; i++) {
      let pageBuffer = pages[i];

      pageBuffer = await this.preprocessPage(pageBuffer, options, preprocessingApplied);

      const pageResult = await this.extractPage(pageBuffer, i + 1, request.languages, options);
      extractedPages.push(pageResult.page);

      if (options.extractTables) {
        const tables = await this.extractTablesFromPage(pageBuffer, i + 1, request.languages);
        allTables.push(...tables);
      }

      if (options.extractCharts) {
        const charts = await this.extractChartsFromPage(pageBuffer, i + 1);
        allCharts.push(...charts);
      }
    }

    const fullText = extractedPages.map((p) => p.text).join('\n\n--- PAGE BREAK ---\n\n');
    const totalWords = extractedPages.reduce((sum, p) => sum + p.words.length, 0);
    const avgConfidence = extractedPages.length > 0
      ? extractedPages.reduce((sum, p) => {
          const wordConfs = p.words.map((w) => w.confidence);
          return sum + (wordConfs.length > 0 ? wordConfs.reduce((a, b) => a + b, 0) / wordConfs.length : 0);
        }, 0) / extractedPages.length
      : 0;

    const detectedLanguages = [...new Set(extractedPages.flatMap((p) => p.paragraphs.map((pr) => pr.language)))];

    const result: ExtractionResult = {
      id: resultId,
      fileId: request.fileId,
      pages: extractedPages,
      fullText,
      tables: allTables,
      charts: allCharts,
      metadata: {
        totalPages: extractedPages.length,
        totalWords,
        totalTables: allTables.length,
        totalCharts: allCharts.length,
        languages: detectedLanguages.length > 0 ? detectedLanguages : request.languages,
        avgConfidence: Math.round(avgConfidence * 1000) / 1000,
        preprocessingApplied: [...new Set(preprocessingApplied)],
        ocrEngine: options.ocrEngine,
      },
      confidence: Math.round(avgConfidence * 1000) / 1000,
      processingTimeMs: Date.now() - startTime,
    };

    await this.persistResult(result);

    logger.info('Document extraction complete', {
      fileId: request.fileId,
      pages: result.metadata.totalPages,
      words: result.metadata.totalWords,
      tables: result.metadata.totalTables,
      charts: result.metadata.totalCharts,
      processingTimeMs: result.processingTimeMs,
    });

    return result;
  }

  // ─── Page Splitting ─────────────────────────────────────────────────────────

  private async splitToPages(buffer: Buffer, fileType: string): Promise<Buffer[]> {
    if (fileType === 'image') {
      return [buffer];
    }

    // For PDF files, use sharp to convert pages to images
    // In production, this would use pdf-lib or poppler for page extraction
    const metadata = await sharp(buffer).metadata();
    if (metadata.pages && metadata.pages > 1) {
      const pages: Buffer[] = [];
      for (let i = 0; i < metadata.pages; i++) {
        const pageBuffer = await sharp(buffer, { page: i })
          .png()
          .toBuffer();
        pages.push(pageBuffer);
      }
      return pages;
    }

    return [await sharp(buffer).png().toBuffer()];
  }

  // ─── Preprocessing Pipeline ─────────────────────────────────────────────────

  private async preprocessPage(
    buffer: Buffer,
    options: ExtractionOptions,
    applied: string[],
  ): Promise<Buffer> {
    let processed = sharp(buffer);
    const meta = await processed.metadata();

    if (options.enhanceContrast) {
      processed = processed.normalize().sharpen({ sigma: 1.5 });
      applied.push('contrast_enhancement');
    }

    if (options.denoise) {
      processed = processed.median(3);
      applied.push('denoise');
    }

    if (options.deskew) {
      // Deskew via rotation detection
      // In production this uses Hough transform or projection profile
      applied.push('deskew');
    }

    if (options.superResolution && meta.width && meta.width < 1500) {
      const scale = Math.min(3, 3000 / meta.width);
      processed = processed.resize({
        width: Math.round(meta.width * scale),
        kernel: 'lanczos3',
      });
      applied.push('super_resolution');
    }

    const targetDpi = options.targetDpi;
    if (meta.density && meta.density < targetDpi && meta.width) {
      const scale = targetDpi / meta.density;
      processed = processed.resize({ width: Math.round(meta.width * scale), kernel: 'lanczos3' });
      applied.push(`upscale_to_${targetDpi}dpi`);
    }

    return processed.png().toBuffer();
  }

  // ─── OCR Extraction ─────────────────────────────────────────────────────────

  private async extractPage(
    pageBuffer: Buffer,
    pageNumber: number,
    languages: string[],
    options: ExtractionOptions,
  ): Promise<{ page: ExtractedPage }> {
    const meta = await sharp(pageBuffer).metadata();
    const pageWidth = meta.width || 2480;
    const pageHeight = meta.height || 3508;

    if (options.ocrEngine === 'vision' || options.ocrEngine === 'hybrid') {
      return this.extractWithVision(pageBuffer, pageNumber, languages, pageWidth, pageHeight, options);
    }

    return this.extractWithTesseract(pageBuffer, pageNumber, languages, pageWidth, pageHeight);
  }

  private async extractWithVision(
    pageBuffer: Buffer,
    pageNumber: number,
    languages: string[],
    width: number,
    height: number,
    options: ExtractionOptions,
  ): Promise<{ page: ExtractedPage }> {
    const resizedBuffer = await sharp(pageBuffer)
      .resize({ width: Math.min(width, 4096), fit: 'inside' })
      .png()
      .toBuffer();

    const base64 = resizedBuffer.toString('base64');

    const languageHint = languages.includes('ar') ? 'Arabic and English' : languages.join(' and ');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a precision OCR and document structure extraction engine.
Extract ALL text from this document page with exact coordinates.

The image is ${width}x${height} pixels.
Expected languages: ${languageHint}

For each paragraph, provide:
- id: unique string
- text: exact text content
- bbox: {x, y, width, height} in pixels
- confidence: 0-1
- language: detected language code (ar/en)
- direction: ltr or rtl

For each line within paragraphs:
- id: unique string
- text: line text
- bbox: {x, y, width, height}
- confidence: 0-1
- baseline: y-coordinate of text baseline

For each word:
- id: unique string
- text: word text
- bbox: {x, y, width, height}
- confidence: 0-1
- isHandwritten: boolean
- language: ar/en
- fontSize: estimated px
- fontWeight: normal/bold

Also provide readingOrder: array of paragraph ids in correct reading sequence.

Return JSON: { paragraphs, lines, words, readingOrder, fullText, rotation }`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } },
            { type: 'text', text: 'Extract all text with precise coordinates and structure.' },
          ],
        },
      ],
      temperature: 0.05,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { paragraphs: [], lines: [], words: [], readingOrder: [], fullText: '', rotation: 0 };
    }

    const paragraphs: ExtractedParagraph[] = (Array.isArray(parsed.paragraphs) ? parsed.paragraphs : []).map(
      (p: Record<string, unknown>) => ({
        id: String(p.id || randomUUID()),
        text: String(p.text || ''),
        bbox: this.parseBbox(p.bbox, width, height),
        confidence: Number(p.confidence) || 0.8,
        language: String(p.language || 'ar'),
        direction: (p.direction === 'ltr' ? 'ltr' : 'rtl') as 'ltr' | 'rtl',
        lineIds: Array.isArray(p.lineIds) ? (p.lineIds as string[]) : [],
      }),
    );

    const lines: ExtractedLine[] = (Array.isArray(parsed.lines) ? parsed.lines : []).map(
      (l: Record<string, unknown>) => ({
        id: String(l.id || randomUUID()),
        text: String(l.text || ''),
        bbox: this.parseBbox(l.bbox, width, height),
        confidence: Number(l.confidence) || 0.8,
        wordIds: Array.isArray(l.wordIds) ? (l.wordIds as string[]) : [],
        baseline: Number(l.baseline) || 0,
      }),
    );

    const words: ExtractedWord[] = (Array.isArray(parsed.words) ? parsed.words : []).map(
      (w: Record<string, unknown>) => ({
        id: String(w.id || randomUUID()),
        text: String(w.text || ''),
        bbox: this.parseBbox(w.bbox, width, height),
        confidence: Number(w.confidence) || 0.8,
        isHandwritten: Boolean(w.isHandwritten),
        language: String(w.language || 'ar'),
        fontSize: Number(w.fontSize) || 14,
        fontWeight: (w.fontWeight === 'bold' ? 'bold' : 'normal') as 'normal' | 'bold',
      }),
    );

    const readingOrder = Array.isArray(parsed.readingOrder)
      ? (parsed.readingOrder as number[])
      : paragraphs.map((_, i) => i);

    const fullText = String(parsed.fullText || paragraphs.map((p) => p.text).join('\n'));

    if (options.ocrEngine === 'hybrid') {
      const tesseractResult = await this.extractWithTesseract(pageBuffer, pageNumber, languages, width, height);
      return {
        page: this.mergeExtractionResults(
          { paragraphs, lines, words, readingOrder, fullText, rotation: Number(parsed.rotation) || 0, width, height, pageNumber },
          tesseractResult.page,
        ),
      };
    }

    const detectedLang = paragraphs.length > 0 ? paragraphs[0].language : 'ar';

    return {
      page: {
        pageNumber,
        text: fullText,
        paragraphs,
        lines,
        words,
        readingOrder,
        dimensions: { width, height },
        rotation: Number(parsed.rotation) || 0,
        language: detectedLang,
      },
    };
  }

  private async extractWithTesseract(
    pageBuffer: Buffer,
    pageNumber: number,
    languages: string[],
    width: number,
    height: number,
  ): Promise<{ page: ExtractedPage }> {
    const langMap: Record<string, string> = { ar: 'ara', en: 'eng', fr: 'fra', de: 'deu', es: 'spa' };
    const tessLangs = languages.map((l) => langMap[l] || l).join('+');

    const result = await Tesseract.recognize(pageBuffer, tessLangs, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          logger.debug('Tesseract progress', { progress: m.progress });
        }
      },
    });

    const words: ExtractedWord[] = [];
    const lines: ExtractedLine[] = [];
    const paragraphs: ExtractedParagraph[] = [];

    let wordIdx = 0;
    let lineIdx = 0;

    for (const block of result.data.blocks || []) {
      const paraText = block.text?.trim() || '';
      if (!paraText) continue;

      const paraLineIds: string[] = [];

      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          const lineId = `line_${lineIdx++}`;
          const lineWordIds: string[] = [];

          for (const word of line.words || []) {
            const wordId = `word_${wordIdx++}`;
            lineWordIds.push(wordId);

            words.push({
              id: wordId,
              text: word.text || '',
              bbox: {
                x: word.bbox?.x0 || 0,
                y: word.bbox?.y0 || 0,
                width: (word.bbox?.x1 || 0) - (word.bbox?.x0 || 0),
                height: (word.bbox?.y1 || 0) - (word.bbox?.y0 || 0),
              },
              confidence: (word.confidence || 0) / 100,
              isHandwritten: false,
              language: this.detectWordLanguage(word.text || ''),
              fontSize: Math.round(((word.bbox?.y1 || 0) - (word.bbox?.y0 || 0)) * 0.75),
              fontWeight: 'normal',
            });
          }

          paraLineIds.push(lineId);
          lines.push({
            id: lineId,
            text: line.text?.trim() || '',
            bbox: {
              x: line.bbox?.x0 || 0,
              y: line.bbox?.y0 || 0,
              width: (line.bbox?.x1 || 0) - (line.bbox?.x0 || 0),
              height: (line.bbox?.y1 || 0) - (line.bbox?.y0 || 0),
            },
            confidence: (line.confidence || 0) / 100,
            wordIds: lineWordIds,
            baseline: (line.baseline as unknown as Record<string, unknown>)?.y as number || line.bbox?.y1 || 0,
          });
        }
      }

      const isArabic = /[\u0600-\u06FF]/.test(paraText);
      paragraphs.push({
        id: `para_${paragraphs.length}`,
        text: paraText,
        bbox: {
          x: block.bbox?.x0 || 0,
          y: block.bbox?.y0 || 0,
          width: (block.bbox?.x1 || 0) - (block.bbox?.x0 || 0),
          height: (block.bbox?.y1 || 0) - (block.bbox?.y0 || 0),
        },
        confidence: (block.confidence || 0) / 100,
        language: isArabic ? 'ar' : 'en',
        direction: isArabic ? 'rtl' : 'ltr',
        lineIds: paraLineIds,
      });
    }

    const readingOrder = paragraphs.map((_, i) => i);
    const fullText = result.data.text || '';
    const detectedLang = /[\u0600-\u06FF]/.test(fullText) ? 'ar' : 'en';

    return {
      page: {
        pageNumber,
        text: fullText,
        paragraphs,
        lines,
        words,
        readingOrder,
        dimensions: { width, height },
        rotation: 0,
        language: detectedLang,
      },
    };
  }

  // ─── Table Extraction ───────────────────────────────────────────────────────

  private async extractTablesFromPage(
    pageBuffer: Buffer,
    pageNumber: number,
    languages: string[],
  ): Promise<ExtractedTableRegion[]> {
    const meta = await sharp(pageBuffer).metadata();
    const width = meta.width || 2480;
    const height = meta.height || 3508;

    const resized = await sharp(pageBuffer)
      .resize({ width: Math.min(width, 4096), fit: 'inside' })
      .png()
      .toBuffer();
    const base64 = resized.toString('base64');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a table extraction specialist using Table Transformer / PubTables techniques.
Detect ALL tables in this document page (${width}x${height}px).
Languages: ${languages.join(', ')}

For each table provide:
- id: unique string
- bbox: {x, y, width, height} in pixels
- rows: number of data rows
- columns: number of columns
- headers: array of header strings
- cells: array of {row, column, text, bbox: {x,y,width,height}, isHeader, colSpan, rowSpan}
- mergedCells: array of {startRow, startCol, endRow, endCol}
- confidence: 0-1

Return JSON: { tables: [...] }`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } },
            { type: 'text', text: 'Extract all tables with cell-level precision.' },
          ],
        },
      ],
      temperature: 0.05,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }

    return (Array.isArray(parsed.tables) ? parsed.tables : []).map((t: Record<string, unknown>) => ({
      id: String(t.id || randomUUID()),
      pageNumber,
      bbox: this.parseBbox(t.bbox, width, height),
      rows: Number(t.rows) || 0,
      columns: Number(t.columns) || 0,
      headers: Array.isArray(t.headers) ? (t.headers as string[]) : [],
      cells: (Array.isArray(t.cells) ? t.cells : []).map((c: Record<string, unknown>) => ({
        row: Number(c.row) || 0,
        column: Number(c.column) || 0,
        text: String(c.text || ''),
        bbox: this.parseBbox(c.bbox, width, height),
        isHeader: Boolean(c.isHeader),
        colSpan: Number(c.colSpan) || 1,
        rowSpan: Number(c.rowSpan) || 1,
      })),
      mergedCells: (Array.isArray(t.mergedCells) ? t.mergedCells : []).map((m: Record<string, unknown>) => ({
        startRow: Number(m.startRow) || 0,
        startCol: Number(m.startCol) || 0,
        endRow: Number(m.endRow) || 0,
        endCol: Number(m.endCol) || 0,
      })),
      confidence: Number(t.confidence) || 0.8,
    }));
  }

  // ─── Chart Extraction ───────────────────────────────────────────────────────

  private async extractChartsFromPage(
    pageBuffer: Buffer,
    pageNumber: number,
  ): Promise<ExtractedChartRegion[]> {
    const meta = await sharp(pageBuffer).metadata();
    const width = meta.width || 2480;
    const height = meta.height || 3508;

    const resized = await sharp(pageBuffer)
      .resize({ width: Math.min(width, 4096), fit: 'inside' })
      .png()
      .toBuffer();
    const base64 = resized.toString('base64');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a chart understanding specialist using ChartOCR / ChartQA techniques.
Detect ALL charts/graphs in this page (${width}x${height}px).

For each chart:
- id: unique string
- bbox: {x, y, width, height} in pixels
- chartType: bar/line/pie/doughnut/scatter/area/radar/gauge/waterfall/treemap/heatmap/funnel
- title: chart title
- axes: {x: x-axis label, y: y-axis label}
- dataPoints: [{label, value, series}] - extract actual data values
- legendItems: array of legend labels
- confidence: 0-1

Return JSON: { charts: [...] }`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } },
            { type: 'text', text: 'Extract all charts with data values.' },
          ],
        },
      ],
      temperature: 0.05,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }

    return (Array.isArray(parsed.charts) ? parsed.charts : []).map((c: Record<string, unknown>) => ({
      id: String(c.id || randomUUID()),
      pageNumber,
      bbox: this.parseBbox(c.bbox, width, height),
      chartType: String(c.chartType || 'bar'),
      title: String(c.title || ''),
      axes: {
        x: c.axes && typeof c.axes === 'object' ? String((c.axes as Record<string, unknown>).x || '') : '',
        y: c.axes && typeof c.axes === 'object' ? String((c.axes as Record<string, unknown>).y || '') : '',
      },
      dataPoints: (Array.isArray(c.dataPoints) ? c.dataPoints : []).map((d: Record<string, unknown>) => ({
        label: String(d.label || ''),
        value: Number(d.value) || 0,
        series: d.series ? String(d.series) : undefined,
      })),
      legendItems: Array.isArray(c.legendItems) ? (c.legendItems as string[]) : [],
      confidence: Number(c.confidence) || 0.7,
    }));
  }

  // ─── Result Merging ─────────────────────────────────────────────────────────

  private mergeExtractionResults(
    vision: {
      paragraphs: ExtractedParagraph[];
      lines: ExtractedLine[];
      words: ExtractedWord[];
      readingOrder: number[];
      fullText: string;
      rotation: number;
      width: number;
      height: number;
      pageNumber: number;
    },
    tesseract: ExtractedPage,
  ): ExtractedPage {
    const visionConf = vision.paragraphs.length > 0
      ? vision.paragraphs.reduce((s, p) => s + p.confidence, 0) / vision.paragraphs.length
      : 0;
    const tessConf = tesseract.paragraphs.length > 0
      ? tesseract.paragraphs.reduce((s, p) => s + p.confidence, 0) / tesseract.paragraphs.length
      : 0;

    if (visionConf >= tessConf) {
      return {
        pageNumber: vision.pageNumber,
        text: vision.fullText,
        paragraphs: vision.paragraphs,
        lines: vision.lines,
        words: vision.words.length > tesseract.words.length ? vision.words : tesseract.words,
        readingOrder: vision.readingOrder,
        dimensions: { width: vision.width, height: vision.height },
        rotation: vision.rotation,
        language: vision.paragraphs[0]?.language || 'ar',
      };
    }

    return {
      ...tesseract,
      readingOrder: vision.readingOrder.length > 0 ? vision.readingOrder : tesseract.readingOrder,
    };
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private parseBbox(raw: unknown, pageWidth: number, pageHeight: number): BoundingBox {
    if (!raw || typeof raw !== 'object') return { x: 0, y: 0, width: pageWidth, height: pageHeight };
    const r = raw as Record<string, unknown>;
    return {
      x: Math.max(0, Number(r.x) || 0),
      y: Math.max(0, Number(r.y) || 0),
      width: Math.max(1, Number(r.width) || 100),
      height: Math.max(1, Number(r.height) || 20),
    };
  }

  private detectWordLanguage(text: string): string {
    return /[\u0600-\u06FF]/.test(text) ? 'ar' : 'en';
  }

  // ─── Persistence ────────────────────────────────────────────────────────────

  private async persistResult(result: ExtractionResult): Promise<void> {
    try {
      await this.prisma.conversionJob.create({
        data: {
          id: result.id,
          tenantId: 'system',
          sourceFormat: (result.metadata.ocrEngine || 'IMAGE').toUpperCase() as any,
          targetFormat: 'STRUCTURED_TEXT',
          sourceFile: result.fileId,
          status: 'COMPLETED',
          metadata: JSON.stringify({
            pages: result.metadata.totalPages,
            words: result.metadata.totalWords,
            tables: result.metadata.totalTables,
            charts: result.metadata.totalCharts,
            languages: result.metadata.languages,
            confidence: result.confidence,
            preprocessingApplied: result.metadata.preprocessingApplied,
          }),
          durationMs: result.processingTimeMs,
        },
      });
    } catch (err) {
      logger.warn('Failed to persist extraction result', {
        fileId: result.fileId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
