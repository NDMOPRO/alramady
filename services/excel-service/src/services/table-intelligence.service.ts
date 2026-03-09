import { PrismaClient, Prisma } from '@prisma/client';
import OpenAI from 'openai';
import sharp from 'sharp';
import { createLogger, format, transports } from 'winston';
import { randomUUID } from 'crypto';
import type { BoundingBox, TableContent, TableCell, MergedCell } from '@rasid/shared';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'table-intelligence' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface TableDetectionRequest {
  imageBuffer: Buffer;
  options?: TableDetectionOptions;
}

export interface TableDetectionOptions {
  detectMergedCells: boolean;
  detectHeaders: boolean;
  detectHierarchy: boolean;
  extractFormatting: boolean;
  inferDataTypes: boolean;
  languages: string[];
}

const DEFAULT_OPTIONS: TableDetectionOptions = {
  detectMergedCells: true,
  detectHeaders: true,
  detectHierarchy: true,
  extractFormatting: true,
  inferDataTypes: true,
  languages: ['ar', 'en'],
};

export interface TableDetectionResult {
  id: string;
  tables: DetectedTable[];
  processingTimeMs: number;
}

export interface DetectedTable {
  id: string;
  bbox: BoundingBox;
  rowCount: number;
  columnCount: number;
  headerRowCount: number;
  headerColumnCount: number;
  cells: DetectedCell[];
  mergedCells: MergedCell[];
  columnWidths: number[];
  rowHeights: number[];
  style: TableStyle;
  confidence: number;
  hierarchy: TableHierarchy | null;
  canonicalContent: TableContent;
}

export interface DetectedCell {
  row: number;
  column: number;
  text: string;
  bbox: BoundingBox;
  isHeader: boolean;
  dataType: 'text' | 'number' | 'date' | 'currency' | 'percentage' | 'formula' | 'empty';
  numericValue: number | null;
  colSpan: number;
  rowSpan: number;
  alignment: 'left' | 'center' | 'right';
  fontWeight: 'normal' | 'bold';
  backgroundColor: string | null;
  textColor: string | null;
  confidence: number;
}

export interface TableStyle {
  borderStyle: 'full' | 'horizontal' | 'minimal' | 'none';
  headerBackgroundColor: string;
  headerTextColor: string;
  alternateRowColor: string | null;
  borderColor: string;
  borderWidth: number;
  fontSize: number;
  fontFamily: string;
}

export interface TableHierarchy {
  levels: number;
  indentColumn: number;
  levelIndicators: Array<{ row: number; level: number; label: string }>;
}

export interface ExcelConversionResult {
  workbookId: string;
  sheetName: string;
  cellRange: string;
  rowCount: number;
  columnCount: number;
  formulasApplied: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class TableIntelligenceService {
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }

  async detectTables(request: TableDetectionRequest): Promise<TableDetectionResult> {
    const startTime = Date.now();
    const options = { ...DEFAULT_OPTIONS, ...request.options };
    const resultId = randomUUID();

    logger.info('Starting table detection', { detectMerged: options.detectMergedCells });

    const meta = await sharp(request.imageBuffer).metadata();
    const width = meta.width || 1920;
    const height = meta.height || 1080;

    const resized = await sharp(request.imageBuffer)
      .resize({ width: Math.min(width, 4096), fit: 'inside' })
      .png()
      .toBuffer();
    const base64 = resized.toString('base64');

    const tables = await this.detectAndExtractTables(base64, width, height, options);

    for (const table of tables) {
      if (options.inferDataTypes) {
        this.inferCellDataTypes(table);
      }
      if (options.detectHierarchy) {
        table.hierarchy = this.detectTableHierarchy(table);
      }
      table.canonicalContent = this.toCanonicalContent(table);
    }

    const result: TableDetectionResult = {
      id: resultId,
      tables,
      processingTimeMs: Date.now() - startTime,
    };

    logger.info('Table detection complete', {
      tables: tables.length,
      processingTimeMs: result.processingTimeMs,
    });

    return result;
  }

