import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

interface DashboardRow {
  id: string;
  name: string;
  layout: string | Record<string, unknown>;
  config: string | Record<string, unknown>;
  tenant_id: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
  version: number;
  status: string;
  widget_count?: number;
}

interface WidgetRow {
  id: string;
  dashboard_id: string;
  type: string;
  title: string;
  config: string | Record<string, unknown>;
  dataset_id: string | null;
  position_x: number;
  position_y: number;
  position_w: number;
  position_h: number;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

interface DatasetRow {
  id: string;
  name: string;
  row_count: number;
  column_count: number;
  columns: string | unknown[];
}

interface DashboardLayout {
  columns?: number;
  rowHeight?: number;
  gap?: number;
  breakpoints?: Record<string, number>;
  compactType?: string;
  preventCollision?: boolean;
  maxRows?: number;
}

interface DashboardConfig {
  theme?: string;
  refreshInterval?: number;
  autoSave?: boolean;
  isPublic?: boolean;
  tags?: string[];
  description?: string;
  thumbnail?: string | null;
}

interface DashboardListFilters {
  search?: string;
  status?: string;
  userId?: string;
  createdAfter?: string;
  createdBefore?: string;
  sortBy?: string;
  sortOrder?: string;
}

export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetInput {
  type: string;
  title: string;
  config: Record<string, unknown>;
  datasetId?: string;
  position: WidgetPosition;
}

export interface WidgetReorderItem {
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function createDashboard(
  name: string,
  layout: DashboardLayout | undefined,
  config: DashboardConfig | undefined,
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const dashboardId = uuidv4();
  const now = new Date();

  const gridColumns = layout?.columns ?? 12;
  const gridRowHeight = layout?.rowHeight ?? 80;
  const gridGap = layout?.gap ?? 10;
  const breakpoints = layout?.breakpoints ?? {
    lg: 1200,
    md: 996,
    sm: 768,
    xs: 480,
  };

  const normalizedLayout = {
    columns: gridColumns,
    rowHeight: gridRowHeight,
    gap: gridGap,
    breakpoints: breakpoints,
    compactType: layout?.compactType ?? 'vertical',
    preventCollision: layout?.preventCollision ?? false,
    maxRows: layout?.maxRows ?? 100,
  };

  const normalizedConfig = {
    theme: config?.theme ?? 'light',
    refreshInterval: config?.refreshInterval ?? 0,
    autoSave: config?.autoSave ?? true,
    isPublic: config?.isPublic ?? false,
    tags: config?.tags ?? [],
    description: config?.description ?? '',
    thumbnail: config?.thumbnail ?? null,
  };

  logger.info('Creating dashboard', { dashboardId, name, tenantId, userId });

  const dashboard = await prisma.$queryRawUnsafe(
    `INSERT INTO dashboards (id, name, layout, config, tenant_id, user_id, created_at, updated_at, version, status)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    dashboardId,
    name.trim(),
    JSON.stringify(normalizedLayout),
    JSON.stringify(normalizedConfig),
    tenantId,
    userId,
    now,
    now,
    1,
    'active'
  );

  const result = Array.isArray(dashboard) ? dashboard[0] : dashboard;

  logger.info('Dashboard created successfully', {
    dashboardId,
    name: name.trim(),
    gridColumns,
    gridRowHeight,
  });

  return {
    id: result.id ?? dashboardId,
    name: result.name ?? name.trim(),
    layout: normalizedLayout,
    config: normalizedConfig,
    tenantId: tenantId,
    userId: userId,
    createdAt: result.created_at ?? now,
    updatedAt: result.updated_at ?? now,
    version: 1,
    status: 'active',
    widgets: [],
  };
}

export async function addWidget(
  dashboardId: string,
  widget: WidgetInput
): Promise<Record<string, unknown>> {
  const widgetId = uuidv4();
  const now = new Date();

  const validTypes = [
    'bar_chart', 'line_chart', 'pie_chart', 'scatter_plot', 'area_chart',
    'radar_chart', 'gauge', 'waterfall', 'table', 'text', 'kpi', 'metric',
    'heatmap', 'treemap', 'image', 'combined_chart',
  ];

  const widgetType = validTypes.includes(widget.type) ? widget.type : 'text';

  const posX = Math.max(0, Math.min(widget.position.x, 11));
  const posY = Math.max(0, widget.position.y);
  const posW = Math.max(1, Math.min(widget.position.w, 12));
  const posH = Math.max(1, widget.position.h);

  const normalizedConfig = {
    ...widget.config,
    colors: widget.config?.colors ?? ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2'],
    animation: widget.config?.animation ?? true,
    legend: widget.config?.legend ?? { show: true, position: 'bottom' },
    tooltip: widget.config?.tooltip ?? { enabled: true },
    responsive: widget.config?.responsive ?? true,
  };

  logger.info('Adding widget to dashboard', {
    dashboardId,
    widgetId,
    type: widgetType,
    title: widget.title,
  });

  const existingWidgets: WidgetRow[] = await prisma.$queryRawUnsafe(
    `SELECT id, position_x, position_y, position_w, position_h FROM dashboard_widgets
     WHERE dashboard_id = $1 AND deleted_at IS NULL ORDER BY position_y, position_x`,
    dashboardId
  );

  for (const existing of existingWidgets) {
    const overlapX = posX < existing.position_x + existing.position_w && posX + posW > existing.position_x;
    const overlapY = posY < existing.position_y + existing.position_h && posY + posH > existing.position_y;
    if (overlapX && overlapY) {
      logger.warn('Widget position overlap detected, adjusting', {
        widgetId,
        conflictWith: existing.id,
      });
    }
  }

  const insertedWidget = await prisma.$queryRawUnsafe(
    `INSERT INTO dashboard_widgets (id, dashboard_id, type, title, config, dataset_id, position_x, position_y, position_w, position_h, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    widgetId,
    dashboardId,
    widgetType,
    widget.title.trim(),
    JSON.stringify(normalizedConfig),
    widget.datasetId ?? null,
    posX,
    posY,
    posW,
    posH,
    existingWidgets.length + 1,
    now,
    now
  );

  await prisma.$queryRawUnsafe(
    `UPDATE dashboards SET updated_at = $1 WHERE id = $2`,
    now,
    dashboardId
  );

  const row = Array.isArray(insertedWidget) ? insertedWidget[0] : insertedWidget;

  return {
    id: row.id ?? widgetId,
    dashboardId: dashboardId,
    type: widgetType,
    title: widget.title.trim(),
    config: normalizedConfig,
    datasetId: widget.datasetId ?? null,
    position: { x: posX, y: posY, w: posW, h: posH },
    sortOrder: existingWidgets.length + 1,
    createdAt: row.created_at ?? now,
    updatedAt: row.updated_at ?? now,
  };
}

export async function removeWidget(
  dashboardId: string,
  widgetId: string
): Promise<Record<string, unknown>> {
  const now = new Date();

  logger.info('Removing widget from dashboard', { dashboardId, widgetId });

  const existing: WidgetRow[] = await prisma.$queryRawUnsafe(
    `SELECT id, sort_order, position_y, position_h FROM dashboard_widgets
     WHERE id = $1 AND dashboard_id = $2 AND deleted_at IS NULL`,
    widgetId,
    dashboardId
  );

  if (!existing || existing.length === 0) {
    throw new Error(`Widget ${widgetId} not found in dashboard ${dashboardId}`);
  }

  const removedWidget = existing[0];
  const removedBottomY = removedWidget.position_y + removedWidget.position_h;

  await prisma.$queryRawUnsafe(
    `UPDATE dashboard_widgets SET deleted_at = $1, updated_at = $1
     WHERE id = $2 AND dashboard_id = $3`,
    now,
    widgetId,
    dashboardId
  );

  const belowWidgets: WidgetRow[] = await prisma.$queryRawUnsafe(
    `SELECT id, position_y FROM dashboard_widgets
     WHERE dashboard_id = $1 AND deleted_at IS NULL AND position_y >= $2
     ORDER BY position_y ASC`,
    dashboardId,
    removedBottomY
  );

  for (const belowWidget of belowWidgets) {
    const newY = Math.max(0, belowWidget.position_y - removedWidget.position_h);
    await prisma.$queryRawUnsafe(
      `UPDATE dashboard_widgets SET position_y = $1, updated_at = $2 WHERE id = $3`,
      newY,
      now,
      belowWidget.id
    );
  }

  const remaining: WidgetRow[] = await prisma.$queryRawUnsafe(
    `SELECT id FROM dashboard_widgets WHERE dashboard_id = $1 AND deleted_at IS NULL ORDER BY position_y, position_x`,
    dashboardId
  );

  for (let i = 0; i < remaining.length; i++) {
    await prisma.$queryRawUnsafe(
      `UPDATE dashboard_widgets SET sort_order = $1 WHERE id = $2`,
      i + 1,
      remaining[i].id
    );
  }

  await prisma.$queryRawUnsafe(
    `UPDATE dashboards SET updated_at = $1 WHERE id = $2`,
    now,
    dashboardId
  );

  logger.info('Widget removed and reflow completed', {
    dashboardId,
    widgetId,
    remainingCount: remaining.length,
  });

  return {
    removed: widgetId,
    dashboardId: dashboardId,
    reflowedWidgets: belowWidgets.length,
    remainingWidgets: remaining.length,
    removedAt: now,
  };
}

export async function updateWidget(
  dashboardId: string,
  widgetId: string,
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const now = new Date();

  logger.info('Updating widget configuration', { dashboardId, widgetId });

  const existing: WidgetRow[] = await prisma.$queryRawUnsafe(
    `SELECT id, config, type, title FROM dashboard_widgets
     WHERE id = $1 AND dashboard_id = $2 AND deleted_at IS NULL`,
    widgetId,
    dashboardId
  );

  if (!existing || existing.length === 0) {
    throw new Error(`Widget ${widgetId} not found in dashboard ${dashboardId}`);
  }

  const currentWidget = existing[0];
  const currentConfig = typeof currentWidget.config === 'string'
    ? JSON.parse(currentWidget.config)
    : currentWidget.config;

  const mergedConfig = {
    ...currentConfig,
    ...config,
    colors: config.colors ?? currentConfig.colors ?? ['#4e79a7', '#f28e2b'],
    animation: config.animation ?? currentConfig.animation ?? true,
    legend: config.legend ?? currentConfig.legend ?? { show: true, position: 'bottom' },
    tooltip: config.tooltip ?? currentConfig.tooltip ?? { enabled: true },
  };

  const updatedTitle = config.title ?? currentWidget.title;
  const updatedType = config.type ?? currentWidget.type;

  await prisma.$queryRawUnsafe(
    `UPDATE dashboard_widgets SET config = $1, title = $2, type = $3, updated_at = $4
     WHERE id = $5 AND dashboard_id = $6`,
    JSON.stringify(mergedConfig),
    updatedTitle,
    updatedType,
    now,
    widgetId,
    dashboardId
  );

  await prisma.$queryRawUnsafe(
    `UPDATE dashboards SET updated_at = $1 WHERE id = $2`,
    now,
    dashboardId
  );

  logger.info('Widget updated successfully', { dashboardId, widgetId });

  return {
    id: widgetId,
    dashboardId: dashboardId,
    type: updatedType,
    title: updatedTitle,
    config: mergedConfig,
    updatedAt: now,
  };
}

export async function reorderWidgets(
  dashboardId: string,
  positions: WidgetReorderItem[]
): Promise<Record<string, unknown>> {
  const now = new Date();

  logger.info('Reordering widgets', {
    dashboardId,
    widgetCount: positions.length,
  });

  const existingWidgets: WidgetRow[] = await prisma.$queryRawUnsafe(
    `SELECT id FROM dashboard_widgets WHERE dashboard_id = $1 AND deleted_at IS NULL`,
    dashboardId
  );

  const existingIds = new Set(existingWidgets.map((w: WidgetRow) => w.id));
  const invalidIds = positions.filter((p) => !existingIds.has(p.widgetId));
  if (invalidIds.length > 0) {
    throw new Error(`Invalid widget IDs: ${invalidIds.map((p) => p.widgetId).join(', ')}`);
  }

  const collisions: string[] = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i];
      const b = positions[j];
      const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
      const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;
      if (overlapX && overlapY) {
        collisions.push(`${a.widgetId} <-> ${b.widgetId}`);
      }
    }
  }

