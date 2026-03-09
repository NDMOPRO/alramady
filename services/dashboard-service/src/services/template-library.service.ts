import { v4 as uuidv4 } from 'uuid';
import { Prisma, WidgetType } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet } from '../utils/redis';
import { logger } from '../utils/logger';
import { BaseCrudService, ListParams } from './base/base-crud.service';

// ─── Service ────────────────────────────────────────────────────────────────

export class TemplateLibraryService extends BaseCrudService {
  protected readonly modelName = 'dashboardTemplate';
  protected readonly entityLabel = 'DashboardTemplate';
  protected readonly cachePrefix = 'dashboard:template-library';
  protected readonly cacheTtl = 600;

  protected buildSearchWhere(search: string) {
    return {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  protected buildFilterWhere(params: ListParams) {
    const where: Record<string, unknown> = {};
    if (params.category) where.category = params.category;
    if (params.isPremium !== undefined) where.isPremium = params.isPremium;
    if (params.isPublic !== undefined) where.isPublic = params.isPublic;
    return where;
  }

  async getCategories() {
    const cacheKey = `${this.cachePrefix}:categories`;
    const cached = await cacheGet<string[]>(cacheKey);
    if (cached) return cached;

    const categories = await prisma.dashboardTemplate.findMany({
      select: { category: true },
      distinct: ['category'],
    });
    const result = categories.map((c: { category: string }) => c.category);
    await cacheSet(cacheKey, result, this.cacheTtl);
    return result;
  }

  async applyTemplate(id: string, targetDashboardId: string) {
    const template = await this.getById(id) as Record<string, unknown>;
    const config = (template.templateConfig as Record<string, unknown>) ?? {};

    const updated = await prisma.dashboard.update({
      where: { id: targetDashboardId },
      data: {
        layout: config.layoutConfig ? JSON.parse(JSON.stringify(config.layoutConfig)) : undefined,
        theme: config.themeConfig ? JSON.parse(JSON.stringify(config.themeConfig)) : undefined,
        filters: config.filterConfig ? JSON.parse(JSON.stringify(config.filterConfig)) : undefined,
        updatedAt: new Date(),
      },
    });

    if (config.widgets && Array.isArray(config.widgets)) {
      for (const widgetConfig of config.widgets as Array<Record<string, unknown>>) {
        await prisma.dashboardWidget.create({
          data: {
            dashboardId: targetDashboardId,
            type: ((widgetConfig.type as string) || 'BAR_CHART') as WidgetType,
            title: (widgetConfig.title as string) || 'Widget',
            config: JSON.parse(JSON.stringify(widgetConfig.config ?? {})) as Prisma.InputJsonValue,
            position: JSON.parse(JSON.stringify(widgetConfig.position ?? { x: 0, y: 0 })) as Prisma.InputJsonValue,
            size: JSON.parse(JSON.stringify(widgetConfig.size ?? { w: 4, h: 3 })) as Prisma.InputJsonValue,
            createdAt: new Date(),
          },
        });
      }
    }

    logger.info('Template applied to dashboard', { templateId: id, targetDashboardId });
    await this.invalidateCache(id);
    return { templateId: id, targetDashboardId, dashboard: updated, applied: true };
  }

  /**
   * E03.06: Save any dashboard as a reusable template.
   */
  async saveAsTemplate(params: {
    dashboardId: string;
    name: string;
    nameAr?: string;
    category: string;
    description?: string;
  }) {
    const dashboard = await prisma.dashboard.findFirst({
      where: { id: params.dashboardId },
      include: { widgets: true },
    });
    if (!dashboard) throw new Error(`Dashboard ${params.dashboardId} not found`);

    const templateConfig = {
      theme: dashboard.theme,
      filters: dashboard.filters,
      layout: dashboard.layout,
      settings: dashboard.settings,
      widgets: dashboard.widgets.map((w) => ({
        type: w.type,
        title: w.title,
        config: w.config,
        position: w.position,
        size: w.size,
        style: w.style,
        sortOrder: w.sortOrder,
      })),
    };

    const template = await prisma.dashboardTemplate.create({
      data: {
        name: params.name,
        description: params.description || `قالب من: ${dashboard.name}`,
        category: params.category,
        templateConfig: templateConfig as Prisma.InputJsonValue,
        isPublic: true,
        isPremium: false,
      },
    });

    logger.info('Dashboard saved as template', { dashboardId: params.dashboardId, templateId: template.id });
    await this.invalidateCache();
    return template;
  }

  /**
   * E03.06: Create a new dashboard from a template with new data binding.
   */
  async createFromTemplate(params: {
    templateId: string;
    userId: string;
    tenantId: string;
    newDatasetId: string;
    name: string;
  }) {
    const template = await prisma.dashboardTemplate.findUnique({ where: { id: params.templateId } });
    if (!template) throw new Error(`Template ${params.templateId} not found`);

    const config = (template.templateConfig as Record<string, unknown>) ?? {};
    const templateWidgets = (config.widgets as Array<Record<string, unknown>>) ?? [];

    const dashboard = await prisma.dashboard.create({
      data: {
        tenantId: params.tenantId,
        createdById: params.userId,
        name: params.name,
        slug: `${params.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        layout: (config.layout ?? { columns: 12, rowHeight: 60, widgets: [] }) as Prisma.InputJsonValue,
        filters: (config.filters ?? []) as Prisma.InputJsonValue,
        theme: (config.theme ?? {}) as Prisma.InputJsonValue,
        settings: (config.settings ?? {}) as Prisma.InputJsonValue,
      },
    });

    // Create widgets with new dataset binding
    for (const widgetConfig of templateWidgets) {
      const wConfig = (widgetConfig.config as Record<string, unknown>) ?? {};
      const updatedConfig = {
        ...wConfig,
        dataBinding: {
          ...(wConfig.dataBinding as Record<string, unknown> ?? {}),
          datasetId: params.newDatasetId,
        },
      };

      await prisma.dashboardWidget.create({
        data: {
          dashboardId: dashboard.id,
          type: ((widgetConfig.type as string) || 'BAR_CHART') as WidgetType,
          title: (widgetConfig.title as string) || 'Widget',
          config: updatedConfig as Prisma.InputJsonValue,
          position: (widgetConfig.position ?? { x: 0, y: 0 }) as Prisma.InputJsonValue,
          size: (widgetConfig.size ?? { w: 4, h: 3 }) as Prisma.InputJsonValue,
          datasetId: params.newDatasetId,
          sortOrder: (widgetConfig.sortOrder as number) || 0,
        },
      });
    }

    logger.info('Dashboard created from template', { templateId: params.templateId, dashboardId: dashboard.id });
    return { id: dashboard.id, name: dashboard.name, widgetCount: templateWidgets.length };
  }

  /**
   * E03.06: Compare two dashboards — find common elements and differences.
   */
  async compareDashboards(dashboardId1: string, dashboardId2: string) {
    const [d1, d2] = await Promise.all([
      prisma.dashboard.findFirst({ where: { id: dashboardId1 }, include: { widgets: true } }),
      prisma.dashboard.findFirst({ where: { id: dashboardId2 }, include: { widgets: true } }),
    ]);

    if (!d1) throw new Error(`Dashboard ${dashboardId1} not found`);
    if (!d2) throw new Error(`Dashboard ${dashboardId2} not found`);

    const d1Types = d1.widgets.map((w) => w.type);
    const d2Types = d2.widgets.map((w) => w.type);
    const commonTypes = d1Types.filter((t) => d2Types.includes(t));

    const differences: string[] = [];
    if (d1.widgets.length !== d2.widgets.length) {
      differences.push(`عدد العناصر: ${d1.widgets.length} vs ${d2.widgets.length}`);
    }

    const d1Theme = JSON.stringify(d1.theme);
    const d2Theme = JSON.stringify(d2.theme);
    if (d1Theme !== d2Theme) {
      differences.push('الثيم مختلف');
    }

    const d1TypeSet = new Set(d1Types);
    const d2TypeSet = new Set(d2Types);
    const onlyInD1 = [...d1TypeSet].filter((t) => !d2TypeSet.has(t));
    const onlyInD2 = [...d2TypeSet].filter((t) => !d1TypeSet.has(t));
    if (onlyInD1.length > 0) differences.push(`أنواع فريدة في الأولى: ${onlyInD1.join(', ')}`);
    if (onlyInD2.length > 0) differences.push(`أنواع فريدة في الثانية: ${onlyInD2.join(', ')}`);

    logger.info('Dashboards compared', { dashboardId1, dashboardId2 });

    return {
      dashboard1: { id: d1.id, name: d1.name, elementsCount: d1.widgets.length },
      dashboard2: { id: d2.id, name: d2.name, elementsCount: d2.widgets.length },
      commonElements: commonTypes.length,
      differences,
    };
  }

  /**
   * E03.06: Auto-generate KPI definitions from dataset schema.
   */
  async autoGenerateKPIs(datasetId: string) {
    const datasets = await prisma.$queryRawUnsafe<Array<{ id: string; schema_json: string; name: string }>>(
      `SELECT id, schema_json::text as schema_json, name FROM datasets WHERE id = $1`,
      datasetId,
    );
    if (!datasets || datasets.length === 0) {
      throw new Error(`Dataset ${datasetId} not found`);
    }

    const schema = typeof datasets[0].schema_json === 'string'
      ? JSON.parse(datasets[0].schema_json)
      : datasets[0].schema_json ?? [];

    // Detect numeric columns for KPI generation
    const columns = Array.isArray(schema)
      ? schema
      : (schema.columns ?? schema.fields ?? []);

    const kpis: Array<{
      name: string;
      nameAr: string;
      formula: string;
      column: string;
      unit: string;
      format: string;
    }> = [];

    for (const col of columns as Array<{ name: string; type: string }>) {
      const colType = (col.type || '').toLowerCase();
      const isNumeric = ['number', 'numeric', 'integer', 'decimal', 'float', 'double', 'int', 'bigint'].includes(colType);

      if (!isNumeric) continue;

      kpis.push({
        name: `Total ${col.name}`,
        nameAr: `إجمالي ${col.name}`,
        formula: 'SUM',
        column: col.name,
        unit: '',
        format: 'number',
      });

      kpis.push({
        name: `Average ${col.name}`,
        nameAr: `متوسط ${col.name}`,
        formula: 'AVG',
        column: col.name,
        unit: '',
        format: 'decimal',
      });
    }

    // Always add a count KPI
    kpis.push({
      name: 'Record Count',
      nameAr: 'عدد السجلات',
      formula: 'COUNT',
      column: '*',
      unit: '',
      format: 'integer',
    });

    logger.info('KPIs auto-generated', { datasetId, kpiCount: kpis.length });
    return kpis.slice(0, 10);
  }
}

export const templateLibraryService = new TemplateLibraryService();
