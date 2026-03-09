import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

const router = Router();

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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadPresentation(presentationId: string, tenantId: string) {
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, tenantId },
  });
  if (!presentation) {
    throw Object.assign(new Error('Presentation not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }
  return presentation;
}

async function loadSlide(presentationId: string, slideId: string) {
  const slide = await prisma.slide.findFirst({
    where: { id: slideId, presentationId },
  });
  if (!slide) {
    throw Object.assign(new Error('Slide not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }
  return slide;
}

async function recordHistory(
  presentationId: string,
  userId: string,
  operation: string,
  targetType: string,
  targetId: string | null,
  beforeState: unknown,
  afterState: unknown
) {
  await prisma.presentationAdvancedEdit.create({
    data: {
      id: randomUUID(),
      presentationId,
      userId,
      operation,
      targetType,
      targetId: targetId || undefined,
      beforeState: beforeState as Prisma.InputJsonValue,
      afterState: afterState as Prisma.InputJsonValue,
    },
  });
}

// ── Validation Schemas ───────────────────────────────────────────────────────

const updateSlideSchema = z.object({
  content: z.record(z.unknown()).optional(),
  layout: z.string().min(1).optional(),
  notes: z.string().optional(),
  elements: z.array(z.record(z.unknown())).optional(),
});

const addSlideSchema = z.object({
  layout: z.enum(['title', 'content', 'two-column', 'blank', 'section', 'image', 'comparison', 'chart']).default('blank'),
  content: z.record(z.unknown()).optional(),
  insertAt: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

const reorderSchema = z.object({
  newOrder: z.array(z.string().uuid()),
});

const duplicateSchema = z.object({
  newName: z.string().min(1).max(500).optional(),
});

const lockSchema = z.object({
  slideIds: z.array(z.string().uuid()).min(1),
  reason: z.string().optional(),
});

const unlockSchema = z.object({
  slideIds: z.array(z.string().uuid()).min(1),
});

const layersSchema = z.object({
  elementId: z.string().uuid(),
  action: z.enum(['bring-front', 'send-back', 'bring-forward', 'send-backward']),
});

const alignSchema = z.object({
  elementIds: z.array(z.string().uuid()).min(2),
  alignment: z.enum(['left', 'center', 'right', 'top', 'middle', 'bottom']),
});

const spacingSchema = z.object({
  elementIds: z.array(z.string().uuid()).min(2),
  direction: z.enum(['horizontal', 'vertical']),
  spacing: z.number().min(0).optional(),
});

const transparencySchema = z.object({
  transparency: z.number().min(0).max(100),
});

const groupSchema = z.object({
  elementIds: z.array(z.string().uuid()).min(2),
  groupName: z.string().optional(),
});

const ungroupSchema = z.object({
  groupId: z.string().min(1),
});

const smartSlideSchema = z.object({
  type: z.enum(['gantt', 'thermometer', 'big-number', 'timeline', 'progress', 'kpi-grid', 'comparison-table']),
  data: z.record(z.unknown()),
  insertAt: z.number().int().min(0).optional(),
});

const widgetSchema = z.object({
  widgetType: z.enum(['clock', 'countdown', 'social-feed', 'weather', 'map', 'qr-code', 'embed', 'metric-card', 'chart-mini']),
  config: z.record(z.unknown()),
  position: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
});

const convertToTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().min(1).max(100),
});

const outlineSchema = z.object({
  outline: z.array(z.object({
    title: z.string().min(1),
    bullets: z.array(z.string()).optional(),
    notes: z.string().optional(),
    layout: z.string().optional(),
  })).min(1),
});

const batchEditSchema = z.object({
  operations: z.array(z.object({
    slideId: z.string().uuid(),
    elementId: z.string().uuid().optional(),
    action: z.enum(['update-style', 'update-content', 'delete', 'move', 'resize', 'set-transparency', 'set-layer']),
    payload: z.record(z.unknown()),
  })).min(1).max(100),
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// PUT /slides/:presentationId/:slideId — Update slide content
router.put(
  '/slides/:presentationId/:slideId',
  authMiddleware,
  validate(updateSlideSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId, slideId } = req.params;

    await loadPresentation(presentationId, tenantId);
    const slide = await loadSlide(presentationId, slideId);

    const beforeState = { content: slide.content, layout: slide.layout, notes: slide.notes };

    const existingContent = (typeof slide.content === 'string' ? JSON.parse(slide.content) : slide.content) || {};
    const mergedContent = req.body.content ? { ...existingContent, ...req.body.content } : existingContent;

    if (req.body.elements) {
      mergedContent.elements = req.body.elements;
    }

    const updated = await prisma.slide.update({
      where: { id: slideId },
      data: {
        content: mergedContent,
        layout: req.body.layout || slide.layout,
        notes: req.body.notes !== undefined ? req.body.notes : slide.notes,
        updatedAt: new Date(),
      },
    });

    await recordHistory(presentationId, userId, 'update-slide', 'slide', slideId, beforeState, {
      content: updated.content,
      layout: updated.layout,
      notes: updated.notes,
    });

    await prisma.presentation.update({
      where: { id: presentationId },
      data: { updatedAt: new Date() },
    });

    logger.info('Slide updated', { presentationId, slideId, userId });
    res.json({ success: true, data: updated });
  })
);

// POST /slides/:presentationId — Add new slide
router.post(
  '/slides/:presentationId',
  authMiddleware,
  validate(addSlideSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const presentation = await loadPresentation(presentationId, tenantId);

    const existingSlides = await prisma.slide.findMany({
      where: { presentationId },
      orderBy: { slideIndex: 'asc' },
    });

    const insertAt = req.body.insertAt !== undefined ? req.body.insertAt : existingSlides.length;

    // Shift slides at or after insertAt
    if (insertAt < existingSlides.length) {
      for (const s of existingSlides) {
        if (s.slideIndex >= insertAt) {
          await prisma.slide.update({
            where: { id: s.id },
            data: { slideIndex: s.slideIndex + 1, order: s.slideIndex + 1 },
          });
        }
      }
    }

    const newSlide = await prisma.slide.create({
      data: {
        id: randomUUID(),
        presentationId,
        slideIndex: insertAt,
        order: insertAt,
        layout: req.body.layout,
        content: req.body.content || { elements: [] },
        notes: req.body.notes || null,
      },
    });

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        slideCount: (presentation.slideCount || 0) + 1,
        updatedAt: new Date(),
      },
    });

    await recordHistory(presentationId, userId, 'add-slide', 'slide', newSlide.id, null, {
      slideIndex: insertAt,
      layout: req.body.layout,
    });

    logger.info('Slide added', { presentationId, slideId: newSlide.id, insertAt });
    res.status(201).json({ success: true, data: newSlide });
  })
);

// DELETE /slides/:presentationId/:slideId — Delete slide
router.delete(
  '/slides/:presentationId/:slideId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId, slideId } = req.params;

    const presentation = await loadPresentation(presentationId, tenantId);
    const slide = await loadSlide(presentationId, slideId);

    await recordHistory(presentationId, userId, 'delete-slide', 'slide', slideId, {
      slideIndex: slide.slideIndex,
      layout: slide.layout,
      content: slide.content,
    }, null);

    await prisma.slideElement.deleteMany({ where: { slideId } });
    await prisma.slide.delete({ where: { id: slideId } });

    // Re-index remaining slides
    const remaining = await prisma.slide.findMany({
      where: { presentationId },
      orderBy: { slideIndex: 'asc' },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].slideIndex !== i) {
        await prisma.slide.update({
          where: { id: remaining[i].id },
          data: { slideIndex: i, order: i },
        });
      }
    }

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        slideCount: Math.max(0, (presentation.slideCount || 1) - 1),
        updatedAt: new Date(),
      },
    });

    logger.info('Slide deleted', { presentationId, slideId });
    res.json({ success: true, message: 'Slide deleted', data: { remainingSlides: remaining.length } });
  })
);

