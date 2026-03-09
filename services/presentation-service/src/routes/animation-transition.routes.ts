import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/auth';
import AnimationEngineService from '../services/animation-engine.service';

const router = Router();
const prisma = new PrismaClient();
const animationEngine = new AnimationEngineService(prisma);

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

// ─── Validation Schemas ─────────────────────────────────────────────────────

const entranceAnimationSchema = z.object({
  preset: z.string().min(1).max(100),
  trigger: z.enum(['onClick', 'withPrevious', 'afterPrevious', 'onLoad']).default('afterPrevious'),
  timing: z.object({
    duration: z.number().min(50).max(10000).optional(),
    delay: z.number().min(0).max(30000).optional(),
    repeatCount: z.number().min(0).max(100).optional(),
    repeatDelay: z.number().min(0).max(5000).optional(),
    autoReverse: z.boolean().optional(),
    speed: z.number().min(0.1).max(10).optional(),
  }).optional(),
  properties: z.object({
    startOpacity: z.number().min(0).max(1).optional(),
    endOpacity: z.number().min(0).max(1).optional(),
    startScale: z.number().min(0).max(10).optional(),
    endScale: z.number().min(0).max(10).optional(),
    startX: z.number().optional(),
    startY: z.number().optional(),
    endX: z.number().optional(),
    endY: z.number().optional(),
    startRotation: z.number().optional(),
    endRotation: z.number().optional(),
  }).optional(),
});

const exitAnimationSchema = z.object({
  effect: z.enum(['exit_fade', 'exit_fly', 'exit_shrink']).default('exit_fade'),
  trigger: z.enum(['onClick', 'withPrevious', 'afterPrevious', 'onLoad']).default('afterPrevious'),
  direction: z.enum(['left', 'right', 'up', 'down']).optional(),
  timing: z.object({
    duration: z.number().min(50).max(10000).optional(),
    delay: z.number().min(0).max(30000).optional(),
    repeatCount: z.number().min(0).max(100).optional(),
    repeatDelay: z.number().min(0).max(5000).optional(),
    autoReverse: z.boolean().optional(),
    speed: z.number().min(0.1).max(10).optional(),
  }).optional(),
  properties: z.object({
    startOpacity: z.number().min(0).max(1).optional(),
    endOpacity: z.number().min(0).max(1).optional(),
    startScale: z.number().min(0).max(10).optional(),
    endScale: z.number().min(0).max(10).optional(),
    startX: z.number().optional(),
    startY: z.number().optional(),
    endX: z.number().optional(),
    endY: z.number().optional(),
  }).optional(),
});

const emphasisAnimationSchema = z.object({
  emphasis: z.enum(['pulse', 'spin', 'grow', 'shrink', 'bounce', 'shake', 'highlight']).default('pulse'),
  trigger: z.enum(['onClick', 'withPrevious', 'afterPrevious', 'onLoad']).default('afterPrevious'),
  timing: z.object({
    duration: z.number().min(50).max(10000).optional(),
    delay: z.number().min(0).max(30000).optional(),
    repeatCount: z.number().min(0).max(100).optional(),
    repeatDelay: z.number().min(0).max(5000).optional(),
    autoReverse: z.boolean().optional(),
    speed: z.number().min(0.1).max(10).optional(),
  }).optional(),
  color: z.string().optional(),
});

const motionPathSchema = z.object({
  path: z.array(z.object({
    x: z.number(),
    y: z.number(),
    time: z.number().min(0).max(1),
  })).min(2),
  trigger: z.enum(['onClick', 'withPrevious', 'afterPrevious', 'onLoad']).default('afterPrevious'),
  timing: z.object({
    duration: z.number().min(50).max(30000).optional(),
    delay: z.number().min(0).max(30000).optional(),
    repeatCount: z.number().min(0).max(100).optional(),
    autoReverse: z.boolean().optional(),
    speed: z.number().min(0.1).max(10).optional(),
  }).optional(),
  easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic', 'bounce', 'elastic']).optional(),
});

const slideTransitionSchema = z.object({
  type: z.enum(['none', 'fade', 'dissolve', 'slide', 'push', 'wipe', 'split', 'reveal', 'cover', 'uncover', 'morph', 'zoom', 'curtain', 'flip', 'rotate']),
  duration: z.number().min(100).max(5000).default(500),
  delay: z.number().min(0).max(10000).optional(),
  direction: z.enum(['left', 'right', 'up', 'down']).optional(),
  easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic', 'bounce', 'elastic']).optional(),
  advanceOnClick: z.boolean().optional(),
  advanceAfter: z.number().min(0).max(300000).optional(),
});

const cinematicAutoSchema = z.object({
  style: z.enum(['minimal', 'dynamic', 'dramatic', 'professional', 'playful']).default('professional'),
  transitionDuration: z.number().min(200).max(3000).optional(),
  animationDuration: z.number().min(200).max(3000).optional(),
  staggerDelay: z.number().min(0).max(2000).optional(),
});

