import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { LayoutIntelligenceService } from '../services/layout-intelligence.service.js';

const router = Router();
const prisma = new PrismaClient();
const layoutService = new LayoutIntelligenceService(prisma);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Layout Analysis ──────────────────────────────────────────────────────────

const layoutAnalysisSchema = z.object({
  sourceType: z.enum(['image', 'pdf', 'html', 'docx', 'pptx', 'xlsx', 'screenshot']),
  sourceId: z.string().min(1),
  options: z.object({
    detectFonts: z.boolean().optional(),
    detectCharts: z.boolean().optional(),
    detectTables: z.boolean().optional(),
    detectKpis: z.boolean().optional(),
    extractText: z.boolean().optional(),
    maxDepth: z.number().min(1).max(10).optional(),
    targetDpi: z.number().min(72).max(600).optional(),
  }).optional(),
});

router.post(
  '/layout/analyze',
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    const body = layoutAnalysisSchema.parse(req.body);

    const result = await layoutService.analyzeLayout({
      imageBuffer: req.file.buffer,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      options: body.options,
    });

    res.json({ success: true, data: result });
  }),
);

// ─── Font Recognition ─────────────────────────────────────────────────────────

router.post(
  '/layout/fonts',
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    const meta = await require('sharp')(req.file.buffer).metadata();
    const dataUri = `data:image/png;base64,${req.file.buffer.toString('base64')}`;

    const result = await layoutService.recognizeFonts(
      dataUri,
      meta.width || 1920,
      meta.height || 1080,
    );

    res.json({ success: true, data: result });
  }),
);

// ─── Multi-page Analysis ──────────────────────────────────────────────────────

router.post(
  '/layout/analyze-multipage',
  upload.array('pages', 100),
  asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'At least one page image is required' });
      return;
    }

    const body = layoutAnalysisSchema.parse(req.body);
    const pageBuffers = files.map((f) => f.buffer);

    const result = await layoutService.analyzeMultiPageDocument(
      pageBuffers,
      body.sourceType,
      body.sourceId,
      body.options,
    );

    res.json({ success: true, data: result });
  }),
);

export default router;
