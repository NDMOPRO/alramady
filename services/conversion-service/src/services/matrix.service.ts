import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { ConversionSourceFormat, ConversionTargetFormat, ConversionJobStatus } from '@prisma/client';

const CACHE_PREFIX = 'conversion-matrix';
const CACHE_TTL = 600;

export interface ListMatrixParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  tenantId?: string;
  sourceFormat?: string;
  targetFormat?: string;
}

export class MatrixService {
  async list(params: ListMatrixParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search, tenantId, sourceFormat, targetFormat } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { sourceFormat: { equals: search as ConversionSourceFormat } },
        { targetFormat: { equals: search as ConversionTargetFormat } },
      ];
    }

    if (tenantId) {
      where.tenantId = tenantId;
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
      throw new NotFoundError('ConversionMatrix', id);
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

  async getSupportedConversions() {
    const cacheKey = `${CACHE_PREFIX}:supported-conversions`;
    const cached = await cacheGet<Record<string, string[]>>(cacheKey);
    if (cached) return cached;

    const matrix: Record<string, string[]> = {
      pdf: ['docx', 'xlsx', 'pptx', 'html', 'txt', 'png', 'jpg', 'csv', 'json', 'xml'],
      docx: ['pdf', 'html', 'txt', 'rtf', 'odt', 'md', 'epub'],
      doc: ['pdf', 'docx', 'html', 'txt', 'rtf'],
      xlsx: ['pdf', 'csv', 'tsv', 'json', 'xml', 'html', 'ods'],
      xls: ['pdf', 'xlsx', 'csv', 'json', 'html'],
      pptx: ['pdf', 'html', 'png', 'jpg', 'odp'],
      ppt: ['pdf', 'pptx', 'html'],
      csv: ['xlsx', 'json', 'xml', 'pdf', 'html', 'tsv'],
      tsv: ['xlsx', 'csv', 'json', 'xml'],
      json: ['csv', 'xlsx', 'xml', 'yaml', 'html'],
      xml: ['json', 'csv', 'xlsx', 'yaml', 'html'],
      yaml: ['json', 'xml'],
      html: ['pdf', 'docx', 'txt', 'md'],
      md: ['html', 'pdf', 'docx'],
      txt: ['pdf', 'docx', 'html'],
      rtf: ['pdf', 'docx', 'txt', 'html'],
      png: ['jpg', 'webp', 'gif', 'bmp', 'svg', 'pdf', 'tiff'],
      jpg: ['png', 'webp', 'gif', 'bmp', 'svg', 'pdf', 'tiff'],
      gif: ['png', 'jpg', 'webp'],
      bmp: ['png', 'jpg', 'webp'],
      svg: ['png', 'jpg', 'pdf'],
      webp: ['png', 'jpg', 'gif'],
      tiff: ['png', 'jpg', 'pdf'],
      odt: ['pdf', 'docx', 'html'],
      ods: ['pdf', 'xlsx', 'csv'],
      odp: ['pdf', 'pptx'],
      epub: ['pdf', 'html', 'docx'],
    };

    await cacheSet(cacheKey, matrix, 3600);
    return matrix;
  }

  async checkConversionSupport(sourceFormat: string, targetFormat: string) {
    const matrix = await this.getSupportedConversions();
    const source = sourceFormat.toLowerCase();
    const target = targetFormat.toLowerCase();

    const isSupported = matrix[source]?.includes(target) || false;
    const availableTargets = matrix[source] || [];

    return {
      sourceFormat: source,
      targetFormat: target,
      isSupported,
      availableTargets,
    };
  }

  async getConversionStats(tenantId?: string) {
    const where: Record<string, unknown> = {};
    if (tenantId) {
      where.tenantId = tenantId;
    }

    const cacheKey = `${CACHE_PREFIX}:stats:${tenantId || 'all'}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const [total, completed, failed, pending, processing] = await Promise.all([
      prisma.conversionJob.count({ where }),
      prisma.conversionJob.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.conversionJob.count({ where: { ...where, status: 'FAILED' } }),
      prisma.conversionJob.count({ where: { ...where, status: 'PENDING' } }),
      prisma.conversionJob.count({ where: { ...where, status: 'PROCESSING' } }),
    ]);

    const stats = {
      total,
      completed,
      failed,
      pending,
      processing,
      successRate: total > 0 ? ((completed / total) * 100).toFixed(2) : '0.00',
    };

    await cacheSet(cacheKey, stats, 60);
    return stats;
  }
}

export const matrixService = new MatrixService();
