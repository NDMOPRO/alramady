import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const prisma = new PrismaClient();

interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

interface ForecastResult {
  method: 'linear_regression' | 'exponential_smoothing' | 'moving_average';
  historicalPoints: number;
  forecastedPoints: TimeSeriesPoint[];
  metrics: {
    mae: number;
    rmse: number;
    mape: number;
    r2: number;
  };
  parameters: Record<string, number>;
  executedAt: Date;
}

interface TrendResult {
  direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  slope: number;
  intercept: number;
  r2: number;
  seasonalityDetected: boolean;
  seasonalPeriod: number | null;
  changePoints: Array<{ index: number; timestamp: number; beforeSlope: number; afterSlope: number }>;
  interpretation: string;
  executedAt: Date;
}

export class PredictiveAnalyticsService {
  async forecastTimeSeries(input: {
    datasetId: string;
    data: TimeSeriesPoint[];
    method: 'linear_regression' | 'exponential_smoothing' | 'moving_average';
    horizonSteps: number;
    parameters?: Record<string, number>;
  }): Promise<ForecastResult> {
    const { data, method, horizonSteps } = input;

    if (data.length < 3) {
      throw new Error('At least 3 data points are required for forecasting');
    }

    const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);

    let result: ForecastResult;

    switch (method) {
      case 'linear_regression':
        result = this.linearRegressionForecast(sorted, horizonSteps, input.parameters);
        break;
      case 'exponential_smoothing':
        result = this.exponentialSmoothingForecast(sorted, horizonSteps, input.parameters);
        break;
      case 'moving_average':
        result = this.movingAverageForecast(sorted, horizonSteps, input.parameters);
        break;
      default: {
        const exhaustive: never = method;
        throw new Error(`Unsupported forecast method: ${exhaustive}`);
      }
    }

    await prisma.auditLog.create({
      data: {
        action: 'predictive_forecast',
        entityType: 'dataset',
        entityId: input.datasetId,
        details: JSON.stringify({
          method,
          historicalPoints: sorted.length,
          forecastedPoints: horizonSteps,
          metrics: result.metrics,
        }),
        performedAt: new Date(),
      },
    });

