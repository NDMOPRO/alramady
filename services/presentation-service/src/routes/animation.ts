import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { animationCreateSchema, animationUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/animation';

const router = Router();

// CRUD endpoints
router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(animationCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(animationUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

// Module-specific endpoints
router.get('/:id/preview', authMiddleware, controller.preview);
router.post('/preset/:presentationId', authMiddleware, controller.applyPreset);
router.put('/reorder/:presentationId', authMiddleware, controller.reorder);

export default router;
