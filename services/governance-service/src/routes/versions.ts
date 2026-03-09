import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { versionCreateSchema, versionUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/versions';

const router = Router();

// GET /api/v1/governance/versions - List all versions
router.get('/', authMiddleware, controller.list);

// GET /api/v1/governance/versions/:id - Get version by ID
router.get('/:id', authMiddleware, controller.getById);

// POST /api/v1/governance/versions - Create version
router.post('/', authMiddleware, validate(versionCreateSchema), controller.create);

// PUT /api/v1/governance/versions/:id - Update version
router.put('/:id', authMiddleware, validate(versionUpdateSchema), controller.update);

// DELETE /api/v1/governance/versions/:id - Delete version
router.delete('/:id', authMiddleware, controller.remove);

export default router;
