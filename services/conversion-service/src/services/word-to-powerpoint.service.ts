import mammoth from 'mammoth';
import pptxgen from 'pptxgenjs';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

interface SlideContent {
  type: 'title' | 'section' | 'content' | 'bullets' | 'table' | 'image-text';
  title: string;
  body: string[];
  level: number;
  tableData?: { headers: string[]; rows: string[][] };
}

interface WordToPptxOptions {
  theme: 'professional' | 'modern' | 'minimal' | 'corporate';
  slideSize: 'LAYOUT_16x9' | 'LAYOUT_16x10' | 'LAYOUT_4x3';
  maxBulletsPerSlide: number;
  autoSplit: boolean;
  includeTableOfContents: boolean;
  rtlSupport: boolean;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
}

interface WordToPptxResult {
  buffer: Buffer;
  outputFilename: string;
  mimeType: string;
  jobId: string;
  slidesCreated: number;
  sectionsDetected: number;
}

const THEME_COLORS: Record<string, { primary: string; secondary: string; accent: string; bg: string; textDark: string; textLight: string }> = {
  professional: { primary: '2B5797', secondary: '4472C4', accent: 'ED7D31', bg: 'FFFFFF', textDark: '1A1A2E', textLight: 'FFFFFF' },
  modern: { primary: '0D1B2A', secondary: '1B263B', accent: '00B4D8', bg: 'FFFFFF', textDark: '0D1B2A', textLight: 'FFFFFF' },
  minimal: { primary: '333333', secondary: '666666', accent: '0066CC', bg: 'FFFFFF', textDark: '222222', textLight: 'FFFFFF' },
  corporate: { primary: '1A365D', secondary: '2D3748', accent: 'DD6B20', bg: 'F7FAFC', textDark: '1A202C', textLight: 'FFFFFF' },
};

export class WordToPowerPointService {

  async convert(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string,
    options: Partial<WordToPptxOptions> = {}
  ): Promise<WordToPptxResult> {
    const startTime = Date.now();
    const opts: WordToPptxOptions = {
      theme: 'professional',
      slideSize: 'LAYOUT_16x9',
      maxBulletsPerSlide: 6,
      autoSplit: true,
      includeTableOfContents: true,
      rtlSupport: false,
      primaryColor: '',
      secondaryColor: '',
      fontFamily: 'Calibri',
      ...options,
    };

    const theme = THEME_COLORS[opts.theme] || THEME_COLORS.professional;
    if (!opts.primaryColor) opts.primaryColor = theme.primary;
    if (!opts.secondaryColor) opts.secondaryColor = theme.secondary;

    logger.info('Starting Word to PowerPoint conversion', { filename, tenantId, userId, theme: opts.theme });

    const [textResult, htmlResult] = await Promise.all([
      mammoth.extractRawText({ buffer: file }),
      mammoth.convertToHtml({ buffer: file }),
    ]);

    const text = textResult.value;
    const html = htmlResult.value;

    const isArabic = this.detectArabic(text);
    if (isArabic) {
      opts.rtlSupport = true;
      if (opts.fontFamily === 'Calibri') {
        opts.fontFamily = 'Arial';
      }
    }

    logger.info('Document parsed', { textLength: text.length, htmlLength: html.length, isArabic });

    const slides = this.parseDocumentToSlides(text, html, opts);
    logger.info('Slides planned', { slideCount: slides.length });

    const pptx = new pptxgen();
    pptx.layout = opts.slideSize;
    pptx.author = 'RASID Conversion Service';
    pptx.company = 'RASID Platform';
    pptx.subject = `Converted from: ${filename}`;
    pptx.title = filename.replace(/\.docx?$/i, '');

    if (opts.rtlSupport) {
      pptx.rtlMode = true;
    }

    const documentTitle = this.extractDocumentTitle(text);

    this.addTitleSlide(pptx, documentTitle, filename, theme, opts);

    if (opts.includeTableOfContents && slides.length > 3) {
      this.addTableOfContentsSlide(pptx, slides, theme, opts);
    }

    for (const slide of slides) {
      this.addContentSlide(pptx, slide, theme, opts);
    }

    this.addEndSlide(pptx, theme, opts);

    const outputBuffer = Buffer.from(await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer);
    const outputFilename = filename.replace(/\.docx?$/i, '.pptx') || 'converted.pptx';

    const job = await prisma.conversionJob.create({
      data: {
        tenantId,
        userId,
        sourceFormat: 'DOCX',
        targetFormat: 'PPTX',
        sourceFilename: filename,
        outputFilename,
        sourceSizeBytes: file.length,
        outputSizeBytes: outputBuffer.length,
        status: 'COMPLETED',
        durationMs: Date.now() - startTime,
        metadata: JSON.stringify({
          slidesCreated: slides.length + 2,
          sectionsDetected: slides.filter(s => s.type === 'section').length,
          theme: opts.theme,
          rtlMode: opts.rtlSupport,
        }),
      },
    });

    logger.info('Word to PowerPoint conversion completed', {
      jobId: job.id,
      slides: slides.length + 2,
      duration: Date.now() - startTime,
      outputSize: outputBuffer.length,
    });

    return {
      buffer: outputBuffer,
      outputFilename,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      jobId: job.id,
      slidesCreated: slides.length + 2,
      sectionsDetected: slides.filter(s => s.type === 'section').length,
    };
  }

