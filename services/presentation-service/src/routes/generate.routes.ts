import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { authMiddleware } from '../middleware/auth.js';
import * as slideBuilder from '../services/slide-builder.service.js';
import * as aiGenerator from '../services/ai-slide-generator.service.js';
import * as designEngine from '../services/design-engine.service.js';
import * as sourceProcessor from '../services/source-processor.service.js';

// ─── Setup ──────────────────────────────────────────────────────────────────

const router = Router();
const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

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

function extractUserContext(req: Request): { tenantId: string; userId: string } {
  return {
    tenantId: req.user?.organizationId || 'default',
    userId: req.user?.userId || 'anonymous',
  };
}

// ─── AI Helper ──────────────────────────────────────────────────────────────

interface AiSlideSpec {
  title: string;
  theme: { primaryColor: string; secondaryColor: string; fontFamily: string; backgroundColor: string };
  slides: Array<{
    layout: string;
    title: string;
    body: string;
    subtitle?: string;
    leftContent?: string;
    rightContent?: string;
    notes?: string;
    chartType?: string;
    chartData?: { labels: string[]; series: Array<{ name: string; values: number[] }> };
  }>;
}

async function aiGenerateSlides(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4000
): Promise<AiSlideSpec> {
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  });

  const text = completion.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(text);
  if (!parsed.slides || !Array.isArray(parsed.slides)) {
    throw new Error('AI response did not contain a valid slides array');
  }
  return parsed as AiSlideSpec;
}

const SLIDE_SYSTEM_PROMPT = `You are a world-class presentation designer and content strategist.
Generate structured JSON for a presentation. Return ONLY valid JSON with this structure:
{
  "title": "Presentation Title",
  "theme": {
    "primaryColor": "#hex",
    "secondaryColor": "#hex",
    "fontFamily": "font name",
    "backgroundColor": "#hex"
  },
  "slides": [
    {
      "layout": "title|content|two-column",
      "title": "Slide Title",
      "body": "Body text or bullet points separated by newlines",
      "subtitle": "Optional subtitle for title slides",
      "leftContent": "For two-column layouts",
      "rightContent": "For two-column layouts",
      "notes": "Speaker notes for this slide"
    }
  ]
}`;

async function buildPresentationFromAiSpec(
  spec: AiSlideSpec,
  tenantId: string,
  userId: string,
  sourceType: string,
  extraMeta?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const theme = spec.theme || {
    primaryColor: '#1a73e8',
    secondaryColor: '#ffffff',
    fontFamily: 'Arial',
    backgroundColor: '#ffffff',
  };

  const presentation = await slideBuilder.createPresentation(
    spec.title || 'Generated Presentation',
    theme,
    undefined,
    tenantId,
    userId
  );

  const createdSlides: Record<string, unknown>[] = [];
  for (const slideData of spec.slides) {
    const layout = slideData.layout || 'content';
    const content: Record<string, unknown> = {
      title: slideData.title || '',
      body: slideData.body || '',
      subtitle: slideData.subtitle || '',
      leftContent: slideData.leftContent || '',
      rightContent: slideData.rightContent || '',
      notes: slideData.notes || '',
    };

    const addedSlide = await slideBuilder.addSlide(
      presentation.id,
      layout as 'title' | 'content' | 'two-column' | 'blank',
      content
    );

    if (slideData.chartType && slideData.chartData) {
      await slideBuilder.addChart(
        presentation.id,
        (addedSlide as { slideIndex: number }).slideIndex,
        slideData.chartType,
        slideData.chartData,
        { x: 0.5, y: 2.0, w: 8.0, h: 4.0 }
      );
    }

    createdSlides.push(addedSlide);
  }

  await prisma.presentation.update({
    where: { id: presentation.id },
    data: {
      settings: JSON.stringify({
        sourceType,
        generatedAt: new Date().toISOString(),
        slideCount: createdSlides.length,
        ...extraMeta,
      }),
    },
  });

  return {
    presentationId: presentation.id,
    name: spec.title || 'Generated Presentation',
    theme,
    slideCount: createdSlides.length,
    slides: createdSlides,
    sourceType,
  };
}

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const baseOptionsSchema = z.object({
  slideCount: z.number().min(1).max(50).optional(),
  style: z.string().optional(),
  language: z.string().optional(),
  templateId: z.string().optional(),
  includeCharts: z.boolean().optional(),
  includeSpeakerNotes: z.boolean().optional(),
  targetAudience: z.string().optional(),
  detailLevel: z.enum(['brief', 'standard', 'detailed']).optional(),
}).optional();

const fromTextSchema = z.object({
  text: z.string().min(10, 'Text must be at least 10 characters'),
  title: z.string().optional(),
  options: baseOptionsSchema,
});

const fromUrlSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  options: baseOptionsSchema,
});

const fromDataSchema = z.object({
  datasetId: z.string().min(1).optional(),
  data: z.record(z.unknown()).optional(),
  columns: z.array(z.string()).optional(),
  rows: z.array(z.array(z.unknown())).optional(),
  options: baseOptionsSchema,
});

const fromImageSchema = z.object({
  imageUrls: z.array(z.string().url()).optional(),
  description: z.string().optional(),
  options: baseOptionsSchema,
});

const fromVideoSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  timestamps: z.array(z.number()).optional(),
  options: baseOptionsSchema,
});

const fromEmailSchema = z.object({
  emailContent: z.string().min(5, 'Email content must be at least 5 characters'),
  subject: z.string().optional(),
  sender: z.string().optional(),
  options: baseOptionsSchema,
});

const fromSlackSchema = z.object({
  messages: z.array(z.object({
    user: z.string(),
    text: z.string(),
    timestamp: z.string().optional(),
  })).min(1),
  channelName: z.string().optional(),
  options: baseOptionsSchema,
});

const fromJsonSchema = z.object({
  spec: z.object({
    title: z.string(),
    slides: z.array(z.object({
      layout: z.enum(['title', 'content', 'two-column', 'blank']),
      title: z.string().optional(),
      body: z.string().optional(),
      subtitle: z.string().optional(),
      leftContent: z.string().optional(),
      rightContent: z.string().optional(),
      notes: z.string().optional(),
      elements: z.array(z.record(z.unknown())).optional(),
    })).min(1),
    theme: z.object({
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      fontFamily: z.string().optional(),
      backgroundColor: z.string().optional(),
    }).optional(),
  }),
});

const infographicSchema = z.object({
  topic: z.string().min(3),
  data: z.record(z.unknown()).optional(),
  style: z.enum(['modern', 'classic', 'minimal', 'bold', 'corporate']).optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  options: baseOptionsSchema,
});

const storylineSchema = z.object({
  narrative: z.string().min(10),
  scenes: z.array(z.string()).optional(),
  style: z.enum(['cinematic', 'documentary', 'educational', 'storytelling']).optional(),
  options: baseOptionsSchema,
});

const fromReportSchema = z.object({
  content: z.string().min(10),
  reportType: z.enum(['operational', 'executive', 'technical', 'financial']),
  options: baseOptionsSchema,
});

const multiSourceSchema = z.object({
  sources: z.array(z.object({
    type: z.enum(['text', 'pdf', 'word', 'url', 'email', 'youtube', 'image', 'json', 'csv', 'markdown', 'html']),
    content: z.string().optional(),
    url: z.string().optional(),
  })).min(1),
  options: baseOptionsSchema,
});

const suggestStructureSchema = z.object({
  topic: z.string().min(3),
  context: z.string().optional(),
  audience: z.string().optional(),
  purpose: z.enum(['inform', 'persuade', 'educate', 'entertain', 'report']).optional(),
});

const socialMediaSchema = z.object({
  topic: z.string().min(3),
  platform: z.enum(['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok', 'youtube']),
  contentType: z.enum(['post', 'story', 'carousel', 'reel', 'cover']).optional(),
  brandColors: z.array(z.string()).optional(),
  options: baseOptionsSchema,
});

const cardSchema = z.object({
  type: z.enum(['business', 'greeting', 'thank-you', 'invitation', 'holiday']),
  recipientName: z.string().optional(),
  senderName: z.string().optional(),
  message: z.string().min(1),
  style: z.string().optional(),
  options: baseOptionsSchema,
});

