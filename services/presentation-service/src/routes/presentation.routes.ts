import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import * as slideBuilder from '../services/slide-builder.service.js';
import * as aiGenerator from '../services/ai-slide-generator.service.js';
import * as designEngine from '../services/design-engine.service.js';
import * as imageToPpt from '../services/image-to-ppt.service.js';
import { MultiFormatGeneratorService } from '../services/multi-format-generator.service.js';
import * as sourceProcessor from '../services/source-processor.service.js';
import { prisma } from '../utils/prisma.js';

const router = Router();
const multiFormatGenerator = new MultiFormatGeneratorService(prisma);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
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

// === Validation Schemas ===

const createPresentationSchema = z.object({
  name: z.string().min(1).max(255),
  theme: z.object({
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
    fontFamily: z.string().optional(),
    backgroundColor: z.string().optional(),
  }).optional(),
  width: z.number().min(1).max(20).optional(),
  height: z.number().min(1).max(20).optional(),
});

const addSlideSchema = z.object({
  layout: z.enum(['title', 'content', 'two-column', 'blank']),
  content: z.record(z.any()).optional(),
});

const addTextBoxSchema = z.object({
  text: z.string().min(1),
  position: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
  style: z.object({
    fontSize: z.number().optional(),
    bold: z.boolean().optional(),
    color: z.string().optional(),
    rtl: z.boolean().optional(),
  }).optional(),
});

const addShapeSchema = z.object({
  shape: z.enum(['rect', 'circle', 'arrow', 'line']),
  position: z.record(z.any()),
  style: z.record(z.any()).optional(),
});

const addChartSchema = z.object({
  chartType: z.string().min(1),
  data: z.record(z.any()),
  position: z.record(z.any()).optional(),
});

const addTableSchema = z.object({
  data: z.array(z.array(z.any())),
  position: z.record(z.any()).optional(),
  style: z.record(z.any()).optional(),
});

const themeSchema = z.object({
  primaryColor: z.string().min(4),
  secondaryColor: z.string().min(4),
  fontFamily: z.string().min(1),
  backgroundColor: z.string().min(4),
});

const reorderSchema = z.object({
  newOrder: z.array(z.number()),
});

const generateFromTextSchema = z.object({
  text: z.string().min(10),
  options: z.object({
    slideCount: z.number().min(1).max(30).optional(),
    style: z.string().optional(),
    language: z.string().optional(),
  }).optional(),
});

const canonicalGenerateSchema = z.object({
  layoutGraph: z.record(z.any()),
  outputFormat: z.enum(['pptx', 'pdf', 'html', 'docx', 'xlsx']),
  options: z.object({
    preserveFonts: z.boolean().optional(),
    preserveColors: z.boolean().optional(),
    preserveSpacing: z.boolean().optional(),
    embedFonts: z.boolean().optional(),
    rtlSupport: z.boolean().optional(),
    quality: z.enum(['draft', 'standard', 'high']).optional(),
    theme: z.string().nullable().optional(),
  }).optional(),
});

function getGeneratedMimeType(outputFormat: 'pptx' | 'pdf' | 'html' | 'docx' | 'xlsx'): string {
  switch (outputFormat) {
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'pdf':
      return 'application/pdf';
    case 'html':
      return 'text/html';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
}

const generateFromDataSchema = z.object({
  datasetId: z.string().min(1),
  options: z.record(z.any()).optional(),
});

const generateFromOutlineSchema = z.object({
  outline: z.array(z.string().min(1)).min(1),
  options: z.record(z.any()).optional(),
});

const suggestLayoutSchema = z.object({
  content: z.string().min(1),
});

const translateSchema = z.object({
  targetLanguage: z.string().min(2).max(10),
});

const createThemeSchema = z.object({
  name: z.string().min(1),
  colors: z.array(z.string()).min(1),
  fonts: z.array(z.string()).min(1),
  backgrounds: z.array(z.string()).optional(),
});

const colorPaletteSchema = z.object({
  baseColor: z.string().min(4),
  count: z.number().min(2).max(20),
});

const animationSchema = z.object({
  slideIndex: z.number().min(0),
  elementId: z.string().min(1),
  animation: z.string().min(1),
});

const reconstructSchema = z.object({
  analysis: z.record(z.any()),
  presentationId: z.string().min(1),
});

// === CRUD Routes ===

router.post(
  '/presentations',
  authMiddleware,
  validate(createPresentationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, theme, width, height } = req.body;
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const dimensions = width && height ? { width, height } : undefined;
    const result = await slideBuilder.createPresentation(name, theme || {}, dimensions, tenantId, userId);
    res.status(201).json({ success: true, data: result });
  })
);

