import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';

interface SheetDef {
  name: string;
  data?: unknown[][];
}

interface CellInfo {
  value: unknown;
  formula: string | null;
  numFmt: string | null;
  font: Partial<ExcelJS.Font> | null;
  fill: ExcelJS.Fill | null;
  border: Partial<ExcelJS.Borders> | null;
  alignment: Partial<ExcelJS.Alignment> | null;
  type: string;
}

interface SheetMetadataEntry {
  name: string;
  rowCount?: number;
  colCount?: number;
}

interface WorkbookMetadata {
  sheets: SheetMetadataEntry[];
  totalCells?: number;
  totalFormulas?: number;
  createdAt?: string;
  openedAt?: string;
}

export class SpreadsheetEngineService {
  /**
   * Create a new workbook with multiple sheets.
   * Uses exceljs to generate the workbook, stores metadata in Prisma,
   * and returns the workbook ID plus the binary buffer.
   */
  async createWorkbook(
    name: string,
    sheets: SheetDef[],
    tenantId: string,
    userId: string
  ): Promise<{ workbookId: string; buffer: Buffer }> {
    const workbookId = uuidv4();
    logger.info('Creating workbook', { workbookId, name, tenantId, userId, sheetCount: sheets.length });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = userId;
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.lastModifiedBy = userId;
    workbook.company = tenantId;
    workbook.title = name;

    const sheetMetadata: Array<{ name: string; rowCount: number; colCount: number }> = [];

    for (const sheetDef of sheets) {
      const worksheet = workbook.addWorksheet(sheetDef.name, {
        properties: { defaultRowHeight: 15, defaultColWidth: 12 },
        pageSetup: { paperSize: 9, orientation: 'portrait' },
      });

      if (sheetDef.data && Array.isArray(sheetDef.data) && sheetDef.data.length > 0) {
        let maxCols = 0;
        for (let rowIdx = 0; rowIdx < sheetDef.data.length; rowIdx++) {
          const rowData = sheetDef.data[rowIdx];
          if (!Array.isArray(rowData)) continue;
          const row = worksheet.getRow(rowIdx + 1);
          for (let colIdx = 0; colIdx < rowData.length; colIdx++) {
            const cellValue = rowData[colIdx];
            const cell = row.getCell(colIdx + 1);
            if (typeof cellValue === 'string' && cellValue.startsWith('=')) {
              cell.value = { formula: cellValue.substring(1) } as ExcelJS.CellFormulaValue;
            } else {
              cell.value = cellValue as any;
            }
          }
          maxCols = Math.max(maxCols, rowData.length);
          row.commit();
        }
        sheetMetadata.push({ name: sheetDef.name, rowCount: sheetDef.data.length, colCount: maxCols });
      } else {
        sheetMetadata.push({ name: sheetDef.name, rowCount: 0, colCount: 0 });
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.create({
      data: {
        id: workbookId,
        name: name,
        tenantId: tenantId,
        userId: userId,
        fileSize: buffer.length,
        sheetCount: sheets.length,
        metadata: JSON.stringify({ sheets: sheetMetadata, createdAt: new Date().toISOString() }),
        fileData: buffer,
        status: 'active',
      },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Workbook created successfully', { workbookId, size: buffer.length });

    return { workbookId, buffer };
  }

  /**
   * Parse an uploaded Excel file, extract all sheets/cells/formulas/formatting,
   * and store in the database.
   */
  async openWorkbook(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<{ workbookId: string; sheets: Array<{ name: string; index: number; rowCount: number; colCount: number; cells: Array<{ row: number; col: number; value: unknown; formula: string | null; format: Record<string, unknown> }> }>; summary: Record<string, unknown> }> {
    const workbookId = uuidv4();
    logger.info('Opening workbook', { workbookId, filename, tenantId, userId, fileSize: file.length });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file as Buffer & ArrayBuffer);

    const sheetsInfo: Array<{
      name: string;
      index: number;
      rowCount: number;
      colCount: number;
      cells: Array<{ row: number; col: number; value: unknown; formula: string | null; format: Record<string, unknown> }>;
    }> = [];

    let totalCells = 0;
    let totalFormulas = 0;

    workbook.eachSheet((worksheet: ExcelJS.Worksheet, sheetId: number) => {
      const sheetCells: Array<{ row: number; col: number; value: unknown; formula: string | null; format: Record<string, unknown> }> = [];
      let maxCol = 0;
      let maxRow = 0;

      worksheet.eachRow({ includeEmpty: false }, (row: ExcelJS.Row, rowNumber: number) => {
        maxRow = Math.max(maxRow, rowNumber);
        row.eachCell({ includeEmpty: false }, (cell: ExcelJS.Cell, colNumber: number) => {
          maxCol = Math.max(maxCol, colNumber);
          const formulaValue = cell.formula || null;
          const cellVal = cell.result !== undefined ? cell.result : cell.value;
          const formatInfo = {
            numFmt: cell.numFmt || null,
            font: cell.font || null,
            fill: cell.fill || null,
            border: cell.border || null,
            alignment: cell.alignment || null,
          };

          sheetCells.push({
            row: rowNumber,
            col: colNumber,
            value: cellVal,
            formula: formulaValue,
            format: formatInfo,
          });

          totalCells++;
          if (formulaValue) totalFormulas++;
        });
      });

      sheetsInfo.push({
        name: worksheet.name,
        index: sheetId,
        rowCount: maxRow,
        colCount: maxCol,
        cells: sheetCells,
      });
    });

    await prisma.excelWorkbook.create({
      data: {
        id: workbookId,
        name: filename,
        tenantId: tenantId,
        userId: userId,
        fileSize: file.length,
        sheetCount: sheetsInfo.length,
        metadata: JSON.stringify({
          sheets: sheetsInfo.map((s) => ({ name: s.name, rowCount: s.rowCount, colCount: s.colCount })),
          totalCells,
          totalFormulas,
          openedAt: new Date().toISOString(),
        }),
        fileData: file,
        status: 'active',
      },
    });

    for (const sheet of sheetsInfo) {
      for (const cell of sheet.cells) {
        await prisma.excelCell.create({
          data: {
            id: uuidv4(),
            workbookId: workbookId,
            sheetIndex: sheet.index,
            row: cell.row,
            col: cell.col,
            value: cell.value !== null && cell.value !== undefined ? String(cell.value) : null,
            formula: cell.formula,
            formatting: JSON.stringify(cell.format),
          },
        });
      }
    }

    const summary = {
      workbookId,
      filename,
      sheetCount: sheetsInfo.length,
      totalCells,
      totalFormulas,
      fileSize: file.length,
    };

    logger.info('Workbook opened successfully', summary);
    return { workbookId, sheets: sheetsInfo, summary };
  }

  /**
   * Load a workbook from the database, reconstruct it with exceljs,
   * and return the binary Buffer for download.
   */
  async saveWorkbook(workbookId: string): Promise<Buffer> {
    logger.info('Saving workbook', { workbookId });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    if (record.fileData) {
      await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);
    }

    const cells = await prisma.excelCell.findMany({ where: { workbookId } });
    const cellsBySheet = new Map<number, typeof cells>();

    for (const cell of cells) {
      const existing = cellsBySheet.get(cell.sheetIndex) || [];
      existing.push(cell);
      cellsBySheet.set(cell.sheetIndex, existing);
    }

    for (const [sheetIndex, sheetCells] of cellsBySheet) {
      let worksheet = workbook.getWorksheet(sheetIndex);
      if (!worksheet) {
        worksheet = workbook.addWorksheet(`Sheet${sheetIndex}`);
      }
      for (const cell of sheetCells) {
        const wsCell = worksheet.getCell(cell.row, cell.col);
        if (cell.formula) {
          wsCell.value = { formula: cell.formula } as ExcelJS.CellFormulaValue;
        } else if (cell.value !== null) {
          const numVal = Number(cell.value);
          wsCell.value = isNaN(numVal) ? cell.value : numVal;
        }
        if (cell.formatting) {
          try {
            const fmt = JSON.parse(cell.formatting as string);
            if (fmt.numFmt) wsCell.numFmt = fmt.numFmt;
            if (fmt.font) wsCell.font = fmt.font;
            if (fmt.fill) wsCell.fill = fmt.fill;
            if (fmt.border) wsCell.border = fmt.border;
            if (fmt.alignment) wsCell.alignment = fmt.alignment;
          } catch {
            logger.warn('Failed to parse cell formatting', { workbookId, row: cell.row, col: cell.col });
          }
        }
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    logger.info('Workbook saved successfully', { workbookId, size: buffer.length });
    return buffer;
  }

  /**
   * Add a new sheet to an existing workbook, optionally with initial data.
   */
  async addSheet(
    workbookId: string,
    name: string,
    data?: unknown[][]
  ): Promise<{ sheetIndex: number; name: string; rowCount: number }> {
    logger.info('Adding sheet', { workbookId, name });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    if (record.fileData) {
      await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);
    }

    const worksheet = workbook.addWorksheet(name, {
      properties: { defaultRowHeight: 15, defaultColWidth: 12 },
    });
    const sheetIndex = worksheet.id;
    let rowCount = 0;

    if (data && Array.isArray(data) && data.length > 0) {
      for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
        const rowData = data[rowIdx];
        if (!Array.isArray(rowData)) continue;
        const row = worksheet.getRow(rowIdx + 1);
        for (let colIdx = 0; colIdx < rowData.length; colIdx++) {
          const cell = row.getCell(colIdx + 1);
          const val = rowData[colIdx];
          if (typeof val === 'string' && val.startsWith('=')) {
            cell.value = { formula: val.substring(1) } as ExcelJS.CellFormulaValue;
          } else {
            cell.value = val as any;
          }
        }
        row.commit();
        rowCount++;
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const metadata: WorkbookMetadata = record.metadata ? JSON.parse(record.metadata as string) : { sheets: [] };
    metadata.sheets.push({ name, rowCount, colCount: data ? Math.max(...(data.map((r) => (Array.isArray(r) ? r.length : 0))), 0) : 0 });

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: {
        fileData: buffer,
        fileSize: buffer.length,
        sheetCount: workbook.worksheets.length,
        metadata: JSON.stringify(metadata),
        updatedAt: new Date(),
      },
    });

    logger.info('Sheet added successfully', { workbookId, sheetIndex, name, rowCount });
    return { sheetIndex, name, rowCount };
  }

  /**
   * Remove a sheet from the workbook by its index.
   */
  async deleteSheet(workbookId: string, sheetIndex: number): Promise<{ deleted: boolean; sheetIndex: number }> {
    logger.info('Deleting sheet', { workbookId, sheetIndex });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    if (record.fileData) {
      await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);
    }

    const worksheet = workbook.getWorksheet(sheetIndex);
    if (!worksheet) {
      throw new Error(`Sheet index ${sheetIndex} not found in workbook ${workbookId}`);
    }

    const sheetName = worksheet.name;
    workbook.removeWorksheet(sheetIndex);

    await prisma.excelCell.deleteMany({ where: { workbookId, sheetIndex } });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const metadata: WorkbookMetadata = record.metadata ? JSON.parse(record.metadata as string) : { sheets: [] };
    metadata.sheets = metadata.sheets.filter((s: SheetMetadataEntry) => s.name !== sheetName);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: {
        fileData: buffer,
        fileSize: buffer.length,
        sheetCount: workbook.worksheets.length,
        metadata: JSON.stringify(metadata),
        updatedAt: new Date(),
      },
    });

    logger.info('Sheet deleted successfully', { workbookId, sheetIndex, sheetName });
    return { deleted: true, sheetIndex };
  }

