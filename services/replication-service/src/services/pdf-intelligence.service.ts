import sharp from 'sharp';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Inline canonical-IR types (mirrors @rasid/shared canonical-ir.ts definitions)
// ---------------------------------------------------------------------------

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutNode {
  id: string;
  type: 'text-block' | 'image' | 'shape' | 'table' | 'chart' | 'container';
  bbox: BoundingBox;
  pageIndex: number;
  content: string;
  style: Record<string, string | number>;
  children: string[];
  direction: 'ltr' | 'rtl';
  zIndex: number;
}

export interface PageNode {
  index: number;
  width: number;
  height: number;
  nodeIds: string[];
}

export interface CanonicalLayoutGraph {
  version: string;
  sourceHash: string;
  pages: PageNode[];
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  metadata: Record<string, string | number | boolean>;
}

export interface LayoutEdge {
  from: string;
  to: string;
  relation: 'reading-order' | 'parent-child' | 'alignment' | 'overlap';
}

// ---------------------------------------------------------------------------
// PDF Intelligence types
// ---------------------------------------------------------------------------

export interface PDFProcessingRequest {
  pdfBuffer: Buffer;
  options?: PDFProcessingOptions;
}

export interface PDFProcessingOptions {
  extractText: boolean;
  extractFonts: boolean;
  extractVectors: boolean;
  extractImages: boolean;
  ocrFallback: boolean;
}

export interface PDFLayerResult {
  pages: PDFPageResult[];
  embeddedFonts: EmbeddedFont[];
  metadata: PDFMetadata;
  processingTimeMs: number;
}

export interface PDFPageResult {
  pageNumber: number;
  dimensions: { width: number; height: number };
  textLayer: PDFTextElement[];
  vectorShapes: PDFVectorShape[];
  rasterImages: PDFRasterImage[];
  isScanned: boolean;
}

export interface PDFTextElement {
  text: string;
  bbox: BoundingBox;
  fontName: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  direction: 'ltr' | 'rtl';
}

export interface PDFVectorShape {
  pathData: string;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  bbox: BoundingBox;
}

export interface PDFRasterImage {
  bbox: BoundingBox;
  format: string;
  dataHash: string;
  width: number;
  height: number;
  dataBase64: string;
}

export interface EmbeddedFont {
  name: string;
  type: 'TrueType' | 'OpenType' | 'Type1' | 'CID';
  dataHash: string;
  isArabic: boolean;
  weights: number[];
}

export interface PDFMetadata {
  title: string | null;
  author: string | null;
  pageCount: number;
  isScanned: boolean;
  hasTextLayer: boolean;
  hasVectorContent: boolean;
  pdfVersion: string;
}

// ---------------------------------------------------------------------------
// Internal parser helpers
// ---------------------------------------------------------------------------

interface PDFCrossRef {
  objectNumber: number;
  offset: number;
  generation: number;
}

interface PDFObject {
  objectNumber: number;
  content: string;
  streamData: Buffer | null;
}

const DEFAULT_OPTIONS: PDFProcessingOptions = {
  extractText: true,
  extractFonts: true,
  extractVectors: true,
  extractImages: true,
  ocrFallback: false,
};

const MAX_IMAGE_BASE64_SIZE = 1_048_576; // 1 MB

// Arabic Unicode ranges
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

// ---------------------------------------------------------------------------
// PDFIntelligenceService
// ---------------------------------------------------------------------------

