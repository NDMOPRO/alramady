import { Router } from 'express';
import { formulaV2Controller } from '../controllers/formula-v2.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { z } from 'zod';

const router = Router();

// Validation schemas
const callFunctionSchema = z.object({
  args: z.array(z.any()).default([]),
  context: z.record(z.any()).optional(),
});

const batchEvalSchema = z.object({
  formulas: z.array(z.object({
    id: z.string(),
    expression: z.string(),
    context: z.record(z.any()).optional(),
  })).min(1).max(1000),
});

const nlToFormulaSchema = z.object({
  text: z.string().min(1).max(2000),
  context: z.object({
    columns: z.array(z.string()).optional(),
    sampleData: z.array(z.any()).optional(),
    sheetName: z.string().optional(),
  }).optional(),
});

const formulaToNlSchema = z.object({
  formula: z.string().min(1).max(5000),
  locale: z.string().default('ar'),
});

const daxGenerateSchema = z.object({
  formula: z.string().min(1),
  context: z.object({
    tableName: z.string().optional(),
    columns: z.array(z.string()).optional(),
  }).optional(),
});

const lookmlGenerateSchema = z.object({
  structure: z.object({
    tableName: z.string(),
    columns: z.array(z.object({
      name: z.string(),
      type: z.string(),
    })),
  }),
});

const convertDateSchema = z.object({
  value: z.union([z.string(), z.number()]),
  fromFormat: z.string(),
  toFormat: z.string(),
  calendar: z.enum(['gregorian', 'hijri']).optional(),
});

const convertCurrencySchema = z.object({
  amount: z.number(),
  from: z.string().length(3),
  to: z.string().length(3),
  rate: z.number().positive().optional(),
});

// Routes
router.use(authMiddleware);

router.post('/functions/:name', validate(callFunctionSchema), (req, res, next) => formulaV2Controller.callFunction(req, res, next));
router.get('/functions', (req, res, next) => formulaV2Controller.listFunctions(req, res, next));
router.post('/evaluate-batch', validate(batchEvalSchema), (req, res, next) => formulaV2Controller.evaluateBatch(req, res, next));
router.post('/optimize/:id/:sheet', (req, res, next) => formulaV2Controller.optimizeFormulas(req, res, next));
router.post('/errors/:id/:sheet', (req, res, next) => formulaV2Controller.detectErrors(req, res, next));
router.post('/extract-logic/:id', (req, res, next) => formulaV2Controller.extractBusinessLogic(req, res, next));
router.post('/nl-to-formula', validate(nlToFormulaSchema), (req, res, next) => formulaV2Controller.nlToFormula(req, res, next));
router.post('/formula-to-nl', validate(formulaToNlSchema), (req, res, next) => formulaV2Controller.formulaToNl(req, res, next));
router.post('/dax-generate', validate(daxGenerateSchema), (req, res, next) => formulaV2Controller.generateDAX(req, res, next));
router.post('/lookml-generate', validate(lookmlGenerateSchema), (req, res, next) => formulaV2Controller.generateLookML(req, res, next));
router.post('/convert-date', validate(convertDateSchema), (req, res, next) => formulaV2Controller.convertDate(req, res, next));
router.post('/convert-currency', validate(convertCurrencySchema), (req, res, next) => formulaV2Controller.convertCurrency(req, res, next));

export default router;
