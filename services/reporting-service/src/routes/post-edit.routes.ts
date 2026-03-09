import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, reportPostEditCreateSchema, reportPostEditUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { reportPostEditController } from '../controllers/post-edit.controller';
import { reportPostEditService } from '../services/post-edit.service';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

const router = Router();

router.get('/', authMiddleware, reportPostEditController.list.bind(reportPostEditController));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), reportPostEditController.getById.bind(reportPostEditController));
router.post('/', authMiddleware, validate(reportPostEditCreateSchema), reportPostEditController.create.bind(reportPostEditController));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(reportPostEditUpdateSchema), reportPostEditController.update.bind(reportPostEditController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), reportPostEditController.remove.bind(reportPostEditController));
router.post('/:id/sections/:sectionId', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await reportPostEditService.applySectionEdit(req.params.id, req.params.sectionId, req.body, req.user!.userId);
  res.json({ success: true, data: result });
}));
router.get('/:id/versions', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await reportPostEditService.getVersionDiff(req.params.id);
  res.json({ success: true, data: result });
}));
router.post('/:id/publish', authMiddleware, validate(uuidParamSchema, 'params'), reportPostEditController.publish.bind(reportPostEditController));
router.post('/:id/revert', authMiddleware, validate(uuidParamSchema, 'params'), reportPostEditController.revert.bind(reportPostEditController));
router.post('/:id/re-export', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const format = req.body.format || 'pdf';
  const result = await reportPostEditService.reexport(req.params.id, format);
  res.json({ success: true, data: result });
}));
router.get('/history/:reportId', authMiddleware, reportPostEditController.getHistory.bind(reportPostEditController));
router.post('/:id/watermark', authMiddleware, validate(uuidParamSchema, 'params'), reportPostEditController.applyWatermark.bind(reportPostEditController));

export default router;
