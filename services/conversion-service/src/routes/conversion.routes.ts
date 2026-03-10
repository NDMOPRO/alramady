import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { formatConverterService } from '../services/format-converter.service.js';
import { batchConverterService } from '../services/batch-converter.service.js';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();
const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 20,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'text/plain',
      'text/xml',
      'application/xml',
      'text/markdown',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/avif',
      'image/gif',
      'image/tiff',
      'application/octet-stream',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// --- Zod schemas ---

const markdownToHtmlSchema = z.object({
  markdown: z.string().min(1, 'Markdown content is required').max(5000000, 'Content too large'),
});

const htmlToPdfSchema = z.object({
  html: z.string().min(1, 'HTML content is required').max(5000000, 'Content too large'),
});

const imageConvertQuerySchema = z.object({
  targetFormat: z.enum(['png', 'jpg', 'webp', 'avif']),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  quality: z.coerce.number().int().min(1).max(100).optional(),
});

const jsonToCsvSchema = z.object({
  data: z.array(z.record(z.any())).min(1, 'Data array must have at least one element'),
});

const excelToCsvQuerySchema = z.object({
  sheetIndex: z.coerce.number().int().min(0).optional(),
});

const batchConvertSchema = z.object({
  targetFormat: z.string().min(1, 'Target format is required'),
});

const validateConversionSchema = z.object({
  sourceFormat: z.string().min(1),
  targetFormat: z.string().min(1),
  originalBase64: z.string().min(1),
  convertedBase64: z.string().min(1),
});

const createPipelineSchema = z.object({
  name: z.string().min(1, 'Pipeline name is required').max(200),
  steps: z.array(z.object({
    fromFormat: z.string().min(1),
    toFormat: z.string().min(1),
    options: z.record(z.any()).optional(),
  })).min(1, 'At least one step is required'),
});

// --- Helpers ---

function requireFile(req: Request, res: Response): boolean {
  if (!req.file) {
    res.status(400).json({
      success: false,
      error: 'File is required',
      code: 'FILE_MISSING',
    });
    return false;
  }
  return true;
}

function wrapAsync(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// --- Apply auth middleware to all routes ---
router.use(authMiddleware);

// --- POST /convert/pdf-to-word ---
router.post(
  '/convert/pdf-to-word',
  upload.single('file'),
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    if (!requireFile(req, res)) return;
    const tenantId = req.user!.organizationId || req.user!.userId || 'default';
    const userId = req.user!.userId || 'anonymous';

    logger.info('PDF to Word conversion request', { filename: req.file!.originalname, userId });

    const result = await formatConverterService.convertPDFtoWord(
      req.file!.buffer,
      req.file!.originalname,
      tenantId,
      userId
    );

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.outputFilename}"`,
      'Content-Length': String(result.buffer.length),
      'X-Job-Id': result.jobId,
    });
    res.send(result.buffer);
  })
);

// --- POST /convert/word-to-pdf ---
router.post(
  '/convert/word-to-pdf',
  upload.single('file'),
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    if (!requireFile(req, res)) return;
    const tenantId = req.user!.organizationId || req.user!.userId || 'default';
    const userId = req.user!.userId || 'anonymous';

    logger.info('Word to PDF conversion request', { filename: req.file!.originalname, userId });

    const result = await formatConverterService.convertWordToPDF(
      req.file!.buffer,
      req.file!.originalname,
      tenantId,
      userId
    );

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.outputFilename}"`,
      'Content-Length': String(result.buffer.length),
      'X-Job-Id': result.jobId,
    });
    res.send(result.buffer);
  })
);

// --- POST /convert/excel-to-pdf ---
router.post(
  '/convert/excel-to-pdf',
  upload.single('file'),
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    if (!requireFile(req, res)) return;
    const tenantId = req.user!.organizationId || req.user!.userId || 'default';
    const userId = req.user!.userId || 'anonymous';

    logger.info('Excel to PDF conversion request', { filename: req.file!.originalname, userId });

    const result = await formatConverterService.convertExcelToPDF(
      req.file!.buffer,
      req.file!.originalname,
      tenantId,
      userId
    );

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.outputFilename}"`,
      'Content-Length': String(result.buffer.length),
      'X-Job-Id': result.jobId,
    });
    res.send(result.buffer);
  })
);

