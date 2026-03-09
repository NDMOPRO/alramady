import { Router } from 'express';
import { tablesController } from '../controllers/tables.controller';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { validate, tableViewCreateSchema, tableViewUpdateSchema, uuidParamSchema } from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  tenantMiddleware,
  tablesController.list.bind(tablesController)
);

router.get(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  tablesController.getById.bind(tablesController)
);

router.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  validate(tableViewCreateSchema),
  tablesController.create.bind(tablesController)
);

router.put(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(tableViewUpdateSchema),
  tablesController.update.bind(tablesController)
);

router.delete(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  validate(uuidParamSchema, 'params'),
  tablesController.delete.bind(tablesController)
);

export default router;
