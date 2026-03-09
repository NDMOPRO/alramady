import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, easyModeCreateSchema, easyModeUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { easyModeController } from '../controllers/easy-mode.controller';

const router = Router();

router.get('/', authMiddleware, easyModeController.list.bind(easyModeController));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), easyModeController.getById.bind(easyModeController));
router.post('/', authMiddleware, validate(easyModeCreateSchema), easyModeController.create.bind(easyModeController));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(easyModeUpdateSchema), easyModeController.update.bind(easyModeController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), easyModeController.remove.bind(easyModeController));
router.post('/:id/duplicate', authMiddleware, validate(uuidParamSchema, 'params'), easyModeController.duplicate.bind(easyModeController));
router.post('/:id/publish', authMiddleware, validate(uuidParamSchema, 'params'), easyModeController.publish.bind(easyModeController));

export default router;
