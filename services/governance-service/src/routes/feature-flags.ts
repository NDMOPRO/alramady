import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { FeatureFlagsService } from '../services/feature-flags.service';
import { prisma } from '../utils/prisma';

const router = Router();
const featureFlagsService = new FeatureFlagsService(prisma);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

const createFlagSchema = z.object({
  key: z.string().min(1).max(128),
  defaultValue: z.boolean().default(false),
  description: z.string().optional().default(''),
});

const updateFlagSchema = z.object({
  defaultValue: z.boolean().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
});

const addRuleSchema = z.object({
  userIds: z.array(z.string().uuid()).optional(),
  roleIds: z.array(z.string()).optional(),
  percentage: z.number().int().min(0).max(100).optional(),
  resultValue: z.boolean(),
  priority: z.number().int().min(0).default(0),
});

const evaluateSchema = z.object({
  flagKey: z.string().min(1),
  userId: z.string().uuid(),
});

router.get(
  '/',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId! || req.user!.organizationId || '';
    const flags = await featureFlagsService.listFlags(tenantId);
    res.json({ success: true, data: flags });
  })
);

router.post(
  '/',
  authMiddleware,
  validate(createFlagSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId! || req.user!.organizationId || '';
    const { key, defaultValue, description } = req.body;
    const flag = await featureFlagsService.createFlag(key, tenantId, defaultValue, description);
    res.status(201).json({ success: true, data: flag });
  })
);

router.put(
  '/:id',
  authMiddleware,
  validate(updateFlagSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const flag = await featureFlagsService.updateFlag(req.params.id!, req.body);
    res.json({ success: true, data: flag });
  })
);

router.post(
  '/:id/rules',
  authMiddleware,
  validate(addRuleSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { userIds, roleIds, percentage, resultValue, priority } = req.body;
    const rule = await featureFlagsService.addRule(
      req.params.id!,
      { userIds, roleIds, percentage },
      resultValue,
      priority
    );
    res.status(201).json({ success: true, data: rule });
  })
);

router.get(
  '/evaluate',
  authMiddleware,
  validate(evaluateSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId! || req.user!.organizationId || '';
    const { flagKey, userId } = req.query as { flagKey: string; userId: string };
    const enabled = await featureFlagsService.evaluate(flagKey, userId, tenantId);
    res.json({ success: true, data: { flagKey, userId, enabled } });
  })
);

export default router;
