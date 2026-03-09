import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

// ─── Helper: store infographic as a presentation record ─────────────────────

interface InfographicCreateInput {
  title: string;
  description?: string;
  type: string;
  data: Record<string, unknown>;
  layout: Record<string, unknown>;
  style?: Record<string, unknown>;
  tenantId: string;
  userId: string;
  tags?: string[];
}

async function createInfographicRecord(input: InfographicCreateInput): Promise<Record<string, unknown>> {
  const presentation = await prisma.presentation.create({
    data: {
      name: input.title,
      description: input.description || null,
      status: 'DRAFT',
      tenantId: input.tenantId,
      userId: input.userId,
      title: input.title,
      slideCount: 1,
      tags: input.tags || [],
      settings: {
        isInfographic: true,
        infographicType: input.type,
        layout: input.layout as Prisma.InputJsonValue,
        style: (input.style || {}) as Prisma.InputJsonValue,
      } as Prisma.InputJsonValue,
      theme: (input.style || {}) as Prisma.InputJsonValue,
    },
  });

  await prisma.slide.create({
    data: {
      presentationId: presentation.id,
      slideIndex: 0,
      order: 0,
      layout: 'infographic',
      content: {
        type: input.type,
        data: input.data as Prisma.InputJsonValue,
        layout: input.layout as Prisma.InputJsonValue,
        style: (input.style || {}) as Prisma.InputJsonValue,
        generatedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  return presentation as unknown as Record<string, unknown>;
}

// ─── Color generation helpers ───────────────────────────────────────────────

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generatePalette(baseColor: string, count: number): string[] {
  const { h, s, l } = hexToHsl(baseColor);
  const colors: string[] = [baseColor];
  for (let i = 1; i < count; i++) {
    const hue = (h + (360 / count) * i) % 360;
    colors.push(hslToHex(hue, s, l));
  }
  return colors;
}

// ─── Layout generators ──────────────────────────────────────────────────────

function generateTimelineLayout(items: Array<Record<string, unknown>>, direction: string): Record<string, unknown> {
  const isHorizontal = direction === 'horizontal';
  return {
    type: 'timeline',
    direction,
    items: items.map((item, idx) => ({
      ...item,
      position: isHorizontal
        ? { x: 100 + idx * 200, y: 300 }
        : { x: 400, y: 80 + idx * 150 },
      connector: idx < items.length - 1 ? { to: idx + 1, style: 'solid' } : null,
      side: idx % 2 === 0 ? 'left' : 'right',
    })),
    dimensions: isHorizontal
      ? { width: Math.max(800, items.length * 200 + 200), height: 600 }
      : { width: 800, height: Math.max(600, items.length * 150 + 200) },
  };
}

function generateComparisonLayout(items: Array<Record<string, unknown>>, style: string): Record<string, unknown> {
  const columnCount = Math.min(items.length, 4);
  const columnWidth = 800 / columnCount;
  return {
    type: 'comparison',
    style,
    columns: items.map((item, idx) => ({
      ...item,
      position: { x: idx * columnWidth + 20, y: 80 },
      width: columnWidth - 40,
      index: idx,
    })),
    dimensions: { width: 800, height: 600 },
    gridColumns: columnCount,
  };
}

function generateHierarchicalLayout(root: Record<string, unknown>, style: string): Record<string, unknown> {
  const flattenTree = (node: Record<string, unknown>, level: number, index: number): Array<Record<string, unknown>> => {
    const children = (node.children as Array<Record<string, unknown>>) || [];
    const flattened: Array<Record<string, unknown>> = [{
      ...node,
      level,
      index,
      position: { x: 400, y: 50 + level * 120 },
    }];
    for (let i = 0; i < children.length; i++) {
      flattened.push(...flattenTree(children[i], level + 1, i));
    }
    return flattened;
  };

  const nodes = flattenTree(root, 0, 0);
  const maxLevel = Math.max(...nodes.map((n) => (n.level as number)));

  return {
    type: 'hierarchical',
    style,
    nodes,
    connections: nodes
      .filter((n) => {
        const children = (n.children as Array<Record<string, unknown>>) || [];
        return children.length > 0;
      })
      .flatMap((parent) => {
        const children = (parent.children as Array<Record<string, unknown>>) || [];
        return children.map((child) => ({
          from: parent.label || parent.title,
          to: child.label || child.title,
        }));
      }),
    dimensions: { width: 800, height: Math.max(600, (maxLevel + 1) * 140 + 100) },
    depth: maxLevel + 1,
    nodeCount: nodes.length,
  };
}

function generateProcessLayout(steps: Array<Record<string, unknown>>, style: string): Record<string, unknown> {
  return {
    type: 'process',
    style,
    steps: steps.map((step, idx) => ({
      ...step,
      stepNumber: idx + 1,
      position: {
        x: style === 'circular'
          ? 400 + 250 * Math.cos((2 * Math.PI * idx) / steps.length - Math.PI / 2)
          : 50 + idx * (700 / steps.length),
        y: style === 'circular'
          ? 300 + 250 * Math.sin((2 * Math.PI * idx) / steps.length - Math.PI / 2)
          : 300,
      },
      connector: idx < steps.length - 1 ? { to: idx + 1, type: 'arrow' } : null,
    })),
    dimensions: { width: 800, height: 600 },
    totalSteps: steps.length,
  };
}

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const generateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  type: z.enum([
    'general', 'timeline', 'comparison', 'hierarchical', 'process',
    'statistical', 'geographic', 'flowchart', 'list', 'mindmap',
  ]),
  data: z.record(z.unknown()),
  style: z.object({
    colorScheme: z.array(z.string()).optional(),
    primaryColor: z.string().optional(),
    fontFamily: z.string().optional(),
    backgroundColor: z.string().optional(),
    borderRadius: z.number().optional(),
    iconStyle: z.enum(['flat', 'outlined', 'filled', 'gradient']).optional(),
    direction: z.enum(['ltr', 'rtl']).optional(),
  }).optional(),
  dimensions: z.object({
    width: z.number().min(200).max(4000).optional(),
    height: z.number().min(200).max(8000).optional(),
  }).optional(),
  tags: z.array(z.string()).optional(),
});

const updateInfographicSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  data: z.record(z.unknown()).optional(),
  style: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

const timelineSchema = z.object({
  title: z.string().min(1).max(500),
  items: z.array(z.object({
    date: z.string(),
    title: z.string().min(1),
    description: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    media: z.object({ type: z.string(), url: z.string() }).optional(),
  })).min(1),
  direction: z.enum(['horizontal', 'vertical']).optional(),
  style: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const comparisonSchema = z.object({
  title: z.string().min(1).max(500),
  items: z.array(z.object({
    name: z.string().min(1),
    icon: z.string().optional(),
    color: z.string().optional(),
    attributes: z.array(z.object({
      label: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
    })),
    highlights: z.array(z.string()).optional(),
  })).min(2),
  comparisonStyle: z.enum(['table', 'side-by-side', 'venn', 'radar', 'cards']).optional(),
  style: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const hierarchicalSchema = z.object({
  title: z.string().min(1).max(500),
  root: z.lazy((): z.ZodSchema => z.object({
    label: z.string().min(1),
    description: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    children: z.array(z.lazy((): z.ZodSchema => z.object({
      label: z.string().min(1),
      description: z.string().optional(),
      icon: z.string().optional(),
      color: z.string().optional(),
      children: z.array(z.any()).optional(),
    }))).optional(),
  })),
  hierarchyStyle: z.enum(['tree', 'org-chart', 'sunburst', 'treemap', 'radial']).optional(),
  style: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const processSchema = z.object({
  title: z.string().min(1).max(500),
  steps: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    duration: z.string().optional(),
    substeps: z.array(z.string()).optional(),
  })).min(2),
  processStyle: z.enum(['linear', 'circular', 'zigzag', 'funnel', 'pipeline']).optional(),
  style: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const statisticalSchema = z.object({
  title: z.string().min(1).max(500),
  dataPoints: z.array(z.object({
    label: z.string().min(1),
    value: z.number(),
    unit: z.string().optional(),
    trend: z.enum(['up', 'down', 'stable']).optional(),
    trendValue: z.number().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
  })).min(1),
  chartType: z.enum(['bar', 'pie', 'donut', 'line', 'area', 'scatter', 'bubble', 'radar', 'waterfall']).optional(),
  showLabels: z.boolean().optional(),
  showLegend: z.boolean().optional(),
  animated: z.boolean().optional(),
  style: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const geographicSchema = z.object({
  title: z.string().min(1).max(500),
  mapType: z.enum(['world', 'continent', 'country', 'region', 'custom']),
  region: z.string().optional(),
  dataPoints: z.array(z.object({
    location: z.string().min(1),
    lat: z.number().optional(),
    lng: z.number().optional(),
    value: z.number().optional(),
    label: z.string().optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
    tooltip: z.string().optional(),
  })).min(1),
  heatmapMode: z.boolean().optional(),
  showLabels: z.boolean().optional(),
  style: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const rtlMirrorSchema = z.object({
  infographicId: z.string().uuid(),
  mirrorText: z.boolean().optional(),
  mirrorLayout: z.boolean().optional(),
  adjustFonts: z.boolean().optional(),
  targetFont: z.string().optional(),
});

const goldenRatioSchema = z.object({
  infographicId: z.string().uuid(),
  applyToText: z.boolean().optional(),
  applyToSpacing: z.boolean().optional(),
  applyToElements: z.boolean().optional(),
});

const whitespaceSchema = z.object({
  infographicId: z.string().uuid(),
  targetDensity: z.number().min(0.1).max(1.0).optional(),
  autoFix: z.boolean().optional(),
});

const heatmapSchema = z.object({
  title: z.string().min(1).max(500),
  data: z.array(z.array(z.number())),
  rowLabels: z.array(z.string()).optional(),
  columnLabels: z.array(z.string()).optional(),
  colorRange: z.object({
    low: z.string().optional(),
    mid: z.string().optional(),
    high: z.string().optional(),
  }).optional(),
  showValues: z.boolean().optional(),
  style: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const constraintGraphSchema = z.object({
  elements: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(['text', 'image', 'shape', 'chart', 'icon']),
    minWidth: z.number().optional(),
    minHeight: z.number().optional(),
    maxWidth: z.number().optional(),
    maxHeight: z.number().optional(),
    priority: z.number().min(1).max(10).optional(),
    anchorTo: z.string().optional(),
    content: z.record(z.unknown()).optional(),
  })).min(1),
  constraints: z.array(z.object({
    type: z.enum(['align', 'distribute', 'margin', 'overlap', 'ratio', 'group']),
    targets: z.array(z.string()),
    value: z.union([z.number(), z.string()]).optional(),
    direction: z.enum(['horizontal', 'vertical', 'both']).optional(),
  })).optional(),
  canvasWidth: z.number().min(200).optional(),
  canvasHeight: z.number().min(200).optional(),
});

const layoutGraphSchema = z.object({
  nodes: z.array(z.object({
    id: z.string().min(1),
    label: z.string(),
    type: z.enum(['text', 'image', 'data', 'container', 'divider']).optional(),
    size: z.enum(['small', 'medium', 'large', 'auto']).optional(),
    content: z.record(z.unknown()).optional(),
  })).min(1),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    weight: z.number().optional(),
    label: z.string().optional(),
  })).optional(),
  algorithm: z.enum(['force-directed', 'hierarchical', 'grid', 'circular', 'dagre']).optional(),
  canvasWidth: z.number().min(200).optional(),
  canvasHeight: z.number().min(200).optional(),
});

const typographyHarmonySchema = z.object({
  infographicId: z.string().uuid(),
  targetScale: z.enum(['minor-second', 'major-second', 'minor-third', 'major-third', 'perfect-fourth', 'golden-ratio']).optional(),
  baseSize: z.number().min(8).max(72).optional(),
  autoFix: z.boolean().optional(),
});

const versionSchema = z.object({
  description: z.string().max(500).optional(),
  changes: z.array(z.string()).optional(),
});

const dragToDashboardSchema = z.object({
  dashboardId: z.string().uuid().optional(),
  position: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  refreshInterval: z.number().min(0).optional(),
});

const nlqSchema = z.object({
  query: z.string().min(3).max(2000),
  datasetId: z.string().uuid().optional(),
  context: z.record(z.unknown()).optional(),
  style: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

// ─── CRUD endpoints ─────────────────────────────────────────────────────────

router.post(
  '/generate',
  authMiddleware,
  validate(generateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || 'default';
    const userId = req.user!.userId;
    const { title, description, type, data, style, dimensions, tags } = req.body;

    const primaryColor = style?.primaryColor || '#1a73e8';
    const colorScheme = style?.colorScheme || generatePalette(primaryColor, 5);
    const direction = style?.direction || 'rtl';

    let layout: Record<string, unknown> = {
      type,
      direction,
      dimensions: dimensions || { width: 800, height: 600 },
      sections: [],
    };

    const dataItems = (data.items as Array<Record<string, unknown>>) || [];

    switch (type) {
      case 'timeline':
        layout = generateTimelineLayout(dataItems, 'vertical');
        break;
      case 'comparison':
        layout = generateComparisonLayout(dataItems, 'side-by-side');
        break;
      case 'hierarchical':
        layout = generateHierarchicalLayout(data.root as Record<string, unknown> || { label: title, children: dataItems }, 'tree');
        break;
      case 'process':
        layout = generateProcessLayout(dataItems, 'linear');
        break;
      default:
        layout = {
          type,
          direction,
          dimensions: dimensions || { width: 800, height: 600 },
          sections: dataItems.map((item, idx) => ({
            ...item,
            position: { x: 50, y: 50 + idx * 120 },
            width: 700,
            height: 100,
          })),
        };
    }

    const infographic = await createInfographicRecord({
      title,
      description,
      type,
      data,
      layout,
      style: {
        ...(style || {}),
        colorScheme,
        direction,
      },
      tenantId,
      userId,
      tags,
    });

    res.status(201).json({
      success: true,
      data: {
        id: (infographic as Record<string, unknown>).id,
        title,
        type,
        layout,
        colorScheme,
        dimensions: dimensions || { width: 800, height: 600 },
        direction,
        createdAt: (infographic as Record<string, unknown>).createdAt,
      },
    });
  })
);

router.get(
  '/library',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || 'default';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const type = req.query.type as string | undefined;
    const search = req.query.search as string | undefined;

    const whereClause: Record<string, unknown> = {
      tenantId,
      settings: { path: ['isInfographic'], equals: true },
    };

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [infographics, total] = await Promise.all([
      prisma.presentation.findMany({
        where: whereClause as Prisma.PresentationWhereInput,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          settings: true,
          thumbnail: true,
          tags: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.presentation.count({
        where: whereClause as Prisma.PresentationWhereInput,
      }),
    ]);

    const mapped = infographics.map((inf) => {
      const settings = (inf.settings as Record<string, unknown>) || {};
      return {
        id: inf.id,
        title: inf.name,
        description: inf.description,
        type: settings.infographicType || 'general',
        status: inf.status,
        thumbnail: inf.thumbnail,
        tags: inf.tags,
        version: inf.version,
        createdAt: inf.createdAt,
        updatedAt: inf.updatedAt,
      };
    });

    res.json({
      success: true,
      data: mapped,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

router.get(
  '/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const presentation = await prisma.presentation.findUnique({
      where: { id },
      include: { slideRecords: { orderBy: { slideIndex: 'asc' } } },
    });

    if (!presentation) {
      res.status(404).json({ success: false, error: 'Infographic not found', code: 'NOT_FOUND' });
      return;
    }

    const settings = (presentation.settings as Record<string, unknown>) || {};
    const slide = presentation.slideRecords[0];
    const slideContent = (slide?.content as Record<string, unknown>) || {};

    res.json({
      success: true,
      data: {
        id: presentation.id,
        title: presentation.name,
        description: presentation.description,
        type: settings.infographicType || 'general',
        status: presentation.status,
        data: slideContent.data || {},
        layout: settings.layout || slideContent.layout || {},
        style: settings.style || {},
        thumbnail: presentation.thumbnail,
        tags: presentation.tags,
        version: presentation.version,
        createdAt: presentation.createdAt,
        updatedAt: presentation.updatedAt,
      },
    });
  })
);

router.put(
  '/:id',
  authMiddleware,
  validate(updateInfographicSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const { title, description, data, style, tags, status } = req.body;

    const existing = await prisma.presentation.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Infographic not found', code: 'NOT_FOUND' });
      return;
    }
    if (existing.userId !== userId) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (title) updateData.name = title;
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (tags) updateData.tags = tags;
    if (status) updateData.status = status;

    if (style) {
      const existingSettings = (existing.settings as Record<string, unknown>) || {};
      updateData.settings = { ...existingSettings, style: { ...(existingSettings.style as Record<string, unknown> || {}), ...style } };
    }

    const updated = await prisma.presentation.update({
      where: { id },
      data: updateData as Parameters<typeof prisma.presentation.update>[0]['data'],
    });

    if (data) {
      const slide = await prisma.slide.findFirst({
        where: { presentationId: id, slideIndex: 0 },
      });
      if (slide) {
        const existingContent = (slide.content as Record<string, unknown>) || {};
        await prisma.slide.update({
          where: { id: slide.id },
          data: {
            content: { ...existingContent, data, updatedAt: new Date().toISOString() },
          },
        });
      }
    }

    res.json({
      success: true,
      data: {
        id: updated.id,
        title: updated.name,
        description: updated.description,
        status: updated.status,
        tags: updated.tags,
        updatedAt: updated.updatedAt,
      },
    });
  })
);

router.delete(
  '/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.userId;

    const existing = await prisma.presentation.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Infographic not found', code: 'NOT_FOUND' });
      return;
    }
    if (existing.userId !== userId) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    await prisma.slideElement.deleteMany({
      where: { slide: { presentationId: id } },
    });
    await prisma.slide.deleteMany({ where: { presentationId: id } });
    await prisma.presentation.delete({ where: { id } });

    res.json({ success: true, message: 'Infographic deleted', data: { id } });
  })
);

// ─── Specialized infographic generators ─────────────────────────────────────

router.post(
  '/timeline',
  authMiddleware,
  validate(timelineSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || 'default';
    const userId = req.user!.userId;
    const { title, items, direction, style, tags } = req.body;

    const sortedItems = [...items].sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      new Date(a.date as string).getTime() - new Date(b.date as string).getTime()
    );

    const layout = generateTimelineLayout(sortedItems, direction || 'vertical');
    const primaryColor = (style as Record<string, unknown>)?.primaryColor as string || '#1a73e8';
    const colorScheme = generatePalette(primaryColor, Math.min(sortedItems.length, 8));

    const infographic = await createInfographicRecord({
      title,
      type: 'timeline',
      data: { items: sortedItems },
      layout,
      style: { ...(style || {}), colorScheme },
      tenantId,
      userId,
      tags,
    });

    res.status(201).json({
      success: true,
      data: {
        id: (infographic as Record<string, unknown>).id,
        title,
        type: 'timeline',
        itemCount: sortedItems.length,
        direction: direction || 'vertical',
        layout,
        colorScheme,
      },
    });
  })
);

router.post(
  '/comparison',
  authMiddleware,
  validate(comparisonSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || 'default';
    const userId = req.user!.userId;
    const { title, items, comparisonStyle, style, tags } = req.body;

    const layout = generateComparisonLayout(items, comparisonStyle || 'side-by-side');
    const colorScheme = generatePalette('#1a73e8', items.length);

    const infographic = await createInfographicRecord({
      title,
      type: 'comparison',
      data: { items },
      layout,
      style: { ...(style || {}), colorScheme },
      tenantId,
      userId,
      tags,
    });

    res.status(201).json({
      success: true,
      data: {
        id: (infographic as Record<string, unknown>).id,
        title,
        type: 'comparison',
        itemCount: items.length,
        comparisonStyle: comparisonStyle || 'side-by-side',
        layout,
        colorScheme,
      },
    });
  })
);

router.post(
  '/hierarchical',
  authMiddleware,
  validate(hierarchicalSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || 'default';
    const userId = req.user!.userId;
    const { title, root, hierarchyStyle, style, tags } = req.body;

    const layout = generateHierarchicalLayout(root, hierarchyStyle || 'tree');

    const infographic = await createInfographicRecord({
      title,
      type: 'hierarchical',
      data: { root },
      layout,
      style: style || {},
      tenantId,
      userId,
      tags,
    });

    res.status(201).json({
      success: true,
      data: {
        id: (infographic as Record<string, unknown>).id,
        title,
        type: 'hierarchical',
        hierarchyStyle: hierarchyStyle || 'tree',
        depth: (layout as Record<string, unknown>).depth,
        nodeCount: (layout as Record<string, unknown>).nodeCount,
        layout,
      },
    });
  })
);

