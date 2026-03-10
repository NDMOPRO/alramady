import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration } from 'chart.js';
import PDFDocument from 'pdfkit';
import PptxGenJS from 'pptxgenjs';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { PassThrough } from 'stream';

interface PrismaWidgetRecord {
  id: string;
  title?: string;
  type?: string;
  chartType?: string;
  datasetId?: string;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  config?: Record<string, unknown>;
}

interface PrismaDashboardRecord {
  id: string;
  title?: string;
  name?: string;
  widgets: PrismaWidgetRecord[];
}

// ─── Interfaces ──────────────────────────────────────────────────────
interface WidgetConfig {
  id: string;
  title: string;
  type: string;
  chartType?: string;
  datasetId?: string;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  config?: Record<string, unknown>;
}

interface WidgetSnapshot {
  imageBuffer: Buffer;
  format: 'png';
  widgetId: string;
  title: string;
  type: string;
  width: number;
  height: number;
  position: { x: number; y: number; w: number; h: number };
}

interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
  }>;
}

interface ExportResult {
  id: string;
  dashboardId: string;
  format: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  fileSize: number;
  exportedAt: Date;
  metadata: Record<string, unknown>;
}

interface BatchExportResult {
  id: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  fileSize: number;
  exports: Array<{ dashboardId: string; success: boolean; error?: string }>;
}

const CHART_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0',
  '#00BCD4', '#FF5722', '#795548', '#607D8B', '#3F51B5',
];