const applyPresetSchema = z.object({
  presetName: z.string().min(1).max(100),
  overrideExisting: z.boolean().default(false),
  slideIds: z.array(z.string().uuid()).optional(),
});

const timingUpdateSchema = z.object({
  duration: z.number().min(50).max(10000).optional(),
  delay: z.number().min(0).max(30000).optional(),
  repeatCount: z.number().min(0).max(100).optional(),
  repeatDelay: z.number().min(0).max(5000).optional(),
  autoReverse: z.boolean().optional(),
  speed: z.number().min(0.1).max(10).optional(),
});

const reorderAnimationsSchema = z.object({
  animationIds: z.array(z.string().uuid()).min(1),
});

const animationSequenceSchema = z.object({
  name: z.string().min(1).max(200),
  animations: z.array(z.object({
    elementId: z.string().uuid(),
    preset: z.string().min(1),
    trigger: z.enum(['onClick', 'withPrevious', 'afterPrevious', 'onLoad']).default('afterPrevious'),
    timing: z.object({
      duration: z.number().min(50).max(10000).optional(),
      delay: z.number().min(0).max(30000).optional(),
    }).optional(),
  })).min(1),
  loopCount: z.number().min(0).max(100).default(0),
});

const smartAnimateSchema = z.object({
  intensity: z.enum(['subtle', 'moderate', 'bold']).default('moderate'),
  preferEntrance: z.boolean().default(true),
  preferEmphasis: z.boolean().default(false),
  maxAnimationsPerSlide: z.number().min(1).max(20).default(5),
});

// ─── Helper: verify ownership ───────────────────────────────────────────────

async function verifyPresentationOwnership(presentationId: string, tenantId: string): Promise<boolean> {
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, tenantId },
  });
  return !!presentation;
}

async function verifySlideInPresentation(presentationId: string, slideId: string): Promise<boolean> {
  const slide = await prisma.slide.findFirst({
    where: { id: slideId, presentationId },
  });
  return !!slide;
}

async function verifyElementInSlide(slideId: string, elementId: string): Promise<boolean> {
  const element = await prisma.slideElement.findFirst({
    where: { id: elementId, slideId },
  });
  return !!element;
}

// ─── Cinematic style mappings ───────────────────────────────────────────────

interface CinematicStyle {
  transitions: string[];
  entrancePresets: string[];
  emphasisPresets: string[];
  defaultEasing: string;
}

const CINEMATIC_STYLES: Record<string, CinematicStyle> = {
  minimal: {
    transitions: ['fade', 'dissolve'],
    entrancePresets: ['fadeIn'],
    emphasisPresets: ['pulse'],
    defaultEasing: 'easeInOut',
  },
  dynamic: {
    transitions: ['slide', 'push', 'wipe'],
    entrancePresets: ['flyFromLeft', 'flyFromRight', 'flyFromBottom', 'zoomIn'],
    emphasisPresets: ['pulse', 'bounce'],
    defaultEasing: 'easeOutCubic',
  },
  dramatic: {
    transitions: ['zoom', 'morph', 'curtain', 'flip'],
    entrancePresets: ['zoomIn', 'spinIn', 'bounceIn'],
    emphasisPresets: ['shake', 'pulse'],
    defaultEasing: 'elastic',
  },
  professional: {
    transitions: ['fade', 'slide', 'push'],
    entrancePresets: ['fadeIn', 'flyFromLeft', 'flyFromBottom'],
    emphasisPresets: ['pulse'],
    defaultEasing: 'easeInOut',
  },
  playful: {
    transitions: ['flip', 'rotate', 'zoom', 'curtain'],
    entrancePresets: ['bounceIn', 'spinIn', 'zoomIn', 'flyFromBottom'],
    emphasisPresets: ['shake', 'pulse', 'bounce'],
    defaultEasing: 'bounce',
  },
};

// Smart animation element type scoring
const ELEMENT_ANIMATION_MAP: Record<string, string[]> = {
  text: ['fadeIn', 'flyFromLeft', 'flyFromBottom'],
  image: ['fadeIn', 'zoomIn', 'flyFromRight'],
  shape: ['fadeIn', 'zoomIn', 'bounceIn'],
  chart: ['fadeIn', 'flyFromBottom', 'zoomIn'],
  table: ['fadeIn', 'flyFromBottom'],
  icon: ['bounceIn', 'zoomIn', 'spinIn'],
  video: ['fadeIn'],
};

// ─── Routes ─────────────────────────────────────────────────────────────────

