import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { mediaCreateSchema, mediaUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/media-library';

const router = Router();

// GET /api/v1/library/media - List all media assets
router.get('/', authMiddleware, controller.list);

// GET /api/v1/library/media/:id - Get media asset by ID
router.get('/:id', authMiddleware, controller.getById);

// POST /api/v1/library/media - Create media asset
router.post('/', authMiddleware, validate(mediaCreateSchema), controller.create);

// PUT /api/v1/library/media/:id - Update media asset
router.put('/:id', authMiddleware, validate(mediaUpdateSchema), controller.update);

// DELETE /api/v1/library/media/:id - Delete media asset
router.delete('/:id', authMiddleware, controller.remove);

export default router;