  if (collisions.length > 0) {
    logger.warn('Widget position collisions detected', { collisions });
  }

  const updatedWidgets: Array<{ widgetId: string; position: { x: number; y: number; w: number; h: number }; sortOrder: number }> = [];

  for (let idx = 0; idx < positions.length; idx++) {
    const pos = positions[idx];
    const clampedX = Math.max(0, Math.min(pos.x, 11));
    const clampedY = Math.max(0, pos.y);
    const clampedW = Math.max(1, Math.min(pos.w, 12));
    const clampedH = Math.max(1, pos.h);

    await prisma.$queryRawUnsafe(
      `UPDATE dashboard_widgets
       SET position_x = $1, position_y = $2, position_w = $3, position_h = $4, sort_order = $5, updated_at = $6
       WHERE id = $7 AND dashboard_id = $8`,
      clampedX,
      clampedY,
      clampedW,
      clampedH,
      idx + 1,
      now,
      pos.widgetId,
      dashboardId
    );

    updatedWidgets.push({
      widgetId: pos.widgetId,
      position: { x: clampedX, y: clampedY, w: clampedW, h: clampedH },
      sortOrder: idx + 1,
    });
  }

  await prisma.$queryRawUnsafe(
    `UPDATE dashboards SET updated_at = $1 WHERE id = $2`,
    now,
    dashboardId
  );

