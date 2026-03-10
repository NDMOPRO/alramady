import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, reportExternalSimulationCreateSchema, reportExternalSimulationUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { reportExternalSimulationController } from '../controllers/external-simulation.controller';
import { reportExternalSimulationService } from '../services/external-simulation.service';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

const router = Router();

router.get('/', authMiddleware, reportExternalSimulationController.list.bind(reportExternalSimulationController));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), reportExternalSimulationController.getById.bind(reportExternalSimulationController));
router.post('/', authMiddleware, validate(reportExternalSimulationCreateSchema), reportExternalSimulationController.create.bind(reportExternalSimulationController));
router.post('/analyze', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const result = await reportExternalSimulationService.analyzeExternalReport(req.body);
  res.json({ success: true, data: result });
}));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(reportExternalSimulationUpdateSchema), reportExternalSimulationController.update.bind(reportExternalSimulationController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), reportExternalSimulationController.remove.bind(reportExternalSimulationController));
router.post('/:id/execute', authMiddleware, validate(uuidParamSchema, 'params'), reportExternalSimulationController.execute.bind(reportExternalSimulationController));
router.post('/:id/reproduce', authMiddleware, validate(uuidParamSchema, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await reportExternalSimulationService.reproduceReport(req.params.id!);
  res.json({ success: true, data: result });
}));
router.get('/:id/results', authMiddleware, validate(uuidParamSchema, 'params'), reportExternalSimulationController.getResults.bind(reportExternalSimulationController));

export default router;
