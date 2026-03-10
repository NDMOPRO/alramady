import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createInfographic,
  addSection,
  addStatistic,
  addTimeline,
  addComparison,
  addFlowchart,
  renderInfographic,
  exportToImage,
  exportToPDF,
} from '../services/infographic-builder.service.js';
import {
  generateFromData,
  generateFromText,
  suggestStyle,
} from '../services/ai-infographic.service.js';

const router = Router();
const prisma = new PrismaClient();

// --- Zod Schemas ---

const createInfographicSchema = z.object({
  name: z.string().min(1).max(255),
  template: z.enum(['modern', 'corporate', 'creative', 'minimal', 'dark']).default('modern'),
  dimensions: z.object({
    width: z.number().int().min(400).max(4000).default(1200),
    height: z.number().int().min(400).max(8000).default(1600),
  }).default({ width: 1200, height: 1600 }),
});

const updateInfographicSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  template: z.enum(['modern', 'corporate', 'creative', 'minimal', 'dark']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

const positionSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  w: z.number().min(10),
  h: z.number().min(10),
});

const addSectionSchema = z.object({
  type: z.enum(['header', 'stats', 'timeline', 'comparison', 'flowchart', 'text']),
  content: z.any(),
  position: positionSchema,
});

const addStatisticSchema = z.object({
  value: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  icon: z.string().min(1).max(50),
  position: positionSchema,
});

const addTimelineSchema = z.object({
  events: z.array(z.object({
    date: z.string().min(1),
    title: z.string().min(1).max(200),
    description: z.string().max(500).default(''),
  })).min(1),
  position: positionSchema,
});

const addComparisonSchema = z.object({
  items: z.array(z.object({
    name: z.string().min(1).max(100),
    values: z.record(z.any()),
  })).min(2),
  position: positionSchema,
});

const addFlowchartSchema = z.object({
  steps: z.array(z.object({
    title: z.string().min(1).max(100),
    description: z.string().max(300).default(''),
  })).min(2),
  position: positionSchema,
});

const generateFromDataSchema = z.object({
  datasetId: z.string().uuid(),
  style: z.enum(['modern', 'corporate', 'creative', 'minimal', 'dark']).default('modern'),
});

const generateFromTextSchema = z.object({
  text: z.string().min(10).max(10000),
  style: z.enum(['modern', 'corporate', 'creative', 'minimal', 'dark']).default('modern'),
});

const suggestStyleSchema = z.object({
  content: z.string().min(10).max(5000),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const exportQuerySchema = z.object({
  format: z.enum(['png', 'jpeg', 'webp']).default('png'),
  resolution: z.coerce.number().int().min(72).max(600).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'name']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// --- Helper ---

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// --- CRUD Routes ---

// POST /infographics
router.post(
  '/infographics',
  authMiddleware,
  validate(createInfographicSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, template, dimensions } = req.body;
    const tenantId = req.user!.organizationId || req.user!.userId;
    const userId = req.user!.userId;

    const infographic = await createInfographic(name, template, dimensions, tenantId, userId);

    res.status(201).json({
      success: true,
      data: infographic,
      message: 'Infographic created successfully',
    });
  })
);

// GET /infographics
router.get(
  '/infographics',
  authMiddleware,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, status, search, sortBy, sortOrder } = req.query as Record<string, string | undefined>;
    const tenantId = req.user!.organizationId || req.user!.userId;
    const skip = (parseInt(page || '1') - 1) * parseInt(limit || '20');
    const take = parseInt(limit || '20');

    const where: Record<string, unknown> = { tenantId: tenantId };
    if (status) where.status = status;
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const [infographics, total] = await Promise.all([
      (prisma as any).infographic.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy === 'created_at' ? 'createdAt' : sortBy === 'updated_at' ? 'updatedAt' : sortBy || 'createdAt']: sortOrder || 'desc' },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          version: true,
          thumbnail: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      (prisma as any).infographic.count({ where }),
    ]);

    const totalPages = Math.ceil(total / take);

    res.json({
      success: true,
      data: infographics,
      pagination: {
        page: parseInt(page || '1'),
        limit: take,
        total,
        totalPages,
        hasNext: parseInt(page || '1') < totalPages,
        hasPrev: parseInt(page || '1') > 1,
      },
    });
  })
);

// GET /infographics/:id
router.get(
  '/infographics/:id',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const tenantId = req.user!.organizationId || req.user!.userId;

    const infographic = await (prisma as any).infographic.findFirst({
      where: { id, tenantId: tenantId },
    });

    if (!infographic) {
      res.status(404).json({
        success: false,
        error: 'Infographic not found',
        code: 'INFOGRAPHIC_NOT_FOUND',
      });
      return;
    }

    const elementsJson = typeof infographic.elements_json === 'string'
      ? JSON.parse(infographic.elements_json)
      : infographic.elements_json || [];

    res.json({
      success: true,
      data: {
        ...infographic,
        elements: elementsJson,
        elementCount: elementsJson.length,
      },
    });
  })
);

