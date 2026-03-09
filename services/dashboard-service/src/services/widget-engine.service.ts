import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const ChartConfigSchema = z.object({
  chartType: z.enum(['bar', 'line', 'pie', 'area', 'scatter', 'donut', 'radar', 'heatmap']),
  xAxis: z.object({ field: z.string(), label: z.string().optional(), format: z.string().optional() }),
  yAxis: z.object({ field: z.string(), label: z.string().optional(), format: z.string().optional(), aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max']).optional() }),
  series: z.array(z.object({ field: z.string(), label: z.string(), color: z.string().optional() })).optional(),
  legend: z.object({ position: z.enum(['top', 'bottom', 'left', 'right', 'none']), show: z.boolean() }).optional(),
  stacked: z.boolean().optional(),
  animated: z.boolean().optional(),
});

const TableConfigSchema = z.object({
  columns: z.array(z.object({
    field: z.string(),
    header: z.string(),
    width: z.number().optional(),
    sortable: z.boolean().optional(),
    filterable: z.boolean().optional(),
    format: z.string().optional(),
    alignment: z.enum(['left', 'center', 'right']).optional(),
  })),
  pagination: z.object({ enabled: z.boolean(), pageSize: z.number() }).optional(),
  striped: z.boolean().optional(),
  bordered: z.boolean().optional(),
});

const MetricCardConfigSchema = z.object({
  metricField: z.string(),
  aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max', 'last']),
  label: z.string(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  format: z.string().optional(),
  comparisonField: z.string().optional(),
  comparisonType: z.enum(['previous_period', 'target', 'custom']).optional(),
  thresholds: z.array(z.object({ value: z.number(), color: z.string(), label: z.string() })).optional(),
  icon: z.string().optional(),
  sparkline: z.boolean().optional(),
});

const FilterConfigSchema = z.object({
  filterType: z.enum(['dropdown', 'date_range', 'slider', 'text_search', 'checkbox', 'radio']),
  targetField: z.string(),
  label: z.string(),
  defaultValue: z.unknown().optional(),
  options: z.array(z.object({ label: z.string(), value: z.unknown() })).optional(),
  multiSelect: z.boolean().optional(),
  affectedWidgets: z.array(z.string()).optional(),
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export type WidgetType = 'chart' | 'table' | 'metric_card' | 'map' | 'text' | 'image' | 'filter';

export interface Widget {
  id: string;
  dashboardId: string;
  type: WidgetType;
  title: string;
  config: Record<string, unknown>;
  dataSource: WidgetDataSource;
  layout: WidgetLayout;
  refreshInterval?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WidgetDataSource {
  type: 'query' | 'dataset' | 'api' | 'static';
  query?: string;
  datasetId?: string;
  apiUrl?: string;
  staticData?: unknown[];
  filters?: Record<string, unknown>;
}

export interface WidgetLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface WidgetTemplate {
  id: string;
  name: string;
  description: string;
  type: WidgetType;
  config: Record<string, unknown>;
  previewImage?: string;
  category: string;
  tags: string[];
}

export interface WidgetInteraction {
  sourceWidgetId: string;
  targetWidgetId: string;
  interactionType: 'filter' | 'drill_down' | 'highlight' | 'navigate';
  sourceField: string;
  targetField: string;
  config?: Record<string, unknown>;
}

export interface WidgetData {
  widgetId: string;
  data: unknown[];
  metadata: { totalRows: number; fetchedAt: Date; queryDurationMs: number };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class WidgetEngineService {
  private widgetValidators: Map<WidgetType, z.ZodSchema>;

  constructor(private prisma: PrismaClient) {
    this.widgetValidators = new Map();
    this.widgetValidators.set('chart', ChartConfigSchema);
    this.widgetValidators.set('table', TableConfigSchema);
    this.widgetValidators.set('metric_card', MetricCardConfigSchema);
    this.widgetValidators.set('filter', FilterConfigSchema);
  }

  async createWidget(
    dashboardId: string,
    type: WidgetType,
    title: string,
    config: Record<string, unknown>,
    dataSource: WidgetDataSource,
    layout: WidgetLayout,
  ): Promise<Widget> {
    const validationResult = this.validateWidgetConfig(type, config);
    if (!validationResult.valid) {
      throw new Error(`Widget config validation failed: ${validationResult.errors.join(', ')}`);
    }

    const layoutValidation = this.validateLayout(layout);
    if (!layoutValidation.valid) {
      throw new Error(`Layout validation failed: ${layoutValidation.errors.join(', ')}`);
    }

    const existingWidgets = await this.prisma.widget.findMany({
      where: { dashboardId },
      select: { id: true, layout: true },
    });

    const adjustedLayout = this.resolveLayoutCollisions(
      layout,
      existingWidgets.map(w => ({ id: w.id, layout: JSON.parse(w.layout as string) })),
    );

    const widget = await this.prisma.widget.create({
      data: {
        dashboardId,
        type,
        title,
        config: JSON.stringify(config),
        dataSource: JSON.stringify(dataSource),
        layout: JSON.stringify(adjustedLayout),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return {
      id: widget.id,
      dashboardId,
      type,
      title,
      config,
      dataSource,
      layout: adjustedLayout,
      createdAt: widget.createdAt,
      updatedAt: widget.updatedAt,
    };
  }

  validateWidgetConfig(type: WidgetType, config: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const validator = this.widgetValidators.get(type);
    if (!validator) {
      return { valid: true, errors: [] };
    }

    const result = validator.safeParse(config);
    if (result.success) {
      return { valid: true, errors: [] };
    }

    const errors = result.error.issues.map(issue => {
      const path = issue.path.join('.');
      return `${path}: ${issue.message}`;
    });

    return { valid: false, errors };
  }

  private validateLayout(layout: WidgetLayout): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (layout.x < 0) errors.push('x position must be non-negative');
    if (layout.y < 0) errors.push('y position must be non-negative');
    if (layout.width <= 0) errors.push('width must be positive');
    if (layout.height <= 0) errors.push('height must be positive');
    if (layout.width > 24) errors.push('width cannot exceed 24 grid units');
    if (layout.minWidth && layout.width < layout.minWidth) errors.push('width is less than minimum');
    if (layout.minHeight && layout.height < layout.minHeight) errors.push('height is less than minimum');
    if (layout.maxWidth && layout.width > layout.maxWidth) errors.push('width exceeds maximum');
    if (layout.maxHeight && layout.height > layout.maxHeight) errors.push('height exceeds maximum');
    return { valid: errors.length === 0, errors };
  }

  private resolveLayoutCollisions(
    newLayout: WidgetLayout,
    existingWidgets: { id: string; layout: WidgetLayout }[],
  ): WidgetLayout {
    let adjusted = { ...newLayout };
    let hasCollision = true;
    let maxIterations = 50;

    while (hasCollision && maxIterations > 0) {
      hasCollision = false;
      for (const existing of existingWidgets) {
        const ex = existing.layout;
        const overlapsX = adjusted.x < ex.x + ex.width && adjusted.x + adjusted.width > ex.x;
        const overlapsY = adjusted.y < ex.y + ex.height && adjusted.y + adjusted.height > ex.y;

        if (overlapsX && overlapsY) {
          adjusted = { ...adjusted, y: ex.y + ex.height };
          hasCollision = true;
          break;
        }
      }
      maxIterations -= 1;
    }

    return adjusted;
  }

  async updateWidget(widgetId: string, updates: Partial<Pick<Widget, 'title' | 'config' | 'dataSource' | 'layout'>>): Promise<Widget> {
    const existing = await this.prisma.widget.findUniqueOrThrow({ where: { id: widgetId } });
    const currentType = existing.type as WidgetType;

    if (updates.config) {
      const validation = this.validateWidgetConfig(currentType, updates.config);
      if (!validation.valid) {
        throw new Error(`Config validation failed: ${validation.errors.join(', ')}`);
      }
    }

    if (updates.layout) {
      const layoutValidation = this.validateLayout(updates.layout);
      if (!layoutValidation.valid) {
        throw new Error(`Layout validation failed: ${layoutValidation.errors.join(', ')}`);
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.title) updateData.title = updates.title;
    if (updates.config) updateData.config = JSON.stringify(updates.config);
    if (updates.dataSource) updateData.dataSource = JSON.stringify(updates.dataSource);
    if (updates.layout) updateData.layout = JSON.stringify(updates.layout);

    const updated = await this.prisma.widget.update({
      where: { id: widgetId },
      data: updateData,
    });

    return {
      id: updated.id,
      dashboardId: updated.dashboardId,
      type: updated.type as WidgetType,
      title: updated.title,
      config: JSON.parse(updated.config as string),
      dataSource: JSON.parse(updated.dataSource as string),
      layout: JSON.parse(updated.layout as string),
      refreshInterval: updated.refreshInterval || undefined,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async fetchWidgetData(widgetId: string, filters?: Record<string, unknown>): Promise<WidgetData> {
    const widget = await this.prisma.widget.findUniqueOrThrow({ where: { id: widgetId } });
    const dataSource: WidgetDataSource = JSON.parse(widget.dataSource as string);
    const startTime = Date.now();
    let data: unknown[] = [];

    if (dataSource.type === 'static') {
      data = dataSource.staticData || [];
    } else if (dataSource.type === 'query' && dataSource.query) {
      let query = dataSource.query;
      const mergedFilters = { ...dataSource.filters, ...filters };

      if (Object.keys(mergedFilters).length > 0) {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        for (const [field, value] of Object.entries(mergedFilters)) {
          if (value === null || value === undefined) continue;
          const safeField = `"${field.replace(/[^a-zA-Z0-9_]/g, '')}"`;
          if (Array.isArray(value)) {
            const placeholders = value.map(() => `$${paramIdx++}`).join(', ');
            conditions.push(`${safeField} IN (${placeholders})`);
            params.push(...value);
          } else if (typeof value === 'object' && value !== null) {
            const rangeVal = value as { min?: unknown; max?: unknown };
            if (rangeVal.min !== undefined) {
              conditions.push(`${safeField} >= $${paramIdx++}`);
              params.push(rangeVal.min);
            }
            if (rangeVal.max !== undefined) {
              conditions.push(`${safeField} <= $${paramIdx++}`);
              params.push(rangeVal.max);
            }
          } else {
            conditions.push(`${safeField} = $${paramIdx++}`);
            params.push(value);
          }
        }

        if (conditions.length > 0) {
          const whereClause = conditions.join(' AND ');
          if (query.toLowerCase().includes('where')) {
            query = query.replace(/WHERE/i, `WHERE ${whereClause} AND`);
          } else {
            const fromMatch = query.match(/FROM\s+\S+/i);
            if (fromMatch) {
              const insertPos = (fromMatch.index || 0) + fromMatch[0].length;
              query = query.slice(0, insertPos) + ` WHERE ${whereClause}` + query.slice(insertPos);
            }
          }
          data = await this.prisma.$queryRawUnsafe(query, ...params) as unknown[];
        } else {
          data = await this.prisma.$queryRawUnsafe(query) as unknown[];
        }
      } else {
        data = await this.prisma.$queryRawUnsafe(query) as unknown[];
      }
    } else if (dataSource.type === 'dataset' && dataSource.datasetId) {
      const dataset = await this.prisma.dataset.findUniqueOrThrow({
        where: { id: dataSource.datasetId },
      });
      const safeTable = (dataset.source || '').replace(/[^a-zA-Z0-9_]/g, '');
      data = await this.prisma.$queryRawUnsafe(
        `SELECT * FROM "${safeTable}" LIMIT 10000`,
      ) as unknown[];
    }

    const queryDurationMs = Date.now() - startTime;

    await this.prisma.widgetDataFetch.create({
      data: {
        widgetId,
        rowsFetched: data.length,
        queryDurationMs,
        filters: filters ? JSON.stringify(filters) : null,
        fetchedAt: new Date(),
      },
    });

    return {
      widgetId,
      data,
      metadata: { totalRows: data.length, fetchedAt: new Date(), queryDurationMs },
    };
  }

  async updateDashboardLayout(
    dashboardId: string,
    layouts: { widgetId: string; layout: WidgetLayout }[],
  ): Promise<void> {
    const existingWidgets = await this.prisma.widget.findMany({
      where: { dashboardId },
      select: { id: true },
    });

    const existingIds = new Set(existingWidgets.map(w => w.id));
    const invalidIds = layouts.filter(l => !existingIds.has(l.widgetId)).map(l => l.widgetId);
    if (invalidIds.length > 0) {
      throw new Error(`Widgets not found in dashboard: ${invalidIds.join(', ')}`);
    }

    for (const { widgetId, layout } of layouts) {
      const validation = this.validateLayout(layout);
      if (!validation.valid) {
        throw new Error(`Invalid layout for widget ${widgetId}: ${validation.errors.join(', ')}`);
      }
    }

    const collisions = this.detectCollisions(layouts);
    if (collisions.length > 0) {
      throw new Error(`Layout collisions detected: ${collisions.map(c => `${c[0]} <-> ${c[1]}`).join(', ')}`);
    }

    for (const { widgetId, layout } of layouts) {
      await this.prisma.widget.update({
        where: { id: widgetId },
        data: { layout: JSON.stringify(layout), updatedAt: new Date() },
      });
    }

    await this.prisma.dashboardLayoutHistory.create({
      data: {
        dashboardId,
        layouts: JSON.stringify(layouts),
        savedAt: new Date(),
      },
    });
  }

  private detectCollisions(layouts: { widgetId: string; layout: WidgetLayout }[]): [string, string][] {
    const collisions: [string, string][] = [];
    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const a = layouts[i].layout;
        const b = layouts[j].layout;
        const overlapsX = a.x < b.x + b.width && a.x + a.width > b.x;
        const overlapsY = a.y < b.y + b.height && a.y + a.height > b.y;
        if (overlapsX && overlapsY) {
          collisions.push([layouts[i].widgetId, layouts[j].widgetId]);
        }
      }
    }
    return collisions;
  }

  async createWidgetFromTemplate(
    dashboardId: string,
    templateId: string,
    layout: WidgetLayout,
    overrides?: { title?: string; dataSource?: WidgetDataSource; config?: Record<string, unknown> },
  ): Promise<Widget> {
    const template = await this.prisma.widgetTemplate.findUniqueOrThrow({
      where: { id: templateId },
    });

    const templateConfig: Record<string, unknown> = JSON.parse(template.config as string);
    const mergedConfig = { ...templateConfig, ...(overrides?.config || {}) };

    const dataSource: WidgetDataSource = overrides?.dataSource || {
      type: 'static',
      staticData: [],
    };

    const widget = await this.createWidget(
      dashboardId,
      template.type as WidgetType,
      overrides?.title || template.name,
      mergedConfig,
      dataSource,
      layout,
    );

    await this.prisma.widgetTemplate.update({
      where: { id: templateId },
      data: { usageCount: { increment: 1 } },
    });

    return widget;
  }

  async listTemplates(type?: WidgetType, category?: string): Promise<WidgetTemplate[]> {
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (category) where.category = category;

    const templates = await this.prisma.widgetTemplate.findMany({
      where,
      orderBy: { usageCount: 'desc' },
    });

    return templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      type: t.type as WidgetType,
      config: JSON.parse(t.config as string),
      previewImage: t.previewImage || undefined,
      category: t.category,
      tags: JSON.parse(t.tags as string || '[]'),
    }));
  }

  async saveAsTemplate(
    widgetId: string,
    name: string,
    description: string,
    category: string,
    tags: string[],
  ): Promise<WidgetTemplate> {
    const widget = await this.prisma.widget.findUniqueOrThrow({ where: { id: widgetId } });

    const template = await this.prisma.widgetTemplate.create({
      data: {
        name,
        description,
        type: widget.type,
        config: widget.config as string,
        category,
        tags: JSON.stringify(tags),
        createdAt: new Date(),
        usageCount: 0,
      },
    });

    return {
      id: template.id,
      name,
      description,
      type: widget.type as WidgetType,
      config: JSON.parse(widget.config as string),
      category,
      tags,
    };
  }

  async addInteraction(interaction: WidgetInteraction): Promise<WidgetInteraction> {
    const sourceWidget = await this.prisma.widget.findUniqueOrThrow({
      where: { id: interaction.sourceWidgetId },
    });
    const targetWidget = await this.prisma.widget.findUniqueOrThrow({
      where: { id: interaction.targetWidgetId },
    });

    if (sourceWidget.dashboardId !== targetWidget.dashboardId) {
      throw new Error('Cross-dashboard widget interactions are not supported');
    }

    const existingInteraction = await this.prisma.widgetInteraction.findFirst({
      where: {
        sourceWidgetId: interaction.sourceWidgetId,
        targetWidgetId: interaction.targetWidgetId,
        interactionType: interaction.interactionType,
      },
    });

    if (existingInteraction) {
      await this.prisma.widgetInteraction.update({
        where: { id: existingInteraction.id },
        data: {
          sourceField: interaction.sourceField,
          targetField: interaction.targetField,
          config: interaction.config ? JSON.stringify(interaction.config) : null,
          updatedAt: new Date(),
        },
      });
    } else {
      await this.prisma.widgetInteraction.create({
        data: {
          sourceWidgetId: interaction.sourceWidgetId,
          targetWidgetId: interaction.targetWidgetId,
          interactionType: interaction.interactionType,
          sourceField: interaction.sourceField,
          targetField: interaction.targetField,
          config: interaction.config ? JSON.stringify(interaction.config) : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    return interaction;
  }

  async applyWidgetFilter(
    sourceWidgetId: string,
    selectedValue: unknown,
  ): Promise<{ widgetId: string; data: WidgetData }[]> {
    const interactions = await this.prisma.widgetInteraction.findMany({
      where: {
        sourceWidgetId,
        interactionType: 'filter',
      },
    });

    const results: { widgetId: string; data: WidgetData }[] = [];

    for (const interaction of interactions) {
      const targetFilter: Record<string, unknown> = {};
      targetFilter[interaction.targetField] = selectedValue;

      const widgetData = await this.fetchWidgetData(interaction.targetWidgetId, targetFilter);
      results.push({ widgetId: interaction.targetWidgetId, data: widgetData });
    }

    return results;
  }

  async deleteWidget(widgetId: string): Promise<void> {
    await this.prisma.widgetInteraction.deleteMany({
      where: {
        OR: [
          { sourceWidgetId: widgetId },
          { targetWidgetId: widgetId },
        ],
      },
    });

    await this.prisma.widgetDataFetch.deleteMany({ where: { widgetId } });
    await this.prisma.widget.delete({ where: { id: widgetId } });
  }

  async cloneWidget(widgetId: string, targetDashboardId: string): Promise<Widget> {
    const source = await this.prisma.widget.findUniqueOrThrow({ where: { id: widgetId } });

    const widget = await this.createWidget(
      targetDashboardId,
      source.type as WidgetType,
      `${source.title} (Copy)`,
      JSON.parse(source.config as string),
      JSON.parse(source.dataSource as string),
      JSON.parse(source.layout as string),
    );

    return widget;
  }

  async getDashboardWidgets(dashboardId: string): Promise<Widget[]> {
    const widgets = await this.prisma.widget.findMany({
      where: { dashboardId },
      orderBy: { createdAt: 'asc' },
    });

    return widgets.map(w => ({
      id: w.id,
      dashboardId: w.dashboardId,
      type: w.type as WidgetType,
      title: w.title,
      config: JSON.parse(w.config as string),
      dataSource: JSON.parse(w.dataSource as string),
      layout: JSON.parse(w.layout as string),
      refreshInterval: w.refreshInterval || undefined,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }));
  }
}
