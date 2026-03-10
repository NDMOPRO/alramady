import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';

const CACHE_PREFIX = 'reporting:compare-schedule';
const CACHE_TTL = 300;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  comparisonType?: string;
  isActive?: boolean;
  status?: string;
}

export class CompareScheduleService {
  async list(params: ListParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search, comparisonType, isActive, status } = params;
    const skip = (page - 1) * limit;

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const where: Record<string, any> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (comparisonType) where.comparisonType = comparisonType;
    if (isActive !== undefined) where.isActive = isActive;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.reportCompareSchedule.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder } }),
      prisma.reportCompareSchedule.count({ where }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const record = await prisma.reportCompareSchedule.findUnique({ where: { id } });
    if (!record) throw new NotFoundError('ReportCompareSchedule', id);

    await cacheSet(cacheKey, record, CACHE_TTL);
    return record;
  }

  async create(data: Record<string, any>) {
    const record = await prisma.reportCompareSchedule.create({
      data: {
        ...data,
        status: 'pending',
        tenantId: data.tenantId,
        createdBy: data.userId || data.createdBy,
      } as any,
    });
    logger.info('Compare schedule created', { id: record.id });
    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return record;
  }

  async update(id: string, data: Record<string, any>) {
    await this.getById(id);
    const updated = await prisma.reportCompareSchedule.update({ where: { id }, data });
    logger.info('Compare schedule updated', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return updated;
  }

  async remove(id: string) {
    await this.getById(id);
    await prisma.reportCompareSchedule.delete({ where: { id } });
    logger.info('Compare schedule deleted', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return { deleted: true };
  }

  async execute(id: string) {
    const record = await this.getById(id) as Record<string, any>;

    logger.info('Compare schedule execution started', { id, reportA: record.reportIdA, reportB: record.reportIdB });

    await prisma.reportCompareSchedule.update({
      where: { id },
      data: { status: 'running' },
    });

    const [reportA, reportB] = await Promise.all([
      prisma.reportDefinition.findUnique({ where: { id: record.reportIdA } }),
      prisma.reportDefinition.findUnique({ where: { id: record.reportIdB } }),
    ]);

    if (!reportA) throw new NotFoundError('Report', record.reportIdA);
    if (!reportB) throw new NotFoundError('Report', record.reportIdB);

    const reportAData = reportA as Record<string, any>;
    const reportBData = reportB as Record<string, any>;
    const comparisonConfig = record.comparisonConfig as Record<string, any> ?? {};
    const thresholds = record.thresholds as Record<string, any> ?? {};

    const reportAConfig = reportAData.config as Record<string, any> | undefined;
    const reportBConfig = reportBData.config as Record<string, any> | undefined;
    const sectionsA = ((reportAData.sections ?? reportAConfig?.sections ?? []) as Record<string, any>[]);
    const sectionsB = ((reportBData.sections ?? reportBConfig?.sections ?? []) as Record<string, any>[]);

    const sectionDiffs: Array<Record<string, any>> = [];
    const allSectionIds = new Set([
      ...sectionsA.map((s: Record<string, any>) => s.id || s.sectionId),
      ...sectionsB.map((s: Record<string, any>) => s.id || s.sectionId),
    ]);

    for (const sectionId of allSectionIds) {
      const sectionA = sectionsA.find((s: Record<string, any>) => (s.id || s.sectionId) === sectionId);
      const sectionB = sectionsB.find((s: Record<string, any>) => (s.id || s.sectionId) === sectionId);

      if (!sectionA) {
        sectionDiffs.push({ sectionId, status: 'added_in_b', diffType: 'section_missing_in_a' });
      } else if (!sectionB) {
        sectionDiffs.push({ sectionId, status: 'removed_in_b', diffType: 'section_missing_in_b' });
      } else {
        const isEqual = JSON.stringify(sectionA) === JSON.stringify(sectionB);
        sectionDiffs.push({
          sectionId,
          status: isEqual ? 'identical' : 'modified',
          diffType: isEqual ? 'no_change' : 'content_changed',
          sectionA: isEqual ? undefined : sectionA,
          sectionB: isEqual ? undefined : sectionB,
        });
      }
    }

    const totalSections = allSectionIds.size;
    const identicalCount = sectionDiffs.filter(d => d.status === 'identical').length;
    const matchPercentage = totalSections > 0 ? Math.round((identicalCount / totalSections) * 100) : 100;

    const resultData: Record<string, any> = {
      executedAt: new Date().toISOString(),
      comparisonType: record.comparisonType,
      reportIdA: record.reportIdA,
      reportIdB: record.reportIdB,
      summary: {
        totalSections,
        identical: identicalCount,
        modified: sectionDiffs.filter(d => d.status === 'modified').length,
        addedInB: sectionDiffs.filter(d => d.status === 'added_in_b').length,
        removedInB: sectionDiffs.filter(d => d.status === 'removed_in_b').length,
        matchPercentage,
      },
      sectionDiffs,
      thresholdsApplied: thresholds,
      comparisonConfig,
    };

    const thresholdMin = (thresholds.minMatchPercentage as number) ?? 0;
    const passedThreshold = matchPercentage >= thresholdMin;

    const updated = await prisma.reportCompareSchedule.update({
      where: { id },
      data: {
        status: passedThreshold ? 'completed' : 'threshold_exceeded',
        resultData: JSON.parse(JSON.stringify(resultData)),
        lastExecutedAt: new Date(),
      },
    });

    logger.info('Compare schedule execution completed', {
      id,
      matchPercentage,
      passedThreshold,
      totalSections,
    });

    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return updated;
  }

  async getResults(id: string) {
    const record = await this.getById(id) as Record<string, any>;
    return {
      id,
      name: record.name,
      reportIdA: record.reportIdA,
      reportIdB: record.reportIdB,
      comparisonType: record.comparisonType,
      status: record.status,
      resultData: record.resultData,
      lastExecutedAt: record.lastExecutedAt,
    };
  }

  async activate(id: string) {
    const updated = await prisma.reportCompareSchedule.update({
      where: { id },
      data: { isActive: true },
    });
    logger.info('Compare schedule activated', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return updated;
  }

  async deactivate(id: string) {
    const updated = await prisma.reportCompareSchedule.update({
      where: { id },
      data: { isActive: false },
    });
    logger.info('Compare schedule deactivated', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return updated;
  }
}

export const compareScheduleService = new CompareScheduleService();
