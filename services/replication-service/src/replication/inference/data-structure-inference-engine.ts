import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SegmentedElement {
  id: string;
  type: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  children?: SegmentedElement[];
  parentId?: string | null;
  style?: Record<string, unknown>;
  content?: Record<string, unknown>;
  zIndex?: number;
  semanticRole?: string;
}

export interface KPIBlock {
  id: string;
  label: string;
  value: string;
  unit: string;
  trend: 'up' | 'down' | 'neutral';
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  sourceElementIds: string[];
}

export interface ChartBlock {
  id: string;
  chartType: 'bar' | 'pie' | 'line' | 'area' | 'scatter' | 'donut' | 'stacked_bar' | 'unknown';
  title: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  seriesCount: number;
  hasLegend: boolean;
  hasAxis: boolean;
  sourceElementIds: string[];
}

export interface TableBlock {
  id: string;
  rowCount: number;
  columnCount: number;
  hasHeader: boolean;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  cellPattern: 'uniform' | 'variable' | 'merged';
  sourceElementIds: string[];
}

export interface FilterBlock {
  id: string;
  filterType: 'dropdown' | 'checkbox' | 'date_range' | 'search' | 'toggle' | 'slider';
  label: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  sourceElementIds: string[];
}

export interface LegendBlock {
  id: string;
  itemCount: number;
  orientation: 'horizontal' | 'vertical';
  associatedChartId: string | null;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  sourceElementIds: string[];
}

export interface Relationship {
  sourceId: string;
  targetId: string;
  type: 'data_binding' | 'filter_target' | 'legend_for' | 'title_for' | 'annotation_for';
  confidence: number;
}

export interface InferredStructure {
  kpis: KPIBlock[];
  charts: ChartBlock[];
  tables: TableBlock[];
  filters: FilterBlock[];
  legends: LegendBlock[];
  relationships: Relationship[];
  hash: string;
  inferenceTimestamp: number;
}

export interface DatasetSchema {
  columns: Array<{ name: string; type: 'string' | 'number' | 'date' | 'boolean'; sampleValues: unknown[] }>;
  rowCount: number;
  name: string;
}

export interface BoundStructure extends InferredStructure {
  bindings: Array<{
    structureId: string;
    structureType: string;
    columnBindings: Array<{ structureField: string; datasetColumn: string; confidence: number }>;
  }>;
}

export interface InferenceConfig {
  kpiMaxAspectRatio: number;
  kpiMinAspectRatio: number;
  kpiMaxAreaRatio: number;
  chartMinAreaRatio: number;
  tableMinRows: number;
  containerWidth: number;
  containerHeight: number;
}

const DEFAULT_CONFIG: InferenceConfig = {
  kpiMaxAspectRatio: 3.0,
  kpiMinAspectRatio: 0.3,
  kpiMaxAreaRatio: 0.08,
  chartMinAreaRatio: 0.04,
  tableMinRows: 2,
  containerWidth: 1920,
  containerHeight: 1080,
};

// ─── Engine ──────────────────────────────────────────────────────────────────

export class DataStructureInferenceEngine {
  private readonly config: InferenceConfig;

  constructor(config?: Partial<InferenceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('DataStructureInferenceEngine initialized');
  }

  inferDataStructure(elements: SegmentedElement[]): InferredStructure {
    logger.info('Inferring data structure', { elementCount: elements.length });
    const startTime = Date.now();

    const kpis = this.detectKPICards(elements);
    const charts = this.detectCharts(elements);
    const tables = this.detectTables(elements);
    const filters = this.detectFilters(elements);
    const legends = this.detectLegends(elements);
    const relationships = this.inferRelationships(kpis, charts, tables, filters, legends);

    const hash = crypto.createHash('sha256')
      .update(JSON.stringify({ kpis: kpis.length, charts: charts.length, tables: tables.length, filters: filters.length, legends: legends.length }))
      .digest('hex');

    const structure: InferredStructure = {
      kpis,
      charts,
      tables,
      filters,
      legends,
      relationships,
      hash,
      inferenceTimestamp: Date.now(),
    };

    logger.info('Data structure inference complete', {
      kpis: kpis.length,
      charts: charts.length,
      tables: tables.length,
      filters: filters.length,
      legends: legends.length,
      relationships: relationships.length,
      elapsedMs: Date.now() - startTime,
    });

    return structure;
  }

