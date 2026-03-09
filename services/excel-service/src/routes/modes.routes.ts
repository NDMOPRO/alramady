import { Router } from 'express';
import { modesController } from '../controllers/modes.controller';
import { authMiddleware } from '../middleware/auth';
import {
  validate,
  modeCreateSchema,
  modeUpdateSchema,
  uuidParamSchema,
} from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  modesController.list.bind(modesController)
);

router.get(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  modesController.getById.bind(modesController)
);

router.get(
  '/:id/config',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  modesController.getModeConfig.bind(modesController)
);

router.post(
  '/',
  authMiddleware,
  validate(modeCreateSchema),
  modesController.create.bind(modesController)
);

router.post(
  '/switch',
  authMiddleware,
  modesController.switchMode.bind(modesController)
);

router.post(
  '/config',
  authMiddleware,
  modesController.updateModeConfig.bind(modesController)
);

router.put(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(modeUpdateSchema),
  modesController.update.bind(modesController)
);

router.delete(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  modesController.delete.bind(modesController)
);

export default router;