    return result;
  }

  async detectTrend(input: {
    datasetId: string;
    data: TimeSeriesPoint[];
    context?: string;
  }): Promise<TrendResult> {
    const sorted = [...input.data].sort((a, b) => a.timestamp - b.timestamp);

    if (sorted.length < 3) {
      throw new Error('At least 3 data points are required for trend detection');
    }

    const values = sorted.map((p) => p.value);
    const timestamps = sorted.map((p) => p.timestamp);

    const { slope, intercept, r2 } = this.linearRegression(
      timestamps.map((_, i) => i),
      values
    );

    let direction: TrendResult['direction'];
    if (r2 < 0.1) {
      direction = 'volatile';
    } else if (Math.abs(slope) < 0.001 * (Math.max(...values) - Math.min(...values))) {
      direction = 'stable';
    } else if (slope > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }

    const { detected: seasonalityDetected, period: seasonalPeriod } = this.detectSeasonality(values);

    const changePoints = this.detectChangePoints(sorted);

    const prompt = `You are a time series analyst for a Saudi analytics platform.
Interpret this trend analysis in formal Arabic (MSA).

Trend: ${direction}
Slope: ${slope.toFixed(6)}
R-squared: ${r2.toFixed(4)}
Data points: ${sorted.length}
Seasonality: ${seasonalityDetected ? `detected with period ${seasonalPeriod}` : 'not detected'}
Change points: ${changePoints.length}

${input.context ? `Context: ${input.context}` : ''}

Respond in JSON: { "interpretation": "2-3 sentence Arabic interpretation" }`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for trend interpretation');
    }

    const parsed: { interpretation: string } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'predictive_trend',
        entityType: 'dataset',
        entityId: input.datasetId,
        details: JSON.stringify({
          direction,
          slope,
          r2,
          seasonalityDetected,
          changePoints: changePoints.length,
        }),
        performedAt: new Date(),
      },
    });

    return {
      direction,
      slope: parseFloat(slope.toFixed(6)),
      intercept: parseFloat(intercept.toFixed(6)),
      r2: parseFloat(r2.toFixed(6)),
      seasonalityDetected,
      seasonalPeriod,
      changePoints,
      interpretation: parsed.interpretation,
      executedAt: new Date(),
    };
  }

  private linearRegressionForecast(
    data: TimeSeriesPoint[],
    horizonSteps: number,
    params?: Record<string, number>
  ): ForecastResult {
    const xValues = data.map((_, i) => i);
    const yValues = data.map((p) => p.value);

    const { slope, intercept, r2 } = this.linearRegression(xValues, yValues);

    const fitted = xValues.map((x) => slope * x + intercept);
    const metrics = this.computeMetrics(yValues, fitted);
    metrics.r2 = r2;

    const lastTimestamp = data[data.length - 1].timestamp;
    const avgInterval = data.length > 1
      ? (data[data.length - 1].timestamp - data[0].timestamp) / (data.length - 1)
      : 1;

    const forecastedPoints: TimeSeriesPoint[] = [];
    for (let i = 1; i <= horizonSteps; i++) {
      const x = data.length - 1 + i;
      forecastedPoints.push({
        timestamp: lastTimestamp + i * avgInterval,
        value: parseFloat((slope * x + intercept).toFixed(6)),
      });
    }

    return {
      method: 'linear_regression',
      historicalPoints: data.length,
      forecastedPoints,
      metrics,
      parameters: {
        slope: parseFloat(slope.toFixed(6)),
        intercept: parseFloat(intercept.toFixed(6)),
        ...(params ?? {}),
      },
      executedAt: new Date(),
    };
  }

  private exponentialSmoothingForecast(
    data: TimeSeriesPoint[],
    horizonSteps: number,
    params?: Record<string, number>
  ): ForecastResult {
    const alpha = params?.['alpha'] ?? this.optimizeAlpha(data.map((p) => p.value));
    const yValues = data.map((p) => p.value);

    const smoothed: number[] = [yValues[0]];
    for (let i = 1; i < yValues.length; i++) {
      smoothed.push(alpha * yValues[i] + (1 - alpha) * smoothed[i - 1]);
    }

    const metrics = this.computeMetrics(yValues, smoothed);

    const { slope, intercept } = this.linearRegression(
      yValues.map((_, i) => i),
      yValues
    );
    metrics.r2 = parseFloat(
      this.linearRegression(
        yValues.map((_, i) => i),
        yValues
      ).r2.toFixed(6)
    );

    const lastSmoothed = smoothed[smoothed.length - 1];
    const lastTimestamp = data[data.length - 1].timestamp;
    const avgInterval = data.length > 1
      ? (data[data.length - 1].timestamp - data[0].timestamp) / (data.length - 1)
      : 1;

    const trendComponent = yValues.length >= 2
      ? (smoothed[smoothed.length - 1] - smoothed[smoothed.length - 2])
      : 0;

    const forecastedPoints: TimeSeriesPoint[] = [];
    for (let i = 1; i <= horizonSteps; i++) {
      forecastedPoints.push({
        timestamp: lastTimestamp + i * avgInterval,
        value: parseFloat((lastSmoothed + trendComponent * i).toFixed(6)),
      });
    }

    return {
      method: 'exponential_smoothing',
      historicalPoints: data.length,
      forecastedPoints,
      metrics,
      parameters: {
        alpha: parseFloat(alpha.toFixed(4)),
        lastSmoothed: parseFloat(lastSmoothed.toFixed(6)),
        trendComponent: parseFloat(trendComponent.toFixed(6)),
      },
      executedAt: new Date(),
    };
  }

  private movingAverageForecast(
    data: TimeSeriesPoint[],
    horizonSteps: number,
    params?: Record<string, number>
  ): ForecastResult {
    const windowSize = params?.['windowSize'] ?? Math.min(5, Math.floor(data.length / 2));
    const yValues = data.map((p) => p.value);

    if (windowSize < 1 || windowSize > yValues.length) {
      throw new Error(`Invalid window size: ${windowSize}. Must be between 1 and ${yValues.length}`);
    }

    const smoothed: number[] = [];
    for (let i = 0; i < yValues.length; i++) {
      if (i < windowSize - 1) {
        const available = yValues.slice(0, i + 1);
        smoothed.push(available.reduce((s, v) => s + v, 0) / available.length);
      } else {
        const window = yValues.slice(i - windowSize + 1, i + 1);
        smoothed.push(window.reduce((s, v) => s + v, 0) / windowSize);
      }
    }

    const metrics = this.computeMetrics(yValues, smoothed);
    const { r2 } = this.linearRegression(
      yValues.map((_, i) => i),
      yValues
    );
    metrics.r2 = parseFloat(r2.toFixed(6));

    const lastTimestamp = data[data.length - 1].timestamp;
    const avgInterval = data.length > 1
      ? (data[data.length - 1].timestamp - data[0].timestamp) / (data.length - 1)
      : 1;

    const lastWindow = yValues.slice(-windowSize);
    const baseAvg = lastWindow.reduce((s, v) => s + v, 0) / lastWindow.length;

    const recentTrend = windowSize >= 2
      ? (lastWindow[lastWindow.length - 1] - lastWindow[0]) / (lastWindow.length - 1)
      : 0;

    const forecastedPoints: TimeSeriesPoint[] = [];
    for (let i = 1; i <= horizonSteps; i++) {
      forecastedPoints.push({
        timestamp: lastTimestamp + i * avgInterval,
        value: parseFloat((baseAvg + recentTrend * i).toFixed(6)),
      });
    }

    return {
      method: 'moving_average',
      historicalPoints: data.length,
      forecastedPoints,
      metrics,
      parameters: {
        windowSize,
        lastAverage: parseFloat(baseAvg.toFixed(6)),
        recentTrend: parseFloat(recentTrend.toFixed(6)),
      },
      executedAt: new Date(),
    };
  }

  private linearRegression(
    xValues: number[],
    yValues: number[]
  ): { slope: number; intercept: number; r2: number } {
    const n = xValues.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += xValues[i];
      sumY += yValues[i];
      sumXY += xValues[i] * yValues[i];
      sumX2 += xValues[i] * xValues[i];
      sumY2 += yValues[i] * yValues[i];
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
      return { slope: 0, intercept: sumY / n, r2: 0 };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    const meanY = sumY / n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
      const predicted = slope * xValues[i] + intercept;
      ssRes += (yValues[i] - predicted) ** 2;
      ssTot += (yValues[i] - meanY) ** 2;
    }

    const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

    return { slope, intercept, r2 };
  }

  private computeMetrics(
    actual: number[],
    predicted: number[]
  ): { mae: number; rmse: number; mape: number; r2: number } {
    const n = actual.length;
    let sumAE = 0, sumSE = 0, sumAPE = 0;

    for (let i = 0; i < n; i++) {
      const error = actual[i] - predicted[i];
      sumAE += Math.abs(error);
      sumSE += error ** 2;
      if (actual[i] !== 0) {
        sumAPE += Math.abs(error / actual[i]);
      }
    }

    return {
      mae: parseFloat((sumAE / n).toFixed(6)),
      rmse: parseFloat(Math.sqrt(sumSE / n).toFixed(6)),
      mape: parseFloat(((sumAPE / n) * 100).toFixed(4)),
      r2: 0,
    };
  }

  private optimizeAlpha(values: number[]): number {
    let bestAlpha = 0.3;
    let bestError = Infinity;

    for (let alpha = 0.05; alpha <= 0.95; alpha += 0.05) {
      const smoothed: number[] = [values[0]];
      for (let i = 1; i < values.length; i++) {
        smoothed.push(alpha * values[i] + (1 - alpha) * smoothed[i - 1]);
      }

      let sse = 0;
      for (let i = 1; i < values.length; i++) {
        sse += (values[i] - smoothed[i - 1]) ** 2;
      }

      if (sse < bestError) {
        bestError = sse;
        bestAlpha = alpha;
      }
    }

    return bestAlpha;
  }

  private detectSeasonality(values: number[]): { detected: boolean; period: number | null } {
    if (values.length < 8) {
      return { detected: false, period: null };
    }

    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const centered = values.map((v) => v - mean);

    const maxLag = Math.floor(values.length / 2);
    const autocorrelations: number[] = [];

    let c0 = 0;
    for (const v of centered) {
      c0 += v * v;
    }

    if (c0 === 0) {
      return { detected: false, period: null };
    }

    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < values.length - lag; i++) {
        sum += centered[i] * centered[i + lag];
      }
      autocorrelations.push(sum / c0);
    }

    let bestPeriod: number | null = null;
    let bestCorr = 0;
    const threshold = 0.3;

    for (let i = 1; i < autocorrelations.length; i++) {
      if (
        autocorrelations[i] > threshold &&
        autocorrelations[i] > bestCorr &&
        (i === 0 || autocorrelations[i] > autocorrelations[i - 1]) &&
        (i === autocorrelations.length - 1 || autocorrelations[i] > autocorrelations[i + 1])
      ) {
        bestCorr = autocorrelations[i];
        bestPeriod = i + 1;
      }
    }

    return {
      detected: bestPeriod !== null,
      period: bestPeriod,
    };
  }

  private detectChangePoints(
    data: TimeSeriesPoint[]
  ): Array<{ index: number; timestamp: number; beforeSlope: number; afterSlope: number }> {
    const changePoints: Array<{ index: number; timestamp: number; beforeSlope: number; afterSlope: number }> = [];
    const minSegmentSize = Math.max(3, Math.floor(data.length * 0.1));

    if (data.length < minSegmentSize * 2) {
      return changePoints;
    }

    const values = data.map((p) => p.value);
    let bestImprovement = 0;
    let bestSplit = -1;

    const totalResidual = this.computeResidual(values, 0, values.length - 1);

    for (let split = minSegmentSize; split <= values.length - minSegmentSize; split++) {
      const leftResidual = this.computeResidual(values, 0, split - 1);
      const rightResidual = this.computeResidual(values, split, values.length - 1);
      const improvement = totalResidual - (leftResidual + rightResidual);

      if (improvement > bestImprovement) {
        bestImprovement = improvement;
        bestSplit = split;
      }
    }

    const significanceThreshold = totalResidual * 0.1;

    if (bestSplit >= 0 && bestImprovement > significanceThreshold) {
      const xBefore = Array.from({ length: bestSplit }, (_, i) => i);
      const yBefore = values.slice(0, bestSplit);
      const { slope: beforeSlope } = this.linearRegression(xBefore, yBefore);

      const xAfter = Array.from({ length: values.length - bestSplit }, (_, i) => i);
      const yAfter = values.slice(bestSplit);
      const { slope: afterSlope } = this.linearRegression(xAfter, yAfter);

      changePoints.push({
        index: bestSplit,
        timestamp: data[bestSplit].timestamp,
        beforeSlope: parseFloat(beforeSlope.toFixed(6)),
        afterSlope: parseFloat(afterSlope.toFixed(6)),
      });
    }

    return changePoints;
  }

  private computeResidual(values: number[], start: number, end: number): number {
    const segment = values.slice(start, end + 1);
    const x = segment.map((_, i) => i);
    const { slope, intercept } = this.linearRegression(x, segment);

    let residual = 0;
    for (let i = 0; i < segment.length; i++) {
      residual += (segment[i] - (slope * i + intercept)) ** 2;
    }
    return residual;
  }
}
