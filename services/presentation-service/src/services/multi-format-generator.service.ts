import { PrismaClient } from '@prisma/client';
import { createLogger, format, transports } from 'winston';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import PptxGenJS from 'pptxgenjs';
import PDFDocument from 'pdfkit';
import type {
  CanonicalLayoutGraph,
  LayoutNode,
  TextContent,
  TableContent,
  ChartContent,
  ImageContent,
  KpiContent,
  PageNode,
} from '@rasid/shared';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'multi-format-generator' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface GenerationRequest {
  layoutGraph: CanonicalLayoutGraph;
  outputFormat: 'pptx' | 'pdf' | 'html' | 'docx' | 'xlsx';
  outputPath: string;
  options?: GenerationOptions;
}

export interface GenerationOptions {
  preserveFonts: boolean;
  preserveColors: boolean;
  preserveSpacing: boolean;
  embedFonts: boolean;
  rtlSupport: boolean;
  quality: 'draft' | 'standard' | 'high';
  theme: string | null;
}

const DEFAULT_OPTIONS: GenerationOptions = {
  preserveFonts: true,
  preserveColors: true,
  preserveSpacing: true,
  embedFonts: false,
  rtlSupport: true,
  quality: 'high',
  theme: null,
};

export interface GenerationResult {
  id: string;
  outputPath: string;
  outputFormat: string;
  fileSize: number;
  pageCount: number;
  elementsRendered: number;
  processingTimeMs: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class MultiFormatGeneratorService {
  constructor(private prisma: PrismaClient) {}

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const startTime = Date.now();
    const options = { ...DEFAULT_OPTIONS, ...request.options };
    const resultId = randomUUID();

    logger.info('Starting multi-format generation', {
      format: request.outputFormat,
      pages: request.layoutGraph.pages.length,
    });

    let result: GenerationResult;

    switch (request.outputFormat) {
      case 'pptx':
        result = await this.generatePptx(request.layoutGraph, request.outputPath, options);
        break;
      case 'pdf':
        result = await this.generatePdf(request.layoutGraph, request.outputPath, options);
        break;
      case 'html':
        result = await this.generateHtml(request.layoutGraph, request.outputPath, options);
        break;
      case 'docx':
        result = await this.generateDocx(request.layoutGraph, request.outputPath, options);
        break;
      case 'xlsx':
        result = await this.generateXlsx(request.layoutGraph, request.outputPath, options);
        break;
      default:
        throw new Error(`Unsupported output format: ${request.outputFormat}`);
    }

    result.id = resultId;
    result.processingTimeMs = Date.now() - startTime;

    logger.info('Generation complete', {
      format: request.outputFormat,
      fileSize: result.fileSize,
      elements: result.elementsRendered,
      processingTimeMs: result.processingTimeMs,
    });

    return result;
  }

  // ─── PPTX Generation ───────────────────────────────────────────────────────

