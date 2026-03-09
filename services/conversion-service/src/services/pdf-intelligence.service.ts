import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import OpenAI from 'openai';
import { createLogger, format, transports } from 'winston';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import type { BoundingBox } from '@rasid/shared';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'pdf-intelligence' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface PdfAnalysisRequest {
  fileId: string;
  filePath: string;
  options?: PdfAnalysisOptions;
}

export interface PdfAnalysisOptions {
  extractTextLayers: boolean;
  extractEmbeddedFonts: boolean;
  extractVectorGraphics: boolean;
  extractImages: boolean;
  detectPdfType: boolean;
  maxPages: number;
}

const DEFAULT_OPTIONS: PdfAnalysisOptions = {
  extractTextLayers: true,
  extractEmbeddedFonts: true,
  extractVectorGraphics: true,
  extractImages: true,
  detectPdfType: true,
  maxPages: 100,
};

export type PdfType = 'scanned' | 'searchable' | 'hybrid';

export interface PdfAnalysisResult {
  id: string;
  fileId: string;
  pdfType: PdfType;
  pageCount: number;
  pages: PdfPageAnalysis[];
  embeddedFonts: EmbeddedFont[];
  vectorGraphics: VectorGraphic[];
  embeddedImages: EmbeddedImage[];
  metadata: PdfMetadata;
  processingTimeMs: number;
}

export interface PdfPageAnalysis {
  pageNumber: number;
  dimensions: { width: number; height: number };
  hasTextLayer: boolean;
  hasImages: boolean;
  hasVectorContent: boolean;
  textLayerContent: string;
  textLayerWordCount: number;
  imageRegions: BoundingBox[];
  vectorRegions: BoundingBox[];
  rotation: number;
}

export interface EmbeddedFont {
  name: string;
  type: 'TrueType' | 'OpenType' | 'Type1' | 'CIDFont';
  isEmbedded: boolean;
  isSubset: boolean;
  encoding: string;
  glyphCount: number;
  usedOnPages: number[];
  supportsArabic: boolean;
}

export interface VectorGraphic {
  id: string;
  pageNumber: number;
  bbox: BoundingBox;
  type: 'path' | 'line' | 'rectangle' | 'circle' | 'curve' | 'compound';
  pathData: string;
  fillColor: string | null;
  strokeColor: string | null;
  strokeWidth: number;
}

export interface EmbeddedImage {
  id: string;
  pageNumber: number;
  bbox: BoundingBox;
  format: 'jpeg' | 'png' | 'tiff' | 'jbig2' | 'ccitt';
  width: number;
  height: number;
  bitsPerComponent: number;
  colorSpace: string;
  compressionRatio: number;
}

