import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────

interface ForecastResult {
  column: string;
  method: string;
  predictions: Array<{ index: number; value: number; lowerBound: number; upperBound: number }>;
  accuracy: { mae: number; rmse: number; mape: number };
}

interface RegressionResult {
  targetColumn: string;
  features: string[];
  coefficients: Record<string, number>;
  intercept: number;
  rSquared: number;
  residuals: number[];
}

interface CorrelationMatrixResult {
  columns: string[];
  matrix: number[][];
}

interface ClusterResult {
  k: number;
  columns: string[];
  assignments: number[];
  centroids: number[][];
  inertia: number;
  iterations: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function vecMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = vecMean(xs.slice(0, n));
  const my = vecMean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const diffX = xs[i] - mx;
    const diffY = ys[i] - my;
    num += diffX * diffY;
    dx += diffX * diffX;
    dy += diffY * diffY;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

/**
 * Solves (X'X)^-1 X'y via Gaussian elimination on the augmented normal equations.
 * Returns null if the system is singular.
 */
function solveNormalEquation(X: number[][], y: number[]): number[] | null {
  const n = X.length;
  const p = X[0].length;

  // Build X'X (p x p) and X'y (p x 1)
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty: number[] = new Array(p).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      Xty[j] += X[i][j] * y[i];
      for (let k = j; k < p; k++) {
        XtX[j][k] += X[i][j] * X[i][k];
      }
    }
  }
  // Symmetric fill
  for (let j = 0; j < p; j++) {
    for (let k = 0; k < j; k++) {
      XtX[j][k] = XtX[k][j];
    }
  }

  // Augmented matrix [XtX | Xty]
  const aug: number[][] = XtX.map((row, i) => [...row, Xty[i]]);

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < p; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < p; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    if (maxVal < 1e-12) return null; // Singular

    // Swap rows
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }

    // Eliminate below
    for (let row = col + 1; row < p; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= p; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const result = new Array(p).fill(0);
  for (let i = p - 1; i >= 0; i--) {
    let sum = aug[i][p];
    for (let j = i + 1; j < p; j++) {
      sum -= aug[i][j] * result[j];
    }
    if (Math.abs(aug[i][i]) < 1e-12) return null;
    result[i] = sum / aug[i][i];
  }

  return result;
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// ─── Service ─────────────────────────────────────────────────────────

export class PredictiveEngineService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async forecast(
    datasetId: string,
    tenantId: string,
    column: string,
    periods: number,
    method: 'moving_average' | 'exponential_smoothing' | 'linear_trend' = 'linear_trend'
  ): Promise<ForecastResult> {
    logger.info('Starting forecast', { datasetId, tenantId, column, periods, method });

    const values = await this.loadNumericColumn(datasetId, tenantId, column);

    if (values.length < 3) {
      throw new Error(`Insufficient data for forecasting: need at least 3 data points, got ${values.length}`);
    }

    let predictions: Array<{ index: number; value: number; lowerBound: number; upperBound: number }>;

    switch (method) {
      case 'moving_average':
        predictions = this.forecastMovingAverage(values, periods);
        break;
      case 'exponential_smoothing':
        predictions = this.forecastExponentialSmoothing(values, periods);
        break;
      case 'linear_trend':
        predictions = this.forecastLinearTrend(values, periods);
        break;
    }

    // Compute accuracy using hold-out (last 20% of data)
    const accuracy = this.computeForecastAccuracy(values, method);

    logger.info('Forecast completed', {
      datasetId,
      column,
      method,
      periodsForecasted: periods,
    });

    return {
      column,
      method,
      predictions,
      accuracy,
    };
  }

  async linearRegression(
    datasetId: string,
    tenantId: string,
    targetColumn: string,
    featureColumns: string[]
  ): Promise<RegressionResult> {
    logger.info('Starting linear regression', { datasetId, tenantId, targetColumn, featureColumns });

    if (featureColumns.length === 0) {
      throw new Error('At least one feature column is required');
    }

    const dataset = await this.prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    if (!dataset) {
      throw new Error(`Dataset '${datasetId}' not found for tenant '${tenantId}'`);
    }

    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      select: { data: true },
    });

    const allColumns = [targetColumn, ...featureColumns];
    const rows: number[][] = [];
    const yVals: number[] = [];

    for (const dr of dataRows) {
      const data = dr.data as Record<string, any>;
      const targetVal = Number(data[targetColumn]);
      if (isNaN(targetVal)) continue;

      const featureVals: number[] = [];
      let valid = true;
      for (const fc of featureColumns) {
        const v = Number(data[fc]);
        if (isNaN(v)) {
          valid = false;
          break;
        }
        featureVals.push(v);
      }
      if (!valid) continue;

      yVals.push(targetVal);
      // Add intercept term (1) at the beginning
      rows.push([1, ...featureVals]);
    }

    if (rows.length < featureColumns.length + 1) {
      throw new Error(
        `Insufficient valid rows for regression: need at least ${featureColumns.length + 1}, got ${rows.length}`
      );
    }

    // Solve using normal equation: beta = (X'X)^-1 X'y
    const beta = solveNormalEquation(rows, yVals);
    if (!beta) {
      throw new Error('Singular matrix: features may be linearly dependent');
    }

    const intercept = beta[0];
    const coefficients: Record<string, number> = {};
    for (let i = 0; i < featureColumns.length; i++) {
      coefficients[featureColumns[i]] = Math.round(beta[i + 1] * 1000000) / 1000000;
    }

    // Compute residuals and R²
    const residuals: number[] = [];
    let ssRes = 0;
    let ssTot = 0;
    const yMean = vecMean(yVals);

    for (let i = 0; i < rows.length; i++) {
      let predicted = 0;
      for (let j = 0; j < beta.length; j++) {
        predicted += beta[j] * rows[i][j];
      }
      const residual = yVals[i] - predicted;
      residuals.push(Math.round(residual * 10000) / 10000);
      ssRes += residual ** 2;
      ssTot += (yVals[i] - yMean) ** 2;
    }

    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    logger.info('Linear regression completed', {
      datasetId,
      rSquared: Math.round(rSquared * 10000) / 10000,
      sampleCount: rows.length,
    });

    return {
      targetColumn,
      features: featureColumns,
      coefficients,
      intercept: Math.round(intercept * 1000000) / 1000000,
      rSquared: Math.round(rSquared * 10000) / 10000,
      residuals,
    };
  }

  async correlationMatrix(
    datasetId: string,
    tenantId: string,
    columns?: string[]
  ): Promise<CorrelationMatrixResult> {
    logger.info('Computing correlation matrix', { datasetId, tenantId, columns });

    const dataset = await this.prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    if (!dataset) {
      throw new Error(`Dataset '${datasetId}' not found for tenant '${tenantId}'`);
    }

    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      select: { data: true },
    });

    // Determine which columns to include (only numeric)
    const targetColumns = columns || dataset.columns.map(c => c.name);

    // Extract numeric data per column
    const columnData: Map<string, number[]> = new Map();

    for (const colName of targetColumns) {
      const values: number[] = [];
      for (const dr of dataRows) {
        const data = dr.data as Record<string, any>;
        const num = Number(data[colName]);
        values.push(num);
      }
      // Only include columns where most values are numeric
      const validCount = values.filter(v => !isNaN(v)).length;
      if (validCount > dataRows.length * 0.5) {
        // Replace NaN with column mean for correlation computation
        const validValues = values.filter(v => !isNaN(v));
        const colMean = vecMean(validValues);
        const cleaned = values.map(v => (isNaN(v) ? colMean : v));
        columnData.set(colName, cleaned);
      }
    }

    const colNames = [...columnData.keys()];
    const n = colNames.length;
    const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1; // Self-correlation is always 1
      const xVals = columnData.get(colNames[i])!;
      for (let j = i + 1; j < n; j++) {
        const yVals = columnData.get(colNames[j])!;
        const r = pearsonR(xVals, yVals);
        const rounded = Math.round(r * 10000) / 10000;
        matrix[i][j] = rounded;
        matrix[j][i] = rounded;
      }
    }

    logger.info('Correlation matrix computed', {
      datasetId,
      columnCount: n,
    });

    return { columns: colNames, matrix };
  }

  async clusterAnalysis(
    datasetId: string,
    tenantId: string,
    columns: string[],
    k: number
  ): Promise<ClusterResult> {
    logger.info('Starting K-means clustering', { datasetId, tenantId, columns, k });

    if (k < 2) throw new Error('k must be at least 2');
    if (columns.length === 0) throw new Error('At least one column is required');

    const dataset = await this.prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    if (!dataset) {
      throw new Error(`Dataset '${datasetId}' not found for tenant '${tenantId}'`);
    }

    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      select: { data: true },
    });

    // Extract and normalize data
    const rawPoints: number[][] = [];
    for (const dr of dataRows) {
      const data = dr.data as Record<string, any>;
      const point: number[] = [];
      let valid = true;
      for (const col of columns) {
        const v = Number(data[col]);
        if (isNaN(v)) {
          valid = false;
          break;
        }
        point.push(v);
      }
      if (valid) rawPoints.push(point);
    }

    if (rawPoints.length < k) {
      throw new Error(`Insufficient valid data points (${rawPoints.length}) for ${k} clusters`);
    }

    // Z-score normalization
    const dim = columns.length;
    const colMeans = new Array(dim).fill(0);
    const colStds = new Array(dim).fill(0);

    for (let d = 0; d < dim; d++) {
      const vals = rawPoints.map(p => p[d]);
      colMeans[d] = vecMean(vals);
      const variance = vals.reduce((s, v) => s + (v - colMeans[d]) ** 2, 0) / vals.length;
      colStds[d] = Math.sqrt(variance);
      if (colStds[d] === 0) colStds[d] = 1; // Avoid division by zero
    }

    const points: number[][] = rawPoints.map(p =>
      p.map((v, d) => (v - colMeans[d]) / colStds[d])
    );

    // K-means++ initialization
    const centroids = this.kMeansPlusPlusInit(points, k);

    // K-means iterations
    const maxIter = 100;
    let assignments = new Array(points.length).fill(0);
    let iterations = 0;

    for (let iter = 0; iter < maxIter; iter++) {
      iterations = iter + 1;
      let changed = false;

      // Assign points to nearest centroid
      for (let i = 0; i < points.length; i++) {
        let minDist = Infinity;
        let bestCluster = 0;
        for (let c = 0; c < k; c++) {
          const dist = euclideanDistance(points[i], centroids[c]);
          if (dist < minDist) {
            minDist = dist;
            bestCluster = c;
          }
        }
        if (assignments[i] !== bestCluster) {
          assignments[i] = bestCluster;
          changed = true;
        }
      }

      if (!changed) break;

      // Recompute centroids
      for (let c = 0; c < k; c++) {
        const clusterPoints = points.filter((_, i) => assignments[i] === c);
        if (clusterPoints.length === 0) continue;
        for (let d = 0; d < dim; d++) {
          centroids[c][d] = vecMean(clusterPoints.map(p => p[d]));
        }
      }
    }

    // Compute inertia (within-cluster sum of squares)
    let inertia = 0;
    for (let i = 0; i < points.length; i++) {
      inertia += euclideanDistance(points[i], centroids[assignments[i]]) ** 2;
    }

    // De-normalize centroids back to original scale
    const denormalizedCentroids = centroids.map(c =>
      c.map((v, d) => Math.round((v * colStds[d] + colMeans[d]) * 10000) / 10000)
    );

    logger.info('K-means clustering completed', {
      datasetId,
      k,
      iterations,
      inertia: Math.round(inertia * 100) / 100,
      pointCount: points.length,
    });

    return {
      k,
      columns,
      assignments,
      centroids: denormalizedCentroids,
      inertia: Math.round(inertia * 100) / 100,
      iterations,
    };
  }

  // ─── Private: Data loading ───────────────────────────────────────

  private async loadNumericColumn(
    datasetId: string,
    tenantId: string,
    column: string
  ): Promise<number[]> {
    const dataset = await this.prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
    });

    if (!dataset) {
      throw new Error(`Dataset '${datasetId}' not found for tenant '${tenantId}'`);
    }

    const dataRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      select: { data: true },
    });

    const values: number[] = [];
    for (const dr of dataRows) {
      const data = dr.data as Record<string, any>;
      const num = Number(data[column]);
      if (!isNaN(num)) {
        values.push(num);
      }
    }

    return values;
  }

  // ─── Private: Forecast methods ───────────────────────────────────

  private forecastMovingAverage(
    values: number[],
    periods: number,
    windowSize: number = Math.min(5, Math.floor(values.length / 2))
  ): Array<{ index: number; value: number; lowerBound: number; upperBound: number }> {
    const n = values.length;
    const window = Math.max(2, Math.min(windowSize, n));

    // Compute standard deviation of recent residuals for confidence interval
    const recentResiduals: number[] = [];
    for (let i = window; i < n; i++) {
      const maValue = vecMean(values.slice(i - window, i));
      recentResiduals.push(values[i] - maValue);
    }
    const residualStd = recentResiduals.length > 0
      ? Math.sqrt(recentResiduals.reduce((s, r) => s + r * r, 0) / recentResiduals.length)
      : 0;

    const predictions: Array<{ index: number; value: number; lowerBound: number; upperBound: number }> = [];
    const extended = [...values];

    for (let p = 0; p < periods; p++) {
      const start = extended.length - window;
      const maValue = vecMean(extended.slice(start));
      const rounded = Math.round(maValue * 10000) / 10000;
      const margin = residualStd * 1.96 * Math.sqrt(1 + p * 0.1);

      predictions.push({
        index: n + p,
        value: rounded,
        lowerBound: Math.round((rounded - margin) * 10000) / 10000,
        upperBound: Math.round((rounded + margin) * 10000) / 10000,
      });

      extended.push(rounded);
    }

    return predictions;
  }

  private forecastExponentialSmoothing(
    values: number[],
    periods: number,
    alpha: number = 0.3
  ): Array<{ index: number; value: number; lowerBound: number; upperBound: number }> {
    const n = values.length;

    // Compute smoothed series
    const smoothed: number[] = [values[0]];
    for (let i = 1; i < n; i++) {
      smoothed.push(alpha * values[i] + (1 - alpha) * smoothed[i - 1]);
    }

    // Compute residual standard deviation
    const residuals: number[] = [];
    for (let i = 1; i < n; i++) {
      residuals.push(values[i] - smoothed[i - 1]);
    }
    const residualStd = residuals.length > 0
      ? Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length)
      : 0;

    const predictions: Array<{ index: number; value: number; lowerBound: number; upperBound: number }> = [];
    let lastSmoothed = smoothed[n - 1];

    for (let p = 0; p < periods; p++) {
      // For exponential smoothing, forecast is the last smoothed value
      const forecast = Math.round(lastSmoothed * 10000) / 10000;
      const margin = residualStd * 1.96 * Math.sqrt(1 + p * 0.2);

      predictions.push({
        index: n + p,
        value: forecast,
        lowerBound: Math.round((forecast - margin) * 10000) / 10000,
        upperBound: Math.round((forecast + margin) * 10000) / 10000,
      });
    }

    return predictions;
  }

  private forecastLinearTrend(
    values: number[],
    periods: number
  ): Array<{ index: number; value: number; lowerBound: number; upperBound: number }> {
    const n = values.length;

    // Fit y = mx + b using least squares
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }

    const denom = n * sumXX - sumX * sumX;
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / n;

    // Compute residual standard error
    let ssRes = 0;
    for (let i = 0; i < n; i++) {
      const predicted = slope * i + intercept;
      ssRes += (values[i] - predicted) ** 2;
    }
    const residualStd = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;

    const predictions: Array<{ index: number; value: number; lowerBound: number; upperBound: number }> = [];
    const xMean = sumX / n;

    for (let p = 0; p < periods; p++) {
      const x = n + p;
      const forecast = slope * x + intercept;
      const rounded = Math.round(forecast * 10000) / 10000;

      // Prediction interval widens with distance from mean
      const hii = 1 / n + (x - xMean) ** 2 / (sumXX - sumX * sumX / n);
      const margin = residualStd * 1.96 * Math.sqrt(1 + hii);

      predictions.push({
        index: x,
        value: rounded,
        lowerBound: Math.round((rounded - margin) * 10000) / 10000,
        upperBound: Math.round((rounded + margin) * 10000) / 10000,
      });
    }

    return predictions;
  }

  private computeForecastAccuracy(
    values: number[],
    method: 'moving_average' | 'exponential_smoothing' | 'linear_trend'
  ): { mae: number; rmse: number; mape: number } {
    const n = values.length;
    const holdoutSize = Math.max(1, Math.floor(n * 0.2));
    const trainSize = n - holdoutSize;

    if (trainSize < 3) {
      return { mae: 0, rmse: 0, mape: 0 };
    }

    const trainValues = values.slice(0, trainSize);
    const testValues = values.slice(trainSize);

    let predictions: Array<{ value: number }>;

    switch (method) {
      case 'moving_average':
        predictions = this.forecastMovingAverage(trainValues, holdoutSize);
        break;
      case 'exponential_smoothing':
        predictions = this.forecastExponentialSmoothing(trainValues, holdoutSize);
        break;
      case 'linear_trend':
        predictions = this.forecastLinearTrend(trainValues, holdoutSize);
        break;
    }

    let sumAE = 0;
    let sumSE = 0;
    let sumAPE = 0;
    let validMape = 0;

    for (let i = 0; i < testValues.length; i++) {
      const actual = testValues[i];
      const predicted = predictions[i].value;
      const error = actual - predicted;
      sumAE += Math.abs(error);
      sumSE += error ** 2;
      if (actual !== 0) {
        sumAPE += Math.abs(error / actual);
        validMape++;
      }
    }

    const count = testValues.length;
    return {
      mae: Math.round((sumAE / count) * 10000) / 10000,
      rmse: Math.round(Math.sqrt(sumSE / count) * 10000) / 10000,
      mape: validMape > 0 ? Math.round((sumAPE / validMape) * 100 * 100) / 100 : 0,
    };
  }

  // ─── Private: K-means++ initialization ───────────────────────────

  private kMeansPlusPlusInit(points: number[][], k: number): number[][] {
    const n = points.length;
    const dim = points[0].length;
    const centroids: number[][] = [];

    // Pick first centroid uniformly at random (using deterministic seed for reproducibility)
    const firstIdx = 0; // Deterministic: always pick first point
    centroids.push([...points[firstIdx]]);

    // Pick remaining centroids weighted by distance squared
    for (let c = 1; c < k; c++) {
      const distances = new Array(n).fill(Infinity);
      for (let i = 0; i < n; i++) {
        for (const centroid of centroids) {
          const d = euclideanDistance(points[i], centroid);
          if (d < distances[i]) distances[i] = d;
        }
      }

      // Square the distances
      const d2 = distances.map(d => d * d);
      const totalD2 = d2.reduce((s, v) => s + v, 0);

      if (totalD2 === 0) {
        // All points are the same; pick the next distinct point
        centroids.push([...points[c % n]]);
        continue;
      }

      // Deterministic selection: pick the point with maximum D²
      let maxD2Idx = 0;
      let maxD2Val = 0;
      for (let i = 0; i < n; i++) {
        if (d2[i] > maxD2Val) {
          maxD2Val = d2[i];
          maxD2Idx = i;
        }
      }
      centroids.push([...points[maxD2Idx]]);
    }

    return centroids;
  }
}
