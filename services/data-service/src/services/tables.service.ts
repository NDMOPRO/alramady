import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';

const CACHE_PREFIX = 'tables';
const CACHE_TTL = 300;

export interface ListTablesParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  datasetId?: string;
  viewType?: string;
}

export class TablesService {
  async list(params: ListTablesParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search, datasetId, viewType } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.TableViewWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (datasetId) where.datasetId = datasetId;
    if (viewType) where.viewType = viewType;

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const [data, total] = await Promise.all([
      prisma.tableView.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          dataset: { select: { id: true, name: true, rowCount: true } },
        },
      }),
      prisma.tableView.count({ where }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const view = await prisma.tableView.findUnique({
      where: { id },
      include: {
        dataset: {
          select: { id: true, name: true, rowCount: true },
        },
      },
    });
    if (!view) throw new NotFoundError('TableView', id);

    await cacheSet(cacheKey, view, CACHE_TTL);
    return view;
  }

  async create(data: {
    datasetId: string;
    name: string;
    description?: string;
    viewType?: string;
    columnConfig?: Prisma.InputJsonValue;
    filterConfig?: Prisma.InputJsonValue;
    sortConfig?: Prisma.InputJsonValue;
    groupConfig?: Prisma.InputJsonValue;
    aggregateConfig?: Prisma.InputJsonValue;
    pivotConfig?: Prisma.InputJsonValue;
    isDefault?: boolean;
    isShared?: boolean;
    metadata?: Prisma.InputJsonValue;
  }) {
    const view = await prisma.tableView.create({
      data: {
        dataset: { connect: { id: data.datasetId } },
        name: data.name,
        description: data.description,
        viewType: data.viewType || 'table',
        columnConfig: data.columnConfig || undefined,
        filterConfig: data.filterConfig || undefined,
        sortConfig: data.sortConfig || undefined,
        groupConfig: data.groupConfig || undefined,
        aggregateConfig: data.aggregateConfig || undefined,
        pivotConfig: data.pivotConfig || undefined,
        isDefault: data.isDefault ?? false,
        isShared: data.isShared ?? false,
        metadata: data.metadata || undefined,
      },
      include: {
        dataset: { select: { id: true, name: true, rowCount: true } },
      },
    });

    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return view;
  }

  async update(id: string, data: {
    name?: string;
    description?: string;
    viewType?: string;
    columnConfig?: Prisma.InputJsonValue;
    filterConfig?: Prisma.InputJsonValue;
    sortConfig?: Prisma.InputJsonValue;
    groupConfig?: Prisma.InputJsonValue;
    aggregateConfig?: Prisma.InputJsonValue;
    pivotConfig?: Prisma.InputJsonValue;
    isDefault?: boolean;
    isShared?: boolean;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.getById(id);

    const updateData: Prisma.TableViewUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.viewType !== undefined) updateData.viewType = data.viewType;
    if (data.columnConfig !== undefined) updateData.columnConfig = data.columnConfig;
    if (data.filterConfig !== undefined) updateData.filterConfig = data.filterConfig;
    if (data.sortConfig !== undefined) updateData.sortConfig = data.sortConfig;
    if (data.groupConfig !== undefined) updateData.groupConfig = data.groupConfig;
    if (data.aggregateConfig !== undefined) updateData.aggregateConfig = data.aggregateConfig;
    if (data.pivotConfig !== undefined) updateData.pivotConfig = data.pivotConfig;
    if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;
    if (data.isShared !== undefined) updateData.isShared = data.isShared;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const updated = await prisma.tableView.update({
      where: { id },
      data: updateData,
      include: {
        dataset: { select: { id: true, name: true, rowCount: true } },
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
    await prisma.tableView.delete({ where: { id } });
    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);
    return { deleted: true };
  }
}

export const tablesService = new TablesService();
