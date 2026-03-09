import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { SemanticDiscoveryService } from '../services/semantic-discovery.service';
import { logger } from '../utils/logger';

const router = Router();
const semanticDiscoveryService = new SemanticDiscoveryService();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const discoverRelationshipsSchema = z.object({
  datasetIds: z.array(z.string().uuid()).min(2).max(20),
});

const suggestDimensionsSchema = z.object({
  datasetId: z.string().uuid(),
});

const buildKnowledgeGraphSchema = z.object({
  datasetIds: z.array(z.string().uuid()).min(1).max(20),
});

router.post(
  '/relationships',
  authMiddleware,
  tenantMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { datasetIds } = discoverRelationshipsSchema.parse(req.body);
    const tenantId = req.tenant!.tenantId;

    logger.info('API: Discover semantic relationships', { datasetIds, tenantId });

    const relationships = await semanticDiscoveryService.discoverSemanticRelationships(datasetIds, tenantId);

    res.json({ success: true, data: relationships });
  })
);

router.post(
  '/dimensions',
  authMiddleware,
  tenantMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { datasetId } = suggestDimensionsSchema.parse(req.body);
    const tenantId = req.tenant!.tenantId;

    logger.info('API: Suggest dimensions', { datasetId, tenantId });

    const suggestion = await semanticDiscoveryService.suggestDimensions(datasetId, tenantId);

    res.json({ success: true, data: suggestion });
  })
);

router.post(
  '/knowledge-graph',
  authMiddleware,
  tenantMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { datasetIds } = buildKnowledgeGraphSchema.parse(req.body);
    const tenantId = req.tenant!.tenantId;

    logger.info('API: Build knowledge graph', { datasetIds, tenantId });

    const graph = await semanticDiscoveryService.buildKnowledgeGraph(datasetIds, tenantId);

    res.json({ success: true, data: graph });
  })
);

export default router;
