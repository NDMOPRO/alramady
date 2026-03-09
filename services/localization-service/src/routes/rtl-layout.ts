import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { rtlLayoutCreateSchema, rtlLayoutUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/rtl-layout';

const router = Router();

router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(rtlLayoutCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(rtlLayoutUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

export default router;
