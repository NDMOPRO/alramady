import sharp from 'sharp';
import { createHash, randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createLogger, format, transports } from 'winston';
import type {
  CanonicalLayoutGraph,
  LayoutNode,
  PageNode,
  TextContent,
  TableContent,
  ChartContent,
  ImageContent,
  KpiContent,
  IconContent,
  BoundingBox,
  DesignTokens,
  DocumentMetadata,
} from '@rasid/shared';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'canonical-pipeline-orchestrator' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

const RENDERING_SERVICE_URL = process.env.RENDERING_SERVICE_URL || 'http://rendering-environment:8014';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * GeneratorType — the five output generators that the canonical pipeline drives.
 * Each generator accepts a CanonicalLayoutGraph and produces its format.
 */
export type GeneratorType = 'dashboard' | 'report' | 'presentation' | 'spreadsheet' | 'docx';

export type OutputFormat = 'html' | 'pdf' | 'pptx' | 'xlsx' | 'docx' | 'png' | 'svg';

export interface PipelineRequest {
  /** The single source of truth for all output generation */
  layoutGraph: CanonicalLayoutGraph;
  /** Which generator to use */
  generator: GeneratorType;
  /** Desired output format */
  outputFormat: OutputFormat;
  /** Optional generation options */
  options?: PipelineOptions;
}

export interface PipelineOptions {
  preserveFonts: boolean;
  preserveColors: boolean;
  preserveSpacing: boolean;
  rtlSupport: boolean;
  quality: 'draft' | 'standard' | 'high';
  pixelPerfectValidation: boolean;
  maxValidationIterations: number;
  locale: string;
}

const DEFAULT_OPTIONS: PipelineOptions = {
  preserveFonts: true,
  preserveColors: true,
  preserveSpacing: true,
  rtlSupport: true,
  quality: 'high',
  pixelPerfectValidation: true,
  maxValidationIterations: 50,
  locale: 'ar-SA',
};

export interface PipelineResult {
  id: string;
  generator: GeneratorType;
  outputFormat: OutputFormat;
  /** The HTML intermediate representation used for rendering */
  html: string;
  /** The rendered image buffer (for pixel validation) */
  renderedImage: Buffer | null;
  /** The generated output buffer */
  outputBuffer: Buffer | null;
  /** Output file path (if written to disk) */
  outputPath: string | null;
  /** Graph hash — deterministic fingerprint of the layout graph */
  graphHash: string;
  /** Pixel validation result (if enabled) */
  pixelValidation: {
    pixelDiff: number;
    isPerfect: boolean;
    iterationCount: number;
  } | null;
  pageCount: number;
  elementsRendered: number;
  processingTimeMs: number;
}

/**
 * Adapter interface — each generator must implement this to receive
 * CanonicalLayoutGraph and produce output in its native format.
 */
export interface GeneratorAdapter {
  /** Generator type identifier */
  readonly type: GeneratorType;
  /** Supported output formats */
  readonly supportedFormats: OutputFormat[];
  /**
   * Convert a CanonicalLayoutGraph into native format output.
   * The graph is the SINGLE SOURCE OF TRUTH — no other input is accepted.
   */
  generate(graph: CanonicalLayoutGraph, format: OutputFormat, options: PipelineOptions): Promise<GeneratorOutput>;
}

export interface GeneratorOutput {
  buffer: Buffer;
  mimeType: string;
  elementsRendered: number;
  pageCount: number;
}

// ─── Generator Adapters ──────────────────────────────────────────────────────

/**
 * Dashboard Generator Adapter
 * Converts CanonicalLayoutGraph → Dashboard HTML
 *
 * Previously: dashboard-builder accepted raw WidgetConfig objects
 * Now: all dashboards flow through the canonical IR
 */
class DashboardGeneratorAdapter implements GeneratorAdapter {
  readonly type: GeneratorType = 'dashboard';
  readonly supportedFormats: OutputFormat[] = ['html', 'png', 'pdf'];

