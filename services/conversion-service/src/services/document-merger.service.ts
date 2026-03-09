import { PrismaClient } from '@prisma/client';
import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface MergeRequest {
  files: MergeFileInput[];
  outputFormat: 'pdf' | 'docx' | 'xlsx';
  outputName: string;
  options: MergeOptions;
  userId: string;
}

export interface MergeFileInput {
  fileId: string;
  filePath: string;
  mimeType: string;
  displayName: string;
  pageRange?: { start: number; end: number };
  order: number;
}

export interface MergeOptions {
  addBookmarks: boolean;
  addTableOfContents: boolean;
  pageNumbering: boolean;
  pageNumberFormat: 'numeric' | 'roman' | 'alpha';
  pageNumberPosition: 'top' | 'bottom';
  headerText?: string;
  footerText?: string;
  marginMm?: { top: number; right: number; bottom: number; left: number };
}

export interface MergeResult {
  id: string;
  outputPath: string;
  outputSize: number;
  pageCount: number;
  sourceFileCount: number;
  bookmarks: BookmarkEntry[];
  processingTimeMs: number;
  createdAt: Date;
}

export interface SplitRequest {
  fileId: string;
  filePath: string;
  splitMode: 'by_page' | 'by_range' | 'by_size' | 'by_bookmark';
  ranges?: { start: number; end: number; name?: string }[];
  maxSizeMb?: number;
  userId: string;
}

export interface SplitResult {
  id: string;
  outputFiles: { path: string; name: string; pageCount: number; size: number }[];
  totalPages: number;
  processingTimeMs: number;
}

export interface BookmarkEntry {
  title: string;
  page: number;
  level: number;
  children?: BookmarkEntry[];
}

export interface PageReorderRequest {
  fileId: string;
  filePath: string;
  newOrder: number[];
  userId: string;
}

export interface BatchMergeJob {
  id: string;
  groups: { name: string; files: MergeFileInput[] }[];
  options: MergeOptions;
  outputFormat: 'pdf' | 'docx' | 'xlsx';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  results: MergeResult[];
  userId: string;
}

export interface AssemblyDocument {
  id: string;
  name: string;
  sections: DocumentSection[];
  createdBy: string;
  createdAt: Date;
}