// POST /entrance/:presentationId/:slideId/:elementId - Add entrance animation
router.post(
  '/entrance/:presentationId/:slideId/:elementId',
  authMiddleware,
  validate(entranceAnimationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId, elementId } = req.params;
    const tenantId = req.user?.organizationId || 'default';
    const { preset, trigger, timing, properties } = req.body;

    const owned = await verifyPresentationOwnership(presentationId, tenantId);
    if (!owned) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const slideValid = await verifySlideInPresentation(presentationId, slideId);
    if (!slideValid) {
      res.status(404).json({ success: false, error: 'Slide not found in presentation', code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const elementValid = await verifyElementInSlide(slideId, elementId);
    if (!elementValid) {
      res.status(404).json({ success: false, error: 'Element not found in slide', code: 'ELEMENT_NOT_FOUND' });
      return;
    }

    const animation = await animationEngine.addElementAnimation(
      elementId,
      slideId,
      preset,
      trigger,
      timing,
      properties,
    );

    await prisma.presentationAnimationConfig.create({
      data: {
        id: crypto.randomUUID(),
        presentationId,
        slideId,
        elementId,
        animationType: 'entrance',
        direction: animation.effect.direction || null,
        duration: animation.timing.duration,
        delay: animation.timing.delay,
        easing: 'easeInOut',
        config: JSON.parse(JSON.stringify({ preset, trigger, effect: animation.effect, properties: animation.properties })),
        orderIndex: animation.order,
      },
    });

    res.status(201).json({
      success: true,
      data: animation,
    });
  })
);

// POST /exit/:presentationId/:slideId/:elementId - Add exit animation
router.post(
  '/exit/:presentationId/:slideId/:elementId',
  authMiddleware,
  validate(exitAnimationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId, elementId } = req.params;
    const tenantId = req.user?.organizationId || 'default';
    const { effect, trigger, direction, timing, properties } = req.body;

    const owned = await verifyPresentationOwnership(presentationId, tenantId);
    if (!owned) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const slideValid = await verifySlideInPresentation(presentationId, slideId);
    if (!slideValid) {
      res.status(404).json({ success: false, error: 'Slide not found in presentation', code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const elementValid = await verifyElementInSlide(slideId, elementId);
    if (!elementValid) {
      res.status(404).json({ success: false, error: 'Element not found in slide', code: 'ELEMENT_NOT_FOUND' });
      return;
    }

    const existingAnimations = await prisma.elementAnimation.findMany({
      where: { slideId },
      orderBy: { order: 'asc' },
    });
    const maxOrder = existingAnimations.length > 0
      ? Math.max(...existingAnimations.map(a => a.order))
      : -1;

    const defaultExitProps: Record<string, Record<string, number>> = {
      exit_fade: { startOpacity: 1, endOpacity: 0 },
      exit_fly: { startX: 0, endX: direction === 'left' ? -1200 : 1200, startOpacity: 1, endOpacity: 0 },
      exit_shrink: { startScale: 1, endScale: 0, startOpacity: 1, endOpacity: 0 },
    };

    const mergedProperties = { ...defaultExitProps[effect], ...properties };
    const mergedTiming = {
      duration: timing?.duration ?? 500,
      delay: timing?.delay ?? 0,
      repeatCount: timing?.repeatCount ?? 0,
      repeatDelay: timing?.repeatDelay ?? 0,
      autoReverse: timing?.autoReverse ?? false,
      speed: timing?.speed ?? 1,
    };

    const animationRecord = await prisma.elementAnimation.create({
      data: {
        id: crypto.randomUUID(),
        elementId,
        slideId,
        trigger,
        effect: { type: effect, direction },
        timing: mergedTiming,
        properties: mergedProperties,
        order: maxOrder + 1,
        createdAt: new Date(),
      },
    });

    await prisma.presentationAnimationConfig.create({
      data: {
        id: crypto.randomUUID(),
        presentationId,
        slideId,
        elementId,
        animationType: 'exit',
        direction: direction || null,
        duration: mergedTiming.duration,
        delay: mergedTiming.delay,
        easing: 'easeInOut',
        config: { effect, trigger, direction, properties: mergedProperties },
        orderIndex: maxOrder + 1,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: animationRecord.id,
        elementId: animationRecord.elementId,
        slideId: animationRecord.slideId,
        trigger: animationRecord.trigger,
        effect: animationRecord.effect,
        timing: animationRecord.timing,
        properties: animationRecord.properties,
        order: animationRecord.order,
      },
    });
  })
);

// POST /emphasis/:presentationId/:slideId/:elementId - Add emphasis animation
router.post(
  '/emphasis/:presentationId/:slideId/:elementId',
  authMiddleware,
  validate(emphasisAnimationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId, elementId } = req.params;
    const tenantId = req.user?.organizationId || 'default';
    const { emphasis, trigger, timing, color } = req.body;

    const owned = await verifyPresentationOwnership(presentationId, tenantId);
    if (!owned) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const slideValid = await verifySlideInPresentation(presentationId, slideId);
    if (!slideValid) {
      res.status(404).json({ success: false, error: 'Slide not found in presentation', code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const elementValid = await verifyElementInSlide(slideId, elementId);
    if (!elementValid) {
      res.status(404).json({ success: false, error: 'Element not found in slide', code: 'ELEMENT_NOT_FOUND' });
      return;
    }

    const emphasisProps: Record<string, Record<string, unknown>> = {
      pulse: { startScale: 1, endScale: 1.15 },
      spin: { startRotation: 0, endRotation: 360 },
      grow: { startScale: 1, endScale: 1.3 },
      shrink: { startScale: 1, endScale: 0.8 },
      bounce: { startY: 0, endY: -30 },
      shake: { startX: 0, endX: 10 },
      highlight: { color: color || '#ffff00' },
    };

    const emphasisTimingDefaults: Record<string, Record<string, unknown>> = {
      pulse: { duration: 500, repeatCount: 2, autoReverse: true },
      spin: { duration: 700, repeatCount: 0, autoReverse: false },
      grow: { duration: 400, repeatCount: 1, autoReverse: true },
      shrink: { duration: 400, repeatCount: 1, autoReverse: true },
      bounce: { duration: 500, repeatCount: 2, autoReverse: true },
      shake: { duration: 400, repeatCount: 3, autoReverse: true },
      highlight: { duration: 600, repeatCount: 1, autoReverse: true },
    };

    const existingAnimations = await prisma.elementAnimation.findMany({
      where: { slideId },
      orderBy: { order: 'asc' },
    });
    const maxOrder = existingAnimations.length > 0
      ? Math.max(...existingAnimations.map(a => a.order))
      : -1;

    const mergedTiming = {
      duration: timing?.duration ?? (emphasisTimingDefaults[emphasis]?.duration as number) ?? 500,
      delay: timing?.delay ?? 0,
      repeatCount: timing?.repeatCount ?? (emphasisTimingDefaults[emphasis]?.repeatCount as number) ?? 1,
      repeatDelay: timing?.repeatDelay ?? 100,
      autoReverse: timing?.autoReverse ?? (emphasisTimingDefaults[emphasis]?.autoReverse as boolean) ?? true,
      speed: timing?.speed ?? 1,
    };

    const animationRecord = await prisma.elementAnimation.create({
      data: {
        id: crypto.randomUUID(),
        elementId,
        slideId,
        trigger,
        effect: { type: 'emphasis', emphasis },
        timing: mergedTiming,
        properties: JSON.parse(JSON.stringify(emphasisProps[emphasis] || {})),
        order: maxOrder + 1,
        createdAt: new Date(),
      },
    });

    await prisma.presentationAnimationConfig.create({
      data: {
        id: crypto.randomUUID(),
        presentationId,
        slideId,
        elementId,
        animationType: 'emphasis',
        duration: mergedTiming.duration,
        delay: mergedTiming.delay,
        easing: 'easeInOut',
        config: JSON.parse(JSON.stringify({ emphasis, trigger, properties: emphasisProps[emphasis] })),
        orderIndex: maxOrder + 1,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: animationRecord.id,
        elementId: animationRecord.elementId,
        slideId: animationRecord.slideId,
        trigger: animationRecord.trigger,
        effect: animationRecord.effect,
        timing: animationRecord.timing,
        properties: animationRecord.properties,
        order: animationRecord.order,
      },
    });
  })
);

// POST /motion-path/:presentationId/:slideId/:elementId - Add motion path
router.post(
  '/motion-path/:presentationId/:slideId/:elementId',
  authMiddleware,
  validate(motionPathSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId, elementId } = req.params;
    const tenantId = req.user?.organizationId || 'default';
    const { path: motionPoints, trigger, timing, easing } = req.body;

    const owned = await verifyPresentationOwnership(presentationId, tenantId);
    if (!owned) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const slideValid = await verifySlideInPresentation(presentationId, slideId);
    if (!slideValid) {
      res.status(404).json({ success: false, error: 'Slide not found in presentation', code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const elementValid = await verifyElementInSlide(slideId, elementId);
    if (!elementValid) {
      res.status(404).json({ success: false, error: 'Element not found in slide', code: 'ELEMENT_NOT_FOUND' });
      return;
    }

    const existingAnimations = await prisma.elementAnimation.findMany({
      where: { slideId },
      orderBy: { order: 'asc' },
    });
    const maxOrder = existingAnimations.length > 0
      ? Math.max(...existingAnimations.map(a => a.order))
      : -1;

    const startPoint = motionPoints[0];
    const endPoint = motionPoints[motionPoints.length - 1];

    const mergedTiming = {
      duration: timing?.duration ?? 1000,
      delay: timing?.delay ?? 0,
      repeatCount: timing?.repeatCount ?? 0,
      repeatDelay: 0,
      autoReverse: timing?.autoReverse ?? false,
      speed: timing?.speed ?? 1,
    };

    const animationRecord = await prisma.elementAnimation.create({
      data: {
        id: crypto.randomUUID(),
        elementId,
        slideId,
        trigger,
        effect: { type: 'path' as const },
        timing: mergedTiming,
        properties: {
          startX: startPoint.x,
          startY: startPoint.y,
          endX: endPoint.x,
          endY: endPoint.y,
          motionPath: motionPoints,
          startOpacity: 1,
          endOpacity: 1,
        },
        order: maxOrder + 1,
        createdAt: new Date(),
      },
    });

    await prisma.presentationAnimationConfig.create({
      data: {
        id: crypto.randomUUID(),
        presentationId,
        slideId,
        elementId,
        animationType: 'motion_path',
        duration: mergedTiming.duration,
        delay: mergedTiming.delay,
        easing: easing || 'easeInOut',
        config: { motionPath: motionPoints, trigger, easing },
        orderIndex: maxOrder + 1,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: animationRecord.id,
        elementId: animationRecord.elementId,
        slideId: animationRecord.slideId,
        trigger: animationRecord.trigger,
        effect: animationRecord.effect,
        timing: animationRecord.timing,
        properties: animationRecord.properties,
        order: animationRecord.order,
      },
    });
  })
);

// PUT /transition/:presentationId/:slideId - Set slide transition
router.put(
  '/transition/:presentationId/:slideId',
  authMiddleware,
  validate(slideTransitionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId } = req.params;
    const tenantId = req.user?.organizationId || 'default';
    const { type, duration, delay, direction, easing, advanceOnClick, advanceAfter } = req.body;

    const owned = await verifyPresentationOwnership(presentationId, tenantId);
    if (!owned) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const slideValid = await verifySlideInPresentation(presentationId, slideId);
    if (!slideValid) {
      res.status(404).json({ success: false, error: 'Slide not found in presentation', code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const transition = await animationEngine.setSlideTransition(slideId, type, duration, {
      delay,
      direction,
      easing,
      advanceOnClick,
      advanceAfter,
    });

    res.json({
      success: true,
      data: transition,
    });
  })
);

// POST /cinematic-auto/:presentationId - Apply cinematic auto-transitions
router.post(
  '/cinematic-auto/:presentationId',
  authMiddleware,
  validate(cinematicAutoSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const tenantId = req.user?.organizationId || 'default';
    const { style, transitionDuration, animationDuration, staggerDelay } = req.body;

    const owned = await verifyPresentationOwnership(presentationId, tenantId);
    if (!owned) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const slides = await prisma.slide.findMany({
      where: { presentationId },
      orderBy: { slideIndex: 'asc' },
      include: { slideElements: true },
    });

    if (slides.length === 0) {
      res.status(400).json({ success: false, error: 'Presentation has no slides', code: 'NO_SLIDES' });
      return;
    }

    const cinematicStyle = CINEMATIC_STYLES[style] || CINEMATIC_STYLES.professional;
    const tDuration = transitionDuration || 500;
    const aDuration = animationDuration || 600;
    const stagger = staggerDelay || 200;

    const appliedTransitions: Array<{ slideId: string; slideIndex: number; transition: string }> = [];
    const appliedAnimations: Array<{ slideId: string; elementId: string; preset: string }> = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];

      // Apply transition (first slide gets 'none' or 'fade')
      const transitionType = i === 0
        ? 'fade'
        : cinematicStyle.transitions[i % cinematicStyle.transitions.length];

      await animationEngine.setSlideTransition(
        slide.id,
        transitionType as 'fade' | 'slide' | 'dissolve' | 'push' | 'wipe' | 'split' | 'reveal' | 'cover' | 'morph' | 'zoom' | 'curtain' | 'flip' | 'rotate' | 'none' | 'uncover',
        tDuration,
        {
          easing: cinematicStyle.defaultEasing as 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic' | 'bounce' | 'elastic',
        },
      );

      appliedTransitions.push({
        slideId: slide.id,
        slideIndex: slide.slideIndex,
        transition: transitionType,
      });

      // Remove existing animations for this slide
      await prisma.elementAnimation.deleteMany({ where: { slideId: slide.id } });

      // Apply entrance animations to elements with stagger
      const elements = slide.slideElements;
      for (let j = 0; j < elements.length; j++) {
        const element = elements[j];
        const presetName = cinematicStyle.entrancePresets[j % cinematicStyle.entrancePresets.length];

        const animation = await animationEngine.addElementAnimation(
          element.id,
          slide.id,
          presetName,
          j === 0 ? 'onLoad' : 'afterPrevious',
          {
            duration: aDuration,
            delay: j === 0 ? 0 : stagger,
          },
        );

        await prisma.presentationAnimationConfig.create({
          data: {
            id: crypto.randomUUID(),
            presentationId,
            slideId: slide.id,
            elementId: element.id,
            animationType: 'entrance',
            duration: aDuration,
            delay: j === 0 ? 0 : stagger,
            easing: cinematicStyle.defaultEasing,
            config: { preset: presetName, style, auto: true },
            orderIndex: animation.order,
          },
        });

        appliedAnimations.push({
          slideId: slide.id,
          elementId: element.id,
          preset: presetName,
        });
      }
    }

    res.json({
      success: true,
      data: {
        style,
        slidesProcessed: slides.length,
        transitions: appliedTransitions,
        animations: appliedAnimations,
        settings: {
          transitionDuration: tDuration,
          animationDuration: aDuration,
          staggerDelay: stagger,
        },
      },
    });
  })
);

// GET /presets - Get animation presets
router.get(
  '/presets',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const category = req.query.category as string | undefined;
    const presets = animationEngine.getAvailablePresets(category);
    const transitions = animationEngine.getAvailableTransitions();

    res.json({
      success: true,
      data: {
        animations: presets,
        transitions,
        categories: ['entrance', 'emphasis', 'exit', 'motion_path'],
      },
    });
  })
);

