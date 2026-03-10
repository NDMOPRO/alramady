import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';

const CACHE_PREFIX = 'conversion-universal';
const CACHE_TTL = 300;

export interface ListUniversalParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  tenantId?: string;
  status?: string;
}

export class UniversalService {
  async list(params: ListUniversalParams) {
    const { page, limit, sortBy = 'created_at', sortOrder, search, tenantId, status } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { sourceFormat: { contains: search, mode: 'insensitive' } },
        { targetFormat: { contains: search, mode: 'insensitive' } },
        { sourcePath: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (status) {
      where.status = status;
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
      throw new NotFoundError('UniversalConversion', id);
    }

    await cacheSet(cacheKey, job, CACHE_TTL);
    return job;
  }

  async create(data: {
    tenantId: string;
    sourcePath: string;
    targetFormat: string;
    outputPath?: string;
  }) {
    // Auto-detect source format from file extension
    const sourceFormat = this.detectFormat(data.sourcePath);
    const outputPath = data.outputPath || data.sourcePath.replace(/\.[^.]+$/, `.${data.targetFormat}`);

    const job = await prisma.conversionJob.create({
      data: {
        tenantId: data.tenantId,
        sourceFormat: sourceFormat.toUpperCase() as any,
        targetFormat: data.targetFormat.toUpperCase() as any,
        sourcePath: data.sourcePath,
        outputPath: outputPath,
        status: 'PENDING',
      },
    });

    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return job;
  }

  async update(id: string, data: {
    targetFormat?: string;
    outputPath?: string;
    status?: string;
  }) {
    await this.getById(id);

    const updateData: Record<string, unknown> = {};
    if (data.targetFormat !== undefined) updateData.targetFormat = data.targetFormat;
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

  async convert(
    sourcePath: string,
    targetFormat: string,
    tenantId: string,
    options: {
      preserveFormatting?: boolean;
      preserveImages?: boolean;
      preserveLinks?: boolean;
      ocrEnabled?: boolean;
      ocrLanguage?: string;
      quality?: string;
    } = {}
  ) {
    const sourceFormat = this.detectFormat(sourcePath);
    const outputPath = sourcePath.replace(/\.[^.]+$/, `.${targetFormat}`);

    // Create the conversion job
    const job = await prisma.conversionJob.create({
      data: {
        tenantId: tenantId,
        sourceFormat: sourceFormat.toUpperCase() as any,
        targetFormat: targetFormat.toUpperCase() as any,
        sourcePath: sourcePath,
        outputPath: outputPath,
        status: 'PROCESSING',
      },
    });

    // Simulate two-step conversion: source -> UDR -> target
    const conversionPipeline = {
      step1: {
        name: 'Source to UDR',
        sourceFormat,
        targetFormat: 'UDR',
        status: 'COMPLETED',
      },
      step2: {
        name: 'UDR to Target',
        sourceFormat: 'UDR',
        targetFormat,
        status: 'COMPLETED',
      },
    };

    // Mark as completed
    const completed = await prisma.conversionJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        outputPath: outputPath,
      },
    });

    await cacheDel(`${CACHE_PREFIX}:list:*`);

    return {
      job: completed,
      pipeline: conversionPipeline,
      options: {
        preserveFormatting: options.preserveFormatting ?? true,
        preserveImages: options.preserveImages ?? true,
        preserveLinks: options.preserveLinks ?? true,
        ocrEnabled: options.ocrEnabled ?? false,
        ocrLanguage: options.ocrLanguage ?? 'en',
        quality: options.quality ?? 'standard',
      },
    };
  }

  async batchConvert(
    files: Array<{ sourcePath: string; targetFormat: string }>,
    tenantId: string
  ) {
    const results = [];

    for (const file of files) {
      try {
        const result = await this.convert(file.sourcePath, file.targetFormat, tenantId);
        results.push({ ...result, success: true });
      } catch (error) {
        results.push({
          sourcePath: file.sourcePath,
          targetFormat: file.targetFormat,
          success: false,
          error: (error as Error).message,
        });
      }
    }

    return {
      total: files.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  private detectFormat(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const formatMap: Record<string, string> = {
      pdf: 'pdf', docx: 'docx', doc: 'doc', xlsx: 'xlsx', xls: 'xls',
      pptx: 'pptx', ppt: 'ppt', csv: 'csv', tsv: 'tsv',
      json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
      html: 'html', htm: 'html', md: 'md', txt: 'txt', rtf: 'rtf',
      png: 'png', jpg: 'jpg', jpeg: 'jpg', gif: 'gif',
      bmp: 'bmp', svg: 'svg', webp: 'webp', tiff: 'tiff',
      odt: 'odt', ods: 'ods', odp: 'odp', epub: 'epub',
    };

    return formatMap[ext || ''] || 'unknown';
  }
}

export const universalService = new UniversalService();
