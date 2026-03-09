import { PrismaClient } from '@prisma/client';
import winston from 'winston';

// ─── Interfaces ──────────────────────────────────────────────────────

interface TemporalPattern {
  type: 'trend' | 'seasonality' | 'changepoint' | 'anomaly';
  column: string;
  startIndex: number;
  endIndex: number;
  strength: number;
  description: string;
  metadata: Record<string, unknown>;
}

interface TemporalInput {
  columns: string[];
  rows: Record<string, unknown>[];
}

// ─── Logger ──────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ai-service', module: 'temporal-gradient' },
  transports: [new winston.transports.Console()],
});

// ─── Helpers ─────────────────────────────────────────────────────────

function toNumericSeries(
  rows: Record<string, unknown>[],
  valueColumn: string
): { index: number; value: number }[] {
  const result: { index: number; value: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i][valueColumn];
    const num = Number(raw);
    if (!isNaN(num)) {
      result.push({ index: i, value: num });
    }
  }
  return result;
}

function linearRegression(values: number[]): { slope: number; intercept: number; rSquared: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, rSquared: 0 };

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

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  const mean = sumY / n;
  let ssTotal = 0;
  let ssResidual = 0;
  for (let i = 0; i < n; i++) {
    ssTotal += (values[i] - mean) ** 2;
    const predicted = slope * i + intercept;
    ssResidual += (values[i] - predicted) ** 2;
  }

  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { slope, intercept, rSquared };
}

function movingAverage(values: number[], windowSize: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(values.length, i + Math.ceil(windowSize / 2));
    const window = values.slice(start, end);
    result.push(window.reduce((a, b) => a + b, 0) / window.length);
  }
  return result;
}

function computeStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ─── Service ─────────────────────────────────────────────────────────

export class TemporalGradientService {
  constructor(private prisma: PrismaClient) {}

  async detectPatterns(
    data: TemporalInput,
    dateColumn: string,
    valueColumn: string
  ): Promise<TemporalPattern[]> {
    const startTime = Date.now();
    logger.info('Detecting temporal patterns', {
      rowCount: data.rows.length,
      dateColumn,
      valueColumn,
    });

    const series = toNumericSeries(data.rows, valueColumn);

    if (series.length < 3) {
      logger.warn('Insufficient data points for temporal analysis', { count: series.length });
      return [];
    }

    const values = series.map((s) => s.value);
    const indices = series.map((s) => s.index);
    const patterns: TemporalPattern[] = [];

    const trendPatterns = this.detectTrend(values, indices, valueColumn);
    patterns.push(...trendPatterns);

    const seasonalityPatterns = this.detectSeasonality(values, indices, valueColumn);
    patterns.push(...seasonalityPatterns);

    const changepointPatterns = this.detectChangepoints(values, indices, valueColumn);
    patterns.push(...changepointPatterns);

    const anomalyPatterns = this.detectTimeSeriesAnomalies(values, indices, valueColumn);
    patterns.push(...anomalyPatterns);

    const durationMs = Date.now() - startTime;
    logger.info('Temporal pattern detection complete', {
      patternCount: patterns.length,
      durationMs,
    });

    return patterns;
  }

