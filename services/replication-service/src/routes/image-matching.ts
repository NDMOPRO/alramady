import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { imageMatchingCreateSchema, imageMatchingUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/image-matching';

const router = Router();

router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(imageMatchingCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(imageMatchingUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

export default router;
