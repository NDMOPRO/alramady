import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { auditCreateSchema, auditUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/audit-replay';

const router = Router();

// GET /api/v1/governance/audit - List all audit logs
router.get('/', authMiddleware, controller.list);

// GET /api/v1/governance/audit/:id - Get audit log by ID
router.get('/:id', authMiddleware, controller.getById);

// POST /api/v1/governance/audit - Create audit log
router.post('/', authMiddleware, validate(auditCreateSchema), controller.create);

// PUT /api/v1/governance/audit/:id - Update audit log
router.put('/:id', authMiddleware, validate(auditUpdateSchema), controller.update);

// DELETE /api/v1/governance/audit/:id - Delete audit log
router.delete('/:id', authMiddleware, controller.remove);

export default router;
