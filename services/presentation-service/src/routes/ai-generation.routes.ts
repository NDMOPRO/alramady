import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth.js';
import * as contentGenerator from '../services/ai-content-generator.service.js';
import * as slideGenerator from '../services/ai-slide-generator.service.js';
import { AIVoiceoverService } from '../services/ai-voiceover.service.js';
import { AIVideoGeneratorService } from '../services/ai-video-generator.service.js';
import { AIAvatarService } from '../services/ai-avatar.service.js';

const router = Router();
const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' || '' });
const voiceoverService = new AIVoiceoverService(prisma);
const videoService = new AIVideoGeneratorService();
const avatarService = new AIAvatarService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ─── Async Handler ──────────────────────────────────────────────────────────

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ─── Zod Validation Schemas ─────────────────────────────────────────────────

const GenerateContentSchema = z.object({
  presentationId: z.string().min(1),
  topic: z.string().min(1).max(2000),
  slideCount: z.number().int().min(1).max(50).optional().default(5),
  tone: z.enum(['formal', 'casual', 'creative', 'executive', 'academic', 'friendly', 'technical']).optional().default('formal'),
  language: z.string().min(2).max(10).optional().default('ar'),
  targetAudience: z.string().max(500).optional(),
  industry: z.string().max(200).optional(),
  keywords: z.array(z.string()).optional(),
  contentType: z.enum(['slide', 'report', 'email', 'article', 'social', 'summary', 'proposal', 'training']).optional().default('slide'),
});

const GenerateSpeakerNotesSchema = z.object({
  presentationId: z.string().min(1),
  language: z.string().min(2).max(10).optional().default('ar'),
  detailLevel: z.enum(['brief', 'standard', 'detailed']).optional().default('standard'),
});

const GenerateImagesSchema = z.object({
  presentationId: z.string().min(1),
  slideIds: z.array(z.string()).optional(),
  style: z.enum(['realistic', 'illustration', 'cartoon', 'artistic', 'cinematic', 'minimalist']).optional().default('realistic'),
  size: z.enum(['1024x1024', '1792x1024', '1024x1792']).optional().default('1024x1024'),
  quality: z.enum(['standard', 'hd']).optional().default('standard'),
});

const GenerateVideoSchema = z.object({
  presentationId: z.string().min(1),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional().default('alloy'),
  language: z.enum(['ar', 'en']).optional().default('ar'),
  resolution: z.enum(['720p', '1080p']).optional().default('1080p'),
  transitionType: z.enum(['fade', 'slide', 'none']).optional().default('fade'),
  slideDurationMs: z.number().int().min(1000).max(60000).optional().default(5000),
  includeNarration: z.boolean().optional().default(true),
  backgroundMusic: z.string().optional(),
});

const GenerateVoiceoverSchema = z.object({
  text: z.string().min(1).max(10000),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional().default('alloy'),
  language: z.enum(['ar', 'en']).optional().default('ar'),
  format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']).optional().default('mp3'),
  speed: z.number().min(0.25).max(4.0).optional().default(1.0),
  model: z.enum(['tts-1', 'tts-1-hd']).optional().default('tts-1'),
});

const RewriteSchema = z.object({
  text: z.string().min(1).max(10000),
  tone: z.enum(['formal', 'casual', 'creative', 'executive', 'academic', 'friendly', 'technical']).optional(),
  targetAudience: z.string().max(500).optional(),
  language: z.string().min(2).max(10).optional().default('ar'),
});

const SummarizeSchema = z.object({
  presentationId: z.string().optional(),
  text: z.string().min(1).max(50000).optional(),
  maxWords: z.number().int().min(20).max(2000).optional().default(200),
  language: z.string().min(2).max(10).optional().default('ar'),
}).refine(d => d.presentationId || d.text, { message: 'Either presentationId or text is required' });

const ExpandSchema = z.object({
  text: z.string().min(1).max(10000),
  targetWordCount: z.number().int().min(50).max(5000).optional().default(500),
  tone: z.enum(['formal', 'casual', 'creative', 'executive', 'academic', 'friendly', 'technical']).optional(),
  language: z.string().min(2).max(10).optional().default('ar'),
});

const TranslateSchema = z.object({
  presentationId: z.string().optional(),
  text: z.string().max(50000).optional(),
  targetLanguage: z.string().min(2).max(10),
  preserveFormatting: z.boolean().optional().default(true),
  glossary: z.record(z.string()).optional(),
}).refine(d => d.presentationId || d.text, { message: 'Either presentationId or text is required' });

const SuggestTopicsSchema = z.object({
  context: z.string().min(1).max(5000),
  count: z.number().int().min(1).max(20).optional().default(5),
  language: z.string().min(2).max(10).optional().default('ar'),
  industry: z.string().max(200).optional(),
});

const SuggestKPIsSchema = z.object({
  data: z.string().min(1).max(10000),
  industry: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
  language: z.string().min(2).max(10).optional().default('ar'),
  count: z.number().int().min(1).max(20).optional().default(5),
});

const AnalyzeDataSchema = z.object({
  data: z.string().min(1).max(20000),
  analysisType: z.enum(['trends', 'patterns', 'anomalies', 'correlation', 'forecast', 'comprehensive']).optional().default('comprehensive'),
  language: z.string().min(2).max(10).optional().default('ar'),
});

const GenerateOutlineSchema = z.object({
  topic: z.string().min(1).max(2000),
  slideCount: z.number().int().min(3).max(50).optional().default(10),
  language: z.string().min(2).max(10).optional().default('ar'),
  style: z.enum(['professional', 'creative', 'academic', 'minimal', 'storytelling']).optional().default('professional'),
  targetAudience: z.string().max(500).optional(),
});

const MagicWriteSchema = z.object({
  presentationId: z.string().min(1),
  slideIndex: z.number().int().min(0).optional(),
  topic: z.string().min(1).max(2000),
  tone: z.enum(['formal', 'casual', 'creative', 'executive', 'academic', 'friendly', 'technical']).optional().default('formal'),
  language: z.string().min(2).max(10).optional().default('ar'),
  includeImages: z.boolean().optional().default(false),
  includeCharts: z.boolean().optional().default(false),
});

const GrabTextSchema = z.object({
  language: z.string().min(2).max(10).optional().default('ar'),
});

const RemoveBackgroundSchema = z.object({
  outputFormat: z.enum(['png', 'webp']).optional().default('png'),
  threshold: z.number().int().min(0).max(255).optional().default(128),
});

const EnhanceImageSchema = z.object({
  action: z.enum(['upscale', 'denoise', 'sharpen', 'auto_enhance', 'hdr']).optional().default('auto_enhance'),
  scaleFactor: z.number().min(1).max(4).optional().default(2),
});

