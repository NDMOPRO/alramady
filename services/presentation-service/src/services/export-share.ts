import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<unknown[]>;
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  count(args: Record<string, unknown>): Promise<number>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<unknown>;
}

const MODEL = 'presentationExportJob';
const CACHE_PREFIX = 'export-share';

function getModel(): PrismaDelegate {
  return (prisma as unknown as Record<string, PrismaDelegate>)[MODEL];
}

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId: string;
  exportFormat?: string;
  search?: string;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', userId, exportFormat, search } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<{ data: unknown[]; total: number; page: number; limit: number; totalPages: number }>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = { userId };
  if (exportFormat) where.exportFormat = exportFormat;
  if (search) where.presentationId = search;

  const [data, total] = await Promise.all([
    getModel().findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    getModel().count({ where }),
  ]);

  const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  await cacheSet(cacheKey, result, 300);
  logger.info('Export-share list fetched', { userId, total });
  return result;
}

export async function getById(id: string, userId: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const record = await getModel().findUnique({ where: { id } });
  if (!record || record.userId !== userId) throw new NotFoundError('Export-share');

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>, userId: string) {
  const record = await getModel().create({ data: { ...data, userId, status: 'processing' } });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Export-share job created', { id: record.id, userId, format: data.exportFormat });
  return record;
}

export async function update(id: string, data: Record<string, unknown>, userId: string) {
  const existing = await getModel().findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Export-share');

  const record = await getModel().update({ where: { id }, data });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Export-share updated', { id, userId });
  return record;
}

export async function remove(id: string, userId: string) {
  const existing = await getModel().findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Export-share');

  await getModel().delete({ where: { id } });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Export-share deleted', { id, userId });
  return { success: true };
}

export async function getDownloadUrl(id: string, userId: string) {
  const record = await getById(id, userId);
  const { ExportShareService } = await import('./export-share.service.js');
  const exportService = new ExportShareService(prisma as unknown as ConstructorParameters<typeof ExportShareService>[0]);
  const result = await exportService.getDownloadUrl(id, userId);
  return { exportId: id, downloadUrl: result.downloadUrl, expiresAt: result.expiresAt };
}

export async function getShareLink(id: string, userId: string) {
  const record = await getById(id, userId);
  const crypto = await import('crypto');
  const shareToken = crypto.randomBytes(32).toString('hex');
  const shareUrl = `/shared/presentations/${shareToken}`;
  await getModel().update({
    where: { id },
    data: { shareUrl, shareToken, shareSettings: record.shareSettings || {} },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  return { exportId: id, shareUrl, settings: record.shareSettings || {} };
}

export async function revokeShare(id: string, userId: string) {
  const record = await getById(id, userId);
  await getModel().update({
    where: { id },
    data: { shareUrl: null, shareToken: null },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  logger.info('Share revoked', { id });
  return { status: 'revoked', exportId: id };
}
