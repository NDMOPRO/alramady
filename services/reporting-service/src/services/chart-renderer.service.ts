import { PrismaClient } from '@prisma/client';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration, ChartType } from 'chart.js';
import sharp from 'sharp';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface ReportChartRequest {
  chartType: 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter' | 'radar' | 'horizontalBar' | 'stackedBar' | 'combo' | 'gauge';
  title: string;
  labels: string[];
  datasets: ChartDataset[];
  width: number;
  height: number;
  theme?: ChartThemeConfig;
  branding?: ChartBranding;
  responsive?: ResponsiveConfig;
}

interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
  type?: string;
  yAxisID?: string;
  tension?: number;
  stack?: string;
}

interface ChartThemeConfig {
  name: string;
  palette: string[];
  background: string;
  text: string;
  grid: string;
  font: string;
  titleSize: number;
  labelSize: number;
  rtl: boolean;
}

interface ChartBranding {
  logoBuffer?: Buffer;
  companyName?: string;
  watermark?: string;
  headerColor: string;
  accentColor: string;
}

interface ResponsiveConfig {
  breakpoints: { maxWidth: number; columns: number }[];
  minWidth: number;
  maxWidth: number;
  maintainAspectRatio: boolean;
  aspectRatio: number;
}

interface RenderedChart {
  id: string;
  buffer: Buffer;
  format: 'png' | 'jpeg' | 'webp';
  width: number;
  height: number;
  mimeType: string;
}

interface GaugeConfig {
  value: number;
  min: number;
  max: number;
  thresholds: { value: number; color: string; label: string }[];
  label: string;
  unit: string;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class ChartRendererService {
  private prisma: PrismaClient;
  private canvasPool: Map<string, ChartJSNodeCanvas> = new Map();
  private themes: Map<string, ChartThemeConfig> = new Map();
  private renderCache: Map<string, { buffer: Buffer; expiry: number }> = new Map();
  private readonly CACHE_TTL = 60000;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.initializeDefaultThemes();
  }

  private initializeDefaultThemes(): void {
    this.themes.set('rasid', {
      name: 'rasid',
      palette: ['#1B5E20', '#2E7D32', '#388E3C', '#43A047', '#4CAF50', '#66BB6A', '#81C784', '#A5D6A7', '#C8E6C9', '#E8F5E9'],
      background: '#FFFFFF',
      text: '#212121',
      grid: '#EEEEEE',
      font: 'Cairo',
      titleSize: 16,
      labelSize: 11,
      rtl: true,
    });

    this.themes.set('formal', {
      name: 'formal',
      palette: ['#0D47A1', '#1565C0', '#1976D2', '#1E88E5', '#2196F3', '#42A5F5', '#64B5F6', '#90CAF9', '#BBDEFB', '#E3F2FD'],
      background: '#FFFFFF',
      text: '#333333',
      grid: '#F0F0F0',
      font: 'Roboto',
      titleSize: 14,
      labelSize: 10,
      rtl: false,
    });

    this.themes.set('presentation', {
      name: 'presentation',
      palette: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#7BC8A4', '#EA5455', '#6C5CE7'],
      background: '#1A1A2E',
      text: '#EAEAEA',
      grid: '#2A2A4A',
      font: 'Inter',
      titleSize: 18,
      labelSize: 12,
      rtl: false,
    });

    this.themes.set('print', {
      name: 'print',
      palette: ['#000000', '#333333', '#555555', '#777777', '#999999', '#AAAAAA', '#CCCCCC', '#DDDDDD'],
      background: '#FFFFFF',
      text: '#000000',
      grid: '#CCCCCC',
      font: 'Times New Roman',
      titleSize: 14,
      labelSize: 10,
      rtl: false,
    });
  }

  private getCanvas(width: number, height: number, background: string): ChartJSNodeCanvas {
    const key = `${width}x${height}:${background}`;
    let canvas = this.canvasPool.get(key);
    if (!canvas) {
      canvas = new ChartJSNodeCanvas({
        width,
        height,
        backgroundColour: background,
      });
      this.canvasPool.set(key, canvas);
    }
    return canvas;
  }

  async renderChart(request: ReportChartRequest): Promise<RenderedChart> {
    const cacheKey = crypto.createHash('md5').update(JSON.stringify(request)).digest('hex');
    const cached = this.renderCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return {
        id: cacheKey,
        buffer: cached.buffer,
        format: 'png',
        width: request.width,
        height: request.height,
        mimeType: 'image/png',
      };
    }

