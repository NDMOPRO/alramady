import { Request, Response, NextFunction } from 'express';
import { importService } from '../services/import.service';
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

function getImportMethod(ext: string): ((file: Buffer, filename: string, tenantId: string, userId: string, ...args: string[][]) => Promise<{ id: string; format: string; rowCount: number; [k: string]: unknown }>) | null {
  switch (ext) {
    case 'csv': case 'tsv': return importService.importCSV.bind(importService);
    case 'xls': case 'xlsx': case 'xlsm': case 'xlsb': return importService.importExcel.bind(importService);
    case 'json': case 'jsonl': case 'ndjson': return importService.importJSON.bind(importService);
    case 'xml': return importService.importXML.bind(importService);
    case 'pdf': return importService.importPDF.bind(importService);
    case 'txt': case 'log': case 'md': case 'rst': return importService.importTXT.bind(importService);
    case 'doc': case 'docx': case 'odt': return importService.importWord.bind(importService);
    case 'ppt': case 'pptx': case 'odp': return importService.importPresentation.bind(importService);
    case 'zip': case 'rar': case '7z': case 'gz': case 'tar': return importService.importCompressedFile.bind(importService);
    case 'jpg': case 'jpeg': case 'png': case 'tiff': case 'bmp': case 'webp': return importService.importDocumentImage.bind(importService);
    default: return null;
  }
}

export class ImportController {

  async listImports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      if (!tenantId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;

      const [datasets, total] = await Promise.all([
        prisma.dataset.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          select: {
            id: true, name: true, format: true, status: true,
            rowCount: true, columnCount: true, fileSize: true,
            createdAt: true, updatedAt: true,
          },
        }),
        prisma.dataset.count({ where: { tenantId } }),
      ]);

      res.json({
        success: true,
        data: datasets,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      next(error);
    }
  }

  async getImportStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      if (!tenantId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

      const dataset = await prisma.dataset.findFirst({
        where: { id: req.params.id!, tenantId },
      });

      if (!dataset) {
        res.status(404).json({ success: false, error: 'Dataset not found' });
        return;
      }

      res.json({ success: true, data: dataset });
    } catch (error) {
      next(error);
    }
  }

  async importFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      if (!tenantId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
      const importMethod = getImportMethod(ext);
      if (!importMethod) {
        res.status(400).json({ success: false, error: `Unsupported file format: ${ext}` });
        return;
      }

      const result = await importMethod(file.buffer, file.originalname, tenantId, userId);
      logger.info('File imported successfully', { datasetId: result.id, format: result.format, rows: result.rowCount });
      res.status(201).json({ success: true, data: result });
    } catch (error: unknown) {
      logger.error('Import failed', { error: error instanceof Error ? error.message : String(error) });
      next(error);
    }
  }

  async batchImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = (req as Request & { files?: Express.Multer.File[] }).files;
      if (!files || files.length === 0) {
        res.status(400).json({ success: false, error: 'No files uploaded' });
        return;
      }

      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      if (!tenantId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const results = await Promise.allSettled(
        files.map(async (file) => {
          const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
          const importMethod = getImportMethod(ext);
          if (!importMethod) throw new Error(`Unsupported format: ${ext}`);
          return importMethod(file.buffer, file.originalname, tenantId, userId);
        })
      );

      const summary = {
        total: results.length,
        succeeded: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length,
        results: results.map((r, i) => ({
          filename: files[i].originalname,
          status: r.status,
          data: r.status === 'fulfilled' ? r.value : undefined,
          error: r.status === 'rejected' ? (r as PromiseRejectedResult).reason?.message : undefined,
        })),
      };

      res.status(201).json({ success: true, data: summary });
    } catch (error: unknown) {
      next(error);
    }
  }

  async importFromURL(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { url, filename: customName } = req.body;
      if (!url || typeof url !== 'string') {
        res.status(400).json({ success: false, error: 'URL is required' });
        return;
      }

      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      if (!tenantId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: 500 * 1024 * 1024,
      });

      const contentDisposition = response.headers['content-disposition'] || '';
      const nameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const detectedName = nameMatch ? nameMatch[1].replace(/['"]/g, '') : url.split('/').pop()?.split('?')[0] || 'downloaded_file';
      const finalName = customName || detectedName;
      const ext = finalName.split('.').pop()?.toLowerCase() || '';

      const importMethod = getImportMethod(ext);
      if (!importMethod) {
        res.status(400).json({ success: false, error: `Cannot determine format from URL. Detected extension: ${ext}` });
        return;
      }

      const buffer = Buffer.from(response.data);
      const result = await importMethod(buffer, finalName, tenantId, userId);
      logger.info('URL import successful', { url, datasetId: result.id });
      res.status(201).json({ success: true, data: result });
    } catch (error: unknown) {
      logger.error('URL import failed', { error: error instanceof Error ? error.message : String(error) });
      next(error);
    }
  }

  async previewFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
      const supportedFormats = ['csv', 'tsv', 'xls', 'xlsx', 'xlsm', 'xlsb', 'json', 'jsonl', 'ndjson',
        'xml', 'pdf', 'txt', 'log', 'md', 'rst', 'doc', 'docx', 'odt',
        'ppt', 'pptx', 'odp', 'zip', 'rar', '7z', 'gz', 'tar',
        'jpg', 'jpeg', 'png', 'tiff', 'bmp', 'webp'];

      const isSupported = supportedFormats.includes(ext);

      const preview: Record<string, unknown> = {
        filename: file.originalname,
        size: file.size,
        sizeFormatted: file.size >= 1e6 ? `${(file.size / 1e6).toFixed(1)} MB` : `${(file.size / 1e3).toFixed(1)} KB`,
        mimeType: file.mimetype,
        extension: ext,
        isSupported,
        detectedType: detectFileCategory(ext),
      };

      if (isSupported && ['csv', 'tsv'].includes(ext)) {
        const text = file.buffer.toString('utf-8');
        const lines = text.split('\n').filter(l => l.trim());
        const separator = ext === 'tsv' ? '\t' : ',';
        const headers = lines[0]?.split(separator).map(h => h.trim().replace(/^"|"$/g, '')) || [];
        preview.headers = headers;
        preview.sampleRows = lines.slice(1, 6).map(l => l.split(separator).map(c => c.trim().replace(/^"|"$/g, '')));
        preview.estimatedRowCount = lines.length - 1;
        preview.columnCount = headers.length;
      }

      res.json({ success: true, data: preview });
    } catch (error: unknown) {
      next(error);
    }
  }
}

function detectFileCategory(ext: string): string {
  const categories: Record<string, string[]> = {
    'spreadsheet': ['csv', 'tsv', 'xls', 'xlsx', 'xlsm', 'xlsb'],
    'document': ['doc', 'docx', 'odt', 'pdf', 'txt', 'log', 'md', 'rst'],
    'presentation': ['ppt', 'pptx', 'odp'],
    'data': ['json', 'jsonl', 'ndjson', 'xml'],
    'archive': ['zip', 'rar', '7z', 'gz', 'tar'],
    'image': ['jpg', 'jpeg', 'png', 'tiff', 'bmp', 'webp'],
  };
  for (const [category, exts] of Object.entries(categories)) {
    if (exts.includes(ext)) return category;
  }
  return 'unknown';
}

export const importController = new ImportController();