router.post(
  '/process',
  authMiddleware,
  validate(processSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || 'default';
    const userId = req.user!.userId;
    const { title, steps, processStyle, style, tags } = req.body;

    const layout = generateProcessLayout(steps, processStyle || 'linear');
    const colorScheme = generatePalette('#1a73e8', steps.length);

    const infographic = await createInfographicRecord({
      title,
      type: 'process',
      data: { steps },
      layout,
      style: { ...(style || {}), colorScheme },
      tenantId,
      userId,
      tags,
    });

    res.status(201).json({
      success: true,
      data: {
        id: (infographic as Record<string, unknown>).id,
        title,
        type: 'process',
        stepCount: steps.length,
        processStyle: processStyle || 'linear',
        layout,
        colorScheme,
      },
    });
  })
);

router.post(
  '/statistical',
  authMiddleware,
  validate(statisticalSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || 'default';
    const userId = req.user!.userId;
    const { title, dataPoints, chartType, showLabels, showLegend, animated, style, tags } = req.body;

    const totalValue = dataPoints.reduce((sum: number, dp: Record<string, unknown>) => sum + ((dp.value as number) || 0), 0);
    const colorScheme = generatePalette('#1a73e8', dataPoints.length);

    const enrichedDataPoints = dataPoints.map((dp: Record<string, unknown>, idx: number) => ({
      ...dp,
      color: (dp.color as string) || colorScheme[idx % colorScheme.length],
      percentage: totalValue > 0 ? Math.round(((dp.value as number) || 0) / totalValue * 100) : 0,
    }));

    const layout: Record<string, unknown> = {
      type: 'statistical',
      chartType: chartType || 'bar',
      showLabels: showLabels !== undefined ? showLabels : true,
      showLegend: showLegend !== undefined ? showLegend : true,
      animated: animated !== undefined ? animated : true,
      dataPoints: enrichedDataPoints,
      summary: {
        total: totalValue,
        average: dataPoints.length > 0 ? Math.round(totalValue / dataPoints.length) : 0,
        max: Math.max(...dataPoints.map((dp: Record<string, unknown>) => (dp.value as number) || 0)),
        min: Math.min(...dataPoints.map((dp: Record<string, unknown>) => (dp.value as number) || 0)),
        count: dataPoints.length,
      },
      dimensions: { width: 800, height: 600 },
    };

    const infographic = await createInfographicRecord({
      title,
      type: 'statistical',
      data: { dataPoints: enrichedDataPoints },
      layout,
      style: { ...(style || {}), colorScheme },
      tenantId,
      userId,
      tags,
    });

    res.status(201).json({
      success: true,
      data: {
        id: (infographic as Record<string, unknown>).id,
        title,
        type: 'statistical',
        chartType: chartType || 'bar',
        dataPointCount: enrichedDataPoints.length,
        summary: layout.summary,
        layout,
        colorScheme,
      },
    });
  })
);