const GenerateIconsSchema = z.object({
  descriptions: z.array(z.string().min(1).max(500)).min(1).max(20),
  style: z.enum(['flat', 'outlined', '3d', 'filled']).optional().default('flat'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#1a73e8'),
  size: z.number().int().min(32).max(1024).optional().default(256),
});

const Generate3DSchema = z.object({
  description: z.string().min(1).max(1000),
  style: z.enum(['low_poly', 'realistic', 'isometric', 'cartoon', 'abstract']).optional().default('isometric'),
  color: z.string().optional(),
  angle: z.enum(['front', 'side', 'top', 'perspective']).optional().default('perspective'),
});

const GenerateAvatarSchema = z.object({
  style: z.enum(['professional', 'casual', 'cartoon', 'custom']).optional().default('professional'),
  gender: z.enum(['male', 'female', 'neutral']).optional().default('neutral'),
  ageRange: z.enum(['young', 'middle', 'senior']).optional().default('middle'),
  customDescription: z.string().max(1000).optional(),
  attire: z.string().max(500).optional(),
  backgroundColor: z.string().optional(),
  pose: z.enum(['standing', 'sitting', 'presenting', 'pointing']).optional(),
  expression: z.enum(['neutral', 'smiling', 'serious', 'enthusiastic']).optional(),
});

const GenerateHeadshotSchema = z.object({
  gender: z.enum(['male', 'female']).optional().default('male'),
  ageRange: z.enum(['young', 'middle', 'senior']).optional().default('middle'),
  ethnicity: z.string().max(200).optional(),
  attire: z.enum(['business_suit', 'smart_casual', 'traditional_arabic', 'medical', 'tech']).optional().default('business_suit'),
  background: z.enum(['white', 'gray', 'blue', 'office', 'gradient']).optional().default('gray'),
});

const StyleTransferSchema = z.object({
  targetStyle: z.enum(['oil_painting', 'watercolor', 'sketch', 'pop_art', 'vintage', 'cyberpunk', 'arabic_calligraphy', 'geometric', 'neon']),
  intensity: z.number().min(0).max(1).optional().default(0.8),
});

const AutoFormatSchema = z.object({
  presentationId: z.string().min(1),
  slideIds: z.array(z.string()).optional(),
  formatRules: z.object({
    alignText: z.boolean().optional().default(true),
    normalizeSpacing: z.boolean().optional().default(true),
    fixFontSizes: z.boolean().optional().default(true),
    ensureRTL: z.boolean().optional().default(true),
    unifyColors: z.boolean().optional().default(false),
  }).optional().default({}),
});

const BrandVoiceSchema = z.object({
  presentationId: z.string().optional(),
  text: z.string().max(20000).optional(),
  brandGuidelines: z.object({
    tone: z.string().max(500),
    vocabulary: z.array(z.string()).optional(),
    avoidWords: z.array(z.string()).optional(),
    style: z.string().max(500).optional(),
    examples: z.array(z.string()).optional(),
  }),
  language: z.string().min(2).max(10).optional().default('ar'),
}).refine(d => d.presentationId || d.text, { message: 'Either presentationId or text is required' });

const ExecutiveSummarySchema = z.object({
  presentationId: z.string().optional(),
  content: z.string().max(50000).optional(),
  maxWords: z.number().int().min(50).max(2000).optional().default(200),
  includeRecommendations: z.boolean().optional().default(true),
  language: z.string().min(2).max(10).optional().default('ar'),
}).refine(d => d.presentationId || d.content, { message: 'Either presentationId or content is required' });

const DashboardNarrativeSchema = z.object({
  data: z.string().min(1).max(20000),
  metrics: z.array(z.object({
    name: z.string(),
    value: z.union([z.string(), z.number()]),
    previousValue: z.union([z.string(), z.number()]).optional(),
    unit: z.string().optional(),
  })).optional(),
  style: z.enum(['story', 'analytical', 'persuasive']).optional().default('analytical'),
  language: z.string().min(2).max(10).optional().default('ar'),
});

const TrainingContentSchema = z.object({
  topic: z.string().min(1).max(2000),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('intermediate'),
  format: z.enum(['slides', 'quiz', 'handbook', 'scenario']).optional().default('slides'),
  language: z.string().min(2).max(10).optional().default('ar'),
  durationMinutes: z.number().int().min(5).max(480).optional().default(30),
});

const CRMPresentationSchema = z.object({
  crmData: z.object({
    companyName: z.string().min(1),
    contactName: z.string().optional(),
    industry: z.string().optional(),
    dealSize: z.union([z.string(), z.number()]).optional(),
    stage: z.string().optional(),
    notes: z.string().optional(),
    products: z.array(z.string()).optional(),
    competitors: z.array(z.string()).optional(),
    painPoints: z.array(z.string()).optional(),
  }),
  presentationType: z.enum(['pitch', 'proposal', 'review', 'onboarding', 'upsell']).optional().default('pitch'),
  slideCount: z.number().int().min(3).max(30).optional().default(10),
  language: z.string().min(2).max(10).optional().default('ar'),
  tone: z.enum(['formal', 'casual', 'creative', 'executive']).optional().default('formal'),
});

const CompetitorAnalysisSchema = z.object({
  company: z.string().min(1).max(500),
  competitors: z.array(z.string().min(1).max(500)).min(1).max(10),
  dimensions: z.array(z.enum(['pricing', 'features', 'market_share', 'technology', 'customer_satisfaction', 'brand', 'innovation'])).optional(),
  industry: z.string().max(200).optional(),
  language: z.string().min(2).max(10).optional().default('ar'),
});

const DesignSuggestionsSchema = z.object({
  presentationId: z.string().min(1),
  slideIds: z.array(z.string()).optional(),
  focusAreas: z.array(z.enum(['layout', 'colors', 'typography', 'spacing', 'images', 'charts', 'overall'])).optional().default(['overall']),
});

// ─── Helper: fetch presentation with slides and elements ────────────────────

interface SlideWithElements {
  id: string;
  presentationId: string;
  slideIndex: number;
  order: number;
  layout: string;
  content: unknown;
  notes: string | null;
  slideElements: SlideElementRecord[];
}

interface SlideElementRecord {
  id: string;
  slideId: string;
  type: string;
  content: unknown;
  positionX: number | null;
  positionY: number | null;
  width: number | null;
  height: number | null;
  rotation: number | null;
  layer: number;
  style: unknown;
}

async function fetchPresentationWithSlides(presentationId: string, tenantId: string): Promise<{
  presentation: Record<string, unknown>;
  slides: SlideWithElements[];
}> {
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, tenantId },
  });

  if (!presentation) {
    throw Object.assign(new Error('Presentation not found'), { statusCode: 404 });
  }

  const slides = await prisma.slide.findMany({
    where: { presentationId },
    include: { slideElements: true },
    orderBy: { order: 'asc' },
  }) as unknown as SlideWithElements[];

  return { presentation: presentation as unknown as Record<string, unknown>, slides };
}

