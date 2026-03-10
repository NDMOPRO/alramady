import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { DataCatalogService } from '../services/data-catalog.service';
import { prisma } from '../utils/prisma';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';

const router = Router();
const esClient = new ElasticsearchClient({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
});
const service = new DataCatalogService(prisma, esClient);

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

const RegisterDatasetBody = z.object({
  name: z.string().min(1).max(500),
  description: z.string().max(2000).default(''),
  sourceType: z.enum(['database', 'file', 'api', 'stream']),
  sourceConnection: z.string().min(1),
  schema: z.array(z.object({
    name: z.string().min(1),
    dataType: z.string().min(1),
    nullable: z.boolean().default(true),
    isPrimaryKey: z.boolean().default(false),
    isForeignKey: z.boolean().default(false),
    foreignKeyRef: z.object({ table: z.string(), column: z.string() }).optional(),
    description: z.string().default(''),
    sampleValues: z.array(z.unknown()).default([]),
    statistics: z.object({
      distinctCount: z.number().default(0),
      nullCount: z.number().default(0),
    }).default({ distinctCount: 0, nullCount: 0 }),
  })),
  tags: z.array(z.string()).default([]),
  category: z.string().default(''),
  rowCount: z.number().int().default(0),
  sizeBytes: z.number().int().default(0),
  format: z.string().default(''),
});

router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const body = RegisterDatasetBody.parse(req.body);
  const { userId, tenantId } = req.tenant!;
  const result = await service.registerDataset({ ...body, owner: userId, tenantId } as Parameters<typeof service.registerDataset>[0]);
  res.status(201).json({ success: true, data: result });
}));

router.get('/search', asyncHandler(async (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const category = req.query.category as string | undefined;
  const sourceType = req.query.sourceType as string | undefined;
  const tagsRaw = req.query.tags as string | undefined;
  const tags = tagsRaw ? tagsRaw.split(',') : undefined;
  const minQuality = req.query.minQuality ? parseFloat(req.query.minQuality as string) : undefined;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;

  const result = await service.searchCatalog(query, { category, sourceType, tags, minQuality }, page, pageSize);
  res.json({ success: true, data: result });
}));

router.get('/:id/metadata', asyncHandler(async (req: Request, res: Response) => {
  const result = await service.extractMetadata(req.params.id!);
  res.json({ success: true, data: result });
}));

router.get('/:id/dictionary', asyncHandler(async (req: Request, res: Response) => {
  const result = await service.generateDataDictionary(req.params.id!);
  res.json({ success: true, data: result });
}));

router.get('/:id/usage', asyncHandler(async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;
  const result = await service.getUsageStatistics(req.params.id!, days);
  res.json({ success: true, data: result });
}));

router.post('/:id/tags', asyncHandler(async (req: Request, res: Response) => {
  const { tags } = z.object({ tags: z.array(z.string().min(1)) }).parse(req.body);
  const result = await service.addTags(req.params.id!, tags);
  res.json({ success: true, data: result });
}));

router.delete('/:id/tags', asyncHandler(async (req: Request, res: Response) => {
  const { tags } = z.object({ tags: z.array(z.string().min(1)) }).parse(req.body);
  const result = await service.removeTags(req.params.id!, tags);
  res.json({ success: true, data: result });
}));

router.post('/:id/lineage', asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({
    columnName: z.string().min(1),
    upstreamSource: z.object({
      datasetId: z.string().uuid(),
      columnName: z.string().min(1),
      transformationType: z.string().min(1),
    }),
  }).parse(req.body);
  const result = await service.trackColumnLineage(req.params.id!, body.columnName, body.upstreamSource);
  res.json({ success: true, data: result });
}));

router.post('/:id/schema-impact', asyncHandler(async (req: Request, res: Response) => {
  const { changes } = z.object({
    changes: z.array(z.object({
      type: z.enum(['add', 'remove', 'modify']),
      columnName: z.string().min(1),
      newType: z.string().optional(),
    })),
  }).parse(req.body);
  const result = await service.analyzeSchemaChangeImpact(req.params.id!, changes);
  res.json({ success: true, data: result });
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await service.deleteDataset(req.params.id!);
  res.json({ success: true, message: 'Dataset removed from catalog' });
}));

export default router;
