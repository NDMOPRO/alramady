import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';

const CACHE_PREFIX = 'capacity';
const CACHE_TTL = 300;

export interface ListCapacityParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  tier?: string;
}

export class CapacityService {
  async list(params: ListCapacityParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, tier } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.StorageQuotaWhereInput = {};

    if (tier) {
      where.tier = tier;
    }

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const [data, total] = await Promise.all([
      prisma.storageQuota.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: { organization: { select: { id: true, name: true, slug: true } } },
      }),
      prisma.storageQuota.count({ where }),
    ]);

    const result = {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const quota = await prisma.storageQuota.findUnique({
      where: { id },
      include: { organization: { select: { id: true, name: true, slug: true } } },
    });
    if (!quota) {
      throw new NotFoundError('StorageQuota', id);
    }

    await cacheSet(cacheKey, quota, CACHE_TTL);
    return quota;
  }

  async create(data: {
    organizationId: string;
    totalBytes: number;
    maxDatasets: number;
    maxRowsPerDataset?: number;
    tier?: string;
    isUnlimited?: boolean;
    metadata?: Prisma.InputJsonValue;
  }) {
    const quota = await prisma.storageQuota.create({
      data: {
        organization: { connect: { id: data.organizationId } },
        totalBytes: BigInt(data.totalBytes),
        maxDatasets: data.maxDatasets,
        maxRowsPerDataset: data.maxRowsPerDataset,
        tier: data.tier || 'standard',
        isUnlimited: data.isUnlimited || false,
        metadata: data.metadata || undefined,
      },
      include: { organization: { select: { id: true, name: true, slug: true } } },
    });

    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return quota;
  }

  async update(id: string, data: {
    totalBytes?: number;
    usedBytes?: number;
    maxDatasets?: number;
    maxRowsPerDataset?: number;
    tier?: string;
    isUnlimited?: boolean;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.getById(id);

    const updateData: Prisma.StorageQuotaUpdateInput = {};
    if (data.totalBytes !== undefined) updateData.totalBytes = BigInt(data.totalBytes);
    if (data.usedBytes !== undefined) updateData.usedBytes = BigInt(data.usedBytes);
    if (data.maxDatasets !== undefined) updateData.maxDatasets = data.maxDatasets;
    if (data.maxRowsPerDataset !== undefined) updateData.maxRowsPerDataset = data.maxRowsPerDataset;
    if (data.tier !== undefined) updateData.tier = data.tier;
    if (data.isUnlimited !== undefined) updateData.isUnlimited = data.isUnlimited;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const updated = await prisma.storageQuota.update({
      where: { id },
      data: updateData,
      include: { organization: { select: { id: true, name: true, slug: true } } },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);
    return updated;
  }

  async delete(id: string) {
    await this.getById(id);
    await prisma.storageQuota.delete({ where: { id } });
    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);
    return { deleted: true };
  }
}

export const capacityService = new CapacityService();
