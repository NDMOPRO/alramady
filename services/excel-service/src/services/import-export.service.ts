import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import chardet from 'chardet';
import archiver from 'archiver';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import { Readable, PassThrough } from 'stream';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ImportOptions {
  fileType: 'csv' | 'xlsx' | 'ods' | 'google_sheets';
  filePath: string;
  workbookId?: string;
  sheetName?: string;
  encoding?: string;
  delimiter?: string;
  hasHeader: boolean;
  startRow?: number;
  endRow?: number;
  columnMapping?: Record<string, string>;
  userId: string;
}

export interface ExportOptions {
  workbookId: string;
  sheetIds?: string[];
  format: 'csv' | 'xlsx' | 'ods' | 'pdf';
  includeFormatting: boolean;
  includeCharts: boolean;
  includeComments: boolean;
  password?: string;
  userId: string;
}

export interface ImportResult {
  workbookId: string;
  sheetId: string;
  rowsImported: number;
  columnsDetected: number;
  warnings: string[];
  errors: string[];
  detectedEncoding: string;
  previewData: unknown[][];
}

export interface ExportResult {
  filePath: string;
  fileSize: number;
  format: string;
  sheetsExported: number;
  exportedAt: Date;
}

export interface SheetData {
  sheetId: string;
  sheetName: string;
  rows: CellData[][];
  columnWidths: number[];
  rowHeights: number[];
  mergedCells: string[];
  frozenRows: number;
  frozenCols: number;
}

export interface CellData {
  value: unknown;
  formula?: string;
  format?: CellFormat;
  comment?: string;
  hyperlink?: string;
}

export interface CellFormat {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontColor?: string;
  backgroundColor?: string;
  horizontalAlignment?: 'left' | 'center' | 'right';
  verticalAlignment?: 'top' | 'middle' | 'bottom';
  numberFormat?: string;
  wrapText?: boolean;
  borders?: {
    top?: BorderStyle;
    bottom?: BorderStyle;
    left?: BorderStyle;
    right?: BorderStyle;
  };
}

export interface BorderStyle {
  style: 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted';
  color: string;
}