  /**
   * Get a single cell's value, formula, and formatting information.
   */
  async getCell(
    workbookId: string,
    sheet: number,
    row: number,
    col: number
  ): Promise<CellInfo> {
    logger.debug('Getting cell', { workbookId, sheet, row, col });

    const cacheKey = `workbook:${workbookId}:cell:${sheet}:${row}:${col}`;
    const cached = await cacheGet<CellInfo>(cacheKey);
    if (cached) {
      return cached;
    }

    const cellRecord = await prisma.excelCell.findFirst({
      where: { workbookId, sheetIndex: sheet, row, col },
    });

    if (cellRecord) {
      const formatting = cellRecord.formatting ? JSON.parse(cellRecord.formatting as string) : {};
      const info: CellInfo = {
        value: cellRecord.value,
        formula: cellRecord.formula || null,
        numFmt: formatting.numFmt || null,
        font: formatting.font || null,
        fill: formatting.fill || null,
        border: formatting.border || null,
        alignment: formatting.alignment || null,
        type: cellRecord.formula ? 'formula' : typeof cellRecord.value === 'number' ? 'number' : 'string',
      };
      await cacheSet(cacheKey, info, 120);
      return info;
    }

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record || !record.fileData) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);
    const worksheet = workbook.getWorksheet(sheet);
    if (!worksheet) {
      throw new Error(`Sheet ${sheet} not found in workbook ${workbookId}`);
    }

    const cell = worksheet.getCell(row, col);
    const info: CellInfo = {
      value: cell.result !== undefined ? cell.result : cell.value,
      formula: cell.formula || null,
      numFmt: cell.numFmt || null,
      font: cell.font || null,
      fill: cell.fill || null,
      border: cell.border || null,
      alignment: cell.alignment || null,
      type: cell.formula ? 'formula' : cell.type === ExcelJS.ValueType.Number ? 'number' : 'string',
    };

    await cacheSet(cacheKey, info, 120);
    return info;
  }

  /**
   * Set a cell's value (with optional formula), persist to DB, and trigger recalc cache invalidation.
   */
  async setCell(
    workbookId: string,
    sheet: number,
    row: number,
    col: number,
    value: unknown,
    formula?: string
  ): Promise<CellInfo> {
    logger.info('Setting cell', { workbookId, sheet, row, col, value, formula });

    const existing = await prisma.excelCell.findFirst({
      where: { workbookId, sheetIndex: sheet, row, col },
    });

    const formatting = existing?.formatting || '{}';
    const fmtObj = JSON.parse(formatting as string);

    const cellData = {
      workbookId,
      sheetIndex: sheet,
      row,
      col,
      value: value !== null && value !== undefined ? String(value) : null,
      formula: formula || null,
      formatting: JSON.stringify(fmtObj),
    };

    if (existing) {
      await prisma.excelCell.update({
        where: { id: existing.id },
        data: cellData,
      });
    } else {
      await prisma.excelCell.create({
        data: { id: uuidv4(), ...cellData },
      });
    }

    await cacheDel(`workbook:${workbookId}:cell:*`);
    await cacheDel(`workbook:${workbookId}:range:*`);

    const info: CellInfo = {
      value: value,
      formula: formula || null,
      numFmt: fmtObj.numFmt || null,
      font: fmtObj.font || null,
      fill: fmtObj.fill || null,
      border: fmtObj.border || null,
      alignment: fmtObj.alignment || null,
      type: formula ? 'formula' : typeof value === 'number' ? 'number' : 'string',
    };

    logger.info('Cell set successfully', { workbookId, sheet, row, col });
    return info;
  }

  /**
   * Get a range of cells as a 2D array with value, formula, and format for each.
   */
  async getCellRange(
    workbookId: string,
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number
  ): Promise<CellInfo[][]> {
    logger.debug('Getting cell range', { workbookId, sheet, startRow, startCol, endRow, endCol });

    const cacheKey = `workbook:${workbookId}:range:${sheet}:${startRow}:${startCol}:${endRow}:${endCol}`;
    const cached = await cacheGet<CellInfo[][]>(cacheKey);
    if (cached) {
      return cached;
    }

    const cells = await prisma.excelCell.findMany({
      where: {
        workbookId,
        sheetIndex: sheet,
        row: { gte: startRow, lte: endRow },
        col: { gte: startCol, lte: endCol },
      },
    });

    const cellMap = new Map<string, typeof cells[0]>();
    for (const cell of cells) {
      cellMap.set(`${cell.row}:${cell.col}`, cell);
    }

    const result: CellInfo[][] = [];
    for (let r = startRow; r <= endRow; r++) {
      const rowArr: CellInfo[] = [];
      for (let c = startCol; c <= endCol; c++) {
        const cell = cellMap.get(`${r}:${c}`);
        if (cell) {
          const fmt = cell.formatting ? JSON.parse(cell.formatting as string) : {};
          rowArr.push({
            value: cell.value,
            formula: cell.formula || null,
            numFmt: fmt.numFmt || null,
            font: fmt.font || null,
            fill: fmt.fill || null,
            border: fmt.border || null,
            alignment: fmt.alignment || null,
            type: cell.formula ? 'formula' : typeof cell.value === 'number' ? 'number' : 'string',
          });
        } else {
          rowArr.push({
            value: null, formula: null, numFmt: null,
            font: null, fill: null, border: null, alignment: null, type: 'empty',
          });
        }
      }
      result.push(rowArr);
    }

    await cacheSet(cacheKey, result, 120);
    logger.debug('Cell range retrieved', { workbookId, sheet, rows: result.length, cols: result[0]?.length || 0 });
    return result;
  }

  /**
   * Merge a range of cells in a given sheet.
   */
  async mergeCells(
    workbookId: string,
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number
  ): Promise<{ merged: boolean; range: string }> {
    logger.info('Merging cells', { workbookId, sheet, startRow, startCol, endRow, endCol });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record || !record.fileData) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);

    const worksheet = workbook.getWorksheet(sheet);
    if (!worksheet) {
      throw new Error(`Sheet ${sheet} not found in workbook ${workbookId}`);
    }

    const startColLetter = this.colNumberToLetter(startCol);
    const endColLetter = this.colNumberToLetter(endCol);
    const rangeStr = `${startColLetter}${startRow}:${endColLetter}${endRow}`;

    worksheet.mergeCells(startRow, startCol, endRow, endCol);

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Cells merged successfully', { workbookId, sheet, range: rangeStr });
    return { merged: true, range: rangeStr };
  }

  /**
   * Auto-resize columns based on content width in the given sheet.
   */
  async autoFitColumns(
    workbookId: string,
    sheet: number
  ): Promise<{ fitted: boolean; columnWidths: Array<{ col: number; width: number }> }> {
    logger.info('Auto-fitting columns', { workbookId, sheet });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record || !record.fileData) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);

    const worksheet = workbook.getWorksheet(sheet);
    if (!worksheet) {
      throw new Error(`Sheet ${sheet} not found in workbook ${workbookId}`);
    }

    const columnWidths: Array<{ col: number; width: number }> = [];
    const minWidth = 8;
    const maxWidth = 60;
    const paddingFactor = 1.2;

    worksheet.columns.forEach((column, colIndex) => {
      let maxLen = minWidth;
      column.eachCell?.({ includeEmpty: false }, (cell: ExcelJS.Cell) => {
        const cellText = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
        const lines = cellText.split('\n');
        const longestLine = Math.max(...lines.map((l: string) => l.length));
        maxLen = Math.max(maxLen, longestLine);
      });

      const calculatedWidth = Math.min(Math.ceil(maxLen * paddingFactor), maxWidth);
      column.width = calculatedWidth;
      columnWidths.push({ col: colIndex + 1, width: calculatedWidth });
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Columns auto-fitted', { workbookId, sheet, columnCount: columnWidths.length });
    return { fitted: true, columnWidths };
  }

  /**
   * Freeze rows and columns at the given row/col position in the sheet.
   */
  async freezePanes(
    workbookId: string,
    sheet: number,
    row: number,
    col: number
  ): Promise<{ frozen: boolean; frozenRow: number; frozenCol: number }> {
    logger.info('Freezing panes', { workbookId, sheet, row, col });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record || !record.fileData) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);

    const worksheet = workbook.getWorksheet(sheet);
    if (!worksheet) {
      throw new Error(`Sheet ${sheet} not found in workbook ${workbookId}`);
    }

    worksheet.views = [
      {
        state: 'frozen',
        xSplit: col > 0 ? col : 0,
        ySplit: row > 0 ? row : 0,
        topLeftCell: `${this.colNumberToLetter(col + 1)}${row + 1}`,
        activeCell: 'A1',
      },
    ];

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Panes frozen', { workbookId, sheet, row, col });
    return { frozen: true, frozenRow: row, frozenCol: col };
  }

  /**
   * Convert a 1-based column number to a letter (1 -> A, 27 -> AA, etc.)
   */
  private colNumberToLetter(col: number): string {
    let result = '';
    let c = col;
    while (c > 0) {
      c--;
      result = String.fromCharCode(65 + (c % 26)) + result;
      c = Math.floor(c / 26);
    }
    return result || 'A';
  }
}

export const spreadsheetEngineService = new SpreadsheetEngineService();
