import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { NlQueryEngineService } from '../services/nl-query-engine.service';
import { prisma } from '../utils/prisma';

const router = Router();
const service = new NlQueryEngineService(prisma);

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// ─── Zod Schemas ──────────────────────────────────────────────────

const NlQuerySchema = z.object({
  question: z.string().min(1).max(2000),
  datasetId: z.string().uuid(),
});

const SuggestQueriesParams = z.object({
  datasetId: z.string().uuid(),
});

const ExplainResultsSchema = z.object({
  query: z.string().min(1).max(2000),
  results: z.array(z.record(z.unknown())).min(1).max(500),
});

// ─── Routes ────────────────────────────────────────────────────────

/**
 * POST /nl-query/ask
 * Ask a natural language question about a dataset
 */
router.post('/ask', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { question, datasetId } = NlQuerySchema.parse(req.body);
  const result = await service.query(question, datasetId, tenantId);
  res.json({ success: true, data: result });
}));

/**
 * GET /nl-query/suggest/:datasetId
 * Get suggested queries for a dataset
 */
router.get('/suggest/:datasetId', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { datasetId } = SuggestQueriesParams.parse(req.params);
  const suggestions = await service.suggestQueries(datasetId, tenantId);
  res.json({ success: true, data: suggestions });
}));

/**
 * POST /nl-query/explain
 * Explain query results in natural language (Arabic)
 */
router.post('/explain', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { query, results } = ExplainResultsSchema.parse(req.body);
  const explanation = await service.explainResults(query, results, tenantId);
  res.json({ success: true, data: explanation });
}));

export default router;
