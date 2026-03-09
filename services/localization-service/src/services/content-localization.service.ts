import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import { randomUUID } from 'crypto';
import { translateBatch, translateText } from './translation-engine.service.js';
import { applyRTL, mirrorLayout, formatNumber, formatDate, formatCurrency } from './rtl-engine.service.js';

const prisma = new PrismaClient();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'content-localization' },
  transports: [new winston.transports.Console()],
});

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi'];

function isRtlLocale(locale: string): boolean {
  const code = locale.split('-')[0].split('_')[0].toLowerCase();
  return RTL_LANGUAGES.includes(code);
}

function extractLanguage(locale: string): string {
  return locale.split('-')[0].split('_')[0].toLowerCase();
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  if (value && typeof value === 'object') {
    return value as T;
  }

  return fallback;
}

async function persistLocalizationJob(args: {
  resourceType: 'PRESENTATION' | 'REPORT' | 'DASHBOARD';
  resourceId: string;
  createdById: string;
  sourceLanguage: string;
  targetLanguage: string;
  result: Record<string, unknown>;
  qualityScore?: number;
}): Promise<string> {
  const jobId = randomUUID();

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
    args.resourceId,
    args.sourceLanguage.toUpperCase(),
    args.targetLanguage.toUpperCase(),
    Number(args.result.totalSegments || 0),
    JSON.stringify({
      ...args.result,
      qualityScore: args.qualityScore ?? null,
    })
  );

  return jobId;
}

export async function localizePresentation(
  presId: string,
  targetLocale: string,
  tenantId: string,
  userId: string
): Promise<{
  presentationId: string;
  locale: string;
  slidesProcessed: number;
  textsTranslated: number;
  layoutMirrored: boolean;
  jobId: string;
}> {
  logger.info('localizePresentation called', { presId, targetLocale, tenantId });

  const presentations = await prisma.$queryRawUnsafe<Array<{
    id: string;
    name: string;
    language: string;
    theme: unknown;
  }>>(
    `
      SELECT id::text AS id, name, language::text AS language, theme
      FROM presentations
      WHERE id = $1::uuid
      LIMIT 1
    `,
    presId
  );

  if (presentations.length === 0) {
    throw new Error(`Presentation with id '${presId}' not found`);
  }

  const slides = await prisma.$queryRawUnsafe<Array<{
    id: string;
    slideIndex: number;
    layout: string;
    content: string;
    notes: string | null;
  }>>(
    `
      SELECT
        id::text AS id,
        slide_index AS "slideIndex",
        layout,
        content,
        notes
      FROM slides
      WHERE presentation_id = $1::uuid
      ORDER BY slide_index ASC
    `,
    presId
  );

  const sourceLang = presentations[0].language?.toLowerCase() || 'en';
  const targetLang = extractLanguage(targetLocale);
  const rtl = isRtlLocale(targetLocale);
  const localizedSlides: Array<Record<string, unknown>> = [];
  let textsTranslated = 0;

  for (const slide of slides) {
    const content = parseJsonValue<Record<string, unknown>>(slide.content, {});
    const textFields = ['title', 'subtitle', 'body', 'leftContent', 'rightContent'];
    const texts = textFields
      .map((field) => content[field])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    const translatedBatch = texts.length > 0
      ? await translateBatch(texts, sourceLang, targetLang)
      : { translations: [] };

    let batchIndex = 0;
    const localizedContent = { ...content };
    for (const field of textFields) {
      const value = content[field];
      if (typeof value === 'string' && value.trim().length > 0) {
        const translated = translatedBatch.translations[batchIndex]?.translated || value;
        localizedContent[field] = rtl ? applyRTL(translated) : translated;
        batchIndex += 1;
        textsTranslated += 1;
      }
    }

    if (typeof slide.notes === 'string' && slide.notes.trim().length > 0) {
      const translatedNotes = await translateText(slide.notes, sourceLang, targetLang);
      localizedContent.notes = rtl ? applyRTL(translatedNotes.translatedText) : translatedNotes.translatedText;
      textsTranslated += 1;
    }

    const layoutConfig = parseJsonValue<Record<string, unknown>>(content.layout, {});

    localizedSlides.push({
      id: slide.id,
      slideIndex: slide.slideIndex,
      layout: slide.layout,
      content: {
        ...localizedContent,
        layout: rtl ? mirrorLayout(layoutConfig) : layoutConfig,
      },
    });
  }

  const localizedTitle = await translateText(presentations[0].name, sourceLang, targetLang);

  const jobId = await persistLocalizationJob({
    resourceType: 'PRESENTATION',
    resourceId: presId,
    createdById: userId,
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
    result: {
      localizedTitle: rtl ? applyRTL(localizedTitle.translatedText) : localizedTitle.translatedText,
      localizedSlides,
      locale: targetLocale,
      slidesProcessed: slides.length,
      textsTranslated,
      totalSegments: textsTranslated,
      visualPreservation: {
        themePreserved: true,
        layoutMirrored: rtl,
        slideCount: slides.length,
      },
    },
  });

  return {
    presentationId: presId,
    locale: targetLocale,
    slidesProcessed: slides.length,
    textsTranslated,
    layoutMirrored: rtl,
    jobId,
  };
}

