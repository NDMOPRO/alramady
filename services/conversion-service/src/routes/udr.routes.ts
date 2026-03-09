import { Router } from 'express';
import { udrController } from '../controllers/udr.controller';
import { authMiddleware } from '../middleware/auth';
import {
  validate,
  udrCreateSchema,
  udrUpdateSchema,
  uuidParamSchema,
} from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  udrController.list.bind(udrController)
);

router.get(
  '/schema',
  authMiddleware,
  udrController.getSchema.bind(udrController)
);

router.get(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  udrController.getById.bind(udrController)
);

router.post(
  '/',
  authMiddleware,
  validate(udrCreateSchema),
  udrController.create.bind(udrController)
);

router.post(
  '/convert-to',
  authMiddleware,
  udrController.convertToUdr.bind(udrController)
);

router.post(
  '/convert-from',
  authMiddleware,
  udrController.convertFromUdr.bind(udrController)
);

router.put(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(udrUpdateSchema),
  udrController.update.bind(udrController)
);

router.delete(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  udrController.delete.bind(udrController)
);

export default router;
