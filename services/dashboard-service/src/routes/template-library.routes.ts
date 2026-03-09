import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, templateLibraryCreateSchema, templateLibraryUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { templateLibraryController } from '../controllers/template-library.controller';

const router = Router();

// CRUD
router.get('/', authMiddleware, templateLibraryController.list.bind(templateLibraryController));
router.get('/categories', authMiddleware, templateLibraryController.getCategories.bind(templateLibraryController));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), templateLibraryController.getById.bind(templateLibraryController));
router.post('/', authMiddleware, validate(templateLibraryCreateSchema), templateLibraryController.create.bind(templateLibraryController));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(templateLibraryUpdateSchema), templateLibraryController.update.bind(templateLibraryController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), templateLibraryController.remove.bind(templateLibraryController));
router.post('/:id/duplicate', authMiddleware, validate(uuidParamSchema, 'params'), templateLibraryController.duplicate.bind(templateLibraryController));
router.post('/:id/apply', authMiddleware, validate(uuidParamSchema, 'params'), templateLibraryController.applyTemplate.bind(templateLibraryController));

// E03.06 — Save dashboard as template
router.post('/save-as-template', authMiddleware, templateLibraryController.saveAsTemplate.bind(templateLibraryController));

// E03.06 — Create from template
router.post('/from-template', authMiddleware, templateLibraryController.createFromTemplate.bind(templateLibraryController));

// E03.06 — Compare dashboards
router.post('/compare', authMiddleware, templateLibraryController.compareDashboards.bind(templateLibraryController));

// E03.06 — Auto-generate KPIs
router.get('/auto-kpis/:datasetId', authMiddleware, templateLibraryController.autoGenerateKPIs.bind(templateLibraryController));

export default router;
