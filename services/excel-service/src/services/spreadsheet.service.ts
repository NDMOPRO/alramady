import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { Parser as FormulaParser } from 'hot-formula-parser';
import Decimal from 'decimal.js';
import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

interface FormulaCoord {
  column: { index: number };
  row: { index: number };
}

interface SheetMetadata {
  name: string;
  rowCount: number;
  columnCount: number;
  index?: number;
  formulaCount?: number;
  styles?: Record<string, any>;
  [key: string]: any;
}

interface FormulaParserInternal extends FormulaParser {
  _currentContext?: Record<string, unknown>;
}

interface PrismaWhereClause {
  tenantId: string;
  name?: { contains: string; mode: string };
}

const prisma = new PrismaClient();

export class SpreadsheetService {
  private formulaParser: FormulaParser;

  constructor() {
    this.formulaParser = new FormulaParser();
    this.setupFormulaCallbacks();
  }

  private setupFormulaCallbacks() {
    this.formulaParser.on('callCellValue', (cellCoord: FormulaCoord, done: (val: unknown) => void) => {
      const cellRef = `${String.fromCharCode(65 + cellCoord.column.index)}${cellCoord.row.index + 1}`;
      const value = (this.formulaParser as FormulaParserInternal)._currentContext?.[cellRef];
      done(value !== undefined ? value : 0);
    });

    this.formulaParser.on('callRangeValue', (startCoord: FormulaCoord, endCoord: FormulaCoord, done: (vals: unknown[][]) => void) => {
      const values: unknown[][] = [];
      const ctx = (this.formulaParser as FormulaParserInternal)._currentContext || {};
      for (let row = startCoord.row.index; row <= endCoord.row.index; row++) {
        const rowValues: unknown[] = [];
        for (let col = startCoord.column.index; col <= endCoord.column.index; col++) {
          const cellRef = `${String.fromCharCode(65 + col)}${row + 1}`;
          rowValues.push(ctx[cellRef] !== undefined ? ctx[cellRef] : 0);
        }
        values.push(rowValues);
      }
      done(values);
    });
  }

  async createWorkbook(name: string, tenantId: string, userId: string, sheets?: { name: string; data?: unknown[][] }[]) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Rasid Platform';
    wb.created = new Date();

    const sheetsData: SheetMetadata[] = [];

    if (sheets && sheets.length > 0) {
      for (const sheetDef of sheets) {
        const ws = wb.addWorksheet(sheetDef.name);
        if (sheetDef.data) {
          for (const row of sheetDef.data) {
            ws.addRow(row);
          }
        }
        sheetsData.push({
          name: sheetDef.name,
          rowCount: sheetDef.data?.length || 0,
          columnCount: sheetDef.data?.[0]?.length || 0,
        });
      }
    } else {
      wb.addWorksheet('Sheet1');
      sheetsData.push({ name: 'Sheet1', rowCount: 0, columnCount: 0 });
    }

    const buffer = await wb.xlsx.writeBuffer();

    const workbook = await prisma.workbook.create({
      data: {
        tenantId,
        name,
        sheetsJson: sheetsData as unknown as Prisma.InputJsonValue,
        formulasJson: {},
        createdBy: userId,
      },
    });

    const dataset = await prisma.dataset.create({
      data: {
        tenantId,
        name,
        sourceType: 'manual',
        format: 'XLSX',
        sizeBytes: BigInt(buffer.byteLength),
        rowCount: BigInt(sheetsData.reduce((s: number, sh: SheetMetadata) => s + sh.rowCount, 0)),
        columnCount: sheetsData[0]?.columnCount || 0,
        status: 'active',
        engine: 'excel',
        createdBy: userId,
      },
    });

    await prisma.workbook.update({
      where: { id: workbook.id },
      data: { datasetId: dataset.id },
    });

