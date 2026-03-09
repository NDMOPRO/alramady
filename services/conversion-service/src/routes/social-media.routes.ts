import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { SocialMediaPublisherService, SocialPlatform } from '../services/social-media-publisher.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();
const service = new SocialMediaPublisherService(prisma);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const platformSchema = z.enum(['twitter', 'linkedin', 'instagram']);

const PublishBody = z.object({
  platform: platformSchema,
  content: z.object({
    text: z.string().min(1, 'Post text is required').max(5000),
    imageUrl: z.string().url().optional(),
    link: z.string().url().optional(),
    hashtags: z.array(z.string()).optional(),
    altText: z.string().max(1000).optional(),
  }),
});

const ScheduleBody = z.object({
  platform: z.array(platformSchema).min(1, 'At least one platform is required'),
  content: z.object({
    text: z.string().min(1, 'Post text is required').max(5000),
    imageUrl: z.string().url().optional(),
    link: z.string().url().optional(),
    hashtags: z.array(z.string()).optional(),
    altText: z.string().max(1000).optional(),
  }),
  scheduledAt: z.string().refine((d) => !isNaN(Date.parse(d)), { message: 'scheduledAt must be a valid ISO date' }),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post(
  '/publish',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { platform, content } = PublishBody.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.userId;

    let result;
    switch (platform) {
      case 'twitter':
        result = await service.publishToTwitter(content, tenantId);
        break;
      case 'linkedin':
        result = await service.publishToLinkedIn(content, tenantId);
        break;
      case 'instagram':
        result = await service.publishToInstagram(content, tenantId);
        break;
    }

    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/schedule',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { platform, content, scheduledAt } = ScheduleBody.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.userId;
    const result = await service.schedulePost(content, platform, new Date(scheduledAt), tenantId);
    res.status(201).json({ success: true, data: result });
  }),
);

router.get(
  '/posts/:tenantId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.params.tenantId;
    const platform = (req.query.platform as SocialPlatform | undefined) || null;
    const page = parseInt(req.query.page as string) || 1;
    const result = await service.getPublishHistory(tenantId, platform, page);
    res.json({ success: true, data: result });
  }),
);

router.delete(
  '/post/:postId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const postId = req.params.postId;
    const result = await service.cancelScheduledPost(postId);
    res.json({ success: true, data: result });
  }),
);

router.get(
  '/analytics/:postId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const postId = req.params.postId;
    const result = await service.getPostAnalytics(postId);
    res.json({ success: true, data: result });
  }),
);

export default router;