// PUT /reorder/:presentationId — Reorder slides
router.put(
  '/reorder/:presentationId',
  authMiddleware,
  validate(reorderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    await loadPresentation(presentationId, tenantId);

    const slides = await prisma.slide.findMany({
      where: { presentationId },
      orderBy: { slideIndex: 'asc' },
    });

    const slideMap = new Map(slides.map((s) => [s.id, s]));
    const beforeOrder = slides.map((s) => s.id);

    for (let i = 0; i < req.body.newOrder.length; i++) {
      const id = req.body.newOrder[i];
      if (!slideMap.has(id)) {
        res.status(400).json({ success: false, error: `Unknown slide ID: ${id}`, code: 'INVALID_SLIDE_ID' });
        return;
      }
      await prisma.slide.update({
        where: { id },
        data: { slideIndex: i, order: i, updatedAt: new Date() },
      });
    }

    await recordHistory(presentationId, userId, 'reorder-slides', 'presentation', presentationId, { order: beforeOrder }, { order: req.body.newOrder });

    await prisma.presentation.update({
      where: { id: presentationId },
      data: { updatedAt: new Date() },
    });

    logger.info('Slides reordered', { presentationId, newOrder: req.body.newOrder });
    res.json({ success: true, data: { reordered: true, slideCount: req.body.newOrder.length } });
  })
);

// POST /duplicate/:presentationId — Duplicate entire presentation
router.post(
  '/duplicate/:presentationId',
  authMiddleware,
  validate(duplicateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const original = await loadPresentation(presentationId, tenantId);
    const originalSlides = await prisma.slide.findMany({
      where: { presentationId },
      orderBy: { slideIndex: 'asc' },
      include: { slideElements: true },
    });

    const newPresId = randomUUID();
    const newPres = await prisma.presentation.create({
      data: {
        id: newPresId,
        name: req.body.newName || `${original.name} (Copy)`,
        description: original.description,
        status: 'DRAFT',
        theme: original.theme as Prisma.InputJsonValue ?? undefined,
        slides: original.slides as Prisma.InputJsonValue ?? undefined,
        slideCount: original.slideCount,
        width: original.width,
        height: original.height,
        tenantId,
        userId,
        title: original.title ? `${original.title} (Copy)` : null,
        tags: original.tags as Prisma.InputJsonValue ?? undefined,
        settings: original.settings as Prisma.InputJsonValue ?? undefined,
      },
    });

    for (const slide of originalSlides) {
      const newSlideId = randomUUID();
      await prisma.slide.create({
        data: {
          id: newSlideId,
          presentationId: newPresId,
          slideIndex: slide.slideIndex,
          order: slide.order,
          layout: slide.layout,
          content: slide.content as Prisma.InputJsonValue ?? undefined,
          notes: slide.notes,
          thumbnail: slide.thumbnail,
        },
      });

      for (const elem of slide.slideElements) {
        await prisma.slideElement.create({
          data: {
            id: randomUUID(),
            slideId: newSlideId,
            type: elem.type,
            content: elem.content as Prisma.InputJsonValue ?? undefined,
            positionX: elem.positionX,
            positionY: elem.positionY,
            width: elem.width,
            height: elem.height,
            rotation: elem.rotation,
            layer: elem.layer,
            style: elem.style as Prisma.InputJsonValue ?? undefined,
          },
        });
      }
    }

    logger.info('Presentation duplicated', { originalId: presentationId, newId: newPresId });
    res.status(201).json({ success: true, data: newPres });
  })
);

// POST /duplicate-slide/:presentationId/:slideId — Duplicate single slide
router.post(
  '/duplicate-slide/:presentationId/:slideId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId, slideId } = req.params;

    const presentation = await loadPresentation(presentationId, tenantId);
    const slide = await loadSlide(presentationId, slideId);
    const elements = await prisma.slideElement.findMany({ where: { slideId } });

    // Shift slides after the source
    const laterSlides = await prisma.slide.findMany({
      where: { presentationId, slideIndex: { gt: slide.slideIndex } },
    });
    for (const s of laterSlides) {
      await prisma.slide.update({
        where: { id: s.id },
        data: { slideIndex: s.slideIndex + 1, order: s.slideIndex + 1 },
      });
    }

    const newSlideId = randomUUID();
    const newSlide = await prisma.slide.create({
      data: {
        id: newSlideId,
        presentationId,
        slideIndex: slide.slideIndex + 1,
        order: slide.slideIndex + 1,
        layout: slide.layout,
        content: slide.content as Prisma.InputJsonValue ?? undefined,
        notes: slide.notes,
      },
    });

    for (const elem of elements) {
      await prisma.slideElement.create({
        data: {
          id: randomUUID(),
          slideId: newSlideId,
          type: elem.type,
          content: elem.content as Prisma.InputJsonValue ?? undefined,
          positionX: elem.positionX,
          positionY: elem.positionY,
          width: elem.width,
          height: elem.height,
          rotation: elem.rotation,
          layer: elem.layer,
          style: elem.style as Prisma.InputJsonValue ?? undefined,
        },
      });
    }

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        slideCount: (presentation.slideCount || 0) + 1,
        updatedAt: new Date(),
      },
    });

    await recordHistory(presentationId, userId, 'duplicate-slide', 'slide', slideId, null, { newSlideId });

    logger.info('Slide duplicated', { presentationId, sourceSlideId: slideId, newSlideId });
    res.status(201).json({ success: true, data: newSlide });
  })
);

