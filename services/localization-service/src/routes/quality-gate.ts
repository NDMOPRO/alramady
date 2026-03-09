import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { qualityGateCreateSchema, qualityGateUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/quality-gate';

const router = Router();

router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(qualityGateCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(qualityGateUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

export default router;