export class PDFIntelligenceService {
  constructor() {
    logger.info('PDFIntelligenceService initialised');
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async processPDF(request: PDFProcessingRequest): Promise<PDFLayerResult> {
    const startTime = Date.now();
    const options = { ...DEFAULT_OPTIONS, ...request.options };
    const { pdfBuffer } = request;

    logger.info('Starting PDF processing', { bufferSize: pdfBuffer.length });

    try {
      const pdfVersion = this.parsePDFVersion(pdfBuffer);
      const pageCount = this.estimatePageCount(pdfBuffer);

      logger.info('PDF header parsed', { pdfVersion, estimatedPages: pageCount });

      const pages: PDFPageResult[] = [];
      let hasAnyText = false;
      let hasAnyVectors = false;
      let isEntirelyScanned = true;

      for (let p = 1; p <= pageCount; p++) {
        const textLayer = options.extractText
          ? await this.extractTextLayer(pdfBuffer, p)
          : [];

        const vectorShapes = options.extractVectors
          ? await this.extractVectorShapes(pdfBuffer, p)
          : [];

        const rasterImages = options.extractImages
          ? await this.extractRasterImages(pdfBuffer, p)
          : [];

        const pageHasText = textLayer.length > 0;
        const pageHasVectors = vectorShapes.length > 0;
        const isScanned = !pageHasText && rasterImages.length > 0;

        if (pageHasText) {
          hasAnyText = true;
          isEntirelyScanned = false;
        }
        if (pageHasVectors) {
          hasAnyVectors = true;
        }
        if (!isScanned) {
          isEntirelyScanned = false;
        }

        const dimensions = this.extractPageDimensions(pdfBuffer, p);

        pages.push({
          pageNumber: p,
          dimensions,
          textLayer,
          vectorShapes,
          rasterImages,
          isScanned,
        });
      }

      const embeddedFonts = options.extractFonts
        ? await this.extractEmbeddedFonts(pdfBuffer)
        : [];

      const metadata: PDFMetadata = {
        title: this.extractInfoField(pdfBuffer, 'Title'),
        author: this.extractInfoField(pdfBuffer, 'Author'),
        pageCount,
        isScanned: isEntirelyScanned,
        hasTextLayer: hasAnyText,
        hasVectorContent: hasAnyVectors,
        pdfVersion,
      };

      const processingTimeMs = Date.now() - startTime;
      logger.info('PDF processing complete', { pageCount, processingTimeMs });

      return { pages, embeddedFonts, metadata, processingTimeMs };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('PDF processing failed', { error: message });
      throw new Error(`PDF processing failed: ${message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Text layer extraction
  // -------------------------------------------------------------------------

  async extractTextLayer(pdfBuffer: Buffer, pageNumber: number): Promise<PDFTextElement[]> {
    try {
      const contentStream = this.getPageContentStream(pdfBuffer, pageNumber);
      if (!contentStream) {
        return [];
      }

      const elements: PDFTextElement[] = [];
      const textBlockRegex = /BT([\s\S]*?)ET/g;
      let blockMatch: RegExpExecArray | null;

      while ((blockMatch = textBlockRegex.exec(contentStream)) !== null) {
        const block = blockMatch[1];
        const blockElements = this.parseTextBlock(block);
        elements.push(...blockElements);
      }

      return elements;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Text layer extraction failed', { pageNumber, error: message });
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Vector shape extraction
  // -------------------------------------------------------------------------

  async extractVectorShapes(pdfBuffer: Buffer, pageNumber: number): Promise<PDFVectorShape[]> {
    try {
      const contentStream = this.getPageContentStream(pdfBuffer, pageNumber);
      if (!contentStream) {
        return [];
      }

      const shapes: PDFVectorShape[] = [];
      const lines = contentStream.split('\n');

      let currentPath = '';
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let currentFill: string | null = null;
      let currentStroke: string | null = null;
      let currentStrokeWidth = 1;

      const flushPath = (operator: string): void => {
        if (currentPath.trim().length === 0) {
          return;
        }
        const hasFill = operator === 'f' || operator === 'F' || operator === 'B' || operator === 'b' || operator === 'f*' || operator === 'B*';
        const hasStroke = operator === 'S' || operator === 'B' || operator === 'b' || operator === 'B*' || operator === 's';

        const svgPath = this.convertPDFPathToSVG(currentPath);
        shapes.push({
          pathData: svgPath,
          fill: hasFill ? (currentFill ?? '#000000') : null,
          stroke: hasStroke ? (currentStroke ?? '#000000') : null,
          strokeWidth: hasStroke ? currentStrokeWidth : 0,
          bbox: {
            x: Number.isFinite(minX) ? minX : 0,
            y: Number.isFinite(minY) ? minY : 0,
            width: Number.isFinite(maxX - minX) ? maxX - minX : 0,
            height: Number.isFinite(maxY - minY) ? maxY - minY : 0,
          },
        });

        currentPath = '';
        minX = Infinity;
        minY = Infinity;
        maxX = -Infinity;
        maxY = -Infinity;
      };

      const trackPoint = (x: number, y: number): void => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      };

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.length === 0) continue;

        const tokens = line.split(/\s+/);
        const op = tokens[tokens.length - 1];

        // Stroke width
        if (op === 'w' && tokens.length >= 2) {
          const w = parseFloat(tokens[tokens.length - 2]);
          if (!Number.isNaN(w)) currentStrokeWidth = w;
          continue;
        }

        // Non-stroking color (fill) — rg (RGB)
        if (op === 'rg' && tokens.length >= 4) {
          const r = Math.round(parseFloat(tokens[tokens.length - 4]) * 255);
          const g = Math.round(parseFloat(tokens[tokens.length - 3]) * 255);
          const b = Math.round(parseFloat(tokens[tokens.length - 2]) * 255);
          if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
            currentFill = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          }
          continue;
        }

        // Stroking color — RG (RGB)
        if (op === 'RG' && tokens.length >= 4) {
          const r = Math.round(parseFloat(tokens[tokens.length - 4]) * 255);
          const g = Math.round(parseFloat(tokens[tokens.length - 3]) * 255);
          const b = Math.round(parseFloat(tokens[tokens.length - 2]) * 255);
          if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
            currentStroke = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          }
          continue;
        }

        // Path construction operators
        if (op === 'm' && tokens.length >= 3) {
          const x = parseFloat(tokens[tokens.length - 3]);
          const y = parseFloat(tokens[tokens.length - 2]);
          if (!Number.isNaN(x) && !Number.isNaN(y)) {
            currentPath += `${x} ${y} m `;
            trackPoint(x, y);
          }
          continue;
        }

        if (op === 'l' && tokens.length >= 3) {
          const x = parseFloat(tokens[tokens.length - 3]);
          const y = parseFloat(tokens[tokens.length - 2]);
          if (!Number.isNaN(x) && !Number.isNaN(y)) {
            currentPath += `${x} ${y} l `;
            trackPoint(x, y);
          }
          continue;
        }

        if (op === 'c' && tokens.length >= 7) {
          const coords = tokens.slice(tokens.length - 7, tokens.length - 1).map(parseFloat);
          if (coords.every((n) => !Number.isNaN(n))) {
            currentPath += `${coords.join(' ')} c `;
            trackPoint(coords[0], coords[1]);
            trackPoint(coords[2], coords[3]);
            trackPoint(coords[4], coords[5]);
          }
          continue;
        }

        if (op === 're' && tokens.length >= 5) {
          const x = parseFloat(tokens[tokens.length - 5]);
          const y = parseFloat(tokens[tokens.length - 4]);
          const w = parseFloat(tokens[tokens.length - 3]);
          const h = parseFloat(tokens[tokens.length - 2]);
          if ([x, y, w, h].every((n) => !Number.isNaN(n))) {
            currentPath += `${x} ${y} ${w} ${h} re `;
            trackPoint(x, y);
            trackPoint(x + w, y + h);
          }
          continue;
        }

        if (op === 'h') {
          currentPath += 'h ';
          continue;
        }

        // Path painting operators
        if (['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n'].includes(op)) {
          flushPath(op);
          continue;
        }
      }

      return shapes;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Vector extraction failed', { pageNumber, error: message });
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Raster image extraction
  // -------------------------------------------------------------------------

  async extractRasterImages(pdfBuffer: Buffer, pageNumber: number): Promise<PDFRasterImage[]> {
    try {
      const bufferStr = pdfBuffer.toString('latin1');
      const images: PDFRasterImage[] = [];
      const imageObjRegex = /(\d+)\s+\d+\s+obj[\s\S]*?\/Subtype\s*\/Image[\s\S]*?endobj/g;
      let imgMatch: RegExpExecArray | null;

      let imageIndex = 0;

      while ((imgMatch = imageObjRegex.exec(bufferStr)) !== null) {
        const objContent = imgMatch[0];

        const widthMatch = objContent.match(/\/Width\s+(\d+)/);
        const heightMatch = objContent.match(/\/Height\s+(\d+)/);
        const width = widthMatch ? parseInt(widthMatch[1], 10) : 0;
        const height = heightMatch ? parseInt(heightMatch[1], 10) : 0;

        // Determine image format from filter
        let format = 'raw';
        if (objContent.includes('/DCTDecode')) format = 'jpeg';
        else if (objContent.includes('/FlateDecode')) format = 'png';
        else if (objContent.includes('/JPXDecode')) format = 'jpeg2000';
        else if (objContent.includes('/CCITTFaxDecode')) format = 'tiff';
        else if (objContent.includes('/JBIG2Decode')) format = 'jbig2';

        // Extract stream data for hashing
        const streamStartMarker = 'stream\r\n';
        const streamStartAlt = 'stream\n';
        let streamStartIdx = objContent.indexOf(streamStartMarker);
        let markerLen = streamStartMarker.length;
        if (streamStartIdx === -1) {
          streamStartIdx = objContent.indexOf(streamStartAlt);
          markerLen = streamStartAlt.length;
        }
        const streamEndIdx = objContent.lastIndexOf('endstream');

        let dataHash = '';
        let dataBase64 = '';

        if (streamStartIdx !== -1 && streamEndIdx !== -1 && streamEndIdx > streamStartIdx) {
          const streamContent = objContent.substring(streamStartIdx + markerLen, streamEndIdx);
          const streamBuffer = Buffer.from(streamContent, 'latin1');
          dataHash = this.computeHash(streamBuffer);

          if (streamBuffer.length < MAX_IMAGE_BASE64_SIZE) {
            dataBase64 = streamBuffer.toString('base64');
          }
        } else {
          dataHash = this.computeHash(Buffer.from(objContent, 'latin1'));
        }

        // Assign a simple placement bbox (real placement comes from content stream Cm matrix)
        const bbox: BoundingBox = {
          x: 0,
          y: 0,
          width,
          height,
        };

        images.push({
          bbox,
          format,
          dataHash,
          width,
          height,
          dataBase64,
        });

        imageIndex++;
      }

      // Attribute images to page heuristically — PDF images are global objects; we
      // assign images that are referenced from the target page's content stream.
      // For simplicity, if pageNumber exceeds count, return all from first pass.
      const pageImages = this.filterImagesByPage(pdfBuffer, pageNumber, images);

      return pageImages;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Image extraction failed', { pageNumber, error: message });
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Embedded font extraction
  // -------------------------------------------------------------------------

  async extractEmbeddedFonts(pdfBuffer: Buffer): Promise<EmbeddedFont[]> {
    try {
      const bufferStr = pdfBuffer.toString('latin1');
      const fonts: EmbeddedFont[] = [];
      const seenNames = new Set<string>();

      // Match font dictionary objects
      const fontRegex = /\/Type\s*\/Font[\s\S]*?(?=endobj)/g;
      let fontMatch: RegExpExecArray | null;

      while ((fontMatch = fontRegex.exec(bufferStr)) !== null) {
        const fontDict = fontMatch[0];

        // Extract base font name
        const baseFont = fontDict.match(/\/BaseFont\s*\/([^\s/\]>]+)/);
        const fontName = baseFont ? baseFont[1].replace(/[+#]/g, '') : null;
        if (!fontName || seenNames.has(fontName)) continue;
        seenNames.add(fontName);

        // Determine font type
        let fontType: EmbeddedFont['type'] = 'Type1';
        if (fontDict.includes('/TrueType') || fontDict.includes('/CIDFontType2')) {
          fontType = 'TrueType';
        } else if (fontDict.includes('/OpenType') || fontDict.includes('/CIDFontType0C')) {
          fontType = 'OpenType';
        } else if (fontDict.includes('/CIDFontType0') || fontDict.includes('/CIDFont')) {
          fontType = 'CID';
        }

        // Arabic detection — check font name and any ToUnicode mapping
        const nameHints = fontName.toLowerCase();
        const isArabic =
          nameHints.includes('arab') ||
          nameHints.includes('naskh') ||
          nameHints.includes('kufi') ||
          nameHints.includes('thuluth') ||
          nameHints.includes('tahoma') ||
          nameHints.includes('scheherazade') ||
          nameHints.includes('amiri') ||
          nameHints.includes('sakkal') ||
          this.checkToUnicodeForArabic(fontDict);

        // Attempt to detect font weight from name
        const weights = this.inferFontWeights(fontName);

        const dataHash = this.computeHash(Buffer.from(fontDict, 'latin1'));

        fonts.push({
          name: fontName,
          type: fontType,
          dataHash,
          isArabic,
          weights,
        });
      }

      logger.info('Embedded fonts extracted', { count: fonts.length });
      return fonts;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Font extraction failed', { error: message });
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Convert to CanonicalLayoutGraph
  // -------------------------------------------------------------------------

  convertToLayoutGraph(result: PDFLayerResult, sourceHash: string): CanonicalLayoutGraph {
    const pages: PageNode[] = [];
    const nodes: LayoutNode[] = [];
    const edges: LayoutEdge[] = [];
    let nodeCounter = 0;

    for (const page of result.pages) {
      const pageIndex = page.pageNumber - 1;
      const pageNodeIds: string[] = [];
      let prevNodeId: string | null = null;

      // Text elements
      for (const textEl of page.textLayer) {
        const nodeId = `node-${nodeCounter++}`;
        pageNodeIds.push(nodeId);

        const direction = this.detectArabicText(textEl.text) ? 'rtl' : textEl.direction;

        nodes.push({
          id: nodeId,
          type: 'text-block',
          bbox: textEl.bbox,
          pageIndex,
          content: textEl.text,
          style: {
            fontName: textEl.fontName,
            fontSize: textEl.fontSize,
            fontWeight: textEl.fontWeight,
            color: textEl.color,
          },
          children: [],
          direction,
          zIndex: nodeCounter,
        });

        if (prevNodeId) {
          edges.push({ from: prevNodeId, to: nodeId, relation: 'reading-order' });
        }
        prevNodeId = nodeId;
      }

      // Vector shapes
      for (const shape of page.vectorShapes) {
        const nodeId = `node-${nodeCounter++}`;
        pageNodeIds.push(nodeId);

        nodes.push({
          id: nodeId,
          type: 'shape',
          bbox: shape.bbox,
          pageIndex,
          content: shape.pathData,
          style: {
            fill: shape.fill ?? 'none',
            stroke: shape.stroke ?? 'none',
            strokeWidth: shape.strokeWidth,
          },
          children: [],
          direction: 'ltr',
          zIndex: nodeCounter,
        });

        if (prevNodeId) {
          edges.push({ from: prevNodeId, to: nodeId, relation: 'reading-order' });
        }
        prevNodeId = nodeId;
      }

      // Raster images
      for (const img of page.rasterImages) {
        const nodeId = `node-${nodeCounter++}`;
        pageNodeIds.push(nodeId);

        nodes.push({
          id: nodeId,
          type: 'image',
          bbox: img.bbox,
          pageIndex,
          content: img.dataHash,
          style: {
            format: img.format,
            width: img.width,
            height: img.height,
          },
          children: [],
          direction: 'ltr',
          zIndex: nodeCounter,
        });

        if (prevNodeId) {
          edges.push({ from: prevNodeId, to: nodeId, relation: 'reading-order' });
        }
        prevNodeId = nodeId;
      }

      pages.push({
        index: pageIndex,
        width: page.dimensions.width,
        height: page.dimensions.height,
        nodeIds: pageNodeIds,
      });
    }

    return {
      version: '1.0.0',
      sourceHash,
      pages,
      nodes,
      edges,
      metadata: {
        pageCount: result.metadata.pageCount,
        isScanned: result.metadata.isScanned,
        hasTextLayer: result.metadata.hasTextLayer,
        hasVectorContent: result.metadata.hasVectorContent,
        pdfVersion: result.metadata.pdfVersion,
        processingTimeMs: result.processingTimeMs,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Font loading
  // -------------------------------------------------------------------------

  async loadEmbeddedFontsToContainer(
    fonts: EmbeddedFont[],
  ): Promise<{ loaded: string[]; failed: string[] }> {
    const loaded: string[] = [];
    const failed: string[] = [];

    for (const font of fonts) {
      try {
        const fontValidationEndpoint =
          process.env.FONT_VALIDATION_URL ?? 'http://localhost:3100/api/fonts/validate';

        const response = await fetch(fontValidationEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fontName: font.name,
            fontType: font.type,
            dataHash: font.dataHash,
            isArabic: font.isArabic,
          }),
        });

        if (response.ok) {
          loaded.push(font.name);
          logger.info('Font loaded successfully', { fontName: font.name });
        } else {
          const errorBody = await response.text();
          failed.push(font.name);
          logger.warn('Font loading rejected by validation service', {
            fontName: font.name,
            status: response.status,
            error: errorBody,
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        failed.push(font.name);
        logger.error('Font loading failed', { fontName: font.name, error: message });
      }
    }

    logger.info('Font loading summary', { loaded: loaded.length, failed: failed.length });
    return { loaded, failed };
  }

  // -------------------------------------------------------------------------
  // Private utilities
  // -------------------------------------------------------------------------

  private detectArabicText(text: string): boolean {
    return ARABIC_REGEX.test(text);
  }

  private computeHash(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private parsePDFVersion(buffer: Buffer): string {
    try {
      // PDF files start with %PDF-X.Y
      const header = buffer.subarray(0, 20).toString('ascii');
      const match = header.match(/%PDF-(\d+\.\d+)/);
      if (match) {
        return match[1];
      }
      logger.warn('Could not detect PDF version from header');
      return '1.0';
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('PDF version parsing failed', { error: message });
      return '1.0';
    }
  }

  private estimatePageCount(buffer: Buffer): number {
    try {
      const content = buffer.toString('latin1');

      // First try to find /Count in the Pages dictionary
      const countMatch = content.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
      if (countMatch) {
        const count = parseInt(countMatch[1], 10);
        if (count > 0) return count;
      }

      // Fallback: count /Type /Page occurrences (not /Type /Pages)
      const pageMatches = content.match(/\/Type\s*\/Page(?!\s*s)\b/g);
      return pageMatches ? pageMatches.length : 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Page count estimation failed', { error: message });
      return 1;
    }
  }

  // -------------------------------------------------------------------------
  // PDF binary parsing internals
  // -------------------------------------------------------------------------

  private getPageContentStream(pdfBuffer: Buffer, pageNumber: number): string | null {
    try {
      const content = pdfBuffer.toString('latin1');

      // Find all page objects
      const pageRegex = /(\d+)\s+\d+\s+obj[\s\S]*?\/Type\s*\/Page(?!\s*s)\b[\s\S]*?endobj/g;
      const pageObjects: Array<{ objectNumber: number; content: string }> = [];
      let match: RegExpExecArray | null;

      while ((match = pageRegex.exec(content)) !== null) {
        pageObjects.push({
          objectNumber: parseInt(match[1], 10),
          content: match[0],
        });
      }

      if (pageNumber < 1 || pageNumber > pageObjects.length) {
        logger.warn('Page number out of range', { pageNumber, totalPages: pageObjects.length });
        return null;
      }

      const pageObj = pageObjects[pageNumber - 1];

      // Find /Contents reference — could be a direct reference or array
      const contentsMatch = pageObj.content.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
      const contentsArrayMatch = pageObj.content.match(
        /\/Contents\s*\[([\s\d+R]+)\]/,
      );

      const streamObjectNumbers: number[] = [];

      if (contentsMatch) {
        streamObjectNumbers.push(parseInt(contentsMatch[1], 10));
      } else if (contentsArrayMatch) {
        const refs = contentsArrayMatch[1].match(/(\d+)\s+\d+\s+R/g);
        if (refs) {
          for (const ref of refs) {
            const num = parseInt(ref.split(/\s+/)[0], 10);
            streamObjectNumbers.push(num);
          }
        }
      }

      if (streamObjectNumbers.length === 0) {
        // Try inline stream within the page object itself
        return this.extractStream(pageObj.content);
      }

      // Collect content from referenced stream objects
      let combinedStream = '';
      for (const objNum of streamObjectNumbers) {
        const streamContent = this.getObjectStream(content, objNum);
        if (streamContent) {
          combinedStream += streamContent + '\n';
        }
      }

      return combinedStream.length > 0 ? combinedStream : null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Content stream extraction failed', { pageNumber, error: message });
      return null;
    }
  }

  private getObjectStream(pdfContent: string, objectNumber: number): string | null {
    // Pattern: N 0 obj ... stream ... endstream ... endobj
    const objRegex = new RegExp(
      `${objectNumber}\\s+\\d+\\s+obj[\\s\\S]*?endobj`,
      'm',
    );
    const match = pdfContent.match(objRegex);
    if (!match) return null;

    return this.extractStream(match[0]);
  }

  private extractStream(objectContent: string): string | null {
    const streamStartMarker = 'stream\r\n';
    const streamStartAlt = 'stream\n';
    let startIdx = objectContent.indexOf(streamStartMarker);
    let markerLen = streamStartMarker.length;

    if (startIdx === -1) {
      startIdx = objectContent.indexOf(streamStartAlt);
      markerLen = streamStartAlt.length;
    }

    if (startIdx === -1) return null;

    const endIdx = objectContent.indexOf('endstream', startIdx);
    if (endIdx === -1) return null;

    return objectContent.substring(startIdx + markerLen, endIdx).trim();
  }

  private extractPageDimensions(
    pdfBuffer: Buffer,
    pageNumber: number,
  ): { width: number; height: number } {
    try {
      const content = pdfBuffer.toString('latin1');

      // Find the specific page object
      const pageRegex = /(\d+)\s+\d+\s+obj[\s\S]*?\/Type\s*\/Page(?!\s*s)\b[\s\S]*?endobj/g;
      const pages: string[] = [];
      let match: RegExpExecArray | null;

      while ((match = pageRegex.exec(content)) !== null) {
        pages.push(match[0]);
      }

      const pageObj = pages[pageNumber - 1];
      if (pageObj) {
        // Look for /MediaBox [x y w h]
        const mediaBoxMatch = pageObj.match(
          /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/,
        );
        if (mediaBoxMatch) {
          return {
            width: parseFloat(mediaBoxMatch[3]) - parseFloat(mediaBoxMatch[1]),
            height: parseFloat(mediaBoxMatch[4]) - parseFloat(mediaBoxMatch[2]),
          };
        }
      }

      // Fallback: look for any /MediaBox in the document (inherited from Pages)
      const globalMediaBox = content.match(
        /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/,
      );
      if (globalMediaBox) {
        return {
          width: parseFloat(globalMediaBox[3]) - parseFloat(globalMediaBox[1]),
          height: parseFloat(globalMediaBox[4]) - parseFloat(globalMediaBox[2]),
        };
      }

      // Default A4 dimensions in PDF points
      return { width: 595.28, height: 841.89 };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Page dimension extraction failed', { pageNumber, error: message });
      return { width: 595.28, height: 841.89 };
    }
  }

  private extractInfoField(pdfBuffer: Buffer, field: string): string | null {
    try {
      const content = pdfBuffer.toString('latin1');
      // Match /Title (value) or /Title <hex>
      const parenRegex = new RegExp(`\\/${field}\\s*\\(([^)]*?)\\)`);
      const parenMatch = content.match(parenRegex);
      if (parenMatch) {
        return this.decodePDFString(parenMatch[1]);
      }

      // Hex string variant
      const hexRegex = new RegExp(`\\/${field}\\s*<([0-9A-Fa-f]+)>`);
      const hexMatch = content.match(hexRegex);
      if (hexMatch) {
        return this.decodeHexString(hexMatch[1]);
      }

      return null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Info field extraction failed', { field, error: message });
      return null;
    }
  }

  private decodePDFString(raw: string): string {
    // Handle common PDF escape sequences
    return raw
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
      .replace(/\\([()])/g, '$1');
  }

  private decodeHexString(hex: string): string {
    const bytes: number[] = [];
    for (let i = 0; i < hex.length - 1; i += 2) {
      bytes.push(parseInt(hex.substring(i, i + 2), 16));
    }
    return Buffer.from(bytes).toString('utf-8');
  }

  private parseTextBlock(block: string): PDFTextElement[] {
    const elements: PDFTextElement[] = [];
    const lines = block.split('\n');

    let currentX = 0;
    let currentY = 0;
    let currentFontName = 'unknown';
    let currentFontSize = 12;
    let currentColor = '#000000';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      const tokens = line.split(/\s+/);
      const op = tokens[tokens.length - 1];

      // Text matrix: a b c d e f Tm
      if (op === 'Tm' && tokens.length >= 7) {
        currentX = parseFloat(tokens[tokens.length - 3]);
        currentY = parseFloat(tokens[tokens.length - 2]);
        const scaleX = parseFloat(tokens[tokens.length - 7]);
        if (!Number.isNaN(scaleX) && scaleX > 0) {
          currentFontSize = Math.abs(scaleX);
        }
      }

      // Text displacement: tx ty Td  or  tx ty TD
      if ((op === 'Td' || op === 'TD') && tokens.length >= 3) {
        const tx = parseFloat(tokens[tokens.length - 3]);
        const ty = parseFloat(tokens[tokens.length - 2]);
        if (!Number.isNaN(tx)) currentX += tx;
        if (!Number.isNaN(ty)) currentY += ty;
      }

      // Font selection: /FontName size Tf
      if (op === 'Tf' && tokens.length >= 3) {
        const fontToken = tokens[tokens.length - 3];
        if (fontToken.startsWith('/')) {
          currentFontName = fontToken.substring(1);
        }
        const size = parseFloat(tokens[tokens.length - 2]);
        if (!Number.isNaN(size) && size > 0) {
          currentFontSize = size;
        }
      }

      // Non-stroking color for text: r g b rg
      if (op === 'rg' && tokens.length >= 4) {
        const r = Math.round(parseFloat(tokens[tokens.length - 4]) * 255);
        const g = Math.round(parseFloat(tokens[tokens.length - 3]) * 255);
        const b = Math.round(parseFloat(tokens[tokens.length - 2]) * 255);
        if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
          currentColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
      }

      // Grayscale: g operator for non-stroking
      if (op === 'g' && tokens.length >= 2) {
        const gray = Math.round(parseFloat(tokens[tokens.length - 2]) * 255);
        if (!Number.isNaN(gray)) {
          currentColor = `#${gray.toString(16).padStart(2, '0')}${gray.toString(16).padStart(2, '0')}${gray.toString(16).padStart(2, '0')}`;
        }
      }

      // Text showing: (string) Tj
      if (op === 'Tj') {
        const textMatch = line.match(/\(([^)]*)\)\s*Tj/);
        if (textMatch) {
          const text = this.decodePDFString(textMatch[1]);
          if (text.trim().length > 0) {
            const direction = this.detectArabicText(text) ? 'rtl' : 'ltr';
            const fontWeight = this.inferWeightFromFontName(currentFontName);
            elements.push({
              text,
              bbox: {
                x: currentX,
                y: currentY,
                width: text.length * currentFontSize * 0.6,
                height: currentFontSize,
              },
              fontName: currentFontName,
              fontSize: currentFontSize,
              fontWeight,
              color: currentColor,
              direction,
            });
          }
        }
      }

