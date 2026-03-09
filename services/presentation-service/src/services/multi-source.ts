import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

const MODEL = 'presentationMultiSource';
const CACHE_PREFIX = 'multi-source';

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
  sourceType?: string;
  search?: string;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', userId, sourceType, search } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = { userId };
  if (sourceType) where.sourceType = sourceType;
  if (search) where.name = { contains: search, mode: 'insensitive' };

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
  logger.info('Multi-source list fetched', { userId, total });
  return result;
}

export async function getById(id: string, userId: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const record = await model.findUnique({ where: { id } });
  if (!record || record.userId !== userId) throw new NotFoundError('Multi-source');

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>, userId: string) {
  const record = await model.create({ data: { ...data, userId } });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Multi-source created', { id: record.id, userId });
  return record;
}

export async function update(id: string, data: Record<string, unknown>, userId: string) {
  const existing = await model.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Multi-source');

  const record = await model.update({ where: { id }, data });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Multi-source updated', { id, userId });
  return record;
}

export async function remove(id: string, userId: string) {
  const existing = await model.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Multi-source');

  await model.delete({ where: { id } });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Multi-source deleted', { id, userId });
  return { success: true };
}

export async function importFromSource(id: string, userId: string) {
  const source = await getById(id, userId);
  const { processSource, createPresentationFromSource } = await import('./source-processor.service.js');

  const sourceInput = {
    type: source.sourceType as 'text' | 'pdf' | 'word' | 'url' | 'email' | 'csv' | 'json',
    content: source.content,
    filePath: source.filePath,
    url: source.url,
    metadata: source.metadata || {},
  };

  await processSource(sourceInput);

  const presentation = await createPresentationFromSource(
    sourceInput,
    { language: source.language || 'ar', slideCount: source.slideCount, style: source.style },
    source.tenantId || '',
    userId,
  );

  await model.update({
    where: { id },
    data: { status: 'imported', lastImportAt: new Date(), importedPresentationId: presentation.id },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  logger.info('Import completed from multi-source', { id, sourceType: source.sourceType, presentationId: presentation.id });
  return { status: 'imported', sourceId: id, sourceType: source.sourceType, presentationId: presentation.id };
}

export async function syncSource(id: string, userId: string) {
  const source = await getById(id, userId);
  await model.update({
    where: { id },
    data: { syncStatus: 'syncing', lastSyncAt: new Date() },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);

  const result = await importFromSource(id, userId);

  await model.update({
    where: { id },
    data: { syncStatus: 'synced', lastSyncAt: new Date() },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  logger.info('Sync completed for multi-source', { id });
  return { status: 'synced', sourceId: id, lastSync: new Date().toISOString(), presentationId: result.presentationId };
}

export async function previewSource(id: string, userId: string) {
  const source = await getById(id, userId);
  const { processSource, suggestPresentationStructure } = await import('./source-processor.service.js');

  const processed = await processSource({
    type: source.sourceType as 'text' | 'pdf' | 'word' | 'url' | 'email' | 'csv' | 'json',
    content: source.content,
    filePath: source.filePath,
    url: source.url,
    metadata: source.metadata || {},
  });

  const structure = await suggestPresentationStructure(processed.title || '', JSON.stringify(processed.sections || []));

  return {
    sourceId: id,
    preview: { slides: structure.slides || [], metadata: processed.metadata },
    sourceType: source.sourceType,
    extractedTitle: processed.title,
    sections: processed.sections,
  };
}