  async convertToExcel(
    table: DetectedTable,
    workbookId: string,
    sheetName: string,
  ): Promise<ExcelConversionResult> {
    logger.info('Converting detected table to Excel format', {
      rows: table.rowCount,
      columns: table.columnCount,
      workbookId,
    });

    const cellRange = `A1:${this.columnToLetter(table.columnCount)}${table.rowCount + table.headerRowCount}`;
    let formulasApplied = 0;

    try {
      const workbook = await this.prisma.workbook.findUnique({ where: { id: workbookId } });
      if (workbook) {
        const existingData = (workbook.sheetsJson as Record<string, unknown>) || {};
        const sheets = (existingData.sheets || []) as Array<Record<string, unknown>>;

        const newSheet: Record<string, unknown> = {
          name: sheetName,
          cells: {} as Record<string, unknown>,
          columnWidths: table.columnWidths.map((w) => Math.max(60, Math.round(w * 0.8))),
          rowHeights: table.rowHeights.map((h) => Math.max(20, Math.round(h * 0.8))),
        };

        const cells = newSheet.cells as Record<string, unknown>;

        for (const cell of table.cells) {
          const colLetter = this.columnToLetter(cell.column + 1);
          const rowNum = cell.row + 1;
          const cellRef = `${colLetter}${rowNum}`;

          const cellData: Record<string, unknown> = {
            value: cell.dataType === 'number' || cell.dataType === 'currency' || cell.dataType === 'percentage'
              ? cell.numericValue
              : cell.text,
            type: cell.dataType,
            format: this.getCellFormat(cell),
            style: {
              fontWeight: cell.fontWeight,
              alignment: cell.alignment,
              backgroundColor: cell.backgroundColor,
              color: cell.textColor,
            },
          };

          if (cell.colSpan > 1 || cell.rowSpan > 1) {
            cellData.merge = {
              cols: cell.colSpan,
              rows: cell.rowSpan,
            };
          }

          cells[cellRef] = cellData;

          if (cell.dataType === 'number' && cell.row === table.rowCount - 1) {
            const sumColLetter = this.columnToLetter(cell.column + 1);
            const startRow = table.headerRowCount + 1;
            const endRow = cell.row;
            if (endRow > startRow) {
              cellData.formula = `SUM(${sumColLetter}${startRow}:${sumColLetter}${endRow})`;
              formulasApplied++;
            }
          }
        }

        sheets.push(newSheet);
        existingData.sheets = sheets;

        await this.prisma.workbook.update({
          where: { id: workbookId },
          data: { sheetsJson: existingData as unknown as Prisma.InputJsonValue },
        });
      }
    } catch (err) {
      logger.warn('Failed to write table to workbook', {
        workbookId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      workbookId,
      sheetName,
      cellRange,
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      formulasApplied,
    };
  }

  // ─── Detection ──────────────────────────────────────────────────────────────

  private async detectAndExtractTables(
    base64: string,
    width: number,
    height: number,
    options: TableDetectionOptions,
  ): Promise<DetectedTable[]> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert table detection and extraction model (Table Transformer / PubTables / DeepDeSRT).
Detect ALL tables in this image (${width}x${height}px).
Languages: ${options.languages.join(', ')}

For each table provide:
{
  "id": "unique_string",
  "bbox": {"x": px, "y": px, "width": px, "height": px},
  "rowCount": N,
  "columnCount": N,
  "headerRowCount": N,
  "headerColumnCount": N,
  "cells": [
    {
      "row": 0, "column": 0,
      "text": "cell text",
      "bbox": {"x": px, "y": px, "width": px, "height": px},
      "isHeader": true/false,
      "colSpan": 1, "rowSpan": 1,
      "alignment": "left/center/right",
      "fontWeight": "normal/bold",
      "backgroundColor": "#hex or null",
      "textColor": "#hex or null",
      "confidence": 0.95
    }
  ],
  "mergedCells": [{"startRow": 0, "startCol": 0, "endRow": 0, "endCol": 1}],
  "columnWidths": [px, px],
  "rowHeights": [px, px],
  "style": {
    "borderStyle": "full/horizontal/minimal/none",
    "headerBackgroundColor": "#hex",
    "headerTextColor": "#hex",
    "alternateRowColor": "#hex or null",
    "borderColor": "#hex",
    "borderWidth": px,
    "fontSize": px,
    "fontFamily": "font name"
  },
  "confidence": 0.9
}

Return JSON: { "tables": [...] }`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } },
            { type: 'text', text: 'Detect and extract all tables with cell-level detail.' },
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

    return (Array.isArray(parsed.tables) ? parsed.tables : []).map((t: Record<string, unknown>) => {
      const cells: DetectedCell[] = (Array.isArray(t.cells) ? t.cells : []).map((c: Record<string, unknown>) => ({
        row: Number(c.row) || 0,
        column: Number(c.column) || 0,
        text: String(c.text || ''),
        bbox: this.parseBbox(c.bbox, width, height),
        isHeader: Boolean(c.isHeader),
        dataType: 'text' as const,
        numericValue: null,
        colSpan: Number(c.colSpan) || 1,
        rowSpan: Number(c.rowSpan) || 1,
        alignment: (c.alignment || 'left') as DetectedCell['alignment'],
        fontWeight: (c.fontWeight || 'normal') as DetectedCell['fontWeight'],
        backgroundColor: c.backgroundColor ? String(c.backgroundColor) : null,
        textColor: c.textColor ? String(c.textColor) : null,
        confidence: Number(c.confidence) || 0.8,
      }));

      const style = t.style && typeof t.style === 'object' ? t.style as Record<string, unknown> : {};

      return {
        id: String(t.id || randomUUID()),
        bbox: this.parseBbox(t.bbox, width, height),
        rowCount: Number(t.rowCount) || 0,
        columnCount: Number(t.columnCount) || 0,
        headerRowCount: Number(t.headerRowCount) || 1,
        headerColumnCount: Number(t.headerColumnCount) || 0,
        cells,
        mergedCells: (Array.isArray(t.mergedCells) ? t.mergedCells : []).map((m: Record<string, unknown>) => ({
          startRow: Number(m.startRow) || 0,
          startCol: Number(m.startCol) || 0,
          endRow: Number(m.endRow) || 0,
          endCol: Number(m.endCol) || 0,
        })),
        columnWidths: Array.isArray(t.columnWidths) ? (t.columnWidths as number[]) : [],
        rowHeights: Array.isArray(t.rowHeights) ? (t.rowHeights as number[]) : [],
        style: {
          borderStyle: (style.borderStyle || 'full') as TableStyle['borderStyle'],
          headerBackgroundColor: String(style.headerBackgroundColor || '#f0f0f0'),
          headerTextColor: String(style.headerTextColor || '#000000'),
          alternateRowColor: style.alternateRowColor ? String(style.alternateRowColor) : null,
          borderColor: String(style.borderColor || '#d0d0d0'),
          borderWidth: Number(style.borderWidth) || 1,
          fontSize: Number(style.fontSize) || 14,
          fontFamily: String(style.fontFamily || 'sans-serif'),
        },
        confidence: Number(t.confidence) || 0.8,
        hierarchy: null,
        canonicalContent: null as unknown as TableContent,
      };
    });
  }

  // ─── Data Type Inference ────────────────────────────────────────────────────

  private inferCellDataTypes(table: DetectedTable): void {
    for (const cell of table.cells) {
      if (cell.isHeader) {
        cell.dataType = 'text';
        continue;
      }

      const text = cell.text.trim();
      if (!text) {
        cell.dataType = 'empty';
        continue;
      }

      if (/^[\d,]+\.?\d*\s*%$/.test(text)) {
        cell.dataType = 'percentage';
        cell.numericValue = parseFloat(text.replace(/[%,\s]/g, ''));
        continue;
      }

      if (/^[\$\€\£\¥﷼]?\s?[\d,]+\.?\d*$/.test(text) || /^[\d,]+\.?\d*\s?[\$\€\£\¥﷼]$/.test(text)) {
        cell.dataType = 'currency';
        cell.numericValue = parseFloat(text.replace(/[^\d.-]/g, ''));
        continue;
      }

      if (/^\d{1,4}[-\/\.]\d{1,2}[-\/\.]\d{1,4}$/.test(text)) {
        cell.dataType = 'date';
        continue;
      }

      const numericText = text.replace(/,/g, '');
      if (/^-?[\d.]+$/.test(numericText)) {
        cell.dataType = 'number';
        cell.numericValue = parseFloat(numericText);
        continue;
      }

      cell.dataType = 'text';
    }
  }

  // ─── Hierarchy Detection ────────────────────────────────────────────────────

  private detectTableHierarchy(table: DetectedTable): TableHierarchy | null {
    if (table.columnCount < 2) return null;

    const firstColCells = table.cells
      .filter((c) => c.column === 0 && !c.isHeader)
      .sort((a, b) => a.row - b.row);

    const indents = firstColCells.map((c) => {
      const leadingSpaces = (c.text.match(/^[\s\u00A0]+/) || [''])[0].length;
      return { row: c.row, indent: leadingSpaces, text: c.text.trim() };
    });

    const uniqueIndents = [...new Set(indents.map((i) => i.indent))].sort((a, b) => a - b);
    if (uniqueIndents.length < 2) return null;

    const levelIndicators = indents.map((ind) => ({
      row: ind.row,
      level: uniqueIndents.indexOf(ind.indent),
      label: ind.text,
    }));

    return {
      levels: uniqueIndents.length,
      indentColumn: 0,
      levelIndicators,
    };
  }

  // ─── Canonical Conversion ───────────────────────────────────────────────────

  private toCanonicalContent(table: DetectedTable): TableContent {
    const headerCells = table.cells
      .filter((c) => c.isHeader)
      .sort((a, b) => a.column - b.column);

    const dataCells = table.cells
      .filter((c) => !c.isHeader)
      .sort((a, b) => a.row - b.row || a.column - b.column);

    const headers: TableCell[] = headerCells.map((c) => ({
      value: c.text,
      type: 'text',
      font: null,
      color: c.textColor,
      backgroundColor: c.backgroundColor,
      alignment: c.alignment,
      verticalAlignment: 'middle',
      colSpan: c.colSpan,
      rowSpan: c.rowSpan,
    }));

    const rowMap = new Map<number, TableCell[]>();
    for (const cell of dataCells) {
      if (!rowMap.has(cell.row)) rowMap.set(cell.row, []);
      rowMap.get(cell.row)!.push({
        value: cell.text,
        type: cell.dataType as TableCell['type'],
        font: null,
        color: cell.textColor,
        backgroundColor: cell.backgroundColor,
        alignment: cell.alignment,
        verticalAlignment: 'middle',
        colSpan: cell.colSpan,
        rowSpan: cell.rowSpan,
      });
    }

    const rows = Array.from(rowMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, cells]) => cells);

    return {
      kind: 'table',
      headers,
      rows,
      mergedCells: table.mergedCells,
      headerRows: table.headerRowCount,
      headerColumns: table.headerColumnCount,
      columnWidths: table.columnWidths,
      rowHeights: table.rowHeights,
      borderStyle: table.style.borderStyle,
      alternateRowColor: table.style.alternateRowColor,
      headerStyle: {
        backgroundColor: table.style.headerBackgroundColor,
        font: {
          id: randomUUID(),
          family: table.style.fontFamily,
          size: table.style.fontSize,
          weight: 700,
          style: 'normal',
          lineHeight: 1.4,
          letterSpacing: 0,
          kerning: 0,
          usage: 'label',
          confidence: 0.8,
          fallbackFamilies: [],
        },
        color: table.style.headerTextColor,
      },
    };
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private parseBbox(raw: unknown, pageWidth: number, pageHeight: number): BoundingBox {
    if (!raw || typeof raw !== 'object') return { x: 0, y: 0, width: pageWidth, height: pageHeight };
    const r = raw as Record<string, unknown>;
    return {
      x: Math.max(0, Number(r.x) || 0),
      y: Math.max(0, Number(r.y) || 0),
      width: Math.max(1, Number(r.width) || 100),
      height: Math.max(1, Number(r.height) || 20),
    };
  }

  private columnToLetter(col: number): string {
    let letter = '';
    let c = col;
    while (c > 0) {
      c--;
      letter = String.fromCharCode(65 + (c % 26)) + letter;
      c = Math.floor(c / 26);
    }
    return letter;
  }

  private getCellFormat(cell: DetectedCell): string {
    switch (cell.dataType) {
      case 'currency': return '#,##0.00';
      case 'percentage': return '0.00%';
      case 'number': return '#,##0.##';
      case 'date': return 'YYYY-MM-DD';
      default: return '@';
    }
  }
}
