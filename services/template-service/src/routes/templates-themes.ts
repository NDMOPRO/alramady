import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { templateCreateSchema, templateUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/templates-themes';

const router = Router();

// GET /api/v1/template/themes - List all templates/themes
router.get('/', authMiddleware, controller.list);

// GET /api/v1/template/themes/:id - Get template by ID
router.get('/:id', authMiddleware, controller.getById);

// POST /api/v1/template/themes - Create template
router.post('/', authMiddleware, validate(templateCreateSchema), controller.create);

// PUT /api/v1/template/themes/:id - Update template
router.put('/:id', authMiddleware, validate(templateUpdateSchema), controller.update);

// DELETE /api/v1/template/themes/:id - Delete template
router.delete('/:id', authMiddleware, controller.remove);

export default router;
