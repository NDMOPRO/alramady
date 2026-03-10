import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

interface FormatMetadata {
  fonts: FontInfo[];
  colors: ColorInfo[];
  styles: StyleInfo[];
  pageLayout: PageLayout;
  direction: 'ltr' | 'rtl';
  language: string;
  headers: HeaderFooterInfo[];
  footers: HeaderFooterInfo[];
  images: ImageInfo[];
  tables: TableFormatInfo[];
  lists: ListFormatInfo[];
  checksum: string;
}

interface FontInfo {
  name: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  locations: string[];
}

interface ColorInfo {
  hex: string;
  usage: 'text' | 'background' | 'border' | 'accent';
  count: number;
}

interface StyleInfo {
  name: string;
  type: 'heading' | 'paragraph' | 'list' | 'table' | 'code' | 'quote';
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  textAlign: string;
  lineHeight: number;
  marginTop: number;
  marginBottom: number;
}

interface PageLayout {
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
  columns: number;
}

interface HeaderFooterInfo {
  content: string;
  position: 'left' | 'center' | 'right';
  includesPageNumber: boolean;
}

interface ImageInfo {
  id: string;
  width: number;
  height: number;
  format: string;
  position: 'inline' | 'float-left' | 'float-right' | 'center';
  altText: string;
  captionText: string;
}

interface TableFormatInfo {
  id: string;
  rows: number;
  columns: number;
  hasHeader: boolean;
  headerStyle: { background: string; textColor: string; bold: boolean };
  borderStyle: string;
  alternateRowColors: boolean;
  columnWidths: number[];
}

interface ListFormatInfo {
  type: 'ordered' | 'unordered';
  depth: number;
  bulletStyle: string;
  itemCount: number;
}

interface PreservationReport {
  sourceFormat: string;
  targetFormat: string;
  overallScore: number;
  fontPreservation: { score: number; details: string[] };
  colorPreservation: { score: number; details: string[] };
  layoutPreservation: { score: number; details: string[] };
  tablePreservation: { score: number; details: string[] };
  imagePreservation: { score: number; details: string[] };
  contentIntegrity: { score: number; details: string[] };
  recommendations: string[];
  jobId: string;
}

export class FormatPreservationService {

  async extractFormatMetadata(
    file: Buffer,
    format: string,
    filename: string
  ): Promise<FormatMetadata> {
    logger.info('Extracting format metadata', { filename, format });
    const startTime = Date.now();

    const checksum = crypto.createHash('sha256').update(file).digest('hex');

    let metadata: FormatMetadata;

    switch (format.toLowerCase()) {
      case 'docx':
      case 'doc':
        metadata = await this.extractDocxMetadata(file, checksum);
        break;
      case 'xlsx':
      case 'xls':
        metadata = await this.extractXlsxMetadata(file, checksum);
        break;
      case 'pdf':
        metadata = await this.extractPdfMetadata(file, checksum);
        break;
      case 'html':
      case 'htm':
        metadata = this.extractHtmlMetadata(file.toString('utf-8'), checksum);
        break;
      default:
        metadata = this.createDefaultMetadata(checksum);
    }

    logger.info('Format metadata extracted', {
      filename,
      fonts: metadata.fonts.length,
      colors: metadata.colors.length,
      styles: metadata.styles.length,
      tables: metadata.tables.length,
      images: metadata.images.length,
      duration: Date.now() - startTime,
    });

    return metadata;
  }

