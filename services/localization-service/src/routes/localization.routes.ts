import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  SUPPORTED_LANGUAGES,
  detectLanguage,
  getLanguageInfo,
  getTranslationMemory,
  addToTranslationMemory,
  translateBatch,
  translateText,
  translateTextWithContext,
} from '../services/translation-engine.service.js';
import {
  applyRTL,
  handleBiDirectional,
  mirrorLayout,
  formatNumber,
  formatCurrency,
  formatDate,
  getHijriDate,
  getGregorianDate,
} from '../services/rtl-engine.service.js';
import {
  localizePresentation,
  localizeReport,
  localizeDashboard,
} from '../services/content-localization.service.js';
import {
  createGlossary,
  addTerm,
  enforceGlossary,
  listGlossaries,
  getGlossaryTerms,
} from '../services/glossary-manager.service.js';

const prisma = new PrismaClient();
const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function requireUserContext(req: Request): { userId: string; tenantId: string } {
  const userId = req.user!.userId;
  const tenantId = req.user!.organizationId || req.user!.tenantId;

  if (!userId || !tenantId) {
    throw new Error('Authenticated user and tenant context are required');
  }

  return { userId, tenantId };
}

function toLanguageEnum(langCode: string): string {
  return langCode.trim().slice(0, 2).toUpperCase();
}

