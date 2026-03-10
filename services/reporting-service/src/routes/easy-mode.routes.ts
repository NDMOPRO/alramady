import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, reportEasyModeCreateSchema, reportEasyModeUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { reportEasyModeController } from '../controllers/easy-mode.controller';
import { reportEasyModeService } from '../services/easy-mode.service';
import { aiNarrativeService } from '../services/ai-narrative.service';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

const router = Router();

router.get('/', authMiddleware, reportEasyModeController.list.bind(reportEasyModeController));
router.get('/report-types', authMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  const types = await reportEasyModeService.getReportTypes();
  res.json({ success: true, data: types });
}));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), reportEasyModeController.getById.bind(reportEasyModeController));
router.post('/', authMiddleware, validate(reportEasyModeCreateSchema), reportEasyModeController.create.bind(reportEasyModeController));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(reportEasyModeUpdateSchema), reportEasyModeController.update.bind(reportEasyModeController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), reportEasyModeController.remove.bind(reportEasyModeController));
router.post('/:id/duplicate', authMiddleware, validate(uuidParamSchema, 'params'), reportEasyModeController.duplicate.bind(reportEasyModeController));
router.post('/:id/generate', authMiddleware, validate(uuidParamSchema, 'params'), reportEasyModeController.generate.bind(reportEasyModeController));
router.post('/:id/auto-layout', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await reportEasyModeService.autoCompose(req.params.id!);
  res.json({ success: true, data: result });
}));
router.post('/:id/ai-summary', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const summary = aiNarrativeService.generateExecutiveSummary(req.body);
  res.json({ success: true, data: summary });
}));
router.post('/:id/schedule', authMiddleware, validate(uuidParamSchema, 'params'), reportEasyModeController.schedule.bind(reportEasyModeController));
router.get('/:id/preview', authMiddleware, validate(uuidParamSchema, 'params'), reportEasyModeController.preview.bind(reportEasyModeController));
router.post('/:id/export', authMiddleware, validate(uuidParamSchema, 'params'), reportEasyModeController.exportReport.bind(reportEasyModeController));

export default router;
