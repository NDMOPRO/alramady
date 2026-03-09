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

const MODEL = 'presentationIntegration';
const CACHE_PREFIX = 'integration';

function getModel(): PrismaDelegate {
  return (prisma as unknown as Record<string, PrismaDelegate>)[MODEL];
}

function getModelByName(name: string): PrismaDelegate {
  return (prisma as unknown as Record<string, PrismaDelegate>)[name];
}

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId: string;
  integrationType?: string;
  enabled?: boolean;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', userId, integrationType, enabled } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<{ data: unknown[]; total: number; page: number; limit: number; totalPages: number }>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = { userId };
  if (integrationType) where.integrationType = integrationType;
  if (enabled !== undefined) where.enabled = enabled;

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
  logger.info('Integration list fetched', { userId, total });
  return result;
}

export async function getById(id: string, userId: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const record = await getModel().findUnique({ where: { id } });
  if (!record || record.userId !== userId) throw new NotFoundError('Integration');

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>, userId: string) {
  const record = await getModel().create({ data: { ...data, userId } });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Integration created', { id: record.id, userId, type: data.integrationType });
  return record;
}

export async function update(id: string, data: Record<string, unknown>, userId: string) {
  const existing = await getModel().findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Integration');

  const record = await getModel().update({ where: { id }, data });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Integration updated', { id, userId });
  return record;
}

export async function remove(id: string, userId: string) {
  const existing = await getModel().findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Integration');

  await getModel().delete({ where: { id } });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Integration deleted', { id, userId });
  return { success: true };
}

export async function testConnection(id: string, userId: string) {
  const integration = await getById(id, userId);
  const startTime = Date.now();
  let status: 'connected' | 'failed' = 'connected';
  let errorMessage: string | undefined;

  try {
    if (integration.integrationType === 'google_slides') {
      const response = await fetch('https://slides.googleapis.com/$discovery/rest?version=v1', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) { status = 'failed'; errorMessage = `HTTP ${response.status}`; }
    } else if (integration.integrationType === 'powerpoint') {
      const response = await fetch('https://graph.microsoft.com/v1.0/$metadata', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) { status = 'failed'; errorMessage = `HTTP ${response.status}`; }
    }
  } catch (err) {
    status = 'failed';
    errorMessage = err instanceof Error ? err.message : 'Connection failed';
  }

  const latency = `${Date.now() - startTime}ms`;
  await getModel().update({
    where: { id },
    data: { lastTestResult: status, lastTestedAt: new Date() },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  logger.info('Integration connection test', { id, type: integration.integrationType, status, latency });
  return { status, integrationId: id, latency, errorMessage };
}

export async function syncNow(id: string, userId: string) {
  const integration = await getById(id, userId);
  await getModel().update({
    where: { id },
    data: { syncStatus: 'syncing', lastSyncStartedAt: new Date() },
  });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  logger.info('Integration sync triggered', { id, direction: integration.syncDirection });
  return { status: 'syncing', integrationId: id, direction: integration.syncDirection, startedAt: new Date().toISOString() };
}

export async function getWebhookLogs(id: string, userId: string) {
  await getById(id, userId);
  const logs = await getModelByName('integrationWebhookLog').findMany({
    where: { integrationId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  }).catch(() => []);
  return { integrationId: id, logs, count: logs.length };
}