export interface DocumentSection {
  id: string;
  title: string;
  sourceFileId?: string;
  sourcePageRange?: { start: number; end: number };
  content?: string;
  order: number;
  includeInToc: boolean;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class DocumentMergerService {
  private readonly MAX_FILE_SIZE_MB = 500;

  constructor(private prisma: PrismaClient) {}

  async mergePdfDocuments(request: MergeRequest): Promise<MergeResult> {
    const startTime = Date.now();
    const sortedFiles = [...request.files].sort((a, b) => a.order - b.order);

    const validationErrors = this.validateMergeRequest(request);
    if (validationErrors.length > 0) {
      throw new Error(`Merge validation failed: ${validationErrors.join(', ')}`);
    }

    const outputPath = `/tmp/merged_${Date.now()}_${request.outputName}.pdf`;
    const margins = request.options.marginMm || { top: 20, right: 20, bottom: 20, left: 20 };

    const doc = new PDFDocument({
      autoFirstPage: false,
      margins: {
        top: margins.top * 2.835,
        bottom: margins.bottom * 2.835,
        left: margins.left * 2.835,
        right: margins.right * 2.835,
      },
    });

    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    const bookmarks: BookmarkEntry[] = [];
    let totalPageCount = 0;

    if (request.options.addTableOfContents) {
      doc.addPage({ size: 'A4' });
      totalPageCount += 1;

      doc.fontSize(24).font('Helvetica-Bold').text('Table of Contents', { align: 'center' });
      doc.moveDown(2);

      for (const file of sortedFiles) {
        doc.fontSize(12).font('Helvetica')
          .text(`${file.displayName}`, { continued: true })
          .text(` .............. Page ${totalPageCount + 1}`, { align: 'right' });
        doc.moveDown(0.5);
      }
    }

    for (let fileIdx = 0; fileIdx < sortedFiles.length; fileIdx++) {
      const file = sortedFiles[fileIdx];
      const fileContent = fs.readFileSync(file.filePath);
      const pageStart = file.pageRange?.start || 1;
      const pageEnd = file.pageRange?.end || this.estimatePageCount(fileContent, file.mimeType);

      bookmarks.push({
        title: file.displayName,
        page: totalPageCount + 1,
        level: 0,
      });

      for (let pageNum = pageStart; pageNum <= pageEnd; pageNum++) {
        doc.addPage({ size: 'A4' });
        totalPageCount += 1;

        if (request.options.headerText) {
          const headerY = margins.top * 2.835 - 15;
          doc.save();
          doc.fontSize(8).font('Helvetica').fillColor('#666666');
          doc.text(
            request.options.headerText.replace('{{filename}}', file.displayName),
            margins.left * 2.835,
            headerY,
            { width: doc.page.width - (margins.left + margins.right) * 2.835, align: 'center' },
          );
          doc.restore();
        }

        doc.fontSize(12).font('Helvetica').fillColor('#000000');
        doc.text(
          `[Content from: ${file.displayName}, Page ${pageNum}]`,
          margins.left * 2.835 + 20,
          margins.top * 2.835 + 20,
        );

        if (request.options.pageNumbering) {
          const pageLabel = this.formatPageNumber(totalPageCount, request.options.pageNumberFormat);
          const footerY = doc.page.height - margins.bottom * 2.835;
          doc.save();
          doc.fontSize(9).font('Helvetica').fillColor('#666666');
          doc.text(
            pageLabel,
            0,
            request.options.pageNumberPosition === 'bottom' ? footerY : margins.top * 2.835 - 20,
            { width: doc.page.width, align: 'center' },
          );
          doc.restore();
        }

        if (request.options.footerText) {
          const footerY = doc.page.height - margins.bottom * 2.835 + 10;
          doc.save();
          doc.fontSize(8).font('Helvetica').fillColor('#666666');
          doc.text(
            request.options.footerText,
            margins.left * 2.835,
            footerY,
            { width: doc.page.width - (margins.left + margins.right) * 2.835, align: 'center' },
          );
          doc.restore();
        }
      }
    }

    doc.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const stats = fs.statSync(outputPath);

    const result: MergeResult = {
      id: `merge_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
      outputPath,
      outputSize: stats.size,
      pageCount: totalPageCount,
      sourceFileCount: sortedFiles.length,
      bookmarks,
      processingTimeMs: Date.now() - startTime,
      createdAt: new Date(),
    };

    await this.prisma.mergeOperation.create({
      data: {
        outputPath,
        outputSize: stats.size,
        pageCount: totalPageCount,
        sourceFileCount: sortedFiles.length,
        bookmarks: JSON.stringify(bookmarks),
        processingTimeMs: result.processingTimeMs,
        userId: request.userId,
        createdAt: new Date(),
      },
    });

    return result;
  }

  private validateMergeRequest(request: MergeRequest): string[] {
    const errors: string[] = [];
    if (!request.files || request.files.length === 0) errors.push('At least one file is required');
    if (!request.outputName || request.outputName.trim().length === 0) errors.push('Output name is required');

    let totalSize = 0;
    for (const file of request.files) {
      if (!fs.existsSync(file.filePath)) {
        errors.push(`File not found: ${file.filePath}`);
        continue;
      }
      const stat = fs.statSync(file.filePath);
      totalSize += stat.size;

      if (file.pageRange) {
        if (file.pageRange.start < 1) errors.push(`${file.displayName}: start page must be >= 1`);
        if (file.pageRange.end < file.pageRange.start) errors.push(`${file.displayName}: end page must be >= start page`);
      }
    }

    if (totalSize > this.MAX_FILE_SIZE_MB * 1024 * 1024) {
      errors.push(`Total file size exceeds ${this.MAX_FILE_SIZE_MB}MB limit`);
    }

    return errors;
  }

  private formatPageNumber(page: number, format: string): string {
    switch (format) {
      case 'roman': {
        const romanNumerals: [number, string][] = [
          [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
          [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
          [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
        ];
        let result = '';
        let remaining = page;
        for (const [value, numeral] of romanNumerals) {
          while (remaining >= value) {
            result += numeral;
            remaining -= value;
          }
        }
        return result.toLowerCase();
      }
      case 'alpha': {
        let result = '';
        let remaining = page;
        while (remaining > 0) {
          remaining -= 1;
          result = String.fromCharCode(65 + (remaining % 26)) + result;
          remaining = Math.floor(remaining / 26);
        }
        return result;
      }
      default:
        return String(page);
    }
  }

  private estimatePageCount(content: Buffer, mimeType: string): number {
    if (mimeType === 'application/pdf') {
      const text = content.toString('latin1');
      const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
      return pageMatches ? pageMatches.length : 1;
    }
    return Math.max(1, Math.ceil(content.length / (3000 * 80)));
  }

  async splitDocument(request: SplitRequest): Promise<SplitResult> {
    const startTime = Date.now();
    const outputFiles: SplitResult['outputFiles'] = [];

    if (!fs.existsSync(request.filePath)) {
      throw new Error(`File not found: ${request.filePath}`);
    }

    const fileContent = fs.readFileSync(request.filePath);
    const totalPages = this.estimatePageCount(fileContent, 'application/pdf');
    const outputDir = `/tmp/split_${Date.now()}`;
    fs.mkdirSync(outputDir, { recursive: true });

    let ranges: { start: number; end: number; name: string }[] = [];

    if (request.splitMode === 'by_page') {
      for (let i = 1; i <= totalPages; i++) {
        ranges.push({ start: i, end: i, name: `page_${i}` });
      }
    } else if (request.splitMode === 'by_range' && request.ranges) {
      ranges = request.ranges.map((r, idx) => ({
        start: r.start,
        end: r.end,
        name: r.name || `part_${idx + 1}`,
      }));
    } else if (request.splitMode === 'by_size' && request.maxSizeMb) {
      const maxBytes = request.maxSizeMb * 1024 * 1024;
      const avgPageSize = fileContent.length / totalPages;
      const pagesPerChunk = Math.max(1, Math.floor(maxBytes / avgPageSize));

      for (let start = 1; start <= totalPages; start += pagesPerChunk) {
        const end = Math.min(start + pagesPerChunk - 1, totalPages);
        ranges.push({ start, end, name: `chunk_${Math.ceil(start / pagesPerChunk)}` });
      }
    }

    for (const range of ranges) {
      const doc = new PDFDocument({ autoFirstPage: false });
      const outputName = `${range.name}.pdf`;
      const outputPath = path.join(outputDir, outputName);
      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      const pageCount = range.end - range.start + 1;
      for (let p = range.start; p <= range.end; p++) {
        doc.addPage({ size: 'A4' });
        doc.fontSize(12).font('Helvetica');
        doc.text(`[Content from original document, Page ${p}]`, 50, 50);
      }

      doc.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      const stats = fs.statSync(outputPath);
      outputFiles.push({
        path: outputPath,
        name: outputName,
        pageCount,
        size: stats.size,
      });
    }

    const result: SplitResult = {
      id: `split_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
      outputFiles,
      totalPages,
      processingTimeMs: Date.now() - startTime,
    };

    await this.prisma.splitOperation.create({
      data: {
        fileId: request.fileId,
        splitMode: request.splitMode,
        outputFileCount: outputFiles.length,
        totalPages,
        processingTimeMs: result.processingTimeMs,
        userId: request.userId,
        createdAt: new Date(),
      },
    });

    return result;
  }

  async reorderPages(request: PageReorderRequest): Promise<MergeResult> {
    const startTime = Date.now();

    if (!fs.existsSync(request.filePath)) {
      throw new Error(`File not found: ${request.filePath}`);
    }

    const content = fs.readFileSync(request.filePath);
    const totalPages = this.estimatePageCount(content, 'application/pdf');

    for (const pageNum of request.newOrder) {
      if (pageNum < 1 || pageNum > totalPages) {
        throw new Error(`Page number ${pageNum} is out of range (1-${totalPages})`);
      }
    }

    if (new Set(request.newOrder).size !== request.newOrder.length) {
      throw new Error('Duplicate page numbers in reorder request');
    }

    const outputPath = `/tmp/reordered_${Date.now()}.pdf`;
    const doc = new PDFDocument({ autoFirstPage: false });
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    for (const pageNum of request.newOrder) {
      doc.addPage({ size: 'A4' });
      doc.fontSize(12).font('Helvetica');
      doc.text(`[Original Page ${pageNum}]`, 50, 50);
    }

    doc.end();
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const stats = fs.statSync(outputPath);
    const result: MergeResult = {
      id: `reorder_${Date.now()}`,
      outputPath,
      outputSize: stats.size,
      pageCount: request.newOrder.length,
      sourceFileCount: 1,
      bookmarks: [],
      processingTimeMs: Date.now() - startTime,
      createdAt: new Date(),
    };

    return result;
  }

  async assembleDocument(assembly: AssemblyDocument, outputFormat: 'pdf'): Promise<MergeResult> {
    const startTime = Date.now();
    const sortedSections = [...assembly.sections].sort((a, b) => a.order - b.order);

    const outputPath = `/tmp/assembly_${Date.now()}_${assembly.name}.pdf`;
    const doc = new PDFDocument({ autoFirstPage: false });
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    const bookmarks: BookmarkEntry[] = [];
    let pageCount = 0;

    const tocSections = sortedSections.filter(s => s.includeInToc);
    if (tocSections.length > 0) {
      doc.addPage({ size: 'A4' });
      pageCount += 1;

      doc.fontSize(22).font('Helvetica-Bold');
      doc.text(assembly.name, { align: 'center' });
      doc.moveDown(2);

      doc.fontSize(18).font('Helvetica-Bold');
      doc.text('Table of Contents', { align: 'center' });
      doc.moveDown(1);

      for (const section of tocSections) {
        doc.fontSize(12).font('Helvetica');
        doc.text(`${section.title}`, 72, doc.y, { continued: true });
        doc.text('', { align: 'right' });
        doc.moveDown(0.3);
      }
    }

    for (const section of sortedSections) {
      doc.addPage({ size: 'A4' });
      pageCount += 1;

      bookmarks.push({
        title: section.title,
        page: pageCount,
        level: 0,
      });

      doc.fontSize(20).font('Helvetica-Bold');
      doc.text(section.title);
      doc.moveDown(1);

      if (section.content) {
        doc.fontSize(12).font('Helvetica').fillColor('#333333');
        doc.text(section.content, {
          align: 'left',
          lineGap: 4,
          paragraphGap: 8,
        });
      } else if (section.sourceFileId) {
        const file = await this.prisma.file.findUnique({
          where: { id: section.sourceFileId },
        });

        if (file) {
          doc.fontSize(12).font('Helvetica').fillColor('#333333');
          doc.text(`[Content from: ${file.name}]`);

          if (section.sourcePageRange) {
            doc.text(`Pages ${section.sourcePageRange.start} - ${section.sourcePageRange.end}`);
          }
        }
      }

      doc.save();
      doc.fontSize(9).font('Helvetica').fillColor('#999999');
      doc.text(String(pageCount), 0, doc.page.height - 40, { width: doc.page.width, align: 'center' });
      doc.restore();
    }

    doc.end();
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const stats = fs.statSync(outputPath);

    const result: MergeResult = {
      id: `asm_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
      outputPath,
      outputSize: stats.size,
      pageCount,
      sourceFileCount: sortedSections.filter(s => s.sourceFileId).length,
      bookmarks,
      processingTimeMs: Date.now() - startTime,
      createdAt: new Date(),
    };

    await this.prisma.mergeOperation.create({
      data: {
        outputPath,
        outputSize: stats.size,
        pageCount,
        sourceFileCount: result.sourceFileCount,
        bookmarks: JSON.stringify(bookmarks),
        processingTimeMs: result.processingTimeMs,
        userId: assembly.createdBy,
        createdAt: new Date(),
      },
    });

    return result;
  }

  async createArchive(
    files: { path: string; name: string }[],
    outputName: string,
  ): Promise<{ archivePath: string; size: number }> {
    const outputPath = `/tmp/archive_${Date.now()}_${outputName}.zip`;
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    for (const file of files) {
      if (fs.existsSync(file.path)) {
        archive.file(file.path, { name: file.name });
      }
    }

    await archive.finalize();

    await new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });

    const stats = fs.statSync(outputPath);
    return { archivePath: outputPath, size: stats.size };
  }

  async processBatchMerge(
    groups: { name: string; files: MergeFileInput[] }[],
    options: MergeOptions,
    outputFormat: 'pdf',
    userId: string,
  ): Promise<BatchMergeJob> {
    const job: BatchMergeJob = {
      id: `batch_${Date.now()}_${crypto.randomUUID().split('-')[0]}`,
      groups,
      options,
      outputFormat,
      status: 'processing',
      progress: 0,
      results: [],
      userId,
    };

    for (let i = 0; i < groups.length; i++) {
      try {
        const result = await this.mergePdfDocuments({
          files: groups[i].files,
          outputFormat,
          outputName: groups[i].name,
          options,
          userId,
        });
        job.results.push(result);
      } catch (err) {
        job.results.push({
          id: `error_${i}`,
          outputPath: '',
          outputSize: 0,
          pageCount: 0,
          sourceFileCount: groups[i].files.length,
          bookmarks: [],
          processingTimeMs: 0,
          createdAt: new Date(),
        });
      }

      job.progress = Math.round(((i + 1) / groups.length) * 100);
    }

    job.status = 'completed';
    return job;
  }

  async generateBookmarks(filePath: string): Promise<BookmarkEntry[]> {
    const content = fs.readFileSync(filePath);
    const totalPages = this.estimatePageCount(content, 'application/pdf');
    const bookmarks: BookmarkEntry[] = [];

    for (let page = 1; page <= totalPages; page++) {
      bookmarks.push({
        title: `Page ${page}`,
        page,
        level: 0,
      });
    }

    if (totalPages > 10) {
      const chapterSize = Math.ceil(totalPages / 5);
      const chapters: BookmarkEntry[] = [];
      for (let i = 0; i < 5; i++) {
        const startPage = i * chapterSize + 1;
        if (startPage > totalPages) break;
        chapters.push({
          title: `Section ${i + 1}`,
          page: startPage,
          level: 0,
          children: bookmarks
            .filter(b => b.page >= startPage && b.page < startPage + chapterSize)
            .map(b => ({ ...b, level: 1 })),
        });
      }
      return chapters;
    }

    return bookmarks;
  }
}
