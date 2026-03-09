import { createLogger, format, transports } from 'winston';
import type {
  CanonicalLayoutGraph,
  LayoutNode,
  PageNode,
  TextContent,
  TableContent,
  ChartContent,
  KpiContent,
} from '@rasid/shared';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: 'data-binding' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

// ─── Exported Types ─────────────────────────────────────────────────────────

export interface DatasetBindings {
  tables?: Record<string, TableBinding>;
  charts?: Record<string, ChartBinding>;
  kpis?: Record<string, KPIBinding>;
  texts?: Record<string, string>;
}

export interface TableBinding {
  headers?: string[];
  rows: string[][];
}

export interface ChartBinding {
  series: Array<{ name: string; data: Array<{ label: string; value: number }> }>;
  colors?: string[];
}

export interface KPIBinding {
  value: string;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  trendColor?: string;
}

export interface BindableNode {
  nodeId: string;
  pageNumber: number;
  type: 'table' | 'chart' | 'kpi' | 'text';
  currentLabel: string;
}

export interface BindingValidationResult {
  valid: boolean;
  errors: Array<{ nodeId: string; message: string }>;
  warnings: Array<{ nodeId: string; message: string }>;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

type ContentKindForBinding = 'table' | 'chart' | 'kpi' | 'text';

function contentKindToBindableType(kind: string): ContentKindForBinding | null {
  switch (kind) {
    case 'table':
      return 'table';
    case 'chart':
      return 'chart';
    case 'kpi':
      return 'kpi';
    case 'text':
      return 'text';
    default:
      return null;
  }
}

function findNodeById(node: LayoutNode, targetId: string): LayoutNode | null {
  if (node.id === targetId) {
    return node;
  }
  for (const child of node.children) {
    const found = findNodeById(child, targetId);
    if (found) {
      return found;
    }
  }
  return null;
}

function findNodeInGraph(graph: CanonicalLayoutGraph, nodeId: string): LayoutNode | null {
  for (const page of graph.pages) {
    const found = findNodeById(page.rootNode, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

function findPageForNode(graph: CanonicalLayoutGraph, nodeId: string): PageNode | null {
  for (const page of graph.pages) {
    const found = findNodeById(page.rootNode, nodeId);
    if (found) {
      return page;
    }
  }
  return null;
}

function walkNodes(node: LayoutNode, callback: (n: LayoutNode) => void): void {
  callback(node);
  for (const child of node.children) {
    walkNodes(child, callback);
  }
}

function labelForNode(node: LayoutNode): string {
  const content = node.content;
  switch (content.kind) {
    case 'text':
      return (content as TextContent).text.slice(0, 80);
    case 'table':
      return `Table (${(content as TableContent).headers.length} cols, ${(content as TableContent).rows.length} rows)`;
    case 'chart':
      return (content as ChartContent).title || `Chart (${(content as ChartContent).chartType})`;
    case 'kpi':
      return (content as KpiContent).label || `KPI: ${(content as KpiContent).value}`;
    default:
      return node.semanticRole || node.type;
  }
}

// ─── Service ────────────────────────────────────────────────────────────────

export class DataBindingService {
  /**
   * Bind multiple datasets to the graph at once.
   * Returns a new CanonicalLayoutGraph — the original is never mutated.
   */
  bindDatasets(
    graph: CanonicalLayoutGraph,
    datasets: DatasetBindings,
  ): CanonicalLayoutGraph {
    logger.info('Binding datasets to graph', {
      graphId: graph.id,
      tables: datasets.tables ? Object.keys(datasets.tables).length : 0,
      charts: datasets.charts ? Object.keys(datasets.charts).length : 0,
      kpis: datasets.kpis ? Object.keys(datasets.kpis).length : 0,
      texts: datasets.texts ? Object.keys(datasets.texts).length : 0,
    });

    let cloned = structuredClone(graph);

    if (datasets.tables) {
      for (const [nodeId, tableData] of Object.entries(datasets.tables)) {
        cloned = this.bindTable(cloned, nodeId, tableData);
      }
    }

    if (datasets.charts) {
      for (const [nodeId, chartData] of Object.entries(datasets.charts)) {
        cloned = this.bindChart(cloned, nodeId, chartData);
      }
    }

    if (datasets.kpis) {
      for (const [nodeId, kpiData] of Object.entries(datasets.kpis)) {
        cloned = this.bindKPI(cloned, nodeId, kpiData);
      }
    }

    if (datasets.texts) {
      for (const [nodeId, text] of Object.entries(datasets.texts)) {
        cloned = this.bindText(cloned, nodeId, text);
      }
    }

    logger.info('Dataset binding complete', { graphId: cloned.id });
    return cloned;
  }

  /**
   * Replace a specific table node's content with new data.
   * The bbox (layout constraints) are preserved.
   */
  bindTable(
    graph: CanonicalLayoutGraph,
    nodeId: string,
    tableData: TableBinding,
  ): CanonicalLayoutGraph {
    const cloned = structuredClone(graph);
    const node = findNodeInGraph(cloned, nodeId);

    if (!node) {
      logger.error('Table binding failed: node not found', { nodeId });
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (node.content.kind !== 'table') {
      logger.error('Table binding failed: node is not a table', { nodeId, kind: node.content.kind });
      throw new Error(`Node ${nodeId} is not a table node (kind: ${node.content.kind})`);
    }

    const tableContent = node.content as TableContent;

    if (tableData.headers) {
      const newColCount = tableData.headers.length;
      const oldColCount = tableContent.headers.length;

      tableContent.headers = tableData.headers.map((headerValue, idx) => {
        const existing = idx < oldColCount ? tableContent.headers[idx] : null;
        return {
          value: headerValue,
          type: 'text' as const,
          font: existing?.font ?? null,
          color: existing?.color ?? null,
          backgroundColor: existing?.backgroundColor ?? null,
          alignment: existing?.alignment ?? 'right' as const,
          verticalAlignment: existing?.verticalAlignment ?? 'middle' as const,
          colSpan: 1,
          rowSpan: 1,
        };
      });

      if (newColCount !== oldColCount) {
        const totalWidth = tableContent.columnWidths.reduce((sum, w) => sum + w, 0);
        tableContent.columnWidths = Array.from(
          { length: newColCount },
          () => totalWidth / newColCount,
        );
      }
    }

    const existingColCount = tableContent.headers.length;
    tableContent.rows = tableData.rows.map((row, rowIdx) => {
      const existingRow = rowIdx < tableContent.rows.length ? tableContent.rows[rowIdx] : null;
      return row.map((cellValue, colIdx) => {
        const existingCell = existingRow && colIdx < existingRow.length ? existingRow[colIdx] : null;
        return {
          value: cellValue,
          type: 'text' as const,
          font: existingCell?.font ?? null,
          color: existingCell?.color ?? null,
          backgroundColor: existingCell?.backgroundColor ?? null,
          alignment: existingCell?.alignment ?? 'right' as const,
          verticalAlignment: existingCell?.verticalAlignment ?? 'middle' as const,
          colSpan: 1,
          rowSpan: 1,
        };
      });
    });

    // Recalculate row heights proportionally
    const bbox = node.bbox;
    const headerHeight = tableContent.rowHeights.length > 0 ? tableContent.rowHeights[0] : 30;
    const availableHeight = bbox.height - headerHeight;
    const rowCount = tableData.rows.length;
    const rowHeight = rowCount > 0 ? availableHeight / rowCount : 0;
    tableContent.rowHeights = [
      headerHeight,
      ...Array.from({ length: rowCount }, () => rowHeight),
    ];

    // Clear merged cells since data shape changed
    tableContent.mergedCells = [];

    logger.info('Table binding applied', {
      nodeId,
      headers: existingColCount,
      rows: tableData.rows.length,
    });

    return cloned;
  }

  /**
   * Replace a specific chart node's data series.
   * The bbox (layout constraints) are preserved.
   */
  bindChart(
    graph: CanonicalLayoutGraph,
    nodeId: string,
    chartData: ChartBinding,
  ): CanonicalLayoutGraph {
    const cloned = structuredClone(graph);
    const node = findNodeInGraph(cloned, nodeId);

    if (!node) {
      logger.error('Chart binding failed: node not found', { nodeId });
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (node.content.kind !== 'chart') {
      logger.error('Chart binding failed: node is not a chart', { nodeId, kind: node.content.kind });
      throw new Error(`Node ${nodeId} is not a chart node (kind: ${node.content.kind})`);
    }

    const chartContent = node.content as ChartContent;

    chartContent.series = chartData.series.map((s, idx) => {
      const existingSeries = idx < chartContent.series.length ? chartContent.series[idx] : null;
      return {
        name: s.name,
        data: s.data.map((d) => ({ label: d.label, value: d.value })),
        type: existingSeries?.type ?? chartContent.chartType,
        color: chartData.colors?.[idx] ?? existingSeries?.color ?? chartContent.colors[idx % chartContent.colors.length] ?? '#333333',
        stacked: existingSeries?.stacked ?? false,
      };
    });

    if (chartData.colors) {
      chartContent.colors = chartData.colors;
    }

    // Update legend items to match new series
    if (chartContent.legend) {
      chartContent.legend.items = chartContent.series.map((s) => ({
        label: s.name,
        color: s.color,
      }));
    }

    logger.info('Chart binding applied', {
      nodeId,
      seriesCount: chartData.series.length,
    });

    return cloned;
  }

  /**
   * Update a KPI node's value and trend.
   * The bbox (layout constraints) are preserved.
   */
  bindKPI(
    graph: CanonicalLayoutGraph,
    nodeId: string,
    kpiData: KPIBinding,
  ): CanonicalLayoutGraph {
    const cloned = structuredClone(graph);
    const node = findNodeInGraph(cloned, nodeId);

    if (!node) {
      logger.error('KPI binding failed: node not found', { nodeId });
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (node.content.kind !== 'kpi') {
      logger.error('KPI binding failed: node is not a kpi', { nodeId, kind: node.content.kind });
      throw new Error(`Node ${nodeId} is not a KPI node (kind: ${node.content.kind})`);
    }

    const kpiContent = node.content as KpiContent;

    kpiContent.value = kpiData.value;

    if (kpiData.unit !== undefined) {
      kpiContent.unit = kpiData.unit;
    }
    if (kpiData.trend !== undefined) {
      kpiContent.trend = kpiData.trend;
    }
    if (kpiData.trendValue !== undefined) {
      kpiContent.trendValue = kpiData.trendValue;
    }
    if (kpiData.trendColor !== undefined) {
      kpiContent.trendColor = kpiData.trendColor;
    }

    logger.info('KPI binding applied', {
      nodeId,
      value: kpiData.value,
      trend: kpiData.trend,
    });

    return cloned;
  }

  /**
   * Update a text node's content.
   * The bbox (layout constraints) are preserved.
   */
  bindText(
    graph: CanonicalLayoutGraph,
    nodeId: string,
    text: string,
  ): CanonicalLayoutGraph {
    const cloned = structuredClone(graph);
    const node = findNodeInGraph(cloned, nodeId);

    if (!node) {
      logger.error('Text binding failed: node not found', { nodeId });
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (node.content.kind !== 'text') {
      logger.error('Text binding failed: node is not a text node', { nodeId, kind: node.content.kind });
      throw new Error(`Node ${nodeId} is not a text node (kind: ${node.content.kind})`);
    }

    const textContent = node.content as TextContent;
    textContent.text = text;

    logger.info('Text binding applied', { nodeId, textLength: text.length });

    return cloned;
  }

  /**
   * List all nodes in the graph that can accept data bindings
   * (table, chart, kpi, or text content).
   */
  getBindableNodes(graph: CanonicalLayoutGraph): BindableNode[] {
    const bindable: BindableNode[] = [];

    for (const page of graph.pages) {
      walkNodes(page.rootNode, (node) => {
        const bindableType = contentKindToBindableType(node.content.kind);
        if (bindableType) {
          bindable.push({
            nodeId: node.id,
            pageNumber: page.pageNumber,
            type: bindableType,
            currentLabel: labelForNode(node),
          });
        }
      });
    }

    logger.info('Enumerated bindable nodes', { count: bindable.length, graphId: graph.id });
    return bindable;
  }

  /**
   * Validate that a set of bindings is compatible with the graph
   * before applying them.
   */
  validateBindings(
    graph: CanonicalLayoutGraph,
    bindings: DatasetBindings,
  ): BindingValidationResult {
    const errors: Array<{ nodeId: string; message: string }> = [];
    const warnings: Array<{ nodeId: string; message: string }> = [];

    // Validate table bindings
    if (bindings.tables) {
      for (const [nodeId, tableData] of Object.entries(bindings.tables)) {
        const node = findNodeInGraph(graph, nodeId);
        if (!node) {
          errors.push({ nodeId, message: 'Node not found in graph' });
          continue;
        }
        if (node.content.kind !== 'table') {
          errors.push({ nodeId, message: `Expected table node but found kind: ${node.content.kind}` });
          continue;
        }

        const tableContent = node.content as TableContent;

        if (tableData.rows.length === 0) {
          warnings.push({ nodeId, message: 'Table binding has zero rows' });
        }

        if (tableData.headers) {
          const headerLen = tableData.headers.length;
          const inconsistentRows = tableData.rows.filter((r) => r.length !== headerLen);
          if (inconsistentRows.length > 0) {
            errors.push({
              nodeId,
              message: `${inconsistentRows.length} row(s) have column count mismatching header count (${headerLen})`,
            });
          }
        } else if (tableData.rows.length > 0) {
          const expectedCols = tableContent.headers.length;
          const inconsistentRows = tableData.rows.filter((r) => r.length !== expectedCols);
          if (inconsistentRows.length > 0) {
            warnings.push({
              nodeId,
              message: `${inconsistentRows.length} row(s) have column count different from existing header count (${expectedCols})`,
            });
          }
        }
      }
    }

    // Validate chart bindings
    if (bindings.charts) {
      for (const [nodeId, chartData] of Object.entries(bindings.charts)) {
        const node = findNodeInGraph(graph, nodeId);
        if (!node) {
          errors.push({ nodeId, message: 'Node not found in graph' });
          continue;
        }
        if (node.content.kind !== 'chart') {
          errors.push({ nodeId, message: `Expected chart node but found kind: ${node.content.kind}` });
          continue;
        }

        if (chartData.series.length === 0) {
          errors.push({ nodeId, message: 'Chart binding must have at least one series' });
        }

        for (const series of chartData.series) {
          if (!series.name) {
            warnings.push({ nodeId, message: 'Chart series is missing a name' });
          }
          if (series.data.length === 0) {
            warnings.push({ nodeId, message: `Series "${series.name}" has no data points` });
          }
        }

        if (chartData.colors && chartData.colors.length < chartData.series.length) {
          warnings.push({
            nodeId,
            message: `Provided ${chartData.colors.length} colors for ${chartData.series.length} series; remaining series will use existing colors`,
          });
        }
      }
    }

    // Validate KPI bindings
    if (bindings.kpis) {
      for (const [nodeId, kpiData] of Object.entries(bindings.kpis)) {
        const node = findNodeInGraph(graph, nodeId);
        if (!node) {
          errors.push({ nodeId, message: 'Node not found in graph' });
          continue;
        }
        if (node.content.kind !== 'kpi') {
          errors.push({ nodeId, message: `Expected KPI node but found kind: ${node.content.kind}` });
          continue;
        }

        if (!kpiData.value) {
          errors.push({ nodeId, message: 'KPI binding must have a value' });
        }
      }
    }

    // Validate text bindings
    if (bindings.texts) {
      for (const [nodeId, text] of Object.entries(bindings.texts)) {
        const node = findNodeInGraph(graph, nodeId);
        if (!node) {
          errors.push({ nodeId, message: 'Node not found in graph' });
          continue;
        }
        if (node.content.kind !== 'text') {
          errors.push({ nodeId, message: `Expected text node but found kind: ${node.content.kind}` });
          continue;
        }

        if (text.length === 0) {
          warnings.push({ nodeId, message: 'Text binding is an empty string' });
        }
      }
    }

    const valid = errors.length === 0;

    logger.info('Binding validation complete', {
      valid,
      errorCount: errors.length,
      warningCount: warnings.length,
    });

    return { valid, errors, warnings };
  }
}