// POST /preset/:presentationId - Apply animation preset to all slides
router.post(
  '/preset/:presentationId',
  authMiddleware,
  validate(applyPresetSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const tenantId = req.user?.organizationId || 'default';
    const { presetName, overrideExisting, slideIds } = req.body;

    const owned = await verifyPresentationOwnership(presentationId, tenantId);
    if (!owned) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const availablePresets = animationEngine.getAvailablePresets();
    const presetExists = availablePresets.some(p => p.name === presetName);
    if (!presetExists) {
      res.status(400).json({
        success: false,
        error: `Preset "${presetName}" not found`,
        code: 'PRESET_NOT_FOUND',
        availablePresets: availablePresets.map(p => p.name),
      });
      return;
    }

    const whereClause: { presentationId: string; id?: { in: string[] } } = { presentationId };
    if (slideIds && slideIds.length > 0) {
      whereClause.id = { in: slideIds };
    }

    const slides = await prisma.slide.findMany({
      where: whereClause,
      orderBy: { slideIndex: 'asc' },
      include: { slideElements: true },
    });

    const results: Array<{ slideId: string; animations: number }> = [];

    for (const slide of slides) {
      if (overrideExisting) {
        await prisma.elementAnimation.deleteMany({ where: { slideId: slide.id } });
      }

      let animationsAdded = 0;
      for (const element of slide.slideElements) {
        await animationEngine.addElementAnimation(
          element.id,
          slide.id,
          presetName,
          animationsAdded === 0 ? 'onLoad' : 'afterPrevious',
          { delay: animationsAdded > 0 ? 150 : 0 },
        );
        animationsAdded++;
      }

      results.push({ slideId: slide.id, animations: animationsAdded });
    }

    res.json({
      success: true,
      data: {
        presetName,
        slidesProcessed: slides.length,
        totalAnimations: results.reduce((sum, r) => sum + r.animations, 0),
        details: results,
      },
    });
  })
);