export interface StreamingImportProgress {
  totalBytes: number;
  processedBytes: number;
  rowsProcessed: number;
  percentage: number;
  status: 'reading' | 'processing' | 'saving' | 'complete' | 'error';
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ImportExportService {
  private readonly BATCH_SIZE = 1000;
  private readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

  constructor(
    private prisma: PrismaClient,
  ) {}

  async importFile(options: ImportOptions): Promise<ImportResult> {
    const fileBuffer = fs.readFileSync(options.filePath);
    if (fileBuffer.length > this.MAX_FILE_SIZE) {
      throw new Error(`File size ${fileBuffer.length} exceeds maximum allowed size of ${this.MAX_FILE_SIZE}`);
    }

    let result: ImportResult;
    switch (options.fileType) {
      case 'csv':
        result = await this.importCsv(fileBuffer, options);
        break;
      case 'xlsx':
        result = await this.importXlsx(options.filePath, options);
        break;
      case 'ods':
        result = await this.importOds(options.filePath, options);
        break;
      case 'google_sheets':
        result = await this.importGoogleSheets(options.filePath, options);
        break;
      default:
        throw new Error(`Unsupported file type: ${options.fileType}`);
    }

    await this.prisma.importLog.create({
      data: {
        workbookId: result.workbookId,
        sheetId: result.sheetId,
        userId: options.userId,
        fileType: options.fileType,
        filePath: options.filePath,
        rowsImported: result.rowsImported,
        columnsDetected: result.columnsDetected,
        encoding: result.detectedEncoding,
        warnings: JSON.stringify(result.warnings),
        errors: JSON.stringify(result.errors),
        importedAt: new Date(),
      },
    });

    return result;
  }

  private async importCsv(fileBuffer: Buffer, options: ImportOptions): Promise<ImportResult> {
    const detectedEncoding = chardet.detect(fileBuffer) || 'utf-8';
    const encoding = options.encoding || detectedEncoding;
    const textDecoder = new TextDecoder(encoding as string);
    const csvText = textDecoder.decode(fileBuffer);

    const warnings: string[] = [];
    const errors: string[] = [];

    const delimiter = options.delimiter || this.detectDelimiter(csvText);

    const parseResult = Papa.parse(csvText, {
      delimiter,
      header: false,
      skipEmptyLines: true,
      dynamicTyping: true,
    });

    if (parseResult.errors.length > 0) {
      for (const err of parseResult.errors) {
        if (err.type === 'Quotes') {
          warnings.push(`Row ${err.row}: Quote parsing issue - ${err.message}`);
        } else {
          errors.push(`Row ${err.row}: ${err.message}`);
        }
      }
    }

    const rows = parseResult.data as unknown[][];
    const startRow = options.startRow || 0;
    const endRow = options.endRow || rows.length;
    const filteredRows = rows.slice(startRow, endRow);

    let headers: string[] = [];
    let dataRows: unknown[][] = filteredRows;
    if (options.hasHeader && filteredRows.length > 0) {
      headers = (filteredRows[0] as unknown[]).map(String);
      dataRows = filteredRows.slice(1);
    }

    if (options.columnMapping && headers.length > 0) {
      headers = headers.map(h => options.columnMapping![h] || h);
    }

    const workbookId = options.workbookId || await this.createWorkbook(options.userId);
    const sheetId = await this.createSheet(workbookId, options.sheetName || 'Sheet1');

    for (let batchStart = 0; batchStart < dataRows.length; batchStart += this.BATCH_SIZE) {
      const batch = dataRows.slice(batchStart, batchStart + this.BATCH_SIZE);
      const cellRecords = [];

      for (let rowIdx = 0; rowIdx < batch.length; rowIdx++) {
        const row = batch[rowIdx] as unknown[];
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          if (row[colIdx] !== null && row[colIdx] !== undefined && row[colIdx] !== '') {
            cellRecords.push({
              sheetId,
              rowIndex: batchStart + rowIdx + (options.hasHeader ? 1 : 0),
              colIndex: colIdx,
              value: JSON.stringify(row[colIdx]),
              dataType: typeof row[colIdx],
            });
          }
        }
      }

      if (cellRecords.length > 0) {
        await this.prisma.cell.createMany({ data: cellRecords });
      }
    }

    if (headers.length > 0) {
      const headerCells = headers.map((h, idx) => ({
        sheetId,
        rowIndex: 0,
        colIndex: idx,
        value: JSON.stringify(h),
        dataType: 'string',
        isHeader: true,
      }));
      await this.prisma.cell.createMany({ data: headerCells });
    }

    const previewData = filteredRows.slice(0, 10);

    return {
      workbookId,
      sheetId,
      rowsImported: dataRows.length,
      columnsDetected: headers.length || (dataRows[0] as unknown[])?.length || 0,
      warnings,
      errors,
      detectedEncoding: encoding,
      previewData,
    };
  }

  private detectDelimiter(csvText: string): string {
    const firstLines = csvText.split('\n').slice(0, 5).join('\n');
    const delimiters = [',', ';', '\t', '|'];
    let bestDelimiter = ',';
    let bestScore = 0;

    for (const delim of delimiters) {
      const counts = firstLines.split('\n').map(line => {
        let count = 0;
        let inQuotes = false;
        for (const char of line) {
          if (char === '"') inQuotes = !inQuotes;
          if (char === delim && !inQuotes) count += 1;
        }
        return count;
      });

      const allSame = counts.every(c => c === counts[0]) && counts[0] > 0;
      const score = allSame ? counts[0] * 10 : counts.reduce((s, c) => s + c, 0);

      if (score > bestScore) {
        bestScore = score;
        bestDelimiter = delim;
      }
    }

    return bestDelimiter;
  }

  private async importXlsx(filePath: string, options: ImportOptions): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const warnings: string[] = [];
    const errors: string[] = [];
    const targetWorkbookId = options.workbookId || await this.createWorkbook(options.userId);
    let totalRows = 0;
    let totalCols = 0;
    let firstSheetId = '';

