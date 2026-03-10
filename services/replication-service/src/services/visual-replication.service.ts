import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { randomUUID } from 'crypto';
import {
  VisualAnalysis,
  LayoutDescription,
  LayoutElement,
  ChartDetection,
  TextBlock,
  DataTable,
  analyzeImage,
  extractLayout as extractLayoutBase,
  extractCharts as extractChartsBase,
  extractText,
  extractColorPalette,
  compareImages,
  calculateSSIM,
} from './visual-analyzer.service.js';

const prisma = new PrismaClient() as PrismaClient & Record<string, any>;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export interface VisualElementDescriptor {
  id: string;
  type: string;
  position: { x: number; y: number; width: number; height: number };
  style: {
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    opacity: number;
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    color: string;
    textAlign: string;
  };
  content: string;
  children: VisualElementDescriptor[];
  zIndex: number;
}

export interface LayoutSpecification {
  width: number;
  height: number;
  dominantColors: string[];
  backgroundColor: string;
  gridColumns: number;
  gridRows: number;
  sectors: SectorAnalysis[];
  elements: LayoutElement[];
  spacing: string;
  alignment: string;
}

export interface SectorAnalysis {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dominantColor: string;
  brightness: number;
  hasContent: boolean;
  contentType: string;
}

export interface ChartSpecification {
  id: string;
  type: string;
  title: string;
  dataSeries: Array<{
    name: string;
    values: Array<{ label: string; value: number }>;
    color: string;
  }>;
  position: { x: number; y: number; width: number; height: number };
  colors: string[];
  axisLabels: { x: string; y: string };
  legend: string[];
}

export interface ReconstructionMetadata {
  id: string;
  sourceType: string;
  analyzedAt: string;
  reconstructedAt: string;
  elementCount: number;
  chartCount: number;
  textBlockCount: number;
  tableCount: number;
  dimensions: { width: number; height: number };
  fidelityEstimate: number;
}

export interface ComparisonResult {
  pixelDiff: number;
  structuralFingerprint: number;
  ssim: number;
  passed: boolean;
  diffImageBase64: string;
  dimensions: { width: number; height: number };
  totalPixels: number;
  mismatchedPixels: number;
}