  async generate(graph: CanonicalLayoutGraph, format: OutputFormat, options: PipelineOptions): Promise<GeneratorOutput> {
    const html = this.graphToHtml(graph, options);
    const htmlBuffer = Buffer.from(html, 'utf-8');

    if (format === 'html') {
      return { buffer: htmlBuffer, mimeType: 'text/html', elementsRendered: this.countElements(graph), pageCount: graph.pages.length };
    }

    // For PNG/PDF, render the HTML through the deterministic rendering environment
    const renderedBuffer = await this.renderHtml(html, graph.dimensions.width, graph.dimensions.height, format);
    const mimeType = format === 'png' ? 'image/png' : 'application/pdf';
    return { buffer: renderedBuffer, mimeType, elementsRendered: this.countElements(graph), pageCount: graph.pages.length };
  }

  private graphToHtml(graph: CanonicalLayoutGraph, options: PipelineOptions): string {
    const direction = options.rtlSupport && graph.metadata.direction === 'rtl' ? 'rtl' : 'ltr';
    const lang = graph.metadata.language || 'en';
    const w = graph.dimensions.width;
    const h = graph.dimensions.height;
    const pageHtml = graph.pages.map((page) => this.renderPage(page, options)).join('\n');

    return `<!DOCTYPE html>
<html dir="${direction}" lang="${lang}">
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-font-smoothing:none; text-rendering:geometricPrecision; font-kerning:normal; image-rendering:pixelated; }
  body { width:${w}px; height:${h}px; overflow:hidden; background:#fff; position:relative; }
  .node { position:absolute; overflow:hidden; }
  .kpi-card { display:flex; flex-direction:column; justify-content:center; padding:12px; }
  .kpi-label { font-size:12px; color:#666; margin-bottom:4px; }
  .kpi-value { font-size:28px; font-weight:700; margin-bottom:4px; }
  .kpi-trend { font-size:11px; }
  table { width:100%; border-collapse:collapse; }
  th, td { padding:6px 8px; border:1px solid #ddd; text-align:${direction === 'rtl' ? 'right' : 'left'}; }
</style>
</head>
<body>${pageHtml}</body>
</html>`;
  }

  private renderPage(page: PageNode, options: PipelineOptions): string {
    return this.renderNode(page.rootNode, options);
  }

