import { Router } from 'express';
import { visualProcessingController } from '../controllers/visual-processing.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { validate, visualProcessingCreateSchema, visualProcessingUpdateSchema, uuidParamSchema } from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  tenantMiddleware,
  visualProcessingController.list.bind(visualProcessingController)
);

router.get(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  visualProcessingController.getById.bind(visualProcessingController)
);

router.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  validate(visualProcessingCreateSchema),
  visualProcessingController.create.bind(visualProcessingController)
);

router.put(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(visualProcessingUpdateSchema),
  visualProcessingController.update.bind(visualProcessingController)
);

router.delete(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  visualProcessingController.delete.bind(visualProcessingController)
);

export default router;