  private async generatePptx(
    graph: CanonicalLayoutGraph,
    outputPath: string,
    options: GenerationOptions,
  ): Promise<GenerationResult> {
    const pptx = new PptxGenJS();
    let elementsRendered = 0;

    pptx.layout = graph.dimensions.width > graph.dimensions.height ? 'LAYOUT_WIDE' : 'LAYOUT_4x3';

    if (options.rtlSupport && graph.metadata.direction === 'rtl') {
      pptx.rtlMode = true;
    }

    for (const page of graph.pages) {
      const slide = pptx.addSlide();

      if (page.backgroundColor && page.backgroundColor !== '#ffffff') {
        slide.background = { fill: page.backgroundColor.replace('#', '') };
      }

      const allNodes = this.flattenNodes(page.rootNode);
      const scaleX = 10 / page.dimensions.width;
      const scaleY = 7.5 / page.dimensions.height;

      for (const node of allNodes) {
        if (node.type === 'page' || node.type === 'container') continue;

        const x = node.bbox.x * scaleX;
        const y = node.bbox.y * scaleY;
        const w = node.bbox.width * scaleX;
        const h = node.bbox.height * scaleY;

        if (node.content.kind === 'text') {
          const tc = node.content as TextContent;
          const textOpts: Record<string, unknown> = {
            x, y, w, h,
            fontSize: Math.max(8, Math.round(tc.font.size * scaleX * 7.2)),
            fontFace: options.preserveFonts ? tc.font.family : 'Arial',
            color: options.preserveColors ? tc.color.replace('#', '') : '000000',
            bold: tc.font.weight >= 700,
            italic: tc.font.style === 'italic',
            align: tc.alignment === 'justify' ? 'justify' : tc.alignment,
            valign: 'top',
            rtlMode: tc.direction === 'rtl',
          };

          if (node.style.backgroundColor) {
            textOpts.fill = { color: node.style.backgroundColor.replace('#', '') };
          }

          slide.addText(tc.text, textOpts as Parameters<typeof slide.addText>[1]);
          elementsRendered++;
        }

        if (node.content.kind === 'table') {
          const tableContent = node.content as TableContent;
          const rows: Array<Array<{ text: string; options?: Record<string, unknown> }>> = [];

          const headerRow = tableContent.headers.map((h: { value: string }) => ({
            text: h.value,
            options: {
              bold: true,
              fill: { color: tableContent.headerStyle.backgroundColor.replace('#', '') },
              color: tableContent.headerStyle.color.replace('#', ''),
              fontSize: 10,
            },
          }));
          rows.push(headerRow);

          for (const row of tableContent.rows) {
            rows.push(
              row.map((cell: { value: string; alignment?: string; color?: string | null }) => ({
                text: cell.value,
                options: {
                  fontSize: 9,
                  align: cell.alignment,
                  color: (cell.color || '#000000').replace('#', ''),
                },
              })),
            );
          }

          slide.addTable(rows, {
            x, y, w, h,
            border: { type: 'solid', pt: 0.5, color: 'CCCCCC' },
            autoPage: false,
          });
          elementsRendered++;
        }

        if (node.content.kind === 'kpi') {
          const kpi = node.content as KpiContent;
          slide.addText([
            { text: kpi.label + '\n', options: { fontSize: 10, color: '666666' } },
            { text: kpi.value + '\n', options: { fontSize: 24, bold: true, color: '000000' } },
            { text: `${kpi.trend === 'up' ? '▲' : kpi.trend === 'down' ? '▼' : '●'} ${kpi.trendValue}`, options: { fontSize: 10, color: kpi.trendColor.replace('#', '') } },
          ], { x, y, w, h, valign: 'middle', align: 'center' });
          elementsRendered++;
        }

        if (node.content.kind === 'image' && (node.content as ImageContent).src) {
          const imgContent = node.content as ImageContent;
          if (imgContent.src.startsWith('data:') || imgContent.src.startsWith('/')) {
            try {
              slide.addImage({ path: imgContent.src, x, y, w, h });
              elementsRendered++;
            } catch {
              logger.debug('Failed to add image to PPTX', { src: imgContent.src.slice(0, 50) });
            }
          }
        }
      }
    }

    await pptx.writeFile({ fileName: outputPath });
    const stat = await fs.stat(outputPath);

    return {
      id: '',
      outputPath,
      outputFormat: 'pptx',
      fileSize: stat.size,
      pageCount: graph.pages.length,
      elementsRendered,
      processingTimeMs: 0,
    };
  }

  // ─── PDF Generation ─────────────────────────────────────────────────────────