  mapToRealData(structure: InferredStructure, datasetSchema: DatasetSchema): BoundStructure {
    logger.info('Mapping inferred structure to real data', {
      dataset: datasetSchema.name,
      columns: datasetSchema.columns.length,
      rowCount: datasetSchema.rowCount,
    });

    const bindings: BoundStructure['bindings'] = [];
    const numericColumns = datasetSchema.columns.filter((c) => c.type === 'number');
    const stringColumns = datasetSchema.columns.filter((c) => c.type === 'string');
    const dateColumns = datasetSchema.columns.filter((c) => c.type === 'date');

    // Bind KPIs to numeric columns
    for (let i = 0; i < structure.kpis.length; i++) {
      const kpi = structure.kpis[i];
      const columnBindings: Array<{ structureField: string; datasetColumn: string; confidence: number }> = [];
      if (numericColumns.length > i) {
        columnBindings.push({
          structureField: 'value',
          datasetColumn: numericColumns[i].name,
          confidence: 0.8,
        });
      }
      if (stringColumns.length > 0) {
        columnBindings.push({
          structureField: 'label',
          datasetColumn: stringColumns[0].name,
          confidence: 0.6,
        });
      }
      bindings.push({ structureId: kpi.id, structureType: 'kpi', columnBindings });
    }

    // Bind charts to columns
    for (const chart of structure.charts) {
      const columnBindings: Array<{ structureField: string; datasetColumn: string; confidence: number }> = [];
      if (stringColumns.length > 0) {
        columnBindings.push({
          structureField: 'xAxis',
          datasetColumn: dateColumns.length > 0 ? dateColumns[0].name : stringColumns[0].name,
          confidence: 0.75,
        });
      }
      for (let s = 0; s < Math.min(chart.seriesCount, numericColumns.length); s++) {
        columnBindings.push({
          structureField: `series_${s}`,
          datasetColumn: numericColumns[s].name,
          confidence: 0.7,
        });
      }
      bindings.push({ structureId: chart.id, structureType: 'chart', columnBindings });
    }

    // Bind tables to all columns
    for (const table of structure.tables) {
      const columnBindings: Array<{ structureField: string; datasetColumn: string; confidence: number }> = [];
      for (let c = 0; c < Math.min(table.columnCount, datasetSchema.columns.length); c++) {
        columnBindings.push({
          structureField: `column_${c}`,
          datasetColumn: datasetSchema.columns[c].name,
          confidence: 0.85,
        });
      }
      bindings.push({ structureId: table.id, structureType: 'table', columnBindings });
    }

    // Bind filters to string/date columns
    for (let i = 0; i < structure.filters.length; i++) {
      const filter = structure.filters[i];
      const columnBindings: Array<{ structureField: string; datasetColumn: string; confidence: number }> = [];
      const filterColumns = [...stringColumns, ...dateColumns];
      if (filterColumns.length > i) {
        columnBindings.push({
          structureField: 'filterColumn',
          datasetColumn: filterColumns[i].name,
          confidence: 0.65,
        });
      }
      bindings.push({ structureId: filter.id, structureType: 'filter', columnBindings });
    }

    logger.info('Data mapping complete', { bindingCount: bindings.length });

    return { ...structure, bindings };
  }

