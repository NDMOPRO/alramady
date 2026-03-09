import sharp from 'sharp';
import pdfParse from 'pdf-parse';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { Document, Paragraph, TextRun, HeadingLevel, Packer, PageBreak } from 'docx';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { marked } from 'marked';
import { PrismaClient } from '@prisma/client';
import { PassThrough } from 'stream';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

function collectPDFBuffer(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = new PassThrough();
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    doc.pipe(stream);
  });
}

function parseXMLNode(xmlStr: string): Record<string, unknown> | string {
  const result: Record<string, unknown> = {};
  const tagRegex = /<(\w[\w.-]*)([^>]*)>([\s\S]*?)<\/\1>/g;
  const selfCloseRegex = /<(\w[\w.-]*)([^>]*)\/>/g;
  const attrRegex = /(\w+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  let foundTags = false;

  while ((match = tagRegex.exec(xmlStr)) !== null) {
    foundTags = true;
    const tagName = match[1];
    const attrStr = match[2];
    const innerContent = match[3].trim();
    const attrs: Record<string, string> = {};
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
      attrs[`@${attrMatch[1]}`] = attrMatch[2];
    }

    const childResult = parseXMLNode(innerContent);
    let nodeValue: unknown;

    if (typeof childResult === 'string') {
      nodeValue = Object.keys(attrs).length > 0
        ? { ...attrs, '#text': childResult }
        : childResult;
    } else {
      nodeValue = { ...attrs, ...childResult };
    }

    if (result[tagName] !== undefined) {
      if (!Array.isArray(result[tagName])) {
        result[tagName] = [result[tagName]];
      }
      result[tagName].push(nodeValue);
    } else {
      result[tagName] = nodeValue;
    }
  }

  while ((match = selfCloseRegex.exec(xmlStr)) !== null) {
    foundTags = true;
    const tagName = match[1];
    const attrStr = match[2];
    const attrs: Record<string, string> = {};
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
      attrs[`@${attrMatch[1]}`] = attrMatch[2];
    }

    if (result[tagName] !== undefined) {
      if (!Array.isArray(result[tagName])) {
        result[tagName] = [result[tagName]];
      }
      result[tagName].push(Object.keys(attrs).length > 0 ? attrs : null);
    } else {
      result[tagName] = Object.keys(attrs).length > 0 ? attrs : null;
    }
  }

  if (!foundTags) {
    return xmlStr;
  }

  return result;
}

export class FormatConverterService {

