import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { integrationCreateSchema, integrationUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/integration';

const router = Router();

// CRUD endpoints
router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(integrationCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(integrationUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

// Module-specific endpoints
router.post('/:id/test', authMiddleware, controller.testConnection);
router.post('/:id/sync', authMiddleware, controller.syncNow);
router.get('/:id/webhook-logs', authMiddleware, controller.getWebhookLogs);

export default router;
