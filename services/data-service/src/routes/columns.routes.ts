import { Router } from 'express';
import { columnsController } from '../controllers/columns.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { validate, columnCreateSchema, columnUpdateSchema, uuidParamSchema } from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  tenantMiddleware,
  columnsController.list.bind(columnsController)
);

router.get(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  columnsController.getById.bind(columnsController)
);

router.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  validate(columnCreateSchema),
  columnsController.create.bind(columnsController)
);

router.put(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(columnUpdateSchema),
  columnsController.update.bind(columnsController)
);

router.delete(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  columnsController.delete.bind(columnsController)
);

export default router;