  /**
   * Convert PDF to DOCX: parse PDF with pdf-parse, build DOCX with docx library,
   * preserve page structure by inserting page breaks between PDF pages.
   */
  async convertPDFtoWord(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<{ buffer: Buffer; outputFilename: string; mimeType: string; jobId: string }> {
    logger.info('Starting PDF to Word conversion', { filename, tenantId, userId });
    const startTime = Date.now();

    const pdfData = await pdfParse(file);
    const totalPages = pdfData.numpages;
    const fullText = pdfData.text;
    logger.info(`Parsed PDF: ${totalPages} pages, ${fullText.length} characters`);

    const pageTexts: string[] = [];
    const rawPages = fullText.split(/\f/);
    if (rawPages.length >= totalPages) {
      for (let i = 0; i < totalPages; i++) {
        pageTexts.push(rawPages[i] || '');
      }
    } else {
      const linesPerPage = Math.ceil(fullText.split('\n').length / Math.max(totalPages, 1));
      const allLines = fullText.split('\n');
      for (let p = 0; p < totalPages; p++) {
        const start = p * linesPerPage;
        const end = Math.min(start + linesPerPage, allLines.length);
        pageTexts.push(allLines.slice(start, end).join('\n'));
      }
    }

    const sections = pageTexts.map((pageText, pageIndex) => {
      const lines = pageText.split('\n').filter((l) => l.trim().length > 0);
      const paragraphs: Paragraph[] = [];

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const trimmed = lines[lineIdx].trim();
        const isAllCaps = trimmed === trimmed.toUpperCase() && trimmed.length > 2;
        const isShortLine = trimmed.length < 80;
        const isHeading = isAllCaps && isShortLine && !/^\d+[\.\)]/.test(trimmed);

        if (isHeading) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmed,
                  bold: true,
                  size: 28,
                  font: 'Calibri',
                }),
              ],
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 240, after: 120 },
            })
          );
        } else if (trimmed.length < 60 && lineIdx < 3 && pageIndex === 0) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmed,
                  bold: true,
                  size: 24,
                  font: 'Calibri',
                }),
              ],
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 100 },
            })
          );
        } else {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmed,
                  size: 22,
                  font: 'Calibri',
                }),
              ],
              spacing: { after: 80, line: 276 },
            })
          );
        }
      }

      if (paragraphs.length === 0) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      }

      return {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: paragraphs,
      };
    });

    const doc = new Document({
      sections,
      creator: 'RASID Conversion Service',
      description: `Converted from PDF: ${filename}, ${totalPages} pages`,
      title: filename.replace(/\.pdf$/i, ''),
    });

    const outputBuffer = await Packer.toBuffer(doc);
    const outputFilename = filename.replace(/\.pdf$/i, '.docx') || 'converted.docx';

    const job = await prisma.conversionJob.create({
      data: {
        tenantId,
        userId,
        sourceFormat: 'PDF',
        targetFormat: 'DOCX',
        sourceFilename: filename,
        outputFilename,
        sourceSizeBytes: file.length,
        outputSizeBytes: outputBuffer.length,
        pageCount: totalPages,
        status: 'COMPLETED',
        durationMs: Date.now() - startTime,
      },
    });

    logger.info('PDF to Word conversion completed', {
      jobId: job.id,
      duration: Date.now() - startTime,
      outputSize: outputBuffer.length,
    });

    return {
      buffer: outputBuffer,
      outputFilename,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      jobId: job.id,
    };
  }

  /**
   * Convert DOCX to PDF: extract HTML with mammoth, render to PDF with pdfkit.
   */
  async convertWordToPDF(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<{ buffer: Buffer; outputFilename: string; mimeType: string; jobId: string }> {
    logger.info('Starting Word to PDF conversion', { filename, tenantId, userId });
    const startTime = Date.now();

    const mammothResult = await mammoth.convertToHtml({ buffer: file });
    const htmlContent = mammothResult.value;
    const messages = mammothResult.messages;

    if (messages.length > 0) {
      logger.warn('Mammoth conversion warnings', { warnings: messages.map((m) => m.message) });
    }

    const plainTextResult = await mammoth.extractRawText({ buffer: file });
    const textLines = plainTextResult.value.split('\n').filter((l) => l.trim().length > 0);

    const pdfDoc = new PDFDocument({
      size: 'A4',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      bufferPages: true,
      info: {
        Title: filename.replace(/\.docx?$/i, ''),
        Author: 'RASID Conversion Service',
        Creator: 'RASID Platform',
      },
    });

    const bufferPromise = collectPDFBuffer(pdfDoc);

    pdfDoc.font('Helvetica');
    let currentY = pdfDoc.y;

    for (const line of textLines) {
      const trimmed = line.trim();
      const isUpperCase = trimmed === trimmed.toUpperCase() && trimmed.length > 2 && trimmed.length < 80;
      const isTitle = trimmed.length < 60 && /^[A-Z]/.test(trimmed) && !trimmed.includes('.');

      if (currentY > pdfDoc.page.height - 100) {
        pdfDoc.addPage();
        currentY = 72;
      }

      if (isUpperCase) {
        pdfDoc.fontSize(16).font('Helvetica-Bold').text(trimmed, {
          align: 'left',
          lineGap: 4,
        });
        pdfDoc.moveDown(0.5);
      } else if (isTitle && textLines.indexOf(line) < 5) {
        pdfDoc.fontSize(14).font('Helvetica-Bold').text(trimmed, {
          align: 'center',
          lineGap: 3,
        });
        pdfDoc.moveDown(0.4);
      } else {
        pdfDoc.fontSize(11).font('Helvetica').text(trimmed, {
          align: 'left',
          lineGap: 3,
          paragraphGap: 4,
        });
      }

      currentY = pdfDoc.y;
    }

    const totalPages = pdfDoc.bufferedPageRange().count;
    pdfDoc.end();
    const outputBuffer = await bufferPromise;

    const outputFilename = filename.replace(/\.docx?$/i, '.pdf') || 'converted.pdf';

    const job = await prisma.conversionJob.create({
      data: {
        tenantId,
        userId,
        sourceFormat: 'DOCX',
        targetFormat: 'PDF',
        sourceFilename: filename,
        outputFilename,
        sourceSizeBytes: file.length,
        outputSizeBytes: outputBuffer.length,
        pageCount: totalPages,
        status: 'COMPLETED',
        durationMs: Date.now() - startTime,
      },
    });

    logger.info('Word to PDF conversion completed', {
      jobId: job.id,
      pages: totalPages,
      duration: Date.now() - startTime,
    });

    return {
      buffer: outputBuffer,
      outputFilename,
      mimeType: 'application/pdf',
      jobId: job.id,
    };
  }

  /**
   * Convert Excel to PDF: parse XLSX, render data table with column headers, rows, borders.
   */
  async convertExcelToPDF(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<{ buffer: Buffer; outputFilename: string; mimeType: string; jobId: string }> {
    logger.info('Starting Excel to PDF conversion', { filename, tenantId, userId });
    const startTime = Date.now();

    const workbook = XLSX.read(file, { type: 'buffer', cellDates: true, cellStyles: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });

    if (!jsonData || jsonData.length === 0) {
      throw new Error('Excel file is empty or could not be parsed');
    }

    const maxColumns = Math.max(...jsonData.map((row: unknown[]) => (row ? row.length : 0)));
    const effectiveCols = Math.min(maxColumns, 12);

    const pdfDoc = new PDFDocument({
      size: 'A4',
      layout: effectiveCols > 6 ? 'landscape' : 'portrait',
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
      bufferPages: true,
      info: {
        Title: filename.replace(/\.xlsx?$/i, ''),
        Author: 'RASID Conversion Service',
      },
    });

    const bufferPromise = collectPDFBuffer(pdfDoc);

    pdfDoc.fontSize(14).font('Helvetica-Bold').text(`Sheet: ${sheetName}`, { align: 'center' });
    pdfDoc.moveDown(0.8);

    const pageWidth = pdfDoc.page.width - 80;
    const colWidth = Math.floor(pageWidth / effectiveCols);
    const rowHeight = 22;
    const headerRowHeight = 26;
    const startX = 40;

    for (let rowIdx = 0; rowIdx < Math.min(jsonData.length, 500); rowIdx++) {
      const row = jsonData[rowIdx] as unknown[];
      const isHeader = rowIdx === 0;
      const currentRowHeight = isHeader ? headerRowHeight : rowHeight;

      if (pdfDoc.y + currentRowHeight > pdfDoc.page.height - 60) {
        pdfDoc.addPage();
        pdfDoc.y = 50;
      }

      const cellY = pdfDoc.y;

      for (let colIdx = 0; colIdx < effectiveCols; colIdx++) {
        const cellX = startX + colIdx * colWidth;
        const cellValue = row && row[colIdx] !== undefined && row[colIdx] !== null
          ? String(row[colIdx])
          : '';

        if (isHeader) {
          pdfDoc.save();
          pdfDoc.rect(cellX, cellY, colWidth, currentRowHeight).fill('#2B5797');
          pdfDoc.restore();
          pdfDoc.fill('#FFFFFF').fontSize(9).font('Helvetica-Bold');
          pdfDoc.text(cellValue.substring(0, 30), cellX + 3, cellY + 6, {
            width: colWidth - 6,
            height: currentRowHeight - 8,
            ellipsis: true,
          });
          pdfDoc.fill('#000000');
        } else {
          const bgColor = rowIdx % 2 === 0 ? '#F2F2F2' : '#FFFFFF';
          pdfDoc.save();
          pdfDoc.rect(cellX, cellY, colWidth, currentRowHeight).fill(bgColor);
          pdfDoc.restore();
          pdfDoc.rect(cellX, cellY, colWidth, currentRowHeight).stroke('#CCCCCC');
          pdfDoc.fill('#333333').fontSize(8).font('Helvetica');
          pdfDoc.text(cellValue.substring(0, 35), cellX + 3, cellY + 5, {
            width: colWidth - 6,
            height: currentRowHeight - 8,
            ellipsis: true,
          });
          pdfDoc.fill('#000000');
        }
      }

      pdfDoc.y = cellY + currentRowHeight;
    }

    pdfDoc.moveDown(1);
    pdfDoc.fontSize(8).font('Helvetica').fillColor('#999999')
      .text(`Total rows: ${jsonData.length - 1} | Columns: ${maxColumns} | Sheet: ${sheetName}`, { align: 'center' });

    const totalPages = pdfDoc.bufferedPageRange().count;
    pdfDoc.end();
    const outputBuffer = await bufferPromise;

    const outputFilename = filename.replace(/\.xlsx?$/i, '.pdf') || 'converted.pdf';

    const job = await prisma.conversionJob.create({
      data: {
        tenantId,
        userId,
        sourceFormat: 'XLSX',
        targetFormat: 'PDF',
        sourceFilename: filename,
        outputFilename,
        sourceSizeBytes: file.length,
        outputSizeBytes: outputBuffer.length,
        pageCount: totalPages,
        status: 'COMPLETED',
        durationMs: Date.now() - startTime,
      },
    });

    logger.info('Excel to PDF conversion completed', {
      jobId: job.id,
      rows: jsonData.length,
      columns: maxColumns,
      duration: Date.now() - startTime,
    });

    return {
      buffer: outputBuffer,
      outputFilename,
      mimeType: 'application/pdf',
      jobId: job.id,
    };
  }

  /**
   * Convert Markdown to HTML using marked with GFM support and sanitization.
   */
  async convertMarkdownToHTML(md: string): Promise<{ html: string; characterCount: number }> {
    logger.info('Starting Markdown to HTML conversion', { inputLength: md.length });

    marked.setOptions({
      gfm: true,
      breaks: true,
    });

    const rawHtml = await marked(md);

    const sanitized = rawHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/on\w+='[^']*'/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed[^>]*>/gi, '');

    const fullHtml = `<!DOCTYPE html>
<html lang="en" dir="auto">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="RASID Conversion Service">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 860px; margin: 40px auto; padding: 20px; line-height: 1.7; color: #24292e; background: #fff; }
    h1, h2, h3, h4, h5, h6 { color: #1a365d; margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }
    h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #dfe2e5; padding: 8px 12px; text-align: left; }
    th { background: #4472C4; color: white; font-weight: 600; }
    tr:nth-child(even) { background: #f6f8fa; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 85%; font-family: 'SFMono-Regular', Consolas, monospace; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 6px; overflow-x: auto; line-height: 1.45; }
    pre code { background: none; padding: 0; color: inherit; }
    blockquote { border-left: 4px solid #4472C4; margin: 16px 0; padding: 8px 16px; background: #f8f9fa; color: #6a737d; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { max-width: 100%; height: auto; }
    hr { border: none; border-top: 1px solid #eaecef; margin: 24px 0; }
    ul, ol { padding-left: 2em; }
    li { margin: 4px 0; }
  </style>
</head>
<body>
${sanitized}
</body>
</html>`;

    logger.info('Markdown to HTML conversion completed', {
      inputLength: md.length,
      outputLength: fullHtml.length,
    });

    return {
      html: fullHtml,
      characterCount: fullHtml.length,
    };
  }

  /**
   * Convert HTML to PDF using pdfkit. Parses basic HTML tags and renders to PDF.
   */
  async convertHTMLtoPDF(
    html: string,
    tenantId: string,
    userId: string
  ): Promise<{ buffer: Buffer; outputFilename: string; mimeType: string; jobId: string }> {
    logger.info('Starting HTML to PDF conversion', { htmlLength: html.length, tenantId });
    const startTime = Date.now();

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : html;

    const cleanContent = bodyContent
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    const pdfDoc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      bufferPages: true,
      info: { Title: 'HTML to PDF', Author: 'RASID Conversion Service' },
    });

    const bufferPromise = collectPDFBuffer(pdfDoc);

    const tagRegex = /<(\/?)(\w+)([^>]*)>|([^<]+)/gi;
    let tagMatch: RegExpExecArray | null;
    let currentFontSize = 11;
    let currentFont = 'Helvetica';
    let isBold = false;
    let isItalic = false;
    let listDepth = 0;
    let listCounter = 0;
    let inPre = false;

    const setFont = () => {
      if (isBold && isItalic) {
        pdfDoc.font('Helvetica-BoldOblique');
      } else if (isBold) {
        pdfDoc.font('Helvetica-Bold');
      } else if (isItalic) {
        pdfDoc.font('Helvetica-Oblique');
      } else {
        pdfDoc.font(inPre ? 'Courier' : 'Helvetica');
      }
      pdfDoc.fontSize(currentFontSize);
    };

    while ((tagMatch = tagRegex.exec(cleanContent)) !== null) {
      const isClosing = tagMatch[1] === '/';
      const tagName = tagMatch[2] ? tagMatch[2].toLowerCase() : null;
      const textContent = tagMatch[4];

      if (pdfDoc.y > pdfDoc.page.height - 80) {
        pdfDoc.addPage();
      }

      if (textContent) {
        const decoded = textContent
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ');

        const trimmed = inPre ? decoded : decoded.trim();
        if (trimmed.length > 0) {
          setFont();
          const indent = listDepth * 20;
          pdfDoc.text(trimmed, 60 + indent, undefined, {
            align: 'left',
            lineGap: 3,
            continued: false,
          });
        }
        continue;
      }

      if (!tagName) continue;

      if (!isClosing) {
        switch (tagName) {
          case 'h1': currentFontSize = 22; isBold = true; pdfDoc.moveDown(0.6); break;
          case 'h2': currentFontSize = 18; isBold = true; pdfDoc.moveDown(0.5); break;
          case 'h3': currentFontSize = 15; isBold = true; pdfDoc.moveDown(0.4); break;
          case 'h4': currentFontSize = 13; isBold = true; pdfDoc.moveDown(0.3); break;
          case 'h5': case 'h6': currentFontSize = 12; isBold = true; pdfDoc.moveDown(0.3); break;
          case 'p': pdfDoc.moveDown(0.3); break;
          case 'br': pdfDoc.moveDown(0.5); break;
          case 'strong': case 'b': isBold = true; break;
          case 'em': case 'i': isItalic = true; break;
          case 'ul': listDepth++; break;
          case 'ol': listDepth++; listCounter = 0; break;
          case 'li':
            listCounter++;
            setFont();
            const bullet = listDepth > 0 ? (listCounter > 0 ? `${listCounter}. ` : '  * ') : '  * ';
            pdfDoc.text(bullet, 60 + (listDepth - 1) * 20, undefined, { continued: true });
            break;
          case 'pre': inPre = true; pdfDoc.moveDown(0.5); break;
          case 'code': if (!inPre) { currentFontSize = 10; } break;
          case 'blockquote':
            pdfDoc.moveDown(0.3);
            pdfDoc.save();
            pdfDoc.rect(60, pdfDoc.y, 3, 14).fill('#4472C4');
            pdfDoc.restore();
            pdfDoc.fill('#000000');
            break;
          case 'hr':
            pdfDoc.moveDown(0.5);
            pdfDoc.save();
            pdfDoc.moveTo(60, pdfDoc.y).lineTo(pdfDoc.page.width - 60, pdfDoc.y).stroke('#cccccc');
            pdfDoc.restore();
            pdfDoc.moveDown(0.5);
            break;
        }
      } else {
        switch (tagName) {
          case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
            currentFontSize = 11; isBold = false; pdfDoc.moveDown(0.3); break;
          case 'p': pdfDoc.moveDown(0.3); break;
          case 'strong': case 'b': isBold = false; break;
          case 'em': case 'i': isItalic = false; break;
          case 'ul': case 'ol': listDepth = Math.max(0, listDepth - 1); listCounter = 0; break;
          case 'li': break;
          case 'pre': inPre = false; pdfDoc.moveDown(0.5); break;
          case 'code': currentFontSize = 11; break;
          case 'blockquote': pdfDoc.moveDown(0.3); break;
        }
      }
    }

    const totalPages = pdfDoc.bufferedPageRange().count;
    pdfDoc.end();
    const outputBuffer = await bufferPromise;

    const job = await prisma.conversionJob.create({
      data: {
        tenantId,
        userId,
        sourceFormat: 'HTML',
        targetFormat: 'PDF',
        sourceFilename: 'input.html',
        outputFilename: 'converted.pdf',
        sourceSizeBytes: Buffer.byteLength(html, 'utf-8'),
        outputSizeBytes: outputBuffer.length,
        pageCount: totalPages,
        status: 'COMPLETED',
        durationMs: Date.now() - startTime,
      },
    });

    logger.info('HTML to PDF conversion completed', { jobId: job.id, pages: totalPages });

    return {
      buffer: outputBuffer,
      outputFilename: 'converted.pdf',
      mimeType: 'application/pdf',
      jobId: job.id,
    };
  }

  /**
   * Convert image format using sharp: resize, change format, set quality.
   */
  async convertImageFormat(
    file: Buffer,
    targetFormat: 'png' | 'jpg' | 'webp' | 'avif',
    options?: { width?: number; height?: number; quality?: number }
  ): Promise<{ buffer: Buffer; outputFilename: string; mimeType: string; metadata: Record<string, unknown> }> {
    logger.info('Starting image format conversion', { targetFormat, options });

    const inputMetadata = await sharp(file).metadata();
    logger.info('Input image metadata', {
      width: inputMetadata.width,
      height: inputMetadata.height,
      format: inputMetadata.format,
      size: file.length,
    });

    let pipeline = sharp(file, { failOnError: false });

    if (options?.width || options?.height) {
      const resizeWidth = options.width || undefined;
      const resizeHeight = options.height || undefined;
      pipeline = pipeline.resize(resizeWidth, resizeHeight, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      });
    }

    pipeline = pipeline.rotate();

    const quality = options?.quality ?? 85;
    let outputBuffer: Buffer;
    let mimeType: string;

    switch (targetFormat) {
      case 'png':
        outputBuffer = await pipeline.png({
          compressionLevel: Math.round((100 - quality) / 11),
          adaptiveFiltering: true,
          palette: quality < 50,
        }).toBuffer();
        mimeType = 'image/png';
        break;
      case 'jpg':
        outputBuffer = await pipeline.jpeg({
          quality,
          mozjpeg: true,
          chromaSubsampling: quality > 90 ? '4:4:4' : '4:2:0',
        }).toBuffer();
        mimeType = 'image/jpeg';
        break;
      case 'webp':
        outputBuffer = await pipeline.webp({
          quality,
          effort: 4,
          smartSubsample: true,
          nearLossless: quality > 95,
        }).toBuffer();
        mimeType = 'image/webp';
        break;
      case 'avif':
        outputBuffer = await pipeline.avif({
          quality,
          effort: 4,
          chromaSubsampling: '4:2:0',
        }).toBuffer();
        mimeType = 'image/avif';
        break;
      default:
        throw new Error(`Unsupported target image format: ${targetFormat}`);
    }

    const outputMetadata = await sharp(outputBuffer).metadata();

    logger.info('Image conversion completed', {
      inputFormat: inputMetadata.format,
      outputFormat: targetFormat,
      inputSize: file.length,
      outputSize: outputBuffer.length,
      compressionRatio: (outputBuffer.length / file.length).toFixed(2),
    });

    return {
      buffer: outputBuffer,
      outputFilename: `converted.${targetFormat === 'jpg' ? 'jpg' : targetFormat}`,
      mimeType,
      metadata: {
        inputWidth: inputMetadata.width,
        inputHeight: inputMetadata.height,
        inputFormat: inputMetadata.format,
        outputWidth: outputMetadata.width,
        outputHeight: outputMetadata.height,
        outputFormat: targetFormat,
        inputSize: file.length,
        outputSize: outputBuffer.length,
        compressionRatio: parseFloat((outputBuffer.length / file.length).toFixed(3)),
      },
    };
  }

  /**
   * Convert CSV to Excel: parse CSV, create XLSX with auto-detected column types.
   */
  async convertCSVtoExcel(
    file: Buffer,
    filename: string
  ): Promise<{ buffer: Buffer; outputFilename: string; mimeType: string }> {
    logger.info('Starting CSV to Excel conversion', { filename, inputSize: file.length });

    const csvContent = file.toString('utf-8');
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    const sampleLine = lines[0];
    const commaCount = (sampleLine.match(/,/g) || []).length;
    const semicolonCount = (sampleLine.match(/;/g) || []).length;
    const tabCount = (sampleLine.match(/\t/g) || []).length;
    let delimiter = ',';
    if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t';
    else if (semicolonCount > commaCount) delimiter = ';';

    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]);
    const dataRows: unknown[][] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const typedValues = values.map((val) => {
        if (val === '' || val === null || val === undefined) return null;
        if (/^-?\d+$/.test(val)) return parseInt(val, 10);
        if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
        if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
          const date = new Date(val);
          return isNaN(date.getTime()) ? val : date;
        }
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
        return val.replace(/^"|"$/g, '');
      });
      dataRows.push(typedValues);
    }

    const worksheetData = [headers, ...dataRows];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    const colWidths = headers.map((header, colIdx) => {
      let maxLen = header.length;
      for (const row of dataRows) {
        const cellLen = row[colIdx] !== null && row[colIdx] !== undefined
          ? String(row[colIdx]).length
          : 0;
        maxLen = Math.max(maxLen, cellLen);
      }
      return { wch: Math.min(maxLen + 2, 40) };
    });
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

    const outputBuffer = Buffer.from(
      XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true })
    );

    const outputFilename = filename.replace(/\.csv$/i, '.xlsx') || 'converted.xlsx';

    logger.info('CSV to Excel conversion completed', {
      rows: dataRows.length,
      columns: headers.length,
      outputSize: outputBuffer.length,
    });

    return {
      buffer: outputBuffer,
      outputFilename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  /**
   * Convert Excel to CSV: parse XLSX, convert specified sheet to CSV string.
   */
  async convertExcelToCSV(
    file: Buffer,
    sheetIndex: number = 0
  ): Promise<{ csv: string; outputFilename: string; mimeType: string; rowCount: number; columnCount: number }> {
    logger.info('Starting Excel to CSV conversion', { sheetIndex, inputSize: file.length });

    const workbook = XLSX.read(file, { type: 'buffer', cellDates: true, cellText: true });

    if (sheetIndex >= workbook.SheetNames.length) {
      throw new Error(
        `Sheet index ${sheetIndex} out of range. Workbook has ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(', ')}`
      );
    }

    const sheetName = workbook.SheetNames[sheetIndex];
    const worksheet = workbook.Sheets[sheetName];

    const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
      rawNumbers: true,
    });

    if (jsonData.length === 0) {
      throw new Error(`Sheet "${sheetName}" is empty`);
    }

    const maxCols = Math.max(...jsonData.map((row: unknown[]) => row.length));

    const escapeCSVField = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = value instanceof Date
        ? value.toISOString().split('T')[0]
        : String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines: string[] = [];
    for (const row of jsonData) {
      const paddedRow = row as unknown[];
      const fields: string[] = [];
      for (let c = 0; c < maxCols; c++) {
        fields.push(escapeCSVField(paddedRow[c]));
      }
      csvLines.push(fields.join(','));
    }

    const csvString = csvLines.join('\n');

    logger.info('Excel to CSV conversion completed', {
      sheetName,
      rows: jsonData.length,
      columns: maxCols,
      outputLength: csvString.length,
    });

    return {
      csv: csvString,
      outputFilename: `${sheetName}.csv`,
      mimeType: 'text/csv',
      rowCount: jsonData.length,
      columnCount: maxCols,
    };
  }

  /**
   * Convert JSON array to CSV with headers. Handles nested objects by flattening.
   */
  async convertJSONtoCSV(
    data: Record<string, unknown>[]
  ): Promise<{ csv: string; outputFilename: string; mimeType: string; rowCount: number; columnCount: number }> {
    logger.info('Starting JSON to CSV conversion', { inputRows: data.length });

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Input must be a non-empty JSON array');
    }

    const flattenObject = (obj: Record<string, unknown>, prefix: string = ''): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];
        if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          const nested = flattenObject(value as Record<string, unknown>, fullKey);
          Object.assign(result, nested);
        } else if (Array.isArray(value)) {
          result[fullKey] = JSON.stringify(value);
        } else if (value instanceof Date) {
          result[fullKey] = value.toISOString();
        } else {
          result[fullKey] = value;
        }
      }
      return result;
    };

    const flattenedRows = data.map((row) => {
      return flattenObject(row);
    });

    const headerSet = new Set<string>();
    for (const row of flattenedRows) {
      for (const key of Object.keys(row)) {
        headerSet.add(key);
      }
    }
    const headers = Array.from(headerSet);

    const escapeField = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines: string[] = [headers.map(escapeField).join(',')];

    for (const row of flattenedRows) {
      const fields = headers.map((header) => escapeField(row[header]));
      csvLines.push(fields.join(','));
    }

    const csvString = csvLines.join('\n');

    logger.info('JSON to CSV conversion completed', {
      rows: data.length,
      columns: headers.length,
      outputLength: csvString.length,
    });

    return {
      csv: csvString,
      outputFilename: 'converted.csv',
      mimeType: 'text/csv',
      rowCount: data.length,
      columnCount: headers.length,
    };
  }

  /**
   * Convert XML buffer to JSON using a recursive tag parser.
   */
  async convertXMLtoJSON(
    file: Buffer
  ): Promise<{ json: Record<string, unknown>; outputFilename: string; mimeType: string }> {
    logger.info('Starting XML to JSON conversion', { inputSize: file.length });

    const xmlString = file.toString('utf-8').trim();

    if (!xmlString.startsWith('<')) {
      throw new Error('Invalid XML: content does not start with a tag');
    }

    const withoutDecl = xmlString
      .replace(/<\?xml[^?]*\?>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .trim();

    if (withoutDecl.length === 0) {
      throw new Error('XML file contains no parseable content');
    }

    const parsed = parseXMLNode(withoutDecl);

    if (typeof parsed === 'string') {
      throw new Error('XML parsing resulted in plain text; expected structured content');
    }

    const countNodes = (obj: unknown): number => {
      if (obj === null || obj === undefined) return 0;
      if (typeof obj !== 'object') return 1;
      let count = 1;
      for (const key of Object.keys(obj)) {
        if (Array.isArray((obj as Record<string, unknown>)[key])) {
          count += ((obj as Record<string, unknown>)[key] as unknown[]).reduce((acc: number, item: unknown) => acc + countNodes(item), 0);
        } else {
          count += countNodes((obj as Record<string, unknown>)[key]);
        }
      }
      return count;
    };

    const nodeCount = countNodes(parsed);
    logger.info('XML to JSON conversion completed', {
      nodeCount,
      topLevelKeys: Object.keys(parsed),
    });

    return {
      json: parsed,
      outputFilename: 'converted.json',
      mimeType: 'application/json',
    };
  }
}

export const formatConverterService = new FormatConverterService();
