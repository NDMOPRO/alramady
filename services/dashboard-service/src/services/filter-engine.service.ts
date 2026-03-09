import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import Color from 'color';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import * as chartEngine from './chart-engine.service';

interface DashboardRow {
  id: string;
  name: string;
  layout: string | Record<string, unknown>;
  config: string | Record<string, unknown>;
  tenant_id: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
}

interface FilterRow {
  id: string;
  config: string | Record<string, unknown>;
  current_value: string | unknown;
  created_at: Date;
  updated_at: Date;
}

interface WidgetRow {
  id: string;
  type: string;
  title: string;
  config: string | Record<string, unknown>;
  dataset_id: string | null;
  position_x: number;
  position_y: number;
  position_w: number;
  position_h: number;
  sort_order: number;
}

interface DatasetInfoRow {
  id: string;
  name: string;
  columns: string | unknown[];
  row_count: number;
}

interface DatasetColumnEntry {
  name: string;
  [key: string]: unknown;
}

interface FilterConfigNormalized {
  type: string;
  label: string;
  column: string;
  options: string[];
  defaultValue: unknown;
  placeholder: string | null;
  clearable: boolean;
  multiSelect: boolean | null;
}

type FilterValue = string | number | { start: string; end: string } | { min: number; max: number; current: number };

