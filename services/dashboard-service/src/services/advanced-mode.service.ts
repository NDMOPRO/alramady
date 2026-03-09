import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { BaseCrudService, ListParams } from './base/base-crud.service';

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const QueryConfigSchema = z.object({
  query: z.string().min(1).max(10000),
  params: z.record(z.unknown()).optional(),
  timeout: z.number().min(1000).max(60000).optional(),
  maxRows: z.number().min(1).max(50000).optional(),
});

const DataSourceBindingSchema = z.object({
  widgetId: z.string().uuid(),
  dataSource: z.object({
    type: z.enum(['query', 'dataset', 'api', 'computed']),
    query: z.string().optional(),
    datasetId: z.string().uuid().optional(),
    apiUrl: z.string().url().optional(),
    computeExpression: z.string().optional(),
    refreshInterval: z.number().min(0).max(3600).optional(),
    cacheStrategy: z.enum(['none', 'short', 'long']).optional(),
  }),
  columnMapping: z.record(z.string()).optional(),
});

const AdvancedLayoutSchema = z.object({
  dashboardId: z.string().uuid(),
  widgets: z.array(z.object({
    widgetId: z.string().uuid(),
    position: z.object({
      x: z.number().min(0),
      y: z.number().min(0),
      w: z.number().min(1).max(24),
      h: z.number().min(1).max(50),
    }),
    zIndex: z.number().min(0).max(1000).optional(),
    locked: z.boolean().optional(),
    visible: z.boolean().optional(),
  })),
  gridConfig: z.object({
    columns: z.number().min(1).max(24).optional(),
    rowHeight: z.number().min(20).max(200).optional(),
    gap: z.number().min(0).max(50).optional(),
    snapToGrid: z.boolean().optional(),
  }).optional(),
});

const ConditionalFormattingSchema = z.object({
  widgetId: z.string().uuid(),
  rules: z.array(z.object({
    field: z.string(),
    operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'not_contains']),
    value: z.unknown(),
    valueEnd: z.unknown().optional(),
    style: z.object({
      backgroundColor: z.string().optional(),
      textColor: z.string().optional(),
      fontWeight: z.string().optional(),
      icon: z.string().optional(),
      border: z.string().optional(),
    }),
  })),
});

const ComputedFieldSchema = z.object({
  dashboardId: z.string().uuid(),
  name: z.string().min(1).max(100),
  expression: z.string().min(1).max(5000),
  sourceColumns: z.array(z.string()),
  outputType: z.enum(['numeric', 'text', 'boolean', 'date']),
});

// ─── Types ──────────────────────────────────────────────────────────────────

interface QueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  columns: string[];
  executionTimeMs: number;
  cached: boolean;
}

