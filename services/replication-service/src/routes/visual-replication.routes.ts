import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { VisualReplicationService } from '../services/visual-replication.service.js';

const router = Router();
const visualReplicationService = new VisualReplicationService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
    files: 50, // Up to 50 files for multi-slide presentations
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/tiff',
      'image/bmp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: ${allowedMimes.join(', ')}`));
    }
  },
});

const analyzeQuerySchema = z.object({
  sourceType: z.enum([
    'dashboard',
    'report',
    'presentation',
    'pdf',
    'screenshot',
    'infographic',
    'slide',
  ]).optional().default('screenshot'),
});

const reconstructDashboardSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

const reconstructPresentationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

const reconstructReportSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// POST /visual-replication/analyze - Analyze an uploaded image
router.post(
  '/visual-replication/analyze',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'Image file is required. Upload with field name "image".',
        code: 'MISSING_IMAGE',
      });
      return;
    }

    const queryResult = analyzeQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        code: 'VALIDATION_ERROR',
        details: queryResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    const { sourceType } = queryResult.data;
    const result = await visualReplicationService.analyzeVisual(req.file.buffer, sourceType);

    res.status(200).json({
      success: true,
      data: {
        analysis: result.analysis,
        elements: result.elements,
        metadata: result.metadata,
      },
      fileInfo: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        sourceType,
      },
    });
  })
);

// POST /visual-replication/reconstruct/dashboard - Reconstruct a dashboard from image
router.post(
  '/visual-replication/reconstruct/dashboard',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'Dashboard image is required. Upload with field name "image".',
        code: 'MISSING_IMAGE',
      });
      return;
    }

    const tenantId = req.user?.organizationId || req.user?.tenantId || req.user?.userId || 'default';
    const userId = req.user?.userId || 'anonymous';

    const result = await visualReplicationService.reconstructDashboard(
      req.file.buffer,
      tenantId,
      userId
    );

    res.status(201).json({
      success: true,
      data: {
        dashboardId: result.dashboardId,
        metadata: result.metadata,
      },
      fileInfo: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
  })
);

// POST /visual-replication/reconstruct/presentation - Reconstruct presentation from images
router.post(
  '/visual-replication/reconstruct/presentation',
  authMiddleware,
  upload.array('images', 50),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: 'At least one slide image is required. Upload with field name "images".',
        code: 'MISSING_IMAGES',
      });
      return;
    }

    const tenantId = req.user?.organizationId || req.user?.tenantId || req.user?.userId || 'default';
    const userId = req.user?.userId || 'anonymous';

    const imageBuffers = files
      .sort((a, b) => {
        const nameA = a.originalname.toLowerCase();
        const nameB = b.originalname.toLowerCase();
        return nameA.localeCompare(nameB, undefined, { numeric: true });
      })
      .map((f) => f.buffer);

    const result = await visualReplicationService.reconstructPresentation(
      imageBuffers,
      tenantId,
      userId
    );

    res.status(201).json({
      success: true,
      data: {
        presentationId: result.presentationId,
        metadata: result.metadata,
      },
      fileInfo: {
        fileCount: files.length,
        files: files.map((f) => ({
          originalName: f.originalname,
          mimeType: f.mimetype,
          size: f.size,
        })),
      },
    });
  })
);

// POST /visual-replication/reconstruct/report - Reconstruct report from images
router.post(
  '/visual-replication/reconstruct/report',
  authMiddleware,
  upload.array('images', 100),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: 'At least one report page image is required. Upload with field name "images".',
        code: 'MISSING_IMAGES',
      });
      return;
    }

    const tenantId = req.user?.organizationId || req.user?.tenantId || req.user?.userId || 'default';
    const userId = req.user?.userId || 'anonymous';

    const imageBuffers = files
      .sort((a, b) => {
        const nameA = a.originalname.toLowerCase();
        const nameB = b.originalname.toLowerCase();
        return nameA.localeCompare(nameB, undefined, { numeric: true });
      })
      .map((f) => f.buffer);

    const result = await visualReplicationService.reconstructReport(
      imageBuffers,
      tenantId,
      userId
    );

    res.status(201).json({
      success: true,
      data: {
        reportId: result.reportId,
        metadata: result.metadata,
      },
      fileInfo: {
        fileCount: files.length,
        files: files.map((f) => ({
          originalName: f.originalname,
          mimeType: f.mimetype,
          size: f.size,
        })),
      },
    });
  })
);

// POST /visual-replication/compare - Compare original vs reconstructed
router.post(
  '/visual-replication/compare',
  authMiddleware,
  upload.fields([
    { name: 'original', maxCount: 1 },
    { name: 'reconstructed', maxCount: 1 },
  ]),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files?.original?.[0] || !files?.reconstructed?.[0]) {
      res.status(400).json({
        success: false,
        error: 'Both "original" and "reconstructed" image files are required.',
        code: 'MISSING_IMAGES',
      });
      return;
    }

    const originalBuffer = files.original[0].buffer;
    const reconstructedBuffer = files.reconstructed[0].buffer;

    const result = await visualReplicationService.compareReconstruction(
      originalBuffer,
      reconstructedBuffer
    );

    res.status(200).json({
      success: true,
      data: {
        pixelDiff: result.pixelDiff,
        structuralFingerprint: result.structuralFingerprint,
        ssim: result.ssim,
        passed: result.passed,
        diffImage: `data:image/png;base64,${result.diffImageBase64}`,
        dimensions: result.dimensions,
        totalPixels: result.totalPixels,
        mismatchedPixels: result.mismatchedPixels,
        passCriteria: {
          maxPixelDiff: 0.1,
          minStructuralFingerprint: 0.999,
        },
      },
      fileInfo: {
        original: {
          name: files.original[0].originalname,
          size: files.original[0].size,
        },
        reconstructed: {
          name: files.reconstructed[0].originalname,
          size: files.reconstructed[0].size,
        },
      },
    });
  })
);

// POST /visual-replication/fingerprint - Generate structural fingerprint
router.post(
  '/visual-replication/fingerprint',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'Image file is required. Upload with field name "image".',
        code: 'MISSING_IMAGE',
      });
      return;
    }

    const fingerprint = await visualReplicationService.generateStructuralFingerprint(req.file.buffer);

    res.status(200).json({
      success: true,
      data: {
        fingerprint,
        algorithm: 'sobel-edge-dct-perceptual-hash',
        standardSize: 64,
        hashComponents: {
          structuralHash: fingerprint.split('-')[0],
          intensityDistribution: fingerprint.split('-')[1],
        },
      },
      fileInfo: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
  })
);

export default router;