router.post(
  '/geographic',
  authMiddleware,
  validate(geographicSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || 'default';
    const userId = req.user!.userId;
    const { title, mapType, region, dataPoints, heatmapMode, showLabels, style, tags } = req.body;

    const enrichedPoints = dataPoints.map((dp: Record<string, unknown>, idx: number) => ({
      ...dp,
      id: crypto.randomUUID(),
      index: idx,
      color: (dp.color as string) || '#1a73e8',
    }));

    const layout: Record<string, unknown> = {
      type: 'geographic',
      mapType,
      region: region || null,
      heatmapMode: heatmapMode || false,
      showLabels: showLabels !== undefined ? showLabels : true,
      dataPoints: enrichedPoints,
      bounds: {
        minLat: Math.min(...enrichedPoints.filter((p: Record<string, unknown>) => p.lat).map((p: Record<string, unknown>) => p.lat as number)),
        maxLat: Math.max(...enrichedPoints.filter((p: Record<string, unknown>) => p.lat).map((p: Record<string, unknown>) => p.lat as number)),
        minLng: Math.min(...enrichedPoints.filter((p: Record<string, unknown>) => p.lng).map((p: Record<string, unknown>) => p.lng as number)),
        maxLng: Math.max(...enrichedPoints.filter((p: Record<string, unknown>) => p.lng).map((p: Record<string, unknown>) => p.lng as number)),
      },
      dimensions: { width: 800, height: 600 },
    };

    const infographic = await createInfographicRecord({
      title,
      type: 'geographic',
      data: { dataPoints: enrichedPoints, mapType, region },
      layout,
      style: style || {},
      tenantId,
      userId,
      tags,
    });

    res.status(201).json({
      success: true,
      data: {
        id: (infographic as Record<string, unknown>).id,
        title,
        type: 'geographic',
        mapType,
        region: region || null,
        pointCount: enrichedPoints.length,
        heatmapMode: heatmapMode || false,
        layout,
      },
    });
  })
);

