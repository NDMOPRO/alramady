import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import {
  CanonicalPipelineOrchestrator,
  GeneratorType,
  OutputFormat,
} from '../services/canonical-pipeline-orchestrator.service.js';

const router = Router();

let orchestrator: CanonicalPipelineOrchestrator | null = null;

function getOrchestrator(): CanonicalPipelineOrchestrator {
  if (!orchestrator) {
    const prisma = new PrismaClient();
    orchestrator = new CanonicalPipelineOrchestrator(prisma);
  }
  return orchestrator;
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const executeSchema = z.object({
  layoutGraph: z.object({
    id: z.string(),
    version: z.string(),
    sourceType: z.enum(['image', 'pdf', 'html', 'docx', 'pptx', 'xlsx', 'screenshot']),
    sourceHash: z.string(),
    dimensions: z.object({ width: z.number().positive(), height: z.number().positive() }),
    dpi: z.number().positive(),
    pages: z.array(z.object({
      pageNumber: z.number(),
      dimensions: z.object({ width: z.number(), height: z.number() }),
      orientation: z.enum(['portrait', 'landscape']),
      backgroundColor: z.string(),
      rootNode: z.any(),
      readingOrder: z.array(z.string()),
    })).min(1),
    designTokens: z.any(),
    metadata: z.any(),
    sceneGraph: z.any(),
    createdAt: z.string(),
    processingTimeMs: z.number(),
  }),
  generator: z.enum(['dashboard', 'report', 'presentation', 'spreadsheet', 'docx']),
  outputFormat: z.enum(['html', 'pdf', 'pptx', 'xlsx', 'docx', 'png', 'svg']),
  options: z.object({
    preserveFonts: z.boolean().optional(),
    preserveColors: z.boolean().optional(),
    preserveSpacing: z.boolean().optional(),
    rtlSupport: z.boolean().optional(),
    quality: z.enum(['draft', 'standard', 'high']).optional(),
    pixelPerfectValidation: z.boolean().optional(),
    maxValidationIterations: z.number().optional(),
    locale: z.string().optional(),
  }).optional(),
});

// ─── Execute Pipeline ─────────────────────────────────────────────────────────

router.post(
  '/pipeline/execute',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = executeSchema.parse(req.body);

    const result = await getOrchestrator().execute({
      layoutGraph: parsed.layoutGraph as Record<string, unknown>,
      generator: parsed.generator as GeneratorType,
      outputFormat: parsed.outputFormat as OutputFormat,
      options: parsed.options as Record<string, unknown>,
    });

    res.json({
      success: true,
      data: {
        id: result.id,
        generator: result.generator,
        outputFormat: result.outputFormat,
        graphHash: result.graphHash,
        pageCount: result.pageCount,
        elementsRendered: result.elementsRendered,
        processingTimeMs: result.processingTimeMs,
        pixelValidation: result.pixelValidation,
        htmlLength: result.html.length,
        outputSize: result.outputBuffer?.length ?? 0,
      },
    });
  }),
);

// ─── List Generators ──────────────────────────────────────────────────────────

router.get(
  '/pipeline/generators',
  (_req: Request, res: Response) => {
    const generators = getOrchestrator().getGenerators();
    res.json({ success: true, data: generators });
  },
);

export default router;
