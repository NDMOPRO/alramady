import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

const CACHE_PREFIX = 'library:media';
const CACHE_TTL = 300;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  category?: string;
  fileType?: string;
  folderId?: string;
  isPublic?: boolean;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', search, category, fileType, folderId, isPublic } = params;
  const skip = (page - 1) * limit;

  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) {
    logger.debug('Cache hit for media list');
    return cached;
  }

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { fileName: { contains: search, mode: 'insensitive' } },
      { tags: { hasSome: [search] } },
    ];
  }
  if (category) where.category = category;
  if (fileType) where.fileType = fileType;
  if (folderId) where.folderId = folderId;
  if (isPublic !== undefined) where.isPublic = isPublic;

  const [data, total] = await Promise.all([
    prisma.mediaAsset.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.mediaAsset.count({ where }),
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

  const record = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!record) throw new NotFoundError('MediaAsset', id);

  await cacheSet(cacheKey, record, CACHE_TTL);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await prisma.mediaAsset.create({ data });
  logger.info('Media asset created', { id: record.id, name: record.name, category: record.category });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const record = await prisma.mediaAsset.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
  });
  logger.info('Media asset updated', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return record;
}

export async function remove(id: string) {
  await prisma.mediaAsset.delete({ where: { id } });
  logger.info('Media asset deleted', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return { success: true };
}
