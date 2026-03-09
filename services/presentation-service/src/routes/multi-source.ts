import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { multiSourceCreateSchema, multiSourceUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/multi-source';

const router = Router();

// CRUD endpoints
router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(multiSourceCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(multiSourceUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

// Module-specific endpoints
router.post('/:id/import', authMiddleware, controller.importFromSource);
router.post('/:id/sync', authMiddleware, controller.syncSource);
router.get('/:id/preview', authMiddleware, controller.previewSource);

export default router;