export async function localizeReport(
  reportId: string,
  targetLocale: string,
  _tenantId: string,
  userId: string
): Promise<{
  reportId: string;
  locale: string;
  sectionsProcessed: number;
  numbersFormatted: number;
  datesFormatted: number;
  jobId: string;
}> {
  logger.info('localizeReport called', { reportId, targetLocale });

  const reports = await prisma.$queryRawUnsafe<Array<{
    id: string;
    name: string;
    description: string | null;
    language: string;
    content: unknown;
    layout: unknown;
    theme: unknown;
  }>>(
    `
      SELECT
        id::text AS id,
        name,
        description,
        language::text AS language,
        content,
        layout,
        theme
      FROM report_definitions
      WHERE id = $1::uuid
      LIMIT 1
    `,
    reportId
  );

  if (reports.length === 0) {
    throw new Error(`Report with id '${reportId}' not found`);
  }

  const report = reports[0];
  const sourceLang = report.language?.toLowerCase() || 'en';
  const targetLang = extractLanguage(targetLocale);
  const rtl = isRtlLocale(targetLocale);
  const parsedContent = parseJsonValue<unknown>(report.content, []);
  const sections = Array.isArray(parsedContent)
    ? parsedContent as Array<Record<string, unknown>>
    : (
      parsedContent &&
      typeof parsedContent === 'object' &&
      Array.isArray((parsedContent as { sections?: unknown }).sections)
        ? (parsedContent as { sections: Array<Record<string, unknown>> }).sections
        : []
    );

  let numbersFormatted = 0;
  let datesFormatted = 0;
  const localizedSections: Array<Record<string, unknown>> = [];

  for (const section of sections) {
    const localizedSection: Record<string, unknown> = { ...section };

    for (const [key, value] of Object.entries(section)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        const translated = await translateText(value, sourceLang, targetLang);
        localizedSection[key] = rtl ? applyRTL(translated.translatedText) : translated.translatedText;
      } else if (typeof value === 'number') {
        localizedSection[key] = formatNumber(value, targetLocale);
        numbersFormatted += 1;
      } else if (Array.isArray(value)) {
        localizedSection[key] = value;
      } else if (value && typeof value === 'object') {
        localizedSection[key] = value;
      }

      if (typeof value === 'string' && !Number.isNaN(Date.parse(value)) && value.length >= 8) {
        localizedSection[key] = formatDate(value, 'YYYY/MM/DD', targetLocale);
        datesFormatted += 1;
      }
    }

    localizedSections.push(localizedSection);
  }

  const localizedName = await translateText(report.name, sourceLang, targetLang);

  const jobId = await persistLocalizationJob({
    resourceType: 'REPORT',
    resourceId: reportId,
    createdById: userId,
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
    result: {
      localizedTitle: rtl ? applyRTL(localizedName.translatedText) : localizedName.translatedText,
      localizedSections,
      locale: targetLocale,
      sectionsProcessed: localizedSections.length,
      numbersFormatted,
      datesFormatted,
      totalSegments: localizedSections.length,
      visualPreservation: {
        preservedSectionCount: localizedSections.length,
        rtlApplied: rtl,
      },
    },
  });

  return {
    reportId,
    locale: targetLocale,
    sectionsProcessed: localizedSections.length,
    numbersFormatted,
    datesFormatted,
    jobId,
  };
}

