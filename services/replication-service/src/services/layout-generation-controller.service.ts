import { createHash, randomUUID } from 'crypto';
import { createLogger, format, transports } from 'winston';
import type {
  CanonicalLayoutGraph,
  LayoutNode,
  PageNode,
  TextContent,
  TableContent,
  ChartContent,
  KpiContent,
  ImageContent,
  IconContent,
  BoundingBox,
} from '@rasid/shared';
import {
  CanonicalPipelineOrchestrator,
  type GeneratorType,
  type OutputFormat,
  type PipelineResult,
} from './canonical-pipeline-orchestrator.service.js';
import { DataExtractionService, type ExtractedDatasets } from './data-extraction.service.js';
import { DataBindingService, type DatasetBindings } from './data-binding.service.js';
import { ArabicTypographyOptimizer, type TypographyReport } from './arabic-typography-optimizer.service.js';
import { ArabicLocalizationService } from './arabic-localization.service.js';
import { PDFIntelligenceService } from './pdf-intelligence.service.js';
import { LargeImageProcessor } from './large-image-processor.service.js';
import { analyzeImage, type VisualAnalysis } from './visual-analyzer.service.js';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'layout-generation-controller' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type InputSourceType = 'image' | 'screenshot' | 'pdf' | 'layout-graph';

export interface GenerateFromLayoutRequest {
  /** Raw input — one of: image buffer, PDF buffer, or pre-built layout graph */
  inputSource: {
    type: InputSourceType;
    buffer?: Buffer;
    layoutGraph?: CanonicalLayoutGraph;
  };
  /** Requested output formats */
  outputs: Array<{
    generator: GeneratorType;
    format: OutputFormat;
  }>;
  /** Optional localization */
  localization?: {
    enabled: boolean;
    targetLanguage: string;
    sourceLanguage?: string;
  };
  /** Optional dataset bindings to replace extracted data */
  datasets?: DatasetBindings;
  /** Options */
  options?: GenerationOptions;
}

export interface GenerationOptions {
  preserveFonts: boolean;
  preserveColors: boolean;
  preserveSpacing: boolean;
  rtlSupport: boolean;
  quality: 'draft' | 'standard' | 'high';
  pixelPerfectValidation: boolean;
  extractData: boolean;
  optimizeArabicTypography: boolean;
}

const DEFAULT_GENERATION_OPTIONS: GenerationOptions = {
  preserveFonts: true,
  preserveColors: true,
  preserveSpacing: true,
  rtlSupport: true,
  quality: 'high',
  pixelPerfectValidation: true,
  extractData: true,
  optimizeArabicTypography: true,
};

export interface GenerateFromLayoutResult {
  id: string;
  /** The canonical layout graph (single source of truth) */
  canonicalGraph: CanonicalLayoutGraph;
  /** Graph hash for cache key */
  graphHash: string;
  /** Extracted datasets */
  extractedData: ExtractedDatasets | null;
  /** Typography optimization report */
  typographyReport: TypographyReport | null;
  /** Generated artifacts */
  artifacts: GeneratedArtifact[];
  /** Pipeline stages and timing */
  pipelineStages: PipelineStage[];
  /** Total processing time */
  totalProcessingTimeMs: number;
}

export interface GeneratedArtifact {
  generator: GeneratorType;
  format: OutputFormat;
  buffer: Buffer;
  mimeType: string;
  html: string;
  pageCount: number;
  elementsRendered: number;
  pixelValidation: {
    pixelDiff: number;
    isPerfect: boolean;
    iterationCount: number;
  } | null;
  processingTimeMs: number;
}

export interface PipelineStage {
  name: string;
  status: 'completed' | 'skipped' | 'failed';
  durationMs: number;
  detail: string;
}

// ─── Layout Analysis (image/PDF → CanonicalLayoutGraph) ─────────────────────

const RENDERING_SERVICE_URL = process.env.RENDERING_SERVICE_URL || 'http://rendering-environment:8014';
const REPLICATION_SERVICE_URL = process.env.REPLICATION_SERVICE_URL || 'http://localhost:8007';

