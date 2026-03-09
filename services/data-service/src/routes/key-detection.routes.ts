import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { KeyDetectionService } from '../services/key-detection.service';
import { logger } from '../utils/logger';

const router = Router();
const keyDetectionService = new KeyDetectionService();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const detectPKSchema = z.object({
  datasetId: z.string().uuid(),
});

const detectFKSchema = z.object({
  datasetId: z.string().uuid(),
  otherDatasetIds: z.array(z.string().uuid()).min(1).max(20),
});

const relationshipMapSchema = z.object({
  datasetIds: z.array(z.string().uuid()).min(2).max(20),
});

router.post(
  '/primary-keys',
  authMiddleware,
  tenantMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { datasetId } = detectPKSchema.parse(req.body);
    const tenantId = req.tenant!.tenantId;

    logger.info('API: Detect primary keys', { datasetId, tenantId });

    const candidates = await keyDetectionService.detectPrimaryKeys(datasetId, tenantId);

    res.json({ success: true, data: candidates });
  })
);

router.post(
  '/foreign-keys',
  authMiddleware,
  tenantMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { datasetId, otherDatasetIds } = detectFKSchema.parse(req.body);
    const tenantId = req.tenant!.tenantId;

    logger.info('API: Detect foreign keys', { datasetId, otherDatasetIds, tenantId });

    const candidates = await keyDetectionService.detectForeignKeys(datasetId, otherDatasetIds, tenantId);

    res.json({ success: true, data: candidates });
  })
);

router.post(
  '/relationship-map',
  authMiddleware,
  tenantMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { datasetIds } = relationshipMapSchema.parse(req.body);
    const tenantId = req.tenant!.tenantId;

    logger.info('API: Build relationship map', { datasetIds, tenantId });

    const graph = await keyDetectionService.buildRelationshipMap(datasetIds, tenantId);

    res.json({ success: true, data: graph });
  })
);

export default router;
