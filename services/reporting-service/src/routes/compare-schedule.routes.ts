import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, compareScheduleCreateSchema, compareScheduleUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { compareScheduleController } from '../controllers/compare-schedule.controller';
import { compareScheduleService } from '../services/compare-schedule.service';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

const router = Router();

router.get('/', authMiddleware, compareScheduleController.list.bind(compareScheduleController));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), compareScheduleController.getById.bind(compareScheduleController));
router.post('/', authMiddleware, validate(compareScheduleCreateSchema), compareScheduleController.create.bind(compareScheduleController));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(compareScheduleUpdateSchema), compareScheduleController.update.bind(compareScheduleController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), compareScheduleController.remove.bind(compareScheduleController));
router.post('/:id/execute', authMiddleware, validate(uuidParamSchema, 'params'), compareScheduleController.execute.bind(compareScheduleController));
router.get('/:id/results', authMiddleware, validate(uuidParamSchema, 'params'), compareScheduleController.getResults.bind(compareScheduleController));
router.post('/:id/activate', authMiddleware, validate(uuidParamSchema, 'params'), compareScheduleController.activate.bind(compareScheduleController));
router.post('/:id/deactivate', authMiddleware, validate(uuidParamSchema, 'params'), compareScheduleController.deactivate.bind(compareScheduleController));
router.post('/:id/schedule', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const { action } = req.body;
  let result;
  if (action === 'activate') {
    result = await compareScheduleService.activate(req.params.id!);
  } else if (action === 'deactivate') {
    result = await compareScheduleService.deactivate(req.params.id!);
  } else {
    res.status(400).json({ success: false, error: 'Invalid action. Use "activate" or "deactivate".' });
    return;
  }
  res.json({ success: true, data: result });
}));

export default router;