const certificateSchema = z.object({
  recipientName: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  issuerName: z.string().optional(),
  issueDate: z.string().optional(),
  certificateId: z.string().optional(),
  style: z.enum(['formal', 'modern', 'elegant', 'academic', 'corporate']).optional(),
  options: baseOptionsSchema,
});

const bannerSchema = z.object({
  headline: z.string().min(1),
  subheadline: z.string().optional(),
  ctaText: z.string().optional(),
  dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
  style: z.string().optional(),
  brandColors: z.array(z.string()).optional(),
  options: baseOptionsSchema,
});

const resumeSchema = z.object({
  fullName: z.string().min(1),
  title: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  summary: z.string().optional(),
  experience: z.array(z.object({
    company: z.string(),
    role: z.string(),
    startDate: z.string(),
    endDate: z.string().optional(),
    description: z.string(),
  })).optional(),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    year: z.string(),
  })).optional(),
  skills: z.array(z.string()).optional(),
  style: z.enum(['modern', 'classic', 'creative', 'minimal', 'professional']).optional(),
  options: baseOptionsSchema,
});

const posterSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  body: z.string().optional(),
  eventDate: z.string().optional(),
  location: z.string().optional(),
  style: z.enum(['modern', 'vintage', 'minimal', 'bold', 'artistic']).optional(),
  dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
  options: baseOptionsSchema,
});

const flyerSchema = z.object({
  headline: z.string().min(1),
  body: z.string().optional(),
  contactInfo: z.string().optional(),
  features: z.array(z.string()).optional(),
  ctaText: z.string().optional(),
  style: z.enum(['professional', 'fun', 'elegant', 'bold', 'minimal']).optional(),
  options: baseOptionsSchema,
});

const brochureSchema = z.object({
  title: z.string().min(1),
  sections: z.array(z.object({
    heading: z.string(),
    content: z.string(),
  })).min(1),
  companyName: z.string().optional(),
  contactInfo: z.string().optional(),
  foldType: z.enum(['bi-fold', 'tri-fold', 'z-fold', 'gate-fold']).optional(),
  style: z.enum(['corporate', 'creative', 'minimal', 'elegant']).optional(),
  options: baseOptionsSchema,
});

const logoSchema = z.object({
  companyName: z.string().min(1),
  tagline: z.string().optional(),
  industry: z.string().optional(),
  style: z.enum(['modern', 'classic', 'playful', 'minimalist', 'geometric', 'typographic']).optional(),
  colors: z.array(z.string()).optional(),
  options: baseOptionsSchema,
});

const wireframeSchema = z.object({
  projectName: z.string().min(1),
  pages: z.array(z.object({
    name: z.string(),
    description: z.string(),
    components: z.array(z.string()).optional(),
  })).min(1),
  platform: z.enum(['web', 'mobile', 'tablet', 'desktop']).optional(),
  style: z.enum(['low-fidelity', 'mid-fidelity', 'high-fidelity']).optional(),
  options: baseOptionsSchema,
});

const stickerSchema = z.object({
  text: z.string().min(1),
  shape: z.enum(['circle', 'square', 'rounded', 'star', 'heart', 'custom']).optional(),
  style: z.enum(['cute', 'professional', 'fun', 'retro', 'minimal']).optional(),
  size: z.object({ width: z.number(), height: z.number() }).optional(),
  options: baseOptionsSchema,
});

const invitationSchema = z.object({
  eventName: z.string().min(1),
  eventDate: z.string().min(1),
  eventTime: z.string().optional(),
  venue: z.string().optional(),
  hostName: z.string().optional(),
  message: z.string().optional(),
  rsvpInfo: z.string().optional(),
  style: z.enum(['formal', 'casual', 'festive', 'elegant', 'modern']).optional(),
  options: baseOptionsSchema,
});

const priceTagSchema = z.object({
  productName: z.string().min(1),
  price: z.string().min(1),
  currency: z.string().optional(),
  originalPrice: z.string().optional(),
  discount: z.string().optional(),
  description: z.string().optional(),
  barcode: z.string().optional(),
  style: z.enum(['retail', 'elegant', 'sale', 'minimal', 'bold']).optional(),
  options: baseOptionsSchema,
});

const bookCoverSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  subtitle: z.string().optional(),
  genre: z.string().optional(),
  synopsis: z.string().optional(),
  publisherName: z.string().optional(),
  style: z.enum(['modern', 'classic', 'thriller', 'romance', 'sci-fi', 'academic', 'children']).optional(),
  dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
  options: baseOptionsSchema,
});

const timelineSchema = z.object({
  title: z.string().min(1),
  events: z.array(z.object({
    date: z.string(),
    title: z.string(),
    description: z.string().optional(),
  })).min(2),
  orientation: z.enum(['horizontal', 'vertical']).optional(),
  style: z.enum(['modern', 'classic', 'minimal', 'colorful']).optional(),
  options: baseOptionsSchema,
});

const landingPageSchema = z.object({
  headline: z.string().min(1),
  subheadline: z.string().optional(),
  features: z.array(z.object({
    title: z.string(),
    description: z.string(),
  })).optional(),
  ctaText: z.string().optional(),
  ctaUrl: z.string().optional(),
  testimonials: z.array(z.object({
    quote: z.string(),
    author: z.string(),
  })).optional(),
  style: z.enum(['startup', 'corporate', 'saas', 'ecommerce', 'creative']).optional(),
  options: baseOptionsSchema,
});

// ─── Routes ─────────────────────────────────────────────────────────────────

// POST /from-text — Generate from text/prompt
router.post(
  '/from-text',
  authMiddleware,
  validate(fromTextSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { text, title, options } = req.body;
    const slideCount = options?.slideCount || 8;
    const style = options?.style || 'professional';
    const language = options?.language || 'en';

    const spec = await aiGenerateSlides(
      SLIDE_SYSTEM_PROMPT,
      `Create a ${slideCount}-slide ${style} presentation in ${language}${title ? ` titled "${title}"` : ''} based on this text:\n\n${text}\n\nRequirements:\n- First slide: "title" layout with title and subtitle\n- Use "content" layout for main points\n- Use "two-column" for comparisons\n- Last slide: summary or conclusion\n- Include speaker notes for each slide\n- Exactly ${slideCount} slides`
    );

    if (title) spec.title = title;
    const result = await buildPresentationFromAiSpec(spec, tenantId, userId, 'text', { inputLength: text.length });
    res.status(201).json({ success: true, data: result });
  })
);