router.get(
  '/presentations',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || 'default';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const [presentations, total] = await Promise.all([
      prisma.presentation.findMany({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.presentation.count({ where: { tenantId } }),
    ]);
    res.json({
      success: true,
      data: presentations,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

router.get(
  '/presentations/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const presentation = await prisma.presentation.findUnique({
      where: { id: req.params.id! },
    });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }
    const slides = await prisma.slide.findMany({
      where: { presentationId: req.params.id! },
      orderBy: { slideIndex: 'asc' },
    });
    res.json({ success: true, data: { ...presentation, slides } });
  })
);

router.delete(
  '/presentations/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    await prisma.slide.deleteMany({ where: { presentationId: req.params.id! } });
    await prisma.presentation.delete({ where: { id: req.params.id! } });
    res.json({ success: true, message: 'Presentation deleted' });
  })
);

// === Slide Routes ===

router.post(
  '/presentations/:id/slides',
  authMiddleware,
  validate(addSlideSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { layout, content } = req.body;
    const result = await slideBuilder.addSlide(req.params.id!, layout, content || {});
    res.status(201).json({ success: true, data: result });
  })
);

router.put(
  '/presentations/:id/slides/:slideIndex',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const slideIndex = parseInt(req.params.slideIndex!);
    const result = await slideBuilder.updateSlide(req.params.id!, slideIndex, {
      layout: req.body.layout,
      content: req.body.content,
      notes: req.body.notes,
    });
    res.json({ success: true, data: result });
  })
);

router.delete(
  '/presentations/:id/slides/:slideIndex',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const slideIndex = parseInt(req.params.slideIndex!);
    const result = await slideBuilder.deleteSlide(req.params.id!, slideIndex);
    res.json({ success: true, data: result });
  })
);

router.put(
  '/presentations/:id/slides/reorder',
  authMiddleware,
  validate(reorderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await slideBuilder.reorderSlides(req.params.id!, req.body.newOrder);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/presentations/:id/slides/:slideIndex/duplicate',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const slideIndex = parseInt(req.params.slideIndex!);
    const result = await slideBuilder.duplicateSlide(req.params.id!, slideIndex);
    res.status(201).json({ success: true, data: result });
  })
);

// === Element Routes ===

router.post(
  '/presentations/:id/slides/:slideIndex/text',
  authMiddleware,
  validate(addTextBoxSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const slideIndex = parseInt(req.params.slideIndex!);
    const { text, position, style } = req.body;
    const result = await slideBuilder.addTextBox(req.params.id!, slideIndex, text, position, style || {});
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/presentations/:id/slides/:slideIndex/image',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Image file is required', code: 'MISSING_FILE' });
      return;
    }
    const slideIndex = parseInt(req.params.slideIndex!);
    const position = req.body.position ? JSON.parse(req.body.position) : { x: 1, y: 1, w: 4, h: 3 };
    const result = await slideBuilder.addImage(req.params.id!, slideIndex, req.file.buffer, position);
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/presentations/:id/slides/:slideIndex/shape',
  authMiddleware,
  validate(addShapeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const slideIndex = parseInt(req.params.slideIndex!);
    const { shape, position, style } = req.body;
    const result = await slideBuilder.addShape(req.params.id!, slideIndex, shape, position, style || {});
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/presentations/:id/slides/:slideIndex/chart',
  authMiddleware,
  validate(addChartSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const slideIndex = parseInt(req.params.slideIndex!);
    const { chartType, data, position } = req.body;
    const result = await slideBuilder.addChart(req.params.id!, slideIndex, chartType, data, position || {});
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/presentations/:id/slides/:slideIndex/table',
  authMiddleware,
  validate(addTableSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const slideIndex = parseInt(req.params.slideIndex!);
    const { data, position, style } = req.body;
    const result = await slideBuilder.addTable(req.params.id!, slideIndex, data, position || {}, style || {});
    res.status(201).json({ success: true, data: result });
  })
);

// === Theme Routes ===