// PUT /timing/:presentationId/:slideId/:elementId - Update animation timing
router.put(
  '/timing/:presentationId/:slideId/:elementId',
  authMiddleware,
  validate(timingUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId, elementId } = req.params;
    const tenantId = req.user?.organizationId || 'default';

    const owned = await verifyPresentationOwnership(presentationId, tenantId);
    if (!owned) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const animations = await prisma.elementAnimation.findMany({
      where: { slideId, elementId },
      orderBy: { order: 'asc' },
    });

    if (animations.length === 0) {
      res.status(404).json({ success: false, error: 'No animations found for this element', code: 'ANIMATION_NOT_FOUND' });
      return;
    }

    const updatedAnimations = [];
    for (const anim of animations) {
      const existingTiming = (anim.timing as Record<string, unknown>) || {};
      const newTiming = { ...existingTiming };

      if (req.body.duration !== undefined) newTiming.duration = req.body.duration;
      if (req.body.delay !== undefined) newTiming.delay = req.body.delay;
      if (req.body.repeatCount !== undefined) newTiming.repeatCount = req.body.repeatCount;
      if (req.body.repeatDelay !== undefined) newTiming.repeatDelay = req.body.repeatDelay;
      if (req.body.autoReverse !== undefined) newTiming.autoReverse = req.body.autoReverse;
      if (req.body.speed !== undefined) newTiming.speed = req.body.speed;

      const updated = await prisma.elementAnimation.update({
        where: { id: anim.id },
        data: { timing: JSON.parse(JSON.stringify(newTiming)) },
      });

      updatedAnimations.push(updated);
    }

    res.json({
      success: true,
      data: {
        elementId,
        animationsUpdated: updatedAnimations.length,
        animations: updatedAnimations.map(a => ({
          id: a.id,
          timing: a.timing,
          effect: a.effect,
          order: a.order,
        })),
      },
    });
  })
);

