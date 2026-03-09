import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import sharp from 'sharp';
import { createLogger, format, transports } from 'winston';
import { randomUUID } from 'crypto';
import type { BoundingBox, ChartContent, AxisConfig, ChartSeries } from '@rasid/shared';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'chart-intelligence' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ChartDetectionRequest {
  imageBuffer: Buffer;
  options?: ChartDetectionOptions;
}

export interface ChartDetectionOptions {
  extractDataValues: boolean;
  detectChartType: boolean;
  extractColors: boolean;
  extractAnnotations: boolean;
  languages: string[];
}

const DEFAULT_OPTIONS: ChartDetectionOptions = {
  extractDataValues: true,
  detectChartType: true,
  extractColors: true,
  extractAnnotations: true,
  languages: ['ar', 'en'],
};

export interface ChartDetectionResult {
  id: string;
  charts: DetectedChart[];
  processingTimeMs: number;
}

export interface DetectedChart {
  id: string;
  bbox: BoundingBox;
  chartType: string;
  title: string;
  subtitle: string | null;
  xAxis: ExtractedAxis | null;
  yAxis: ExtractedAxis | null;
  series: ExtractedSeries[];
  legend: ExtractedLegend | null;
  colors: string[];
  annotations: ChartAnnotation[];
  dataLabels: boolean;
  gridLines: boolean;
  confidence: number;
  extractedDataset: ExtractedDataset;
  canonicalContent: ChartContent;
}

export interface ExtractedAxis {
  label: string;
  type: 'category' | 'value' | 'time';
  min: number | null;
  max: number | null;
  tickValues: string[];
  format: string | null;
  rotation: number;
  gridLines: boolean;
}

export interface ExtractedSeries {
  name: string;
  data: Array<{ label: string; value: number; category?: string }>;
  type: string;
  color: string;
  stacked: boolean;
  lineStyle: 'solid' | 'dashed' | 'dotted' | null;
  markerShape: 'circle' | 'square' | 'triangle' | 'diamond' | null;
}

export interface ExtractedLegend {
  position: 'top' | 'bottom' | 'left' | 'right';
  items: Array<{ label: string; color: string; shape?: string }>;
}

export interface ChartAnnotation {
  type: 'label' | 'arrow' | 'highlight' | 'trend-line' | 'threshold';
  text: string;
  position: BoundingBox;
  color: string;
}

export interface ExtractedDataset {
  columns: string[];
  rows: Array<Record<string, string | number>>;
  totalDataPoints: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ChartIntelligenceService {
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }

  async detectCharts(request: ChartDetectionRequest): Promise<ChartDetectionResult> {
    const startTime = Date.now();
    const options = { ...DEFAULT_OPTIONS, ...request.options };
    const resultId = randomUUID();

    logger.info('Starting chart detection and data extraction');

    const meta = await sharp(request.imageBuffer).metadata();
    const width = meta.width || 1920;
    const height = meta.height || 1080;

    const resized = await sharp(request.imageBuffer)
      .resize({ width: Math.min(width, 4096), fit: 'inside' })
      .png()
      .toBuffer();
    const base64 = resized.toString('base64');

    const charts = await this.detectAndExtractCharts(base64, width, height, options);

    for (const chart of charts) {
      chart.extractedDataset = this.buildDataset(chart);
      chart.canonicalContent = this.toCanonicalContent(chart);
    }

    const result: ChartDetectionResult = {
      id: resultId,
      charts,
      processingTimeMs: Date.now() - startTime,
    };

    logger.info('Chart detection complete', {
      charts: charts.length,
      totalDataPoints: charts.reduce((s, c) => s + c.extractedDataset.totalDataPoints, 0),
      processingTimeMs: result.processingTimeMs,
    });

    return result;
  }

  async chartToDataSource(chart: DetectedChart): Promise<{
    dataSourceId: string;
    dataset: ExtractedDataset;
  }> {
    const dataSourceId = randomUUID();

    try {
      await this.prisma.reportDataSource.create({
        data: {
          id: dataSourceId,
          reportId: 'system',
          type: 'EXTRACTED_CHART',
          config: JSON.stringify({
            chartType: chart.chartType,
            title: chart.title,
            columns: chart.extractedDataset.columns,
            rowCount: chart.extractedDataset.rows.length,
          }),
          data: JSON.stringify(chart.extractedDataset),
        },
      });
    } catch (err) {
      logger.warn('Failed to persist chart data source', { error: err instanceof Error ? err.message : String(err) });
    }

    return { dataSourceId, dataset: chart.extractedDataset };
  }

