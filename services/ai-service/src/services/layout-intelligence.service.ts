import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import sharp from 'sharp';
import { createLogger, format, transports } from 'winston';
import { randomUUID } from 'crypto';
import type {
  CanonicalLayoutGraph,
  PageNode,
  LayoutNode,
  LayoutNodeType,
  NodeStyle,
  TextContent,
  TableContent,
  ChartContent,
  ImageContent,
  KpiContent,
  EmptyContent,
  DesignTokens,
  ColorToken,
  FontToken,
  SpacingToken,
  DocumentMetadata,
  SceneGraph,
  SceneLayer,
  SceneRelationship,
  FontRecognitionResult,
  DetectedFont,
  TypographyLevel,
  BoundingBox,
  Position,
} from '@rasid/shared';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'layout-intelligence' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface LayoutAnalysisRequest {
  imageBuffer: Buffer;
  sourceType: CanonicalLayoutGraph['sourceType'];
  sourceId: string;
  options?: LayoutAnalysisOptions;
}

export interface LayoutAnalysisOptions {
  detectFonts?: boolean;
  detectCharts?: boolean;
  detectTables?: boolean;
  detectKpis?: boolean;
  extractText?: boolean;
  maxDepth?: number;
  targetDpi?: number;
}

const DEFAULT_OPTIONS: LayoutAnalysisOptions = {
  detectFonts: true,
  detectCharts: true,
  detectTables: true,
  detectKpis: true,
  extractText: true,
  maxDepth: 6,
  targetDpi: 150,
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class LayoutIntelligenceService {
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' || '' });
  }

  async analyzeLayout(request: LayoutAnalysisRequest): Promise<CanonicalLayoutGraph> {
    const startTime = Date.now();
    const options = { ...DEFAULT_OPTIONS, ...request.options };

    logger.info('Starting layout analysis', { sourceId: request.sourceId, sourceType: request.sourceType });

    const metadata = await sharp(request.imageBuffer).metadata();
    const imgWidth = metadata.width || 1920;
    const imgHeight = metadata.height || 1080;

    const normalizedBuffer = await sharp(request.imageBuffer)
      .resize({ width: Math.min(imgWidth, 4096), fit: 'inside' })
      .png()
      .toBuffer();

    const base64Image = normalizedBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64Image}`;

    const [layoutResult, fontResult, designTokenResult] = await Promise.all([
      this.detectLayoutStructure(dataUri, imgWidth, imgHeight, options),
      options.detectFonts ? this.recognizeFonts(dataUri, imgWidth, imgHeight) : Promise.resolve(null),
      this.extractDesignTokens(dataUri),
    ]);

    const rootNode = this.buildLayoutTree(layoutResult.elements, imgWidth, imgHeight);
    const readingOrder = this.computeReadingOrder(rootNode, layoutResult.direction);
    const sceneGraph = this.buildSceneGraph(rootNode);

    const documentMetadata: DocumentMetadata = {
      title: layoutResult.title,
      language: layoutResult.language,
      direction: layoutResult.direction,
      documentType: layoutResult.documentType,
      pageCount: 1,
      wordCount: this.countWords(rootNode),
      tableCount: this.countNodesByType(rootNode, 'table'),
      chartCount: this.countNodesByType(rootNode, 'chart'),
      imageCount: this.countNodesByType(rootNode, 'image'),
      confidence: layoutResult.confidence,
    };

    const designTokens = this.mergeDesignTokens(designTokenResult, fontResult);

    const graph: CanonicalLayoutGraph = {
      id: randomUUID(),
      version: '2.0.0',
      sourceType: request.sourceType,
      sourceHash: this.computeHash(request.imageBuffer),
      dimensions: { width: imgWidth, height: imgHeight },
      dpi: options.targetDpi,
      pages: [
        {
          pageNumber: 1,
          dimensions: { width: imgWidth, height: imgHeight },
          orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
          backgroundColor: designTokenResult.backgroundColor || '#ffffff',
          rootNode,
          readingOrder,
        },
      ],
      designTokens,
      metadata: documentMetadata,
      sceneGraph,
      createdAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
    };

    await this.persistLayoutGraph(request.sourceId, graph);

    logger.info('Layout analysis complete', {
      sourceId: request.sourceId,
      elements: this.flattenNodes(rootNode).length,
      processingTimeMs: graph.processingTimeMs,
    });

    return graph;
  }

  async analyzeMultiPageDocument(
    pages: Buffer[],
    sourceType: CanonicalLayoutGraph['sourceType'],
    sourceId: string,
    options?: LayoutAnalysisOptions,
  ): Promise<CanonicalLayoutGraph> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const pageResults: PageNode[] = [];
    let allDesignTokens: DesignTokens | null = null;

    for (let i = 0; i < pages.length; i++) {
      const pageGraph = await this.analyzeLayout({
        imageBuffer: pages[i],
        sourceType,
        sourceId: `${sourceId}_page_${i + 1}`,
        options: opts,
      });

      if (pageGraph.pages[0]) {
        const pageNode = pageGraph.pages[0];
        pageNode.pageNumber = i + 1;
        pageResults.push(pageNode);
      }

      if (i === 0) {
        allDesignTokens = pageGraph.designTokens;
      } else {
        allDesignTokens = this.mergeDesignTokenSets(allDesignTokens!, pageGraph.designTokens);
      }
    }

    const combinedHash = this.computeHash(Buffer.concat(pages));
    const firstPage = pageResults[0];

    const graph: CanonicalLayoutGraph = {
      id: randomUUID(),
      version: '2.0.0',
      sourceType,
      sourceHash: combinedHash,
      dimensions: firstPage ? firstPage.dimensions : { width: 1920, height: 1080 },
      dpi: opts.targetDpi,
      pages: pageResults,
      designTokens: allDesignTokens!,
      metadata: {
        title: null,
        language: 'ar',
        direction: 'rtl',
        documentType: 'unknown',
        pageCount: pages.length,
        wordCount: pageResults.reduce((sum, p) => sum + this.countWords(p.rootNode), 0),
        tableCount: pageResults.reduce((sum, p) => sum + this.countNodesByType(p.rootNode, 'table'), 0),
        chartCount: pageResults.reduce((sum, p) => sum + this.countNodesByType(p.rootNode, 'chart'), 0),
        imageCount: pageResults.reduce((sum, p) => sum + this.countNodesByType(p.rootNode, 'image'), 0),
        confidence: pageResults.length > 0
          ? pageResults.reduce((sum, p) => sum + this.getNodeConfidence(p.rootNode), 0) / pageResults.length
          : 0,
      },
      sceneGraph: this.buildSceneGraph(pageResults[0]?.rootNode || this.createEmptyNode()),
      createdAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
    };

    await this.persistLayoutGraph(sourceId, graph);
    return graph;
  }

  async recognizeFonts(dataUri: string, width: number, height: number): Promise<FontRecognitionResult> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert typographer and font recognition specialist. Analyze the image and identify all fonts used.
For each distinct font usage, provide:
- family: the font family name (be specific: e.g., "Cairo", "IBM Plex Sans Arabic", "Tajawal", "Arial", "Helvetica Neue")
- weight: numeric weight (100-900)
- style: normal or italic
- size: estimated size in pixels
- lineHeight: estimated line height ratio
- letterSpacing: estimated letter spacing in pixels
- confidence: 0-1
- sampleText: a sample of text using this font
- bbox: approximate bounding box {x, y, width, height} as percentage of image dimensions
- isArabic: whether this is Arabic text
- openTypeFeatures: any detected OpenType features (liga, kern, calt, etc.)
- alternatives: array of similar fonts {family, similarity}

Also identify the typography hierarchy:
- role: h1/h2/h3/h4/body/caption/label/data
- count: how many instances of this level
- averageLineLength: average characters per line

Return JSON with: { detectedFonts: [...], typographyHierarchy: [...], confidence: number }`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUri, detail: 'high' } },
            { type: 'text', text: 'Analyze all fonts and typography in this image.' },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { detectedFonts: [], typographyHierarchy: [], confidence: 0.5 };
    }

    const detectedFonts: DetectedFont[] = (Array.isArray(parsed.detectedFonts) ? parsed.detectedFonts : []).map(
      (f: Record<string, unknown>) => ({
        family: String(f.family || 'sans-serif'),
        weight: Number(f.weight) || 400,
        style: (f.style === 'italic' ? 'italic' : 'normal') as 'normal' | 'italic',
        size: Number(f.size) || 16,
        lineHeight: Number(f.lineHeight) || 1.5,
        letterSpacing: Number(f.letterSpacing) || 0,
        confidence: Number(f.confidence) || 0.7,
        sampleText: String(f.sampleText || ''),
        bbox: this.parseBbox(f.bbox, width, height),
        alternatives: Array.isArray(f.alternatives)
          ? (f.alternatives as Array<Record<string, unknown>>).map((a) => ({
              family: String(a.family || ''),
              similarity: Number(a.similarity) || 0.5,
            }))
          : [],
        isArabic: Boolean(f.isArabic),
        openTypeFeatures: Array.isArray(f.openTypeFeatures) ? (f.openTypeFeatures as string[]) : [],
      }),
    );

    const typographyHierarchy: TypographyLevel[] = (
      Array.isArray(parsed.typographyHierarchy) ? parsed.typographyHierarchy : []
    ).map((t: Record<string, unknown>, idx: number) => ({
      role: (t.role || 'body') as TypographyLevel['role'],
      font: detectedFonts[idx] || detectedFonts[0] || this.defaultFont(),
      count: Number(t.count) || 1,
      averageLineLength: Number(t.averageLineLength) || 40,
    }));

    return {
      detectedFonts,
      typographyHierarchy,
      confidence: Number(parsed.confidence) || 0.7,
    };
  }

  // ─── Private: Layout Detection ──────────────────────────────────────────────

  private async detectLayoutStructure(
    dataUri: string,
    width: number,
    height: number,
    options: LayoutAnalysisOptions,
  ): Promise<{
    elements: RawLayoutElement[];
    title: string | null;
    language: string;
    direction: 'ltr' | 'rtl';
    documentType: DocumentMetadata['documentType'];
    confidence: number;
  }> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a document layout analysis expert using techniques from LayoutLM, DiT, and Detectron2.