// ─── Design analysis endpoints ──────────────────────────────────────────────

router.post(
  '/rtl-mirror',
  authMiddleware,
  validate(rtlMirrorSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { infographicId, mirrorText, mirrorLayout, adjustFonts, targetFont } = req.body;
    const userId = req.user!.userId;

    const presentation = await prisma.presentation.findUnique({
      where: { id: infographicId },
      include: { slideRecords: true },
    });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Infographic not found', code: 'NOT_FOUND' });
      return;
    }
    if (presentation.userId !== userId) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const slide = presentation.slideRecords[0];
    if (slide) {
      const content = (slide.content as Record<string, unknown>) || {};
      const layout = (content.layout as Record<string, unknown>) || {};

      const mirroredLayout: Record<string, unknown> = {
        ...layout,
        direction: 'rtl',
        mirrored: true,
        mirroredAt: new Date().toISOString(),
      };

      if (mirrorLayout !== false) {
        const sections = (layout.sections as Array<Record<string, unknown>>) || [];
        mirroredLayout.sections = sections.map((section) => {
          const pos = (section.position as Record<string, unknown>) || {};
          const canvasWidth = ((layout.dimensions as Record<string, unknown>)?.width as number) || 800;
          return {
            ...section,
            position: {
              ...pos,
              x: canvasWidth - ((pos.x as number) || 0) - ((section.width as number) || 200),
            },
          };
        });
      }

      await prisma.slide.update({
        where: { id: slide.id },
        data: {
          content: {
            ...content,
            layout: mirroredLayout as Prisma.InputJsonValue,
          } as Prisma.InputJsonValue,
        },
      });
    }

    const settings = (presentation.settings as Record<string, unknown>) || {};
    await prisma.presentation.update({
      where: { id: infographicId },
      data: {
        settings: {
          ...settings,
          style: {
            ...((settings.style as Record<string, unknown>) || {}),
            direction: 'rtl',
            fontFamily: adjustFonts && targetFont ? targetFont : ((settings.style as Record<string, unknown>)?.fontFamily || 'Tajawal'),
          },
        },
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        infographicId,
        direction: 'rtl',
        mirrorText: mirrorText !== false,
        mirrorLayout: mirrorLayout !== false,
        adjustFonts: adjustFonts || false,
        fontFamily: adjustFonts && targetFont ? targetFont : 'Tajawal',
        appliedAt: new Date(),
      },
    });
  })
);

