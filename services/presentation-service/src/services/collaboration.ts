import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

const MODEL = 'presentationCollaboration';
const CACHE_PREFIX = 'collaboration';

interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  count(args: Record<string, unknown>): Promise<number>;
}

const model = (prisma as unknown as Record<string, PrismaDelegate>)[MODEL];
const commentModel = (prisma as unknown as Record<string, PrismaDelegate>).presentationComment;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId: string;
  presentationId?: string;
  collaborationType?: string;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', userId, presentationId, collaborationType } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = { userId };
  if (presentationId) where.presentationId = presentationId;
  if (collaborationType) where.collaborationType = collaborationType;

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
  logger.info('Collaboration list fetched', { userId, total });
  return result;
}

export async function getById(id: string, userId: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const record = await model.findUnique({ where: { id } });
  if (!record || record.userId !== userId) throw new NotFoundError('Collaboration session');

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>, userId: string) {
  const record = await model.create({ data: { ...data, userId, status: 'active' } });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Collaboration session created', { id: record.id, userId, type: data.collaborationType });
  return record;
}

export async function update(id: string, data: Record<string, unknown>, userId: string) {
  const existing = await model.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Collaboration session');

  const record = await model.update({ where: { id }, data });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Collaboration session updated', { id, userId });
  return record;
}

export async function remove(id: string, userId: string) {
  const existing = await model.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Collaboration session');

  await model.delete({ where: { id } });
  await cacheDel(`${CACHE_PREFIX}:${id}`);
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  logger.info('Collaboration session deleted', { id, userId });
  return { success: true };
}

export async function addCollaborator(sessionId: string, collaborator: Record<string, unknown>, userId: string) {
  const session = await getById(sessionId, userId);
  const { CollaborationService } = await import('./collaboration.service.js');
  const collabService = new CollaborationService(prisma as unknown as ConstructorParameters<typeof CollaborationService>[0]);
  await collabService.joinSession(session.presentationId as string, (collaborator.userId as string) || userId);
  const updated = await model.update({
    where: { id: sessionId },
    data: { collaborators: { push: collaborator } },
  });
  await cacheDel(`${CACHE_PREFIX}:${sessionId}`);
  logger.info('Collaborator added', { sessionId, collaborator });
  return { status: 'added', sessionId, collaborator, totalCollaborators: ((updated.collaborators as unknown[]) || []).length };
}

export async function removeCollaborator(sessionId: string, collaboratorId: string, userId: string) {
  const session = await getById(sessionId, userId);
  const { CollaborationService } = await import('./collaboration.service.js');
  const collabService = new CollaborationService(prisma as unknown as ConstructorParameters<typeof CollaborationService>[0]);
  await collabService.leaveSession(session.presentationId as string, collaboratorId);
  await cacheDel(`${CACHE_PREFIX}:${sessionId}`);
  logger.info('Collaborator removed', { sessionId, collaboratorId });
  return { status: 'removed', sessionId, collaboratorId };
}

export async function getActiveUsers(sessionId: string, userId: string) {
  const session = await getById(sessionId, userId);
  const { CollaborationService } = await import('./collaboration.service.js');
  const collabService = new CollaborationService(prisma as unknown as ConstructorParameters<typeof CollaborationService>[0]);
  const activeUsers = await collabService.getActiveUsers(session.presentationId as string);
  return { sessionId, activeUsers, count: activeUsers.length };
}

export async function addComment(sessionId: string, comment: Record<string, unknown>, userId: string) {
  await getById(sessionId, userId);
  const commentRecord = await commentModel.create({
    data: {
      sessionId,
      userId,
      content: comment.content as string || '',
      slideId: comment.slideId as string,
      elementId: comment.elementId as string,
      position: comment.position || {},
      createdAt: new Date(),
    },
  });
  await cacheDel(`${CACHE_PREFIX}:${sessionId}`);
  logger.info('Comment added to collaboration', { sessionId, commentId: commentRecord.id });
  return { status: 'added', sessionId, commentId: commentRecord.id };
}
