import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  multimodalExtractionService,
  MultimodalBlockedError,
} from '../services/multimodal-extraction.service.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const multimodalSchema = z.object({
  mode: z.enum(['exact', 'steps', 'both']).optional().default('both'),
  languageHint: z.enum(['auto', 'ar', 'en']).optional().default('auto'),
});

router.post(
  '/multimodal/extract',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'FILE_REQUIRED' });
      return;
    }

    const body = multimodalSchema.parse(req.body || {});
    const includeStructuredSteps = body.mode !== 'exact';
    const result = await multimodalExtractionService.extract(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      body.languageHint,
      includeStructuredSteps,
    );

    if (body.mode === 'steps' && result.structuredSteps) {
      res.json({
        success: true,
        data: {
          inputType: result.inputType,
          filename: result.filename,
          structuredSteps: result.structuredSteps,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: result,
    });
  }),
);

router.post(
  '/ocr/extract',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'IMAGE_REQUIRED' });
      return;
    }

    const body = z.object({
      language: z.enum(['auto', 'ar', 'en']).optional().default('auto'),
    }).parse(req.body || {});

    const exact = await multimodalExtractionService.extractExact(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      body.language,
      'image',
    );

    res.json({
      success: true,
      data: {
        engine: exact.sourceEngine,
        language: exact.language,
        fullText: exact.text,
        metadata: exact.metadata,
      },
    });
  }),
);

router.post(
  '/ocr/arabic',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'IMAGE_REQUIRED' });
      return;
    }

    const exact = await multimodalExtractionService.extractExact(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'ar',
      'image',
    );

    res.json({
      success: true,
      data: {
        engine: exact.sourceEngine,
        language: exact.language,
        textDirection: 'rtl',
        fullText: exact.text,
        metadata: exact.metadata,
      },
    });
  }),
);

router.post(
  '/document/pdf-analyze',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'FILE_REQUIRED' });
      return;
    }

    const exact = await multimodalExtractionService.extractExact(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'auto',
      'pdf',
    );

    res.json({
      success: true,
      data: {
        analysis: {
          isPdf: true,
          searchable: exact.text.length > 0,
          hasScannedPages: exact.text.length === 0,
          extractedTextLength: exact.text.length,
          metadata: exact.metadata,
        },
        extractedText: exact.text,
        processingEngine: exact.sourceEngine,
      },
    });
  }),
);

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof MultimodalBlockedError) {
    res.status(501).json({
      success: false,
      error: error.code,
      message: error.message,
    });
    return;
  }

  next(error);
});

export default router;
