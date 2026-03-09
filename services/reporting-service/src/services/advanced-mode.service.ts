import { prisma } from '../utils/prisma';
import { NotFoundError, BadRequestError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { reportBuilderService } from './report-builder.service';
import { templateEngineService } from './template-engine.service';

const CACHE_PREFIX = 'reporting:advanced-mode';
const CACHE_TTL = 300;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  cacheStrategy?: string;
}

export class ReportAdvancedModeService {
  async list(params: ListParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search } = params;
    const skip = (page - 1) * limit;

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const where: Record<string, unknown> = { mode: 'ADVANCED', deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

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
    if (!record || record.mode !== 'ADVANCED') throw new NotFoundError('AdvancedModeReport', id);

    await cacheSet(cacheKey, record, CACHE_TTL);
    return record;
  }

  async create(data: Record<string, unknown>) {
    const { name, description, queryConfig, dataSources, transformations, customFormulas,
      crossTabConfig, drillDownConfig, parameterizedFilters, outputFormats,
      cacheStrategy, metadata, tenantId, userId } = data;

    if (!queryConfig) throw new BadRequestError('queryConfig is required for advanced mode');
    if (!dataSources || dataSources.length === 0) throw new BadRequestError('At least one data source is required');

    const record = await prisma.reportDefinition.create({
      data: {
        name,
        description: description || null,
        mode: 'ADVANCED',
        status: 'DRAFT',
        reportType: 'advanced-custom',
        outputFormat: 'PDF',
        tenantId: tenantId || 'default',
        createdBy: userId || 'system',
        dataSources: JSON.parse(JSON.stringify(dataSources)),
        config: JSON.parse(JSON.stringify({
          queryConfig, transformations, customFormulas,
          crossTabConfig, drillDownConfig, parameterizedFilters,
          outputFormats: outputFormats || ['pdf'],
          cacheStrategy: cacheStrategy || 'none',
          metadata: metadata || {},
        })),
      },
    });

    logger.info('Advanced-mode report created', { id: record.id });
    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return record;
  }

  async update(id: string, data: Record<string, unknown>) {
    const existing = await this.getById(id) as Record<string, unknown>;
    const updateData: Record<string, unknown> = {};

    if (data.name) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.dataSources) updateData.dataSources = JSON.parse(JSON.stringify(data.dataSources));

    const existingConfig = (existing.config as Record<string, unknown>) || {};
    const configUpdates: Record<string, unknown> = {};
    for (const key of ['queryConfig', 'transformations', 'customFormulas',
      'crossTabConfig', 'drillDownConfig', 'parameterizedFilters',
      'outputFormats', 'cacheStrategy', 'metadata']) {
      if (data[key] !== undefined) configUpdates[key] = data[key];
    }

    if (Object.keys(configUpdates).length > 0) {
      updateData.config = JSON.parse(JSON.stringify({ ...existingConfig, ...configUpdates }));
    }

    const updated = await prisma.reportDefinition.update({ where: { id }, data: updateData });
    logger.info('Advanced-mode report updated', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return updated;
  }

  async remove(id: string) {
    await this.getById(id);
    await prisma.reportDefinition.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    logger.info('Advanced-mode report deleted', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return { deleted: true };
  }

  /**
   * Execute a query against the report's data sources using the data-source service.
   */
  async executeQuery(id: string, queryParams: Record<string, unknown>) {
    const report = await this.getById(id) as Record<string, unknown>;
    const config = report.config as Record<string, unknown>;
    const queryConfig = config.queryConfig || {};

    const dataSources = (report.dataSources as Array<{ datasetId: string }>) || [];
    const results: Record<string, Record<string, unknown>[]> = {};

    for (const ds of dataSources) {
      const dataset = await prisma.dataset.findUnique({ where: { id: ds.datasetId } });
      if (dataset) {
        const datasetRecord = dataset as unknown as Record<string, unknown>;
        let rows: Record<string, unknown>[] = Array.isArray(datasetRecord.data) ? datasetRecord.data as Record<string, unknown>[] : [];

        if (queryParams?.filters) {
          const filters = queryParams.filters as Record<string, unknown>;
          for (const [key, value] of Object.entries(filters)) {
            rows = rows.filter((row: Record<string, unknown>) => row[key] === value);
          }
        }

        if (queryParams?.sortBy) {
          const sortBy = queryParams.sortBy as string;
          const dir = queryParams.sortOrder === 'desc' ? -1 : 1;
          rows.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
            if ((a[sortBy] as string) < (b[sortBy] as string)) return -1 * dir;
            if ((a[sortBy] as string) > (b[sortBy] as string)) return 1 * dir;
            return 0;
          });
        }

        if (queryParams?.limit) rows = rows.slice(0, queryParams.limit as number);

        results[ds.datasetId] = rows;
      }
    }

    logger.info('Advanced query executed', { id, dataSources: dataSources.length });
    return {
      reportId: id,
      status: 'executed',
      dataSources: Object.keys(results).length,
      totalRows: Object.values(results).reduce((sum, r) => sum + r.length, 0),
      data: results,
    };
  }

  /**
   * Generate report in multiple formats.
   */
  async generate(id: string, formats?: string[]) {
    const report = await this.getById(id) as Record<string, unknown>;
    const config = report.config as Record<string, unknown>;
    const outputFormats = formats || (config.outputFormats as string[]) || ['pdf'];

    logger.info('Generating advanced report', { id, formats: outputFormats });

    const buildResult = await reportBuilderService.buildReport(id);
    const outputs: Array<{ format: string; status: string; error?: string }> = [];

    for (const format of outputFormats) {
      const fmt = format.toLowerCase();
      try {
        switch (fmt) {
          case 'pdf':
            await templateEngineService.exportToPDF(id);
            outputs.push({ format: 'pdf', status: 'completed' });
            break;
          case 'word':
          case 'docx':
            await templateEngineService.exportToWord(id);
            outputs.push({ format: 'docx', status: 'completed' });
            break;
          case 'html':
            await templateEngineService.exportToHTML(id);
            outputs.push({ format: 'html', status: 'completed' });
            break;
          case 'excel':
          case 'xlsx':
            await templateEngineService.exportToExcel(id);
            outputs.push({ format: 'xlsx', status: 'completed' });
            break;
          default:
            outputs.push({ format: fmt, status: 'unsupported' });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        outputs.push({ format: fmt, status: 'failed', error: message });
      }
    }

    await prisma.reportDefinition.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });

    return {
      reportId: id,
      buildId: buildResult.buildId,
      formats: outputs,
      status: 'completed',
    };
  }
}

export const reportAdvancedModeService = new ReportAdvancedModeService();