// ─── Service ─────────────────────────────────────────────────────────
export default class ExportEngineService {
  private prisma: PrismaClient;
  private chartRenderer: ChartJSNodeCanvas;
  private chartRendererWide: ChartJSNodeCanvas;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.chartRenderer = new ChartJSNodeCanvas({
      width: 800,
      height: 480,
      backgroundColour: '#FFFFFF',
    });
    this.chartRendererWide = new ChartJSNodeCanvas({
      width: 1200,
      height: 600,
      backgroundColour: '#FFFFFF',
    });
  }

  /**
   * Fetches real data from dataset_rows for a given widget.
   * Returns labels and datasets suitable for Chart.js rendering.
   */
  async fetchWidgetData(widget: WidgetConfig, tenantId: string): Promise<ChartData> {
    const datasetId = widget.datasetId || (widget.config as Record<string, unknown>)?.datasetId as string | undefined;

    if (!datasetId) {
      return { labels: ['No Dataset'], datasets: [{ label: widget.title || 'Data', data: [0] }] };
    }

    const rows = await this.prisma.dataRow.findMany({
      where: {
        datasetId,
        dataset: { tenantId },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    if (rows.length === 0) {
      return { labels: ['No Data'], datasets: [{ label: widget.title || 'Data', data: [0] }] };
    }

    const firstRowData = typeof rows[0].data === 'string'
      ? JSON.parse(rows[0].data)
      : rows[0].data as Record<string, unknown>;

    const columns = Object.keys(firstRowData);
    const labelColumn = columns[0];
    const valueColumns = columns.slice(1).filter((col) => {
      const sample = firstRowData[col];
      return typeof sample === 'number' || !isNaN(Number(sample));
    });

    if (valueColumns.length === 0) {
      return {
        labels: rows.map((r, idx) => {
          const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data as Record<string, unknown>;
          return String(d[labelColumn] ?? `Row ${idx + 1}`);
        }),
        datasets: [{
          label: 'Count',
          data: rows.map(() => 1),
        }],
      };
    }

    const labels = rows.map((r) => {
      const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data as Record<string, unknown>;
      return String(d[labelColumn] ?? '');
    });

    const datasets = valueColumns.map((col, colIdx) => ({
      label: col,
      data: rows.map((r) => {
        const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data as Record<string, unknown>;
        return Number(d[col]) || 0;
      }),
      backgroundColor: CHART_COLORS[colIdx % CHART_COLORS.length],
      borderColor: CHART_COLORS[colIdx % CHART_COLORS.length],
      borderWidth: 2,
    }));

    return { labels, datasets };
  }

  /**
   * Captures a single widget as a PNG snapshot using ChartJSNodeCanvas.
   * All chart data is fetched from the real database.
   */
  async captureWidgetSnapshot(widgetId: string, tenantId: string): Promise<WidgetSnapshot> {
    const widget = await this.prisma.widget.findUnique({
      where: { id: widgetId },
    });

    if (!widget) {
      throw new Error(`Widget not found: ${widgetId}`);
    }

    const w = widget as unknown as PrismaWidgetRecord;
    const widgetConfig: WidgetConfig = {
      id: w.id,
      title: w.title || 'Untitled Widget',
      type: w.type || 'bar',
      chartType: w.chartType || w.type || 'bar',
      datasetId: w.datasetId,
      positionX: w.positionX ?? 0,
      positionY: w.positionY ?? 0,
      width: w.width ?? 800,
      height: w.height ?? 480,
      config: w.config,
    };

    const chartData = await this.fetchWidgetData(widgetConfig, tenantId);

    const resolvedChartType = this.resolveChartType(widgetConfig.chartType || widgetConfig.type);

    const chartConfig: Record<string, unknown> = {
      type: resolvedChartType,
      data: {
        labels: chartData.labels,
        datasets: chartData.datasets.map((ds) => ({
          ...ds,
          backgroundColor: resolvedChartType === 'pie' || resolvedChartType === 'doughnut'
            ? chartData.labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length])
            : ds.backgroundColor,
          borderColor: resolvedChartType === 'line'
            ? ds.borderColor
            : undefined,
          fill: resolvedChartType === 'line' ? false : undefined,
        })),
      },
      options: {
        responsive: false,
        animation: false as const,
        plugins: {
          title: {
            display: true,
            text: widgetConfig.title,
            font: { size: 16, weight: 'bold' as const },
            color: '#333333',
          },
          legend: {
            display: chartData.datasets.length > 1 || resolvedChartType === 'pie' || resolvedChartType === 'doughnut',
            position: 'bottom' as const,
          },
        },
        scales: resolvedChartType !== 'pie' && resolvedChartType !== 'doughnut' && resolvedChartType !== 'radar'
          ? {
            x: { grid: { color: '#E0E0E0' }, ticks: { color: '#666666' } },
            y: { grid: { color: '#E0E0E0' }, ticks: { color: '#666666' }, beginAtZero: true },
          }
          : undefined,
      },
    };

    const imageBuffer = await this.chartRenderer.renderToBuffer(chartConfig as unknown as ChartConfiguration);

    if (imageBuffer.length < 1000) {
      throw new Error(`Chart rendering produced insufficient data for widget ${widgetId}: ${imageBuffer.length} bytes`);
    }

    return {
      imageBuffer,
      format: 'png',
      widgetId,
      title: widgetConfig.title,
      type: widgetConfig.type,
      width: 800,
      height: 480,
      position: {
        x: widgetConfig.positionX ?? 0,
        y: widgetConfig.positionY ?? 0,
        w: widgetConfig.width ?? 800,
        h: widgetConfig.height ?? 480,
      },
    };
  }

  /**
   * Exports an entire dashboard to PDF.
   * Each widget is rendered as a real chart PNG and placed on PDF pages.
   */
  async exportDashboardToPDF(dashboardId: string, tenantId: string): Promise<ExportResult> {
    const dashboard = await this.prisma.dashboard.findUnique({
      where: { id: dashboardId },
      include: { widgets: true },
    });

    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    const snapshots: WidgetSnapshot[] = [];
    for (const widget of dashboard.widgets) {
      try {
        const snapshot = await this.captureWidgetSnapshot(widget.id, tenantId);
        snapshots.push(snapshot);
      } catch (err) {
        console.error(`Failed to capture widget ${widget.id}:`, err);
      }
    }

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
      info: {
        Title: (dashboard as unknown as PrismaDashboardRecord).title || 'Dashboard Export',
        Author: 'Rasid Platform',
        Subject: 'Dashboard Export',
        CreationDate: new Date(),
      },
    });

    const buffers: Buffer[] = [];
    const passThrough = new PassThrough();
    doc.pipe(passThrough);
    passThrough.on('data', (chunk: Buffer) => buffers.push(chunk));

    const pageWidth = 842;
    const pageHeight = 595;

    doc
      .fontSize(24)
      .fillColor('#1B5E20')
      .text((dashboard as unknown as PrismaDashboardRecord).title || 'Dashboard Export', { align: 'center' });

    doc
      .fontSize(10)
      .fillColor('#999999')
      .text(`Generated: ${new Date().toISOString()}`, { align: 'center' });

    doc.moveDown(1);
    doc.strokeColor('#4CAF50').lineWidth(2).moveTo(40, doc.y).lineTo(pageWidth - 40, doc.y).stroke();
    doc.moveDown(1);

    const usableWidth = pageWidth - 80;
    const widgetRenderWidth = (usableWidth - 15) / 2;
    const widgetRenderHeight = widgetRenderWidth * 0.6;
    let currentX = 40;
    let currentY = doc.y;
    let colIndex = 0;

    for (const snapshot of snapshots) {
      if (currentY + widgetRenderHeight + 30 > pageHeight - 60) {
        doc.addPage();
        currentY = 50;
        currentX = 40;
        colIndex = 0;
      }

      doc.fontSize(11).fillColor('#333333').text(snapshot.title, currentX, currentY, { width: widgetRenderWidth });
      currentY += 18;

      try {
        const resized = await sharp(snapshot.imageBuffer)
          .resize(Math.round(widgetRenderWidth * 2), Math.round(widgetRenderHeight * 2), {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .png()
          .toBuffer();

        doc.image(resized, currentX, currentY, {
          width: widgetRenderWidth,
          height: widgetRenderHeight,
        });
      } catch {
        doc
          .rect(currentX, currentY, widgetRenderWidth, widgetRenderHeight)
          .fillColor('#F5F5F5')
          .fill()
          .fillColor('#333333')
          .fontSize(10)
          .text('Widget render unavailable', currentX + 10, currentY + widgetRenderHeight / 2);
      }

      colIndex++;
      if (colIndex >= 2) {
        colIndex = 0;
        currentX = 40;
        currentY += widgetRenderHeight + 30;
      } else {
        currentX += widgetRenderWidth + 15;
      }
    }

    doc
      .fontSize(7)
      .fillColor('#999999')
      .text('Generated by Rasid Platform', 40, pageHeight - 30, { width: pageWidth - 80, align: 'center' });

    doc.end();

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      passThrough.on('end', () => resolve(Buffer.concat(buffers)));
    });

    const exportId = crypto.randomUUID();
    const filename = `dashboard-${dashboardId.substring(0, 8)}-${Date.now()}.pdf`;

    await this.prisma.exportHistory.create({
      data: {
        id: exportId,
        dashboardId,
        format: 'pdf',
        filename,
        fileSize: pdfBuffer.length,
        exportedAt: new Date(),
        metadata: {
          widgetCount: snapshots.length,
          pageSize: 'A4',
          orientation: 'landscape',
        },
      },
    });

    return {
      id: exportId,
      dashboardId,
      format: 'pdf',
      buffer: pdfBuffer,
      filename,
      mimeType: 'application/pdf',
      fileSize: pdfBuffer.length,
      exportedAt: new Date(),
      metadata: { widgetCount: snapshots.length },
    };
  }

  /**
   * Exports dashboard to a single composited PNG image using sharp.
   */
  async exportDashboardToPNG(
    dashboardId: string,
    tenantId: string,
    width: number = 1920,
    height?: number,
  ): Promise<ExportResult> {
    const dashboard = await this.prisma.dashboard.findUnique({
      where: { id: dashboardId },
      include: { widgets: true },
    });

    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    const snapshots: WidgetSnapshot[] = [];
    for (const widget of dashboard.widgets) {
      try {
        const snapshot = await this.captureWidgetSnapshot(widget.id, tenantId);
        snapshots.push(snapshot);
      } catch (err) {
        console.error(`Failed to capture widget ${widget.id}:`, err);
      }
    }

    const columns = 2;
    const padding = 40;
    const gap = 20;
    const headerHeight = 80;
    const cellWidth = Math.round((width - padding * 2 - gap * (columns - 1)) / columns);
    const cellHeight = Math.round(cellWidth * 0.6);
    const rows = Math.ceil(snapshots.length / columns);
    const computedHeight = height || (headerHeight + padding * 2 + rows * (cellHeight + gap));

    const compositeOps: sharp.OverlayOptions[] = [];

    const headerSvg = Buffer.from(`
      <svg width="${width}" height="${headerHeight}">
        <rect width="100%" height="100%" fill="#1B5E20"/>
        <text x="${width / 2}" y="${headerHeight * 0.6}" text-anchor="middle"
              font-size="28" fill="white" font-family="Arial" font-weight="bold">
          ${this.escapeXml((dashboard as unknown as PrismaDashboardRecord).title || 'Dashboard Export')}
        </text>
      </svg>
    `);

    const headerBuf = await sharp(headerSvg).png().toBuffer();
    compositeOps.push({ input: headerBuf, top: 0, left: 0 });

    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = padding + col * (cellWidth + gap);
      const y = headerHeight + padding + row * (cellHeight + gap);

      try {
        const resized = await sharp(snapshot.imageBuffer)
          .resize(cellWidth, cellHeight, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .png()
          .toBuffer();

        compositeOps.push({ input: resized, top: y, left: x });
      } catch (err) {
        console.error(`Failed to composite widget ${snapshot.widgetId}:`, err);
      }
    }

    const finalImage = await sharp({
      create: {
        width,
        height: computedHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite(compositeOps)
      .png()
      .toBuffer();

    const exportId = crypto.randomUUID();
    const filename = `dashboard-${dashboardId.substring(0, 8)}-${Date.now()}.png`;

    await this.prisma.exportHistory.create({
      data: {
        id: exportId,
        dashboardId,
        format: 'png',
        filename,
        fileSize: finalImage.length,
        exportedAt: new Date(),
        metadata: { width, height: computedHeight, widgetCount: snapshots.length },
      },
    });

    return {
      id: exportId,
      dashboardId,
      format: 'png',
      buffer: finalImage,
      filename,
      mimeType: 'image/png',
      fileSize: finalImage.length,
      exportedAt: new Date(),
      metadata: { width, height: computedHeight },
    };
  }

  /**
   * Exports dashboard to a PowerPoint presentation using PptxGenJS.
   * Widget chart images are embedded as slide images.
   */
  async exportDashboardToPPTX(dashboardId: string, tenantId: string): Promise<ExportResult> {
    const dashboard = await this.prisma.dashboard.findUnique({
      where: { id: dashboardId },
      include: { widgets: true },
    });

    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    const snapshots: WidgetSnapshot[] = [];
    for (const widget of dashboard.widgets) {
      try {
        const snapshot = await this.captureWidgetSnapshot(widget.id, tenantId);
        snapshots.push(snapshot);
      } catch (err) {
        console.error(`Failed to capture widget ${widget.id}:`, err);
      }
    }

    const pptx = new PptxGenJS();
    pptx.author = 'Rasid Platform';
    pptx.company = 'Rasid';
    pptx.title = (dashboard as unknown as PrismaDashboardRecord).title || 'Dashboard Export';
    pptx.subject = 'Dashboard Export';
    pptx.layout = 'LAYOUT_16x9';

    const titleSlide = pptx.addSlide();
    titleSlide.background = { color: '1B5E20' };
    titleSlide.addText((dashboard as unknown as PrismaDashboardRecord).title || 'Dashboard Export', {
      x: 0.5, y: 1.5, w: 9, h: 1.5,
      fontSize: 36, color: 'FFFFFF', bold: true, align: 'center', fontFace: 'Arial',
    });
    titleSlide.addText(`Generated: ${new Date().toISOString()}`, {
      x: 0.5, y: 3.2, w: 9, h: 0.5,
      fontSize: 14, color: 'CCCCCC', align: 'center', fontFace: 'Arial',
    });

    for (let i = 0; i < snapshots.length; i += 2) {
      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };

      const snap1 = snapshots[i];
      slide.addText(snap1.title, {
        x: 0.3, y: 0.2, w: 4.5, h: 0.5,
        fontSize: 14, bold: true, color: '333333', fontFace: 'Arial',
      });
      slide.addImage({
        data: `image/png;base64,${snap1.imageBuffer.toString('base64')}`,
        x: 0.3, y: 0.8, w: 4.5, h: 3.5,
      });

      if (i + 1 < snapshots.length) {
        const snap2 = snapshots[i + 1];
        slide.addText(snap2.title, {
          x: 5.2, y: 0.2, w: 4.5, h: 0.5,
          fontSize: 14, bold: true, color: '333333', fontFace: 'Arial',
        });
        slide.addImage({
          data: `image/png;base64,${snap2.imageBuffer.toString('base64')}`,
          x: 5.2, y: 0.8, w: 4.5, h: 3.5,
        });
      }

      slide.addText(`Page ${Math.floor(i / 2) + 2}`, {
        x: 0, y: 5, w: 10, h: 0.3,
        fontSize: 8, color: '999999', align: 'center', fontFace: 'Arial',
      });
    }

    const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;

    const exportId = crypto.randomUUID();
    const filename = `dashboard-${dashboardId.substring(0, 8)}-${Date.now()}.pptx`;

    await this.prisma.exportHistory.create({
      data: {
        id: exportId,
        dashboardId,
        format: 'pptx',
        filename,
        fileSize: pptxBuffer.length,
        exportedAt: new Date(),
        metadata: {
          slideCount: Math.ceil(snapshots.length / 2) + 1,
          widgetCount: snapshots.length,
        },
      },
    });

    return {
      id: exportId,
      dashboardId,
      format: 'pptx',
      buffer: pptxBuffer,
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fileSize: pptxBuffer.length,
      exportedAt: new Date(),
      metadata: { slideCount: Math.ceil(snapshots.length / 2) + 1 },
    };
  }

  /**
   * Batch exports multiple dashboards into a single ZIP archive.
   */
  async batchExport(
    dashboardIds: string[],
    tenantId: string,
    format: 'pdf' | 'png' | 'pptx',
  ): Promise<BatchExportResult> {
    const results: Array<{ dashboardId: string; success: boolean; error?: string; buffer?: Buffer; filename?: string }> = [];

    for (const dashboardId of dashboardIds) {
      try {
        let result: ExportResult;
        if (format === 'pdf') {
          result = await this.exportDashboardToPDF(dashboardId, tenantId);
        } else if (format === 'png') {
          result = await this.exportDashboardToPNG(dashboardId, tenantId);
        } else {
          result = await this.exportDashboardToPPTX(dashboardId, tenantId);
        }
        results.push({ dashboardId, success: true, buffer: result.buffer, filename: result.filename });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        results.push({ dashboardId, success: false, error: errMsg });
      }
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const zipBuffers: Buffer[] = [];
    const zipStream = new PassThrough();

    archive.pipe(zipStream);
    zipStream.on('data', (chunk: Buffer) => zipBuffers.push(chunk));

    for (const exp of results) {
      if (exp.success && exp.buffer && exp.filename) {
        archive.append(exp.buffer, { name: exp.filename });
      }
    }

    await archive.finalize();

    const zipBuffer = await new Promise<Buffer>((resolve) => {
      zipStream.on('end', () => resolve(Buffer.concat(zipBuffers)));
    });

    const zipFilename = `dashboards-batch-${Date.now()}.zip`;

    return {
      id: crypto.randomUUID(),
      buffer: zipBuffer,
      filename: zipFilename,
      mimeType: 'application/zip',
      fileSize: zipBuffer.length,
      exports: results.map((r) => ({
        dashboardId: r.dashboardId,
        success: r.success,
        error: r.error,
      })),
    };
  }

  /**
   * Retrieves export history for a dashboard.
   */
  async getExportHistory(dashboardId: string, limit: number = 20): Promise<Array<Record<string, unknown>>> {
    const history = await this.prisma.exportHistory.findMany({
      where: { dashboardId },
      orderBy: { exportedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        format: true,
        filename: true,
        fileSize: true,
        exportedAt: true,
        metadata: true,
      },
    });
    return history;
  }

  /**
   * Cleans up old export records from the database.
   */
  async cleanupExports(olderThanDays: number = 7): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86400000);
    const result = await this.prisma.exportHistory.deleteMany({
      where: { exportedAt: { lt: cutoff } },
    });
    return result.count;
  }

  /**
   * Maps widget type strings to Chart.js-compatible chart types.
   */
  private resolveChartType(type: string): string {
    const typeMap: Record<string, string> = {
      bar: 'bar',
      line: 'line',
      pie: 'pie',
      doughnut: 'doughnut',
      radar: 'radar',
      area: 'line',
      scatter: 'scatter',
      bubble: 'bubble',
      polarArea: 'polarArea',
      horizontal_bar: 'bar',
      stacked_bar: 'bar',
    };
    return typeMap[type] || 'bar';
  }

  /**
   * Escapes XML special characters for safe SVG embedding.
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