// PUT /lock/:presentationId — Lock specific slides
router.put(
  '/lock/:presentationId',
  authMiddleware,
  validate(lockSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const presentation = await loadPresentation(presentationId, tenantId);
    const settings = (typeof presentation.settings === 'string'
      ? JSON.parse(presentation.settings)
      : presentation.settings) || {};

    const lockedSlides: Record<string, { lockedBy: string; lockedAt: string; reason?: string }> = settings.lockedSlides || {};

    for (const sid of req.body.slideIds) {
      await loadSlide(presentationId, sid); // verify slide exists
      lockedSlides[sid] = {
        lockedBy: userId,
        lockedAt: new Date().toISOString(),
        reason: req.body.reason,
      };
    }

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        settings: { ...settings, lockedSlides },
        updatedAt: new Date(),
      },
    });

    await recordHistory(presentationId, userId, 'lock-slides', 'presentation', presentationId, null, {
      slideIds: req.body.slideIds,
      reason: req.body.reason,
    });

    logger.info('Slides locked', { presentationId, slideIds: req.body.slideIds });
    res.json({ success: true, data: { locked: req.body.slideIds, lockedSlides } });
  })
);

// PUT /unlock/:presentationId — Unlock slides
router.put(
  '/unlock/:presentationId',
  authMiddleware,
  validate(unlockSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const presentation = await loadPresentation(presentationId, tenantId);
    const settings = (typeof presentation.settings === 'string'
      ? JSON.parse(presentation.settings)
      : presentation.settings) || {};

    const lockedSlides: Record<string, unknown> = settings.lockedSlides || {};

    for (const sid of req.body.slideIds) {
      delete lockedSlides[sid];
    }

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        settings: { ...settings, lockedSlides },
        updatedAt: new Date(),
      },
    });

    await recordHistory(presentationId, userId, 'unlock-slides', 'presentation', presentationId, null, {
      slideIds: req.body.slideIds,
    });

    logger.info('Slides unlocked', { presentationId, slideIds: req.body.slideIds });
    res.json({ success: true, data: { unlocked: req.body.slideIds } });
  })
);

// POST /undo/:presentationId — Undo last action
router.post(
  '/undo/:presentationId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    await loadPresentation(presentationId, tenantId);

    // Find the most recent edit that hasn't been undone
    const presentation = await prisma.presentation.findUnique({ where: { id: presentationId } });
    const settings = (typeof presentation?.settings === 'string'
      ? JSON.parse(presentation.settings)
      : presentation?.settings) || {};
    const undoneIds: string[] = settings.undoneEditIds || [];

    const lastEdit = await prisma.presentationAdvancedEdit.findFirst({
      where: {
        presentationId,
        userId,
        id: { notIn: undoneIds },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastEdit) {
      res.status(404).json({ success: false, error: 'Nothing to undo', code: 'NO_UNDO_AVAILABLE' });
      return;
    }

    // Restore beforeState based on target type
    if (lastEdit.targetType === 'slide' && lastEdit.targetId && lastEdit.beforeState) {
      const before = lastEdit.beforeState as Record<string, unknown>;
      try {
        await prisma.slide.update({
          where: { id: lastEdit.targetId },
          data: {
            content: before.content as Prisma.InputJsonValue ?? undefined,
            layout: (before.layout as string) || undefined,
            notes: before.notes as string | undefined,
            updatedAt: new Date(),
          },
        });
      } catch {
        // Slide may have been deleted - try to recreate
        if (lastEdit.operation === 'delete-slide') {
          await prisma.slide.create({
            data: {
              id: lastEdit.targetId,
              presentationId,
              slideIndex: (before.slideIndex as number) || 0,
              order: (before.slideIndex as number) || 0,
              layout: (before.layout as string) || 'blank',
              content: before.content as Prisma.InputJsonValue ?? undefined,
              notes: before.notes as string | null,
            },
          });
        }
      }
    }

    // Mark this edit as undone
    undoneIds.push(lastEdit.id);
    const redoStack: string[] = settings.redoStack || [];
    redoStack.push(lastEdit.id);

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        settings: { ...settings, undoneEditIds: undoneIds, redoStack },
        updatedAt: new Date(),
      },
    });

    logger.info('Undo performed', { presentationId, editId: lastEdit.id, operation: lastEdit.operation });
    res.json({
      success: true,
      data: {
        undoneOperation: lastEdit.operation,
        editId: lastEdit.id,
        targetType: lastEdit.targetType,
        targetId: lastEdit.targetId,
      },
    });
  })
);

// POST /redo/:presentationId — Redo last action
router.post(
  '/redo/:presentationId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    await loadPresentation(presentationId, tenantId);

    const presentation = await prisma.presentation.findUnique({ where: { id: presentationId } });
    const settings = (typeof presentation?.settings === 'string'
      ? JSON.parse(presentation.settings)
      : presentation?.settings) || {};
    const redoStack: string[] = settings.redoStack || [];
    const undoneIds: string[] = settings.undoneEditIds || [];

    if (redoStack.length === 0) {
      res.status(404).json({ success: false, error: 'Nothing to redo', code: 'NO_REDO_AVAILABLE' });
      return;
    }

    const editId = redoStack.pop()!;
    const edit = await prisma.presentationAdvancedEdit.findUnique({ where: { id: editId } });

    if (!edit) {
      res.status(404).json({ success: false, error: 'Redo target not found', code: 'REDO_NOT_FOUND' });
      return;
    }

    // Re-apply afterState
    if (edit.targetType === 'slide' && edit.targetId && edit.afterState) {
      const after = edit.afterState as Record<string, unknown>;
      try {
        await prisma.slide.update({
          where: { id: edit.targetId },
          data: {
            content: after.content as Prisma.InputJsonValue ?? undefined,
            layout: (after.layout as string) || undefined,
            notes: after.notes as string | undefined,
            updatedAt: new Date(),
          },
        });
      } catch {
        // Target may not exist if it was an add operation that was undone
        logger.warn('Redo target slide not found, skipping apply', { editId, targetId: edit.targetId });
      }
    }

    // Remove from undone list
    const idx = undoneIds.indexOf(editId);
    if (idx >= 0) undoneIds.splice(idx, 1);

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        settings: { ...settings, undoneEditIds: undoneIds, redoStack },
        updatedAt: new Date(),
      },
    });

    logger.info('Redo performed', { presentationId, editId, operation: edit.operation });
    res.json({
      success: true,
      data: {
        redoneOperation: edit.operation,
        editId: edit.id,
        targetType: edit.targetType,
        targetId: edit.targetId,
      },
    });
  })
);

