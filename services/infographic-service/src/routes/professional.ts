import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { professionalCreateSchema, professionalUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/professional';

const router = Router();

// CRUD endpoints
router.get('/', authMiddleware, controller.list);
router.get('/templates', authMiddleware, controller.getTemplates);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(professionalCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(professionalUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

// Module-specific endpoints
router.post('/:id/duplicate', authMiddleware, controller.duplicate);
router.post('/:id/export', authMiddleware, controller.exportInfographic);
router.post('/generate-from-data', authMiddleware, controller.generateFromData);
router.post('/:id/apply-template', authMiddleware, controller.applyTemplate);
router.post('/:id/sections', authMiddleware, controller.addSection);
router.put('/:id/sections/:sectionIndex', authMiddleware, controller.updateSection);
router.delete('/:id/sections/:sectionIndex', authMiddleware, controller.removeSection);
router.put('/:id/sections/reorder', authMiddleware, controller.reorderSections);
router.get('/:id/analyze', authMiddleware, controller.analyzeData);

export default router;
