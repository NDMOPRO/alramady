import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { collaborationCreateSchema, collaborationUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/collaboration';

const router = Router();

// CRUD endpoints
router.get('/', authMiddleware, controller.list);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, validate(collaborationCreateSchema), controller.create);
router.put('/:id', authMiddleware, validate(collaborationUpdateSchema), controller.update);
router.delete('/:id', authMiddleware, controller.remove);

// Module-specific endpoints
router.post('/:id/collaborators', authMiddleware, controller.addCollaborator);
router.delete('/:id/collaborators/:collaboratorId', authMiddleware, controller.removeCollaborator);
router.get('/:id/active-users', authMiddleware, controller.getActiveUsers);
router.post('/:id/comments', authMiddleware, controller.addComment);

export default router;