async function fetchPresentationContent(presentationId: string, tenantId: string): Promise<string> {
  const { presentation, slides } = await fetchPresentationWithSlides(presentationId, tenantId);

  const parts: string[] = [`Title: ${presentation.name || presentation.title || ''}`];
  for (const slide of slides) {
    const slideTexts: string[] = [];
    slideTexts.push(`Slide ${slide.order}: ${slide.layout}`);
    if (slide.content && typeof slide.content === 'object') {
      const contentObj = slide.content as Record<string, unknown>;
      if (contentObj.title) slideTexts.push(String(contentObj.title));
      if (contentObj.body) slideTexts.push(String(contentObj.body));
    }
    for (const el of slide.slideElements) {
      if (['text', 'title', 'subtitle'].includes(el.type)) {
        if (typeof el.content === 'string') {
          slideTexts.push(el.content);
        } else if (el.content && typeof el.content === 'object') {
          const cObj = el.content as Record<string, unknown>;
          if (cObj.text) slideTexts.push(String(cObj.text));
          else slideTexts.push(JSON.stringify(el.content));
        }
      }
    }
    parts.push(slideTexts.join('\n'));
  }
  return parts.join('\n\n');
}

async function savePresentationAiContent(
  presentationId: string,
  userId: string,
  contentType: string,
  content: unknown
): Promise<void> {
  const id = randomUUID();
  const generatedContent = JSON.stringify(content);
  await prisma.$executeRaw`
    INSERT INTO presentation_ai_contents (id, presentation_id, user_id, content_type, generated_content, status, created_at, updated_at)
    VALUES (${id}::uuid, ${presentationId}::uuid, ${userId}::uuid, ${contentType}, ${generatedContent}::jsonb, 'completed', NOW(), NOW())
  `;
}

// ─── POST /generate-content ─────────────────────────────────────────────────

router.post(
  '/generate-content',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = GenerateContentSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.tenantId! || 'default';
    const userId = req.user!.userId || 'anonymous';

    const slides: Array<{
      title: string;
      body: string;
      bulletPoints: string[];
      speakerNotes: string;
      suggestedVisuals: string[];
    }> = [];

    for (let i = 0; i < body.slideCount; i++) {
      const slideTopicPrompt = i === 0
        ? `Introduction: ${body.topic}`
        : i === body.slideCount - 1
          ? `Conclusion: ${body.topic}`
          : `Slide ${i + 1} of ${body.slideCount} about: ${body.topic}`;

      const slide = await contentGenerator.generateSlideContent(slideTopicPrompt, {
        tone: body.tone,
        language: body.language,
        targetAudience: body.targetAudience,
        contentType: body.contentType,
        industry: body.industry,
        keywords: body.keywords,
      });
      slides.push(slide);
    }

    const result = { presentationId: body.presentationId, slides, generatedAt: new Date().toISOString() };
    await savePresentationAiContent(body.presentationId, userId, 'generate-content', result);

    res.status(201).json({ success: true, data: result });
  }),
);

// ─── POST /generate-speaker-notes ───────────────────────────────────────────

router.post(
  '/generate-speaker-notes',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = GenerateSpeakerNotesSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.tenantId! || 'default';
    const userId = req.user!.userId || 'anonymous';

    const { slides } = await fetchPresentationWithSlides(body.presentationId, tenantId);

    const notesResults: Array<{ slideId: string; slideOrder: number; notes: string }> = [];

    for (const slide of slides) {
      const textParts: string[] = [];
      if (slide.content && typeof slide.content === 'object') {
        const contentObj = slide.content as Record<string, unknown>;
        if (contentObj.title) textParts.push(String(contentObj.title));
        if (contentObj.body) textParts.push(String(contentObj.body));
      }
      for (const el of slide.slideElements) {
        if (['text', 'title', 'subtitle'].includes(el.type)) {
          if (typeof el.content === 'string') {
            textParts.push(el.content);
          } else if (el.content && typeof el.content === 'object') {
            const cObj = el.content as Record<string, unknown>;
            if (cObj.text) textParts.push(String(cObj.text));
          }
        }
      }

      const slideContent = textParts.join('\n');
      const notes = await contentGenerator.generateSpeakerNotes(slideContent, {
        language: body.language,
        detailLevel: body.detailLevel,
      });

      notesResults.push({ slideId: slide.id, slideOrder: slide.order, notes });
    }

    await savePresentationAiContent(body.presentationId, userId, 'speaker-notes', notesResults);

    res.json({ success: true, data: { presentationId: body.presentationId, slides: notesResults } });
  }),
);

// ─── POST /generate-images ──────────────────────────────────────────────────

router.post(
  '/generate-images',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = GenerateImagesSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.tenantId! || 'default';
    const userId = req.user!.userId || 'anonymous';

    const { slides } = await fetchPresentationWithSlides(body.presentationId, tenantId);

    const targetSlides = body.slideIds
      ? slides.filter((s: SlideWithElements) => body.slideIds!.includes(s.id))
      : slides;

    const imageResults: Array<{ slideId: string; imageUrl: string; revisedPrompt: string }> = [];

    for (const slide of targetSlides) {
      const textParts: string[] = [];
      if (slide.content && typeof slide.content === 'object') {
        const contentObj = slide.content as Record<string, unknown>;
        if (contentObj.title) textParts.push(String(contentObj.title));
        if (contentObj.body) textParts.push(String(contentObj.body));
      }
      for (const el of slide.slideElements) {
        if (['text', 'title', 'subtitle'].includes(el.type)) {
          if (typeof el.content === 'string') {
            textParts.push(el.content);
          } else if (el.content && typeof el.content === 'object') {
            const cObj = el.content as Record<string, unknown>;
            if (cObj.text) textParts.push(String(cObj.text));
          }
        }
      }

      const prompt = `Professional presentation visual for: ${textParts.join(' ').substring(0, 300)}`;
      const result = await contentGenerator.generateImage(prompt, {
        style: body.style,
        size: body.size,
        quality: body.quality,
      });

      imageResults.push({ slideId: slide.id, imageUrl: result.imageUrl, revisedPrompt: result.revisedPrompt });
    }

    await savePresentationAiContent(body.presentationId, userId, 'generate-images', imageResults);

    res.status(201).json({ success: true, data: { presentationId: body.presentationId, images: imageResults } });
  }),
);

// ─── POST /generate-video ───────────────────────────────────────────────────

router.post(
  '/generate-video',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = GenerateVideoSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.tenantId! || 'default';
    const userId = req.user!.userId || 'anonymous';

    const result = await videoService.generateVideoFromPresentation({
      presentationId: body.presentationId,
      tenantId,
      userId,
      voice: body.voice,
      language: body.language,
      resolution: body.resolution,
      transitionType: body.transitionType,
      slideDurationMs: body.slideDurationMs,
      includeNarration: body.includeNarration,
      backgroundMusic: body.backgroundMusic,
    });

    res.status(201).json({ success: true, data: result });
  }),
);

// ─── POST /generate-voiceover ───────────────────────────────────────────────

router.post(
  '/generate-voiceover',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = GenerateVoiceoverSchema.parse(req.body);

    const audioResponse = await openai.audio.speech.create({
      model: body.model,
      voice: body.voice,
      input: body.text,
      speed: body.speed,
      response_format: body.format,
    });

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    const jobId = randomUUID();

    const base64Audio = audioBuffer.toString('base64');

    res.status(201).json({
      success: true,
      data: {
        jobId,
        audioBase64: base64Audio,
        format: body.format,
        voice: body.voice,
        language: body.language,
        sizeBytes: audioBuffer.length,
        mimeType: body.format === 'mp3' ? 'audio/mpeg' : `audio/${body.format}`,
      },
    });
  }),
);