  async validatePreservation(
    sourceBuffer: Buffer,
    convertedBuffer: Buffer,
    sourceFormat: string,
    targetFormat: string,
    tenantId: string,
    userId: string
  ): Promise<PreservationReport> {
    const startTime = Date.now();
    logger.info('Validating format preservation', { sourceFormat, targetFormat, tenantId });

    const sourceMetadata = await this.extractFormatMetadata(sourceBuffer, sourceFormat, `source.${sourceFormat}`);
    const convertedMetadata = await this.extractFormatMetadata(convertedBuffer, targetFormat, `converted.${targetFormat}`);

    const fontScore = this.compareFonts(sourceMetadata.fonts, convertedMetadata.fonts);
    const colorScore = this.compareColors(sourceMetadata.colors, convertedMetadata.colors);
    const layoutScore = this.compareLayouts(sourceMetadata.pageLayout, convertedMetadata.pageLayout);
    const tableScore = this.compareTables(sourceMetadata.tables, convertedMetadata.tables);
    const imageScore = this.compareImages(sourceMetadata.images, convertedMetadata.images);

    const sourceText = await this.extractPlainText(sourceBuffer, sourceFormat);
    const convertedText = await this.extractPlainText(convertedBuffer, targetFormat);
    const contentScore = this.compareContent(sourceText, convertedText);

    const overallScore = (
      fontScore.score * 0.15 +
      colorScore.score * 0.10 +
      layoutScore.score * 0.20 +
      tableScore.score * 0.15 +
      imageScore.score * 0.10 +
      contentScore.score * 0.30
    );

    const recommendations: string[] = [];
    if (fontScore.score < 0.7) {
      recommendations.push('Font preservation is low. Consider embedding fonts or using universal font families.');
    }
    if (colorScore.score < 0.7) {
      recommendations.push('Color preservation needs improvement. Check color space compatibility between formats.');
    }
    if (layoutScore.score < 0.7) {
      recommendations.push('Page layout differs significantly. Verify margins, orientation, and page size settings.');
    }
    if (tableScore.score < 0.7) {
      recommendations.push('Table formatting was partially lost. Check column widths and header styles.');
    }
    if (imageScore.score < 0.7) {
      recommendations.push('Some images may have been lost or resized. Verify image embedding support in target format.');
    }
    if (contentScore.score < 0.9) {
      recommendations.push('Some text content may differ. Check for encoding issues or truncation.');
    }

    if (sourceMetadata.direction === 'rtl' && convertedMetadata.direction !== 'rtl') {
      recommendations.push('RTL direction was not preserved. Ensure target format supports bidirectional text.');
    }

    const job = await prisma.conversionJob.create({
      data: {
        tenantId,
        userId,
        sourceFormat: sourceFormat.toUpperCase() as any,
        targetFormat: `${targetFormat.toUpperCase()}_VALIDATION` as any,
        sourceFilename: `validation_source.${sourceFormat}`,
        outputFilename: `preservation_report.json`,
        sourceSizeBytes: sourceBuffer.length,
        outputSizeBytes: convertedBuffer.length,
        status: 'COMPLETED',
        durationMs: Date.now() - startTime,
        metadata: JSON.stringify({
          overallScore: Math.round(overallScore * 100) / 100,
          fontScore: fontScore.score,
          colorScore: colorScore.score,
          layoutScore: layoutScore.score,
          tableScore: tableScore.score,
          imageScore: imageScore.score,
          contentScore: contentScore.score,
        }),
      },
    });

    logger.info('Format preservation validation completed', {
      jobId: job.id,
      overallScore: Math.round(overallScore * 100) / 100,
      duration: Date.now() - startTime,
    });

    return {
      sourceFormat,
      targetFormat,
      overallScore: Math.round(overallScore * 100) / 100,
      fontPreservation: fontScore,
      colorPreservation: colorScore,
      layoutPreservation: layoutScore,
      tablePreservation: tableScore,
      imagePreservation: imageScore,
      contentIntegrity: contentScore,
      recommendations,
      jobId: job.id,
    };
  }