  private detectKPICards(elements: SegmentedElement[]): KPIBlock[] {
    const kpis: KPIBlock[] = [];
    const containerArea = this.config.containerWidth * this.config.containerHeight;

    for (const el of elements) {
      const aspectRatio = el.bbox.width / Math.max(el.bbox.height, 1);
      const areaRatio = (el.bbox.width * el.bbox.height) / containerArea;

      const isKPIShape =
        aspectRatio >= this.config.kpiMinAspectRatio &&
        aspectRatio <= this.config.kpiMaxAspectRatio &&
        areaRatio <= this.config.kpiMaxAreaRatio &&
        areaRatio > 0.005;

      const isKPIType =
        el.type.includes('kpi') ||
        el.type.includes('metric') ||
        el.type.includes('card') ||
        el.semanticRole === 'kpi';

      if (isKPIShape || isKPIType) {
        const content = el.content || {};
        kpis.push({
          id: `kpi_${kpis.length + 1}`,
          label: typeof content.label === 'string' ? content.label : `KPI ${kpis.length + 1}`,
          value: typeof content.value === 'string' ? content.value : typeof content.value === 'number' ? String(content.value) : '0',
          unit: typeof content.unit === 'string' ? content.unit : '',
          trend: this.inferTrend(content),
          bbox: { ...el.bbox },
          confidence: isKPIType ? Math.min(el.confidence + 0.1, 1) : el.confidence * 0.85,
          sourceElementIds: [el.id],
        });
      }
    }

    // Detect KPI groups: multiple small elements in a horizontal row
    const topElements = elements.filter((el) =>
      el.bbox.y < this.config.containerHeight * 0.25 &&
      (el.bbox.width * el.bbox.height) / containerArea < 0.06
    );
    const grouped = this.groupByRow(topElements, 20);
    for (const row of grouped) {
      if (row.length >= 3 && row.length <= 8) {
        for (const el of row) {
          if (!kpis.some((k) => k.sourceElementIds.includes(el.id))) {
            const content = el.content || {};
            kpis.push({
              id: `kpi_${kpis.length + 1}`,
              label: typeof content.label === 'string' ? content.label : `Metric ${kpis.length + 1}`,
              value: typeof content.value === 'string' ? content.value : '—',
              unit: typeof content.unit === 'string' ? content.unit : '',
              trend: 'neutral',
              bbox: { ...el.bbox },
              confidence: 0.7,
              sourceElementIds: [el.id],
            });
          }
        }
      }
    }

    return kpis;
  }

  private detectCharts(elements: SegmentedElement[]): ChartBlock[] {
    const charts: ChartBlock[] = [];
    const containerArea = this.config.containerWidth * this.config.containerHeight;

    for (const el of elements) {
      const areaRatio = (el.bbox.width * el.bbox.height) / containerArea;
      const aspectRatio = el.bbox.width / Math.max(el.bbox.height, 1);

      const isChartType =
        el.type.includes('chart') ||
        el.type.includes('graph') ||
        el.type.includes('plot') ||
        el.semanticRole === 'chart';

      const isChartShape = areaRatio >= this.config.chartMinAreaRatio && aspectRatio > 0.5 && aspectRatio < 4;

      if (isChartType || (isChartShape && el.confidence > 0.5)) {
        const chartType = this.inferChartType(el, aspectRatio);
        const content = el.content || {};

        charts.push({
          id: `chart_${charts.length + 1}`,
          chartType,
          title: typeof content.title === 'string' ? content.title : '',
          bbox: { ...el.bbox },
          confidence: isChartType ? el.confidence : el.confidence * 0.75,
          seriesCount: this.estimateSeriesCount(el),
          hasLegend: this.hasNearbyLegend(el, elements),
          hasAxis: chartType !== 'pie' && chartType !== 'donut',
          sourceElementIds: [el.id],
        });
      }
    }

    return charts;
  }