  private parseDocumentToSlides(text: string, html: string, opts: WordToPptxOptions): SlideContent[] {
    const slides: SlideContent[] = [];
    const lines = text.split('\n').filter(l => l.trim().length > 0);

    let currentSection: SlideContent | null = null;
    let currentBullets: string[] = [];

    const flushBullets = () => {
      if (currentBullets.length > 0 && currentSection) {
        if (opts.autoSplit && currentBullets.length > opts.maxBulletsPerSlide) {
          const chunks = this.chunkArray(currentBullets, opts.maxBulletsPerSlide);
          for (let i = 0; i < chunks.length; i++) {
            slides.push({
              type: 'bullets',
              title: currentSection.title + (chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''),
              body: chunks[i],
              level: currentSection.level,
            });
          }
        } else {
          slides.push({
            type: 'bullets',
            title: currentSection.title,
            body: currentBullets,
            level: currentSection.level,
          });
        }
        currentBullets = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();

      const headingLevel = this.detectHeadingLevel(trimmed);

      if (headingLevel > 0) {
        flushBullets();

        if (headingLevel <= 2) {
          currentSection = {
            type: 'section',
            title: trimmed.replace(/^#+\s*/, '').replace(/^\d+[\.\)]\s*/, ''),
            body: [],
            level: headingLevel,
          };
          slides.push(currentSection);
        } else {
          currentSection = {
            type: 'content',
            title: trimmed.replace(/^#+\s*/, '').replace(/^\d+[\.\)]\s*/, ''),
            body: [],
            level: headingLevel,
          };
        }
      } else if (/^[\-\*\u2022\u25CB\u25CF\u2013]\s+/.test(trimmed) || /^\d+[\.\)]\s+/.test(trimmed)) {
        const bulletText = trimmed.replace(/^[\-\*\u2022\u25CB\u25CF\u2013]\s+/, '').replace(/^\d+[\.\)]\s+/, '');
        currentBullets.push(bulletText);
      } else if (trimmed.length > 0) {
        if (trimmed.length > 200) {
          const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
          for (const sentence of sentences) {
            if (sentence.trim().length > 0) {
              currentBullets.push(sentence.trim());
            }
          }
        } else {
          currentBullets.push(trimmed);
        }
      }
    }

    flushBullets();

    const tables = this.extractTablesFromHtml(html);
    for (const table of tables) {
      slides.push({
        type: 'table',
        title: 'Data Table',
        body: [],
        level: 2,
        tableData: table,
      });
    }

    if (slides.length === 0) {
      const chunks = this.chunkArray(lines, opts.maxBulletsPerSlide);
      for (let i = 0; i < chunks.length; i++) {
        slides.push({
          type: 'content',
          title: `Content ${i + 1}`,
          body: chunks[i].map(l => l.trim()),
          level: 1,
        });
      }
    }

    return slides;
  }

  private addTitleSlide(
    pptx: pptxgen,
    title: string,
    filename: string,
    theme: typeof THEME_COLORS.professional,
    opts: WordToPptxOptions
  ): void {
    const slide = pptx.addSlide();
    slide.background = { color: theme.primary };

    slide.addText(title, {
      x: 0.8,
      y: 1.5,
      w: '85%',
      h: 2.0,
      fontSize: 36,
      fontFace: opts.fontFamily,
      color: theme.textLight,
      bold: true,
      align: opts.rtlSupport ? 'right' : 'left',
      valign: 'middle',
    });

    slide.addText(filename.replace(/\.docx?$/i, ''), {
      x: 0.8,
      y: 3.8,
      w: '85%',
      h: 0.6,
      fontSize: 16,
      fontFace: opts.fontFamily,
      color: 'CCCCCC',
      align: opts.rtlSupport ? 'right' : 'left',
    });

    const today = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
    slide.addText(today, {
      x: 0.8,
      y: 4.5,
      w: '85%',
      h: 0.4,
      fontSize: 12,
      fontFace: opts.fontFamily,
      color: 'AAAAAA',
      align: opts.rtlSupport ? 'right' : 'left',
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0.8,
      y: 3.5,
      w: 3.0,
      h: 0.05,
      fill: { color: theme.accent },
    });
  }

  private addTableOfContentsSlide(
    pptx: pptxgen,
    slides: SlideContent[],
    theme: typeof THEME_COLORS.professional,
    opts: WordToPptxOptions
  ): void {
    const sectionSlides = slides.filter(s => s.type === 'section' && s.level <= 2);
    if (sectionSlides.length === 0) return;

    const slide = pptx.addSlide();

    slide.addText(opts.rtlSupport ? 'المحتويات' : 'Table of Contents', {
      x: 0.8,
      y: 0.4,
      w: '85%',
      h: 0.8,
      fontSize: 28,
      fontFace: opts.fontFamily,
      color: theme.primary,
      bold: true,
      align: opts.rtlSupport ? 'right' : 'left',
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0.8,
      y: 1.15,
      w: 2.5,
      h: 0.04,
      fill: { color: theme.accent },
    });

    const tocItems: Array<{ text: string; options: pptxgen.TextPropsOptions }> = sectionSlides.map((s, idx) => ({
      text: `${idx + 1}. ${s.title}`,
      options: {
        fontSize: 16,
        fontFace: opts.fontFamily,
        color: theme.textDark,
        bullet: false,
        align: (opts.rtlSupport ? 'right' : 'left') as pptxgen.HAlign,
        paraSpaceBefore: 8,
        paraSpaceAfter: 4,
      } as pptxgen.TextPropsOptions,
    }));

    slide.addText(tocItems, {
      x: 1.0,
      y: 1.5,
      w: '80%',
      h: 3.5,
      valign: 'top',
    });
  }

  private addContentSlide(
    pptx: pptxgen,
    content: SlideContent,
    theme: typeof THEME_COLORS.professional,
    opts: WordToPptxOptions
  ): void {
    const slide = pptx.addSlide();

    if (content.type === 'section') {
      slide.background = { color: theme.secondary };

      slide.addText(content.title, {
        x: 0.8,
        y: 1.8,
        w: '85%',
        h: 2.0,
        fontSize: 32,
        fontFace: opts.fontFamily,
        color: theme.textLight,
        bold: true,
        align: opts.rtlSupport ? 'right' : 'center',
        valign: 'middle',
      });

      slide.addShape(pptx.ShapeType.rect, {
        x: 3.5,
        y: 3.9,
        w: 3.0,
        h: 0.05,
        fill: { color: theme.accent },
      });

      return;
    }

    slide.addText(content.title, {
      x: 0.5,
      y: 0.3,
      w: '90%',
      h: 0.8,
      fontSize: 24,
      fontFace: opts.fontFamily,
      color: theme.primary,
      bold: true,
      align: opts.rtlSupport ? 'right' : 'left',
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: 1.0,
      w: 2.0,
      h: 0.04,
      fill: { color: theme.accent },
    });

    if (content.type === 'table' && content.tableData) {
      const tableRows: pptxgen.TableRow[] = [];

      if (content.tableData.headers.length > 0) {
        const headerRow: pptxgen.TableCell[] = content.tableData.headers.map(h => ({
          text: h,
          options: {
            bold: true,
            fontSize: 11,
            fontFace: opts.fontFamily,
            color: theme.textLight,
            fill: { color: theme.primary },
            align: (opts.rtlSupport ? 'right' : 'left') as pptxgen.HAlign,
            valign: 'middle' as pptxgen.VAlign,
          },
        }));
        tableRows.push(headerRow);
      }

      const maxRows = Math.min(content.tableData.rows.length, 12);
      for (let i = 0; i < maxRows; i++) {
        const row: pptxgen.TableCell[] = content.tableData.rows[i].map(cell => ({
          text: cell,
          options: {
            fontSize: 10,
            fontFace: opts.fontFamily,
            color: theme.textDark,
            fill: { color: i % 2 === 0 ? 'F2F2F2' : 'FFFFFF' },
            align: (opts.rtlSupport ? 'right' : 'left') as pptxgen.HAlign,
            valign: 'middle' as pptxgen.VAlign,
          },
        }));
        tableRows.push(row);
      }

      slide.addTable(tableRows, {
        x: 0.5,
        y: 1.3,
        w: '90%',
        border: { type: 'solid', pt: 0.5, color: 'D9D9D9' },
        colW: Array(content.tableData.headers.length).fill(9.0 / content.tableData.headers.length),
        rowH: 0.35,
        autoPage: true,
      });

      return;
    }

    if (content.body.length > 0) {
      const bulletItems: Array<{ text: string; options: pptxgen.TextPropsOptions }> = content.body.map(item => ({
        text: item,
        options: {
          fontSize: 16,
          fontFace: opts.fontFamily,
          color: theme.textDark,
          bullet: { type: 'bullet' as const, style: '\u2022', indent: 15 },
          align: (opts.rtlSupport ? 'right' : 'left') as pptxgen.HAlign,
          paraSpaceBefore: 4,
          paraSpaceAfter: 4,
          lineSpacing: 22,
        } as pptxgen.TextPropsOptions,
      }));

      slide.addText(bulletItems, {
        x: 0.7,
        y: 1.3,
        w: '85%',
        h: 3.8,
        valign: 'top',
      });
    }
  }

  private addEndSlide(
    pptx: pptxgen,
    theme: typeof THEME_COLORS.professional,
    opts: WordToPptxOptions
  ): void {
    const slide = pptx.addSlide();
    slide.background = { color: theme.primary };

    const thankYouText = opts.rtlSupport ? 'شكراً لكم' : 'Thank You';

    slide.addText(thankYouText, {
      x: 0.5,
      y: 2.0,
      w: '90%',
      h: 1.5,
      fontSize: 44,
      fontFace: opts.fontFamily,
      color: theme.textLight,
      bold: true,
      align: 'center',
      valign: 'middle',
    });

    slide.addText('RASID Platform', {
      x: 0.5,
      y: 4.2,
      w: '90%',
      h: 0.5,
      fontSize: 14,
      fontFace: opts.fontFamily,
      color: 'AAAAAA',
      align: 'center',
    });
  }

  private detectHeadingLevel(line: string): number {
    if (/^#{1,6}\s+/.test(line)) {
      return (line.match(/^(#+)/) || [''])[0].length;
    }

    if (/^(Chapter|Section|Part|الفصل|القسم|الباب)\s+/i.test(line) && line.length < 100) {
      return 1;
    }

    if (/^\d+\.\s+[A-Z\u0600-\u06FF]/.test(line) && line.length < 100) {
      return 2;
    }

    if (/^\d+\.\d+\s+/.test(line) && line.length < 100) {
      return 3;
    }

    if (line === line.toUpperCase() && line.length > 3 && line.length < 80 && !/^\d/.test(line)) {
      return 1;
    }

    return 0;
  }

  private extractDocumentTitle(text: string): string {
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return 'Untitled';

    const firstLine = lines[0].trim().replace(/^#+\s*/, '');
    return firstLine.length > 120 ? firstLine.slice(0, 117) + '...' : firstLine;
  }

  private extractTablesFromHtml(html: string): Array<{ headers: string[]; rows: string[][] }> {
    const tables: Array<{ headers: string[]; rows: string[][] }> = [];
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch: RegExpExecArray | null;

    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableHtml = tableMatch[1];

      const headerCells: string[] = [];
      const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
      let thMatch: RegExpExecArray | null;
      while ((thMatch = thRegex.exec(tableHtml)) !== null) {
        headerCells.push(thMatch[1].replace(/<[^>]*>/g, '').trim());
      }

      const rows: string[][] = [];
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch: RegExpExecArray | null;
      let trIndex = 0;

      while ((trMatch = trRegex.exec(tableHtml)) !== null) {
        const rowHtml = trMatch[1];

        if (trIndex === 0 && headerCells.length > 0) {
          trIndex++;
          continue;
        }

        const cells: string[] = [];
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let tdMatch: RegExpExecArray | null;
        while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
          cells.push(tdMatch[1].replace(/<[^>]*>/g, '').trim());
        }

        if (cells.length > 0) {
          rows.push(cells);
        }

        trIndex++;
      }

      if (headerCells.length > 0 || rows.length > 0) {
        tables.push({
          headers: headerCells.length > 0 ? headerCells : (rows[0] || []),
          rows: headerCells.length > 0 ? rows : rows.slice(1),
        });
      }
    }

    return tables;
  }

  private detectArabic(text: string): boolean {
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
    const matches = text.match(arabicPattern);
    const arabicCount = matches ? matches.length : 0;
    const totalChars = text.replace(/\s/g, '').length;
    return totalChars > 0 && arabicCount / totalChars > 0.3;
  }

  private chunkArray<T>(arr: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
      chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

export const wordToPowerPointService = new WordToPowerPointService();
