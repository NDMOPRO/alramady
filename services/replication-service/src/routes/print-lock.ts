import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { printLockCreateSchema, printLockUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/print-lock';

const router = Router();

router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(printLockCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(printLockUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

export default router;
