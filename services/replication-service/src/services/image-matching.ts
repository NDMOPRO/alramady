import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { z } from 'zod';
import * as crypto from 'crypto';
import sharp from 'sharp';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<unknown[]>;
  count(args: Record<string, unknown>): Promise<number>;
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

// ─── Zod Schemas ────────────────────────────────────────────────────

const DashboardMatchRequestSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  imageBuffer: z.instanceof(Buffer),
  preserveExactDimensions: z.boolean().default(true),
  preserveExactPadding: z.boolean().default(true),
  disableAutoBeautification: z.boolean().default(true),
  matchMode: z.enum(['STRICT', 'PROFESSIONAL', 'HYBRID']).default('STRICT'),
});

// ─── Interfaces ─────────────────────────────────────────────────────

interface DetectedWidget {
  id: string;
  type: 'kpi_card' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'donut_chart' | 'table' | 'filter' | 'text' | 'area_chart' | 'scatter_chart';
  title: string;
  position: { x: number; y: number; width: number; height: number };
  containerDimensions: { width: number; height: number; padding: number };
  data: WidgetData;
  style: WidgetStyle;
}

interface WidgetData {
  labels?: string[];
  values?: number[];
  datasets?: Array<{ label: string; data: number[]; color: string }>;
  axes?: { xLabel: string; yLabel: string; xValues: string[]; yValues: number[] };
  gridLines?: { horizontal: number[]; vertical: number[] };
  dataPoints?: Array<{ x: number; y: number; label: string; value: number }>;
  headers?: string[];
  rows?: string[][];
  kpiValue?: string;
  kpiLabel?: string;
  kpiTrend?: 'up' | 'down' | 'stable';
  filterOptions?: string[];
  pieStartAngle?: number;
  columnWidthRatios?: number[];
}

interface WidgetStyle {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  colors: string[];
  fontSize: string;
  fontWeight: string;
  textColor: string;
}

interface DashboardMatchResult {
  id: string;
  tenantId: string;
  widgets: DetectedWidget[];
  gridLayout: {
    columns: number;
    rows: number;
    gap: number;
    totalWidth: number;
    totalHeight: number;
  };
  theme: {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
    fontFamily: string;
  };
  dataBindings: Array<{
    widgetId: string;
    dataSource: string;
    fields: string[];
  }>;
  autoBeautificationDisabled: boolean;
  matchedAt: Date;
}

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  algorithm?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── CRUD Operations ────────────────────────────────────────────────

const MODEL = 'imageMatching';
const CACHE_PREFIX = 'image-matching';

export async function list(params: ListParams) {
  const { page = 1, limit = 20, search, algorithm, isActive, sortBy = 'createdAt', sortOrder = 'desc' } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = {};
  if (search) where.name = { contains: search, mode: 'insensitive' };
  if (algorithm) where.algorithm = algorithm;
  if (isActive !== undefined) where.isActive = isActive;

  const [data, total] = await Promise.all([
    (prisma[MODEL] as unknown as PrismaDelegate).findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    (prisma[MODEL] as unknown as PrismaDelegate).count({ where }),
  ]);

  const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  await cacheSet(cacheKey, result, 300);
  logger.info('Listed image-matchings', { total, page });
  return result;
}