  private detectTrend(
    values: number[],
    indices: number[],
    column: string
  ): TemporalPattern[] {
    const patterns: TemporalPattern[] = [];
    const { slope, intercept, rSquared } = linearRegression(values);

    const strength = Math.min(1, Math.abs(rSquared));
    if (strength < 0.1) return patterns;

    const mean = computeMean(values);
    const normalizedSlope = mean !== 0 ? slope / Math.abs(mean) : slope;
    const direction = normalizedSlope > 0.001 ? 'upward' : normalizedSlope < -0.001 ? 'downward' : 'flat';

    if (direction === 'flat' && strength < 0.3) return patterns;

    patterns.push({
      type: 'trend',
      column,
      startIndex: indices[0],
      endIndex: indices[indices.length - 1],
      strength,
      description: `${direction === 'upward' ? 'Increasing' : direction === 'downward' ? 'Decreasing' : 'Stable'} trend detected with R-squared=${rSquared.toFixed(4)}. Slope=${slope.toFixed(4)}, indicating a ${direction} movement over ${values.length} data points.`,
      metadata: {
        slope: parseFloat(slope.toFixed(6)),
        intercept: parseFloat(intercept.toFixed(4)),
        rSquared: parseFloat(rSquared.toFixed(4)),
        direction,
        normalizedSlope: parseFloat(normalizedSlope.toFixed(6)),
      },
    });

    // Check for trend segments (split series in half)
    if (values.length >= 10) {
      const midpoint = Math.floor(values.length / 2);
      const firstHalf = values.slice(0, midpoint);
      const secondHalf = values.slice(midpoint);

      const firstReg = linearRegression(firstHalf);
      const secondReg = linearRegression(secondHalf);

      const slopeChange = secondReg.slope - firstReg.slope;
      const meanAbsSlope = (Math.abs(firstReg.slope) + Math.abs(secondReg.slope)) / 2;

      if (meanAbsSlope > 0 && Math.abs(slopeChange) / meanAbsSlope > 0.5) {
        patterns.push({
          type: 'trend',
          column,
          startIndex: indices[midpoint],
          endIndex: indices[indices.length - 1],
          strength: Math.min(1, secondReg.rSquared),
          description: `Trend shift detected at index ${indices[midpoint]}. First-half slope=${firstReg.slope.toFixed(4)}, second-half slope=${secondReg.slope.toFixed(4)}.`,
          metadata: {
            firstHalfSlope: parseFloat(firstReg.slope.toFixed(6)),
            secondHalfSlope: parseFloat(secondReg.slope.toFixed(6)),
            shiftMagnitude: parseFloat(slopeChange.toFixed(6)),
            midpointIndex: indices[midpoint],
          },
        });
      }
    }

    return patterns;
  }

  private detectSeasonality(
    values: number[],
    indices: number[],
    column: string
  ): TemporalPattern[] {
    const patterns: TemporalPattern[] = [];

    if (values.length < 8) return patterns;

    // Compare short moving average vs long moving average to find cyclical behavior
    const shortWindow = Math.max(2, Math.floor(values.length / 10));
    const longWindow = Math.max(4, Math.floor(values.length / 4));

    const shortMA = movingAverage(values, shortWindow);
    const longMA = movingAverage(values, longWindow);

    // Count zero-crossings of the difference (short - long)
    const diff = shortMA.map((s, i) => s - longMA[i]);
    let crossings = 0;
    for (let i = 1; i < diff.length; i++) {
      if ((diff[i - 1] >= 0 && diff[i] < 0) || (diff[i - 1] < 0 && diff[i] >= 0)) {
        crossings++;
      }
    }

    // If there are enough crossings relative to data length, it suggests periodicity
    const crossingRate = crossings / values.length;
    if (crossings >= 4 && crossingRate > 0.02) {
      const estimatedPeriod = crossings > 0 ? Math.round((values.length * 2) / crossings) : values.length;

      // Compute autocorrelation at the estimated period to confirm
      const mean = computeMean(values);
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0);
      let autocorr = 0;
      const lag = Math.min(estimatedPeriod, Math.floor(values.length / 2));

      if (lag > 0 && variance > 0) {
        for (let i = 0; i < values.length - lag; i++) {
          autocorr += (values[i] - mean) * (values[i + lag] - mean);
        }
        autocorr /= variance;
      }

      const strength = Math.min(1, Math.max(0, autocorr));

      if (strength > 0.15) {
        patterns.push({
          type: 'seasonality',
          column,
          startIndex: indices[0],
          endIndex: indices[indices.length - 1],
          strength,
          description: `Seasonal/cyclical pattern detected with estimated period of ~${estimatedPeriod} data points. ${crossings} cycle crossings observed. Autocorrelation at lag ${lag}: ${autocorr.toFixed(4)}.`,
          metadata: {
            estimatedPeriod,
            crossings,
            autocorrelation: parseFloat(autocorr.toFixed(4)),
            shortWindow,
            longWindow,
          },
        });
      }
    }