    return {
      id: workbook.id,
      datasetId: dataset.id,
      name,
      sheets: sheetsData,
      sizeBytes: buffer.byteLength,
    };
  }

  async openWorkbook(file: Buffer, filename: string, tenantId: string, userId: string) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file as Buffer & ArrayBuffer);

    const sheetsData: SheetMetadata[] = [];
    const allFormulas: Record<string, Record<string, string>> = {};

    wb.eachSheet((ws, sheetId) => {
      const sheetFormulas: Record<string, string> = {};
      let maxRow = 0;
      let maxCol = 0;

      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        maxRow = Math.max(maxRow, rowNumber);
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          maxCol = Math.max(maxCol, colNumber);
          if (cell.formula) {
            const cellRef = `${String.fromCharCode(64 + colNumber)}${rowNumber}`;
            sheetFormulas[cellRef] = cell.formula;
          }
        });
      });

      sheetsData.push({
        name: ws.name,
        index: sheetId,
        rowCount: maxRow,
        columnCount: maxCol,
        formulaCount: Object.keys(sheetFormulas).length,
      });

      if (Object.keys(sheetFormulas).length > 0) {
        allFormulas[ws.name] = sheetFormulas;
      }
    });

    const workbook = await prisma.workbook.create({
      data: {
        tenantId,
        name: filename.replace(/\.[^.]+$/, ''),
        sheetsJson: sheetsData as unknown as Prisma.InputJsonValue,
        formulasJson: allFormulas,
        createdBy: userId,
      },
    });

    return {
      id: workbook.id,
      name: workbook.name,
      sheets: sheetsData,
      totalFormulas: Object.values(allFormulas).reduce((s, f) => s + Object.keys(f).length, 0),
    };
  }

  async getCell(workbookId: string, sheetName: string, row: number, col: number) {
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) throw new Error('Workbook not found');

    const formulasJson = workbook.formulasJson as Record<string, Record<string, string>> | null;
    const formulas = formulasJson?.[sheetName] || {};
    const cellRef = `${String.fromCharCode(64 + col)}${row}`;
    const formula = formulas[cellRef] || null;

    if (workbook.datasetId) {
      const dataRow = await prisma.dataRow.findFirst({
        where: { datasetId: workbook.datasetId, rowIndex: row - 1 },
      });
      const data = (dataRow?.data as Record<string, unknown>) || {};
      const columns = Object.keys(data);
      const value = col <= columns.length ? data[columns[col - 1]] : null;

      return { cell: cellRef, value, formula, row, col, sheetName };
    }

    return { cell: cellRef, value: null, formula, row, col, sheetName };
  }

  async setCell(workbookId: string, sheetName: string, row: number, col: number, value: unknown, formula?: string) {
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) throw new Error('Workbook not found');

    const formulas = (workbook.formulasJson as Record<string, Record<string, string>>) || {};
    if (!formulas[sheetName]) formulas[sheetName] = {};
    const cellRef = `${String.fromCharCode(64 + col)}${row}`;

    if (formula) {
      formulas[sheetName][cellRef] = formula;
    }

    await prisma.workbook.update({
      where: { id: workbookId },
      data: { formulasJson: formulas },
    });

    if (workbook.datasetId && value !== undefined) {
      const dataRow = await prisma.dataRow.findFirst({
        where: { datasetId: workbook.datasetId, rowIndex: row - 1 },
      });

      if (dataRow) {
        const data = dataRow.data as Record<string, unknown>;
        const columns = Object.keys(data);
        if (col <= columns.length) {
          data[columns[col - 1]] = value;
          await prisma.dataRow.update({ where: { id: dataRow.id }, data: { data: data as Prisma.InputJsonValue } });
        }
      }
    }

    let computedValue = value;
    if (formula) {
      computedValue = this.evaluateFormula(formula, workbookId, sheetName);
    }

    return { cell: cellRef, value: computedValue, formula, row, col, sheetName };
  }

  evaluateFormula(formula: string, workbookId?: string, sheetName?: string): unknown {
    try {
      const result = this.formulaParser.parse(formula);
      if (result.error) {
        logger.warn('Formula evaluation error', { formula, error: result.error });
        return `#${result.error}`;
      }
      return result.result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Formula parse error', { formula, error: message });
      return '#ERROR';
    }
  }

  async evaluateAllFormulas(workbookId: string) {
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) throw new Error('Workbook not found');

    const formulas = (workbook.formulasJson as Record<string, Record<string, string>>) || {};
    const results: Record<string, Record<string, unknown>> = {};

    for (const [sheetName, sheetFormulas] of Object.entries(formulas)) {
      results[sheetName] = {};
      const cells = sheetFormulas as Record<string, string>;

      const sorted = this.topologicalSort(cells);

      for (const cellRef of sorted) {
        const formula = cells[cellRef];
        if (formula) {
          const result = this.evaluateFormula(formula, workbookId, sheetName);
          results[sheetName][cellRef] = result;
          if (!(this.formulaParser as FormulaParserInternal)._currentContext) {
            (this.formulaParser as FormulaParserInternal)._currentContext = {};
          }
          (this.formulaParser as FormulaParserInternal)._currentContext![cellRef] = result;
        }
      }
    }

    return results;
  }

  private topologicalSort(formulas: Record<string, string>): string[] {
    const cellRefs = Object.keys(formulas);
    const deps = new Map<string, Set<string>>();
    const cellPattern = /([A-Z]+)(\d+)/g;

    for (const [cell, formula] of Object.entries(formulas)) {
      const cellDeps = new Set<string>();
      let match;
      while ((match = cellPattern.exec(formula)) !== null) {
        const ref = match[0];
        if (formulas[ref]) cellDeps.add(ref);
      }
      cellPattern.lastIndex = 0;
      deps.set(cell, cellDeps);
    }

    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (cell: string) => {
      if (visited.has(cell)) return;
      if (visiting.has(cell)) {
        logger.warn('Circular reference detected', { cell });
        return;
      }
      visiting.add(cell);
      const cellDeps = deps.get(cell) || new Set();
      for (const dep of cellDeps) {
        visit(dep);
      }
      visiting.delete(cell);
      visited.add(cell);
      sorted.push(cell);
    };

    for (const cell of cellRefs) {
      visit(cell);
    }

    return sorted;
  }

  async addSheet(workbookId: string, name: string) {
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) throw new Error('Workbook not found');

    const sheets = (workbook.sheetsJson as unknown as SheetMetadata[]) || [];
    sheets.push({ name, rowCount: 0, columnCount: 0 });

    await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheets as unknown as Prisma.InputJsonValue },
    });

    return { workbookId, sheets };
  }

  async deleteSheet(workbookId: string, sheetIndex: number) {
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) throw new Error('Workbook not found');

    const sheets = (workbook.sheetsJson as unknown as SheetMetadata[]) || [];
    if (sheetIndex < 0 || sheetIndex >= sheets.length) throw new Error('Invalid sheet index');
    if (sheets.length <= 1) throw new Error('Cannot delete the last sheet');

    const removedSheet = sheets.splice(sheetIndex, 1)[0];

    const formulas = (workbook.formulasJson as Record<string, Record<string, string>>) || {};
    delete formulas[removedSheet.name];

    await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheets as unknown as Prisma.InputJsonValue, formulasJson: formulas as Prisma.InputJsonValue },
    });

    return { workbookId, removedSheet: removedSheet.name, remainingSheets: sheets };
  }

  async exportWorkbook(workbookId: string) {
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) throw new Error('Workbook not found');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Rasid Platform';
    const sheets = (workbook.sheetsJson as unknown as SheetMetadata[]) || [];

    for (const sheetDef of sheets) {
      const ws = wb.addWorksheet(sheetDef.name);

      if (workbook.datasetId) {
        const columns = await prisma.datasetColumn.findMany({
          where: { datasetId: workbook.datasetId },
          orderBy: { position: 'asc' },
        });
        const rows = await prisma.dataRow.findMany({
          where: { datasetId: workbook.datasetId },
          orderBy: { rowIndex: 'asc' },
        });

        ws.columns = columns.map(c => ({ header: c.name, key: c.name, width: 15 }));

        const headerRow = ws.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

        for (const row of rows) {
          ws.addRow(row.data as Record<string, unknown>);
        }
      }

      const sheetFormulas = (workbook.formulasJson as Record<string, Record<string, string>> | null)?.[sheetDef.name] || {};
      for (const [cellRef, formula] of Object.entries(sheetFormulas)) {
        const match = cellRef.match(/([A-Z]+)(\d+)/);
        if (match) {
          const col = match[1].charCodeAt(0) - 64;
          const row = parseInt(match[2]);
          const cell = ws.getCell(row, col);
          cell.value = { formula: formula as string } as ExcelJS.CellFormulaValue;
        }
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    return {
      content: Buffer.from(buffer),
      filename: `${workbook.name}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async formatCells(workbookId: string, sheetName: string, range: string, style: {
    bold?: boolean; italic?: boolean; fontSize?: number; fontColor?: string;
    bgColor?: string; borderStyle?: string; numberFormat?: string;
    alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
  }) {
    const workbook = await prisma.workbook.findUnique({ where: { id: workbookId } });
    if (!workbook) throw new Error('Workbook not found');

    const sheets = (workbook.sheetsJson as unknown as SheetMetadata[]) || [];
    const sheet = sheets.find((s: SheetMetadata) => s.name === sheetName);
    if (!sheet) throw new Error('Sheet not found');

    if (!sheet.styles) sheet.styles = {};
    sheet.styles[range] = style;

    await prisma.workbook.update({
      where: { id: workbookId },
      data: { sheetsJson: sheets as unknown as Prisma.InputJsonValue },
    });

    return { workbookId, sheetName, range, style };
  }

  async listWorkbooks(tenantId: string, options: { page?: number; limit?: number; search?: string }) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: PrismaWhereClause = { tenantId };
    if (options.search) {
      where.name = { contains: options.search, mode: 'insensitive' };
    }

    const [workbooks, total] = await Promise.all([
      prisma.workbook.findMany({ where: where as any, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.workbook.count({ where: where as any }),
    ]);

    return {
      data: workbooks.map(wb => ({
        id: wb.id,
        name: wb.name,
        sheets: wb.sheetsJson,
        createdAt: wb.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

export const spreadsheetService = new SpreadsheetService();
