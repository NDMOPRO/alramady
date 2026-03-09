import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

interface TableRegion {
  headers: string[];
  rows: string[][];
  confidence: number;
  pageNumber: number;
  startLine: number;
  endLine: number;
}

interface PdfToExcelResult {
  buffer: Buffer;
  outputFilename: string;
  mimeType: string;
  jobId: string;
  sheetsCreated: number;
  tablesDetected: number;
  totalRows: number;
}

interface PdfToExcelOptions {
  detectTables: boolean;
  useAiExtraction: boolean;
  mergeSheets: boolean;
  preserveFormatting: boolean;
  headerDetection: 'auto' | 'first-row' | 'none';
}

const VISION_MODEL = 'claude-sonnet-4-5-20250514';

export class PdfToExcelService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic();
  }

  async convert(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string,
    options: Partial<PdfToExcelOptions> = {}
  ): Promise<PdfToExcelResult> {
    const startTime = Date.now();
    const opts: PdfToExcelOptions = {
      detectTables: true,
      useAiExtraction: false,
      mergeSheets: false,
      preserveFormatting: true,
      headerDetection: 'auto',
      ...options,
    };

    logger.info('Starting PDF to Excel conversion', { filename, tenantId, userId, options: opts });

    const pdfData = await pdfParse(file);
    const fullText = pdfData.text;
    const totalPages = pdfData.numpages;

    logger.info('PDF parsed', { pages: totalPages, textLength: fullText.length });

    let tables: TableRegion[];

    if (opts.useAiExtraction) {
      tables = await this.extractTablesWithAI(file, fullText, totalPages);
    } else {
      tables = this.extractTablesFromText(fullText, totalPages);
    }

    if (tables.length === 0) {
      logger.info('No tables detected, converting full text to single-column spreadsheet');
      tables = [this.textToSingleColumnTable(fullText)];
    }

    logger.info('Tables extracted', { tableCount: tables.length, totalRows: tables.reduce((s, t) => s + t.rows.length, 0) });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RASID Conversion Service';
    workbook.created = new Date();

    let totalRows = 0;

    if (opts.mergeSheets && tables.length > 1) {
      const ws = workbook.addWorksheet('Merged Data');
      let currentRow = 1;

      for (let tIdx = 0; tIdx < tables.length; tIdx++) {
        const table = tables[tIdx];

        if (tIdx > 0) {
          currentRow += 2;
        }

        const titleRow = ws.getRow(currentRow);
        titleRow.getCell(1).value = `Table ${tIdx + 1} (Page ${table.pageNumber})`;
        titleRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF1A365D' } };
        currentRow++;

        if (table.headers.length > 0) {
          const headerRow = ws.getRow(currentRow);
          table.headers.forEach((header, colIdx) => {
            const cell = headerRow.getCell(colIdx + 1);
            cell.value = header;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.border = {
              top: { style: 'thin' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' },
            };
          });
          currentRow++;
        }

        for (const row of table.rows) {
          const dataRow = ws.getRow(currentRow);
          row.forEach((cellValue, colIdx) => {
            const cell = dataRow.getCell(colIdx + 1);
            const numVal = parseFloat(cellValue);
            cell.value = !isNaN(numVal) && cellValue.trim() === String(numVal) ? numVal : cellValue;
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
              bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
              left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
              right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
            };
          });
          currentRow++;
          totalRows++;
        }
      }

      this.autoFitColumns(ws);
    } else {
      for (let tIdx = 0; tIdx < tables.length; tIdx++) {
        const table = tables[tIdx];
        const sheetName = tables.length === 1
          ? 'Data'
          : `Table ${tIdx + 1} (p${table.pageNumber})`.substring(0, 31);

        const ws = workbook.addWorksheet(sheetName);
        let currentRow = 1;

        if (table.headers.length > 0) {
          const headerRow = ws.getRow(currentRow);
          table.headers.forEach((header, colIdx) => {
            const cell = headerRow.getCell(colIdx + 1);
            cell.value = header;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
              top: { style: 'thin' },
              bottom: { style: 'medium' },
              left: { style: 'thin' },
              right: { style: 'thin' },
            };
          });
          ws.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: table.headers.length },
          };
          currentRow++;
        }

        for (const row of table.rows) {
          const dataRow = ws.getRow(currentRow);
          row.forEach((cellValue, colIdx) => {
            const cell = dataRow.getCell(colIdx + 1);
            const numVal = parseFloat(cellValue);
            cell.value = !isNaN(numVal) && cellValue.trim() === String(numVal) ? numVal : cellValue;
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
              bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
              left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
              right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
            };
            if (currentRow % 2 === 0) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
            }
          });
          currentRow++;
          totalRows++;
        }

        this.autoFitColumns(ws);
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const outputBuffer = Buffer.from(arrayBuffer);
    const outputFilename = filename.replace(/\.pdf$/i, '.xlsx') || 'converted.xlsx';

    const job = await prisma.conversionJob.create({
      data: {
        tenantId,
        userId,
        sourceFormat: 'PDF',
        targetFormat: 'XLSX',
        sourceFilename: filename,
        outputFilename,
        sourceSizeBytes: file.length,
        outputSizeBytes: outputBuffer.length,
        pageCount: totalPages,
        status: 'COMPLETED',
        durationMs: Date.now() - startTime,
        metadata: JSON.stringify({
          tablesDetected: tables.length,
          totalRows,
          options: opts,
        }),
      },
    });

    logger.info('PDF to Excel conversion completed', {
      jobId: job.id,
      tables: tables.length,
      totalRows,
      duration: Date.now() - startTime,
      outputSize: outputBuffer.length,
    });

    return {
      buffer: outputBuffer,
      outputFilename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      jobId: job.id,
      sheetsCreated: opts.mergeSheets ? 1 : tables.length,
      tablesDetected: tables.length,
      totalRows,
    };
  }

  private extractTablesFromText(text: string, totalPages: number): TableRegion[] {
    const tables: TableRegion[] = [];
    const lines = text.split('\n');
    let currentTableLines: string[] = [];
    let tableStartLine = 0;
    let currentPage = 1;

    const isTableLine = (line: string): boolean => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return false;

      const tabCount = (trimmed.match(/\t/g) || []).length;
      if (tabCount >= 2) return true;

      const pipeCount = (trimmed.match(/\|/g) || []).length;
      if (pipeCount >= 2) return true;

      const spaceClusters = trimmed.split(/\s{3,}/).filter(s => s.trim().length > 0);
      if (spaceClusters.length >= 3) return true;

      const commaCount = (trimmed.match(/,/g) || []).length;
      const semicolonCount = (trimmed.match(/;/g) || []).length;
      if (commaCount >= 2 && commaCount <= 50) return true;
      if (semicolonCount >= 2 && semicolonCount <= 50) return true;

      return false;
    };

    const detectDelimiter = (lines: string[]): string => {
      const sampleLines = lines.slice(0, 5);
      let tabScore = 0;
      let pipeScore = 0;
      let spaceScore = 0;
      let commaScore = 0;
      let semicolonScore = 0;

      for (const line of sampleLines) {
        tabScore += (line.match(/\t/g) || []).length;
        pipeScore += (line.match(/\|/g) || []).length;
        spaceScore += (line.match(/\s{3,}/g) || []).length;
        commaScore += (line.match(/,/g) || []).length;
        semicolonScore += (line.match(/;/g) || []).length;
      }

      const scores = [
        { delim: '\t', score: tabScore },
        { delim: '|', score: pipeScore },
        { delim: '  +', score: spaceScore },
        { delim: ',', score: commaScore },
        { delim: ';', score: semicolonScore },
      ];

      scores.sort((a, b) => b.score - a.score);
      return scores[0].delim;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.includes('\f')) {
        currentPage = Math.min(currentPage + 1, totalPages);
      }

      if (isTableLine(line)) {
        if (currentTableLines.length === 0) {
          tableStartLine = i;
        }
        currentTableLines.push(line);
      } else {
        if (currentTableLines.length >= 2) {
          const table = this.parseTableLines(currentTableLines, detectDelimiter(currentTableLines), currentPage, tableStartLine, i - 1);
          if (table.rows.length > 0) {
            tables.push(table);
          }
        }
        currentTableLines = [];
      }
    }

    if (currentTableLines.length >= 2) {
      const table = this.parseTableLines(currentTableLines, detectDelimiter(currentTableLines), currentPage, tableStartLine, lines.length - 1);
      if (table.rows.length > 0) {
        tables.push(table);
      }
    }

    return tables;
  }

  private parseTableLines(
    lines: string[],
    delimiter: string,
    pageNumber: number,
    startLine: number,
    endLine: number
  ): TableRegion {
    const splitLine = (line: string): string[] => {
      if (delimiter === '  +') {
        return line.split(/\s{3,}/).map(s => s.trim()).filter(s => s.length > 0);
      }
      if (delimiter === '|') {
        return line.split('|').map(s => s.trim()).filter(s => s.length > 0);
      }
      return line.split(delimiter).map(s => s.trim());
    };

    const allRows = lines.map(splitLine);

    const isSeparator = (cells: string[]): boolean =>
      cells.every(cell => /^[-:=+]+$/.test(cell.trim()));

    let headers: string[] = [];
    let dataRows: string[][] = [];

    if (allRows.length > 1 && isSeparator(allRows[1])) {
      headers = allRows[0];
      dataRows = allRows.slice(2);
    } else {
      const firstRow = allRows[0];
      const isFirstRowHeader = firstRow.every(cell => {
        const numVal = parseFloat(cell);
        return isNaN(numVal) || cell.length > 15;
      });

      if (isFirstRowHeader) {
        headers = firstRow;
        dataRows = allRows.slice(1);
      } else {
        headers = firstRow.map((_, idx) => `Column ${idx + 1}`);
        dataRows = allRows;
      }
    }

    const maxCols = Math.max(headers.length, ...dataRows.map(r => r.length));
    while (headers.length < maxCols) {
      headers.push(`Column ${headers.length + 1}`);
    }

    dataRows = dataRows
      .filter(row => !isSeparator(row))
      .map(row => {
        while (row.length < maxCols) {
          row.push('');
        }
        return row.slice(0, maxCols);
      });

    return {
      headers,
      rows: dataRows,
      confidence: 0.8,
      pageNumber,
      startLine,
      endLine,
    };
  }

  private async extractTablesWithAI(file: Buffer, fullText: string, totalPages: number): Promise<TableRegion[]> {
    logger.info('Using AI-assisted table extraction');

    const truncatedText = fullText.slice(0, 12000);

    try {
      const response = await this.anthropic.messages.create({
        model: VISION_MODEL,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: `Analyze this PDF text and extract all tabular data. Return ONLY valid JSON array of tables:
[
  {
    "headers": ["col1", "col2"],
    "rows": [["val1", "val2"]],
    "pageNumber": 1,
    "confidence": 0.9
  }
]

If there are no tables, return an empty array [].

PDF text:
${truncatedText}`,
          },
        ],
      });

      const textBlock = response.content.find(block => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        return [];
      }

      let rawJson = textBlock.text.trim();
      if (rawJson.startsWith('```')) {
        rawJson = rawJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(rawJson);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((table: { headers: string[]; rows: string[][]; pageNumber?: number; confidence?: number }, idx: number) => ({
        headers: Array.isArray(table.headers) ? table.headers.map(String) : [],
        rows: Array.isArray(table.rows) ? table.rows.map((row: string[]) => Array.isArray(row) ? row.map(String) : []) : [],
        confidence: typeof table.confidence === 'number' ? table.confidence : 0.85,
        pageNumber: typeof table.pageNumber === 'number' ? table.pageNumber : 1,
        startLine: 0,
        endLine: 0,
      }));
    } catch (error) {
      logger.warn('AI table extraction failed, falling back to text-based extraction', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.extractTablesFromText(fullText, totalPages);
    }
  }

  private textToSingleColumnTable(text: string): TableRegion {
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    return {
      headers: ['Content'],
      rows: lines.map(line => [line.trim()]),
      confidence: 0.5,
      pageNumber: 1,
      startLine: 0,
      endLine: lines.length - 1,
    };
  }

  private autoFitColumns(ws: ExcelJS.Worksheet): void {
    ws.columns.forEach(column => {
      if (!column || !column.eachCell) return;
      let maxLength = 10;
      column.eachCell({ includeEmpty: false }, cell => {
        const cellLength = cell.value ? String(cell.value).length : 0;
        maxLength = Math.max(maxLength, Math.min(cellLength + 2, 50));
      });
      column.width = maxLength;
    });
  }
}

export const pdfToExcelService = new PdfToExcelService();
