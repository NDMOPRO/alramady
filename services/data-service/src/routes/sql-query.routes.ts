import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { SqlQueryEngineService } from '../services/sql-query-engine.service';
import { prisma } from '../utils/prisma';

const router = Router();
const service = new SqlQueryEngineService(prisma);

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// ─── Zod Schemas ──────────────────────────────────────────────────

const ExecuteQuerySchema = z.object({
  sql: z.string().min(1).max(10000),
});

const ValidateQuerySchema = z.object({
  sql: z.string().min(1).max(10000),
});

const ExplainQuerySchema = z.object({
  sql: z.string().min(1).max(10000),
});

const SaveQuerySchema = z.object({
  name: z.string().min(1).max(500),
  sql: z.string().min(1).max(10000),
});

const DeleteQueryParams = z.object({
  queryId: z.string().uuid(),
});

// ─── Routes ────────────────────────────────────────────────────────

/**
 * POST /sql/execute
 * Execute a SQL query against tenant datasets
 */
router.post('/execute', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { sql } = ExecuteQuerySchema.parse(req.body);
  const result = await service.executeQuery(sql, tenantId);
  res.json({ success: true, data: result });
}));

/**
 * POST /sql/validate
 * Validate SQL syntax without executing
 */
router.post('/validate', asyncHandler(async (req: Request, res: Response) => {
  const { sql } = ValidateQuerySchema.parse(req.body);
  const result = service.validateQuery(sql);
  res.json({ success: true, data: result });
}));

/**
 * POST /sql/explain
 * Get query execution plan
 */
router.post('/explain', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { sql } = ExplainQuerySchema.parse(req.body);
  const result = await service.explainQuery(sql, tenantId);
  res.json({ success: true, data: result });
}));

/**
 * GET /sql/saved
 * List saved queries for the tenant
 */
router.get('/saved', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const queries = await service.getSavedQueries(tenantId);
  res.json({ success: true, data: queries });
}));

/**
 * POST /sql/saved
 * Save a query
 */
router.post('/saved', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = req.tenant!;
  const { name, sql } = SaveQuerySchema.parse(req.body);
  const saved = await service.saveQuery(name, sql, tenantId, userId);
  res.status(201).json({ success: true, data: saved });
}));

/**
 * DELETE /sql/saved/:queryId
 * Delete a saved query
 */
router.delete('/saved/:queryId', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { queryId } = DeleteQueryParams.parse(req.params);
  const result = await service.deleteQuery(queryId, tenantId);
  res.json({ success: true, data: result });
}));

export default router;