router.put(
  '/presentations/:id/theme',
  authMiddleware,
  validate(themeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await slideBuilder.applyTheme(req.params.id!, req.body);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/themes',
  authMiddleware,
  validate(createThemeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || 'default';
    const result = await designEngine.createTheme(
      req.body.name,
      req.body.colors,
      req.body.fonts,
      req.body.backgrounds || ['#ffffff'],
      tenantId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// === AI Routes ===

router.post(
  '/ai/generate-from-text',
  authMiddleware,
  validate(generateFromTextSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const result = await aiGenerator.generateFromText(req.body.text, req.body.options || {}, tenantId, userId);
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/ai/generate-from-data',
  authMiddleware,
  validate(generateFromDataSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const result = await aiGenerator.generateFromData(req.body.datasetId, req.body.options || {}, tenantId, userId);
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/ai/generate-from-outline',
  authMiddleware,
  validate(generateFromOutlineSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const result = await aiGenerator.generateFromOutline(req.body.outline, req.body.options || {}, tenantId, userId);
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/ai/suggest-layout',
  authMiddleware,
  validate(suggestLayoutSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await aiGenerator.suggestLayout(req.body.content);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/ai/speaker-notes/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await aiGenerator.generateSpeakerNotes(req.params.id!);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/ai/translate/:id',
  authMiddleware,
  validate(translateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await aiGenerator.translatePresentation(req.params.id!, req.body.targetLanguage);
    res.json({ success: true, data: result });
  })
);

// === Design Routes ===

router.post(
  '/design/branding/:id',
  authMiddleware,
  upload.single('logo'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Logo file is required', code: 'MISSING_FILE' });
      return;
    }
    const brand = {
      logo: req.file.buffer,
      primaryColor: req.body.primaryColor || '#1a73e8',
      secondaryColor: req.body.secondaryColor || '#ffffff',
      fontFamily: req.body.fontFamily || 'Arial',
    };
    const result = await designEngine.applyBranding(req.params.id!, brand);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/design/color-palette',
  authMiddleware,
  validate(colorPaletteSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = designEngine.generateColorPalette(req.body.baseColor, req.body.count);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/design/animation/:id',
  authMiddleware,
  validate(animationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { slideIndex, elementId, animation } = req.body;
    const result = await designEngine.addEntryAnimation(req.params.id!, slideIndex, elementId, animation);
    res.json({ success: true, data: result });
  })
);

// === Image-to-PPT Routes ===

router.post(
  '/image-to-ppt/analyze',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Image file is required', code: 'MISSING_FILE' });
      return;
    }
    const result = await imageToPpt.analyzeSlideImage(req.file.buffer);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/image-to-ppt/extract',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Image file is required', code: 'MISSING_FILE' });
      return;
    }
    const result = await imageToPpt.extractElements(req.file.buffer);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/image-to-ppt/reconstruct',
  authMiddleware,
  validate(reconstructSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await imageToPpt.reconstructSlide(req.body.analysis, req.body.presentationId);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/image-to-ppt/batch',
  authMiddleware,
  upload.array('images', 50),
  asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: 'At least one image file is required', code: 'MISSING_FILES' });
      return;
    }
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const imageBuffers = files.map((f) => f.buffer);
    const result = await imageToPpt.batchReconstruct(imageBuffers, tenantId, userId);
    res.status(201).json({ success: true, data: result });
  })
);

// === Export Routes ===

router.get(
  '/presentations/:id/export/pptx',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const buffer = await slideBuilder.exportToPPTX(req.params.id!);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="presentation-${req.params.id!}.pptx"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  })
);

router.get(
  '/presentations/:id/export/pdf',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const buffer = await slideBuilder.exportToPDF(req.params.id!);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="presentation-${req.params.id!}.pdf"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  })
);

router.get(
  '/presentations/:id/export/images',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const format = (req.query.format as string) === 'jpeg' ? 'jpeg' : 'png';
    const images = await designEngine.exportToImages(req.params.id!, format);
    const responseData = images.map((img, idx) => ({
      slideIndex: idx,
      format,
      data: img.toString('base64'),
      size: img.length,
    }));
    res.json({ success: true, data: { format, slideCount: images.length, slides: responseData } });
  })
);

// === Source Processor Routes (Section 5.1) ===

const sourceFromTextSchema = z.object({
  content: z.string().min(1),
  options: z.object({
    slideCount: z.number().min(1).max(30).optional(),
    style: z.string().optional(),
    language: z.string().optional(),
    templateId: z.string().optional(),
    includeCharts: z.boolean().optional(),
    includeSpeakerNotes: z.boolean().optional(),
    targetAudience: z.string().optional(),
    detailLevel: z.enum(['brief', 'standard', 'detailed']).optional(),
  }).optional(),
});