async function persistTextJob(args: {
  createdById: string;
  sourceLanguage: string;
  targetLanguage: string;
  resourceType: 'TEMPLATE' | 'LIBRARY_ASSET';
  result: Record<string, unknown>;
}): Promise<string> {
  const jobId = randomUUID();
  const resourceId = randomUUID();

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO localization_jobs (
        id,
        created_by_id,
        resource_type,
        resource_id,
        source_language,
        target_language,
        status,
        progress,
        total_segments,
        translated_segments,
        result,
        engine,
        started_at,
        completed_at,
        duration_ms,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3::"ResourceType",
        $4::uuid,
        $5::"Language",
        $6::"Language",
        'COMPLETED'::"LocalizationJobStatus",
        100,
        $7,
        $7,
        $8::jsonb,
        'openai',
        NOW(),
        NOW(),
        0,
        NOW(),
        NOW()
      )
    `,
    jobId,
    args.createdById,
    args.resourceType,
    resourceId,
    toLanguageEnum(args.sourceLanguage),
    toLanguageEnum(args.targetLanguage),
    Number(args.result.totalSegments || 1),
    JSON.stringify(args.result)
  );

  return jobId;
}

function extractTextFromUpload(file: Express.Multer.File): { extractedText: string; detectedType: string } {
  const extension = file.originalname.split('.').pop()?.toLowerCase() || '';
  const mimeType = file.mimetype.toLowerCase();
  const textBuffer = file.buffer.toString('utf8');

  if (mimeType.startsWith('text/') || ['txt', 'md', 'csv'].includes(extension)) {
    return { extractedText: textBuffer, detectedType: extension || 'text' };
  }

  if (mimeType.includes('json') || extension === 'json') {
    const parsed = JSON.parse(textBuffer);
    return { extractedText: JSON.stringify(parsed, null, 2), detectedType: 'json' };
  }

  if (mimeType.includes('html') || ['html', 'htm'].includes(extension)) {
    const extractedText = textBuffer
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    return { extractedText, detectedType: 'html' };
  }

  throw new Error(`Unsupported document format for extraction: ${file.originalname}`);
}

type UploadedRequest = Request & {
  file?: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  };
};

function normalizeHistoryRow(row: {
  id: string;
  resourceType: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: string;
  result: unknown;
  createdAt: Date;
  completedAt: Date | null;
}) {
  const result = row.result && typeof row.result === 'object'
    ? row.result as Record<string, unknown>
    : {};
  const sourceText = String(result.sourceText ?? result.extractedText ?? '');
  const translatedText = String(result.translatedText ?? result.translatedContent ?? result.localizedTitle ?? '');
  const workflowType = String(result.workflowType ?? 'translation');

  return {
    id: row.id,
    workflowType,
    sourceText,
    translatedText,
    sourceLang: row.sourceLanguage.toLowerCase(),
    targetLang: row.targetLanguage.toLowerCase(),
    confidence: Number(result.confidence ?? 0.9),
    status: row.status.toLowerCase() === 'completed' ? 'completed' : row.status.toLowerCase(),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() || null,
    metadata: result,
  };
}

const translateTextSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  sourceLang: z.string().min(2).max(10),
  targetLang: z.string().min(2).max(10),
  glossaryId: z.string().uuid().optional(),
  domain: z.string().optional(),
  toneLevel: z.enum(['formal', 'executive', 'governmental', 'technical', 'neutral']).optional(),
  styleGuide: z.string().optional(),
  preserveLayout: z.boolean().optional(),
  formality: z.enum(['formal', 'informal', 'neutral']).optional(),
});

async function executeStructuredTranslation(req: Request, res: Response) {
  const body = translateTextSchema.parse(req.body);
  const { userId } = requireUserContext(req);
  const memoryMatches = await getTranslationMemory(body.sourceLang, body.targetLang, body.text);

  const translation = await translateTextWithContext(body.text, body.sourceLang, body.targetLang, {
    glossaryId: body.glossaryId,
    domain: body.domain,
    toneLevel: body.toneLevel || (body.formality === 'informal' ? 'neutral' : 'formal'),
    styleGuide: body.styleGuide,
    preserveLayout: body.preserveLayout,
  });

  const finalText = body.glossaryId
    ? (await enforceGlossary(translation.translatedText, body.glossaryId)).processedText
    : translation.translatedText;

  const lineBreaksPreserved = body.text.split('\n').length === finalText.split('\n').length;
  const jobId = await persistTextJob({
    createdById: userId,
    sourceLanguage: body.sourceLang,
    targetLanguage: body.targetLang,
    resourceType: 'TEMPLATE',
    result: {
      workflowType: 'text_translation',
      sourceText: body.text,
      translatedText: finalText,
      domain: body.domain || 'general',
      toneLevel: body.toneLevel || body.formality || 'formal',
      glossaryId: body.glossaryId || null,
      confidence: memoryMatches.length > 0 ? 0.99 : 0.92,
      memoryHits: memoryMatches.length,
      preserveLayout: body.preserveLayout !== false,
      visualPreservation: {
        lineBreaksPreserved,
        sourceParagraphs: body.text.split(/\n{2,}/).length,
        targetParagraphs: finalText.split(/\n{2,}/).length,
      },
    },
  });

  res.status(200).json({
    success: true,
    data: {
      id: jobId,
      sourceText: body.text,
      translatedText: finalText,
      sourceLang: body.sourceLang,
      targetLang: body.targetLang,
      confidence: memoryMatches.length > 0 ? 0.99 : 0.92,
      wordCount: body.text.trim().split(/\s+/).filter(Boolean).length,
      formality: body.formality || 'formal',
      status: 'completed',
      createdAt: new Date().toISOString(),
      contextApplied: true,
      memoryHits: memoryMatches.length,
    },
  });
}

async function executeDocumentTranslation(req: Request, res: Response) {
  const uploadRequest = req as UploadedRequest;
  if (!uploadRequest.file) {
    res.status(400).json({ success: false, error: 'File is required', code: 'MISSING_FILE' });
    return;
  }

  const { userId, tenantId } = requireUserContext(req);
  const sourceLang = String(req.body.sourceLang || 'auto');
  const targetLang = String(req.body.targetLang || 'ar');
  const glossaryId = typeof req.body.glossaryId === 'string' ? req.body.glossaryId : undefined;

  const { extractedText, detectedType } = extractTextFromUpload(uploadRequest.file as Express.Multer.File);
  const detectedLanguage = sourceLang === 'auto'
    ? await detectLanguage(extractedText)
    : { language: sourceLang, confidence: 1, script: 'Unknown' };
  const effectiveSourceLang = detectedLanguage.language.toLowerCase();

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO document_extractions (
        id,
        tenant_id,
        file_id,
        file_type,
        pages,
        full_text,
        languages,
        confidence,
        ocr_engine,
        processing_time_ms,
        created_at
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        $5::jsonb,
        $6,
        $7::varchar[],
        $8,
        'text-parser',
        0,
        NOW()
      )
    `,
    randomUUID(),
    tenantId,
    uploadRequest.file.originalname,
    detectedType,
    JSON.stringify([{ page: 1, content: extractedText }]),
    extractedText,
    [effectiveSourceLang],
    detectedLanguage.confidence || 0.9
  );

  const translated = await translateTextWithContext(extractedText, effectiveSourceLang, targetLang, {
    glossaryId,
    preserveLayout: true,
  });
  const translatedContent = glossaryId
    ? (await enforceGlossary(translated.translatedText, glossaryId)).processedText
    : translated.translatedText;

  const paragraphs = extractedText.split(/\n{2,}/).filter((item) => item.trim().length > 0).length;
  const documentResult = {
    workflowType: 'document_translation',
    fileName: uploadRequest.file.originalname,
    fileSize: uploadRequest.file.size,
    sourceText: extractedText,
    extractedText,
    translatedContent,
    detectedType,
    status: 'completed',
    paragraphsPreserved: paragraphs === translatedContent.split(/\n{2,}/).filter((item) => item.trim().length > 0).length,
    totalSegments: Math.max(paragraphs, 1),
  };

  const jobId = await persistTextJob({
    createdById: userId,
    sourceLanguage: effectiveSourceLang,
    targetLanguage: targetLang,
    resourceType: 'LIBRARY_ASSET',
    result: documentResult,
  });

  res.status(201).json({
    success: true,
    data: {
      id: jobId,
      fileName: uploadRequest.file.originalname,
      fileSize: uploadRequest.file.size,
      sourceLang: effectiveSourceLang,
      targetLang,
      status: 'completed',
      progress: 100,
      resultUrl: `/api/v1/localization/translate/document/${jobId}/download`,
      errorMessage: null,
      wordCount: extractedText.trim().split(/\s+/).filter(Boolean).length,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      extractedText,
    },
  });
}

