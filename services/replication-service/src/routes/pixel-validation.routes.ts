import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { PixelValidationLoopService } from '../services/pixel-validation-loop.service.js';
import { QualityValidationService } from '../services/quality-validation.service.js';
import { FontRecognitionService } from '../services/font-recognition.service.js';

const router = Router();
const prisma = new PrismaClient();
const pixelService = new PixelValidationLoopService(prisma);
const qualityService = new QualityValidationService(prisma);
const fontService = new FontRecognitionService(prisma);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Pixel Comparison (single comparison, no loop) ──────────────────────────

router.post(
  '/pixel/compare',
  upload.fields([
    { name: 'source', maxCount: 1 },
    { name: 'generated', maxCount: 1 },
  ]),
  asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as { source?: Express.Multer.File[]; generated?: Express.Multer.File[] };
    if (!files.source?.[0] || !files.generated?.[0]) {
      res.status(400).json({ error: 'Both source and generated images are required' });
      return;
    }

    const result = await pixelService.compareImages(
      files.source[0].buffer,
      files.generated[0].buffer,
    );

    res.json({
      success: true,
      data: {
        pixelDiff: result.pixelDiffCount,
        totalPixels: result.totalPixels,
        diffPercentage: result.pixelDiffPercentage,
        ssim: result.ssim,
        lpips: result.lpips,
        isPerfect: result.pixelDiffCount === 0,
        hotspots: result.hotspots,
      },
    });
  }),
);

// ─── Pixel Validation Loop (full enforcement: PixelDiff == 0 or diagnostic) ─

const validationLoopSchema = z.object({
  maxIterations: z.number().min(1).max(100).optional(),
});

router.post(
  '/pixel/validate-loop',
  upload.fields([
    { name: 'source', maxCount: 1 },
    { name: 'generated', maxCount: 1 },
  ]),
  asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as { source?: Express.Multer.File[]; generated?: Express.Multer.File[] };
    if (!files.source?.[0] || !files.generated?.[0]) {
      res.status(400).json({ error: 'Both source and generated images are required' });
      return;
    }

    const body = validationLoopSchema.parse(req.body);
    const layoutGraph = req.body.layoutGraph ? JSON.parse(req.body.layoutGraph) : null;

    if (!layoutGraph) {
      res.status(400).json({ error: 'layoutGraph is required' });
      return;
    }

    const result = await pixelService.runValidationLoop({
      sourceImage: files.source[0].buffer,
      generatedImage: files.generated[0].buffer,
      layoutGraph,
      maxIterations: body.maxIterations ?? 50,
    });

    res.json({
      success: result.isPerfect,
      data: result,
    });
  }),
);

// ─── Quality Validation ─────────────────────────────────────────────────────

router.post(
  '/quality/validate',
  upload.fields([
    { name: 'sourceImage', maxCount: 1 },
    { name: 'generatedImage', maxCount: 1 },
  ]),
  asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as {
      sourceImage?: Express.Multer.File[];
      generatedImage?: Express.Multer.File[];
    };

    const sourceGraph = req.body.sourceGraph ? JSON.parse(req.body.sourceGraph) : null;
    const generatedGraph = req.body.generatedGraph ? JSON.parse(req.body.generatedGraph) : null;

    if (!sourceGraph || !generatedGraph) {
      res.status(400).json({ error: 'sourceGraph and generatedGraph are required' });
      return;
    }

    const result = await qualityService.validate({
      sourceGraph,
      generatedGraph,
      sourceImage: files.sourceImage?.[0]?.buffer || null,
      generatedImage: files.generatedImage?.[0]?.buffer || null,
    });

    res.json({ success: true, data: result });
  }),
);

// ─── Font Recognition ───────────────────────────────────────────────────────

router.post(
  '/fonts/recognize',
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    const result = await fontService.recognizeFonts({
      imageBuffer: req.file.buffer,
    });

    res.json({ success: true, data: result });
  }),
);

export default router;