// PUT /layers/:presentationId/:slideId — Manage element layers
router.put(
  '/layers/:presentationId/:slideId',
  authMiddleware,
  validate(layersSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId, slideId } = req.params;

    await loadPresentation(presentationId, tenantId);
    await loadSlide(presentationId, slideId);

    const elements = await prisma.slideElement.findMany({
      where: { slideId },
      orderBy: { layer: 'asc' },
    });

    const target = elements.find((e) => e.id === req.body.elementId);
    if (!target) {
      res.status(404).json({ success: false, error: 'Element not found', code: 'ELEMENT_NOT_FOUND' });
      return;
    }

    const beforeLayer = target.layer;
    let newLayer = target.layer;

    switch (req.body.action) {
      case 'bring-front': {
        const maxLayer = Math.max(...elements.map((e) => e.layer));
        newLayer = maxLayer + 1;
        break;
      }
      case 'send-back': {
        // Set to 0 and push everything else up
        for (const elem of elements) {
          if (elem.id !== target.id && elem.layer <= target.layer) {
            await prisma.slideElement.update({
              where: { id: elem.id },
              data: { layer: elem.layer + 1 },
            });
          }
        }
        newLayer = 0;
        break;
      }
      case 'bring-forward': {
        const above = elements.find((e) => e.layer > target.layer);
        if (above) {
          await prisma.slideElement.update({ where: { id: above.id }, data: { layer: target.layer } });
          newLayer = above.layer;
        }
        break;
      }
      case 'send-backward': {
        const below = [...elements].reverse().find((e) => e.layer < target.layer);
        if (below) {
          await prisma.slideElement.update({ where: { id: below.id }, data: { layer: target.layer } });
          newLayer = below.layer;
        }
        break;
      }
    }

    await prisma.slideElement.update({
      where: { id: target.id },
      data: { layer: newLayer },
    });

    await recordHistory(presentationId, userId, 'layer-change', 'element', target.id, { layer: beforeLayer }, { layer: newLayer });

    logger.info('Layer updated', { presentationId, slideId, elementId: target.id, action: req.body.action });
    res.json({ success: true, data: { elementId: target.id, previousLayer: beforeLayer, newLayer, action: req.body.action } });
  })
);

// PUT /align/:presentationId/:slideId — Align elements
router.put(
  '/align/:presentationId/:slideId',
  authMiddleware,
  validate(alignSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId, slideId } = req.params;

    await loadPresentation(presentationId, tenantId);
    await loadSlide(presentationId, slideId);

    const elements = await prisma.slideElement.findMany({
      where: { slideId, id: { in: req.body.elementIds } },
    });

    if (elements.length < 2) {
      res.status(400).json({ success: false, error: 'Need at least 2 elements to align', code: 'INSUFFICIENT_ELEMENTS' });
      return;
    }

    const beforePositions = elements.map((e) => ({ id: e.id, x: e.positionX, y: e.positionY }));
    const { alignment } = req.body;

    const positions = elements.map((e) => ({
      id: e.id,
      x: e.positionX || 0,
      y: e.positionY || 0,
      w: e.width || 1,
      h: e.height || 1,
    }));

    for (const pos of positions) {
      let newX = pos.x;
      let newY = pos.y;

      switch (alignment) {
        case 'left':
          newX = Math.min(...positions.map((p) => p.x));
          break;
        case 'right':
          newX = Math.max(...positions.map((p) => p.x + p.w)) - pos.w;
          break;
        case 'center': {
          const centerX = positions.reduce((sum, p) => sum + p.x + p.w / 2, 0) / positions.length;
          newX = centerX - pos.w / 2;
          break;
        }
        case 'top':
          newY = Math.min(...positions.map((p) => p.y));
          break;
        case 'bottom':
          newY = Math.max(...positions.map((p) => p.y + p.h)) - pos.h;
          break;
        case 'middle': {
          const centerY = positions.reduce((sum, p) => sum + p.y + p.h / 2, 0) / positions.length;
          newY = centerY - pos.h / 2;
          break;
        }
      }

      await prisma.slideElement.update({
        where: { id: pos.id },
        data: { positionX: newX, positionY: newY, updatedAt: new Date() },
      });
    }

    await recordHistory(presentationId, userId, 'align-elements', 'slide', slideId, { positions: beforePositions }, { alignment });

    logger.info('Elements aligned', { presentationId, slideId, alignment, count: elements.length });
    res.json({ success: true, data: { aligned: elements.length, alignment } });
  })
);

// PUT /spacing/:presentationId/:slideId — Adjust element spacing
router.put(
  '/spacing/:presentationId/:slideId',
  authMiddleware,
  validate(spacingSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId, slideId } = req.params;

    await loadPresentation(presentationId, tenantId);
    await loadSlide(presentationId, slideId);

    const elements = await prisma.slideElement.findMany({
      where: { slideId, id: { in: req.body.elementIds } },
    });

    if (elements.length < 2) {
      res.status(400).json({ success: false, error: 'Need at least 2 elements', code: 'INSUFFICIENT_ELEMENTS' });
      return;
    }

    const { direction } = req.body;
    const isHorizontal = direction === 'horizontal';

    const sorted = [...elements].sort((a, b) => {
      return isHorizontal
        ? (a.positionX || 0) - (b.positionX || 0)
        : (a.positionY || 0) - (b.positionY || 0);
    });

    if (req.body.spacing !== undefined) {
      // Use fixed spacing
      const gap = req.body.spacing;
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        if (isHorizontal) {
          const newX = (prev.positionX || 0) + (prev.width || 1) + gap;
          await prisma.slideElement.update({ where: { id: sorted[i].id }, data: { positionX: newX } });
        } else {
          const newY = (prev.positionY || 0) + (prev.height || 1) + gap;
          await prisma.slideElement.update({ where: { id: sorted[i].id }, data: { positionY: newY } });
        }
      }
    } else {
      // Distribute evenly
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (isHorizontal) {
        const totalSpan = (last.positionX || 0) + (last.width || 1) - (first.positionX || 0);
        const totalElemWidth = sorted.reduce((s, e) => s + (e.width || 1), 0);
        const gap = (totalSpan - totalElemWidth) / (sorted.length - 1);
        let currentX = first.positionX || 0;
        for (const elem of sorted) {
          await prisma.slideElement.update({ where: { id: elem.id }, data: { positionX: currentX } });
          currentX += (elem.width || 1) + gap;
        }
      } else {
        const totalSpan = (last.positionY || 0) + (last.height || 1) - (first.positionY || 0);
        const totalElemHeight = sorted.reduce((s, e) => s + (e.height || 1), 0);
        const gap = (totalSpan - totalElemHeight) / (sorted.length - 1);
        let currentY = first.positionY || 0;
        for (const elem of sorted) {
          await prisma.slideElement.update({ where: { id: elem.id }, data: { positionY: currentY } });
          currentY += (elem.height || 1) + gap;
        }
      }
    }

    await recordHistory(presentationId, userId, 'adjust-spacing', 'slide', slideId, null, {
      direction,
      spacing: req.body.spacing,
      elementIds: req.body.elementIds,
    });

    logger.info('Element spacing adjusted', { presentationId, slideId, direction });
    res.json({ success: true, data: { adjusted: elements.length, direction, spacing: req.body.spacing } });
  })
);