// POST /from-file — Generate from file (PDF, Word, TXT)
router.post(
  '/from-file',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'File is required', code: 'MISSING_FILE' });
      return;
    }
    const { tenantId, userId } = extractUserContext(req);
    const ext = (req.file.originalname || '').split('.').pop()?.toLowerCase();
    const typeMap: Record<string, sourceProcessor.SourceType> = {
      pdf: 'pdf', docx: 'word', doc: 'word', txt: 'text',
      json: 'json', csv: 'csv', md: 'markdown', html: 'html', htm: 'html',
      xlsx: 'excel', xls: 'excel', pptx: 'pptx',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
    };
    const sourceType = typeMap[ext || ''] || 'text';
    const options = req.body.options ? JSON.parse(req.body.options) : {};
    const result = await sourceProcessor.createPresentationFromSource(
      { type: sourceType, fileBuffer: req.file.buffer, metadata: { originalName: req.file.originalname, mimeType: req.file.mimetype } },
      options,
      tenantId,
      userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// POST /from-url — Generate from URL
router.post(
  '/from-url',
  authMiddleware,
  validate(fromUrlSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { url, options } = req.body;
    const isYoutube = /youtube\.com|youtu\.be/i.test(url);
    const result = await sourceProcessor.createPresentationFromSource(
      { type: isYoutube ? 'youtube' : 'url', url },
      options || {},
      tenantId,
      userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// POST /from-data — Generate from dataset
router.post(
  '/from-data',
  authMiddleware,
  validate(fromDataSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { datasetId, data, columns, rows, options } = req.body;

    if (datasetId) {
      const result = await aiGenerator.generateFromData(datasetId, options || {}, tenantId, userId);
      res.status(201).json({ success: true, data: result });
      return;
    }

    const dataDescription = data
      ? `Dataset with keys: ${Object.keys(data).join(', ')}.\nSample values: ${JSON.stringify(data).substring(0, 2000)}`
      : columns && rows
        ? `Table with columns: ${columns.join(', ')}.\nSample rows:\n${rows.slice(0, 5).map((r: unknown[]) => r.join(' | ')).join('\n')}`
        : 'No data provided';

    const slideCount = options?.slideCount || 6;
    const spec = await aiGenerateSlides(
      `You are a data visualization expert. Generate a presentation with charts and insights from data.
Return ONLY valid JSON with structure:
{
  "title": "Title",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "title|content|two-column", "title": "Title", "body": "Body", "chartType": "bar|line|pie|null", "chartData": { "labels": [], "series": [{"name":"","values":[]}] }, "notes": "Notes" }
  ]
}`,
      `Create a ${slideCount}-slide data presentation from:\n\n${dataDescription}\n\nInclude chart slides where appropriate. Style: ${options?.style || 'analytical'}.`
    );

    const result = await buildPresentationFromAiSpec(spec, tenantId, userId, 'data', { hasDataset: !!datasetId });
    res.status(201).json({ success: true, data: result });
  })
);

// POST /from-image — Generate from images
router.post(
  '/from-image',
  authMiddleware,
  upload.array('images', 20),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const files = req.files as Express.Multer.File[];
    const bodyData = req.body;
    let imageUrls: string[] = [];
    const description = bodyData.description || '';

    if (bodyData.imageUrls) {
      imageUrls = typeof bodyData.imageUrls === 'string' ? JSON.parse(bodyData.imageUrls) : bodyData.imageUrls;
    }

    const imageDescriptions: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const base64 = file.buffer.toString('base64');
        const mimeType = file.mimetype || 'image/png';
        const visionCompletion = await openai.chat.completions.create({
          model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
          messages: [
            { role: 'system', content: 'Describe this image in detail for use in a presentation. Include key elements, text, and visual themes.' },
            { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } }] },
          ],
          max_tokens: 500,
          temperature: 0.3,
        });
        imageDescriptions.push(visionCompletion.choices[0]?.message?.content || 'Image content');
      }
    }

    if (imageUrls.length > 0) {
      for (const imgUrl of imageUrls) {
        const visionCompletion = await openai.chat.completions.create({
          model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
          messages: [
            { role: 'system', content: 'Describe this image in detail for use in a presentation.' },
            { role: 'user', content: [{ type: 'image_url', image_url: { url: imgUrl, detail: 'high' } }] },
          ],
          max_tokens: 500,
          temperature: 0.3,
        });
        imageDescriptions.push(visionCompletion.choices[0]?.message?.content || 'Image content');
      }
    }

    const combinedDescription = imageDescriptions.length > 0
      ? imageDescriptions.map((d, i) => `Image ${i + 1}: ${d}`).join('\n\n')
      : description || 'A visual presentation';

    const options = bodyData.options ? (typeof bodyData.options === 'string' ? JSON.parse(bodyData.options) : bodyData.options) : {};
    const slideCount = options?.slideCount || Math.max(imageDescriptions.length + 2, 5);

    const spec = await aiGenerateSlides(
      SLIDE_SYSTEM_PROMPT,
      `Create a ${slideCount}-slide visual presentation based on these image descriptions:\n\n${combinedDescription}\n\n${description ? `Additional context: ${description}` : ''}\n\nRequirements:\n- Title slide first\n- One slide per major image/theme\n- Include visual descriptions in the body text\n- Summary slide at the end\n- Include speaker notes`
    );

    const result = await buildPresentationFromAiSpec(spec, tenantId, userId, 'image', {
      imageCount: imageDescriptions.length,
      hasUploadedFiles: !!(files && files.length),
      hasImageUrls: imageUrls.length > 0,
    });
    res.status(201).json({ success: true, data: result });
  })
);

