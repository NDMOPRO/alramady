import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
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

// ─── Helper: verify slide exists ────────────────────────────────────────────

async function verifySlide(presentationId: string, slideId: string): Promise<{ slide: Record<string, unknown> | null; error: string | null }> {
  const slide = await prisma.slide.findFirst({
    where: { id: slideId, presentationId },
  });
  if (!slide) {
    return { slide: null, error: 'Slide not found in presentation' };
  }
  return { slide: slide as unknown as Record<string, unknown>, error: null };
}

async function verifyPresentation(presentationId: string, userId: string): Promise<{ presentation: Record<string, unknown> | null; error: string | null }> {
  const presentation = await prisma.presentation.findUnique({ where: { id: presentationId } });
  if (!presentation) {
    return { presentation: null, error: 'Presentation not found' };
  }
  if (presentation.userId !== userId) {
    const collab = await prisma.presentationCollaboration.findUnique({
      where: { presentationId_userId: { presentationId, userId } },
    });
    if (!collab || !['editor', 'admin'].includes(collab.role)) {
      return { presentation: null, error: 'Access denied - editor role required' };
    }
  }
  return { presentation: presentation as unknown as Record<string, unknown>, error: null };
}

async function addInteractiveElement(
  presentationId: string,
  slideId: string,
  userId: string,
  elementType: string,
  elementData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const element = await prisma.slideElement.create({
    data: {
      slideId,
      type: elementType,
      content: {
        ...elementData,
        interactiveType: elementType,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      },
      positionX: (elementData.positionX as number) || 0,
      positionY: (elementData.positionY as number) || 0,
      width: (elementData.width as number) || 400,
      height: (elementData.height as number) || 300,
      layer: (elementData.layer as number) || 10,
      style: JSON.parse(JSON.stringify((elementData.style as Record<string, unknown>) || {})),
    },
  });

  await prisma.presentation.update({
    where: { id: presentationId },
    data: { updatedAt: new Date() },
  });

  return element as unknown as Record<string, unknown>;
}

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const quizSchema = z.object({
  slideIndex: z.number().int().min(0),
  title: z.string().min(1).max(500),
  questions: z.array(z.object({
    question: z.string().min(1),
    type: z.enum(['multiple-choice', 'true-false', 'short-answer', 'fill-blank', 'matching']),
    options: z.array(z.string()).optional(),
    correctAnswer: z.union([z.string(), z.number(), z.array(z.string())]),
    points: z.number().min(0).optional(),
    explanation: z.string().optional(),
    timeLimit: z.number().min(5).optional(),
    media: z.object({
      type: z.enum(['image', 'video', 'audio']),
      url: z.string(),
    }).optional(),
  })).min(1),
  settings: z.object({
    shuffleQuestions: z.boolean().optional(),
    shuffleOptions: z.boolean().optional(),
    showResults: z.boolean().optional(),
    passingScore: z.number().min(0).max(100).optional(),
    allowRetry: z.boolean().optional(),
    maxRetries: z.number().min(1).optional(),
  }).optional(),
  style: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const updateQuizSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  questions: z.array(z.object({
    question: z.string().min(1),
    type: z.enum(['multiple-choice', 'true-false', 'short-answer', 'fill-blank', 'matching']),
    options: z.array(z.string()).optional(),
    correctAnswer: z.union([z.string(), z.number(), z.array(z.string())]),
    points: z.number().min(0).optional(),
    explanation: z.string().optional(),
    timeLimit: z.number().min(5).optional(),
  })).optional(),
  settings: z.record(z.unknown()).optional(),
});

