import { Router } from 'express';
import { classificationController } from '../controllers/classification.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { validate, classificationCreateSchema, classificationUpdateSchema, uuidParamSchema } from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  tenantMiddleware,
  classificationController.list.bind(classificationController)
);

router.get(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  classificationController.getById.bind(classificationController)
);

router.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  validate(classificationCreateSchema),
  classificationController.create.bind(classificationController)
);

router.put(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(classificationUpdateSchema),
  classificationController.update.bind(classificationController)
);

router.delete(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  classificationController.delete.bind(classificationController)
);

export default router;