// PUT /transparency/:presentationId/:slideId/:elementId — Set element transparency
router.put(
  '/transparency/:presentationId/:slideId/:elementId',
  authMiddleware,
  validate(transparencySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId, slideId, elementId } = req.params;

    await loadPresentation(presentationId, tenantId);
    await loadSlide(presentationId, slideId);

    const element = await prisma.slideElement.findFirst({
      where: { id: elementId, slideId },
    });
    if (!element) {
      res.status(404).json({ success: false, error: 'Element not found', code: 'ELEMENT_NOT_FOUND' });
      return;
    }

    const existingStyle = (typeof element.style === 'string' ? JSON.parse(element.style) : element.style) || {};
    const previousTransparency = existingStyle.transparency || 0;
    const newStyle = { ...existingStyle, transparency: req.body.transparency, opacity: 1 - req.body.transparency / 100 };

    await prisma.slideElement.update({
      where: { id: elementId },
      data: { style: newStyle, updatedAt: new Date() },
    });

    await recordHistory(presentationId, userId, 'set-transparency', 'element', elementId, { transparency: previousTransparency }, { transparency: req.body.transparency });

    logger.info('Element transparency set', { presentationId, slideId, elementId, transparency: req.body.transparency });
    res.json({
      success: true,
      data: { elementId, transparency: req.body.transparency, opacity: newStyle.opacity },
    });
  })
);

// POST /group/:presentationId/:slideId — Group elements
router.post(
  '/group/:presentationId/:slideId',
  authMiddleware,
  validate(groupSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId, slideId } = req.params;

    await loadPresentation(presentationId, tenantId);
    const slide = await loadSlide(presentationId, slideId);

    const elements = await prisma.slideElement.findMany({
      where: { slideId, id: { in: req.body.elementIds } },
    });

    if (elements.length < 2) {
      res.status(400).json({ success: false, error: 'Need at least 2 elements to group', code: 'INSUFFICIENT_ELEMENTS' });
      return;
    }

    const groupId = randomUUID();

    // Calculate bounding box
    const minX = Math.min(...elements.map((e) => e.positionX || 0));
    const minY = Math.min(...elements.map((e) => e.positionY || 0));
    const maxX = Math.max(...elements.map((e) => (e.positionX || 0) + (e.width || 0)));
    const maxY = Math.max(...elements.map((e) => (e.positionY || 0) + (e.height || 0)));

    // Update each element's style with groupId
    for (const elem of elements) {
      const style = (typeof elem.style === 'string' ? JSON.parse(elem.style) : elem.style) || {};
      await prisma.slideElement.update({
        where: { id: elem.id },
        data: {
          style: {
            ...style,
            groupId,
            groupName: req.body.groupName || `Group ${groupId.slice(0, 8)}`,
            relativeX: (elem.positionX || 0) - minX,
            relativeY: (elem.positionY || 0) - minY,
          },
          updatedAt: new Date(),
        },
      });
    }

    // Store group info in slide content
    const slideContent = (typeof slide.content === 'string' ? JSON.parse(slide.content) : slide.content) || {};
    const groups = slideContent.groups || [];
    groups.push({
      id: groupId,
      name: req.body.groupName || `Group ${groupId.slice(0, 8)}`,
      elementIds: req.body.elementIds,
      boundingBox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      createdAt: new Date().toISOString(),
    });
    await prisma.slide.update({
      where: { id: slideId },
      data: { content: { ...slideContent, groups }, updatedAt: new Date() },
    });

    await recordHistory(presentationId, userId, 'group-elements', 'slide', slideId, null, { groupId, elementIds: req.body.elementIds });

    logger.info('Elements grouped', { presentationId, slideId, groupId, count: elements.length });
    res.status(201).json({
      success: true,
      data: {
        groupId,
        groupName: req.body.groupName || `Group ${groupId.slice(0, 8)}`,
        elementCount: elements.length,
        boundingBox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      },
    });
  })
);

// POST /ungroup/:presentationId/:slideId — Ungroup elements
router.post(
  '/ungroup/:presentationId/:slideId',
  authMiddleware,
  validate(ungroupSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId, slideId } = req.params;

    await loadPresentation(presentationId, tenantId);
    const slide = await loadSlide(presentationId, slideId);

    const elements = await prisma.slideElement.findMany({ where: { slideId } });
    const groupedElements = elements.filter((e) => {
      const style = (typeof e.style === 'string' ? JSON.parse(e.style) : e.style) || {};
      return style.groupId === req.body.groupId;
    });

    if (groupedElements.length === 0) {
      res.status(404).json({ success: false, error: 'Group not found', code: 'GROUP_NOT_FOUND' });
      return;
    }

    // Remove group info from element styles
    for (const elem of groupedElements) {
      const style = (typeof elem.style === 'string' ? JSON.parse(elem.style) : elem.style) || {};
      const { groupId: _gid, groupName: _gn, relativeX: _rx, relativeY: _ry, ...cleanStyle } = style;
      await prisma.slideElement.update({
        where: { id: elem.id },
        data: { style: cleanStyle, updatedAt: new Date() },
      });
    }

    // Remove group from slide content
    const slideContent = (typeof slide.content === 'string' ? JSON.parse(slide.content) : slide.content) || {};
    const groups = (slideContent.groups || []).filter(
      (g: Record<string, unknown>) => g.id !== req.body.groupId
    );
    await prisma.slide.update({
      where: { id: slideId },
      data: { content: { ...slideContent, groups }, updatedAt: new Date() },
    });

    await recordHistory(presentationId, userId, 'ungroup-elements', 'slide', slideId, { groupId: req.body.groupId }, null);

    logger.info('Elements ungrouped', { presentationId, slideId, groupId: req.body.groupId });
    res.json({
      success: true,
      data: { ungrouped: groupedElements.length, groupId: req.body.groupId },
    });
  })
);

