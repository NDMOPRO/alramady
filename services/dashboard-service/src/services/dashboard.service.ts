import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration } from 'chart.js';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { Prisma, PrismaClient } from '@prisma/client';
import { PassThrough } from 'stream';
import { logger } from '../utils/logger.js';

interface ChartDataInput {
  labels: string[];
  datasets: Array<{
    label?: string;
    data?: number[];
    values?: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    fill?: boolean;
  }>;
}

interface ChartConfigInput {
  showLegend?: boolean;
  legendPosition?: string;
  title?: string;
  beginAtZero?: boolean;
  yAxisTitle?: string;
  xAxisTitle?: string;
}

interface WidgetConfigRecord {
  title?: string;
  labelColumn?: string;
  valueColumn?: string;
  chartType?: string;
  value?: string;
  [key: string]: unknown;
}

interface WidgetData {
  id: string;
  type: string;
  config: unknown;
  position: unknown;
  dataset: { id: string; name: string; columnCount: number; rowCount: number } | null;
  data: unknown[] | null;
}

const prisma = new PrismaClient();
const chartRenderer = new ChartJSNodeCanvas({ width: 800, height: 400, backgroundColour: 'white' });

export class DashboardService {

  async createDashboard(name: string, tenantId: string, userId: string, layout?: Record<string, unknown>) {
    const dashboard = await prisma.dashboard.create({
      data: {
        tenantId,
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
        layout: (layout || { columns: 12, rowHeight: 60, widgets: [] }) as Prisma.InputJsonValue,
        filters: [] as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
    return { id: dashboard.id, name, layout: dashboard.layout };
  }

  async addWidget(dashboardId: string, widget: { type: string; config: Record<string, unknown>; datasetId?: string; position: Record<string, unknown> }) {
    const dashboard = await prisma.dashboard.findUnique({ where: { id: dashboardId } });
    if (!dashboard) throw new Error('Dashboard not found');

    const dbWidget = await prisma.dashboardWidget.create({
      data: {
        dashboardId,
        type: widget.type as any,
        title: (widget.config as Record<string, unknown>)?.title as string || 'Untitled',
        config: widget.config as Prisma.InputJsonValue,
        datasetId: widget.datasetId,
        position: widget.position as Prisma.InputJsonValue,
        size: { width: 400, height: 300 } as Prisma.InputJsonValue,
      },
    });

    return { id: dbWidget.id, type: widget.type, position: widget.position };
  }

  async getDashboard(dashboardId: string, tenantId: string) {
    const dashboard = await prisma.dashboard.findFirst({
      where: { id: dashboardId, tenantId },
      include: {
        widgets: { include: { dataset: { select: { id: true, name: true, columnCount: true, rowCount: true } } } },
      },
    });
    if (!dashboard) throw new Error('Dashboard not found');

    const widgetsWithData = await Promise.all(
      dashboard.widgets.map(async (w: typeof dashboard.widgets[number]) => {
        let data: unknown[] | null = null;
        if (w.datasetId) {
          const rows = await prisma.dataRow.findMany({
            where: { datasetId: w.datasetId },
            take: 500,
            orderBy: { rowIndex: 'asc' },
          });
          data = rows.map(r => r.data);
        }
        return {
          id: w.id,
          type: w.type,
          config: w.config,
          position: w.position,
          dataset: w.dataset,
          data,
        };
      })
    );

    return { ...dashboard, widgets: widgetsWithData };
  }

  async listDashboards(tenantId: string, options: { page?: number; limit?: number; search?: string }) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (options.search) where.name = { contains: options.search, mode: 'insensitive' };

    const [dashboards, total] = await Promise.all([
      prisma.dashboard.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { widgets: true } } },
      }),
      prisma.dashboard.count({ where }),
    ]);

    return {
      data: dashboards.map(d => ({ id: d.id, name: d.name, isPublished: d.publishedAt !== null, widgetCount: d._count.widgets, createdAt: d.createdAt })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async renderChart(type: string, data: ChartDataInput, config: ChartConfigInput = {}): Promise<Buffer> {
    const chartConfiguration: ChartConfiguration = {
      type: type as ChartConfiguration['type'],
      data: {
        labels: data.labels || [],
        datasets: (data.datasets || []).map((ds, i: number) => ({
          label: ds.label || `Series ${i + 1}`,
          data: ds.data || ds.values || [],
          backgroundColor: ds.backgroundColor || this.generateColors(ds.data?.length || 1),
          borderColor: ds.borderColor || this.generateColors(ds.data?.length || 1, 1),
          borderWidth: ds.borderWidth || 1,
          fill: ds.fill !== undefined ? ds.fill : (type === 'line' ? false : undefined),
        })),
      },
      options: {
        responsive: false,
        plugins: {
          legend: { display: config.showLegend !== false, position: (config.legendPosition || 'top') as 'top' | 'bottom' | 'left' | 'right' },
          title: { display: !!config.title, text: config.title || '' },
        },
        scales: type !== 'pie' && type !== 'doughnut' && type !== 'radar' ? {
          y: { beginAtZero: config.beginAtZero !== false, title: { display: !!config.yAxisTitle, text: config.yAxisTitle } },
          x: { title: { display: !!config.xAxisTitle, text: config.xAxisTitle } },
        } : undefined,
      },
    };

    const imageBuffer = await chartRenderer.renderToBuffer(chartConfiguration);
    return imageBuffer;
  }

  async renderWidgetChart(widgetId: string): Promise<Buffer> {
    const widget = await prisma.dashboardWidget.findUnique({ where: { id: widgetId } });
    if (!widget) throw new Error('Widget not found');

    const widgetConfig = widget.config as WidgetConfigRecord;
    const data: ChartDataInput = { labels: [], datasets: [] };

    if (widget.datasetId) {
      const rows = await prisma.dataRow.findMany({
        where: { datasetId: widget.datasetId },
        take: 200,
        orderBy: { rowIndex: 'asc' },
      });

      const rowData = rows.map(r => r.data as Record<string, unknown>);
      if (rowData.length > 0 && widgetConfig.labelColumn && widgetConfig.valueColumn) {
        data.labels = rowData.map(r => String(r[widgetConfig.labelColumn!] || ''));
        data.datasets = [{
          label: widgetConfig.valueColumn,
          data: rowData.map(r => Number(r[widgetConfig.valueColumn!]) || 0),
        }];
      }
    }

    const chartType = widgetConfig.chartType || (widget.type === 'BAR_CHART' ? 'bar' : 'bar');
    return this.renderChart(chartType, data, widgetConfig as ChartConfigInput);
  }

  async exportToPDF(dashboardId: string, tenantId: string): Promise<Buffer> {
    const dashboard = await this.getDashboard(dashboardId, tenantId);

    const pdfBuffer = await new Promise<Buffer>(async (resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
      const stream = new PassThrough();

      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);

      doc.pipe(stream);

      doc.fontSize(20).font('Helvetica-Bold').text(dashboard.name, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').fillColor('#666')
        .text(`Generated: ${new Date().toISOString().split('T')[0]}`, { align: 'center' });
      doc.moveDown(1);

      for (const widget of dashboard.widgets) {
        if (doc.y > doc.page.height - 100) doc.addPage();

        if (widget.type === 'BAR_CHART' && widget.data && widget.data.length > 0) {
          try {
            const wConfig = widget.config as WidgetConfigRecord;
            const chartData: ChartDataInput = {
              labels: widget.data.slice(0, 20).map((r: unknown) => {
                const row = r as Record<string, unknown>;
                return String(row[wConfig?.labelColumn ?? ''] || '');
              }),
              datasets: [{
                label: wConfig?.valueColumn || 'Value',
                data: widget.data.slice(0, 20).map((r: unknown) => {
                  const row = r as Record<string, unknown>;
                  return Number(row[wConfig?.valueColumn ?? ''] || 0);
                }),
              }],
            };
            const chartImage = await this.renderChart(wConfig?.chartType || 'bar', chartData, wConfig as ChartConfigInput);
            doc.image(chartImage, { width: 500 });
            doc.moveDown(1);
          } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            logger.warn('Chart render failed for PDF', { widgetId: widget.id, error: errMsg });
          }
        }

        if (widget.type === 'KPI_CARD') {
          const wConfig = widget.config as WidgetConfigRecord;
          doc.fontSize(14).font('Helvetica-Bold').text(wConfig?.title || 'Metric');
          doc.fontSize(28).text(wConfig?.value || '0');
          doc.moveDown(1);
        }

        if (widget.type === 'TABLE' && widget.data) {
          const wConfig = widget.config as WidgetConfigRecord;
          doc.fontSize(12).font('Helvetica-Bold').text(wConfig?.title || 'Table');
          doc.moveDown(0.5);

          const firstRow = widget.data[0] as Record<string, unknown> | undefined;
          const cols = Object.keys(firstRow || {}).slice(0, 6);
          const colWidth = (doc.page.width - 80) / cols.length;

          cols.forEach((col, i) => {
            doc.fontSize(8).font('Helvetica-Bold').text(col, 40 + i * colWidth, doc.y, { width: colWidth, continued: i < cols.length - 1 });
          });
          doc.moveDown(0.5);

          widget.data.slice(0, 20).forEach((rowItem: unknown) => {
            const row = rowItem as Record<string, unknown>;
            cols.forEach((col, i) => {
              doc.fontSize(7).font('Helvetica').text(String(row[col] ?? '').substring(0, 30), 40 + i * colWidth, doc.y, { width: colWidth, continued: i < cols.length - 1 });
            });
            doc.moveDown(0.3);
          });
          doc.moveDown(1);
        }
      }

      doc.end();
    });

    return pdfBuffer;
  }

  async deleteWidget(dashboardId: string, widgetId: string) {
    await prisma.dashboardWidget.delete({ where: { id: widgetId } });
    return { deleted: true, widgetId };
  }

  async deleteDashboard(dashboardId: string, tenantId: string) {
    const dashboard = await prisma.dashboard.findFirst({ where: { id: dashboardId, tenantId } });
    if (!dashboard) throw new Error('Dashboard not found');
    await prisma.dashboardWidget.deleteMany({ where: { dashboardId } });
    await prisma.dashboardFilter.deleteMany({ where: { dashboardId } });
    await prisma.dashboard.delete({ where: { id: dashboardId } });
    return { deleted: true };
  }

  async duplicateDashboard(dashboardId: string, tenantId: string, userId: string) {
    const original = await prisma.dashboard.findFirst({
      where: { id: dashboardId, tenantId },
      include: { widgets: true },
    });
    if (!original) throw new Error('Dashboard not found');

    const copy = await prisma.dashboard.create({
      data: {
        tenantId,
        name: `${original.name} (Copy)`,
        slug: original.slug + '-copy-' + Date.now(),
        layout: original.layout as Prisma.InputJsonValue,
        filters: original.filters as Prisma.InputJsonValue,
        createdById: userId,
      },
    });

    for (const widget of original.widgets) {
      await prisma.dashboardWidget.create({
        data: {
          dashboardId: copy.id,
          type: widget.type,
          title: widget.title,
          config: widget.config as Prisma.InputJsonValue,
          datasetId: widget.datasetId,
          position: widget.position as Prisma.InputJsonValue,
          size: widget.size as Prisma.InputJsonValue,
        },
      });
    }

    return { id: copy.id, name: copy.name };
  }

  private generateColors(count: number, alpha: number = 0.6): string[] {
    const baseColors = [
      [54, 162, 235], [255, 99, 132], [75, 192, 192], [255, 205, 86],
      [153, 102, 255], [255, 159, 64], [201, 203, 207], [0, 128, 128],
    ];
    return Array.from({ length: count }, (_, i) => {
      const [r, g, b] = baseColors[i % baseColors.length];
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    });
  }
}

export const dashboardService = new DashboardService();