const pollSchema = z.object({
  slideIndex: z.number().int().min(0),
  question: z.string().min(1).max(1000),
  type: z.enum(['single-choice', 'multiple-choice', 'rating', 'word-cloud', 'open-ended']),
  options: z.array(z.string()).optional(),
  settings: z.object({
    anonymous: z.boolean().optional(),
    showResultsLive: z.boolean().optional(),
    allowMultipleVotes: z.boolean().optional(),
    closingTime: z.string().datetime().optional(),
    maxSelections: z.number().min(1).optional(),
  }).optional(),
  style: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const clickableMenuSchema = z.object({
  items: z.array(z.object({
    label: z.string().min(1),
    targetSlide: z.number().int().min(0).optional(),
    targetUrl: z.string().url().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
  })).min(1),
  layout: z.enum(['horizontal', 'vertical', 'grid', 'radial']).optional(),
  style: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const branchingSchema = z.object({
  startSlideIndex: z.number().int().min(0),
  title: z.string().min(1).max(500),
  nodes: z.array(z.object({
    id: z.string().min(1),
    slideIndex: z.number().int().min(0),
    question: z.string().optional(),
    choices: z.array(z.object({
      label: z.string().min(1),
      targetNodeId: z.string().min(1),
      condition: z.string().optional(),
    })).optional(),
    isEndNode: z.boolean().optional(),
    endMessage: z.string().optional(),
  })).min(1),
  settings: z.object({
    trackPath: z.boolean().optional(),
    allowBacktrack: z.boolean().optional(),
    showProgress: z.boolean().optional(),
  }).optional(),
});

const toggleSchema = z.object({
  title: z.string().min(1).max(500),
  sections: z.array(z.object({
    header: z.string().min(1),
    content: z.string().min(1),
    defaultExpanded: z.boolean().optional(),
    icon: z.string().optional(),
  })).min(1),
  layout: z.enum(['accordion', 'tabs', 'collapsible', 'expandable-list']).optional(),
  style: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const progressBarSchema = z.object({
  type: z.enum(['linear', 'circular', 'segmented', 'stepped']),
  showPercentage: z.boolean().optional(),
  showSlideCount: z.boolean().optional(),
  position: z.enum(['top', 'bottom', 'left', 'right']).optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  height: z.number().min(2).max(20).optional(),
  animated: z.boolean().optional(),
  style: z.record(z.unknown()).optional(),
});

const calculatorSchema = z.object({
  type: z.enum(['basic', 'scientific', 'financial', 'custom']),
  title: z.string().max(200).optional(),
  fields: z.array(z.object({
    name: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(['number', 'currency', 'percentage', 'select']),
    defaultValue: z.union([z.number(), z.string()]).optional(),
    options: z.array(z.string()).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })).optional(),
  formula: z.string().optional(),
  outputLabel: z.string().optional(),
  style: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const miniGameSchema = z.object({
  type: z.enum(['memory-match', 'drag-drop', 'word-search', 'jigsaw', 'sorting', 'quiz-race', 'spin-wheel']),
  title: z.string().min(1).max(500),
  config: z.object({
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    timeLimit: z.number().min(10).optional(),
    items: z.array(z.object({
      label: z.string(),
      value: z.string().optional(),
      image: z.string().optional(),
      matchId: z.string().optional(),
      category: z.string().optional(),
    })).optional(),
    rewards: z.object({
      type: z.enum(['points', 'badge', 'animation']),
      value: z.union([z.string(), z.number()]).optional(),
    }).optional(),
  }),
  style: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const hotspotSchema = z.object({
  backgroundImage: z.string().optional(),
  hotspots: z.array(z.object({
    id: z.string().optional(),
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
    shape: z.enum(['circle', 'rectangle', 'polygon']).optional(),
    label: z.string(),
    content: z.string().optional(),
    action: z.enum(['tooltip', 'popup', 'navigate', 'link', 'reveal']).optional(),
    targetSlide: z.number().int().min(0).optional(),
    targetUrl: z.string().optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
  })).min(1),
  style: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const timerSchema = z.object({
  type: z.enum(['countdown', 'stopwatch', 'pomodoro', 'interval']),
  durationSeconds: z.number().min(1).max(86400),
  autoStart: z.boolean().optional(),
  showControls: z.boolean().optional(),
  warningThreshold: z.number().min(1).optional(),
  onComplete: z.enum(['alert', 'navigate-next', 'auto-submit', 'custom']).optional(),
  display: z.enum(['digital', 'analog', 'progress-ring', 'bar']).optional(),
  style: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const embedAppSchema = z.object({
  url: z.string().url(),
  title: z.string().max(200).optional(),
  sandbox: z.array(z.enum([
    'allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-popups', 'allow-modals',
  ])).optional(),
  width: z.number().min(100).optional(),
  height: z.number().min(100).optional(),
  responsive: z.boolean().optional(),
  style: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const embedVideoSchema = z.object({
  source: z.enum(['youtube', 'vimeo', 'url', 'upload']),
  videoId: z.string().optional(),
  url: z.string().optional(),
  startTime: z.number().min(0).optional(),
  endTime: z.number().min(0).optional(),
  autoPlay: z.boolean().optional(),
  loop: z.boolean().optional(),
  muted: z.boolean().optional(),
  controls: z.boolean().optional(),
  width: z.number().min(100).optional(),
  height: z.number().min(100).optional(),
  style: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const liveDashboardSchema = z.object({
  dataSource: z.object({
    type: z.enum(['api', 'websocket', 'static', 'database']),
    url: z.string().optional(),
    refreshInterval: z.number().min(1000).optional(),
    query: z.string().optional(),
  }),
  widgets: z.array(z.object({
    type: z.enum(['chart', 'number', 'gauge', 'table', 'map', 'sparkline', 'status']),
    title: z.string(),
    dataField: z.string(),
    config: z.record(z.unknown()).optional(),
    position: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  })).min(1),
  refreshInterval: z.number().min(1000).optional(),
  style: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

// ─── Quiz endpoints ─────────────────────────────────────────────────────────

router.post(
  '/quiz/:presentationId',
  authMiddleware,
  validate(quizSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;
    const { slideIndex, title, questions, settings, style, position } = req.body;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const slide = await prisma.slide.findFirst({
      where: { presentationId, slideIndex },
    });
    if (!slide) {
      res.status(404).json({ success: false, error: 'Slide not found at given index', code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const quizId = crypto.randomUUID();
    const enrichedQuestions = questions.map((q: Record<string, unknown>, idx: number) => ({
      ...q,
      id: crypto.randomUUID(),
      order: idx,
      points: (q.points as number) || 10,
    }));

    const element = await addInteractiveElement(presentationId, slide.id, userId, 'quiz', {
      quizId,
      title,
      questions: enrichedQuestions,
      settings: {
        shuffleQuestions: false,
        shuffleOptions: false,
        showResults: true,
        passingScore: 60,
        allowRetry: true,
        maxRetries: 3,
        ...(settings || {}),
      },
      totalPoints: enrichedQuestions.reduce((sum: number, q: Record<string, unknown>) => sum + ((q.points as number) || 10), 0),
      style: style || {},
      positionX: position?.x || 50,
      positionY: position?.y || 50,
      width: 600,
      height: 400,
    });

    res.status(201).json({
      success: true,
      data: {
        quizId,
        elementId: (element as Record<string, unknown>).id,
        presentationId,
        slideIndex,
        title,
        questionCount: enrichedQuestions.length,
        totalPoints: enrichedQuestions.reduce((sum: number, q: Record<string, unknown>) => sum + ((q.points as number) || 10), 0),
        questions: enrichedQuestions,
        settings: settings || {},
      },
    });
  })
);

router.put(
  '/quiz/:quizId',
  authMiddleware,
  validate(updateQuizSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { quizId } = req.params;
    const userId = req.user!.userId;
    const { title, questions, settings } = req.body;

    const elements = await prisma.slideElement.findMany({
      where: { type: 'quiz' },
    });

    const quizElement = elements.find((el) => {
      const content = el.content as Record<string, unknown> | null;
      return content && (content as Record<string, unknown>).quizId === quizId;
    });

    if (!quizElement) {
      res.status(404).json({ success: false, error: 'Quiz not found', code: 'QUIZ_NOT_FOUND' });
      return;
    }

    const slide = await prisma.slide.findUnique({ where: { id: quizElement.slideId } });
    if (!slide) {
      res.status(404).json({ success: false, error: 'Associated slide not found', code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const { error } = await verifyPresentation(slide.presentationId, userId);
    if (error) {
      res.status(403).json({ success: false, error, code: 'FORBIDDEN' });
      return;
    }

    const existingContent = quizElement.content as Record<string, unknown>;
    const updatedContent: Record<string, unknown> = { ...existingContent };

    if (title) updatedContent.title = title;
    if (questions) {
      updatedContent.questions = questions.map((q: Record<string, unknown>, idx: number) => ({
        ...q,
        id: crypto.randomUUID(),
        order: idx,
        points: (q.points as number) || 10,
      }));
      updatedContent.totalPoints = (updatedContent.questions as Array<Record<string, unknown>>)
        .reduce((sum: number, q: Record<string, unknown>) => sum + ((q.points as number) || 10), 0);
    }
    if (settings) {
      updatedContent.settings = { ...(existingContent.settings as Record<string, unknown> || {}), ...settings };
    }
    updatedContent.updatedAt = new Date().toISOString();
    updatedContent.updatedBy = userId;

    await prisma.slideElement.update({
      where: { id: quizElement.id },
      data: { content: JSON.parse(JSON.stringify(updatedContent)) },
    });

    res.json({
      success: true,
      data: {
        quizId,
        elementId: quizElement.id,
        title: updatedContent.title,
        questionCount: (updatedContent.questions as unknown[]).length,
        totalPoints: updatedContent.totalPoints,
        updated: true,
      },
    });
  })
);

router.get(
  '/quiz/results/:presentationId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const slides = await prisma.slide.findMany({
      where: { presentationId },
      select: { id: true, slideIndex: true },
    });
    const slideIds = slides.map((s) => s.id);

    const quizElements = await prisma.slideElement.findMany({
      where: { slideId: { in: slideIds }, type: 'quiz' },
    });

    const events = await prisma.collaborationEvent.findMany({
      where: { presentationId, eventType: 'quiz_response' },
      orderBy: { createdAt: 'desc' },
    });

    const results = quizElements.map((el) => {
      const content = el.content as Record<string, unknown>;
      const quizEvents = events.filter((e) => {
        return e.userId !== '';
      });
      const questions = (content.questions as Array<Record<string, unknown>>) || [];
      return {
        quizId: content.quizId,
        title: content.title,
        slideId: el.slideId,
        slideIndex: slides.find((s) => s.id === el.slideId)?.slideIndex,
        questionCount: questions.length,
        totalPoints: content.totalPoints || 0,
        responseCount: quizEvents.length,
        averageScore: 0,
        completionRate: 0,
        questionBreakdown: questions.map((q) => ({
          id: q.id,
          question: q.question,
          type: q.type,
          points: q.points || 10,
          correctRate: 0,
        })),
      };
    });

    res.json({
      success: true,
      data: { presentationId, quizzes: results, totalQuizzes: results.length },
    });
  })
);

// ─── Poll endpoints ─────────────────────────────────────────────────────────

router.post(
  '/poll/:presentationId',
  authMiddleware,
  validate(pollSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;
    const { slideIndex, question, type, options, settings, style, position } = req.body;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const slide = await prisma.slide.findFirst({
      where: { presentationId, slideIndex },
    });
    if (!slide) {
      res.status(404).json({ success: false, error: 'Slide not found at given index', code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const pollId = crypto.randomUUID();
    const enrichedOptions = (options || []).map((opt: string, idx: number) => ({
      id: crypto.randomUUID(),
      label: opt,
      order: idx,
      votes: 0,
    }));

    const element = await addInteractiveElement(presentationId, slide.id, userId, 'poll', {
      pollId,
      question,
      type,
      options: enrichedOptions,
      settings: {
        anonymous: true,
        showResultsLive: true,
        allowMultipleVotes: false,
        ...(settings || {}),
      },
      responses: [],
      totalVotes: 0,
      status: 'active',
      style: style || {},
      positionX: position?.x || 50,
      positionY: position?.y || 50,
      width: 500,
      height: 350,
    });

    res.status(201).json({
      success: true,
      data: {
        pollId,
        elementId: (element as Record<string, unknown>).id,
        presentationId,
        slideIndex,
        question,
        type,
        options: enrichedOptions,
        settings: settings || {},
        status: 'active',
      },
    });
  })
);

router.get(
  '/poll/results/:presentationId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const slides = await prisma.slide.findMany({
      where: { presentationId },
      select: { id: true, slideIndex: true },
    });
    const slideIds = slides.map((s) => s.id);

    const pollElements = await prisma.slideElement.findMany({
      where: { slideId: { in: slideIds }, type: 'poll' },
    });

    const results = pollElements.map((el) => {
      const content = el.content as Record<string, unknown>;
      const options = (content.options as Array<Record<string, unknown>>) || [];
      const totalVotes = options.reduce((sum: number, o: Record<string, unknown>) => sum + ((o.votes as number) || 0), 0);

      return {
        pollId: content.pollId,
        question: content.question,
        type: content.type,
        slideId: el.slideId,
        slideIndex: slides.find((s) => s.id === el.slideId)?.slideIndex,
        status: content.status || 'active',
        totalVotes,
        options: options.map((o) => ({
          id: o.id,
          label: o.label,
          votes: (o.votes as number) || 0,
          percentage: totalVotes > 0 ? Math.round(((o.votes as number) || 0) / totalVotes * 100) : 0,
        })),
      };
    });

    res.json({
      success: true,
      data: { presentationId, polls: results, totalPolls: results.length },
    });
  })
);

// ─── Clickable Menu endpoint ────────────────────────────────────────────────

router.post(
  '/clickable-menu/:presentationId/:slideId',
  authMiddleware,
  validate(clickableMenuSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId } = req.params;
    const userId = req.user!.userId;
    const { items, layout, style, position } = req.body;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const { slide, error: slideError } = await verifySlide(presentationId, slideId);
    if (slideError) {
      res.status(404).json({ success: false, error: slideError, code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const enrichedItems = items.map((item: Record<string, unknown>, idx: number) => ({
      ...item,
      id: crypto.randomUUID(),
      order: idx,
    }));

    const element = await addInteractiveElement(presentationId, slideId, userId, 'clickable-menu', {
      items: enrichedItems,
      layout: layout || 'vertical',
      style: style || {},
      positionX: position?.x || 50,
      positionY: position?.y || 50,
      width: 300,
      height: enrichedItems.length * 50 + 40,
    });

    res.status(201).json({
      success: true,
      data: {
        elementId: (element as Record<string, unknown>).id,
        presentationId,
        slideId,
        items: enrichedItems,
        layout: layout || 'vertical',
      },
    });
  })
);

// ─── Branching Scenario endpoint ────────────────────────────────────────────

router.post(
  '/branching/:presentationId',
  authMiddleware,
  validate(branchingSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;
    const { startSlideIndex, title, nodes, settings } = req.body;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const startSlide = await prisma.slide.findFirst({
      where: { presentationId, slideIndex: startSlideIndex },
    });
    if (!startSlide) {
      res.status(404).json({ success: false, error: 'Start slide not found', code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const branchingId = crypto.randomUUID();
    const element = await addInteractiveElement(presentationId, startSlide.id, userId, 'branching', {
      branchingId,
      title,
      startSlideIndex,
      nodes,
      settings: {
        trackPath: true,
        allowBacktrack: true,
        showProgress: true,
        ...(settings || {}),
      },
      positionX: 0,
      positionY: 0,
      width: 800,
      height: 600,
    });

    const endNodes = nodes.filter((n: Record<string, unknown>) => n.isEndNode);
    const totalPaths = nodes.reduce((count: number, n: Record<string, unknown>) => {
      const choices = n.choices as Array<Record<string, unknown>> | undefined;
      return count + (choices ? choices.length : 0);
    }, 0);

    res.status(201).json({
      success: true,
      data: {
        branchingId,
        elementId: (element as Record<string, unknown>).id,
        presentationId,
        title,
        startSlideIndex,
        nodeCount: nodes.length,
        endNodeCount: endNodes.length,
        totalPaths,
        settings: settings || {},
      },
    });
  })
);

// ─── Toggle/Collapsible endpoint ────────────────────────────────────────────

router.post(
  '/toggle/:presentationId/:slideId',
  authMiddleware,
  validate(toggleSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId } = req.params;
    const userId = req.user!.userId;
    const { title, sections, layout, style, position } = req.body;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const { error: slideError } = await verifySlide(presentationId, slideId);
    if (slideError) {
      res.status(404).json({ success: false, error: slideError, code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const enrichedSections = sections.map((s: Record<string, unknown>, idx: number) => ({
      ...s,
      id: crypto.randomUUID(),
      order: idx,
      defaultExpanded: (s.defaultExpanded as boolean) || idx === 0,
    }));

    const element = await addInteractiveElement(presentationId, slideId, userId, 'toggle', {
      title,
      sections: enrichedSections,
      layout: layout || 'accordion',
      style: style || {},
      positionX: position?.x || 50,
      positionY: position?.y || 50,
      width: 500,
      height: 400,
    });

    res.status(201).json({
      success: true,
      data: {
        elementId: (element as Record<string, unknown>).id,
        presentationId,
        slideId,
        title,
        sectionCount: enrichedSections.length,
        layout: layout || 'accordion',
      },
    });
  })
);

// ─── Progress Bar endpoint ──────────────────────────────────────────────────

router.post(
  '/progress-bar/:presentationId',
  authMiddleware,
  validate(progressBarSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;
    const { type, showPercentage, showSlideCount, position, color, backgroundColor, height, animated, style } = req.body;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const presentation = await prisma.presentation.findUnique({ where: { id: presentationId } });

    const progressConfig = {
      type,
      showPercentage: showPercentage !== undefined ? showPercentage : true,
      showSlideCount: showSlideCount !== undefined ? showSlideCount : true,
      position: position || 'bottom',
      color: color || '#1a73e8',
      backgroundColor: backgroundColor || '#e0e0e0',
      height: height || 4,
      animated: animated !== undefined ? animated : true,
      totalSlides: presentation?.slideCount || 0,
    };

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        settings: {
          ...(presentation?.settings as Record<string, unknown> || {}),
          progressBar: progressConfig,
        },
        updatedAt: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        presentationId,
        progressBar: progressConfig,
      },
    });
  })
);

// ─── Calculator endpoint ────────────────────────────────────────────────────

router.post(
  '/calculator/:presentationId/:slideId',
  authMiddleware,
  validate(calculatorSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId } = req.params;
    const userId = req.user!.userId;
    const { type, title, fields, formula, outputLabel, style, position } = req.body;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const { error: slideError } = await verifySlide(presentationId, slideId);
    if (slideError) {
      res.status(404).json({ success: false, error: slideError, code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const element = await addInteractiveElement(presentationId, slideId, userId, 'calculator', {
      calculatorType: type,
      title: title || 'Calculator',
      fields: fields || [],
      formula: formula || '',
      outputLabel: outputLabel || 'Result',
      style: style || {},
      positionX: position?.x || 100,
      positionY: position?.y || 100,
      width: 350,
      height: 400,
    });

    res.status(201).json({
      success: true,
      data: {
        elementId: (element as Record<string, unknown>).id,
        presentationId,
        slideId,
        type,
        title: title || 'Calculator',
        fieldCount: (fields || []).length,
        hasFormula: !!formula,
      },
    });
  })
);

// ─── Mini-Game endpoint ─────────────────────────────────────────────────────

router.post(
  '/mini-game/:presentationId/:slideId',
  authMiddleware,
  validate(miniGameSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId } = req.params;
    const userId = req.user!.userId;
    const { type, title, config, style, position } = req.body;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const { error: slideError } = await verifySlide(presentationId, slideId);
    if (slideError) {
      res.status(404).json({ success: false, error: slideError, code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const gameId = crypto.randomUUID();
    const element = await addInteractiveElement(presentationId, slideId, userId, 'mini-game', {
      gameId,
      gameType: type,
      title,
      config: {
        difficulty: 'medium',
        timeLimit: 60,
        ...config,
      },
      leaderboard: [],
      playCount: 0,
      style: style || {},
      positionX: position?.x || 50,
      positionY: position?.y || 50,
      width: 600,
      height: 450,
    });

    res.status(201).json({
      success: true,
      data: {
        gameId,
        elementId: (element as Record<string, unknown>).id,
        presentationId,
        slideId,
        type,
        title,
        config: { difficulty: 'medium', timeLimit: 60, ...config },
      },
    });
  })
);

// ─── Hotspot endpoint ───────────────────────────────────────────────────────

router.post(
  '/hotspot/:presentationId/:slideId',
  authMiddleware,
  validate(hotspotSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId } = req.params;
    const userId = req.user!.userId;
    const { backgroundImage, hotspots, style, position } = req.body;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const { error: slideError } = await verifySlide(presentationId, slideId);
    if (slideError) {
      res.status(404).json({ success: false, error: slideError, code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const enrichedHotspots = hotspots.map((h: Record<string, unknown>, idx: number) => ({
      ...h,
      id: (h.id as string) || crypto.randomUUID(),
      order: idx,
      shape: (h.shape as string) || 'circle',
      action: (h.action as string) || 'tooltip',
      width: (h.width as number) || 40,
      height: (h.height as number) || 40,
    }));

    const element = await addInteractiveElement(presentationId, slideId, userId, 'hotspot', {
      backgroundImage: backgroundImage || null,
      hotspots: enrichedHotspots,
      style: style || {},
      positionX: position?.x || 0,
      positionY: position?.y || 0,
      width: 800,
      height: 600,
    });

    res.status(201).json({
      success: true,
      data: {
        elementId: (element as Record<string, unknown>).id,
        presentationId,
        slideId,
        hotspotCount: enrichedHotspots.length,
        hotspots: enrichedHotspots,
        hasBackgroundImage: !!backgroundImage,
      },
    });
  })
);

// ─── Timer endpoint ─────────────────────────────────────────────────────────

router.post(
  '/timer/:presentationId/:slideId',
  authMiddleware,
  validate(timerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId } = req.params;
    const userId = req.user!.userId;
    const { type, durationSeconds, autoStart, showControls, warningThreshold, onComplete, display, style, position } = req.body;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const { error: slideError } = await verifySlide(presentationId, slideId);
    if (slideError) {
      res.status(404).json({ success: false, error: slideError, code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const slide = await prisma.slide.findUnique({ where: { id: slideId } });
    const presentation = await prisma.presentation.findUnique({ where: { id: presentationId } });

    const timerSession = await prisma.timerSession.create({
      data: {
        presentationId,
        totalSlides: presentation?.slideCount || 1,
        totalDurationSeconds: durationSeconds,
        warningThreshold: warningThreshold || 80,
        autoAdvance: onComplete === 'navigate-next',
        currentSlide: slide?.slideIndex || 0,
        status: autoStart ? 'running' : 'not_started',
        startedAt: autoStart ? new Date() : null,
      },
    });

    const element = await addInteractiveElement(presentationId, slideId, userId, 'timer', {
      timerSessionId: timerSession.id,
      timerType: type,
      durationSeconds,
      autoStart: autoStart || false,
      showControls: showControls !== undefined ? showControls : true,
      warningThreshold: warningThreshold || Math.floor(durationSeconds * 0.8),
      onComplete: onComplete || 'alert',
      display: display || 'digital',
      style: style || {},
      positionX: position?.x || 50,
      positionY: position?.y || 50,
      width: 200,
      height: 200,
    });

    res.status(201).json({
      success: true,
      data: {
        elementId: (element as Record<string, unknown>).id,
        timerSessionId: timerSession.id,
        presentationId,
        slideId,
        type,
        durationSeconds,
        display: display || 'digital',
        autoStart: autoStart || false,
        status: autoStart ? 'running' : 'not_started',
      },
    });
  })
);

// ─── Embed App endpoint ─────────────────────────────────────────────────────

router.post(
  '/embed-app/:presentationId/:slideId',
  authMiddleware,
  validate(embedAppSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId } = req.params;
    const userId = req.user!.userId;
    const { url, title, sandbox, width, height, responsive, style, position } = req.body;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const { error: slideError } = await verifySlide(presentationId, slideId);
    if (slideError) {
      res.status(404).json({ success: false, error: slideError, code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const element = await addInteractiveElement(presentationId, slideId, userId, 'embed-app', {
      url,
      title: title || 'Embedded Application',
      sandbox: sandbox || ['allow-scripts', 'allow-same-origin'],
      responsive: responsive !== undefined ? responsive : true,
      style: style || {},
      positionX: position?.x || 50,
      positionY: position?.y || 50,
      width: width || 800,
      height: height || 600,
    });

    res.status(201).json({
      success: true,
      data: {
        elementId: (element as Record<string, unknown>).id,
        presentationId,
        slideId,
        url,
        title: title || 'Embedded Application',
        sandbox: sandbox || ['allow-scripts', 'allow-same-origin'],
        width: width || 800,
        height: height || 600,
      },
    });
  })
);

// ─── Embed Video endpoint ───────────────────────────────────────────────────

router.post(
  '/embed-video/:presentationId/:slideId',
  authMiddleware,
  validate(embedVideoSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId } = req.params;
    const userId = req.user!.userId;
    const { source, videoId, url, startTime, endTime, autoPlay, loop, muted, controls, width, height, style, position } = req.body;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const { error: slideError } = await verifySlide(presentationId, slideId);
    if (slideError) {
      res.status(404).json({ success: false, error: slideError, code: 'SLIDE_NOT_FOUND' });
      return;
    }

    let embedUrl = url || '';
    if (source === 'youtube' && videoId) {
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
      if (startTime) embedUrl += `?start=${startTime}`;
    } else if (source === 'vimeo' && videoId) {
      embedUrl = `https://player.vimeo.com/video/${videoId}`;
    }

    const element = await addInteractiveElement(presentationId, slideId, userId, 'embed-video', {
      source,
      videoId: videoId || null,
      url: embedUrl,
      originalUrl: url || null,
      startTime: startTime || 0,
      endTime: endTime || null,
      autoPlay: autoPlay || false,
      loop: loop || false,
      muted: muted || false,
      controls: controls !== undefined ? controls : true,
      style: style || {},
      positionX: position?.x || 50,
      positionY: position?.y || 50,
      width: width || 640,
      height: height || 360,
    });

    res.status(201).json({
      success: true,
      data: {
        elementId: (element as Record<string, unknown>).id,
        presentationId,
        slideId,
        source,
        embedUrl,
        videoId: videoId || null,
        autoPlay: autoPlay || false,
        width: width || 640,
        height: height || 360,
      },
    });
  })
);

// ─── Live Dashboard Widget endpoint ─────────────────────────────────────────

router.post(
  '/live-dashboard/:presentationId/:slideId',
  authMiddleware,
  validate(liveDashboardSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, slideId } = req.params;
    const userId = req.user!.userId;
    const { dataSource, widgets, refreshInterval, style, position } = req.body;

    const { error } = await verifyPresentation(presentationId, userId);
    if (error) {
      const code = error === 'Presentation not found' ? 404 : 403;
      res.status(code).json({ success: false, error, code: code === 404 ? 'NOT_FOUND' : 'FORBIDDEN' });
      return;
    }

    const { error: slideError } = await verifySlide(presentationId, slideId);
    if (slideError) {
      res.status(404).json({ success: false, error: slideError, code: 'SLIDE_NOT_FOUND' });
      return;
    }

    const dashboardId = crypto.randomUUID();
    const enrichedWidgets = widgets.map((w: Record<string, unknown>, idx: number) => ({
      ...w,
      id: crypto.randomUUID(),
      order: idx,
      config: (w.config as Record<string, unknown>) || {},
      position: (w.position as Record<string, unknown>) || { x: 0, y: idx * 150, w: 300, h: 140 },
    }));

    const element = await addInteractiveElement(presentationId, slideId, userId, 'live-dashboard', {
      dashboardId,
      dataSource: {
        ...dataSource,
        refreshInterval: dataSource.refreshInterval || 30000,
      },
      widgets: enrichedWidgets,
      refreshInterval: refreshInterval || 30000,
      lastFetched: null,
      status: 'configured',
      style: style || {},
      positionX: position?.x || 0,
      positionY: position?.y || 0,
      width: 800,
      height: 600,
    });

    res.status(201).json({
      success: true,
      data: {
        dashboardId,
        elementId: (element as Record<string, unknown>).id,
        presentationId,
        slideId,
        dataSource,
        widgetCount: enrichedWidgets.length,
        widgets: enrichedWidgets,
        refreshInterval: refreshInterval || 30000,
        status: 'configured',
      },
    });
  })
);

export default router;
