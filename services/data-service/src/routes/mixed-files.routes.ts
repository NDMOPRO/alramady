import { Router } from 'express';
import { mixedFilesController } from '../controllers/mixed-files.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { validate, mixedFileCreateSchema, mixedFileUpdateSchema, uuidParamSchema } from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  tenantMiddleware,
  mixedFilesController.list.bind(mixedFilesController)
);

router.get(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  mixedFilesController.getById.bind(mixedFilesController)
);

router.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  validate(mixedFileCreateSchema),
  mixedFilesController.create.bind(mixedFilesController)
);

router.put(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(mixedFileUpdateSchema),
  mixedFilesController.update.bind(mixedFilesController)
);

router.delete(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  mixedFilesController.delete.bind(mixedFilesController)
);

export default router;