// POST /from-video — Generate from video URL (YouTube)
router.post(
  '/from-video',
  authMiddleware,
  validate(fromVideoSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { url, timestamps, options } = req.body;

    const result = await sourceProcessor.createPresentationFromSource(
      {
        type: 'youtube',
        url,
        metadata: { timestamps: timestamps || [], requestedSlideCount: options?.slideCount || 8 },
      },
      options || {},
      tenantId,
      userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// POST /from-email — Generate from email content
router.post(
  '/from-email',
  authMiddleware,
  validate(fromEmailSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { emailContent, subject, sender, options } = req.body;

    const enrichedContent = [
      subject ? `Subject: ${subject}` : '',
      sender ? `From: ${sender}` : '',
      '',
      emailContent,
    ].filter(Boolean).join('\n');

    const result = await sourceProcessor.createPresentationFromSource(
      { type: 'email', content: enrichedContent },
      options || {},
      tenantId,
      userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// POST /from-slack — Generate from Slack conversations
router.post(
  '/from-slack',
  authMiddleware,
  validate(fromSlackSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { messages, channelName, options } = req.body;

    const conversationText = messages
      .map((m: { user: string; text: string; timestamp?: string }) =>
        `[${m.timestamp || ''}] ${m.user}: ${m.text}`
      )
      .join('\n');

    const fullContent = channelName
      ? `Slack Channel: #${channelName}\n\n${conversationText}`
      : conversationText;

    const slideCount = options?.slideCount || 6;
    const spec = await aiGenerateSlides(
      SLIDE_SYSTEM_PROMPT,
      `Create a ${slideCount}-slide presentation summarizing this Slack conversation:\n\n${fullContent}\n\nRequirements:\n- Title slide with channel/conversation topic\n- Summarize key discussion points\n- Highlight decisions made\n- List action items\n- Include a conclusion slide\n- Professional and concise`
    );

    const result = await buildPresentationFromAiSpec(spec, tenantId, userId, 'slack', {
      channelName: channelName || null,
      messageCount: messages.length,
    });
    res.status(201).json({ success: true, data: result });
  })
);

// POST /from-json — Generate from JSON spec
router.post(
  '/from-json',
  authMiddleware,
  validate(fromJsonSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { spec } = req.body;

    const theme = spec.theme || {
      primaryColor: '#1a73e8',
      secondaryColor: '#ffffff',
      fontFamily: 'Arial',
      backgroundColor: '#ffffff',
    };

    const presentation = await slideBuilder.createPresentation(
      spec.title,
      theme,
      undefined,
      tenantId,
      userId
    );

    const createdSlides: Record<string, unknown>[] = [];
    for (const slideData of spec.slides) {
      const content: Record<string, unknown> = {
        title: slideData.title || '',
        body: slideData.body || '',
        subtitle: slideData.subtitle || '',
        leftContent: slideData.leftContent || '',
        rightContent: slideData.rightContent || '',
        notes: slideData.notes || '',
      };

      const addedSlide = await slideBuilder.addSlide(
        presentation.id,
        slideData.layout,
        content
      );
      createdSlides.push(addedSlide);

      if (slideData.elements && Array.isArray(slideData.elements)) {
        const slideIndex = (addedSlide as { slideIndex: number }).slideIndex;
        for (const element of slideData.elements) {
          if (element.type === 'text' && element.text) {
            await slideBuilder.addTextBox(
              presentation.id,
              slideIndex,
              element.text as string,
              element.position || { x: 0.5, y: 1.5, w: 9, h: 1 },
              element.style || {}
            );
          } else if (element.type === 'chart' && element.chartType) {
            await slideBuilder.addChart(
              presentation.id,
              slideIndex,
              element.chartType as string,
              element.data || {},
              element.position || {}
            );
          } else if (element.type === 'table' && element.data) {
            await slideBuilder.addTable(
              presentation.id,
              slideIndex,
              element.data as unknown[][],
              element.position || {},
              element.style || {}
            );
          } else if (element.type === 'shape' && element.shape) {
            await slideBuilder.addShape(
              presentation.id,
              slideIndex,
              element.shape as 'rect' | 'circle' | 'arrow' | 'line',
              element.position || { x: 1, y: 1, w: 2, h: 2 },
              element.style || {}
            );
          }
        }
      }
    }

    await prisma.presentation.update({
      where: { id: presentation.id },
      data: {
        settings: JSON.stringify({
          sourceType: 'json-spec',
          generatedAt: new Date().toISOString(),
          slideCount: createdSlides.length,
        }),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        presentationId: presentation.id,
        name: spec.title,
        theme,
        slideCount: createdSlides.length,
        slides: createdSlides,
        sourceType: 'json-spec',
      },
    });
  })
);

// POST /infographic — Generate infographic
router.post(
  '/infographic',
  authMiddleware,
  validate(infographicSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { topic, data, style, orientation, options } = req.body;
    const slideCount = options?.slideCount || 3;
    const infographicStyle = style || 'modern';
    const orient = orientation || 'portrait';

    const dataContext = data ? `\nData to visualize:\n${JSON.stringify(data, null, 2)}` : '';

    const spec = await aiGenerateSlides(
      `You are an infographic design expert. Generate a visually-oriented presentation structure for an infographic.
Return ONLY valid JSON with this structure:
{
  "title": "Infographic Title",
  "theme": {
    "primaryColor": "#hex",
    "secondaryColor": "#hex",
    "fontFamily": "font name",
    "backgroundColor": "#hex"
  },
  "slides": [
    {
      "layout": "title|content|two-column",
      "title": "Section Title",
      "body": "Key stats or info in bullet points",
      "chartType": "bar|pie|line|null",
      "chartData": { "labels": [], "series": [{"name":"","values":[]}] },
      "notes": "Design notes"
    }
  ]
}
Design tips:
- Use bold colors and clear hierarchy
- Each slide represents an infographic section
- Include data visualizations where possible
- Keep text minimal and impactful`,
      `Create a ${slideCount}-section ${infographicStyle} infographic about: ${topic}\nOrientation: ${orient}${dataContext}\n\nRequirements:\n- Bold, eye-catching design\n- Data-driven with charts where applicable\n- Clear visual hierarchy\n- Minimal text, maximum impact\n- Include relevant statistics`
    );

    const dimensions = orient === 'portrait'
      ? { width: 7.5, height: 10 }
      : undefined;

    const theme = spec.theme || {
      primaryColor: '#FF6B35',
      secondaryColor: '#004E98',
      fontFamily: 'Montserrat',
      backgroundColor: '#F5F5F5',
    };

    const presentation = await slideBuilder.createPresentation(
      spec.title || `Infographic: ${topic}`,
      theme,
      dimensions,
      tenantId,
      userId
    );

    const createdSlides: Record<string, unknown>[] = [];
    for (const slideData of spec.slides) {
      const addedSlide = await slideBuilder.addSlide(
        presentation.id,
        (slideData.layout || 'content') as 'title' | 'content' | 'two-column' | 'blank',
        {
          title: slideData.title || '',
          body: slideData.body || '',
          notes: slideData.notes || '',
        }
      );

      if (slideData.chartType && slideData.chartData) {
        await slideBuilder.addChart(
          presentation.id,
          (addedSlide as { slideIndex: number }).slideIndex,
          slideData.chartType,
          slideData.chartData,
          { x: 0.5, y: 2.5, w: 6.5, h: 3.5 }
        );
      }

      createdSlides.push(addedSlide);
    }

    await prisma.presentation.update({
      where: { id: presentation.id },
      data: {
        settings: JSON.stringify({
          sourceType: 'infographic',
          style: infographicStyle,
          orientation: orient,
          topic,
          generatedAt: new Date().toISOString(),
        }),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        presentationId: presentation.id,
        name: spec.title || `Infographic: ${topic}`,
        theme,
        slideCount: createdSlides.length,
        slides: createdSlides,
        sourceType: 'infographic',
        orientation: orient,
      },
    });
  })
);

// POST /storyline — Generate visual storyline
router.post(
  '/storyline',
  authMiddleware,
  validate(storylineSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { narrative, scenes, style, options } = req.body;

    const storyStyle = style || 'cinematic';
    const scenesText = scenes && scenes.length > 0
      ? `\n\nKey scenes to include:\n${scenes.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`
      : '';
    const slideCount = options?.slideCount || (scenes ? scenes.length + 2 : 8);

    const spec = await aiGenerateSlides(
      `You are a visual storytelling expert. Create a cinematic, narrative-driven presentation.
Return ONLY valid JSON:
{
  "title": "Story Title",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "title|content|two-column", "title": "Scene Title", "body": "Narrative text with vivid descriptions", "subtitle": "Scene subtitle", "notes": "Transition notes and pacing" }
  ]
}
Style guidelines:
- Use evocative, descriptive language
- Build narrative tension
- Each slide is a scene in the story
- Include smooth transitions between scenes`,
      `Create a ${slideCount}-slide ${storyStyle} visual storyline:\n\nNarrative:\n${narrative}${scenesText}\n\nRequirements:\n- Opening scene with strong hook\n- Rising action through middle slides\n- Climax or key message\n- Resolution/conclusion\n- Speaker notes with pacing guidance`
    );

    const result = await buildPresentationFromAiSpec(spec, tenantId, userId, 'storyline', {
      style: storyStyle,
      sceneCount: scenes?.length || 0,
    });
    res.status(201).json({ success: true, data: result });
  })
);

// POST /from-report — Generate from operational report
router.post(
  '/from-report',
  authMiddleware,
  validate(fromReportSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { content, reportType, options } = req.body;
    const result = await sourceProcessor.convertReportToPresentation(
      content,
      reportType,
      options || {},
      tenantId,
      userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// POST /multi-source — Generate from multiple sources combined
router.post(
  '/multi-source',
  authMiddleware,
  validate(multiSourceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { sources, options } = req.body;
    const result = await sourceProcessor.createPresentationFromMultipleSources(
      sources,
      options || {},
      tenantId,
      userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// POST /suggest-structure — AI suggest presentation structure
router.post(
  '/suggest-structure',
  authMiddleware,
  validate(suggestStructureSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { topic, context, audience, purpose } = req.body;

    const enrichedContext = [
      context || '',
      audience ? `Target audience: ${audience}` : '',
      purpose ? `Purpose: ${purpose}` : '',
    ].filter(Boolean).join('\n');

    const result = await sourceProcessor.suggestPresentationStructure(topic, enrichedContext || undefined);
    res.json({ success: true, data: result });
  })
);

// POST /social-media — Generate social media content
router.post(
  '/social-media',
  authMiddleware,
  validate(socialMediaSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { topic, platform, contentType, brandColors, options } = req.body;

    const platformDimensions: Record<string, { width: number; height: number }> = {
      instagram: { width: 10, height: 10 },
      facebook: { width: 10, height: 5.25 },
      twitter: { width: 10, height: 5 },
      linkedin: { width: 10, height: 5 },
      tiktok: { width: 7.5, height: 13.3 },
      youtube: { width: 10, height: 5.63 },
    };

    const dims = platformDimensions[platform] || { width: 10, height: 10 };
    const type = contentType || 'post';
    const slideCount = type === 'carousel' ? (options?.slideCount || 5) : 1;
    const colorHint = brandColors && brandColors.length > 0
      ? `\nBrand colors: ${brandColors.join(', ')}`
      : '';

    const spec = await aiGenerateSlides(
      `You are a social media content designer. Create ${platform} ${type} content.
Return ONLY valid JSON:
{
  "title": "Post Title",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "content", "title": "Headline", "body": "Short, punchy text for social media", "notes": "Hashtags and posting tips" }
  ]
}
Guidelines for ${platform}:
- Keep text very concise
- Use bold headlines
- Include call-to-action
- Optimize for ${platform} engagement`,
      `Create ${slideCount} ${platform} ${type} slide(s) about: ${topic}${colorHint}\n\nRequirements:\n- Optimized for ${platform}\n- Engaging and shareable\n- Include hashtag suggestions in notes\n- ${type === 'carousel' ? 'Each slide should flow as a sequence' : 'Single impactful design'}`
    );

    const theme = spec.theme || {
      primaryColor: brandColors?.[0] || '#E1306C',
      secondaryColor: brandColors?.[1] || '#833AB4',
      fontFamily: 'Montserrat',
      backgroundColor: '#FFFFFF',
    };

    const presentation = await slideBuilder.createPresentation(
      spec.title || `${platform} ${type}: ${topic}`,
      theme,
      dims,
      tenantId,
      userId
    );

    const createdSlides: Record<string, unknown>[] = [];
    for (const slideData of spec.slides) {
      const addedSlide = await slideBuilder.addSlide(
        presentation.id,
        (slideData.layout || 'content') as 'title' | 'content' | 'two-column' | 'blank',
        {
          title: slideData.title || '',
          body: slideData.body || '',
          notes: slideData.notes || '',
        }
      );
      createdSlides.push(addedSlide);
    }

    await prisma.presentation.update({
      where: { id: presentation.id },
      data: {
        settings: JSON.stringify({
          sourceType: 'social-media',
          platform,
          contentType: type,
          topic,
          generatedAt: new Date().toISOString(),
        }),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        presentationId: presentation.id,
        name: spec.title || `${platform} ${type}: ${topic}`,
        theme,
        slideCount: createdSlides.length,
        slides: createdSlides,
        sourceType: 'social-media',
        platform,
        contentType: type,
        dimensions: dims,
      },
    });
  })
);

// POST /card — Generate business/greeting cards
router.post(
  '/card',
  authMiddleware,
  validate(cardSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { type, recipientName, senderName, message, style, options } = req.body;

    const cardStyle = style || 'elegant';
    const spec = await aiGenerateSlides(
      `You are a card designer. Create a ${type} card design.
Return ONLY valid JSON:
{
  "title": "Card Title",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "content", "title": "Front text", "body": "Card message", "notes": "Design instructions" }
  ]
}
Design rules:
- ${type === 'business' ? 'Clean, professional layout with contact info' : 'Warm, personal design with decorative elements'}
- Beautiful typography
- Balanced whitespace`,
      `Create a ${cardStyle} ${type} card:\n\n${recipientName ? `To: ${recipientName}` : ''}${senderName ? `\nFrom: ${senderName}` : ''}\nMessage: ${message}\n\nRequirements:\n- Front of card (slide 1) with main design\n- ${type === 'business' ? 'Include name, title, contact fields' : 'Include heartfelt message'}\n- Back of card (slide 2) with additional info if needed`
    );

    const dims = type === 'business'
      ? { width: 3.5, height: 2 }
      : { width: 5, height: 7 };

    const result = await buildPresentationFromAiSpec(
      { ...spec, title: spec.title || `${type} Card` },
      tenantId,
      userId,
      'card',
      { cardType: type, recipientName, senderName }
    );

    res.status(201).json({ success: true, data: { ...result, cardType: type, dimensions: dims } });
  })
);

// POST /certificate — Generate certificates
router.post(
  '/certificate',
  authMiddleware,
  validate(certificateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { recipientName, title, description, issuerName, issueDate, certificateId, style, options } = req.body;

    const certStyle = style || 'formal';
    const certId = certificateId || uuidv4().substring(0, 8).toUpperCase();
    const date = issueDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const spec = await aiGenerateSlides(
      `You are a certificate designer. Create an official certificate layout.
Return ONLY valid JSON:
{
  "title": "Certificate of ...",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "content", "title": "CERTIFICATE OF ACHIEVEMENT", "body": "Detailed certificate text with recipient name, description, date, and issuer", "notes": "Design notes" }
  ]
}
Design rules:
- ${certStyle} style with decorative borders
- Prominent recipient name
- Official-looking typography
- Include certificate number and date`,
      `Create a ${certStyle} certificate:\n\nTitle: ${title}\nRecipient: ${recipientName}\n${description ? `Description: ${description}` : ''}\nIssuer: ${issuerName || 'Organization'}\nDate: ${date}\nCertificate ID: ${certId}\n\nRequirements:\n- Single slide certificate\n- Prominent recipient name\n- Official styling\n- Include all provided details`
    );

    const presentation = await slideBuilder.createPresentation(
      spec.title || `Certificate: ${title}`,
      spec.theme || { primaryColor: '#1B4F72', secondaryColor: '#D4AC0D', fontFamily: 'Georgia', backgroundColor: '#FDFEFE' },
      { width: 11, height: 8.5 },
      tenantId,
      userId
    );

    const slideContent: Record<string, unknown> = {
      title: spec.slides[0]?.title || `CERTIFICATE OF ${title.toUpperCase()}`,
      body: spec.slides[0]?.body || `This is to certify that\n\n${recipientName}\n\n${description || `has been awarded this certificate for ${title}`}\n\nDate: ${date}\nCertificate ID: ${certId}`,
      notes: `Issuer: ${issuerName || 'Organization'}`,
    };

    const addedSlide = await slideBuilder.addSlide(presentation.id, 'content', slideContent);

    const slideIndex = (addedSlide as { slideIndex: number }).slideIndex;

    await slideBuilder.addShape(presentation.id, slideIndex, 'rect', { x: 0.2, y: 0.2, w: 10.6, h: 8.1 }, {
      fillColor: 'transparent',
      borderColor: spec.theme?.primaryColor || '#1B4F72',
      borderWidth: 3,
    });

    await prisma.presentation.update({
      where: { id: presentation.id },
      data: {
        settings: JSON.stringify({
          sourceType: 'certificate',
          recipientName,
          certificateId: certId,
          issueDate: date,
          issuerName,
          generatedAt: new Date().toISOString(),
        }),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        presentationId: presentation.id,
        name: spec.title || `Certificate: ${title}`,
        slideCount: 1,
        slides: [addedSlide],
        sourceType: 'certificate',
        certificateId: certId,
        recipientName,
      },
    });
  })
);

// POST /banner — Generate banners
router.post(
  '/banner',
  authMiddleware,
  validate(bannerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { headline, subheadline, ctaText, dimensions, style, brandColors, options } = req.body;

    const bannerStyle = style || 'modern';
    const dims = dimensions || { width: 12, height: 4 };
    const colorHint = brandColors && brandColors.length > 0
      ? `\nBrand colors to use: ${brandColors.join(', ')}`
      : '';

    const spec = await aiGenerateSlides(
      `You are a banner designer. Create an eye-catching banner layout.
Return ONLY valid JSON:
{
  "title": "Banner",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "content", "title": "Headline", "body": "Subheadline and CTA text", "notes": "Design notes" }
  ]
}
Design rules:
- Bold, attention-grabbing headline
- Clear call-to-action
- ${bannerStyle} style
- Minimal text, maximum impact`,
      `Create a ${bannerStyle} banner:\n\nHeadline: ${headline}\n${subheadline ? `Subheadline: ${subheadline}` : ''}\n${ctaText ? `CTA: ${ctaText}` : ''}${colorHint}\n\nDimensions: ${dims.width}" x ${dims.height}"\nRequirements:\n- Single impactful slide\n- Bold typography\n- Clear visual hierarchy`
    );

    const theme = spec.theme || {
      primaryColor: brandColors?.[0] || '#FF5722',
      secondaryColor: brandColors?.[1] || '#FFFFFF',
      fontFamily: 'Impact',
      backgroundColor: brandColors?.[2] || '#1A1A2E',
    };

    const presentation = await slideBuilder.createPresentation(
      `Banner: ${headline}`,
      theme,
      dims,
      tenantId,
      userId
    );

    const addedSlide = await slideBuilder.addSlide(presentation.id, 'content', {
      title: headline,
      body: [subheadline, ctaText ? `[${ctaText}]` : ''].filter(Boolean).join('\n\n'),
      notes: spec.slides[0]?.notes || '',
    });

    await prisma.presentation.update({
      where: { id: presentation.id },
      data: {
        settings: JSON.stringify({
          sourceType: 'banner',
          style: bannerStyle,
          dimensions: dims,
          generatedAt: new Date().toISOString(),
        }),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        presentationId: presentation.id,
        name: `Banner: ${headline}`,
        theme,
        slideCount: 1,
        slides: [addedSlide],
        sourceType: 'banner',
        dimensions: dims,
      },
    });
  })
);

// POST /resume — Generate resume/CV
router.post(
  '/resume',
  authMiddleware,
  validate(resumeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { fullName, title, email, phone, summary, experience, education, skills, style, options } = req.body;

    const resumeStyle = style || 'modern';
    const experienceText = experience && experience.length > 0
      ? experience.map((e: { company: string; role: string; startDate: string; endDate?: string; description: string }) =>
          `${e.role} at ${e.company} (${e.startDate} - ${e.endDate || 'Present'})\n${e.description}`
        ).join('\n\n')
      : '';

    const educationText = education && education.length > 0
      ? education.map((e: { institution: string; degree: string; year: string }) =>
          `${e.degree} — ${e.institution} (${e.year})`
        ).join('\n')
      : '';

    const skillsText = skills && skills.length > 0 ? skills.join(' | ') : '';

    const spec = await aiGenerateSlides(
      `You are a professional resume/CV designer. Create a structured resume presentation.
Return ONLY valid JSON:
{
  "title": "Name — Title",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "title|content|two-column", "title": "Section Title", "body": "Content", "notes": "Design notes" }
  ]
}
Design rules:
- ${resumeStyle} resume style
- Clean, professional typography
- Clear section headers
- Easy to scan`,
      `Create a ${resumeStyle} resume for:\n\nName: ${fullName}\nTitle: ${title}\n${email ? `Email: ${email}` : ''}\n${phone ? `Phone: ${phone}` : ''}\n${summary ? `Summary: ${summary}` : ''}\n\nExperience:\n${experienceText}\n\nEducation:\n${educationText}\n\nSkills: ${skillsText}\n\nRequirements:\n- Slide 1: Header with name, title, contact\n- Slide 2: Professional summary (if provided)\n- Slide 3+: Experience details\n- Education slide\n- Skills slide\n- Clean, ATS-friendly layout`
    );

    const result = await buildPresentationFromAiSpec(
      { ...spec, title: `${fullName} — ${title}` },
      tenantId,
      userId,
      'resume',
      { fullName, title: title, style: resumeStyle }
    );

    res.status(201).json({ success: true, data: result });
  })
);

// POST /poster — Generate posters
router.post(
  '/poster',
  authMiddleware,
  validate(posterSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { title, subtitle, body, eventDate, location, style, dimensions, options } = req.body;

    const posterStyle = style || 'modern';
    const dims = dimensions || { width: 7.5, height: 10 };

    const spec = await aiGenerateSlides(
      `You are a poster designer. Create an eye-catching poster layout.
Return ONLY valid JSON:
{
  "title": "Poster Title",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "content", "title": "Main Title", "body": "Poster content including details", "subtitle": "Subtitle", "notes": "Design notes" }
  ]
}
Design rules:
- ${posterStyle} poster aesthetics
- Large, bold title
- Visual hierarchy: title > date/location > details
- Dramatic use of color`,
      `Create a ${posterStyle} poster:\n\nTitle: ${title}\n${subtitle ? `Subtitle: ${subtitle}` : ''}\n${body ? `Details: ${body}` : ''}\n${eventDate ? `Date: ${eventDate}` : ''}\n${location ? `Location: ${location}` : ''}\n\nRequirements:\n- Single impactful slide\n- Bold, dramatic typography\n- All event details clearly visible\n- ${posterStyle} aesthetic`
    );

    const theme = spec.theme || {
      primaryColor: '#E74C3C',
      secondaryColor: '#ECF0F1',
      fontFamily: 'Bebas Neue',
      backgroundColor: '#2C3E50',
    };

    const presentation = await slideBuilder.createPresentation(
      `Poster: ${title}`,
      theme,
      dims,
      tenantId,
      userId
    );

    const posterContent = [
      subtitle || '',
      body || '',
      eventDate ? `Date: ${eventDate}` : '',
      location ? `Location: ${location}` : '',
    ].filter(Boolean).join('\n\n');

    const addedSlide = await slideBuilder.addSlide(presentation.id, 'content', {
      title,
      body: posterContent,
      notes: spec.slides[0]?.notes || '',
    });

    await prisma.presentation.update({
      where: { id: presentation.id },
      data: {
        settings: JSON.stringify({
          sourceType: 'poster',
          style: posterStyle,
          dimensions: dims,
          generatedAt: new Date().toISOString(),
        }),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        presentationId: presentation.id,
        name: `Poster: ${title}`,
        theme,
        slideCount: 1,
        slides: [addedSlide],
        sourceType: 'poster',
        dimensions: dims,
      },
    });
  })
);

// POST /flyer — Generate flyers
router.post(
  '/flyer',
  authMiddleware,
  validate(flyerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { headline, body, contactInfo, features, ctaText, style, options } = req.body;

    const flyerStyle = style || 'professional';
    const featuresText = features && features.length > 0
      ? `\nKey features:\n${features.map((f: string) => `- ${f}`).join('\n')}`
      : '';

    const spec = await aiGenerateSlides(
      `You are a flyer designer. Create a compelling flyer layout.
Return ONLY valid JSON:
{
  "title": "Flyer",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "content", "title": "Headline", "body": "Flyer content", "notes": "Design notes" }
  ]
}
Design rules:
- ${flyerStyle} flyer style
- Clear call-to-action
- Well-organized information
- Attention-grabbing design`,
      `Create a ${flyerStyle} flyer:\n\nHeadline: ${headline}\n${body ? `Details: ${body}` : ''}${featuresText}\n${ctaText ? `CTA: ${ctaText}` : ''}\n${contactInfo ? `Contact: ${contactInfo}` : ''}\n\nRequirements:\n- Front side with headline and key info (slide 1)\n- Back side with details and contact (slide 2)\n- Clear visual hierarchy\n- Professional layout`
    );

    const dims = { width: 8.5, height: 11 };
    const result = await buildPresentationFromAiSpec(
      { ...spec, title: `Flyer: ${headline}` },
      tenantId,
      userId,
      'flyer',
      { style: flyerStyle, dimensions: dims }
    );

    res.status(201).json({ success: true, data: { ...result, dimensions: dims } });
  })
);

