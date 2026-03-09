import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { BaseCrudService, ListParams } from './base/base-crud.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ShareLinkResult {
  token: string;
  url: string;
  expiresAt: Date;
}

interface CanvasFormula {
  expression: string;
  resultColumn: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class FullEditorService extends BaseCrudService {
  protected readonly modelName = 'dashboardFullEditor';
  protected readonly entityLabel = 'DashboardFullEditor';
  protected readonly cachePrefix = 'dashboard:full-editor';
  protected readonly cacheTtl = 300;

  protected buildSearchWhere(search: string) {
    return {
      OR: [{ editorMode: { contains: search, mode: 'insensitive' } }],
    };
  }

  protected buildFilterWhere(params: ListParams) {
    const where: Record<string, unknown> = {};
    if (params.dashboardId) where.dashboardId = params.dashboardId;
    if (params.editorMode) where.editorMode = params.editorMode;
    return where;
  }

  async saveSnapshot(id: string, snapshotData: Record<string, unknown>) {
    const record = await this.getById(id) as Record<string, unknown>;
    const currentHistory = Array.isArray(record.undoHistory) ? record.undoHistory : [];
    const updated = await prisma.dashboardFullEditor.update({
      where: { id },
      data: {
        undoHistory: [...currentHistory, { ...snapshotData, timestamp: new Date().toISOString() }],
      },
    });
    await this.invalidateCache(id);
    return updated;
  }

  /**
   * E03.04: Resize a widget element — update width/height while preserving position.
   */
  async resizeElement(params: {
    widgetId: string;
    dashboardId: string;
    newSize: { w: number; h: number };
  }) {
    const widgets = await prisma.$queryRawUnsafe<Array<{ id: string; position: string; config: string }>>(
      `SELECT id, position::text, config::text FROM dashboard_widgets
       WHERE id = $1 AND dashboard_id = $2`,
      params.widgetId,
      params.dashboardId,
    );

    if (!widgets || widgets.length === 0) {
      throw new Error(`Widget ${params.widgetId} not found in dashboard ${params.dashboardId}`);
    }

    const widget = widgets[0];
    const currentSize = typeof widget.position === 'string'
      ? JSON.parse(widget.position)
      : widget.position;

    const newSize = { ...currentSize, w: params.newSize.w, h: params.newSize.h };

    await prisma.$queryRawUnsafe(
      `UPDATE dashboard_widgets SET size = $1::jsonb, updated_at = $2 WHERE id = $3`,
      JSON.stringify(newSize),
      new Date(),
      params.widgetId,
    );

    logger.info('Widget resized', { widgetId: params.widgetId, newSize: params.newSize });
    return { widgetId: params.widgetId, size: newSize };
  }

  /**
   * E03.04: Share interactive link — create a time-limited shareable URL for a dashboard.
   */
  async shareInteractiveLink(dashboardId: string, expiresHours: number = 24): Promise<ShareLinkResult> {
    // Verify dashboard exists
    const dashboards = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM dashboards WHERE id = $1`,
      dashboardId,
    );
    if (!dashboards || dashboards.length === 0) {
      throw new Error(`Dashboard ${dashboardId} not found`);
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000);

    await prisma.tvSession.create({
      data: {
        dashboardId,
        shareToken: token,
        config: JSON.stringify({
          permissions: { view: true, filter: true, export: false },
          expiresAt: expiresAt.toISOString(),
          type: 'interactive_share',
        }),
        status: 'active',
        createdAt: new Date(),
      },
    });

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const url = `${baseUrl}/shared/dashboard/${token}`;

    logger.info('Interactive link created', { dashboardId, token, expiresAt });
    return { token, url, expiresAt };
  }

  /**
   * E03.04: Convert dashboard to a report job.
   */
  async convertToReport(dashboardId: string, userId: string) {
    const dashboards = await prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
      `SELECT id, name FROM dashboards WHERE id = $1`,
      dashboardId,
    );
    if (!dashboards || dashboards.length === 0) {
      throw new Error(`Dashboard ${dashboardId} not found`);
    }

    const widgets = await prisma.$queryRawUnsafe<Array<{ id: string; type: string; title: string; config: string }>>(
      `SELECT id, type, title, config::text FROM dashboard_widgets WHERE dashboard_id = $1`,
      dashboardId,
    );

    const jobId = uuidv4();
    await prisma.$queryRawUnsafe(
      `INSERT INTO export_histories (id, dashboard_id, format, filename, file_size, exported_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      jobId,
      dashboardId,
      'report',
      `report-from-${dashboards[0].name}.pdf`,
      0,
      new Date(),
      JSON.stringify({
        type: 'DASHBOARD_TO_REPORT',
        userId,
        widgets: widgets.map((w) => ({ id: w.id, type: w.type, title: w.title })),
        status: 'pending',
      }),
    );

    logger.info('Dashboard to report conversion queued', { dashboardId, jobId });
    return { jobId, status: 'pending', dashboardId };
  }

  /**
   * E03.04: Rebind a widget element to a different data column/dataset.
   */
  async rebindElement(params: {
    widgetId: string;
    newColumn: string;
    newDatasetId: string;
    newAggregation: string;
  }) {
    const widgets = await prisma.$queryRawUnsafe<Array<{ id: string; config: string }>>(
      `SELECT id, config::text FROM dashboard_widgets WHERE id = $1`,
      params.widgetId,
    );
    if (!widgets || widgets.length === 0) {
      throw new Error(`Widget ${params.widgetId} not found`);
    }

    const existingConfig = typeof widgets[0].config === 'string'
      ? JSON.parse(widgets[0].config)
      : widgets[0].config ?? {};

    const updatedConfig = {
      ...existingConfig,
      dataBinding: {
        column: params.newColumn,
        datasetId: params.newDatasetId,
        aggregation: params.newAggregation,
      },
    };

    await prisma.$queryRawUnsafe(
      `UPDATE dashboard_widgets SET config = $1::jsonb, dataset_id = $2, updated_at = $3 WHERE id = $4`,
      JSON.stringify(updatedConfig),
      params.newDatasetId,
      new Date(),
      params.widgetId,
    );

    logger.info('Widget rebound', { widgetId: params.widgetId, column: params.newColumn });
    return { widgetId: params.widgetId, dataBinding: updatedConfig.dataBinding };
  }

  /**
   * E03.04: Add a canvas formula to a widget element.
   */
  async addCanvasFormula(widgetId: string, formula: CanvasFormula) {
    const widgets = await prisma.$queryRawUnsafe<Array<{ id: string; config: string }>>(
      `SELECT id, config::text FROM dashboard_widgets WHERE id = $1`,
      widgetId,
    );
    if (!widgets || widgets.length === 0) {
      throw new Error(`Widget ${widgetId} not found`);
    }

    // Block dangerous expressions
    const blockedPatterns = ['require(', 'import(', 'eval(', 'Function(', 'process.', 'child_process', '__proto__'];
    for (const pattern of blockedPatterns) {
      if (formula.expression.includes(pattern)) {
        throw new Error(`Formula contains blocked pattern: ${pattern}`);
      }
    }

    const existingConfig = typeof widgets[0].config === 'string'
      ? JSON.parse(widgets[0].config)
      : widgets[0].config ?? {};

    const formulas: CanvasFormula[] = existingConfig.formulas || [];
    formulas.push(formula);

    await prisma.$queryRawUnsafe(
      `UPDATE dashboard_widgets SET config = $1::jsonb, updated_at = $2 WHERE id = $3`,
      JSON.stringify({ ...existingConfig, formulas }),
      new Date(),
      widgetId,
    );

    logger.info('Canvas formula added', { widgetId, expression: formula.expression });
    return { widgetId, formulaCount: formulas.length, formula };
  }

  /**
   * E03.04: Export dashboard as PDF or image.
   */
  async exportDashboard(dashboardId: string, format: 'png' | 'pdf') {
    const dashboards = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM dashboards WHERE id = $1`,
      dashboardId,
    );
    if (!dashboards || dashboards.length === 0) {
      throw new Error(`Dashboard ${dashboardId} not found`);
    }

    const jobId = uuidv4();
    await prisma.$queryRawUnsafe(
      `INSERT INTO export_histories (id, dashboard_id, format, filename, file_size, exported_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      jobId,
      dashboardId,
      format,
      `dashboard-${dashboardId}.${format}`,
      0,
      new Date(),
      JSON.stringify({
        type: format === 'pdf' ? 'DASHBOARD_EXPORT_PDF' : 'DASHBOARD_EXPORT_IMAGE',
        status: 'pending',
      }),
    );

    logger.info('Dashboard export queued', { dashboardId, format, jobId });
    return { jobId, status: 'pending', format };
  }
}

export const fullEditorService = new FullEditorService();
