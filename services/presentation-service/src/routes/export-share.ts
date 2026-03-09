import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { exportShareCreateSchema, exportShareUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/export-share';

const router = Router();

// CRUD endpoints
router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(exportShareCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(exportShareUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

// Module-specific endpoints
router.get('/:id/download', authMiddleware, controller.getDownloadUrl);
router.get('/:id/share-link', authMiddleware, controller.getShareLink);
router.post('/:id/revoke', authMiddleware, controller.revokeShare);

export default router;