// POST /brochure — Generate brochures
router.post(
  '/brochure',
  authMiddleware,
  validate(brochureSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { title, sections, companyName, contactInfo, foldType, style, options } = req.body;

    const brochureStyle = style || 'corporate';
    const fold = foldType || 'tri-fold';
    const panelCount = fold === 'bi-fold' ? 4 : fold === 'tri-fold' ? 6 : fold === 'z-fold' ? 6 : 4;

    const sectionsText = sections.map((s: { heading: string; content: string }, i: number) =>
      `Section ${i + 1}: ${s.heading}\n${s.content}`
    ).join('\n\n');

    const spec = await aiGenerateSlides(
      `You are a brochure designer. Create a ${fold} brochure layout.
Return ONLY valid JSON:
{
  "title": "Brochure Title",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "content|two-column", "title": "Panel Title", "body": "Panel content", "leftContent": "Left panel", "rightContent": "Right panel", "notes": "Panel number and design notes" }
  ]
}
Design rules:
- ${brochureStyle} brochure style
- Each slide = one panel or panel pair
- Clear section headers
- Consistent branding throughout`,
      `Create a ${brochureStyle} ${fold} brochure:\n\nTitle: ${title}\n${companyName ? `Company: ${companyName}` : ''}\n\nSections:\n${sectionsText}\n\n${contactInfo ? `Contact: ${contactInfo}` : ''}\n\nTotal panels: ${panelCount}\nRequirements:\n- Cover panel with title and company name\n- Content panels for each section\n- Back panel with contact information\n- Consistent design across all panels`
    );

    const result = await buildPresentationFromAiSpec(
      { ...spec, title: `Brochure: ${title}` },
      tenantId,
      userId,
      'brochure',
      { foldType: fold, style: brochureStyle, panelCount, companyName }
    );

    res.status(201).json({ success: true, data: { ...result, foldType: fold, panelCount } });
  })
);

