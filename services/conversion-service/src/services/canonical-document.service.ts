/**
 * Canonical Document Representation — Rasid Platform
 * تمثيل مستندي أساسي وموحد (Canonical Document Representation)
 * يغطي: F-03775
 *
 * يحوّل أي مستند (PDF, DOCX, PPTX, HTML, MD, Excel, صور)
 * إلى تمثيل موحد يمكن معالجته وتحويله لأي صيغة أخرى
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// ─── Canonical Types ─────────────────────────────────────────

interface CanonicalDocument {
  id: string;
  title: string;
  language: string;
  direction: 'ltr' | 'rtl';
  metadata: DocumentMetadata;
  sections: CanonicalSection[];
  styles: DocumentStyles;
  assets: DocumentAsset[];
  createdAt: string;
  sourceFormat: string;
}

interface DocumentMetadata {
  author?: string;
  createdDate?: string;
  modifiedDate?: string;
  subject?: string;
  keywords?: string[];
  pageCount?: number;
  wordCount?: number;
  encoding?: string;
  customProperties?: Record<string, string>;
}

interface CanonicalSection {
  id: string;
  type: SectionType;
  order: number;
  content: SectionContent;
  children?: CanonicalSection[];
  style?: SectionStyle;
}

type SectionType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'image'
  | 'chart'
  | 'code'
  | 'quote'
  | 'divider'
  | 'page_break'
  | 'header'
  | 'footer'
  | 'slide'
  | 'note'
  | 'formula';

interface SectionContent {
  text?: string;
  richText?: RichTextSpan[];
  level?: number; // for headings (1-6) and lists
  listType?: 'ordered' | 'unordered';
  items?: string[];
  tableData?: TableContent;
  imageData?: ImageContent;
  chartData?: ChartContent;
  codeLanguage?: string;
  formulaLatex?: string;
}

interface RichTextSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
  backgroundColor?: string;
  fontSize?: number;
  fontFamily?: string;
  link?: string;
  superscript?: boolean;
  subscript?: boolean;
}

interface TableContent {
  headers: string[];
  rows: string[][];
  columnWidths?: number[];
  mergedCells?: Array<{ row: number; col: number; rowSpan: number; colSpan: number }>;
}

interface ImageContent {
  assetId: string;
  alt: string;
  width?: number;
  height?: number;
  caption?: string;
}

interface ChartContent {
  type: string;
  title: string;
  data: Record<string, unknown>;
  options?: Record<string, unknown>;
}

interface SectionStyle {
  alignment?: 'left' | 'center' | 'right' | 'justify';
  margin?: { top: number; right: number; bottom: number; left: number };
  padding?: { top: number; right: number; bottom: number; left: number };
  backgroundColor?: string;
  border?: string;
  indent?: number;
}

interface DocumentStyles {
  defaultFont: string;
  defaultFontSize: number;
  defaultColor: string;
  defaultLineHeight: number;
  pageSize: { width: number; height: number };
  margins: { top: number; right: number; bottom: number; left: number };
  headingStyles: Record<number, { fontSize: number; fontWeight: string; color: string }>;
}

interface DocumentAsset {
  id: string;
  type: 'image' | 'font' | 'stylesheet' | 'embedded';
  name: string;
  mimeType: string;
  data: Buffer;
  width?: number;
  height?: number;
}

// ─── Service ─────────────────────────────────────────────────

export class CanonicalDocumentService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * تحويل مستند من أي صيغة إلى التمثيل الموحد
   */
  async fromBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<CanonicalDocument> {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const docId = this.generateId();

    logger.info('Converting to canonical form', { filename, mimeType, size: buffer.length });

    let doc: CanonicalDocument;

    switch (true) {
      case mimeType.includes('pdf') || ext === 'pdf':
        doc = await this.fromPdf(docId, buffer, filename);
        break;
      case mimeType.includes('wordprocessing') || ext === 'docx':
        doc = await this.fromDocx(docId, buffer, filename);
        break;
      case mimeType.includes('presentation') || ext === 'pptx':
        doc = await this.fromPptx(docId, buffer, filename);
        break;
      case mimeType.includes('spreadsheet') || ext === 'xlsx':
        doc = await this.fromXlsx(docId, buffer, filename);
        break;
      case mimeType.includes('html') || ext === 'html':
        doc = await this.fromHtml(docId, buffer.toString('utf-8'), filename);
        break;
      case mimeType.includes('markdown') || ext === 'md':
        doc = await this.fromMarkdown(docId, buffer.toString('utf-8'), filename);
        break;
      case mimeType.startsWith('image/'):
        doc = await this.fromImage(docId, buffer, filename, mimeType);
        break;
      case mimeType.includes('text/plain') || ext === 'txt':
        doc = await this.fromPlainText(docId, buffer.toString('utf-8'), filename);
        break;
      default:
        doc = await this.fromPlainText(docId, buffer.toString('utf-8'), filename);
    }

    logger.info('Canonical document created', {
      docId,
      sections: doc.sections.length,
      assets: doc.assets.length,
    });

    return doc;
  }

  /**
   * تحويل التمثيل الموحد إلى صيغة مخرجات
   */
  async toFormat(
    doc: CanonicalDocument,
    format: 'pdf' | 'docx' | 'pptx' | 'html' | 'md' | 'txt'
  ): Promise<Buffer> {
    logger.info('Converting canonical to format', { docId: doc.id, format });

    switch (format) {
      case 'html':
        return Buffer.from(this.toHtml(doc));
      case 'md':
        return Buffer.from(this.toMarkdown(doc));
      case 'txt':
        return Buffer.from(this.toPlainText(doc));
      case 'pdf':
        return this.toPdf(doc);
      case 'docx':
        return this.toDocxBuffer(doc);
      case 'pptx':
        return this.toPptxBuffer(doc);
      default:
        throw new Error(`Unsupported output format: ${format}`);
    }
  }

  // ─── From Converters ──────────────────────────────────────

  private async fromPdf(
    docId: string,
    buffer: Buffer,
    filename: string
  ): Promise<CanonicalDocument> {
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(buffer);

    const paragraphs = parsed.text.split(/\n\n+/).filter((p) => p.trim());
    const sections: CanonicalSection[] = paragraphs.map((text, idx) => ({
      id: `${docId}-s${idx}`,
      type: this.detectSectionType(text),
      order: idx,
      content: { text: text.trim() },
    }));

    return this.createDocument(docId, filename, 'pdf', {
      pageCount: parsed.numpages,
      wordCount: parsed.text.split(/\s+/).length,
      author: parsed.info?.Author,
      createdDate: parsed.info?.CreationDate,
    }, sections);
  }

  private async fromDocx(
    docId: string,
    buffer: Buffer,
    filename: string
  ): Promise<CanonicalDocument> {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.convertToHtml({ buffer });
    return this.fromHtml(docId, result.value, filename);
  }

  private async fromPptx(
    docId: string,
    buffer: Buffer,
    filename: string
  ): Promise<CanonicalDocument> {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(buffer);

    const sections: CanonicalSection[] = [];
    const slideEntries = zip.getEntries()
      .filter((e) => e.entryName.match(/ppt\/slides\/slide\d+\.xml/))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.match(/slide(\d+)/)?.[1] ?? '0', 10);
        const numB = parseInt(b.entryName.match(/slide(\d+)/)?.[1] ?? '0', 10);
        return numA - numB;
      });

    for (let i = 0; i < slideEntries.length; i++) {
      const xmlContent = slideEntries[i].getData().toString('utf-8');
      // Extract text content from XML
      const textMatches = xmlContent.match(/<a:t[^>]*>([^<]+)<\/a:t>/g);
      const texts = (textMatches ?? []).map((m) => m.replace(/<[^>]+>/g, ''));

      sections.push({
        id: `${docId}-slide${i}`,
        type: 'slide',
        order: i,
        content: {
          text: texts.join('\n'),
          level: i + 1,
        },
      });
    }

    return this.createDocument(docId, filename, 'pptx', {
      pageCount: slideEntries.length,
    }, sections);
  }

  private async fromXlsx(
    docId: string,
    buffer: Buffer,
    filename: string
  ): Promise<CanonicalDocument> {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const sections: CanonicalSection[] = [];

    workbook.eachSheet((sheet, sheetId) => {
      const headers: string[] = [];
      const rows: string[][] = [];

      sheet.eachRow((row, rowNumber) => {
        const values = row.values as (string | number | null)[];
        const cells = values.slice(1).map((v) => String(v ?? ''));

        if (rowNumber === 1) {
          headers.push(...cells);
        } else {
          rows.push(cells);
        }
      });

      sections.push({
        id: `${docId}-sheet${sheetId}`,
        type: 'table',
        order: sheetId - 1,
        content: {
          text: sheet.name,
          tableData: { headers, rows },
        },
      });
    });

    return this.createDocument(docId, filename, 'xlsx', {}, sections);
  }

  private async fromHtml(
    docId: string,
    html: string,
    filename: string
  ): Promise<CanonicalDocument> {
    // Simple HTML to sections parser
    const sections: CanonicalSection[] = [];
    let order = 0;

    // Extract headings
    const headingPattern = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
    let match: RegExpExecArray | null;
    while ((match = headingPattern.exec(html)) !== null) {
      sections.push({
        id: `${docId}-s${order}`,
        type: 'heading',
        order: order++,
        content: {
          text: match[2].replace(/<[^>]+>/g, '').trim(),
          level: parseInt(match[1], 10),
        },
      });
    }

    // Extract paragraphs
    const paraPattern = /<p[^>]*>(.*?)<\/p>/gi;
    while ((match = paraPattern.exec(html)) !== null) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text) {
        sections.push({
          id: `${docId}-s${order}`,
          type: 'paragraph',
          order: order++,
          content: { text },
        });
      }
    }

    // Sort by document position
    sections.sort((a, b) => a.order - b.order);

    return this.createDocument(docId, filename, 'html', {
      wordCount: html.replace(/<[^>]+>/g, '').split(/\s+/).length,
    }, sections);
  }

  private async fromMarkdown(
    docId: string,
    md: string,
    filename: string
  ): Promise<CanonicalDocument> {
    const sections: CanonicalSection[] = [];
    const lines = md.split('\n');
    let order = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('#')) {
        const level = trimmed.match(/^#+/)?.[0].length ?? 1;
        sections.push({
          id: `${docId}-s${order}`,
          type: 'heading',
          order: order++,
          content: {
            text: trimmed.replace(/^#+\s*/, ''),
            level,
          },
        });
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        sections.push({
          id: `${docId}-s${order}`,
          type: 'list',
          order: order++,
          content: {
            text: trimmed.replace(/^[-*]\s+/, ''),
            listType: 'unordered',
          },
        });
      } else if (/^\d+\.\s/.test(trimmed)) {
        sections.push({
          id: `${docId}-s${order}`,
          type: 'list',
          order: order++,
          content: {
            text: trimmed.replace(/^\d+\.\s+/, ''),
            listType: 'ordered',
          },
        });
      } else if (trimmed.startsWith('```')) {
        sections.push({
          id: `${docId}-s${order}`,
          type: 'code',
          order: order++,
          content: {
            text: trimmed.replace(/^```\w*\s*/, '').replace(/```$/, ''),
            codeLanguage: trimmed.match(/^```(\w+)/)?.[1],
          },
        });
      } else if (trimmed.startsWith('>')) {
        sections.push({
          id: `${docId}-s${order}`,
          type: 'quote',
          order: order++,
          content: { text: trimmed.replace(/^>\s*/, '') },
        });
      } else {
        sections.push({
          id: `${docId}-s${order}`,
          type: 'paragraph',
          order: order++,
          content: { text: trimmed },
        });
      }
    }

    return this.createDocument(docId, filename, 'md', {
      wordCount: md.split(/\s+/).length,
    }, sections);
  }

  private async fromImage(
    docId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<CanonicalDocument> {
    const sections: CanonicalSection[] = [
      {
        id: `${docId}-s0`,
        type: 'image',
        order: 0,
        content: {
          imageData: {
            assetId: `${docId}-asset0`,
            alt: filename,
          },
        },
      },
    ];

    const assets: DocumentAsset[] = [
      {
        id: `${docId}-asset0`,
        type: 'image',
        name: filename,
        mimeType,
        data: buffer,
      },
    ];

    return this.createDocument(docId, filename, mimeType.split('/')[1] ?? 'image', {}, sections, assets);
  }

  private async fromPlainText(
    docId: string,
    text: string,
    filename: string
  ): Promise<CanonicalDocument> {
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
    const sections: CanonicalSection[] = paragraphs.map((p, idx) => ({
      id: `${docId}-s${idx}`,
      type: 'paragraph' as SectionType,
      order: idx,
      content: { text: p.trim() },
    }));

    return this.createDocument(docId, filename, 'txt', {
      wordCount: text.split(/\s+/).length,
    }, sections);
  }

  // ─── To Converters ────────────────────────────────────────

  private toHtml(doc: CanonicalDocument): string {
    const dir = doc.direction === 'rtl' ? ' dir="rtl"' : '';
    let html = `<!DOCTYPE html>\n<html lang="${doc.language}"${dir}>\n<head>\n<meta charset="utf-8">\n<title>${doc.title}</title>\n</head>\n<body>\n`;

    for (const section of doc.sections) {
      html += this.sectionToHtml(section) + '\n';
    }

    html += '</body>\n</html>';
    return html;
  }

  private sectionToHtml(section: CanonicalSection): string {
    const { type, content } = section;

    switch (type) {
      case 'heading':
        return `<h${content.level ?? 1}>${content.text ?? ''}</h${content.level ?? 1}>`;
      case 'paragraph':
        return `<p>${content.text ?? ''}</p>`;
      case 'list': {
        const tag = content.listType === 'ordered' ? 'ol' : 'ul';
        const items = content.items ?? [content.text ?? ''];
        return `<${tag}>${items.map((i) => `<li>${i}</li>`).join('')}</${tag}>`;
      }
      case 'table':
        return this.tableToHtml(content.tableData);
      case 'image':
        return `<figure><img src="${content.imageData?.assetId ?? ''}" alt="${content.imageData?.alt ?? ''}" /></figure>`;
      case 'code':
        return `<pre><code class="${content.codeLanguage ?? ''}">${content.text ?? ''}</code></pre>`;
      case 'quote':
        return `<blockquote>${content.text ?? ''}</blockquote>`;
      case 'divider':
        return '<hr />';
      default:
        return `<div>${content.text ?? ''}</div>`;
    }
  }

  private tableToHtml(table?: TableContent): string {
    if (!table) return '';
    let html = '<table>\n<thead><tr>';
    for (const h of table.headers) {
      html += `<th>${h}</th>`;
    }
    html += '</tr></thead>\n<tbody>';
    for (const row of table.rows) {
      html += '<tr>';
      for (const cell of row) {
        html += `<td>${cell}</td>`;
      }
      html += '</tr>\n';
    }
    html += '</tbody></table>';
    return html;
  }

  private toMarkdown(doc: CanonicalDocument): string {
    let md = `# ${doc.title}\n\n`;

    for (const section of doc.sections) {
      const { type, content } = section;

      switch (type) {
        case 'heading':
          md += `${'#'.repeat(content.level ?? 1)} ${content.text ?? ''}\n\n`;
          break;
        case 'paragraph':
          md += `${content.text ?? ''}\n\n`;
          break;
        case 'list': {
          const items = content.items ?? [content.text ?? ''];
          items.forEach((item, i) => {
            md += content.listType === 'ordered' ? `${i + 1}. ${item}\n` : `- ${item}\n`;
          });
          md += '\n';
          break;
        }
        case 'table':
          if (content.tableData) {
            md += `| ${content.tableData.headers.join(' | ')} |\n`;
            md += `| ${content.tableData.headers.map(() => '---').join(' | ')} |\n`;
            for (const row of content.tableData.rows) {
              md += `| ${row.join(' | ')} |\n`;
            }
            md += '\n';
          }
          break;
        case 'code':
          md += `\`\`\`${content.codeLanguage ?? ''}\n${content.text ?? ''}\n\`\`\`\n\n`;
          break;
        case 'quote':
          md += `> ${content.text ?? ''}\n\n`;
          break;
        case 'divider':
          md += '---\n\n';
          break;
        default:
          md += `${content.text ?? ''}\n\n`;
      }
    }

    return md;
  }

  private toPlainText(doc: CanonicalDocument): string {
    return doc.sections
      .map((s) => s.content.text ?? '')
      .filter(Boolean)
      .join('\n\n');
  }

  private async toPdf(doc: CanonicalDocument): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;
    return new Promise((resolve, reject) => {
      const pdfDoc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);

      // Title
      pdfDoc.fontSize(24).text(doc.title, { align: 'center' });
      pdfDoc.moveDown(2);

      // Sections
      for (const section of doc.sections) {
        const { type, content } = section;
        switch (type) {
          case 'heading':
            pdfDoc.fontSize(20 - (content.level ?? 1) * 2).text(content.text ?? '');
            pdfDoc.moveDown(0.5);
            break;
          case 'paragraph':
            pdfDoc.fontSize(12).text(content.text ?? '');
            pdfDoc.moveDown(0.5);
            break;
          default:
            if (content.text) {
              pdfDoc.fontSize(12).text(content.text);
              pdfDoc.moveDown(0.5);
            }
        }
      }

      pdfDoc.end();
    });
  }

  private async toDocxBuffer(doc: CanonicalDocument): Promise<Buffer> {
    const { Document, Paragraph, Packer } = await import('docx') as unknown as { Document: new (opts: Record<string, unknown>) => Record<string, unknown>; Paragraph: new (opts: Record<string, unknown>) => unknown; Packer: { toBuffer: (doc: unknown) => Promise<ArrayBuffer> } };
    const children: InstanceType<typeof Paragraph>[] = [];

    for (const section of doc.sections) {
      const { type, content } = section;
      switch (type) {
        case 'heading':
          children.push(
            new Paragraph({
              text: content.text ?? '',
              heading: `Heading${content.level ?? 1}`,
            })
          );
          break;
        case 'paragraph':
          children.push(
            new Paragraph({ text: content.text ?? '' })
          );
          break;
        default:
          if (content.text) {
            children.push(new Paragraph({ text: content.text }));
          }
      }
    }

    const document = new Document({
      sections: [{ properties: {}, children }],
    });

    return Buffer.from(await Packer.toBuffer(document));
  }

  private async toPptxBuffer(doc: CanonicalDocument): Promise<Buffer> {
    const PptxGenJSModule = await import('pptxgenjs');
    const PptxGenJS = PptxGenJSModule.default as unknown as new () => { layout: string; addSlide: () => { addText: (text: string, opts: Record<string, unknown>) => void }; write: (opts: Record<string, unknown>) => Promise<ArrayBuffer> };
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';

    const slides = doc.sections.filter((s) => s.type === 'slide');
    const contentSections = slides.length > 0 ? slides : doc.sections;

    for (const section of contentSections) {
      const slide = pptx.addSlide();
      slide.addText(section.content.text ?? '', {
        x: 0.5,
        y: 0.5,
        w: '90%',
        h: '80%',
        fontSize: section.type === 'heading' ? 28 : 18,
        align: doc.direction === 'rtl' ? 'right' : 'left',
        rtlMode: doc.direction === 'rtl',
      });
    }

    return Buffer.from(await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer);
  }

  // ─── Helpers ──────────────────────────────────────────────

  private createDocument(
    docId: string,
    filename: string,
    sourceFormat: string,
    metadata: Partial<DocumentMetadata>,
    sections: CanonicalSection[],
    assets: DocumentAsset[] = []
  ): CanonicalDocument {
    const hasArabic = sections.some((s) => /[\u0600-\u06FF]/.test(s.content.text ?? ''));

    return {
      id: docId,
      title: filename.replace(/\.[^.]+$/, ''),
      language: hasArabic ? 'ar' : 'en',
      direction: hasArabic ? 'rtl' : 'ltr',
      metadata: {
        ...metadata,
        encoding: 'utf-8',
      },
      sections,
      styles: {
        defaultFont: hasArabic ? 'Cairo' : 'Inter',
        defaultFontSize: 14,
        defaultColor: '#1F2937',
        defaultLineHeight: 1.6,
        pageSize: { width: 595, height: 842 }, // A4
        margins: { top: 50, right: 50, bottom: 50, left: 50 },
        headingStyles: {
          1: { fontSize: 28, fontWeight: 'bold', color: '#111827' },
          2: { fontSize: 24, fontWeight: 'bold', color: '#1F2937' },
          3: { fontSize: 20, fontWeight: 'bold', color: '#374151' },
          4: { fontSize: 18, fontWeight: 'semibold', color: '#4B5563' },
          5: { fontSize: 16, fontWeight: 'semibold', color: '#6B7280' },
          6: { fontSize: 14, fontWeight: 'semibold', color: '#9CA3AF' },
        },
      },
      assets,
      createdAt: new Date().toISOString(),
      sourceFormat,
    };
  }

  private detectSectionType(text: string): SectionType {
    if (text.length < 80 && /^[A-Z\u0600-\u06FF]/.test(text) && !text.endsWith('.')) {
      return 'heading';
    }
    return 'paragraph';
  }

  private generateId(): string {
    const { randomBytes } = require('crypto');
    return `cdoc_${Date.now()}_${randomBytes(5).toString('hex')}`;
  }
}
