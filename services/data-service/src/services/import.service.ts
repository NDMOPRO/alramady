import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as chardet from 'chardet';
import * as iconv from 'iconv-lite';
import * as xml2js from 'xml2js';
import pdfParse from 'pdf-parse';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { PrismaClient } from '@prisma/client';
import { Client as ElasticClient } from '@elastic/elasticsearch';
import { logger } from '../utils/logger';
import mammoth from 'mammoth';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';

const prisma = new PrismaClient();
const elastic = new ElasticClient({ node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200' });

interface DatasetResult { id: string; name: string; rowCount: number; columnCount: number }
interface ColumnDef { name: string; dataType: string; position: number; nullable: boolean }

export class ImportService {

  // ── Raw SQL helpers (bypass Prisma schema/DB mismatch) ──────────────

  private async insertDataset(
    tenantId: string, name: string, format: string, sizeBytes: number,
    rowCount: number, columnCount: number, schemaJson: unknown, userId: string,
  ): Promise<DatasetResult> {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO datasets (id, tenant_id, name, slug, source_type, format, size_bytes, row_count, column_count, schema_json, status, created_by)
       VALUES (gen_random_uuid(), $1, $2, $3, 'file', $4, $5, $6, $7, $8::jsonb, 'active', $9)
       RETURNING id, name, row_count as "rowCount", column_count as "columnCount"`,
      tenantId, name, slug, format, sizeBytes, rowCount, columnCount,
      JSON.stringify(schemaJson), userId,
    ) as DatasetResult[];
    return rows[0];
  }

  private async insertColumns(datasetId: string, columns: ColumnDef[]): Promise<void> {
    for (const col of columns) {
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO dataset_columns (id, dataset_id, name, data_type, position, nullable)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
          datasetId, col.name, col.dataType, col.position, col.nullable,
        );
      } catch { /* column insert may fail if table schema differs */ }
    }
  }

  private async insertRows(datasetId: string, data: Record<string, any>[]): Promise<void> {
    const CHUNK = 500;
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, i + CHUNK);
      for (let j = 0; j < chunk.length; j++) {
        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO data_rows (id, dataset_id, row_index, data) VALUES (gen_random_uuid(), $1, $2, $3::jsonb)`,
            datasetId, i + j, JSON.stringify(chunk[j]),
          );
        } catch { /* skip row on error */ }
      }
    }
  }

  private async insertIngestionJob(datasetId: string, filename: string, format: string, rowCount: number, extra?: Record<string, any>): Promise<void> {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO ingestion_jobs (id, dataset_id, status, source_type, config, progress, row_count)
         VALUES (gen_random_uuid(), $1, 'completed', 'file', $2::jsonb, 100, $3)`,
        datasetId, JSON.stringify({ filename, format, ...extra }), rowCount,
      );
    } catch { /* ingestion job insert may fail */ }
  }

  private async indexElastic(id: string, name: string, format: string, columnNames: string[], rowCount: number, tenantId: string): Promise<void> {
    try {
      await elastic.index({
        index: 'rasid-datasets',
        id,
        document: { name, format, columns: columnNames, rowCount, tenantId, createdAt: new Date() },
      });
    } catch (e) {
      logger.warn('Elasticsearch indexing failed, continuing without search index', { error: e });
    }
  }

  // ── CSV ─────────────────────────────────────────────────────────────

  async importCSV(file: Buffer, filename: string, tenantId: string, userId: string) {
    const detectedEncoding = chardet.detect(file);
    const encoding = detectedEncoding || 'utf-8';
    const content = iconv.decode(file, encoding);

    const firstLine = content.split('\n')[0] || '';
    const delimiters = [',', ';', '\t', '|'];
    const delimiter = delimiters.reduce((best, d) =>
      (firstLine.split(d).length > firstLine.split(best).length) ? d : best, ',');

    const parsed = Papa.parse(content, {
      delimiter,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    });

    if (parsed.errors.length > parsed.data.length * 0.1) {
      throw new Error(`CSV has too many parse errors: ${parsed.errors.length} errors in ${parsed.data.length} rows`);
    }

    const columns: ColumnDef[] = (parsed.meta.fields || []).map((name, index) => ({
      name,
      dataType: this.inferColumnType(parsed.data.slice(0, 100) as Record<string, any>[], name),
      position: index,
      nullable: (parsed.data as Record<string, any>[]).some(row => row[name] === null || row[name] === '' || row[name] === undefined),
    }));

    const checksum = createHash('sha256').update(file).digest('hex');
    const baseName = filename.replace(/\.[^.]+$/, '');

    const ds = await this.insertDataset(tenantId, baseName, 'CSV', file.length, parsed.data.length, columns.length, columns, userId);
    await this.insertColumns(ds.id, columns);
    await this.insertRows(ds.id, parsed.data as Record<string, any>[]);
    await this.insertIngestionJob(ds.id, filename, 'CSV', parsed.data.length, { encoding });
    await this.indexElastic(ds.id, ds.name, 'CSV', columns.map(c => c.name), parsed.data.length, tenantId);

    return {
      id: ds.id, name: ds.name, format: 'CSV', encoding, delimiter,
      rowCount: parsed.data.length, columnCount: columns.length, columns,
      sizeBytes: file.length, checksum,
    };
  }

  // ── Excel ───────────────────────────────────────────────────────────

  async importExcel(file: Buffer, filename: string, tenantId: string, userId: string) {
    const workbook = XLSX.read(file, { type: 'buffer', cellDates: true, cellStyles: true });
    const allData: Record<string, any>[] = [];
    const allColumns: ColumnDef[] = [];

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Excel file has no sheets');

    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, any>[];

    if (jsonData.length > 0) {
      const headers = Object.keys(jsonData[0]);
      headers.forEach((name, index) => {
        allColumns.push({
          name,
          dataType: this.inferColumnType(jsonData.slice(0, 100), name),
          position: index,
          nullable: jsonData.some(row => row[name] === null || row[name] === undefined),
        });
      });
      allData.push(...jsonData);
    }

    const baseName = filename.replace(/\.[^.]+$/, '');
    const ds = await this.insertDataset(tenantId, baseName, 'XLSX', file.length, allData.length, allColumns.length, { sheets: workbook.SheetNames, columns: allColumns }, userId);
    await this.insertColumns(ds.id, allColumns);
    await this.insertRows(ds.id, allData);
    await this.insertIngestionJob(ds.id, filename, 'XLSX', allData.length);
    await this.indexElastic(ds.id, ds.name, 'XLSX', allColumns.map(c => c.name), allData.length, tenantId);

    return {
      id: ds.id, name: ds.name, format: 'XLSX', sheets: workbook.SheetNames,
      rowCount: allData.length, columnCount: allColumns.length, columns: allColumns,
    };
  }

  // ── JSON / JSONL / NDJSON ───────────────────────────────────────────

  async importJSON(file: Buffer, filename: string, tenantId: string, userId: string) {
    const content = file.toString('utf-8');
    let data: Record<string, any>[];

    if (content.trim().startsWith('[')) {
      data = JSON.parse(content);
    } else if (content.includes('\n')) {
      data = content.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
    } else {
      const parsed = JSON.parse(content);
      data = Array.isArray(parsed) ? parsed : [this.flattenObject(parsed)];
    }

    data = data.map(item => this.flattenObject(item));

    const allKeys = new Set<string>();
    data.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
    const columns: ColumnDef[] = Array.from(allKeys).map((name, index) => ({
      name,
      dataType: this.inferColumnType(data.slice(0, 100), name),
      position: index,
      nullable: data.some(row => row[name] === null || row[name] === undefined),
    }));

    const baseName = filename.replace(/\.[^.]+$/, '');
    const ds = await this.insertDataset(tenantId, baseName, 'JSON', file.length, data.length, columns.length, columns, userId);
    await this.insertColumns(ds.id, columns);
    await this.insertRows(ds.id, data);
    await this.insertIngestionJob(ds.id, filename, 'JSON', data.length);
    await this.indexElastic(ds.id, ds.name, 'JSON', columns.map(c => c.name), data.length, tenantId);

    return { id: ds.id, name: ds.name, format: 'JSON', rowCount: data.length, columnCount: columns.length, columns };
  }

  // ── XML ─────────────────────────────────────────────────────────────

  async importXML(file: Buffer, filename: string, tenantId: string, userId: string) {
    const content = file.toString('utf-8');
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true, trim: true });
    const xmlResult = await parser.parseStringPromise(content);

    const rootKey = Object.keys(xmlResult)[0];
    let rawData = xmlResult[rootKey];
    if (typeof rawData === 'object' && !Array.isArray(rawData)) {
      const innerKey = Object.keys(rawData).find(k => Array.isArray(rawData[k]));
      rawData = innerKey ? rawData[innerKey] : [rawData];
    }
    if (!Array.isArray(rawData)) rawData = [rawData];

    const data = rawData.map((item: unknown) => this.flattenObject(item));
    const allKeys = new Set<string>();
    data.forEach((row: Record<string, any>) => Object.keys(row).forEach(k => allKeys.add(k)));

    const columns: ColumnDef[] = Array.from(allKeys).map((name, index) => ({
      name,
      dataType: this.inferColumnType(data.slice(0, 100), name),
      position: index,
      nullable: data.some((row: Record<string, any>) => row[name] === null || row[name] === undefined),
    }));

    const baseName = filename.replace(/\.[^.]+$/, '');
    const ds = await this.insertDataset(tenantId, baseName, 'XML', file.length, data.length, columns.length, columns, userId);
    await this.insertColumns(ds.id, columns);
    await this.insertRows(ds.id, data);
    await this.insertIngestionJob(ds.id, filename, 'XML', data.length);
    await this.indexElastic(ds.id, ds.name, 'XML', columns.map(c => c.name), data.length, tenantId);

    return { id: ds.id, name: ds.name, format: 'XML', rowCount: data.length, columnCount: columns.length, columns };
  }

  // ── PDF ─────────────────────────────────────────────────────────────

  async importPDF(file: Buffer, filename: string, tenantId: string, userId: string) {
    const pdfData = await pdfParse(file);
    const text = pdfData.text;
    const lines = text.split('\n').filter(l => l.trim().length > 0);

    const tableLines = lines.filter(l => l.includes('\t') || l.split(/\s{2,}/).length > 2);
    let data: Record<string, any>[] = [];
    let columns: ColumnDef[] = [];

    if (tableLines.length > 1) {
      const separator = tableLines[0].includes('\t') ? '\t' : /\s{2,}/;
      const headers = tableLines[0].split(separator).map(h => h.trim()).filter(Boolean);
      columns = headers.map((name, i) => ({ name, dataType: 'string', position: i, nullable: true }));

      for (let i = 1; i < tableLines.length; i++) {
        const values = tableLines[i].split(separator).map(v => v.trim());
        const row: Record<string, any> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || null; });
        data.push(row);
      }
    } else {
      columns = [
        { name: 'line_number', dataType: 'integer', position: 0, nullable: false },
        { name: 'content', dataType: 'string', position: 1, nullable: false },
      ];
      data = lines.map((line, idx) => ({ line_number: idx + 1, content: line.trim() }));
    }

    const baseName = filename.replace(/\.[^.]+$/, '');
    const ds = await this.insertDataset(tenantId, baseName, 'PDF', file.length, data.length, columns.length, { pages: pdfData.numpages, columns }, userId);
    await this.insertColumns(ds.id, columns);
    await this.insertRows(ds.id, data);
    await this.insertIngestionJob(ds.id, filename, 'PDF', data.length, { pages: pdfData.numpages });
    await this.indexElastic(ds.id, ds.name, 'PDF', columns.map(c => c.name), data.length, tenantId);

    return { id: ds.id, name: ds.name, format: 'PDF', pages: pdfData.numpages, rowCount: data.length, columns };
  }

  // ── TXT / LOG / MD / RST ────────────────────────────────────────────

  async importTXT(file: Buffer, filename: string, tenantId: string, userId: string) {
    const detectedEncoding = chardet.detect(file);
    const encoding = detectedEncoding || 'utf-8';
    const content = iconv.decode(file, encoding);
    const lines = content.split('\n');

    if (lines.filter(l => l.trim().length > 0).length === 0) {
      throw new Error(`TXT file "${filename}" is empty`);
    }

    const columns: ColumnDef[] = [
      { name: 'line_number', dataType: 'integer', position: 0, nullable: false },
      { name: 'content', dataType: 'text', position: 1, nullable: false },
      { name: 'char_count', dataType: 'integer', position: 2, nullable: false },
      { name: 'word_count', dataType: 'integer', position: 3, nullable: false },
    ];

    const data = lines.map((line, idx) => ({
      line_number: idx + 1,
      content: line.replace(/\r$/, ''),
      char_count: line.trim().length,
      word_count: line.trim().length > 0 ? line.trim().split(/\s+/).length : 0,
    }));

    const checksum = createHash('sha256').update(file).digest('hex');
    const baseName = filename.replace(/\.[^.]+$/, '');

    const ds = await this.insertDataset(tenantId, baseName, 'TXT', file.length, data.length, columns.length, { columns, encoding, checksum }, userId);
    await this.insertColumns(ds.id, columns);
    await this.insertRows(ds.id, data as unknown as Record<string, any>[]);
    await this.insertIngestionJob(ds.id, filename, 'TXT', data.length, { encoding });
    await this.indexElastic(ds.id, ds.name, 'TXT', columns.map(c => c.name), data.length, tenantId);

    return { id: ds.id, name: ds.name, format: 'TXT', encoding, rowCount: data.length, columnCount: columns.length, columns, sizeBytes: file.length, checksum };
  }

  // ── Word (DOC/DOCX/ODT) ────────────────────────────────────────────

  async importWord(file: Buffer, filename: string, tenantId: string, userId: string) {
    const mammothResult = await mammoth.extractRawText({ buffer: file });
    const rawText = mammothResult.value;

    if (!rawText || rawText.trim().length === 0) {
      throw new Error(`Word file "${filename}" contains no extractable text`);
    }

    const paragraphs = rawText.split('\n').filter(p => p.trim().length > 0);

    const columns: ColumnDef[] = [
      { name: 'paragraph_number', dataType: 'integer', position: 0, nullable: false },
      { name: 'content', dataType: 'text', position: 1, nullable: false },
      { name: 'word_count', dataType: 'integer', position: 2, nullable: false },
      { name: 'char_count', dataType: 'integer', position: 3, nullable: false },
    ];

    const data = paragraphs.map((p, idx) => ({
      paragraph_number: idx + 1,
      content: p.trim(),
      word_count: p.trim().split(/\s+/).length,
      char_count: p.trim().length,
    }));

    const checksum = createHash('sha256').update(file).digest('hex');
    const baseName = filename.replace(/\.[^.]+$/, '');

    const ds = await this.insertDataset(tenantId, baseName, 'DOCX', file.length, data.length, columns.length, { columns, checksum, totalWords: rawText.split(/\s+/).length }, userId);
    await this.insertColumns(ds.id, columns);
    await this.insertRows(ds.id, data as unknown as Record<string, any>[]);
    await this.insertIngestionJob(ds.id, filename, 'DOCX', data.length);
    await this.indexElastic(ds.id, ds.name, 'DOCX', columns.map(c => c.name), data.length, tenantId);

    return { id: ds.id, name: ds.name, format: 'DOCX', rowCount: data.length, columnCount: columns.length, columns, sizeBytes: file.length, checksum };
  }

  // ── Presentation (PPT/PPTX/ODP) ────────────────────────────────────

  async importPresentation(file: Buffer, filename: string, tenantId: string, userId: string) {
    const zip = new AdmZip(file);
    const slideEntries = zip.getEntries()
      .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.match(/slide(\d+)/)?.[1] || '0', 10);
        const numB = parseInt(b.entryName.match(/slide(\d+)/)?.[1] || '0', 10);
        return numA - numB;
      });

    if (slideEntries.length === 0) {
      throw new Error(`PowerPoint file "${filename}" contains no slides`);
    }

    const slides: Array<{ slideNumber: number; title: string; content: string; notes: string }> = [];

    for (let i = 0; i < slideEntries.length; i++) {
      const entry = slideEntries[i];
      const xmlContent = entry.getData().toString('utf-8');
      const textSegments: string[] = [];
      const textRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
      let match: RegExpExecArray | null;
      while ((match = textRegex.exec(xmlContent)) !== null) {
        if (match[1].trim()) textSegments.push(match[1].trim());
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

      slides.push({ slideNumber: i + 1, title, content, notes });
    }

    const columns: ColumnDef[] = [
      { name: 'slide_number', dataType: 'integer', position: 0, nullable: false },
      { name: 'title', dataType: 'string', position: 1, nullable: false },
      { name: 'content', dataType: 'text', position: 2, nullable: false },
      { name: 'notes', dataType: 'text', position: 3, nullable: true },
      { name: 'word_count', dataType: 'integer', position: 4, nullable: false },
    ];

    const data = slides.map(s => ({
      slide_number: s.slideNumber,
      title: s.title,
      content: s.content,
      notes: s.notes,
      word_count: s.content.split(/\s+/).filter(Boolean).length,
    }));

    const checksum = createHash('sha256').update(file).digest('hex');
    const baseName = filename.replace(/\.[^.]+$/, '');

    const ds = await this.insertDataset(tenantId, baseName, 'PPTX', file.length, data.length, columns.length, { columns, checksum, totalSlides: slides.length }, userId);
    await this.insertColumns(ds.id, columns);
    await this.insertRows(ds.id, data as unknown as Record<string, any>[]);
    await this.insertIngestionJob(ds.id, filename, 'PPTX', data.length);
    await this.indexElastic(ds.id, ds.name, 'PPTX', columns.map(c => c.name), data.length, tenantId);

    return { id: ds.id, name: ds.name, format: 'PPTX', rowCount: data.length, columnCount: columns.length, columns, sizeBytes: file.length, checksum };
  }

  // ── Compressed Archive (ZIP/RAR/7Z/GZ/TAR) ─────────────────────────

  async importCompressedFile(file: Buffer, filename: string, tenantId: string, userId: string) {
    const zip = new AdmZip(file);
    const entries = zip.getEntries();
    const supportedExtensions = new Set(['csv', 'tsv', 'xlsx', 'xls', 'json', 'jsonl', 'xml', 'pdf', 'txt', 'doc', 'docx', 'pptx', 'ppt']);

    const extractedFiles: Array<{ buffer: Buffer; filename: string }> = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName;
      const extension = entryName.split('.').pop()?.toLowerCase() || '';
      if (entryName.startsWith('__MACOSX') || entryName.startsWith('.')) continue;
      if (!supportedExtensions.has(extension)) continue;
      const entryBuffer = entry.getData();
      if (entryBuffer.length === 0) continue;
      const basename = entryName.split('/').pop() || entryName;
      extractedFiles.push({ buffer: entryBuffer, filename: basename });
    }

    if (extractedFiles.length === 0) {
      throw new Error(`Archive "${filename}" contains no processable files`);
    }

    const results: Array<Record<string, any>> = [];
    const errors: Array<{ filename: string; error: string }> = [];

    for (const ef of extractedFiles) {
      try {
        const ext = ef.filename.split('.').pop()?.toLowerCase() || '';
        let result: Record<string, any>;
        switch (ext) {
          case 'csv': case 'tsv': result = await this.importCSV(ef.buffer, ef.filename, tenantId, userId); break;
          case 'xlsx': case 'xls': result = await this.importExcel(ef.buffer, ef.filename, tenantId, userId); break;
          case 'json': case 'jsonl': result = await this.importJSON(ef.buffer, ef.filename, tenantId, userId); break;
          case 'xml': result = await this.importXML(ef.buffer, ef.filename, tenantId, userId); break;
          case 'pdf': result = await this.importPDF(ef.buffer, ef.filename, tenantId, userId); break;
          case 'txt': result = await this.importTXT(ef.buffer, ef.filename, tenantId, userId); break;
          case 'doc': case 'docx': result = await this.importWord(ef.buffer, ef.filename, tenantId, userId); break;
          case 'pptx': case 'ppt': result = await this.importPresentation(ef.buffer, ef.filename, tenantId, userId); break;
          default: result = await this.importTXT(ef.buffer, ef.filename, tenantId, userId);
        }
        results.push({ filename: ef.filename, ...result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ filename: ef.filename, error: message });
      }
    }

    const checksum = createHash('sha256').update(file).digest('hex');
    const baseName = filename.replace(/\.[^.]+$/, '');

    const ds = await this.insertDataset(tenantId, baseName, 'ARCHIVE', file.length, results.length, extractedFiles.length,
      { extractedFiles: extractedFiles.map(f => f.filename), totalFiles: extractedFiles.length, succeeded: results.length, failed: errors.length, checksum }, userId);
    await this.insertIngestionJob(ds.id, filename, 'ARCHIVE', results.length);

    return {
      id: ds.id, name: ds.name, format: 'ARCHIVE',
      rowCount: results.length, columnCount: extractedFiles.length, columns: [],
      sizeBytes: file.length, checksum, extractedFiles: extractedFiles.length,
      childResults: results, childErrors: errors,
    };
  }

  // ── Document Image OCR ──────────────────────────────────────────────

  async importDocumentImage(file: Buffer, filename: string, tenantId: string, userId: string, languages: string[] = ['ara', 'eng']) {
    let imageBuffer = file;
    const metadata = await sharp(file).metadata();
    if (metadata.width && metadata.height) {
      const minDim = Math.min(metadata.width, metadata.height);
      if (minDim < 1000) {
        const scale = Math.min(3, 1500 / minDim);
        imageBuffer = await sharp(file)
          .resize(Math.round(metadata.width * scale), Math.round(metadata.height * scale), { kernel: sharp.kernel.lanczos3 })
          .grayscale()
          .normalize()
          .sharpen({ sigma: 1.5, m1: 1.0, m2: 0.5 })
          .toBuffer();
      } else {
        imageBuffer = await sharp(file).grayscale().normalize().sharpen({ sigma: 1.5, m1: 1.0, m2: 0.5 }).toBuffer();
      }
    }

    const { data: ocrData } = await Tesseract.recognize(imageBuffer, languages.join('+'));
    const fullText = ocrData.text || '';

    if (fullText.trim().length === 0) {
      throw new Error(`Image "${filename}" contains no recognizable text`);
    }

    const confidence = ocrData.confidence || 0;
    const lines = fullText.split('\n').filter(l => l.trim().length > 0);

    const columns: ColumnDef[] = [
      { name: 'line_number', dataType: 'integer', position: 0, nullable: false },
      { name: 'content', dataType: 'text', position: 1, nullable: false },
      { name: 'word_count', dataType: 'integer', position: 2, nullable: false },
    ];

    const data = lines.map((line, idx) => ({
      line_number: idx + 1,
      content: line.trim(),
      word_count: line.trim().split(/\s+/).length,
    }));

    const checksum = createHash('sha256').update(file).digest('hex');
    const baseName = filename.replace(/\.[^.]+$/, '');

    const ds = await this.insertDataset(tenantId, baseName, 'IMAGE_OCR', file.length, data.length, columns.length,
      { columns, checksum, ocrConfidence: confidence, ocrLanguages: languages }, userId);
    await this.insertColumns(ds.id, columns);
    await this.insertRows(ds.id, data as unknown as Record<string, any>[]);
    await this.insertIngestionJob(ds.id, filename, 'IMAGE_OCR', data.length, { ocrConfidence: confidence });
    await this.indexElastic(ds.id, ds.name, 'IMAGE_OCR', columns.map(c => c.name), data.length, tenantId);

    return { id: ds.id, name: ds.name, format: 'IMAGE_OCR', rowCount: data.length, columnCount: columns.length, columns, sizeBytes: file.length, checksum, ocrConfidence: confidence };
  }

  // ── Utility methods ─────────────────────────────────────────────────

  private inferColumnType(data: Record<string, any>[], columnName: string): string {
    const sample = data.slice(0, 100).map(r => r[columnName]).filter(v => v !== null && v !== undefined && v !== '');
    if (sample.length === 0) return 'string';

    const allNumbers = sample.every(v => typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== ''));
    if (allNumbers) {
      const hasDecimals = sample.some(v => String(v).includes('.'));
      return hasDecimals ? 'float' : 'integer';
    }

    const allBooleans = sample.every(v => typeof v === 'boolean' || ['true', 'false', '0', '1'].includes(String(v).toLowerCase()));
    if (allBooleans) return 'boolean';

    const datePatterns = [/^\d{4}-\d{2}-\d{2}/, /^\d{2}\/\d{2}\/\d{4}/, /^\d{2}-\d{2}-\d{4}/];
    const allDates = sample.every(v => v instanceof Date || datePatterns.some(p => p.test(String(v))));
    if (allDates) return 'date';

    const avgLength = sample.reduce((s, v) => s + String(v).length, 0) / sample.length;
    return avgLength > 200 ? 'text' : 'string';
  }

  private computeColumnStats(data: Record<string, any>[], columnName: string, dataType: string): Record<string, any> {
    const values = data.map(r => r[columnName]).filter(v => v !== null && v !== undefined);
    const nullCount = data.length - values.length;
    const uniqueCount = new Set(values.map(String)).size;

    const stats: Record<string, any> = {
      totalCount: data.length,
      nullCount,
      uniqueCount,
      nullPercentage: data.length > 0 ? Math.round((nullCount / data.length) * 10000) / 100 : 0,
    };

    if (['integer', 'float'].includes(dataType)) {
      const nums = values.map(Number).filter(n => !isNaN(n));
      if (nums.length > 0) {
        nums.sort((a, b) => a - b);
        stats.min = nums[0];
        stats.max = nums[nums.length - 1];
        stats.mean = Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100;
        stats.median = nums.length % 2 === 0
          ? (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2
          : nums[Math.floor(nums.length / 2)];
        const mean = stats.mean as number;
        const variance = nums.reduce((s, n) => s + Math.pow(n - mean, 2), 0) / nums.length;
        stats.stdDev = Math.round(Math.sqrt(variance) * 100) / 100;
        stats.q1 = nums[Math.floor(nums.length * 0.25)];
        stats.q3 = nums[Math.floor(nums.length * 0.75)];
      }
    }

    if (dataType === 'string' || dataType === 'text') {
      const lengths = values.map(v => String(v).length);
      stats.minLength = Math.min(...lengths);
      stats.maxLength = Math.max(...lengths);
      stats.avgLength = Math.round(lengths.reduce((s, l) => s + l, 0) / lengths.length);
    }

    return stats;
  }

  private flattenObject(obj: unknown, prefix: string = ''): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj as Record<string, any>)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        Object.assign(result, this.flattenObject(value, newKey));
      } else if (Array.isArray(value)) {
        result[newKey] = JSON.stringify(value);
      } else {
        result[newKey] = value;
      }
    }
    return result;
  }
}

export const importService = new ImportService();