    for (const worksheet of workbook.worksheets) {
      const sheetName = options.sheetName || worksheet.name;
      const sheetId = await this.createSheet(targetWorkbookId, sheetName);
      if (!firstSheetId) firstSheetId = sheetId;

      const mergedCells: string[] = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (options.startRow && rowNumber < options.startRow) return;
        if (options.endRow && rowNumber > options.endRow) return;
      });

      const cellRecords: {
        sheetId: string;
        rowIndex: number;
        colIndex: number;
        value: string;
        dataType: string;
        formula?: string;
        format?: string;
      }[] = [];

      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const adjustedRow = rowNumber - 1;
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const adjustedCol = colNumber - 1;
          let cellValue = cell.value;
          let formula: string | undefined;
          let dataType = 'string';

          if (cell.type === ExcelJS.ValueType.Formula) {
            formula = (cell.value as ExcelJS.CellFormulaValue)?.formula;
            cellValue = (cell.value as ExcelJS.CellFormulaValue)?.result;
          }

          if (typeof cellValue === 'number') dataType = 'number';
          else if (typeof cellValue === 'boolean') dataType = 'boolean';
          else if (cellValue instanceof Date) dataType = 'date';

          const format = this.extractCellFormat(cell);

          cellRecords.push({
            sheetId,
            rowIndex: adjustedRow,
            colIndex: adjustedCol,
            value: JSON.stringify(cellValue),
            dataType,
            formula,
            format: format ? JSON.stringify(format) : undefined,
          });

          if (adjustedCol + 1 > totalCols) totalCols = adjustedCol + 1;
        });
        totalRows += 1;
      });

      for (let i = 0; i < cellRecords.length; i += this.BATCH_SIZE) {
        const batch = cellRecords.slice(i, i + this.BATCH_SIZE);
        await this.prisma.cell.createMany({ data: batch });
      }

      for (const [key, model] of Object.entries(worksheet.model?.merges || {})) {
        mergedCells.push(String(key));
      }

      if (mergedCells.length > 0) {
        await this.prisma.sheet.update({
          where: { id: sheetId },
          data: { mergedCells: JSON.stringify(mergedCells) },
        });
      }

      if (!options.sheetName) break;
    }

    return {
      workbookId: targetWorkbookId,
      sheetId: firstSheetId,
      rowsImported: totalRows,
      columnsDetected: totalCols,
      warnings,
      errors,
      detectedEncoding: 'utf-8',
      previewData: [],
    };
  }

  private extractCellFormat(cell: ExcelJS.Cell): CellFormat | null {
    const style = cell.style;
    if (!style) return null;

    const format: CellFormat = {};
    let hasFormat = false;

    if (style.font) {
      if (style.font.name) { format.fontFamily = style.font.name; hasFormat = true; }
      if (style.font.size) { format.fontSize = style.font.size; hasFormat = true; }
      if (style.font.bold) { format.bold = true; hasFormat = true; }
      if (style.font.italic) { format.italic = true; hasFormat = true; }
      if (style.font.underline) { format.underline = true; hasFormat = true; }
      if (style.font.color?.argb) { format.fontColor = `#${style.font.color.argb.substring(2)}`; hasFormat = true; }
    }

    if (style.fill && style.fill.type === 'pattern') {
      const patternFill = style.fill as ExcelJS.FillPattern;
      if (patternFill.fgColor?.argb) {
        format.backgroundColor = `#${patternFill.fgColor.argb.substring(2)}`;
        hasFormat = true;
      }
    }

    if (style.alignment) {
      if (style.alignment.horizontal) {
        format.horizontalAlignment = style.alignment.horizontal as CellFormat['horizontalAlignment'];
        hasFormat = true;
      }
      if (style.alignment.vertical) {
        format.verticalAlignment = style.alignment.vertical as CellFormat['verticalAlignment'];
        hasFormat = true;
      }
      if (style.alignment.wrapText) {
        format.wrapText = true;
        hasFormat = true;
      }
    }

    if (style.numFmt) {
      format.numberFormat = style.numFmt;
      hasFormat = true;
    }

    return hasFormat ? format : null;
  }

  private async importOds(filePath: string, options: ImportOptions): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const warnings: string[] = ['ODS format imported via XLSX compatibility layer'];
    const errors: string[] = [];
    const targetWorkbookId = options.workbookId || await this.createWorkbook(options.userId);
    const sheetId = await this.createSheet(targetWorkbookId, options.sheetName || 'Sheet1');
    let totalRows = 0;
    let totalCols = 0;

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      errors.push('No worksheets found in the ODS file');
      return {
        workbookId: targetWorkbookId, sheetId, rowsImported: 0, columnsDetected: 0,
        warnings, errors, detectedEncoding: 'utf-8', previewData: [],
      };
    }

    const cellRecords: { sheetId: string; rowIndex: number; colIndex: number; value: string; dataType: string }[] = [];

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        let cellValue = cell.value;
        let dataType = 'string';
        if (typeof cellValue === 'number') dataType = 'number';
        else if (typeof cellValue === 'boolean') dataType = 'boolean';
        else if (cellValue instanceof Date) dataType = 'date';

        cellRecords.push({
          sheetId,
          rowIndex: rowNumber - 1,
          colIndex: colNumber - 1,
          value: JSON.stringify(cellValue),
          dataType,
        });

        if (colNumber > totalCols) totalCols = colNumber;
      });
      totalRows += 1;
    });

    for (let i = 0; i < cellRecords.length; i += this.BATCH_SIZE) {
      await this.prisma.cell.createMany({ data: cellRecords.slice(i, i + this.BATCH_SIZE) });
    }

    return {
      workbookId: targetWorkbookId, sheetId, rowsImported: totalRows, columnsDetected: totalCols,
      warnings, errors, detectedEncoding: 'utf-8', previewData: [],
    };
  }

  private async importGoogleSheets(fileContent: string, options: ImportOptions): Promise<ImportResult> {
    const warnings: string[] = ['Google Sheets import via JSON format'];
    const errors: string[] = [];

    let sheetData: { sheets: { name: string; data: unknown[][] }[] };
    try {
      const raw = fs.readFileSync(fileContent, 'utf-8');
      sheetData = JSON.parse(raw);
    } catch {
      errors.push('Failed to parse Google Sheets export JSON');
      throw new Error('Invalid Google Sheets export format');
    }

    const workbookId = options.workbookId || await this.createWorkbook(options.userId);
    let firstSheetId = '';
    let totalRows = 0;
    let totalCols = 0;

    for (const sheet of sheetData.sheets) {
      const sheetId = await this.createSheet(workbookId, sheet.name);
      if (!firstSheetId) firstSheetId = sheetId;

      const cellRecords: { sheetId: string; rowIndex: number; colIndex: number; value: string; dataType: string }[] = [];

      for (let rowIdx = 0; rowIdx < sheet.data.length; rowIdx++) {
        const row = sheet.data[rowIdx];
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          const value = row[colIdx];
          if (value !== null && value !== undefined && value !== '') {
            cellRecords.push({
              sheetId,
              rowIndex: rowIdx,
              colIndex: colIdx,
              value: JSON.stringify(value),
              dataType: typeof value,
            });
          }
          if (colIdx + 1 > totalCols) totalCols = colIdx + 1;
        }
        totalRows += 1;
      }

      for (let i = 0; i < cellRecords.length; i += this.BATCH_SIZE) {
        await this.prisma.cell.createMany({ data: cellRecords.slice(i, i + this.BATCH_SIZE) });
      }
    }

    return {
      workbookId, sheetId: firstSheetId, rowsImported: totalRows, columnsDetected: totalCols,
      warnings, errors, detectedEncoding: 'utf-8', previewData: [],
    };
  }

  async exportFile(options: ExportOptions): Promise<ExportResult> {
    const sheets = await this.loadSheetData(options.workbookId, options.sheetIds);

    let result: ExportResult;
    switch (options.format) {
      case 'xlsx':
        result = await this.exportXlsx(sheets, options);
        break;
      case 'csv':
        result = await this.exportCsv(sheets, options);
        break;
      case 'ods':
        result = await this.exportOds(sheets, options);
        break;
      case 'pdf':
        result = await this.exportPdf(sheets, options);
        break;
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }

    await this.prisma.exportLog.create({
      data: {
        workbookId: options.workbookId,
        userId: options.userId,
        format: options.format,
        filePath: result.filePath,
        fileSize: result.fileSize,
        sheetsExported: result.sheetsExported,
        exportedAt: new Date(),
      },
    });

    return result;
  }

  private async exportXlsx(sheets: SheetData[], options: ExportOptions): Promise<ExportResult> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RASID Platform';
    workbook.created = new Date();

    for (const sheet of sheets) {
      const worksheet = workbook.addWorksheet(sheet.sheetName);

      for (let rowIdx = 0; rowIdx < sheet.rows.length; rowIdx++) {
        const row = sheet.rows[rowIdx];
        const excelRow = worksheet.getRow(rowIdx + 1);

        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          const cellData = row[colIdx];
          const cell = excelRow.getCell(colIdx + 1);

          if (cellData.formula) {
            cell.value = { formula: cellData.formula, result: cellData.value } as ExcelJS.CellFormulaValue;
          } else {
            cell.value = cellData.value as ExcelJS.CellValue;
          }

          if (options.includeFormatting && cellData.format) {
            this.applyCellFormat(cell, cellData.format);
          }

          if (options.includeComments && cellData.comment) {
            cell.note = cellData.comment;
          }

          if (cellData.hyperlink) {
            cell.value = { text: String(cellData.value), hyperlink: cellData.hyperlink } as ExcelJS.CellHyperlinkValue;
          }
        }

        excelRow.commit();
      }

      for (let i = 0; i < sheet.columnWidths.length; i++) {
        worksheet.getColumn(i + 1).width = sheet.columnWidths[i];
      }

      for (const merged of sheet.mergedCells) {
        worksheet.mergeCells(merged);
      }

      if (sheet.frozenRows > 0 || sheet.frozenCols > 0) {
        worksheet.views = [{
          state: 'frozen',
          xSplit: sheet.frozenCols,
          ySplit: sheet.frozenRows,
        }];
      }
    }

    if (options.password) {
      await workbook.xlsx.writeFile('/tmp/temp_protected.xlsx');
    }

    const outputPath = `/tmp/export_${Date.now()}.xlsx`;
    await workbook.xlsx.writeFile(outputPath);
    const stats = fs.statSync(outputPath);

    return {
      filePath: outputPath,
      fileSize: stats.size,
      format: 'xlsx',
      sheetsExported: sheets.length,
      exportedAt: new Date(),
    };
  }

  private applyCellFormat(cell: ExcelJS.Cell, format: CellFormat): void {
    const font: Partial<ExcelJS.Font> = {};
    if (format.fontFamily) font.name = format.fontFamily;
    if (format.fontSize) font.size = format.fontSize;
    if (format.bold) font.bold = true;
    if (format.italic) font.italic = true;
    if (format.underline) font.underline = true;
    if (format.fontColor) font.color = { argb: `FF${format.fontColor.replace('#', '')}` };
    if (Object.keys(font).length > 0) cell.font = font;

    if (format.backgroundColor) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${format.backgroundColor.replace('#', '')}` },
      };
    }

    const alignment: Partial<ExcelJS.Alignment> = {};
    if (format.horizontalAlignment) alignment.horizontal = format.horizontalAlignment;
    if (format.verticalAlignment) alignment.vertical = format.verticalAlignment;
    if (format.wrapText) alignment.wrapText = true;
    if (Object.keys(alignment).length > 0) cell.alignment = alignment;

    if (format.numberFormat) cell.numFmt = format.numberFormat;
  }

  private async exportCsv(sheets: SheetData[], options: ExportOptions): Promise<ExportResult> {
    const sheet = sheets[0];
    if (!sheet) throw new Error('No sheets to export');

    const rows: string[][] = [];
    for (const row of sheet.rows) {
      const csvRow = row.map(cell => {
        if (cell.value === null || cell.value === undefined) return '';
        return String(cell.value);
      });
      rows.push(csvRow);
    }

    const csvContent = Papa.unparse(rows);
    const outputPath = `/tmp/export_${Date.now()}.csv`;
    fs.writeFileSync(outputPath, csvContent, 'utf-8');
    const stats = fs.statSync(outputPath);

    return {
      filePath: outputPath,
      fileSize: stats.size,
      format: 'csv',
      sheetsExported: 1,
      exportedAt: new Date(),
    };
  }

  private async exportOds(sheets: SheetData[], options: ExportOptions): Promise<ExportResult> {
    const workbook = new ExcelJS.Workbook();
    for (const sheet of sheets) {
      const worksheet = workbook.addWorksheet(sheet.sheetName);
      for (let rowIdx = 0; rowIdx < sheet.rows.length; rowIdx++) {
        const excelRow = worksheet.getRow(rowIdx + 1);
        for (let colIdx = 0; colIdx < sheet.rows[rowIdx].length; colIdx++) {
          const cellData = sheet.rows[rowIdx][colIdx];
          excelRow.getCell(colIdx + 1).value = cellData.value as ExcelJS.CellValue;
        }
        excelRow.commit();
      }
    }

    const outputPath = `/tmp/export_${Date.now()}.ods`;
    await workbook.xlsx.writeFile(outputPath);
    const stats = fs.statSync(outputPath);

    return {
      filePath: outputPath,
      fileSize: stats.size,
      format: 'ods',
      sheetsExported: sheets.length,
      exportedAt: new Date(),
    };
  }

  private async exportPdf(sheets: SheetData[], options: ExportOptions): Promise<ExportResult> {
    const outputPath = `/tmp/export_${Date.now()}.pdf`;

    await new Promise<void>((resolve, reject) => {
      // Determine orientation from the widest sheet's column count.
      // Use landscape when a sheet has more than 6 columns so the table fits.
      const maxCols = sheets.reduce((m, s) => {
        const cols = s.rows.length > 0 ? s.rows[0].length : 0;
        return cols > m ? cols : m;
      }, 0);
      const landscape = maxCols > 6;

      const doc = new PDFDocument({
        autoFirstPage: false,
        layout: landscape ? 'landscape' : 'portrait',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        info: {
          Title: `RASID Export – ${new Date().toISOString().slice(0, 10)}`,
          Author: 'RASID Platform',
          CreationDate: new Date(),
        },
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);

      const PAGE_WIDTH  = landscape ? 841.89 : 595.28;  // A4 in points
      const PAGE_HEIGHT = landscape ? 595.28 : 841.89;
      const MARGIN      = 40;
      const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

      // ── helpers ────────────────────────────────────────────────────────

      const isArabic = (text: string): boolean =>
        /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

      const cellText = (cell: CellData): string => {
        if (cell.value === null || cell.value === undefined) return '';
        return String(cell.value);
      };

      let globalPageIndex = 0;

      const addPageNumber = (): void => {
        globalPageIndex += 1;
        doc
          .fontSize(8)
          .fillColor('#888888')
          .text(
            `${globalPageIndex}`,
            MARGIN,
            PAGE_HEIGHT - MARGIN - 8,
            { width: CONTENT_WIDTH, align: 'center' }
          );
      };

      // ── iterate sheets ─────────────────────────────────────────────────

      for (let si = 0; si < sheets.length; si++) {
        const sheet = sheets[si];
        if (sheet.rows.length === 0) continue;

        const colCount = sheet.rows.reduce((m, r) => (r.length > m ? r.length : m), 0);
        if (colCount === 0) continue;

        // Distribute column widths evenly across available content width.
        const colWidth = Math.floor(CONTENT_WIDTH / colCount);

        // ── new page per sheet ─────────────────────────────────────────
        doc.addPage();
        addPageNumber();

        // Sheet title / header
        doc
          .fontSize(13)
          .fillColor('#1a1a2e')
          .font('Helvetica-Bold')
          .text(sheet.sheetName, MARGIN, MARGIN, {
            width: CONTENT_WIDTH,
            align: 'center',
          });

        let cursorY = MARGIN + 26;

        const HEADER_H    = 18;
        const ROW_H       = 16;
        const FONT_SIZE   = 8;
        const HEADER_BG   = '#2c3e50';
        const ALT_ROW_BG  = '#f5f5f5';
        const BORDER_CLR  = '#cccccc';

        // ── draw rows ────────────────────────────────────────────────────
        for (let ri = 0; ri < sheet.rows.length; ri++) {
          const row     = sheet.rows[ri];
          const isHdr   = ri === 0;
          const rowH    = isHdr ? HEADER_H : ROW_H;

          // Page break guard
          if (cursorY + rowH > PAGE_HEIGHT - MARGIN - 16) {
            doc.addPage();
            addPageNumber();
            cursorY = MARGIN;
          }

          // Row background
          if (isHdr) {
            doc.rect(MARGIN, cursorY, CONTENT_WIDTH, rowH).fill(HEADER_BG);
          } else if (ri % 2 === 0) {
            doc.rect(MARGIN, cursorY, CONTENT_WIDTH, rowH).fill(ALT_ROW_BG);
          }

          // Cells
          for (let ci = 0; ci < colCount; ci++) {
            const cell     = row[ci] ?? { value: null };
            const text     = cellText(cell);
            const x        = MARGIN + ci * colWidth;
            const rtl      = isArabic(text);
            const textClr  = isHdr ? '#ffffff' : '#1a1a1a';

            doc
              .fontSize(FONT_SIZE)
              .fillColor(textClr)
              .font(isHdr ? 'Helvetica-Bold' : 'Helvetica')
              .text(text, x + 2, cursorY + (rowH - FONT_SIZE) / 2, {
                width: colWidth - 4,
                height: rowH,
                ellipsis: true,
                lineBreak: false,
                align: rtl ? 'right' : 'left',
                features: rtl ? ['rtla'] : [],
              });

            // Cell border
            doc
              .rect(x, cursorY, colWidth, rowH)
              .strokeColor(BORDER_CLR)
              .stroke();
          }

          cursorY += rowH;
        }

        // Sheet separator note for multi-sheet workbooks
        if (sheets.length > 1 && si < sheets.length - 1) {
          cursorY += 8;
          doc
            .fontSize(7)
            .fillColor('#aaaaaa')
            .text(`— ${sheet.sheetName} —`, MARGIN, cursorY, {
              width: CONTENT_WIDTH,
              align: 'center',
            });
        }
      }

      doc.end();
    });

    const stats = fs.statSync(outputPath);
    return {
      filePath: outputPath,
      fileSize: stats.size,
      format: 'pdf',
      sheetsExported: sheets.length,
      exportedAt: new Date(),
    };
  }

  async streamImport(
    filePath: string,
    options: ImportOptions,
    onProgress: (progress: StreamingImportProgress) => void,
  ): Promise<ImportResult> {
    const fileStats = fs.statSync(filePath);
    const totalBytes = fileStats.size;
    let processedBytes = 0;
    let rowsProcessed = 0;

    const workbookId = options.workbookId || await this.createWorkbook(options.userId);
    const sheetId = await this.createSheet(workbookId, options.sheetName || 'Sheet1');
    const warnings: string[] = [];
    const errors: string[] = [];

    const readStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    let buffer = '';
    let columnsDetected = 0;

    await new Promise<void>((resolve, reject) => {
      readStream.on('data', async (chunk: string | Buffer) => {
        processedBytes += chunk.length;
        buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        const cellRecords: { sheetId: string; rowIndex: number; colIndex: number; value: string; dataType: string }[] = [];

        for (const line of lines) {
          if (line.trim().length === 0) continue;
          const parsed = Papa.parse(line, { dynamicTyping: true });
          const row = (parsed.data[0] || []) as unknown[];

          if (row.length > columnsDetected) columnsDetected = row.length;

          for (let colIdx = 0; colIdx < row.length; colIdx++) {
            if (row[colIdx] !== null && row[colIdx] !== undefined) {
              cellRecords.push({
                sheetId,
                rowIndex: rowsProcessed,
                colIndex: colIdx,
                value: JSON.stringify(row[colIdx]),
                dataType: typeof row[colIdx],
              });
            }
          }
          rowsProcessed += 1;
        }

        if (cellRecords.length > 0) {
          await this.prisma.cell.createMany({ data: cellRecords });
        }

        onProgress({
          totalBytes,
          processedBytes,
          rowsProcessed,
          percentage: Math.round((processedBytes / totalBytes) * 100),
          status: 'processing',
        });
      });

      readStream.on('end', () => {
        onProgress({ totalBytes, processedBytes: totalBytes, rowsProcessed, percentage: 100, status: 'complete' });
        resolve();
      });

      readStream.on('error', (err) => {
        errors.push(err.message);
        reject(err);
      });
    });

    return {
      workbookId, sheetId, rowsImported: rowsProcessed, columnsDetected,
      warnings, errors, detectedEncoding: 'utf-8', previewData: [],
    };
  }

  private async loadSheetData(workbookId: string, sheetIds?: string[]): Promise<SheetData[]> {
    const where: Record<string, unknown> = { workbookId };
    if (sheetIds && sheetIds.length > 0) {
      where.id = { in: sheetIds };
    }

    const sheets = await this.prisma.sheet.findMany({ where });
    const sheetDataList: SheetData[] = [];

    for (const sheet of sheets) {
      const cells = await this.prisma.cell.findMany({
        where: { sheetId: sheet.id },
        orderBy: [{ rowIndex: 'asc' }, { colIndex: 'asc' }],
      });

      let maxRow = 0;
      let maxCol = 0;
      for (const cell of cells) {
        if (cell.rowIndex > maxRow) maxRow = cell.rowIndex;
        if (cell.colIndex > maxCol) maxCol = cell.colIndex;
      }

      const rows: CellData[][] = [];
      for (let r = 0; r <= maxRow; r++) {
        const row: CellData[] = [];
        for (let c = 0; c <= maxCol; c++) {
          row.push({ value: null });
        }
        rows.push(row);
      }

      for (const cell of cells) {
        rows[cell.rowIndex][cell.colIndex] = {
          value: cell.value ? JSON.parse(cell.value) : null,
          formula: cell.formula || undefined,
          format: cell.format ? JSON.parse(cell.format) : undefined,
          comment: cell.comment || undefined,
          hyperlink: cell.hyperlink || undefined,
        };
      }

      sheetDataList.push({
        sheetId: sheet.id,
        sheetName: sheet.name,
        rows,
        columnWidths: JSON.parse(sheet.columnWidths as string || '[]'),
        rowHeights: JSON.parse(sheet.rowHeights as string || '[]'),
        mergedCells: JSON.parse(sheet.mergedCells as string || '[]'),
        frozenRows: sheet.frozenRows || 0,
        frozenCols: sheet.frozenCols || 0,
      });
    }

    return sheetDataList;
  }

  private async createWorkbook(userId: string): Promise<string> {
    const workbook = await this.prisma.workbook.create({
      data: {
        name: `Imported Workbook ${new Date().toISOString()}`,
        tenantId: userId,
        createdBy: userId,
        sheetsJson: {},
        formulasJson: {},
      },
    });
    return workbook.id;
  }

  private async createSheet(workbookId: string, name: string): Promise<string> {
    const sheet = await this.prisma.sheet.create({
      data: {
        workbookId,
        name,
        createdAt: new Date(),
      },
    });
    return sheet.id;
  }
}
