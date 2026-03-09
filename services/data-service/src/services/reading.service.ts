import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';

const CACHE_PREFIX = 'reading';
const CACHE_TTL = 120;

export interface ListReadingParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  datasetId?: string;
  isActive?: boolean;
}

export class ReadingService {
  async list(params: ListReadingParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, datasetId, isActive } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.ReadingSessionWhereInput = {};
    if (datasetId) where.datasetId = datasetId;
    if (isActive !== undefined) where.isActive = isActive;

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const [data, total] = await Promise.all([
      prisma.readingSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          dataset: { select: { id: true, name: true, sourceType: true, rowCount: true } },
        },
      }),
      prisma.readingSession.count({ where }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const session = await prisma.readingSession.findUnique({
      where: { id },
      include: {
        dataset: { select: { id: true, name: true, sourceType: true, rowCount: true } },
      },
    });
    if (!session) throw new NotFoundError('ReadingSession', id);

    await cacheSet(cacheKey, session, CACHE_TTL);
    return session;
  }

  async create(data: {
    datasetId: string;
    sessionType: string;
    pageSize?: number;
    filters?: Prisma.InputJsonValue;
    sortConfig?: Prisma.InputJsonValue;
    highlightRules?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }) {
    const session = await prisma.readingSession.create({
      data: {
        dataset: { connect: { id: data.datasetId } },
        sessionType: data.sessionType,
        pageSize: data.pageSize || 50,
        filters: data.filters || undefined,
        sortConfig: data.sortConfig || undefined,
        highlightRules: data.highlightRules || undefined,
        metadata: data.metadata || undefined,
        isActive: true,
        currentPage: 1,
      },
      include: {
        dataset: { select: { id: true, name: true, sourceType: true, rowCount: true } },
      },
    });

    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return session;
  }

  async update(id: string, data: {
    cursorPosition?: Prisma.InputJsonValue;
    filters?: Prisma.InputJsonValue;
    sortConfig?: Prisma.InputJsonValue;
    pageSize?: number;
    currentPage?: number;
    highlightRules?: Prisma.InputJsonValue;
    bookmarks?: Prisma.InputJsonValue;
    isActive?: boolean;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.getById(id);

    const updateData: Prisma.ReadingSessionUpdateInput = {};
    if (data.cursorPosition !== undefined) updateData.cursorPosition = data.cursorPosition;
    if (data.filters !== undefined) updateData.filters = data.filters;
    if (data.sortConfig !== undefined) updateData.sortConfig = data.sortConfig;
    if (data.pageSize !== undefined) updateData.pageSize = data.pageSize;
    if (data.currentPage !== undefined) updateData.currentPage = data.currentPage;
    if (data.highlightRules !== undefined) updateData.highlightRules = data.highlightRules;
    if (data.bookmarks !== undefined) updateData.bookmarks = data.bookmarks;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const updated = await prisma.readingSession.update({
      where: { id },
      data: updateData,
      include: {
        dataset: { select: { id: true, name: true, sourceType: true, rowCount: true } },
      },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);
    return updated;
  }

  async delete(id: string) {
    await this.getById(id);
    await prisma.readingSession.delete({ where: { id } });
    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);
    return { deleted: true };
  }
}

export const readingService = new ReadingService();
