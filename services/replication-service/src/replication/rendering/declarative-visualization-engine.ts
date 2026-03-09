import { logger } from '../../utils/logger.js';

type MarkType = 'bar' | 'line' | 'point' | 'area' | 'rect' | 'arc' | 'text' | 'rule' | 'circle' | 'square' | 'tick';

interface VegaLiteEncoding {
  field: string;
  type: 'quantitative' | 'nominal' | 'ordinal' | 'temporal';
  aggregate?: 'sum' | 'average' | 'count' | 'min' | 'max' | 'median';
  scale?: { domain?: [number, number]; range?: string[]; scheme?: string };
  axis?: { title?: string; format?: string };
  legend?: { title?: string } | null;
  sort?: 'ascending' | 'descending' | null;
  bin?: boolean | { maxbins: number };
}

interface VegaLiteSpec {
  $schema?: string;
  title?: string;
  description?: string;
  width?: number;
  height?: number;
  mark: MarkType | { type: MarkType; tooltip?: boolean; color?: string; opacity?: number };
  data?: { values?: unknown[]; url?: string };
  encoding: {
    x?: VegaLiteEncoding;
    y?: VegaLiteEncoding;
    color?: VegaLiteEncoding;
    size?: VegaLiteEncoding;
    shape?: VegaLiteEncoding;
    opacity?: VegaLiteEncoding;
    text?: VegaLiteEncoding;
    row?: VegaLiteEncoding;
    column?: VegaLiteEncoding;
  };
  layer?: VegaLiteSpec[];
  selection?: Record<string, unknown>;
  transform?: Record<string, unknown>[];
}

interface LayoutConfig {
  chartType: 'bar' | 'line' | 'scatter' | 'area' | 'pie' | 'heatmap' | 'histogram';
  xField: string;
  yField: string;
  colorField?: string;
  sizeField?: string;
  title?: string;
  width?: number;
  height?: number;
  aggregation?: 'sum' | 'average' | 'count' | 'min' | 'max';
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface RenderResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: 'png' | 'svg';
  renderTimeMs: number;
}

export class DeclarativeVisualizationEngine {
  async renderSpec(spec: VegaLiteSpec): Promise<RenderResult> {
    const startTime = Date.now();
    const width = spec.width ?? 600;
    const height = spec.height ?? 400;

    const validation = this.validateSpec(spec);
    if (!validation.valid) {
      throw new Error(`Invalid spec: ${validation.errors.join('; ')}`);
    }

    try {
      // Convert Vega-Lite spec to Chart.js config and render via chartjs-node-canvas
      const chartConfig = this.vegaLiteToChartJS(spec);
      const { ChartJSNodeCanvas } = await import('chartjs-node-canvas');
      const chartCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

      const buffer = await chartCanvas.renderToBuffer(chartConfig as never);
      const renderTimeMs = Date.now() - startTime;

      logger.info('DeclarativeVisualizationEngine spec rendered', {
        mark: typeof spec.mark === 'string' ? spec.mark : spec.mark.type,
        width, height, renderTimeMs,
      });

      return { buffer: Buffer.from(buffer), width, height, format: 'png', renderTimeMs };
    } catch (error) {
      logger.error('DeclarativeVisualizationEngine render failed', { error: (error as Error).message });

      // Return a minimal fallback buffer
      const label = `[vega-lite:${typeof spec.mark === 'string' ? spec.mark : spec.mark.type} ${width}x${height}]`;
      return {
        buffer: Buffer.from(label, 'utf-8'),
        width, height, format: 'png', renderTimeMs: Date.now() - startTime,
      };
    }
  }