export class VisualReplicationService {
  /**
   * Analyze a visual source using GPT-4o Vision.
   * Extracts layout structure, chart types, colors, text, fonts, dimensions.
   * Detects grids, cards, headers, footers, sidebars.
   */
  async analyzeVisual(imageBuffer: Buffer, sourceType: string): Promise<{
    analysis: VisualAnalysis;
    elements: VisualElementDescriptor[];
    metadata: ReconstructionMetadata;
  }> {
    const metadata = await sharp(imageBuffer).metadata();
    const imageWidth = metadata.width || 800;
    const imageHeight = metadata.height || 600;

    const resizedBuffer = await sharp(imageBuffer)
      .resize({ width: Math.min(imageWidth, 2048), fit: 'inside' })
      .png()
      .toBuffer();

    const base64Image = resizedBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64Image}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a pixel-accurate visual analysis engine for the Rasid platform. The source type is "${sourceType}". Analyze every visible element with sub-percent positional accuracy. Return ONLY valid JSON.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Perform a comprehensive visual analysis of this ${sourceType}. Return a JSON object:
{
  "layout": {
    "gridStructure": "description of grid/layout system",
    "columns": number,
    "rows": number,
    "elements": [{
      "type": "header|footer|sidebar|nav|card|chart|table|image|text|button|kpi|logo|divider|background",
      "position": { "x": percent_from_left, "y": percent_from_top, "width": percent_width, "height": percent_height },
      "description": "detailed description",
      "zIndex": layer_number
    }],
    "spacing": "tight|normal|loose",
    "alignment": "left|center|right|mixed"
  },
  "colors": ["#hex1", "#hex2"],
  "fonts": ["font names detected"],
  "textContent": [{
    "text": "actual text",
    "position": { "x": 0, "y": 0, "width": 100, "height": 10 },
    "fontSize": "small|medium|large|xlarge",
    "fontWeight": "normal|bold",
    "alignment": "left|center|right"
  }],
  "charts": [{
    "type": "bar|line|pie|scatter|area|donut|histogram|heatmap|gauge|treemap",
    "title": "chart title",
    "dataPoints": [{ "label": "name", "value": number }],
    "position": { "x": 0, "y": 0, "width": 50, "height": 50 },
    "colors": ["#hex"]
  }],
  "dataTables": [{
    "headers": ["col1"],
    "rows": [["val1"]],
    "position": { "x": 0, "y": 0, "width": 100, "height": 30 }
  }],
  "elements": [{
    "id": "unique_id",
    "type": "card|header|footer|sidebar|chart|table|text|image|kpi|divider|background",
    "position": { "x": 0, "y": 0, "width": 100, "height": 10 },
    "style": {
      "backgroundColor": "#hex or transparent",
      "borderColor": "#hex or none",
      "borderWidth": 0,
      "borderRadius": 0,
      "opacity": 1,
      "fontFamily": "font name",
      "fontSize": "14px",
      "fontWeight": "normal",
      "color": "#hex",
      "textAlign": "left|center|right"
    },
    "content": "text content or empty",
    "children": [],
    "zIndex": 0
  }]
}
Return ONLY valid JSON, no markdown.`,
            },
            {
              type: 'image_url',
              image_url: { url: dataUri, detail: 'high' },
            },
          ],
        },
      ],
      max_tokens: 8192,
      temperature: 0.05,
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

    const analysis: VisualAnalysis = {
      layout: this.parseLayout(parsed['layout']),
      colors: Array.isArray(parsed['colors']) ? (parsed['colors'] as string[]) : [],
      fonts: Array.isArray(parsed['fonts']) ? (parsed['fonts'] as string[]) : [],
      textContent: Array.isArray(parsed['textContent']) ? this.parseTextBlocks(parsed['textContent'] as Record<string, unknown>[]) : [],
      charts: Array.isArray(parsed['charts']) ? this.parseCharts(parsed['charts'] as Record<string, unknown>[]) : [],
      dataTables: Array.isArray(parsed['dataTables']) ? this.parseTables(parsed['dataTables'] as Record<string, unknown>[]) : [],
      dimensions: { width: imageWidth, height: imageHeight },
      timestamp: new Date().toISOString(),
    };

    const elements: VisualElementDescriptor[] = Array.isArray(parsed['elements'])
      ? this.parseElementDescriptors(parsed['elements'] as Record<string, unknown>[])
      : this.deriveElementDescriptors(analysis);

    const reconstructionMeta: ReconstructionMetadata = {
      id: randomUUID(),
      sourceType,
      analyzedAt: new Date().toISOString(),
      reconstructedAt: '',
      elementCount: elements.length,
      chartCount: analysis.charts.length,
      textBlockCount: analysis.textContent.length,
      tableCount: analysis.dataTables.length,
      dimensions: { width: imageWidth, height: imageHeight },
      fidelityEstimate: 0,
    };

    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        action: 'visual_replication.analyze',
        entityType: 'visual_analysis',
        entityId: reconstructionMeta.id,
        details: JSON.parse(JSON.stringify({
          sourceType,
          dimensions: { width: imageWidth, height: imageHeight },
          elementCount: elements.length,
          chartCount: analysis.charts.length,
          textBlockCount: analysis.textContent.length,
        })),
        createdAt: new Date(),
      },
    });

    return { analysis, elements, metadata: reconstructionMeta };
  }

  /**
   * Extract layout specification from an image using sharp for dimensions/colors
   * and GPT-4o Vision for grid/sector analysis.
   */
  async extractLayout(imageBuffer: Buffer): Promise<LayoutSpecification> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;

    const stats = await sharp(imageBuffer).stats();
    const dominantColors = this.extractDominantColorsFromStats(stats);

    const backgroundColor = dominantColors.length > 0 ? dominantColors[dominantColors.length - 1] : '#ffffff';

    const gridCols = 4;
    const gridRows = 4;
    const sectorWidth = Math.floor(width / gridCols);
    const sectorHeight = Math.floor(height / gridRows);
    const sectors: SectorAnalysis[] = [];

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const left = col * sectorWidth;
        const top = row * sectorHeight;
        const extractWidth = Math.min(sectorWidth, width - left);
        const extractHeight = Math.min(sectorHeight, height - top);

        if (extractWidth <= 0 || extractHeight <= 0) {
          continue;
        }

        const sectorBuffer = await sharp(imageBuffer)
          .extract({ left, top, width: extractWidth, height: extractHeight })
          .raw()
          .toBuffer();

        const pixelCount = sectorBuffer.length / 3;
        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        let variance = 0;

        for (let i = 0; i < sectorBuffer.length; i += 3) {
          totalR += sectorBuffer[i];
          totalG += sectorBuffer[i + 1];
          totalB += sectorBuffer[i + 2];
        }

        const avgR = Math.round(totalR / pixelCount);
        const avgG = Math.round(totalG / pixelCount);
        const avgB = Math.round(totalB / pixelCount);

        for (let i = 0; i < sectorBuffer.length; i += 3) {
          const dr = sectorBuffer[i] - avgR;
          const dg = sectorBuffer[i + 1] - avgG;
          const db = sectorBuffer[i + 2] - avgB;
          variance += dr * dr + dg * dg + db * db;
        }
        variance = variance / pixelCount;

        const brightness = (avgR * 0.299 + avgG * 0.587 + avgB * 0.114) / 255;
        const hasContent = variance > 500;
        const contentType = variance > 5000 ? 'complex' : variance > 1000 ? 'moderate' : hasContent ? 'simple' : 'empty';

        const toHex = (v: number): string => v.toString(16).padStart(2, '0');
        const sectorColor = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;

        sectors.push({
          row,
          col,
          x: Math.round((left / width) * 100),
          y: Math.round((top / height) * 100),
          width: Math.round((extractWidth / width) * 100),
          height: Math.round((extractHeight / height) * 100),
          dominantColor: sectorColor,
          brightness: Math.round(brightness * 100) / 100,
          hasContent,
          contentType,
        });
      }
    }

    const layoutFromVision = await extractLayoutBase(imageBuffer);

    const specification: LayoutSpecification = {
      width,
      height,
      dominantColors,
      backgroundColor,
      gridColumns: layoutFromVision.columns,
      gridRows: layoutFromVision.rows,
      sectors,
      elements: layoutFromVision.elements,
      spacing: layoutFromVision.spacing,
      alignment: layoutFromVision.alignment,
    };

    return specification;
  }

  /**
   * Detect charts in an image using GPT-4o Vision.
   * Returns detailed chart specifications with data series, colors, and axis labels.
   */
  async detectCharts(imageBuffer: Buffer): Promise<ChartSpecification[]> {
    const resizedBuffer = await sharp(imageBuffer)
      .resize({ width: 2048, fit: 'inside' })
      .png()
      .toBuffer();

    const base64Image = resizedBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64Image}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a chart detection and data extraction engine. Identify every chart or graph in the image and extract approximate data values. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Detect all charts and graphs. For each chart, extract data series with approximate values. Return JSON array:
[{
  "type": "bar|line|pie|scatter|area|donut|histogram|heatmap|gauge|treemap|waterfall|funnel|radar",
  "title": "chart title if visible",
  "dataSeries": [{
    "name": "series name",
    "values": [{ "label": "x-value or category", "value": approximate_number }],
    "color": "#hex color of this series"
  }],
  "position": { "x": percent, "y": percent, "width": percent, "height": percent },
  "colors": ["#hex colors used"],
  "axisLabels": { "x": "x-axis label or empty", "y": "y-axis label or empty" },
  "legend": ["legend entries"]
}]
If no charts found, return []. Return ONLY valid JSON.`,
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

    const rawContent = response.choices[0]?.message?.content || '[]';
    const cleanedContent = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let parsed: Record<string, unknown>[];

