import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { KnowledgeGraphService } from '../services/knowledge-graph.service';
import { prisma } from '../utils/prisma';

const router = Router();
const service = new KnowledgeGraphService(prisma);

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

router.post('/build', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const result = await service.buildGraph(tenantId);
  res.status(201).json({ success: true, data: result });
}));

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const result = await service.getGraph(tenantId);
  res.json({ success: true, data: result });
}));

router.get('/related/:fileId', asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getRelatedFiles(req.params.fileId);
  res.json({ success: true, data: result });
}));

router.get('/clusters', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const result = await service.detectClusters(tenantId);
  res.json({ success: true, data: result });
}));

const AddNodeBody = z.object({
  entityId: z.string().min(1),
  entityType: z.string().min(1),
  metadata: z.record(z.unknown()),
});

router.post('/nodes', asyncHandler(async (req: Request, res: Response) => {
  const { entityId, entityType, metadata } = AddNodeBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.addNode(tenantId, entityId, entityType, metadata);
  res.status(201).json({ success: true, data: result });
}));

const AddEdgeBody = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  relationship: z.string().min(1),
  weight: z.number().min(0).max(1),
});

router.post('/edges', asyncHandler(async (req: Request, res: Response) => {
  const { fromId, toId, relationship, weight } = AddEdgeBody.parse(req.body);
  const result = await service.addEdge(fromId, toId, relationship, weight);
  res.status(201).json({ success: true, data: result });
}));

export default router;