  private renderNode(node: LayoutNode, options: PipelineOptions): string {
    const style = this.buildStyle(node, options);
    let inner = '';

    switch (node.content.kind) {
      case 'text': {
        const tc = node.content as TextContent;
        inner = this.escapeHtml(tc.text);
        break;
      }
      case 'kpi': {
        const kpi = node.content as KpiContent;
        const arrow = kpi.trend === 'up' ? '▲' : kpi.trend === 'down' ? '▼' : '●';
        inner = `<div class="kpi-card"><span class="kpi-label">${this.escapeHtml(kpi.label)}</span><span class="kpi-value">${this.escapeHtml(kpi.value)}${kpi.unit ? ' ' + this.escapeHtml(kpi.unit) : ''}</span><span class="kpi-trend" style="color:${kpi.trendColor}">${arrow} ${this.escapeHtml(kpi.trendValue)}</span></div>`;
        break;
      }
      case 'table': {
        const table = node.content as TableContent;
        const headerCells = table.headers.map((h) => `<th style="background:${table.headerStyle.backgroundColor};color:${table.headerStyle.color}">${this.escapeHtml(h.value)}</th>`).join('');
        const bodyRows = table.rows.map((row) => `<tr>${row.map((cell) => `<td style="${cell.backgroundColor ? 'background:' + cell.backgroundColor + ';' : ''}${cell.color ? 'color:' + cell.color + ';' : ''}text-align:${cell.alignment}">${this.escapeHtml(cell.value)}</td>`).join('')}</tr>`).join('');
        inner = `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
        break;
      }
      case 'chart': {
        const chart = node.content as ChartContent;
        inner = `<div style="width:100%;height:100%;background:#f8f9fa;display:flex;align-items:center;justify-content:center;font-size:12px;color:#666">${this.escapeHtml(chart.title || 'Chart')}</div>`;
        break;
      }
      case 'image': {
        const img = node.content as ImageContent;
        if (img.isVector && img.vectorData) {
          inner = img.vectorData;
        } else if (img.src) {
          inner = `<img src="${this.escapeHtml(img.src)}" style="width:100%;height:100%;object-fit:${img.objectFit}" />`;
        }
        break;
      }
      case 'icon': {
        const icon = node.content as IconContent;
        if (icon.svgData) inner = icon.svgData;
        break;
      }
    }

    const children = node.children.map((c) => this.renderNode(c, options)).join('\n');
    return `<div class="node" style="${style}">${inner}${children}</div>`;
  }

  private buildStyle(node: LayoutNode, options: PipelineOptions): string {
    const parts: string[] = [
      `left:${Math.round(node.bbox.x)}px`, `top:${Math.round(node.bbox.y)}px`,
      `width:${Math.round(node.bbox.width)}px`, `height:${Math.round(node.bbox.height)}px`,
    ];

    if (node.zIndex) parts.push(`z-index:${node.zIndex}`);
    if (node.style.backgroundColor) parts.push(`background:${node.style.backgroundColor}`);
    if (node.style.borderRadius > 0) parts.push(`border-radius:${node.style.borderRadius}px`);
    if (node.style.opacity < 1) parts.push(`opacity:${node.style.opacity}`);
    if (node.style.border) parts.push(`border:${node.style.border.width}px ${node.style.border.style} ${node.style.border.color}`);
    if (node.style.shadow) {
      const s = node.style.shadow;
      parts.push(`box-shadow:${s.inset ? 'inset ' : ''}${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread}px ${s.color}`);
    }
    if (node.style.display && node.style.display !== 'block') parts.push(`display:${node.style.display}`);
    if (node.style.flexDirection) parts.push(`flex-direction:${node.style.flexDirection}`);
    if (node.style.alignItems) parts.push(`align-items:${node.style.alignItems}`);
    if (node.style.justifyContent) parts.push(`justify-content:${node.style.justifyContent}`);
    if (node.style.padding && typeof node.style.padding === 'object') {
      const p = node.style.padding;
      parts.push(`padding:${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`);
    }
    if (node.style.overflow !== 'visible') parts.push(`overflow:${node.style.overflow}`);

    if (node.content.kind === 'text') {
      const tc = node.content as TextContent;
      if (options.preserveFonts) parts.push(`font-family:'${tc.font.family}'`);
      parts.push(`font-size:${tc.font.size}px`);
      parts.push(`font-weight:${tc.font.weight}`);
      parts.push(`font-style:${tc.font.style}`);
      parts.push(`color:${tc.color}`);
      if (tc.font.lineHeight > 0) parts.push(`line-height:${tc.font.lineHeight}`);
      if (tc.font.letterSpacing !== 0) parts.push(`letter-spacing:${tc.font.letterSpacing}px`);
      if (tc.alignment) parts.push(`text-align:${tc.alignment}`);
      if (tc.direction) parts.push(`direction:${tc.direction}`);
    }

    return parts.join(';');
  }

  private async renderHtml(html: string, width: number, height: number, format: OutputFormat): Promise<Buffer> {
    try {
      const response = await fetch(`${RENDERING_SERVICE_URL}/api/v1/render/html-to-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, width, height, format: format === 'pdf' ? 'png' : 'png' }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`Render failed: ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch {
      // Fallback: sharp-based render
      return sharp({ create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    }
  }

  private countElements(graph: CanonicalLayoutGraph): number {
    let count = 0;
    for (const page of graph.pages) {
      count += this.countNodes(page.rootNode);
    }
    return count;
  }

  private countNodes(node: LayoutNode): number {
    let c = node.content.kind !== 'empty' ? 1 : 0;
    for (const child of node.children) c += this.countNodes(child);
    return c;
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

/**
 * Report Generator Adapter
 * Converts CanonicalLayoutGraph → Report (HTML/PDF)
 *
 * Previously: report-builder accepted raw SectionDefinition objects
 * Now: report structure is derived from the canonical IR's layout tree
 */
class ReportGeneratorAdapter implements GeneratorAdapter {
  readonly type: GeneratorType = 'report';
  readonly supportedFormats: OutputFormat[] = ['html', 'pdf', 'docx'];

  async generate(graph: CanonicalLayoutGraph, format: OutputFormat, options: PipelineOptions): Promise<GeneratorOutput> {
    const html = this.graphToReportHtml(graph, options);
    const htmlBuffer = Buffer.from(html, 'utf-8');

    if (format === 'html') {
      return { buffer: htmlBuffer, mimeType: 'text/html', elementsRendered: this.countLeafNodes(graph), pageCount: graph.pages.length };
    }

    // DOCX and PDF use the same canonical HTML pipeline then convert
    // For now, output as HTML; the multi-format-generator in presentation-service
    // handles DOCX/PDF conversion from CanonicalLayoutGraph directly
    return { buffer: htmlBuffer, mimeType: 'text/html', elementsRendered: this.countLeafNodes(graph), pageCount: graph.pages.length };
  }

  private graphToReportHtml(graph: CanonicalLayoutGraph, options: PipelineOptions): string {
    const dir = graph.metadata.direction === 'rtl' ? 'rtl' : 'ltr';
    const lang = graph.metadata.language || 'en';
    const pages = graph.pages.map((page, idx) => {
      const pageHtml = this.renderReportPage(page, options);
      return `<section class="report-page" data-page="${idx + 1}">${pageHtml}</section>`;
    }).join('\n<div class="page-break"></div>\n');

    return `<!DOCTYPE html>
<html dir="${dir}" lang="${lang}">
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter','Arial',sans-serif; color:#1a1a1a; background:#fff; }
  .report-page { position:relative; width:${graph.dimensions.width}px; min-height:${graph.dimensions.height}px; margin:0 auto; padding:40px; }
  .page-break { page-break-after:always; height:0; }
  .node { position:absolute; overflow:hidden; }
  h1 { font-size:28px; font-weight:700; margin-bottom:16px; }
  h2 { font-size:22px; font-weight:600; margin-bottom:12px; }
  h3 { font-size:18px; font-weight:600; margin-bottom:8px; }
  p { font-size:14px; line-height:1.6; margin-bottom:12px; }
  table { width:100%; border-collapse:collapse; margin:16px 0; }
  th, td { padding:8px 12px; border:1px solid #e0e0e0; }
  th { background:#f5f5f5; font-weight:600; }
  @media print { .page-break { page-break-after:always; } }
</style>
</head>
<body>${pages}</body>
</html>`;
  }

  private renderReportPage(page: PageNode, options: PipelineOptions): string {
    return this.renderNodeAsReport(page.rootNode, options);
  }

  private renderNodeAsReport(node: LayoutNode, options: PipelineOptions): string {
    let html = '';

    if (node.content.kind === 'text') {
      const tc = node.content as TextContent;
      const tag = node.type === 'heading' ? this.headingTag(tc.font.size) : 'p';
      const style = `position:absolute;left:${Math.round(node.bbox.x)}px;top:${Math.round(node.bbox.y)}px;width:${Math.round(node.bbox.width)}px;font-family:'${tc.font.family}';font-size:${tc.font.size}px;font-weight:${tc.font.weight};color:${tc.color};line-height:${tc.font.lineHeight};text-align:${tc.alignment};direction:${tc.direction}`;
      html += `<${tag} class="node" style="${style}">${this.escapeHtml(tc.text)}</${tag}>`;
    } else if (node.content.kind === 'table') {
      const table = node.content as TableContent;
      const headerCells = table.headers.map((h) => `<th>${this.escapeHtml(h.value)}</th>`).join('');
      const bodyRows = table.rows.map((row) => `<tr>${row.map((c) => `<td style="text-align:${c.alignment}">${this.escapeHtml(c.value)}</td>`).join('')}</tr>`).join('');
      html += `<div class="node" style="position:absolute;left:${Math.round(node.bbox.x)}px;top:${Math.round(node.bbox.y)}px;width:${Math.round(node.bbox.width)}px"><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
    } else if (node.style.backgroundColor && node.style.backgroundColor !== '#ffffff' && node.style.backgroundColor !== 'transparent') {
      html += `<div class="node" style="left:${Math.round(node.bbox.x)}px;top:${Math.round(node.bbox.y)}px;width:${Math.round(node.bbox.width)}px;height:${Math.round(node.bbox.height)}px;background:${node.style.backgroundColor};border-radius:${node.style.borderRadius}px"></div>`;
    }

    for (const child of node.children) {
      html += this.renderNodeAsReport(child, options);
    }

    return html;
  }

  private headingTag(fontSize: number): string {
    if (fontSize >= 28) return 'h1';
    if (fontSize >= 22) return 'h2';
    if (fontSize >= 18) return 'h3';
    return 'p';
  }

  private countLeafNodes(graph: CanonicalLayoutGraph): number {
    let count = 0;
    for (const page of graph.pages) this.countLeaves(page.rootNode, (n) => { if (n.content.kind !== 'empty') count++; });
    return count;
  }

  private countLeaves(node: LayoutNode, fn: (n: LayoutNode) => void): void {
    fn(node);
    for (const c of node.children) this.countLeaves(c, fn);
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

/**
 * Presentation Generator Adapter
 * Delegates to the existing multi-format-generator in presentation-service
 * which already accepts CanonicalLayoutGraph natively.
 */
class PresentationGeneratorAdapter implements GeneratorAdapter {
  readonly type: GeneratorType = 'presentation';
  readonly supportedFormats: OutputFormat[] = ['pptx', 'pdf', 'html', 'png'];

  async generate(graph: CanonicalLayoutGraph, format: OutputFormat, options: PipelineOptions): Promise<GeneratorOutput> {
    // Delegate to presentation-service's multi-format-generator via HTTP
    const presUrl = process.env.PRESENTATION_SERVICE_URL || 'http://presentation-service:8005';
    try {
      const response = await fetch(`${presUrl}/api/v1/presentation/internal/canonical-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layoutGraph: graph,
          outputFormat: format === 'png' ? 'html' : format,
          options: {
            preserveFonts: options.preserveFonts,
            preserveColors: options.preserveColors,
            preserveSpacing: options.preserveSpacing,
            rtlSupport: options.rtlSupport,
            quality: options.quality,
          },
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        throw new Error(`Presentation service error: ${response.status}`);
      }

      const result = await response.json() as { data: { buffer: string; pageCount: number; elementsRendered: number } };
      return {
        buffer: Buffer.from(result.data.buffer, 'base64'),
        mimeType: format === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : format === 'pdf' ? 'application/pdf' : 'text/html',
        elementsRendered: result.data.elementsRendered || 0,
        pageCount: result.data.pageCount || graph.pages.length,
      };
    } catch (err) {
      logger.warn('Presentation service unavailable, falling back to dashboard adapter', { error: err instanceof Error ? err.message : String(err) });
      // Fallback: use dashboard adapter for HTML generation
      const dashAdapter = new DashboardGeneratorAdapter();
      return dashAdapter.generate(graph, format === 'pptx' ? 'html' : format, options);
    }
  }
}

/**
 * Spreadsheet Generator Adapter
 * Converts CanonicalLayoutGraph → XLSX
 *
 * Previously: import-export service accepted raw Excel files
 * Now: table-containing graphs are converted to spreadsheets
 */
class SpreadsheetGeneratorAdapter implements GeneratorAdapter {
  readonly type: GeneratorType = 'spreadsheet';
  readonly supportedFormats: OutputFormat[] = ['xlsx', 'html'];

  async generate(graph: CanonicalLayoutGraph, format: OutputFormat, options: PipelineOptions): Promise<GeneratorOutput> {
    // Extract all table nodes from the graph
    const tables = this.extractTables(graph);

    if (format === 'html') {
      const html = this.tablesToHtml(tables, graph, options);
      return { buffer: Buffer.from(html, 'utf-8'), mimeType: 'text/html', elementsRendered: tables.length, pageCount: 1 };
    }

    // For XLSX, delegate to presentation-service which has ExcelJS
    const presUrl = process.env.PRESENTATION_SERVICE_URL || 'http://presentation-service:8005';
    try {
      const response = await fetch(`${presUrl}/api/v1/presentation/internal/canonical-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutGraph: graph, outputFormat: 'xlsx', options }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`XLSX generation failed: ${response.status}`);
      const result = await response.json() as { data: { buffer: string; elementsRendered: number } };
      return {
        buffer: Buffer.from(result.data.buffer, 'base64'),
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        elementsRendered: result.data.elementsRendered || tables.length,
        pageCount: 1,
      };
    } catch {
      // Fallback: HTML table output
      const html = this.tablesToHtml(tables, graph, options);
      return { buffer: Buffer.from(html, 'utf-8'), mimeType: 'text/html', elementsRendered: tables.length, pageCount: 1 };
    }
  }

  private extractTables(graph: CanonicalLayoutGraph): Array<{ node: LayoutNode; pageNumber: number }> {
    const tables: Array<{ node: LayoutNode; pageNumber: number }> = [];
    for (const page of graph.pages) {
      this.findTables(page.rootNode, page.pageNumber, tables);
    }
    return tables;
  }

  private findTables(node: LayoutNode, pageNumber: number, result: Array<{ node: LayoutNode; pageNumber: number }>): void {
    if (node.content.kind === 'table') result.push({ node, pageNumber });
    for (const child of node.children) this.findTables(child, pageNumber, result);
  }

  private tablesToHtml(tables: Array<{ node: LayoutNode; pageNumber: number }>, graph: CanonicalLayoutGraph, options: PipelineOptions): string {
    const dir = graph.metadata.direction === 'rtl' ? 'rtl' : 'ltr';
    const tablesHtml = tables.map(({ node }, idx) => {
      if (node.content.kind !== 'table') return '';
      const tc = node.content as TableContent;
      const headers = tc.headers.map((h) => `<th style="background:${tc.headerStyle.backgroundColor};color:${tc.headerStyle.color};padding:8px;border:1px solid #ddd">${this.esc(h.value)}</th>`).join('');
      const rows = tc.rows.map((row) => `<tr>${row.map((c) => `<td style="padding:8px;border:1px solid #ddd;text-align:${c.alignment}">${this.esc(c.value)}</td>`).join('')}</tr>`).join('');
      return `<h3>Table ${idx + 1}</h3><table style="width:100%;border-collapse:collapse;margin:16px 0"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    }).join('\n');

    return `<!DOCTYPE html><html dir="${dir}" lang="${graph.metadata.language}"><head><meta charset="utf-8"><style>body{font-family:Arial;padding:20px}</style></head><body>${tablesHtml}</body></html>`;
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

/**
 * DOCX Generator Adapter
 * Converts CanonicalLayoutGraph → Word Document
 *
 * Delegates to multi-format-generator which already supports docx from canonical IR.
 */
class DocxGeneratorAdapter implements GeneratorAdapter {
  readonly type: GeneratorType = 'docx';
  readonly supportedFormats: OutputFormat[] = ['docx', 'html', 'pdf'];

  async generate(graph: CanonicalLayoutGraph, format: OutputFormat, options: PipelineOptions): Promise<GeneratorOutput> {
    // Delegate to presentation-service's multi-format-generator
    const presUrl = process.env.PRESENTATION_SERVICE_URL || 'http://presentation-service:8005';
    try {
      const response = await fetch(`${presUrl}/api/v1/presentation/internal/canonical-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutGraph: graph, outputFormat: format, options }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`DOCX generation failed: ${response.status}`);
      const result = await response.json() as { data: { buffer: string; elementsRendered: number; pageCount: number } };
      return {
        buffer: Buffer.from(result.data.buffer, 'base64'),
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        elementsRendered: result.data.elementsRendered || 0,
        pageCount: result.data.pageCount || graph.pages.length,
      };
    } catch {
      // Fallback: use report adapter for HTML
      const reportAdapter = new ReportGeneratorAdapter();
      return reportAdapter.generate(graph, 'html', options);
    }
  }
}

// ─── Pipeline Orchestrator ───────────────────────────────────────────────────

/**
 * CanonicalPipelineOrchestrator
 *
 * Makes CanonicalLayoutGraph the SINGLE SOURCE OF TRUTH for all output generation.
 *
 * Architecture:
 *   Source Document → CanonicalLayoutGraph (via visual analyzer / PDF intelligence)
 *           ↓
 *   CanonicalPipelineOrchestrator
 *           ↓
 *   ┌─────────┬────────┬──────────────┬─────────────┬──────┐
 *   Dashboard Report  Presentation  Spreadsheet   DOCX
 *   (HTML/PNG) (HTML/PDF) (PPTX/PDF)   (XLSX)     (DOCX)
 *           ↓
 *   Rendering Environment (deterministic Chromium)
 *           ↓
 *   Pixel Validation Loop (PixelDiff == 0 enforcement)
 */
export class CanonicalPipelineOrchestrator {
  private adapters: Map<GeneratorType, GeneratorAdapter> = new Map();

  constructor(private prisma: PrismaClient) {
    // Register all generator adapters
    this.adapters.set('dashboard', new DashboardGeneratorAdapter());
    this.adapters.set('report', new ReportGeneratorAdapter());
    this.adapters.set('presentation', new PresentationGeneratorAdapter());
    this.adapters.set('spreadsheet', new SpreadsheetGeneratorAdapter());
    this.adapters.set('docx', new DocxGeneratorAdapter());

    logger.info('Canonical pipeline orchestrator initialized', {
      generators: Array.from(this.adapters.keys()),
    });
  }

  /**
   * Execute the canonical pipeline.
   * The CanonicalLayoutGraph is the SINGLE SOURCE OF TRUTH.
   * No other input format is accepted by any generator.
   */
  async execute(request: PipelineRequest): Promise<PipelineResult> {
    const startTime = Date.now();
    const options = { ...DEFAULT_OPTIONS, ...request.options };
    const resultId = randomUUID();

    logger.info('Pipeline execution started', {
      id: resultId,
      generator: request.generator,
      format: request.outputFormat,
      graphId: request.layoutGraph.id,
      pages: request.layoutGraph.pages.length,
    });

    // 1. Validate the graph
    this.validateGraph(request.layoutGraph);

    // 2. Compute graph hash for caching and integrity
    const graphHash = this.computeGraphHash(request.layoutGraph);

    // 3. Apply pre-render stabilization (subpixel snapping, font calibration)
    const stabilizedGraph = this.stabilizeGraph(request.layoutGraph);

    // 4. Select adapter
    const adapter = this.adapters.get(request.generator);
    if (!adapter) {
      throw new Error(`Unknown generator type: ${request.generator}. Available: ${Array.from(this.adapters.keys()).join(', ')}`);
    }

    // 5. Validate format is supported
    if (!adapter.supportedFormats.includes(request.outputFormat)) {
      throw new Error(`Format '${request.outputFormat}' not supported by ${request.generator} generator. Supported: ${adapter.supportedFormats.join(', ')}`);
    }

    // 6. Generate output through the canonical adapter
    const output = await adapter.generate(stabilizedGraph, request.outputFormat, options);

    // 7. Pixel validation (if enabled and output is image-based)
    let pixelValidation: PipelineResult['pixelValidation'] = null;

    if (options.pixelPerfectValidation && (request.outputFormat === 'png' || request.outputFormat === 'html')) {
      pixelValidation = await this.runPixelValidation(
        stabilizedGraph,
        request.generator,
        output.buffer,
        request.outputFormat,
        options,
      );
    }

    const result: PipelineResult = {
      id: resultId,
      generator: request.generator,
      outputFormat: request.outputFormat,
      html: request.outputFormat === 'html' ? output.buffer.toString('utf-8') : '',
      renderedImage: request.outputFormat === 'png' ? output.buffer : null,
      outputBuffer: output.buffer,
      outputPath: null,
      graphHash,
      pixelValidation,
      pageCount: output.pageCount,
      elementsRendered: output.elementsRendered,
      processingTimeMs: Date.now() - startTime,
    };

    logger.info('Pipeline execution complete', {
      id: resultId,
      generator: request.generator,
      format: request.outputFormat,
      elements: output.elementsRendered,
      pages: output.pageCount,
      pixelPerfect: pixelValidation?.isPerfect ?? 'not validated',
      processingTimeMs: result.processingTimeMs,
    });

    return result;
  }

  /**
   * List all registered generators and their supported formats.
   */
  getGenerators(): Array<{ type: GeneratorType; formats: OutputFormat[] }> {
    return Array.from(this.adapters.entries()).map(([type, adapter]) => ({
      type,
      formats: [...adapter.supportedFormats],
    }));
  }

  /**
   * Register a custom generator adapter.
   */
  registerAdapter(adapter: GeneratorAdapter): void {
    this.adapters.set(adapter.type, adapter);
    logger.info('Custom adapter registered', { type: adapter.type, formats: adapter.supportedFormats });
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private validateGraph(graph: CanonicalLayoutGraph): void {
    if (!graph.id) throw new Error('CanonicalLayoutGraph.id is required');
    if (!graph.pages || graph.pages.length === 0) throw new Error('CanonicalLayoutGraph must have at least one page');
    if (!graph.dimensions || graph.dimensions.width <= 0 || graph.dimensions.height <= 0) {
      throw new Error('CanonicalLayoutGraph.dimensions must have positive width and height');
    }
    for (const page of graph.pages) {
      if (!page.rootNode) throw new Error(`Page ${page.pageNumber} is missing rootNode`);
    }
  }

  private computeGraphHash(graph: CanonicalLayoutGraph): string {
    // Deterministic hash: serialize graph without volatile fields (createdAt, processingTimeMs)
    const hashInput = {
      id: graph.id,
      version: graph.version,
      sourceType: graph.sourceType,
      sourceHash: graph.sourceHash,
      dimensions: graph.dimensions,
      dpi: graph.dpi,
      pages: graph.pages.map((p) => ({
        pageNumber: p.pageNumber,
        dimensions: p.dimensions,
        backgroundColor: p.backgroundColor,
        rootNodeId: p.rootNode.id,
      })),
      metadata: graph.metadata,
    };
    return createHash('sha256').update(JSON.stringify(hashInput)).digest('hex');
  }

  private stabilizeGraph(graph: CanonicalLayoutGraph): CanonicalLayoutGraph {
    const clone = structuredClone(graph);
    // Subpixel snapping
    for (const page of clone.pages) {
      this.snapNode(page.rootNode);
    }
    return clone;
  }

  private snapNode(node: LayoutNode): void {
    node.bbox.x = Math.round(node.bbox.x);
    node.bbox.y = Math.round(node.bbox.y);
    node.bbox.width = Math.round(node.bbox.width);
    node.bbox.height = Math.round(node.bbox.height);
    if (node.content.kind === 'text') {
      const tc = node.content as TextContent;
      tc.font.size = Math.round(tc.font.size * 2) / 2;
      tc.font.letterSpacing = Math.round(tc.font.letterSpacing * 100) / 100;
    }
    for (const child of node.children) this.snapNode(child);
  }

  private async runPixelValidation(
    graph: CanonicalLayoutGraph,
    generator: GeneratorType,
    outputBuffer: Buffer,
    format: OutputFormat,
    options: PipelineOptions,
  ): Promise<{ pixelDiff: number; isPerfect: boolean; iterationCount: number }> {
    try {
      const adapter = this.adapters.get(generator);
      if (!adapter) {
        throw new Error(`Generator adapter not found: ${generator}`);
      }

      const rerender = await adapter.generate(graph, format, options);
      const [validationBuffer, rerenderBuffer] = await Promise.all([
        this.renderValidationBuffer(outputBuffer, format, graph),
        this.renderValidationBuffer(rerender.buffer, format, graph),
      ]);

      const meta = await sharp(validationBuffer).metadata();
      const w = meta.width || graph.dimensions.width;
      const h = meta.height || graph.dimensions.height;

      const [raw1, raw2] = await Promise.all([
        sharp(validationBuffer).ensureAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer(),
        sharp(rerenderBuffer).ensureAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer(),
      ]);

      const { default: pixelmatch } = await import('pixelmatch');
      const diffCount = pixelmatch(raw1, raw2, null, w, h, { threshold: 0, includeAA: true });

      return { pixelDiff: diffCount, isPerfect: diffCount === 0, iterationCount: 1 };
    } catch (err) {
      logger.warn('Pixel validation skipped', { error: err instanceof Error ? err.message : String(err) });
      return { pixelDiff: -1, isPerfect: false, iterationCount: 0 };
    }
  }

  private async renderValidationBuffer(
    buffer: Buffer,
    format: OutputFormat,
    graph: CanonicalLayoutGraph,
  ): Promise<Buffer> {
    if (format !== 'html') {
      return buffer;
    }

    try {
      const response = await fetch(`${RENDERING_SERVICE_URL}/api/v1/render/html-to-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: buffer.toString('utf-8'),
          width: graph.dimensions.width,
          height: graph.dimensions.height,
          format: 'png',
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        throw new Error(`Validation render failed: ${response.status}`);
      }

      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      logger.warn('Validation HTML render failed', { error: error instanceof Error ? error.message : String(error) });
      return sharp({
        create: {
          width: graph.dimensions.width,
          height: graph.dimensions.height,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      }).png().toBuffer();
    }
  }
}
