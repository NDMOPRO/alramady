import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';

const CACHE_PREFIX = 'mixed-files';
const CACHE_TTL = 300;

export interface ListMixedFilesParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  datasetId?: string;
  fileType?: string;
  status?: string;
}

export class MixedFilesService {
  async list(params: ListMixedFilesParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search, datasetId, fileType, status } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.MixedFileEntryWhereInput = {};
    if (search) {
      where.OR = [
        { fileName: { contains: search, mode: 'insensitive' } },
        { sheetName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (datasetId) where.datasetId = datasetId;
    if (fileType) where.fileType = fileType;
    if (status) where.status = status;

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const [data, total] = await Promise.all([
      prisma.mixedFileEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          dataset: { select: { id: true, name: true } },
        },
      }),
      prisma.mixedFileEntry.count({ where }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const entry = await prisma.mixedFileEntry.findUnique({
      where: { id },
      include: {
        dataset: { select: { id: true, name: true } },
      },
    });
    if (!entry) throw new NotFoundError('MixedFileEntry', id);

    await cacheSet(cacheKey, entry, CACHE_TTL);
    return entry;
  }

  async create(data: {
    datasetId: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    filePath: string;
    sheetName?: string;
    sheetIndex?: number;
    extractedData?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }) {
    const entry = await prisma.mixedFileEntry.create({
      data: {
        dataset: { connect: { id: data.datasetId } },
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: BigInt(data.fileSize),
        filePath: data.filePath,
        sheetName: data.sheetName,
        sheetIndex: data.sheetIndex,
        extractedData: data.extractedData || undefined,
        metadata: data.metadata || undefined,
        status: 'pending',
      },
      include: {
        dataset: { select: { id: true, name: true } },
      },
    });

    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return entry;
  }

  async update(id: string, data: {
    fileName?: string;
    fileType?: string;
    filePath?: string;
    sheetName?: string;
    sheetIndex?: number;
    extractedData?: Prisma.InputJsonValue;
    status?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.getById(id);

    const updateData: Prisma.MixedFileEntryUpdateInput = {};
    if (data.fileName !== undefined) updateData.fileName = data.fileName;
    if (data.fileType !== undefined) updateData.fileType = data.fileType;
    if (data.filePath !== undefined) updateData.filePath = data.filePath;
    if (data.sheetName !== undefined) updateData.sheetName = data.sheetName;
    if (data.sheetIndex !== undefined) updateData.sheetIndex = data.sheetIndex;
    if (data.extractedData !== undefined) updateData.extractedData = data.extractedData;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const updated = await prisma.mixedFileEntry.update({
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
    await prisma.mixedFileEntry.delete({ where: { id } });
    await Promise.all([
      cacheDel(`${CACHE_PREFIX}:${id}`),
      cacheDel(`${CACHE_PREFIX}:list:*`),
    ]);
    return { deleted: true };
  }
}

export const mixedFilesService = new MixedFilesService();
