import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, postEditCreateSchema, postEditUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { postEditController } from '../controllers/post-edit.controller';

const router = Router();

// CRUD
router.get('/', authMiddleware, postEditController.list.bind(postEditController));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), postEditController.getById.bind(postEditController));
router.post('/', authMiddleware, validate(postEditCreateSchema), postEditController.create.bind(postEditController));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(postEditUpdateSchema), postEditController.update.bind(postEditController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), postEditController.remove.bind(postEditController));
router.post('/:id/publish', authMiddleware, validate(uuidParamSchema, 'params'), postEditController.publish.bind(postEditController));
router.post('/:id/revert', authMiddleware, validate(uuidParamSchema, 'params'), postEditController.revert.bind(postEditController));

// E03.05 — Change chart type
router.patch('/widgets/:widgetId/chart-type', authMiddleware, postEditController.changeChartType.bind(postEditController));

// E03.05 — Change aggregation
router.patch('/widgets/:widgetId/aggregation', authMiddleware, postEditController.changeAggregation.bind(postEditController));

// E03.05 — Version history
router.get('/dashboards/:dashboardId/versions', authMiddleware, postEditController.getVersionHistory.bind(postEditController));

// E03.05 — Clone dashboard
router.post('/dashboards/:dashboardId/clone', authMiddleware, postEditController.cloneDashboard.bind(postEditController));

// E03.05 — Save state
router.post('/dashboards/:dashboardId/save-state', authMiddleware, postEditController.saveState.bind(postEditController));

// E03.05 — Rebind dashboard data
router.post('/dashboards/:dashboardId/rebind', authMiddleware, postEditController.rebindDashboardData.bind(postEditController));

// E03.05 — Add element to dashboard
router.post('/dashboards/:dashboardId/elements', authMiddleware, postEditController.addElement.bind(postEditController));

// E03.05 — Delete element from dashboard
router.delete('/dashboards/:dashboardId/elements/:widgetId', authMiddleware, postEditController.deleteElement.bind(postEditController));

export default router;
