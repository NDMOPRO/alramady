import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, externalSimulationCreateSchema, externalSimulationUpdateSchema, uuidParamSchema } from '../middleware/validation';
import { externalSimulationController } from '../controllers/external-simulation.controller';

const router = Router();

router.get('/', authMiddleware, externalSimulationController.list.bind(externalSimulationController));
router.get('/:id', authMiddleware, validate(uuidParamSchema, 'params'), externalSimulationController.getById.bind(externalSimulationController));
router.post('/', authMiddleware, validate(externalSimulationCreateSchema), externalSimulationController.create.bind(externalSimulationController));
router.put('/:id', authMiddleware, validate(uuidParamSchema, 'params'), validate(externalSimulationUpdateSchema), externalSimulationController.update.bind(externalSimulationController));
router.delete('/:id', authMiddleware, validate(uuidParamSchema, 'params'), externalSimulationController.remove.bind(externalSimulationController));
router.post('/:id/execute', authMiddleware, validate(uuidParamSchema, 'params'), externalSimulationController.execute.bind(externalSimulationController));
router.post('/:id/cancel', authMiddleware, validate(uuidParamSchema, 'params'), externalSimulationController.cancel.bind(externalSimulationController));
router.get('/:id/results', authMiddleware, validate(uuidParamSchema, 'params'), externalSimulationController.getResults.bind(externalSimulationController));

// E03.07 — Simulate from image
router.post('/simulate-from-image', authMiddleware, externalSimulationController.simulateFromImage.bind(externalSimulationController));

// E03.07 — Generate chart from prompt
router.post('/generate-chart-from-prompt', authMiddleware, externalSimulationController.generateChartFromPrompt.bind(externalSimulationController));

// E03.07 — Simulate large dataset performance
router.get('/simulate-performance/:datasetId', authMiddleware, externalSimulationController.simulateLargeDatasetPerformance.bind(externalSimulationController));

// E03.07 — Extract design tokens
router.post('/extract-design-tokens', authMiddleware, externalSimulationController.extractDesignTokens.bind(externalSimulationController));

export default router;
