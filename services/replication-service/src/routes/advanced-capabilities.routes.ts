import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { LargeImageProcessor } from '../services/large-image-processor.service.js';
import { PDFIntelligenceService } from '../services/pdf-intelligence.service.js';
import { ArabicLocalizationService } from '../services/arabic-localization.service.js';

const router = Router();
const largeImageProcessor = new LargeImageProcessor();
const pdfService = new PDFIntelligenceService();
const arabicService = new ArabicLocalizationService(process.env.OPENAI_API_KEY);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB for large images
});

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Large Image Processing ─────────────────────────────────────────────────

const largeImageSchema = z.object({
  maxTileSize: z.number().min(256).max(8192).optional(),
  overlapPixels: z.number().min(0).max(256).optional(),
  maxMemoryMB: z.number().min(64).max(4096).optional(),
  previewScale: z.number().min(0.05).max(1.0).optional(),
});

router.post(
  '/large-image/process',
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    const options = largeImageSchema.parse(req.body);

    const result = await largeImageProcessor.processLargeImage({
      imageBuffer: req.file.buffer,
      options,
    });

    res.json({
      success: true,
      data: {
        originalDimensions: result.originalDimensions,
        tileGrid: result.tileGrid,
        tileCount: result.tiles.length,
        processingTimeMs: result.processingTimeMs,
        peakMemoryMB: result.peakMemoryMB,
        tiles: result.tiles.map((t) => ({
          id: t.id,
          row: t.row,
          column: t.column,
          bbox: t.bbox,
          hash: t.hash,
          sizeBytes: t.buffer.length,
        })),
      },
    });
  }),
);

router.post(
  '/large-image/check',
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    const result = await largeImageProcessor.isLargeImage(req.file.buffer);
    res.json({ success: true, data: result });
  }),
);

router.post(
  '/large-image/multi-scale',
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    const options = largeImageSchema.parse(req.body);
    const analysis = await largeImageProcessor.multiScaleAnalyze(req.file.buffer, {
      maxTileSize: options.maxTileSize ?? 2048,
      overlapPixels: options.overlapPixels ?? 64,
      maxMemoryMB: options.maxMemoryMB ?? 512,
      previewScale: options.previewScale ?? 0.25,
      outputFormat: 'png',
    });

    res.json({
      success: true,
      data: {
        preview: { scale: analysis.preview.scale, width: analysis.preview.width, height: analysis.preview.height, sizeBytes: analysis.preview.buffer.length },
        medium: analysis.medium ? { scale: analysis.medium.scale, width: analysis.medium.width, height: analysis.medium.height, sizeBytes: analysis.medium.buffer.length } : null,
        full: analysis.full,
      },
    });
  }),
);

// ─── PDF Intelligence ────────────────────────────────────────────────────────

router.post(
  '/pdf/process',
  upload.single('pdf'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'PDF file is required' });
      return;
    }

    const options = req.body.options ? JSON.parse(req.body.options) : undefined;

    const result = await pdfService.processPDF({
      pdfBuffer: req.file.buffer,
      options,
    });

    res.json({
      success: true,
      data: {
        metadata: result.metadata,
        pageCount: result.pages.length,
        embeddedFonts: result.embeddedFonts,
        processingTimeMs: result.processingTimeMs,
        pages: result.pages.map((p) => ({
          pageNumber: p.pageNumber,
          dimensions: p.dimensions,
          isScanned: p.isScanned,
          textElements: p.textLayer.length,
          vectorShapes: p.vectorShapes.length,
          rasterImages: p.rasterImages.length,
        })),
      },
    });
  }),
);

router.post(
  '/pdf/to-layout-graph',
  upload.single('pdf'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'PDF file is required' });
      return;
    }

    const result = await pdfService.processPDF({ pdfBuffer: req.file.buffer });
    const sourceHash = require('crypto').createHash('sha256').update(req.file.buffer).digest('hex');
    const graph = pdfService.convertToLayoutGraph(result, sourceHash);

    res.json({ success: true, data: graph });
  }),
);

// ─── Arabic Localization ─────────────────────────────────────────────────────

router.post(
  '/localize/arabic',
  asyncHandler(async (req: Request, res: Response) => {
    const { layoutGraph, sourceLanguage, options } = req.body;

    if (!layoutGraph) {
      res.status(400).json({ error: 'layoutGraph is required' });
      return;
    }

    const result = await arabicService.localizeLayout({
      layoutGraph,
      sourceLanguage: sourceLanguage || 'en',
      options,
    });

    res.json({ success: true, data: result });
  }),
);

export default router;
