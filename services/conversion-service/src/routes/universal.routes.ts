import { Router } from 'express';
import { universalController } from '../controllers/universal.controller';
import { authMiddleware } from '../middleware/auth';
import {
  validate,
  universalCreateSchema,
  universalUpdateSchema,
  uuidParamSchema,
} from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  universalController.list.bind(universalController)
);

router.get(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  universalController.getById.bind(universalController)
);

router.post(
  '/',
  authMiddleware,
  validate(universalCreateSchema),
  universalController.create.bind(universalController)
);

router.post(
  '/convert',
  authMiddleware,
  validate(universalCreateSchema),
  universalController.convert.bind(universalController)
);

router.post(
  '/batch',
  authMiddleware,
  universalController.batchConvert.bind(universalController)
);

router.put(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(universalUpdateSchema),
  universalController.update.bind(universalController)
);

router.delete(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  universalController.delete.bind(universalController)
);

export default router;
