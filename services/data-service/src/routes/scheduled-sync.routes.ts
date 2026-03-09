import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { ScheduledSyncService } from '../services/scheduled-sync.service';
import { prisma } from '../utils/prisma';

const router = Router();
const service = new ScheduledSyncService(prisma);

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

const ScheduleBody = z.object({
  sourceId: z.string().uuid(),
  frequency: z.enum(['hourly', 'daily', 'weekly']),
});

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { sourceId, frequency } = ScheduleBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.scheduleSync(sourceId, frequency, tenantId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/:sourceId/execute', asyncHandler(async (req: Request, res: Response) => {
  const result = await service.executeSyncJob(req.params.sourceId);
  res.json({ success: true, data: result });
}));

router.get('/:sourceId/logs', asyncHandler(async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const result = await service.getSyncLogs(req.params.sourceId, limit);
  res.json({ success: true, data: result });
}));

router.post('/:sourceId/pause', asyncHandler(async (req: Request, res: Response) => {
  await service.pauseSync(req.params.sourceId);
  res.json({ success: true, message: 'Sync paused' });
}));

router.post('/:sourceId/resume', asyncHandler(async (req: Request, res: Response) => {
  await service.resumeSync(req.params.sourceId);
  res.json({ success: true, message: 'Sync resumed' });
}));

export default router;