  private async extractDocxMetadata(file: Buffer, checksum: string): Promise<FormatMetadata> {
    const [textResult, htmlResult] = await Promise.all([
      mammoth.extractRawText({ buffer: file }),
      mammoth.convertToHtml({ buffer: file }),
    ]);

    const html = htmlResult.value;
    const text = textResult.value;

    const fonts = this.extractFontsFromHtml(html);
    const colors = this.extractColorsFromHtml(html);
    const styles = this.extractStylesFromHtml(html);
    const tables = this.extractTableFormatsFromHtml(html);
    const images = this.extractImageInfoFromHtml(html);
    const lists = this.extractListFormatsFromHtml(html);
    const language = this.detectLanguage(text);

    return {
      fonts,
      colors,
      styles,
      pageLayout: {
        width: 210,
        height: 297,
        orientation: 'portrait',
        margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
        columns: 1,
      },
      direction: language === 'ar' ? 'rtl' : 'ltr',
      language,
      headers: [],
      footers: [],
      images,
      tables,
      lists,
      checksum,
    };
  }

  private async extractXlsxMetadata(file: Buffer, checksum: string): Promise<FormatMetadata> {
    const workbook = XLSX.read(file, { type: 'buffer', cellDates: true, cellStyles: true });
    const tables: TableFormatInfo[] = [];
    const allText: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
      const csv = XLSX.utils.sheet_to_csv(sheet);
      allText.push(csv);

      if (jsonData.length > 0) {
        const maxCols = Math.max(...jsonData.map((r: string[]) => (r ? r.length : 0)));
        tables.push({
          id: crypto.createHash('md5').update(sheetName).digest('hex').slice(0, 12),
          rows: jsonData.length,
          columns: maxCols,
          hasHeader: true,
          headerStyle: { background: '#4472C4', textColor: '#FFFFFF', bold: true },
          borderStyle: 'thin',
          alternateRowColors: false,
          columnWidths: Array(maxCols).fill(80),
        });
      }
    }

    const text = allText.join('\n');
    const language = this.detectLanguage(text);

