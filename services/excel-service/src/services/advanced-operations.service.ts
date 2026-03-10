import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import { prisma } from '../utils/prisma';
import { cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';

interface PivotConfig {
  rowFields: string[];
  colField: string;
  valueField: string;
  aggFunc: string;
}

interface SortColumn {
  column: number;
  order: 'asc' | 'desc';
}

interface ComparisonResult {
  addedSheets: string[];
  removedSheets: string[];
  changedCells: Array<{
    sheet: string;
    row: number;
    col: number;
    oldValue: unknown;
    newValue: unknown;
  }>;
  summary: string;
}

interface ProtectionPermissions {
  selectLockedCells: boolean;
  selectUnlockedCells: boolean;
}

export class AdvancedOperationsService {
  /**
   * Create a pivot table from source data in a new sheet.
   * Aggregates data by row fields, column field, and value field using
   * the specified aggregation function (sum, count, average, min, max).
   */
  async pivotTable(
    workbookId: string,
    sourceSheet: number,
    config: PivotConfig
  ): Promise<{ pivotSheetIndex: number; rowCount: number; colCount: number; pivotData: Array<Record<string, unknown>> }> {
    logger.info('Creating pivot table', { workbookId, sourceSheet, config });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record || !record.fileData) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);

    const worksheet = workbook.getWorksheet(sourceSheet);
    if (!worksheet) {
      throw new Error(`Sheet ${sourceSheet} not found in workbook ${workbookId}`);
    }

    const headers: string[] = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell({ includeEmpty: false }, (cell: ExcelJS.Cell, colNumber: number) => {
      headers[colNumber - 1] = String(cell.value || '');
    });

    const rows: Record<string, unknown>[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row: ExcelJS.Row, rowNumber: number) => {
      if (rowNumber === 1) return;
      const record: Record<string, unknown> = {};
      row.eachCell({ includeEmpty: false }, (cell: ExcelJS.Cell, colNumber: number) => {
        const headerName = headers[colNumber - 1] || `Col${colNumber}`;
        record[headerName] = cell.value;
      });
      rows.push(record);
    });

    const pivotMap = new Map<string, Map<string, number[]>>();
    const uniqueColValues = new Set<string>();

    for (const row of rows) {
      const rowKey = config.rowFields.map((f) => String(row[f] || '')).join('|');
      const colVal = String(row[config.colField] || '');
      const numValue = Number(row[config.valueField]) || 0;

      uniqueColValues.add(colVal);

      if (!pivotMap.has(rowKey)) {
        pivotMap.set(rowKey, new Map());
      }
      const colMap = pivotMap.get(rowKey)!;
      if (!colMap.has(colVal)) {
        colMap.set(colVal, []);
      }
      colMap.get(colVal)!.push(numValue);
    }

    const sortedColValues = Array.from(uniqueColValues).sort();
    const pivotSheet = workbook.addWorksheet('PivotTable');

    const pivotHeaders = [...config.rowFields, ...sortedColValues, 'Grand Total'];
    const pivotHeaderRow = pivotSheet.getRow(1);
    pivotHeaders.forEach((h, idx) => {
      const cell = pivotHeaderRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } } as ExcelJS.Fill;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });
    pivotHeaderRow.commit();

    let currentRow = 2;
    const pivotData: Array<Record<string, unknown>> = [];

    for (const [rowKey, colMap] of pivotMap) {
      const rowFields = rowKey.split('|');
      const row = pivotSheet.getRow(currentRow);
      const rowData: Record<string, unknown> = {};

      config.rowFields.forEach((field, idx) => {
        row.getCell(idx + 1).value = rowFields[idx];
        rowData[field] = rowFields[idx];
      });

      let grandTotal = new Decimal(0);

      sortedColValues.forEach((colVal, idx) => {
        const values = colMap.get(colVal) || [];
        const aggResult = this.aggregate(values, config.aggFunc);
        const colIdx = config.rowFields.length + idx + 1;
        row.getCell(colIdx).value = aggResult;
        row.getCell(colIdx).numFmt = '#,##0.00';
        rowData[colVal] = aggResult;
        grandTotal = grandTotal.plus(new Decimal(aggResult));
      });

      row.getCell(pivotHeaders.length).value = grandTotal.toNumber();
      row.getCell(pivotHeaders.length).numFmt = '#,##0.00';
      row.getCell(pivotHeaders.length).font = { bold: true };
      rowData['Grand Total'] = grandTotal.toNumber();

      row.commit();
      pivotData.push(rowData);
      currentRow++;
    }

    const totalRow = pivotSheet.getRow(currentRow);
    totalRow.getCell(1).value = 'Grand Total';
    totalRow.getCell(1).font = { bold: true };

    sortedColValues.forEach((colVal, idx) => {
      const allValues: number[] = [];
      for (const colMap of pivotMap.values()) {
        const vals = colMap.get(colVal) || [];
        allValues.push(...vals);
      }
      const colIdx = config.rowFields.length + idx + 1;
      totalRow.getCell(colIdx).value = this.aggregate(allValues, config.aggFunc);
      totalRow.getCell(colIdx).numFmt = '#,##0.00';
      totalRow.getCell(colIdx).font = { bold: true };
    });
    totalRow.commit();

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Pivot table created', { workbookId, rows: pivotData.length, cols: pivotHeaders.length });
    return {
      pivotSheetIndex: pivotSheet.id,
      rowCount: pivotData.length,
      colCount: pivotHeaders.length,
      pivotData,
    };
  }

  /**
   * Multi-column sort within a specified range.
   */
  async sortRange(
    workbookId: string,
    sheet: number,
    range: string,
    sortColumns: SortColumn[]
  ): Promise<{ sorted: boolean; range: string; rowCount: number }> {
    logger.info('Sorting range', { workbookId, sheet, range, sortColumns });

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

    const parsedRange = this.parseRange(range);
    const rows: unknown[][] = [];

    for (let r = parsedRange.startRow; r <= parsedRange.endRow; r++) {
      const rowData: unknown[] = [];
      for (let c = parsedRange.startCol; c <= parsedRange.endCol; c++) {
        const cell = worksheet.getCell(r, c);
        rowData.push(cell.value);
      }
      rows.push(rowData);
    }

    rows.sort((a, b) => {
      for (const sc of sortColumns) {
        const colIdx = sc.column - parsedRange.startCol;
        if (colIdx < 0 || colIdx >= a.length) continue;

        const valA = a[colIdx];
        const valB = b[colIdx];
        const numA = Number(valA);
        const numB = Number(valB);
        let cmp = 0;

        if (!isNaN(numA) && !isNaN(numB)) {
          cmp = numA - numB;
        } else {
          cmp = String(valA || '').localeCompare(String(valB || ''));
        }

        if (cmp !== 0) {
          return sc.order === 'desc' ? -cmp : cmp;
        }
      }
      return 0;
    });

    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const cell = worksheet.getCell(parsedRange.startRow + r, parsedRange.startCol + c);
        cell.value = rows[r][c] as any;
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Range sorted', { workbookId, sheet, range, rowCount: rows.length });
    return { sorted: true, range, rowCount: rows.length };
  }

  /**
   * Auto-filter a range: return only rows matching filter criteria per column.
   */
  async filterRange(
    workbookId: string,
    sheet: number,
    range: string,
    filters: Record<string, unknown[]>
  ): Promise<{ filtered: boolean; range: string; visibleRows: number; totalRows: number; data: unknown[][] }> {
    logger.info('Filtering range', { workbookId, sheet, range, filters });

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

    const parsedRange = this.parseRange(range);

    const headers: string[] = [];
    for (let c = parsedRange.startCol; c <= parsedRange.endCol; c++) {
      headers.push(String(worksheet.getCell(parsedRange.startRow, c).value || `Col${c}`));
    }

    const allRows: unknown[][] = [];
    for (let r = parsedRange.startRow + 1; r <= parsedRange.endRow; r++) {
      const rowData: unknown[] = [];
      for (let c = parsedRange.startCol; c <= parsedRange.endCol; c++) {
        rowData.push(worksheet.getCell(r, c).value);
      }
      allRows.push(rowData);
    }

    const filteredRows = allRows.filter((row) => {
      for (const [colName, allowedValues] of Object.entries(filters)) {
        const colIdx = headers.indexOf(colName);
        if (colIdx === -1) continue;
        const cellVal = row[colIdx];
        const stringVal = String(cellVal || '');
        const numVal = Number(cellVal);

        const matchesAny = allowedValues.some((av) => {
          if (av === cellVal) return true;
          if (String(av) === stringVal) return true;
          if (!isNaN(Number(av)) && !isNaN(numVal) && Number(av) === numVal) return true;
          return false;
        });

        if (!matchesAny) return false;
      }
      return true;
    });

    worksheet.autoFilter = {
      from: { row: parsedRange.startRow, column: parsedRange.startCol },
      to: { row: parsedRange.endRow, column: parsedRange.endCol },
    };

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Range filtered', { workbookId, sheet, range, visibleRows: filteredRows.length, totalRows: allRows.length });
    return {
      filtered: true,
      range,
      visibleRows: filteredRows.length,
      totalRows: allRows.length,
      data: filteredRows,
    };
  }

  /**
   * Find and replace text across all sheets of a workbook.
   */
  async findReplace(
    workbookId: string,
    find: string,
    replace: string,
    options: { matchCase?: boolean; wholeWord?: boolean; regex?: boolean }
  ): Promise<{ replacements: number; affectedSheets: string[]; details: Array<{ sheet: string; row: number; col: number; oldValue: string; newValue: string }> }> {
    logger.info('Find and replace', { workbookId, find, replace, options });

    const record = await prisma.excelWorkbook.findUnique({ where: { id: workbookId } });
    if (!record || !record.fileData) {
      throw new Error(`Workbook not found: ${workbookId}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(record.fileData as Buffer & ArrayBuffer);

    let totalReplacements = 0;
    const affectedSheets = new Set<string>();
    const details: Array<{ sheet: string; row: number; col: number; oldValue: string; newValue: string }> = [];

    let searchPattern: RegExp;
    if (options.regex) {
      const flags = options.matchCase ? 'g' : 'gi';
      searchPattern = new RegExp(find, flags);
    } else {
      const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
      const flags = options.matchCase ? 'g' : 'gi';
      searchPattern = new RegExp(pattern, flags);
    }

    workbook.eachSheet((worksheet: ExcelJS.Worksheet) => {
      worksheet.eachRow({ includeEmpty: false }, (row: ExcelJS.Row, rowNumber: number) => {
        row.eachCell({ includeEmpty: false }, (cell: ExcelJS.Cell, colNumber: number) => {
          if (cell.value === null || cell.value === undefined) return;
          if (cell.formula) return;

          const strVal = String(cell.value);
          if (searchPattern.test(strVal)) {
            searchPattern.lastIndex = 0;
            const newVal = strVal.replace(searchPattern, replace);
            const oldVal = strVal;

            const numNew = Number(newVal);
            cell.value = !isNaN(numNew) && newVal.trim() !== '' ? numNew : newVal;

            const matchCount = (oldVal.match(searchPattern) || []).length;
            totalReplacements += matchCount;
            affectedSheets.add(worksheet.name);

            details.push({
              sheet: worksheet.name,
              row: rowNumber,
              col: colNumber,
              oldValue: oldVal,
              newValue: newVal,
            });
          }
        });
      });
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Find and replace complete', { workbookId, totalReplacements, affectedSheets: Array.from(affectedSheets) });
    return {
      replacements: totalReplacements,
      affectedSheets: Array.from(affectedSheets),
      details,
    };
  }

  /**
   * Protect a sheet with a password and configurable permissions.
   */
  async protectSheet(
    workbookId: string,
    sheet: number,
    password: string,
    permissions: { selectLockedCells?: boolean; selectUnlockedCells?: boolean }
  ): Promise<{ protected: boolean; sheetName: string; permissions: ProtectionPermissions }> {
    logger.info('Protecting sheet', { workbookId, sheet });

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

    const sheetName = worksheet.name;

    await worksheet.protect(password, {
      selectLockedCells: permissions.selectLockedCells !== false,
      selectUnlockedCells: permissions.selectUnlockedCells !== false,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: false,
      sort: false,
      autoFilter: false,
      pivotTables: false,
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.excelWorkbook.update({
      where: { id: workbookId },
      data: { fileData: buffer, fileSize: buffer.length, updatedAt: new Date() },
    });

    await cacheDel(`workbook:${workbookId}:*`);
    logger.info('Sheet protected', { workbookId, sheet, sheetName });
    return {
      protected: true,
      sheetName,
      permissions: {
        selectLockedCells: permissions.selectLockedCells !== false,
        selectUnlockedCells: permissions.selectUnlockedCells !== false,
      },
    };
  }

  /**
   * Compare two workbooks: detect added/removed sheets and changed cells.
   */
  async compareWorkbooks(id1: string, id2: string): Promise<ComparisonResult> {
    logger.info('Comparing workbooks', { id1, id2 });

    const [record1, record2] = await Promise.all([
      prisma.excelWorkbook.findUnique({ where: { id: id1 } }),
      prisma.excelWorkbook.findUnique({ where: { id: id2 } }),
    ]);

    if (!record1 || !record1.fileData) {
      throw new Error(`Workbook not found: ${id1}`);
    }
    if (!record2 || !record2.fileData) {
      throw new Error(`Workbook not found: ${id2}`);
    }

    const wb1 = new ExcelJS.Workbook();
    const wb2 = new ExcelJS.Workbook();
    await wb1.xlsx.load(record1.fileData as Buffer & ArrayBuffer);
    await wb2.xlsx.load(record2.fileData as Buffer & ArrayBuffer);

    const sheets1 = new Map<string, ExcelJS.Worksheet>();
    const sheets2 = new Map<string, ExcelJS.Worksheet>();

    wb1.eachSheet((ws: ExcelJS.Worksheet) => { sheets1.set(ws.name, ws); });
    wb2.eachSheet((ws: ExcelJS.Worksheet) => { sheets2.set(ws.name, ws); });

    const sheetNames1 = new Set(sheets1.keys());
    const sheetNames2 = new Set(sheets2.keys());

    const addedSheets: string[] = [];
    const removedSheets: string[] = [];
    const changedCells: ComparisonResult['changedCells'] = [];

    for (const name of sheetNames2) {
      if (!sheetNames1.has(name)) {
        addedSheets.push(name);
      }
    }

    for (const name of sheetNames1) {
      if (!sheetNames2.has(name)) {
        removedSheets.push(name);
      }
    }

    for (const [name, ws1] of sheets1) {
      const ws2 = sheets2.get(name);
      if (!ws2) continue;

      const maxRow = Math.max(ws1.rowCount, ws2.rowCount);
      const maxCol = Math.max(ws1.columnCount, ws2.columnCount);

      for (let r = 1; r <= maxRow; r++) {
        for (let c = 1; c <= maxCol; c++) {
          const cell1 = ws1.getCell(r, c);
          const cell2 = ws2.getCell(r, c);

          const val1 = cell1.formula || cell1.value;
          const val2 = cell2.formula || cell2.value;

          const str1 = val1 !== null && val1 !== undefined ? String(val1) : '';
          const str2 = val2 !== null && val2 !== undefined ? String(val2) : '';

          if (str1 !== str2) {
            changedCells.push({
              sheet: name,
              row: r,
              col: c,
              oldValue: val1,
              newValue: val2,
            });
          }
        }
      }
    }

    const summary = [
      `Compared workbook "${record1.name}" with "${record2.name}".`,
      `Added sheets: ${addedSheets.length > 0 ? addedSheets.join(', ') : 'none'}.`,
      `Removed sheets: ${removedSheets.length > 0 ? removedSheets.join(', ') : 'none'}.`,
      `Changed cells: ${changedCells.length}.`,
    ].join(' ');

    logger.info('Workbook comparison complete', {
      id1, id2,
      addedSheets: addedSheets.length,
      removedSheets: removedSheets.length,
      changedCells: changedCells.length,
    });

    return { addedSheets, removedSheets, changedCells, summary };
  }

  /**
   * Aggregate an array of numbers using the specified function.
   */
  private aggregate(values: number[], func: string): number {
    if (values.length === 0) return 0;

    switch (func.toLowerCase()) {
      case 'sum': {
        let s = new Decimal(0);
        for (const v of values) s = s.plus(new Decimal(v));
        return s.toNumber();
      }
      case 'count':
        return values.length;
      case 'average': {
        let s = new Decimal(0);
        for (const v of values) s = s.plus(new Decimal(v));
        return s.dividedBy(values.length).toNumber();
      }
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      default: {
        let s = new Decimal(0);
        for (const v of values) s = s.plus(new Decimal(v));
        return s.toNumber();
      }
    }
  }

  /**
   * Parse a range string like "A1:C5" into start/end row/col coordinates.
   */
  private parseRange(range: string): { startRow: number; startCol: number; endRow: number; endCol: number } {
    const parts = range.split(':');
    const start = this.parseCellAddress(parts[0].trim());
    const end = parts.length > 1 ? this.parseCellAddress(parts[1].trim()) : start;
    return {
      startRow: start.row,
      startCol: start.col,
      endRow: end.row,
      endCol: end.col,
    };
  }

  private parseCellAddress(addr: string): { row: number; col: number } {
    const match = addr.match(/^([A-Z]+)(\d+)$/i);
    if (!match) {
      throw new Error(`Invalid cell address: ${addr}`);
    }
    const letters = match[1].toUpperCase();
    let col = 0;
    for (let i = 0; i < letters.length; i++) {
      col = col * 26 + (letters.charCodeAt(i) - 64);
    }
    return { row: parseInt(match[2], 10), col };
  }
}

export const advancedOperationsService = new AdvancedOperationsService();