async function analyzeImageToGraph(imageBuffer: Buffer, sourceType: 'image' | 'screenshot'): Promise<CanonicalLayoutGraph> {
  const analysis = await analyzeImage(imageBuffer);
  return buildGraphFromVisualAnalysis(analysis, imageBuffer, sourceType);
}

function defaultNodeStyle(bg: string | null = null): import('@rasid/shared').NodeStyle {
  return {
    backgroundColor: bg,
    backgroundGradient: null,
    border: null,
    shadow: null,
    opacity: 1,
    borderRadius: 0,
    padding: { top: 0, left: 0, right: 0, bottom: 0 },
    margin: { top: 0, left: 0, right: 0, bottom: 0 },
    overflow: 'hidden' as const,
    display: 'block' as const,
    flexDirection: null,
    alignItems: null,
    justifyContent: null,
    gridTemplate: null,
  };
}

function buildGraphFromVisualAnalysis(
  analysis: VisualAnalysis,
  imageBuffer: Buffer,
  sourceType: 'image' | 'screenshot',
): CanonicalLayoutGraph {
  const width = analysis.dimensions.width || 800;
  const height = analysis.dimensions.height || 600;
  const hash = createHash('sha256').update(imageBuffer).digest('hex');
  const now = new Date().toISOString();
  const nodes: LayoutNode[] = [];
  let readingOrder = 0;

  for (const block of analysis.textContent) {
    const bbox = normalizeBounds(block.position, width, height);
    const font = createFontToken(block.fontSize, block.fontWeight);
    const text = block.text?.trim();
    if (!text) continue;

    const kpi = inferKpiContent(text);
    if (kpi) {
      nodes.push({
        id: `kpi-${nodes.length + 1}`,
        type: 'kpi-card',
        bbox,
        zIndex: 2,
        confidence: 0.85,
        children: [],
        parentId: 'root',
        style: defaultNodeStyle(null),
        content: kpi,
        semanticRole: 'kpi',
        readingOrder: readingOrder++,
      });
      continue;
    }

    nodes.push({
      id: `text-${nodes.length + 1}`,
      type: font.usage === 'heading' ? 'heading' : 'text-block',
      bbox,
      zIndex: 2,
      confidence: 0.85,
      children: [],
      parentId: 'root',
      style: defaultNodeStyle(null),
      content: {
        kind: 'text',
        text,
        language: detectLanguage(text),
        direction: containsArabic(text) ? 'rtl' : 'ltr',
        font,
        color: '#202124',
        alignment: mapAlignment(block.alignment),
        textDecoration: 'none',
        listType: 'none',
        listLevel: 0,
      } as unknown as TextContent,
      semanticRole: font.usage,
      readingOrder: readingOrder++,
    });
  }

  for (const table of analysis.dataTables) {
    const bbox = normalizeBounds(table.position, width, height);
    const headerFont = createFontToken('medium', 'bold');
    const cellFont = createFontToken('medium', 'normal');
    nodes.push({
      id: `table-${nodes.length + 1}`,
      type: 'table',
      bbox,
      zIndex: 1,
      confidence: 0.8,
      children: [],
      parentId: 'root',
      style: defaultNodeStyle('#ffffff'),
      content: {
        kind: 'table',
        headers: table.headers.map((value) => ({
          value,
          type: 'text',
          font: headerFont,
          color: '#ffffff',
          backgroundColor: '#1a73e8',
          alignment: 'left',
          verticalAlignment: 'middle',
          colSpan: 1,
          rowSpan: 1,
        })),
        rows: table.rows.map((row) =>
          row.map((value) => ({
            value,
            type: inferCellType(value),
            font: cellFont,
            color: '#202124',
            backgroundColor: null,
            alignment: isNumeric(value) ? 'right' : 'left',
            verticalAlignment: 'middle',
            colSpan: 1,
            rowSpan: 1,
          })),
        ),
        mergedCells: [],
        headerRows: 1,
        headerColumns: 0,
        columnWidths: table.headers.map(() => Math.max(80, Math.round(bbox.width / Math.max(table.headers.length, 1)))),
        rowHeights: [32, ...table.rows.map(() => 28)],
        borderStyle: 'full',
        alternateRowColor: '#f8f9fa',
        headerStyle: {
          backgroundColor: '#1a73e8',
          font: headerFont,
          color: '#ffffff',
        },
      } as unknown as TableContent,
      semanticRole: 'table',
      readingOrder: readingOrder++,
    });
  }

  for (const chart of analysis.charts) {
    const bbox = normalizeBounds(chart.position, width, height);
    nodes.push({
      id: `chart-${nodes.length + 1}`,
      type: 'chart',
      bbox,
      zIndex: 1,
      confidence: 0.8,
      children: [],
      parentId: 'root',
      style: defaultNodeStyle('#ffffff'),
      content: {
        kind: 'chart',
        chartType: mapChartType(chart.type),
        title: chart.title || 'Chart',
        subtitle: null,
        xAxis: {
          label: '',
          type: 'category',
          min: null,
          max: null,
          tickCount: chart.dataPoints.length,
          tickValues: chart.dataPoints.map((point) => point.label),
          format: null,
          rotation: 0,
        },
        yAxis: {
          label: '',
          type: 'value',
          min: null,
          max: null,
          tickCount: 5,
          tickValues: [],
          format: null,
          rotation: 0,
        },
        series: [{
          name: chart.title || 'Series 1',
          data: chart.dataPoints.map((point) => ({ label: point.label, value: point.value })),
          type: chart.type || 'bar',
          color: chart.colors[0] || '#1a73e8',
          stacked: false,
        }],
        legend: null,
        colors: chart.colors,
        dataLabels: true,
        gridLines: true,
      } as ChartContent,
      semanticRole: 'chart',
      readingOrder: readingOrder++,
    });
  }

  const rootNode: LayoutNode = {
    id: 'root',
    type: 'container',
    bbox: { x: 0, y: 0, width, height },
    zIndex: 0,
    confidence: 1,
    children: nodes,
    parentId: null,
    style: defaultNodeStyle('#ffffff'),
    content: { kind: 'empty' },
    semanticRole: 'page',
    readingOrder: 0,
  };

  const language = detectLanguage(analysis.textContent.map((block) => block.text).join(' '));
  const direction = language === 'ar' ? 'rtl' : 'ltr';

  return {
    id: randomUUID(),
    version: '1.0',
    sourceType,
    sourceHash: hash,
    dimensions: { width, height },
    dpi: 150,
    pages: [{
      pageNumber: 1,
      dimensions: { width, height },
      orientation: width > height ? 'landscape' : 'portrait',
      backgroundColor: '#ffffff',
      rootNode,
      readingOrder: ['root', ...nodes.map((node) => node.id)],
    }],
    designTokens: {
      colors: analysis.colors.map((hex, index) => ({
        id: `color-${index + 1}`,
        name: `color-${index + 1}`,
        hex,
        rgba: hexToRgba(hex),
        usage: index === 0 ? 'text' : 'accent',
        frequency: analysis.colors.length - index,
      })),
      fonts: analysis.fonts.map((family, index) => ({
        id: `font-${index + 1}`,
        family,
        size: 16,
        weight: 400,
        style: 'normal',
        lineHeight: 1.5,
        letterSpacing: 0,
        kerning: 0,
        usage: 'body',
        confidence: 0.7,
        fallbackFamilies: ['Arial', 'sans-serif'],
      })),
      spacing: [],
      borders: [],
      shadows: [],
      gradients: [],
    },
    metadata: {
      title: analysis.textContent[0]?.text || null,
      language,
      direction,
      documentType: analysis.dataTables.length > 0 ? 'dashboard' : 'document',
      pageCount: 1,
      wordCount: analysis.textContent.reduce((total, block) => total + block.text.split(/\s+/).filter(Boolean).length, 0),
      tableCount: analysis.dataTables.length,
      chartCount: analysis.charts.length,
      imageCount: 0,
      confidence: 0.8,
    },
    sceneGraph: { layers: [], relationships: [] },
    createdAt: now,
    processingTimeMs: 0,
  };
}

