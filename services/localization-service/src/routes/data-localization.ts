import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { dataLocalizationCreateSchema, dataLocalizationUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/data-localization';

const router = Router();

router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(dataLocalizationCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(dataLocalizationUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

export default router;
