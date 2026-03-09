import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { corePrincipleCreateSchema, corePrincipleUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/core-principle';

const router = Router();

router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(corePrincipleCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(corePrincipleUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

export default router;
