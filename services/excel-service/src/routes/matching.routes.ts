import { Router } from 'express';
import { matchingController } from '../controllers/matching.controller';
import { authMiddleware } from '../middleware/auth';
import {
  validate,
  matchingCreateSchema,
  matchingUpdateSchema,
  uuidParamSchema,
} from '../middleware/validation';

const router = Router();

router.get(
  '/',
  authMiddleware,
  matchingController.list.bind(matchingController)
);

router.get(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  matchingController.getById.bind(matchingController)
);

router.get(
  '/:id/results',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  matchingController.getMatchResults.bind(matchingController)
);

router.post(
  '/',
  authMiddleware,
  validate(matchingCreateSchema),
  matchingController.create.bind(matchingController)
);

router.post(
  '/execute',
  authMiddleware,
  validate(matchingCreateSchema),
  matchingController.executeMatch.bind(matchingController)
);

router.post(
  '/deduplicate',
  authMiddleware,
  matchingController.deduplicate.bind(matchingController)
);

router.put(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  validate(matchingUpdateSchema),
  matchingController.update.bind(matchingController)
);

router.delete(
  '/:id',
  authMiddleware,
  validate(uuidParamSchema, 'params'),
  matchingController.delete.bind(matchingController)
);

export default router;
