import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { permissionCreateSchema, permissionUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/permissions-security';

const router = Router();

// GET /api/v1/governance/permissions - List all permissions
router.get('/', authMiddleware, controller.list);

// GET /api/v1/governance/permissions/:id - Get permission by ID
router.get('/:id', authMiddleware, controller.getById);

// POST /api/v1/governance/permissions - Create permission
router.post('/', authMiddleware, validate(permissionCreateSchema), controller.create);

// PUT /api/v1/governance/permissions/:id - Update permission
router.put('/:id', authMiddleware, validate(permissionUpdateSchema), controller.update);

// DELETE /api/v1/governance/permissions/:id - Delete permission
router.delete('/:id', authMiddleware, controller.remove);

export default router;
