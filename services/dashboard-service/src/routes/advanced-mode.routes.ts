import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, advancedModeCreateSchema, advancedModeUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { advancedModeController } from '../controllers/advanced-mode.controller';

const router = Router();

// CRUD endpoints
router.get('/', authMiddleware, advancedModeController.list.bind(advancedModeController));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), advancedModeController.getById.bind(advancedModeController));
router.post('/', authMiddleware, validate(advancedModeCreateSchema), advancedModeController.create.bind(advancedModeController));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(advancedModeUpdateSchema), advancedModeController.update.bind(advancedModeController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), advancedModeController.remove.bind(advancedModeController));

// Feature #11: Advanced mode - full control
router.post('/:id/query', authMiddleware, validate(uuidParamSchema, 'params'), advancedModeController.executeQuery.bind(advancedModeController));
router.post('/bind-data-source', authMiddleware, advancedModeController.bindDataSource.bind(advancedModeController));
router.post('/layout', authMiddleware, advancedModeController.applyAdvancedLayout.bind(advancedModeController));
router.post('/conditional-formatting', authMiddleware, advancedModeController.applyConditionalFormatting.bind(advancedModeController));
router.post('/computed-field', authMiddleware, advancedModeController.createComputedField.bind(advancedModeController));

// Legacy alias
router.post('/:id/execute-query', authMiddleware, validate(uuidParamSchema, 'params'), advancedModeController.executeQuery.bind(advancedModeController));

export default router;
