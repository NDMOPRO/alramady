import { prisma } from '../utils/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';

const CACHE_PREFIX = 'reporting:template-library';
const CACHE_TTL = 600;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  category?: string;
  isPremium?: boolean;
  isPublic?: boolean;
}

export class ReportTemplateLibraryService {
  async list(params: ListParams) {
    const { page, limit, sortBy = 'createdAt', sortOrder, search, category, isPremium, isPublic } = params;
    const skip = (page - 1) * limit;

    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
    const cached = await cacheGet<{ data: unknown[]; total: number }>(cacheKey);
    if (cached) return cached;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (category) where.category = category;
    if (isPremium !== undefined) where.isPremium = isPremium;
    if (isPublic !== undefined) where.isPublic = isPublic;

    const [data, total] = await Promise.all([
      prisma.reportTemplate.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder } }),
      prisma.reportTemplate.count({ where }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const record = await prisma.reportTemplate.findUnique({ where: { id } });
    if (!record) throw new NotFoundError('ReportTemplate', id);

    await cacheSet(cacheKey, record, CACHE_TTL);
    return record;
  }

  async create(data: Record<string, any>) {
    const record = await prisma.reportTemplate.create({
      data: {
        ...data,
        tenantId: data.tenantId,
        createdBy: data.userId || data.createdBy,
      } as any,
    });
    logger.info('Report template created', { id: record.id, category: data.category });
    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return record;
  }

  async update(id: string, data: Record<string, any>) {
    await this.getById(id);
    const updated = await prisma.reportTemplate.update({ where: { id }, data: data as any });
    logger.info('Report template updated', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return updated;
  }

  async remove(id: string) {
    await this.getById(id);
    await prisma.reportTemplate.delete({ where: { id } });
    logger.info('Report template deleted', { id });
    await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list:*`)]);
    return { deleted: true };
  }

  async duplicate(id: string) {
    const source = await this.getById(id) as Record<string, any>;
    const {
      id: _id,
      createdAt,
      updatedAt,
      deletedAt,
      ...rest
    } = source;
    const record = await prisma.reportTemplate.create({
      data: {
        ...rest,
        name: `${rest.name} (Copy)`,
        isPublic: false,
        version: 1,
        status: rest.status,
        tenantId: rest.tenantId,
        createdBy: rest.createdBy,
        updatedBy: rest.updatedBy,
        description: rest.description,
        category: rest.category,
        subcategory: rest.subcategory,
        html: rest.html,
        variables: rest.variables,
        templateConfig: rest.templateConfig,
        layoutData: rest.layoutData,
        defaultDataBindings: rest.defaultDataBindings,
        supportedOutputFormats: rest.supportedOutputFormats,
        thumbnailUrl: rest.thumbnailUrl,
        isPremium: rest.isPremium,
        isSystem: false,
        tags: rest.tags,
        settings: rest.settings,
      } as any,
    });
    logger.info('Report template duplicated', { sourceId: id, newId: record.id });
    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return record;
  }

  async getCategories() {
    const cacheKey = `${CACHE_PREFIX}:categories`;
    const cached = await cacheGet<string[]>(cacheKey);
    if (cached) return cached;

    const categories = await prisma.reportTemplate.findMany({
      select: { category: true },
      distinct: ['category'],
    });
    const result = categories.map((c) => c.category as string);
    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  async applyTemplate(id: string, targetReportId: string) {
    const template = await this.getById(id) as Record<string, any>;
    logger.info('Report template applied', { templateId: id, targetReportId });
    return { templateId: id, targetReportId, config: template.templateConfig, applied: true };
  }

  async saveReportAsTemplate(reportId: string, name: string, category: string, userId: string, tenantId: string) {
    const report = await prisma.report.findUnique({ where: { id: reportId } }) as unknown as Record<string, any>;
    if (!report) throw new NotFoundError('Report', reportId);

    const record = await prisma.reportTemplate.create({
      data: {
        tenantId,
        createdBy: userId,
        updatedBy: userId,
        name,
        category,
        description: `Template generated from report: ${report.name || reportId}`,
        html: report.html ?? '',
        variables: report.variables ?? {},
        templateConfig: report.config ?? {},
        layoutData: report.layoutData ?? {},
        defaultDataBindings: report.dataBindings ?? {},
        supportedOutputFormats: ['pdf', 'html', 'docx'],
        isPublic: false,
        isPremium: false,
        isSystem: false,
        status: 'draft',
        version: 1,
        tags: [],
        settings: {},
      } as any,
    });

    logger.info('Report saved as template', { reportId, templateId: record.id, name, category });
    await cacheDel(`${CACHE_PREFIX}:list:*`);
    return record;
  }

  async getPreview(id: string) {
    const template = await this.getById(id) as Record<string, any>;

    const variables = template.variables as Record<string, unknown> ?? {};
    const sampleData: Record<string, string> = {};
    for (const key of Object.keys(variables)) {
      sampleData[key] = `[Sample ${key}]`;
    }

    let renderedHtml = template.html || '';
    for (const [key, value] of Object.entries(sampleData)) {
      renderedHtml = renderedHtml.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), value);
    }

    return {
      id,
      name: template.name,
      category: template.category,
      renderedHtml,
      sampleData,
      layoutData: template.layoutData,
      templateConfig: template.templateConfig,
      supportedOutputFormats: template.supportedOutputFormats,
    };
  }
}

export const reportTemplateLibraryService = new ReportTemplateLibraryService();
