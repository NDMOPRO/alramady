import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';

const CACHE_PREFIX = 'reporting:post-edit';
const CACHE_TTL = 300;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  reportId?: string;
  editType?: string;
  isPublished?: boolean;
}

export class ReportPostEditService {
  async list(params: ListParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search, reportId, editType, isPublished } = params;
    const skip = (page - 1) * limit;

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number; page: number; limit: number; totalPages: number }>(cacheKey);
    if (cached) return cached;

    const where: Record<string, any> = {};
    if (search) {
      where.OR = [
        { editType: { contains: search, mode: 'insensitive' } },
        { annotation: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (reportId) where.reportId = reportId;
    if (editType) where.editType = editType;
    if (isPublished !== undefined) where.isPublished = isPublished;

    const [data, total] = await Promise.all([
      prisma.reportPostEdit.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder } }),
      prisma.reportPostEdit.count({ where }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const record = await prisma.reportPostEdit.findUnique({ where: { id } });
    if (!record) throw new NotFoundError('ReportPostEdit', id);

    await cacheSet(cacheKey, record, CACHE_TTL);
    return record;
  }

  async create(data: Record<string, any>) {
    const record = await prisma.reportPostEdit.create({
      data: {
        ...data,
        createdBy: data.userId || data.createdBy,
      } as any,
    });
    logger.info('Report post-edit created', { id: record.id });
    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return record;
  }

  async update(id: string, data: Record<string, any>) {
    await this.getById(id);
    const updated = await prisma.reportPostEdit.update({ where: { id }, data });
    logger.info('Report post-edit updated', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return updated;
  }

  async remove(id: string) {
    await this.getById(id);
    await prisma.reportPostEdit.delete({ where: { id } });
    logger.info('Report post-edit deleted', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return { deleted: true };
  }

  async publish(id: string) {
    const updated = await prisma.reportPostEdit.update({
      where: { id },
      data: { isPublished: true },
    });
    logger.info('Report post-edit published', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return updated;
  }

  async revert(id: string) {
    const record = await this.getById(id) as Record<string, any>;
    const updated = await prisma.reportPostEdit.update({
      where: { id },
      data: { isPublished: false, version: record.version + 1 },
    });
    logger.info('Report post-edit reverted', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return updated;
  }

  async getHistory(reportId: string) {
    const edits = await prisma.reportPostEdit.findMany({
      where: { reportId },
      orderBy: { version: 'desc' },
    });
    return { reportId, totalEdits: edits.length, edits };
  }

  async applyWatermark(id: string, watermarkConfig: Record<string, any>) {
    const updated = await prisma.reportPostEdit.update({
      where: { id },
      data: { watermarkConfig },
    });
    logger.info('Watermark applied to report edit', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return updated;
  }

  async applySectionEdit(reportId: string, sectionId: string, changes: Record<string, any>, userId: string) {
    const latestEdit = await prisma.reportPostEdit.findFirst({
      where: { reportId, targetSectionId: sectionId },
      orderBy: { version: 'desc' },
    });

    const nextVersion = latestEdit ? (latestEdit.version + 1) : 1;

    const record = await prisma.reportPostEdit.create({
      data: {
        reportId,
        editType: 'section_edit',
        targetSectionId: sectionId,
        changes: changes ?? {},
        version: nextVersion,
        isPublished: false,
        status: 'draft',
        tenantId: 'default',
        createdBy: userId,
      },
    });

    logger.info('Section edit applied', { id: record.id, reportId, sectionId, version: nextVersion });
    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return record;
  }

  async getVersionDiff(id: string) {
    const current = await this.getById(id) as Record<string, any>;

    const previousVersion = await prisma.reportPostEdit.findFirst({
      where: {
        reportId: current.reportId,
        targetSectionId: current.targetSectionId,
        version: current.version - 1,
      },
    });

    const currentChanges = current.changes ?? {};
    const previousChanges = previousVersion?.changes ?? {};

    const allKeys = new Set([
      ...Object.keys(currentChanges as Record<string, any>),
      ...Object.keys(previousChanges as Record<string, any>),
    ]);

    const diff: Record<string, { previous: unknown; current: unknown }> = {};
    for (const key of allKeys) {
      const prev = (previousChanges as Record<string, any>)[key];
      const curr = (currentChanges as Record<string, any>)[key];
      if (JSON.stringify(prev) !== JSON.stringify(curr)) {
        diff[key] = { previous: prev ?? null, current: curr ?? null };
      }
    }

    return {
      id,
      reportId: current.reportId,
      targetSectionId: current.targetSectionId,
      currentVersion: current.version,
      previousVersion: previousVersion?.version ?? null,
      diff,
      hasPrevious: !!previousVersion,
    };
  }

  async reexport(id: string, format: string) {
    const record = await this.getById(id) as Record<string, any>;

    logger.info('Re-exporting report with applied edits', { id, reportId: record.reportId, format });

    const allEdits = await prisma.reportPostEdit.findMany({
      where: { reportId: record.reportId, isPublished: true },
      orderBy: { version: 'asc' },
    });

    const mergedChanges: Record<string, any> = {};
    for (const edit of allEdits) {
      const changes = edit.changes as Record<string, any> | null;
      if (changes) {
        Object.assign(mergedChanges, changes);
      }
    }

    const exportResult = {
      reportId: record.reportId,
      format,
      appliedEdits: allEdits.length,
      mergedChanges,
      headerFooterConfig: record.headerFooterConfig,
      watermarkConfig: record.watermarkConfig,
      formatOverrides: record.formatOverrides,
      exportedAt: new Date().toISOString(),
      status: 'completed',
    };

    logger.info('Report re-export completed', { id, reportId: record.reportId, format, editCount: allEdits.length });
    return exportResult;
  }
}

export const reportPostEditService = new ReportPostEditService();
