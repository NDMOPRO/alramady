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
} from '@rasid/shared';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'data-extraction' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

// ─── Exported Types ─────────────────────────────────────────────────────────

export interface ExtractedDatasets {
  tables: ExtractedTable[];
  charts: ExtractedChart[];
  kpis: ExtractedKPI[];
  textBlocks: ExtractedTextBlock[];
  lists: ExtractedList[];
  extractedAt: string;
  sourceGraphId: string;
  totalElements: number;
}

export interface ExtractedTable {
  nodeId: string;
  pageNumber: number;
  title: string | null;
  headers: string[];
  rows: string[][];
  columnTypes: ('text' | 'number' | 'date' | 'currency' | 'percentage')[];
  rowCount: number;
  columnCount: number;
}

export interface ExtractedChart {
  nodeId: string;
  pageNumber: number;
  chartType: string;
  title: string;
  subtitle: string | null;
  xAxisLabel: string | null;
  yAxisLabel: string | null;
  series: Array<{ name: string; data: Array<{ label: string; value: number }> }>;
  colors: string[];
  totalDataPoints: number;
}

export interface ExtractedKPI {
  nodeId: string;
  pageNumber: number;
  label: string;
  value: string;
  numericValue: number | null;
  unit: string;
  trend: 'up' | 'down' | 'neutral';
  trendValue: string;
  trendColor: string;
}

export interface ExtractedTextBlock {
  nodeId: string;
  pageNumber: number;
  role: 'heading' | 'subheading' | 'paragraph' | 'caption' | 'label';
  text: string;
  fontSize: number;
  fontWeight: number;
  language: string;
  direction: 'ltr' | 'rtl' | 'auto';
}

