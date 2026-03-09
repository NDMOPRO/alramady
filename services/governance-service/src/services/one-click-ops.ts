import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

const CACHE_PREFIX = 'governance:oneclick';
const CACHE_TTL = 300;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  operationType?: string;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', search, operationType } = params;
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
  if (operationType) where.operationType = operationType;

  const [data, total] = await Promise.all([
    prisma.oneClickOp.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.oneClickOp.count({ where }),
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

  const record = await prisma.oneClickOp.findUnique({ where: { id } });
  if (!record) throw new NotFoundError('OneClickOp', id);

  await cacheSet(cacheKey, record, CACHE_TTL);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await prisma.oneClickOp.create({ data });
  logger.info('One-click operation created', { id: record.id, name: record.name });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const record = await prisma.oneClickOp.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
  });
  logger.info('One-click operation updated', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return record;
}

export async function remove(id: string) {
  await prisma.oneClickOp.delete({ where: { id } });
  logger.info('One-click operation deleted', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return { success: true };
}
