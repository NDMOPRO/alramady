import { Router } from 'express';
import { formattingController } from '../controllers/formatting.controller';
import { authMiddleware } from '../middleware/auth';
import {
  validate,
  formattingCreateSchema,
  formattingUpdateSchema,
  uuidParamSchema,
} from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  formattingController.list.bind(formattingController)
);

router.get(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  formattingController.getById.bind(formattingController)
);

router.post(
  '/',
  authMiddleware,
  validate(formattingCreateSchema),
  formattingController.create.bind(formattingController)
);

router.post(
  '/apply',
  authMiddleware,
  validate(formattingCreateSchema),
  formattingController.applyFormatting.bind(formattingController)
);

router.post(
  '/conditional',
  authMiddleware,
  validate(formattingCreateSchema),
  formattingController.applyConditionalFormatting.bind(formattingController)
);

router.post(
  '/clear',
  authMiddleware,
  formattingController.clearFormatting.bind(formattingController)
);

router.put(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(formattingUpdateSchema),
  formattingController.update.bind(formattingController)
);

router.delete(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  formattingController.delete.bind(formattingController)
);

export default router;