export interface ExtractedList {
  nodeId: string;
  pageNumber: number;
  listType: 'bullet' | 'numbered';
  items: string[];
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

interface NodeWithPage {
  node: LayoutNode;
  pageNumber: number;
}

function collectNodes(root: LayoutNode, pageNumber: number): NodeWithPage[] {
  const result: NodeWithPage[] = [{ node: root, pageNumber }];
  for (const child of root.children) {
    result.push(...collectNodes(child, pageNumber));
  }
  return result;
}

function collectAllNodes(graph: CanonicalLayoutGraph): NodeWithPage[] {
  const all: NodeWithPage[] = [];
  for (const page of graph.pages) {
    all.push(...collectNodes(page.rootNode, page.pageNumber));
  }
  return all;
}

/**
 * Infer column type from TableCell type values, mapping 'formula' to 'text'.
 */
function mapCellType(
  cellType: string,
): 'text' | 'number' | 'date' | 'currency' | 'percentage' {
  if (cellType === 'formula') {
    return 'text';
  }
  return cellType as 'text' | 'number' | 'date' | 'currency' | 'percentage';
}

/**
 * Parse a numeric value from a KPI value string.
 * Strips commas, currency symbols, percentage signs, and common Arabic currency text.
 */
function parseNumericValue(value: string): number | null {
  const cleaned = value
    .replace(/[,،]/g, '')
    .replace(/[$€£¥₹﷼]/g, '')
    .replace(/%/g, '')
    .replace(/ر\.س\.?/g, '')
    .replace(/ريال/g, '')
    .replace(/\s/g, '');

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Infer text role from node type and font properties.
 */
function inferTextRole(
  nodeType: string,
  fontSize: number,
  fontWeight: number,
): 'heading' | 'subheading' | 'paragraph' | 'caption' | 'label' {
  if (nodeType === 'heading') return 'heading';
  if (nodeType === 'footer' || nodeType === 'header') return 'label';

  if (fontSize >= 24) return 'heading';
  if (fontSize >= 18) return 'subheading';
  if (fontSize <= 10) return 'caption';
  if (fontWeight >= 600 && fontSize <= 14) return 'label';

  return 'paragraph';
}

/**
 * Find a nearby heading node that could serve as a table title.
 * Looks among siblings that precede the given node in reading order.
 */
function findTableTitle(
  allNodesOnPage: NodeWithPage[],
  tableNode: LayoutNode,
): string | null {
  const headingCandidates = allNodesOnPage
    .filter(
      (nwp) =>
        (nwp.node.type === 'heading' || nwp.node.type === 'text-block') &&
        nwp.node.readingOrder < tableNode.readingOrder &&
        nwp.node.content.kind === 'text',
    )
    .sort((a, b) => b.node.readingOrder - a.node.readingOrder);

  if (headingCandidates.length > 0) {
    const content = headingCandidates[0].node.content as TextContent;
    return content.text || null;
  }
  return null;
}

/**
 * Escape a CSV field value, wrapping in quotes if it contains commas,
 * quotes, or newlines.
 */
function escapeCsvField(field: string): string {
  if (field.includes('"') || field.includes(',') || field.includes('\n') || field.includes('\r')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class DataExtractionService {
  /**
   * Extract all datasets from a CanonicalLayoutGraph.
   */
  extractAll(graph: CanonicalLayoutGraph): ExtractedDatasets {
    logger.info('Starting full data extraction', { graphId: graph.id, pageCount: graph.pages.length });

    try {
      const tables = this.extractTables(graph);
      const charts = this.extractCharts(graph);
      const kpis = this.extractKPIs(graph);
      const textBlocks = this.extractTextBlocks(graph);
      const lists = this.extractLists(graph);

      const totalElements = tables.length + charts.length + kpis.length + textBlocks.length + lists.length;

      const datasets: ExtractedDatasets = {
        tables,
        charts,
        kpis,
        textBlocks,
        lists,
        extractedAt: new Date().toISOString(),
        sourceGraphId: graph.id,
        totalElements,
      };

      logger.info('Data extraction complete', {
        graphId: graph.id,
        tables: tables.length,
        charts: charts.length,
        kpis: kpis.length,
        textBlocks: textBlocks.length,
        lists: lists.length,
        totalElements,
      });

      return datasets;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to extract all datasets', { graphId: graph.id, error: message });
      throw error;
    }
  }

  /**
   * Extract all table nodes from the graph.
   */
  extractTables(graph: CanonicalLayoutGraph): ExtractedTable[] {
    const results: ExtractedTable[] = [];

    for (const page of graph.pages) {
      const pageNodes = collectNodes(page.rootNode, page.pageNumber);
      const tableNodes = pageNodes.filter((nwp) => nwp.node.type === 'table' && nwp.node.content.kind === 'table');

      for (const { node, pageNumber } of tableNodes) {
        try {
          const content = node.content as TableContent;
          const headers = content.headers.map((cell) => cell.value);

          const rows = content.rows.map((row) => row.map((cell) => cell.value));

          // Infer column types from first data row, falling back to headers
          const sampleRow = content.rows.length > 0 ? content.rows[0] : content.headers;
          const columnTypes = sampleRow.map((cell) => mapCellType(cell.type));

          const title = findTableTitle(pageNodes, node);

          results.push({
            nodeId: node.id,
            pageNumber,
            title,
            headers,
            rows,
            columnTypes,
            rowCount: content.rows.length,
            columnCount: headers.length,
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn('Failed to extract table node', { nodeId: node.id, pageNumber, error: message });
        }
      }
    }

    logger.debug('Extracted tables', { count: results.length });
    return results;
  }

  /**
   * Extract all chart nodes from the graph.
   */
  extractCharts(graph: CanonicalLayoutGraph): ExtractedChart[] {
    const results: ExtractedChart[] = [];
    const allNodes = collectAllNodes(graph);
    const chartNodes = allNodes.filter((nwp) => nwp.node.type === 'chart' && nwp.node.content.kind === 'chart');

    for (const { node, pageNumber } of chartNodes) {
      try {
        const content = node.content as ChartContent;

        const series = content.series.map((s) => ({
          name: s.name,
          data: s.data.map((d) => ({ label: d.label, value: d.value })),
        }));

        const totalDataPoints = series.reduce((sum, s) => sum + s.data.length, 0);

        results.push({
          nodeId: node.id,
          pageNumber,
          chartType: content.chartType,
          title: content.title,
          subtitle: content.subtitle,
          xAxisLabel: (content.xAxis as Record<string, unknown>)?.label as string ?? null,
          yAxisLabel: (content.yAxis as Record<string, unknown>)?.label as string ?? null,
          series,
          colors: [...content.colors],
          totalDataPoints,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Failed to extract chart node', { nodeId: node.id, pageNumber, error: message });
      }
    }

    logger.debug('Extracted charts', { count: results.length });
    return results;
  }

  /**
   * Extract all KPI card nodes from the graph.
   */
  extractKPIs(graph: CanonicalLayoutGraph): ExtractedKPI[] {
    const results: ExtractedKPI[] = [];
    const allNodes = collectAllNodes(graph);
    const kpiNodes = allNodes.filter((nwp) => nwp.node.type === 'kpi-card' && nwp.node.content.kind === 'kpi');

    for (const { node, pageNumber } of kpiNodes) {
      try {
        const content = node.content as KpiContent;

        results.push({
          nodeId: node.id,
          pageNumber,
          label: content.label,
          value: content.value,
          numericValue: parseNumericValue(content.value),
          unit: content.unit,
          trend: content.trend,
          trendValue: content.trendValue,
          trendColor: content.trendColor,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Failed to extract KPI node', { nodeId: node.id, pageNumber, error: message });
      }
    }

    logger.debug('Extracted KPIs', { count: results.length });
    return results;
  }

  /**
   * Extract structured text blocks (headings, paragraphs, captions, labels).
   * Excludes list items (those are handled by extractLists).
   */
  extractTextBlocks(graph: CanonicalLayoutGraph): ExtractedTextBlock[] {
    const results: ExtractedTextBlock[] = [];
    const allNodes = collectAllNodes(graph);

    const textNodeTypes = new Set([
      'heading',
      'paragraph',
      'text-block',
      'caption',
      'label',
      'header',
      'footer',
    ]);

    const textNodes = allNodes.filter(
      (nwp) => textNodeTypes.has(nwp.node.type) && nwp.node.content.kind === 'text',
    );

    for (const { node, pageNumber } of textNodes) {
      try {
        const content = node.content as TextContent;

        // Skip list items — they are extracted by extractLists
        if (content.listType !== 'none') {
          continue;
        }

        const fontSize = content.font.size;
        const fontWeight = content.font.weight;
        const role = inferTextRole(node.type, fontSize, fontWeight);

        results.push({
          nodeId: node.id,
          pageNumber,
          role,
          text: content.text,
          fontSize,
          fontWeight,
          language: content.language,
          direction: content.direction,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Failed to extract text block', { nodeId: node.id, pageNumber, error: message });
      }
    }

    logger.debug('Extracted text blocks', { count: results.length });
    return results;
  }

  /**
   * Extract list items from text nodes where listType is not 'none'.
   * Groups consecutive list items under the same parent into a single ExtractedList.
   */
  extractLists(graph: CanonicalLayoutGraph): ExtractedList[] {
    const results: ExtractedList[] = [];

    for (const page of graph.pages) {
      const pageNodes = collectNodes(page.rootNode, page.pageNumber);

      const listNodes = pageNodes.filter(
        (nwp) => nwp.node.content.kind === 'text' && (nwp.node.content as TextContent).listType !== 'none',
      );

      // Group by parentId to combine consecutive list items
      const grouped = new Map<string, NodeWithPage[]>();
      for (const nwp of listNodes) {
        const parentKey = nwp.node.parentId ?? `orphan-${nwp.node.id}`;
        const existing = grouped.get(parentKey);
        if (existing) {
          existing.push(nwp);
        } else {
          grouped.set(parentKey, [nwp]);
        }
      }

      for (const [, group] of grouped) {
        try {
          // Sort by reading order
          group.sort((a, b) => a.node.readingOrder - b.node.readingOrder);

          const firstContent = group[0].node.content as TextContent;
          const listType = firstContent.listType as 'bullet' | 'numbered';
          const items = group.map((nwp) => (nwp.node.content as TextContent).text);

          results.push({
            nodeId: group[0].node.id,
            pageNumber: page.pageNumber,
            listType,
            items,
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn('Failed to extract list group', { pageNumber: page.pageNumber, error: message });
        }
      }
    }

    logger.debug('Extracted lists', { count: results.length });
    return results;
  }

  /**
   * Serialize all extracted datasets to a JSON string.
   */
  toJSON(datasets: ExtractedDatasets): string {
    try {
      return JSON.stringify(datasets, null, 2);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to serialize datasets to JSON', { error: message });
      throw error;
    }
  }

  /**
   * Convert a single extracted table to CSV format.
   * Properly escapes fields containing commas, quotes, or newlines.
   */
  toCSV(table: ExtractedTable): string {
    try {
      const lines: string[] = [];

      // Header row
      if (table.headers.length > 0) {
        lines.push(table.headers.map(escapeCsvField).join(','));
      }

      // Data rows
      for (const row of table.rows) {
        lines.push(row.map(escapeCsvField).join(','));
      }

      return lines.join('\n');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to convert table to CSV', { nodeId: table.nodeId, error: message });
      throw error;
    }
  }
}
