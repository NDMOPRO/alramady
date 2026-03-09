import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { matchScopeCreateSchema, matchScopeUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/match-scope';

const router = Router();

router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(matchScopeCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(matchScopeUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

export default router;
