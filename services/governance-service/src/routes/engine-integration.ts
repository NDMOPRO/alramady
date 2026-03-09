import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { integrationCreateSchema, integrationUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/engine-integration';

const router = Router();

// GET /api/v1/governance/integration - List all integrations
router.get('/', authMiddleware, controller.list);

// GET /api/v1/governance/integration/:id - Get integration by ID
router.get('/:id', authMiddleware, controller.getById);

// POST /api/v1/governance/integration - Create integration
router.post('/', authMiddleware, validate(integrationCreateSchema), controller.create);

// PUT /api/v1/governance/integration/:id - Update integration
router.put('/:id', authMiddleware, validate(integrationUpdateSchema), controller.update);

// DELETE /api/v1/governance/integration/:id - Delete integration
router.delete('/:id', authMiddleware, controller.remove);

export default router;