interface ConditionalRule {
  field: string;
  operator: string;
  value: unknown;
  valueEnd?: unknown;
  style: Record<string, string | undefined>;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class AdvancedModeService extends BaseCrudService {
  protected readonly modelName = 'dashboardAdvancedMode';
  protected readonly entityLabel = 'DashboardAdvancedMode';
  protected readonly cachePrefix = 'dashboard:advanced-mode';
  protected readonly cacheTtl = 300;

  protected buildSearchWhere(search: string) {
    return {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  protected buildFilterWhere(params: ListParams) {
    const where: Record<string, unknown> = {};
    if (params.cacheStrategy) where.cacheStrategy = params.cacheStrategy;
    return where;
  }

  /**
   * Execute a custom SQL query against the data warehouse.
   * Supports parameterized queries, timeouts, and result caching.
   */
  async executeQuery(dashboardId: string, queryConfig: z.infer<typeof QueryConfigSchema>): Promise<QueryResult> {
    const validated = QueryConfigSchema.parse(queryConfig);
    const { query, params, timeout, maxRows } = validated;

    logger.info('Executing advanced query', { dashboardId, queryLength: query.length });

    // Security: block dangerous SQL operations
    const upperQuery = query.toUpperCase().trim();
    const blockedKeywords = ['DROP ', 'DELETE ', 'TRUNCATE ', 'ALTER ', 'GRANT ', 'REVOKE ', 'CREATE INDEX', 'INSERT ', 'UPDATE '];
    for (const keyword of blockedKeywords) {
      if (upperQuery.includes(keyword)) {
        throw new Error(`Query contains blocked operation: ${keyword.trim()}`);
      }
    }

    // Ensure query starts with SELECT
    if (!upperQuery.startsWith('SELECT') && !upperQuery.startsWith('WITH')) {
      throw new Error('Only SELECT and WITH (CTE) queries are allowed in advanced mode');
    }

    // Check cache
    const cacheKey = `${this.cachePrefix}:query:${Buffer.from(query + JSON.stringify(params ?? {})).toString('base64').slice(0, 64)}`;
    const cached = await cacheGet<QueryResult>(cacheKey);
    if (cached) {
      logger.info('Returning cached query result', { dashboardId, rowCount: cached.rowCount });
      return { ...cached, cached: true };
    }

    const startTime = Date.now();
    const effectiveMaxRows = maxRows ?? 10000;
    const effectiveTimeout = timeout ?? 30000;

    // Apply row limit
    let limitedQuery = query.trim();
    if (!limitedQuery.toUpperCase().includes('LIMIT')) {
      limitedQuery = `${limitedQuery} LIMIT ${effectiveMaxRows}`;
    }

    // Execute with timeout
    let rows: Array<Record<string, unknown>> = [];
    try {
      await prisma.$queryRawUnsafe(`SET LOCAL statement_timeout = '${effectiveTimeout}'`);
      const rawParams = params ? Object.values(params) : [];
      rows = await prisma.$queryRawUnsafe(limitedQuery, ...rawParams) as Array<Record<string, unknown>>;
    } catch (queryErr) {
      const errMsg = (queryErr as Error).message;
      logger.error('Advanced query execution failed', { dashboardId, error: errMsg });

      if (errMsg.includes('statement timeout') || errMsg.includes('canceling statement')) {
        throw new Error(`Query exceeded timeout of ${effectiveTimeout}ms`);
      }
      throw new Error(`Query execution failed: ${errMsg}`);
    }

    const executionTimeMs = Date.now() - startTime;
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    const result: QueryResult = {
      rows,
      rowCount: rows.length,
      columns,
      executionTimeMs,
      cached: false,
    };

    // Cache if query was fast
    if (executionTimeMs < 5000) {
      const cacheTtl = executionTimeMs < 1000 ? 600 : 120;
      await cacheSet(cacheKey, result, cacheTtl);
    }

    // Log query execution for auditing
    const queryLogId = uuidv4();
    await prisma.$queryRawUnsafe(
      `INSERT INTO dashboard_query_logs (id, dashboard_id, query_hash, row_count, execution_time_ms, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      queryLogId,
      dashboardId,
      cacheKey.slice(-40),
      rows.length,
      executionTimeMs,
      new Date()
    ).catch((logErr: Error) => {
      logger.warn('Failed to log query execution', { error: logErr.message });
    });

    logger.info('Advanced query executed', {
      dashboardId,
      rowCount: rows.length,
      columnCount: columns.length,
      executionTimeMs,
    });

    return result;
  }

  /**
   * Bind a custom data source to a specific widget.
   * Supports query, dataset, API, and computed data sources.
   */
  async bindDataSource(input: z.infer<typeof DataSourceBindingSchema>): Promise<{
    widgetId: string;
    dataSource: Record<string, unknown>;
    bound: boolean;
    boundAt: Date;
  }> {
    const validated = DataSourceBindingSchema.parse(input);
    const now = new Date();

    logger.info('Binding data source in advanced mode', {
      widgetId: validated.widgetId,
      type: validated.dataSource.type,
    });

    // Verify widget exists
    const widgets: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(
      `SELECT id, config, dashboard_id FROM dashboard_widgets WHERE id = $1 AND deleted_at IS NULL`,
      validated.widgetId
    );

    if (!widgets || widgets.length === 0) {
      throw new Error(`Widget ${validated.widgetId} not found`);
    }

    const widget = widgets[0];
    const existingConfig = typeof widget.config === 'string'
      ? JSON.parse(widget.config as string)
      : (widget.config as Record<string, unknown>) ?? {};

    const dataSourceConfig: Record<string, unknown> = {
      type: validated.dataSource.type,
      refreshInterval: validated.dataSource.refreshInterval ?? 0,
      cacheStrategy: validated.dataSource.cacheStrategy ?? 'short',
      boundAt: now.toISOString(),
    };

    if (validated.dataSource.type === 'query' && validated.dataSource.query) {
      dataSourceConfig.query = validated.dataSource.query;
    } else if (validated.dataSource.type === 'dataset' && validated.dataSource.datasetId) {
      // Verify dataset exists
      const datasets: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(
        `SELECT id, name, columns FROM datasets WHERE id = $1`,
        validated.dataSource.datasetId
      );
      if (!datasets || datasets.length === 0) {
        throw new Error(`Dataset ${validated.dataSource.datasetId} not found`);
      }
      dataSourceConfig.datasetId = validated.dataSource.datasetId;
      dataSourceConfig.datasetName = datasets[0].name;
    } else if (validated.dataSource.type === 'api' && validated.dataSource.apiUrl) {
      dataSourceConfig.apiUrl = validated.dataSource.apiUrl;
    } else if (validated.dataSource.type === 'computed' && validated.dataSource.computeExpression) {
      dataSourceConfig.computeExpression = validated.dataSource.computeExpression;
    }

    if (validated.columnMapping) {
      dataSourceConfig.columnMapping = validated.columnMapping;
    }

    const updatedConfig = {
      ...existingConfig,
      advancedDataSource: dataSourceConfig,
    };

    await prisma.$queryRawUnsafe(
      `UPDATE dashboard_widgets SET config = $1, updated_at = $2, dataset_id = $3 WHERE id = $4`,
      JSON.stringify(updatedConfig),
      now,
      validated.dataSource.datasetId ?? null,
      validated.widgetId
    );

    logger.info('Data source bound', { widgetId: validated.widgetId, type: validated.dataSource.type });

    return {
      widgetId: validated.widgetId,
      dataSource: dataSourceConfig,
      bound: true,
      boundAt: now,
    };
  }

  /**
   * Apply advanced canvas layout with z-index, locking, and visibility.
   */
  async applyAdvancedLayout(input: z.infer<typeof AdvancedLayoutSchema>): Promise<{
    dashboardId: string;
    widgetsUpdated: number;
    gridConfig: Record<string, unknown>;
    appliedAt: Date;
  }> {
    const validated = AdvancedLayoutSchema.parse(input);
    const now = new Date();

    logger.info('Applying advanced layout', {
      dashboardId: validated.dashboardId,
      widgetCount: validated.widgets.length,
    });

    // Verify dashboard exists
    const dashboards: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(
      `SELECT id, layout FROM dashboards WHERE id = $1`,
      validated.dashboardId
    );

    if (!dashboards || dashboards.length === 0) {
      throw new Error(`Dashboard ${validated.dashboardId} not found`);
    }

    // Update each widget position
    for (const widget of validated.widgets) {
      const widgetData: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(
        `SELECT id, config FROM dashboard_widgets WHERE id = $1 AND dashboard_id = $2 AND deleted_at IS NULL`,
        widget.widgetId,
        validated.dashboardId
      );

      if (!widgetData || widgetData.length === 0) {
        logger.warn('Widget not found during layout update, skipping', { widgetId: widget.widgetId });
        continue;
      }

      const existingConfig = typeof widgetData[0].config === 'string'
        ? JSON.parse(widgetData[0].config as string)
        : (widgetData[0].config as Record<string, unknown>) ?? {};

      const updatedConfig = {
        ...existingConfig,
        zIndex: widget.zIndex ?? 0,
        locked: widget.locked ?? false,
        visible: widget.visible ?? true,
      };

      await prisma.$queryRawUnsafe(
        `UPDATE dashboard_widgets
         SET position_x = $1, position_y = $2, position_w = $3, position_h = $4,
             config = $5, updated_at = $6
         WHERE id = $7 AND dashboard_id = $8`,
        widget.position.x,
        widget.position.y,
        widget.position.w,
        widget.position.h,
        JSON.stringify(updatedConfig),
        now,
        widget.widgetId,
        validated.dashboardId
      );
    }

    // Update grid config on dashboard if provided
    if (validated.gridConfig) {
      const currentLayout = typeof dashboards[0].layout === 'string'
        ? JSON.parse(dashboards[0].layout as string)
        : (dashboards[0].layout as Record<string, unknown>) ?? {};

      const updatedLayout = {
        ...currentLayout,
        columns: validated.gridConfig.columns ?? currentLayout.columns ?? 12,
        rowHeight: validated.gridConfig.rowHeight ?? currentLayout.rowHeight ?? 80,
        gap: validated.gridConfig.gap ?? currentLayout.gap ?? 10,
        snapToGrid: validated.gridConfig.snapToGrid ?? true,
      };

      await prisma.$queryRawUnsafe(
        `UPDATE dashboards SET layout = $1, updated_at = $2 WHERE id = $3`,
        JSON.stringify(updatedLayout),
        now,
        validated.dashboardId
      );
    }

    // Store layout version in history
    const historyId = uuidv4();
    await prisma.$queryRawUnsafe(
      `INSERT INTO dashboard_layout_history (id, dashboard_id, layout_snapshot, created_at)
       VALUES ($1, $2, $3, $4)`,
      historyId,
      validated.dashboardId,
      JSON.stringify({
        widgets: validated.widgets,
        gridConfig: validated.gridConfig,
      }),
      now
    ).catch((histErr: Error) => {
      logger.warn('Failed to save layout history', { error: histErr.message });
    });

    await cacheDel(`${this.cachePrefix}:*`);

    logger.info('Advanced layout applied', {
      dashboardId: validated.dashboardId,
      widgetsUpdated: validated.widgets.length,
    });

    return {
      dashboardId: validated.dashboardId,
      widgetsUpdated: validated.widgets.length,
      gridConfig: validated.gridConfig ?? {},
      appliedAt: now,
    };
  }

  /**
   * Apply conditional formatting rules to a widget.
   */
  async applyConditionalFormatting(input: z.infer<typeof ConditionalFormattingSchema>): Promise<{
    widgetId: string;
    rulesApplied: number;
    appliedAt: Date;
  }> {
    const validated = ConditionalFormattingSchema.parse(input);
    const now = new Date();

    logger.info('Applying conditional formatting', {
      widgetId: validated.widgetId,
      ruleCount: validated.rules.length,
    });

    const widgets: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(
      `SELECT id, config FROM dashboard_widgets WHERE id = $1 AND deleted_at IS NULL`,
      validated.widgetId
    );

    if (!widgets || widgets.length === 0) {
      throw new Error(`Widget ${validated.widgetId} not found`);
    }

    const existingConfig = typeof widgets[0].config === 'string'
      ? JSON.parse(widgets[0].config as string)
      : (widgets[0].config as Record<string, unknown>) ?? {};

    const formattingRules = validated.rules.map((rule) => ({
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      valueEnd: rule.valueEnd,
      style: rule.style,
    }));

    const updatedConfig = {
      ...existingConfig,
      conditionalFormatting: formattingRules,
    };

    await prisma.$queryRawUnsafe(
      `UPDATE dashboard_widgets SET config = $1, updated_at = $2 WHERE id = $3`,
      JSON.stringify(updatedConfig),
      now,
      validated.widgetId
    );

    logger.info('Conditional formatting applied', {
      widgetId: validated.widgetId,
      rulesApplied: formattingRules.length,
    });

    return {
      widgetId: validated.widgetId,
      rulesApplied: formattingRules.length,
      appliedAt: now,
    };
  }

  /**
   * Create a computed/calculated field for a dashboard.
   */
  async createComputedField(input: z.infer<typeof ComputedFieldSchema>): Promise<{
    id: string;
    name: string;
    expression: string;
    outputType: string;
    createdAt: Date;
  }> {
    const validated = ComputedFieldSchema.parse(input);
    const now = new Date();
    const fieldId = uuidv4();

    logger.info('Creating computed field', {
      dashboardId: validated.dashboardId,
      name: validated.name,
    });

    // Verify dashboard exists
    const dashboards: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(
      `SELECT id FROM dashboards WHERE id = $1`,
      validated.dashboardId
    );

    if (!dashboards || dashboards.length === 0) {
      throw new Error(`Dashboard ${validated.dashboardId} not found`);
    }

    // Block dangerous expressions
    const blockedPatterns = ['require(', 'import(', 'eval(', 'Function(', 'process.', 'child_process', '__proto__'];
    for (const pattern of blockedPatterns) {
      if (validated.expression.includes(pattern)) {
        throw new Error(`Expression contains blocked pattern: ${pattern}`);
      }
    }

    await prisma.$queryRawUnsafe(
      `INSERT INTO dashboard_computed_fields (id, dashboard_id, name, expression, source_columns, output_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      fieldId,
      validated.dashboardId,
      validated.name,
      validated.expression,
      JSON.stringify(validated.sourceColumns),
      validated.outputType,
      now,
      now
    );

    logger.info('Computed field created', { fieldId, name: validated.name });

    return {
      id: fieldId,
      name: validated.name,
      expression: validated.expression,
      outputType: validated.outputType,
      createdAt: now,
    };
  }
}

export const advancedModeService = new AdvancedModeService();