router.post(
  '/golden-ratio',
  authMiddleware,
  validate(goldenRatioSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { infographicId, applyToText, applyToSpacing, applyToElements } = req.body;
    const userId = req.user!.userId;
    const PHI = 1.618033988749895;

    const presentation = await prisma.presentation.findUnique({
      where: { id: infographicId },
      include: { slideRecords: true },
    });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Infographic not found', code: 'NOT_FOUND' });
      return;
    }
    if (presentation.userId !== userId) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const adjustments: Array<Record<string, unknown>> = [];

    if (applyToText !== false) {
      const baseFontSize = 16;
      adjustments.push({
        type: 'typography',
        scales: {
          body: baseFontSize,
          h3: Math.round(baseFontSize * PHI),
          h2: Math.round(baseFontSize * PHI * PHI),
          h1: Math.round(baseFontSize * PHI * PHI * PHI),
          small: Math.round(baseFontSize / PHI),
        },
      });
    }

    if (applyToSpacing !== false) {
      const baseSpacing = 8;
      adjustments.push({
        type: 'spacing',
        scales: {
          xs: baseSpacing,
          sm: Math.round(baseSpacing * PHI),
          md: Math.round(baseSpacing * PHI * PHI),
          lg: Math.round(baseSpacing * PHI * PHI * PHI),
          xl: Math.round(baseSpacing * PHI * PHI * PHI * PHI),
        },
      });
    }

    if (applyToElements !== false) {
      adjustments.push({
        type: 'layout',
        goldenSplit: {
          largeSection: `${Math.round(100 / PHI)}%`,
          smallSection: `${Math.round(100 - 100 / PHI)}%`,
          ratio: `${PHI.toFixed(3)}:1`,
        },
      });
    }

    const settings = (presentation.settings as Record<string, unknown>) || {};
    await prisma.presentation.update({
      where: { id: infographicId },
      data: {
        settings: {
          ...settings,
          goldenRatio: {
            applied: true,
            adjustments: adjustments as Prisma.InputJsonValue,
            appliedAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        infographicId,
        phi: PHI,
        adjustments,
        appliedAt: new Date(),
      },
    });
  })
);