export async function localizeDashboard(
  dashboardId: string,
  targetLocale: string,
  _tenantId: string,
  userId: string
): Promise<{
  dashboardId: string;
  locale: string;
  widgetsProcessed: number;
  labelsTranslated: number;
  numbersFormatted: number;
  jobId: string;
}> {
  logger.info('localizeDashboard called', { dashboardId, targetLocale });

  const dashboards = await prisma.$queryRawUnsafe<Array<{
    id: string;
    name: string;
    description: string | null;
  }>>(
    `
      SELECT id::text AS id, name, description
      FROM dashboards
      WHERE id = $1::uuid
      LIMIT 1
    `,
    dashboardId
  );

  if (dashboards.length === 0) {
    throw new Error(`Dashboard with id '${dashboardId}' not found`);
  }

  const widgets = await prisma.$queryRawUnsafe<Array<{
    id: string;
    title: string;
    description: string | null;
    config: unknown;
    position: unknown;
    size: unknown;
    style: unknown;
  }>>(
    `
      SELECT
        id::text AS id,
        title,
        description,
        config,
        position,
        size,
        style
      FROM dashboard_widgets
      WHERE dashboard_id = $1::uuid
      ORDER BY sort_order ASC, created_at ASC
    `,
    dashboardId
  );

  const targetLang = extractLanguage(targetLocale);
  const rtl = isRtlLocale(targetLocale);
  let labelsTranslated = 0;
  let numbersFormatted = 0;

  const localizedWidgets = [];
  for (const widget of widgets) {
    const translatedTitle = await translateText(widget.title, 'en', targetLang);
    const translatedDescription = widget.description
      ? await translateText(widget.description, 'en', targetLang)
      : null;

    const config = parseJsonValue<Record<string, unknown>>(widget.config, {});
    const style = parseJsonValue<Record<string, unknown>>(widget.style, {});
    const localizedConfig: Record<string, unknown> = { ...config };

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        const translated = await translateText(value, 'en', targetLang);
        localizedConfig[key] = rtl ? applyRTL(translated.translatedText) : translated.translatedText;
        labelsTranslated += 1;
      } else if (typeof value === 'number') {
        localizedConfig[`${key}Formatted`] = formatNumber(value, targetLocale);
        numbersFormatted += 1;
      } else if (value && typeof value === 'object') {
        localizedConfig[key] = value;
      }
    }

    if (typeof localizedConfig.currency === 'string' && typeof localizedConfig.value === 'number') {
      localizedConfig.formattedValue = formatCurrency(localizedConfig.value, localizedConfig.currency, targetLocale);
      numbersFormatted += 1;
    }

    localizedWidgets.push({
      id: widget.id,
      title: rtl ? applyRTL(translatedTitle.translatedText) : translatedTitle.translatedText,
      description: translatedDescription ? (rtl ? applyRTL(translatedDescription.translatedText) : translatedDescription.translatedText) : null,
      config: localizedConfig,
      position: parseJsonValue<Record<string, unknown>>(widget.position, {}),
      size: parseJsonValue<Record<string, unknown>>(widget.size, {}),
      style: rtl ? mirrorLayout(style) : style,
    });

    labelsTranslated += 1;
    if (widget.description) {
      labelsTranslated += 1;
    }
  }

  const dashboardTitle = await translateText(dashboards[0].name, 'en', targetLang);

  const jobId = await persistLocalizationJob({
    resourceType: 'DASHBOARD',
    resourceId: dashboardId,
    createdById: userId,
    sourceLanguage: 'en',
    targetLanguage: targetLang,
    result: {
      localizedTitle: rtl ? applyRTL(dashboardTitle.translatedText) : dashboardTitle.translatedText,
      localizedWidgets,
      locale: targetLocale,
      widgetsProcessed: widgets.length,
      labelsTranslated,
      numbersFormatted,
      totalSegments: widgets.length,
      visualPreservation: {
        layoutMirrored: rtl,
        widgetCount: widgets.length,
      },
    },
  });

  return {
    dashboardId,
    locale: targetLocale,
    widgetsProcessed: widgets.length,
    labelsTranslated,
    numbersFormatted,
    jobId,
  };
}
