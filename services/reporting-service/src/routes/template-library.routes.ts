import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, reportTemplateCreateSchema, reportTemplateUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { reportTemplateLibraryController } from '../controllers/template-library.controller';
import { reportTemplateLibraryService } from '../services/template-library.service';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

const router = Router();

router.get('/', authMiddleware, reportTemplateLibraryController.list.bind(reportTemplateLibraryController));
router.get('/categories', authMiddleware, reportTemplateLibraryController.getCategories.bind(reportTemplateLibraryController));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), reportTemplateLibraryController.getById.bind(reportTemplateLibraryController));
router.get('/:id/preview', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await reportTemplateLibraryService.getPreview(req.params.id);
  res.json({ success: true, data: result });
}));
router.post('/', authMiddleware, validate(reportTemplateCreateSchema), reportTemplateLibraryController.create.bind(reportTemplateLibraryController));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(reportTemplateUpdateSchema), reportTemplateLibraryController.update.bind(reportTemplateLibraryController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), reportTemplateLibraryController.remove.bind(reportTemplateLibraryController));
router.post('/:id/duplicate', authMiddleware, validate(uuidParamSchema, 'params'), reportTemplateLibraryController.duplicate.bind(reportTemplateLibraryController));
router.post('/:id/apply', authMiddleware, validate(uuidParamSchema, 'params'), reportTemplateLibraryController.applyTemplate.bind(reportTemplateLibraryController));
router.post('/:id/save-as-template', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const { name, category } = req.body;
  const userId = req.user!.userId;
  const tenantId = req.user!.organizationId || 'default';
  const result = await reportTemplateLibraryService.saveReportAsTemplate(req.params.id, name, category, userId, tenantId);
  res.status(201).json({ success: true, data: result });
}));

export default router;