// ─── POST /rewrite ──────────────────────────────────────────────────────────

router.post(
  '/rewrite',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = RewriteSchema.parse(req.body);

    const result = await contentGenerator.rewriteContent(body.text, {
      tone: body.tone,
      targetAudience: body.targetAudience,
      action: 'rewrite',
      language: body.language,
    });

    res.json({ success: true, data: result });
  }),
);

// ─── POST /summarize ────────────────────────────────────────────────────────

router.post(
  '/summarize',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = SummarizeSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.tenantId! || 'default';

    let textToSummarize = body.text || '';
    if (body.presentationId) {
      textToSummarize = await fetchPresentationContent(body.presentationId, tenantId);
    }

    const result = await contentGenerator.rewriteContent(textToSummarize, {
      action: 'summarize',
      language: body.language,
    });

    res.json({
      success: true,
      data: {
        original: result.original,
        summary: result.rewritten,
        changes: result.changes,
        wordCount: result.rewritten.split(/\s+/).length,
      },
    });
  }),
);

// ─── POST /expand ───────────────────────────────────────────────────────────

router.post(
  '/expand',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = ExpandSchema.parse(req.body);

    const result = await contentGenerator.rewriteContent(body.text, {
      tone: body.tone,
      action: 'expand',
      language: body.language,
    });

    res.json({
      success: true,
      data: {
        original: result.original,
        expanded: result.rewritten,
        changes: result.changes,
        wordCount: result.rewritten.split(/\s+/).length,
      },
    });
  }),
);

// ─── POST /translate ────────────────────────────────────────────────────────

router.post(
  '/translate',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = TranslateSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.tenantId! || 'default';

    let textToTranslate = body.text || '';
    if (body.presentationId) {
      textToTranslate = await fetchPresentationContent(body.presentationId, tenantId);
    }

    const result = await contentGenerator.translateContent(textToTranslate, body.targetLanguage, {
      preserveFormatting: body.preserveFormatting,
      glossary: body.glossary,
    });

    res.json({ success: true, data: result });
  }),
);

// ─── POST /suggest-topics ───────────────────────────────────────────────────

router.post(
  '/suggest-topics',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = SuggestTopicsSchema.parse(req.body);

    const contextWithIndustry = body.industry
      ? `${body.context}\nIndustry: ${body.industry}`
      : body.context;

    const result = await contentGenerator.suggestContent(contextWithIndustry, {
      count: body.count,
      language: body.language,
      type: 'topic',
    });

    res.json({ success: true, data: result });
  }),
);

// ─── POST /suggest-kpis ────────────────────────────────────────────────────

router.post(
  '/suggest-kpis',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = SuggestKPIsSchema.parse(req.body);

    const contextParts = [body.data];
    if (body.industry) contextParts.push(`Industry: ${body.industry}`);
    if (body.department) contextParts.push(`Department: ${body.department}`);

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a KPI and business metrics expert. Suggest ${body.count} relevant KPIs based on the provided data.
Language: ${body.language}
Return ONLY valid JSON:
{
  "kpis": [
    {
      "name": "KPI name",
      "description": "What this KPI measures",
      "formula": "How to calculate",
      "target": "Suggested target value",
      "frequency": "daily|weekly|monthly|quarterly",
      "category": "financial|operational|customer|growth|quality",
      "priority": "high|medium|low"
    }
  ],
  "dashboardLayout": "Suggested dashboard layout description"
}`,
        },
        { role: 'user', content: contextParts.join('\n') },
      ],
      max_tokens: 3000,
      temperature: 0.6,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');

    res.json({
      success: true,
      data: {
        kpis: result.kpis || [],
        dashboardLayout: result.dashboardLayout || '',
      },
    });
  }),
);

// ─── POST /analyze-data ─────────────────────────────────────────────────────

router.post(
  '/analyze-data',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = AnalyzeDataSchema.parse(req.body);

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a data analysis expert. Perform ${body.analysisType} analysis on the provided data.
Language: ${body.language}
Return ONLY valid JSON:
{
  "summary": "Overall analysis summary",
  "patterns": [{"name": "pattern", "description": "details", "significance": "high|medium|low"}],
  "trends": [{"metric": "name", "direction": "up|down|stable", "changePercent": 0, "period": "timeframe"}],
  "anomalies": [{"field": "name", "value": "actual", "expected": "expected", "severity": "high|medium|low"}],
  "correlations": [{"field1": "name", "field2": "name", "strength": 0.85, "type": "positive|negative"}],
  "recommendations": ["recommendation1", "recommendation2"],
  "visualizations": [{"type": "chart type", "description": "what to show"}]
}`,
        },
        { role: 'user', content: body.data.substring(0, 8000) },
      ],
      max_tokens: 4000,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');

    res.json({
      success: true,
      data: {
        summary: result.summary || '',
        patterns: result.patterns || [],
        trends: result.trends || [],
        anomalies: result.anomalies || [],
        correlations: result.correlations || [],
        recommendations: result.recommendations || [],
        visualizations: result.visualizations || [],
      },
    });
  }),
);

// ─── POST /generate-outline ─────────────────────────────────────────────────

router.post(
  '/generate-outline',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = GenerateOutlineSchema.parse(req.body);

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Generate a ${body.style} presentation outline with exactly ${body.slideCount} slides.
${body.targetAudience ? `Target audience: ${body.targetAudience}` : ''}
Language: ${body.language}
Return ONLY valid JSON:
{
  "title": "Presentation title",
  "description": "Brief presentation description",
  "estimatedDuration": "minutes",
  "slides": [
    {
      "order": 1,
      "layout": "title|content|two-column|image-focus|data-heavy|quote|section-break",
      "title": "Slide title",
      "keyPoints": ["point1", "point2"],
      "suggestedVisual": "Description of visual element",
      "notes": "Brief presenter note"
    }
  ]
}`,
        },
        { role: 'user', content: `Create an outline for: ${body.topic}` },
      ],
      max_tokens: 4000,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');

    res.json({
      success: true,
      data: {
        title: result.title || body.topic,
        description: result.description || '',
        estimatedDuration: result.estimatedDuration || `${body.slideCount * 2} minutes`,
        slides: result.slides || [],
      },
    });
  }),
);

// ─── POST /magic-write ──────────────────────────────────────────────────────

router.post(
  '/magic-write',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = MagicWriteSchema.parse(req.body);
    const userId = req.user!.userId || 'anonymous';

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a Magic Write AI for presentations. Generate complete, ready-to-use slide content.
Tone: ${body.tone}
Language: ${body.language}
${body.includeImages ? 'Include image descriptions for AI generation.' : ''}
${body.includeCharts ? 'Include chart data suggestions where relevant.' : ''}
Return ONLY valid JSON:
{
  "slides": [
    {
      "title": "Slide title",
      "subtitle": "Optional subtitle",
      "body": "Main content text",
      "bulletPoints": ["point1", "point2"],
      "speakerNotes": "What to say",
      "layout": "title|content|two-column|image-focus|data-heavy|quote",
      "visualSuggestion": "Describe the ideal visual",
      "chartData": {"type": "bar|line|pie", "labels": [], "values": []}
    }
  ],
  "metadata": {
    "estimatedDuration": "minutes",
    "targetWordCount": 0,
    "readabilityLevel": "general|technical|executive"
  }
}`,
        },
        { role: 'user', content: `Magic Write full content for: ${body.topic}` },
      ],
      max_tokens: 6000,
      temperature: 0.75,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');

    await savePresentationAiContent(body.presentationId, userId, 'magic-write', result);

    res.status(201).json({
      success: true,
      data: {
        presentationId: body.presentationId,
        slides: result.slides || [],
        metadata: result.metadata || {},
      },
    });
  }),
);