    return {
      fonts: [{ name: 'Calibri', size: 11, bold: false, italic: false, underline: false, color: '#000000', locations: ['cells'] }],
      colors: [
        { hex: '#4472C4', usage: 'accent', count: 1 },
        { hex: '#000000', usage: 'text', count: 1 },
      ],
      styles: [],
      pageLayout: {
        width: 297,
        height: 210,
        orientation: 'landscape',
        margins: { top: 19, right: 19, bottom: 19, left: 19 },
        columns: 1,
      },
      direction: language === 'ar' ? 'rtl' : 'ltr',
      language,
      headers: [],
      footers: [],
      images: [],
      tables,
      lists: [],
      checksum,
    };
  }

  private async extractPdfMetadata(file: Buffer, checksum: string): Promise<FormatMetadata> {
    const pdfData = await pdfParse(file);
    const text = pdfData.text;
    const language = this.detectLanguage(text);
    const tables = this.detectTablesInPdfText(text);

    return {
      fonts: [{ name: 'Helvetica', size: 11, bold: false, italic: false, underline: false, color: '#000000', locations: ['body'] }],
      colors: [{ hex: '#000000', usage: 'text', count: 1 }],
      styles: [],
      pageLayout: {
        width: 210,
        height: 297,
        orientation: 'portrait',
        margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
        columns: 1,
      },
      direction: language === 'ar' ? 'rtl' : 'ltr',
      language,
      headers: [],
      footers: [],
      images: [],
      tables,
      lists: [],
      checksum,
    };
  }

  private extractHtmlMetadata(html: string, checksum: string): FormatMetadata {
    const text = html.replace(/<[^>]*>/g, '');
    const language = this.detectLanguage(text);

    return {
      fonts: this.extractFontsFromHtml(html),
      colors: this.extractColorsFromHtml(html),
      styles: this.extractStylesFromHtml(html),
      pageLayout: {
        width: 210,
        height: 297,
        orientation: 'portrait',
        margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
        columns: 1,
      },
      direction: html.includes('dir="rtl"') || language === 'ar' ? 'rtl' : 'ltr',
      language,
      headers: [],
      footers: [],
      images: this.extractImageInfoFromHtml(html),
      tables: this.extractTableFormatsFromHtml(html),
      lists: this.extractListFormatsFromHtml(html),
      checksum,
    };
  }

  private createDefaultMetadata(checksum: string): FormatMetadata {
    return {
      fonts: [],
      colors: [],
      styles: [],
      pageLayout: {
        width: 210,
        height: 297,
        orientation: 'portrait',
        margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
        columns: 1,
      },
      direction: 'ltr',
      language: 'en',
      headers: [],
      footers: [],
      images: [],
      tables: [],
      lists: [],
      checksum,
    };
  }

  private extractFontsFromHtml(html: string): FontInfo[] {
    const fonts = new Map<string, FontInfo>();
    const fontRegex = /font-family:\s*([^;"]+)/gi;
    let match: RegExpExecArray | null;

    while ((match = fontRegex.exec(html)) !== null) {
      const fontName = match[1].trim().replace(/['"]/g, '').split(',')[0].trim();
      if (!fonts.has(fontName)) {
        fonts.set(fontName, {
          name: fontName,
          size: 11,
          bold: false,
          italic: false,
          underline: false,
          color: '#000000',
          locations: [],
        });
      }
    }

    if (fonts.size === 0) {
      fonts.set('default', {
        name: 'Calibri',
        size: 11,
        bold: false,
        italic: false,
        underline: false,
        color: '#000000',
        locations: ['body'],
      });
    }

    return Array.from(fonts.values());
  }

  private extractColorsFromHtml(html: string): ColorInfo[] {
    const colors = new Map<string, ColorInfo>();

    const hexRegex = /#([0-9a-fA-F]{3,8})\b/g;
    let match: RegExpExecArray | null;
    while ((match = hexRegex.exec(html)) !== null) {
      const hex = `#${match[1].toLowerCase()}`;
      const existing = colors.get(hex);
      if (existing) {
        existing.count++;
      } else {
        colors.set(hex, { hex, usage: 'text', count: 1 });
      }
    }

    const rgbRegex = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/gi;
    while ((match = rgbRegex.exec(html)) !== null) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      const existing = colors.get(hex);
      if (existing) {
        existing.count++;
      } else {
        colors.set(hex, { hex, usage: 'text', count: 1 });
      }
    }

    return Array.from(colors.values());
  }

  private extractStylesFromHtml(html: string): StyleInfo[] {
    const styles: StyleInfo[] = [];

    for (let level = 1; level <= 6; level++) {
      const regex = new RegExp(`<h${level}[^>]*>`, 'gi');
      if (regex.test(html)) {
        styles.push({
          name: `Heading ${level}`,
          type: 'heading',
          fontSize: 28 - (level - 1) * 3,
          fontFamily: 'Calibri',
          fontWeight: 'bold',
          textAlign: 'left',
          lineHeight: 1.3,
          marginTop: 24 - level * 2,
          marginBottom: 12 - level,
        });
      }
    }

    if (html.includes('<p')) {
      styles.push({
        name: 'Normal',
        type: 'paragraph',
        fontSize: 11,
        fontFamily: 'Calibri',
        fontWeight: 'normal',
        textAlign: 'left',
        lineHeight: 1.5,
        marginTop: 0,
        marginBottom: 8,
      });
    }

    return styles;
  }

  private extractTableFormatsFromHtml(html: string): TableFormatInfo[] {
    const tables: TableFormatInfo[] = [];
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let match: RegExpExecArray | null;
    let idx = 0;

    while ((match = tableRegex.exec(html)) !== null) {
      const tableHtml = match[1];
      const rowMatches = tableHtml.match(/<tr/gi) || [];
      const headerMatches = tableHtml.match(/<th/gi) || [];
      const cellMatches = tableHtml.match(/<td/gi) || [];

      const totalRows = rowMatches.length;
      const hasHeader = headerMatches.length > 0;
      const columns = hasHeader
        ? headerMatches.length
        : (totalRows > 0 ? Math.ceil(cellMatches.length / totalRows) : 0);

      tables.push({
        id: crypto.createHash('md5').update(`table-${idx}`).digest('hex').slice(0, 12),
        rows: totalRows,
        columns,
        hasHeader,
        headerStyle: { background: '#4472C4', textColor: '#FFFFFF', bold: true },
        borderStyle: 'thin',
        alternateRowColors: false,
        columnWidths: Array(columns).fill(Math.round(800 / Math.max(columns, 1))),
      });
      idx++;
    }

    return tables;
  }

  private extractImageInfoFromHtml(html: string): ImageInfo[] {
    const images: ImageInfo[] = [];
    const imgRegex = /<img[^>]*>/gi;
    let match: RegExpExecArray | null;
    let idx = 0;

    while ((match = imgRegex.exec(html)) !== null) {
      const imgTag = match[0];
      const widthMatch = imgTag.match(/width="?(\d+)"?/i);
      const heightMatch = imgTag.match(/height="?(\d+)"?/i);
      const altMatch = imgTag.match(/alt="([^"]*)"/i);

      images.push({
        id: crypto.createHash('md5').update(`img-${idx}`).digest('hex').slice(0, 12),
        width: widthMatch ? parseInt(widthMatch[1], 10) : 0,
        height: heightMatch ? parseInt(heightMatch[1], 10) : 0,
        format: 'unknown',
        position: 'inline',
        altText: altMatch ? altMatch[1] : '',
        captionText: '',
      });
      idx++;
    }

    return images;
  }

  private extractListFormatsFromHtml(html: string): ListFormatInfo[] {
    const lists: ListFormatInfo[] = [];

    const ulMatches = html.match(/<ul[^>]*>([\s\S]*?)<\/ul>/gi) || [];
    for (const ulHtml of ulMatches) {
      const liCount = (ulHtml.match(/<li/gi) || []).length;
      lists.push({ type: 'unordered', depth: 1, bulletStyle: 'disc', itemCount: liCount });
    }

    const olMatches = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/gi) || [];
    for (const olHtml of olMatches) {
      const liCount = (olHtml.match(/<li/gi) || []).length;
      lists.push({ type: 'ordered', depth: 1, bulletStyle: 'decimal', itemCount: liCount });
    }

    return lists;
  }

  private detectTablesInPdfText(text: string): TableFormatInfo[] {
    const tables: TableFormatInfo[] = [];
    const lines = text.split('\n');
    let tableLineCount = 0;
    let maxCols = 0;
    let tableIdx = 0;

    for (const line of lines) {
      const tabCount = (line.match(/\t/g) || []).length;
      const pipeCount = (line.match(/\|/g) || []).length;
      const isTableLine = tabCount >= 2 || pipeCount >= 2;

      if (isTableLine) {
        tableLineCount++;
        const cols = Math.max(tabCount + 1, pipeCount - 1);
        maxCols = Math.max(maxCols, cols);
      } else if (tableLineCount >= 2) {
        tables.push({
          id: crypto.createHash('md5').update(`pdf-table-${tableIdx}`).digest('hex').slice(0, 12),
          rows: tableLineCount,
          columns: maxCols,
          hasHeader: true,
          headerStyle: { background: '#4472C4', textColor: '#FFFFFF', bold: true },
          borderStyle: 'thin',
          alternateRowColors: false,
          columnWidths: Array(maxCols).fill(80),
        });
        tableIdx++;
        tableLineCount = 0;
        maxCols = 0;
      }
    }

    return tables;
  }

  private compareFonts(
    source: FontInfo[],
    target: FontInfo[]
  ): { score: number; details: string[] } {
    const details: string[] = [];

    if (source.length === 0 && target.length === 0) {
      return { score: 1.0, details: ['No fonts to compare'] };
    }

    if (source.length === 0 || target.length === 0) {
      return { score: 0.5, details: ['Font information missing from one format'] };
    }

    const sourceNames = new Set(source.map(f => f.name.toLowerCase()));
    const targetNames = new Set(target.map(f => f.name.toLowerCase()));

    let matchCount = 0;
    for (const name of sourceNames) {
      if (targetNames.has(name)) {
        matchCount++;
        details.push(`Font "${name}" preserved`);
      } else {
        details.push(`Font "${name}" not found in target`);
      }
    }

    const score = sourceNames.size > 0 ? matchCount / sourceNames.size : 1.0;
    return { score: Math.round(score * 100) / 100, details };
  }

  private compareColors(
    source: ColorInfo[],
    target: ColorInfo[]
  ): { score: number; details: string[] } {
    const details: string[] = [];

    if (source.length === 0 && target.length === 0) {
      return { score: 1.0, details: ['No colors to compare'] };
    }

    if (source.length === 0 || target.length === 0) {
      return { score: 0.5, details: ['Color information missing from one format'] };
    }

    const sourceHexes = new Set(source.map(c => c.hex));
    const targetHexes = new Set(target.map(c => c.hex));

    let matchCount = 0;
    for (const hex of sourceHexes) {
      if (targetHexes.has(hex)) {
        matchCount++;
      }
    }

    const score = sourceHexes.size > 0 ? matchCount / sourceHexes.size : 1.0;
    details.push(`${matchCount}/${sourceHexes.size} colors preserved`);
    return { score: Math.round(score * 100) / 100, details };
  }

  private compareLayouts(
    source: PageLayout,
    target: PageLayout
  ): { score: number; details: string[] } {
    const details: string[] = [];
    let score = 1.0;

    if (source.orientation !== target.orientation) {
      score -= 0.3;
      details.push(`Orientation changed: ${source.orientation} -> ${target.orientation}`);
    }

    const widthDiff = Math.abs(source.width - target.width) / source.width;
    const heightDiff = Math.abs(source.height - target.height) / source.height;
    if (widthDiff > 0.05 || heightDiff > 0.05) {
      score -= 0.2;
      details.push(`Page size changed: ${source.width}x${source.height} -> ${target.width}x${target.height}`);
    }

    const marginDiffs = [
      Math.abs(source.margins.top - target.margins.top),
      Math.abs(source.margins.right - target.margins.right),
      Math.abs(source.margins.bottom - target.margins.bottom),
      Math.abs(source.margins.left - target.margins.left),
    ];
    const avgMarginDiff = marginDiffs.reduce((a, b) => a + b, 0) / 4;
    if (avgMarginDiff > 5) {
      score -= 0.15;
      details.push(`Margins differ by average of ${avgMarginDiff.toFixed(1)}mm`);
    }

    if (details.length === 0) {
      details.push('Layout fully preserved');
    }

    return { score: Math.max(0, Math.round(score * 100) / 100), details };
  }

  private compareTables(
    source: TableFormatInfo[],
    target: TableFormatInfo[]
  ): { score: number; details: string[] } {
    const details: string[] = [];

    if (source.length === 0 && target.length === 0) {
      return { score: 1.0, details: ['No tables to compare'] };
    }

    if (source.length === 0 || target.length === 0) {
      return { score: target.length === 0 && source.length > 0 ? 0.0 : 0.5, details: [`Source tables: ${source.length}, Target tables: ${target.length}`] };
    }

    const countMatch = Math.min(source.length, target.length) / Math.max(source.length, target.length);
    details.push(`Table count: ${source.length} source, ${target.length} target`);

    let structureScore = 0;
    const pairs = Math.min(source.length, target.length);
    for (let i = 0; i < pairs; i++) {
      const s = source[i];
      const t = target[i];
      let pairScore = 0;
      if (s.rows === t.rows) pairScore += 0.3;
      if (s.columns === t.columns) pairScore += 0.3;
      if (s.hasHeader === t.hasHeader) pairScore += 0.2;
      if (s.borderStyle === t.borderStyle) pairScore += 0.2;
      structureScore += pairScore;
    }
    structureScore /= Math.max(pairs, 1);

    const score = countMatch * 0.4 + structureScore * 0.6;
    return { score: Math.round(score * 100) / 100, details };
  }

  private compareImages(
    source: ImageInfo[],
    target: ImageInfo[]
  ): { score: number; details: string[] } {
    const details: string[] = [];

    if (source.length === 0 && target.length === 0) {
      return { score: 1.0, details: ['No images to compare'] };
    }

    if (source.length > 0 && target.length === 0) {
      return { score: 0.0, details: [`All ${source.length} images lost in conversion`] };
    }

    const countRatio = Math.min(target.length, source.length) / Math.max(source.length, 1);
    details.push(`Source images: ${source.length}, Target images: ${target.length}`);

    return { score: Math.round(countRatio * 100) / 100, details };
  }

  private compareContent(
    sourceText: string,
    targetText: string
  ): { score: number; details: string[] } {
    const details: string[] = [];

    const normalize = (text: string): string =>
      text.replace(/\s+/g, ' ').trim().toLowerCase();

    const normalizedSource = normalize(sourceText);
    const normalizedTarget = normalize(targetText);

    if (normalizedSource.length === 0 && normalizedTarget.length === 0) {
      return { score: 1.0, details: ['Both empty'] };
    }

    if (normalizedSource === normalizedTarget) {
      return { score: 1.0, details: ['Content identical'] };
    }

    const sourceWords = new Set(normalizedSource.split(' '));
    const targetWords = new Set(normalizedTarget.split(' '));

    let matchCount = 0;
    for (const word of sourceWords) {
      if (targetWords.has(word)) matchCount++;
    }

    const precision = targetWords.size > 0 ? matchCount / targetWords.size : 0;
    const recall = sourceWords.size > 0 ? matchCount / sourceWords.size : 0;

    const f1 = precision + recall > 0
      ? 2 * (precision * recall) / (precision + recall)
      : 0;

    const lengthRatio = Math.min(normalizedSource.length, normalizedTarget.length) /
      Math.max(normalizedSource.length, normalizedTarget.length);

    const score = f1 * 0.7 + lengthRatio * 0.3;

    details.push(`Word overlap F1: ${f1.toFixed(3)}`);
    details.push(`Length ratio: ${lengthRatio.toFixed(3)}`);
    details.push(`Source words: ${sourceWords.size}, Target words: ${targetWords.size}`);

    return { score: Math.round(score * 100) / 100, details };
  }

  private async extractPlainText(buffer: Buffer, format: string): Promise<string> {
    switch (format.toLowerCase()) {
      case 'docx':
      case 'doc': {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      }
      case 'pdf': {
        const data = await pdfParse(buffer);
        return data.text;
      }
      case 'xlsx':
      case 'xls': {
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const texts: string[] = [];
        for (const name of wb.SheetNames) {
          texts.push(XLSX.utils.sheet_to_csv(wb.Sheets[name]));
        }
        return texts.join('\n');
      }
      case 'html':
      case 'htm':
        return buffer.toString('utf-8').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      case 'txt':
      case 'csv':
      case 'json':
      case 'xml':
      case 'md':
        return buffer.toString('utf-8');
      default:
        return '';
    }
  }

  private detectLanguage(text: string): string {
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
    const matches = text.match(arabicPattern);
    const arabicCount = matches ? matches.length : 0;
    const totalChars = text.replace(/\s/g, '').length;
    return totalChars > 0 && arabicCount / totalChars > 0.3 ? 'ar' : 'en';
  }
}

export const formatPreservationService = new FormatPreservationService();