// DELETE /remove/:presentationId/:slideId/:elementId - Remove animation
router.delete(
  '/remove/:presentationId/:slideId/:elementId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId, elementId } = req.params;
    const tenantId = req.user?.organizationId || 'default';
    const animationId = req.query.animationId as string | undefined;

    const owned = await verifyPresentationOwnership(presentationId, tenantId);
    if (!owned) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    if (animationId) {
      // Remove specific animation
      const anim = await prisma.elementAnimation.findFirst({
        where: { id: animationId, slideId, elementId },
      });
      if (!anim) {
        res.status(404).json({ success: false, error: 'Animation not found', code: 'ANIMATION_NOT_FOUND' });
        return;
      }
      await animationEngine.removeElementAnimation(animationId);
      await prisma.presentationAnimationConfig.deleteMany({
        where: { presentationId, slideId, elementId },
      });

      res.json({ success: true, data: { removed: 1, animationId } });
      return;
    }

    // Remove all animations for the element
    const count = await prisma.elementAnimation.count({
      where: { slideId, elementId },
    });

    await prisma.elementAnimation.deleteMany({
      where: { slideId, elementId },
    });

    await prisma.presentationAnimationConfig.deleteMany({
      where: { presentationId, slideId, elementId },
    });

    res.json({
      success: true,
      data: { removed: count, elementId, slideId },
    });
  })
);