// ─── POST /grab-text ────────────────────────────────────────────────────────

router.post(
  '/grab-text',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const options = GrabTextSchema.parse(req.body);

    if (!req.file) {
      res.status(400).json({ success: false, error: 'File is required (image or PDF)' });
      return;
    }

    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    let base64Image: string;
    if (mimeType.startsWith('image/')) {
      const processed = await sharp(fileBuffer).resize(2048, 2048, { fit: 'inside' }).png().toBuffer();
      base64Image = processed.toString('base64');
    } else if (mimeType === 'application/pdf') {
      try {
        const pdfImage = await sharp(fileBuffer, { page: 0 }).png().toBuffer();
        base64Image = pdfImage.toString('base64');
      } catch {
        base64Image = fileBuffer.toString('base64');
      }
    } else {
      res.status(400).json({ success: false, error: 'Unsupported file type. Use image (PNG, JPG) or PDF.' });
      return;
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Extract ALL text visible in the image. Preserve formatting, hierarchy, and structure.
Language hint: ${options.language}
Return JSON:
{
  "extractedText": "Full extracted text with line breaks preserved",
  "blocks": [{"type": "heading|paragraph|list|table|caption", "text": "block content", "confidence": 0.95}],
  "language": "detected language code",
  "totalWords": 0
}`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all text from this image/document:' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}`, detail: 'high' } },
          ],
        },
      ],
      max_tokens: 4000,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');

    res.json({
      success: true,
      data: {
        extractedText: result.extractedText || '',
        blocks: result.blocks || [],
        language: result.language || options.language,
        totalWords: result.totalWords || (result.extractedText || '').split(/\s+/).filter(Boolean).length,
        sourceFile: req.file.originalname,
        mimeType,
      },
    });
  }),
);

// ─── POST /remove-background ────────────────────────────────────────────────

router.post(
  '/remove-background',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    const options = RemoveBackgroundSchema.parse(req.body);

    if (!req.file) {
      res.status(400).json({ success: false, error: 'Image file is required' });
      return;
    }

    const inputBuffer = req.file.buffer;

    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    const { data: rawData, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixelCount = info.width * info.height;
    const channels = info.channels;

    // Sample corners to determine background color
    const cornerOffsets = [
      0,
      (info.width - 1) * channels,
      (info.height - 1) * info.width * channels,
      ((info.height - 1) * info.width + (info.width - 1)) * channels,
    ];

    let bgR = 0, bgG = 0, bgB = 0;
    for (const offset of cornerOffsets) {
      bgR += rawData[offset] || 0;
      bgG += rawData[offset + 1] || 0;
      bgB += rawData[offset + 2] || 0;
    }
    bgR = Math.round(bgR / 4);
    bgG = Math.round(bgG / 4);
    bgB = Math.round(bgB / 4);

    // Create alpha mask based on color distance from detected background
    const outputData = Buffer.alloc(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const srcIdx = i * channels;
      const dstIdx = i * 4;
      const r = rawData[srcIdx] || 0;
      const g = rawData[srcIdx + 1] || 0;
      const b = rawData[srcIdx + 2] || 0;

      const distance = Math.sqrt(
        Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2)
      );

      outputData[dstIdx] = r;
      outputData[dstIdx + 1] = g;
      outputData[dstIdx + 2] = b;
      outputData[dstIdx + 3] = distance > options.threshold ? 255 : 0;
    }

    let resultBuffer: Buffer;
    if (options.outputFormat === 'webp') {
      resultBuffer = await sharp(outputData, { raw: { width: info.width, height: info.height, channels: 4 } })
        .webp({ quality: 90 })
        .toBuffer();
    } else {
      resultBuffer = await sharp(outputData, { raw: { width: info.width, height: info.height, channels: 4 } })
        .png()
        .toBuffer();
    }

    const base64Result = resultBuffer.toString('base64');
    const outputMime = options.outputFormat === 'webp' ? 'image/webp' : 'image/png';

    res.json({
      success: true,
      data: {
        imageBase64: base64Result,
        mimeType: outputMime,
        width: info.width,
        height: info.height,
        originalSize: inputBuffer.length,
        processedSize: resultBuffer.length,
        detectedBackground: { r: bgR, g: bgG, b: bgB },
      },
    });
  }),
);

// ─── POST /enhance-image ────────────────────────────────────────────────────

router.post(
  '/enhance-image',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    const options = EnhanceImageSchema.parse(req.body);

    if (!req.file) {
      res.status(400).json({ success: false, error: 'Image file is required' });
      return;
    }

    const inputBuffer = req.file.buffer;
    const imgMetadata = await sharp(inputBuffer).metadata();
    const originalWidth = imgMetadata.width || 1024;
    const originalHeight = imgMetadata.height || 1024;

    let pipeline = sharp(inputBuffer);

    switch (options.action) {
      case 'upscale': {
        const newWidth = Math.round(originalWidth * options.scaleFactor);
        const newHeight = Math.round(originalHeight * options.scaleFactor);
        pipeline = pipeline.resize(newWidth, newHeight, {
          kernel: sharp.kernel.lanczos3,
          fit: 'fill',
        });
        break;
      }
      case 'denoise': {
        pipeline = pipeline.median(3).blur(0.5);
        break;
      }
      case 'sharpen': {
        pipeline = pipeline.sharpen({ sigma: 1.5, m1: 1.0, m2: 0.5 });
        break;
      }
      case 'auto_enhance': {
        pipeline = pipeline
          .normalize()
          .sharpen({ sigma: 1.0, m1: 0.8, m2: 0.3 })
          .modulate({ brightness: 1.05, saturation: 1.1 });
        break;
      }
      case 'hdr': {
        pipeline = pipeline
          .normalize()
          .modulate({ brightness: 1.1, saturation: 1.3 })
          .sharpen({ sigma: 2.0, m1: 1.2, m2: 0.5 });
        break;
      }
    }

    const resultBuffer = await pipeline.png().toBuffer();
    const resultMetadata = await sharp(resultBuffer).metadata();

    res.json({
      success: true,
      data: {
        imageBase64: resultBuffer.toString('base64'),
        mimeType: 'image/png',
        width: resultMetadata.width,
        height: resultMetadata.height,
        originalWidth,
        originalHeight,
        action: options.action,
        originalSize: inputBuffer.length,
        processedSize: resultBuffer.length,
      },
    });
  }),
);

