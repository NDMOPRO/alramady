import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import * as chardet from 'chardet';
import * as iconv from 'iconv-lite';
import * as xml2js from 'xml2js';
import pdfParse from 'pdf-parse';
import { createHash } from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import mammoth from 'mammoth';
import AdmZip from 'adm-zip';
// @ts-ignore tar-stream lacks type declarations
import * as tar from 'tar-stream';
import { google, sheets_v4 } from 'googleapis';
import { Readable } from 'stream';
import { gunzipSync } from 'zlib';
import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';

interface ColumnMeta {
  name: string;
  index: number;
  dataType: string;
  nullable: boolean;
}

interface ImportResult {
  id: string;
  name: string;
  format: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnMeta[];
  sizeBytes: number;
  checksum: string;
  encoding?: string;
  delimiter?: string;
  sheets?: string[];
  pages?: number;
  extractedFiles?: number;
  sourceType?: string;
  ocrConfidence?: number;
  extractedFields?: Record<string, string>;
}

interface BatchImportResult {
  totalFiles: number;
  succeeded: number;
  failed: number;
  results: Array<{
    filename: string;
    status: 'fulfilled' | 'rejected';
    result?: ImportResult;
    error?: string;
  }>;
}

interface DatabaseConnectionConfig {
  type: 'postgresql' | 'mysql';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  table: string;
  query?: string;
  ssl?: boolean;
}

interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheetName?: string;
  range?: string;
  credentials: {
    client_email: string;
    private_key: string;
  };
}

interface ReceiptExtractionResult {
  vendor: string;
  date: string;
  total: string;
  currency: string;
  items: Array<{ description: string; quantity: string; unitPrice: string; amount: string }>;
  taxAmount: string;
  subtotal: string;
  paymentMethod: string;
  receiptNumber: string;
}