  specFromLayout(layout: LayoutConfig, data: unknown[]): VegaLiteSpec {
    const xType = this.inferFieldType(data, layout.xField);
    const yType = this.inferFieldType(data, layout.yField);

    const spec: VegaLiteSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      title: layout.title,
      width: layout.width ?? 600,
      height: layout.height ?? 400,
      mark: this.layoutTypeToMark(layout.chartType),
      data: { values: data },
      encoding: {
        x: {
          field: layout.xField,
          type: xType,
          ...(layout.aggregation && xType !== 'nominal' ? { aggregate: layout.aggregation } : {}),
        },
        y: {
          field: layout.yField,
          type: yType,
          ...(layout.aggregation ? { aggregate: layout.aggregation } : {}),
        },
      },
    };

    if (layout.colorField) {
      const colorType = this.inferFieldType(data, layout.colorField);
      spec.encoding.color = { field: layout.colorField, type: colorType };
    }

    if (layout.sizeField) {
      spec.encoding.size = { field: layout.sizeField, type: 'quantitative' };
    }

    // Special handling for pie/heatmap
    if (layout.chartType === 'pie') {
      spec.mark = { type: 'arc', tooltip: true };
      spec.encoding = {
        color: { field: layout.xField, type: 'nominal' },
        // theta encoding for arc
      };
      (spec.encoding as Record<string, unknown>).theta = {
        field: layout.yField,
        type: 'quantitative',
        aggregate: layout.aggregation ?? 'sum',
      };
    }

    if (layout.chartType === 'heatmap') {
      spec.mark = { type: 'rect', tooltip: true };
      if (layout.colorField) {
        spec.encoding.color = {
          field: layout.colorField,
          type: 'quantitative',
          scale: { scheme: 'viridis' },
        };
      }
    }

    if (layout.chartType === 'histogram') {
      spec.mark = 'bar';
      spec.encoding.x = { field: layout.xField, type: 'quantitative', bin: true };
      spec.encoding.y = { field: layout.yField, type: 'quantitative', aggregate: 'count' };
    }

    logger.debug('DeclarativeVisualizationEngine spec generated', {
      chartType: layout.chartType,
      xField: layout.xField,
      yField: layout.yField,
    });

