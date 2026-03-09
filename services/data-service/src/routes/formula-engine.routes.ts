import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { FormulaEngineService } from '../services/formula-engine.service';
import { prisma } from '../utils/prisma';

const router = Router();
const service = new FormulaEngineService(prisma);

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// ─── Zod Schemas ──────────────────────────────────────────────────

const EvaluateFormulaSchema = z.object({
  formula: z.string().min(1).max(5000),
  data: z.array(z.record(z.unknown())).min(1),
  rowIndex: z.number().int().min(0).optional(),
});

const CreateDerivedColumnSchema = z.object({
  datasetId: z.string().uuid(),
  name: z.string().min(1).max(500),
  formula: z.string().min(1).max(5000),
});

const EvaluateBatchSchema = z.object({
  formulas: z.array(z.object({
    formula: z.string().min(1).max(5000),
    rowIndex: z.number().int().min(0),
  })).min(1).max(10000),
  data: z.array(z.record(z.unknown())).min(1),
});

// ─── Routes ────────────────────────────────────────────────────────

/**
 * POST /formulas/evaluate
 * Evaluate a single formula against provided data
 */
router.post('/evaluate', asyncHandler(async (req: Request, res: Response) => {
  const { formula, data, rowIndex } = EvaluateFormulaSchema.parse(req.body);
  const result = service.evaluateFormula(formula, data, rowIndex);
  res.json({ success: true, data: result });
}));

/**
 * POST /formulas/derived-column
 * Create a computed/derived column on a dataset
 */
router.post('/derived-column', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { datasetId, name, formula } = CreateDerivedColumnSchema.parse(req.body);
  const result = await service.createDerivedColumn(datasetId, name, formula, tenantId);
  res.status(201).json({ success: true, data: result });
}));

/**
 * POST /formulas/evaluate-batch
 * Evaluate multiple formulas efficiently
 */
router.post('/evaluate-batch', asyncHandler(async (req: Request, res: Response) => {
  const { formulas, data } = EvaluateBatchSchema.parse(req.body);
  const result = service.evaluateBatch(formulas, data);
  res.json({ success: true, data: result });
}));

export default router;
