import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { ConversionSourceFormat, ConversionTargetFormat, ConversionJobStatus } from '@prisma/client';

const CACHE_PREFIX = 'conversion-core';
const CACHE_TTL = 300;

export interface ListCoreParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  tenantId?: string;
  status?: string;
  sourceFormat?: string;
  targetFormat?: string;
}

export class CoreService {
  async list(params: ListCoreParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search, tenantId, status, sourceFormat, targetFormat } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { sourceFormat: { equals: search as ConversionSourceFormat } },
        { targetFormat: { equals: search as ConversionTargetFormat } },
        { sourcePath: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (status) {
      where.status = status;
    }

    if (sourceFormat) {
      where.sourceFormat = sourceFormat;
    }

    if (targetFormat) {
      where.targetFormat = targetFormat;
    }

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const [data, total] = await Promise.all([
      prisma.conversionJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.conversionJob.count({ where }),
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

    const job = await prisma.conversionJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundError('ConversionJob', id);
    }

    await cacheSet(cacheKey, job, CACHE_TTL);
    return job;
  }

  async create(data: {
    tenantId: string;
    sourceFormat: ConversionSourceFormat;
    targetFormat: ConversionTargetFormat;
    sourcePath: string;
    outputPath?: string;
    status?: ConversionJobStatus;
  }) {
    const job = await prisma.conversionJob.create({
      data: {
        tenantId: data.tenantId,
        sourceFormat: data.sourceFormat,
        targetFormat: data.targetFormat,
        sourcePath: data.sourcePath,
        outputPath: data.outputPath || null,
        status: data.status || 'PENDING',
      },
    });

    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return job;
  }

  async update(id: string, data: {
    sourceFormat?: ConversionSourceFormat;
    targetFormat?: ConversionTargetFormat;
    sourcePath?: string;
    outputPath?: string;
    status?: ConversionJobStatus;
  }) {
    await this.getById(id);

    const updateData: Record<string, unknown> = {};
    if (data.sourceFormat !== undefined) updateData.sourceFormat = data.sourceFormat;
    if (data.targetFormat !== undefined) updateData.targetFormat = data.targetFormat;
    if (data.sourcePath !== undefined) updateData.sourcePath = data.sourcePath;
    if (data.outputPath !== undefined) updateData.outputPath = data.outputPath;
    if (data.status !== undefined) updateData.status = data.status;

    const updated = await prisma.conversionJob.update({
      where: { id },
      data: updateData,
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return updated;
  }

  async delete(id: string) {
    await this.getById(id);
    await prisma.conversionJob.delete({ where: { id } });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return { deleted: true };
  }

  async startConversion(id: string) {
    const job = await this.getById(id);
    if ((job as Record<string, unknown>).status !== 'PENDING') {
      throw new Error(`Job ${id} is not in pending state`);
    }

    const updated = await prisma.conversionJob.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return updated;
  }

  async completeConversion(id: string, outputPath: string) {
    const updated = await prisma.conversionJob.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        outputPath: outputPath,
      },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return updated;
  }

  async failConversion(id: string, errorMessage: string) {
    const updated = await prisma.conversionJob.update({
      where: { id },
      data: { status: 'FAILED' },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return { ...updated, errorMessage };
  }

  async cancelConversion(id: string) {
    const updated = await prisma.conversionJob.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);

    return updated;
  }
}

export const coreService = new CoreService();