const sourceFromUrlSchema = z.object({
  url: z.string().url(),
  options: z.record(z.any()).optional(),
});

const reportToPresSchema = z.object({
  content: z.string().min(10),
  reportType: z.enum(['operational', 'executive', 'technical', 'financial']),
  options: z.record(z.any()).optional(),
});

const suggestStructureSchema = z.object({
  topic: z.string().min(3),
  context: z.string().optional(),
});

const multiSourceSchema = z.object({
  sources: z.array(z.object({
    type: z.enum(['text', 'pdf', 'word', 'url', 'email', 'youtube', 'image', 'json', 'csv', 'markdown', 'html']),
    content: z.string().optional(),
    url: z.string().optional(),
  })).min(1),
  options: z.record(z.any()).optional(),
});

// Create presentation from text/prompt
router.post(
  '/source/from-text',
  authMiddleware,
  validate(sourceFromTextSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const result = await sourceProcessor.createPresentationFromSource(
      { type: 'text', content: req.body.content },
      req.body.options || {},
      tenantId, userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// Create presentation from file upload (PDF, Word, CSV, etc.)
router.post(
  '/source/from-file',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'File is required', code: 'MISSING_FILE' });
      return;
    }
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const ext = (req.file.originalname || '').split('.').pop()?.toLowerCase();
    const typeMap: Record<string, sourceProcessor.SourceType> = {
      pdf: 'pdf', docx: 'word', doc: 'word', txt: 'text',
      json: 'json', csv: 'csv', md: 'markdown', html: 'html', htm: 'html',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
    };
    const sourceType = typeMap[ext || ''] || 'text';
    const options = req.body.options ? JSON.parse(req.body.options) : {};
    const result = await sourceProcessor.createPresentationFromSource(
      { type: sourceType, fileBuffer: req.file.buffer, metadata: { originalName: req.file.originalname } },
      options, tenantId, userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// Create presentation from URL (webpage)
router.post(
  '/source/from-url',
  authMiddleware,
  validate(sourceFromUrlSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const isYoutube = /youtube\.com|youtu\.be/i.test(req.body.url);
    const result = await sourceProcessor.createPresentationFromSource(
      { type: isYoutube ? 'youtube' : 'url', url: req.body.url },
      req.body.options || {},
      tenantId, userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// Create presentation from email
router.post(
  '/source/from-email',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const result = await sourceProcessor.createPresentationFromSource(
      { type: 'email', content: req.body.emailContent || req.body.content },
      req.body.options || {},
      tenantId, userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// Create from multiple sources
router.post(
  '/source/multi',
  authMiddleware,
  validate(multiSourceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const result = await sourceProcessor.createPresentationFromMultipleSources(
      req.body.sources, req.body.options || {}, tenantId, userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// Convert report to presentation
router.post(
  '/source/from-report',
  authMiddleware,
  validate(reportToPresSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const result = await sourceProcessor.convertReportToPresentation(
      req.body.content, req.body.reportType, req.body.options || {}, tenantId, userId
    );
    res.status(201).json({ success: true, data: result });
  })
);

// Suggest presentation structure
router.post(
  '/source/suggest-structure',
  authMiddleware,
  validate(suggestStructureSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await sourceProcessor.suggestPresentationStructure(req.body.topic, req.body.context);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/internal/canonical-generate',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = canonicalGenerateSchema.parse(req.body);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rasid-multi-format-'));
    const outputPath = path.join(tempDir, `artifact.${parsed.outputFormat}`);

    try {
      const result = await multiFormatGenerator.generate({
        layoutGraph: parsed.layoutGraph as Parameters<MultiFormatGeneratorService['generate']>[0]['layoutGraph'],
        outputFormat: parsed.outputFormat,
        outputPath,
        options: parsed.options as any,
      });

      const buffer = await fs.readFile(outputPath);

      res.json({
        success: true,
        data: {
          buffer: buffer.toString('base64'),
          mimeType: getGeneratedMimeType(parsed.outputFormat),
          pageCount: result.pageCount,
          elementsRendered: result.elementsRendered,
          fileSize: result.fileSize,
          processingTimeMs: result.processingTimeMs,
        },
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  })
);

export default router;
