import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

const CACHE_PREFIX = 'template:themes';
const CACHE_TTL = 300;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  category?: string;
  type?: string;
  industry?: string;
  locale?: string;
  isPremium?: boolean;
  isPublished?: boolean;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', search, category, type, industry, locale, isPremium, isPublished } = params;
  const skip = (page - 1) * limit;

  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) {
    logger.debug('Cache hit for templates list');
    return cached;
  }

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { tags: { hasSome: [search] } },
    ];
  }
  if (category) where.category = category;
  if (type) where.type = type;
  if (industry) where.industry = industry;
  if (locale) where.locale = locale;
  if (isPremium !== undefined) where.isPremium = isPremium;
  if (isPublished !== undefined) where.isPublished = isPublished;

  const [data, total] = await Promise.all([
    prisma.template.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.template.count({ where }),
  ]);

  const result = {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };

  await cacheSet(cacheKey, result, CACHE_TTL);
  return result;
}

export async function getById(id: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const record = await prisma.template.findUnique({ where: { id } });
  if (!record) throw new NotFoundError('Template', id);

  await cacheSet(cacheKey, record, CACHE_TTL);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await prisma.template.create({ data: data as any });
  logger.info('Template created', { id: record.id, name: record.name, category: record.category });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const record = await prisma.template.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
  });
  logger.info('Template updated', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return record;
}

export async function remove(id: string) {
  await prisma.template.delete({ where: { id } });
  logger.info('Template deleted', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return { success: true };
}