    return patterns;
  }

  private detectChangepoints(
    values: number[],
    indices: number[],
    column: string
  ): TemporalPattern[] {
    const patterns: TemporalPattern[] = [];

    if (values.length < 6) return patterns;

    // CUSUM (Cumulative Sum Control Chart) algorithm
    const mean = computeMean(values);
    const stdDev = computeStdDev(values);

    if (stdDev === 0) return patterns;

    const threshold = stdDev * 2;
    let cusumPos = 0;
    let cusumNeg = 0;
    const changepointIndices: number[] = [];

    for (let i = 0; i < values.length; i++) {
      const deviation = values[i] - mean;
      cusumPos = Math.max(0, cusumPos + deviation - stdDev * 0.5);
      cusumNeg = Math.max(0, cusumNeg - deviation - stdDev * 0.5);

      if (cusumPos > threshold || cusumNeg > threshold) {
        // Check for minimum distance between changepoints
        const lastCp = changepointIndices.length > 0
          ? changepointIndices[changepointIndices.length - 1]
          : -10;

        if (i - lastCp >= Math.max(3, Math.floor(values.length / 10))) {
          changepointIndices.push(i);
          cusumPos = 0;
          cusumNeg = 0;
        }
      }
    }

    for (const cpIdx of changepointIndices) {
      const beforeStart = Math.max(0, cpIdx - 5);
      const afterEnd = Math.min(values.length, cpIdx + 6);

      const beforeValues = values.slice(beforeStart, cpIdx);
      const afterValues = values.slice(cpIdx, afterEnd);

      const beforeMean = computeMean(beforeValues);
      const afterMean = computeMean(afterValues);
      const shift = afterMean - beforeMean;
      const shiftStrength = Math.min(1, Math.abs(shift) / (stdDev * 2));

      patterns.push({
        type: 'changepoint',
        column,
        startIndex: indices[Math.max(0, cpIdx - 1)],
        endIndex: indices[Math.min(indices.length - 1, cpIdx + 1)],
        strength: shiftStrength,
        description: `Change point detected at index ${indices[cpIdx]}. Mean shifted from ${beforeMean.toFixed(2)} to ${afterMean.toFixed(2)} (change: ${shift > 0 ? '+' : ''}${shift.toFixed(2)}).`,
        metadata: {
          beforeMean: parseFloat(beforeMean.toFixed(4)),
          afterMean: parseFloat(afterMean.toFixed(4)),
          shift: parseFloat(shift.toFixed(4)),
          dataIndex: cpIdx,
          originalIndex: indices[cpIdx],
        },
      });
    }

    return patterns;
  }

  private detectTimeSeriesAnomalies(
    values: number[],
    indices: number[],
    column: string
  ): TemporalPattern[] {
    const patterns: TemporalPattern[] = [];

    if (values.length < 5) return patterns;

    // Z-score method with rolling window
    const windowSize = Math.max(5, Math.floor(values.length / 5));
    const zThreshold = 2.5;

    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - windowSize);
      const end = Math.min(values.length, i + windowSize + 1);
      const window = [...values.slice(start, i), ...values.slice(i + 1, end)];

      if (window.length < 3) continue;

      const windowMean = computeMean(window);
      const windowStd = computeStdDev(window);

      if (windowStd === 0) continue;

      const zScore = Math.abs(values[i] - windowMean) / windowStd;

      if (zScore > zThreshold) {
        const strength = Math.min(1, zScore / 5);
        const direction = values[i] > windowMean ? 'above' : 'below';

        patterns.push({
          type: 'anomaly',
          column,
          startIndex: indices[i],
          endIndex: indices[i],
          strength,
          description: `Anomalous value ${values[i].toFixed(2)} at index ${indices[i]} is ${direction} the local mean (${windowMean.toFixed(2)}). Z-score: ${zScore.toFixed(2)}.`,
          metadata: {
            value: values[i],
            localMean: parseFloat(windowMean.toFixed(4)),
            localStdDev: parseFloat(windowStd.toFixed(4)),
            zScore: parseFloat(zScore.toFixed(4)),
            direction,
            dataIndex: i,
          },
        });
      }
    }

    return patterns;
  }
}
