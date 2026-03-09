import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { BaseCrudService, ListParams } from './base/base-crud.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DropBindParams {
  dashboardId: string;
  elementType: string;
  position: { x: number; y: number; w: number; h: number };
  columnName: string;
  datasetId: string;
  aggregation?: string;
}

interface LinkElementsParams {
  dashboardId: string;
  sourceElementId: string;
  targetElementIds: string[];
  filterColumn: string;
}

interface DrillDownLevel {
  column: string;
  label: string;
  aggregation: string;
}

interface AlertConfig {
  threshold: number;
  condition: 'above' | 'below';
  alertType: 'notification' | 'escalation' | 'report';
}

// ─── Service ────────────────────────────────────────────────────────────────

export class DragElementsService extends BaseCrudService {
  protected readonly modelName = 'dashboardDragElement';
  protected readonly entityLabel = 'DashboardDragElement';
  protected readonly cachePrefix = 'dashboard:drag-elements';
  protected readonly cacheTtl = 300;

  protected buildSearchWhere(search: string) {
    return {
      OR: [
        { label: { contains: search, mode: 'insensitive' } },
        { elementType: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  protected buildFilterWhere(params: ListParams) {
    const where: Record<string, unknown> = {};
    if (params.dashboardId) where.dashboardId = params.dashboardId;
    if (params.elementType) where.elementType = params.elementType;
    return where;
  }

  async batchUpdate(
    dashboardId: string,
    elements: Array<{ id: string; positionX: number; positionY: number; width: number; height: number }>,
  ) {
    const updates = elements.map((el) =>
      prisma.dashboardDragElement.update({
        where: { id: el.id },
        data: { positionX: el.positionX, positionY: el.positionY, width: el.width, height: el.height },
      }),
    );
    const results = await prisma.$transaction(updates);
    logger.info('Batch drag elements updated', { dashboardId, count: results.length });
    await cacheDel(`${this.cachePrefix}:*`);
    return results;
  }

  async reorder(dashboardId: string, elementIds: string[]) {
    const updates = elementIds.map((id, index) =>
      prisma.dashboardDragElement.update({ where: { id }, data: { zIndex: index } }),
    );
    await prisma.$transaction(updates);
    logger.info('Drag elements reordered', { dashboardId, count: elementIds.length });
    await cacheDel(`${this.cachePrefix}:*`);
    return { reordered: true };
  }

  /**
   * E03.03: Drop element and bind to data column in one action.
   * User drags a chart type onto the canvas, selects a column, and it binds instantly.
   */
  async dropAndBind(params: DropBindParams) {
    const { dashboardId, elementType, position, columnName, datasetId, aggregation } = params;

    // Verify dashboard exists
    const dashboards = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM dashboards WHERE id = $1`,
      dashboardId,
    );
    if (!dashboards || dashboards.length === 0) {
      throw new Error(`Dashboard ${dashboardId} not found`);
    }

    const inferredAggregation = aggregation || this.inferAggregation(elementType);

    const config = {
      title: columnName,
      titleAr: columnName,
      type: elementType,
      rtl: true,
      font: 'Tajawal',
      colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'],
      dataBinding: {
        datasetId,
        column: columnName,
        aggregation: inferredAggregation,
      },
    };

    const element = await prisma.dashboardDragElement.create({
      data: {
        dashboardId,
        elementType,
        label: columnName,
        positionX: position.x,
        positionY: position.y,
        width: position.w,
        height: position.h,
        zIndex: 0,
        config: config as Prisma.InputJsonValue,
      },
    });

    logger.info('Element dropped and bound', { elementId: element.id, dashboardId, elementType, column: columnName });
    await this.invalidateCache();
    return element;
  }

  /**
   * E03.03: Link elements together — clicking one filters the others (cross-filtering).
   */
  async linkElements(params: LinkElementsParams) {
    const { dashboardId, sourceElementId, targetElementIds, filterColumn } = params;

    // Verify source element exists
    const source = await prisma.dashboardDragElement.findUnique({ where: { id: sourceElementId } });
    if (!source) throw new Error(`Source element ${sourceElementId} not found`);

    // Store cross-filter config
    await prisma.crossFilterConfig.upsert({
      where: { dashboardId_sourceWidgetId: { dashboardId, sourceWidgetId: sourceElementId } },
      create: {
        dashboardId,
        sourceWidgetId: sourceElementId,
        targetWidgetIds: JSON.stringify(targetElementIds),
        filterField: filterColumn,
        createdAt: new Date(),
      },
      update: {
        targetWidgetIds: JSON.stringify(targetElementIds),
        filterField: filterColumn,
        updatedAt: new Date(),
      },
    });

    // Update source element config with cross-filter targets
    const existingConfig = (source.config as Record<string, unknown>) ?? {};
    await prisma.dashboardDragElement.update({
      where: { id: sourceElementId },
      data: {
        config: {
          ...existingConfig,
          crossFilterTargets: targetElementIds,
          crossFilterColumn: filterColumn,
        },
      },
    });

    logger.info('Elements linked for cross-filtering', { sourceElementId, targetCount: targetElementIds.length });
    await this.invalidateCache();
    return { linked: true, sourceElementId, targetElementIds, filterColumn };
  }

  /**
   * E03.03: Configure drill-down levels on an element.
   * Clicking a bar/slice drills into more detailed data.
   */
  async configureDrillDown(elementId: string, levels: DrillDownLevel[]) {
    const element = await prisma.dashboardDragElement.findUnique({ where: { id: elementId } });
    if (!element) throw new Error(`Element ${elementId} not found`);

    const existingConfig = (element.config as Record<string, unknown>) ?? {};
    const updatedConfig = {
      ...existingConfig,
      drillDown: {
        enabled: true,
        levels,
      },
    };

    const updated = await prisma.dashboardDragElement.update({
      where: { id: elementId },
      data: { config: updatedConfig as unknown as Prisma.InputJsonValue },
    });

    logger.info('Drill-down configured', { elementId, levelCount: levels.length });
    await this.invalidateCache(elementId);
    return updated;
  }

  /**
   * E03.03: Configure alerts on an element — trigger when value crosses threshold.
   */
  async configureAlert(elementId: string, alertConfig: AlertConfig) {
    const element = await prisma.dashboardDragElement.findUnique({ where: { id: elementId } });
    if (!element) throw new Error(`Element ${elementId} not found`);

    const existingConfig = (element.config as Record<string, unknown>) ?? {};
    const updatedConfig = {
      ...existingConfig,
      alert: {
        enabled: true,
        threshold: alertConfig.threshold,
        condition: alertConfig.condition,
        alertType: alertConfig.alertType,
      },
    };

    const updated = await prisma.dashboardDragElement.update({
      where: { id: elementId },
      data: { config: updatedConfig as unknown as Prisma.InputJsonValue },
    });

    logger.info('Alert configured', { elementId, threshold: alertConfig.threshold, condition: alertConfig.condition });
    await this.invalidateCache(elementId);
    return updated;
  }

  /**
   * E03.03: Export a dashboard element to a presentation slide.
   * Creates a job to render the element and embed it in a slide.
   */
  async exportToPresentation(params: {
    elementId: string;
    dashboardId: string;
    presentationId: string;
    slideIndex: number;
  }) {
    const element = await prisma.dashboardDragElement.findUnique({ where: { id: params.elementId } });
    if (!element) throw new Error(`Element ${params.elementId} not found`);

    const jobId = uuidv4();
    await prisma.$queryRawUnsafe(
      `INSERT INTO export_histories (id, dashboard_id, format, filename, file_size, exported_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      jobId,
      params.dashboardId,
      'pptx',
      `element-${params.elementId}-slide-${params.slideIndex}.pptx`,
      0,
      new Date(),
      JSON.stringify({
        type: 'EXPORT_ELEMENT_TO_SLIDE',
        elementId: params.elementId,
        presentationId: params.presentationId,
        slideIndex: params.slideIndex,
        elementConfig: element.config,
        elementType: element.elementType,
        status: 'pending',
      }),
    );

    logger.info('Element export to presentation queued', {
      elementId: params.elementId,
      presentationId: params.presentationId,
      jobId,
    });

    return { jobId, status: 'pending', elementId: params.elementId };
  }

  /**
   * E03.03: Update a single element's position after drag.
   */
  async updatePosition(elementId: string, dashboardId: string, newPosition: { x: number; y: number; w: number; h: number }) {
    const element = await prisma.dashboardDragElement.findFirst({
      where: { id: elementId, dashboardId },
    });
    if (!element) throw new Error(`Element ${elementId} not found in dashboard ${dashboardId}`);

    const updated = await prisma.dashboardDragElement.update({
      where: { id: elementId },
      data: {
        positionX: newPosition.x,
        positionY: newPosition.y,
        width: newPosition.w,
        height: newPosition.h,
      },
    });

    logger.info('Element position updated', { elementId, dashboardId });
    await this.invalidateCache(elementId);
    return updated;
  }

  private inferAggregation(elementType: string): string {
    if (elementType === 'kpi') return 'sum';
    if (elementType === 'table') return 'none';
    if (elementType === 'pie') return 'count';
    return 'sum';
  }
}

export const dragElementsService = new DragElementsService();
