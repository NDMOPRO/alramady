import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

const CACHE_PREFIX = 'governance:compare';
const CACHE_TTL = 300;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  sourceType?: string;
  targetType?: string;
  compareMode?: string;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', search, sourceType, targetType, compareMode } = params;
  const skip = (page - 1) * limit;

  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (sourceType) where.sourceType = sourceType;
  if (targetType) where.targetType = targetType;
  if (compareMode) where.compareMode = compareMode;

  const [data, total] = await Promise.all([
    prisma.comparison.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.comparison.count({ where }),
  ]);

  const result = {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };

  await cacheSet(cacheKey, result, CACHE_TTL);
  return result;
}

export async function getById(id: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const record = await prisma.comparison.findUnique({ where: { id } });
  if (!record) throw new NotFoundError('Comparison', id);

  await cacheSet(cacheKey, record, CACHE_TTL);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await prisma.comparison.create({ data });
  logger.info('Comparison created', { id: record.id, name: record.name });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const record = await prisma.comparison.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
  });
  logger.info('Comparison updated', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return record;
}

export async function remove(id: string) {
  await prisma.comparison.delete({ where: { id } });
  logger.info('Comparison deleted', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return { success: true };
}