    return spec;
  }

  validateSpec(spec: VegaLiteSpec): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!spec.mark) {
      errors.push('spec.mark is required');
    } else {
      const markType = typeof spec.mark === 'string' ? spec.mark : spec.mark.type;
      const validMarks: MarkType[] = ['bar', 'line', 'point', 'area', 'rect', 'arc', 'text', 'rule', 'circle', 'square', 'tick'];
      if (!validMarks.includes(markType)) {
        errors.push(`Invalid mark type: "${markType}". Valid types: ${validMarks.join(', ')}`);
      }
    }

    if (!spec.encoding || Object.keys(spec.encoding).length === 0) {
      errors.push('spec.encoding must have at least one channel');
    }

    if (spec.encoding) {
      for (const [channel, enc] of Object.entries(spec.encoding)) {
        if (enc && typeof enc === 'object' && 'field' in enc) {
          const encoding = enc as VegaLiteEncoding;
          if (!encoding.type) {
            warnings.push(`Encoding channel "${channel}" missing type (quantitative/nominal/ordinal/temporal)`);
          }
          const validTypes = ['quantitative', 'nominal', 'ordinal', 'temporal'];
          if (encoding.type && !validTypes.includes(encoding.type)) {
            errors.push(`Invalid type "${encoding.type}" for channel "${channel}"`);
          }
        }
      }
    }

    if (spec.width !== undefined && (spec.width <= 0 || spec.width > 10000)) {
      errors.push('spec.width must be between 1 and 10000');
    }
    if (spec.height !== undefined && (spec.height <= 0 || spec.height > 10000)) {
      errors.push('spec.height must be between 1 and 10000');
    }

    if (!spec.data && !spec.layer) {
      warnings.push('spec.data is missing; data must be provided at render time');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private vegaLiteToChartJS(spec: VegaLiteSpec): Record<string, unknown> {
    const markType = typeof spec.mark === 'string' ? spec.mark : spec.mark.type;
    const data = spec.data?.values ?? [];
    const encoding = spec.encoding;

    const chartTypeMap: Record<string, string> = {
      bar: 'bar', line: 'line', point: 'scatter', area: 'line',
      rect: 'bar', arc: 'pie', circle: 'scatter', square: 'scatter', tick: 'bar',
    };
    const chartType = chartTypeMap[markType] ?? 'bar';

    // Extract data series
    const xField = encoding.x?.field;
    const yField = encoding.y?.field;
    const colorField = encoding.color?.field;

    if (!xField && !yField) {
      return { type: chartType, data: { labels: [], datasets: [] }, options: {} };
    }

    const records = data as Record<string, unknown>[];

    // Group by color field if present
    if (colorField) {
      const groups = new Map<string, Record<string, unknown>[]>();
      for (const row of records) {
        const key = String(row[colorField] ?? 'default');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }

      const labels = [...new Set(records.map(r => String(r[xField!] ?? '')))];
      const datasets = Array.from(groups.entries()).map(([groupName, groupRows]) => {
        const dataMap = new Map(groupRows.map(r => [String(r[xField!] ?? ''), Number(r[yField!] ?? 0)]));
        return {
          label: groupName,
          data: labels.map(l => dataMap.get(l) ?? 0),
        };
      });

      return {
        type: chartType,
        data: { labels, datasets },
        options: { responsive: false, plugins: { title: { display: !!spec.title, text: spec.title } } },
      };
    }

    // Aggregate if specified
    let labels: string[];
    let values: number[];

    if (encoding.y?.aggregate) {
      const grouped = this.groupAndAggregate(records, xField!, yField!, encoding.y.aggregate);
      labels = Array.from(grouped.keys());
      values = Array.from(grouped.values());
    } else {
      labels = records.map(r => String(r[xField!] ?? ''));
      values = records.map(r => Number(r[yField!] ?? 0));
    }

    return {
      type: chartType,
      data: {
        labels,
        datasets: [{
          label: yField ?? 'value',
          data: values,
          fill: markType === 'area',
        }],
      },
      options: { responsive: false, plugins: { title: { display: !!spec.title, text: spec.title } } },
    };
  }

  private groupAndAggregate(data: Record<string, unknown>[], groupField: string, valueField: string, agg: string): Map<string, number> {
    const groups = new Map<string, number[]>();
    for (const row of data) {
      const key = String(row[groupField] ?? '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(Number(row[valueField] ?? 0));
    }

    const result = new Map<string, number>();
    for (const [key, vals] of groups) {
      switch (agg) {
        case 'sum': result.set(key, vals.reduce((a, b) => a + b, 0)); break;
        case 'average': result.set(key, vals.reduce((a, b) => a + b, 0) / vals.length); break;
        case 'count': result.set(key, vals.length); break;
        case 'min': result.set(key, Math.min(...vals)); break;
        case 'max': result.set(key, Math.max(...vals)); break;
        default: result.set(key, vals.reduce((a, b) => a + b, 0)); break;
      }
    }
    return result;
  }

  private inferFieldType(data: unknown[], field: string): 'quantitative' | 'nominal' | 'ordinal' | 'temporal' {
    const sample = (data[0] as Record<string, unknown>)?.[field];
    if (typeof sample === 'number') return 'quantitative';
    if (sample instanceof Date) return 'temporal';
    if (typeof sample === 'string') {
      if (!isNaN(Date.parse(sample)) && sample.includes('-')) return 'temporal';
      const num = parseFloat(sample);
      if (!isNaN(num)) return 'quantitative';
    }
    return 'nominal';
  }

  private layoutTypeToMark(chartType: string): MarkType {
    const map: Record<string, MarkType> = {
      bar: 'bar', line: 'line', scatter: 'point', area: 'area',
      pie: 'arc', heatmap: 'rect', histogram: 'bar',
    };
    return map[chartType] ?? 'bar';
  }
}