// PUT /infographics/:id
router.put(
  '/infographics/:id',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(updateInfographicSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const tenantId = req.user!.organizationId || req.user!.userId;
    const updates = req.body;

    const existing = await (prisma as any).infographic.findFirst({
      where: { id, tenantId: tenantId },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: 'Infographic not found',
        code: 'INFOGRAPHIC_NOT_FOUND',
      });
      return;
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name !== undefined) updateData.title = updates.name;
    if (updates.template !== undefined) updateData.type = updates.template;
    if (updates.status !== undefined) updateData.status = updates.status;

    const updated = await (prisma as any).infographic.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      data: updated,
      message: 'Infographic updated successfully',
    });
  })
);

// DELETE /infographics/:id
router.delete(
  '/infographics/:id',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const tenantId = req.user!.organizationId || req.user!.userId;

    const existing = await (prisma as any).infographic.findFirst({
      where: { id, tenantId: tenantId },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: 'Infographic not found',
        code: 'INFOGRAPHIC_NOT_FOUND',
      });
      return;
    }

    await (prisma as any).infographic.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Infographic deleted successfully',
      data: { id },
    });
  })
);

// --- Element Routes ---

// POST /infographics/:id/sections
router.post(
  '/infographics/:id/sections',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(addSectionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { type, content, position } = req.body;

    const result = await addSection(id, type, content, position);

    res.status(201).json({
      success: true,
      data: result,
      message: `Section of type '${type}' added successfully`,
    });
  })
);

// POST /infographics/:id/statistics
router.post(
  '/infographics/:id/statistics',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(addStatisticSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { value, label, icon, position } = req.body;

    const result = await addStatistic(id, value, label, icon, position);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Statistic element added successfully',
    });
  })
);

// POST /infographics/:id/timeline
router.post(
  '/infographics/:id/timeline',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(addTimelineSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { events, position } = req.body;

    const result = await addTimeline(id, events, position);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Timeline element added successfully',
    });
  })
);

// POST /infographics/:id/comparison
router.post(
  '/infographics/:id/comparison',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(addComparisonSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { items, position } = req.body;

    const result = await addComparison(id, items, position);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Comparison element added successfully',
    });
  })
);

// POST /infographics/:id/flowchart
router.post(
  '/infographics/:id/flowchart',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(addFlowchartSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { steps, position } = req.body;

    const result = await addFlowchart(id, steps, position);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Flowchart element added successfully',
    });
  })
);

// --- Render Route ---

// GET /infographics/:id/render
router.get(
  '/infographics/:id/render',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const buffer = await renderInfographic(id);

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': String(buffer.length),
      'Content-Disposition': `inline; filename="infographic-${id.substring(0, 8)}.png"`,
      'Cache-Control': 'no-cache',
    });
    res.send(buffer);
  })
);

// --- Export Routes ---

// GET /infographics/:id/export/image
router.get(
  '/infographics/:id/export/image',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(exportQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const format = (req.query.format as 'png' | 'jpeg' | 'webp') || 'png';
    const resolution = req.query.resolution ? parseInt(req.query.resolution as string) : undefined;

    const result = await exportToImage(id, format, resolution);

    res.set({
      'Content-Type': result.contentType,
      'Content-Length': String(result.buffer.length),
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-cache',
    });
    res.send(result.buffer);
  })
);

// GET /infographics/:id/export/pdf
router.get(
  '/infographics/:id/export/pdf',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await exportToPDF(id);

    res.set({
      'Content-Type': result.contentType,
      'Content-Length': String(result.buffer.length),
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-cache',
    });
    res.send(result.buffer);
  })
);

// --- AI Routes ---

// POST /ai/generate-from-data
router.post(
  '/ai/generate-from-data',
  authMiddleware,
  validate(generateFromDataSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { datasetId, style } = req.body;
    const tenantId = req.user!.organizationId || req.user!.userId;
    const userId = req.user!.userId;

    const result = await generateFromData(datasetId, style, tenantId, userId);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Infographic generated from dataset successfully',
    });
  })
);

// POST /ai/generate-from-text
router.post(
  '/ai/generate-from-text',
  authMiddleware,
  validate(generateFromTextSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { text, style } = req.body;
    const tenantId = req.user!.organizationId || req.user!.userId;
    const userId = req.user!.userId;

    const result = await generateFromText(text, style, tenantId, userId);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Infographic generated from text successfully',
    });
  })
);

// POST /ai/suggest-style
router.post(
  '/ai/suggest-style',
  authMiddleware,
  validate(suggestStyleSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { content } = req.body;

    const result = await suggestStyle(content);

    res.json({
      success: true,
      data: result,
      message: 'Style suggestion generated successfully',
    });
  })
);

export default router;