  private detectTables(elements: SegmentedElement[]): TableBlock[] {
    const tables: TableBlock[] = [];

    for (const el of elements) {
      const isTableType =
        el.type.includes('table') ||
        el.type.includes('grid') ||
        el.semanticRole === 'table';

      const hasTableChildren = el.children && el.children.length >= this.config.tableMinRows;

      if (isTableType || hasTableChildren) {
        const { rows, cols, pattern } = this.estimateTableDimensions(el);
        tables.push({
          id: `table_${tables.length + 1}`,
          rowCount: rows,
          columnCount: cols,
          hasHeader: true,
          bbox: { ...el.bbox },
          confidence: isTableType ? el.confidence : 0.7,
          cellPattern: pattern,
          sourceElementIds: [el.id],
        });
      }
    }

    // Detect grid-like element groups
    const gridGroups = this.detectGridPatterns(elements);
    for (const group of gridGroups) {
      if (!tables.some((t) => group.some((g) => t.sourceElementIds.includes(g.id)))) {
        const bounds = this.computeBounds(group);
        const rows = this.countDistinctValues(group.map((g) => g.bbox.y), 10);
        const cols = this.countDistinctValues(group.map((g) => g.bbox.x), 10);
        tables.push({
          id: `table_${tables.length + 1}`,
          rowCount: rows,
          columnCount: cols,
          hasHeader: true,
          bbox: bounds,
          confidence: 0.65,
          cellPattern: 'uniform',
          sourceElementIds: group.map((g) => g.id),
        });
      }
    }

    return tables;
  }

  private detectFilters(elements: SegmentedElement[]): FilterBlock[] {
    const filters: FilterBlock[] = [];

    for (const el of elements) {
      const isFilterType =
        el.type.includes('filter') ||
        el.type.includes('dropdown') ||
        el.type.includes('select') ||
        el.type.includes('search') ||
        el.type.includes('toggle') ||
        el.semanticRole === 'filter';

      const isTopRegion = el.bbox.y < this.config.containerHeight * 0.15;
      const isSmallWidget = el.bbox.width < this.config.containerWidth * 0.2 && el.bbox.height < 60;

      if (isFilterType || (isTopRegion && isSmallWidget && el.confidence > 0.5)) {
        const filterType = this.inferFilterType(el);
        const content = el.content || {};
        filters.push({
          id: `filter_${filters.length + 1}`,
          filterType,
          label: typeof content.label === 'string' ? content.label : '',
          bbox: { ...el.bbox },
          confidence: isFilterType ? el.confidence : 0.6,
          sourceElementIds: [el.id],
        });
      }
    }

    return filters;
  }

  private detectLegends(elements: SegmentedElement[]): LegendBlock[] {
    const legends: LegendBlock[] = [];

    for (const el of elements) {
      const isLegendType = el.type.includes('legend') || el.semanticRole === 'legend';
      const isSmallHorizontal = el.bbox.height < 40 && el.bbox.width > 60;
      const isSmallVertical = el.bbox.width < 120 && el.bbox.height > 40 && el.bbox.height < 200;

      if (isLegendType || ((isSmallHorizontal || isSmallVertical) && el.confidence > 0.5 && el.children && el.children.length >= 2)) {
        const orientation: 'horizontal' | 'vertical' = el.bbox.width > el.bbox.height ? 'horizontal' : 'vertical';
        const itemCount = el.children ? el.children.length : this.estimateLegendItems(el);
        legends.push({
          id: `legend_${legends.length + 1}`,
          itemCount,
          orientation,
          associatedChartId: null,
          bbox: { ...el.bbox },
          confidence: isLegendType ? el.confidence : 0.55,
          sourceElementIds: [el.id],
        });
      }
    }

    return legends;
  }

