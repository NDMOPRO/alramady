import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { advancedEditCreateSchema, advancedEditUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/advanced-edit';

const router = Router();

// CRUD endpoints
router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(advancedEditCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(advancedEditUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

// Module-specific endpoints
router.post('/undo/:presentationId', authMiddleware, controller.undo);
router.post('/redo/:presentationId', authMiddleware, controller.redo);
router.post('/batch/:presentationId', authMiddleware, controller.batchEdit);

export default router;
