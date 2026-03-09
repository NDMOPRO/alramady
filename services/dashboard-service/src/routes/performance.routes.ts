import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, performanceCreateSchema, performanceUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { performanceController } from '../controllers/performance.controller';

const router = Router();

router.get('/', authMiddleware, performanceController.list.bind(performanceController));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), performanceController.getById.bind(performanceController));
router.post('/', authMiddleware, validate(performanceCreateSchema), performanceController.create.bind(performanceController));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(performanceUpdateSchema), performanceController.update.bind(performanceController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), performanceController.remove.bind(performanceController));
router.get('/summary/:dashboardId', authMiddleware, performanceController.getSummary.bind(performanceController));
router.post('/optimize/:dashboardId', authMiddleware, performanceController.optimize.bind(performanceController));

// E03.08 — Semantic layer
router.get('/semantic-layer/:dashboardId', authMiddleware, performanceController.getSemanticLayer.bind(performanceController));

// E03.08 — Precompute aggregations
router.post('/precompute/:dashboardId', authMiddleware, performanceController.precomputeAggregations.bind(performanceController));

// E03.08 — Optimized data fetch
router.get('/optimized-data/:dashboardId', authMiddleware, performanceController.getOptimizedData.bind(performanceController));

// E03.08 — Batch processing
router.post('/batch', authMiddleware, performanceController.batchProcess.bind(performanceController));

export default router;
