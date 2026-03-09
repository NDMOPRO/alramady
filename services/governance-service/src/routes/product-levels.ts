import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { productLevelCreateSchema, productLevelUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/product-levels';

const router = Router();

// GET /api/v1/governance/product-levels - List all product levels
router.get('/', authMiddleware, controller.list);

// GET /api/v1/governance/product-levels/:id - Get product level by ID
router.get('/:id', authMiddleware, controller.getById);

// POST /api/v1/governance/product-levels - Create product level
router.post('/', authMiddleware, validate(productLevelCreateSchema), controller.create);

// PUT /api/v1/governance/product-levels/:id - Update product level
router.put('/:id', authMiddleware, validate(productLevelUpdateSchema), controller.update);

// DELETE /api/v1/governance/product-levels/:id - Delete product level
router.delete('/:id', authMiddleware, controller.remove);

export default router;