router.post(
  '/translate',
  authMiddleware,
  asyncHandler(executeStructuredTranslation)
);

router.post(
  '/text/translate',
  authMiddleware,
  asyncHandler(executeStructuredTranslation)
);

router.post(
  '/translate/text',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = translateTextSchema.parse(req.body);
    const result = await translateTextWithContext(body.text, body.sourceLang, body.targetLang, {
      glossaryId: body.glossaryId,
      domain: body.domain,
      toneLevel: body.toneLevel,
      styleGuide: body.styleGuide,
      preserveLayout: body.preserveLayout,
    });
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/translate/document',
  authMiddleware,
  upload.single('file'),
  asyncHandler(executeDocumentTranslation)
);

router.post(
  '/documents/translate',
  authMiddleware,
  upload.single('file'),
  asyncHandler(executeDocumentTranslation)
);

router.get(
  '/translate/history',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = requireUserContext(req);
    const page = parseInt(String(req.query.page || '1'), 10);
    const limit = parseInt(String(req.query.limit || '20'), 10);
    const offset = (page - 1) * limit;

    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      resourceType: string;
      sourceLanguage: string;
      targetLanguage: string;
      status: string;
      result: unknown;
      createdAt: Date;
      completedAt: Date | null;
    }>>(
      `
        SELECT
          id::text AS id,
          resource_type::text AS "resourceType",
          source_language::text AS "sourceLanguage",
          target_language::text AS "targetLanguage",
          status::text AS status,
          result,
          created_at AS "createdAt",
          completed_at AS "completedAt"
        FROM localization_jobs
        WHERE created_by_id = $1::uuid
        ORDER BY created_at DESC
        OFFSET $2
        LIMIT $3
      `,
      userId,
      offset,
      limit
    );

    const totalRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `
        SELECT COUNT(*)::int AS total
        FROM localization_jobs
        WHERE created_by_id = $1::uuid
      `,
      userId
    );

    res.status(200).json({
      success: true,
      data: rows.map(normalizeHistoryRow),
      total: totalRows[0]?.total || 0,
    });
  })
);

