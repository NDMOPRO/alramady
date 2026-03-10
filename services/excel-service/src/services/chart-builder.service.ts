import { PrismaClient, Prisma } from '@prisma/client';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration, ChartType } from 'chart.js';
import * as ExcelJS from 'exceljs';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface ChartDataSeries {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
  tension?: number;
  pointRadius?: number;
  pointStyle?: string;
  order?: number;
  type?: string;
  yAxisID?: string;
}

interface ChartRequest {
  chartType: 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter' | 'area' | 'radar' | 'waterfall' | 'bubble' | 'polarArea';
  title: string;
  subtitle?: string;
  labels: string[];
  datasets: ChartDataSeries[];
  options: ChartOptions;
  dimensions: { width: number; height: number };
}

interface ChartOptions {
  colors?: ColorPalette;
  legend?: LegendOptions;
  axes?: AxesOptions;
  animation?: boolean;
  responsive?: boolean;
  aspectRatio?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  grid?: GridOptions;
  tooltip?: TooltipOptions;
  dataLabels?: DataLabelOptions;
}

interface ColorPalette {
  primary: string[];
  background: string;
  gridColor: string;
  textColor: string;
  borderColor: string;
}

interface LegendOptions {
  display: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
  align: 'start' | 'center' | 'end';
  labels?: { fontSize: number; fontFamily: string; fontColor: string; padding: number; usePointStyle: boolean };
}

interface AxesOptions {
  xAxis?: AxisConfig;
  yAxis?: AxisConfig;
  y2Axis?: AxisConfig;
}

interface AxisConfig {
  display: boolean;
  title?: string;
  titleColor?: string;
  titleFont?: { size: number; weight: string };
  min?: number;
  max?: number;
  ticks?: { stepSize?: number; callback?: string; fontSize?: number; fontColor?: string; maxTicksLimit?: number };
  gridLines?: { display: boolean; color: string; lineWidth: number };
  stacked?: boolean;
  position?: 'left' | 'right' | 'top' | 'bottom';
}

interface GridOptions {
  display: boolean;
  color: string;
  lineWidth: number;
  drawBorder: boolean;
}

interface TooltipOptions {
  enabled: boolean;
  mode: 'point' | 'index' | 'nearest';
  intersect: boolean;
  backgroundColor: string;
  titleColor: string;
  bodyColor: string;
  borderColor: string;
  borderWidth: number;
}

interface DataLabelOptions {
  display: boolean;
  color: string;
  fontSize: number;
  anchor: 'start' | 'center' | 'end';
  align: 'start' | 'center' | 'end';
  formatter?: string;
}

interface ChartResult {
  id: string;
  imageBuffer: Buffer;
  format: 'png' | 'svg' | 'pdf';
  width: number;
  height: number;
  mimeType: string;
  metadata: Record<string, unknown>;
}

interface ChartTheme {
  name: string;
  colors: string[];
  backgroundColor: string;
  fontFamily: string;
  fontSize: number;
  titleFontSize: number;
  gridColor: string;
  textColor: string;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class ChartBuilderService {
  private prisma: PrismaClient;
  private chartCanvasCache: Map<string, ChartJSNodeCanvas> = new Map();
  private themes: Map<string, ChartTheme> = new Map();
  private readonly DEFAULT_WIDTH = 800;
  private readonly DEFAULT_HEIGHT = 600;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.initializeThemes();
  }

  private initializeThemes(): void {
    const rasidTheme: ChartTheme = {
      name: 'rasid',
      colors: ['#1B5E20', '#2E7D32', '#388E3C', '#43A047', '#4CAF50', '#66BB6A', '#81C784', '#A5D6A7'],
      backgroundColor: '#FFFFFF',
      fontFamily: 'Cairo, Arial, sans-serif',
      fontSize: 12,
      titleFontSize: 18,
      gridColor: '#E0E0E0',
      textColor: '#212121',
    };
    this.themes.set('rasid', rasidTheme);

    const corporateTheme: ChartTheme = {
      name: 'corporate',
      colors: ['#0D47A1', '#1565C0', '#1976D2', '#1E88E5', '#2196F3', '#42A5F5', '#64B5F6', '#90CAF9'],
      backgroundColor: '#FFFFFF',
      fontFamily: 'Roboto, Arial, sans-serif',
      fontSize: 12,
      titleFontSize: 16,
      gridColor: '#EEEEEE',
      textColor: '#333333',
    };
    this.themes.set('corporate', corporateTheme);

    const darkTheme: ChartTheme = {
      name: 'dark',
      colors: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#7BC8A4'],
      backgroundColor: '#1E1E1E',
      fontFamily: 'Inter, sans-serif',
      fontSize: 12,
      titleFontSize: 16,
      gridColor: '#444444',
      textColor: '#E0E0E0',
    };
    this.themes.set('dark', darkTheme);

    const vibrantTheme: ChartTheme = {
      name: 'vibrant',
      colors: ['#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#009688', '#FF5722', '#795548', '#607D8B'],
      backgroundColor: '#FAFAFA',
      fontFamily: 'Poppins, sans-serif',
      fontSize: 13,
      titleFontSize: 18,
      gridColor: '#E0E0E0',
      textColor: '#212121',
    };
    this.themes.set('vibrant', vibrantTheme);
  }

