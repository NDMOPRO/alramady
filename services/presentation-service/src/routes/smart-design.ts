import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { smartDesignCreateSchema, smartDesignUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/smart-design';

const router = Router();

// CRUD endpoints
router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(smartDesignCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(smartDesignUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

// Module-specific endpoints
router.post('/:id/apply/:presentationId', authMiddleware, controller.applyDesign);
router.get('/suggestions/:presentationId', authMiddleware, controller.suggestDesigns);
router.post('/analyze-brand/:brandGuideId', authMiddleware, controller.analyzeBrand);

export default router;