  // ─── Detection ──────────────────────────────────────────────────────────────

  private async detectAndExtractCharts(
    base64: string,
    width: number,
    height: number,
    options: ChartDetectionOptions,
  ): Promise<DetectedChart[]> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert chart understanding model (ChartOCR / ChartQA / PlotQA).
Detect ALL charts and visualizations in this image (${width}x${height}px).
Languages: ${options.languages.join(', ')}

For each chart provide:
{
  "id": "unique_string",
  "bbox": {"x": px, "y": px, "width": px, "height": px},
  "chartType": "bar|line|pie|doughnut|scatter|area|radar|gauge|waterfall|treemap|heatmap|funnel|combo",
  "title": "chart title",
  "subtitle": "subtitle or null",
  "xAxis": {
    "label": "axis label",
    "type": "category|value|time",
    "min": null, "max": null,
    "tickValues": ["value1", "value2"],
    "format": "format string or null",
    "rotation": 0,
    "gridLines": true/false
  },
  "yAxis": { same as xAxis },
  "series": [
    {
      "name": "series name",
      "data": [{"label": "x-value", "value": 123.45}],
      "type": "bar|line|area",
      "color": "#hex",
      "stacked": false,
      "lineStyle": "solid|dashed|dotted|null",
      "markerShape": "circle|square|triangle|diamond|null"
    }
  ],
  "legend": {
    "position": "top|bottom|left|right",
    "items": [{"label": "name", "color": "#hex"}]
  },
  "colors": ["#hex1", "#hex2"],
  "annotations": [
    {"type": "label|arrow|highlight|trend-line|threshold", "text": "text", "position": {"x":0,"y":0,"width":0,"height":0}, "color": "#hex"}
  ],
  "dataLabels": true/false,
  "gridLines": true/false,
  "confidence": 0.9
}

CRITICAL: Extract actual data values from the chart with maximum precision.
For bar charts, read the bar heights against the y-axis scale.
For pie charts, read the percentages/values.
For line charts, read each data point.

Return JSON: { "charts": [...] }`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } },
            { type: 'text', text: 'Detect all charts and extract their data values with maximum precision.' },
          ],
        },
      ],
      temperature: 0.05,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }

    return (Array.isArray(parsed.charts) ? parsed.charts : []).map((c: Record<string, unknown>) => {
      const parseAxis = (axis: unknown): ExtractedAxis | null => {
        if (!axis || typeof axis !== 'object') return null;
        const a = axis as Record<string, unknown>;
        return {
          label: String(a.label || ''),
          type: (a.type || 'category') as ExtractedAxis['type'],
          min: a.min !== null && a.min !== undefined ? Number(a.min) : null,
          max: a.max !== null && a.max !== undefined ? Number(a.max) : null,
          tickValues: Array.isArray(a.tickValues) ? (a.tickValues as string[]) : [],
          format: a.format ? String(a.format) : null,
          rotation: Number(a.rotation) || 0,
          gridLines: Boolean(a.gridLines),
        };
      };

      const series: ExtractedSeries[] = (Array.isArray(c.series) ? c.series : []).map((s: Record<string, unknown>) => ({
        name: String(s.name || ''),
        data: (Array.isArray(s.data) ? s.data : []).map((d: Record<string, unknown>) => ({
          label: String(d.label || ''),
          value: Number(d.value) || 0,
          category: d.category ? String(d.category) : undefined,
        })),
        type: String(s.type || c.chartType || 'bar'),
        color: String(s.color || '#333'),
        stacked: Boolean(s.stacked),
        lineStyle: (s.lineStyle || null) as ExtractedSeries['lineStyle'],
        markerShape: (s.markerShape || null) as ExtractedSeries['markerShape'],
      }));

      const legendRaw = c.legend && typeof c.legend === 'object' ? c.legend as Record<string, unknown> : null;
      const legend: ExtractedLegend | null = legendRaw ? {
        position: (legendRaw.position || 'bottom') as ExtractedLegend['position'],
        items: (Array.isArray(legendRaw.items) ? legendRaw.items : []).map((item: Record<string, unknown>) => ({
          label: String(item.label || ''),
          color: String(item.color || '#333'),
          shape: item.shape ? String(item.shape) : undefined,
        })),
      } : null;

      return {
        id: String(c.id || randomUUID()),
        bbox: this.parseBbox(c.bbox, width, height),
        chartType: String(c.chartType || 'bar'),
        title: String(c.title || ''),
        subtitle: c.subtitle ? String(c.subtitle) : null,
        xAxis: parseAxis(c.xAxis),
        yAxis: parseAxis(c.yAxis),
        series,
        legend,
        colors: Array.isArray(c.colors) ? (c.colors as string[]) : [],
        annotations: (Array.isArray(c.annotations) ? c.annotations : []).map((a: Record<string, unknown>) => ({
          type: (a.type || 'label') as ChartAnnotation['type'],
          text: String(a.text || ''),
          position: this.parseBbox(a.position, width, height),
          color: String(a.color || '#333'),
        })),
        dataLabels: Boolean(c.dataLabels),
        gridLines: c.gridLines !== false,
        confidence: Number(c.confidence) || 0.7,
        extractedDataset: { columns: [], rows: [], totalDataPoints: 0 },
        canonicalContent: null as unknown as ChartContent,
      };
    });
  }

  // ─── Dataset Building ───────────────────────────────────────────────────────

  private buildDataset(chart: DetectedChart): ExtractedDataset {
    if (chart.series.length === 0) {
      return { columns: [], rows: [], totalDataPoints: 0 };
    }

    const allLabels = new Set<string>();
    for (const s of chart.series) {
      for (const d of s.data) {
        allLabels.add(d.label);
      }
    }

    const labels = Array.from(allLabels);
    const columns = ['Category', ...chart.series.map((s) => s.name || 'Value')];

    const rows: Array<Record<string, string | number>> = labels.map((label) => {
      const row: Record<string, string | number> = { Category: label };
      for (const s of chart.series) {
        const point = s.data.find((d) => d.label === label);
        row[s.name || 'Value'] = point ? point.value : 0;
      }
      return row;
    });

    const totalDataPoints = chart.series.reduce((sum, s) => sum + s.data.length, 0);

    return { columns, rows, totalDataPoints };
  }

  // ─── Canonical Conversion ───────────────────────────────────────────────────

  private toCanonicalContent(chart: DetectedChart): ChartContent {
    return {
      kind: 'chart',
      chartType: chart.chartType as ChartContent['chartType'],
      title: chart.title,
      subtitle: chart.subtitle,
      xAxis: chart.xAxis
        ? {
            label: chart.xAxis.label,
            type: chart.xAxis.type,
            min: chart.xAxis.min,
            max: chart.xAxis.max,
            tickCount: chart.xAxis.tickValues.length,
            tickValues: chart.xAxis.tickValues,
            format: chart.xAxis.format,
            rotation: chart.xAxis.rotation,
          }
        : null,
      yAxis: chart.yAxis
        ? {
            label: chart.yAxis.label,
            type: chart.yAxis.type,
            min: chart.yAxis.min,
            max: chart.yAxis.max,
            tickCount: chart.yAxis.tickValues.length,
            tickValues: chart.yAxis.tickValues,
            format: chart.yAxis.format,
            rotation: chart.yAxis.rotation,
          }
        : null,
      series: chart.series.map((s) => ({
        name: s.name,
        data: s.data,
        type: s.type,
        color: s.color,
        stacked: s.stacked,
      })),
      legend: chart.legend
        ? {
            position: chart.legend.position,
            items: chart.legend.items,
          }
        : null,
      colors: chart.colors,
      dataLabels: chart.dataLabels,
      gridLines: chart.gridLines,
    };
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private parseBbox(raw: unknown, w: number, h: number): BoundingBox {
    if (!raw || typeof raw !== 'object') return { x: 0, y: 0, width: w, height: h };
    const r = raw as Record<string, unknown>;
    return {
      x: Math.max(0, Number(r.x) || 0),
      y: Math.max(0, Number(r.y) || 0),
      width: Math.max(1, Number(r.width) || 100),
      height: Math.max(1, Number(r.height) || 100),
    };
  }
}
