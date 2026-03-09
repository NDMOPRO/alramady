import { logger } from '../../utils/logger.js';

type AggregationType = 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'MEDIAN';

interface MetricDefinition {
  name: string;
  formula: string;
  aggregation: AggregationType;
  dimensions: string[];
  description?: string;
  format?: string;
  filters?: Record<string, unknown>;
}

interface DimensionHierarchy {
  dimension: string;
  levels: HierarchyLevel[];
}

interface HierarchyLevel {
  name: string;
  column: string;
  parent?: string;
  members?: string[];
}

interface MetricResult {
  metricName: string;
  value: number;
  breakdown?: Record<string, number>;
  dimensionValues?: Record<string, unknown[]>;
}

export class SemanticLayerEngine {
  private metricRegistry: Map<string, MetricDefinition> = new Map();
  private hierarchyRegistry: Map<string, DimensionHierarchy> = new Map();

  defineMetric(name: string, formula: string, dimensions: string[], options?: {
    aggregation?: AggregationType;
    description?: string;
    format?: string;
    filters?: Record<string, unknown>;
  }): MetricDefinition {
    const metric: MetricDefinition = {
      name,
      formula,
      aggregation: options?.aggregation ?? 'SUM',
      dimensions,
      description: options?.description,
      format: options?.format,
      filters: options?.filters,
    };

    this.metricRegistry.set(name, metric);
    logger.info('SemanticLayerEngine metric defined', { name, aggregation: metric.aggregation, dimensions });
    return metric;
  }

  defineHierarchy(dimension: string, levels: HierarchyLevel[]): DimensionHierarchy {
    // Validate parent references
    for (const level of levels) {
      if (level.parent) {
        const parentExists = levels.some(l => l.name === level.parent);
        if (!parentExists) {
          throw new Error(`Hierarchy level "${level.name}" references non-existent parent "${level.parent}"`);
        }
      }
    }

    const hierarchy: DimensionHierarchy = { dimension, levels };
    this.hierarchyRegistry.set(dimension, hierarchy);
    logger.info('SemanticLayerEngine hierarchy defined', { dimension, levelCount: levels.length });
    return hierarchy;
  }

  calculateMetric(metricName: string, data: Record<string, unknown>[], filters?: Record<string, unknown>): MetricResult {
    const metric = this.metricRegistry.get(metricName);
    if (!metric) {
      throw new Error(`Metric "${metricName}" is not registered`);
    }

    // Apply metric-level filters
    let filteredData = data;
    const combinedFilters = { ...(metric.filters ?? {}), ...(filters ?? {}) };
    if (Object.keys(combinedFilters).length > 0) {
      filteredData = data.filter(row => {
        return Object.entries(combinedFilters).every(([key, val]) => {
          if (Array.isArray(val)) return val.includes(row[key]);
          return row[key] === val;
        });
      });
    }

    // Extract the field from formula (simple field reference or expression)
    const field = this.extractField(metric.formula);
    const values = filteredData
      .map(row => {
        const v = row[field];
        return typeof v === 'number' ? v : parseFloat(v as string);
      })
      .filter(v => !isNaN(v));

    const aggregatedValue = this.aggregate(values, metric.aggregation);

    // Calculate breakdown by first dimension if available
    let breakdown: Record<string, number> | undefined;
    const dimensionValues: Record<string, unknown[]> = {};

    if (metric.dimensions.length > 0) {
      const primaryDim = metric.dimensions[0];
      breakdown = {};
      const groups = new Map<string, number[]>();

      for (const row of filteredData) {
        const dimValue = String(row[primaryDim] ?? 'unknown');
        if (!groups.has(dimValue)) groups.set(dimValue, []);
        const val = row[field];
        const num = typeof val === 'number' ? val : parseFloat(val as string);
        if (!isNaN(num)) groups.get(dimValue)!.push(num);
      }

      for (const [dimVal, vals] of groups) {
        breakdown[dimVal] = this.aggregate(vals, metric.aggregation);
      }

      for (const dim of metric.dimensions) {
        const unique = [...new Set(filteredData.map(row => row[dim]))];
        dimensionValues[dim] = unique;
      }
    }

    logger.debug('SemanticLayerEngine metric calculated', {
      metricName,
      value: aggregatedValue,
      recordCount: filteredData.length,
    });

    return {
      metricName,
      value: aggregatedValue,
      breakdown,
      dimensionValues,
    };
  }

  getHierarchy(dimension: string): DimensionHierarchy | null {
    const hierarchy = this.hierarchyRegistry.get(dimension);
    if (!hierarchy) {
      logger.warn('SemanticLayerEngine hierarchy not found', { dimension });
      return null;
    }
    return hierarchy;
  }

  getMetric(name: string): MetricDefinition | null {
    return this.metricRegistry.get(name) ?? null;
  }

  listMetrics(): MetricDefinition[] {
    return Array.from(this.metricRegistry.values());
  }

  listHierarchies(): DimensionHierarchy[] {
    return Array.from(this.hierarchyRegistry.values());
  }

  drillDown(dimension: string, currentLevel: string, data: Record<string, unknown>[]): {
    childLevel: string | null;
    childValues: unknown[];
  } {
    const hierarchy = this.hierarchyRegistry.get(dimension);
    if (!hierarchy) throw new Error(`Hierarchy "${dimension}" not found`);

    const currentIdx = hierarchy.levels.findIndex(l => l.name === currentLevel);
    if (currentIdx === -1) throw new Error(`Level "${currentLevel}" not found in hierarchy "${dimension}"`);
    if (currentIdx >= hierarchy.levels.length - 1) {
      return { childLevel: null, childValues: [] };
    }

    const childLevel = hierarchy.levels[currentIdx + 1];
    const childValues = [...new Set(data.map(row => row[childLevel.column]).filter(v => v !== undefined))];

    logger.debug('SemanticLayerEngine drillDown', { dimension, from: currentLevel, to: childLevel.name });
    return { childLevel: childLevel.name, childValues };
  }

  rollUp(dimension: string, currentLevel: string): {
    parentLevel: string | null;
  } {
    const hierarchy = this.hierarchyRegistry.get(dimension);
    if (!hierarchy) throw new Error(`Hierarchy "${dimension}" not found`);

    const currentIdx = hierarchy.levels.findIndex(l => l.name === currentLevel);
    if (currentIdx <= 0) return { parentLevel: null };

    return { parentLevel: hierarchy.levels[currentIdx - 1].name };
  }

  private aggregate(values: number[], aggregation: AggregationType): number {
    if (values.length === 0) return 0;

    switch (aggregation) {
      case 'SUM':
        return values.reduce((a, b) => a + b, 0);
      case 'AVG':
        return values.reduce((a, b) => a + b, 0) / values.length;
      case 'COUNT':
        return values.length;
      case 'MIN':
        return Math.min(...values);
      case 'MAX':
        return Math.max(...values);
      case 'MEDIAN': {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;
      }
      default:
        throw new Error(`Unknown aggregation type: ${aggregation}`);
    }
  }

  private extractField(formula: string): string {
    // Handle simple field names like "revenue" or expressions like "SUM(revenue)"
    const funcMatch = formula.match(/^\w+\((\w+)\)$/);
    if (funcMatch) return funcMatch[1];
    // Handle simple column reference
    const simpleMatch = formula.match(/^(\w+)$/);
    if (simpleMatch) return simpleMatch[1];
    // Handle ratio expressions like "revenue / count" — use first operand
    const exprMatch = formula.match(/^(\w+)\s*[+\-*/]/);
    if (exprMatch) return exprMatch[1];
    return formula;
  }
}
