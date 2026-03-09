import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { aiContentCreateSchema, aiContentUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/ai-content';

const router = Router();

// CRUD endpoints
router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(aiContentCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(aiContentUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

// Module-specific endpoints
router.post('/:id/generate', authMiddleware, controller.generate);
router.post('/:id/regenerate', authMiddleware, controller.regenerate);
router.post('/:id/refine', authMiddleware, controller.refine);
router.get('/:id/suggestions', authMiddleware, controller.suggestImprovements);

export default router;
