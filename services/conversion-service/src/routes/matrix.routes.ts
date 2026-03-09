import { Router } from 'express';
import { matrixController } from '../controllers/matrix.controller';
import { authMiddleware } from '../middleware/auth';
import {
  validate,
  matrixCreateSchema,
  matrixUpdateSchema,
  uuidParamSchema,
} from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  matrixController.list.bind(matrixController)
);

router.get(
  '/supported',
  authMiddleware,
  matrixController.getSupportedConversions.bind(matrixController)
);

router.get(
  '/check',
  authMiddleware,
  matrixController.checkSupport.bind(matrixController)
);

router.get(
  '/stats',
  authMiddleware,
  matrixController.getStats.bind(matrixController)
);

router.get(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  matrixController.getById.bind(matrixController)
);

router.post(
  '/',
  authMiddleware,
  validate(matrixCreateSchema),
  matrixController.create.bind(matrixController)
);

router.put(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(matrixUpdateSchema),
  matrixController.update.bind(matrixController)
);

router.delete(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  matrixController.delete.bind(matrixController)
);

export default router;
