import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { dualVerifyCreateSchema, dualVerifyUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/dual-verify';

const router = Router();

router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(dualVerifyCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(dualVerifyUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

export default router;
