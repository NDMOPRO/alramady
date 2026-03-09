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

const MODEL = 'presentationAnimationConfig';
const CACHE_PREFIX = 'animation';

function getModel(): PrismaDelegate {
  return (prisma as unknown as Record<string, PrismaDelegate>)[MODEL];
}

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId: string;
  presentationId?: string;
  animationType?: string;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', userId, presentationId, animationType } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<{ data: unknown[]; total: number; page: number; limit: number; totalPages: number }>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = { userId };
  if (presentationId) where.presentationId = presentationId;
  if (animationType) where.animationType = animationType;

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
  logger.info('Animation list fetched', { userId, total });
  return result;
}

export async function getById(id: string, userId: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const record = await getModel().findUnique({ where: { id } });
  if (!record || record.userId !== userId) throw new NotFoundError('Animation');

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>, userId: string) {
  const record = await getModel().create({ data: { ...data, userId } });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Animation created', { id: record.id, userId, type: data.animationType });
  return record;
}

export async function update(id: string, data: Record<string, unknown>, userId: string) {
  const existing = await getModel().findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Animation');

  const record = await getModel().update({ where: { id }, data });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Animation updated', { id, userId });
  return record;
}

export async function remove(id: string, userId: string) {
  const existing = await getModel().findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Animation');

  await getModel().delete({ where: { id } });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Animation deleted', { id, userId });
  return { success: true };
}

export async function preview(id: string, userId: string) {
  const animation = await getById(id, userId);
  const mod = await import('./animation-engine.service.js');
  const EngineClass = mod.default as unknown as new (p: unknown) => { getSlideTimeline(a: string, b: string): Promise<Record<string, unknown>>; applyAnimationPreset(a: string, b: string): Promise<Record<string, unknown>>; reorderAnimation(a: string, b: string, c: number): Promise<void> };
  const engine = new EngineClass(prisma);
  const timeline = await engine.getSlideTimeline(animation.presentationId as string, (animation.slideId as string) || '');
  return {
    animationId: id,
    preview: {
      frames: timeline.animations || [],
      duration: animation.duration || timeline.totalDuration || 0,
      transition: timeline.transition,
    },
  };
}

export async function applyPreset(presentationId: string, presetId: string, userId: string) {
  const mod = await import('./animation-engine.service.js');
  const EngineClass = mod.default as unknown as new (p: unknown) => { getSlideTimeline(a: string, b: string): Promise<Record<string, unknown>>; applyAnimationPreset(a: string, b: string): Promise<Record<string, unknown>>; reorderAnimation(a: string, b: string, c: number): Promise<void> };
  const engine = new EngineClass(prisma);
  const result = await engine.applyAnimationPreset(presentationId, presetId);
  logger.info('Animation preset applied', { presentationId, presetId, slidesAffected: result.appliedCount });
  return { status: 'applied', presentationId, presetId, appliedCount: result.appliedCount };
}

export async function reorder(presentationId: string, slideIndex: number, order: string[], userId: string) {
  const mod = await import('./animation-engine.service.js');
  const EngineClass = mod.default as unknown as new (p: unknown) => { getSlideTimeline(a: string, b: string): Promise<Record<string, unknown>>; applyAnimationPreset(a: string, b: string): Promise<Record<string, unknown>>; reorderAnimation(a: string, b: string, c: number): Promise<void> };
  const engine = new EngineClass(prisma);
  for (let i = 0; i < order.length; i++) {
    await engine.reorderAnimation(presentationId, order[i], i);
  }
  logger.info('Animation order updated', { presentationId, slideIndex, count: order.length });
  return { status: 'reordered', presentationId, slideIndex, newOrder: order };
}
