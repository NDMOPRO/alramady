import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { PredictiveEngineService } from '../services/predictive-engine.service.js';

const router = Router();
const predictiveEngineService = new PredictiveEngineService();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const forecastSchema = z.object({
  data: z.array(z.number()).min(2),
  periods: z.number().int().min(1).max(365),
  method: z.enum(['exponential', 'linear', 'auto']).default('auto'),
});

const scenarioConfigSchema = z.object({
  name: z.string().min(1),
  parameters: z.array(z.object({
    column: z.string(),
    min: z.number(),
    max: z.number(),
    distribution: z.enum(['uniform', 'normal']).default('uniform'),
  })).min(1),
  targetColumn: z.string(),
});

const scenarioSimulationSchema = z.object({
  baseData: z.array(z.record(z.string(), z.number())).min(1),
  scenarios: z.array(scenarioConfigSchema).min(1).max(10),
});

const whatIfSchema = z.object({
  data: z.array(z.record(z.string(), z.number())).min(1),
  changes: z.array(z.object({
    column: z.string(),
    factor: z.number().min(0).max(100),
  })).min(1),
});

router.post(
  '/forecast',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { data, periods, method } = forecastSchema.parse(req.body);
    const result = predictiveEngineService.forecast(data, periods, method);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/scenario-simulation',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { baseData, scenarios } = scenarioSimulationSchema.parse(req.body);
    const results = predictiveEngineService.scenarioSimulation(baseData, scenarios);
    res.json({ success: true, data: results });
  })
);

router.post(
  '/what-if',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { data, changes } = whatIfSchema.parse(req.body);
    const result = predictiveEngineService.whatIfAnalysis(data, changes);
    res.json({ success: true, data: result });
  })
);

export default router;