// POST /logo — Generate logos
router.post(
  '/logo',
  authMiddleware,
  validate(logoSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { companyName, tagline, industry, style, colors, options } = req.body;

    const logoStyle = style || 'modern';
    const colorHint = colors && colors.length > 0
      ? `\nPreferred colors: ${colors.join(', ')}`
      : '';

    const spec = await aiGenerateSlides(
      `You are a logo designer. Create logo concept slides showing different logo variations.
Return ONLY valid JSON:
{
  "title": "Logo Concepts",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "content", "title": "Logo Variation Name", "body": "Description of the logo concept, typography choices, icon description, and usage guidelines", "notes": "Design rationale" }
  ]
}
Design rules:
- ${logoStyle} logo aesthetics
- Show 3-4 concept variations
- Include typography recommendations
- Describe icon/mark concepts
- Color palette for each variation`,
      `Create ${logoStyle} logo concepts for:\n\nCompany: ${companyName}\n${tagline ? `Tagline: ${tagline}` : ''}\n${industry ? `Industry: ${industry}` : ''}${colorHint}\n\nRequirements:\n- 3-4 different logo concept slides\n- Each with description of mark/icon, typography, and colors\n- Include horizontal and stacked layout suggestions\n- Color palette for each concept\n- Usage guidelines`
    );

    const dims = { width: 10, height: 10 };
    const result = await buildPresentationFromAiSpec(
      { ...spec, title: `Logo Concepts: ${companyName}` },
      tenantId,
      userId,
      'logo',
      { companyName, tagline, industry, style: logoStyle }
    );

    res.status(201).json({ success: true, data: { ...result, dimensions: dims } });
  })
);

