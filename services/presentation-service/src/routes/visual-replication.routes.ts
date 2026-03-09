import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { VisualReplicationService } from '../services/visual-replication.service.js';

const router = Router();
const service = new VisualReplicationService();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const ReplicateDesignBody = z.object({
  sourceImagePath: z.string().min(1, 'Source image path is required'),
  targetFormat: z.enum(['pptx', 'html', 'pdf']),
  options: z.object({
    fidelityLevel: z.enum(['exact', 'approximate', 'stylistic']).optional().default('approximate'),
    extractText: z.boolean().optional().default(true),
    preserveColors: z.boolean().optional().default(true),
    preserveFonts: z.boolean().optional().default(true),
  }).optional().default({}),
});

const CompareBody = z.object({
  replicationId: z.string().uuid('Valid replication ID is required'),
  originalImagePath: z.string().min(1, 'Original image path is required'),
});

const ExtractColorsBody = z.object({
  imagePath: z.string().min(1, 'Image path is required'),
  paletteSize: z.number().int().min(2).max(24).optional().default(8),
});

const DetectLayoutBody = z.object({
  imagePath: z.string().min(1, 'Image path is required'),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post(
  '/replicate',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = ReplicateDesignBody.parse(req.body);
    const tenantId = req.user?.organizationId || 'default';
    const userId = req.user?.userId || 'anonymous';

    const result = await service.replicateDesign({
      sourceImagePath: body.sourceImagePath,
      tenantId,
      userId,
      targetFormat: body.targetFormat,
      options: {
        fidelityLevel: body.options.fidelityLevel || 'approximate',
        extractText: body.options.extractText ?? true,
        preserveColors: body.options.preserveColors ?? true,
        preserveFonts: body.options.preserveFonts ?? true,
      },
    });

    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/replicate/compare',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { replicationId, originalImagePath } = CompareBody.parse(req.body);
    const result = await service.compareWithOriginal(replicationId, originalImagePath);
    res.json({ success: true, data: result });
  }),
);

router.post(
  '/replicate/colors',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { imagePath, paletteSize } = ExtractColorsBody.parse(req.body);
    const colors = await service.extractColorPalette(imagePath, paletteSize);
    res.json({ success: true, data: { colors, count: colors.length } });
  }),
);

router.post(
  '/replicate/layout',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { imagePath } = DetectLayoutBody.parse(req.body);
    const layout = await service.detectLayoutGrid(imagePath);
    res.json({ success: true, data: layout });
  }),
);

export default router;
