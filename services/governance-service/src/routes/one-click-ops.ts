import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { oneClickOpCreateSchema, oneClickOpUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/one-click-ops';

const router = Router();

// GET /api/v1/governance/one-click - List all one-click operations
router.get('/', authMiddleware, controller.list);

// GET /api/v1/governance/one-click/:id - Get one-click operation by ID
router.get('/:id', authMiddleware, controller.getById);

// POST /api/v1/governance/one-click - Create one-click operation
router.post('/', authMiddleware, validate(oneClickOpCreateSchema), controller.create);

// PUT /api/v1/governance/one-click/:id - Update one-click operation
router.put('/:id', authMiddleware, validate(oneClickOpUpdateSchema), controller.update);

// DELETE /api/v1/governance/one-click/:id - Delete one-click operation
router.delete('/:id', authMiddleware, controller.remove);

export default router;