// POST /wireframe — Generate wireframes
router.post(
  '/wireframe',
  authMiddleware,
  validate(wireframeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { projectName, pages, platform, style, options } = req.body;

    const wireframeStyle = style || 'mid-fidelity';
    const targetPlatform = platform || 'web';

    const pagesText = pages.map((p: { name: string; description: string; components?: string[] }, i: number) => {
      const comps = p.components ? `\n  Components: ${p.components.join(', ')}` : '';
      return `Page ${i + 1}: ${p.name}\n  Description: ${p.description}${comps}`;
    }).join('\n\n');

    const spec = await aiGenerateSlides(
      `You are a UX/UI wireframe designer. Create wireframe descriptions for ${targetPlatform}.
Return ONLY valid JSON:
{
  "title": "Wireframes",
  "theme": { "primaryColor": "#808080", "secondaryColor": "#E0E0E0", "fontFamily": "Roboto Mono", "backgroundColor": "#FFFFFF" },
  "slides": [
    { "layout": "content", "title": "Page Name", "body": "Detailed wireframe description with layout grid, component positions, and interactions. Use ASCII-art style descriptions where helpful.", "notes": "UX notes and interaction details" }
  ]
}
Design rules:
- ${wireframeStyle} wireframe level
- Grayscale color scheme (wireframe standard)
- Clear component descriptions with positions
- Navigation and interaction notes
- Responsive considerations for ${targetPlatform}`,
      `Create ${wireframeStyle} wireframes for project "${projectName}" (${targetPlatform}):\n\n${pagesText}\n\nRequirements:\n- Title slide with project overview\n- One wireframe slide per page\n- Include component layout descriptions\n- Navigation flow notes\n- Responsive behavior notes`
    );

    const result = await buildPresentationFromAiSpec(
      { ...spec, title: `Wireframes: ${projectName}` },
      tenantId,
      userId,
      'wireframe',
      { projectName, platform: targetPlatform, fidelity: wireframeStyle, pageCount: pages.length }
    );

    res.status(201).json({ success: true, data: result });
  })
);

// POST /sticker — Generate stickers
router.post(
  '/sticker',
  authMiddleware,
  validate(stickerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { text, shape, style, size, options } = req.body;

    const stickerStyle = style || 'fun';
    const stickerShape = shape || 'rounded';
    const dims = size || { width: 3, height: 3 };

    const spec = await aiGenerateSlides(
      `You are a sticker designer. Create a sticker design.
Return ONLY valid JSON:
{
  "title": "Sticker",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "content", "title": "Sticker text", "body": "Design description", "notes": "Print notes" }
  ]
}
Design rules:
- ${stickerStyle} sticker aesthetic
- ${stickerShape} shape
- Bold, readable text
- Vibrant colors
- Die-cut ready design`,
      `Create a ${stickerStyle} ${stickerShape} sticker with text: "${text}"\n\nSize: ${dims.width}" x ${dims.height}"\nRequirements:\n- Single sticker slide\n- Bold, centered text\n- Eye-catching design\n- ${stickerShape} shape border\n- Print-ready layout`
    );

    const theme = spec.theme || {
      primaryColor: '#FF6B6B',
      secondaryColor: '#4ECDC4',
      fontFamily: 'Comic Sans MS',
      backgroundColor: '#FFE66D',
    };

    const presentation = await slideBuilder.createPresentation(
      `Sticker: ${text}`,
      theme,
      dims,
      tenantId,
      userId
    );

    const addedSlide = await slideBuilder.addSlide(presentation.id, 'content', {
      title: text,
      body: spec.slides[0]?.body || '',
      notes: spec.slides[0]?.notes || '',
    });

    if (stickerShape === 'circle' || stickerShape === 'star' || stickerShape === 'heart') {
      await slideBuilder.addShape(
        presentation.id,
        (addedSlide as { slideIndex: number }).slideIndex,
        stickerShape === 'circle' ? 'circle' : 'rect',
        { x: 0.1, y: 0.1, w: dims.width - 0.2, h: dims.height - 0.2 },
        { fillColor: 'transparent', borderColor: theme.primaryColor, borderWidth: 3 }
      );
    }

    await prisma.presentation.update({
      where: { id: presentation.id },
      data: {
        settings: JSON.stringify({
          sourceType: 'sticker',
          shape: stickerShape,
          style: stickerStyle,
          generatedAt: new Date().toISOString(),
        }),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        presentationId: presentation.id,
        name: `Sticker: ${text}`,
        theme,
        slideCount: 1,
        slides: [addedSlide],
        sourceType: 'sticker',
        shape: stickerShape,
        dimensions: dims,
      },
    });
  })
);

// POST /invitation — Generate invitations
router.post(
  '/invitation',
  authMiddleware,
  validate(invitationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { eventName, eventDate, eventTime, venue, hostName, message, rsvpInfo, style, options } = req.body;

    const inviteStyle = style || 'elegant';

    const spec = await aiGenerateSlides(
      `You are an invitation designer. Create an elegant invitation design.
Return ONLY valid JSON:
{
  "title": "Invitation",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "content", "title": "Event Name", "body": "Full invitation details", "notes": "Design notes" }
  ]
}
Design rules:
- ${inviteStyle} invitation style
- Beautiful typography hierarchy
- All event details clearly presented
- Decorative but readable`,
      `Create a ${inviteStyle} invitation:\n\nEvent: ${eventName}\nDate: ${eventDate}\n${eventTime ? `Time: ${eventTime}` : ''}\n${venue ? `Venue: ${venue}` : ''}\n${hostName ? `Host: ${hostName}` : ''}\n${message ? `Message: ${message}` : ''}\n${rsvpInfo ? `RSVP: ${rsvpInfo}` : ''}\n\nRequirements:\n- Front (slide 1): Event name, date, time, venue\n- Back (slide 2): Additional details, RSVP, map/directions\n- Elegant and inviting design`
    );

    const dims = { width: 7, height: 5 };
    const result = await buildPresentationFromAiSpec(
      { ...spec, title: `Invitation: ${eventName}` },
      tenantId,
      userId,
      'invitation',
      { eventName, eventDate, venue, hostName }
    );

    res.status(201).json({ success: true, data: { ...result, dimensions: dims } });
  })
);

