import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, dragElementsCreateSchema, dragElementsUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { dragElementsController } from '../controllers/drag-elements.controller';

const router = Router();

// CRUD
router.get('/', authMiddleware, dragElementsController.list.bind(dragElementsController));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), dragElementsController.getById.bind(dragElementsController));
router.post('/', authMiddleware, validate(dragElementsCreateSchema), dragElementsController.create.bind(dragElementsController));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(dragElementsUpdateSchema), dragElementsController.update.bind(dragElementsController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), dragElementsController.remove.bind(dragElementsController));

// Batch operations
router.put('/batch/update', authMiddleware, dragElementsController.batchUpdate.bind(dragElementsController));
router.put('/batch/reorder', authMiddleware, dragElementsController.reorder.bind(dragElementsController));

// E03.03 — Drop and bind
router.post('/drop-bind', authMiddleware, dragElementsController.dropAndBind.bind(dragElementsController));

// E03.03 — Link elements for cross-filtering
router.post('/link', authMiddleware, dragElementsController.linkElements.bind(dragElementsController));

// E03.03 — Configure drill-down on element
router.post('/:id/drill-down', authMiddleware, validate(uuidParamSchema, 'params'), dragElementsController.configureDrillDown.bind(dragElementsController));

// E03.03 — Configure alert on element
router.post('/:id/alert', authMiddleware, validate(uuidParamSchema, 'params'), dragElementsController.configureAlert.bind(dragElementsController));

// E03.03 — Export element to presentation
router.post('/:id/export-to-presentation', authMiddleware, validate(uuidParamSchema, 'params'), dragElementsController.exportToPresentation.bind(dragElementsController));

// E03.03 — Update single element position
router.patch('/:id/position', authMiddleware, validate(uuidParamSchema, 'params'), dragElementsController.updatePosition.bind(dragElementsController));

export default router;