  private getOrCreateCanvas(width: number, height: number): ChartJSNodeCanvas {
    const key = `${width}x${height}`;
    let canvas = this.chartCanvasCache.get(key);
    if (!canvas) {
      canvas = new ChartJSNodeCanvas({
        width,
        height,
        backgroundColour: 'white',
        plugins: {
          modern: ['chartjs-plugin-datalabels'],
        },
      });
      this.chartCanvasCache.set(key, canvas);
    }
    return canvas;
  }

  async createChart(request: ChartRequest, themeName: string = 'rasid'): Promise<ChartResult> {
    const theme = this.themes.get(themeName) || this.themes.get('rasid')!;
    const width = request.dimensions?.width || this.DEFAULT_WIDTH;
    const height = request.dimensions?.height || this.DEFAULT_HEIGHT;
    const canvas = this.getOrCreateCanvas(width, height);

    const chartConfig = this.buildChartConfiguration(request, theme);
    const imageBuffer = await canvas.renderToBuffer(chartConfig as unknown as ChartConfiguration);

    const chartId = crypto.randomUUID();

    await this.prisma.chart.create({
      data: {
        id: chartId,
        type: request.chartType,
        title: request.title,
        config: chartConfig as unknown as Prisma.InputJsonValue,
        theme: themeName,
        width,
        height,
        createdAt: new Date(),
      },
    });

    return {
      id: chartId,
      imageBuffer,
      format: 'png',
      width,
      height,
      mimeType: 'image/png',
      metadata: {
        chartType: request.chartType,
        title: request.title,
        dataPointCount: request.labels.length,
        seriesCount: request.datasets.length,
        theme: themeName,
      },
    };
  }

