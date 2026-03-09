import { Router } from 'express';
import { capacityController } from '../controllers/capacity.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { validate, capacityCreateSchema, capacityUpdateSchema, uuidParamSchema } from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  tenantMiddleware,
  capacityController.list.bind(capacityController)
);

router.get(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  capacityController.getById.bind(capacityController)
);

router.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  validate(capacityCreateSchema),
  capacityController.create.bind(capacityController)
);

router.put(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(capacityUpdateSchema),
  capacityController.update.bind(capacityController)
);

router.delete(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  capacityController.delete.bind(capacityController)
);

export default router;