router.get(
  '/translate/documents',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = requireUserContext(req);
    const page = parseInt(String(req.query.page || '1'), 10);
    const limit = parseInt(String(req.query.limit || '20'), 10);
    const offset = (page - 1) * limit;

    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      sourceLanguage: string;
      targetLanguage: string;
      status: string;
      result: unknown;
      createdAt: Date;
      completedAt: Date | null;
    }>>(
      `
        SELECT
          id::text AS id,
          source_language::text AS "sourceLanguage",
          target_language::text AS "targetLanguage",
          status::text AS status,
          result,
          created_at AS "createdAt",
          completed_at AS "completedAt"
        FROM localization_jobs
        WHERE created_by_id = $1::uuid
          AND resource_type = 'LIBRARY_ASSET'::"ResourceType"
        ORDER BY created_at DESC
        OFFSET $2
        LIMIT $3
      `,
      userId,
      offset,
      limit
    );

    const items = rows
      .map((row) => {
        const result = row.result && typeof row.result === 'object'
          ? row.result as Record<string, unknown>
          : {};
        if (String(result.workflowType) !== 'document_translation') {
          return null;
        }

        return {
          id: row.id,
          fileName: String(result.fileName ?? ''),
          fileSize: Number(result.fileSize ?? 0),
          sourceLang: row.sourceLanguage.toLowerCase(),
          targetLang: row.targetLanguage.toLowerCase(),
          status: row.status.toLowerCase() === 'completed' ? 'completed' : row.status.toLowerCase(),
          progress: 100,
          resultUrl: `/api/v1/localization/translate/document/${row.id}/download`,
          errorMessage: null,
          wordCount: Number(String(result.extractedText ?? '').trim().split(/\s+/).filter(Boolean).length),
          createdAt: row.createdAt.toISOString(),
          completedAt: row.completedAt?.toISOString() || row.createdAt.toISOString(),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    res.status(200).json({ success: true, data: items, total: items.length });
  })
);

router.get(
  '/translate/document/:id/download',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ result: unknown }>>(
      `
        SELECT result
        FROM localization_jobs
        WHERE id = $1::uuid
        LIMIT 1
      `,
      req.params.id!
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, error: 'Translated document not found', code: 'NOT_FOUND' });
      return;
    }

    const result = rows[0].result && typeof rows[0].result === 'object'
      ? rows[0].result as Record<string, unknown>
      : {};
    const content = String(result.translatedContent ?? result.translatedText ?? '');
    const filename = String(result.fileName ?? 'translation.txt').replace(/\.[^.]+$/, '') + '.txt';

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  })
);

router.post(
  '/translate/batch',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({
      texts: z.array(z.string().min(1)).min(1),
      sourceLang: z.string().min(2).max(10),
      targetLang: z.string().min(2).max(10),
    }).parse(req.body);

    const result = await translateBatch(body.texts, body.sourceLang, body.targetLang);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/translate/detect',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({ text: z.string().min(1) }).parse(req.body);
    const result = await detectLanguage(body.text);
    res.status(200).json({ success: true, data: result });
  })
);

router.get(
  '/translation-memory',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const query = z.object({
      sourceLang: z.string().min(2).max(10),
      targetLang: z.string().min(2).max(10),
      text: z.string().min(1),
    }).parse(req.query);
    const result = await getTranslationMemory(query.sourceLang, query.targetLang, query.text);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/translation-memory',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({
      source: z.string().min(1),
      target: z.string().min(1),
      sourceLang: z.string().min(2).max(10),
      targetLang: z.string().min(2).max(10),
    }).parse(req.body);

    const result = await addToTranslationMemory(body.source, body.target, body.sourceLang, body.targetLang);
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/rtl/apply',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({ content: z.string().min(1) }).parse(req.body);
    res.status(200).json({ success: true, data: { content: applyRTL(body.content) } });
  })
);

router.post(
  '/rtl/bidi',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({ text: z.string().min(1) }).parse(req.body);
    res.status(200).json({ success: true, data: { text: handleBiDirectional(body.text) } });
  })
);

router.post(
  '/rtl/mirror-layout',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({ layout: z.record(z.any()) }).parse(req.body);
    res.status(200).json({ success: true, data: { layout: mirrorLayout(body.layout) } });
  })
);

router.post(
  '/cultural/format',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({
      value: z.string().min(1),
      type: z.string().min(1),
      locale: z.string().min(2).max(10),
      currencyCode: z.string().length(3).optional(),
    }).parse(req.body);

    let formatted: string;
    const numericValue = Number(body.value);
    if (body.type === 'currency') {
      formatted = formatCurrency(numericValue, body.currencyCode || 'SAR', body.locale);
    } else if (body.type === 'date') {
      formatted = formatDate(body.value, 'YYYY/MM/DD', body.locale);
    } else {
      formatted = formatNumber(numericValue, body.locale);
    }

    res.status(200).json({
      success: true,
      data: {
        original: body.value,
        formatted,
        type: body.type,
        locale: body.locale,
      },
    });
  })
);

router.post(
  '/cultural/hijri',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({ date: z.string().min(1) }).parse(req.body);
    const date = new Date(body.date);
    const hijri = getHijriDate(date);

    res.status(200).json({
      success: true,
      data: {
        gregorian: body.date,
        hijri: `${hijri.day} ${hijri.monthName} ${hijri.year}`,
        hijriDay: hijri.day,
        hijriMonth: hijri.month,
        hijriMonthName: hijri.monthName,
        hijriYear: hijri.year,
        dayOfWeek: date.toLocaleDateString('ar-SA', { weekday: 'long' }),
      },
    });
  })
);