  private inferRelationships(
    kpis: KPIBlock[], charts: ChartBlock[], tables: TableBlock[],
    filters: FilterBlock[], legends: LegendBlock[],
  ): Relationship[] {
    const relationships: Relationship[] = [];

    // Legend-to-chart relationships (proximity)
    for (const legend of legends) {
      let closestChart: ChartBlock | null = null;
      let minDist = Infinity;
      for (const chart of charts) {
        const dist = this.distanceBetween(legend.bbox, chart.bbox);
        if (dist < minDist) { minDist = dist; closestChart = chart; }
      }
      if (closestChart && minDist < 200) {
        legend.associatedChartId = closestChart.id;
        relationships.push({
          sourceId: legend.id,
          targetId: closestChart.id,
          type: 'legend_for',
          confidence: Math.max(0.5, 1 - minDist / 200),
        });
      }
    }

    // Filter-to-chart/table relationships
    for (const filter of filters) {
      for (const chart of charts) {
        if (filter.bbox.y < chart.bbox.y) {
          relationships.push({
            sourceId: filter.id,
            targetId: chart.id,
            type: 'filter_target',
            confidence: 0.7,
          });
        }
      }
      for (const table of tables) {
        if (filter.bbox.y < table.bbox.y) {
          relationships.push({
            sourceId: filter.id,
            targetId: table.id,
            type: 'filter_target',
            confidence: 0.65,
          });
        }
      }
    }

    // KPI-to-chart data binding (shared data)
    for (const kpi of kpis) {
      for (const chart of charts) {
        const horizontalOverlap =
          kpi.bbox.x < chart.bbox.x + chart.bbox.width &&
          kpi.bbox.x + kpi.bbox.width > chart.bbox.x;
        if (horizontalOverlap && kpi.bbox.y < chart.bbox.y) {
          relationships.push({
            sourceId: kpi.id,
            targetId: chart.id,
            type: 'data_binding',
            confidence: 0.6,
          });
        }
      }
    }

    return relationships;
  }

  private inferTrend(content: Record<string, unknown>): 'up' | 'down' | 'neutral' {
    if (typeof content.trend === 'string') {
      if (content.trend.includes('up') || content.trend.includes('increase')) return 'up';
      if (content.trend.includes('down') || content.trend.includes('decrease')) return 'down';
    }
    if (typeof content.trendValue === 'number') {
      if (content.trendValue > 0) return 'up';
      if (content.trendValue < 0) return 'down';
    }
    return 'neutral';
  }

  private inferChartType(el: SegmentedElement, aspectRatio: number): ChartBlock['chartType'] {
    const type = el.type.toLowerCase();
    const content = el.content || {};
    const chartType = typeof content.chartType === 'string' ? content.chartType.toLowerCase() : '';

    if (type.includes('bar') || chartType.includes('bar')) return aspectRatio > 1 ? 'bar' : 'bar';
    if (type.includes('pie') || chartType.includes('pie')) return 'pie';
    if (type.includes('donut') || chartType.includes('donut')) return 'donut';
    if (type.includes('line') || chartType.includes('line')) return 'line';
    if (type.includes('area') || chartType.includes('area')) return 'area';
    if (type.includes('scatter') || chartType.includes('scatter')) return 'scatter';
    if (type.includes('stacked') || chartType.includes('stacked')) return 'stacked_bar';

    if (aspectRatio < 1.2 && aspectRatio > 0.8) return 'pie';
    if (aspectRatio > 1.5) return 'bar';
    return 'unknown';
  }

  private estimateSeriesCount(el: SegmentedElement): number {
    if (el.children && el.children.length > 0) return Math.min(el.children.length, 10);
    const content = el.content || {};
    if (Array.isArray(content.series)) return content.series.length;
    return 1;
  }

  private hasNearbyLegend(el: SegmentedElement, allElements: SegmentedElement[]): boolean {
    for (const other of allElements) {
      if (other.id === el.id) continue;
      if (other.type.includes('legend') || other.semanticRole === 'legend') {
        const dist = this.distanceBetween(el.bbox, other.bbox);
        if (dist < 150) return true;
      }
    }
    return false;
  }

  private inferFilterType(el: SegmentedElement): FilterBlock['filterType'] {
    const type = el.type.toLowerCase();
    if (type.includes('dropdown') || type.includes('select')) return 'dropdown';
    if (type.includes('checkbox') || type.includes('check')) return 'checkbox';
    if (type.includes('date') || type.includes('calendar')) return 'date_range';
    if (type.includes('search') || type.includes('input')) return 'search';
    if (type.includes('toggle') || type.includes('switch')) return 'toggle';
    if (type.includes('slider') || type.includes('range')) return 'slider';
    return 'dropdown';
  }