  private async generatePdf(
    graph: CanonicalLayoutGraph,
    outputPath: string,
    options: GenerationOptions,
  ): Promise<GenerationResult> {
    return new Promise<GenerationResult>((resolve, reject) => {
      let elementsRendered = 0;

      const firstPage = graph.pages[0];
      const pageWidth = firstPage ? firstPage.dimensions.width * 0.75 : 612;
      const pageHeight = firstPage ? firstPage.dimensions.height * 0.75 : 792;

      const doc = new PDFDocument({
        size: [pageWidth, pageHeight],
        margin: 0,
        bufferPages: true,
      });

      const stream = require('fs').createWriteStream(outputPath);
      doc.pipe(stream);

      for (let pageIdx = 0; pageIdx < graph.pages.length; pageIdx++) {
        const page = graph.pages[pageIdx];
        if (pageIdx > 0) doc.addPage({ size: [pageWidth, pageHeight], margin: 0 });

        const scaleX = pageWidth / page.dimensions.width;
        const scaleY = pageHeight / page.dimensions.height;

        if (page.backgroundColor && page.backgroundColor !== '#ffffff') {
          doc.rect(0, 0, pageWidth, pageHeight).fill(page.backgroundColor);
        }

        const allNodes = this.flattenNodes(page.rootNode);

        for (const node of allNodes) {
          if (node.type === 'page' || node.type === 'container') continue;

          const x = node.bbox.x * scaleX;
          const y = node.bbox.y * scaleY;
          const w = node.bbox.width * scaleX;
          const h = node.bbox.height * scaleY;

          if (node.style.backgroundColor) {
            doc.rect(x, y, w, h).fill(node.style.backgroundColor);
          }

          if (node.style.border) {
            doc.rect(x, y, w, h)
              .lineWidth(node.style.border.width)
              .stroke(node.style.border.color);
          }

          if (node.content.kind === 'text') {
            const tc = node.content as TextContent;
            const fontSize = Math.max(6, tc.font.size * scaleX);

            doc.fontSize(fontSize);
            doc.fillColor(tc.color || '#000000');

            if (tc.font.weight >= 700) {
              doc.font('Helvetica-Bold');
            } else {
              doc.font('Helvetica');
            }

            const textOptions: Record<string, unknown> = {
              width: w,
              height: h,
              align: tc.alignment === 'justify' ? 'justify' : tc.alignment as 'left' | 'center' | 'right',
              lineGap: (tc.font.lineHeight - 1) * fontSize,
            };

            if (options.rtlSupport && tc.direction === 'rtl') {
              textOptions.features = ['rtla', 'liga', 'kern'];
            }

            doc.text(tc.text, x, y, textOptions);
            elementsRendered++;
          }

          if (node.content.kind === 'table') {
            const table = node.content as TableContent;
            const colWidth = w / Math.max(table.headers.length, 1);
            const rowHeight = Math.min(20, h / Math.max(table.rows.length + 1, 1));

            doc.rect(x, y, w, rowHeight).fill(table.headerStyle.backgroundColor);
            doc.fillColor(table.headerStyle.color);
            doc.fontSize(Math.max(6, 10 * scaleX));

            table.headers.forEach((header: { value: string }, ci: number) => {
              doc.text(header.value, x + ci * colWidth + 2, y + 3, {
                width: colWidth - 4,
                height: rowHeight,
              });
            });

            doc.fillColor('#000000');
            doc.fontSize(Math.max(6, 9 * scaleX));

            table.rows.forEach((row: Array<{ value: string }>, ri: number) => {
              const rowY = y + (ri + 1) * rowHeight;

              if (table.alternateRowColor && ri % 2 === 1) {
                doc.rect(x, rowY, w, rowHeight).fill(table.alternateRowColor);
                doc.fillColor('#000000');
              }

              row.forEach((cell: { value: string }, ci: number) => {
                doc.text(cell.value, x + ci * colWidth + 2, rowY + 3, {
                  width: colWidth - 4,
                  height: rowHeight,
                });
              });
            });

            elementsRendered++;
          }

          if (node.content.kind === 'kpi') {
            const kpi = node.content as KpiContent;
            const labelSize = Math.max(6, 10 * scaleX);
            const valueSize = Math.max(8, 24 * scaleX);
            const trendSize = Math.max(6, 10 * scaleX);

            doc.fontSize(labelSize).fillColor('#666666');
            doc.text(kpi.label, x + 4, y + 4, { width: w - 8 });

            doc.fontSize(valueSize).fillColor('#000000');
            doc.text(kpi.value, x + 4, y + labelSize + 8, { width: w - 8 });

            doc.fontSize(trendSize).fillColor(kpi.trendColor);
            const arrow = kpi.trend === 'up' ? '▲' : kpi.trend === 'down' ? '▼' : '●';
            doc.text(`${arrow} ${kpi.trendValue}`, x + 4, y + labelSize + valueSize + 12, { width: w - 8 });

            elementsRendered++;
          }
        }
      }

      doc.end();

      stream.on('finish', async () => {
        const stat = await fs.stat(outputPath);
        resolve({
          id: '',
          outputPath,
          outputFormat: 'pdf',
          fileSize: stat.size,
          pageCount: graph.pages.length,
          elementsRendered,
          processingTimeMs: 0,
        });
      });

      stream.on('error', reject);
    });
  }

