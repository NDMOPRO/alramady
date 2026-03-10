import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, reportAdvancedModeCreateSchema, reportAdvancedModeUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { reportAdvancedModeController } from '../controllers/advanced-mode.controller';
import { reportAdvancedModeService } from '../services/advanced-mode.service';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

const router = Router();

router.get('/', authMiddleware, reportAdvancedModeController.list.bind(reportAdvancedModeController));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), reportAdvancedModeController.getById.bind(reportAdvancedModeController));
router.post('/', authMiddleware, validate(reportAdvancedModeCreateSchema), reportAdvancedModeController.create.bind(reportAdvancedModeController));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(reportAdvancedModeUpdateSchema), reportAdvancedModeController.update.bind(reportAdvancedModeController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), reportAdvancedModeController.remove.bind(reportAdvancedModeController));
router.post('/:id/execute-query', authMiddleware, validate(uuidParamSchema, 'params'), reportAdvancedModeController.executeQuery.bind(reportAdvancedModeController));
router.post('/:id/generate', authMiddleware, validate(uuidParamSchema, 'params'), reportAdvancedModeController.generate.bind(reportAdvancedModeController));
router.post('/:id/generate-multi', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const formats = req.body.formats || ['pdf'];
  const result = await reportAdvancedModeService.generate(req.params.id!, formats);
  res.json({ success: true, data: result });
}));

export default router;