Analyze the image and detect ALL visual elements with precise bounding boxes.

For each element provide:
- id: unique string
- type: one of [page, container, section, column, row, paragraph, heading, table, chart, image, icon, kpi-card, widget, filter, text-block, list, divider, shape, logo, footer, header, sidebar, navigation]
- bbox: {x, y, width, height} as PIXELS (image is ${width}x${height})
- zIndex: layer order (0 = background)
- confidence: 0-1
- parentId: id of parent element or null for top-level
- semanticRole: semantic purpose of the element
- readingOrder: integer for reading sequence

For text elements include:
- text: the actual text content
- language: ar/en
- fontSize: in px
- fontWeight: 100-900
- alignment: left/center/right/justify
- color: hex color

For table elements include:
- headers: array of header strings
- rows: array of row arrays
- mergedCells: array of {startRow, startCol, endRow, endCol}

For chart elements include:
- chartType: bar/line/pie/doughnut/scatter/area/radar/gauge/waterfall/treemap/heatmap/funnel/combo
- title: chart title
- series: array of {name, data: [{label, value}], color}
- xAxis: {label, tickValues}
- yAxis: {label}

For KPI elements include:
- label: KPI name
- value: KPI value
- trend: up/down/neutral
- trendValue: trend text

Also detect:
- title: document title if visible
- language: primary language (ar/en)
- direction: ltr/rtl
- documentType: report/dashboard/presentation/spreadsheet/form/invoice/letter/article/unknown

