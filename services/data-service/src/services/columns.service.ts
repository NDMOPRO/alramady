import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';

const CACHE_PREFIX = 'columns';
const CACHE_TTL = 300;

export interface ListColumnsParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  datasetId?: string;
  dataType?: string;
}

export class ColumnsService {
  async list(params: ListColumnsParams) {
    const { page, limit, sortBy = 'displayOrder', sortOrder = 'asc', search, datasetId, dataType } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.DatasetColumnWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { originalName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (datasetId) where.datasetId = datasetId;
    if (dataType) where.dataType = dataType;

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const [data, total] = await Promise.all([
      prisma.datasetColumn.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          dataset: { select: { id: true, name: true } },
        },
      }),
      prisma.datasetColumn.count({ where }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const column = await prisma.datasetColumn.findUnique({
      where: { id },
      include: {
        dataset: { select: { id: true, name: true } },
      },
    });
    if (!column) throw new NotFoundError('DatasetColumn', id);

    await cacheSet(cacheKey, column, CACHE_TTL);
    return column;
  }

  async create(data: {
    datasetId: string;
    name: string;
    originalName?: string;
    dataType: string;
    inferredType?: string;
    displayOrder?: number;
    isVisible?: boolean;
    isRequired?: boolean;
    isPrimaryKey?: boolean;
    defaultValue?: string;
    format?: string;
    minValue?: string;
    maxValue?: string;
    transformations?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }) {
    const column = await prisma.datasetColumn.create({
      data: {
        dataset: { connect: { id: data.datasetId } },
        name: data.name,
        originalName: data.originalName,
        dataType: data.dataType,
        inferredType: data.inferredType,
        displayOrder: data.displayOrder || 0,
        isVisible: data.isVisible ?? true,
        isRequired: data.isRequired ?? false,
        isPrimaryKey: data.isPrimaryKey ?? false,
        defaultValue: data.defaultValue,
        format: data.format,
        minValue: data.minValue,
        maxValue: data.maxValue,
        transformations: data.transformations || undefined,
        metadata: data.metadata || undefined,
      },
      include: {
        dataset: { select: { id: true, name: true } },
      },
    });

    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return column;
  }

  async update(id: string, data: {
    name?: string;
    dataType?: string;
    inferredType?: string;
    displayOrder?: number;
    isVisible?: boolean;
    isRequired?: boolean;
    isPrimaryKey?: boolean;
    defaultValue?: string;
    format?: string;
    minValue?: string;
    maxValue?: string;
    transformations?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.getById(id);

    const updateData: Prisma.DatasetColumnUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.dataType !== undefined) updateData.dataType = data.dataType;
    if (data.inferredType !== undefined) updateData.inferredType = data.inferredType;
    if (data.displayOrder !== undefined) updateData.displayOrder = data.displayOrder;
    if (data.isVisible !== undefined) updateData.isVisible = data.isVisible;
    if (data.isRequired !== undefined) updateData.isRequired = data.isRequired;
    if (data.isPrimaryKey !== undefined) updateData.isPrimaryKey = data.isPrimaryKey;
    if (data.defaultValue !== undefined) updateData.defaultValue = data.defaultValue;
    if (data.format !== undefined) updateData.format = data.format;
    if (data.minValue !== undefined) updateData.minValue = data.minValue;
    if (data.maxValue !== undefined) updateData.maxValue = data.maxValue;
    if (data.transformations !== undefined) updateData.transformations = data.transformations;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const updated = await prisma.datasetColumn.update({
      where: { id },
      data: updateData,
      include: {
        dataset: { select: { id: true, name: true } },
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
    await prisma.datasetColumn.delete({ where: { id } });
    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);
    return { deleted: true };
  }
}

export const columnsService = new ColumnsService();