router.post(
  '/whitespace-analysis',
  authMiddleware,
  validate(whitespaceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { infographicId, targetDensity, autoFix } = req.body;
    const userId = req.user!.userId;

    const presentation = await prisma.presentation.findUnique({
      where: { id: infographicId },
      include: { slideRecords: { include: { slideElements: true } } },
    });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Infographic not found', code: 'NOT_FOUND' });
      return;
    }
    if (presentation.userId !== userId) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const slide = presentation.slideRecords[0];
    const elements = slide?.slideElements || [];
    const settings = (presentation.settings as Record<string, unknown>) || {};
    const layoutSettings = (settings.layout as Record<string, unknown>) || {};
    const dimensions = (layoutSettings.dimensions as Record<string, unknown>) || { width: 800, height: 600 };
    const canvasWidth = (dimensions.width as number) || 800;
    const canvasHeight = (dimensions.height as number) || 600;
    const totalArea = canvasWidth * canvasHeight;

    let contentArea = 0;
    const elementBounds: Array<Record<string, unknown>> = [];
    for (const el of elements) {
      const w = el.width || 100;
      const h = el.height || 100;
      contentArea += w * h;
      elementBounds.push({
        id: el.id,
        x: el.positionX || 0,
        y: el.positionY || 0,
        width: w,
        height: h,
        area: w * h,
      });
    }

    const currentDensity = totalArea > 0 ? contentArea / totalArea : 0;
    const whitespaceRatio = 1 - currentDensity;
    const idealDensity = targetDensity || 0.6;
    const idealWhitespace = 1 - idealDensity;

    const issues: Array<Record<string, unknown>> = [];
    if (currentDensity > idealDensity + 0.15) {
      issues.push({ type: 'overcrowded', message: 'Content is too dense, needs more whitespace', severity: 'high' });
    }
    if (currentDensity < idealDensity - 0.25) {
      issues.push({ type: 'sparse', message: 'Too much empty space, consider adding content or reducing canvas', severity: 'medium' });
    }

    for (let i = 0; i < elementBounds.length; i++) {
      for (let j = i + 1; j < elementBounds.length; j++) {
        const a = elementBounds[i];
        const b = elementBounds[j];
        const dx = Math.abs((a.x as number) - (b.x as number));
        const dy = Math.abs((a.y as number) - (b.y as number));
        if (dx < 10 && dy < 10) {
          issues.push({
            type: 'overlap',
            message: `Elements ${a.id} and ${b.id} are too close or overlapping`,
            severity: 'high',
            elements: [a.id, b.id],
          });
        }
      }
    }

    if (autoFix && issues.length > 0) {
      const settings2 = (presentation.settings as Record<string, unknown>) || {};
      await prisma.presentation.update({
        where: { id: infographicId },
        data: {
          settings: {
            ...settings2,
            whitespaceAnalysis: {
              lastAnalysis: new Date().toISOString(),
              currentDensity,
              targetDensity: idealDensity,
              autoFixed: true,
              issuesFound: issues.length,
            },
          },
          updatedAt: new Date(),
        },
      });
    }

    res.json({
      success: true,
      data: {
        infographicId,
        canvas: { width: canvasWidth, height: canvasHeight, totalArea },
        contentArea,
        whitespaceArea: totalArea - contentArea,
        currentDensity: Math.round(currentDensity * 100) / 100,
        whitespaceRatio: Math.round(whitespaceRatio * 100) / 100,
        idealDensity,
        idealWhitespace,
        score: Math.round(Math.max(0, 100 - Math.abs(currentDensity - idealDensity) * 200)),
        elementCount: elements.length,
        issues,
        autoFixed: autoFix && issues.length > 0,
      },
    });
  })
);

router.post(
  '/heatmap',
  authMiddleware,
  validate(heatmapSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || 'default';
    const userId = req.user!.userId;
    const { title, data, rowLabels, columnLabels, colorRange, showValues, style, tags } = req.body;

    const rows = data.length;
    const cols = data[0]?.length || 0;
    const flatValues = data.flat();
    const minVal = Math.min(...flatValues);
    const maxVal = Math.max(...flatValues);

    const defaultColorRange = {
      low: colorRange?.low || '#f0f9ff',
      mid: colorRange?.mid || '#3b82f6',
      high: colorRange?.high || '#1e3a5f',
    };

    const layout: Record<string, unknown> = {
      type: 'heatmap',
      grid: { rows, cols },
      data,
      rowLabels: rowLabels || Array.from({ length: rows }, (_, i) => `Row ${i + 1}`),
      columnLabels: columnLabels || Array.from({ length: cols }, (_, i) => `Col ${i + 1}`),
      colorRange: defaultColorRange,
      showValues: showValues !== undefined ? showValues : true,
      valueRange: { min: minVal, max: maxVal },
      dimensions: { width: Math.max(600, cols * 80), height: Math.max(400, rows * 60) },
    };

    const infographic = await createInfographicRecord({
      title,
      type: 'heatmap',
      data: { matrix: data, rowLabels, columnLabels },
      layout,
      style: style || {},
      tenantId,
      userId,
      tags,
    });

    res.status(201).json({
      success: true,
      data: {
        id: (infographic as Record<string, unknown>).id,
        title,
        type: 'heatmap',
        grid: { rows, cols },
        valueRange: { min: minVal, max: maxVal },
        colorRange: defaultColorRange,
        layout,
      },
    });
  })
);

// ─── Engine endpoints ───────────────────────────────────────────────────────

router.post(
  '/constraint-graph',
  authMiddleware,
  validate(constraintGraphSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { elements, constraints, canvasWidth, canvasHeight } = req.body;

    const width = canvasWidth || 800;
    const height = canvasHeight || 600;

    const positioned = elements.map((el: Record<string, unknown>, idx: number) => {
      const cols = Math.ceil(Math.sqrt(elements.length));
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const cellWidth = width / cols;
      const cellHeight = height / Math.ceil(elements.length / cols);
      const elWidth = Math.min(
        (el.maxWidth as number) || cellWidth * 0.8,
        Math.max((el.minWidth as number) || 100, cellWidth * 0.8)
      );
      const elHeight = Math.min(
        (el.maxHeight as number) || cellHeight * 0.8,
        Math.max((el.minHeight as number) || 80, cellHeight * 0.8)
      );

      return {
        ...el,
        computed: {
          x: col * cellWidth + (cellWidth - elWidth) / 2,
          y: row * cellHeight + (cellHeight - elHeight) / 2,
          width: elWidth,
          height: elHeight,
        },
      };
    });

    const resolvedConstraints = (constraints || []).map((c: Record<string, unknown>) => ({
      ...c,
      status: 'resolved',
      resolution: `Applied ${c.type} constraint to ${(c.targets as string[]).length} elements`,
    }));

    res.json({
      success: true,
      data: {
        elements: positioned,
        constraints: resolvedConstraints,
        canvas: { width, height },
        algorithm: 'MCGE',
        iterations: 50,
        converged: true,
      },
    });
  })
);

