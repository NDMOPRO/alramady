import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import {
  LayoutGenerationController,
  type GenerateFromLayoutRequest,
  type InputSourceType,
} from '../services/layout-generation-controller.service.js';
import type { GeneratorType, OutputFormat } from '../services/canonical-pipeline-orchestrator.service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

let controller: LayoutGenerationController | null = null;

function getController(): LayoutGenerationController {
  if (!controller) {
    const prisma = new PrismaClient();
    controller = new LayoutGenerationController(prisma);
  }
  return controller;
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Input Validation Schemas ────────────────────────────────────────────────

const outputSchema = z.object({
  generator: z.enum(['dashboard', 'report', 'presentation', 'spreadsheet', 'docx']),
  format: z.enum(['html', 'pdf', 'pptx', 'xlsx', 'docx', 'png', 'svg']),
});

const localizationSchema = z.object({
  enabled: z.boolean(),
  targetLanguage: z.string(),
  sourceLanguage: z.string().optional(),
}).optional();

const optionsSchema = z.object({
  preserveFonts: z.boolean().optional(),
  preserveColors: z.boolean().optional(),
  preserveSpacing: z.boolean().optional(),
  rtlSupport: z.boolean().optional(),
  quality: z.enum(['draft', 'standard', 'high']).optional(),
  pixelPerfectValidation: z.boolean().optional(),
  extractData: z.boolean().optional(),
  optimizeArabicTypography: z.boolean().optional(),
}).optional();

// ─── POST /generate-from-layout (JSON body with layout graph) ────────────────

const jsonRequestSchema = z.object({
  inputSource: z.object({
    type: z.enum(['layout-graph']),
    layoutGraph: z.object({
      id: z.string(),
      version: z.string(),
      sourceType: z.string(),
      sourceHash: z.string(),
      dimensions: z.object({ width: z.number().positive(), height: z.number().positive() }),
      dpi: z.number().positive(),
      pages: z.array(z.any()).min(1),
      designTokens: z.any(),
      metadata: z.any(),
      sceneGraph: z.any(),
      createdAt: z.string(),
      processingTimeMs: z.number(),
    }),
  }),
  outputs: z.array(outputSchema).min(1),
  localization: localizationSchema,
  datasets: z.any().optional(),
  options: optionsSchema,
});

router.post(
  '/generate-from-layout',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = jsonRequestSchema.parse(req.body);

    const result = await getController().generateFromLayout({
      inputSource: {
        type: parsed.inputSource.type as InputSourceType,
        layoutGraph: parsed.inputSource.layoutGraph as Record<string, unknown>,
      },
      outputs: parsed.outputs as Array<{ generator: GeneratorType; format: OutputFormat }>,
      localization: parsed.localization,
      datasets: parsed.datasets,
      options: parsed.options as Record<string, unknown>,
    });

    res.json({
      success: true,
      data: {
        id: result.id,
        graphHash: result.graphHash,
        extractedData: result.extractedData,
        typographyReport: result.typographyReport,
        artifacts: result.artifacts.map(a => ({
          generator: a.generator,
          format: a.format,
          mimeType: a.mimeType,
          sizeBytes: a.buffer.length,
          htmlLength: a.html.length,
          pageCount: a.pageCount,
          elementsRendered: a.elementsRendered,
          pixelValidation: a.pixelValidation,
          processingTimeMs: a.processingTimeMs,
        })),
        pipelineStages: result.pipelineStages,
        totalProcessingTimeMs: result.totalProcessingTimeMs,
      },
    });
  }),
);

// ─── POST /generate-from-layout/upload (multipart with image/PDF) ────────────

router.post(
  '/generate-from-layout/upload',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'File is required (image or PDF)' });
      return;
    }

    const inputType = req.body.inputType || (req.file.mimetype === 'application/pdf' ? 'pdf' : 'image');
    const outputs = req.body.outputs ? JSON.parse(req.body.outputs) : [{ generator: 'dashboard', format: 'html' }];
    const localization = req.body.localization ? JSON.parse(req.body.localization) : undefined;
    const datasets = req.body.datasets ? JSON.parse(req.body.datasets) : undefined;
    const options = req.body.options ? JSON.parse(req.body.options) : undefined;

    const result = await getController().generateFromLayout({
      inputSource: { type: inputType as InputSourceType, buffer: req.file.buffer },
      outputs,
      localization,
      datasets,
      options,
    });

    res.json({
      success: true,
      data: {
        id: result.id,
        graphHash: result.graphHash,
        extractedData: result.extractedData,
        typographyReport: result.typographyReport,
        artifacts: result.artifacts.map(a => ({
          generator: a.generator,
          format: a.format,
          mimeType: a.mimeType,
          sizeBytes: a.buffer.length,
          htmlLength: a.html.length,
          pageCount: a.pageCount,
          elementsRendered: a.elementsRendered,
          pixelValidation: a.pixelValidation,
          processingTimeMs: a.processingTimeMs,
        })),
        pipelineStages: result.pipelineStages,
        totalProcessingTimeMs: result.totalProcessingTimeMs,
      },
    });
  }),
);

// ─── GET /generate-from-layout/generators ────────────────────────────────────

router.get(
  '/generate-from-layout/generators',
  (_req: Request, res: Response) => {
    res.json({ success: true, data: getController().getGenerators() });
  },
);

// ─── POST /generate-from-layout/extract-data ─────────────────────────────────

router.post(
  '/generate-from-layout/extract-data',
  asyncHandler(async (req: Request, res: Response) => {
    const { layoutGraph } = req.body;
    if (!layoutGraph) {
      res.status(400).json({ error: 'layoutGraph is required' });
      return;
    }
    const data = getController().extractData(layoutGraph);
    res.json({ success: true, data });
  }),
);

// ─── POST /generate-from-layout/bindable-nodes ──────────────────────────────

router.post(
  '/generate-from-layout/bindable-nodes',
  asyncHandler(async (req: Request, res: Response) => {
    const { layoutGraph } = req.body;
    if (!layoutGraph) {
      res.status(400).json({ error: 'layoutGraph is required' });
      return;
    }
    const nodes = getController().getBindableNodes(layoutGraph);
    res.json({ success: true, data: nodes });
  }),
);

export default router;