  private estimateTableDimensions(el: SegmentedElement): { rows: number; cols: number; pattern: TableBlock['cellPattern'] } {
    if (el.children && el.children.length > 0) {
      const yValues = el.children.map((c) => c.bbox.y);
      const xValues = el.children.map((c) => c.bbox.x);
      const rows = this.countDistinctValues(yValues, 10);
      const cols = this.countDistinctValues(xValues, 10);
      const widths = el.children.map((c) => c.bbox.width);
      const avgWidth = widths.reduce((s, w) => s + w, 0) / widths.length;
      const maxDev = Math.max(...widths.map((w) => Math.abs(w - avgWidth)));
      const pattern: TableBlock['cellPattern'] = maxDev < avgWidth * 0.1 ? 'uniform' : maxDev < avgWidth * 0.3 ? 'variable' : 'merged';
      return { rows, cols, pattern };
    }
    const estimatedRowHeight = 40;
    const estimatedColWidth = 150;
    return {
      rows: Math.max(2, Math.floor(el.bbox.height / estimatedRowHeight)),
      cols: Math.max(2, Math.floor(el.bbox.width / estimatedColWidth)),
      pattern: 'uniform',
    };
  }

  private estimateLegendItems(el: SegmentedElement): number {
    if (el.bbox.width > el.bbox.height) {
      return Math.max(2, Math.floor(el.bbox.width / 80));
    }
    return Math.max(2, Math.floor(el.bbox.height / 24));
  }

  private groupByRow(elements: SegmentedElement[], tolerance: number): SegmentedElement[][] {
    const rows: SegmentedElement[][] = [];
    const sorted = [...elements].sort((a, b) => a.bbox.y - b.bbox.y);
    let currentRow: SegmentedElement[] = [];
    let currentY = -Infinity;

    for (const el of sorted) {
      if (Math.abs(el.bbox.y - currentY) > tolerance) {
        if (currentRow.length > 0) rows.push(currentRow);
        currentRow = [el];
        currentY = el.bbox.y;
      } else {
        currentRow.push(el);
      }
    }
    if (currentRow.length > 0) rows.push(currentRow);
    return rows;
  }

  private detectGridPatterns(elements: SegmentedElement[]): SegmentedElement[][] {
    const grids: SegmentedElement[][] = [];
    const rows = this.groupByRow(elements, 10);

    for (const row of rows) {
      if (row.length < 3) continue;
      const sorted = [...row].sort((a, b) => a.bbox.x - b.bbox.x);
      const widths = sorted.map((e) => e.bbox.width);
      const avgWidth = widths.reduce((s, w) => s + w, 0) / widths.length;
      const isUniform = widths.every((w) => Math.abs(w - avgWidth) < avgWidth * 0.3);
      if (isUniform) grids.push(sorted);
    }

    return grids;
  }

  private countDistinctValues(values: number[], tolerance: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    let count = sorted.length > 0 ? 1 : 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] > tolerance) count++;
    }
    return count;
  }

  private computeBounds(elements: SegmentedElement[]): { x: number; y: number; width: number; height: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      minX = Math.min(minX, el.bbox.x);
      minY = Math.min(minY, el.bbox.y);
      maxX = Math.max(maxX, el.bbox.x + el.bbox.width);
      maxY = Math.max(maxY, el.bbox.y + el.bbox.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  private distanceBetween(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): number {
    const acx = a.x + a.width / 2;
    const acy = a.y + a.height / 2;
    const bcx = b.x + b.width / 2;
    const bcy = b.y + b.height / 2;
    return Math.sqrt((acx - bcx) ** 2 + (acy - bcy) ** 2);
  }
}