// PUT /reorder/:presentationId/:slideId - Reorder animations
router.put(
  '/reorder/:presentationId/:slideId',
  authMiddleware,
  validate(reorderAnimationsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId } = req.params;
    const tenantId = req.user?.organizationId || 'default';
    const { animationIds } = req.body;

    const owned = await verifyPresentationOwnership(presentationId, tenantId);
    if (!owned) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const slideValid = await verifySlideInPresentation(presentationId, slideId);
    if (!slideValid) {
      res.status(404).json({ success: false, error: 'Slide not found in presentation', code: 'SLIDE_NOT_FOUND' });
      return;
    }

    // Verify all animation IDs belong to this slide
    const existingAnimations = await prisma.elementAnimation.findMany({
      where: { slideId, id: { in: animationIds } },
    });

    if (existingAnimations.length !== animationIds.length) {
      res.status(400).json({
        success: false,
        error: 'Some animation IDs do not belong to this slide',
        code: 'INVALID_ANIMATION_IDS',
        expected: animationIds.length,
        found: existingAnimations.length,
      });
      return;
    }

    await animationEngine.reorderAnimations(slideId, animationIds);

    const reordered = await prisma.elementAnimation.findMany({
      where: { slideId },
      orderBy: { order: 'asc' },
    });

    res.json({
      success: true,
      data: {
        slideId,
        animations: reordered.map(a => ({
          id: a.id,
          elementId: a.elementId,
          order: a.order,
          effect: a.effect,
          trigger: a.trigger,
        })),
      },
    });
  })
);

