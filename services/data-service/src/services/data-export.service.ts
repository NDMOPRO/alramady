import { PrismaClient } from '@prisma/client';
import { Parser as Json2CsvParser } from 'json2csv';
import ExcelJS from 'exceljs';
import archiver from 'archiver';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { logger } from '../utils/logger';

export class DataExportService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async exportCSV(
    datasetId: string,
    options: { encoding?: string; delimiter?: string }
  ): Promise<Buffer> {
    logger.info('Exporting dataset as CSV', { datasetId, options });

    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: datasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const rows = dataRows.map(r => r.data as Record<string, any>);

    if (rows.length === 0) {
      throw new Error(`Dataset ${datasetId} has no rows to export`);
    }

    const delimiter = options.delimiter || ',';
    const encoding = options.encoding || 'utf-8';

    const fields = dataset.columns.map(c => c.name);
    const json2csvParser = new Json2CsvParser({
      fields,
      delimiter,
      header: true,
      eol: '\n',
      withBOM: encoding.toLowerCase() === 'utf-8-bom',
    });

    const csvContent = json2csvParser.parse(rows);

    let outputBuffer: Buffer;
    if (encoding.toLowerCase() === 'utf-8' || encoding.toLowerCase() === 'utf-8-bom') {
      outputBuffer = Buffer.from(csvContent, 'utf-8');
    } else {
      outputBuffer = Buffer.from(csvContent, 'utf-8');
    }

    logger.info('CSV export completed', {
      datasetId,
      rowCount: rows.length,
      sizeBytes: outputBuffer.length,
      delimiter,
      encoding,
    });

    return outputBuffer;
  }

  async exportExcel(
    datasetId: string,
    options: { sheetName?: string }
  ): Promise<Buffer> {
    logger.info('Exporting dataset as Excel', { datasetId, options });

    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: datasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const rows = dataRows.map(r => r.data as Record<string, any>);

    if (rows.length === 0) {
      throw new Error(`Dataset ${datasetId} has no rows to export`);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RASID Data Service';
    workbook.created = new Date();

    const sheetName = options.sheetName || dataset.name.substring(0, 31) || 'Sheet1';
    const worksheet = workbook.addWorksheet(sheetName);

    const columnNames = dataset.columns.map(c => c.name);

    worksheet.columns = columnNames.map(colName => {
      const maxContentWidth = rows.slice(0, 100).reduce((max, row) => {
        const val = String(row[colName] ?? '');
        return Math.max(max, val.length);
      }, colName.length);
      const width = Math.min(Math.max(maxContentWidth + 2, 10), 50);
      return { header: colName, key: colName, width };
    });

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E75B6' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height = 25;
    headerRow.border = {
      bottom: { style: 'medium', color: { argb: 'FF1F4E79' } },
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const excelRow = worksheet.addRow(columnNames.map(col => row[col] ?? null));

      if (i % 2 === 0) {
        excelRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F7FB' },
        };
      }

      excelRow.border = {
        bottom: { style: 'thin', color: { argb: 'FFD9E2EC' } },
      };

      excelRow.eachCell((cell, colNumber) => {
        const colDef = dataset.columns[colNumber - 1];
        if (colDef && (colDef.dataType === 'integer' || colDef.dataType === 'float')) {
          cell.alignment = { horizontal: 'right' };
          if (colDef.dataType === 'float') {
            cell.numFmt = '#,##0.00';
          } else {
            cell.numFmt = '#,##0';
          }
        }
      });
    }

    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columnNames.length },
    };

    worksheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 0, activeCell: 'A2' }];

    const buffer = await workbook.xlsx.writeBuffer();

    logger.info('Excel export completed', {
      datasetId,
      rowCount: rows.length,
      columnCount: columnNames.length,
      sizeBytes: buffer.byteLength,
      sheetName,
    });

    return Buffer.from(buffer);
  }

  async exportJSON(
    datasetId: string,
    options: { format?: 'json' | 'jsonl' }
  ): Promise<Buffer> {
    logger.info('Exporting dataset as JSON', { datasetId, options });

    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: datasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const rows = dataRows.map(r => r.data as Record<string, any>);

    if (rows.length === 0) {
      throw new Error(`Dataset ${datasetId} has no rows to export`);
    }

    const format = options.format || 'json';
    let content: string;

    if (format === 'jsonl') {
      const lines: string[] = [];
      for (const row of rows) {
        lines.push(JSON.stringify(row));
      }
      content = lines.join('\n') + '\n';
    } else {
      const exportData = {
        metadata: {
          datasetId: dataset.id,
          name: dataset.name,
          exportedAt: new Date().toISOString(),
          rowCount: rows.length,
          columnCount: dataset.columns.length,
          columns: dataset.columns.map(c => ({
            name: c.name,
            dataType: c.dataType,
            position: c.position,
          })),
        },
        data: rows,
      };
      content = JSON.stringify(exportData, null, 2);
    }

    const outputBuffer = Buffer.from(content, 'utf-8');

    logger.info('JSON export completed', {
      datasetId,
      format,
      rowCount: rows.length,
      sizeBytes: outputBuffer.length,
    });

    return outputBuffer;
  }

  async exportPDF(
    datasetId: string,
    options: { title?: string; orientation?: string }
  ): Promise<Buffer> {
    logger.info('Exporting dataset as PDF', { datasetId, options });

    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: datasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const rows = dataRows.map(r => r.data as Record<string, any>);

    if (rows.length === 0) {
      throw new Error(`Dataset ${datasetId} has no rows to export`);
    }

    const isLandscape = (options.orientation || 'landscape').toLowerCase() === 'landscape';
    const title = options.title || dataset.name || 'Data Export';
    const columnNames = dataset.columns.map(c => c.name);

    const doc = new PDFDocument({
      layout: isLandscape ? 'landscape' : 'portrait',
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const pdfReady = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));
    });

    const pageWidth = isLandscape ? 841.89 - 80 : 595.28 - 80;
    const colCount = columnNames.length;
    const colWidth = Math.min(Math.max(pageWidth / colCount, 50), 200);
    const tableWidth = colWidth * colCount;
    const startX = 40;
    const headerHeight = 24;
    const rowHeight = 20;
    const fontSize = Math.min(9, Math.max(6, Math.floor(120 / colCount)));

    doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').fillColor('#666666')
      .text(`Exported: ${new Date().toISOString().split('T')[0]} | Rows: ${rows.length} | Columns: ${colCount}`, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    let currentY = doc.y;
    const pageBottom = isLandscape ? 595.28 - 50 : 841.89 - 50;

    const drawTableHeader = () => {
      doc.save();
      doc.rect(startX, currentY, tableWidth, headerHeight).fill('#2E75B6');
      doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#FFFFFF');
      for (let c = 0; c < colCount; c++) {
        const cellX = startX + c * colWidth;
        const text = columnNames[c].substring(0, Math.floor(colWidth / (fontSize * 0.5)));
        doc.text(text, cellX + 3, currentY + 6, { width: colWidth - 6, height: headerHeight - 4, ellipsis: true });
      }
      doc.restore();
      doc.fillColor('#000000');
      currentY += headerHeight;
    };

    drawTableHeader();

    for (let r = 0; r < rows.length; r++) {
      if (currentY + rowHeight > pageBottom) {
        doc.addPage();
        currentY = 50;
        drawTableHeader();
      }

      if (r % 2 === 0) {
        doc.save();
        doc.rect(startX, currentY, tableWidth, rowHeight).fill('#F2F7FB');
        doc.restore();
      }

      doc.save();
      doc.rect(startX, currentY, tableWidth, rowHeight).stroke('#D9E2EC');
      doc.restore();

      doc.font('Helvetica').fontSize(fontSize).fillColor('#333333');
      for (let c = 0; c < colCount; c++) {
        const cellX = startX + c * colWidth;
        const cellValue = rows[r][columnNames[c]];
        const displayValue = cellValue === null || cellValue === undefined
          ? ''
          : String(cellValue).substring(0, Math.floor(colWidth / (fontSize * 0.45)));
        doc.text(displayValue, cellX + 3, currentY + 5, { width: colWidth - 6, height: rowHeight - 4, ellipsis: true });
      }
      doc.fillColor('#000000');
      currentY += rowHeight;
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor('#999999')
        .text(
          `Page ${i + 1} of ${pageCount}`,
          40,
          isLandscape ? 595.28 - 35 : 841.89 - 35,
          { align: 'center', width: pageWidth }
        );
    }

    doc.end();

    const pdfBuffer = await pdfReady;

    logger.info('PDF export completed', {
      datasetId,
      rowCount: rows.length,
      columnCount: colCount,
      pageCount,
      sizeBytes: pdfBuffer.length,
      orientation: isLandscape ? 'landscape' : 'portrait',
    });

    return pdfBuffer;
  }

  async exportSQL(
    datasetId: string,
    options: { tableName?: string }
  ): Promise<Buffer> {
    logger.info('Exporting dataset as SQL', { datasetId, options });

    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id: datasetId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
    });
    const rows = dataRows.map(r => r.data as Record<string, any>);

    if (rows.length === 0) {
      throw new Error(`Dataset ${datasetId} has no rows to export`);
    }

    const tableName = options.tableName || dataset.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const columnNames = dataset.columns.map(c => c.name);

    const mapDataType = (dt: string | null): string => {
      switch (dt) {
        case 'integer': return 'INTEGER';
        case 'float': return 'DECIMAL(18, 4)';
        case 'boolean': return 'BOOLEAN';
        case 'date': return 'DATE';
        case 'text': return 'TEXT';
        default: return 'VARCHAR(500)';
      }
    };

    const lines: string[] = [];
    lines.push(`-- SQL Export generated by RASID Data Service`);
    lines.push(`-- Dataset: ${dataset.name}`);
    lines.push(`-- Exported at: ${new Date().toISOString()}`);
    lines.push(`-- Rows: ${rows.length}`);
    lines.push('');

    lines.push(`DROP TABLE IF EXISTS "${tableName}";`);
    lines.push(`CREATE TABLE "${tableName}" (`);
    const colDefs = dataset.columns.map((col, idx) => {
      const sqlType = mapDataType(col.dataType);
      const nullable = col.nullable ? '' : ' NOT NULL';
      const comma = idx < dataset.columns.length - 1 ? ',' : '';
      return `  "${col.name}" ${sqlType}${nullable}${comma}`;
    });
    lines.push(...colDefs);
    lines.push(');');
    lines.push('');

    const escapeSQL = (val: unknown): string => {
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') return String(val);
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      const strVal = String(val).replace(/'/g, "''");
      return `'${strVal}'`;
    };

    const BATCH_SIZE = 100;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      lines.push(`INSERT INTO "${tableName}" (${columnNames.map(c => `"${c}"`).join(', ')}) VALUES`);

      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const values = columnNames.map(col => escapeSQL(row[col]));
        const suffix = j < batch.length - 1 ? ',' : ';';
        lines.push(`  (${values.join(', ')})${suffix}`);
      }
      lines.push('');
    }

    const sqlContent = lines.join('\n');
    const outputBuffer = Buffer.from(sqlContent, 'utf-8');

    logger.info('SQL export completed', {
      datasetId,
      tableName,
      rowCount: rows.length,
      statementCount: Math.ceil(rows.length / BATCH_SIZE),
      sizeBytes: outputBuffer.length,
    });

    return outputBuffer;
  }

  async bulkExport(
    datasetIds: string[],
    format: string
  ): Promise<Buffer> {
    if (datasetIds.length === 0) {
      throw new Error('At least one dataset ID is required for bulk export');
    }

    logger.info('Starting bulk export', { datasetIds, format });

    const passThrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(passThrough);

    const chunks: Buffer[] = [];
    passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));

    const archiveReady = new Promise<Buffer>((resolve, reject) => {
      passThrough.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', (err: Error) => reject(err));
      archive.on('warning', (warn: Error) => logger.warn('Archiver warning', { warning: warn.message }));
    });

    const exportedFiles: Array<{ datasetId: string; filename: string; size: number }> = [];

    for (const dsId of datasetIds) {
      const dataset = await this.prisma.dataset.findUniqueOrThrow({ where: { id: dsId } });
      const safeName = dataset.name.replace(/[^a-zA-Z0-9_.-]/g, '_').substring(0, 100);

      let fileBuffer: Buffer;
      let extension: string;

      switch (format.toLowerCase()) {
        case 'csv':
          fileBuffer = await this.exportCSV(dsId, { delimiter: ',' });
          extension = 'csv';
          break;
        case 'xlsx':
        case 'excel':
          fileBuffer = await this.exportExcel(dsId, { sheetName: safeName.substring(0, 31) });
          extension = 'xlsx';
          break;
        case 'json':
          fileBuffer = await this.exportJSON(dsId, { format: 'json' });
          extension = 'json';
          break;
        case 'jsonl':
          fileBuffer = await this.exportJSON(dsId, { format: 'jsonl' });
          extension = 'jsonl';
          break;
        case 'sql':
          fileBuffer = await this.exportSQL(dsId, { tableName: safeName });
          extension = 'sql';
          break;
        case 'pdf':
          fileBuffer = await this.exportPDF(dsId, { title: dataset.name });
          extension = 'pdf';
          break;
        default:
          fileBuffer = await this.exportCSV(dsId, { delimiter: ',' });
          extension = 'csv';
          break;
      }

      const filename = `${safeName}.${extension}`;
      archive.append(fileBuffer, { name: filename });
      exportedFiles.push({ datasetId: dsId, filename, size: fileBuffer.length });

      logger.info('Added file to archive', { datasetId: dsId, filename, size: fileBuffer.length });
    }

    const manifest = {
      exportedAt: new Date().toISOString(),
      format,
      datasetCount: datasetIds.length,
      files: exportedFiles,
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    await archive.finalize();
    const zipBuffer = await archiveReady;

    logger.info('Bulk export completed', {
      datasetCount: datasetIds.length,
      format,
      fileCount: exportedFiles.length,
      totalSizeBytes: zipBuffer.length,
    });

    return zipBuffer;
  }
}
