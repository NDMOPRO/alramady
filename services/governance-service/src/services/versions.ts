import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

const CACHE_PREFIX = 'governance:versions';
const CACHE_TTL = 300;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  resourceType?: string;
  resourceId?: string;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', search, resourceType, resourceId } = params;
  const skip = (page - 1) * limit;

  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { versionNumber: { contains: search, mode: 'insensitive' } },
      { label: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (resourceType) where.resourceType = resourceType;
  if (resourceId) where.resourceId = resourceId;

  const [data, total] = await Promise.all([
    prisma.version.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.version.count({ where }),
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

  const record = await prisma.version.findUnique({ where: { id } });
  if (!record) throw new NotFoundError('Version', id);

  await cacheSet(cacheKey, record, CACHE_TTL);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await prisma.version.create({ data: data as any });
  logger.info('Version created', { id: record.id, versionNumber: record.versionNumber });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const record = await prisma.version.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
  });
  logger.info('Version updated', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return record;
}

export async function remove(id: string) {
  await prisma.version.delete({ where: { id } });
  logger.info('Version deleted', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return { success: true };
}
