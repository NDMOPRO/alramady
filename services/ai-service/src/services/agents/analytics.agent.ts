import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' });
const prisma = new PrismaClient();

export interface AgentResult {
  agentType: string;
  taskType: string;
  suggestions: Array<{ action: string; description: string; confidence: number }>;
  interpretation: string;
  requiresApproval: boolean;
  executedAt: Date;
}

export interface AnalyticsTask {
  type: 'run_regression' | 'cluster_data' | 'forecast_trend' | 'correlation_analysis' | 'segment_analysis';
  datasetId: string;
  data: Array<Record<string, number | string | null>>;
  targetColumn?: string;
  featureColumns?: string[];
  clusterCount?: number;
  forecastPeriods?: number;
  context?: string;
}

interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  predictions: number[];
  residuals: number[];
}

interface ClusterResult {
  centroids: number[][];
  assignments: number[];
  inertia: number;
  clusterSizes: number[];
}

export class AnalyticsAgent {
  private readonly agentType = 'analytics';

  async execute(task: AnalyticsTask): Promise<AgentResult> {
    switch (task.type) {
      case 'run_regression':
        return this.runRegression(task);
      case 'cluster_data':
        return this.clusterData(task);
      case 'forecast_trend':
        return this.forecastTrend(task);
      case 'correlation_analysis':
        return this.correlationAnalysis(task);
      case 'segment_analysis':
        return this.segmentAnalysis(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private extractNumericColumn(data: Array<Record<string, number | string | null>>, col: string): number[] {
    return data
      .map((row) => row[col])
      .filter((v): v is number | string => v !== null && v !== undefined)
      .map((v) => (typeof v === 'number' ? v : Number(v)))
      .filter((v) => !isNaN(v));
  }

  private linearRegression(x: number[], y: number[]): RegressionResult {
    const n = x.length;
    if (n < 2) {
      return { slope: 0, intercept: 0, rSquared: 0, predictions: [], residuals: [] };
    }

    const sumX = x.reduce((s, v) => s + v, 0);
    const sumY = y.reduce((s, v) => s + v, 0);
    const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
    const sumX2 = x.reduce((s, v) => s + v * v, 0);

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
      const meanY = sumY / n;
      return {
        slope: 0,
        intercept: meanY,
        rSquared: 0,
        predictions: Array(n).fill(meanY),
        residuals: y.map((v) => v - meanY),
      };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    const predictions = x.map((v) => slope * v + intercept);
    const residuals = y.map((v, i) => v - predictions[i]);

    const meanY = sumY / n;
    const ssTotal = y.reduce((s, v) => s + (v - meanY) ** 2, 0);
    const ssResidual = residuals.reduce((s, v) => s + v ** 2, 0);
    const rSquared = ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal;

    return { slope, intercept, rSquared, predictions, residuals };
  }

  private kMeans(data: number[][], k: number, maxIterations: number = 100): ClusterResult {
    const n = data.length;
    const dims = data[0]?.length ?? 0;
    if (n === 0 || dims === 0 || k <= 0) {
      return { centroids: [], assignments: [], inertia: 0, clusterSizes: [] };
    }

    const effectiveK = Math.min(k, n);

    // Initialize centroids using k-means++ style: spread out initial picks
    const centroids: number[][] = [];
    const usedIndices = new Set<number>();
    // Pick first centroid deterministically (first data point)
    centroids.push([...data[0]]);
    usedIndices.add(0);

    for (let c = 1; c < effectiveK; c++) {
      let bestIdx = 0;
      let bestDist = -1;
      for (let i = 0; i < n; i++) {
        if (usedIndices.has(i)) continue;
        let minDistToCentroid = Infinity;
        for (const centroid of centroids) {
          const dist = this.euclideanDistance(data[i], centroid);
          if (dist < minDistToCentroid) minDistToCentroid = dist;
        }
        if (minDistToCentroid > bestDist) {
          bestDist = minDistToCentroid;
          bestIdx = i;
        }
      }
      centroids.push([...data[bestIdx]]);
      usedIndices.add(bestIdx);
    }

    let assignments = new Array<number>(n).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
      // Assignment step
      const newAssignments = data.map((point) => {
        let minDist = Infinity;
        let bestCluster = 0;
        for (let c = 0; c < effectiveK; c++) {
          const dist = this.euclideanDistance(point, centroids[c]);
          if (dist < minDist) {
            minDist = dist;
            bestCluster = c;
          }
        }
        return bestCluster;
      });

      // Check convergence
      const changed = newAssignments.some((a, i) => a !== assignments[i]);
      assignments = newAssignments;

      if (!changed) break;

      // Update step
      for (let c = 0; c < effectiveK; c++) {
        const members = data.filter((_, i) => assignments[i] === c);
        if (members.length === 0) continue;
        for (let d = 0; d < dims; d++) {
          centroids[c][d] = members.reduce((s, m) => s + m[d], 0) / members.length;
        }
      }
    }

    // Compute inertia
    let inertia = 0;
    for (let i = 0; i < n; i++) {
      inertia += this.euclideanDistance(data[i], centroids[assignments[i]]) ** 2;
    }

    const clusterSizes = new Array<number>(effectiveK).fill(0);
    assignments.forEach((a) => clusterSizes[a]++);

    return { centroids, assignments, inertia, clusterSizes };
  }

  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }

  private movingAverage(values: number[], window: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = values.slice(start, i + 1);
      result.push(slice.reduce((s, v) => s + v, 0) / slice.length);
    }
    return result;
  }