// ─── POST /generate-icons ───────────────────────────────────────────────────

router.post(
  '/generate-icons',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = GenerateIconsSchema.parse(req.body);

    const icons: Array<{ description: string; iconUrl: string; style: string }> = [];

    for (const description of body.descriptions) {
      const result = await contentGenerator.generateIcon(description, {
        style: body.style,
        color: body.color,
        size: body.size,
      });
      icons.push({ description, iconUrl: result.iconUrl, style: body.style });
    }

    res.status(201).json({
      success: true,
      data: { icons, count: icons.length, style: body.style },
    });
  }),
);

// ─── POST /generate-3d ──────────────────────────────────────────────────────

router.post(
  '/generate-3d',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = Generate3DSchema.parse(req.body);

    const prompt = `3D render, ${body.style} style, ${body.angle} view: ${body.description}. ${body.color ? `Color scheme: ${body.color}.` : ''} Professional 3D element for presentation, clean background, high quality render`;

    const result = await contentGenerator.generateImage(prompt, {
      style: 'realistic',
      size: '1024x1024',
      quality: 'hd',
    });

    res.status(201).json({
      success: true,
      data: {
        imageUrl: result.imageUrl,
        revisedPrompt: result.revisedPrompt,
        style: body.style,
        angle: body.angle,
        description: body.description,
      },
    });
  }),
);

// ─── POST /generate-avatar ──────────────────────────────────────────────────

router.post(
  '/generate-avatar',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = GenerateAvatarSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.tenantId! || 'default';
    const userId = req.user!.userId || 'anonymous';

    const result = await avatarService.generateAvatar(
      {
        style: body.style as 'professional' | 'casual' | 'corporate' | 'arabic_traditional' | 'custom',
        gender: body.gender,
        ageRange: body.ageRange,
        customDescription: body.customDescription,
        attire: body.attire,
        backgroundColor: body.backgroundColor,
        pose: body.pose,
        expression: body.expression,
      },
      tenantId,
      userId,
    );

    res.status(201).json({ success: true, data: result });
  }),
);

// ─── POST /generate-headshot ────────────────────────────────────────────────

router.post(
  '/generate-headshot',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = GenerateHeadshotSchema.parse(req.body);

    const attireDescriptions: Record<string, string> = {
      business_suit: 'wearing a professional business suit',
      smart_casual: 'wearing smart casual attire',
      traditional_arabic: 'wearing traditional Arabic attire (thobe/abaya)',
      medical: 'wearing a medical white coat',
      tech: 'wearing a modern tech company casual outfit',
    };

    const backgroundDescriptions: Record<string, string> = {
      white: 'clean white background',
      gray: 'professional gray gradient background',
      blue: 'corporate blue background',
      office: 'modern office background, slightly blurred',
      gradient: 'subtle gradient background',
    };

    const prompt = `Professional corporate headshot photo: ${body.gender} person, ${body.ageRange} age, ${body.ethnicity ? `${body.ethnicity} ethnicity, ` : ''}${attireDescriptions[body.attire]}, ${backgroundDescriptions[body.background]}, high resolution, studio lighting, confident expression, looking at camera, shoulders up portrait`;

    const result = await contentGenerator.generateImage(prompt, {
      style: 'realistic',
      size: '1024x1024',
      quality: 'hd',
    });

    // Fetch and crop to headshot proportions using sharp
    const imageResponse = await fetch(result.imageUrl);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    const croppedBuffer = await sharp(imageBuffer)
      .resize(800, 1000, { fit: 'cover', position: 'top' })
      .png()
      .toBuffer();

    res.status(201).json({
      success: true,
      data: {
        imageUrl: result.imageUrl,
        croppedBase64: croppedBuffer.toString('base64'),
        revisedPrompt: result.revisedPrompt,
        settings: body,
        mimeType: 'image/png',
        width: 800,
        height: 1000,
      },
    });
  }),
);

// ─── POST /style-transfer ───────────────────────────────────────────────────

router.post(
  '/style-transfer',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    const options = StyleTransferSchema.parse(req.body);

    if (!req.file) {
      res.status(400).json({ success: false, error: 'Image file is required' });
      return;
    }

    const inputBuffer = req.file.buffer;
    const base64Image = inputBuffer.toString('base64');

    // Use GPT-4V to analyze the image, then regenerate with style transfer
    const analysis = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Describe this image in detail for recreation in a different artistic style. Focus on composition, subjects, colors, and spatial arrangement.
Return JSON: {"description": "detailed image description", "mainSubject": "primary subject", "composition": "layout description"}`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image for style transfer:' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}`, detail: 'high' } },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const imageAnalysis = JSON.parse(analysis.choices[0]?.message?.content || '{}');

    const styleDescriptions: Record<string, string> = {
      oil_painting: 'oil painting on canvas, visible brush strokes, rich textures',
      watercolor: 'delicate watercolor painting, soft edges, flowing colors',
      sketch: 'detailed pencil sketch, hand-drawn, artistic shading',
      pop_art: 'bold pop art style, bright colors, halftone dots, Roy Lichtenstein inspired',
      vintage: 'vintage photograph, sepia tones, film grain, retro aesthetic',
      cyberpunk: 'cyberpunk style, neon lights, futuristic, dark with vibrant accents',
      arabic_calligraphy: 'Arabic calligraphic art style, flowing curves, decorative Islamic patterns',
      geometric: 'geometric abstract style, clean shapes, modernist composition',
      neon: 'neon glow effect, dark background, vibrant glowing outlines',
    };

    const styledPrompt = `${imageAnalysis.description || 'Image'}. Rendered in ${styleDescriptions[options.targetStyle]} style. Intensity: ${Math.round(options.intensity * 100)}% stylization.`;

    const generated = await contentGenerator.generateImage(styledPrompt, {
      style: 'artistic',
      size: '1024x1024',
      quality: 'hd',
    });

    res.json({
      success: true,
      data: {
        imageUrl: generated.imageUrl,
        revisedPrompt: generated.revisedPrompt,
        targetStyle: options.targetStyle,
        intensity: options.intensity,
        originalAnalysis: imageAnalysis,
      },
    });
  }),
);

// ─── POST /auto-format ──────────────────────────────────────────────────────

