import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

const CACHE_PREFIX = 'governance:audit';
const CACHE_TTL = 300;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  action?: string;
  resource?: string;
  userId?: string;
  severity?: string;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', search, action, resource, userId, severity } = params;
  const skip = (page - 1) * limit;

  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { action: { contains: search, mode: 'insensitive' } },
      { resource: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (action) where.action = action;
  if (resource) where.resource = resource;
  if (userId) where.userId = userId;
  if (severity) where.severity = severity;

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.auditLog.count({ where }),
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

  const record = await prisma.auditLog.findUnique({ where: { id } });
  if (!record) throw new NotFoundError('AuditLog', id);

  await cacheSet(cacheKey, record, CACHE_TTL);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await prisma.auditLog.create({ data: data as any });
  logger.info('Audit log created', { id: record.id, action: record.action });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const record = await prisma.auditLog.update({
    where: { id },
    data: { ...data, updatedAt: new Date() } as any,
  });
  logger.info('Audit log updated', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return record;
}

export async function remove(id: string) {
  await prisma.auditLog.delete({ where: { id } });
  logger.info('Audit log deleted', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return { success: true };
}
