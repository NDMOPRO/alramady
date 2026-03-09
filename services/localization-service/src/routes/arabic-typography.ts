import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { arabicTypographyCreateSchema, arabicTypographyUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/arabic-typography';

const router = Router();

router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(arabicTypographyCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(arabicTypographyUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

export default router;