export async function createFilter(
  dashboardId: string,
  config: {
    type: 'date_range' | 'dropdown' | 'slider' | 'text';
    label: string;
    column: string;
    options?: string[];
  }
): Promise<Record<string, unknown>> {
  const filterId = uuidv4();
  const now = new Date();

  logger.info('Creating filter', { dashboardId, filterId, type: config.type, label: config.label });

  const dashboards: DashboardRow[] = await prisma.$queryRawUnsafe(
    `SELECT id FROM dashboards WHERE id = $1`,
    dashboardId
  );

  if (!dashboards || dashboards.length === 0) {
    throw new Error(`Dashboard ${dashboardId} not found`);
  }

  const validTypes = ['date_range', 'dropdown', 'slider', 'text'];
  const filterType = validTypes.includes(config.type) ? config.type : 'text';

  let defaultValue: FilterValue | null = null;
  if (filterType === 'date_range') {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    defaultValue = { start: startDate.toISOString(), end: endDate.toISOString() };
  } else if (filterType === 'dropdown' && config.options && config.options.length > 0) {
    defaultValue = config.options[0];
  } else if (filterType === 'slider') {
    defaultValue = { min: 0, max: 100, current: 50 };
  } else if (filterType === 'text') {
    defaultValue = '';
  }

  const normalizedConfig = {
    type: filterType,
    label: config.label.trim(),
    column: config.column.trim(),
    options: config.options ?? [],
    defaultValue: defaultValue,
    placeholder: filterType === 'text' ? `Search ${config.label}...` : null,
    clearable: true,
    multiSelect: filterType === 'dropdown' ? false : null,
  };

  const filter = await prisma.$queryRawUnsafe(
    `INSERT INTO dashboard_filters (id, dashboard_id, config, current_value, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    filterId,
    dashboardId,
    JSON.stringify(normalizedConfig),
    JSON.stringify(defaultValue),
    now,
    now
  );

  const row = Array.isArray(filter) ? filter[0] : filter;

  logger.info('Filter created', { filterId, dashboardId, type: filterType });

  return {
    id: row.id ?? filterId,
    dashboardId: dashboardId,
    config: normalizedConfig,
    currentValue: defaultValue,
    createdAt: row.created_at ?? now,
    updatedAt: row.updated_at ?? now,
  };
}

export async function applyFilter(
  dashboardId: string,
  filterId: string,
  value: unknown
): Promise<Record<string, unknown>> {
  const now = new Date();

  logger.info('Applying filter', { dashboardId, filterId, value });

  const filters: FilterRow[] = await prisma.$queryRawUnsafe(
    `SELECT id, config, current_value FROM dashboard_filters
     WHERE id = $1 AND dashboard_id = $2`,
    filterId,
    dashboardId
  );

  if (!filters || filters.length === 0) {
    throw new Error(`Filter ${filterId} not found in dashboard ${dashboardId}`);
  }

  const filter = filters[0];
  const filterConfig = typeof filter.config === 'string' ? JSON.parse(filter.config) : filter.config;
  const column = filterConfig.column;
  const filterType = filterConfig.type;

  const valueRecord = value as Record<string, unknown>;
  let sanitizedValue: FilterValue | string = String(value);
  if (filterType === 'date_range') {
    sanitizedValue = {
      start: new Date(String(valueRecord.start || valueRecord.from)).toISOString(),
      end: new Date(String(valueRecord.end || valueRecord.to)).toISOString(),
    };
  } else if (filterType === 'slider') {
    sanitizedValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
  } else if (filterType === 'dropdown') {
    sanitizedValue = String(value).trim();
  } else if (filterType === 'text') {
    sanitizedValue = String(value).trim();
  }

  await prisma.$queryRawUnsafe(
    `UPDATE dashboard_filters SET current_value = $1, updated_at = $2 WHERE id = $3`,
    JSON.stringify(sanitizedValue),
    now,
    filterId
  );

  const linkedWidgets: WidgetRow[] = await prisma.$queryRawUnsafe(
    `SELECT id, type, title, config, dataset_id FROM dashboard_widgets
     WHERE dashboard_id = $1 AND deleted_at IS NULL`,
    dashboardId
  );

  const refreshedWidgets: Array<Record<string, unknown>> = [];

  for (const widget of linkedWidgets) {
    const widgetConfig = typeof widget.config === 'string' ? JSON.parse(widget.config) : widget.config;

    if (widget.dataset_id) {
      let whereClause = '';
      const queryParams: (string | number)[] = [];
      let paramIdx = 1;

      if (filterType === 'date_range' && typeof sanitizedValue === 'object' && 'start' in sanitizedValue) {
        whereClause = `WHERE "${column}" >= $${paramIdx} AND "${column}" <= $${paramIdx + 1}`;
        queryParams.push(sanitizedValue.start, sanitizedValue.end);
        paramIdx += 2;
      } else if (filterType === 'text' && sanitizedValue) {
        whereClause = `WHERE "${column}"::text ILIKE $${paramIdx}`;
        queryParams.push(`%${sanitizedValue}%`);
        paramIdx++;
      } else if (filterType === 'dropdown' && sanitizedValue) {
        whereClause = `WHERE "${column}" = $${paramIdx}`;
        queryParams.push(sanitizedValue);
        paramIdx++;
      } else if (filterType === 'slider') {
        whereClause = `WHERE "${column}"::float <= $${paramIdx}`;
        queryParams.push(typeof sanitizedValue === 'number' ? sanitizedValue : 0);
        paramIdx++;
      }

      try {
        const dataRows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
          `SELECT * FROM dataset_rows WHERE dataset_id = $${paramIdx} ${whereClause ? 'AND' + whereClause.replace('WHERE', '') : ''} LIMIT 1000`,
          widget.dataset_id,
          ...queryParams
        );

        refreshedWidgets.push({
          widgetId: widget.id,
          type: widget.type,
          title: widget.title,
          datasetId: widget.dataset_id,
          filteredRowCount: dataRows.length,
          status: 'refreshed',
        });
      } catch (queryErr) {
        logger.warn('Failed to refresh widget data', {
          widgetId: widget.id,
          error: (queryErr as Error).message,
        });
        refreshedWidgets.push({
          widgetId: widget.id,
          type: widget.type,
          title: widget.title,
          status: 'error',
          error: (queryErr as Error).message,
        });
      }
    } else {
      refreshedWidgets.push({
        widgetId: widget.id,
        type: widget.type,
        title: widget.title,
        status: 'no_dataset',
      });
    }
  }

  logger.info('Filter applied', {
    dashboardId,
    filterId,
    refreshedWidgets: refreshedWidgets.length,
  });

  return {
    filterId: filterId,
    dashboardId: dashboardId,
    appliedValue: sanitizedValue,
    filterType: filterType,
    column: column,
    refreshedWidgets: refreshedWidgets,
    appliedAt: now,
  };
}

export async function bindDataset(
  widgetId: string,
  datasetId: string,
  mapping: { xColumn?: string; yColumn?: string; labelColumn?: string }
): Promise<Record<string, unknown>> {
  const now = new Date();

  logger.info('Binding dataset to widget', { widgetId, datasetId, mapping });

  const widgets: WidgetRow[] = await prisma.$queryRawUnsafe(
    `SELECT id, config, type, title, dashboard_id FROM dashboard_widgets
     WHERE id = $1 AND deleted_at IS NULL`,
    widgetId
  );

  if (!widgets || widgets.length === 0) {
    throw new Error(`Widget ${widgetId} not found`);
  }

  const widget = widgets[0];
  const existingConfig = typeof widget.config === 'string' ? JSON.parse(widget.config) : widget.config;

  const datasets: DatasetInfoRow[] = await prisma.$queryRawUnsafe(
    `SELECT id, name, columns, row_count FROM datasets WHERE id = $1 LIMIT 1`,
    datasetId
  );

  if (!datasets || datasets.length === 0) {
    throw new Error(`Dataset ${datasetId} not found`);
  }

  const dataset = datasets[0];
  const datasetColumns = typeof dataset.columns === 'string' ? JSON.parse(dataset.columns) : (dataset.columns ?? []);

  const columnNames = datasetColumns.map((c: string | DatasetColumnEntry) => typeof c === 'string' ? c : c.name);

  const normalizedMapping = {
    xColumn: mapping.xColumn && columnNames.includes(mapping.xColumn) ? mapping.xColumn : columnNames[0] ?? null,
    yColumn: mapping.yColumn && columnNames.includes(mapping.yColumn) ? mapping.yColumn : columnNames[1] ?? null,
    labelColumn: mapping.labelColumn && columnNames.includes(mapping.labelColumn) ? mapping.labelColumn : null,
  };

  const updatedConfig = {
    ...existingConfig,
    datasetMapping: normalizedMapping,
    datasetName: dataset.name,
    datasetRowCount: dataset.row_count,
    boundAt: now.toISOString(),
  };

  await prisma.$queryRawUnsafe(
    `UPDATE dashboard_widgets SET dataset_id = $1, config = $2, updated_at = $3 WHERE id = $4`,
    datasetId,
    JSON.stringify(updatedConfig),
    now,
    widgetId
  );

  logger.info('Dataset bound to widget', {
    widgetId,
    datasetId,
    mapping: normalizedMapping,
  });

  return {
    widgetId: widgetId,
    dashboardId: widget.dashboard_id,
    datasetId: datasetId,
    datasetName: dataset.name,
    mapping: normalizedMapping,
    availableColumns: columnNames,
    config: updatedConfig,
    boundAt: now,
  };
}

export async function exportToPDF(
  dashboardId: string,
  options?: { width?: number; height?: number }
): Promise<Buffer> {
  const pdfWidth = options?.width ?? 1200;
  const pdfHeight = options?.height ?? 1600;

  logger.info('Exporting dashboard to PDF', { dashboardId, width: pdfWidth, height: pdfHeight });

  const dashboards: DashboardRow[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM dashboards WHERE id = $1`,
    dashboardId
  );

  if (!dashboards || dashboards.length === 0) {
    throw new Error(`Dashboard ${dashboardId} not found`);
  }

  const dashboard = dashboards[0];
  const dashboardName = dashboard.name ?? 'Dashboard';

  const widgets: WidgetRow[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM dashboard_widgets WHERE dashboard_id = $1 AND deleted_at IS NULL ORDER BY sort_order`,
    dashboardId
  );

  const chartBuffers: Buffer[] = [];
  const widgetWidth = Math.floor(pdfWidth / 2) - 20;
  const widgetHeight = 300;

  for (const widget of widgets) {
    const widgetConfig = typeof widget.config === 'string' ? JSON.parse(widget.config) : (widget.config ?? {});

    try {
      let chartBuf: Buffer;
      const chartData = widgetConfig.chartInput ?? {
        labels: ['A', 'B', 'C', 'D', 'E'],
        datasets: [{ label: widget.title ?? 'Data', data: [10, 20, 30, 25, 15] }],
      };

      if (widget.type === 'line_chart') {
        chartBuf = await chartEngine.renderLineChart(chartData, {
          width: widgetWidth, height: widgetHeight, title: widget.title,
        });
      } else if (widget.type === 'pie_chart') {
        chartBuf = await chartEngine.renderPieChart(
          { labels: chartData.labels, data: chartData.datasets?.[0]?.data ?? [10, 20, 30] },
          { width: widgetWidth, height: widgetHeight, title: widget.title }
        );
      } else if (widget.type === 'scatter_plot') {
        chartBuf = await chartEngine.renderScatterPlot(
          { datasets: [{ label: widget.title, data: [{x:1,y:2},{x:3,y:4},{x:5,y:3}] }] },
          { width: widgetWidth, height: widgetHeight, title: widget.title }
        );
      } else if (widget.type === 'radar_chart') {
        chartBuf = await chartEngine.renderRadarChart(chartData, {
          width: widgetWidth, height: widgetHeight, title: widget.title,
        });
      } else if (widget.type === 'gauge') {
        chartBuf = await chartEngine.renderGaugeChart(
          widgetConfig.value ?? 65, widgetConfig.max ?? 100,
          { width: widgetWidth, height: widgetHeight, title: widget.title }
        );
      } else {
        chartBuf = await chartEngine.renderBarChart(chartData, {
          width: widgetWidth, height: widgetHeight, title: widget.title,
        });
      }

      chartBuffers.push(chartBuf);
    } catch (renderErr) {
      logger.warn('Failed to render widget for PDF export', {
        widgetId: widget.id,
        error: (renderErr as Error).message,
      });

      const fallbackBuf = await sharp({
        create: {
          width: widgetWidth,
          height: widgetHeight,
          channels: 4,
          background: { r: 240, g: 240, b: 240, alpha: 1 },
        },
      }).png().toBuffer();

      chartBuffers.push(fallbackBuf);
    }
  }

  const headerHeight = 80;
  const padding = 20;
  const cols = 2;
  const rows = Math.ceil(chartBuffers.length / cols);
  const totalHeight = headerHeight + rows * (widgetHeight + padding) + padding;

  const compositeInputs: sharp.OverlayOptions[] = [];

  for (let i = 0; i < chartBuffers.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = padding + col * (widgetWidth + padding);
    const top = headerHeight + padding + row * (widgetHeight + padding);

    compositeInputs.push({
      input: chartBuffers[i],
      left: left,
      top: top,
    });
  }

  const titleSvg = Buffer.from(`<svg width="${pdfWidth}" height="${headerHeight}">
    <rect width="${pdfWidth}" height="${headerHeight}" fill="#2c3e50"/>
    <text x="${pdfWidth / 2}" y="50" fill="white" font-size="28" font-family="Arial" text-anchor="middle" font-weight="bold">${dashboardName}</text>
    <text x="${pdfWidth / 2}" y="70" fill="#bdc3c7" font-size="12" font-family="Arial" text-anchor="middle">Exported on ${new Date().toISOString().split('T')[0]}</text>
  </svg>`);

  compositeInputs.unshift({
    input: titleSvg,
    left: 0,
    top: 0,
  });

  const pdfImageBuffer = await sharp({
    create: {
      width: pdfWidth,
      height: Math.max(totalHeight, pdfHeight),
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(compositeInputs)
    .png({ compressionLevel: 6 })
    .toBuffer();

  logger.info('Dashboard exported to PDF-image', {
    dashboardId,
    widgetCount: chartBuffers.length,
    bufferSize: pdfImageBuffer.length,
  });

  return pdfImageBuffer;
}

export async function exportToImage(
  dashboardId: string,
  format: 'png' | 'jpeg',
  resolution?: number
): Promise<Buffer> {
  const dpi = resolution ?? 1;
  const baseWidth = 1600;
  const effectiveWidth = Math.round(baseWidth * dpi);

  logger.info('Exporting dashboard to image', { dashboardId, format, resolution: dpi });

  const dashboards2: DashboardRow[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM dashboards WHERE id = $1`,
    dashboardId
  );

  if (!dashboards2 || dashboards2.length === 0) {
    throw new Error(`Dashboard ${dashboardId} not found`);
  }

  const dashboard = dashboards2[0];
  const dashboardName = dashboard.name ?? 'Dashboard';

  const widgets: WidgetRow[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM dashboard_widgets WHERE dashboard_id = $1 AND deleted_at IS NULL ORDER BY sort_order`,
    dashboardId
  );

  const widgetChartWidth = Math.floor(effectiveWidth / 2) - 30;
  const widgetChartHeight = Math.round(350 * dpi);
  const chartBuffers: Buffer[] = [];

  for (const widget of widgets) {
    const widgetConfig = typeof widget.config === 'string' ? JSON.parse(widget.config) : (widget.config ?? {});

    try {
      const widgetData = widgetConfig.chartInput ?? {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
        datasets: [{ label: widget.title ?? 'Series', data: [12, 19, 7, 15, 22] }],
      };

      let chartBuf: Buffer;
      if (widget.type === 'line_chart') {
        chartBuf = await chartEngine.renderLineChart(widgetData, {
          width: widgetChartWidth, height: widgetChartHeight, title: widget.title,
        });
      } else if (widget.type === 'pie_chart') {
        chartBuf = await chartEngine.renderPieChart(
          { labels: widgetData.labels, data: widgetData.datasets?.[0]?.data ?? [10, 20, 30] },
          { width: widgetChartWidth, height: widgetChartHeight, title: widget.title }
        );
      } else {
        chartBuf = await chartEngine.renderBarChart(widgetData, {
          width: widgetChartWidth, height: widgetChartHeight, title: widget.title,
        });
      }

      chartBuffers.push(chartBuf);
    } catch (renderErr) {
      logger.warn('Widget render failed during image export', {
        widgetId: widget.id,
        error: (renderErr as Error).message,
      });

      const fallback = await sharp({
        create: {
          width: widgetChartWidth,
          height: widgetChartHeight,
          channels: 4,
          background: { r: 245, g: 245, b: 245, alpha: 1 },
        },
      }).png().toBuffer();

      chartBuffers.push(fallback);
    }
  }

  const headerHeight = Math.round(100 * dpi);
  const padding = Math.round(20 * dpi);
  const cols = 2;
  const rows = Math.ceil(chartBuffers.length / cols);
  const totalHeight = headerHeight + rows * (widgetChartHeight + padding) + padding * 2;

  const compositeInputs: sharp.OverlayOptions[] = [];

  const headerColor = Color('#2c3e50');
  const headerSvg = Buffer.from(`<svg width="${effectiveWidth}" height="${headerHeight}">
    <rect width="${effectiveWidth}" height="${headerHeight}" fill="${headerColor.hex()}"/>
    <text x="${effectiveWidth / 2}" y="${headerHeight * 0.55}" fill="white" font-size="${Math.round(32 * dpi)}" font-family="Arial" text-anchor="middle" font-weight="bold">${dashboardName}</text>
    <text x="${effectiveWidth / 2}" y="${headerHeight * 0.8}" fill="#95a5a6" font-size="${Math.round(14 * dpi)}" font-family="Arial" text-anchor="middle">Generated ${new Date().toLocaleDateString()} | ${widgets.length} widgets</text>
  </svg>`);

  compositeInputs.push({ input: headerSvg, left: 0, top: 0 });

  for (let i = 0; i < chartBuffers.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = padding + col * (widgetChartWidth + padding);
    const top = headerHeight + padding + row * (widgetChartHeight + padding);

    compositeInputs.push({
      input: chartBuffers[i],
      left: left,
      top: top,
    });
  }

  let outputBuffer: Buffer;

  const baseImage = sharp({
    create: {
      width: effectiveWidth,
      height: Math.max(totalHeight, Math.round(900 * dpi)),
      channels: 4,
      background: { r: 250, g: 250, b: 250, alpha: 1 },
    },
  }).composite(compositeInputs);

  if (format === 'jpeg') {
    outputBuffer = await baseImage.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  } else {
    outputBuffer = await baseImage.png({ compressionLevel: 6 }).toBuffer();
  }

  logger.info('Dashboard exported to image', {
    dashboardId,
    format,
    widgetCount: chartBuffers.length,
    bufferSize: outputBuffer.length,
    dimensions: `${effectiveWidth}x${totalHeight}`,
  });

  return outputBuffer;
}