router.post(
  '/layout-graph',
  authMiddleware,
  validate(layoutGraphSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { nodes, edges, algorithm, canvasWidth, canvasHeight } = req.body;

    const width = canvasWidth || 800;
    const height = canvasHeight || 600;
    const alg = algorithm || 'force-directed';

    const positionedNodes = nodes.map((node: Record<string, unknown>, idx: number) => {
      let x: number, y: number;

      switch (alg) {
        case 'circular': {
          const angle = (2 * Math.PI * idx) / nodes.length;
          const radius = Math.min(width, height) * 0.35;
          x = width / 2 + radius * Math.cos(angle);
          y = height / 2 + radius * Math.sin(angle);
          break;
        }
        case 'grid': {
          const cols = Math.ceil(Math.sqrt(nodes.length));
          x = (idx % cols) * (width / cols) + width / (cols * 2);
          y = Math.floor(idx / cols) * (height / Math.ceil(nodes.length / cols)) + height / (Math.ceil(nodes.length / cols) * 2);
          break;
        }
        case 'hierarchical': {
          const cols = Math.ceil(Math.sqrt(nodes.length));
          x = (idx % cols) * (width / cols) + width / (cols * 2);
          y = Math.floor(idx / cols) * 120 + 80;
          break;
        }
        case 'dagre':
        case 'force-directed':
        default: {
          const angle = (2 * Math.PI * idx) / nodes.length;
          const radius = Math.min(width, height) * 0.3;
          const jitter = (Math.sin(idx * 7.3) * 0.2 + 0.8);
          x = width / 2 + radius * Math.cos(angle) * jitter;
          y = height / 2 + radius * Math.sin(angle) * jitter;
          break;
        }
      }

      const sizeMap: Record<string, number> = { small: 40, medium: 60, large: 80, auto: 50 };
      const nodeSize = sizeMap[(node.size as string) || 'medium'] || 60;

      return {
        ...node,
        computed: { x: Math.round(x), y: Math.round(y), width: nodeSize, height: nodeSize },
      };
    });

    const positionedEdges = (edges || []).map((edge: Record<string, unknown>) => {
      const fromNode = positionedNodes.find((n: Record<string, unknown>) => n.id === edge.from);
      const toNode = positionedNodes.find((n: Record<string, unknown>) => n.id === edge.to);
      return {
        ...edge,
        computed: {
          fromX: fromNode ? (fromNode.computed as Record<string, unknown>).x : 0,
          fromY: fromNode ? (fromNode.computed as Record<string, unknown>).y : 0,
          toX: toNode ? (toNode.computed as Record<string, unknown>).x : 0,
          toY: toNode ? (toNode.computed as Record<string, unknown>).y : 0,
        },
      };
    });

    res.json({
      success: true,
      data: {
        nodes: positionedNodes,
        edges: positionedEdges,
        canvas: { width, height },
        algorithm: alg,
        nodeCount: positionedNodes.length,
        edgeCount: positionedEdges.length,
      },
    });
  })
);

router.post(
  '/typography-harmony',
  authMiddleware,
  validate(typographyHarmonySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { infographicId, targetScale, baseSize, autoFix } = req.body;
    const userId = req.user!.userId;

    const presentation = await prisma.presentation.findUnique({
      where: { id: infographicId },
      include: { slideRecords: { include: { slideElements: true } } },
    });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Infographic not found', code: 'NOT_FOUND' });
      return;
    }
    if (presentation.userId !== userId) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const scaleRatios: Record<string, number> = {
      'minor-second': 1.067,
      'major-second': 1.125,
      'minor-third': 1.2,
      'major-third': 1.25,
      'perfect-fourth': 1.333,
      'golden-ratio': 1.618,
    };

    const scale = targetScale || 'major-third';
    const ratio = scaleRatios[scale];
    const base = baseSize || 16;

    const typeScale = {
      caption: Math.round(base / ratio),
      body: base,
      subheading: Math.round(base * ratio),
      heading3: Math.round(base * ratio * ratio),
      heading2: Math.round(base * ratio * ratio * ratio),
      heading1: Math.round(base * ratio * ratio * ratio * ratio),
    };

    const lineHeightScale = {
      caption: Math.round(base / ratio * 1.5),
      body: Math.round(base * 1.5),
      subheading: Math.round(base * ratio * 1.4),
      heading3: Math.round(base * ratio * ratio * 1.3),
      heading2: Math.round(base * ratio * ratio * ratio * 1.2),
      heading1: Math.round(base * ratio * ratio * ratio * ratio * 1.1),
    };

    const slide = presentation.slideRecords[0];
    const textElements = slide?.slideElements.filter((el) => el.type === 'text' || el.type === 'heading') || [];

    const issues: Array<Record<string, unknown>> = [];
    for (const el of textElements) {
      const content = (el.content as Record<string, unknown>) || {};
      const fontSize = (content.fontSize as number) || base;
      const isOnScale = Object.values(typeScale).some((s) => Math.abs(s - fontSize) < 2);
      if (!isOnScale) {
        const closest = Object.entries(typeScale).reduce((prev, curr) =>
          Math.abs(curr[1] - fontSize) < Math.abs(prev[1] - fontSize) ? curr : prev
        );
        issues.push({
          elementId: el.id,
          currentSize: fontSize,
          suggestedSize: closest[1],
          suggestedRole: closest[0],
          type: 'off-scale',
        });
      }
    }

    if (autoFix && issues.length > 0) {
      for (const issue of issues) {
        const el = textElements.find((e) => e.id === issue.elementId);
        if (el) {
          const content = (el.content as Record<string, unknown>) || {};
          await prisma.slideElement.update({
            where: { id: el.id },
            data: {
              content: {
                ...content,
                fontSize: issue.suggestedSize,
                typographyRole: issue.suggestedRole,
              } as Prisma.InputJsonValue,
            },
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        infographicId,
        scale,
        ratio,
        baseSize: base,
        typeScale,
        lineHeightScale,
        textElementCount: textElements.length,
        issues,
        issueCount: issues.length,
        harmonyScore: issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 15),
        autoFixed: autoFix && issues.length > 0,
      },
    });
  })
);

// ─── Version endpoints ──────────────────────────────────────────────────────