// POST /smart-slide/:presentationId — Add smart slide
router.post(
  '/smart-slide/:presentationId',
  authMiddleware,
  validate(smartSlideSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const presentation = await loadPresentation(presentationId, tenantId);
    const { type, data, insertAt } = req.body;

    const existingSlides = await prisma.slide.findMany({
      where: { presentationId },
      orderBy: { slideIndex: 'asc' },
    });

    const targetIndex = insertAt !== undefined ? insertAt : existingSlides.length;

    // Shift slides at or after targetIndex
    for (const s of existingSlides) {
      if (s.slideIndex >= targetIndex) {
        await prisma.slide.update({
          where: { id: s.id },
          data: { slideIndex: s.slideIndex + 1, order: s.slideIndex + 1 },
        });
      }
    }

    // Build smart slide content based on type
    let slideContent: Record<string, unknown>;
    let layout: string;

    switch (type) {
      case 'gantt': {
        const tasks = (data.tasks as Array<{ name: string; start: string; end: string; progress?: number; color?: string }>) || [];
        layout = 'chart';
        slideContent = {
          smartType: 'gantt',
          title: (data.title as string) || 'Gantt Chart',
          elements: [
            {
              id: randomUUID(),
              type: 'text',
              text: (data.title as string) || 'Project Timeline',
              x: 0.5, y: 0.3, w: 9, h: 0.8,
              style: { fontSize: 28, bold: true, align: 'center' },
            },
            {
              id: randomUUID(),
              type: 'gantt-chart',
              tasks: tasks.map((t, idx) => ({
                id: idx,
                name: t.name,
                start: t.start,
                end: t.end,
                progress: t.progress || 0,
                color: t.color || `hsl(${(idx * 47) % 360}, 70%, 55%)`,
              })),
              x: 0.5, y: 1.5, w: 9, h: 4.5,
              style: { barHeight: 30, fontSize: 12 },
            },
          ],
        };
        break;
      }
      case 'thermometer': {
        layout = 'content';
        const value = (data.value as number) || 0;
        const max = (data.max as number) || 100;
        const percentage = Math.round((value / max) * 100);
        slideContent = {
          smartType: 'thermometer',
          title: (data.title as string) || 'Progress',
          elements: [
            {
              id: randomUUID(),
              type: 'text',
              text: (data.title as string) || 'Progress Meter',
              x: 0.5, y: 0.3, w: 9, h: 0.8,
              style: { fontSize: 28, bold: true, align: 'center' },
            },
            {
              id: randomUUID(),
              type: 'thermometer',
              value,
              max,
              percentage,
              label: (data.label as string) || `${percentage}%`,
              color: (data.color as string) || '#e74c3c',
              x: 3.5, y: 1.5, w: 3, h: 5,
              style: { borderRadius: 20, showScale: true },
            },
          ],
        };
        break;
      }
      case 'big-number': {
        layout = 'content';
        slideContent = {
          smartType: 'big-number',
          elements: [
            {
              id: randomUUID(),
              type: 'text',
              text: (data.label as string) || 'Key Metric',
              x: 0.5, y: 1, w: 9, h: 1,
              style: { fontSize: 24, color: '#666666', align: 'center' },
            },
            {
              id: randomUUID(),
              type: 'text',
              text: String(data.number || '0'),
              x: 0.5, y: 2.2, w: 9, h: 2.5,
              style: { fontSize: 96, bold: true, color: (data.color as string) || '#2c3e50', align: 'center' },
            },
            {
              id: randomUUID(),
              type: 'text',
              text: (data.subtitle as string) || '',
              x: 1, y: 4.8, w: 8, h: 0.8,
              style: { fontSize: 18, color: '#999999', align: 'center' },
            },
          ],
        };
        if (data.trend) {
          const trendColor = (data.trend as string) === 'up' ? '#27ae60' : '#e74c3c';
          const trendSymbol = (data.trend as string) === 'up' ? '\u25B2' : '\u25BC';
          (slideContent.elements as Array<Record<string, unknown>>).push({
            id: randomUUID(),
            type: 'text',
            text: `${trendSymbol} ${data.trendValue || ''}`,
            x: 3, y: 5.5, w: 4, h: 0.6,
            style: { fontSize: 20, color: trendColor, align: 'center', bold: true },
          });
        }
        break;
      }
      case 'timeline': {
        layout = 'content';
        const events = (data.events as Array<{ date: string; title: string; description?: string }>) || [];
        slideContent = {
          smartType: 'timeline',
          title: (data.title as string) || 'Timeline',
          elements: [
            {
              id: randomUUID(),
              type: 'text',
              text: (data.title as string) || 'Timeline',
              x: 0.5, y: 0.3, w: 9, h: 0.8,
              style: { fontSize: 28, bold: true, align: 'center' },
            },
            {
              id: randomUUID(),
              type: 'timeline',
              events: events.map((ev, idx) => ({
                id: idx,
                date: ev.date,
                title: ev.title,
                description: ev.description || '',
                color: `hsl(${(idx * 60) % 360}, 65%, 55%)`,
              })),
              x: 0.5, y: 1.5, w: 9, h: 5,
              style: { lineColor: '#3498db', dotSize: 12 },
            },
          ],
        };
        break;
      }
      case 'progress': {
        layout = 'content';
        const items = (data.items as Array<{ label: string; value: number; max?: number; color?: string }>) || [];
        slideContent = {
          smartType: 'progress',
          title: (data.title as string) || 'Progress Overview',
          elements: [
            {
              id: randomUUID(),
              type: 'text',
              text: (data.title as string) || 'Progress Overview',
              x: 0.5, y: 0.3, w: 9, h: 0.8,
              style: { fontSize: 28, bold: true, align: 'center' },
            },
            ...items.map((item, idx) => ({
              id: randomUUID(),
              type: 'progress-bar',
              label: item.label,
              value: item.value,
              max: item.max || 100,
              percentage: Math.round((item.value / (item.max || 100)) * 100),
              color: item.color || `hsl(${(idx * 50) % 360}, 65%, 50%)`,
              x: 1,
              y: 1.5 + idx * 1.1,
              w: 8,
              h: 0.8,
            })),
          ],
        };
        break;
      }
      case 'kpi-grid': {
        layout = 'content';
        const kpis = (data.kpis as Array<{ label: string; value: string | number; trend?: string; color?: string }>) || [];
        const cols = Math.min(kpis.length, 4);
        const cardW = 8 / cols;
        slideContent = {
          smartType: 'kpi-grid',
          title: (data.title as string) || 'Key Performance Indicators',
          elements: [
            {
              id: randomUUID(),
              type: 'text',
              text: (data.title as string) || 'Key Performance Indicators',
              x: 0.5, y: 0.3, w: 9, h: 0.8,
              style: { fontSize: 24, bold: true, align: 'center' },
            },
            ...kpis.map((kpi, idx) => ({
              id: randomUUID(),
              type: 'kpi-card',
              label: kpi.label,
              value: String(kpi.value),
              trend: kpi.trend,
              color: kpi.color || '#2c3e50',
              x: 1 + (idx % cols) * cardW,
              y: 1.8 + Math.floor(idx / cols) * 2.5,
              w: cardW - 0.2,
              h: 2.2,
            })),
          ],
        };
        break;
      }
      case 'comparison-table': {
        layout = 'two-column';
        const headers = (data.headers as string[]) || [];
        const rows = (data.rows as string[][]) || [];
        slideContent = {
          smartType: 'comparison-table',
          title: (data.title as string) || 'Comparison',
          elements: [
            {
              id: randomUUID(),
              type: 'text',
              text: (data.title as string) || 'Comparison',
              x: 0.5, y: 0.3, w: 9, h: 0.8,
              style: { fontSize: 28, bold: true, align: 'center' },
            },
            {
              id: randomUUID(),
              type: 'table',
              headers,
              rows,
              x: 0.5, y: 1.5, w: 9, h: 5,
              style: {
                headerBg: (data.headerColor as string) || '#2c3e50',
                headerColor: '#ffffff',
                altRowBg: '#f8f9fa',
                borderColor: '#dee2e6',
              },
            },
          ],
        };
        break;
      }
      default:
        layout = 'blank';
        slideContent = { smartType: type, data, elements: [] };
    }

    const newSlide = await prisma.slide.create({
      data: {
        id: randomUUID(),
        presentationId,
        slideIndex: targetIndex,
        order: targetIndex,
        layout,
        content: slideContent as Prisma.InputJsonValue,
      },
    });

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        slideCount: (presentation.slideCount || 0) + 1,
        updatedAt: new Date(),
      },
    });

    await recordHistory(presentationId, userId, 'add-smart-slide', 'slide', newSlide.id, null, { type, slideIndex: targetIndex });

    logger.info('Smart slide added', { presentationId, type, slideId: newSlide.id });
    res.status(201).json({ success: true, data: newSlide });
  })
);