  logger.info('Widgets reordered successfully', {
    dashboardId,
    count: updatedWidgets.length,
    collisions: collisions.length,
  });

  return {
    dashboardId: dashboardId,
    widgets: updatedWidgets,
    collisions: collisions,
    updatedAt: now,
  };
}

export async function duplicateDashboard(
  dashboardId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const now = new Date();
  const newDashboardId = uuidv4();

  logger.info('Duplicating dashboard', { sourceDashboardId: dashboardId, newDashboardId, userId });

  const sourceDashboards: DashboardRow[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM dashboards WHERE id = $1`,
    dashboardId
  );

  if (!sourceDashboards || sourceDashboards.length === 0) {
    throw new Error(`Dashboard ${dashboardId} not found`);
  }

  const source = sourceDashboards[0];
  const sourceName = typeof source.name === 'string' ? source.name : 'Dashboard';
  const newName = `${sourceName} (Copy)`;

  const sourceConfig = typeof source.config === 'string' ? JSON.parse(source.config) : (source.config ?? {});
  const clonedConfig = {
    ...sourceConfig,
    isPublic: false,
    clonedFrom: dashboardId,
    clonedAt: now.toISOString(),
  };

  await prisma.$queryRawUnsafe(
    `INSERT INTO dashboards (id, name, layout, config, tenant_id, user_id, created_at, updated_at, version, status)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10)`,
    newDashboardId,
    newName,
    typeof source.layout === 'string' ? source.layout : JSON.stringify(source.layout ?? {}),
    JSON.stringify(clonedConfig),
    source.tenant_id,
    userId,
    now,
    now,
    1,
    'active'
  );

  const sourceWidgets: WidgetRow[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM dashboard_widgets WHERE dashboard_id = $1 AND deleted_at IS NULL ORDER BY sort_order`,
    dashboardId
  );

  const clonedWidgets: Array<{ id: string; originalId: string; type: string; title: string; position: { x: number; y: number; w: number; h: number } }> = [];

  for (const widget of sourceWidgets) {
    const newWidgetId = uuidv4();
    const widgetConfig = typeof widget.config === 'string' ? widget.config : JSON.stringify(widget.config ?? {});

    await prisma.$queryRawUnsafe(
      `INSERT INTO dashboard_widgets (id, dashboard_id, type, title, config, dataset_id, position_x, position_y, position_w, position_h, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      newWidgetId,
      newDashboardId,
      widget.type,
      widget.title,
      widgetConfig,
      widget.dataset_id ?? null,
      widget.position_x,
      widget.position_y,
      widget.position_w,
      widget.position_h,
      widget.sort_order,
      now,
      now
    );

    clonedWidgets.push({
      id: newWidgetId,
      originalId: widget.id,
      type: widget.type,
      title: widget.title,
      position: {
        x: widget.position_x,
        y: widget.position_y,
        w: widget.position_w,
        h: widget.position_h,
      },
    });
  }

  logger.info('Dashboard duplicated successfully', {
    sourceDashboardId: dashboardId,
    newDashboardId: newDashboardId,
    widgetsCloned: clonedWidgets.length,
  });

  return {
    id: newDashboardId,
    name: newName,
    layout: typeof source.layout === 'string' ? JSON.parse(source.layout) : source.layout,
    config: clonedConfig,
    tenantId: source.tenant_id,
    userId: userId,
    createdAt: now,
    updatedAt: now,
    version: 1,
    status: 'active',
    widgets: clonedWidgets,
    clonedFrom: dashboardId,
  };
}

export async function getDashboard(dashboardId: string): Promise<Record<string, unknown>> {
  logger.info('Fetching dashboard', { dashboardId });

  const dashboards: DashboardRow[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM dashboards WHERE id = $1`,
    dashboardId
  );

  if (!dashboards || dashboards.length === 0) {
    throw new Error(`Dashboard ${dashboardId} not found`);
  }

  const dashboard = dashboards[0];
  const layout = typeof dashboard.layout === 'string' ? JSON.parse(dashboard.layout) : (dashboard.layout ?? {});
  const config = typeof dashboard.config === 'string' ? JSON.parse(dashboard.config) : (dashboard.config ?? {});

  const widgets: WidgetRow[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM dashboard_widgets WHERE dashboard_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC`,
    dashboardId
  );

  const resolvedWidgets = [];
  for (const widget of widgets) {
    const widgetConfig = typeof widget.config === 'string' ? JSON.parse(widget.config) : (widget.config ?? {});

    let datasetPreview: Record<string, unknown> | null = null;
    if (widget.dataset_id) {
      try {
        const datasets: DatasetRow[] = await prisma.$queryRawUnsafe(
          `SELECT id, name, row_count, column_count, columns FROM datasets WHERE id = $1 LIMIT 1`,
          widget.dataset_id
        );
        if (datasets && datasets.length > 0) {
          datasetPreview = {
            id: datasets[0].id,
            name: datasets[0].name,
            rowCount: datasets[0].row_count,
            columnCount: datasets[0].column_count,
            columns: typeof datasets[0].columns === 'string' ? JSON.parse(datasets[0].columns) : datasets[0].columns,
          };
        }
      } catch (err) {
        logger.warn('Failed to resolve dataset for widget', {
          widgetId: widget.id,
          datasetId: widget.dataset_id,
          error: (err as Error).message,
        });
      }
    }

    resolvedWidgets.push({
      id: widget.id,
      type: widget.type,
      title: widget.title,
      config: widgetConfig,
      datasetId: widget.dataset_id,
      datasetPreview: datasetPreview,
      position: {
        x: widget.position_x,
        y: widget.position_y,
        w: widget.position_w,
        h: widget.position_h,
      },
      sortOrder: widget.sort_order,
      createdAt: widget.created_at,
      updatedAt: widget.updated_at,
    });
  }

  logger.info('Dashboard fetched', {
    dashboardId,
    widgetCount: resolvedWidgets.length,
  });

  return {
    id: dashboard.id,
    name: dashboard.name,
    layout: layout,
    config: config,
    tenantId: dashboard.tenant_id,
    userId: dashboard.user_id,
    createdAt: dashboard.created_at,
    updatedAt: dashboard.updated_at,
    version: dashboard.version,
    status: dashboard.status,
    widgets: resolvedWidgets,
    widgetCount: resolvedWidgets.length,
  };
}

export async function listDashboards(
  tenantId: string,
  filters: DashboardListFilters | undefined,
  pagination: { page: number; limit: number }
): Promise<Record<string, unknown>> {
  const page = Math.max(1, pagination.page);
  const limit = Math.max(1, Math.min(pagination.limit, 100));
  const offset = (page - 1) * limit;

  logger.info('Listing dashboards', { tenantId, filters, page, limit });

  let whereClause = `WHERE d.tenant_id = $1 AND d.status != 'deleted'`;
  const params: (string | Date | number)[] = [tenantId];
  let paramIndex = 2;

  if (filters?.search) {
    whereClause += ` AND (d.name ILIKE $${paramIndex} OR d.config::text ILIKE $${paramIndex})`;
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  if (filters?.status) {
    whereClause += ` AND d.status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }

  if (filters?.userId) {
    whereClause += ` AND d.user_id = $${paramIndex}`;
    params.push(filters.userId);
    paramIndex++;
  }

  if (filters?.createdAfter) {
    whereClause += ` AND d.created_at >= $${paramIndex}`;
    params.push(new Date(filters.createdAfter));
    paramIndex++;
  }

  if (filters?.createdBefore) {
    whereClause += ` AND d.created_at <= $${paramIndex}`;
    params.push(new Date(filters.createdBefore));
    paramIndex++;
  }

  const sortField = filters?.sortBy === 'name' ? 'd.name' : 'd.updated_at';
  const sortOrder = filters?.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const countResult: Array<{ total: number }> = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int as total FROM dashboards d ${whereClause}`,
    ...params
  );
  const total = countResult[0]?.total ?? 0;

  const dashboards: DashboardRow[] = await prisma.$queryRawUnsafe(
    `SELECT d.*, (SELECT COUNT(*)::int FROM dashboard_widgets w WHERE w.dashboard_id = d.id AND w.deleted_at IS NULL) as widget_count
     FROM dashboards d ${whereClause}
     ORDER BY ${sortField} ${sortOrder}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    ...params,
    limit,
    offset
  );

  const items = dashboards.map((d: DashboardRow) => ({
    id: d.id,
    name: d.name,
    layout: typeof d.layout === 'string' ? JSON.parse(d.layout) : d.layout,
    config: typeof d.config === 'string' ? JSON.parse(d.config) : d.config,
    tenantId: d.tenant_id,
    userId: d.user_id,
    widgetCount: d.widget_count ?? 0,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    version: d.version,
    status: d.status,
  }));

  const totalPages = Math.ceil(total / limit);

  logger.info('Dashboards listed', {
    tenantId,
    total,
    returned: items.length,
    page,
    totalPages,
  });

  return {
    items: items,
    pagination: {
      page: page,
      limit: limit,
      total: total,
      totalPages: totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
    filters: filters ?? {},
    sort: { field: sortField, order: sortOrder },
  };
}
