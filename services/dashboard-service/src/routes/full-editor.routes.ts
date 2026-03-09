import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, fullEditorCreateSchema, fullEditorUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { fullEditorController } from '../controllers/full-editor.controller';

const router = Router();

// CRUD
router.get('/', authMiddleware, fullEditorController.list.bind(fullEditorController));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), fullEditorController.getById.bind(fullEditorController));
router.post('/', authMiddleware, validate(fullEditorCreateSchema), fullEditorController.create.bind(fullEditorController));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(fullEditorUpdateSchema), fullEditorController.update.bind(fullEditorController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), fullEditorController.remove.bind(fullEditorController));
router.post('/:id/snapshot', authMiddleware, validate(uuidParamSchema, 'params'), fullEditorController.saveSnapshot.bind(fullEditorController));

// E03.04 — Resize widget
router.post('/resize', authMiddleware, fullEditorController.resizeElement.bind(fullEditorController));

// E03.04 — Share interactive link
router.post('/dashboards/:dashboardId/share', authMiddleware, fullEditorController.shareInteractiveLink.bind(fullEditorController));

// E03.04 — Convert to report
router.post('/dashboards/:dashboardId/convert-to-report', authMiddleware, fullEditorController.convertToReport.bind(fullEditorController));

// E03.04 — Rebind element data
router.post('/rebind', authMiddleware, fullEditorController.rebindElement.bind(fullEditorController));

// E03.04 — Add canvas formula
router.post('/widgets/:widgetId/formula', authMiddleware, fullEditorController.addCanvasFormula.bind(fullEditorController));

// E03.04 — Export dashboard
router.post('/dashboards/:dashboardId/export', authMiddleware, fullEditorController.exportDashboard.bind(fullEditorController));

export default router;
