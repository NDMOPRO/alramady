import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  analyzeImage,
  extractColorPalette,
  extractText,
  extractLayout,
  extractCharts,
  compareImages,
  calculateSSIM,
} from '../services/visual-analyzer.service.js';
import {
  replicateDocument,
  replicateDashboard,
  replicatePresentation,
  scoreFidelity,
  generateDiffReport,
  suggestImprovements,
} from '../services/replica-builder.service.js';

const router = Router();
const prisma = new PrismaClient();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 2,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/tiff', 'image/bmp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: ${allowedMimes.join(', ')}`));
    }
  },
});

const replicateDocumentSchema = z.object({
  analysis: z.object({
    layout: z.any(),
    colors: z.array(z.string()).optional().default([]),
    fonts: z.array(z.string()).optional().default([]),
    textContent: z.array(z.any()).optional().default([]),
    charts: z.array(z.any()).optional().default([]),
    dataTables: z.array(z.any()).optional().default([]),
    dimensions: z.object({
      width: z.number(),
      height: z.number(),
    }),
    timestamp: z.string(),
  }),
  targetFormat: z.enum(['pdf', 'docx', 'pptx']),
});

const replicateDashboardSchema = z.object({
  analysis: z.object({
    layout: z.any(),
    colors: z.array(z.string()).optional().default([]),
    fonts: z.array(z.string()).optional().default([]),
    textContent: z.array(z.any()).optional().default([]),
    charts: z.array(z.any()).optional().default([]),
    dataTables: z.array(z.any()).optional().default([]),
    dimensions: z.object({
      width: z.number(),
      height: z.number(),
    }),
    timestamp: z.string(),
  }),
});

const replicatePresentationSchema = z.object({
  analysis: z.object({
    layout: z.any(),
    colors: z.array(z.string()).optional().default([]),
    fonts: z.array(z.string()).optional().default([]),
    textContent: z.array(z.any()).optional().default([]),
    charts: z.array(z.any()).optional().default([]),
    dataTables: z.array(z.any()).optional().default([]),
    dimensions: z.object({
      width: z.number(),
      height: z.number(),
    }),
    timestamp: z.string(),
  }),
});

const suggestParamsSchema = z.object({
  id: z.string().uuid(),
});

const jobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  targetFormat: z.string().optional(),
});

const jobParamsSchema = z.object({
  id: z.string().uuid(),
});

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// POST /analyze - Analyze an uploaded image
router.post(
  '/analyze',
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

    const analysis = await analyzeImage(req.file.buffer);

    res.status(200).json({
      success: true,
      data: analysis,
      metadata: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
  })
);

// POST /extract/colors - Extract color palette from image
router.post(
  '/extract/colors',
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

    const colors = await extractColorPalette(req.file.buffer);

    res.status(200).json({
      success: true,
      data: { colors, count: colors.length },
      metadata: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
  })
);

// POST /extract/text - Extract text from image
router.post(
  '/extract/text',
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

    const textBlocks = await extractText(req.file.buffer);

    res.status(200).json({
      success: true,
      data: { textBlocks, count: textBlocks.length },
      metadata: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
  })
);

// POST /extract/layout - Extract layout from image
router.post(
  '/extract/layout',
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

    const layout = await extractLayout(req.file.buffer);

    res.status(200).json({
      success: true,
      data: layout,
      metadata: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
  })
);

// POST /extract/charts - Extract charts from image
router.post(
  '/extract/charts',
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

    const charts = await extractCharts(req.file.buffer);

    res.status(200).json({
      success: true,
      data: { charts, count: charts.length },
      metadata: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
  })
);

// POST /compare - Compare two images pixel by pixel
router.post(
  '/compare',
  authMiddleware,
  upload.fields([
    { name: 'original', maxCount: 1 },
    { name: 'replica', maxCount: 1 },
  ]),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files?.original?.[0] || !files?.replica?.[0]) {
      res.status(400).json({
        success: false,
        error: 'Both "original" and "replica" image files are required.',
        code: 'MISSING_IMAGES',
      });
      return;
    }

    const originalBuffer = files.original[0].buffer;
    const replicaBuffer = files.replica[0].buffer;

    const comparison = await compareImages(originalBuffer, replicaBuffer);

    const diffBase64 = comparison.diffImageBuffer.toString('base64');

    res.status(200).json({
      success: true,
      data: {
        similarityScore: comparison.similarityScore,
        pixelDiffCount: comparison.pixelDiffCount,
        totalPixels: comparison.totalPixels,
        matchPercentage: comparison.matchPercentage,
        dimensions: comparison.dimensions,
        diffImage: `data:image/png;base64,${diffBase64}`,
      },
      metadata: {
        original: {
          name: files.original[0].originalname,
          size: files.original[0].size,
        },
        replica: {
          name: files.replica[0].originalname,
          size: files.replica[0].size,
        },
      },
    });
  })
);

// POST /ssim - Calculate SSIM between two images
router.post(
  '/ssim',
  authMiddleware,
  upload.fields([
    { name: 'original', maxCount: 1 },
    { name: 'replica', maxCount: 1 },
  ]),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files?.original?.[0] || !files?.replica?.[0]) {
      res.status(400).json({
        success: false,
        error: 'Both "original" and "replica" image files are required.',
        code: 'MISSING_IMAGES',
      });
      return;
    }

    const originalBuffer = files.original[0].buffer;
    const replicaBuffer = files.replica[0].buffer;

    const ssimScore = await calculateSSIM(originalBuffer, replicaBuffer);

    res.status(200).json({
      success: true,
      data: {
        ssim: ssimScore,
        ssimPercentage: Math.round(ssimScore * 10000) / 100,
        interpretation: ssimScore > 0.95
          ? 'Excellent match'
          : ssimScore > 0.85
            ? 'Good match'
            : ssimScore > 0.70
              ? 'Moderate match'
              : 'Poor match',
      },
      metadata: {
        original: {
          name: files.original[0].originalname,
          size: files.original[0].size,
        },
        replica: {
          name: files.replica[0].originalname,
          size: files.replica[0].size,
        },
      },
    });
  })
);

// POST /replicate/document - Replicate a document from analysis
router.post(
  '/replicate/document',
  authMiddleware,
  validate(replicateDocumentSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { analysis, targetFormat } = req.body;
    const tenantId = req.user!.organizationId || req.user!.userId || 'default';
    const userId = req.user!.userId || 'anonymous';

    const job = await replicateDocument(analysis, targetFormat, tenantId, userId);

    res.status(201).json({
      success: true,
      data: job,
    });
  })
);

// POST /replicate/dashboard - Replicate a dashboard from analysis
router.post(
  '/replicate/dashboard',
  authMiddleware,
  validate(replicateDashboardSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { analysis } = req.body;
    const tenantId = req.user!.organizationId || req.user!.userId || 'default';
    const userId = req.user!.userId || 'anonymous';

    const job = await replicateDashboard(analysis, tenantId, userId);

    res.status(201).json({
      success: true,
      data: job,
    });
  })
);

// POST /replicate/presentation - Replicate a presentation from analysis
router.post(
  '/replicate/presentation',
  authMiddleware,
  validate(replicatePresentationSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { analysis } = req.body;
    const tenantId = req.user!.organizationId || req.user!.userId || 'default';
    const userId = req.user!.userId || 'anonymous';

    const job = await replicatePresentation(analysis, tenantId, userId);

    res.status(201).json({
      success: true,
      data: job,
    });
  })
);

// POST /score - Calculate fidelity score between two images
router.post(
  '/score',
  authMiddleware,
  upload.fields([
    { name: 'original', maxCount: 1 },
    { name: 'replica', maxCount: 1 },
  ]),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files?.original?.[0] || !files?.replica?.[0]) {
      res.status(400).json({
        success: false,
        error: 'Both "original" and "replica" image files are required.',
        code: 'MISSING_IMAGES',
      });
      return;
    }

    const originalBuffer = files.original[0].buffer;
    const replicaBuffer = files.replica[0].buffer;

    const fidelityScore = await scoreFidelity(originalBuffer, replicaBuffer);

    res.status(200).json({
      success: true,
      data: fidelityScore,
      metadata: {
        original: {
          name: files.original[0].originalname,
          size: files.original[0].size,
        },
        replica: {
          name: files.replica[0].originalname,
          size: files.replica[0].size,
        },
      },
    });
  })
);

// POST /diff-report - Generate detailed diff report between two images
router.post(
  '/diff-report',
  authMiddleware,
  upload.fields([
    { name: 'original', maxCount: 1 },
    { name: 'replica', maxCount: 1 },
  ]),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files?.original?.[0] || !files?.replica?.[0]) {
      res.status(400).json({
        success: false,
        error: 'Both "original" and "replica" image files are required.',
        code: 'MISSING_IMAGES',
      });
      return;
    }

    const originalBuffer = files.original[0].buffer;
    const replicaBuffer = files.replica[0].buffer;

    const report = await generateDiffReport(originalBuffer, replicaBuffer);

    const diffBase64 = report.pixelComparison.diffImageBuffer.toString('base64');

    res.status(200).json({
      success: true,
      data: {
        ...report,
        pixelComparison: {
          ...report.pixelComparison,
          diffImageBuffer: undefined,
          diffImage: `data:image/png;base64,${diffBase64}`,
        },
      },
      metadata: {
        original: {
          name: files.original[0].originalname,
          size: files.original[0].size,
        },
        replica: {
          name: files.replica[0].originalname,
          size: files.replica[0].size,
        },
      },
    });
  })
);

// POST /suggest/:id - Suggest improvements for a replication job
router.post(
  '/suggest/:id',
  authMiddleware,
  validate(suggestParamsSchema, 'params'),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;
    const comparison = req.body;

    if (!comparison || Object.keys(comparison).length === 0) {
      res.status(400).json({
        success: false,
        error: 'Comparison data is required in request body.',
        code: 'MISSING_COMPARISON',
      });
      return;
    }

    const suggestions = await suggestImprovements(id, comparison);

    res.status(200).json({
      success: true,
      data: {
        replicaId: id,
        ...suggestions,
      },
    });
  })
);

// GET /jobs - List replication jobs
router.get(
  '/jobs',
  authMiddleware,
  validate(jobsQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { page, limit, status, targetFormat } = req.query as Record<string, string | undefined>;
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    const tenantId = req.user!.organizationId || req.user!.userId || 'default';

    const whereClause: Record<string, unknown> = { tenantId };
    if (status) {
      whereClause.status = status;
    }
    if (targetFormat) {
      whereClause.targetFormat = targetFormat;
    }

    const [jobs, totalCount] = await Promise.all([
      prisma.replicationJob.findMany({
        where: whereClause,
        skip: offset,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.replicationJob.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      success: true,
      data: jobs.map((job: Record<string, unknown>) => ({
        id: job.id,
        tenantId: job.tenantId,
        userId: job.userId,
        status: job.status,
        targetFormat: job.targetFormat,
        elementCount: job.elementCount,
        sourceDimensions: job.sourceDimensions,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrevious: pageNum > 1,
      },
    });
  })
);

// GET /jobs/:id - Get a specific replication job
router.get(
  '/jobs/:id',
  authMiddleware,
  validate(jobParamsSchema, 'params'),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;
    const tenantId = req.user!.organizationId || req.user!.userId || 'default';

    const job = await prisma.replicationJob.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!job) {
      res.status(404).json({
        success: false,
        error: `Replication job not found: ${id}`,
        code: 'JOB_NOT_FOUND',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: job.id,
        tenantId: job.tenantId,
        userId: job.userId,
        status: job.status,
        targetFormat: job.targetFormat,
        documentStructure: job.documentStructure,
        elementCount: job.elementCount,
        sourceDimensions: job.sourceDimensions,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  })
);

export default router;