// POST /widget/:presentationId/:slideId — Add reusable widget
router.post(
  '/widget/:presentationId/:slideId',
  authMiddleware,
  validate(widgetSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId, slideId } = req.params;

    await loadPresentation(presentationId, tenantId);
    await loadSlide(presentationId, slideId);

    const { widgetType, config, position } = req.body;

    // Determine the max layer
    const maxLayerElem = await prisma.slideElement.findFirst({
      where: { slideId },
      orderBy: { layer: 'desc' },
    });
    const newLayer = (maxLayerElem?.layer || 0) + 1;

    // Build widget content
    let widgetContent: Record<string, unknown>;

    switch (widgetType) {
      case 'clock':
        widgetContent = {
          widget: 'clock',
          timezone: (config.timezone as string) || 'Asia/Riyadh',
          format: (config.format as string) || '24h',
          showDate: config.showDate !== false,
        };
        break;
      case 'countdown':
        widgetContent = {
          widget: 'countdown',
          targetDate: (config.targetDate as string) || new Date(Date.now() + 86400000).toISOString(),
          label: (config.label as string) || 'Countdown',
          showDays: config.showDays !== false,
        };
        break;
      case 'social-feed':
        widgetContent = {
          widget: 'social-feed',
          platform: (config.platform as string) || 'twitter',
          handle: (config.handle as string) || '',
          count: (config.count as number) || 5,
        };
        break;
      case 'weather':
        widgetContent = {
          widget: 'weather',
          city: (config.city as string) || 'Riyadh',
          unit: (config.unit as string) || 'celsius',
          showForecast: config.showForecast !== false,
        };
        break;
      case 'map':
        widgetContent = {
          widget: 'map',
          latitude: (config.latitude as number) || 24.7136,
          longitude: (config.longitude as number) || 46.6753,
          zoom: (config.zoom as number) || 12,
          markers: config.markers || [],
        };
        break;
      case 'qr-code':
        widgetContent = {
          widget: 'qr-code',
          data: (config.data as string) || '',
          size: (config.size as number) || 200,
          color: (config.color as string) || '#000000',
          backgroundColor: (config.backgroundColor as string) || '#ffffff',
        };
        break;
      case 'embed':
        widgetContent = {
          widget: 'embed',
          url: (config.url as string) || '',
          type: (config.embedType as string) || 'iframe',
          allowFullscreen: config.allowFullscreen !== false,
        };
        break;
      case 'metric-card':
        widgetContent = {
          widget: 'metric-card',
          label: (config.label as string) || 'Metric',
          value: (config.value as string) || '0',
          icon: (config.icon as string) || 'chart',
          color: (config.color as string) || '#3498db',
          trend: config.trend || null,
        };
        break;
      case 'chart-mini':
        widgetContent = {
          widget: 'chart-mini',
          chartType: (config.chartType as string) || 'line',
          data: config.data || { labels: [], values: [] },
          color: (config.color as string) || '#3498db',
          showLabels: config.showLabels !== false,
        };
        break;
      default:
        widgetContent = { widget: widgetType, config };
    }

    const element = await prisma.slideElement.create({
      data: {
        id: randomUUID(),
        slideId,
        type: `widget-${widgetType}`,
        content: widgetContent as Prisma.InputJsonValue,
        positionX: position.x,
        positionY: position.y,
        width: position.w,
        height: position.h,
        layer: newLayer,
        style: {
          borderRadius: (config.borderRadius as number) || 8,
          shadow: config.shadow !== false,
          backgroundColor: (config.backgroundColor as string) || 'transparent',
        },
      },
    });

    await recordHistory(presentationId, userId, 'add-widget', 'element', element.id, null, { widgetType, position });

    logger.info('Widget added', { presentationId, slideId, widgetType, elementId: element.id });
    res.status(201).json({ success: true, data: element });
  })
);

// POST /convert-to-template/:presentationId — Convert presentation to template
router.post(
  '/convert-to-template/:presentationId',
  authMiddleware,
  validate(convertToTemplateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const presentation = await loadPresentation(presentationId, tenantId);
    const slides = await prisma.slide.findMany({
      where: { presentationId },
      orderBy: { slideIndex: 'asc' },
      include: { slideElements: true },
    });

    // Create a template for each slide
    const templates = [];
    for (const slide of slides) {
      const template = await prisma.slideTemplate.create({
        data: {
          id: randomUUID(),
          name: `${req.body.name} - Slide ${slide.slideIndex + 1}`,
          description: req.body.description || `Template from ${presentation.name}`,
          category: req.body.category,
          layout: slide.layout,
          elements: slide.slideElements.map((e) => ({
            type: e.type,
            content: e.content,
            positionX: e.positionX,
            positionY: e.positionY,
            width: e.width,
            height: e.height,
            rotation: e.rotation,
            layer: e.layer,
            style: e.style,
          })),
          backgroundColor: (() => {
            const content = (typeof slide.content === 'string' ? JSON.parse(slide.content) : slide.content) || {};
            return (content.backgroundColor as string) || null;
          })(),
          metadata: {
            sourcePresentationId: presentationId,
            sourcePresentationName: presentation.name,
            theme: presentation.theme,
            slideIndex: slide.slideIndex,
            createdBy: userId,
            tenantId,
          },
          createdBy: userId,
        },
      });
      templates.push(template);
    }

    await recordHistory(presentationId, userId, 'convert-to-template', 'presentation', presentationId, null, {
      templateCount: templates.length,
      category: req.body.category,
    });

    logger.info('Presentation converted to template', { presentationId, templateCount: templates.length });
    res.status(201).json({
      success: true,
      data: {
        templateCount: templates.length,
        templates: templates.map((t) => ({ id: t.id, name: t.name, category: t.category })),
      },
    });
  })
);