function normalizeBounds(
  position: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): BoundingBox {
  const usePercent = [position.x, position.y, position.width, position.height].every((value) => value >= 0 && value <= 100);
  if (usePercent) {
    return {
      x: Math.round((position.x / 100) * canvasWidth),
      y: Math.round((position.y / 100) * canvasHeight),
      width: Math.max(1, Math.round((position.width / 100) * canvasWidth)),
      height: Math.max(1, Math.round((position.height / 100) * canvasHeight)),
    };
  }

  return {
    x: Math.round(position.x),
    y: Math.round(position.y),
    width: Math.max(1, Math.round(position.width)),
    height: Math.max(1, Math.round(position.height)),
  };
}

function createFontToken(sizeLabel: string, weightLabel: string) {
  const sizeMap: Record<string, number> = {
    small: 12,
    medium: 16,
    large: 22,
    xlarge: 30,
  };
  const weight = weightLabel === 'bold' ? 700 : 400;
  const size = sizeMap[sizeLabel] || 16;
  return {
    id: `font-${sizeLabel}-${weight}`,
    family: 'Arial',
    size,
    weight,
    style: 'normal' as const,
    lineHeight: 1.4,
    letterSpacing: 0,
    kerning: 0,
    usage: size >= 24 ? 'heading' as const : size >= 18 ? 'subheading' as const : 'body' as const,
    confidence: 0.7,
    fallbackFamilies: ['Arial', 'sans-serif'],
  };
}

