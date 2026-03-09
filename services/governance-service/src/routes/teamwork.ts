import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { teamCreateSchema, teamUpdateSchema } from '../middleware/validation';
import * as controller from '../controllers/teamwork';

const router = Router();

// GET /api/v1/governance/teamwork - List all teams
router.get('/', authMiddleware, controller.list);

// GET /api/v1/governance/teamwork/:id - Get team by ID
router.get('/:id', authMiddleware, controller.getById);

// POST /api/v1/governance/teamwork - Create team
router.post('/', authMiddleware, validate(teamCreateSchema), controller.create);

// PUT /api/v1/governance/teamwork/:id - Update team
router.put('/:id', authMiddleware, validate(teamUpdateSchema), controller.update);

// DELETE /api/v1/governance/teamwork/:id - Delete team
router.delete('/:id', authMiddleware, controller.remove);

// GET /api/v1/governance/teamwork/:id/members - List team members
router.get('/:id/members', authMiddleware, controller.getMembers);

// POST /api/v1/governance/teamwork/:id/members - Add member to team
router.post('/:id/members', authMiddleware, controller.addMember);

// DELETE /api/v1/governance/teamwork/:id/members/:userId - Remove member from team
router.delete('/:id/members/:userId', authMiddleware, controller.removeMember);

export default router;
