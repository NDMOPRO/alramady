import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';

const CACHE_PREFIX = 'visual-processing';
const CACHE_TTL = 300;

export interface ListVisualProcessingParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  datasetId?: string;
  status?: string;
  processingType?: string;
}

export class VisualProcessingService {
  async list(params: ListVisualProcessingParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, datasetId, status, processingType } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.VisualProcessingWhereInput = {};
    if (datasetId) where.datasetId = datasetId;
    if (status) where.status = status;
    if (processingType) where.processingType = processingType;

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const [data, total] = await Promise.all([
      prisma.visualProcessing.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          dataset: { select: { id: true, name: true, sourceType: true } },
        },
      }),
      prisma.visualProcessing.count({ where }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const processing = await prisma.visualProcessing.findUnique({
      where: { id },
      include: {
        dataset: { select: { id: true, name: true, sourceType: true } },
      },
    });
    if (!processing) throw new NotFoundError('VisualProcessing', id);

    await cacheSet(cacheKey, processing, CACHE_TTL);
    return processing;
  }

  async create(data: {
    datasetId: string;
    processingType: string;
    inputConfig?: Prisma.InputJsonValue;
    outputConfig?: Prisma.InputJsonValue;
    chartType?: string;
    visualConfig?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }) {
    const processing = await prisma.visualProcessing.create({
      data: {
        dataset: { connect: { id: data.datasetId } },
        processingType: data.processingType,
        inputConfig: data.inputConfig || undefined,
        outputConfig: data.outputConfig || undefined,
        chartType: data.chartType,
        visualConfig: data.visualConfig || undefined,
        metadata: data.metadata || undefined,
        status: 'pending',
      },
      include: {
        dataset: { select: { id: true, name: true, sourceType: true } },
      },
    });

    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return processing;
  }

  async update(id: string, data: {
    status?: string;
    inputConfig?: Prisma.InputJsonValue;
    outputConfig?: Prisma.InputJsonValue;
    chartType?: string;
    visualConfig?: Prisma.InputJsonValue;
    resultData?: Prisma.InputJsonValue;
    thumbnailUrl?: string;
    errorMessage?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.getById(id);

    const updateData: Prisma.VisualProcessingUpdateInput = {};
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'processing') updateData.startedAt = new Date();
      if (data.status === 'completed' || data.status === 'failed') updateData.completedAt = new Date();
    }
    if (data.inputConfig !== undefined) updateData.inputConfig = data.inputConfig;
    if (data.outputConfig !== undefined) updateData.outputConfig = data.outputConfig;
    if (data.chartType !== undefined) updateData.chartType = data.chartType;
    if (data.visualConfig !== undefined) updateData.visualConfig = data.visualConfig;
    if (data.resultData !== undefined) updateData.resultData = data.resultData;
    if (data.thumbnailUrl !== undefined) updateData.thumbnailUrl = data.thumbnailUrl;
    if (data.errorMessage !== undefined) updateData.errorMessage = data.errorMessage;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const updated = await prisma.visualProcessing.update({
      where: { id },
      data: updateData,
      include: {
        dataset: { select: { id: true, name: true, sourceType: true } },
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
    await prisma.visualProcessing.delete({ where: { id } });
    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);
    return { deleted: true };
  }
}

export const visualProcessingService = new VisualProcessingService();
