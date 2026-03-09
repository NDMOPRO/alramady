import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { compareCreateSchema, compareUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/advanced-compare';

const router = Router();

// GET /api/v1/governance/compare - List all comparisons
router.get('/', authMiddleware, controller.list);

// GET /api/v1/governance/compare/:id - Get comparison by ID
router.get('/:id', authMiddleware, controller.getById);

// POST /api/v1/governance/compare - Create comparison
router.post('/', authMiddleware, validate(compareCreateSchema), controller.create);

// PUT /api/v1/governance/compare/:id - Update comparison
router.put('/:id', authMiddleware, validate(compareUpdateSchema), controller.update);

// DELETE /api/v1/governance/compare/:id - Delete comparison
router.delete('/:id', authMiddleware, controller.remove);

export default router;
