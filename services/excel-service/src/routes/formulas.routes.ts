import { Router } from 'express';
import { formulasController } from '../controllers/formulas.controller';
import { authMiddleware } from '../middleware/auth';
import {
  validate,
  formulaCreateSchema,
  formulaUpdateSchema,
  formulaBatchExecuteSchema,
  uuidParamSchema,
} from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  formulasController.list.bind(formulasController)
);

router.get(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  formulasController.getById.bind(formulasController)
);

router.post(
  '/',
  authMiddleware,
  validate(formulaCreateSchema),
  formulasController.create.bind(formulasController)
);

router.post(
  '/execute',
  authMiddleware,
  validate(formulaCreateSchema),
  formulasController.executeFormula.bind(formulasController)
);

router.post(
  '/batch-execute',
  authMiddleware,
  validate(formulaBatchExecuteSchema),
  formulasController.batchExecute.bind(formulasController)
);

router.put(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(formulaUpdateSchema),
  formulasController.update.bind(formulasController)
);

router.delete(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  formulasController.delete.bind(formulasController)
);

export default router;
