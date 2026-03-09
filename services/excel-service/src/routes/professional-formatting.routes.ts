import { Router } from 'express';
import { professionalFormattingController } from '../controllers/professional-formatting.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { z } from 'zod';

const router = Router();

const themeSchema = z.object({
  theme: z.enum([
    'corporate-blue', 'modern-green', 'elegant-gray', 'bold-red',
    'ocean-teal', 'sunset-orange', 'midnight-purple', 'nature-earth',
    'minimal-white', 'dark-professional',
  ]),
});

const brandSchema = z.object({
  name: z.string().min(1),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  accentColor: z.string(),
  fontFamily: z.string(),
  headerFontFamily: z.string().optional(),
  logoUrl: z.string().optional(),
});

const culturalSchema = z.object({
  sheet: z.string().min(1),
  range: z.string().min(1),
  locale: z.string().min(2),
  type: z.enum(['date', 'currency', 'number']).default('date'),
});

const rtlSchema = z.object({
  sheet: z.string().min(1),
});

const coverPageSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  date: z.string().optional(),
  organization: z.string().optional(),
  theme: z.string().optional(),
});

const convertToTableSchema = z.object({
  sheet: z.string().min(1),
  range: z.string().min(1),
  tableName: z.string().optional(),
});

const reorderSheetsSchema = z.object({
  order: z.array(z.number().int().min(0)),
});

const watermarkSchema = z.object({
  text: z.string().min(1).max(200),
});

router.use(authMiddleware);

router.post('/:id/one-button', (req, res, next) => professionalFormattingController.oneButtonFormat(req, res, next));
router.post('/:id/theme', validate(themeSchema), (req, res, next) => professionalFormattingController.applyTheme(req, res, next));
router.post('/:id/brand', validate(brandSchema), (req, res, next) => professionalFormattingController.applyBrand(req, res, next));
router.post('/:id/cultural', validate(culturalSchema), (req, res, next) => professionalFormattingController.applyCultural(req, res, next));
router.post('/:id/rtl', validate(rtlSchema), (req, res, next) => professionalFormattingController.applyRTL(req, res, next));
router.post('/:id/cover-page', validate(coverPageSchema), (req, res, next) => professionalFormattingController.generateCoverPage(req, res, next));
router.post('/:id/summary-page', (req, res, next) => professionalFormattingController.generateSummaryPage(req, res, next));
router.post('/:id/index-page', (req, res, next) => professionalFormattingController.generateIndexPage(req, res, next));
router.post('/:id/convert-to-table', validate(convertToTableSchema), (req, res, next) => professionalFormattingController.convertToTable(req, res, next));
router.post('/:id/accessibility-check', (req, res, next) => professionalFormattingController.accessibilityCheck(req, res, next));
router.post('/:id/design-validate', (req, res, next) => professionalFormattingController.designValidate(req, res, next));
router.get('/:id/cf/:sheet', (req, res, next) => professionalFormattingController.extractCF(req, res, next));
router.post('/:id/replicate-cf', (req, res, next) => professionalFormattingController.replicateCF(req, res, next));
router.post('/:id/rename-sheet', (req, res, next) => professionalFormattingController.renameSheet(req, res, next));
router.post('/:id/reorder-sheets', validate(reorderSheetsSchema), (req, res, next) => professionalFormattingController.reorderSheets(req, res, next));
router.post('/:id/watermark', validate(watermarkSchema), (req, res, next) => professionalFormattingController.applyWatermark(req, res, next));
router.post('/:id/export-theme', (req, res, next) => professionalFormattingController.exportTheme(req, res, next));
router.post('/:id/import-theme', (req, res, next) => professionalFormattingController.importTheme(req, res, next));

export default router;