router.get(
  '/calendar/hijri',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const query = z.object({ date: z.string().min(1) }).parse(req.query);
    const date = new Date(query.date);
    const hijri = getHijriDate(date);
    res.status(200).json({ success: true, data: { ...hijri, gregorianInput: query.date } });
  })
);

router.get(
  '/calendar/gregorian',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const query = z.object({
      year: z.string(),
      month: z.string(),
      day: z.string(),
    }).parse(req.query);
    const result = getGregorianDate(parseInt(query.year, 10), parseInt(query.month, 10), parseInt(query.day, 10));
    res.status(200).json({ success: true, data: result });
  })
);

router.get(
  '/languages',
  authMiddleware,
  asyncHandler(async (_req: Request, res: Response) => {
    const data = SUPPORTED_LANGUAGES.map((code) => {
      const info = getLanguageInfo(code);
      return { code, name: info.name, nameAr: info.nativeName, rtl: info.rtl };
    });
    res.status(200).json({ success: true, data });
  })
);

router.post(
  '/localize/presentation/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({ targetLocale: z.string().min(2).max(10) }).parse(req.body);
    const { userId, tenantId } = requireUserContext(req);
    const result = await localizePresentation(req.params.id!, body.targetLocale, tenantId, userId);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/localize/report/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({ targetLocale: z.string().min(2).max(10) }).parse(req.body);
    const { userId, tenantId } = requireUserContext(req);
    const result = await localizeReport(req.params.id!, body.targetLocale, tenantId, userId);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/localize/dashboard/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({ targetLocale: z.string().min(2).max(10) }).parse(req.body);
    const { userId, tenantId } = requireUserContext(req);
    const result = await localizeDashboard(req.params.id!, body.targetLocale, tenantId, userId);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/glossaries',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({
      name: z.string().min(1).max(255),
      sourceLang: z.string().min(2).max(10),
      targetLang: z.string().min(2).max(10),
      domain: z.string().optional(),
    }).parse(req.body);
    const { userId, tenantId } = requireUserContext(req);
    const result = await createGlossary(body.name, body.sourceLang, body.targetLang, tenantId, userId, body.domain);
    res.status(201).json({ success: true, data: result });
  })
);

router.get(
  '/glossaries',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = requireUserContext(req);
    const result = await listGlossaries(tenantId);
    res.status(200).json({ success: true, data: result });
  })
);

router.get(
  '/glossaries/:id/terms',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await getGlossaryTerms(req.params.id!, typeof req.query.search === 'string' ? req.query.search : undefined);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/glossaries/:id/terms',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({
      source: z.string().min(1),
      target: z.string().min(1),
      context: z.string().optional(),
    }).parse(req.body);

    const result = await addTerm(req.params.id!, body.source, body.target, body.context);
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/glossaries/:id/enforce',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({ text: z.string().min(1) }).parse(req.body);
    const result = await enforceGlossary(body.text, req.params.id!);
    res.status(200).json({ success: true, data: result });
  })
);

router.get(
  '/glossary',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = requireUserContext(req);
    const glossaries = await listGlossaries(tenantId);
    const glossaryId = typeof req.query.glossaryId === 'string'
      ? req.query.glossaryId
      : glossaries[0]?.id;

    if (!glossaryId) {
      res.status(200).json({ success: true, data: [], total: 0 });
      return;
    }

    const terms = await getGlossaryTerms(glossaryId, typeof req.query.search === 'string' ? req.query.search : undefined);
    res.status(200).json({
      success: true,
      data: terms.map((term) => ({
        id: term.id,
        sourceTerm: term.source,
        targetTerm: term.target,
        sourceLang: glossaries.find((glossary) => glossary.id === glossaryId)?.sourceLang || 'en',
        targetLang: glossaries.find((glossary) => glossary.id === glossaryId)?.targetLang || 'ar',
        domain: glossaries.find((glossary) => glossary.id === glossaryId)?.status || '',
        notes: term.context || '',
        approved: term.status === 'approved',
        createdAt: term.createdAt.toISOString(),
        updatedAt: term.createdAt.toISOString(),
      })),
      total: terms.length,
    });
  })
);

export default router;