router.post(
  '/auto-format',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = AutoFormatSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.tenantId! || 'default';

    const { slides } = await fetchPresentationWithSlides(body.presentationId, tenantId);

    const targetSlides = body.slideIds
      ? slides.filter((s: SlideWithElements) => body.slideIds!.includes(s.id))
      : slides;

    const rules = body.formatRules;
    const appliedFixes: Array<{ slideId: string; elementId: string; fix: string; before: string; after: string }> = [];

    for (const slide of targetSlides) {
      for (const element of slide.slideElements) {
        const updates: Record<string, unknown> = {};
        const style = (element.style as Record<string, unknown>) || {};

        if (rules.ensureRTL && element.type === 'text') {
          const currentDir = style.direction || style.dir;
          if (currentDir !== 'rtl') {
            const newStyle = { ...style, direction: 'rtl', textAlign: 'right' };
            updates.style = newStyle;
            appliedFixes.push({
              slideId: slide.id,
              elementId: element.id,
              fix: 'ensureRTL',
              before: String(currentDir || 'ltr'),
              after: 'rtl',
            });
          }
        }

        if (rules.fixFontSizes && element.type === 'text') {
          const fontSize = (style.fontSize as number) || 0;
          if (fontSize > 0 && fontSize < 10) {
            const newStyle = { ...(updates.style as object || style), fontSize: 14 };
            updates.style = newStyle;
            appliedFixes.push({
              slideId: slide.id,
              elementId: element.id,
              fix: 'fixFontSizes',
              before: String(fontSize),
              after: '14',
            });
          }
        }

        if (rules.normalizeSpacing) {
          const x = element.positionX || 0;
          const y = element.positionY || 0;
          const snappedX = Math.round(x / 0.25) * 0.25;
          const snappedY = Math.round(y / 0.25) * 0.25;
          if (snappedX !== x || snappedY !== y) {
            updates.positionX = snappedX;
            updates.positionY = snappedY;
            appliedFixes.push({
              slideId: slide.id,
              elementId: element.id,
              fix: 'normalizeSpacing',
              before: `(${x}, ${y})`,
              after: `(${snappedX}, ${snappedY})`,
            });
          }
        }

        if (rules.alignText && element.type === 'text') {
          let textContent = '';
          if (typeof element.content === 'string') {
            textContent = element.content;
          } else if (element.content && typeof element.content === 'object') {
            const cObj = element.content as Record<string, unknown>;
            textContent = String(cObj.text || '');
          }
          const arabicRegex = /[\u0600-\u06FF]/;
          if (arabicRegex.test(textContent) && style.textAlign !== 'right') {
            updates.style = { ...(updates.style as object || style), textAlign: 'right' };
            appliedFixes.push({
              slideId: slide.id,
              elementId: element.id,
              fix: 'alignText',
              before: String(style.textAlign || 'left'),
              after: 'right',
            });
          }
        }

        if (Object.keys(updates).length > 0) {
          await prisma.slideElement.update({
            where: { id: element.id },
            data: updates,
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        presentationId: body.presentationId,
        slidesProcessed: targetSlides.length,
        fixesApplied: appliedFixes.length,
        fixes: appliedFixes,
        formatRules: rules,
      },
    });
  }),
);

// ─── POST /brand-voice ──────────────────────────────────────────────────────

router.post(
  '/brand-voice',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = BrandVoiceSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.tenantId! || 'default';

    let textToProcess = body.text || '';
    if (body.presentationId) {
      textToProcess = await fetchPresentationContent(body.presentationId, tenantId);
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a brand voice specialist. Rewrite content to match the brand guidelines.
Brand tone: ${body.brandGuidelines.tone}
${body.brandGuidelines.style ? `Brand style: ${body.brandGuidelines.style}` : ''}
${body.brandGuidelines.vocabulary ? `Preferred vocabulary: ${body.brandGuidelines.vocabulary.join(', ')}` : ''}
${body.brandGuidelines.avoidWords ? `Words to avoid: ${body.brandGuidelines.avoidWords.join(', ')}` : ''}
${body.brandGuidelines.examples ? `Examples of on-brand content:\n${body.brandGuidelines.examples.join('\n')}` : ''}
Language: ${body.language}
Return ONLY valid JSON:
{
  "rewritten": "Brand-aligned text",
  "changes": [{"original": "original phrase", "replacement": "brand-aligned phrase", "reason": "why changed"}],
  "brandScore": 85,
  "suggestions": ["additional brand alignment suggestion"]
}`,
        },
        { role: 'user', content: textToProcess.substring(0, 8000) },
      ],
      max_tokens: 4000,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');

    res.json({
      success: true,
      data: {
        rewritten: result.rewritten || '',
        changes: result.changes || [],
        brandScore: result.brandScore || 0,
        suggestions: result.suggestions || [],
      },
    });
  }),
);

// ─── POST /executive-summary ────────────────────────────────────────────────

router.post(
  '/executive-summary',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = ExecutiveSummarySchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.tenantId! || 'default';

    let content = body.content || '';
    if (body.presentationId) {
      content = await fetchPresentationContent(body.presentationId, tenantId);
    }

    const result = await contentGenerator.generateExecutiveSummary(content, {
      language: body.language,
      maxWords: body.maxWords,
      includeRecommendations: body.includeRecommendations,
    });

    res.json({ success: true, data: result });
  }),
);

// ─── POST /dashboard-narrative ──────────────────────────────────────────────

router.post(
  '/dashboard-narrative',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = DashboardNarrativeSchema.parse(req.body);

    let dataWithMetrics = body.data;
    if (body.metrics && body.metrics.length > 0) {
      const metricsStr = body.metrics.map(m => {
        const change = m.previousValue != null
          ? ` (previous: ${m.previousValue})`
          : '';
        return `${m.name}: ${m.value}${m.unit ? ' ' + m.unit : ''}${change}`;
      }).join('\n');
      dataWithMetrics = `Key Metrics:\n${metricsStr}\n\nData:\n${body.data}`;
    }

    const result = await contentGenerator.generateNarrative(dataWithMetrics, {
      style: body.style,
      language: body.language,
    });

    res.json({ success: true, data: result });
  }),
);

// ─── POST /training-content ─────────────────────────────────────────────────

router.post(
  '/training-content',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = TrainingContentSchema.parse(req.body);

    const result = await contentGenerator.generateTrainingContent(body.topic, {
      level: body.level,
      format: body.format,
      language: body.language,
    });

    res.json({
      success: true,
      data: {
        ...result,
        level: body.level,
        format: body.format,
        estimatedDuration: `${body.durationMinutes} minutes`,
      },
    });
  }),
);

// ─── POST /crm-presentation ─────────────────────────────────────────────────

router.post(
  '/crm-presentation',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = CRMPresentationSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.tenantId! || 'default';
    const userId = req.user!.userId || 'anonymous';

    const crmContext = [
      `Company: ${body.crmData.companyName}`,
      body.crmData.contactName ? `Contact: ${body.crmData.contactName}` : '',
      body.crmData.industry ? `Industry: ${body.crmData.industry}` : '',
      body.crmData.dealSize ? `Deal Size: ${body.crmData.dealSize}` : '',
      body.crmData.stage ? `Stage: ${body.crmData.stage}` : '',
      body.crmData.products?.length ? `Products: ${body.crmData.products.join(', ')}` : '',
      body.crmData.competitors?.length ? `Competitors: ${body.crmData.competitors.join(', ')}` : '',
      body.crmData.painPoints?.length ? `Pain Points: ${body.crmData.painPoints.join(', ')}` : '',
      body.crmData.notes ? `Notes: ${body.crmData.notes}` : '',
    ].filter(Boolean).join('\n');

    const typeDescriptions: Record<string, string> = {
      pitch: 'sales pitch presentation to win the deal',
      proposal: 'formal business proposal with pricing and deliverables',
      review: 'quarterly business review highlighting results',
      onboarding: 'client onboarding walkthrough',
      upsell: 'upselling additional products/services to existing client',
    };

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Generate a ${body.slideCount}-slide ${typeDescriptions[body.presentationType]} based on CRM data.
Tone: ${body.tone}
Language: ${body.language}
Return ONLY valid JSON:
{
  "title": "Presentation title",
  "slides": [
    {
      "order": 1,
      "layout": "title|content|two-column|data-heavy|image-focus",
      "title": "Slide title",
      "body": "Main content",
      "bulletPoints": ["point1", "point2"],
      "speakerNotes": "What to say",
      "suggestedVisual": "Visual description"
    }
  ],
  "talkingPoints": ["key talking point"],
  "objectionHandling": [{"objection": "potential objection", "response": "suggested response"}]
}`,
        },
        { role: 'user', content: `CRM Data:\n${crmContext}` },
      ],
      max_tokens: 6000,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');

    const presentationTitle = result.title || `${body.presentationType} - ${body.crmData.companyName}`;

    // Create presentation in database
    const presentation = await prisma.presentation.create({
      data: {
        id: randomUUID(),
        name: presentationTitle,
        title: presentationTitle,
        tenantId,
        userId,
        status: 'DRAFT',
        theme: {},
      },
    });

    // Create slides
    const createdSlideIds: string[] = [];
    const slidesData = result.slides || [];
    for (let idx = 0; idx < slidesData.length; idx++) {
      const slideData = slidesData[idx] as Record<string, unknown>;
      const slideId = randomUUID();
      await prisma.slide.create({
        data: {
          id: slideId,
          presentationId: presentation.id,
          slideIndex: idx,
          order: idx + 1,
          layout: String(slideData.layout || 'content'),
          content: JSON.parse(JSON.stringify({
            title: slideData.title,
            body: slideData.body,
            bulletPoints: slideData.bulletPoints,
            speakerNotes: slideData.speakerNotes,
          })),
        },
      });
      createdSlideIds.push(slideId);
    }

    res.status(201).json({
      success: true,
      data: {
        presentationId: presentation.id,
        title: presentationTitle,
        slideCount: createdSlideIds.length,
        slides: slidesData,
        talkingPoints: result.talkingPoints || [],
        objectionHandling: result.objectionHandling || [],
        crmSource: body.crmData.companyName,
        presentationType: body.presentationType,
      },
    });
  }),
);