      // TJ: array of strings and kerning values  [(string) kern (string) ...] TJ
      if (op === 'TJ') {
        const arrayMatch = line.match(/\[([\s\S]*?)\]\s*TJ/);
        if (arrayMatch) {
          const arrayContent = arrayMatch[1];
          const stringParts: string[] = [];
          const stringRegex = /\(([^)]*)\)/g;
          let strMatch: RegExpExecArray | null;

          while ((strMatch = stringRegex.exec(arrayContent)) !== null) {
            stringParts.push(this.decodePDFString(strMatch[1]));
          }

          const fullText = stringParts.join('');
          if (fullText.trim().length > 0) {
            const direction = this.detectArabicText(fullText) ? 'rtl' : 'ltr';
            const fontWeight = this.inferWeightFromFontName(currentFontName);
            elements.push({
              text: fullText,
              bbox: {
                x: currentX,
                y: currentY,
                width: fullText.length * currentFontSize * 0.6,
                height: currentFontSize,
              },
              fontName: currentFontName,
              fontSize: currentFontSize,
              fontWeight,
              color: currentColor,
              direction,
            });
          }
        }
      }

      // ' and " operators (move to next line and show text)
      if (op === "'" || op === '"') {
        const textMatch = line.match(/\(([^)]*)\)\s*['"]/);
        if (textMatch) {
          const text = this.decodePDFString(textMatch[1]);
          if (text.trim().length > 0) {
            const direction = this.detectArabicText(text) ? 'rtl' : 'ltr';
            const fontWeight = this.inferWeightFromFontName(currentFontName);
            elements.push({
              text,
              bbox: {
                x: currentX,
                y: currentY,
                width: text.length * currentFontSize * 0.6,
                height: currentFontSize,
              },
              fontName: currentFontName,
              fontSize: currentFontSize,
              fontWeight,
              color: currentColor,
              direction,
            });
          }
        }
      }
    }

    return elements;
  }

  private convertPDFPathToSVG(pdfPath: string): string {
    const tokens = pdfPath.trim().split(/\s+/);
    let svgPath = '';
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      if (token === 'm' && i >= 2) {
        // Already consumed by lookahead — should not happen with our format
        // Our format is: x y m
        svgPath += `M ${tokens[i - 2]} ${tokens[i - 1]} `;
        i++;
        continue;
      }

      if (token === 'l' && i >= 2) {
        svgPath += `L ${tokens[i - 2]} ${tokens[i - 1]} `;
        i++;
        continue;
      }

      if (token === 'c' && i >= 6) {
        svgPath += `C ${tokens[i - 6]} ${tokens[i - 5]} ${tokens[i - 4]} ${tokens[i - 3]} ${tokens[i - 2]} ${tokens[i - 1]} `;
        i++;
        continue;
      }

      if (token === 're' && i >= 4) {
        const x = tokens[i - 4];
        const y = tokens[i - 3];
        const w = parseFloat(tokens[i - 2]);
        const h = parseFloat(tokens[i - 1]);
        svgPath += `M ${x} ${y} h ${w} v ${h} h ${-w} Z `;
        i++;
        continue;
      }

      if (token === 'h') {
        svgPath += 'Z ';
        i++;
        continue;
      }

      i++;
    }

    return svgPath.trim();
  }

  private filterImagesByPage(
    pdfBuffer: Buffer,
    pageNumber: number,
    allImages: PDFRasterImage[],
  ): PDFRasterImage[] {
    // If there is only one page or we cannot determine page association, return all
    const pageCount = this.estimatePageCount(pdfBuffer);
    if (pageCount <= 1) {
      return allImages;
    }

    // Heuristic: distribute images across pages based on order of appearance
    const imagesPerPage = Math.ceil(allImages.length / pageCount);
    const startIdx = (pageNumber - 1) * imagesPerPage;
    const endIdx = Math.min(startIdx + imagesPerPage, allImages.length);

    if (startIdx >= allImages.length) {
      return [];
    }

    return allImages.slice(startIdx, endIdx);
  }

  private inferWeightFromFontName(fontName: string): number {
    const lower = fontName.toLowerCase();
    if (lower.includes('bold') && lower.includes('black')) return 900;
    if (lower.includes('extrabold') || lower.includes('ultrabold')) return 800;
    if (lower.includes('bold')) return 700;
    if (lower.includes('semibold') || lower.includes('demibold')) return 600;
    if (lower.includes('medium')) return 500;
    if (lower.includes('light')) return 300;
    if (lower.includes('thin') || lower.includes('hairline')) return 100;
    if (lower.includes('extralight') || lower.includes('ultralight')) return 200;
    return 400;
  }

  private inferFontWeights(fontName: string): number[] {
    const weights: number[] = [];
    const baseWeight = this.inferWeightFromFontName(fontName);
    weights.push(baseWeight);

    // If it's a regular font, assume 400 and 700 are likely available
    if (baseWeight === 400) {
      weights.push(700);
    }

    return [...new Set(weights)].sort((a, b) => a - b);
  }

  private checkToUnicodeForArabic(fontDict: string): boolean {
    // Check if the ToUnicode CMap contains Arabic code points
    // Arabic Unicode block: 0600-06FF
    const toUnicodeSection = fontDict.match(/beginbfchar([\s\S]*?)endbfchar/);
    if (toUnicodeSection) {
      const hexValues = toUnicodeSection[1].match(/<([0-9A-Fa-f]{4,})>/g);
      if (hexValues) {
        for (const hex of hexValues) {
          const codePoint = parseInt(hex.replace(/[<>]/g, ''), 16);
          if (codePoint >= 0x0600 && codePoint <= 0x06ff) {
            return true;
          }
          if (codePoint >= 0xfb50 && codePoint <= 0xfdff) {
            return true;
          }
          if (codePoint >= 0xfe70 && codePoint <= 0xfeff) {
            return true;
          }
        }
      }
    }
    return false;
  }
}