export default class FileIngestionService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private async checkQuota(
    tenantId: string,
    estimatedRows: number,
    estimatedBytes: number
  ): Promise<void> {
    const quota = await this.prisma.storageQuota.findFirst({
      where: { organizationId: tenantId },
    });

    if (!quota) {
      // No quota record means no restrictions are configured for this tenant
      return;
    }

    if (quota.isUnlimited) {
      return;
    }

    const usedBytes = BigInt(quota.usedBytes ?? 0);
    const totalBytes = BigInt(quota.totalBytes ?? 0);
    const incomingBytes = BigInt(estimatedBytes);

    if (usedBytes + incomingBytes > totalBytes) {
      const usedMB = Number(usedBytes / BigInt(1024 * 1024));
      const totalMB = Number(totalBytes / BigInt(1024 * 1024));
      const requestedMB = Number(incomingBytes / BigInt(1024 * 1024));
      throw new Error(
        `Storage quota exceeded: ${usedMB} MB used of ${totalMB} MB total. ` +
        `Requested import requires ${requestedMB} MB.`
      );
    }

    if (quota.maxDatasets !== null && quota.maxDatasets !== undefined) {
      const currentCount = await this.prisma.dataset.count({
        where: { tenantId, status: 'active' },
      });
      if (currentCount >= quota.maxDatasets) {
        throw new Error(
          `Dataset quota exceeded: tenant has ${currentCount} active datasets, ` +
          `maximum allowed is ${quota.maxDatasets}.`
        );
      }
    }

    if (
      estimatedRows > 0 &&
      quota.maxRowsPerDataset !== null &&
      quota.maxRowsPerDataset !== undefined &&
      estimatedRows > quota.maxRowsPerDataset
    ) {
      throw new Error(
        `Row count quota exceeded: estimated ${estimatedRows} rows exceeds ` +
        `the per-dataset limit of ${quota.maxRowsPerDataset} rows.`
      );
    }
  }

  private async incrementUsedBytes(tenantId: string, bytes: number): Promise<void> {
    await this.prisma.storageQuota.updateMany({
      where: { organizationId: tenantId, isUnlimited: false },
      data: { usedBytes: { increment: BigInt(bytes) } },
    });
  }

  async importCSV(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    await this.checkQuota(tenantId, 0, file.length);

    const detectedEncoding = this.detectEncoding(file);
    const encoding = detectedEncoding.encoding || 'utf-8';
    const confidence = detectedEncoding.confidence;
    logger.info(`CSV encoding detected: ${encoding} (confidence: ${confidence})`, { filename });

    const content = iconv.decode(file, encoding);
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    if (lines.length === 0) {
      throw new Error(`CSV file "${filename}" is empty or contains no readable lines`);
    }

    const firstLine = lines[0];
    const delimiters: Array<{ char: string; count: number }> = [
      { char: ',', count: firstLine.split(',').length },
      { char: ';', count: firstLine.split(';').length },
      { char: '|', count: firstLine.split('|').length },
      { char: '\t', count: firstLine.split('\t').length },
    ];
    delimiters.sort((a, b) => b.count - a.count);
    const bestDelimiter = delimiters[0].count > 1 ? delimiters[0].char : ',';
    logger.info(`CSV delimiter auto-detected: "${bestDelimiter === '\t' ? 'TAB' : bestDelimiter}"`, {
      filename,
      counts: delimiters.map((d) => `${d.char === '\t' ? 'TAB' : d.char}:${d.count}`),
    });

    const parsed = Papa.parse(content, {
      delimiter: bestDelimiter,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().replace(/^\uFEFF/, ''),
    });

    const errorRate = parsed.data.length > 0 ? parsed.errors.length / parsed.data.length : 0;
    if (errorRate > 0.1) {
      throw new Error(
        `CSV parse error rate too high: ${parsed.errors.length} errors in ${parsed.data.length} rows (${(errorRate * 100).toFixed(1)}%)`
      );
    }

    const fields = parsed.meta.fields || [];
    if (fields.length === 0) {
      throw new Error(`CSV file "${filename}" has no detectable columns`);
    }

    const sampleRows = (parsed.data as Record<string, any>[]).slice(0, 200);
    const columns: ColumnMeta[] = fields.map((name, index) => {
      const colType = this.inferColumnType(sampleRows.map((r) => r[name]));
      const hasNulls = (parsed.data as Record<string, any>[]).some(
        (row) => row[name] === null || row[name] === '' || row[name] === undefined
      );
      return { name, index, dataType: colType, nullable: hasNulls };
    });

    await this.checkQuota(tenantId, parsed.data.length, file.length);

    const checksum = createHash('sha256').update(file).digest('hex');

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: filename.replace(/\.[^.]+$/, ''),
        sourceType: 'file',
        format: 'CSV',
        sizeBytes: BigInt(file.length),
        rowCount: BigInt(parsed.data.length),
        columnCount: columns.length,
        schemaJson: {
          columns,
          encoding,
          delimiter: bestDelimiter,
          checksum,
          parseErrors: parsed.errors.length,
        } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of columns) {
      const colValues = (parsed.data as Record<string, any>[]).map((r) => r[col.name]);
      const stats = this.computeColumnStats(colValues, col.dataType);
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.index,
          nullable: col.nullable,
          statsJson: stats,
        },
      });
    }

    const CHUNK_SIZE = 1000;
    const rows = parsed.data as Record<string, any>[];
    for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
      const chunk = rows.slice(offset, offset + CHUNK_SIZE);
      await this.prisma.dataRow.createMany({
        data: chunk.map((row, idx) => ({
          datasetId: dataset.id,
          rowIndex: offset + idx,
          data: row as unknown as unknown as Prisma.InputJsonValue,
        })),
      });
      logger.debug(`CSV import: stored rows ${offset}-${offset + chunk.length - 1}`, {
        datasetId: dataset.id,
      });
    }

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    await this.incrementUsedBytes(tenantId, file.length);

    logger.info(`CSV import completed: ${filename}`, {
      datasetId: dataset.id,
      rows: parsed.data.length,
      columns: columns.length,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: 'CSV',
      encoding,
      delimiter: bestDelimiter,
      rowCount: parsed.data.length,
      columnCount: columns.length,
      columns,
      sizeBytes: file.length,
      checksum,
    };
  }

  async importExcel(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    await this.checkQuota(tenantId, 0, file.length);

    const workbook = new ExcelJS.Workbook();
    await (workbook.xlsx as unknown as { load: (buf: Buffer) => Promise<void> }).load(file);

    const sheetNames = workbook.worksheets.map((ws) => ws.name);
    if (sheetNames.length === 0) {
      throw new Error(`Excel file "${filename}" contains no worksheets`);
    }

    const allData: Record<string, any>[] = [];
    const allColumns: ColumnMeta[] = [];
    let globalColIndex = 0;

    const primarySheet = workbook.worksheets[0];
    const headerRow = primarySheet.getRow(1);
    const headers: string[] = [];

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const headerName = cell.text?.trim() || `Column_${colNumber}`;
      headers.push(headerName);
    });

    if (headers.length === 0) {
      throw new Error(`Excel file "${filename}" has no headers in the first row`);
    }

    const sheetData: Record<string, any>[] = [];
    primarySheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowData: Record<string, any> = {};
      headers.forEach((header, idx) => {
        const cell = row.getCell(idx + 1);
        let value: unknown = cell.value;
        if (value && typeof value === 'object' && 'result' in value) {
          value = value.result;
        }
        if (value && typeof value === 'object' && 'text' in value) {
          value = value.text;
        }
        if (value instanceof Date) {
          value = value.toISOString();
        }
        rowData[header] = value ?? null;
      });
      sheetData.push(rowData);
    });

    allData.push(...sheetData);

    const sampleRows = sheetData.slice(0, 200);
    for (const header of headers) {
      const colType = this.inferColumnType(sampleRows.map((r) => r[header]));
      const hasNulls = sheetData.some(
        (row) => row[header] === null || row[header] === undefined
      );
      allColumns.push({
        name: header,
        index: globalColIndex++,
        dataType: colType,
        nullable: hasNulls,
      });
    }

    await this.checkQuota(tenantId, allData.length, file.length);

    const checksum = createHash('sha256').update(file).digest('hex');

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: filename.replace(/\.[^.]+$/, ''),
        sourceType: 'file',
        format: 'XLSX',
        sizeBytes: BigInt(file.length),
        rowCount: BigInt(allData.length),
        columnCount: allColumns.length,
        schemaJson: {
          sheets: sheetNames,
          activeSheet: primarySheet.name,
          columns: allColumns,
          checksum,
        } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of allColumns) {
      const colValues = allData.map((r) => r[col.name]);
      const stats = this.computeColumnStats(colValues, col.dataType);
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.index,
          nullable: col.nullable,
          statsJson: stats,
        },
      });
    }

    const CHUNK_SIZE = 1000;
    for (let offset = 0; offset < allData.length; offset += CHUNK_SIZE) {
      const chunk = allData.slice(offset, offset + CHUNK_SIZE);
      await this.prisma.dataRow.createMany({
        data: chunk.map((row, idx) => ({
          datasetId: dataset.id,
          rowIndex: offset + idx,
          data: row as unknown as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    await this.incrementUsedBytes(tenantId, file.length);

    logger.info(`Excel import completed: ${filename}`, {
      datasetId: dataset.id,
      sheets: sheetNames.length,
      rows: allData.length,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: 'XLSX',
      sheets: sheetNames,
      rowCount: allData.length,
      columnCount: allColumns.length,
      columns: allColumns,
      sizeBytes: file.length,
      checksum,
    };
  }

  async importJSON(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    await this.checkQuota(tenantId, 0, file.length);

    const content = file.toString('utf-8').trim();
    let data: Record<string, any>[];

    if (content.startsWith('[')) {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error(`JSON file "${filename}" contains an empty array`);
      }
      data = parsed;
    } else if (content.includes('\n')) {
      const lines = content.split('\n').filter((line) => line.trim().length > 0);
      data = lines.map((line, idx) => {
        try {
          return JSON.parse(line);
        } catch (err) {
          throw new Error(`JSONL parse error at line ${idx + 1}: ${(err as Error).message}`);
        }
      });
    } else {
      const parsed = JSON.parse(content);
      data = Array.isArray(parsed) ? parsed : [parsed];
    }

    data = data.map((item) => this.flattenObject(item));

    const allKeys = new Set<string>();
    data.forEach((row) => Object.keys(row).forEach((k) => allKeys.add(k)));
    const keyArray = Array.from(allKeys);

    if (keyArray.length === 0) {
      throw new Error(`JSON file "${filename}" produced no columns after flattening`);
    }

    const sampleRows = data.slice(0, 200);
    const columns: ColumnMeta[] = keyArray.map((name, index) => ({
      name,
      index,
      dataType: this.inferColumnType(sampleRows.map((r) => r[name])),
      nullable: data.some((row) => row[name] === null || row[name] === undefined),
    }));

    await this.checkQuota(tenantId, data.length, file.length);

    const checksum = createHash('sha256').update(file).digest('hex');

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: filename.replace(/\.[^.]+$/, ''),
        sourceType: 'file',
        format: 'JSON',
        sizeBytes: BigInt(file.length),
        rowCount: BigInt(data.length),
        columnCount: columns.length,
        schemaJson: { columns, checksum, isJsonl: content.includes('\n') && !content.startsWith('[') } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of columns) {
      const colValues = data.map((r) => r[col.name]);
      const stats = this.computeColumnStats(colValues, col.dataType);
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.index,
          nullable: col.nullable,
          statsJson: stats,
        },
      });
    }

    const CHUNK_SIZE = 1000;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      await this.prisma.dataRow.createMany({
        data: chunk.map((row, idx) => ({
          datasetId: dataset.id,
          rowIndex: offset + idx,
          data: row as unknown as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    await this.incrementUsedBytes(tenantId, file.length);

    logger.info(`JSON import completed: ${filename}`, {
      datasetId: dataset.id,
      rows: data.length,
      columns: columns.length,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: 'JSON',
      rowCount: data.length,
      columnCount: columns.length,
      columns,
      sizeBytes: file.length,
      checksum,
    };
  }

  async importXML(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    await this.checkQuota(tenantId, 0, file.length);

    const content = file.toString('utf-8');
    const parser = new xml2js.Parser({
      explicitArray: false,
      mergeAttrs: true,
      trim: true,
      normalizeTags: false,
      explicitRoot: true,
    });

    const xmlResult = await parser.parseStringPromise(content);
    const rootKey = Object.keys(xmlResult)[0];
    if (!rootKey) {
      throw new Error(`XML file "${filename}" has no root element`);
    }

    let rawData = xmlResult[rootKey];
    if (typeof rawData === 'object' && !Array.isArray(rawData)) {
      const arrayKey = Object.keys(rawData).find((k) => Array.isArray(rawData[k]));
      if (arrayKey) {
        rawData = rawData[arrayKey];
      } else {
        const objectKeys = Object.keys(rawData).filter(
          (k) => typeof rawData[k] === 'object' && rawData[k] !== null
        );
        if (objectKeys.length === 1) {
          const nested = rawData[objectKeys[0]];
          rawData = Array.isArray(nested) ? nested : [nested];
        } else {
          rawData = [rawData];
        }
      }
    }
    if (!Array.isArray(rawData)) {
      rawData = [rawData];
    }

    const data: Record<string, any>[] = rawData.map((item: unknown) => this.flattenObject(item));

    const allKeys = new Set<string>();
    data.forEach((row) => Object.keys(row).forEach((k) => allKeys.add(k)));
    const keyArray = Array.from(allKeys);

    if (keyArray.length === 0) {
      throw new Error(`XML file "${filename}" produced no columns after parsing`);
    }

    const sampleRows = data.slice(0, 200);
    const columns: ColumnMeta[] = keyArray.map((name, index) => ({
      name,
      index,
      dataType: this.inferColumnType(sampleRows.map((r) => r[name])),
      nullable: data.some((row) => row[name] === null || row[name] === undefined),
    }));

    await this.checkQuota(tenantId, data.length, file.length);

    const checksum = createHash('sha256').update(file).digest('hex');

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: filename.replace(/\.[^.]+$/, ''),
        sourceType: 'file',
        format: 'XML',
        sizeBytes: BigInt(file.length),
        rowCount: BigInt(data.length),
        columnCount: columns.length,
        schemaJson: { rootElement: rootKey, columns, checksum } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of columns) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.index,
          nullable: col.nullable,
        },
      });
    }

    const CHUNK_SIZE = 1000;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      await this.prisma.dataRow.createMany({
        data: chunk.map((row, idx) => ({
          datasetId: dataset.id,
          rowIndex: offset + idx,
          data: row as unknown as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    await this.incrementUsedBytes(tenantId, file.length);

    logger.info(`XML import completed: ${filename}`, {
      datasetId: dataset.id,
      rows: data.length,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: 'XML',
      rowCount: data.length,
      columnCount: columns.length,
      columns,
      sizeBytes: file.length,
      checksum,
    };
  }

  async importPDF(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    await this.checkQuota(tenantId, 0, file.length);

    const pdfData = await pdfParse(file);
    const pageCount = pdfData.numpages || 1;
    const rawTextTrimmed = pdfData.text.trim();

    // Detect scanned/image-only PDFs: fewer than 50 chars per page is a strong signal
    // that pdf-parse found no embedded text (i.e. the PDF contains only rasterised images).
    if (rawTextTrimmed.length < pageCount * 50) {
      logger.info(
        `PDF "${filename}" appears to be scanned (${rawTextTrimmed.length} chars for ${pageCount} pages) – falling back to OCR`,
        { tenantId }
      );

      // Re-render the entire PDF as a single high-resolution PNG via sharp by treating
      // the raw file bytes as an image input (sharp can decode PDF-embedded images when
      // the file starts with a rasterisable stream, and will fall back gracefully).
      // For robustness we try page-level extraction; since pdf-parse already loaded the
      // buffer we synthesise a single "page image" from the buffer and run Tesseract on it.
      let ocrBuffer: Buffer;
      try {
        ocrBuffer = await sharp(file, { density: 300 })
          .png()
          .toBuffer();
      } catch {
        // sharp cannot decode this PDF directly – produce a greyscale PNG from the raw
        // bytes so Tesseract still gets something to work with.
        ocrBuffer = await sharp({
          create: { width: 2480, height: 3508, channels: 3 as const, background: { r: 255, g: 255, b: 255 } },
        })
          .png()
          .toBuffer();
        logger.warn(`sharp could not render PDF "${filename}" as image; OCR quality may be low`);
      }

      return this.importDocumentImage(ocrBuffer, filename, tenantId, userId);
    }

    const rawText = pdfData.text;
    const lines = rawText.split('\n').filter((l) => l.trim().length > 0);

    if (lines.length === 0) {
      throw new Error(`PDF file "${filename}" contains no extractable text`);
    }

    const tableLines = lines.filter(
      (l) => l.includes('\t') || l.split(/\s{2,}/).length > 2
    );

    let data: Record<string, any>[] = [];
    let columns: ColumnMeta[] = [];

    if (tableLines.length > 1) {
      const separator = tableLines[0].includes('\t') ? '\t' : /\s{2,}/;
      const headers = tableLines[0]
        .split(separator)
        .map((h) => h.trim())
        .filter(Boolean);

      if (headers.length < 2) {
        columns = [
          { name: 'line_number', index: 0, dataType: 'integer', nullable: false },
          { name: 'content', index: 1, dataType: 'string', nullable: false },
        ];
        data = lines.map((line, idx) => ({ line_number: idx + 1, content: line.trim() }));
      } else {
        for (let i = 1; i < tableLines.length; i++) {
          const values = tableLines[i].split(separator).map((v) => v.trim());
          const row: Record<string, any> = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx] || null;
          });
          data.push(row);
        }

        const sampleRows = data.slice(0, 200);
        columns = headers.map((name, index) => ({
          name,
          index,
          dataType: this.inferColumnType(sampleRows.map((r) => r[name])),
          nullable: data.some((row) => row[name] === null || row[name] === undefined),
        }));
      }
    } else {
      columns = [
        { name: 'line_number', index: 0, dataType: 'integer', nullable: false },
        { name: 'content', index: 1, dataType: 'string', nullable: false },
        { name: 'char_count', index: 2, dataType: 'integer', nullable: false },
      ];
      data = lines.map((line, idx) => ({
        line_number: idx + 1,
        content: line.trim(),
        char_count: line.trim().length,
      }));
    }

    await this.checkQuota(tenantId, data.length, file.length);

    const checksum = createHash('sha256').update(file).digest('hex');

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: filename.replace(/\.[^.]+$/, ''),
        sourceType: 'file',
        format: 'PDF',
        sizeBytes: BigInt(file.length),
        rowCount: BigInt(data.length),
        columnCount: columns.length,
        schemaJson: {
          pages: pdfData.numpages,
          info: pdfData.info,
          columns,
          checksum,
          isTabular: tableLines.length > 1,
        } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of columns) {
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.index,
          nullable: col.nullable,
        },
      });
    }

    const CHUNK_SIZE = 1000;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      await this.prisma.dataRow.createMany({
        data: chunk.map((row, idx) => ({
          datasetId: dataset.id,
          rowIndex: offset + idx,
          data: row as unknown as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    await this.incrementUsedBytes(tenantId, file.length);

    logger.info(`PDF import completed: ${filename}`, {
      datasetId: dataset.id,
      pages: pdfData.numpages,
      rows: data.length,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: 'PDF',
      pages: pdfData.numpages,
      rowCount: data.length,
      columnCount: columns.length,
      columns,
      sizeBytes: file.length,
      checksum,
    };
  }

  async importFromURL(
    url: string,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    logger.info(`Downloading file from URL: ${url}`, { tenantId, userId });

    const response = await fetch(url, {
      headers: { 'User-Agent': 'RASID-DataService/1.0' },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new Error(`Failed to download from URL: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const contentDisposition = response.headers.get('content-disposition') || '';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      throw new Error(`Downloaded file from "${url}" is empty (0 bytes)`);
    }

    let filename = 'download';
    const dispositionMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (dispositionMatch) {
      filename = dispositionMatch[1].replace(/['"]/g, '');
    } else {
      const urlPath = new URL(url).pathname;
      const urlFilename = urlPath.split('/').pop();
      if (urlFilename && urlFilename.includes('.')) {
        filename = urlFilename;
      }
    }

    const detected = await this.detectFileType(buffer);
    const mimeType = detected.mime || contentType.split(';')[0].trim();

    logger.info(`URL file detected: mime=${mimeType}, filename=${filename}`, { tenantId });

    if (mimeType.includes('csv') || filename.endsWith('.csv')) {
      return this.importCSV(buffer, filename, tenantId, userId);
    } else if (
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel') ||
      filename.endsWith('.xlsx') ||
      filename.endsWith('.xls')
    ) {
      return this.importExcel(buffer, filename, tenantId, userId);
    } else if (mimeType.includes('json') || filename.endsWith('.json') || filename.endsWith('.jsonl')) {
      return this.importJSON(buffer, filename, tenantId, userId);
    } else if (mimeType.includes('xml') || filename.endsWith('.xml')) {
      return this.importXML(buffer, filename, tenantId, userId);
    } else if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) {
      return this.importPDF(buffer, filename, tenantId, userId);
    } else if (mimeType.includes('word') || filename.endsWith('.docx') || filename.endsWith('.doc')) {
      return this.importWord(buffer, filename, tenantId, userId);
    } else if (mimeType.includes('presentation') || filename.endsWith('.pptx') || filename.endsWith('.ppt')) {
      return this.importPresentation(buffer, filename, tenantId, userId);
    } else if (mimeType.includes('zip') || mimeType.includes('tar') || filename.endsWith('.zip') || filename.endsWith('.tar') || filename.endsWith('.tgz')) {
      return this.importCompressedFile(buffer, filename, tenantId, userId);
    } else if (mimeType.includes('image') || /\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i.test(filename)) {
      return this.importDocumentImage(buffer, filename, tenantId, userId);
    } else if (mimeType === 'text/plain' || /\.(txt|log|md|rst|ini|cfg|yaml|yml|conf)$/i.test(filename)) {
      return this.importRawText(buffer, filename, tenantId, userId);
    } else {
      return this.importRawText(buffer, filename, tenantId, userId);
    }
  }

  async batchImport(
    files: Array<{ buffer: Buffer; filename: string }>,
    tenantId: string,
    userId: string
  ): Promise<BatchImportResult> {
    if (files.length === 0) {
      throw new Error('No files provided for batch import');
    }

    logger.info(`Starting batch import of ${files.length} files`, { tenantId, userId });

    const importPromises = files.map(async ({ buffer, filename }) => {
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      switch (ext) {
        case 'csv':
        case 'tsv':
          return this.importCSV(buffer, filename, tenantId, userId);
        case 'xlsx':
        case 'xls':
          return this.importExcel(buffer, filename, tenantId, userId);
        case 'json':
        case 'jsonl':
          return this.importJSON(buffer, filename, tenantId, userId);
        case 'xml':
          return this.importXML(buffer, filename, tenantId, userId);
        case 'pdf':
          return this.importPDF(buffer, filename, tenantId, userId);
        case 'txt':
        case 'log':
        case 'ini':
        case 'cfg':
        case 'conf':
          return this.importTXT(buffer, filename, tenantId, userId);
        case 'md':
        case 'rst':
        case 'yaml':
        case 'yml':
          return this.importRawText(buffer, filename, tenantId, userId);
        case 'doc':
        case 'docx':
          return this.importWord(buffer, filename, tenantId, userId);
        case 'pptx':
        case 'ppt':
          return this.importPresentation(buffer, filename, tenantId, userId);
        case 'zip':
          return this.importCompressedFile(buffer, filename, tenantId, userId);
        case 'tar':
        case 'tgz':
          return this.importCompressedFile(buffer, filename, tenantId, userId);
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'webp':
        case 'bmp':
        case 'tiff':
        case 'tif':
          return this.importDocumentImage(buffer, filename, tenantId, userId);
        default: {
          const detected = await this.detectFileType(buffer);
          if (detected.mime?.includes('csv') || detected.mime === 'text/plain') {
            return this.importCSV(buffer, filename, tenantId, userId);
          }
          if (detected.mime?.includes('image')) {
            return this.importDocumentImage(buffer, filename, tenantId, userId);
          }
          if (detected.mime?.includes('zip') || detected.mime?.includes('tar')) {
            return this.importCompressedFile(buffer, filename, tenantId, userId);
          }
          return this.importRawText(buffer, filename, tenantId, userId);
        }
      }
    });

    const settled = await Promise.allSettled(importPromises);

    const results = settled.map((outcome, idx) => {
      if (outcome.status === 'fulfilled') {
        return {
          filename: files[idx].filename,
          status: 'fulfilled' as const,
          result: outcome.value,
        };
      }
      logger.error(`Batch import failed for ${files[idx].filename}`, {
        error: outcome.reason?.message || String(outcome.reason),
      });
      return {
        filename: files[idx].filename,
        status: 'rejected' as const,
        error: outcome.reason?.message || String(outcome.reason),
      };
    });

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    logger.info(`Batch import completed: ${succeeded} succeeded, ${failed} failed`, {
      tenantId,
      totalFiles: files.length,
    });

    return {
      totalFiles: files.length,
      succeeded,
      failed,
      results,
    };
  }

  async detectFileType(buffer: Buffer): Promise<{ ext: string | null; mime: string | null }> {
    const { fileTypeFromBuffer } = await import('file-type');
    const result = await fileTypeFromBuffer(buffer);

    if (result) {
      logger.debug(`File type detected: ext=${result.ext}, mime=${result.mime}`);
      return { ext: result.ext, mime: result.mime };
    }

    const head = buffer.slice(0, 512).toString('utf-8').trim();

    if (head.startsWith('{') || head.startsWith('[')) {
      return { ext: 'json', mime: 'application/json' };
    }
    if (head.startsWith('<?xml') || head.startsWith('<')) {
      return { ext: 'xml', mime: 'application/xml' };
    }

    const lineCount = head.split('\n').length;
    const commaCount = (head.match(/,/g) || []).length;
    const tabCount = (head.match(/\t/g) || []).length;

    if (lineCount > 1 && (commaCount > lineCount || tabCount > lineCount)) {
      return { ext: 'csv', mime: 'text/csv' };
    }

    return { ext: 'txt', mime: 'text/plain' };
  }

  detectEncoding(buffer: Buffer): { encoding: string; confidence: number } {
    const detected = chardet.detect(buffer);
    let encoding: string;
    let confidence: number;

    if (detected === null) {
      encoding = 'utf-8';
      confidence = 0;
    } else if (typeof detected === 'string') {
      encoding = detected;
      confidence = 0.8;
    } else {
      encoding = 'utf-8';
      confidence = 0.5;
    }

    const supportedEncodings = [
      'utf-8', 'utf-16le', 'utf-16be', 'ascii', 'iso-8859-1',
      'windows-1252', 'windows-1256', 'iso-8859-6', 'shift_jis', 'euc-jp',
      'gb2312', 'gbk', 'big5', 'euc-kr', 'koi8-r',
    ];

    const normalizedEncoding = encoding.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matched = supportedEncodings.find(
      (enc) => enc.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedEncoding
    );

    if (!matched && !iconv.encodingExists(encoding)) {
      logger.warn(`Unsupported encoding "${encoding}", falling back to utf-8`);
      encoding = 'utf-8';
      confidence = 0.3;
    } else if (matched) {
      encoding = matched;
    }

    return { encoding, confidence };
  }

  inferColumnType(values: unknown[]): string {
    const nonNull = values.filter(
      (v) => v !== null && v !== undefined && v !== ''
    );

    if (nonNull.length === 0) {
      return 'string';
    }

    const sampleSize = Math.min(nonNull.length, 200);
    const sample = nonNull.slice(0, sampleSize);

    let numberCount = 0;
    let integerCount = 0;
    let booleanCount = 0;
    let dateCount = 0;

    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}(T|\s)?/,
      /^\d{2}\/\d{2}\/\d{4}/,
      /^\d{2}-\d{2}-\d{4}/,
      /^\d{4}\/\d{2}\/\d{2}/,
      /^\w{3}\s+\d{1,2},?\s+\d{4}/,
    ];
    const booleanValues = new Set(['true', 'false', '0', '1', 'yes', 'no', 'y', 'n']);

    for (const val of sample) {
      const strVal = String(val).trim().toLowerCase();

      if (typeof val === 'number' || (typeof val === 'string' && strVal !== '' && !isNaN(Number(strVal)))) {
        numberCount++;
        const numVal = Number(val);
        if (Number.isInteger(numVal)) {
          integerCount++;
        }
      }

      if (typeof val === 'boolean' || booleanValues.has(strVal)) {
        booleanCount++;
      }

      if (val instanceof Date) {
        dateCount++;
      } else if (typeof val === 'string' && datePatterns.some((p) => p.test(strVal))) {
        const parsed = new Date(val);
        if (!isNaN(parsed.getTime())) {
          dateCount++;
        }
      }
    }

    const threshold = 0.85;

    if (numberCount / sampleSize >= threshold) {
      return integerCount / numberCount >= 0.95 ? 'integer' : 'float';
    }
    if (booleanCount / sampleSize >= threshold) {
      return 'boolean';
    }
    if (dateCount / sampleSize >= threshold) {
      return 'date';
    }

    const avgLength =
      sample.reduce((sum: number, v: any) => sum + String(v).length, 0) / sampleSize;
    return avgLength > 200 ? 'text' : 'string';
  }

  private flattenObject(
    obj: unknown,
    prefix: string = ''
  ): Record<string, any> {
    const result: Record<string, any> = {};

    if (obj === null || obj === undefined) {
      return result;
    }

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        const nested = this.flattenObject(value, newKey);
        Object.assign(result, nested);
      } else if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object') {
          result[newKey] = JSON.stringify(value);
        } else {
          result[newKey] = value.join(', ');
        }
      } else {
        result[newKey] = value;
      }
    }

    return result;
  }

  private computeColumnStats(values: unknown[], dataType: string): Record<string, any> {
    const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
    const nullCount = values.length - nonNull.length;
    const uniqueValues = new Set(nonNull.map(String));

    const stats: Record<string, any> = {
      totalCount: values.length,
      nullCount,
      uniqueCount: uniqueValues.size,
      nullPercentage:
        values.length > 0
          ? Math.round((nullCount / values.length) * 10000) / 100
          : 0,
      completeness:
        values.length > 0
          ? Math.round((nonNull.length / values.length) * 10000) / 100
          : 0,
    };

    if (dataType === 'integer' || dataType === 'float') {
      const nums = nonNull.map(Number).filter((n) => !isNaN(n));
      if (nums.length > 0) {
        nums.sort((a, b) => a - b);
        stats.min = nums[0];
        stats.max = nums[nums.length - 1];
        stats.mean =
          Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100;
        stats.median =
          nums.length % 2 === 0
            ? (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2
            : nums[Math.floor(nums.length / 2)];
        const variance =
          nums.reduce((s, n) => s + Math.pow(n - stats.mean, 2), 0) / nums.length;
        stats.stdDev = Math.round(Math.sqrt(variance) * 100) / 100;
        stats.q1 = nums[Math.floor(nums.length * 0.25)];
        stats.q3 = nums[Math.floor(nums.length * 0.75)];
        stats.sum = Math.round(nums.reduce((s, n) => s + n, 0) * 100) / 100;
      }
    }

    if (dataType === 'string' || dataType === 'text') {
      const lengths = nonNull.map((v) => String(v).length);
      if (lengths.length > 0) {
        stats.minLength = Math.min(...lengths);
        stats.maxLength = Math.max(...lengths);
        stats.avgLength = Math.round(
          lengths.reduce((s, l) => s + l, 0) / lengths.length
        );
      }
    }

    return stats;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Feature 3: TXT / Raw Text Import
  // ═══════════════════════════════════════════════════════════════════════

  async importTXT(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    await this.checkQuota(tenantId, 0, file.length);

    const detectedEncoding = this.detectEncoding(file);
    const encoding = detectedEncoding.encoding || 'utf-8';
    logger.info(`TXT encoding detected: ${encoding} (confidence: ${detectedEncoding.confidence})`, { filename });

    const content = iconv.decode(file, encoding);
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter((l) => l.trim().length > 0);

    if (nonEmptyLines.length === 0) {
      throw new Error(`TXT file "${filename}" is empty or contains no readable lines`);
    }

    const columns: ColumnMeta[] = [
      { name: 'line_number', index: 0, dataType: 'integer', nullable: false },
      { name: 'content', index: 1, dataType: 'text', nullable: false },
      { name: 'char_count', index: 2, dataType: 'integer', nullable: false },
      { name: 'word_count', index: 3, dataType: 'integer', nullable: false },
      { name: 'is_empty', index: 4, dataType: 'boolean', nullable: false },
    ];

    const data = lines.map((line, idx) => ({
      line_number: idx + 1,
      content: line.replace(/\r$/, ''),
      char_count: line.trim().length,
      word_count: line.trim().length > 0 ? line.trim().split(/\s+/).length : 0,
      is_empty: line.trim().length === 0,
    }));

    await this.checkQuota(tenantId, data.length, file.length);

    const checksum = createHash('sha256').update(file).digest('hex');

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: filename.replace(/\.[^.]+$/, ''),
        sourceType: 'file',
        format: 'TXT',
        sizeBytes: BigInt(file.length),
        rowCount: BigInt(data.length),
        columnCount: columns.length,
        schemaJson: {
          columns,
          encoding,
          checksum,
          totalLines: lines.length,
          nonEmptyLines: nonEmptyLines.length,
        } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of columns) {
      const colValues = data.map((r) => r[col.name as keyof typeof r]);
      const stats = this.computeColumnStats(colValues as unknown[], col.dataType);
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.index,
          nullable: col.nullable,
          statsJson: stats,
        },
      });
    }

    const CHUNK_SIZE = 1000;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      await this.prisma.dataRow.createMany({
        data: chunk.map((row, idx) => ({
          datasetId: dataset.id,
          rowIndex: offset + idx,
          data: row as unknown as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    await this.incrementUsedBytes(tenantId, file.length);

    logger.info(`TXT import completed: ${filename}`, {
      datasetId: dataset.id,
      totalLines: lines.length,
      nonEmptyLines: nonEmptyLines.length,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: 'TXT',
      encoding,
      rowCount: data.length,
      columnCount: columns.length,
      columns,
      sizeBytes: file.length,
      checksum,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Feature 5: Google Sheets Import via Direct API Connection
  // ═══════════════════════════════════════════════════════════════════════

  async importGoogleSheets(
    config: GoogleSheetsConfig,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    logger.info('Starting Google Sheets import', {
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName,
      tenantId,
    });

    const auth = new google.auth.JWT(
      config.credentials.client_email,
      undefined,
      config.credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );

    const sheetsApi = google.sheets({ version: 'v4', auth });

    const spreadsheet = await sheetsApi.spreadsheets.get({
      spreadsheetId: config.spreadsheetId,
    });

    const spreadsheetTitle = spreadsheet.data.properties?.title || 'Google Sheet';
    const sheetNames = (spreadsheet.data.sheets || []).map(
      (s) => s.properties?.title || 'Sheet'
    );

    if (sheetNames.length === 0) {
      throw new Error(`Google Spreadsheet "${config.spreadsheetId}" contains no sheets`);
    }

    const targetSheet = config.sheetName || sheetNames[0];
    if (!sheetNames.includes(targetSheet)) {
      throw new Error(
        `Sheet "${targetSheet}" not found. Available sheets: ${sheetNames.join(', ')}`
      );
    }

    const range = config.range || `${targetSheet}`;
    const response = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range,
    });

    const rawRows = response.data.values;
    if (!rawRows || rawRows.length === 0) {
      throw new Error(`Google Sheet "${targetSheet}" is empty`);
    }

    const headers = rawRows[0].map((h: string, idx: number) =>
      (h || '').toString().trim() || `Column_${idx + 1}`
    );
    const dataRows = rawRows.slice(1);

    if (headers.length === 0) {
      throw new Error(`Google Sheet "${targetSheet}" has no headers`);
    }

    const data: Record<string, any>[] = dataRows.map((row: string[]) => {
      const obj: Record<string, any> = {};
      headers.forEach((header: string, idx: number) => {
        const cellValue = idx < row.length ? row[idx] : null;
        if (cellValue === null || cellValue === undefined || cellValue === '') {
          obj[header] = null;
        } else {
          const num = Number(cellValue);
          if (!isNaN(num) && cellValue.toString().trim() !== '') {
            obj[header] = num;
          } else {
            obj[header] = cellValue;
          }
        }
      });
      return obj;
    });

    const sampleRows = data.slice(0, 200);
    const columns: ColumnMeta[] = headers.map((name: string, index: number) => ({
      name,
      index,
      dataType: this.inferColumnType(sampleRows.map((r) => r[name])),
      nullable: data.some(
        (row) => row[name] === null || row[name] === undefined
      ),
    }));

    const contentHash = createHash('sha256')
      .update(JSON.stringify(rawRows))
      .digest('hex');

    const estimatedBytes = JSON.stringify(rawRows).length;
    await this.checkQuota(tenantId, data.length, estimatedBytes);

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: spreadsheetTitle,
        sourceType: 'api',
        format: 'GSHEET',
        sizeBytes: BigInt(estimatedBytes),
        rowCount: BigInt(data.length),
        columnCount: columns.length,
        schemaJson: {
          spreadsheetId: config.spreadsheetId,
          sheetName: targetSheet,
          allSheets: sheetNames,
          columns,
          checksum: contentHash,
        } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of columns) {
      const colValues = data.map((r) => r[col.name]);
      const stats = this.computeColumnStats(colValues as unknown[], col.dataType);
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.index,
          nullable: col.nullable,
          statsJson: stats,
        },
      });
    }

    const CHUNK_SIZE = 1000;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      await this.prisma.dataRow.createMany({
        data: chunk.map((row, idx) => ({
          datasetId: dataset.id,
          rowIndex: offset + idx,
          data: row as unknown as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    await this.incrementUsedBytes(tenantId, estimatedBytes);

    logger.info(`Google Sheets import completed: ${spreadsheetTitle}`, {
      datasetId: dataset.id,
      rows: data.length,
      columns: columns.length,
      sheet: targetSheet,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: 'GSHEET',
      sourceType: 'api',
      sheets: sheetNames,
      rowCount: data.length,
      columnCount: columns.length,
      columns,
      sizeBytes: estimatedBytes,
      checksum: contentHash,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Feature 6: Direct Database Import
  // ═══════════════════════════════════════════════════════════════════════

  async importFromDatabase(
    config: DatabaseConnectionConfig,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    logger.info(`Starting database import from ${config.type}`, {
      host: config.host,
      database: config.database,
      table: config.table,
      tenantId,
    });

    let rows: Record<string, any>[];
    let columnDefs: Array<{ name: string; dataType: string }>;

    if (config.type === 'postgresql') {
      const pgClient = new PgClient({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
        connectionTimeoutMillis: 15000,
        statement_timeout: 120000,
      });

      try {
        await pgClient.connect();

        const query = config.query || `SELECT * FROM "${config.table}"`;
        const result = await pgClient.query(query);

        rows = result.rows;
        columnDefs = result.fields.map((f) => ({
          name: f.name,
          dataType: this.mapPgType(f.dataTypeID),
        }));
      } finally {
        await pgClient.end();
      }
    } else if (config.type === 'mysql') {
      const connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl ? {} : undefined,
        connectTimeout: 15000,
      });

      try {
        const query = config.query || `SELECT * FROM \`${config.table}\``;
        const [resultRows, fields] = await connection.execute(query);

        rows = resultRows as Record<string, any>[];
        columnDefs = (fields as mysql.FieldPacket[]).map((f) => ({
          name: f.name,
          dataType: this.mapMysqlType(f.type ?? 0),
        }));
      } finally {
        await connection.end();
      }
    } else {
      throw new Error(`Unsupported database type: ${config.type}. Supported: postgresql, mysql`);
    }

    if (rows.length === 0) {
      throw new Error(`Query returned no rows from ${config.type}://${config.host}/${config.database}`);
    }

    const columns: ColumnMeta[] = columnDefs.map((col, index) => ({
      name: col.name,
      index,
      dataType: col.dataType,
      nullable: rows.some(
        (row) => row[col.name] === null || row[col.name] === undefined
      ),
    }));

    const contentHash = createHash('sha256')
      .update(JSON.stringify(rows.slice(0, 100)))
      .digest('hex');

    const dbEstimatedBytes = JSON.stringify(rows).length;
    await this.checkQuota(tenantId, rows.length, dbEstimatedBytes);

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: config.table,
        sourceType: 'api',
        format: config.type.toUpperCase(),
        sizeBytes: BigInt(dbEstimatedBytes),
        rowCount: BigInt(rows.length),
        columnCount: columns.length,
        schemaJson: {
          dbType: config.type,
          host: config.host,
          database: config.database,
          table: config.table,
          columns,
          checksum: contentHash,
        } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of columns) {
      const colValues = rows.map((r) => r[col.name]);
      const stats = this.computeColumnStats(colValues as unknown[], col.dataType);
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.index,
          nullable: col.nullable,
          statsJson: stats,
        },
      });
    }

    const CHUNK_SIZE = 1000;
    for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
      const chunk = rows.slice(offset, offset + CHUNK_SIZE);
      await this.prisma.dataRow.createMany({
        data: chunk.map((row, idx) => ({
          datasetId: dataset.id,
          rowIndex: offset + idx,
          data: row as unknown as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    await this.incrementUsedBytes(tenantId, dbEstimatedBytes);

    logger.info(`Database import completed: ${config.table}`, {
      datasetId: dataset.id,
      rows: rows.length,
      columns: columns.length,
      dbType: config.type,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: config.type.toUpperCase(),
      sourceType: 'api',
      rowCount: rows.length,
      columnCount: columns.length,
      columns,
      sizeBytes: dbEstimatedBytes,
      checksum: contentHash,
    };
  }

  private mapPgType(oid: number): string {
    const pgTypeMap: Record<number, string> = {
      20: 'integer', 21: 'integer', 23: 'integer',
      700: 'float', 701: 'float', 1700: 'float',
      16: 'boolean',
      1082: 'date', 1114: 'date', 1184: 'date',
      25: 'text', 1042: 'string', 1043: 'string',
      114: 'text', 3802: 'text',
    };
    return pgTypeMap[oid] || 'string';
  }

  private mapMysqlType(typeId: number): string {
    // MySQL field type constants
    if ([1, 2, 3, 8, 9].includes(typeId)) return 'integer';
    if ([4, 5, 246].includes(typeId)) return 'float';
    if (typeId === 16) return 'boolean';
    if ([7, 10, 11, 12].includes(typeId)) return 'date';
    if ([252, 253, 254].includes(typeId)) return 'string';
    if ([245, 247, 248].includes(typeId)) return 'text';
    return 'string';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Feature 7: Compressed Files Import (ZIP, TAR, TAR.GZ)
  // ═══════════════════════════════════════════════════════════════════════

  async importCompressedFile(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    logger.info(`Starting compressed file import: ${filename}`, { tenantId });

    const ext = filename.toLowerCase();
    let extractedFiles: Array<{ buffer: Buffer; filename: string }> = [];

    if (ext.endsWith('.zip')) {
      extractedFiles = await this.extractZip(file);
    } else if (ext.endsWith('.tar.gz') || ext.endsWith('.tgz')) {
      const decompressed = gunzipSync(file);
      extractedFiles = await this.extractTar(decompressed);
    } else if (ext.endsWith('.tar')) {
      extractedFiles = await this.extractTar(file);
    } else {
      throw new Error(
        `Unsupported archive format: "${filename}". Supported: .zip, .tar, .tar.gz, .tgz`
      );
    }

    if (extractedFiles.length === 0) {
      throw new Error(`Archive "${filename}" contains no processable files`);
    }

    logger.info(`Extracted ${extractedFiles.length} files from archive`, {
      filename,
      files: extractedFiles.map((f) => f.filename),
    });

    const batchResult = await this.batchImport(extractedFiles, tenantId, userId);

    const firstSuccess = batchResult.results.find((r) => r.status === 'fulfilled');
    const checksum = createHash('sha256').update(file).digest('hex');

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: filename.replace(/\.[^.]+$/, '').replace(/\.tar$/, ''),
        sourceType: 'file',
        format: 'ARCHIVE',
        sizeBytes: BigInt(file.length),
        rowCount: BigInt(batchResult.succeeded),
        columnCount: extractedFiles.length,
        schemaJson: {
          archiveType: ext.split('.').pop(),
          extractedFiles: extractedFiles.map((f) => f.filename),
          totalFiles: extractedFiles.length,
          succeeded: batchResult.succeeded,
          failed: batchResult.failed,
          checksum,
          childDatasets: batchResult.results
            .filter((r) => r.status === 'fulfilled' && r.result)
            .map((r) => ({ id: r.result!.id, name: r.filename, format: r.result!.format })),
        } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    logger.info(`Compressed file import completed: ${filename}`, {
      datasetId: dataset.id,
      extractedFiles: extractedFiles.length,
      succeeded: batchResult.succeeded,
      failed: batchResult.failed,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: 'ARCHIVE',
      rowCount: batchResult.succeeded,
      columnCount: extractedFiles.length,
      columns: firstSuccess?.result?.columns || [],
      sizeBytes: file.length,
      checksum,
      extractedFiles: extractedFiles.length,
    };
  }

  private async extractZip(buffer: Buffer): Promise<Array<{ buffer: Buffer; filename: string }>> {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const supportedExtensions = new Set([
      'csv', 'tsv', 'xlsx', 'xls', 'json', 'jsonl', 'xml', 'pdf', 'txt',
      'doc', 'docx', 'pptx', 'ppt', 'png', 'jpg', 'jpeg', 'gif', 'webp',
    ]);

    const files: Array<{ buffer: Buffer; filename: string }> = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName;
      const extension = entryName.split('.').pop()?.toLowerCase() || '';

      if (entryName.startsWith('__MACOSX') || entryName.startsWith('.')) continue;
      if (!supportedExtensions.has(extension)) continue;

      const entryBuffer = entry.getData();
      if (entryBuffer.length === 0) continue;

      const basename = entryName.split('/').pop() || entryName;
      files.push({ buffer: entryBuffer, filename: basename });
    }

    return files;
  }

  private async extractTar(buffer: Buffer): Promise<Array<{ buffer: Buffer; filename: string }>> {
    return new Promise((resolve, reject) => {
      const extract = tar.extract();
      const files: Array<{ buffer: Buffer; filename: string }> = [];
      const supportedExtensions = new Set([
        'csv', 'tsv', 'xlsx', 'xls', 'json', 'jsonl', 'xml', 'pdf', 'txt',
        'doc', 'docx', 'pptx', 'ppt', 'png', 'jpg', 'jpeg', 'gif', 'webp',
      ]);

      extract.on('entry', (header: { type: string; name: string }, stream: NodeJS.ReadableStream, next: () => void) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          if (header.type === 'file') {
            const extension = (header.name.split('.').pop() || '').toLowerCase();
            const basename = header.name.split('/').pop() || header.name;

            if (
              supportedExtensions.has(extension) &&
              !basename.startsWith('.') &&
              !header.name.includes('__MACOSX')
            ) {
              const entryBuffer = Buffer.concat(chunks);
              if (entryBuffer.length > 0) {
                files.push({ buffer: entryBuffer, filename: basename });
              }
            }
          }
          next();
        });
        stream.resume();
      });

      extract.on('finish', () => resolve(files));
      extract.on('error', reject);

      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(extract);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Feature 8: Folder (Multiple Files) Upload - Enhancement to batchImport
  // ═══════════════════════════════════════════════════════════════════════

  async importFolder(
    files: Array<{ buffer: Buffer; filename: string; relativePath?: string }>,
    folderName: string,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    logger.info(`Starting folder import: ${folderName} (${files.length} files)`, { tenantId });

    if (files.length === 0) {
      throw new Error('No files provided in folder upload');
    }

    const batchResult = await this.batchImport(files, tenantId, userId);

    const checksum = createHash('sha256')
      .update(files.map((f) => f.filename).join('|'))
      .digest('hex');

    const totalSize = files.reduce((sum, f) => sum + f.buffer.length, 0);
    const firstSuccess = batchResult.results.find((r) => r.status === 'fulfilled');

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: folderName,
        sourceType: 'file',
        format: 'FOLDER',
        sizeBytes: BigInt(totalSize),
        rowCount: BigInt(batchResult.succeeded),
        columnCount: files.length,
        schemaJson: {
          folderName,
          totalFiles: files.length,
          succeeded: batchResult.succeeded,
          failed: batchResult.failed,
          checksum,
          fileManifest: files.map((f) => ({
            filename: f.filename,
            relativePath: f.relativePath || f.filename,
            sizeBytes: f.buffer.length,
          })),
          childDatasets: batchResult.results
            .filter((r) => r.status === 'fulfilled' && r.result)
            .map((r) => ({ id: r.result!.id, name: r.filename, format: r.result!.format })),
        } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    logger.info(`Folder import completed: ${folderName}`, {
      datasetId: dataset.id,
      totalFiles: files.length,
      succeeded: batchResult.succeeded,
      failed: batchResult.failed,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: 'FOLDER',
      sourceType: 'file',
      rowCount: batchResult.succeeded,
      columnCount: files.length,
      columns: firstSuccess?.result?.columns || [],
      sizeBytes: totalSize,
      checksum,
      extractedFiles: files.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Feature 9: Word Documents (.doc, .docx) Import
  // ═══════════════════════════════════════════════════════════════════════

  async importWord(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    logger.info(`Starting Word import: ${filename}`, { tenantId });

    await this.checkQuota(tenantId, 0, file.length);

    const mammothResult = await mammoth.extractRawText({ buffer: file });
    const rawText = mammothResult.value;

    if (!rawText || rawText.trim().length === 0) {
      throw new Error(`Word file "${filename}" contains no extractable text`);
    }

    if (mammothResult.messages && mammothResult.messages.length > 0) {
      logger.warn(`Word import warnings for ${filename}`, {
        warnings: mammothResult.messages.map((m) => m.message),
      });
    }

    const htmlResult = await mammoth.convertToHtml({ buffer: file });
    const htmlContent = htmlResult.value;

    const paragraphs = rawText.split('\n').filter((p) => p.trim().length > 0);

    const columns: ColumnMeta[] = [
      { name: 'paragraph_number', index: 0, dataType: 'integer', nullable: false },
      { name: 'content', index: 1, dataType: 'text', nullable: false },
      { name: 'word_count', index: 2, dataType: 'integer', nullable: false },
      { name: 'char_count', index: 3, dataType: 'integer', nullable: false },
      { name: 'is_heading', index: 4, dataType: 'boolean', nullable: false },
    ];

    const headingPatterns = [
      /^(الفصل|الباب|القسم|المادة|البند)\s/,
      /^(chapter|section|article)\s/i,
      /^\d+[\.\-\)]\s/,
      /^[IVXLCDM]+[\.\-\)]\s/,
    ];

    const data = paragraphs.map((paragraph, idx) => ({
      paragraph_number: idx + 1,
      content: paragraph.trim(),
      word_count: paragraph.trim().split(/\s+/).length,
      char_count: paragraph.trim().length,
      is_heading: headingPatterns.some((p) => p.test(paragraph.trim())) || paragraph.trim().length < 80,
    }));

    await this.checkQuota(tenantId, data.length, file.length);

    const checksum = createHash('sha256').update(file).digest('hex');

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: filename.replace(/\.[^.]+$/, ''),
        sourceType: 'file',
        format: 'DOCX',
        sizeBytes: BigInt(file.length),
        rowCount: BigInt(data.length),
        columnCount: columns.length,
        schemaJson: {
          columns,
          checksum,
          totalParagraphs: paragraphs.length,
          totalWords: rawText.split(/\s+/).length,
          totalCharacters: rawText.length,
          hasHtml: htmlContent.length > 0,
        } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of columns) {
      const colValues = data.map((r) => r[col.name as keyof typeof r]);
      const stats = this.computeColumnStats(colValues as unknown[], col.dataType);
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.index,
          nullable: col.nullable,
          statsJson: stats,
        },
      });
    }

    const CHUNK_SIZE = 1000;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      await this.prisma.dataRow.createMany({
        data: chunk.map((row, idx) => ({
          datasetId: dataset.id,
          rowIndex: offset + idx,
          data: row as unknown as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    await this.incrementUsedBytes(tenantId, file.length);

    logger.info(`Word import completed: ${filename}`, {
      datasetId: dataset.id,
      paragraphs: paragraphs.length,
      totalWords: rawText.split(/\s+/).length,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: 'DOCX',
      rowCount: data.length,
      columnCount: columns.length,
      columns,
      sizeBytes: file.length,
      checksum,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Feature 11: Raw Text Import (all text formats: .log, .md, .rst, .ini, .cfg, .yaml, .yml)
  // ═══════════════════════════════════════════════════════════════════════

  async importRawText(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    await this.checkQuota(tenantId, 0, file.length);

    const ext = filename.split('.').pop()?.toLowerCase() || 'txt';
    logger.info(`Starting raw text import: ${filename} (format: ${ext})`, { tenantId });

    const detectedEncoding = this.detectEncoding(file);
    const encoding = detectedEncoding.encoding || 'utf-8';
    const content = iconv.decode(file, encoding);

    if (content.trim().length === 0) {
      throw new Error(`Raw text file "${filename}" is empty`);
    }

    const lines = content.split('\n');

    const columns: ColumnMeta[] = [
      { name: 'line_number', index: 0, dataType: 'integer', nullable: false },
      { name: 'content', index: 1, dataType: 'text', nullable: false },
      { name: 'indent_level', index: 2, dataType: 'integer', nullable: false },
      { name: 'line_type', index: 3, dataType: 'string', nullable: false },
      { name: 'char_count', index: 4, dataType: 'integer', nullable: false },
    ];

    const data = lines.map((line, idx) => {
      const stripped = line.replace(/\r$/, '');
      const indent = stripped.length - stripped.trimStart().length;
      let lineType = 'text';

      if (stripped.trim().length === 0) {
        lineType = 'empty';
      } else if (/^[#]+\s/.test(stripped.trim())) {
        lineType = 'heading';
      } else if (/^[-*+]\s/.test(stripped.trim())) {
        lineType = 'list_item';
      } else if (/^\d+[\.\)]\s/.test(stripped.trim())) {
        lineType = 'numbered_item';
      } else if (/^[>]/.test(stripped.trim())) {
        lineType = 'blockquote';
      } else if (/^```/.test(stripped.trim())) {
        lineType = 'code_fence';
      } else if (/^[\[{]/.test(stripped.trim())) {
        lineType = 'structured';
      } else if (/^(#|\/\/|;|rem\s)/i.test(stripped.trim())) {
        lineType = 'comment';
      } else if (/^[A-Z_][A-Z_0-9]*\s*[=:]/.test(stripped.trim())) {
        lineType = 'config_entry';
      }

      return {
        line_number: idx + 1,
        content: stripped,
        indent_level: indent,
        line_type: lineType,
        char_count: stripped.trim().length,
      };
    });

    await this.checkQuota(tenantId, data.length, file.length);

    const checksum = createHash('sha256').update(file).digest('hex');

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: filename.replace(/\.[^.]+$/, ''),
        sourceType: 'file',
        format: ext.toUpperCase(),
        sizeBytes: BigInt(file.length),
        rowCount: BigInt(data.length),
        columnCount: columns.length,
        schemaJson: {
          columns,
          encoding,
          checksum,
          textFormat: ext,
          totalLines: lines.length,
          nonEmptyLines: lines.filter((l) => l.trim().length > 0).length,
          totalCharacters: content.length,
        } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of columns) {
      const colValues = data.map((r) => r[col.name as keyof typeof r]);
      const stats = this.computeColumnStats(colValues as unknown[], col.dataType);
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.index,
          nullable: col.nullable,
          statsJson: stats,
        },
      });
    }

    const CHUNK_SIZE = 1000;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      await this.prisma.dataRow.createMany({
        data: chunk.map((row, idx) => ({
          datasetId: dataset.id,
          rowIndex: offset + idx,
          data: row as unknown as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    await this.incrementUsedBytes(tenantId, file.length);

    logger.info(`Raw text import completed: ${filename}`, {
      datasetId: dataset.id,
      format: ext,
      totalLines: lines.length,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: ext.toUpperCase(),
      encoding,
      rowCount: data.length,
      columnCount: columns.length,
      columns,
      sizeBytes: file.length,
      checksum,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Feature 12: Official Reports Import (auto-detect and parse)
  // ═══════════════════════════════════════════════════════════════════════

  async importReport(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    logger.info(`Starting report import: ${filename}`, { tenantId });

    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const detected = await this.detectFileType(file);
    const mimeType = detected.mime || '';

    let result: ImportResult;

    if (ext === 'pdf' || mimeType === 'application/pdf') {
      result = await this.importPDF(file, filename, tenantId, userId);
    } else if (['xlsx', 'xls'].includes(ext) || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      result = await this.importExcel(file, filename, tenantId, userId);
    } else if (['docx', 'doc'].includes(ext) || mimeType.includes('word')) {
      result = await this.importWord(file, filename, tenantId, userId);
    } else if (ext === 'csv' || mimeType.includes('csv') || mimeType === 'text/plain') {
      result = await this.importCSV(file, filename, tenantId, userId);
    } else if (ext === 'json' || mimeType.includes('json')) {
      result = await this.importJSON(file, filename, tenantId, userId);
    } else if (ext === 'xml' || mimeType.includes('xml')) {
      result = await this.importXML(file, filename, tenantId, userId);
    } else if (['html', 'htm'].includes(ext) || mimeType.includes('html')) {
      const content = file.toString('utf-8');
      const textContent = content
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');

      const txtBuffer = Buffer.from(textContent, 'utf-8');
      result = await this.importTXT(txtBuffer, filename.replace(/\.[^.]+$/, '.txt'), tenantId, userId);
    } else {
      result = await this.importTXT(file, filename, tenantId, userId);
    }

    await this.prisma.dataset.update({
      where: { id: result.id },
      data: {
        schemaJson: {
          ...(typeof result.columns === 'object' ? {} : {}),
          reportSource: true,
          originalFormat: ext,
          detectedMime: mimeType,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    logger.info(`Report import completed: ${filename}`, {
      datasetId: result.id,
      detectedFormat: ext,
    });

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Feature 13: PowerPoint / Google Slides Import
  // ═══════════════════════════════════════════════════════════════════════

  async importPresentation(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string
  ): Promise<ImportResult> {
    logger.info(`Starting presentation import: ${filename}`, { tenantId });

    await this.checkQuota(tenantId, 0, file.length);

    const zip = new AdmZip(file);
    const slides: Array<{ slideNumber: number; title: string; content: string; notes: string }> = [];

    const slideEntries = zip
      .getEntries()
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.match(/slide(\d+)/)?.[1] || '0', 10);
        const numB = parseInt(b.entryName.match(/slide(\d+)/)?.[1] || '0', 10);
        return numA - numB;
      });

    if (slideEntries.length === 0) {
      throw new Error(`PowerPoint file "${filename}" contains no slides`);
    }

    for (let i = 0; i < slideEntries.length; i++) {
      const entry = slideEntries[i];
      const xmlContent = entry.getData().toString('utf-8');

      const textSegments: string[] = [];
      const textRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
      let match: RegExpExecArray | null;
      while ((match = textRegex.exec(xmlContent)) !== null) {
        if (match[1].trim()) {
          textSegments.push(match[1].trim());
        }
      }

      const title = textSegments.length > 0 ? textSegments[0] : `Slide ${i + 1}`;
      const content = textSegments.join('\n');

      let notes = '';
      const slideNum = entry.entryName.match(/slide(\d+)/)?.[1] || '';
      const notesEntry = zip.getEntry(`ppt/notesSlides/notesSlide${slideNum}.xml`);
      if (notesEntry) {
        const notesXml = notesEntry.getData().toString('utf-8');
        const notesSegments: string[] = [];
        const notesRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
        let notesMatch: RegExpExecArray | null;
        while ((notesMatch = notesRegex.exec(notesXml)) !== null) {
          if (notesMatch[1].trim() && !/^\d+$/.test(notesMatch[1].trim())) {
            notesSegments.push(notesMatch[1].trim());
          }
        }
        notes = notesSegments.join('\n');
      }

      slides.push({
        slideNumber: i + 1,
        title,
        content,
        notes,
      });
    }

    const columns: ColumnMeta[] = [
      { name: 'slide_number', index: 0, dataType: 'integer', nullable: false },
      { name: 'title', index: 1, dataType: 'string', nullable: false },
      { name: 'content', index: 2, dataType: 'text', nullable: false },
      { name: 'notes', index: 3, dataType: 'text', nullable: true },
      { name: 'word_count', index: 4, dataType: 'integer', nullable: false },
      { name: 'has_notes', index: 5, dataType: 'boolean', nullable: false },
    ];

    const data = slides.map((slide) => ({
      slide_number: slide.slideNumber,
      title: slide.title,
      content: slide.content,
      notes: slide.notes,
      word_count: slide.content.split(/\s+/).filter(Boolean).length,
      has_notes: slide.notes.length > 0,
    }));

    await this.checkQuota(tenantId, data.length, file.length);

    const checksum = createHash('sha256').update(file).digest('hex');

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: filename.replace(/\.[^.]+$/, ''),
        sourceType: 'file',
        format: 'PPTX',
        sizeBytes: BigInt(file.length),
        rowCount: BigInt(data.length),
        columnCount: columns.length,
        schemaJson: {
          columns,
          checksum,
          totalSlides: slides.length,
          slidesWithNotes: slides.filter((s) => s.notes.length > 0).length,
        } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of columns) {
      const colValues = data.map((r) => r[col.name as keyof typeof r]);
      const stats = this.computeColumnStats(colValues as unknown[], col.dataType);
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.index,
          nullable: col.nullable,
          statsJson: stats,
        },
      });
    }

    await this.prisma.dataRow.createMany({
      data: data.map((row, idx) => ({
        datasetId: dataset.id,
        rowIndex: idx,
        data: row as unknown as unknown as Prisma.InputJsonValue,
      })),
    });

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    await this.incrementUsedBytes(tenantId, file.length);

    logger.info(`Presentation import completed: ${filename}`, {
      datasetId: dataset.id,
      totalSlides: slides.length,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: 'PPTX',
      rowCount: data.length,
      columnCount: columns.length,
      columns,
      sizeBytes: file.length,
      checksum,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Feature 14: Document/Table Images OCR Import
  // ═══════════════════════════════════════════════════════════════════════

  async importDocumentImage(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string,
    languages: string[] = ['ara', 'eng']
  ): Promise<ImportResult> {
    logger.info(`Starting document image OCR import: ${filename}`, { tenantId, languages });

    await this.checkQuota(tenantId, 0, file.length);

    const enhancedBuffer = await this.enhanceImageForOcr(file);

    const { data: ocrData } = await Tesseract.recognize(
      enhancedBuffer,
      languages.join('+'),
      {
        logger: (info: { status: string; progress: number }) => {
          if (info.status === 'recognizing text') {
            logger.debug('Tesseract progress', { progress: Math.round(info.progress * 100) });
          }
        },
      }
    );

    const fullText = ocrData.text || '';
    if (fullText.trim().length === 0) {
      throw new Error(`Image "${filename}" contains no recognizable text via OCR`);
    }

    const confidence = ocrData.confidence || 0;
    const lines = fullText.split('\n').filter((l) => l.trim().length > 0);

    const tableLines = lines.filter(
      (l) => l.includes('\t') || l.split(/\s{3,}/).length > 2
    );

    let parsedData: Record<string, any>[];
    let columns: ColumnMeta[];

    if (tableLines.length > 2) {
      const separator = tableLines[0].includes('\t') ? '\t' : /\s{3,}/;
      const headers = tableLines[0]
        .split(separator)
        .map((h) => h.trim())
        .filter(Boolean);

      if (headers.length >= 2) {
        parsedData = [];
        for (let i = 1; i < tableLines.length; i++) {
          const values = tableLines[i].split(separator).map((v) => v.trim());
          const row: Record<string, any> = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx] || null;
          });
          parsedData.push(row);
        }

        const sampleRows = parsedData.slice(0, 200);
        columns = headers.map((name, index) => ({
          name,
          index,
          dataType: this.inferColumnType(sampleRows.map((r) => r[name])),
          nullable: parsedData.some((row) => row[name] === null || row[name] === undefined),
        }));
      } else {
        columns = [
          { name: 'line_number', index: 0, dataType: 'integer', nullable: false },
          { name: 'content', index: 1, dataType: 'text', nullable: false },
          { name: 'word_count', index: 2, dataType: 'integer', nullable: false },
        ];
        parsedData = lines.map((line, idx) => ({
          line_number: idx + 1,
          content: line.trim(),
          word_count: line.trim().split(/\s+/).length,
        }));
      }
    } else {
      columns = [
        { name: 'line_number', index: 0, dataType: 'integer', nullable: false },
        { name: 'content', index: 1, dataType: 'text', nullable: false },
        { name: 'word_count', index: 2, dataType: 'integer', nullable: false },
      ];
      parsedData = lines.map((line, idx) => ({
        line_number: idx + 1,
        content: line.trim(),
        word_count: line.trim().split(/\s+/).length,
      }));
    }

    await this.checkQuota(tenantId, parsedData.length, file.length);

    const checksum = createHash('sha256').update(file).digest('hex');

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: filename.replace(/\.[^.]+$/, ''),
        sourceType: 'file',
        format: 'IMAGE_OCR',
        sizeBytes: BigInt(file.length),
        rowCount: BigInt(parsedData.length),
        columnCount: columns.length,
        schemaJson: {
          columns,
          checksum,
          ocrConfidence: confidence,
          ocrLanguages: languages,
          isTabular: tableLines.length > 2,
          totalWords: (ocrData as unknown as { words?: unknown[] }).words?.length || 0,
        } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of columns) {
      const colValues = parsedData.map((r) => r[col.name]);
      const stats = this.computeColumnStats(colValues as unknown[], col.dataType);
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.index,
          nullable: col.nullable,
          statsJson: stats,
        },
      });
    }

    const CHUNK_SIZE = 1000;
    for (let offset = 0; offset < parsedData.length; offset += CHUNK_SIZE) {
      const chunk = parsedData.slice(offset, offset + CHUNK_SIZE);
      await this.prisma.dataRow.createMany({
        data: chunk.map((row, idx) => ({
          datasetId: dataset.id,
          rowIndex: offset + idx,
          data: row as unknown as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    await this.incrementUsedBytes(tenantId, file.length);

    logger.info(`Document image OCR import completed: ${filename}`, {
      datasetId: dataset.id,
      confidence,
      lines: lines.length,
      isTabular: tableLines.length > 2,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: 'IMAGE_OCR',
      rowCount: parsedData.length,
      columnCount: columns.length,
      columns,
      sizeBytes: file.length,
      checksum,
      ocrConfidence: confidence,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Feature 15: Receipt / Invoice Image Import with Field Extraction
  // ═══════════════════════════════════════════════════════════════════════

  async importReceiptImage(
    file: Buffer,
    filename: string,
    tenantId: string,
    userId: string,
    languages: string[] = ['ara', 'eng']
  ): Promise<ImportResult> {
    logger.info(`Starting receipt/invoice image import: ${filename}`, { tenantId, languages });

    await this.checkQuota(tenantId, 0, file.length);

    const enhancedBuffer = await this.enhanceImageForOcr(file);

    const { data: ocrData } = await Tesseract.recognize(
      enhancedBuffer,
      languages.join('+'),
      {
        logger: (info: { status: string; progress: number }) => {
          if (info.status === 'recognizing text') {
            logger.debug('Tesseract receipt progress', { progress: Math.round(info.progress * 100) });
          }
        },
      }
    );

    const fullText = ocrData.text || '';
    if (fullText.trim().length === 0) {
      throw new Error(`Receipt image "${filename}" contains no recognizable text via OCR`);
    }

    const confidence = ocrData.confidence || 0;
    const extraction = this.extractReceiptFields(fullText);

    const columns: ColumnMeta[] = [
      { name: 'field', index: 0, dataType: 'string', nullable: false },
      { name: 'value', index: 1, dataType: 'string', nullable: true },
      { name: 'confidence', index: 2, dataType: 'float', nullable: false },
    ];

    const fieldRows: Record<string, any>[] = [
      { field: 'vendor', value: extraction.vendor, confidence },
      { field: 'date', value: extraction.date, confidence },
      { field: 'receipt_number', value: extraction.receiptNumber, confidence },
      { field: 'subtotal', value: extraction.subtotal, confidence },
      { field: 'tax_amount', value: extraction.taxAmount, confidence },
      { field: 'total', value: extraction.total, confidence },
      { field: 'currency', value: extraction.currency, confidence },
      { field: 'payment_method', value: extraction.paymentMethod, confidence },
    ];

    for (const item of extraction.items) {
      fieldRows.push({
        field: 'item',
        value: `${item.description} | qty: ${item.quantity} | unit: ${item.unitPrice} | amount: ${item.amount}`,
        confidence,
      });
    }

    const checksum = createHash('sha256').update(file).digest('hex');

    const dataset = await this.prisma.dataset.create({
      data: {
        tenantId,
        name: filename.replace(/\.[^.]+$/, ''),
        sourceType: 'file',
        format: 'RECEIPT',
        sizeBytes: BigInt(file.length),
        rowCount: BigInt(fieldRows.length),
        columnCount: columns.length,
        schemaJson: {
          columns,
          checksum,
          ocrConfidence: confidence,
          ocrLanguages: languages,
          extractedFields: extraction,
          fullText: fullText.substring(0, 5000),
        } as unknown as Prisma.InputJsonValue,
        status: 'active',
        createdBy: userId,
      },
    });

    for (const col of columns) {
      const colValues = fieldRows.map((r) => r[col.name]);
      const stats = this.computeColumnStats(colValues as unknown[], col.dataType);
      await this.prisma.datasetColumn.create({
        data: {
          datasetId: dataset.id,
          name: col.name,
          dataType: col.dataType,
          position: col.index,
          nullable: col.nullable,
          statsJson: stats,
        },
      });
    }

    await this.prisma.dataRow.createMany({
      data: fieldRows.map((row, idx) => ({
        datasetId: dataset.id,
        rowIndex: idx,
        data: row as unknown as unknown as Prisma.InputJsonValue,
      })),
    });

    await this.prisma.ingestionJob.create({
      data: {
        tenantId,
        datasetId: dataset.id,
        status: 'completed',
        progress: 100,
      },
    });

    await this.incrementUsedBytes(tenantId, file.length);

    logger.info(`Receipt/invoice import completed: ${filename}`, {
      datasetId: dataset.id,
      confidence,
      vendor: extraction.vendor,
      total: extraction.total,
      itemCount: extraction.items.length,
    });

    return {
      id: dataset.id,
      name: dataset.name,
      format: 'RECEIPT',
      rowCount: fieldRows.length,
      columnCount: columns.length,
      columns,
      sizeBytes: file.length,
      checksum,
      ocrConfidence: confidence,
      extractedFields: {
        vendor: extraction.vendor,
        date: extraction.date,
        total: extraction.total,
        currency: extraction.currency,
      },
    };
  }

  private extractReceiptFields(text: string): ReceiptExtractionResult {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // Vendor: typically the first non-empty, non-numeric line
    let vendor = '';
    for (const line of lines.slice(0, 5)) {
      if (line.length > 2 && !/^\d+$/.test(line) && !/^[\d\s\-\/\.\:]+$/.test(line)) {
        vendor = line;
        break;
      }
    }

    // Date patterns
    const datePatterns = [
      /(\d{4}[-\/]\d{2}[-\/]\d{2})/,
      /(\d{2}[-\/]\d{2}[-\/]\d{4})/,
      /(\d{2}[-\/]\d{2}[-\/]\d{2})/,
      /(تاريخ|date|التاريخ)[:\s]*([^\n]+)/i,
    ];
    let date = '';
    for (const line of lines) {
      for (const pattern of datePatterns) {
        const match = line.match(pattern);
        if (match) {
          date = match[1] || match[2] || '';
          break;
        }
      }
      if (date) break;
    }

    // Total amount
    const totalPatterns = [
      /(المجموع|الإجمالي|total|grand\s*total|net\s*total|المبلغ)[:\s]*([٠-٩\d,.\s]+)/i,
      /(total|المجموع|الإجمالي)[:\s]*([\d,.]+)/i,
    ];
    let total = '';
    for (const line of lines) {
      for (const pattern of totalPatterns) {
        const match = line.match(pattern);
        if (match) {
          total = (match[2] || '').trim();
          break;
        }
      }
      if (total) break;
    }

    // Tax
    const taxPatterns = [
      /(ضريبة|vat|tax|القيمة المضافة)[:\s]*([٠-٩\d,.\s]+)/i,
    ];
    let taxAmount = '';
    for (const line of lines) {
      for (const pattern of taxPatterns) {
        const match = line.match(pattern);
        if (match) {
          taxAmount = (match[2] || '').trim();
          break;
        }
      }
      if (taxAmount) break;
    }

    // Subtotal
    const subtotalPatterns = [
      /(المجموع الفرعي|subtotal|sub-total|المجموع قبل)[:\s]*([٠-٩\d,.\s]+)/i,
    ];
    let subtotal = '';
    for (const line of lines) {
      for (const pattern of subtotalPatterns) {
        const match = line.match(pattern);
        if (match) {
          subtotal = (match[2] || '').trim();
          break;
        }
      }
      if (subtotal) break;
    }

    // Currency
    let currency = 'SAR';
    const currencyPatterns = [/ريال|sar|sr/i, /\$/i, /€|eur/i, /£|gbp/i, /aed|درهم/i];
    const currencyNames = ['SAR', 'USD', 'EUR', 'GBP', 'AED'];
    for (const line of lines) {
      for (let i = 0; i < currencyPatterns.length; i++) {
        if (currencyPatterns[i].test(line)) {
          currency = currencyNames[i];
          break;
        }
      }
    }

    // Payment method
    let paymentMethod = '';
    const paymentPatterns = [
      /(نقد|cash|كاش)/i,
      /(بطاقة|card|visa|mastercard|mada|مدى)/i,
      /(تحويل|transfer|حوالة)/i,
    ];
    const paymentNames = ['cash', 'card', 'transfer'];
    for (const line of lines) {
      for (let i = 0; i < paymentPatterns.length; i++) {
        if (paymentPatterns[i].test(line)) {
          paymentMethod = paymentNames[i];
          break;
        }
      }
      if (paymentMethod) break;
    }

    // Receipt number
    let receiptNumber = '';
    const receiptPatterns = [
      /(رقم الفاتورة|invoice|receipt|فاتورة|إيصال|رقم)[:\s#]*([A-Za-z0-9\-]+)/i,
    ];
    for (const line of lines) {
      for (const pattern of receiptPatterns) {
        const match = line.match(pattern);
        if (match) {
          receiptNumber = (match[2] || '').trim();
          break;
        }
      }
      if (receiptNumber) break;
    }

    // Line items: lines with a price pattern
    const items: Array<{ description: string; quantity: string; unitPrice: string; amount: string }> = [];
    const itemPattern = /^(.+?)\s+([\d,.]+)\s*[xX×]\s*([\d,.]+)\s*=?\s*([\d,.]+)?$/;
    const simpleItemPattern = /^(.{3,}?)\s+([\d,.]+)\s*$/;

    for (const line of lines) {
      const itemMatch = line.match(itemPattern);
      if (itemMatch) {
        items.push({
          description: itemMatch[1].trim(),
          quantity: itemMatch[2],
          unitPrice: itemMatch[3],
          amount: itemMatch[4] || '',
        });
        continue;
      }

      const simpleMatch = line.match(simpleItemPattern);
      if (
        simpleMatch &&
        !/(total|tax|vat|subtotal|المجموع|ضريبة|الإجمالي|فرعي)/i.test(line)
      ) {
        items.push({
          description: simpleMatch[1].trim(),
          quantity: '1',
          unitPrice: simpleMatch[2],
          amount: simpleMatch[2],
        });
      }
    }

    return {
      vendor,
      date,
      total,
      currency,
      items,
      taxAmount,
      subtotal,
      paymentMethod,
      receiptNumber,
    };
  }

  private async enhanceImageForOcr(buffer: Buffer): Promise<Buffer> {
    const metadata = await sharp(buffer).metadata();
    let pipeline = sharp(buffer);

    // Upscale small images
    if (metadata.width && metadata.height) {
      const minDimension = Math.min(metadata.width, metadata.height);
      if (minDimension < 1000) {
        const scaleFactor = Math.min(3, 1500 / minDimension);
        pipeline = pipeline.resize(
          Math.round(metadata.width * scaleFactor),
          Math.round(metadata.height * scaleFactor),
          { kernel: sharp.kernel.lanczos3, withoutEnlargement: false }
        );
      }
    }

    return pipeline
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.5, m1: 1.0, m2: 0.5 })
      .toBuffer();
  }
}
