import { prisma } from '../utils/prisma';
import { NotFoundError, BadRequestError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { reportBuilderService } from './report-builder.service';
import { templateEngineService } from './template-engine.service';

const CACHE_PREFIX = 'reporting:easy-mode';
const CACHE_TTL = 300;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  reportType?: string;
  outputFormat?: string;
}

export class ReportEasyModeService {
  async list(params: ListParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search, reportType, outputFormat } = params;
    const skip = (page - 1) * limit;

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number; page: number; limit: number; totalPages: number }>(cacheKey);
    if (cached) return cached;

    const where: Record<string, unknown> = { mode: 'EASY', deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (reportType) where.reportType = reportType;
    if (outputFormat) where.outputFormat = outputFormat;

    const [data, total] = await Promise.all([
      prisma.reportDefinition.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder } }),
      prisma.reportDefinition.count({ where }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const record = await prisma.reportDefinition.findUnique({
      where: { id },
      include: { buildOutputs: { take: 1, orderBy: { createdAt: 'desc' } } },
    });
    if (!record || record.mode !== 'EASY') throw new NotFoundError('EasyModeReport', id);

    await cacheSet(cacheKey, record, CACHE_TTL);
    return record;
  }

  async create(data: Record<string, unknown>) {
    const { name, description, reportType, dataSourceId, datasetId, layoutConfig,
      chartConfig, filterConfig, groupByFields, aggregations, colorScheme,
      outputFormat, scheduleConfig, isPublic, tags, metadata, tenantId, userId } = data;

    const record = await prisma.reportDefinition.create({
      data: {
        name,
        description: description || null,
        mode: 'EASY',
        status: 'DRAFT',
        reportType: reportType || 'general',
        outputFormat: (outputFormat || 'PDF').toUpperCase(),
        tenantId: tenantId || 'default',
        createdBy: userId || 'system',
        config: JSON.parse(JSON.stringify({
          dataSourceId, datasetId, layoutConfig, chartConfig,
          filterConfig, groupByFields, aggregations, colorScheme,
          scheduleConfig, isPublic, tags, metadata,
        })),
        settings: JSON.parse(JSON.stringify({ colorScheme: colorScheme || 'default' })),
        metadata: JSON.parse(JSON.stringify({ tags: tags || [] })),
      },
    });

    logger.info('Easy-mode report created', { id: record.id, reportType });
    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return record;
  }

  async update(id: string, data: Record<string, unknown>) {
    const existing = await this.getById(id) as Record<string, unknown>;
    const updateData: Record<string, unknown> = {};

    if (data.name) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.reportType) updateData.reportType = data.reportType;
    if (data.outputFormat) updateData.outputFormat = (data.outputFormat as string).toUpperCase();

    const existingConfig = (existing.config as Record<string, unknown>) || {};
    const configUpdates: Record<string, unknown> = {};
    for (const key of ['dataSourceId', 'datasetId', 'layoutConfig', 'chartConfig',
      'filterConfig', 'groupByFields', 'aggregations', 'colorScheme',
      'scheduleConfig', 'isPublic', 'tags', 'metadata']) {
      if (data[key] !== undefined) configUpdates[key] = data[key];
    }

    if (Object.keys(configUpdates).length > 0) {
      updateData.config = JSON.parse(JSON.stringify({ ...existingConfig, ...configUpdates }));
    }

    const updated = await prisma.reportDefinition.update({ where: { id }, data: updateData });
    logger.info('Easy-mode report updated', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return updated;
  }

  async remove(id: string) {
    await this.getById(id);
    await prisma.reportDefinition.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    logger.info('Easy-mode report deleted', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return { deleted: true };
  }

  async duplicate(id: string) {
    const source = await this.getById(id) as Record<string, unknown>;
    const record = await prisma.reportDefinition.create({
      data: {
        name: `${source.name} (Copy)`,
        description: source.description,
        mode: 'EASY',
        status: 'DRAFT',
        reportType: source.reportType,
        outputFormat: source.outputFormat,
        tenantId: source.tenantId,
        createdBy: source.createdBy,
        config: source.config,
        settings: source.settings,
        metadata: source.metadata,
      },
    });
    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return record;
  }

  async generate(id: string, outputFormat?: string) {
    const report = await this.getById(id) as Record<string, unknown>;
    logger.info('Generating easy-mode report', { id, format: outputFormat || report.outputFormat });

    // Use the report-builder pipeline
    const buildResult = await reportBuilderService.buildReport(id);
    const format = (outputFormat || report.outputFormat || 'PDF').toLowerCase();

    let exportResult: Record<string, unknown> = { buildId: buildResult.buildId };
    switch (format) {
      case 'pdf':
        exportResult.buffer = await templateEngineService.exportToPDF(id);
        exportResult.contentType = 'application/pdf';
        break;
      case 'word':
      case 'docx':
        exportResult.buffer = await templateEngineService.exportToWord(id);
        exportResult.contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'html':
        exportResult.html = await templateEngineService.exportToHTML(id);
        exportResult.contentType = 'text/html';
        break;
      case 'excel':
      case 'xlsx':
        exportResult.buffer = await templateEngineService.exportToExcel(id);
        exportResult.contentType = 'application/vnd.ms-excel';
        break;
      case 'pptx':
      case 'powerpoint':
        exportResult.buffer = await templateEngineService.exportToPowerPoint(id);
        exportResult.contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        break;
      default:
        exportResult.status = 'completed';
    }

    await prisma.reportDefinition.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });

    return { reportId: id, format, status: 'completed', ...exportResult };
  }

  async schedule(id: string, scheduleConfig: Record<string, unknown>) {
    const report = await this.getById(id) as Record<string, unknown>;
    const existingConfig = (report.config as Record<string, unknown>) || {};
    const updated = await prisma.reportDefinition.update({
      where: { id },
      data: {
        config: JSON.parse(JSON.stringify({ ...existingConfig, scheduleConfig })),
      },
    });
    logger.info('Easy-mode report schedule configured', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return updated;
  }

  async preview(id: string) {
    const report = await this.getById(id) as Record<string, unknown>;
    const buildResult = await reportBuilderService.buildReport(id);
    return {
      reportId: id,
      name: report.name,
      preview: true,
      format: 'html',
      sections: buildResult.renderedSections,
    };
  }

  async exportReport(id: string, format: string) {
    return this.generate(id, format);
  }

  /**
   * Auto-compose: one-click generation using report type defaults.
   */
  async autoCompose(id: string) {
    const report = await this.getById(id) as Record<string, unknown>;
    const config = (report.config as Record<string, unknown>) || {};

    const buildResult = await reportBuilderService.buildReport(id);

    const format = ((report.outputFormat as string) || 'PDF').toLowerCase();
    let output: unknown;
    if (format === 'pdf') {
      output = await templateEngineService.exportToPDF(id);
    } else if (format === 'html') {
      output = await templateEngineService.exportToHTML(id);
    } else {
      output = await templateEngineService.exportToExcel(id);
    }

    await prisma.reportDefinition.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });

    logger.info('Auto-compose completed', { id, format });
    return {
      reportId: id,
      status: 'completed',
      format,
      buildId: buildResult.buildId,
      sectionCount: buildResult.sectionCount,
    };
  }

  /**
   * Get available report types from the registry.
   */
  async getReportTypes() {
    const { reportTypeRegistry } = await import('./report-type-registry.service');
    return reportTypeRegistry.getAllTypes();
  }
}

export const reportEasyModeService = new ReportEasyModeService();
