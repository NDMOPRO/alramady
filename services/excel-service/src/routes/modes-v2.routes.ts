import { Router } from 'express';
import { modesV2Controller } from '../controllers/modes-v2.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { z } from 'zod';

const router = Router();

const detailLevelSchema = z.object({
  level: z.enum(['minimal', 'standard', 'detailed', 'full']),
});

const dragDropSchema = z.object({
  type: z.enum(['sheet', 'column', 'row']),
  sourceIndex: z.number().int().min(0),
  targetIndex: z.number().int().min(0),
  sheet: z.string().optional(),
});

router.use(authMiddleware);

router.post('/:id/one-button-format', (req, res, next) => modesV2Controller.oneButtonFormat(req, res, next));
router.post('/:id/detect-mode', (req, res, next) => modesV2Controller.detectMode(req, res, next));
router.get('/:id/features/:mode', (req, res, next) => modesV2Controller.getFeatures(req, res, next));
router.post('/:id/detail-level', validate(detailLevelSchema), (req, res, next) => modesV2Controller.setDetailLevel(req, res, next));
router.post('/:id/drag-drop', validate(dragDropSchema), (req, res, next) => modesV2Controller.dragDrop(req, res, next));

export default router;