export async function getById(id: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const record = await (prisma[MODEL] as unknown as PrismaDelegate).findUnique({ where: { id } });
  if (!record) throw new NotFoundError('ImageMatching', id);

  await cacheSet(cacheKey, record);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await (prisma[MODEL] as unknown as PrismaDelegate).create({ data });
  await cacheDel(`${CACHE_PREFIX}:list`);
  logger.info('Created image-matching', { id: record.id });
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const existing = await (prisma[MODEL] as unknown as PrismaDelegate).findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('ImageMatching', id);

  const record = await (prisma[MODEL] as unknown as PrismaDelegate).update({ where: { id }, data });
  await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list`)]);
  logger.info('Updated image-matching', { id });
  return record;
}

export async function remove(id: string) {
  const existing = await (prisma[MODEL] as unknown as PrismaDelegate).findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('ImageMatching', id);

  await (prisma[MODEL] as unknown as PrismaDelegate).delete({ where: { id } });
  await Promise.all([cacheDel(`${CACHE_PREFIX}:${id}`), cacheDel(`${CACHE_PREFIX}:list`)]);
  logger.info('Deleted image-matching', { id });
  return { success: true };
}

// ─── Dashboard Image Matching Engine ────────────────────────────────

export async function matchDashboardFromImage(
  input: z.infer<typeof DashboardMatchRequestSchema>,
): Promise<DashboardMatchResult> {
  const validated = DashboardMatchRequestSchema.parse(input);
  const resultId = crypto.randomUUID();

  const metadata = await sharp(validated.imageBuffer).metadata();
  const imgWidth = metadata.width || 1920;
  const imgHeight = metadata.height || 1080;

  // Step 1: Use GPT-4o Vision to detect dashboard elements
  const resizedBuffer = await sharp(validated.imageBuffer)
    .resize({ width: Math.min(imgWidth, 2048), fit: 'inside' })
    .png()
    .toBuffer();

  const base64Image = resizedBuffer.toString('base64');
  const dataUri = `data:image/png;base64,${base64Image}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this dashboard image precisely. For each widget/element, detect:
1. Widget type: kpi_card, bar_chart, line_chart, pie_chart, donut_chart, table, filter, text, area_chart, scatter_chart
2. Exact position as percentage of total image (x, y, width, height)
3. Data values (axis labels, data points, KPI values, table data)
4. Chart axes information and grid lines
5. For pie/donut charts: the start angle
6. For bar charts: column width ratios
7. Colors used

Return JSON:
{
  "widgets": [{
    "type": "widget_type",
    "title": "title",
    "position": { "x": percent, "y": percent, "width": percent, "height": percent },
    "data": {
      "labels": ["label1"],
      "values": [123],
      "axes": { "xLabel": "", "yLabel": "", "xValues": [], "yValues": [] },
      "gridLines": { "horizontal": [0.25, 0.5, 0.75], "vertical": [] },
      "kpiValue": "1234",
      "kpiLabel": "Total Sales",
      "kpiTrend": "up|down|stable",
      "pieStartAngle": 0,
      "columnWidthRatios": [1, 1, 1],
      "headers": [],
      "rows": [[]],
      "filterOptions": []
    },
    "style": {
      "backgroundColor": "#fff",
      "borderColor": "#eee",
      "colors": ["#3b82f6"],
      "fontSize": "14px",
      "textColor": "#333"
    }
  }],
  "grid": { "columns": 4, "rows": 3, "gap": 16 },
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "backgroundColor": "#hex", "textColor": "#hex", "fontFamily": "font" }
}
Return ONLY valid JSON.`,
          },
          {
            type: 'image_url',
            image_url: { url: dataUri, detail: 'high' },
          },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.1,
  });

  const rawContent = response.choices[0]?.message?.content || '{}';
  const cleanedContent = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(cleanedContent);
  } catch {
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }

  // Step 2: Build detected widgets with precise container dimensions
  const rawWidgets = (parsed.widgets as Array<Record<string, unknown>>) || [];
  const widgets: DetectedWidget[] = rawWidgets.map((w) => {
    const pos = w.position as Record<string, number> || { x: 0, y: 0, width: 50, height: 50 };
    const data = w.data as Record<string, unknown> || {};
    const style = w.style as Record<string, unknown> || {};

    const widgetWidth = Math.round((pos.width / 100) * imgWidth);
    const widgetHeight = Math.round((pos.height / 100) * imgHeight);

    return {
      id: crypto.randomUUID(),
      type: (w.type as DetectedWidget['type']) || 'text',
      title: String(w.title || ''),
      position: {
        x: Math.round((pos.x / 100) * imgWidth),
        y: Math.round((pos.y / 100) * imgHeight),
        width: widgetWidth,
        height: widgetHeight,
      },
      containerDimensions: {
        width: widgetWidth,
        height: widgetHeight,
        padding: validated.preserveExactPadding ? Math.round(widgetWidth * 0.02) : 16,
      },
      data: {
        labels: Array.isArray(data.labels) ? data.labels.map(String) : undefined,
        values: Array.isArray(data.values) ? data.values.map(Number) : undefined,
        axes: data.axes ? {
          xLabel: String((data.axes as Record<string, unknown>).xLabel || ''),
          yLabel: String((data.axes as Record<string, unknown>).yLabel || ''),
          xValues: Array.isArray((data.axes as Record<string, unknown>).xValues)
            ? ((data.axes as Record<string, unknown>).xValues as string[]).map(String) : [],
          yValues: Array.isArray((data.axes as Record<string, unknown>).yValues)
            ? ((data.axes as Record<string, unknown>).yValues as number[]).map(Number) : [],
        } : undefined,
        gridLines: data.gridLines ? {
          horizontal: Array.isArray((data.gridLines as Record<string, unknown>).horizontal)
            ? ((data.gridLines as Record<string, unknown>).horizontal as number[]).map(Number) : [],
          vertical: Array.isArray((data.gridLines as Record<string, unknown>).vertical)
            ? ((data.gridLines as Record<string, unknown>).vertical as number[]).map(Number) : [],
        } : undefined,
        dataPoints: Array.isArray(data.dataPoints)
          ? (data.dataPoints as Array<Record<string, unknown>>).map(dp => ({
              x: Number(dp.x || 0),
              y: Number(dp.y || 0),
              label: String(dp.label || ''),
              value: Number(dp.value || 0),
            }))
          : undefined,
        headers: Array.isArray(data.headers) ? data.headers.map(String) : undefined,
        rows: Array.isArray(data.rows) ? (data.rows as string[][]) : undefined,
        kpiValue: data.kpiValue ? String(data.kpiValue) : undefined,
        kpiLabel: data.kpiLabel ? String(data.kpiLabel) : undefined,
        kpiTrend: data.kpiTrend as 'up' | 'down' | 'stable' | undefined,
        filterOptions: Array.isArray(data.filterOptions) ? data.filterOptions.map(String) : undefined,
        pieStartAngle: data.pieStartAngle ? Number(data.pieStartAngle) : undefined,
        columnWidthRatios: Array.isArray(data.columnWidthRatios) ? data.columnWidthRatios.map(Number) : undefined,
      },
      style: {
        backgroundColor: String(style.backgroundColor || '#ffffff'),
        borderColor: String(style.borderColor || '#e5e7eb'),
        borderWidth: Number(style.borderWidth || 1),
        borderRadius: Number(style.borderRadius || 8),
        colors: Array.isArray(style.colors) ? style.colors.map(String) : ['#3b82f6'],
        fontSize: String(style.fontSize || '14px'),
        fontWeight: String(style.fontWeight || 'normal'),
        textColor: String(style.textColor || '#333333'),
      },
    };
  });

  // Step 3: Extract grid layout
  const grid = parsed.grid as Record<string, number> || {};
  const theme = parsed.theme as Record<string, string> || {};

  // Step 4: Build data bindings
  const dataBindings = widgets.map(widget => ({
    widgetId: widget.id,
    dataSource: `${widget.type}_data_source`,
    fields: [
      ...(widget.data.labels ? ['labels'] : []),
      ...(widget.data.values ? ['values'] : []),
      ...(widget.data.kpiValue ? ['kpiValue'] : []),
      ...(widget.data.headers ? ['headers', 'rows'] : []),
    ],
  }));

  const result: DashboardMatchResult = {
    id: resultId,
    tenantId: validated.tenantId,
    widgets,
    gridLayout: {
      columns: Number(grid.columns || 2),
      rows: Number(grid.rows || 2),
      gap: Number(grid.gap || 16),
      totalWidth: imgWidth,
      totalHeight: imgHeight,
    },
    theme: {
      primaryColor: String(theme.primaryColor || '#3b82f6'),
      secondaryColor: String(theme.secondaryColor || '#6366f1'),
      backgroundColor: String(theme.backgroundColor || '#f9fafb'),
      textColor: String(theme.textColor || '#111827'),
      fontFamily: String(theme.fontFamily || 'Inter, sans-serif'),
    },
    dataBindings,
    autoBeautificationDisabled: validated.disableAutoBeautification,
    matchedAt: new Date(),
  };

  // Persist result
  await prisma.dashboardMatch.create({
    data: {
      id: result.id,
      tenantId: result.tenantId,
      userId: validated.userId,
      widgetCount: widgets.length,
      gridColumns: result.gridLayout.columns,
      gridRows: result.gridLayout.rows,
      totalWidth: result.gridLayout.totalWidth,
      totalHeight: result.gridLayout.totalHeight,
      matchMode: validated.matchMode,
      autoBeautificationDisabled: result.autoBeautificationDisabled,
      widgets: JSON.parse(JSON.stringify(widgets)),
      theme: JSON.parse(JSON.stringify(result.theme)),
      dataBindings: JSON.parse(JSON.stringify(result.dataBindings)),
      matchedAt: result.matchedAt,
    },
  });

  logger.info('Matched dashboard from image', {
    resultId,
    tenantId: validated.tenantId,
    widgetCount: widgets.length,
    gridColumns: result.gridLayout.columns,
  });

  return result;
}

// ─── Extract chart axes and data points ─────────────────────────────

export async function extractChartAxesAndDataPoints(
  imageBuffer: Buffer,
  chartPosition: { x: number; y: number; width: number; height: number },
): Promise<{
  axes: { xLabel: string; yLabel: string; xValues: string[]; yValues: number[] };
  dataPoints: Array<{ x: number; y: number; label: string; value: number }>;
  gridLines: { horizontal: number[]; vertical: number[] };
}> {
  // Crop the chart region from the full image
  const croppedBuffer = await sharp(imageBuffer)
    .extract({
      left: chartPosition.x,
      top: chartPosition.y,
      width: chartPosition.width,
      height: chartPosition.height,
    })
    .png()
    .toBuffer();

  const base64 = croppedBuffer.toString('base64');
  const dataUri = `data:image/png;base64,${base64}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Extract precise chart data from this cropped chart image:
1. Axis labels and values
2. Data points with approximate numeric values
3. Grid line positions as fractions (0-1) of the chart area

Return JSON:
{
  "axes": { "xLabel": "", "yLabel": "", "xValues": ["Q1", "Q2"], "yValues": [100, 200] },
  "dataPoints": [{ "x": 0.1, "y": 0.8, "label": "Q1", "value": 100 }],
  "gridLines": { "horizontal": [0.25, 0.5, 0.75], "vertical": [0.25, 0.5, 0.75] }
}
Return ONLY valid JSON.`,
          },
          {
            type: 'image_url',
            image_url: { url: dataUri, detail: 'high' },
          },
        ],
      },
    ],
    max_tokens: 2048,
    temperature: 0.1,
  });

  const rawContent = response.choices[0]?.message?.content || '{}';
  const cleanedContent = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(cleanedContent);
  } catch {
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }

  const axes = parsed.axes as Record<string, unknown> || {};
  const dataPoints = (parsed.dataPoints as Array<Record<string, unknown>>) || [];
  const gridLines = parsed.gridLines as Record<string, unknown> || {};

  return {
    axes: {
      xLabel: String(axes.xLabel || ''),
      yLabel: String(axes.yLabel || ''),
      xValues: Array.isArray(axes.xValues) ? axes.xValues.map(String) : [],
      yValues: Array.isArray(axes.yValues) ? axes.yValues.map(Number) : [],
    },
    dataPoints: dataPoints.map(dp => ({
      x: Number(dp.x || 0),
      y: Number(dp.y || 0),
      label: String(dp.label || ''),
      value: Number(dp.value || 0),
    })),
    gridLines: {
      horizontal: Array.isArray(gridLines.horizontal) ? (gridLines.horizontal as number[]).map(Number) : [],
      vertical: Array.isArray(gridLines.vertical) ? (gridLines.vertical as number[]).map(Number) : [],
    },
  };
}