    const theme = request.theme || this.themes.get('rasid')!;
    const { width, height } = this.calculateResponsiveSize(request.width, request.height, request.responsive);
    const canvas = this.getCanvas(width, height, theme.background);

    const config = this.buildConfiguration(request, theme);
    let buffer = await canvas.renderToBuffer(config as any);

    if (request.branding) {
      buffer = await this.applyBranding(buffer, width, height, request.branding);
    }

    this.renderCache.set(cacheKey, { buffer, expiry: Date.now() + this.CACHE_TTL });

    const chartId = crypto.randomUUID();

    return {
      id: chartId,
      buffer,
      format: 'png',
      width,
      height,
      mimeType: 'image/png',
    };
  }

  private calculateResponsiveSize(
    requestedWidth: number,
    requestedHeight: number,
    responsive?: ResponsiveConfig,
  ): { width: number; height: number } {
    if (!responsive) {
      return { width: requestedWidth, height: requestedHeight };
    }

    let width = Math.max(responsive.minWidth, Math.min(responsive.maxWidth, requestedWidth));

    let height: number;
    if (responsive.maintainAspectRatio) {
      height = Math.round(width / responsive.aspectRatio);
    } else {
      height = requestedHeight;
    }

    for (const bp of responsive.breakpoints.sort((a, b) => a.maxWidth - b.maxWidth)) {
      if (width <= bp.maxWidth) {
        width = Math.round(width / bp.columns) * bp.columns;
        break;
      }
    }

    return { width, height };
  }

  private buildConfiguration(
    request: ReportChartRequest,
    theme: ChartThemeConfig,
  ): ChartConfiguration {
    let chartType: ChartType;
    let datasets = request.datasets;

    switch (request.chartType) {
      case 'horizontalBar':
        chartType = 'bar';
        break;
      case 'stackedBar':
        chartType = 'bar';
        datasets = datasets.map(ds => ({ ...ds, stack: ds.stack || 'stack0' }));
        break;
      case 'combo':
        chartType = 'bar';
        break;
      default:
        chartType = request.chartType as ChartType;
    }

    const themedDatasets = datasets.map((ds, index) => {
      const color = theme.palette[index % theme.palette.length];
      return {
        ...ds,
        backgroundColor: ds.backgroundColor || (
          ['pie', 'doughnut'].includes(request.chartType)
            ? theme.palette.slice(0, ds.data.length)
            : this.hexToRgba(color, 0.75)
        ),
        borderColor: ds.borderColor || color,
        borderWidth: ds.borderWidth ?? (request.chartType === 'line' ? 2 : 1),
        tension: ds.tension ?? 0.3,
        type: ds.type || undefined,
      };
    });

    const config: ChartConfiguration = {
      type: chartType,
      data: {
        labels: request.labels,
        datasets: themedDatasets as unknown as ChartConfiguration['data']['datasets'],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        indexAxis: request.chartType === 'horizontalBar' ? 'y' as const : 'x' as const,
        plugins: {
          title: {
            display: true,
            text: request.title,
            font: { size: theme.titleSize, family: theme.font, weight: 'bold' as const },
            color: theme.text,
            padding: { top: 10, bottom: 20 },
          },
          legend: {
            display: themedDatasets.length > 1 || ['pie', 'doughnut'].includes(request.chartType),
            position: 'bottom' as const,
            labels: {
              font: { size: theme.labelSize, family: theme.font },
              color: theme.text,
              padding: 15,
              usePointStyle: true,
            },
            rtl: theme.rtl,
          },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleFont: { size: theme.labelSize, family: theme.font },
            bodyFont: { size: theme.labelSize - 1, family: theme.font },
            padding: 10,
            cornerRadius: 4,
            rtl: theme.rtl,
          },
        },
        scales: this.buildScales(request.chartType, theme, datasets) as any,
        layout: { padding: { top: 15, right: 20, bottom: 15, left: 20 } },
      },
    };

    return config;
  }

  private buildScales(
    chartType: string,
    theme: ChartThemeConfig,
    datasets: ChartDataset[],
  ): Record<string, any> | undefined {
    if (['pie', 'doughnut', 'radar'].includes(chartType)) {
      if (chartType === 'radar') {
        return {
          r: {
            grid: { color: theme.grid },
            pointLabels: {
              font: { size: theme.labelSize, family: theme.font },
              color: theme.text,
            },
            ticks: {
              font: { size: theme.labelSize - 2, family: theme.font },
              color: theme.text,
              backdropColor: 'transparent',
            },
          },
        };
      }
      return undefined;
    }

    const isStacked = chartType === 'stackedBar';
    const hasSecondAxis = datasets.some(ds => ds.yAxisID === 'y2');

    const scales: Record<string, any> = {
      x: {
        display: true,
        grid: { color: theme.grid, lineWidth: 1, drawBorder: true },
        ticks: {
          font: { size: theme.labelSize, family: theme.font },
          color: theme.text,
          maxRotation: 45,
        },
        stacked: isStacked,
        reverse: theme.rtl,
      },
      y: {
        display: true,
        position: theme.rtl ? 'right' : 'left',
        grid: { color: theme.grid, lineWidth: 1, drawBorder: true },
        ticks: {
          font: { size: theme.labelSize, family: theme.font },
          color: theme.text,
        },
        stacked: isStacked,
        beginAtZero: true,
      },
    };

    if (hasSecondAxis) {
      scales['y2'] = {
        display: true,
        position: theme.rtl ? 'left' : 'right',
        grid: { display: false },
        ticks: {
          font: { size: theme.labelSize, family: theme.font },
          color: theme.text,
        },
        beginAtZero: true,
      };
    }

    return scales;
  }

  private async applyBranding(
    chartBuffer: Buffer,
    width: number,
    height: number,
    branding: ChartBranding,
  ): Promise<Buffer> {
    const compositeOps: sharp.OverlayOptions[] = [];

    if (branding.watermark) {
      const watermarkSvg = `
        <svg width="${width}" height="${height}">
          <text x="${width / 2}" y="${height / 2}" text-anchor="middle"
                font-size="48" fill="rgba(0,0,0,0.04)" font-family="Arial"
                transform="rotate(-30, ${width / 2}, ${height / 2})">
            ${this.escapeXml(branding.watermark)}
          </text>
        </svg>
      `;
      const watermarkBuffer = await sharp(Buffer.from(watermarkSvg)).png().toBuffer();
      compositeOps.push({ input: watermarkBuffer, top: 0, left: 0 });
    }

    if (branding.companyName) {
      const brandHeight = 24;
      const brandSvg = `
        <svg width="${width}" height="${brandHeight}">
          <rect width="100%" height="100%" fill="${branding.headerColor}" opacity="0.9"/>
          <text x="${width - 10}" y="${brandHeight * 0.7}" text-anchor="end"
                font-size="10" fill="white" font-family="Arial">
            ${this.escapeXml(branding.companyName)}
          </text>
        </svg>
      `;
      const brandBuffer = await sharp(Buffer.from(brandSvg)).png().toBuffer();
      compositeOps.push({ input: brandBuffer, top: height - brandHeight, left: 0 });
    }

    if (branding.logoBuffer) {
      try {
        const resizedLogo = await sharp(branding.logoBuffer)
          .resize(80, 24, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        compositeOps.push({ input: resizedLogo, top: height - 28, left: 10 });
      } catch {
        // Skip logo if processing fails
      }
    }

    if (compositeOps.length === 0) {
      return chartBuffer;
    }

    return sharp(chartBuffer).composite(compositeOps).png().toBuffer();
  }

  async renderGauge(config: GaugeConfig, width: number = 400, height: number = 300): Promise<RenderedChart> {
    const cx = width / 2;
    const cy = height * 0.65;
    const radius = Math.min(cx, cy) * 0.8;
    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;
    const range = config.max - config.min;
    const normalizedValue = Math.max(config.min, Math.min(config.max, config.value));
    const valueAngle = startAngle + ((normalizedValue - config.min) / range) * (endAngle - startAngle);

    let svgParts: string[] = [];
    svgParts.push(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`);
    svgParts.push(`<rect width="100%" height="100%" fill="white"/>`);

    const sortedThresholds = [...config.thresholds].sort((a, b) => a.value - b.value);
    for (let i = 0; i < sortedThresholds.length; i++) {
      const segStart = i === 0 ? config.min : sortedThresholds[i - 1].value;
      const segEnd = sortedThresholds[i].value;
      const segColor = sortedThresholds[i].color;

      const startArc = startAngle + ((segStart - config.min) / range) * (endAngle - startAngle);
      const endArc = startAngle + ((segEnd - config.min) / range) * (endAngle - startAngle);
      const arcWidth = 20;

      const outerR = radius;
      const innerR = radius - arcWidth;
      const x1Outer = cx + outerR * Math.cos(startArc);
      const y1Outer = cy + outerR * Math.sin(startArc);
      const x2Outer = cx + outerR * Math.cos(endArc);
      const y2Outer = cy + outerR * Math.sin(endArc);
      const x1Inner = cx + innerR * Math.cos(endArc);
      const y1Inner = cy + innerR * Math.sin(endArc);
      const x2Inner = cx + innerR * Math.cos(startArc);
      const y2Inner = cy + innerR * Math.sin(startArc);

      const largeArc = (endArc - startArc) > Math.PI ? 1 : 0;

      svgParts.push(`<path d="M ${x1Outer} ${y1Outer} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Outer} ${y2Outer} L ${x1Inner} ${y1Inner} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2Inner} ${y2Inner} Z" fill="${segColor}"/>`);
    }

    const needleLength = radius * 0.85;
    const needleX = cx + needleLength * Math.cos(valueAngle);
    const needleY = cy + needleLength * Math.sin(valueAngle);
    svgParts.push(`<line x1="${cx}" y1="${cy}" x2="${needleX}" y2="${needleY}" stroke="#333" stroke-width="3" stroke-linecap="round"/>`);
    svgParts.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="#333"/>`);
    svgParts.push(`<circle cx="${cx}" cy="${cy}" r="4" fill="white"/>`);

    svgParts.push(`<text x="${cx}" y="${cy + 35}" text-anchor="middle" font-size="28" font-weight="bold" fill="#212121">${normalizedValue}${config.unit}</text>`);
    svgParts.push(`<text x="${cx}" y="${cy + 55}" text-anchor="middle" font-size="12" fill="#666">${this.escapeXml(config.label)}</text>`);

    svgParts.push(`<text x="${cx - radius}" y="${cy + 20}" text-anchor="middle" font-size="10" fill="#999">${config.min}</text>`);
    svgParts.push(`<text x="${cx + radius}" y="${cy + 20}" text-anchor="middle" font-size="10" fill="#999">${config.max}</text>`);

    for (const threshold of sortedThresholds) {
      const thresholdAngle = startAngle + ((threshold.value - config.min) / range) * (endAngle - startAngle);
      const labelR = radius + 15;
      const labelX = cx + labelR * Math.cos(thresholdAngle);
      const labelY = cy + labelR * Math.sin(thresholdAngle);
      svgParts.push(`<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="8" fill="${threshold.color}">${threshold.label}</text>`);
    }

    svgParts.push('</svg>');

    const buffer = await sharp(Buffer.from(svgParts.join('\n'))).png().toBuffer();

    return {
      id: crypto.randomUUID(),
      buffer,
      format: 'png',
      width,
      height,
      mimeType: 'image/png',
    };
  }

  async renderChartToFormat(
    request: ReportChartRequest,
    format: 'png' | 'jpeg' | 'webp',
    quality: number = 90,
  ): Promise<RenderedChart> {
    const rendered = await this.renderChart(request);

    let outputBuffer: Buffer;
    let mimeType: string;

    switch (format) {
      case 'jpeg':
        outputBuffer = await sharp(rendered.buffer).jpeg({ quality }).toBuffer();
        mimeType = 'image/jpeg';
        break;
      case 'webp':
        outputBuffer = await sharp(rendered.buffer).webp({ quality }).toBuffer();
        mimeType = 'image/webp';
        break;
      default:
        outputBuffer = await sharp(rendered.buffer).png({ quality }).toBuffer();
        mimeType = 'image/png';
    }

    return {
      id: rendered.id,
      buffer: outputBuffer,
      format,
      width: rendered.width,
      height: rendered.height,
      mimeType,
    };
  }

  async renderMultipleCharts(
    requests: ReportChartRequest[],
  ): Promise<RenderedChart[]> {
    const results: RenderedChart[] = [];

    for (const request of requests) {
      const rendered = await this.renderChart(request);
      results.push(rendered);
    }

    return results;
  }

  registerTheme(theme: ChartThemeConfig): void {
    this.themes.set(theme.name, theme);
  }

  getAvailableThemes(): string[] {
    return Array.from(this.themes.keys());
  }

  async saveChartToReport(reportId: string, chart: RenderedChart, request: ReportChartRequest): Promise<void> {
    await this.prisma.reportChart.create({
      data: {
        id: chart.id,
        reportId,
        type: request.chartType,
        title: request.title,
        config: JSON.parse(JSON.stringify(request)),
        theme: request.theme?.name || 'rasid',
        width: chart.width,
        height: chart.height,
        createdAt: new Date(),
      },
    });
  }

  clearCache(): void {
    this.renderCache.clear();
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

export const chartRendererService = new ChartRendererService(new PrismaClient());
