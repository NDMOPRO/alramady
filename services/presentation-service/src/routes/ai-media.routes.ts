import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { AIVideoGeneratorService } from '../services/ai-video-generator.service.js';
import { AIAvatarService } from '../services/ai-avatar.service.js';
import { AIVoiceoverService } from '../services/ai-voiceover.service.js';

const router = Router();
const prisma = new PrismaClient();
const videoService = new AIVideoGeneratorService();
const avatarService = new AIAvatarService();
const voiceoverService = new AIVoiceoverService(prisma);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const GenerateVideoBody = z.object({
  presentationId: z.string().min(1, 'Presentation ID is required'),
  options: z.object({
    voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional(),
    language: z.enum(['ar', 'en']).optional(),
    resolution: z.enum(['720p', '1080p']).optional(),
    transitionType: z.enum(['fade', 'slide', 'none']).optional(),
    slideDurationMs: z.number().int().min(1000).max(60000).optional(),
    includeNarration: z.boolean().optional(),
    backgroundMusic: z.string().optional(),
  }).optional().default({}),
});

const GenerateNarrationBody = z.object({
  presentationId: z.string().min(1, 'Presentation ID is required'),
  language: z.enum(['ar', 'en']).optional().default('ar'),
});

const GenerateAvatarBody = z.object({
  style: z.enum(['professional', 'casual', 'cartoon', 'custom']).default('professional'),
  gender: z.enum(['male', 'female', 'neutral']).default('neutral'),
  ageRange: z.enum(['young', 'middle', 'senior']).default('middle'),
  customDescription: z.string().max(1000).optional(),
  prompt: z.string().max(2000).optional(),
});

const AvatarVariationsBody = z.object({
  avatarId: z.string().uuid('Valid avatar ID is required'),
  count: z.number().int().min(1).max(4).default(2),
});

const AnimationSequenceBody = z.object({
  avatarId: z.string().uuid('Valid avatar ID is required'),
  narrationText: z.string().min(1, 'Narration text is required').max(5000),
});

// ─── Video Routes ────────────────────────────────────────────────────────────

router.post(
  '/video/generate',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, options } = GenerateVideoBody.parse(req.body);
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const result = await videoService.generateVideoFromPresentation({
      presentationId,
      tenantId,
      userId,
      ...options,
    });
    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/video/narration',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, language } = GenerateNarrationBody.parse(req.body);
    const result = await videoService.generateNarrationScript(presentationId, language);
    res.json({ success: true, data: result });
  }),
);

router.get(
  '/video/voices',
  authMiddleware,
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await videoService.listVoices();
    res.json({ success: true, data: result });
  }),
);

// ─── Avatar Routes ───────────────────────────────────────────────────────────

router.post(
  '/avatar/generate',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = GenerateAvatarBody.parse(req.body);
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const result = await avatarService.generateAvatar(
      {
        style: body.style as 'professional' | 'casual' | 'corporate' | 'arabic_traditional' | 'custom',
        gender: body.gender,
        ageRange: body.ageRange,
        customDescription: body.customDescription || body.prompt,
      },
      tenantId,
      userId,
    );
    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/avatar/variations',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { avatarId, count } = AvatarVariationsBody.parse(req.body);
    const tenantId = req.user!.organizationId || 'default';
    const result = await avatarService.generateAvatarVariations(avatarId, count, tenantId);
    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/avatar/animation',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { avatarId, narrationText } = AnimationSequenceBody.parse(req.body);
    const tenantId = req.user!.organizationId || 'default';
    const result = await avatarService.generateAnimationSequence(avatarId, narrationText, tenantId);
    res.status(201).json({ success: true, data: result });
  }),
);

router.get(
  '/avatars/:tenantId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.params.tenantId!;
    const result = await avatarService.listAvatars(tenantId);
    res.json({ success: true, data: result });
  }),
);

router.delete(
  '/avatar/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const avatarId = req.params.id!;
    const tenantId = req.user!.organizationId || 'default';
    await avatarService.deleteAvatar(avatarId, tenantId);
    res.json({ success: true, message: 'Avatar deleted' });
  }),
);

export default router;
