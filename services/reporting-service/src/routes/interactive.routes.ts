import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import { validate, uuidParamSchema } from '../middleware/validation';
import { InteractiveReportService } from '../services/interactive-report.service';

const prisma = new PrismaClient();
const interactiveReportService = new InteractiveReportService(prisma);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

const router = Router();

// POST / - create interactive report
router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const result = await interactiveReportService.createInteractiveReport(req.body);
  res.status(201).json({ success: true, data: result });
}));

// GET /:id - get interactive report
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const report = await prisma.interactiveReport.findUnique({ where: { id: req.params.id } });
  if (!report) {
    res.status(404).json({ success: false, error: 'Interactive report not found', code: 'NOT_FOUND' });
    return;
  }
  res.json({ success: true, data: report });
}));

// POST /:id/execute - execute with parameters
router.post('/:id/execute', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await interactiveReportService.executeWithParameters(req.params.id, req.body.parameters || {});
  res.json({ success: true, data: result });
}));

// POST /:id/drill-down - drill down
router.post('/:id/drill-down', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await interactiveReportService.executeDrillDown(req.params.id, req.body.elementId, req.body.drillValue, req.body.currentParams);
  res.json({ success: true, data: result });
}));

// POST /:id/bookmarks - create bookmark
router.post('/:id/bookmarks', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await interactiveReportService.createBookmark(req.params.id, req.body.name, req.body.state, req.user!.userId, req.body.isDefault);
  res.status(201).json({ success: true, data: result });
}));

// POST /:id/bookmarks/:bookmarkId/apply - apply bookmark
router.post('/:id/bookmarks/:bookmarkId/apply', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await interactiveReportService.applyBookmark(req.params.id, req.params.bookmarkId);
  res.json({ success: true, data: result });
}));

// POST /:id/comments - add comment
router.post('/:id/comments', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await interactiveReportService.addComment(req.params.id, req.user!.userId, req.body.userName, req.body.content, req.body.sectionId, req.body.parentCommentId);
  res.status(201).json({ success: true, data: result });
}));

// GET /:id/comments - get comments
router.get('/:id/comments', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await interactiveReportService.getComments(req.params.id);
  res.json({ success: true, data: result });
}));

// POST /comments/:commentId/resolve - resolve comment
router.post('/comments/:commentId/resolve', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  await interactiveReportService.resolveComment(req.params.commentId, req.user!.userId);
  res.json({ success: true, message: 'Comment resolved' });
}));

// GET /:id/versions/:v1/:v2 - compare versions
router.get('/:id/versions/:v1/:v2', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const v1 = parseInt(req.params.v1);
  const v2 = parseInt(req.params.v2);
  const result = await interactiveReportService.compareVersions(req.params.id, v1, v2);
  res.json({ success: true, data: result });
}));

// POST /:id/annotations - add annotation
router.post('/:id/annotations', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await interactiveReportService.addAnnotation(req.params.id, req.body.sectionId, req.body.type, req.body.position, req.user!.userId, req.body.content, req.body.color);
  res.status(201).json({ success: true, data: result });
}));

// POST /:id/links - create report link
router.post('/:id/links', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await interactiveReportService.createReportLink(req.params.id, req.body.targetReportId, req.body.linkType, req.body.parameterMapping, req.body.label);
  res.status(201).json({ success: true, data: result });
}));

export default router;
