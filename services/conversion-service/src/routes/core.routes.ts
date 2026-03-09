import { Router } from 'express';
import { coreController } from '../controllers/core.controller';
import { authMiddleware } from '../middleware/auth';
import {
  validate,
  coreCreateSchema,
  coreUpdateSchema,
  uuidParamSchema,
} from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  coreController.list.bind(coreController)
);

router.get(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  coreController.getById.bind(coreController)
);

router.post(
  '/',
  authMiddleware,
  validate(coreCreateSchema),
  coreController.create.bind(coreController)
);

router.post(
  '/:id/start',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  coreController.startConversion.bind(coreController)
);

router.post(
  '/:id/cancel',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  coreController.cancelConversion.bind(coreController)
);

router.put(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(coreUpdateSchema),
  coreController.update.bind(coreController)
);

router.delete(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  coreController.delete.bind(coreController)
);

export default router;
