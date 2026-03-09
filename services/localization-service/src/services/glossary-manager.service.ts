import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'glossary-manager' },
  transports: [new winston.transports.Console()],
});

export async function createGlossary(
  name: string,
  sourceLang: string,
  targetLang: string,
  tenantId: string,
  userId: string,
  domain?: string
): Promise<{ id: string; name: string; sourceLang: string; targetLang: string; termCount: number; createdAt: Date }> {
  logger.info('createGlossary called', { name, sourceLang, targetLang, tenantId, domain });

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Glossary name must not be empty');
  }

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      SELECT id
      FROM glossaries
      WHERE tenant_id = $1
        AND lower(name) = lower($2)
      LIMIT 1
    `,
    tenantId,
    trimmedName
  );

  if (existing.length > 0) {
    throw new Error(`Glossary '${trimmedName}' already exists in this tenant`);
  }

  const glossaryId = randomUUID();
  const inserted = await prisma.$queryRawUnsafe<Array<{ createdAt: Date }>>(
    `
      INSERT INTO glossaries (
        id,
        name,
        description,
        source_language,
        target_language,
        tenant_id,
        created_by,
        status,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        'active',
        NOW(),
        NOW()
      )
      RETURNING created_at AS "createdAt"
    `,
    glossaryId,
    trimmedName,
    domain ? `${domain} glossary` : `Terminology set for ${sourceLang.toLowerCase()} to ${targetLang.toLowerCase()}`,
    sourceLang.toLowerCase(),
    targetLang.toLowerCase(),
    tenantId,
    userId
  );

  return {
    id: glossaryId,
    name: trimmedName,
    sourceLang: sourceLang.toLowerCase(),
    targetLang: targetLang.toLowerCase(),
    termCount: 0,
    createdAt: inserted[0].createdAt,
  };
}

export async function addTerm(
  glossaryId: string,
  source: string,
  target: string,
  context?: string
): Promise<{ id: string; glossaryId: string; source: string; target: string; context: string | null; createdAt: Date }> {
  logger.info('addTerm called', { glossaryId, source, target });

  const trimmedSource = source.trim();
  const trimmedTarget = target.trim();
  const trimmedContext = context?.trim() || null;

  if (!trimmedSource || !trimmedTarget) {
    throw new Error('Source term and target term must not be empty');
  }

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string; createdAt: Date }>>(
    `
      SELECT id, created_at AS "createdAt"
      FROM glossary_terms
      WHERE glossary_id = $1
        AND lower(term) = lower($2)
      LIMIT 1
    `,
    glossaryId,
    trimmedSource
  );

  const translations = JSON.stringify({ default: trimmedTarget });

  if (existing.length > 0) {
    await prisma.$executeRawUnsafe(
      `
        UPDATE glossary_terms
        SET translations = $1::jsonb,
            context = $2,
            notes = $2,
            is_approved = true,
            updated_at = NOW()
        WHERE id = $3
      `,
      translations,
      trimmedContext,
      existing[0].id
    );

    return {
      id: existing[0].id,
      glossaryId,
      source: trimmedSource,
      target: trimmedTarget,
      context: trimmedContext,
      createdAt: existing[0].createdAt,
    };
  }

  const termId = randomUUID();
  const inserted = await prisma.$queryRawUnsafe<Array<{ createdAt: Date }>>(
    `
      INSERT INTO glossary_terms (
        id,
        glossary_id,
        term,
        definition,
        translations,
        notes,
        context,
        is_approved,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::jsonb,
        $6,
        $6,
        true,
        NOW(),
        NOW()
      )
      RETURNING created_at AS "createdAt"
    `,
    termId,
    glossaryId,
    trimmedSource,
    trimmedContext || trimmedTarget,
    translations,
    trimmedContext
  );

  return {
    id: termId,
    glossaryId,
    source: trimmedSource,
    target: trimmedTarget,
    context: trimmedContext,
    createdAt: inserted[0].createdAt,
  };
}

export async function enforceGlossary(
  text: string,
  glossaryId: string
): Promise<{ processedText: string; replacementsCount: number; replacements: Array<{ source: string; target: string; positions: number[] }> }> {
  logger.info('enforceGlossary called', { glossaryId, textLength: text.length });

  const terms = await prisma.$queryRawUnsafe<Array<{
    term: string;
    translations: unknown;
  }>>(
    `
      SELECT term, translations
      FROM glossary_terms
      WHERE glossary_id = $1
        AND is_approved = true
      ORDER BY length(term) DESC
    `,
    glossaryId
  );

  let processedText = text;
  const replacements: Array<{ source: string; target: string; positions: number[] }> = [];

  for (const termRow of terms) {
    const translations = termRow.translations && typeof termRow.translations === 'object'
      ? termRow.translations as Record<string, string>
      : {};
    const replacement = translations.default || Object.values(translations)[0];

    if (!replacement) {
      continue;
    }

    const escaped = termRow.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const positions: number[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(processedText)) !== null) {
      positions.push(match.index);
    }

    if (positions.length > 0) {
      processedText = processedText.replace(regex, replacement);
      replacements.push({ source: termRow.term, target: replacement, positions });
    }
  }

  return {
    processedText,
    replacementsCount: replacements.reduce((total, item) => total + item.positions.length, 0),
    replacements,
  };
}

export async function listGlossaries(
  tenantId: string
): Promise<Array<{ id: string; name: string; sourceLang: string; targetLang: string; termCount: number; status: string; createdAt: Date }>> {
  logger.info('listGlossaries called', { tenantId });

  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    name: string;
    sourceLanguage: string | null;
    targetLanguage: string | null;
    status: string | null;
    termCount: number | null;
    createdAt: Date;
  }>>(
    `
      SELECT
        g.id,
        g.name,
        g.source_language AS "sourceLanguage",
        g.target_language AS "targetLanguage",
        g.status,
        g.created_at AS "createdAt",
        (
          SELECT COUNT(*)
          FROM glossary_terms gt
          WHERE gt.glossary_id = g.id
        )::int AS "termCount"
      FROM glossaries g
      WHERE g.tenant_id = $1
      ORDER BY g.created_at DESC
    `,
    tenantId
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sourceLang: row.sourceLanguage || 'en',
    targetLang: row.targetLanguage || 'ar',
    termCount: row.termCount || 0,
    status: row.status || 'active',
    createdAt: row.createdAt,
  }));
}

export async function getGlossaryTerms(
  glossaryId: string,
  search?: string
): Promise<Array<{ id: string; source: string; target: string; context: string | null; status: string; createdAt: Date }>> {
  logger.info('getGlossaryTerms called', { glossaryId, search });

  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    term: string;
    translations: unknown;
    context: string | null;
    isApproved: boolean;
    createdAt: Date;
  }>>(
    `
      SELECT
        id,
        term,
        translations,
        context,
        is_approved AS "isApproved",
        created_at AS "createdAt"
      FROM glossary_terms
      WHERE glossary_id = $1
        AND ($2::text IS NULL OR term ILIKE $3 OR context ILIKE $3 OR notes ILIKE $3)
      ORDER BY term ASC
    `,
    glossaryId,
    search ?? null,
    search ? `%${search}%` : null
  );

  return rows.map((row) => {
    const translations = row.translations && typeof row.translations === 'object'
      ? row.translations as Record<string, string>
      : {};

    return {
      id: row.id,
      source: row.term,
      target: translations.default || Object.values(translations)[0] || '',
      context: row.context,
      status: row.isApproved ? 'approved' : 'pending',
      createdAt: row.createdAt,
    };
  });
}