    try {
      parsed = JSON.parse(cleanedContent);
    } catch {
      const arrayMatch = cleanedContent.match(/\[[\s\S]*\]/);
      parsed = arrayMatch ? JSON.parse(arrayMatch[0]) : [];
    }

    const charts: ChartSpecification[] = parsed.map((chart) => ({
      id: randomUUID(),
      type: String(chart['type'] || 'unknown'),
      title: String(chart['title'] || 'Untitled Chart'),
      dataSeries: Array.isArray(chart['dataSeries'])
        ? (chart['dataSeries'] as Record<string, unknown>[]).map((ds) => ({
            name: String(ds['name'] || ''),
            values: Array.isArray(ds['values'])
              ? (ds['values'] as Record<string, unknown>[]).map((v) => ({
                  label: String(v['label'] || ''),
                  value: Number(v['value']) || 0,
                }))
              : [],
            color: String(ds['color'] || '#3b82f6'),
          }))
        : Array.isArray(chart['dataPoints'])
          ? [{
              name: String(chart['title'] || 'Series 1'),
              values: (chart['dataPoints'] as Record<string, unknown>[]).map((dp) => ({
                label: String(dp['label'] || ''),
                value: Number(dp['value']) || 0,
              })),
              color: Array.isArray(chart['colors']) && (chart['colors'] as string[]).length > 0
                ? (chart['colors'] as string[])[0]
                : '#3b82f6',
            }]
          : [],
      position: {
        x: Number((chart['position'] as Record<string, unknown>)?.['x']) || 0,
        y: Number((chart['position'] as Record<string, unknown>)?.['y']) || 0,
        width: Number((chart['position'] as Record<string, unknown>)?.['width']) || 50,
        height: Number((chart['position'] as Record<string, unknown>)?.['height']) || 50,
      },
      colors: Array.isArray(chart['colors']) ? (chart['colors'] as string[]) : [],
      axisLabels: {
        x: String((chart['axisLabels'] as Record<string, unknown>)?.['x'] || ''),
        y: String((chart['axisLabels'] as Record<string, unknown>)?.['y'] || ''),
      },
      legend: Array.isArray(chart['legend']) ? (chart['legend'] as string[]) : [],
    }));

