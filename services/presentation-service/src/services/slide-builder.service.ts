import PptxGenJS from 'pptxgenjs';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { createCanvas } from 'canvas';
import winston from 'winston';
import crypto from 'crypto';

const prisma = new PrismaClient();
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'slide-builder' },
  transports: [new winston.transports.Console()],
});

interface SlideTheme {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  backgroundColor: string;
  headerFontSize?: number;
  bodyFontSize?: number;
  accentColor?: string;
}

interface SlideElement {
  id?: string;
  type: string;
  text?: string;
  data?: string;
  shapeType?: string;
  chartType?: string;
  chartData?: Record<string, unknown>[];
  tableRows?: Record<string, unknown>[][];
  rawData?: unknown[][];
  options?: Record<string, unknown>;
}

interface SlideData {
  layout: string;
  elements: SlideElement[];
}

interface PresentationMeta {
  id: string;
  name: string;
  theme: SlideTheme;
  width: number;
  height: number;
  tenantId: string;
  userId: string;
  slides: SlideData[];
}

interface ShapePosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ShapeStyle {
  fillColor?: string;
  borderColor?: string;
  borderWidth?: number;
  shadow?: boolean;
  radius?: number;
}

interface ChartSeries {
  name?: string;
  values?: number[];
}

interface ChartData {
  labels?: string[];
  series?: ChartSeries[];
  showLegend?: boolean;
  legendPos?: string;
  title?: string;
  showValues?: boolean;
}

interface PptxChartSeries {
  name: string;
  labels: string[];
  values: number[];
}