// POST /price-tag — Generate price tags
router.post(
  '/price-tag',
  authMiddleware,
  validate(priceTagSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { productName, price, currency, originalPrice, discount, description, barcode, style, options } = req.body;

    const tagStyle = style || 'retail';
    const currencySymbol = currency || 'SAR';

    const spec = await aiGenerateSlides(
      `You are a retail price tag designer. Create a price tag layout.
Return ONLY valid JSON:
{
  "title": "Price Tag",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "content", "title": "Product Name", "body": "Price and details", "notes": "Design notes" }
  ]
}
Design rules:
- ${tagStyle} price tag style
- Price prominently displayed
- ${discount ? 'Show discount/sale styling' : 'Standard pricing'}
- Barcode area if provided
- Clean, scannable layout`,
      `Create a ${tagStyle} price tag:\n\nProduct: ${productName}\nPrice: ${currencySymbol} ${price}\n${originalPrice ? `Original Price: ${currencySymbol} ${originalPrice}` : ''}\n${discount ? `Discount: ${discount}` : ''}\n${description ? `Description: ${description}` : ''}\n${barcode ? `Barcode: ${barcode}` : ''}\n\nRequirements:\n- Single compact tag\n- Price clearly visible\n- ${discount ? 'Sale/discount styling with crossed-out original price' : 'Standard price display'}\n- Product name and barcode`
    );

    const dims = { width: 3.5, height: 2.5 };
    const theme = spec.theme || {
      primaryColor: discount ? '#E74C3C' : '#2C3E50',
      secondaryColor: '#FFFFFF',
      fontFamily: 'Arial',
      backgroundColor: '#FFFFFF',
    };

    const presentation = await slideBuilder.createPresentation(
      `Price Tag: ${productName}`,
      theme,
      dims,
      tenantId,
      userId
    );

    const priceDisplay = originalPrice
      ? `~~${currencySymbol} ${originalPrice}~~\n${currencySymbol} ${price}${discount ? ` (${discount} OFF)` : ''}`
      : `${currencySymbol} ${price}`;

    const addedSlide = await slideBuilder.addSlide(presentation.id, 'content', {
      title: productName,
      body: [priceDisplay, description || '', barcode ? `Barcode: ${barcode}` : ''].filter(Boolean).join('\n'),
      notes: spec.slides[0]?.notes || '',
    });

    await prisma.presentation.update({
      where: { id: presentation.id },
      data: {
        settings: JSON.stringify({
          sourceType: 'price-tag',
          productName,
          price,
          currency: currencySymbol,
          discount,
          generatedAt: new Date().toISOString(),
        }),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        presentationId: presentation.id,
        name: `Price Tag: ${productName}`,
        theme,
        slideCount: 1,
        slides: [addedSlide],
        sourceType: 'price-tag',
        dimensions: dims,
        productName,
        price: `${currencySymbol} ${price}`,
      },
    });
  })
);

// POST /book-cover — Generate book covers
router.post(
  '/book-cover',
  authMiddleware,
  validate(bookCoverSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { title, author, subtitle, genre, synopsis, publisherName, style, dimensions, options } = req.body;

    const coverStyle = style || 'modern';
    const dims = dimensions || { width: 6, height: 9 };

    const spec = await aiGenerateSlides(
      `You are a book cover designer. Create a compelling book cover layout.
Return ONLY valid JSON:
{
  "title": "Book Cover",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "content", "title": "Book Title", "body": "Author, subtitle, and design description", "notes": "Design rationale" }
  ]
}
Design rules:
- ${coverStyle} book cover style
- ${genre ? `Genre-appropriate design for ${genre}` : 'Universal design'}
- Title prominently displayed
- Author name clearly visible
- Compelling visual concept`,
      `Create a ${coverStyle} book cover:\n\nTitle: ${title}\nAuthor: ${author}\n${subtitle ? `Subtitle: ${subtitle}` : ''}\n${genre ? `Genre: ${genre}` : ''}\n${synopsis ? `Synopsis: ${synopsis}` : ''}\n${publisherName ? `Publisher: ${publisherName}` : ''}\n\nRequirements:\n- Front cover (slide 1): Title, author, visual concept\n- Spine (slide 2): Title and author\n- Back cover (slide 3): Synopsis, barcode area, publisher\n- Genre-appropriate color palette and typography`
    );

    const result = await buildPresentationFromAiSpec(
      { ...spec, title: `Book Cover: ${title}` },
      tenantId,
      userId,
      'book-cover',
      { bookTitle: title, author, genre, style: coverStyle, dimensions: dims }
    );

    res.status(201).json({ success: true, data: { ...result, dimensions: dims } });
  })
);

// POST /timeline — Generate timeline infographics
router.post(
  '/timeline',
  authMiddleware,
  validate(timelineSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { title, events, orientation, style, options } = req.body;

    const timelineStyle = style || 'modern';
    const orient = orientation || 'horizontal';

    const eventsText = events.map((e: { date: string; title: string; description?: string }, i: number) =>
      `${i + 1}. ${e.date}: ${e.title}${e.description ? ` — ${e.description}` : ''}`
    ).join('\n');

    const eventsPerSlide = orient === 'horizontal' ? 4 : 5;
    const slideCount = Math.max(Math.ceil(events.length / eventsPerSlide) + 1, 2);

    const spec = await aiGenerateSlides(
      `You are a timeline infographic designer. Create a ${orient} timeline layout.
Return ONLY valid JSON:
{
  "title": "Timeline Title",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "title|content|two-column", "title": "Slide Title", "body": "Timeline events with dates", "notes": "Design notes" }
  ]
}
Design rules:
- ${timelineStyle} timeline design
- ${orient} orientation
- Clear chronological flow
- Date markers and event descriptions
- Visual connectors between events
- Color-coded milestones`,
      `Create a ${timelineStyle} ${orient} timeline titled "${title}":\n\nEvents:\n${eventsText}\n\nTotal events: ${events.length}\nSlides: ${slideCount}\n\nRequirements:\n- Title slide\n- Group ${eventsPerSlide} events per slide\n- Clear date markers\n- Visual flow between events\n- Highlight key milestones\n- Conclusion/future outlook slide`
    );

    const result = await buildPresentationFromAiSpec(
      { ...spec, title: `Timeline: ${title}` },
      tenantId,
      userId,
      'timeline',
      { eventCount: events.length, orientation: orient, style: timelineStyle }
    );

    res.status(201).json({ success: true, data: { ...result, orientation: orient } });
  })
);

// POST /landing-page — Generate landing pages
router.post(
  '/landing-page',
  authMiddleware,
  validate(landingPageSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractUserContext(req);
    const { headline, subheadline, features, ctaText, ctaUrl, testimonials, style, options } = req.body;

    const lpStyle = style || 'startup';

    const featuresText = features && features.length > 0
      ? `\nFeatures:\n${features.map((f: { title: string; description: string }) => `- ${f.title}: ${f.description}`).join('\n')}`
      : '';

    const testimonialsText = testimonials && testimonials.length > 0
      ? `\nTestimonials:\n${testimonials.map((t: { quote: string; author: string }) => `"${t.quote}" — ${t.author}`).join('\n')}`
      : '';

    const slideCount = options?.slideCount || (3 + (features ? 1 : 0) + (testimonials ? 1 : 0));

    const spec = await aiGenerateSlides(
      `You are a landing page designer. Create a landing page structure as presentation slides.
Return ONLY valid JSON:
{
  "title": "Landing Page",
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "font", "backgroundColor": "#hex" },
  "slides": [
    { "layout": "title|content|two-column", "title": "Section Title", "body": "Section content", "notes": "Section type and design notes" }
  ]
}
Design rules:
- ${lpStyle} landing page style
- Hero section with headline and CTA
- Feature highlights
- Social proof / testimonials
- Clear call-to-action throughout
- Modern web design aesthetics`,
      `Create a ${lpStyle} landing page:\n\nHeadline: ${headline}\n${subheadline ? `Subheadline: ${subheadline}` : ''}${featuresText}${testimonialsText}\n${ctaText ? `CTA: ${ctaText}` : ''}\n${ctaUrl ? `CTA URL: ${ctaUrl}` : ''}\n\nSlides: ${slideCount}\nRequirements:\n- Hero section (slide 1) with headline, subheadline, CTA\n- Features section with icons/descriptions\n- Testimonials/social proof\n- Final CTA section\n- Footer with links`
    );

    const result = await buildPresentationFromAiSpec(
      { ...spec, title: `Landing Page: ${headline}` },
      tenantId,
      userId,
      'landing-page',
      {
        style: lpStyle,
        ctaText,
        ctaUrl,
        featureCount: features?.length || 0,
        testimonialCount: testimonials?.length || 0,
      }
    );

    res.status(201).json({ success: true, data: result });
  })
);

export default router;