    return charts;
  }

  /**
   * Full pipeline: analyze -> extract layout -> detect charts -> generate config.
   * Creates a Dashboard record in Prisma with widgets.
   */
  async reconstructDashboard(
    imageBuffer: Buffer,
    tenantId: string,
    userId: string
  ): Promise<{ dashboardId: string; metadata: ReconstructionMetadata }> {
    const { analysis, elements } = await this.analyzeVisual(imageBuffer, 'dashboard');
    const layoutSpec = await this.extractLayout(imageBuffer);
    const chartSpecs = await this.detectCharts(imageBuffer);

    const widgets: Record<string, unknown>[] = [];

    for (const chartSpec of chartSpecs) {
      widgets.push({
        id: chartSpec.id,
        type: 'chart',
        chartType: chartSpec.type,
        title: chartSpec.title,
        position: chartSpec.position,
        data: {
          labels: chartSpec.dataSeries.length > 0
            ? chartSpec.dataSeries[0].values.map((v) => v.label)
            : [],
          datasets: chartSpec.dataSeries.map((ds) => ({
            label: ds.name,
            data: ds.values.map((v) => v.value),
            backgroundColor: ds.color,
            borderColor: ds.color,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: chartSpec.legend.length > 0 },
          },
        },
        axisLabels: chartSpec.axisLabels,
      });
    }

    for (const table of analysis.dataTables) {
      widgets.push({
        id: randomUUID(),
        type: 'data-table',
        title: 'Data Table',
        position: table.position,
        columns: table.headers.map((header, idx) => ({
          key: `col_${idx}`,
          label: header,
          sortable: true,
        })),
        rows: table.rows.map((row, rowIdx) => {
          const rowObj: Record<string, string> = { id: `row_${rowIdx}` };
          table.headers.forEach((_, colIdx) => {
            rowObj[`col_${colIdx}`] = row[colIdx] || '';
          });
          return rowObj;
        }),
      });
    }

    const kpiBlocks = analysis.textContent.filter(
      (tb) => /^\d[\d,.%$\u20ac\u00a3\u0631.\u0633]*$/.test(tb.text.trim()) || tb.fontSize === 'xlarge'
    );
    for (const kpi of kpiBlocks) {
      widgets.push({
        id: randomUUID(),
        type: 'kpi-card',
        value: kpi.text,
        position: kpi.position,
        style: { fontSize: kpi.fontSize, fontWeight: 'bold', alignment: kpi.alignment },
      });
    }

    const headerBlocks = analysis.textContent.filter(
      (tb) => (tb.fontSize === 'large' || tb.fontWeight === 'bold') && !kpiBlocks.includes(tb)
    );
    for (const header of headerBlocks) {
      widgets.push({
        id: randomUUID(),
        type: 'text-widget',
        content: header.text,
        style: {
          fontSize: header.fontSize,
          fontWeight: header.fontWeight,
          alignment: header.alignment,
        },
        position: header.position,
      });
    }

    const dashboardConfig = {
      format: 'dashboard',
      gridLayout: {
        columns: layoutSpec.gridColumns,
        rows: layoutSpec.gridRows,
        gap: layoutSpec.spacing === 'tight' ? '8px' : layoutSpec.spacing === 'loose' ? '24px' : '16px',
      },
      widgets,
      theme: {
        colors: analysis.colors,
        fonts: analysis.fonts,
        backgroundColor: layoutSpec.backgroundColor,
        dominantColors: layoutSpec.dominantColors,
      },
      sectors: layoutSpec.sectors,
      metadata: {
        widgetCount: widgets.length,
        chartCount: chartSpecs.length,
        tableCount: analysis.dataTables.length,
        kpiCount: kpiBlocks.length,
        sourceAnalysisTimestamp: analysis.timestamp,
      },
    };

    const dashboardId = randomUUID();

    const dashboard = await prisma.dashboard.create({
      data: {
        id: dashboardId,
        tenantId,
        name: `Reconstructed Dashboard - ${new Date().toISOString().split('T')[0]}`,
        description: 'Dashboard reconstructed from visual source via Visual Replication Engine',
        config: JSON.parse(JSON.stringify(dashboardConfig)),
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    for (const widget of widgets) {
      await prisma.dashboardWidget.create({
        data: {
          id: String(widget['id']),
          dashboardId: dashboard.id,
          type: String(widget['type']),
          title: String(widget['title'] || widget['content'] || widget['value'] || ''),
          config: JSON.parse(JSON.stringify(widget)),
          position: JSON.parse(JSON.stringify(widget['position'])),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    const reconstructionMeta: ReconstructionMetadata = {
      id: dashboardId,
      sourceType: 'dashboard',
      analyzedAt: analysis.timestamp,
      reconstructedAt: new Date().toISOString(),
      elementCount: widgets.length,
      chartCount: chartSpecs.length,
      textBlockCount: analysis.textContent.length,
      tableCount: analysis.dataTables.length,
      dimensions: analysis.dimensions,
      fidelityEstimate: this.estimateFidelity(analysis, widgets.length),
    };

    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        action: 'visual_replication.reconstruct_dashboard',
        entityType: 'dashboard',
        entityId: dashboardId,
        userId,
        details: JSON.parse(JSON.stringify({
          tenantId,
          widgetCount: widgets.length,
          chartCount: chartSpecs.length,
          dimensions: analysis.dimensions,
        })),
        createdAt: new Date(),
      },
    });

    return { dashboardId: dashboard.id, metadata: reconstructionMeta };
  }

  /**
   * Process each image as a slide, extract text/layouts/backgrounds,
   * and create a Presentation record with slides in Prisma.
   */
  async reconstructPresentation(
    imageBuffers: Buffer[],
    tenantId: string,
    userId: string
  ): Promise<{ presentationId: string; metadata: ReconstructionMetadata }> {
    const presentationId = randomUUID();
    const slides: Record<string, unknown>[] = [];
    let totalCharts = 0;
    let totalTextBlocks = 0;
    let totalTables = 0;

    for (let i = 0; i < imageBuffers.length; i++) {
      const buffer = imageBuffers[i];
      const { analysis } = await this.analyzeVisual(buffer, 'presentation-slide');
      const layoutSpec = await this.extractLayout(buffer);

      const slideElements: Record<string, unknown>[] = [];

      const titleBlocks = analysis.textContent.filter(
        (tb) => tb.fontSize === 'xlarge' && tb.position.y < 25
      );
      const subtitleBlocks = analysis.textContent.filter(
        (tb) => tb.fontSize === 'large' && tb.position.y < 35
      );
      const bodyBlocks = analysis.textContent.filter(
        (tb) => !titleBlocks.includes(tb) && !subtitleBlocks.includes(tb)
      );

      for (const title of titleBlocks) {
        slideElements.push({
          type: 'title',
          content: title.text,
          position: title.position,
          style: { fontSize: '44pt', fontWeight: 'bold', alignment: title.alignment, color: '#000000' },
        });
      }

      for (const subtitle of subtitleBlocks) {
        slideElements.push({
          type: 'subtitle',
          content: subtitle.text,
          position: subtitle.position,
          style: { fontSize: '24pt', fontWeight: 'normal', alignment: subtitle.alignment, color: '#555555' },
        });
      }

      if (bodyBlocks.length > 0) {
        slideElements.push({
          type: 'body',
          content: bodyBlocks.map((b) => b.text),
          position: { x: 5, y: 25, width: 90, height: 65 },
          style: { fontSize: '18pt', fontWeight: 'normal', alignment: 'left', bulletStyle: 'disc' },
        });
      }

      for (const chart of analysis.charts) {
        slideElements.push({
          type: 'chart',
          chartType: chart.type,
          title: chart.title,
          data: chart.dataPoints,
          colors: chart.colors,
          position: chart.position,
        });
      }

      for (const table of analysis.dataTables) {
        slideElements.push({
          type: 'table',
          headers: table.headers,
          rows: table.rows,
          position: table.position,
          style: { fontSize: '14pt', borderColor: '#cccccc', headerBackground: '#333333', headerColor: '#ffffff' },
        });
      }

      const slideType = titleBlocks.length > 0 && bodyBlocks.length === 0 && analysis.charts.length === 0
        ? 'title'
        : analysis.charts.length > 0
          ? 'chart'
          : analysis.dataTables.length > 0
            ? 'table'
            : 'content';

      slides.push({
        slideNumber: i + 1,
        type: slideType,
        elements: slideElements,
        background: {
          color: layoutSpec.backgroundColor,
          dominantColors: layoutSpec.dominantColors,
        },
        layout: {
          columns: layoutSpec.gridColumns,
          rows: layoutSpec.gridRows,
          spacing: layoutSpec.spacing,
        },
        dimensions: { width: layoutSpec.width, height: layoutSpec.height },
      });

      totalCharts += analysis.charts.length;
      totalTextBlocks += analysis.textContent.length;
      totalTables += analysis.dataTables.length;
    }

    const firstMeta = imageBuffers.length > 0 ? await sharp(imageBuffers[0]).metadata() : { width: 960, height: 540 };
    const slideWidth = firstMeta.width || 960;
    const slideHeight = firstMeta.height || 540;

    const presentationStructure = {
      format: 'pptx',
      slideSize: { width: slideWidth, height: slideHeight },
      slides,
      theme: {
        colors: slides.length > 0 ? (slides[0]['background'] as Record<string, unknown>)['dominantColors'] : [],
        fonts: [],
        background: slides.length > 0 ? (slides[0]['background'] as Record<string, unknown>)['color'] : '#ffffff',
      },
      metadata: {
        slideCount: slides.length,
        totalCharts,
        totalTextBlocks,
        totalTables,
        reconstructedAt: new Date().toISOString(),
      },
    };

    const presentation = await prisma.presentation.create({
      data: {
        id: presentationId,
        tenantId,
        name: `Reconstructed Presentation - ${new Date().toISOString().split('T')[0]}`,
        description: 'Presentation reconstructed from visual sources via Visual Replication Engine',
        config: JSON.parse(JSON.stringify(presentationStructure)),
        slideCount: slides.length,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    for (const slide of slides) {
      await prisma.presentationSlide.create({
        data: {
          id: randomUUID(),
          presentationId: presentation.id,
          slideNumber: Number(slide['slideNumber']),
          type: String(slide['type']),
          elements: JSON.parse(JSON.stringify(slide['elements'])),
          background: JSON.parse(JSON.stringify(slide['background'])),
          layout: JSON.parse(JSON.stringify(slide['layout'])),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    const reconstructionMeta: ReconstructionMetadata = {
      id: presentationId,
      sourceType: 'presentation',
      analyzedAt: new Date().toISOString(),
      reconstructedAt: new Date().toISOString(),
      elementCount: slides.reduce((sum, s) => sum + (s['elements'] as unknown[]).length, 0),
      chartCount: totalCharts,
      textBlockCount: totalTextBlocks,
      tableCount: totalTables,
      dimensions: { width: slideWidth, height: slideHeight },
      fidelityEstimate: this.estimateFidelity(
        { charts: { length: totalCharts }, textContent: { length: totalTextBlocks }, dataTables: { length: totalTables } } as unknown as VisualAnalysis,
        slides.length
      ),
    };

    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        action: 'visual_replication.reconstruct_presentation',
        entityType: 'presentation',
        entityId: presentationId,
        userId,
        details: JSON.parse(JSON.stringify({
          tenantId,
          slideCount: slides.length,
          totalCharts,
          totalTextBlocks,
          dimensions: { width: slideWidth, height: slideHeight },
        })),
        createdAt: new Date(),
      },
    });

    return { presentationId: presentation.id, metadata: reconstructionMeta };
  }

  /**
   * Detect report structure (cover, sections, appendix), extract text/tables/charts,
   * and create a Report record in Prisma.
   */
  async reconstructReport(
    imageBuffers: Buffer[],
    tenantId: string,
    userId: string
  ): Promise<{ reportId: string; metadata: ReconstructionMetadata }> {
    const reportId = randomUUID();
    const sections: Record<string, unknown>[] = [];
    let totalCharts = 0;
    let totalTextBlocks = 0;
    let totalTables = 0;

    for (let i = 0; i < imageBuffers.length; i++) {
      const buffer = imageBuffers[i];
      const { analysis } = await this.analyzeVisual(buffer, 'report-page');

      const titleBlocks = analysis.textContent.filter(
        (tb) => tb.fontSize === 'xlarge' || (tb.fontSize === 'large' && tb.fontWeight === 'bold')
      );
      const bodyBlocks = analysis.textContent.filter(
        (tb) => !titleBlocks.includes(tb)
      );

      let sectionType: string;
      if (i === 0 && titleBlocks.length > 0 && bodyBlocks.length <= 2) {
        sectionType = 'cover';
      } else if (i === imageBuffers.length - 1 && analysis.dataTables.length > 0 && titleBlocks.length <= 1) {
        sectionType = 'appendix';
      } else if (analysis.charts.length > 0) {
        sectionType = 'analysis';
      } else if (analysis.dataTables.length > 0) {
        sectionType = 'data';
      } else {
        sectionType = 'content';
      }

      const sectionElements: Record<string, unknown>[] = [];

      for (const title of titleBlocks) {
        const headingLevel = title.fontSize === 'xlarge' ? 1 : 2;
        sectionElements.push({
          type: 'heading',
          content: title.text,
          headingLevel,
          position: title.position,
          style: {
            fontSize: headingLevel === 1 ? '28pt' : '22pt',
            fontWeight: 'bold',
            alignment: title.alignment,
          },
        });
      }

      for (const body of bodyBlocks) {
        sectionElements.push({
          type: 'paragraph',
          content: body.text,
          position: body.position,
          style: {
            fontSize: body.fontSize === 'small' ? '10pt' : '12pt',
            fontWeight: body.fontWeight,
            alignment: body.alignment,
          },
        });
      }

      for (const chart of analysis.charts) {
        sectionElements.push({
          type: 'chart',
          chartType: chart.type,
          title: chart.title,
          data: chart.dataPoints,
          colors: chart.colors,
          position: chart.position,
        });
      }

      for (const table of analysis.dataTables) {
        sectionElements.push({
          type: 'table',
          headers: table.headers,
          rows: table.rows,
          position: table.position,
        });
      }

      sections.push({
        pageNumber: i + 1,
        sectionType,
        title: titleBlocks.length > 0 ? titleBlocks[0].text : `Section ${i + 1}`,
        elements: sectionElements,
      });

      totalCharts += analysis.charts.length;
      totalTextBlocks += analysis.textContent.length;
      totalTables += analysis.dataTables.length;
    }

    const firstMeta = imageBuffers.length > 0 ? await sharp(imageBuffers[0]).metadata() : { width: 800, height: 1100 };
    const pageWidth = firstMeta.width || 800;
    const pageHeight = firstMeta.height || 1100;

    const reportStructure = {
      format: 'report',
      pageSize: { width: pageWidth, height: pageHeight },
      sections,
      metadata: {
        pageCount: imageBuffers.length,
        sectionCount: sections.length,
        totalCharts,
        totalTextBlocks,
        totalTables,
        hasCover: sections.some((s) => s['sectionType'] === 'cover'),
        hasAppendix: sections.some((s) => s['sectionType'] === 'appendix'),
        reconstructedAt: new Date().toISOString(),
      },
    };

    const report = await prisma.report.create({
      data: {
        id: reportId,
        tenantId,
        name: `Reconstructed Report - ${new Date().toISOString().split('T')[0]}`,
        description: 'Report reconstructed from visual sources via Visual Replication Engine',
        config: JSON.parse(JSON.stringify(reportStructure)),
        pageCount: imageBuffers.length,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        action: 'visual_replication.reconstruct_report',
        entityType: 'report',
        entityId: reportId,
        userId,
        details: JSON.parse(JSON.stringify({
          tenantId,
          pageCount: imageBuffers.length,
          sectionCount: sections.length,
          totalCharts,
          totalTextBlocks,
          totalTables,
        })),
        createdAt: new Date(),
      },
    });

    const reconstructionMeta: ReconstructionMetadata = {
      id: reportId,
      sourceType: 'report',
      analyzedAt: new Date().toISOString(),
      reconstructedAt: new Date().toISOString(),
      elementCount: sections.reduce((sum, s) => sum + (s['elements'] as unknown[]).length, 0),
      chartCount: totalCharts,
      textBlockCount: totalTextBlocks,
      tableCount: totalTables,
      dimensions: { width: pageWidth, height: pageHeight },
      fidelityEstimate: this.estimateFidelity(
        { charts: { length: totalCharts }, textContent: { length: totalTextBlocks }, dataTables: { length: totalTables } } as unknown as VisualAnalysis,
        sections.length
      ),
    };

    return { reportId: report.id, metadata: reconstructionMeta };
  }

  /**
   * Compare original vs reconstructed using pixelmatch for pixel-level comparison.
   * Pass criteria: pixelDiff <= 0.1%, structuralFingerprint >= 0.999
   */
  async compareReconstruction(
    originalBuffer: Buffer,
    reconstructedBuffer: Buffer
  ): Promise<ComparisonResult> {
    const originalMeta = await sharp(originalBuffer).metadata();
    const reconstructedMeta = await sharp(reconstructedBuffer).metadata();

    const targetWidth = Math.max(originalMeta.width || 800, reconstructedMeta.width || 800);
    const targetHeight = Math.max(originalMeta.height || 600, reconstructedMeta.height || 600);
    const normalizedWidth = Math.min(targetWidth, 2048);
    const normalizedHeight = Math.min(targetHeight, 2048);

    const originalResized = await sharp(originalBuffer)
      .resize(normalizedWidth, normalizedHeight, { fit: 'fill' })
      .png()
      .toBuffer();

    const reconstructedResized = await sharp(reconstructedBuffer)
      .resize(normalizedWidth, normalizedHeight, { fit: 'fill' })
      .png()
      .toBuffer();

    const originalPng = PNG.sync.read(originalResized);
    const reconstructedPng = PNG.sync.read(reconstructedResized);

    const width = originalPng.width;
    const height = originalPng.height;
    const diffPng = new PNG({ width, height });

    const mismatchedPixels = pixelmatch(
      originalPng.data,
      reconstructedPng.data,
      diffPng.data,
      width,
      height,
      {
        threshold: 0.1,
        includeAA: true,
        alpha: 0.1,
        diffColor: [255, 0, 0],
        diffColorAlt: [0, 255, 0],
        aaColor: [255, 255, 0],
      }
    );

    const totalPixels = width * height;
    const pixelDiffPercentage = (mismatchedPixels / totalPixels) * 100;

    const ssim = await calculateSSIM(originalBuffer, reconstructedBuffer);

    const structuralFingerprintOriginal = await this.generateStructuralFingerprint(originalBuffer);
    const structuralFingerprintReconstructed = await this.generateStructuralFingerprint(reconstructedBuffer);
    const structuralSimilarity = this.computeFingerprintSimilarity(
      structuralFingerprintOriginal,
      structuralFingerprintReconstructed
    );

    const diffBuffer = PNG.sync.write(diffPng);
    const diffCompressed = await sharp(diffBuffer).png({ compressionLevel: 9 }).toBuffer();
    const diffImageBase64 = diffCompressed.toString('base64');

    const passed = pixelDiffPercentage <= 0.1 && structuralSimilarity >= 0.999;

    const result: ComparisonResult = {
      pixelDiff: Math.round(pixelDiffPercentage * 10000) / 10000,
      structuralFingerprint: Math.round(structuralSimilarity * 10000) / 10000,
      ssim: Math.round(ssim * 10000) / 10000,
      passed,
      diffImageBase64,
      dimensions: { width, height },
      totalPixels,
      mismatchedPixels,
    };

    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        action: 'visual_replication.compare',
        entityType: 'comparison',
        entityId: randomUUID(),
        details: JSON.parse(JSON.stringify({
          pixelDiff: result.pixelDiff,
          structuralFingerprint: result.structuralFingerprint,
          ssim: result.ssim,
          passed: result.passed,
          dimensions: result.dimensions,
          totalPixels: result.totalPixels,
          mismatchedPixels: result.mismatchedPixels,
        })),
        createdAt: new Date(),
      },
    });

    return result;
  }

  /**
   * Generate a structural fingerprint for an image.
   * Resize to standard dimensions, extract edge map, compute perceptual hash.
   */
  async generateStructuralFingerprint(imageBuffer: Buffer): Promise<string> {
    const standardSize = 64;

    const resizedGrey = await sharp(imageBuffer)
      .resize(standardSize, standardSize, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer();

    // Sobel edge detection
    const edgeMap = new Uint8Array(standardSize * standardSize);
    for (let y = 1; y < standardSize - 1; y++) {
      for (let x = 1; x < standardSize - 1; x++) {
        const idx = y * standardSize + x;
        const gx =
          -resizedGrey[(y - 1) * standardSize + (x - 1)] +
          resizedGrey[(y - 1) * standardSize + (x + 1)] +
          -2 * resizedGrey[y * standardSize + (x - 1)] +
          2 * resizedGrey[y * standardSize + (x + 1)] +
          -resizedGrey[(y + 1) * standardSize + (x - 1)] +
          resizedGrey[(y + 1) * standardSize + (x + 1)];

        const gy =
          -resizedGrey[(y - 1) * standardSize + (x - 1)] +
          -2 * resizedGrey[(y - 1) * standardSize + x] +
          -resizedGrey[(y - 1) * standardSize + (x + 1)] +
          resizedGrey[(y + 1) * standardSize + (x - 1)] +
          2 * resizedGrey[(y + 1) * standardSize + x] +
          resizedGrey[(y + 1) * standardSize + (x + 1)];

        edgeMap[idx] = Math.min(255, Math.round(Math.sqrt(gx * gx + gy * gy)));
      }
    }

    // DCT-based perceptual hash (simplified 8x8 block approach)
    const hashSize = 8;
    const blockWidth = Math.floor(standardSize / hashSize);
    const blockHeight = Math.floor(standardSize / hashSize);
    const blockAverages: number[] = [];

    for (let by = 0; by < hashSize; by++) {
      for (let bx = 0; bx < hashSize; bx++) {
        let sum = 0;
        let count = 0;
        for (let y = by * blockHeight; y < (by + 1) * blockHeight && y < standardSize; y++) {
          for (let x = bx * blockWidth; x < (bx + 1) * blockWidth && x < standardSize; x++) {
            sum += edgeMap[y * standardSize + x];
            count++;
          }
        }
        blockAverages.push(count > 0 ? sum / count : 0);
      }
    }

    const totalAverage = blockAverages.reduce((s, v) => s + v, 0) / blockAverages.length;

    // Generate hash bits
    const hashBits: number[] = blockAverages.map((avg) => (avg >= totalAverage ? 1 : 0));

    // Convert to hex string
    let hashHex = '';
    for (let i = 0; i < hashBits.length; i += 4) {
      const nibble = (hashBits[i] << 3) | (hashBits[i + 1] << 2) | (hashBits[i + 2] << 1) | hashBits[i + 3];
      hashHex += nibble.toString(16);
    }

    // Also append intensity distribution fingerprint
    const intensityBuckets = new Array(16).fill(0);
    for (let i = 0; i < resizedGrey.length; i++) {
      const bucket = Math.min(15, Math.floor(resizedGrey[i] / 16));
      intensityBuckets[bucket]++;
    }

    const totalPixels = resizedGrey.length;
    const intensityHash = intensityBuckets
      .map((count) => Math.round((count / totalPixels) * 255).toString(16).padStart(2, '0'))
      .join('');

    return `${hashHex}-${intensityHash}`;
  }

  // --- Private helper methods ---

  private computeFingerprintSimilarity(fp1: string, fp2: string): number {
    const [hash1, intensity1] = fp1.split('-');
    const [hash2, intensity2] = fp2.split('-');

    // Hamming distance for hash portion
    let hammingDistance = 0;
    const maxLen = Math.max(hash1.length, hash2.length);
    for (let i = 0; i < maxLen; i++) {
      const c1 = parseInt(hash1[i] || '0', 16);
      const c2 = parseInt(hash2[i] || '0', 16);
      let xor = c1 ^ c2;
      while (xor) {
        hammingDistance += xor & 1;
        xor >>= 1;
      }
    }
    const totalBits = maxLen * 4;
    const hashSimilarity = totalBits > 0 ? 1 - hammingDistance / totalBits : 1;

    // Euclidean distance for intensity distribution
    let intensityDist = 0;
    const intLen = Math.max(intensity1?.length || 0, intensity2?.length || 0);
    for (let i = 0; i < intLen; i += 2) {
      const v1 = parseInt(intensity1?.substring(i, i + 2) || '00', 16);
      const v2 = parseInt(intensity2?.substring(i, i + 2) || '00', 16);
      intensityDist += (v1 - v2) * (v1 - v2);
    }
    const maxPossibleDist = (intLen / 2) * 255 * 255;
    const intensitySimilarity = maxPossibleDist > 0 ? 1 - Math.sqrt(intensityDist) / Math.sqrt(maxPossibleDist) : 1;

    // Weighted combination
    return hashSimilarity * 0.6 + intensitySimilarity * 0.4;
  }

  private parseLayout(raw: unknown): LayoutDescription {
    const obj = raw as Record<string, unknown> | undefined;
    return {
      gridStructure: String(obj?.['gridStructure'] || 'single-column'),
      columns: Number(obj?.['columns']) || 1,
      rows: Number(obj?.['rows']) || 1,
      elements: Array.isArray(obj?.['elements'])
        ? (obj!['elements'] as Record<string, unknown>[]).map((el) => ({
            type: String(el['type'] || 'unknown'),
            position: {
              x: Number((el['position'] as Record<string, unknown>)?.['x']) || 0,
              y: Number((el['position'] as Record<string, unknown>)?.['y']) || 0,
              width: Number((el['position'] as Record<string, unknown>)?.['width']) || 100,
              height: Number((el['position'] as Record<string, unknown>)?.['height']) || 100,
            },
            description: String(el['description'] || ''),
            zIndex: Number(el['zIndex']) || 0,
          }))
        : [],
      spacing: String(obj?.['spacing'] || 'normal'),
      alignment: String(obj?.['alignment'] || 'left'),
    };
  }

  private parseTextBlocks(raw: Record<string, unknown>[]): TextBlock[] {
    return raw.map((block) => ({
      text: String(block['text'] || ''),
      position: {
        x: Number((block['position'] as Record<string, unknown>)?.['x']) || 0,
        y: Number((block['position'] as Record<string, unknown>)?.['y']) || 0,
        width: Number((block['position'] as Record<string, unknown>)?.['width']) || 100,
        height: Number((block['position'] as Record<string, unknown>)?.['height']) || 10,
      },
      fontSize: String(block['fontSize'] || 'medium'),
      fontWeight: String(block['fontWeight'] || 'normal'),
      alignment: String(block['alignment'] || 'left'),
    }));
  }

  private parseCharts(raw: Record<string, unknown>[]): ChartDetection[] {
    return raw.map((chart) => ({
      type: String(chart['type'] || 'unknown'),
      title: String(chart['title'] || 'Untitled Chart'),
      dataPoints: Array.isArray(chart['dataPoints'])
        ? (chart['dataPoints'] as Record<string, unknown>[]).map((dp) => ({
            label: String(dp['label'] || ''),
            value: Number(dp['value']) || 0,
          }))
        : [],
      position: {
        x: Number((chart['position'] as Record<string, unknown>)?.['x']) || 0,
        y: Number((chart['position'] as Record<string, unknown>)?.['y']) || 0,
        width: Number((chart['position'] as Record<string, unknown>)?.['width']) || 50,
        height: Number((chart['position'] as Record<string, unknown>)?.['height']) || 50,
      },
      colors: Array.isArray(chart['colors']) ? (chart['colors'] as string[]) : [],
    }));
  }

  private parseTables(raw: Record<string, unknown>[]): DataTable[] {
    return raw.map((table) => ({
      headers: Array.isArray(table['headers']) ? (table['headers'] as string[]) : [],
      rows: Array.isArray(table['rows']) ? (table['rows'] as string[][]) : [],
      position: {
        x: Number((table['position'] as Record<string, unknown>)?.['x']) || 0,
        y: Number((table['position'] as Record<string, unknown>)?.['y']) || 0,
        width: Number((table['position'] as Record<string, unknown>)?.['width']) || 100,
        height: Number((table['position'] as Record<string, unknown>)?.['height']) || 30,
      },
    }));
  }

  private parseElementDescriptors(raw: Record<string, unknown>[]): VisualElementDescriptor[] {
    return raw.map((el) => {
      const style = el['style'] as Record<string, unknown> | undefined;
      return {
        id: String(el['id'] || randomUUID()),
        type: String(el['type'] || 'unknown'),
        position: {
          x: Number((el['position'] as Record<string, unknown>)?.['x']) || 0,
          y: Number((el['position'] as Record<string, unknown>)?.['y']) || 0,
          width: Number((el['position'] as Record<string, unknown>)?.['width']) || 100,
          height: Number((el['position'] as Record<string, unknown>)?.['height']) || 10,
        },
        style: {
          backgroundColor: String(style?.['backgroundColor'] || 'transparent'),
          borderColor: String(style?.['borderColor'] || 'none'),
          borderWidth: Number(style?.['borderWidth']) || 0,
          borderRadius: Number(style?.['borderRadius']) || 0,
          opacity: Number(style?.['opacity']) || 1,
          fontFamily: String(style?.['fontFamily'] || 'sans-serif'),
          fontSize: String(style?.['fontSize'] || '14px'),
          fontWeight: String(style?.['fontWeight'] || 'normal'),
          color: String(style?.['color'] || '#000000'),
          textAlign: String(style?.['textAlign'] || 'left'),
        },
        content: String(el['content'] || ''),
        children: Array.isArray(el['children'])
          ? this.parseElementDescriptors(el['children'] as Record<string, unknown>[])
          : [],
        zIndex: Number(el['zIndex']) || 0,
      };
    });
  }

  private deriveElementDescriptors(analysis: VisualAnalysis): VisualElementDescriptor[] {
    const elements: VisualElementDescriptor[] = [];

    for (const layoutEl of analysis.layout.elements) {
      elements.push({
        id: randomUUID(),
        type: layoutEl.type,
        position: layoutEl.position,
        style: {
          backgroundColor: 'transparent',
          borderColor: 'none',
          borderWidth: 0,
          borderRadius: 0,
          opacity: 1,
          fontFamily: analysis.fonts.length > 0 ? analysis.fonts[0] : 'sans-serif',
          fontSize: '14px',
          fontWeight: 'normal',
          color: analysis.colors.length > 0 ? analysis.colors[0] : '#000000',
          textAlign: 'left',
        },
        content: layoutEl.description,
        children: [],
        zIndex: layoutEl.zIndex,
      });
    }

    for (const textBlock of analysis.textContent) {
      elements.push({
        id: randomUUID(),
        type: 'text',
        position: textBlock.position,
        style: {
          backgroundColor: 'transparent',
          borderColor: 'none',
          borderWidth: 0,
          borderRadius: 0,
          opacity: 1,
          fontFamily: analysis.fonts.length > 0 ? analysis.fonts[0] : 'sans-serif',
          fontSize: textBlock.fontSize === 'xlarge' ? '32px' : textBlock.fontSize === 'large' ? '24px' : textBlock.fontSize === 'small' ? '12px' : '16px',
          fontWeight: textBlock.fontWeight,
          color: analysis.colors.length > 0 ? analysis.colors[0] : '#000000',
          textAlign: textBlock.alignment,
        },
        content: textBlock.text,
        children: [],
        zIndex: 1,
      });
    }

    return elements;
  }

  private extractDominantColorsFromStats(stats: sharp.Stats): string[] {
    const channels = stats.channels;
    const colors: string[] = [];

    if (channels.length >= 3) {
      const toHex = (v: number): string => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0');

      // Mean color
      colors.push(`#${toHex(channels[0].mean)}${toHex(channels[1].mean)}${toHex(channels[2].mean)}`);

      // Min color (darkest)
      colors.push(`#${toHex(channels[0].min)}${toHex(channels[1].min)}${toHex(channels[2].min)}`);

      // Max color (lightest)
      colors.push(`#${toHex(channels[0].max)}${toHex(channels[1].max)}${toHex(channels[2].max)}`);

      // Approximate dominant via mean +/- stdev
      const r1 = channels[0].mean - channels[0].stdev;
      const g1 = channels[1].mean - channels[1].stdev;
      const b1 = channels[2].mean - channels[2].stdev;
      colors.push(`#${toHex(r1)}${toHex(g1)}${toHex(b1)}`);

      const r2 = channels[0].mean + channels[0].stdev;
      const g2 = channels[1].mean + channels[1].stdev;
      const b2 = channels[2].mean + channels[2].stdev;
      colors.push(`#${toHex(r2)}${toHex(g2)}${toHex(b2)}`);
    }

    return [...new Set(colors)];
  }

  private estimateFidelity(analysis: VisualAnalysis, elementCount: number): number {
    const hasCharts = analysis.charts.length > 0;
    const hasText = analysis.textContent.length > 0;
    const hasTables = analysis.dataTables.length > 0;

    let score = 60; // Base score
    if (hasText) score += 15;
    if (hasCharts) score += 10;
    if (hasTables) score += 10;
    if (elementCount > 5) score += 5;

    return Math.min(100, score);
  }
}