// --- POST /convert/markdown-to-html ---
router.post(
  '/convert/markdown-to-html',
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const validated = markdownToHtmlSchema.parse(req.body);

    logger.info('Markdown to HTML conversion request', { inputLength: validated.markdown.length });

    const result = await formatConverterService.convertMarkdownToHTML(validated.markdown);

    res.status(200).json({
      success: true,
      data: {
        html: result.html,
        characterCount: result.characterCount,
      },
    });
  })
);

// --- POST /convert/html-to-pdf ---
router.post(
  '/convert/html-to-pdf',
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const validated = htmlToPdfSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.userId || 'default';
    const userId = req.user!.userId || 'anonymous';

    logger.info('HTML to PDF conversion request', { htmlLength: validated.html.length, userId });

    const result = await formatConverterService.convertHTMLtoPDF(
      validated.html,
      tenantId,
      userId
    );

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.outputFilename}"`,
      'Content-Length': String(result.buffer.length),
      'X-Job-Id': result.jobId,
    });
    res.send(result.buffer);
  })
);

// --- POST /convert/image ---
router.post(
  '/convert/image',
  upload.single('file'),
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    if (!requireFile(req, res)) return;

    const queryParams = imageConvertQuerySchema.parse(req.query);

    logger.info('Image conversion request', {
      filename: req.file!.originalname,
      targetFormat: queryParams.targetFormat,
      width: queryParams.width,
      height: queryParams.height,
      quality: queryParams.quality,
    });

    const result = await formatConverterService.convertImageFormat(
      req.file!.buffer,
      queryParams.targetFormat,
      {
        width: queryParams.width,
        height: queryParams.height,
        quality: queryParams.quality,
      }
    );

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.outputFilename}"`,
      'Content-Length': String(result.buffer.length),
      'X-Image-Input-Width': String(result.metadata.inputWidth),
      'X-Image-Input-Height': String(result.metadata.inputHeight),
      'X-Image-Output-Width': String(result.metadata.outputWidth),
      'X-Image-Output-Height': String(result.metadata.outputHeight),
    });
    res.send(result.buffer);
  })
);

// --- POST /convert/csv-to-excel ---
router.post(
  '/convert/csv-to-excel',
  upload.single('file'),
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    if (!requireFile(req, res)) return;

    logger.info('CSV to Excel conversion request', { filename: req.file!.originalname });

    const result = await formatConverterService.convertCSVtoExcel(
      req.file!.buffer,
      req.file!.originalname
    );

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.outputFilename}"`,
      'Content-Length': String(result.buffer.length),
    });
    res.send(result.buffer);
  })
);

// --- POST /convert/excel-to-csv ---
router.post(
  '/convert/excel-to-csv',
  upload.single('file'),
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    if (!requireFile(req, res)) return;

    const queryParams = excelToCsvQuerySchema.parse(req.query);

    logger.info('Excel to CSV conversion request', {
      filename: req.file!.originalname,
      sheetIndex: queryParams.sheetIndex,
    });

    const result = await formatConverterService.convertExcelToCSV(
      req.file!.buffer,
      queryParams.sheetIndex
    );

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.outputFilename}"`,
      'Content-Length': String(Buffer.byteLength(result.csv, 'utf-8')),
      'X-Row-Count': String(result.rowCount),
      'X-Column-Count': String(result.columnCount),
    });
    res.send(result.csv);
  })
);

// --- POST /convert/json-to-csv ---
router.post(
  '/convert/json-to-csv',
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const validated = jsonToCsvSchema.parse(req.body);

    logger.info('JSON to CSV conversion request', { rowCount: validated.data.length });

    const result = await formatConverterService.convertJSONtoCSV(validated.data);

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.outputFilename}"`,
      'Content-Length': String(Buffer.byteLength(result.csv, 'utf-8')),
      'X-Row-Count': String(result.rowCount),
      'X-Column-Count': String(result.columnCount),
    });
    res.send(result.csv);
  })
);

// --- POST /convert/xml-to-json ---
router.post(
  '/convert/xml-to-json',
  upload.single('file'),
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    if (!requireFile(req, res)) return;

    logger.info('XML to JSON conversion request', { filename: req.file!.originalname });

    const result = await formatConverterService.convertXMLtoJSON(req.file!.buffer);

    res.status(200).json({
      success: true,
      data: {
        json: result.json,
        outputFilename: result.outputFilename,
        mimeType: result.mimeType,
      },
    });
  })
);