  private exponentialSmoothing(values: number[], alpha: number): { smoothed: number[]; forecast: number[] } {
    if (values.length === 0) return { smoothed: [], forecast: [] };
    const smoothed: number[] = [values[0]];
    for (let i = 1; i < values.length; i++) {
      smoothed.push(alpha * values[i] + (1 - alpha) * smoothed[i - 1]);
    }
    // Forecast: extend the trend
    const last = smoothed[smoothed.length - 1];
    const secondLast = smoothed.length > 1 ? smoothed[smoothed.length - 2] : last;
    const trend = last - secondLast;
    const forecast: number[] = [];
    for (let i = 1; i <= 5; i++) {
      forecast.push(last + trend * i);
    }
    return { smoothed, forecast };
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;
    const meanX = x.reduce((s, v) => s + v, 0) / n;
    const meanY = y.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let denX = 0;
    let denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    const den = Math.sqrt(denX * denY);
    return den === 0 ? 0 : num / den;
  }

  private async runRegression(task: AnalyticsTask): Promise<AgentResult> {
    const targetCol = task.targetColumn;
    const featureCols = task.featureColumns ?? [];

    if (!targetCol || featureCols.length === 0) {
      throw new Error('run_regression requires targetColumn and at least one featureColumn');
    }

    const yValues = this.extractNumericColumn(task.data, targetCol);
    const results: Array<{ feature: string; regression: RegressionResult }> = [];

    for (const feature of featureCols) {
      const xValues = this.extractNumericColumn(task.data, feature);
      const minLen = Math.min(xValues.length, yValues.length);
      if (minLen < 3) continue;
      const reg = this.linearRegression(xValues.slice(0, minLen), yValues.slice(0, minLen));
      results.push({ feature, regression: reg });
    }

    const suggestions = results.map((r) => ({
      action: 'regression_result',
      description: `${r.feature} -> ${targetCol}: y = ${r.regression.slope.toFixed(4)}x + ${r.regression.intercept.toFixed(4)}, R² = ${r.regression.rSquared.toFixed(4)}`,
      confidence: Math.min(0.99, Math.max(0.1, r.regression.rSquared)),
    }));

    const bestModel = results.sort((a, b) => b.regression.rSquared - a.regression.rSquared)[0];
    const interpretation = bestModel
      ? `Linear regression analysis on ${results.length} features. Best predictor: "${bestModel.feature}" with R²=${bestModel.regression.rSquared.toFixed(4)}. ${bestModel.regression.rSquared > 0.7 ? 'Strong linear relationship detected.' : bestModel.regression.rSquared > 0.4 ? 'Moderate linear relationship.' : 'Weak linear relationship - consider non-linear models.'}`
      : 'Insufficient data for regression analysis.';

    await prisma.auditLog.create({
      data: {
        action: 'analytics_run_regression',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({
          target: targetCol,
          features: featureCols,
          bestR2: bestModel?.regression.rSquared ?? 0,
        }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async clusterData(task: AnalyticsTask): Promise<AgentResult> {
    const featureCols = task.featureColumns ?? [];
    const k = task.clusterCount ?? 3;

    if (featureCols.length === 0) {
      throw new Error('cluster_data requires at least one featureColumn');
    }

    // Build numeric matrix, normalize per column
    const columns = featureCols.map((col) => this.extractNumericColumn(task.data, col));
    const minLen = Math.min(...columns.map((c) => c.length));
    if (minLen < k) {
      throw new Error(`Not enough data points (${minLen}) for ${k} clusters`);
    }

    // Normalize columns (min-max)
    const normalized = columns.map((col) => {
      const vals = col.slice(0, minLen);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const range = max - min || 1;
      return vals.map((v) => (v - min) / range);
    });

    // Build data points
    const dataPoints: number[][] = [];
    for (let i = 0; i < minLen; i++) {
      dataPoints.push(normalized.map((col) => col[i]));
    }

    const result = this.kMeans(dataPoints, k);

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];
    for (let c = 0; c < result.centroids.length; c++) {
      const centroidDesc = result.centroids[c].map((v, i) => `${featureCols[i]}=${v.toFixed(3)}`).join(', ');
      suggestions.push({
        action: 'cluster_identified',
        description: `Cluster ${c + 1}: ${result.clusterSizes[c]} members, centroid: [${centroidDesc}]`,
        confidence: 0.8,
      });
    }

    suggestions.push({
      action: 'clustering_summary',
      description: `K-means with k=${k} converged. Total inertia: ${result.inertia.toFixed(4)}. Cluster sizes: ${result.clusterSizes.join(', ')}`,
      confidence: 0.85,
    });

    const interpretation = `K-means clustering with k=${k} on ${featureCols.length} features and ${minLen} data points. Cluster distribution: ${result.clusterSizes.map((s, i) => `C${i + 1}=${s}`).join(', ')}. Inertia: ${result.inertia.toFixed(2)}.`;

    await prisma.auditLog.create({
      data: {
        action: 'analytics_cluster_data',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ k, dataPoints: minLen, inertia: result.inertia, clusterSizes: result.clusterSizes }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async forecastTrend(task: AnalyticsTask): Promise<AgentResult> {
    const targetCol = task.targetColumn;
    if (!targetCol) {
      throw new Error('forecast_trend requires targetColumn');
    }

    const values = this.extractNumericColumn(task.data, targetCol);
    if (values.length < 3) {
      throw new Error('forecast_trend requires at least 3 data points');
    }

    const periods = task.forecastPeriods ?? 5;

    // Moving average forecast
    const ma5 = this.movingAverage(values, Math.min(5, values.length));
    const maForecast: number[] = [];
    const lastMA = ma5[ma5.length - 1];
    const maTrend = ma5.length > 1 ? (ma5[ma5.length - 1] - ma5[ma5.length - 2]) : 0;
    for (let i = 1; i <= periods; i++) {
      maForecast.push(lastMA + maTrend * i);
    }

    // Exponential smoothing forecast
    const esResult = this.exponentialSmoothing(values, 0.3);
    const esForecast = esResult.forecast.slice(0, periods);

    // Linear trend forecast
    const xIndex = values.map((_, i) => i);
    const reg = this.linearRegression(xIndex, values);
    const linearForecast: number[] = [];
    for (let i = 0; i < periods; i++) {
      linearForecast.push(reg.slope * (values.length + i) + reg.intercept);
    }

    // Ensemble: average of the three methods
    const ensembleForecast = maForecast.map((_, i) => (maForecast[i] + esForecast[i] + linearForecast[i]) / 3);

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [
      {
        action: 'forecast_moving_average',
        description: `Moving average forecast (next ${periods}): [${maForecast.map((v) => v.toFixed(2)).join(', ')}]`,
        confidence: 0.7,
      },
      {
        action: 'forecast_exponential_smoothing',
        description: `Exponential smoothing forecast (alpha=0.3, next ${periods}): [${esForecast.map((v) => v.toFixed(2)).join(', ')}]`,
        confidence: 0.75,
      },
      {
        action: 'forecast_linear_trend',
        description: `Linear trend forecast (R²=${reg.rSquared.toFixed(3)}, next ${periods}): [${linearForecast.map((v) => v.toFixed(2)).join(', ')}]`,
        confidence: Math.min(0.9, reg.rSquared + 0.1),
      },
      {
        action: 'forecast_ensemble',
        description: `Ensemble forecast (average of 3 methods, next ${periods}): [${ensembleForecast.map((v) => v.toFixed(2)).join(', ')}]`,
        confidence: 0.8,
      },
    ];

    const trend = reg.slope > 0 ? 'upward' : reg.slope < 0 ? 'downward' : 'flat';
    const interpretation = `Trend analysis on "${targetCol}" (${values.length} points): ${trend} trend with slope ${reg.slope.toFixed(4)}. Linear fit R²=${reg.rSquared.toFixed(3)}. Ensemble forecast for next ${periods} periods: [${ensembleForecast.map((v) => v.toFixed(2)).join(', ')}].`;

    await prisma.auditLog.create({
      data: {
        action: 'analytics_forecast_trend',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ targetColumn: targetCol, periods, trend, rSquared: reg.rSquared }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async correlationAnalysis(task: AnalyticsTask): Promise<AgentResult> {
    const featureCols = task.featureColumns ?? [];
    if (featureCols.length < 2) {
      throw new Error('correlation_analysis requires at least 2 featureColumns');
    }

    const columns = featureCols.map((col) => ({
      name: col,
      values: this.extractNumericColumn(task.data, col),
    }));

    const matrix: Array<{ col1: string; col2: string; correlation: number; strength: string }> = [];

    for (let i = 0; i < columns.length; i++) {
      for (let j = i + 1; j < columns.length; j++) {
        const minLen = Math.min(columns[i].values.length, columns[j].values.length);
        if (minLen < 3) continue;
        const corr = this.pearsonCorrelation(
          columns[i].values.slice(0, minLen),
          columns[j].values.slice(0, minLen)
        );
        const absCorr = Math.abs(corr);
        const strength = absCorr > 0.8 ? 'strong' : absCorr > 0.5 ? 'moderate' : absCorr > 0.3 ? 'weak' : 'negligible';
        matrix.push({ col1: columns[i].name, col2: columns[j].name, correlation: corr, strength });
      }
    }

    const sorted = [...matrix].sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

    const suggestions = sorted.map((m) => ({
      action: 'correlation_found',
      description: `${m.col1} <-> ${m.col2}: r=${m.correlation.toFixed(4)} (${m.strength}${m.correlation < 0 ? ', inverse' : ''})`,
      confidence: Math.min(0.99, Math.abs(m.correlation)),
    }));

    const strongPairs = matrix.filter((m) => Math.abs(m.correlation) > 0.7);
    const interpretation = `Correlation analysis on ${featureCols.length} columns (${matrix.length} pairs). ${strongPairs.length} strong correlations found. Strongest: ${sorted[0] ? `${sorted[0].col1} <-> ${sorted[0].col2} (r=${sorted[0].correlation.toFixed(4)})` : 'none'}.`;

    await prisma.auditLog.create({
      data: {
        action: 'analytics_correlation_analysis',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ pairsAnalyzed: matrix.length, strongCorrelations: strongPairs.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async segmentAnalysis(task: AnalyticsTask): Promise<AgentResult> {
    const targetCol = task.targetColumn;
    const featureCols = task.featureColumns ?? [];

    if (!targetCol || featureCols.length === 0) {
      throw new Error('segment_analysis requires targetColumn and at least one featureColumn');
    }

    // Group by target column and compute stats per segment
    const segments = new Map<string, Array<Record<string, number | string | null>>>();
    for (const row of task.data) {
      const segKey = String(row[targetCol] ?? 'null');
      if (!segments.has(segKey)) segments.set(segKey, []);
      segments.get(segKey)!.push(row);
    }

    const segmentProfiles: Array<{
      segment: string;
      size: number;
      featureStats: Array<{ feature: string; mean: number; stddev: number; min: number; max: number }>;
    }> = [];

    for (const [segKey, rows] of segments) {
      const featureStats = featureCols.map((col) => {
        const vals = rows
          .map((r) => r[col])
          .filter((v): v is number | string => v !== null && v !== undefined)
          .map((v) => (typeof v === 'number' ? v : Number(v)))
          .filter((v) => !isNaN(v));

        if (vals.length === 0) return { feature: col, mean: 0, stddev: 0, min: 0, max: 0 };

        const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
        const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
        return {
          feature: col,
          mean,
          stddev: Math.sqrt(variance),
          min: Math.min(...vals),
          max: Math.max(...vals),
        };
      });

      segmentProfiles.push({ segment: segKey, size: rows.length, featureStats });
    }

    const prompt = `You are a data segmentation analyst for a Saudi-market analytics platform.
Analyze these segment profiles and provide insights.

Segments grouped by "${targetCol}":
${JSON.stringify(segmentProfiles.map((s) => ({
  segment: s.segment,
  size: s.size,
  stats: s.featureStats.map((f) => ({ feature: f.feature, mean: f.mean.toFixed(2), stddev: f.stddev.toFixed(2) })),
})), null, 2)}

${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "segment_insight", "description": "insight about segment differences", "confidence": 0.85 }
  ],
  "interpretation": "overall segmentation analysis in Arabic (formal MSA)"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for segment_analysis');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'analytics_segment_analysis',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ segmentCount: segments.size, targetColumn: targetCol }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }
}
