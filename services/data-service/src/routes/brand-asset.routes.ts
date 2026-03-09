import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { BrandAssetImportService } from '../services/brand-asset-import.service';

const router = Router();
const service = new BrandAssetImportService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
      'image/gif', 'application/pdf', 'application/octet-stream',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const ImportFigmaBody = z.object({
  figmaFileKey: z.string().min(1, 'Figma file key is required'),
  accessToken: z.string().min(1, 'Access token is required'),
});

const ImportCanvaBody = z.object({
  designId: z.string().min(1, 'Canva design ID is required'),
  accessToken: z.string().min(1, 'Access token is required'),
});

const ApplyBrandKitBody = z.object({
  targetId: z.string().min(1, 'Target ID is required'),
  targetType: z.enum(['dashboard', 'report', 'presentation']),
});

const SyncBrandAssetsBody = z.object({
  source: z.enum(['figma', 'canva']),
  config: z.object({
    fileKey: z.string().optional(),
    designId: z.string().optional(),
    accessToken: z.string().min(1, 'Access token is required'),
  }),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post('/import/figma', asyncHandler(async (req: Request, res: Response) => {
  const { figmaFileKey, accessToken } = ImportFigmaBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const userId = req.user!.userId;
  const result = await service.importFromFigma(figmaFileKey, accessToken, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/import/canva', asyncHandler(async (req: Request, res: Response) => {
  const { designId, accessToken } = ImportCanvaBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const userId = req.user!.userId;
  const result = await service.importFromCanva(designId, accessToken, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/extract', upload.array('files', 20), asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ success: false, error: 'At least one file is required', code: 'MISSING_FILES' });
    return;
  }
  const { tenantId } = req.tenant!;
  const userId = req.user!.userId;
  const assets = files.map((f) => ({
    type: f.mimetype,
    data: f.buffer,
    name: f.originalname,
  }));
  const result = await service.extractBrandKit(assets, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.get('/kit/:tenantId', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId;
  const result = await service.getBrandKit(tenantId);
  if (!result) {
    res.status(404).json({ success: false, error: 'No brand kit found for this tenant', code: 'NOT_FOUND' });
    return;
  }
  res.json({ success: true, data: result });
}));

router.post('/apply', asyncHandler(async (req: Request, res: Response) => {
  const { targetId, targetType } = ApplyBrandKitBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.applyBrandKit(targetId, targetType, tenantId);
  res.json({ success: true, data: result });
}));

router.post('/sync', asyncHandler(async (req: Request, res: Response) => {
  const { source, config } = SyncBrandAssetsBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.syncBrandAssets(tenantId, source, config);
  res.json({ success: true, data: result });
}));

export default router;