interface ChartPosition {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

interface TablePosition {
  x?: number;
  y?: number;
  w?: number;
  colW?: number[];
  rowH?: number[];
}

function normalizeChartSeriesForPptx(chartData: unknown): PptxChartSeries[] {
  if (!Array.isArray(chartData)) {
    return [];
  }

  return chartData
    .map((series, index) => {
      const item = (series ?? {}) as {
        name?: unknown;
        labels?: unknown;
        values?: unknown;
      };

      const rawLabels = Array.isArray(item.labels)
        ? item.labels.map((label) => String(label ?? '').trim())
        : [];
      const rawValues = Array.isArray(item.values)
        ? item.values
            .map((value) => {
              const nextValue = typeof value === 'number' ? value : Number(value);
              return Number.isFinite(nextValue) ? nextValue : null;
            })
            .filter((value): value is number => value !== null)
        : [];

      const maxLength = Math.max(rawLabels.length, rawValues.length);
      if (maxLength === 0) {
        return null;
      }

      const labels = Array.from({ length: maxLength }, (_, position) => rawLabels[position] || `الفئة ${position + 1}`);
      const values = Array.from({ length: maxLength }, (_, position) => rawValues[position] ?? 0);

      return {
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Series ${index + 1}`,
        labels,
        values,
      };
    })
    .filter((series): series is PptxChartSeries => Boolean(series));
}

interface TableStyle {
  headerColor?: string;
  headerFontColor?: string;
  borderColor?: string;
  altRowColor?: string;
  headerRow?: boolean;
  fontSize?: number;
  fontFamily?: string;
  borderWidth?: number;
  align?: string;
}

const presentationCache = new Map<string, PresentationMeta>();

function parseThemeValue(themeValue: unknown): Partial<SlideTheme> {
  if (!themeValue) {
    return {};
  }

  if (typeof themeValue === 'string') {
    try {
      return JSON.parse(themeValue) as Partial<SlideTheme>;
    } catch {
      return {};
    }
  }

  if (typeof themeValue === 'object') {
    return themeValue as Partial<SlideTheme>;
  }

  return {};
}

function resolveTheme(theme: Partial<SlideTheme>): SlideTheme {
  return {
    primaryColor: theme.primaryColor || '#1a73e8',
    secondaryColor: theme.secondaryColor || '#ffffff',
    fontFamily: theme.fontFamily || 'Arial',
    backgroundColor: theme.backgroundColor || '#ffffff',
    headerFontSize: theme.headerFontSize || 36,
    bodyFontSize: theme.bodyFontSize || 18,
    accentColor: theme.accentColor || '#fbbc04',
  };
}

function parseStoredSlideData(content: unknown, layout: string): SlideData {
  let parsed: Record<string, unknown> = {};

  if (typeof content === 'string') {
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  } else if (typeof content === 'object' && content !== null) {
    parsed = content as Record<string, unknown>;
  }

  const elements = Array.isArray(parsed.elements) ? (parsed.elements as SlideElement[]) : [];

  return {
    layout: typeof parsed.layout === 'string' ? parsed.layout : layout,
    elements,
  };
}

function extractStructuredContent(layout: string, slideData: SlideData): Record<string, string> {
  const textElements = (slideData.elements || []).filter((element) => element.type === 'text');
  const title = textElements[0]?.text || '';

  if (layout === 'title') {
    return {
      title,
      subtitle: textElements[1]?.text || '',
      body: '',
      leftContent: '',
      rightContent: '',
    };
  }

  if (layout === 'two-column') {
    return {
      title,
      subtitle: '',
      body: '',
      leftContent: textElements[1]?.text || '',
      rightContent: textElements[2]?.text || '',
    };
  }

  return {
    title,
    subtitle: '',
    body: textElements.slice(1).map((element) => element.text || '').filter(Boolean).join('\n\n'),
    leftContent: '',
    rightContent: '',
  };
}

function buildSlideData(
  layout: 'title' | 'content' | 'two-column' | 'blank',
  content: Record<string, unknown>,
  themeInput: Partial<SlideTheme>,
  preservedElements: SlideElement[] = []
): SlideData {
  const theme = resolveTheme(themeInput);
  const slideData: SlideData = {
    layout,
    elements: [],
  };

  if (layout === 'title') {
    const titleText = String(content.title || 'Untitled Slide');
    const subtitleText = String(content.subtitle || '');
    slideData.elements.push({
      type: 'text',
      text: titleText,
      options: {
        x: 0.5,
        y: 2.0,
        w: 9.0,
        h: 1.5,
        fontSize: theme.headerFontSize || 36,
        bold: true,
        color: theme.primaryColor.replace('#', ''),
        align: 'center',
        fontFace: theme.fontFamily,
        valign: 'middle',
      },
    });
    slideData.elements.push({
      type: 'text',
      text: subtitleText,
      options: {
        x: 1.5,
        y: 3.8,
        w: 7.0,
        h: 1.0,
        fontSize: theme.bodyFontSize || 18,
        color: '666666',
        align: 'center',
        fontFace: theme.fontFamily,
        valign: 'middle',
      },
    });
  } else if (layout === 'content') {
    const titleText = String(content.title || '');
    const bodyText = String(content.body || '');
    const imageBase64 = typeof content.image === 'string' ? content.image : null;
    slideData.elements.push({
      type: 'text',
      text: titleText,
      options: {
        x: 0.5,
        y: 0.3,
        w: 9.0,
        h: 1.0,
        fontSize: theme.headerFontSize || 28,
        bold: true,
        color: theme.primaryColor.replace('#', ''),
        fontFace: theme.fontFamily,
      },
    });
    slideData.elements.push({
      type: 'text',
      text: bodyText,
      options: {
        x: 0.5,
        y: 1.5,
        w: imageBase64 ? 5.5 : 9.0,
        h: 5.0,
        fontSize: theme.bodyFontSize || 18,
        color: '333333',
        fontFace: theme.fontFamily,
        valign: 'top',
        paraSpaceAfter: 6,
      },
    });
    if (imageBase64) {
      slideData.elements.push({
        type: 'image',
        data: imageBase64,
        options: {
          x: 6.5,
          y: 1.5,
          w: 3.2,
          h: 4.0,
        },
      });
    }
  } else if (layout === 'two-column') {
    const titleText = String(content.title || '');
    const leftContent = String(content.leftContent || '');
    const rightContent = String(content.rightContent || '');
    slideData.elements.push({
      type: 'text',
      text: titleText,
      options: {
        x: 0.5,
        y: 0.3,
        w: 9.0,
        h: 1.0,
        fontSize: theme.headerFontSize || 28,
        bold: true,
        color: theme.primaryColor.replace('#', ''),
        fontFace: theme.fontFamily,
      },
    });
    slideData.elements.push({
      type: 'text',
      text: leftContent,
      options: {
        x: 0.5,
        y: 1.5,
        w: 4.2,
        h: 5.0,
        fontSize: theme.bodyFontSize || 16,
        color: '333333',
        fontFace: theme.fontFamily,
        valign: 'top',
      },
    });
    slideData.elements.push({
      type: 'text',
      text: rightContent,
      options: {
        x: 5.3,
        y: 1.5,
        w: 4.2,
        h: 5.0,
        fontSize: theme.bodyFontSize || 16,
        color: '333333',
        fontFace: theme.fontFamily,
        valign: 'top',
      },
    });
  } else if (String(content.body || '').trim()) {
    slideData.elements.push({
      type: 'text',
      text: String(content.body || ''),
      options: {
        x: 0.75,
        y: 0.75,
        w: 8.5,
        h: 5.75,
        fontSize: theme.bodyFontSize || 18,
        color: '333333',
        fontFace: theme.fontFamily,
        valign: 'top',
      },
    });
  }

  if (preservedElements.length > 0) {
    slideData.elements.push(...preservedElements);
  }

  return slideData;
}

export async function createPresentation(
  name: string,
  theme: Partial<SlideTheme>,
  dimensions?: { width: number; height: number },
  tenantId: string = 'default',
  userId: string = 'system'
): Promise<PresentationMeta> {
  const presId = crypto.randomUUID();
  const width = dimensions?.width || 10;
  const height = dimensions?.height || 7.5;
  const primaryColor = theme?.primaryColor || '#1a73e8';
  const secondaryColor = theme?.secondaryColor || '#ffffff';
  const fontFamily = theme?.fontFamily || 'Arial';
  const backgroundColor = theme?.backgroundColor || '#ffffff';

  const normalizedTheme = {
    primaryColor,
    secondaryColor,
    fontFamily,
    backgroundColor,
    headerFontSize: theme?.headerFontSize || 36,
    bodyFontSize: theme?.bodyFontSize || 18,
    accentColor: theme?.accentColor || '#fbbc04',
  };

  const record = await prisma.presentation.create({
    data: {
      id: presId,
      name: name,
      theme: JSON.stringify(normalizedTheme),
      width: width,
      height: height,
      tenantId: tenantId,
      userId: userId,
      slideCount: 0,
      status: 'DRAFT',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const meta: PresentationMeta = {
    id: record.id,
    name: record.name,
    theme: normalizedTheme,
    width: width,
    height: height,
    tenantId: tenantId,
    userId: userId,
    slides: [],
  };

  presentationCache.set(presId, meta);
  logger.info('Presentation created', { presId, name, tenantId, userId });
  return meta;
}

export async function addSlide(
  presId: string,
  layout: 'title' | 'content' | 'two-column' | 'blank',
  content: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const presentation = presentationCache.get(presId);
  let dbPresentationTheme: Partial<SlideTheme> = {};
  if (!presentation) {
    const dbPres = await prisma.presentation.findUnique({ where: { id: presId } });
    if (!dbPres) {
      throw new Error(`Presentation ${presId} not found`);
    }
    dbPresentationTheme = parseThemeValue(dbPres.theme);
  }
  const slideId = crypto.randomUUID();
  const existingSlides = await prisma.slide.findMany({
    where: { presentationId: presId },
    orderBy: { slideIndex: 'asc' },
  });
  const slideIndex = existingSlides.length;
  const theme = presentation?.theme || dbPresentationTheme;
  const slideData = buildSlideData(layout, content, theme);

  const slideRecord = await prisma.slide.create({
    data: {
      id: slideId,
      presentationId: presId,
      slideIndex: slideIndex,
      layout: layout,
      content: JSON.stringify(slideData),
      notes: (content?.notes as string) || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await prisma.presentation.update({
    where: { id: presId },
    data: { slideCount: slideIndex + 1, updatedAt: new Date() },
  });

  if (presentation) {
    presentation.slides.push(slideData);
  }

  logger.info('Slide added', { presId, slideIndex, layout });
  return { id: slideRecord.id, slideIndex, layout, elements: slideData.elements };
}

export async function updateSlide(
  presId: string,
  slideIndex: number,
  update: {
    layout?: 'title' | 'content' | 'two-column' | 'blank';
    content?: Record<string, unknown>;
    notes?: string;
  }
): Promise<Record<string, unknown>> {
  const [presentation, slide] = await Promise.all([
    prisma.presentation.findUnique({ where: { id: presId } }),
    prisma.slide.findFirst({ where: { presentationId: presId, slideIndex } }),
  ]);

  if (!presentation) {
    throw new Error(`Presentation ${presId} not found`);
  }

  if (!slide) {
    throw new Error(`Slide at index ${slideIndex} not found in presentation ${presId}`);
  }

  const existingSlideData = parseStoredSlideData(slide.content, slide.layout);
  const existingStructured = extractStructuredContent(slide.layout, existingSlideData);
  const preservedElements = (existingSlideData.elements || []).filter((element) => element.type !== 'text');
  const nextLayout = update.layout || (slide.layout as 'title' | 'content' | 'two-column' | 'blank');
  const nextContent = {
    title: update.content?.title ?? existingStructured.title,
    subtitle: update.content?.subtitle ?? existingStructured.subtitle,
    body: update.content?.body ?? existingStructured.body,
    leftContent: update.content?.leftContent ?? existingStructured.leftContent,
    rightContent: update.content?.rightContent ?? existingStructured.rightContent,
  };
  const slideData = buildSlideData(
    nextLayout,
    nextContent,
    parseThemeValue(presentation.theme),
    preservedElements
  );

  await prisma.slide.update({
    where: { id: slide.id },
    data: {
      content: JSON.stringify(slideData),
      layout: nextLayout,
      notes: update.notes !== undefined ? update.notes : slide.notes,
      updatedAt: new Date(),
    },
  });

  await prisma.presentation.update({
    where: { id: presId },
    data: { updatedAt: new Date() },
  });

  logger.info('Slide updated', { presId, slideIndex, layout: nextLayout });
  return { presId, slideIndex, layout: nextLayout, updated: true };
}

export async function addTextBox(
  presId: string,
  slideIndex: number,
  text: string,
  position: { x: number; y: number; w: number; h: number },
  style: { fontSize?: number; bold?: boolean; color?: string; rtl?: boolean }
): Promise<Record<string, unknown>> {
  const slide = await prisma.slide.findFirst({
    where: { presentationId: presId, slideIndex: slideIndex },
  });
  if (!slide) {
    throw new Error(`Slide at index ${slideIndex} not found in presentation ${presId}`);
  }

  const slideContent = JSON.parse(slide.content as string);
  const elementId = crypto.randomUUID();
  const fontColor = (style.color || '#333333').replace('#', '');
  const isRtl = style.rtl === true;

  const textElement = {
    id: elementId,
    type: 'text',
    text: text,
    options: {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      fontSize: style.fontSize || 18,
      bold: style.bold || false,
      color: fontColor,
      fontFace: 'Arial',
      align: isRtl ? 'right' : 'left',
      rtlMode: isRtl,
      valign: 'top',
      margin: [5, 10, 5, 10],
      wrap: true,
      shrinkText: true,
    },
  };

  slideContent.elements = slideContent.elements || [];
  slideContent.elements.push(textElement);

  await prisma.slide.update({
    where: { id: slide.id },
    data: { content: JSON.stringify(slideContent), updatedAt: new Date() },
  });

  logger.info('TextBox added', { presId, slideIndex, elementId, rtl: isRtl });
  return { elementId, type: 'text', position, style, text };
}

export async function addImage(
  presId: string,
  slideIndex: number,
  imageBuffer: Buffer,
  position: { x: number; y: number; w: number; h: number }
): Promise<Record<string, unknown>> {
  const slide = await prisma.slide.findFirst({
    where: { presentationId: presId, slideIndex: slideIndex },
  });
  if (!slide) {
    throw new Error(`Slide at index ${slideIndex} not found in presentation ${presId}`);
  }

  const slideContent = JSON.parse(slide.content as string);
  const elementId = crypto.randomUUID();

  const targetWidth = Math.round(position.w * 96);
  const targetHeight = Math.round(position.h * 96);
  const resizedBuffer = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const base64Data = `data:image/png;base64,${resizedBuffer.toString('base64')}`;

  const imageElement = {
    id: elementId,
    type: 'image',
    data: base64Data,
    options: {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      sizing: { type: 'contain', w: position.w, h: position.h },
    },
  };

  slideContent.elements = slideContent.elements || [];
  slideContent.elements.push(imageElement);

  await prisma.slide.update({
    where: { id: slide.id },
    data: { content: JSON.stringify(slideContent), updatedAt: new Date() },
  });

  logger.info('Image added', { presId, slideIndex, elementId, originalSize: imageBuffer.length });
  return { elementId, type: 'image', position, size: resizedBuffer.length };
}

export async function addShape(
  presId: string,
  slideIndex: number,
  shape: 'rect' | 'circle' | 'arrow' | 'line',
  position: ShapePosition,
  style: ShapeStyle
): Promise<Record<string, unknown>> {
  const slide = await prisma.slide.findFirst({
    where: { presentationId: presId, slideIndex: slideIndex },
  });
  if (!slide) {
    throw new Error(`Slide at index ${slideIndex} not found in presentation ${presId}`);
  }

  const slideContent = JSON.parse(slide.content as string);
  const elementId = crypto.randomUUID();

  const shapeTypeMap: Record<string, string> = {
    rect: 'rect',
    circle: 'ellipse',
    arrow: 'rightArrow',
    line: 'line',
  };

  const fillColor = (style?.fillColor || '#4285f4').replace('#', '');
  const borderColor = (style?.borderColor || '#333333').replace('#', '');
  const borderWidth = style?.borderWidth || 1;

  const shapeElement = {
    id: elementId,
    type: 'shape',
    shapeType: shapeTypeMap[shape] || 'rect',
    options: {
      x: position.x || 1,
      y: position.y || 1,
      w: position.w || 2,
      h: position.h || 2,
      fill: { color: fillColor },
      line: { color: borderColor, width: borderWidth },
      shadow: style?.shadow
        ? { type: 'outer', blur: 4, offset: 2, color: '000000', opacity: 0.3 }
        : undefined,
      rectRadius: shape === 'rect' ? (style?.radius || 0) : undefined,
    },
  };

  slideContent.elements = slideContent.elements || [];
  slideContent.elements.push(shapeElement);

  await prisma.slide.update({
    where: { id: slide.id },
    data: { content: JSON.stringify(slideContent), updatedAt: new Date() },
  });

  logger.info('Shape added', { presId, slideIndex, elementId, shape });
  return { elementId, type: 'shape', shape, position, style };
}

export async function addChart(
  presId: string,
  slideIndex: number,
  chartType: string,
  data: ChartData,
  position: ChartPosition
): Promise<Record<string, unknown>> {
  const slide = await prisma.slide.findFirst({
    where: { presentationId: presId, slideIndex: slideIndex },
  });
  if (!slide) {
    throw new Error(`Slide at index ${slideIndex} not found in presentation ${presId}`);
  }

  const slideContent = JSON.parse(slide.content as string);
  const elementId = crypto.randomUUID();

  const chartTypeMap: Record<string, string> = {
    bar: 'bar',
    line: 'line',
    pie: 'pie',
    doughnut: 'doughnut',
    area: 'area',
    scatter: 'scatter',
    radar: 'radar',
  };

  const resolvedType = chartTypeMap[chartType] || 'bar';
  const chartLabels = data?.labels || ['A', 'B', 'C', 'D'];
  const chartSeries = data?.series || [
    { name: 'Series 1', values: [10, 20, 30, 40] },
  ];

  const pptxChartData = chartSeries.map((s: ChartSeries) => ({
    name: s.name || 'Data',
    labels: chartLabels,
    values: s.values || [],
  }));
  const safeChartData = normalizeChartSeriesForPptx(pptxChartData);

  const chartElement = {
    id: elementId,
    type: 'chart',
    chartType: resolvedType,
    chartData: safeChartData.length > 0 ? safeChartData : normalizeChartSeriesForPptx([
      { name: 'Data', labels: ['A'], values: [0] },
    ]),
    options: {
      x: position?.x || 0.5,
      y: position?.y || 1.5,
      w: position?.w || 8.0,
      h: position?.h || 4.5,
      showLegend: data?.showLegend !== false,
      legendPos: data?.legendPos || 'b',
      showTitle: !!data?.title,
      title: data?.title || '',
      showValue: data?.showValues || false,
      catAxisLabelColor: '666666',
      valAxisLabelColor: '666666',
      catAxisLineShow: true,
      valAxisLineShow: true,
    },
  };

  slideContent.elements = slideContent.elements || [];
  slideContent.elements.push(chartElement);

  await prisma.slide.update({
    where: { id: slide.id },
    data: { content: JSON.stringify(slideContent), updatedAt: new Date() },
  });

  logger.info('Chart added', { presId, slideIndex, elementId, chartType: resolvedType });
  return { elementId, type: 'chart', chartType: resolvedType, position };
}

export async function addTable(
  presId: string,
  slideIndex: number,
  data: unknown[][],
  position: TablePosition,
  style: TableStyle
): Promise<Record<string, unknown>> {
  const slide = await prisma.slide.findFirst({
    where: { presentationId: presId, slideIndex: slideIndex },
  });
  if (!slide) {
    throw new Error(`Slide at index ${slideIndex} not found in presentation ${presId}`);
  }

  const slideContent = JSON.parse(slide.content as string);
  const elementId = crypto.randomUUID();

  const headerColor = (style?.headerColor || '#1a73e8').replace('#', '');
  const headerFontColor = (style?.headerFontColor || '#ffffff').replace('#', '');
  const borderColor = (style?.borderColor || '#cccccc').replace('#', '');
  const altRowColor = (style?.altRowColor || '#f5f5f5').replace('#', '');

  const tableRows = data.map((row: unknown[], rowIdx: number) => {
    return row.map((cell: unknown) => {
      const isHeader = rowIdx === 0 && style?.headerRow !== false;
      return {
        text: String(cell),
        options: {
          fill: isHeader ? headerColor : rowIdx % 2 === 0 ? 'ffffff' : altRowColor,
          color: isHeader ? headerFontColor : '333333',
          bold: isHeader,
          fontSize: style?.fontSize || 12,
          fontFace: style?.fontFamily || 'Arial',
          border: {
            type: 'solid',
            color: borderColor,
            pt: style?.borderWidth || 0.5,
          },
          align: style?.align || 'left',
          valign: 'middle',
          margin: [3, 5, 3, 5],
        },
      };
    });
  });

  const tableElement = {
    id: elementId,
    type: 'table',
    tableRows: tableRows,
    rawData: data,
    options: {
      x: position?.x || 0.5,
      y: position?.y || 1.5,
      w: position?.w || 9.0,
      colW: position?.colW || undefined,
      rowH: position?.rowH || undefined,
      autoPage: true,
      autoPageRepeatHeader: true,
    },
  };

  slideContent.elements = slideContent.elements || [];
  slideContent.elements.push(tableElement);

  await prisma.slide.update({
    where: { id: slide.id },
    data: { content: JSON.stringify(slideContent), updatedAt: new Date() },
  });

  logger.info('Table added', {
    presId,
    slideIndex,
    elementId,
    rows: data.length,
    cols: data[0]?.length || 0,
  });
  return { elementId, type: 'table', rows: data.length, cols: data[0]?.length || 0 };
}

export async function exportToPPTX(presId: string): Promise<Buffer> {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presId },
  });
  if (!presentation) {
    throw new Error(`Presentation ${presId} not found`);
  }

  const slides = await prisma.slide.findMany({
    where: { presentationId: presId },
    orderBy: { slideIndex: 'asc' },
  });

  const theme = JSON.parse(presentation.theme as string);
  const pptx = new PptxGenJS();
  pptx.author = 'RASID Presentation Service';
  pptx.company = 'RASID';
  pptx.title = presentation.name;
  pptx.subject = `Generated presentation: ${presentation.name}`;
  pptx.layout = 'LAYOUT_WIDE';

  if (presentation.width && presentation.height) {
    pptx.defineLayout({
      name: 'CUSTOM',
      width: presentation.width as number,
      height: presentation.height as number,
    });
    pptx.layout = 'CUSTOM';
  }

  const pptxChartTypeMap: Record<string, PptxGenJS.CHART_NAME> = {
    bar: pptx.ChartType.bar,
    line: pptx.ChartType.line,
    pie: pptx.ChartType.pie,
    doughnut: pptx.ChartType.doughnut,
    area: pptx.ChartType.area,
    scatter: pptx.ChartType.scatter,
    radar: pptx.ChartType.radar,
  };

  const pptxShapeMap: Record<string, PptxGenJS.SHAPE_NAME> = {
    rect: pptx.ShapeType.rect,
    ellipse: pptx.ShapeType.ellipse,
    rightArrow: pptx.ShapeType.rightArrow,
    line: pptx.ShapeType.line,
  };

  for (const slideRecord of slides) {
    const slideData = JSON.parse(slideRecord.content as string);
    const pptxSlide = pptx.addSlide();

    if (theme.backgroundColor) {
      pptxSlide.background = {
        fill: theme.backgroundColor.replace('#', ''),
      };
    }

    if (slideRecord.notes) {
      pptxSlide.addNotes(slideRecord.notes);
    }

    const elements = slideData.elements || [];
    for (const element of elements) {
      if (element.type === 'text') {
        const textOptions: Record<string, unknown> = {
          x: element.options?.x || 0,
          y: element.options?.y || 0,
          w: element.options?.w || 5,
          h: element.options?.h || 1,
          fontSize: element.options?.fontSize || 18,
          bold: element.options?.bold || false,
          color: element.options?.color || '333333',
          fontFace: element.options?.fontFace || theme.fontFamily || 'Arial',
          align: element.options?.align || 'left',
          valign: element.options?.valign || 'top',
          wrap: true,
        };
        if (element.options?.rtlMode) {
          textOptions.rtlMode = true;
        }
        if (element.options?.margin) {
          textOptions.margin = element.options.margin;
        }
        if (element.options?.paraSpaceAfter) {
          textOptions.paraSpaceAfter = element.options.paraSpaceAfter;
        }
        pptxSlide.addText(element.text || '', textOptions);
      } else if (element.type === 'image') {
        pptxSlide.addImage({
          data: element.data,
          x: element.options?.x || 0,
          y: element.options?.y || 0,
          w: element.options?.w || 3,
          h: element.options?.h || 3,
          sizing: element.options?.sizing || undefined,
        });
      } else if (element.type === 'shape') {
        const shapeType = pptxShapeMap[element.shapeType] || pptx.ShapeType.rect;
        pptxSlide.addShape(shapeType, {
          x: element.options?.x || 1,
          y: element.options?.y || 1,
          w: element.options?.w || 2,
          h: element.options?.h || 2,
          fill: element.options?.fill || undefined,
          line: element.options?.line || undefined,
          shadow: element.options?.shadow || undefined,
          rectRadius: element.options?.rectRadius || undefined,
        });
      } else if (element.type === 'chart') {
        const chartType = pptxChartTypeMap[element.chartType] || pptx.ChartType.bar;
        const safeChartData = normalizeChartSeriesForPptx(element.chartData);

        if (safeChartData.length === 0) {
          pptxSlide.addText('تم تجاوز مخطط غير صالح أثناء التصدير.', {
            x: element.options?.x || 0.5,
            y: element.options?.y || 1.5,
            w: element.options?.w || 8,
            h: 0.6,
            fontSize: 11,
            color: '9f1239',
            fontFace: theme.fontFamily || 'Arial',
            rtlMode: true,
            margin: 0.05,
          });
          continue;
        }

        pptxSlide.addChart(chartType, safeChartData, {
          x: element.options?.x || 0.5,
          y: element.options?.y || 1.5,
          w: element.options?.w || 8,
          h: element.options?.h || 4.5,
          showLegend: element.options?.showLegend ?? true,
          legendPos: element.options?.legendPos || 'b',
          showTitle: element.options?.showTitle || false,
          title: element.options?.title || '',
          showValue: element.options?.showValue || false,
        });
      } else if (element.type === 'table') {
        pptxSlide.addTable(element.tableRows || [], {
          x: element.options?.x || 0.5,
          y: element.options?.y || 1.5,
          w: element.options?.w || 9,
          colW: element.options?.colW || undefined,
          rowH: element.options?.rowH || undefined,
          autoPage: element.options?.autoPage || true,
          autoPageRepeatHeader: element.options?.autoPageRepeatHeader || true,
        });
      }
    }
  }

  const output = await pptx.write({ outputType: 'nodebuffer' });
  const buffer = Buffer.from(output as ArrayBuffer);

  logger.info('PPTX exported', { presId, slides: slides.length, size: buffer.length });
  return buffer;
}

export async function exportToPDF(presId: string): Promise<Buffer> {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presId },
  });
  if (!presentation) {
    throw new Error(`Presentation ${presId} not found`);
  }

  const slides = await prisma.slide.findMany({
    where: { presentationId: presId },
    orderBy: { slideIndex: 'asc' },
  });

  const pageWidth = 960;
  const pageHeight = 720;
  const slideImages: Buffer[] = [];

  for (const slideRecord of slides) {
    const slideData = JSON.parse(slideRecord.content as string);
    const theme = JSON.parse(presentation.theme as string);
    const cvs = createCanvas(pageWidth, pageHeight);
    const ctx = cvs.getContext('2d');

    const bgColor = theme.backgroundColor || '#ffffff';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, pageWidth, pageHeight);

    const elements = slideData.elements || [];
    for (const el of elements) {
      if (el.type === 'text') {
        const fontSize = el.options?.fontSize || 18;
        const bold = el.options?.bold ? 'bold ' : '';
        const fontFace = el.options?.fontFace || 'Arial';
        ctx.font = `${bold}${fontSize}px ${fontFace}`;
        ctx.fillStyle = `#${el.options?.color || '333333'}`;
        const xPx = (el.options?.x || 0) * 96;
        const yPx = (el.options?.y || 0) * 96 + fontSize;
        const maxWidth = (el.options?.w || 5) * 96;
        const lines = wrapCanvasText(ctx, el.text || '', maxWidth);
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], xPx, yPx + i * (fontSize * 1.3));
        }
      } else if (el.type === 'shape') {
        const xPx = (el.options?.x || 0) * 96;
        const yPx = (el.options?.y || 0) * 96;
        const wPx = (el.options?.w || 2) * 96;
        const hPx = (el.options?.h || 2) * 96;
        ctx.fillStyle = `#${el.options?.fill?.color || '4285f4'}`;
        if (el.shapeType === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(xPx + wPx / 2, yPx + hPx / 2, wPx / 2, hPx / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(xPx, yPx, wPx, hPx);
        }
      }
    }