// POST /sequence/:presentationId/:slideId - Create animation sequence
router.post(
  '/sequence/:presentationId/:slideId',
  authMiddleware,
  validate(animationSequenceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId } = req.params;
    const tenantId = req.user?.organizationId || 'default';
    const { name, animations, loopCount } = req.body;

    const owned = await verifyPresentationOwnership(presentationId, tenantId);
    if (!owned) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const slideValid = await verifySlideInPresentation(presentationId, slideId);
    if (!slideValid) {
      res.status(404).json({ success: false, error: 'Slide not found in presentation', code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const groupId = crypto.randomUUID();
    const createdAnimations = [];

    for (const animDef of animations) {
      const elementValid = await verifyElementInSlide(slideId, animDef.elementId);
      if (!elementValid) {
        res.status(400).json({
          success: false,
          error: `Element ${animDef.elementId} not found in slide`,
          code: 'ELEMENT_NOT_FOUND',
        });
        return;
      }

      const animation = await animationEngine.addElementAnimation(
        animDef.elementId,
        slideId,
        animDef.preset,
        animDef.trigger,
        animDef.timing,
      );

      // Update the group ID
      await prisma.elementAnimation.update({
        where: { id: animation.id },
        data: { groupId },
      });

      createdAnimations.push({ ...animation, groupId });
    }

    // Calculate total duration
    let totalDuration = 0;
    for (const anim of createdAnimations) {
      const delay = anim.timing.delay || 0;
      const duration = anim.timing.duration || 500;
      const end = delay + duration;
      if (end > totalDuration) totalDuration = end;
    }

    res.status(201).json({
      success: true,
      data: {
        id: groupId,
        name,
        slideId,
        loopCount,
        totalDuration,
        animationCount: createdAnimations.length,
        animations: createdAnimations,
      },
    });
  })
);

// GET /preview/:presentationId/:slideId - Preview slide animations (JSON descriptor)
router.get(
  '/preview/:presentationId/:slideId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId } = req.params;
    const tenantId = req.user?.organizationId || 'default';

    const owned = await verifyPresentationOwnership(presentationId, tenantId);
    if (!owned) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const slideValid = await verifySlideInPresentation(presentationId, slideId);
    if (!slideValid) {
      res.status(404).json({ success: false, error: 'Slide not found in presentation', code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const fps = parseInt(req.query.fps as string) || 30;
    const width = parseInt(req.query.width as string) || 960;
    const height = parseInt(req.query.height as string) || 540;

    const preview = await animationEngine.generatePreview(slideId, width, height, fps);

    const transition = await prisma.slideTransition.findUnique({
      where: { slideId },
    });

    res.json({
      success: true,
      data: {
        ...preview,
        transition: transition ? {
          type: transition.type,
          duration: transition.duration,
          easing: transition.easing,
          direction: transition.direction,
        } : null,
      },
    });
  })
);

// POST /smart-animate/:presentationId - AI smart animate
router.post(
  '/smart-animate/:presentationId',
  authMiddleware,
  validate(smartAnimateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const tenantId = req.user?.organizationId || 'default';
    const { intensity, preferEntrance, preferEmphasis, maxAnimationsPerSlide } = req.body;

    const owned = await verifyPresentationOwnership(presentationId, tenantId);
    if (!owned) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const slides = await prisma.slide.findMany({
      where: { presentationId },
      orderBy: { slideIndex: 'asc' },
      include: { slideElements: true },
    });

    if (slides.length === 0) {
      res.status(400).json({ success: false, error: 'Presentation has no slides', code: 'NO_SLIDES' });
      return;
    }

    // Intensity-based duration/delay scaling
    const intensityConfig: Record<string, { durationScale: number; delayScale: number; transitionTypes: string[] }> = {
      subtle: {
        durationScale: 1.2,
        delayScale: 0.5,
        transitionTypes: ['fade', 'dissolve'],
      },
      moderate: {
        durationScale: 1.0,
        delayScale: 1.0,
        transitionTypes: ['fade', 'slide', 'push', 'wipe'],
      },
      bold: {
        durationScale: 0.8,
        delayScale: 1.5,
        transitionTypes: ['zoom', 'morph', 'flip', 'curtain', 'rotate'],
      },
    };

    const config = intensityConfig[intensity] || intensityConfig.moderate;
    const results: Array<{
      slideId: string;
      slideIndex: number;
      transition: string;
      animations: Array<{ elementId: string; type: string; preset: string }>;
    }> = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];

      // Remove existing animations
      await prisma.elementAnimation.deleteMany({ where: { slideId: slide.id } });

      // Select transition based on slide position
      const transitionType = i === 0
        ? 'fade'
        : config.transitionTypes[(i - 1) % config.transitionTypes.length];

      await animationEngine.setSlideTransition(
        slide.id,
        transitionType as 'fade' | 'slide' | 'dissolve' | 'push' | 'wipe' | 'split' | 'reveal' | 'cover' | 'morph' | 'zoom' | 'curtain' | 'flip' | 'rotate' | 'none' | 'uncover',
        Math.round(500 * config.durationScale),
      );

      const slideAnimations: Array<{ elementId: string; type: string; preset: string }> = [];
      const elements = slide.slideElements.slice(0, maxAnimationsPerSlide);

      for (let j = 0; j < elements.length; j++) {
        const element = elements[j];
        const elementType = element.type || 'text';

        // Determine best animation based on element type
        const candidatePresets = ELEMENT_ANIMATION_MAP[elementType] || ELEMENT_ANIMATION_MAP.text;
        let selectedPreset: string;

        if (preferEntrance) {
          selectedPreset = candidatePresets[j % candidatePresets.length];
        } else if (preferEmphasis) {
          selectedPreset = j === 0 ? candidatePresets[0] : 'pulse';
        } else {
          selectedPreset = candidatePresets[0];
        }

        const trigger = j === 0 ? 'onLoad' as const : 'afterPrevious' as const;
        const staggerDelay = Math.round(j * 150 * config.delayScale);

        await animationEngine.addElementAnimation(
          element.id,
          slide.id,
          selectedPreset,
          trigger,
          {
            duration: Math.round(600 * config.durationScale),
            delay: staggerDelay,
          },
        );

        slideAnimations.push({
          elementId: element.id,
          type: elementType,
          preset: selectedPreset,
        });
      }

      results.push({
        slideId: slide.id,
        slideIndex: slide.slideIndex,
        transition: transitionType,
        animations: slideAnimations,
      });
    }

    res.json({
      success: true,
      data: {
        presentationId,
        intensity,
        slidesProcessed: slides.length,
        totalAnimations: results.reduce((sum, r) => sum + r.animations.length, 0),
        slides: results,
      },
    });
  })
);

export default router;
