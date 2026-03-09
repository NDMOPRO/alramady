import sharp from 'sharp';
import pdfParse from 'pdf-parse';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { Document, Paragraph, TextRun, HeadingLevel, Packer, Table, TableRow, TableCell } from 'docx';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { marked } from 'marked';
import * as mimeTypes from 'mime-types';
import { PrismaClient } from '@prisma/client';
import { PassThrough } from 'stream';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const turndown = new TurndownService();

export class ConverterService {

  async convertPDFtoWord(file: Buffer, tenantId: string): Promise<{ content: Buffer; filename: string; mimeType: string }> {
    const pdfData = await pdfParse(file);
    const text = pdfData.text;
    const lines = text.split('\n').filter(l => l.trim().length > 0);

    const paragraphs: Paragraph[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        const isHeading = trimmed.length < 80 && trimmed === trimmed.toUpperCase() && !trimmed.match(/^\d/);
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: trimmed, size: isHeading ? 28 : 22, bold: isHeading })],
          heading: isHeading ? HeadingLevel.HEADING_1 : undefined,
          spacing: { after: 120 },
        }));
      }
    }

    const doc = new Document({
      sections: [{ properties: {}, children: paragraphs }],
      creator: 'Rasid Platform',
      description: `Converted from PDF: ${pdfData.numpages} pages`,
    });

    const buffer = await Packer.toBuffer(doc);

    await prisma.conversionJob.create({
      data: {
        tenantId,
        sourceFormat: 'PDF',
        targetFormat: 'DOCX',
        status: 'COMPLETED',
      },
    });

    return { content: buffer, filename: 'converted.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }

  async convertWordToPDF(file: Buffer, tenantId: string): Promise<{ content: Buffer; filename: string; mimeType: string }> {
    const result = await mammoth.extractRawText({ buffer: file });
    const text = result.value;
    const lines = text.split('\n').filter(l => l.trim().length > 0);

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = new PassThrough();

      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);

      doc.pipe(stream);
      doc.font('Helvetica');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length < 80 && trimmed === trimmed.toUpperCase()) {
          doc.fontSize(16).font('Helvetica-Bold').text(trimmed, { align: 'left' });
          doc.moveDown(0.5);
        } else {
          doc.fontSize(11).font('Helvetica').text(trimmed, { align: 'left', lineGap: 4 });
        }
      }

      doc.end();
    });

    await prisma.conversionJob.create({
      data: { tenantId, sourceFormat: 'DOCX', targetFormat: 'PDF', status: 'COMPLETED' },
    });

    return { content: pdfBuffer, filename: 'converted.pdf', mimeType: 'application/pdf' };
  }

  async convertExcelToPDF(file: Buffer, tenantId: string): Promise<{ content: Buffer; filename: string; mimeType: string }> {
    const wb = XLSX.read(file, { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      const stream = new PassThrough();

      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);

      doc.pipe(stream);

      doc.fontSize(14).font('Helvetica-Bold').text(sheetName, { align: 'center' });
      doc.moveDown(1);

      if (jsonData.length > 0) {
        const colCount = Math.max(...jsonData.map(r => r.length));
        const tableWidth = doc.page.width - 60;
        const colWidth = tableWidth / Math.min(colCount, 10);
        const startX = 30;

        for (let rowIdx = 0; rowIdx < Math.min(jsonData.length, 100); rowIdx++) {
          const row = jsonData[rowIdx];
          const y = doc.y;

          if (y > doc.page.height - 50) {
            doc.addPage();
          }

          for (let colIdx = 0; colIdx < Math.min(row.length, 10); colIdx++) {
            const x = startX + colIdx * colWidth;
            const cellText = String(row[colIdx] ?? '');

            if (rowIdx === 0) {
              doc.rect(x, doc.y, colWidth, 20).fill('#4472C4');
              doc.fill('#FFFFFF').fontSize(9).font('Helvetica-Bold')
                .text(cellText.substring(0, 20), x + 2, doc.y + 4, { width: colWidth - 4, height: 16 });
              doc.fill('#000000');
            } else {
              doc.rect(x, doc.y, colWidth, 18).stroke('#CCCCCC');
              doc.fontSize(8).font('Helvetica')
                .text(cellText.substring(0, 25), x + 2, doc.y + 3, { width: colWidth - 4, height: 14 });
            }
          }
          doc.moveDown(rowIdx === 0 ? 1.2 : 1);
        }
      }

      doc.end();
    });

    await prisma.conversionJob.create({
      data: { tenantId, sourceFormat: 'XLSX', targetFormat: 'PDF', status: 'COMPLETED' },
    });

    return { content: pdfBuffer, filename: 'converted.pdf', mimeType: 'application/pdf' };
  }

  async convertCSVtoExcel(file: Buffer, tenantId: string): Promise<{ content: Buffer; filename: string; mimeType: string }> {
    const content = file.toString('utf-8');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');

    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      const delimiter = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
      const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));

      ws.columns = headers.map(h => ({ header: h, key: h, width: 15 }));
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
        const row: Record<string, unknown> = {};
        headers.forEach((h, idx) => {
          const val = values[idx];
          row[h] = val && !isNaN(Number(val)) ? Number(val) : val;
        });
        ws.addRow(row);
      }

      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: lines.length, column: headers.length } };
    }

    const buffer = await wb.xlsx.writeBuffer();

    await prisma.conversionJob.create({
      data: { tenantId, sourceFormat: 'CSV', targetFormat: 'XLSX', status: 'COMPLETED' },
    });

    return { content: Buffer.from(buffer), filename: 'converted.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }

  async convertImageFormat(file: Buffer, targetFormat: 'png' | 'jpg' | 'webp' | 'tiff', tenantId: string, options?: { width?: number; height?: number; quality?: number }): Promise<{ content: Buffer; filename: string; mimeType: string }> {
    let pipeline = sharp(file);

    if (options?.width || options?.height) {
      pipeline = pipeline.resize(options.width, options.height, { fit: 'inside', withoutEnlargement: true });
    }

    const quality = options?.quality || 85;

    let buffer: Buffer;
    let mimeType: string;

    switch (targetFormat) {
      case 'png':
        buffer = await pipeline.png({ quality: Math.min(quality, 100) }).toBuffer();
        mimeType = 'image/png';
        break;
      case 'jpg':
        buffer = await pipeline.jpeg({ quality }).toBuffer();
        mimeType = 'image/jpeg';
        break;
      case 'webp':
        buffer = await pipeline.webp({ quality }).toBuffer();
        mimeType = 'image/webp';
        break;
      case 'tiff':
        buffer = await pipeline.tiff({ quality }).toBuffer();
        mimeType = 'image/tiff';
        break;
      default:
        throw new Error(`Unsupported target format: ${targetFormat}`);
    }

    await prisma.conversionJob.create({
      data: { tenantId, sourceFormat: 'IMAGE', targetFormat: targetFormat.toUpperCase() as 'PNG' | 'JPG' | 'WEBP' | 'TIFF', status: 'COMPLETED' },
    });

    return { content: buffer, filename: `converted.${targetFormat}`, mimeType };
  }

  async convertMarkdownToHTML(markdown: string, tenantId: string): Promise<{ content: string; filename: string; mimeType: string }> {
    const html = await marked(markdown);
    const fullHtml = `<!DOCTYPE html>
<html dir="auto" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #333; }
    h1, h2, h3 { color: #1a365d; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #4472C4; color: white; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; overflow-x: auto; }
    blockquote { border-left: 4px solid #4472C4; margin: 16px 0; padding: 8px 16px; background: #f8f9fa; }
  </style>
</head>
<body>${html}</body>
</html>`;

    await prisma.conversionJob.create({
      data: { tenantId, sourceFormat: 'MD', targetFormat: 'HTML', status: 'COMPLETED' },
    });

    return { content: fullHtml, filename: 'converted.html', mimeType: 'text/html' };
  }

  async convertHTMLtoMarkdown(html: string, tenantId: string): Promise<{ content: string; filename: string; mimeType: string }> {
    const markdown = turndown.turndown(html);

    await prisma.conversionJob.create({
      data: { tenantId, sourceFormat: 'HTML', targetFormat: 'MD', status: 'COMPLETED' },
    });

    return { content: markdown, filename: 'converted.md', mimeType: 'text/markdown' };
  }

  async batchConvert(files: Array<{ buffer: Buffer; originalname: string }>, targetFormat: string, tenantId: string) {
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
        const conversionKey = `${ext}_to_${targetFormat}`;

        switch (conversionKey) {
          case 'pdf_to_docx': return this.convertPDFtoWord(file.buffer, tenantId);
          case 'docx_to_pdf': case 'doc_to_pdf': return this.convertWordToPDF(file.buffer, tenantId);
          case 'xlsx_to_pdf': case 'xls_to_pdf': return this.convertExcelToPDF(file.buffer, tenantId);
          case 'csv_to_xlsx': return this.convertCSVtoExcel(file.buffer, tenantId);
          case 'png_to_jpg': case 'png_to_webp': case 'jpg_to_png': case 'jpg_to_webp':
          case 'webp_to_png': case 'webp_to_jpg':
            return this.convertImageFormat(file.buffer, targetFormat as 'png' | 'jpg' | 'webp' | 'tiff', tenantId);
          default:
            throw new Error(`Unsupported conversion: ${conversionKey}`);
        }
      })
    );

    return {
      total: results.length,
      succeeded: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results: results.map((r, i) => ({
        filename: files[i].originalname,
        status: r.status,
        data: r.status === 'fulfilled' ? { filename: r.value.filename, mimeType: r.value.mimeType } : undefined,
        error: r.status === 'rejected' ? (r as PromiseRejectedResult).reason?.message : undefined,
      })),
    };
  }

  async listConversions(tenantId: string, options: { page?: number; limit?: number }) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      prisma.conversionJob.findMany({ where: { tenantId }, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.conversionJob.count({ where: { tenantId } }),
    ]);

    return { data: jobs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}

export const converterService = new ConverterService();
