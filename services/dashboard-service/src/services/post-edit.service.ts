import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { BaseCrudService, ListParams } from './base/base-crud.service';

// ─── Service ────────────────────────────────────────────────────────────────

export class PostEditService extends BaseCrudService {
  protected readonly modelName = 'dashboardPostEdit';
  protected readonly entityLabel = 'DashboardPostEdit';
  protected readonly cachePrefix = 'dashboard:post-edit';
  protected readonly cacheTtl = 300;

  protected buildSearchWhere(search: string) {
    return {
      OR: [
        { editType: { contains: search, mode: 'insensitive' } },
        { annotation: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  protected buildFilterWhere(params: ListParams) {
    const where: Record<string, unknown> = {};
    if (params.dashboardId) where.dashboardId = params.dashboardId;
    if (params.editType) where.editType = params.editType;
    if (params.isPublished !== undefined) where.isPublished = params.isPublished;
    return where;
  }

  async publish(id: string) {
    const updated = await prisma.dashboardPostEdit.update({
      where: { id },
      data: { isPublished: true },
    });
    logger.info('Post edit published', { id });
    await this.invalidateCache(id);
    return updated;
  }

  async revert(id: string) {
    const record = await this.getById(id) as Record<string, unknown>;
    const currentVersion = typeof record.version === 'number' ? record.version : 1;
    const updated = await prisma.dashboardPostEdit.update({
      where: { id },
      data: { isPublished: false, version: currentVersion + 1 },
    });
    logger.info('Post edit reverted', { id });
    await this.invalidateCache(id);
    return updated;
  }

  /**
   * E03.05: Change chart type of a widget after creation.
   */
  async changeChartType(widgetId: string, newType: string) {
    const widgets = await prisma.$queryRawUnsafe<Array<{ id: string; config: string; dashboard_id: string }>>(
      `SELECT id, config::text, dashboard_id FROM dashboard_widgets WHERE id = $1`,
      widgetId,
    );
    if (!widgets || widgets.length === 0) {
      throw new Error(`Widget ${widgetId} not found`);
    }

    // Snapshot before edit
    await this.snapshotDashboard(widgets[0].dashboard_id);

    await prisma.$queryRawUnsafe(
      `UPDATE dashboard_widgets SET type = $1::"WidgetType", updated_at = $2 WHERE id = $3`,
      newType,
      new Date(),
      widgetId,
    );

    logger.info('Widget chart type changed', { widgetId, newType });
    return { widgetId, newType };
  }

  /**
   * E03.05: Change aggregation method of a widget.
   */
  async changeAggregation(widgetId: string, aggregation: string) {
    const widgets = await prisma.$queryRawUnsafe<Array<{ id: string; config: string }>>(
      `SELECT id, config::text FROM dashboard_widgets WHERE id = $1`,
      widgetId,
    );
    if (!widgets || widgets.length === 0) {
      throw new Error(`Widget ${widgetId} not found`);
    }

    const existingConfig = typeof widgets[0].config === 'string'
      ? JSON.parse(widgets[0].config)
      : widgets[0].config ?? {};

    const dataBinding = existingConfig.dataBinding || existingConfig.advancedDataSource || {};
    const updatedConfig = {
      ...existingConfig,
      dataBinding: { ...dataBinding, aggregation },
    };

    await prisma.$queryRawUnsafe(
      `UPDATE dashboard_widgets SET config = $1::jsonb, updated_at = $2 WHERE id = $3`,
      JSON.stringify(updatedConfig),
      new Date(),
      widgetId,
    );

    logger.info('Widget aggregation changed', { widgetId, aggregation });
    return { widgetId, aggregation };
  }

  /**
   * E03.05: Get version history (layout snapshots) of a dashboard.
   */
  async getVersionHistory(dashboardId: string) {
    const snapshots = await prisma.dashboardLayoutHistory.findMany({
      where: { dashboardId },
      orderBy: { savedAt: 'desc' },
      take: 50,
    });

    return snapshots.map((s) => ({
      id: s.id,
      dashboardId: s.dashboardId,
      layouts: typeof s.layouts === 'string' ? JSON.parse(s.layouts) : s.layouts,
      savedAt: s.savedAt,
    }));
  }

  /**
   * E03.05: Clone a dashboard with all its widgets.
   */
  async cloneDashboard(dashboardId: string, userId: string) {
    const original = await prisma.dashboard.findFirst({
      where: { id: dashboardId },
      include: { widgets: true },
    });
    if (!original) throw new Error(`Dashboard ${dashboardId} not found`);

    const clone = await prisma.dashboard.create({
      data: {
        tenantId: original.tenantId,
        name: `نسخة من: ${original.name}`,
        slug: `${original.slug}-copy-${Date.now()}`,
        layout: original.layout as Prisma.InputJsonValue,
        filters: original.filters as Prisma.InputJsonValue,
        theme: original.theme as Prisma.InputJsonValue,
        settings: original.settings as Prisma.InputJsonValue,
        visibility: original.visibility,
        refreshRate: original.refreshRate,
        createdById: userId,
      },
    });

    // Clone all widgets
    for (const widget of original.widgets) {
      await prisma.dashboardWidget.create({
        data: {
          dashboardId: clone.id,
          type: widget.type,
          title: widget.title,
          description: widget.description,
          config: widget.config as Prisma.InputJsonValue,
          query: widget.query,
          position: widget.position as Prisma.InputJsonValue,
          size: widget.size as Prisma.InputJsonValue,
          style: widget.style as Prisma.InputJsonValue,
          datasetId: widget.datasetId,
          refreshRate: widget.refreshRate,
          cacheSeconds: widget.cacheSeconds,
          sortOrder: widget.sortOrder,
          isVisible: widget.isVisible,
        },
      });
    }

    logger.info('Dashboard cloned', { originalId: dashboardId, cloneId: clone.id });
    return { id: clone.id, name: clone.name, widgetCount: original.widgets.length };
  }

  /**
   * E03.05: Save state — snapshot current dashboard with filters and selections.
   */
  async saveState(dashboardId: string, filters: Record<string, unknown>) {
    const snapshot = await prisma.dashboardLayoutHistory.create({
      data: {
        dashboardId,
        layouts: JSON.stringify({
          filters,
          savedAt: new Date().toISOString(),
          type: 'state_snapshot',
        }),
        savedAt: new Date(),
      },
    });

    logger.info('Dashboard state saved', { dashboardId, snapshotId: snapshot.id });
    return { id: snapshot.id, dashboardId, savedAt: snapshot.savedAt };
  }

  /**
   * E03.05: Rebind all dashboard widgets to a new dataset.
   */
  async rebindDashboardData(dashboardId: string, newDatasetId: string) {
    // Verify dataset exists
    const datasets = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM datasets WHERE id = $1`,
      newDatasetId,
    );
    if (!datasets || datasets.length === 0) {
      throw new Error(`Dataset ${newDatasetId} not found`);
    }

    const widgets = await prisma.dashboardWidget.findMany({
      where: { dashboardId },
    });

    let updatedCount = 0;
    for (const widget of widgets) {
      if (widget.datasetId) {
        const existingConfig = (widget.config as Record<string, unknown>) ?? {};
        const dataBinding = (existingConfig.dataBinding as Record<string, unknown>) ?? {};

        await prisma.dashboardWidget.update({
          where: { id: widget.id },
          data: {
            datasetId: newDatasetId,
            config: {
              ...existingConfig,
              dataBinding: { ...dataBinding, datasetId: newDatasetId },
            } as Prisma.InputJsonValue,
          },
        });
        updatedCount++;
      }
    }

    logger.info('Dashboard data rebound', { dashboardId, newDatasetId, widgetsUpdated: updatedCount });
    return { dashboardId, newDatasetId, widgetsUpdated: updatedCount };
  }

  /**
   * E03.05: Add a widget to an existing dashboard after creation.
   */
  async addElement(params: {
    dashboardId: string;
    elementType: string;
    position: Record<string, unknown>;
    config: Record<string, unknown>;
    dataBinding: Record<string, unknown>;
  }) {
    // Snapshot before edit
    await this.snapshotDashboard(params.dashboardId);

    const widget = await prisma.dashboardWidget.create({
      data: {
        dashboardId: params.dashboardId,
        type: params.elementType as never,
        title: (params.config.title as string) || params.elementType,
        config: params.config as Prisma.InputJsonValue,
        position: params.position as Prisma.InputJsonValue,
        size: { w: (params.position.w as number) || 4, h: (params.position.h as number) || 3 } as Prisma.InputJsonValue,
        sortOrder: 0,
      },
    });

    logger.info('Element added to dashboard', { dashboardId: params.dashboardId, widgetId: widget.id });
    return widget;
  }

  /**
   * E03.05: Delete a widget from a dashboard.
   */
  async deleteElement(widgetId: string, dashboardId: string) {
    await this.snapshotDashboard(dashboardId);

    await prisma.dashboardWidget.deleteMany({
      where: { id: widgetId, dashboardId },
    });

    logger.info('Element deleted from dashboard', { widgetId, dashboardId });
    return { deleted: true, widgetId };
  }

  /**
   * Internal: Take a snapshot of the dashboard layout before edits.
   */
  private async snapshotDashboard(dashboardId: string): Promise<void> {
    try {
      const widgets = await prisma.dashboardWidget.findMany({
        where: { dashboardId },
        select: { id: true, type: true, title: true, config: true, position: true, size: true },
      });

      await prisma.dashboardLayoutHistory.create({
        data: {
          dashboardId,
          layouts: JSON.stringify({
            widgets: widgets.map((w) => ({
              id: w.id,
              type: w.type,
              title: w.title,
              position: w.position,
              size: w.size,
            })),
            snapshotAt: new Date().toISOString(),
            type: 'pre_edit_snapshot',
          }),
          savedAt: new Date(),
        },
      });
    } catch (err) {
      logger.warn('Failed to save pre-edit snapshot', { dashboardId, error: (err as Error).message });
    }
  }
}

export const postEditService = new PostEditService();