export interface PdfMetadata {
  title: string | null;
  author: string | null;
  subject: string | null;
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  modificationDate: string | null;
  pdfVersion: string;
  isEncrypted: boolean;
  isLinearized: boolean;
  fileSize: number;
  languages: string[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class PdfIntelligenceService {
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }

  async analyzePdf(request: PdfAnalysisRequest): Promise<PdfAnalysisResult> {
    const startTime = Date.now();
    const options = { ...DEFAULT_OPTIONS, ...request.options };
    const resultId = randomUUID();

    logger.info('Starting PDF analysis', { fileId: request.fileId });

    const fileBuffer = await fs.readFile(request.filePath);
    const fileSize = fileBuffer.length;

    const pdfType = options.detectPdfType ? await this.detectPdfType(fileBuffer) : 'searchable';
    const pageCount = await this.getPageCount(fileBuffer);
    const pagesToProcess = Math.min(pageCount, options.maxPages);

    const pages: PdfPageAnalysis[] = [];
    const allFonts: EmbeddedFont[] = [];
    const allVectors: VectorGraphic[] = [];
    const allImages: EmbeddedImage[] = [];

    for (let i = 0; i < pagesToProcess; i++) {
      const pageAnalysis = await this.analyzePageStructure(fileBuffer, i, pdfType);
      pages.push(pageAnalysis);
    }

    if (options.extractEmbeddedFonts) {
      const fonts = await this.extractFontInfo(fileBuffer, pagesToProcess);
      allFonts.push(...fonts);
    }

    if (options.extractVectorGraphics) {
      for (let i = 0; i < Math.min(pagesToProcess, 10); i++) {
        const vectors = await this.extractVectorGraphics(fileBuffer, i);
        allVectors.push(...vectors);
      }
    }

    if (options.extractImages) {
      for (let i = 0; i < pagesToProcess; i++) {
        const images = await this.extractImageInfo(fileBuffer, i);
        allImages.push(...images);
      }
    }

    const pdfMetadata = await this.extractPdfMetadata(fileBuffer, fileSize);
    const detectedLanguages = this.detectLanguagesFromPages(pages);

    const result: PdfAnalysisResult = {
      id: resultId,
      fileId: request.fileId,
      pdfType,
      pageCount,
      pages,
      embeddedFonts: allFonts,
      vectorGraphics: allVectors,
      embeddedImages: allImages,
      metadata: { ...pdfMetadata, languages: detectedLanguages },
      processingTimeMs: Date.now() - startTime,
    };

    await this.persistResult(result);

    logger.info('PDF analysis complete', {
      fileId: request.fileId,
      pdfType,
      pages: pageCount,
      fonts: allFonts.length,
      vectors: allVectors.length,
      images: allImages.length,
      processingTimeMs: result.processingTimeMs,
    });

    return result;
  }

  // ─── PDF Type Detection ─────────────────────────────────────────────────────

  private async detectPdfType(buffer: Buffer): Promise<PdfType> {
    const headerStr = buffer.slice(0, Math.min(buffer.length, 50000)).toString('latin1');

    const hasText = headerStr.includes('/Type /Page') && (headerStr.includes('BT') && headerStr.includes('ET'));
    const hasImages = headerStr.includes('/Subtype /Image') || headerStr.includes('/XObject');

    const textStreamCount = (headerStr.match(/BT[\s\S]*?ET/g) || []).length;
    const imageCount = (headerStr.match(/\/Subtype\s*\/Image/g) || []).length;

    if (hasText && !hasImages) return 'searchable';
    if (!hasText && hasImages) return 'scanned';
    if (hasText && hasImages) {
      return textStreamCount > imageCount * 2 ? 'searchable' : 'hybrid';
    }

    return 'searchable';
  }

  private async getPageCount(buffer: Buffer): Promise<number> {
    try {
      const metadata = await sharp(buffer).metadata();
      return metadata.pages || 1;
    } catch {
      const content = buffer.toString('latin1');
      const matches = content.match(/\/Type\s*\/Page[^s]/g);
      return matches ? matches.length : 1;
    }
  }

  // ─── Page Analysis ──────────────────────────────────────────────────────────

  private async analyzePageStructure(
    buffer: Buffer,
    pageIndex: number,
    pdfType: PdfType,
  ): Promise<PdfPageAnalysis> {
    try {
      const pageImage = await sharp(buffer, { page: pageIndex }).png().toBuffer();
      const meta = await sharp(pageImage).metadata();
      const width = meta.width || 612;
      const height = meta.height || 792;

      const hasTextLayer = pdfType !== 'scanned';
      let textContent = '';
      let wordCount = 0;

      if (hasTextLayer) {
        const resized = await sharp(pageImage)
          .resize({ width: Math.min(width, 2048), fit: 'inside' })
          .png()
          .toBuffer();
        const base64 = resized.toString('base64');

        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'Extract all visible text from this PDF page. Return JSON: { text: "full text", wordCount: number, hasImages: boolean, hasVectorContent: boolean, imageRegions: [{x,y,width,height}], vectorRegions: [{x,y,width,height}] }',
            },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } },
                { type: 'text', text: `Analyze page ${pageIndex + 1}. Image is ${width}x${height}px.` },
              ],
            },
          ],
          temperature: 0.05,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        });

        const raw = response.choices[0]?.message?.content || '{}';
        try {
          const parsed = JSON.parse(raw);
          textContent = String(parsed.text || '');
          wordCount = Number(parsed.wordCount) || textContent.split(/\s+/).filter(Boolean).length;

          return {
            pageNumber: pageIndex + 1,
            dimensions: { width, height },
            hasTextLayer,
            hasImages: Boolean(parsed.hasImages),
            hasVectorContent: Boolean(parsed.hasVectorContent),
            textLayerContent: textContent,
            textLayerWordCount: wordCount,
            imageRegions: Array.isArray(parsed.imageRegions)
              ? parsed.imageRegions.map((r: Record<string, unknown>) => ({
                  x: Number(r.x) || 0,
                  y: Number(r.y) || 0,
                  width: Number(r.width) || 0,
                  height: Number(r.height) || 0,
                }))
              : [],
            vectorRegions: Array.isArray(parsed.vectorRegions)
              ? parsed.vectorRegions.map((r: Record<string, unknown>) => ({
                  x: Number(r.x) || 0,
                  y: Number(r.y) || 0,
                  width: Number(r.width) || 0,
                  height: Number(r.height) || 0,
                }))
              : [],
            rotation: 0,
          };
        } catch {
          // Fall through to default
        }
      }

      return {
        pageNumber: pageIndex + 1,
        dimensions: { width, height },
        hasTextLayer,
        hasImages: pdfType !== 'searchable',
        hasVectorContent: false,
        textLayerContent: textContent,
        textLayerWordCount: wordCount,
        imageRegions: [],
        vectorRegions: [],
        rotation: 0,
      };
    } catch {
      return {
        pageNumber: pageIndex + 1,
        dimensions: { width: 612, height: 792 },
        hasTextLayer: false,
        hasImages: false,
        hasVectorContent: false,
        textLayerContent: '',
        textLayerWordCount: 0,
        imageRegions: [],
        vectorRegions: [],
        rotation: 0,
      };
    }
  }

  // ─── Font Extraction ────────────────────────────────────────────────────────

  private async extractFontInfo(buffer: Buffer, pageCount: number): Promise<EmbeddedFont[]> {
    const content = buffer.slice(0, Math.min(buffer.length, 200000)).toString('latin1');

    const fontPattern = /\/BaseFont\s*\/([\w\-+]+)/g;
    const fonts = new Map<string, EmbeddedFont>();
    let match: RegExpExecArray | null;

    while ((match = fontPattern.exec(content)) !== null) {
      const rawName = match[1];
      const isSubset = /^[A-Z]{6}\+/.test(rawName);
      const name = isSubset ? rawName.replace(/^[A-Z]{6}\+/, '') : rawName;

      if (!fonts.has(name)) {
        const isArabicCapable = /Arab|Naskh|Cairo|Tajawal|Noto.*Arab|Amiri|Scheherazade|Lateef/i.test(name);

        let type: EmbeddedFont['type'] = 'TrueType';
        const regionAfterFont = content.slice(match.index, match.index + 500);
        if (regionAfterFont.includes('/Subtype /Type1')) type = 'Type1';
        else if (regionAfterFont.includes('/Subtype /CIDFontType0')) type = 'CIDFont';
        else if (regionAfterFont.includes('/Subtype /OpenType')) type = 'OpenType';

        fonts.set(name, {
          name,
          type,
          isEmbedded: regionAfterFont.includes('/FontDescriptor') && regionAfterFont.includes('/FontFile'),
          isSubset,
          encoding: regionAfterFont.includes('/Identity-H') ? 'Identity-H' : 'WinAnsiEncoding',
          glyphCount: 0,
          usedOnPages: [],
          supportsArabic: isArabicCapable,
        });
      }
    }

    return Array.from(fonts.values());
  }

  // ─── Vector Graphics ────────────────────────────────────────────────────────

  private async extractVectorGraphics(buffer: Buffer, pageIndex: number): Promise<VectorGraphic[]> {
    const content = buffer.slice(0, Math.min(buffer.length, 100000)).toString('latin1');
    const vectors: VectorGraphic[] = [];

    const pathPattern = /(\d+\.?\d*)\s+(\d+\.?\d*)\s+m\s+([\d\s.lcvhzMLCVHZ]+)/g;
    let pathMatch: RegExpExecArray | null;
    let idx = 0;

    while ((pathMatch = pathPattern.exec(content)) !== null && idx < 100) {
      const startX = parseFloat(pathMatch[1]);
      const startY = parseFloat(pathMatch[2]);
      const pathOps = pathMatch[3];

      let fillColor: string | null = null;
      let strokeColor: string | null = null;
      const contextBefore = content.slice(Math.max(0, pathMatch.index - 200), pathMatch.index);

      const rgFill = contextBefore.match(/([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/);
      if (rgFill) {
        fillColor = this.rgbToHex(parseFloat(rgFill[1]), parseFloat(rgFill[2]), parseFloat(rgFill[3]));
      }

      const rgStroke = contextBefore.match(/([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+RG/);
      if (rgStroke) {
        strokeColor = this.rgbToHex(parseFloat(rgStroke[1]), parseFloat(rgStroke[2]), parseFloat(rgStroke[3]));
      }

      vectors.push({
        id: `vec_${pageIndex}_${idx}`,
        pageNumber: pageIndex + 1,
        bbox: { x: startX, y: startY, width: 100, height: 100 },
        type: pathOps.includes('c') || pathOps.includes('C') ? 'curve' : 'path',
        pathData: `M ${startX} ${startY} ${pathOps}`,
        fillColor,
        strokeColor,
        strokeWidth: 1,
      });
      idx++;
    }

    return vectors;
  }

  // ─── Image Extraction ───────────────────────────────────────────────────────

  private async extractImageInfo(buffer: Buffer, pageIndex: number): Promise<EmbeddedImage[]> {
    const content = buffer.slice(0, Math.min(buffer.length, 200000)).toString('latin1');
    const images: EmbeddedImage[] = [];

    const imagePattern = /\/Subtype\s*\/Image[\s\S]*?\/Width\s+(\d+)[\s\S]*?\/Height\s+(\d+)/g;
    let imgMatch: RegExpExecArray | null;
    let idx = 0;

    while ((imgMatch = imagePattern.exec(content)) !== null && idx < 50) {
      const imgWidth = parseInt(imgMatch[1]);
      const imgHeight = parseInt(imgMatch[2]);

      const region = content.slice(imgMatch.index, imgMatch.index + 500);
      let imgFormat: EmbeddedImage['format'] = 'jpeg';
      if (region.includes('/FlateDecode')) imgFormat = 'png';
      else if (region.includes('/CCITTFaxDecode')) imgFormat = 'ccitt';
      else if (region.includes('/JBIG2Decode')) imgFormat = 'jbig2';

      const bitsMatch = region.match(/\/BitsPerComponent\s+(\d+)/);
      const colorSpaceMatch = region.match(/\/ColorSpace\s*\/([\w]+)/);

      images.push({
        id: `img_${pageIndex}_${idx}`,
        pageNumber: pageIndex + 1,
        bbox: { x: 0, y: 0, width: imgWidth, height: imgHeight },
        format: imgFormat,
        width: imgWidth,
        height: imgHeight,
        bitsPerComponent: bitsMatch ? parseInt(bitsMatch[1]) : 8,
        colorSpace: colorSpaceMatch ? colorSpaceMatch[1] : 'DeviceRGB',
        compressionRatio: 0,
      });
      idx++;
    }

    return images;
  }

  // ─── Metadata ───────────────────────────────────────────────────────────────

  private async extractPdfMetadata(buffer: Buffer, fileSize: number): Promise<PdfMetadata> {
    const header = buffer.slice(0, Math.min(buffer.length, 50000)).toString('latin1');

    const versionMatch = header.match(/%PDF-(\d\.\d)/);
    const titleMatch = header.match(/\/Title\s*\(([^)]*)\)/);
    const authorMatch = header.match(/\/Author\s*\(([^)]*)\)/);
    const subjectMatch = header.match(/\/Subject\s*\(([^)]*)\)/);
    const creatorMatch = header.match(/\/Creator\s*\(([^)]*)\)/);
    const producerMatch = header.match(/\/Producer\s*\(([^)]*)\)/);
    const creationDateMatch = header.match(/\/CreationDate\s*\(([^)]*)\)/);
    const modDateMatch = header.match(/\/ModDate\s*\(([^)]*)\)/);

    return {
      title: titleMatch ? titleMatch[1] : null,
      author: authorMatch ? authorMatch[1] : null,
      subject: subjectMatch ? subjectMatch[1] : null,
      creator: creatorMatch ? creatorMatch[1] : null,
      producer: producerMatch ? producerMatch[1] : null,
      creationDate: creationDateMatch ? creationDateMatch[1] : null,
      modificationDate: modDateMatch ? modDateMatch[1] : null,
      pdfVersion: versionMatch ? versionMatch[1] : '1.4',
      isEncrypted: header.includes('/Encrypt'),
      isLinearized: header.includes('/Linearized'),
      fileSize,
      languages: [],
    };
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private detectLanguagesFromPages(pages: PdfPageAnalysis[]): string[] {
    const langs = new Set<string>();
    for (const page of pages) {
      if (/[\u0600-\u06FF]/.test(page.textLayerContent)) langs.add('ar');
      if (/[a-zA-Z]/.test(page.textLayerContent)) langs.add('en');
      if (/[\u4e00-\u9fff]/.test(page.textLayerContent)) langs.add('zh');
    }
    return Array.from(langs);
  }

  private rgbToHex(r: number, g: number, b: number): string {
    const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // ─── Persistence ────────────────────────────────────────────────────────────

  private async persistResult(result: PdfAnalysisResult): Promise<void> {
    try {
      await this.prisma.conversionJob.create({
        data: {
          id: result.id,
          tenantId: 'system',
          sourceFormat: 'PDF',
          targetFormat: 'PDF_ANALYSIS',
          sourceFile: result.fileId,
          status: 'COMPLETED',
          metadata: JSON.stringify({
            pdfType: result.pdfType,
            pageCount: result.pageCount,
            fonts: result.embeddedFonts.length,
            vectors: result.vectorGraphics.length,
            images: result.embeddedImages.length,
          }),
          durationMs: result.processingTimeMs,
        },
      });
    } catch (err) {
      logger.warn('Failed to persist PDF analysis', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