    const pngBuffer = cvs.toBuffer('image/png');
    slideImages.push(pngBuffer);
  }

  if (slideImages.length === 0) {
    const cvs = createCanvas(pageWidth, pageHeight);
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageWidth, pageHeight);
    ctx.fillStyle = '#999999';
    ctx.font = '24px Arial';
    ctx.fillText('Empty Presentation', 350, 360);
    slideImages.push(cvs.toBuffer('image/png'));
  }

  let compositeBuffer = await sharp(slideImages[0]).png().toBuffer();
  for (let i = 1; i < slideImages.length; i++) {
    const currentImg = await sharp(compositeBuffer).metadata();
    const nextImg = await sharp(slideImages[i]).png().toBuffer();
    compositeBuffer = await sharp({
      create: {
        width: pageWidth,
        height: pageHeight * (i + 1),
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        { input: compositeBuffer, top: 0, left: 0 },
        { input: nextImg, top: pageHeight * i, left: 0 },
      ])
      .png()
      .toBuffer();
  }

  logger.info('PDF-style image export completed', { presId, pages: slideImages.length });
  return compositeBuffer;
}

function wrapCanvasText(ctx: { measureText(text: string): { width: number } }, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.length > 0 ? lines : [''];
}

export async function duplicateSlide(presId: string, slideIndex: number): Promise<Record<string, unknown>> {
  const slide = await prisma.slide.findFirst({
    where: { presentationId: presId, slideIndex: slideIndex },
  });
  if (!slide) {
    throw new Error(`Slide at index ${slideIndex} not found`);
  }

  const allSlides = await prisma.slide.findMany({
    where: { presentationId: presId },
    orderBy: { slideIndex: 'asc' },
  });

  const newIndex = slideIndex + 1;
  const slidesToShift = allSlides.filter((s) => s.slideIndex >= newIndex);
  for (const s of slidesToShift) {
    await prisma.slide.update({
      where: { id: s.id },
      data: { slideIndex: s.slideIndex + 1 },
    });
  }

  const newSlide = await prisma.slide.create({
    data: {
      id: crypto.randomUUID(),
      presentationId: presId,
      slideIndex: newIndex,
      layout: slide.layout,
      content: JSON.parse(JSON.stringify(slide.content ?? {})),
      notes: slide.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await prisma.presentation.update({
    where: { id: presId },
    data: { slideCount: allSlides.length + 1, updatedAt: new Date() },
  });

  logger.info('Slide duplicated', { presId, originalIndex: slideIndex, newIndex });
  return { id: newSlide.id, slideIndex: newIndex, layout: newSlide.layout };
}

export async function reorderSlides(presId: string, newOrder: number[]): Promise<Record<string, unknown>> {
  const slides = await prisma.slide.findMany({
    where: { presentationId: presId },
    orderBy: { slideIndex: 'asc' },
  });

  if (newOrder.length !== slides.length) {
    throw new Error(`New order length (${newOrder.length}) does not match slide count (${slides.length})`);
  }

  const uniqueCheck = new Set(newOrder);
  if (uniqueCheck.size !== newOrder.length) {
    throw new Error('Duplicate indices in new order');
  }

  for (let i = 0; i < slides.length; i++) {
    await prisma.slide.update({
      where: { id: slides[i].id },
      data: { slideIndex: -1000 - i },
    });
  }

  for (let newIdx = 0; newIdx < newOrder.length; newIdx++) {
    const originalIdx = newOrder[newIdx];
    const slide = slides[originalIdx];
    if (!slide) {
      throw new Error(`Invalid original index ${originalIdx} in new order`);
    }
    await prisma.slide.update({
      where: { id: slide.id },
      data: { slideIndex: newIdx, updatedAt: new Date() },
    });
  }

  await prisma.presentation.update({
    where: { id: presId },
    data: { updatedAt: new Date() },
  });

  logger.info('Slides reordered', { presId, newOrder });
  return { presId, newOrder, slideCount: slides.length };
}

export async function deleteSlide(presId: string, slideIndex: number): Promise<Record<string, unknown>> {
  const slide = await prisma.slide.findFirst({
    where: { presentationId: presId, slideIndex: slideIndex },
  });
  if (!slide) {
    throw new Error(`Slide at index ${slideIndex} not found`);
  }

  await prisma.slide.delete({ where: { id: slide.id } });

  const remainingSlides = await prisma.slide.findMany({
    where: { presentationId: presId },
    orderBy: { slideIndex: 'asc' },
  });

  for (let i = 0; i < remainingSlides.length; i++) {
    if (remainingSlides[i].slideIndex !== i) {
      await prisma.slide.update({
        where: { id: remainingSlides[i].id },
        data: { slideIndex: i },
      });
    }
  }

  await prisma.presentation.update({
    where: { id: presId },
    data: { slideCount: remainingSlides.length, updatedAt: new Date() },
  });

  logger.info('Slide deleted', { presId, slideIndex, remaining: remainingSlides.length });
  return { presId, deletedIndex: slideIndex, remainingSlides: remainingSlides.length };
}

export async function applyTheme(
  presId: string,
  theme: { primaryColor: string; secondaryColor: string; fontFamily: string; backgroundColor: string }
): Promise<Record<string, unknown>> {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presId },
  });
  if (!presentation) {
    throw new Error(`Presentation ${presId} not found`);
  }

  const existingTheme = JSON.parse(presentation.theme as string);
  const mergedTheme = {
    ...existingTheme,
    primaryColor: theme.primaryColor || existingTheme.primaryColor,
    secondaryColor: theme.secondaryColor || existingTheme.secondaryColor,
    fontFamily: theme.fontFamily || existingTheme.fontFamily,
    backgroundColor: theme.backgroundColor || existingTheme.backgroundColor,
  };

  await prisma.presentation.update({
    where: { id: presId },
    data: { theme: JSON.stringify(mergedTheme), updatedAt: new Date() },
  });

  const slides = await prisma.slide.findMany({
    where: { presentationId: presId },
    orderBy: { slideIndex: 'asc' },
  });

  let updatedCount = 0;
  for (const slide of slides) {
    const slideContent = JSON.parse(slide.content as string);
    const elements = slideContent.elements || [];
    let modified = false;

    for (const el of elements) {
      if (el.type === 'text') {
        if (el.options?.bold) {
          el.options.color = theme.primaryColor.replace('#', '');
          modified = true;
        }
        if (el.options?.fontFace) {
          el.options.fontFace = theme.fontFamily;
          modified = true;
        }
      }
    }

    if (modified) {
      await prisma.slide.update({
        where: { id: slide.id },
        data: { content: JSON.stringify(slideContent), updatedAt: new Date() },
      });
      updatedCount++;
    }
  }

  logger.info('Theme applied', { presId, updatedSlides: updatedCount, theme: mergedTheme });
  return { presId, theme: mergedTheme, updatedSlides: updatedCount };
}
