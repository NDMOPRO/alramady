import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { languageIntelligenceCreateSchema, languageIntelligenceUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/language-intelligence';

const router = Router();

router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(languageIntelligenceCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(languageIntelligenceUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

export default router;