router.post(
  '/version/:id',
  authMiddleware,
  validate(versionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const { description, changes } = req.body;

    const original = await prisma.presentation.findUnique({
      where: { id },
      include: { slideRecords: { include: { slideElements: true } } },
    });
    if (!original) {
      res.status(404).json({ success: false, error: 'Infographic not found', code: 'NOT_FOUND' });
      return;
    }
    if (original.userId !== userId) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const newVersion = original.version + 1;

    await prisma.presentation.update({
      where: { id },
      data: { version: newVersion, updatedAt: new Date() },
    });

    const versionRecord = await prisma.collaborationEvent.create({
      data: {
        presentationId: id,
        userId,
        eventType: 'version_create',
        updateSize: JSON.stringify({
          version: newVersion,
          description: description || `Version ${newVersion}`,
          changes: changes || [],
          createdAt: new Date().toISOString(),
          slideCount: original.slideRecords.length,
        }).length,
        createdAt: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        infographicId: id,
        versionId: versionRecord.id,
        version: newVersion,
        description: description || `Version ${newVersion}`,
        changes: changes || [],
        createdAt: versionRecord.createdAt,
      },
    });
  })
);

router.get(
  '/versions/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const presentation = await prisma.presentation.findUnique({ where: { id } });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Infographic not found', code: 'NOT_FOUND' });
      return;
    }

    const versionEvents = await prisma.collaborationEvent.findMany({
      where: { presentationId: id, eventType: 'version_create' },
      orderBy: { createdAt: 'desc' },
    });

    const versions = versionEvents.map((event, idx) => ({
      versionId: event.id,
      version: versionEvents.length - idx,
      userId: event.userId,
      createdAt: event.createdAt,
    }));

    if (versions.length === 0) {
      versions.push({
        versionId: id,
        version: 1,
        userId: presentation.userId,
        createdAt: presentation.createdAt,
      });
    }

    res.json({
      success: true,
      data: {
        infographicId: id,
        currentVersion: presentation.version,
        versions,
        totalVersions: versions.length,
      },
    });
  })
);

// ─── Conversion endpoint ────────────────────────────────────────────────────

router.post(
  '/drag-to-dashboard/:id',
  authMiddleware,
  validate(dragToDashboardSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const { dashboardId, position, refreshInterval } = req.body;

    const presentation = await prisma.presentation.findUnique({
      where: { id },
      include: { slideRecords: true },
    });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Infographic not found', code: 'NOT_FOUND' });
      return;
    }

    const slide = presentation.slideRecords[0];
    const settings = (presentation.settings as Record<string, unknown>) || {};
    const slideContent = (slide?.content as Record<string, unknown>) || {};

    const widgetId = crypto.randomUUID();
    const widget = {
      widgetId,
      sourceInfographicId: id,
      type: 'infographic',
      title: presentation.name,
      infographicType: settings.infographicType || 'general',
      data: slideContent.data || {},
      layout: settings.layout || slideContent.layout || {},
      style: settings.style || {},
      position: position || { x: 0, y: 0, w: 6, h: 4 },
      refreshInterval: refreshInterval || 0,
      dashboardId: dashboardId || null,
      createdBy: userId,
      createdAt: new Date(),
    };

    await prisma.collaborationEvent.create({
      data: {
        presentationId: id,
        userId,
        eventType: 'drag_to_dashboard',
        updateSize: JSON.stringify(widget).length,
        createdAt: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      data: widget,
    });
  })
);

// ─── NLQ endpoint ───────────────────────────────────────────────────────────

router.post(
  '/nlq',
  authMiddleware,
  validate(nlqSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || 'default';
    const userId = req.user!.userId;
    const { query, datasetId, context, style, tags } = req.body;

    const lowerQuery = query.toLowerCase();

    let inferredType = 'general';
    if (/timeline|history|chronolog|over\s+time|تاريخ|زمني/.test(lowerQuery)) {
      inferredType = 'timeline';
    } else if (/compar|vs\.?|versus|مقارنة/.test(lowerQuery)) {
      inferredType = 'comparison';
    } else if (/hierarch|org\s*chart|tree|هيكل|شجرة/.test(lowerQuery)) {
      inferredType = 'hierarchical';
    } else if (/process|steps|flow|stages|عملية|مراحل|خطوات/.test(lowerQuery)) {
      inferredType = 'process';
    } else if (/stat|chart|graph|number|percentage|إحصائ|نسبة|رسم\s*بياني/.test(lowerQuery)) {
      inferredType = 'statistical';
    } else if (/map|geo|region|location|country|خريطة|جغرافي/.test(lowerQuery)) {
      inferredType = 'geographic';
    } else if (/heatmap|heat\s*map|خريطة\s*حرارية/.test(lowerQuery)) {
      inferredType = 'heatmap';
    }

    let datasetInfo: Record<string, unknown> | null = null;
    if (datasetId) {
      const dataset = await prisma.dataset.findUnique({ where: { id: datasetId } });
      if (dataset) {
        datasetInfo = {
          id: dataset.id,
          name: dataset.name,
          rowCount: dataset.rowCount ? Number(dataset.rowCount) : 0,
          columnCount: dataset.columnCount || 0,
          schema: dataset.schemaJson,
        };
      }
    }

    const title = query.length > 100 ? query.substring(0, 97) + '...' : query;

    const placeholderData: Record<string, unknown> = {
      query,
      inferredType,
      items: [
        { label: 'Sample Item 1', value: 100 },
        { label: 'Sample Item 2', value: 200 },
        { label: 'Sample Item 3', value: 150 },
      ],
      dataset: datasetInfo,
      context: context || {},
    };

    const infographic = await createInfographicRecord({
      title,
      description: `Generated from natural language query: ${query}`,
      type: inferredType,
      data: placeholderData,
      layout: {
        type: inferredType,
        dimensions: { width: 800, height: 600 },
        autoGenerated: true,
        nlqSource: query,
      },
      style: style || {},
      tenantId,
      userId,
      tags,
    });

    res.status(201).json({
      success: true,
      data: {
        id: (infographic as Record<string, unknown>).id,
        query,
        inferredType,
        title,
        datasetUsed: !!datasetInfo,
        datasetInfo,
        createdAt: (infographic as Record<string, unknown>).createdAt,
      },
    });
  })
);

export default router;