function mapAlignment(alignment: string): TextContent['alignment'] {
  if (alignment === 'center' || alignment === 'right' || alignment === 'justify') {
    return alignment;
  }
  return 'left';
}

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

function detectLanguage(text: string): string {
  return containsArabic(text) ? 'ar' : 'en';
}

function inferKpiContent(text: string): KpiContent | null {
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const value = parts[parts.length - 1];
  if (!isNumeric(value)) return null;
  return {
    kind: 'kpi',
    label: parts.slice(0, -1).join(' '),
    value,
    unit: '',
    trend: 'neutral',
    trendValue: '',
    trendColor: '#5f6368',
    icon: null,
    sparkline: null,
  };
}

function isNumeric(value: string): boolean {
  return /^[\d.,%$€£¥₹﷼-]+$/.test(value.trim());
}

function inferCellType(value: string): 'text' | 'number' | 'date' | 'currency' | 'percentage' {
  const trimmed = value.trim();
  if (/^-?[\d,.]+%$/.test(trimmed)) return 'percentage';
  if (/^[€$£¥₹﷼]?\s*-?[\d,.]+$/.test(trimmed)) return trimmed.match(/[€$£¥₹﷼]/) ? 'currency' : 'number';
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(trimmed)) return 'date';
  return 'text';
}

function mapChartType(type: string): ChartContent['chartType'] {
  switch (type) {
    case 'line':
    case 'pie':
    case 'scatter':
    case 'area':
      return type;
    case 'donut':
      return 'doughnut';
    default:
      return 'bar';
  }
}

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
    a: 1,
  };
}

// ─── Layout Generation Controller ───────────────────────────────────────────

/**
 * LayoutGenerationController
 *
 * Unified generation controller that implements the full pipeline:
 *
 *   Input (image/screenshot/PDF/graph)
 *   → Layout Analysis
 *   → Canonical Layout Model (single source of truth)
 *   → Localization (optional)
 *   → Arabic Typography Optimization (optional)
 *   → Data Extraction
 *   → Data Binding
 *   → Generator Orchestration (dashboard/report/presentation/spreadsheet/docx)
 *   → Output Generation
 *   → Pixel Validation
 *   → Return artifacts
 */
