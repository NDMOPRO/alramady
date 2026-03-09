import { Router } from 'express';
import { readingController } from '../controllers/reading.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { validate, readingCreateSchema, readingUpdateSchema, uuidParamSchema } from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  tenantMiddleware,
  readingController.list.bind(readingController)
);

router.get(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  readingController.getById.bind(readingController)
);

router.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  validate(readingCreateSchema),
  readingController.create.bind(readingController)
);

router.put(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(readingUpdateSchema),
  readingController.update.bind(readingController)
);

router.delete(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  readingController.delete.bind(readingController)
);

export default router;