// PUT /outline/:presentationId — Edit presentation outline
router.put(
  '/outline/:presentationId',
  authMiddleware,
  validate(outlineSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    await loadPresentation(presentationId, tenantId);

    // Delete existing slides
    await prisma.slideElement.deleteMany({
      where: { slide: { presentationId } },
    });
    await prisma.slide.deleteMany({ where: { presentationId } });

    const { outline } = req.body;
    const createdSlides = [];

    for (let i = 0; i < outline.length; i++) {
      const item = outline[i];
      const content: Record<string, unknown> = {
        elements: [
          {
            id: randomUUID(),
            type: 'text',
            text: item.title,
            x: 0.5, y: 0.3, w: 9, h: 1,
            style: { fontSize: 32, bold: true, align: 'center' },
          },
        ],
      };

      if (item.bullets && item.bullets.length > 0) {
        (content.elements as Array<Record<string, unknown>>).push({
          id: randomUUID(),
          type: 'text',
          text: item.bullets.map((b: string) => `\u2022 ${b}`).join('\n'),
          x: 1, y: 1.8, w: 8, h: 4.5,
          style: { fontSize: 18, lineSpacing: 1.5 },
        });
      }

      const slide = await prisma.slide.create({
        data: {
          id: randomUUID(),
          presentationId,
          slideIndex: i,
          order: i,
          layout: item.layout || (i === 0 ? 'title' : 'content'),
          content: content as Prisma.InputJsonValue,
          notes: item.notes || null,
        },
      });
      createdSlides.push(slide);
    }

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        slideCount: outline.length,
        updatedAt: new Date(),
      },
    });

    await recordHistory(presentationId, userId, 'edit-outline', 'presentation', presentationId, null, {
      slideCount: outline.length,
      titles: outline.map((o: { title: string }) => o.title),
    });

    logger.info('Presentation outline updated', { presentationId, slideCount: outline.length });
    res.json({
      success: true,
      data: {
        slideCount: createdSlides.length,
        slides: createdSlides.map((s) => ({ id: s.id, slideIndex: s.slideIndex, layout: s.layout })),
      },
    });
  })
);

// POST /batch-edit/:presentationId — Batch edit multiple elements
router.post(
  '/batch-edit/:presentationId',
  authMiddleware,
  validate(batchEditSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    await loadPresentation(presentationId, tenantId);

    const { operations } = req.body;
    const results: Array<{ index: number; status: string; error?: string }> = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      try {
        switch (op.action) {
          case 'update-style': {
            if (!op.elementId) throw new Error('elementId required for update-style');
            const elem = await prisma.slideElement.findFirst({
              where: { id: op.elementId, slideId: op.slideId },
            });
            if (!elem) throw new Error('Element not found');
            const currentStyle = (typeof elem.style === 'string' ? JSON.parse(elem.style) : elem.style) || {};
            await prisma.slideElement.update({
              where: { id: op.elementId },
              data: { style: { ...currentStyle, ...op.payload }, updatedAt: new Date() },
            });
            results.push({ index: i, status: 'success' });
            break;
          }
          case 'update-content': {
            if (!op.elementId) throw new Error('elementId required for update-content');
            const elem = await prisma.slideElement.findFirst({
              where: { id: op.elementId, slideId: op.slideId },
            });
            if (!elem) throw new Error('Element not found');
            const currentContent = (typeof elem.content === 'string' ? JSON.parse(elem.content) : elem.content) || {};
            await prisma.slideElement.update({
              where: { id: op.elementId },
              data: { content: { ...currentContent, ...op.payload }, updatedAt: new Date() },
            });
            results.push({ index: i, status: 'success' });
            break;
          }
          case 'delete': {
            if (!op.elementId) throw new Error('elementId required for delete');
            await prisma.slideElement.delete({ where: { id: op.elementId } });
            results.push({ index: i, status: 'success' });
            break;
          }
          case 'move': {
            if (!op.elementId) throw new Error('elementId required for move');
            await prisma.slideElement.update({
              where: { id: op.elementId },
              data: {
                positionX: op.payload.x as number | undefined,
                positionY: op.payload.y as number | undefined,
                updatedAt: new Date(),
              },
            });
            results.push({ index: i, status: 'success' });
            break;
          }
          case 'resize': {
            if (!op.elementId) throw new Error('elementId required for resize');
            await prisma.slideElement.update({
              where: { id: op.elementId },
              data: {
                width: op.payload.width as number | undefined,
                height: op.payload.height as number | undefined,
                updatedAt: new Date(),
              },
            });
            results.push({ index: i, status: 'success' });
            break;
          }
          case 'set-transparency': {
            if (!op.elementId) throw new Error('elementId required');
            const el = await prisma.slideElement.findUnique({ where: { id: op.elementId } });
            if (!el) throw new Error('Element not found');
            const style = (typeof el.style === 'string' ? JSON.parse(el.style) : el.style) || {};
            const transparency = (op.payload.transparency as number) || 0;
            await prisma.slideElement.update({
              where: { id: op.elementId },
              data: {
                style: { ...style, transparency, opacity: 1 - transparency / 100 },
                updatedAt: new Date(),
              },
            });
            results.push({ index: i, status: 'success' });
            break;
          }
          case 'set-layer': {
            if (!op.elementId) throw new Error('elementId required');
            await prisma.slideElement.update({
              where: { id: op.elementId },
              data: { layer: (op.payload.layer as number) || 0, updatedAt: new Date() },
            });
            results.push({ index: i, status: 'success' });
            break;
          }
          default:
            results.push({ index: i, status: 'error', error: `Unknown action: ${op.action}` });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.push({ index: i, status: 'error', error: message });
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const errorCount = results.filter((r) => r.status === 'error').length;

    await prisma.presentation.update({
      where: { id: presentationId },
      data: { updatedAt: new Date() },
    });

    await recordHistory(presentationId, userId, 'batch-edit', 'presentation', presentationId, null, {
      operationCount: operations.length,
      successCount,
      errorCount,
    });

    logger.info('Batch edit completed', { presentationId, total: operations.length, successCount, errorCount });
    res.json({
      success: true,
      data: {
        total: operations.length,
        successCount,
        errorCount,
        results,
      },
    });
  })
);

export default router;