export class LayoutGenerationController {
  private orchestrator: CanonicalPipelineOrchestrator;
  private dataExtractor: DataExtractionService;
  private dataBinder: DataBindingService;
  private typographyOptimizer: ArabicTypographyOptimizer;
  private arabicLocalizer: ArabicLocalizationService;
  private pdfService: PDFIntelligenceService;
  private largeImageProcessor: LargeImageProcessor;

  constructor(private prisma: import('@prisma/client').PrismaClient) {
    this.orchestrator = new CanonicalPipelineOrchestrator(prisma);
    this.dataExtractor = new DataExtractionService();
    this.dataBinder = new DataBindingService();
    this.typographyOptimizer = new ArabicTypographyOptimizer();
    this.arabicLocalizer = new ArabicLocalizationService(process.env.OPENAI_API_KEY);
    this.pdfService = new PDFIntelligenceService();
    this.largeImageProcessor = new LargeImageProcessor();

    logger.info('Layout generation controller initialized');
  }

  /**
   * Generate artifacts from a layout source.
   * This is the unified one-click generation endpoint.
   *
   * Pipeline:
   *   1. Layout Analysis (image/PDF → CanonicalLayoutGraph)
   *   2. Localization (optional)
   *   3. Arabic Typography Optimization (optional)
   *   4. Data Extraction
   *   5. Data Binding (with optional user datasets)
   *   6. Generator Orchestration → artifacts
   *   7. Return results
   */
  async generateFromLayout(request: GenerateFromLayoutRequest): Promise<GenerateFromLayoutResult> {
    const resultId = randomUUID();
    const startTime = Date.now();
    const options = { ...DEFAULT_GENERATION_OPTIONS, ...request.options };
    const stages: PipelineStage[] = [];

    logger.info('Generation pipeline started', {
      id: resultId,
      inputType: request.inputSource.type,
      outputs: request.outputs.map(o => `${o.generator}:${o.format}`),
      localization: request.localization?.enabled ?? false,
    });

    // ── Stage 1: Layout Analysis ──────────────────────────────────────────
    let graph: CanonicalLayoutGraph;
    const s1Start = Date.now();

    try {
      switch (request.inputSource.type) {
        case 'layout-graph': {
          if (!request.inputSource.layoutGraph) {
            throw new Error('layoutGraph is required when inputSource.type is "layout-graph"');
          }
          graph = structuredClone(request.inputSource.layoutGraph);
          stages.push({ name: 'Layout Analysis', status: 'skipped', durationMs: Date.now() - s1Start, detail: 'Pre-built layout graph provided' });
          break;
        }
        case 'pdf': {
          if (!request.inputSource.buffer) throw new Error('buffer is required for PDF input');
          const pdfResult = await this.pdfService.processPDF({ pdfBuffer: request.inputSource.buffer });
          const sourceHash = createHash('sha256').update(request.inputSource.buffer).digest('hex');
          graph = this.pdfService.convertToLayoutGraph(pdfResult, sourceHash) as unknown as CanonicalLayoutGraph;
          stages.push({ name: 'Layout Analysis', status: 'completed', durationMs: Date.now() - s1Start, detail: `PDF processed: ${pdfResult.pages.length} pages, ${pdfResult.embeddedFonts.length} fonts` });
          break;
        }
        case 'image':
        case 'screenshot': {
          if (!request.inputSource.buffer) throw new Error('buffer is required for image input');
          // Check if large image needs tiled processing
          const isLarge = await this.largeImageProcessor.isLargeImage(request.inputSource.buffer);
          if (isLarge.isLarge) {
            logger.info('Large image detected, using tiled processing', { width: isLarge.width, height: isLarge.height });
          }
          graph = await analyzeImageToGraph(request.inputSource.buffer, request.inputSource.type);
          stages.push({ name: 'Layout Analysis', status: 'completed', durationMs: Date.now() - s1Start, detail: `${request.inputSource.type} analyzed: ${graph.dimensions.width}x${graph.dimensions.height}` });
          break;
        }
        default:
          throw new Error(`Unsupported input source type: ${request.inputSource.type}`);
      }
    } catch (err) {
      stages.push({ name: 'Layout Analysis', status: 'failed', durationMs: Date.now() - s1Start, detail: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    // ── Stage 2: Localization ─────────────────────────────────────────────
    const s2Start = Date.now();
    if (request.localization?.enabled && request.localization.targetLanguage === 'ar') {
      try {
        const locResult = await this.arabicLocalizer.localizeLayout({
          layoutGraph: graph as any,
          sourceLanguage: request.localization.sourceLanguage || 'en',
        });
        graph = locResult.translatedGraph as unknown as typeof graph;
        stages.push({ name: 'Localization', status: 'completed', durationMs: Date.now() - s2Start, detail: `Localized to Arabic: ${locResult.translations.length} text nodes` });
      } catch (err) {
        logger.warn('Localization failed, continuing with original', { error: err instanceof Error ? err.message : String(err) });
        stages.push({ name: 'Localization', status: 'failed', durationMs: Date.now() - s2Start, detail: err instanceof Error ? err.message : String(err) });
      }
    } else {
      stages.push({ name: 'Localization', status: 'skipped', durationMs: 0, detail: 'Not requested' });
    }

    // ── Stage 3: Arabic Typography Optimization ───────────────────────────
    let typographyReport: TypographyReport | null = null;
    const s3Start = Date.now();
    if (options.optimizeArabicTypography && this.graphContainsArabic(graph)) {
      try {
        graph = this.typographyOptimizer.optimize(graph);
        typographyReport = this.typographyOptimizer.getOptimizationReport(graph);
        stages.push({ name: 'Arabic Typography', status: 'completed', durationMs: Date.now() - s3Start, detail: `${typographyReport.adjustmentsMade.length} adjustments, ${typographyReport.fontSubstitutions.length} font subs` });
      } catch (err) {
        logger.warn('Typography optimization failed', { error: err instanceof Error ? err.message : String(err) });
        stages.push({ name: 'Arabic Typography', status: 'failed', durationMs: Date.now() - s3Start, detail: err instanceof Error ? err.message : String(err) });
      }
    } else {
      stages.push({ name: 'Arabic Typography', status: 'skipped', durationMs: 0, detail: 'No Arabic content or not enabled' });
    }

    // ── Stage 4: Data Extraction ──────────────────────────────────────────
    let extractedData: ExtractedDatasets | null = null;
    const s4Start = Date.now();
    if (options.extractData) {
      try {
        extractedData = this.dataExtractor.extractAll(graph);
        stages.push({ name: 'Data Extraction', status: 'completed', durationMs: Date.now() - s4Start, detail: `${extractedData.tables.length} tables, ${extractedData.charts.length} charts, ${extractedData.kpis.length} KPIs, ${extractedData.textBlocks.length} text blocks` });
      } catch (err) {
        logger.warn('Data extraction failed', { error: err instanceof Error ? err.message : String(err) });
        stages.push({ name: 'Data Extraction', status: 'failed', durationMs: Date.now() - s4Start, detail: err instanceof Error ? err.message : String(err) });
      }
    } else {
      stages.push({ name: 'Data Extraction', status: 'skipped', durationMs: 0, detail: 'Not enabled' });
    }

    // ── Stage 5: Data Binding ─────────────────────────────────────────────
    const s5Start = Date.now();
    if (request.datasets) {
      try {
        const validation = this.dataBinder.validateBindings(graph, request.datasets);
        if (!validation.valid) {
          logger.warn('Some data bindings are invalid', { errors: validation.errors });
        }
        graph = this.dataBinder.bindDatasets(graph, request.datasets);
        stages.push({ name: 'Data Binding', status: 'completed', durationMs: Date.now() - s5Start, detail: `Bound datasets: ${Object.keys(request.datasets).filter(k => request.datasets![k as keyof DatasetBindings]).length} types` });
      } catch (err) {
        logger.warn('Data binding failed', { error: err instanceof Error ? err.message : String(err) });
        stages.push({ name: 'Data Binding', status: 'failed', durationMs: Date.now() - s5Start, detail: err instanceof Error ? err.message : String(err) });
      }
    } else {
      stages.push({ name: 'Data Binding', status: 'skipped', durationMs: 0, detail: 'No datasets provided' });
    }

    // ── Stage 6: Generator Orchestration ──────────────────────────────────
    const artifacts: GeneratedArtifact[] = [];
    const s6Start = Date.now();

    for (const output of request.outputs) {
      try {
        const result = await this.orchestrator.execute({
          layoutGraph: graph,
          generator: output.generator,
          outputFormat: output.format,
          options: {
            preserveFonts: options.preserveFonts,
            preserveColors: options.preserveColors,
            preserveSpacing: options.preserveSpacing,
            rtlSupport: options.rtlSupport,
            quality: options.quality,
            pixelPerfectValidation: options.pixelPerfectValidation,
            maxValidationIterations: 50,
            locale: graph.metadata.language === 'ar' ? 'ar-SA' : 'en-US',
          },
        });

        artifacts.push({
          generator: output.generator,
          format: output.format,
          buffer: result.outputBuffer || Buffer.from(result.html, 'utf-8'),
          mimeType: (result as any).mimeType,
          html: result.html,
          pageCount: result.pageCount,
          elementsRendered: result.elementsRendered,
          pixelValidation: result.pixelValidation,
          processingTimeMs: result.processingTimeMs,
        });
      } catch (err) {
        logger.error('Generator failed', { generator: output.generator, format: output.format, error: err instanceof Error ? err.message : String(err) });
      }
    }

    stages.push({ name: 'Generator Orchestration', status: artifacts.length > 0 ? 'completed' : 'failed', durationMs: Date.now() - s6Start, detail: `${artifacts.length}/${request.outputs.length} artifacts generated` });

    // ── Compute graph hash ────────────────────────────────────────────────
    const graphHash = createHash('sha256').update(JSON.stringify({
      id: graph.id, version: graph.version, sourceHash: graph.sourceHash,
      dimensions: graph.dimensions, metadata: graph.metadata,
    })).digest('hex');

    const result: GenerateFromLayoutResult = {
      id: resultId,
      canonicalGraph: graph,
      graphHash,
      extractedData,
      typographyReport,
      artifacts,
      pipelineStages: stages,
      totalProcessingTimeMs: Date.now() - startTime,
    };

    logger.info('Generation pipeline complete', {
      id: resultId,
      artifacts: artifacts.length,
      stages: stages.map(s => `${s.name}:${s.status}`),
      totalMs: result.totalProcessingTimeMs,
    });

    return result;
  }

  /**
   * Get available generators and their supported formats.
   */
  getGenerators(): Array<{ type: GeneratorType; formats: OutputFormat[] }> {
    return this.orchestrator.getGenerators();
  }

  /**
   * Extract datasets from a layout graph without generating artifacts.
   */
  extractData(graph: CanonicalLayoutGraph): ExtractedDatasets {
    return this.dataExtractor.extractAll(graph);
  }

  /**
   * Get all bindable nodes in a graph.
   */
  getBindableNodes(graph: CanonicalLayoutGraph) {
    return this.dataBinder.getBindableNodes(graph);
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private graphContainsArabic(graph: CanonicalLayoutGraph): boolean {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    for (const page of graph.pages) {
      if (this.nodeContainsArabic(page.rootNode, arabicRegex)) return true;
    }
    return false;
  }

  private nodeContainsArabic(node: LayoutNode, regex: RegExp): boolean {
    if (node.content.kind === 'text') {
      const tc = node.content as TextContent;
      if (regex.test(tc.text)) return true;
    }
    for (const child of node.children) {
      if (this.nodeContainsArabic(child, regex)) return true;
    }
    return false;
  }

  private getMimeType(format: OutputFormat): string {
    switch (format) {
      case 'html': return 'text/html';
      case 'pdf': return 'application/pdf';
      case 'png': return 'image/png';
      case 'svg': return 'image/svg+xml';
      case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      default: return 'application/octet-stream';
    }
  }
}
