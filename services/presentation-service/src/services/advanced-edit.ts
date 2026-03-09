import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

const MODEL = 'presentationAdvancedEdit';
const CACHE_PREFIX = 'advanced-edit';

interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  count(args: Record<string, unknown>): Promise<number>;
}

const model = (prisma as unknown as Record<string, PrismaDelegate>)[MODEL];
const slideElementModel = (prisma as unknown as Record<string, PrismaDelegate>).slideElement;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId: string;
  presentationId?: string;
  operation?: string;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', userId, presentationId, operation } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = { userId };
  if (presentationId) where.presentationId = presentationId;
  if (operation) where.operation = operation;

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
  logger.info('Advanced-edit list fetched', { userId, total });
  return result;
}

export async function getById(id: string, userId: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const record = await model.findUnique({ where: { id } });
  if (!record || record.userId !== userId) throw new NotFoundError('Advanced-edit operation');

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>, userId: string) {
  const record = await model.create({ data: { ...data, userId } });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Advanced-edit operation created', { id: record.id, userId, operation: data.operation });
  return record;
}

export async function update(id: string, data: Record<string, unknown>, userId: string) {
  const existing = await model.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Advanced-edit operation');

  const record = await model.update({ where: { id }, data });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Advanced-edit operation updated', { id, userId });
  return record;
}

export async function remove(id: string, userId: string) {
  const existing = await model.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Advanced-edit operation');

  await model.delete({ where: { id } });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Advanced-edit operation deleted', { id, userId });
  return { success: true };
}

export async function undo(presentationId: string, userId: string): Promise<{ restored: boolean; action?: string; snapshot?: Record<string, unknown> }> {
  const { AdvancedEditService } = await import('./advanced-edit.service.js');
  const service = new AdvancedEditService(prisma as unknown as ConstructorParameters<typeof AdvancedEditService>[0]);
  const result = await service.undo(presentationId, userId);
  logger.info('Undo operation completed', { presentationId, userId, restored: result.restored });
  return result;
}

export async function redo(presentationId: string, userId: string): Promise<{ restored: boolean; action?: string; snapshot?: Record<string, unknown> }> {
  const { AdvancedEditService } = await import('./advanced-edit.service.js');
  const service = new AdvancedEditService(prisma as unknown as ConstructorParameters<typeof AdvancedEditService>[0]);
  const result = await service.redo(presentationId, userId);
  logger.info('Redo operation completed', { presentationId, userId, restored: result.restored });
  return result;
}

export async function batchEdit(presentationId: string, operations: Record<string, unknown>[], userId: string) {
  const { AdvancedEditService } = await import('./advanced-edit.service.js');
  const service = new AdvancedEditService(prisma as unknown as ConstructorParameters<typeof AdvancedEditService>[0]);
  const results: Array<{ operation: string; success: boolean; error?: string }> = [];

  await service.saveSnapshot(presentationId, userId, 'batchEdit');

  for (const op of operations) {
    try {
      const operation = op.type as string;
      const target = op.target as Record<string, unknown>;
      if (operation === 'updateElement') {
        await slideElementModel.update({
          where: { id: target.elementId as string },
          data: target.changes as Record<string, unknown>,
        });
      } else if (operation === 'deleteElement') {
        await slideElementModel.delete({
          where: { id: target.elementId as string },
        });
      } else if (operation === 'addElement') {
        await slideElementModel.create({
          data: { slideId: target.slideId as string, ...(target.element as Record<string, unknown>) },
        });
      }
      results.push({ operation, success: true });
    } catch (err) {
      results.push({ operation: (op.type as string) || 'unknown', success: false, error: err instanceof Error ? err.message : 'Failed' });
    }
  }

  const appliedCount = results.filter(r => r.success).length;
  logger.info('Batch edit completed', { presentationId, total: operations.length, applied: appliedCount });
  return { status: 'applied', presentationId, appliedCount, totalOperations: operations.length, results };
}