Style properties for each element:
- backgroundColor: hex or null
- borderColor: hex or null
- borderWidth: px
- borderRadius: px
- shadow: boolean
- opacity: 0-1
- padding: {top, left, right, bottom} in px

Return JSON: { elements: [...], title, language, direction, documentType, confidence }`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUri, detail: 'high' } },
            { type: 'text', text: 'Perform comprehensive layout analysis of this document/dashboard image. Detect every visual element with precise coordinates.' },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.error('Failed to parse layout detection response');
      parsed = { elements: [], title: null, language: 'ar', direction: 'rtl', documentType: 'unknown', confidence: 0.3 };
    }

    const elements: RawLayoutElement[] = (Array.isArray(parsed.elements) ? parsed.elements : []).map(
      (e: Record<string, unknown>) => ({
        id: String(e.id || randomUUID()),
        type: String(e.type || 'unknown') as LayoutNodeType,
        bbox: this.parseBbox(e.bbox, width, height),
        zIndex: Number(e.zIndex) || 0,
        confidence: Number(e.confidence) || 0.7,
        parentId: e.parentId ? String(e.parentId) : null,
        semanticRole: String(e.semanticRole || ''),
        readingOrder: Number(e.readingOrder) || 0,
        text: e.text ? String(e.text) : null,
        language: e.language ? String(e.language) : null,
        fontSize: e.fontSize ? Number(e.fontSize) : null,
        fontWeight: e.fontWeight ? Number(e.fontWeight) : null,
        alignment: e.alignment ? String(e.alignment) : null,
        color: e.color ? String(e.color) : null,
        backgroundColor: e.backgroundColor ? String(e.backgroundColor) : null,
        borderColor: e.borderColor ? String(e.borderColor) : null,
        borderWidth: e.borderWidth ? Number(e.borderWidth) : null,
        borderRadius: e.borderRadius ? Number(e.borderRadius) : null,
        shadow: Boolean(e.shadow),
        opacity: e.opacity !== undefined ? Number(e.opacity) : 1,
        padding: e.padding as Position | null,
        headers: Array.isArray(e.headers) ? (e.headers as string[]) : null,
        rows: Array.isArray(e.rows) ? (e.rows as string[][]) : null,
        mergedCells: Array.isArray(e.mergedCells) ? (e.mergedCells as Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>) : null,
        chartType: e.chartType ? String(e.chartType) : null,
        chartTitle: e.title ? String(e.title) : null,
        series: Array.isArray(e.series) ? e.series : null,
        xAxis: e.xAxis as Record<string, unknown> | null,
        yAxis: e.yAxis as Record<string, unknown> | null,
        kpiLabel: e.label ? String(e.label) : null,
        kpiValue: e.value ? String(e.value) : null,
        kpiTrend: e.trend ? String(e.trend) : null,
        kpiTrendValue: e.trendValue ? String(e.trendValue) : null,
      }),
    );

    return {
      elements,
      title: parsed.title ? String(parsed.title) : null,
      language: String(parsed.language || 'ar'),
      direction: (parsed.direction === 'ltr' ? 'ltr' : 'rtl') as 'ltr' | 'rtl',
      documentType: (parsed.documentType || 'unknown') as DocumentMetadata['documentType'],
      confidence: Number(parsed.confidence) || 0.7,
    };
  }

  private async extractDesignTokens(dataUri: string): Promise<DesignTokensRaw> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Extract a design token system from this image. Return JSON:
{
  backgroundColor: hex of page background,
  colors: [{ name, hex, usage (background/text/border/accent/chart/icon), frequency (0-1) }],
  fonts: [{ family, size, weight, usage (heading/subheading/body/caption/label/data) }],
  spacing: [{ value (px), direction (horizontal/vertical/all), usage (margin/padding/gap/indent) }],
  borders: [{ width, style, color, radius }],
  shadows: [{ offsetX, offsetY, blur, spread, color }],
  gradients: [{ type (linear/radial), angle, stops: [{color, position}] }]
}`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUri, detail: 'high' } },
            { type: 'text', text: 'Extract the complete design token system.' },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    try {
      return JSON.parse(raw) as DesignTokensRaw;
    } catch {
      return { backgroundColor: '#ffffff', colors: [], fonts: [], spacing: [], borders: [], shadows: [], gradients: [] };
    }
  }

  // ─── Private: Tree Building ─────────────────────────────────────────────────

  private buildLayoutTree(elements: RawLayoutElement[], width: number, height: number): LayoutNode {
    const nodeMap = new Map<string, LayoutNode>();
    const orphans: LayoutNode[] = [];

    for (const el of elements) {
      const node = this.rawToLayoutNode(el, width, height);
      nodeMap.set(el.id, node);
    }

    for (const el of elements) {
      const node = nodeMap.get(el.id)!;
      if (el.parentId && nodeMap.has(el.parentId)) {
        const parent = nodeMap.get(el.parentId)!;
        node.parentId = el.parentId;
        parent.children.push(node);
      } else {
        orphans.push(node);
      }
    }

    if (orphans.length === 1) {
      return orphans[0];
    }

    const root: LayoutNode = {
      id: randomUUID(),
      type: 'page',
      bbox: { x: 0, y: 0, width, height },
      zIndex: 0,
      confidence: 1,
      children: orphans,
      parentId: null,
      style: this.defaultNodeStyle(),
      content: { kind: 'empty' } as EmptyContent,
      semanticRole: 'root',
      readingOrder: 0,
    };

    for (const child of orphans) {
      child.parentId = root.id;
    }

    return root;
  }

  private rawToLayoutNode(el: RawLayoutElement, pageWidth: number, pageHeight: number): LayoutNode {
    const content = this.buildNodeContent(el);
    const style = this.buildNodeStyle(el);

    return {
      id: el.id,
      type: el.type,
      bbox: el.bbox,
      zIndex: el.zIndex,
      confidence: el.confidence,
      children: [],
      parentId: el.parentId,
      style,
      content,
      semanticRole: el.semanticRole,
      readingOrder: el.readingOrder,
    };
  }

  private buildNodeContent(el: RawLayoutElement): LayoutNode['content'] {
    if (el.type === 'table' && el.headers) {
      const tableContent: TableContent = {
        kind: 'table',
        headers: (el.headers || []).map((h) => ({
          value: h,
          type: 'text' as const,
          font: null,
          color: null,
          backgroundColor: null,
          alignment: 'center' as const,
          verticalAlignment: 'middle' as const,
          colSpan: 1,
          rowSpan: 1,
        })),
        rows: (el.rows || []).map((row) =>
          row.map((cell) => ({
            value: cell,
            type: 'text' as const,
            font: null,
            color: null,
            backgroundColor: null,
            alignment: 'left' as const,
            verticalAlignment: 'middle' as const,
            colSpan: 1,
            rowSpan: 1,
          })),
        ),
        mergedCells: el.mergedCells || [],
        headerRows: 1,
        headerColumns: 0,
        columnWidths: el.headers ? el.headers.map(() => el.bbox.width / el.headers!.length) : [],
        rowHeights: [],
        borderStyle: 'full',
        alternateRowColor: null,
        headerStyle: {
          backgroundColor: '#f0f0f0',
          font: this.defaultFontToken(),
          color: '#000000',
        },
      };
      return tableContent;
    }

    if (el.type === 'chart' && el.chartType) {
      const chartContent: ChartContent = {
        kind: 'chart',
        chartType: el.chartType as ChartContent['chartType'],
        title: el.chartTitle || '',
        subtitle: null,
        xAxis: el.xAxis
          ? {
              label: String(el.xAxis.label || ''),
              type: 'category',
              min: null,
              max: null,
              tickCount: 0,
              tickValues: Array.isArray(el.xAxis.tickValues) ? el.xAxis.tickValues as string[] : [],
              format: null,
              rotation: 0,
            }
          : null,
        yAxis: el.yAxis
          ? {
              label: String(el.yAxis.label || ''),
              type: 'value',
              min: null,
              max: null,
              tickCount: 0,
              tickValues: [],
              format: null,
              rotation: 0,
            }
          : null,
        series: Array.isArray(el.series)
          ? (el.series as Array<Record<string, unknown>>).map((s) => ({
              name: String(s.name || ''),
              data: Array.isArray(s.data)
                ? (s.data as Array<Record<string, unknown>>).map((d) => ({
                    label: String(d.label || ''),
                    value: Number(d.value) || 0,
                  }))
                : [],
              type: el.chartType || 'bar',
              color: String(s.color || '#333'),
              stacked: false,
            }))
          : [],
        legend: null,
        colors: [],
        dataLabels: false,
        gridLines: true,
      };
      return chartContent;
    }

    if (el.type === 'kpi-card' && el.kpiLabel) {
      const kpiContent: KpiContent = {
        kind: 'kpi',
        label: el.kpiLabel || '',
        value: el.kpiValue || '',
        unit: '',
        trend: (el.kpiTrend === 'up' || el.kpiTrend === 'down' ? el.kpiTrend : 'neutral') as 'up' | 'down' | 'neutral',
        trendValue: el.kpiTrendValue || '',
        trendColor: el.kpiTrend === 'up' ? '#22c55e' : el.kpiTrend === 'down' ? '#ef4444' : '#6b7280',
        icon: null,
        sparkline: null,
      };
      return kpiContent;
    }

    if (el.text) {
      const textContent: TextContent = {
        kind: 'text',
        text: el.text,
        language: el.language || 'ar',
        direction: this.detectDirection(el.text),
        font: {
          id: randomUUID(),
          family: 'sans-serif',
          size: el.fontSize || 16,
          weight: el.fontWeight || 400,
          style: 'normal',
          lineHeight: 1.5,
          letterSpacing: 0,
          kerning: 0,
          usage: this.inferFontUsage(el.type, el.fontSize || 16),
          confidence: 0.7,
          fallbackFamilies: [],
        },
        color: el.color || '#000000',
        alignment: (el.alignment as TextContent['alignment']) || 'right',
        textDecoration: 'none',
        listType: el.type === 'list' ? 'bullet' : 'none',
        listLevel: 0,
      };
      return textContent;
    }

    if (el.type === 'image') {
      const imgContent: ImageContent = {
        kind: 'image',
        src: '',
        alt: el.semanticRole || 'image',
        objectFit: 'contain',
        naturalWidth: el.bbox.width,
        naturalHeight: el.bbox.height,
        format: 'png',
        isVector: false,
        vectorData: null,
      };
      return imgContent;
    }

    return { kind: 'empty' } as EmptyContent;
  }

  private buildNodeStyle(el: RawLayoutElement): NodeStyle {
    const zeroPad: Position = { top: 0, left: 0, right: 0, bottom: 0 };
    return {
      backgroundColor: el.backgroundColor || null,
      backgroundGradient: null,
      border: el.borderColor
        ? {
            id: randomUUID(),
            width: el.borderWidth || 1,
            style: 'solid',
            color: el.borderColor,
            radius: el.borderRadius || 0,
          }
        : null,
      shadow: el.shadow
        ? { id: randomUUID(), offsetX: 0, offsetY: 2, blur: 8, spread: 0, color: 'rgba(0,0,0,0.1)', inset: false }
        : null,
      opacity: el.opacity,
      borderRadius: el.borderRadius || 0,
      padding: el.padding || zeroPad,
      margin: zeroPad,
      overflow: 'visible',
      display: 'block',
      flexDirection: null,
      alignItems: null,
      justifyContent: null,
      gridTemplate: null,
    };
  }

  // ─── Private: Reading Order ─────────────────────────────────────────────────

  private computeReadingOrder(root: LayoutNode, direction: 'ltr' | 'rtl'): string[] {
    const nodes = this.flattenNodes(root);
    const textNodes = nodes.filter(
      (n) => n.content.kind === 'text' || n.content.kind === 'table' || n.content.kind === 'chart',
    );

    textNodes.sort((a, b) => {
      const rowDiff = Math.abs(a.bbox!.y - b.bbox!.y);
      if (rowDiff > 20) return a.bbox!.y - b.bbox!.y;
      return direction === 'rtl' ? b.bbox!.x - a.bbox!.x : a.bbox!.x - b.bbox!.x;
    });

    return textNodes.map((n) => n.id);
  }

  // ─── Private: Scene Graph ───────────────────────────────────────────────────

  private buildSceneGraph(root: LayoutNode): SceneGraph {
    const allNodes = this.flattenNodes(root);
    const layers = new Map<number, string[]>();

    for (const node of allNodes) {
      const z = node.zIndex ?? 0;
      if (!layers.has(z)) layers.set(z, []);
      layers.get(z)!.push(node.id);
    }

    const sceneLayers: SceneLayer[] = Array.from(layers.entries())
      .sort(([a], [b]) => a - b)
      .map(([z, ids]) => ({
        id: `layer_${z}`,
        name: `Layer ${z}`,
        zIndex: z,
        visible: true,
        opacity: 1,
        nodeIds: ids,
      }));

    const relationships: SceneRelationship[] = [];
    for (const node of allNodes) {
      for (const child of node.children) {
        relationships.push({ sourceId: node.id, targetId: child.id, type: 'contains' });
      }

      for (const other of allNodes) {
        if (other.id === node.id) continue;
        if (node.bbox && other.bbox && this.isHorizontallyAdjacent(node.bbox, other.bbox)) {
          relationships.push({ sourceId: node.id, targetId: other.id, type: 'adjacent-horizontal' });
        }
      }
    }

    return { layers: sceneLayers, relationships };
  }

  // ─── Private: Design Token Merging ──────────────────────────────────────────

  private mergeDesignTokens(raw: DesignTokensRaw, fontResult: FontRecognitionResult | null): DesignTokens {
    const colors: ColorToken[] = (raw.colors || []).map((c: Record<string, unknown>, i: number) => ({
      id: `color_${i}`,
      name: String(c.name || `color_${i}`),
      hex: String(c.hex || '#000000'),
      rgba: this.hexToRgba(String(c.hex || '#000000')),
      usage: (c.usage || 'text') as ColorToken['usage'],
      frequency: Number(c.frequency) || 0.1,
    }));

    const fonts: FontToken[] = fontResult
      ? fontResult.detectedFonts.map((f, i) => ({
          id: `font_${i}`,
          family: f.family,
          size: f.size,
          weight: f.weight,
          style: f.style,
          lineHeight: f.lineHeight,
          letterSpacing: f.letterSpacing,
          kerning: 0,
          usage: fontResult.typographyHierarchy[i]?.role || 'body' as FontToken['usage'],
          confidence: f.confidence,
          fallbackFamilies: f.alternatives.map((a) => a.family),
        }))
      : (raw.fonts || []).map((f: Record<string, unknown>, i: number) => ({
          id: `font_${i}`,
          family: String(f.family || 'sans-serif'),
          size: Number(f.size) || 16,
          weight: Number(f.weight) || 400,
          style: 'normal' as const,
          lineHeight: 1.5,
          letterSpacing: 0,
          kerning: 0,
          usage: (f.usage || 'body') as FontToken['usage'],
          confidence: 0.6,
          fallbackFamilies: [],
        }));

    const spacing: SpacingToken[] = (raw.spacing || []).map((s: Record<string, unknown>, i: number) => ({
      id: `spacing_${i}`,
      value: Number(s.value) || 8,
      unit: 'px' as const,
      direction: (s.direction || 'all') as SpacingToken['direction'],
      usage: (s.usage || 'gap') as SpacingToken['usage'],
    }));

    return {
      colors,
      fonts,
      spacing,
      borders: (raw.borders || []).map((b: Record<string, unknown>, i: number) => ({
        id: `border_${i}`,
        width: Number(b.width) || 1,
        style: (b.style || 'solid') as 'solid',
        color: String(b.color || '#e0e0e0'),
        radius: Number(b.radius) || 0,
      })),
      shadows: (raw.shadows || []).map((s: Record<string, unknown>, i: number) => ({
        id: `shadow_${i}`,
        offsetX: Number(s.offsetX) || 0,
        offsetY: Number(s.offsetY) || 2,
        blur: Number(s.blur) || 8,
        spread: Number(s.spread) || 0,
        color: String(s.color || 'rgba(0,0,0,0.1)'),
        inset: false,
      })),
      gradients: (raw.gradients || []).map((g: Record<string, unknown>, i: number) => ({
        id: `gradient_${i}`,
        type: (g.type || 'linear') as 'linear',
        angle: Number(g.angle) || 0,
        stops: Array.isArray(g.stops)
          ? (g.stops as Array<Record<string, unknown>>).map((s) => ({
              color: String(s.color || '#000'),
              position: Number(s.position) || 0,
            }))
          : [],
      })),
    };
  }

  private mergeDesignTokenSets(a: DesignTokens, b: DesignTokens): DesignTokens {
    const uniqueColors = new Map<string, ColorToken>();
    for (const c of [...a.colors, ...b.colors]) {
      if (!uniqueColors.has(c.hex)) uniqueColors.set(c.hex, c);
    }
    return {
      colors: Array.from(uniqueColors.values()),
      fonts: [...a.fonts, ...b.fonts],
      spacing: a.spacing.length >= b.spacing.length ? a.spacing : b.spacing,
      borders: a.borders.length >= b.borders.length ? a.borders : b.borders,
      shadows: a.shadows.length >= b.shadows.length ? a.shadows : b.shadows,
      gradients: [...a.gradients, ...b.gradients],
    };
  }

  // ─── Private: Persistence ───────────────────────────────────────────────────

  private async persistLayoutGraph(sourceId: string, graph: CanonicalLayoutGraph): Promise<void> {
    try {
      await this.prisma.aiQuery.create({
        data: {
          id: graph.id,
          sessionId: sourceId,
          query: `layout_analysis:${graph.sourceType}`,
          response: JSON.stringify(graph),
          model: 'gpt-4o',
          tokensUsed: 0,
          processingTimeMs: graph.processingTimeMs,
          status: 'COMPLETED',
        },
      });
    } catch (err) {
      logger.warn('Failed to persist layout graph', { sourceId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ─── Private: Utilities ─────────────────────────────────────────────────────

  private flattenNodes(node: LayoutNode): LayoutNode[] {
    const result: LayoutNode[] = [node];
    for (const child of node.children) {
      result.push(...this.flattenNodes(child));
    }
    return result;
  }

  private countWords(node: LayoutNode): number {
    let count = 0;
    if (node.content.kind === 'text') {
      count += node.content.text.split(/\s+/).filter(Boolean).length;
    }
    for (const child of node.children) {
      count += this.countWords(child);
    }
    return count;
  }

  private countNodesByType(node: LayoutNode, type: LayoutNodeType): number {
    let count = node.type === type ? 1 : 0;
    for (const child of node.children) {
      count += this.countNodesByType(child, type);
    }
    return count;
  }

  private getNodeConfidence(node: LayoutNode): number {
    return node.confidence;
  }

  private parseBbox(raw: unknown, pageWidth: number, pageHeight: number): BoundingBox {
    if (!raw || typeof raw !== 'object') return { x: 0, y: 0, width: pageWidth, height: pageHeight };
    const r = raw as Record<string, unknown>;
    return {
      x: Math.max(0, Number(r.x) || 0),
      y: Math.max(0, Number(r.y) || 0),
      width: Math.max(1, Number(r.width) || pageWidth),
      height: Math.max(1, Number(r.height) || pageHeight),
    };
  }

  private detectDirection(text: string): 'ltr' | 'rtl' | 'auto' {
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
    const latinPattern = /[a-zA-Z]/;
    const arabicCount = (text.match(new RegExp(arabicPattern.source, 'g')) || []).length;
    const latinCount = (text.match(new RegExp(latinPattern.source, 'g')) || []).length;
    if (arabicCount > latinCount) return 'rtl';
    if (latinCount > arabicCount) return 'ltr';
    return 'auto';
  }

  private inferFontUsage(type: LayoutNodeType, fontSize: number): FontToken['usage'] {
    if (type === 'heading') return fontSize > 24 ? 'heading' : 'subheading';
    if (type === 'caption' || type === 'footer') return 'caption';
    if (type === 'label' || type === 'filter') return 'label';
    if (type === 'kpi-card') return 'data';
    return 'body';
  }

  private isHorizontallyAdjacent(a: BoundingBox, b: BoundingBox): boolean {
    const verticalOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    if (verticalOverlap < Math.min(a.height, b.height) * 0.3) return false;
    const gap = Math.abs((a.x + a.width) - b.x);
    return gap < 50;
  }

  private hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
    const clean = hex.replace('#', '');
    if (clean.length < 6) return { r: 0, g: 0, b: 0, a: 1 };
    return {
      r: parseInt(clean.substring(0, 2), 16) || 0,
      g: parseInt(clean.substring(2, 4), 16) || 0,
      b: parseInt(clean.substring(4, 6), 16) || 0,
      a: 1,
    };
  }

  private computeHash(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private defaultFont(): DetectedFont {
    return {
      family: 'sans-serif',
      weight: 400,
      style: 'normal',
      size: 16,
      lineHeight: 1.5,
      letterSpacing: 0,
      confidence: 0.5,
      sampleText: '',
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      alternatives: [],
      isArabic: false,
      openTypeFeatures: [],
    };
  }

  private defaultFontToken(): FontToken {
    return {
      id: randomUUID(),
      family: 'sans-serif',
      size: 14,
      weight: 600,
      style: 'normal',
      lineHeight: 1.4,
      letterSpacing: 0,
      kerning: 0,
      usage: 'label',
      confidence: 0.5,
      fallbackFamilies: [],
    };
  }

  private defaultNodeStyle(): NodeStyle {
    const zero: Position = { top: 0, left: 0, right: 0, bottom: 0 };
    return {
      backgroundColor: null,
      backgroundGradient: null,
      border: null,
      shadow: null,
      opacity: 1,
      borderRadius: 0,
      padding: zero,
      margin: zero,
      overflow: 'visible',
      display: 'block',
      flexDirection: null,
      alignItems: null,
      justifyContent: null,
      gridTemplate: null,
    };
  }

  private createEmptyNode(): LayoutNode {
    return {
      id: randomUUID(),
      type: 'page',
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      zIndex: 0,
      confidence: 0,
      children: [],
      parentId: null,
      style: this.defaultNodeStyle(),
      content: { kind: 'empty' } as EmptyContent,
      semanticRole: 'empty',
      readingOrder: 0,
    };
  }
}

// ─── Internal Types ─────────────────────────────────────────────────────────

interface RawLayoutElement {
  id: string;
  type: LayoutNodeType;
  bbox: BoundingBox;
  zIndex: number;
  confidence: number;
  parentId: string | null;
  semanticRole: string;
  readingOrder: number;
  text: string | null;
  language: string | null;
  fontSize: number | null;
  fontWeight: number | null;
  alignment: string | null;
  color: string | null;
  backgroundColor: string | null;
  borderColor: string | null;
  borderWidth: number | null;
  borderRadius: number | null;
  shadow: boolean;
  opacity: number;
  padding: Position | null;
  headers: string[] | null;
  rows: string[][] | null;
  mergedCells: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }> | null;
  chartType: string | null;
  chartTitle: string | null;
  series: unknown[] | null;
  xAxis: Record<string, unknown> | null;
  yAxis: Record<string, unknown> | null;
  kpiLabel: string | null;
  kpiValue: string | null;
  kpiTrend: string | null;
  kpiTrendValue: string | null;
}

interface DesignTokensRaw {
  backgroundColor: string;
  colors: Record<string, unknown>[];
  fonts: Record<string, unknown>[];
  spacing: Record<string, unknown>[];
  borders: Record<string, unknown>[];
  shadows: Record<string, unknown>[];
  gradients: Record<string, unknown>[];
}