// --- POST /batch/convert ---
router.post(
  '/batch/convert',
  upload.array('files', 20),
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: 'At least one file is required',
        code: 'FILES_MISSING',
      });
      return;
    }

    const validated = batchConvertSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.userId || 'default';
    const userId = req.user!.userId || 'anonymous';

    logger.info('Batch conversion request', {
      fileCount: files.length,
      targetFormat: validated.targetFormat,
      userId,
    });

    const fileInputs = files.map((f) => ({
      buffer: f.buffer,
      filename: f.originalname,
    }));

    const result = await batchConverterService.batchConvert(
      fileInputs,
      validated.targetFormat,
      tenantId,
      userId
    );

    res.status(200).json({
      success: true,
      data: {
        batchId: result.batchId,
        total: result.total,
        succeeded: result.succeeded,
        failed: result.failed,
        durationMs: result.durationMs,
        results: result.results.map((r) => ({
          filename: r.filename,
          status: r.status,
          outputFilename: r.outputFilename,
          mimeType: r.mimeType,
          error: r.error,
          durationMs: r.durationMs,
          outputSize: r.buffer ? r.buffer.length : undefined,
        })),
      },
    });
  })
);

// --- POST /batch/validate ---
router.post(
  '/batch/validate',
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const validated = validateConversionSchema.parse(req.body);

    logger.info('Conversion validation request', {
      sourceFormat: validated.sourceFormat,
      targetFormat: validated.targetFormat,
    });

    const originalBuffer = Buffer.from(validated.originalBase64, 'base64');
    const convertedBuffer = Buffer.from(validated.convertedBase64, 'base64');

    const result = await batchConverterService.validateConversion(
      originalBuffer,
      convertedBuffer,
      validated.sourceFormat,
      validated.targetFormat
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

// --- POST /pipeline ---
router.post(
  '/pipeline',
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const validated = createPipelineSchema.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.userId || 'default';
    const userId = req.user!.userId || 'anonymous';

    logger.info('Create pipeline request', {
      name: validated.name,
      stepCount: validated.steps.length,
      userId,
    });

    const result = await batchConverterService.createPipeline(
      validated.name,
      validated.steps,
      tenantId,
      userId
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  })
);

// --- POST /pipeline/:id/execute ---
router.post(
  '/pipeline/:id/execute',
  upload.single('file'),
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    if (!requireFile(req, res)) return;

    const pipelineId = req.params.id!;

    logger.info('Execute pipeline request', {
      pipelineId,
      filename: req.file!.originalname,
      fileSize: req.file!.buffer.length,
    });

    const result = await batchConverterService.executePipeline(
      pipelineId,
      req.file!.buffer,
      req.file!.originalname
    );

    res.set({
      'Content-Type': result.finalMimeType,
      'Content-Disposition': `attachment; filename="${result.finalFilename}"`,
      'Content-Length': String(result.finalBuffer.length),
      'X-Pipeline-Id': result.pipelineId,
      'X-Pipeline-Name': result.pipelineName,
      'X-Steps-Executed': String(result.stepsExecuted),
      'X-Total-Duration-Ms': String(result.totalDurationMs),
    });
    res.send(result.finalBuffer);
  })
);

// --- GET /jobs/:id ---
router.get(
  '/jobs/:id',
  wrapAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const jobId = req.params.id!;
    const tenantId = req.user!.organizationId || req.user!.userId || 'default';

    logger.info('Get conversion job request', { jobId, tenantId });

    const job = await prisma.conversionJob.findFirst({
      where: {
        id: jobId,
        tenantId,
      },
    });

    if (!job) {
      res.status(404).json({
        success: false,
        error: `Conversion job "${jobId}" not found`,
        code: 'JOB_NOT_FOUND',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: job.id,
        tenantId: job.tenantId,
        userId: job.userId,
        sourceFormat: job.sourceFormat,
        targetFormat: job.targetFormat,
        sourceFilename: job.sourceFilename,
        outputFilename: job.outputFilename,
        sourceSizeBytes: job.sourceSizeBytes,
        outputSizeBytes: job.outputSizeBytes,
        pageCount: job.pageCount,
        status: job.status,
        durationMs: job.durationMs,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  })
);

export default router;
