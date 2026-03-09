import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import { validate, uuidParamSchema } from '../middleware/validation';
import { DistributionService } from '../services/distribution.service';

const prisma = new PrismaClient();
const distributionService = new DistributionService(prisma);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

const router = Router();

// GET / - list distribution configs (by reportId query param)
router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const reportId = req.query.reportId as string;
  const where: Record<string, unknown> = {};
  if (reportId) {
    where.reportId = reportId;
  }
  const configs = await prisma.distributionConfig.findMany({ where });
  res.json({ success: true, data: configs });
}));

// POST / - create distribution config
router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const result = await distributionService.createDistribution(req.body);
  res.status(201).json({ success: true, data: result });
}));

// GET /:id - get distribution config
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const config = await prisma.distributionConfig.findUnique({ where: { id: req.params.id } });
  if (!config) {
    res.status(404).json({ success: false, error: 'Distribution config not found', code: 'NOT_FOUND' });
    return;
  }
  res.json({ success: true, data: config });
}));

// DELETE /:id - delete distribution config
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  await distributionService.deleteDistributionConfig(req.params.id);
  res.json({ success: true, message: 'Distribution config deleted successfully' });
}));

// POST /:id/send - distribute report
router.post('/:id/send', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await distributionService.distributeReport(req.params.id);
  res.json({ success: true, data: result });
}));

// GET /:id/history - get distribution history
router.get('/:id/history', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const result = await distributionService.getDistributionHistory(req.params.id, { limit, offset: (page - 1) * limit });
  res.json({ success: true, data: result });
}));

// GET /:id/analytics - get distribution analytics
router.get('/:id/analytics', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;
  const result = await distributionService.getDistributionAnalytics(req.params.id, days);
  res.json({ success: true, data: result });
}));

// POST /track/:trackingId - track read receipt
router.post('/track/:trackingId', asyncHandler(async (req: Request, res: Response) => {
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  await distributionService.trackReadReceipt(req.params.trackingId, ipAddress, userAgent);
  res.json({ success: true, message: 'Read receipt tracked' });
}));

// POST /:id/verify-access - verify access
router.post('/:id/verify-access', asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const result = await distributionService.verifyAccess(req.params.id, password);
  res.json({ success: true, data: result });
}));

export default router;