  private buildChartConfiguration(request: ChartRequest, theme: ChartTheme): ChartConfiguration {
    const chartType = this.mapChartType(request.chartType);
    const datasets = this.applyThemeToDatasets(request.datasets, theme, request.chartType);

    const config: ChartConfiguration = {
      type: chartType,
      data: {
        labels: request.labels,
        datasets: datasets as unknown as ChartConfiguration['data']['datasets'],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: request.title,
            font: {
              size: theme.titleFontSize,
              family: theme.fontFamily,
              weight: 'bold' as const,
            },
            color: theme.textColor,
            padding: { top: 10, bottom: request.subtitle ? 0 : 20 },
          },
          subtitle: request.subtitle
            ? {
                display: true,
                text: request.subtitle,
                font: { size: theme.fontSize, family: theme.fontFamily },
                color: theme.textColor,
                padding: { top: 0, bottom: 20 },
              }
            : undefined,
          legend: this.buildLegendConfig(request.options.legend, theme),
          tooltip: this.buildTooltipConfig(request.options.tooltip, theme),
        },
        scales: this.buildScalesConfig(request, theme) as ChartConfiguration['options'] extends { scales?: infer S } ? S : never,
        layout: {
          padding: request.options.padding || { top: 20, right: 20, bottom: 20, left: 20 },
        },
      },
    };

    return config;
  }

  private mapChartType(type: ChartRequest['chartType']): ChartType {
    const mapping: Record<string, ChartType> = {
      bar: 'bar',
      line: 'line',
      pie: 'pie',
      doughnut: 'doughnut',
      scatter: 'scatter',
      area: 'line',
      radar: 'radar',
      waterfall: 'bar',
      bubble: 'bubble',
      polarArea: 'polarArea',
    };
    return mapping[type] || 'bar';
  }

  private applyThemeToDatasets(
    datasets: ChartDataSeries[],
    theme: ChartTheme,
    chartType: string,
  ): ChartDataSeries[] {
    return datasets.map((ds, index) => {
      const color = theme.colors[index % theme.colors.length];
      const result = { ...ds };

      if (!result.backgroundColor) {
        if (['pie', 'doughnut', 'polarArea'].includes(chartType)) {
          result.backgroundColor = theme.colors.slice(0, ds.data.length);
        } else if (['area'].includes(chartType)) {
          result.backgroundColor = this.hexToRgba(color, 0.3);
          result.fill = true;
        } else if (chartType === 'line') {
          result.backgroundColor = color;
          result.fill = false;
        } else {
          result.backgroundColor = this.hexToRgba(color, 0.8);
        }
      }

      if (!result.borderColor) {
        if (['pie', 'doughnut', 'polarArea'].includes(chartType)) {
          result.borderColor = theme.backgroundColor;
        } else {
          result.borderColor = color;
        }
      }

      if (!result.borderWidth) {
        result.borderWidth = chartType === 'line' ? 2 : 1;
      }

      if (chartType === 'line' || chartType === 'area') {
        if (result.tension === undefined) result.tension = 0.4;
        if (result.pointRadius === undefined) result.pointRadius = 3;
      }

      return result;
    });
  }

  private buildLegendConfig(
    legendOpts: LegendOptions | undefined,
    theme: ChartTheme,
  ): Record<string, unknown> {
    const defaults: Record<string, unknown> = {
      display: true,
      position: 'top',
      align: 'center',
      labels: {
        font: {
          size: theme.fontSize,
          family: theme.fontFamily,
        },
        color: theme.textColor,
        padding: 15,
        usePointStyle: true,
      },
    };

    if (!legendOpts) return defaults;

    return {
      display: legendOpts.display ?? true,
      position: legendOpts.position || 'top',
      align: legendOpts.align || 'center',
      labels: {
        font: {
          size: legendOpts.labels?.fontSize || theme.fontSize,
          family: legendOpts.labels?.fontFamily || theme.fontFamily,
        },
        color: legendOpts.labels?.fontColor || theme.textColor,
        padding: legendOpts.labels?.padding || 15,
        usePointStyle: legendOpts.labels?.usePointStyle ?? true,
      },
    };
  }

  private buildTooltipConfig(
    tooltipOpts: TooltipOptions | undefined,
    theme: ChartTheme,
  ): Record<string, unknown> {
    if (!tooltipOpts) {
      return {
        enabled: true,
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#FFFFFF',
        bodyColor: '#FFFFFF',
        borderColor: theme.colors[0],
        borderWidth: 1,
        cornerRadius: 6,
        titleFont: { size: theme.fontSize, family: theme.fontFamily },
        bodyFont: { size: theme.fontSize - 1, family: theme.fontFamily },
        padding: 10,
      };
    }

    return {
      enabled: tooltipOpts.enabled,
      mode: tooltipOpts.mode || 'index',
      intersect: tooltipOpts.intersect ?? false,
      backgroundColor: tooltipOpts.backgroundColor || 'rgba(0, 0, 0, 0.8)',
      titleColor: tooltipOpts.titleColor || '#FFFFFF',
      bodyColor: tooltipOpts.bodyColor || '#FFFFFF',
      borderColor: tooltipOpts.borderColor || theme.colors[0],
      borderWidth: tooltipOpts.borderWidth || 1,
      cornerRadius: 6,
      padding: 10,
    };
  }

  private buildScalesConfig(request: ChartRequest, theme: ChartTheme): Record<string, unknown> | undefined {
    const noAxisTypes = ['pie', 'doughnut', 'polarArea', 'radar'];
    if (noAxisTypes.includes(request.chartType)) {
      if (request.chartType === 'radar') {
        return {
          r: {
            grid: { color: theme.gridColor },
            pointLabels: {
              font: { size: theme.fontSize, family: theme.fontFamily },
              color: theme.textColor,
            },
            ticks: {
              font: { size: theme.fontSize - 2 },
              color: theme.textColor,
              backdropColor: 'transparent',
            },
          },
        };
      }
      return undefined;
    }

    const axesOpts = request.options.axes;
    const gridOpts = request.options.grid;

    const scales: Record<string, unknown> = {
      x: {
        display: axesOpts?.xAxis?.display ?? true,
        title: axesOpts?.xAxis?.title
          ? {
              display: true,
              text: axesOpts.xAxis.title,
              font: {
                size: axesOpts.xAxis.titleFont?.size || theme.fontSize,
                weight: axesOpts.xAxis.titleFont?.weight || 'normal',
                family: theme.fontFamily,
              },
              color: axesOpts.xAxis.titleColor || theme.textColor,
            }
          : { display: false },
        grid: {
          display: gridOpts?.display ?? true,
          color: gridOpts?.color || theme.gridColor,
          lineWidth: gridOpts?.lineWidth || 1,
          drawBorder: gridOpts?.drawBorder ?? true,
        },
        ticks: {
          font: {
            size: axesOpts?.xAxis?.ticks?.fontSize || theme.fontSize,
            family: theme.fontFamily,
          },
          color: axesOpts?.xAxis?.ticks?.fontColor || theme.textColor,
          maxTicksLimit: axesOpts?.xAxis?.ticks?.maxTicksLimit,
        },
        stacked: axesOpts?.xAxis?.stacked ?? false,
      },
      y: {
        display: axesOpts?.yAxis?.display ?? true,
        title: axesOpts?.yAxis?.title
          ? {
              display: true,
              text: axesOpts.yAxis.title,
              font: {
                size: axesOpts.yAxis.titleFont?.size || theme.fontSize,
                weight: axesOpts.yAxis.titleFont?.weight || 'normal',
                family: theme.fontFamily,
              },
              color: axesOpts.yAxis.titleColor || theme.textColor,
            }
          : { display: false },
        grid: {
          display: gridOpts?.display ?? true,
          color: gridOpts?.color || theme.gridColor,
          lineWidth: gridOpts?.lineWidth || 1,
          drawBorder: gridOpts?.drawBorder ?? true,
        },
        ticks: {
          font: {
            size: axesOpts?.yAxis?.ticks?.fontSize || theme.fontSize,
            family: theme.fontFamily,
          },
          color: axesOpts?.yAxis?.ticks?.fontColor || theme.textColor,
          stepSize: axesOpts?.yAxis?.ticks?.stepSize,
          maxTicksLimit: axesOpts?.yAxis?.ticks?.maxTicksLimit,
        },
        min: axesOpts?.yAxis?.min,
        max: axesOpts?.yAxis?.max,
        stacked: axesOpts?.yAxis?.stacked ?? false,
        position: axesOpts?.yAxis?.position || 'left',
      },
    };

    if (axesOpts?.y2Axis) {
      scales['y2'] = {
        display: axesOpts.y2Axis.display ?? true,
        position: axesOpts.y2Axis.position || 'right',
        title: axesOpts.y2Axis.title
          ? {
              display: true,
              text: axesOpts.y2Axis.title,
              font: { size: theme.fontSize, family: theme.fontFamily },
              color: theme.textColor,
            }
          : { display: false },
        grid: { display: false },
        ticks: {
          font: { size: theme.fontSize, family: theme.fontFamily },
          color: theme.textColor,
          stepSize: axesOpts.y2Axis.ticks?.stepSize,
        },
        min: axesOpts.y2Axis.min,
        max: axesOpts.y2Axis.max,
      };
    }

    return scales;
  }

  async createWaterfallChart(
    title: string,
    categories: string[],
    values: number[],
    theme: string = 'rasid',
  ): Promise<ChartResult> {
    const cumulativeValues: number[] = [];
    const positiveData: (number | null)[] = [];
    const negativeData: (number | null)[] = [];
    const totalData: (number | null)[] = [];
    const bases: number[] = [];

    let cumulative = 0;
    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      const isTotal = categories[i]?.toLowerCase().includes('total');

      if (isTotal) {
        bases.push(0);
        totalData.push(cumulative);
        positiveData.push(null);
        negativeData.push(null);
      } else {
        if (val >= 0) {
          bases.push(cumulative);
          positiveData.push(val);
          negativeData.push(null);
          totalData.push(null);
          cumulative += val;
        } else {
          cumulative += val;
          bases.push(cumulative);
          negativeData.push(Math.abs(val));
          positiveData.push(null);
          totalData.push(null);
        }
      }
      cumulativeValues.push(cumulative);
    }

    const request: ChartRequest = {
      chartType: 'waterfall',
      title,
      labels: categories,
      datasets: [
        {
          label: 'Base',
          data: bases,
          backgroundColor: 'transparent',
          borderWidth: 0,
        },
        {
          label: 'Increase',
          data: positiveData.map(v => v ?? 0),
          backgroundColor: '#4CAF50',
          borderColor: '#388E3C',
          borderWidth: 1,
        },
        {
          label: 'Decrease',
          data: negativeData.map(v => v ?? 0),
          backgroundColor: '#F44336',
          borderColor: '#D32F2F',
          borderWidth: 1,
        },
        {
          label: 'Total',
          data: totalData.map(v => v ?? 0),
          backgroundColor: '#2196F3',
          borderColor: '#1565C0',
          borderWidth: 1,
        },
      ],
      options: {
        axes: {
          xAxis: { display: true },
          yAxis: { display: true, stacked: true },
        },
      },
      dimensions: { width: this.DEFAULT_WIDTH, height: this.DEFAULT_HEIGHT },
    };

    return this.createChart(request, theme);
  }

  async exportChartToPNG(
    chartId: string,
    width?: number,
    height?: number,
    scale: number = 2,
  ): Promise<any> {
    const chartRecord = await this.prisma.chart.findUnique({
      where: { id: chartId },
    });

    if (!chartRecord) {
      throw new Error(`Chart not found: ${chartId}`);
    }

    const finalWidth = (width || chartRecord.width) * scale;
    const finalHeight = (height || chartRecord.height) * scale;
    const canvas = this.getOrCreateCanvas(finalWidth, finalHeight);
    const config = chartRecord.config as unknown as ChartConfiguration;

    const imageBuffer = await canvas.renderToBuffer(config as unknown as ChartConfiguration);

    const optimized = await sharp(imageBuffer)
      .resize(width || chartRecord.width, height || chartRecord.height, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png({ quality: 90, compressionLevel: 6 })
      .toBuffer();

    return optimized as Buffer;
  }

  async exportChartToSVG(chartId: string): Promise<string> {
    const chartRecord = await this.prisma.chart.findUnique({
      where: { id: chartId },
    });

    if (!chartRecord) {
      throw new Error(`Chart not found: ${chartId}`);
    }

    const config = chartRecord.config as unknown as ChartConfiguration;
    const width = chartRecord.width;
    const height = chartRecord.height;

    const svgParts: string[] = [];
    svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
    svgParts.push(`<rect width="100%" height="100%" fill="white"/>`);

    const titleText = typeof config.options?.plugins?.title === 'object'
      ? (config.options.plugins.title as Record<string, unknown>).text || ''
      : '';

    if (titleText) {
      svgParts.push(`<text x="${width / 2}" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#212121">${this.escapeXml(String(titleText))}</text>`);
    }

    const data = config.data;
    if (data && data.datasets && data.labels) {
      const chartArea = { left: 80, top: 60, right: width - 40, bottom: height - 60 };
      const chartWidth = chartArea.right - chartArea.left;
      const chartHeight = chartArea.bottom - chartArea.top;

      const allValues = (data.datasets as any[]).flatMap((ds: Record<string, any>) => ds.data as number[]);
      const maxVal = Math.max(...allValues.filter(v => typeof v === 'number'), 1);
      const minVal = Math.min(...allValues.filter(v => typeof v === 'number'), 0);
      const range = maxVal - minVal || 1;

      for (const dataset of data.datasets) {
        const dsData = dataset.data as number[];
        const barCount = dsData.length;
        const barWidth = chartWidth / (barCount * 1.5);

        for (let j = 0; j < dsData.length; j++) {
          const val = dsData[j] as number;
          const x = chartArea.left + (j * chartWidth) / barCount + barWidth * 0.25;
          const barHeight = ((val - minVal) / range) * chartHeight;
          const y = chartArea.bottom - barHeight;

          const fillColor = Array.isArray(dataset.backgroundColor)
            ? (dataset.backgroundColor as string[])[j % (dataset.backgroundColor as string[]).length]
            : (dataset.backgroundColor as string) || '#4CAF50';

          svgParts.push(`<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${fillColor}" rx="2"/>`);
        }
      }

      for (let i = 0; i < data.labels.length; i++) {
        const label = String(data.labels[i]);
        const x = chartArea.left + (i * chartWidth) / data.labels.length + chartWidth / data.labels.length / 2;
        svgParts.push(`<text x="${x}" y="${chartArea.bottom + 20}" text-anchor="middle" font-size="11" fill="#666">${this.escapeXml(label)}</text>`);
      }
    }

    svgParts.push('</svg>');
    return svgParts.join('\n');
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  async addChartToExcelWorkbook(
    workbook: ExcelJS.Workbook,
    sheetName: string,
    chartId: string,
    position: { col: number; row: number },
  ): Promise<void> {
    const chartBuffer = await this.exportChartToPNG(chartId);
    const worksheet = workbook.getWorksheet(sheetName);

    if (!worksheet) {
      throw new Error(`Worksheet not found: ${sheetName}`);
    }

    const imageId = workbook.addImage({
      buffer: chartBuffer,
      extension: 'png',
    } as any);

    worksheet.addImage(imageId, {
      tl: { col: position.col, row: position.row },
      ext: { width: this.DEFAULT_WIDTH / 1.5, height: this.DEFAULT_HEIGHT / 1.5 },
    });
  }

  async createChartFromExcelData(
    workbookBuffer: Buffer,
    sheetName: string,
    labelColumn: string,
    dataColumns: string[],
    chartType: ChartRequest['chartType'],
    title: string,
  ): Promise<ChartResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBuffer as unknown as ExcelJS.Buffer);
    const worksheet = workbook.getWorksheet(sheetName);

    if (!worksheet) {
      throw new Error(`Worksheet not found: ${sheetName}`);
    }

    const headerRow = worksheet.getRow(1);
    const headerMap = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      headerMap.set(String(cell.value), colNumber);
    });

    const labelColIdx = headerMap.get(labelColumn);
    if (!labelColIdx) {
      throw new Error(`Label column not found: ${labelColumn}`);
    }

    const labels: string[] = [];
    const datasetsMap = new Map<string, number[]>();
    for (const colName of dataColumns) {
      datasetsMap.set(colName, []);
    }

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const label = String(row.getCell(labelColIdx).value || '');
      labels.push(label);

      for (const colName of dataColumns) {
        const colIdx = headerMap.get(colName);
        if (colIdx) {
          const cellValue = row.getCell(colIdx).value;
          const numValue = typeof cellValue === 'number' ? cellValue : parseFloat(String(cellValue)) || 0;
          datasetsMap.get(colName)!.push(numValue);
        }
      }
    });

    const datasets: ChartDataSeries[] = dataColumns.map(colName => ({
      label: colName,
      data: datasetsMap.get(colName) || [],
    }));

    const request: ChartRequest = {
      chartType,
      title,
      labels,
      datasets,
      options: {},
      dimensions: { width: this.DEFAULT_WIDTH, height: this.DEFAULT_HEIGHT },
    };

    return this.createChart(request);
  }

  async listCharts(
    filters: { type?: string; theme?: string; search?: string },
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{ charts: Record<string, unknown>[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (filters.type) where.type = filters.type;
    if (filters.theme) where.theme = filters.theme;
    if (filters.search) {
      where.title = { contains: filters.search, mode: 'insensitive' };
    }

    const [charts, total] = await Promise.all([
      this.prisma.chart.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          type: true,
          title: true,
          theme: true,
          width: true,
          height: true,
          createdAt: true,
        },
      }),
      this.prisma.chart.count({ where }),
    ]);

    return { charts, total };
  }

  async deleteChart(chartId: string): Promise<void> {
    await this.prisma.chart.delete({
      where: { id: chartId },
    });
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  async cloneChart(chartId: string, newTitle?: string): Promise<ChartResult> {
    const original = await this.prisma.chart.findUnique({ where: { id: chartId } });
    if (!original) {
      throw new Error(`Chart not found: ${chartId}`);
    }

    const config = original.config as unknown as ChartConfiguration;
    const theme = this.themes.get(original.theme) || this.themes.get('rasid')!;
    const canvas = this.getOrCreateCanvas(original.width, original.height);

    if (newTitle && config.options?.plugins?.title) {
      (config.options.plugins.title as Record<string, unknown>).text = newTitle;
    }

    const imageBuffer = await canvas.renderToBuffer(config as unknown as ChartConfiguration);
    const newId = crypto.randomUUID();

    await this.prisma.chart.create({
      data: {
        id: newId,
        type: original.type,
        title: newTitle || `Copy of ${original.title}`,
        config: config as unknown as Prisma.InputJsonValue,
        theme: original.theme,
        width: original.width,
        height: original.height,
        createdAt: new Date(),
      },
    });

    return {
      id: newId,
      imageBuffer,
      format: 'png',
      width: original.width,
      height: original.height,
      mimeType: 'image/png',
      metadata: { clonedFrom: chartId },
    };
  }
}
