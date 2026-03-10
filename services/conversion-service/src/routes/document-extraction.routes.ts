import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { DocumentExtractionEngineService } from '../services/document-extraction-engine.service.js';
import { PdfIntelligenceService } from '../services/pdf-intelligence.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const router = Router();
const prisma = new PrismaClient();
const extractionService = new DocumentExtractionEngineService(prisma);
const pdfService = new PdfIntelligenceService(prisma);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Document Extraction ──────────────────────────────────────────────────────

const extractionSchema = z.object({
  fileType: z.enum(['image', 'pdf_scanned', 'pdf_searchable', 'pdf_hybrid']).optional(),
  languages: z.array(z.string()).optional(),
  options: z.object({
    deskew: z.boolean().optional(),
    denoise: z.boolean().optional(),
    enhanceContrast: z.boolean().optional(),
    superResolution: z.boolean().optional(),
    targetDpi: z.number().optional(),
    extractTables: z.boolean().optional(),
    extractCharts: z.boolean().optional(),
    preserveReadingOrder: z.boolean().optional(),
    ocrEngine: z.enum(['tesseract', 'vision', 'hybrid']).optional(),
  }).optional(),
});

router.post(
  '/extract',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'File is required' });
      return;
    }

    const body = extractionSchema.parse(req.body);
    const tmpPath = path.join(os.tmpdir(), `rasid_extract_${Date.now()}_${req.file.originalname}`);
    await fs.writeFile(tmpPath, req.file.buffer);

    try {
      const result = await extractionService.extract({
        fileId: `upload_${Date.now()}`,
        filePath: tmpPath,
        fileType: body.fileType || 'image',
        languages: body.languages || ['ar', 'en'],
        options: body.options as any,
      });

      res.json({ success: true, data: result });
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
  }),
);

// ─── PDF Analysis ─────────────────────────────────────────────────────────────

const pdfAnalysisSchema = z.object({
  options: z.object({
    extractTextLayers: z.boolean().optional(),
    extractEmbeddedFonts: z.boolean().optional(),
    extractVectorGraphics: z.boolean().optional(),
    extractImages: z.boolean().optional(),
    detectPdfType: z.boolean().optional(),
    maxPages: z.number().optional(),
  }).optional(),
});

router.post(
  '/pdf/analyze',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'PDF file is required' });
      return;
    }

    const body = pdfAnalysisSchema.parse(req.body);
    const tmpPath = path.join(os.tmpdir(), `rasid_pdf_${Date.now()}.pdf`);
    await fs.writeFile(tmpPath, req.file.buffer);

    try {
      const result = await pdfService.analyzePdf({
        fileId: `upload_${Date.now()}`,
        filePath: tmpPath,
        options: body.options as any,
      });

      res.json({ success: true, data: result });
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
  }),
);

export default router;