  // ─── HTML Generation ────────────────────────────────────────────────────────

  private async generateHtml(
    graph: CanonicalLayoutGraph,
    outputPath: string,
    options: GenerationOptions,
  ): Promise<GenerationResult> {
    let elementsRendered = 0;
    const direction = graph.metadata.direction;

    const fontsArray = (graph.designTokens as Record<string, unknown>).fonts as Array<{ family: string }> ?? [];
    const fontImports = fontsArray
      .map((f: { family: string }) => f.family)
      .filter((f: string, i: number, arr: string[]) => arr.indexOf(f) === i)
      .map((f: string) => `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}:wght@100;200;300;400;500;600;700;800;900&display=swap');`)
      .join('\n');

    let css = `${fontImports}\n\n* { box-sizing: border-box; margin: 0; padding: 0; }\nbody { direction: ${direction}; }\n`;

    const pages: string[] = [];

    for (const page of graph.pages) {
      const pageHtml = this.renderNodeToHtml(page.rootNode, options, page.dimensions);
      elementsRendered += this.flattenNodes(page.rootNode).length;

      pages.push(`<div class="page" style="width:${page.dimensions.width}px;height:${page.dimensions.height}px;position:relative;background:${page.backgroundColor};overflow:hidden;margin:0 auto 20px;">\n${pageHtml}\n</div>`);
    }

    const html = `<!DOCTYPE html>
<html dir="${direction}" lang="${graph.metadata.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${graph.metadata.title || 'Rasid Document'}</title>
<style>
${css}
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;

    await fs.writeFile(outputPath, html, 'utf-8');
    const stat = await fs.stat(outputPath);

    return {
      id: '',
      outputPath,
      outputFormat: 'html',
      fileSize: stat.size,
      pageCount: graph.pages.length,
      elementsRendered,
      processingTimeMs: 0,
    };
  }

  private renderNodeToHtml(
    node: LayoutNode,
    options: GenerationOptions,
    pageDimensions: { width: number; height: number },
  ): string {
    const style: string[] = [
      `position:absolute`,
      `left:${node.bbox.x}px`,
      `top:${node.bbox.y}px`,
      `width:${node.bbox.width}px`,
      `height:${node.bbox.height}px`,
      `z-index:${node.zIndex}`,
    ];

    if (node.style.backgroundColor && options.preserveColors) {
      style.push(`background-color:${node.style.backgroundColor}`);
    }
    if (node.style.border) {
      style.push(`border:${node.style.border.width}px ${node.style.border.style} ${node.style.border.color}`);
      if (node.style.borderRadius) style.push(`border-radius:${node.style.borderRadius}px`);
    }
    if (node.style.shadow) {
      style.push(`box-shadow:${node.style.shadow.offsetX}px ${node.style.shadow.offsetY}px ${node.style.shadow.blur}px ${node.style.shadow.spread}px ${node.style.shadow.color}`);
    }
    if (node.style.opacity < 1) style.push(`opacity:${node.style.opacity}`);
    if (node.style.padding) {
      style.push(`padding:${node.style.padding.top}px ${node.style.padding.right}px ${node.style.padding.bottom}px ${node.style.padding.left}px`);
    }

    let innerHtml = '';

    if (node.content.kind === 'text') {
      const tc = node.content as TextContent;
      style.push(`font-family:'${tc.font.family}',sans-serif`);
      style.push(`font-size:${tc.font.size}px`);
      style.push(`font-weight:${tc.font.weight}`);
      style.push(`line-height:${tc.font.lineHeight}`);
      style.push(`color:${tc.color}`);
      style.push(`text-align:${tc.alignment}`);
      if (tc.direction === 'rtl') style.push('direction:rtl');
      if (tc.font.letterSpacing) style.push(`letter-spacing:${tc.font.letterSpacing}px`);
      if (tc.textDecoration !== 'none') style.push(`text-decoration:${tc.textDecoration}`);
      innerHtml = this.escapeHtml(tc.text);
    }

    if (node.content.kind === 'table') {
      const table = node.content as TableContent;
      style.push('overflow:auto');
      let tableHtml = '<table style="width:100%;border-collapse:collapse;">';

      tableHtml += '<thead><tr>';
      for (const header of table.headers) {
        tableHtml += `<th style="background:${table.headerStyle.backgroundColor};color:${table.headerStyle.color};padding:4px 8px;border:1px solid #ddd;font-weight:bold;text-align:${header.alignment};">${this.escapeHtml(header.value)}</th>`;
      }
      tableHtml += '</tr></thead>';

      tableHtml += '<tbody>';
      for (let ri = 0; ri < table.rows.length; ri++) {
        const bgColor = table.alternateRowColor && ri % 2 === 1 ? `background:${table.alternateRowColor};` : '';
        tableHtml += `<tr style="${bgColor}">`;
        for (const cell of table.rows[ri]) {
          const cellStyle = [
            'padding:4px 8px',
            'border:1px solid #ddd',
            `text-align:${cell.alignment}`,
          ];
          if (cell.backgroundColor) cellStyle.push(`background:${cell.backgroundColor}`);
          if (cell.color) cellStyle.push(`color:${cell.color}`);

          const attrs = [];
          if (cell.colSpan > 1) attrs.push(`colspan="${cell.colSpan}"`);
          if (cell.rowSpan > 1) attrs.push(`rowspan="${cell.rowSpan}"`);

          tableHtml += `<td style="${cellStyle.join(';')}" ${attrs.join(' ')}>${this.escapeHtml(cell.value)}</td>`;
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';
      innerHtml = tableHtml;
    }

    if (node.content.kind === 'kpi') {
      const kpi = node.content as KpiContent;
      style.push('display:flex;flex-direction:column;align-items:center;justify-content:center');
      const arrow = kpi.trend === 'up' ? '▲' : kpi.trend === 'down' ? '▼' : '●';
      innerHtml = `<div style="color:#666;font-size:12px;">${this.escapeHtml(kpi.label)}</div>
<div style="font-size:28px;font-weight:bold;">${this.escapeHtml(kpi.value)}</div>
<div style="color:${kpi.trendColor};font-size:12px;">${arrow} ${this.escapeHtml(kpi.trendValue)}</div>`;
    }

    if (node.content.kind === 'image') {
      const img = node.content as ImageContent;
      if (img.isVector && img.vectorData) {
        innerHtml = img.vectorData;
      } else if (img.src) {
        innerHtml = `<img src="${this.escapeHtml(img.src)}" alt="${this.escapeHtml(img.alt)}" style="width:100%;height:100%;object-fit:${img.objectFit};">`;
      }
    }

    const childrenHtml = node.children
      .map((child: LayoutNode) => this.renderNodeToHtml(child, options, pageDimensions))
      .join('\n');

    return `<div style="${style.join(';')}">${innerHtml}${childrenHtml}</div>`;
  }

  // ─── DOCX Generation (Office Open XML) ──────────────────────────────────────

  private async generateDocx(
    graph: CanonicalLayoutGraph,
    outputPath: string,
    options: GenerationOptions,
  ): Promise<GenerationResult> {
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
      WidthType, AlignmentType, BorderStyle, HeadingLevel, PageBreak } = await import('docx');
    let elementsRendered = 0;
    const docChildren: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];
    const isRtl = options.rtlSupport && graph.metadata.direction === 'rtl';

    for (let pageIdx = 0; pageIdx < graph.pages.length; pageIdx++) {
      const page = graph.pages[pageIdx];
      if (pageIdx > 0) {
        docChildren.push(new Paragraph({ children: [new PageBreak()] }));
      }

      const allNodes = this.flattenNodes(page.rootNode);

      for (const node of allNodes) {
        if (node.type === 'page' || node.type === 'container') continue;

        if (node.content.kind === 'text') {
          const tc = node.content as TextContent;
          const isBold = tc.font.weight >= 700;
          const fontSize = Math.max(16, Math.round(tc.font.size * 2));

          let heading: typeof HeadingLevel[keyof typeof HeadingLevel] | undefined;
          if (tc.font.size >= 28) heading = HeadingLevel.HEADING_1;
          else if (tc.font.size >= 22) heading = HeadingLevel.HEADING_2;
          else if (tc.font.size >= 18) heading = HeadingLevel.HEADING_3;

          const alignment = tc.alignment === 'center' ? AlignmentType.CENTER
            : tc.alignment === 'right' || (isRtl && tc.alignment !== 'left') ? AlignmentType.RIGHT
            : tc.alignment === 'justify' ? AlignmentType.JUSTIFIED
            : AlignmentType.LEFT;

          const lines = tc.text.split('\n');
          for (const line of lines) {
            docChildren.push(new Paragraph({
              heading,
              alignment,
              bidirectional: isRtl,
              children: [
                new TextRun({
                  text: line,
                  bold: isBold,
                  italics: tc.font.style === 'italic',
                  size: fontSize,
                  font: options.preserveFonts ? tc.font.family : 'Arial',
                  color: tc.color.replace('#', ''),
                  rightToLeft: tc.direction === 'rtl',
                }),
              ],
            }));
          }
          elementsRendered++;
        }

        if (node.content.kind === 'table') {
          const tableContent = node.content as TableContent;
          const rows: Array<InstanceType<typeof TableRow>> = [];

          const headerCells = tableContent.headers.map((h: { value: string }) =>
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: h.value, bold: true, size: 20, color: tableContent.headerStyle.color.replace('#', '') })],
                alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              })],
              width: { size: Math.floor(9000 / Math.max(tableContent.headers.length, 1)), type: WidthType.DXA },
              shading: { fill: tableContent.headerStyle.backgroundColor.replace('#', '') },
            })
          );
          rows.push(new TableRow({ children: headerCells, tableHeader: true }));

          for (const row of tableContent.rows) {
            const cells = row.map((cell: { value: string; color?: string | null }) =>
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: cell.value, size: 18, color: (cell.color || '#000000').replace('#', '') })],
                })],
                width: { size: Math.floor(9000 / Math.max(tableContent.headers.length, 1)), type: WidthType.DXA },
              })
            );
            rows.push(new TableRow({ children: cells }));
          }

          docChildren.push(new Table({
            rows,
            width: { size: 9000, type: WidthType.DXA },
          }));
          elementsRendered++;
        }

        if (node.content.kind === 'kpi') {
          const kpi = node.content as KpiContent;
          const arrow = kpi.trend === 'up' ? '▲' : kpi.trend === 'down' ? '▼' : '●';
          docChildren.push(new Paragraph({
            children: [
              new TextRun({ text: kpi.label, size: 20, color: '666666' }),
            ],
          }));
          docChildren.push(new Paragraph({
            children: [
              new TextRun({ text: kpi.value, size: 48, bold: true }),
            ],
          }));
          docChildren.push(new Paragraph({
            children: [
              new TextRun({ text: `${arrow} ${kpi.trendValue}`, size: 20, color: kpi.trendColor.replace('#', '') }),
            ],
            spacing: { after: 200 },
          }));
          elementsRendered++;
        }
      }
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: {
              width: graph.pages[0]?.dimensions.width ? Math.round(graph.pages[0].dimensions.width * 15) : 12240,
              height: graph.pages[0]?.dimensions.height ? Math.round(graph.pages[0].dimensions.height * 15) : 15840,
            },
          },
        },
        children: docChildren,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(outputPath, buffer);
    const stat = await fs.stat(outputPath);

    return {
      id: '',
      outputPath,
      outputFormat: 'docx',
      fileSize: stat.size,
      pageCount: graph.pages.length,
      elementsRendered,
      processingTimeMs: 0,
    };
  }

  // ─── XLSX Generation ────────────────────────────────────────────────────────

  private async generateXlsx(
    graph: CanonicalLayoutGraph,
    outputPath: string,
    options: GenerationOptions,
  ): Promise<GenerationResult> {
    const excelJsModule = await import('exceljs');
    const WorkbookCtor = excelJsModule.Workbook ?? excelJsModule.default?.Workbook;
    if (!WorkbookCtor) {
      throw new Error('ExcelJS Workbook constructor unavailable');
    }
    let elementsRendered = 0;
    const tables: TableContent[] = [];
    const kpis: KpiContent[] = [];
    const texts: Array<{ text: string; fontSize: number }> = [];

    for (const page of graph.pages) {
      const allNodes = this.flattenNodes(page.rootNode);
      for (const node of allNodes) {
        if (node.content.kind === 'table') tables.push(node.content as TableContent);
        if (node.content.kind === 'kpi') kpis.push(node.content as KpiContent);
        if (node.content.kind === 'text') {
          const tc = node.content as TextContent;
          texts.push({ text: tc.text, fontSize: tc.font.size });
        }
      }
    }

    const workbook = new WorkbookCtor();
    workbook.creator = 'Rasid Platform';
    workbook.created = new Date();

    if (tables.length > 0) {
      for (let ti = 0; ti < tables.length; ti++) {
        const table = tables[ti];
        const sheet = workbook.addWorksheet(`Data ${ti + 1}`);
        const isRtl = options.rtlSupport && graph.metadata.direction === 'rtl';
        if (isRtl) {
          sheet.views = [{ rightToLeft: true }];
        }

        const headerRow = sheet.addRow(table.headers.map((h: { value: string }) => h.value));
        headerRow.font = { bold: true, size: 11, color: { argb: table.headerStyle.color.replace('#', 'FF') } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: table.headerStyle.backgroundColor.replace('#', 'FF') },
        };
        headerRow.alignment = { horizontal: isRtl ? 'right' : 'left', vertical: 'middle' };

        for (const row of table.rows) {
          const dataRow = sheet.addRow(row.map((cell: { value: string }) => {
            const num = Number(cell.value);
            return !isNaN(num) && cell.value.trim() !== '' ? num : cell.value;
          }));
          dataRow.alignment = { horizontal: isRtl ? 'right' : 'left' };
        }

        if (table.columnWidths && table.columnWidths.length > 0) {
          table.columnWidths.forEach((w: number, ci: number) => {
            const col = sheet.getColumn(ci + 1);
            col.width = Math.max(8, Math.min(50, w / 7));
          });
        } else {
          for (let ci = 1; ci <= table.headers.length; ci++) {
            sheet.getColumn(ci).width = 15;
          }
        }

        sheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: table.headers.length },
        };

        elementsRendered++;
      }
    }

    if (kpis.length > 0) {
      const kpiSheet = workbook.addWorksheet('KPIs');
      const isRtl = options.rtlSupport && graph.metadata.direction === 'rtl';
      if (isRtl) kpiSheet.views = [{ rightToLeft: true }];

      const kpiHeader = kpiSheet.addRow(['KPI', 'Value', 'Trend', 'Trend Value']);
      kpiHeader.font = { bold: true, size: 12 };
      kpiHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
      kpiHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };

      for (const kpi of kpis) {
        const arrow = kpi.trend === 'up' ? '▲' : kpi.trend === 'down' ? '▼' : '●';
        const row = kpiSheet.addRow([kpi.label, kpi.value, `${arrow} ${kpi.trend}`, kpi.trendValue]);
        row.getCell(3).font = { color: { argb: kpi.trendColor.replace('#', 'FF') } };
      }

      kpiSheet.getColumn(1).width = 25;
      kpiSheet.getColumn(2).width = 20;
      kpiSheet.getColumn(3).width = 15;
      kpiSheet.getColumn(4).width = 15;
      elementsRendered += kpis.length;
    }

    if (texts.length > 0 && tables.length === 0 && kpis.length === 0) {
      const textSheet = workbook.addWorksheet('Content');
      const isRtl = options.rtlSupport && graph.metadata.direction === 'rtl';
      if (isRtl) textSheet.views = [{ rightToLeft: true }];

      for (const t of texts) {
        const row = textSheet.addRow([t.text]);
        row.font = { size: Math.max(8, Math.min(18, Math.round(t.fontSize * 0.75))) };
      }
      textSheet.getColumn(1).width = 80;
      elementsRendered += texts.length;
    }

    await workbook.xlsx.writeFile(outputPath);
    const stat = await fs.stat(outputPath);

    return {
      id: '',
      outputPath,
      outputFormat: 'xlsx',
      fileSize: stat.size,
      pageCount: workbook.worksheets.length,
      elementsRendered,
      processingTimeMs: 0,
    };
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private flattenNodes(node: LayoutNode): LayoutNode[] {
    const result: LayoutNode[] = [node];
    for (const child of node.children) {
      result.push(...this.flattenNodes(child));
    }
    return result;
  }

  private collectTables(node: LayoutNode, tables: TableContent[]): void {
    if (node.content.kind === 'table') {
      tables.push(node.content as TableContent);
    }
    for (const child of node.children) {
      this.collectTables(child, tables);
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
