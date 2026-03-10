import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { WebsiteBuilderService } from '../services/website-builder.service.js';

const router = Router();
const service = new WebsiteBuilderService();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const GenerateWebsiteBody = z.object({
  presentationId: z.string().min(1, 'Presentation ID is required'),
  options: z.object({
    theme: z.enum(['modern', 'corporate', 'minimal', 'arabic', 'dark']).optional(),
    primaryColor: z.string().min(4).optional(),
    secondaryColor: z.string().min(4).optional(),
    fontFamily: z.string().optional(),
    includeNavigation: z.boolean().optional(),
    includeFooter: z.boolean().optional(),
    responsiveBreakpoints: z.boolean().optional(),
    seoOptimize: z.boolean().optional(),
    language: z.enum(['ar', 'en']).optional(),
  }).optional().default({}),
});

const GenerateLandingPageBody = z.object({
  presentationId: z.string().min(1, 'Presentation ID is required'),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post(
  '/generate',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, options } = GenerateWebsiteBody.parse(req.body);
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const result = await service.generateWebsite(presentationId, options, tenantId, userId);
    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/landing-page',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = GenerateLandingPageBody.parse(req.body);
    const tenantId = req.user!.organizationId || 'default';
    const result = await service.generateLandingPage(presentationId, tenantId);
    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/export/:websiteId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const websiteId = req.params.websiteId!;
    const buffer = await service.exportStaticSite(websiteId);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="website-${websiteId}.zip"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  }),
);

router.post(
  '/seo/:websiteId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const websiteId = req.params.websiteId!;
    const result = await service.generateSEOMetadata(websiteId);
    res.json({ success: true, data: result });
  }),
);

router.get(
  '/list/:tenantId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.params.tenantId!;
    const result = await service.listWebsites(tenantId);
    res.json({ success: true, data: result });
  }),
);

export default router;
