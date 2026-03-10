import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { ResumableUploadService } from '../services/resumable-upload.service';
import { prisma } from '../utils/prisma';

const router = Router();
const service = new ResumableUploadService(prisma);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

const InitUploadBody = z.object({
  fileName: z.string().min(1).max(500),
  fileSize: z.number().int().min(1),
  mimeType: z.string().min(1).max(200),
});

router.post('/init', asyncHandler(async (req: Request, res: Response) => {
  const { fileName, fileSize, mimeType } = InitUploadBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.initUpload(fileName, fileSize, mimeType, tenantId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/:uploadId/chunk/:chunkIndex', upload.single('chunk'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'Chunk data is required' });
    return;
  }
  const chunkIndex = parseInt(req.params.chunkIndex!, 10);
  const result = await service.uploadChunk(req.params.uploadId!, chunkIndex, req.file.buffer);
  res.json({ success: true, data: result });
}));

router.post('/:uploadId/finalize', asyncHandler(async (req: Request, res: Response) => {
  const filePath = await service.finalizeUpload(req.params.uploadId!);
  res.json({ success: true, data: { filePath } });
}));

router.get('/:uploadId/progress', asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getUploadProgress(req.params.uploadId!);
  res.json({ success: true, data: result });
}));

router.get('/:uploadId/resume', asyncHandler(async (req: Request, res: Response) => {
  const result = await service.resumeUpload(req.params.uploadId!);
  res.json({ success: true, data: result });
}));

router.post('/cleanup', asyncHandler(async (req: Request, res: Response) => {
  const maxAgeHours = parseInt(req.query.maxAgeHours as string) || 24;
  const count = await service.cleanupExpiredSessions(maxAgeHours);
  res.json({ success: true, data: { cleanedUp: count } });
}));

export default router;