// ─── POST /competitor-analysis ──────────────────────────────────────────────

router.post(
  '/competitor-analysis',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = CompetitorAnalysisSchema.parse(req.body);

    const dimensions = body.dimensions || ['pricing', 'features', 'market_share', 'technology', 'customer_satisfaction'];

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a competitive intelligence analyst. Analyze the company vs competitors.
Dimensions to analyze: ${dimensions.join(', ')}
${body.industry ? `Industry: ${body.industry}` : ''}
Language: ${body.language}
Return ONLY valid JSON:
{
  "company": "${body.company}",
  "overview": "Analysis overview text",
  "competitors": [
    {
      "name": "competitor name",
      "strengths": ["strength1"],
      "weaknesses": ["weakness1"],
      "scores": {"pricing": 7, "features": 8}
    }
  ],
  "comparisonMatrix": [
    {"dimension": "pricing", "company_score": 8, "competitors": [{"name": "comp", "score": 7}]}
  ],
  "opportunities": ["opportunity based on competitive gaps"],
  "threats": ["competitive threat"],
  "recommendations": ["strategic recommendation"],
  "swotSummary": {
    "strengths": ["strength"],
    "weaknesses": ["weakness"],
    "opportunities": ["opportunity"],
    "threats": ["threat"]
  }
}`,
        },
        { role: 'user', content: `Analyze ${body.company} against competitors: ${body.competitors.join(', ')}` },
      ],
      max_tokens: 5000,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');

    res.json({
      success: true,
      data: {
        company: result.company || body.company,
        overview: result.overview || '',
        competitors: result.competitors || [],
        comparisonMatrix: result.comparisonMatrix || [],
        opportunities: result.opportunities || [],
        threats: result.threats || [],
        recommendations: result.recommendations || [],
        swotSummary: result.swotSummary || { strengths: [], weaknesses: [], opportunities: [], threats: [] },
      },
    });
  }),
);

// ─── POST /design-suggestions ───────────────────────────────────────────────

router.post(
  '/design-suggestions',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = DesignSuggestionsSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.tenantId! || 'default';

    const { presentation, slides } = await fetchPresentationWithSlides(body.presentationId, tenantId);

    const targetSlides = body.slideIds
      ? slides.filter((s: SlideWithElements) => body.slideIds!.includes(s.id))
      : slides;

    const slideDescriptions = targetSlides.map((slide: SlideWithElements) => ({
      slideId: slide.id,
      order: slide.order,
      layout: slide.layout,
      elementCount: slide.slideElements.length,
      elements: slide.slideElements.map((el: SlideElementRecord) => ({
        type: el.type,
        positionX: el.positionX,
        positionY: el.positionY,
        width: el.width,
        height: el.height,
        style: el.style,
        hasContent: !!el.content,
      })),
    }));

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a presentation design expert. Analyze the slide structure and provide design suggestions.
Focus areas: ${body.focusAreas.join(', ')}
Presentation theme: ${JSON.stringify(presentation.theme || {})}
Return ONLY valid JSON:
{
  "overallScore": 78,
  "overallFeedback": "General design assessment",
  "slidesSuggestions": [
    {
      "slideId": "id",
      "score": 80,
      "suggestions": [
        {
          "area": "layout|colors|typography|spacing|images|charts",
          "severity": "high|medium|low",
          "current": "What it looks like now",
          "suggestion": "What to change",
          "reasoning": "Why this improves the design"
        }
      ]
    }
  ],
  "colorPalette": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "background": "#hex",
    "text": "#hex"
  },
  "typographySuggestion": {
    "headingFont": "font name",
    "bodyFont": "font name",
    "headingSize": 0,
    "bodySize": 0
  },
  "generalTips": ["tip1", "tip2"]
}`,
        },
        { role: 'user', content: `Analyze these slides:\n${JSON.stringify(slideDescriptions, null, 2)}` },
      ],
      max_tokens: 4000,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');

    res.json({
      success: true,
      data: {
        presentationId: body.presentationId,
        overallScore: result.overallScore || 0,
        overallFeedback: result.overallFeedback || '',
        slidesSuggestions: result.slidesSuggestions || [],
        colorPalette: result.colorPalette || {},
        typographySuggestion: result.typographySuggestion || {},
        generalTips: result.generalTips || [],
      },
    });
  }),
);

export default router;
