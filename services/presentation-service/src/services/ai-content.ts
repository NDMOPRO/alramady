import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

const MODEL = 'presentationAiContent';
const CACHE_PREFIX = 'ai-content';

interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  count(args: Record<string, unknown>): Promise<number>;
}

const model = (prisma as unknown as Record<string, PrismaDelegate>)[MODEL];

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId: string;
  contentType?: string;
  search?: string;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', userId, contentType, search } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = { userId };
  if (contentType) where.contentType = contentType;
  if (search) where.title = { contains: search, mode: 'insensitive' };

  const [data, total] = await Promise.all([
    model.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    model.count({ where }),
  ]);

  const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  await cacheSet(cacheKey, result, 300);
  logger.info('AI-content list fetched', { userId, total });
  return result;
}

export async function getById(id: string, userId: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const record = await model.findUnique({ where: { id } });
  if (!record || record.userId !== userId) throw new NotFoundError('AI-content');

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>, userId: string) {
  const record = await model.create({ data: { ...data, userId, status: 'generating' } });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('AI-content generation started', { id: record.id, userId, contentType: data.contentType });
  return record;
}

export async function update(id: string, data: Record<string, unknown>, userId: string) {
  const existing = await model.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('AI-content');

  const record = await model.update({ where: { id }, data });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('AI-content updated', { id, userId });
  return record;
}

export async function remove(id: string, userId: string) {
  const existing = await model.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('AI-content');

  await model.delete({ where: { id } });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('AI-content deleted', { id, userId });
  return { success: true };
}

export async function generate(id: string, userId: string) {
  const content = await getById(id, userId);
  logger.info('AI content generation triggered', { id, contentType: content.contentType });
  await model.update({ where: { id }, data: { status: 'processing' } });
  await cacheDel(`${CACHE_PREFIX}:${id}`);

  const { generateSlideContent } = await import('./ai-content-generator.service.js');
  const generated = await generateSlideContent(String(content.prompt || content.title || ''), {
    tone: ((content.tone as string) || 'formal') as any,
    language: (content.language as string) || 'ar',
    contentType: ((content.contentType as string) || 'slide') as any,
    targetAudience: content.targetAudience as string,
    industry: content.industry as string,
  });

  const updated = await model.update({
    where: { id },
    data: {
      status: 'completed',
      generatedContent: generated,
      completedAt: new Date(),
    },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  logger.info('AI content generation completed', { id });
  return { status: 'completed', contentId: id, content: generated };
}

export async function regenerate(id: string, userId: string, options?: Record<string, unknown>) {
  const content = await getById(id, userId);
  logger.info('AI content regeneration triggered', { id });

  const { generateSlideContent } = await import('./ai-content-generator.service.js');
  const generated = await generateSlideContent(String(content.prompt || content.title || ''), {
    tone: ((options?.tone as string) || (content.tone as string) || 'formal') as any,
    language: (options?.language as string) || (content.language as string) || 'ar',
    contentType: ((content.contentType as string) || 'slide') as any,
    targetAudience: (options?.targetAudience as string) || (content.targetAudience as string),
  });

  await model.update({
    where: { id },
    data: { generatedContent: generated, updatedAt: new Date() },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  return { status: 'regenerated', contentId: id, content: generated };
}

export async function refine(id: string, userId: string, feedback: string) {
  const content = await getById(id, userId);
  logger.info('AI content refinement triggered', { id, feedback });

  const { rewriteContent } = await import('./ai-content-generator.service.js');
  const refined = await rewriteContent(
    JSON.stringify(content.generatedContent || {}),
    { tone: 'formal' as const, language: (content.language as string) || 'ar', targetAudience: feedback, action: 'rewrite' as const }
  );

  await model.update({
    where: { id },
    data: { generatedContent: refined, updatedAt: new Date() },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  return { status: 'refined', contentId: id, content: refined };
}

export async function suggestImprovements(id: string, userId: string) {
  const content = await getById(id, userId);

  const { suggestContent } = await import('./ai-content-generator.service.js');
  const suggested = await suggestContent(
    JSON.stringify(content.generatedContent || {}),
    { language: (content.language as string) || 'ar' }
  );
  const suggestions = suggested.suggestions || [];

  return { contentId: id, suggestions, analyzedSlides: suggestions.length };
}
