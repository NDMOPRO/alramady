import { Router } from 'express';
import { excelMatchingController } from '../controllers/excel-matching.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { z } from 'zod';

const router = Router();

const compareSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});

const replicateSchema = z.object({
  sourceId: z.string().uuid(),
});

const brandComplianceSchema = z.object({
  workbookId: z.string().uuid(),
  brand: z.object({
    name: z.string(),
    primaryColor: z.string(),
    secondaryColor: z.string(),
    accentColor: z.string(),
    fontFamily: z.string(),
    headerFontFamily: z.string().optional(),
    logo: z.string().optional(),
    watermark: z.string().optional(),
  }),
});

router.use(authMiddleware);

router.get('/:id/dimensions', (req, res, next) => excelMatchingController.extractDimensions(req, res, next));
router.get('/:id/structure', (req, res, next) => excelMatchingController.extractStructure(req, res, next));
router.get('/:id/fingerprint', (req, res, next) => excelMatchingController.getFingerprint(req, res, next));
router.post('/compare', validate(compareSchema), (req, res, next) => excelMatchingController.compareWorkbooks(req, res, next));
router.post('/match-score', validate(compareSchema), (req, res, next) => excelMatchingController.matchScore(req, res, next));
router.post('/replicate', validate(replicateSchema), (req, res, next) => excelMatchingController.replicateWorkbook(req, res, next));
router.post('/brand-compliance', validate(brandComplianceSchema), (req, res, next) => excelMatchingController.brandCompliance(req, res, next));

export default router;
