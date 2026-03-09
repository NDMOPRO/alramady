import { PrismaClient } from '@prisma/client';
import winston from 'winston';

// ─── Interfaces ──────────────────────────────────────────────────────

interface AnomalyEntry {
  rowIndex: number;
  column: string;
  value: unknown;
  expectedRange: { min: number; max: number };
  score: number;
  type: 'outlier' | 'pattern_break' | 'cluster_deviation' | 'frequency_anomaly';
  explanation: string;
}

interface AnomalyResult {
  anomalies: AnomalyEntry[];
  summary: {
    totalAnomalies: number;
    criticalCount: number;
    columnBreakdown: Record<string, number>;
  };
}

interface DataInput {
  columns: string[];
  rows: Record<string, unknown>[];
}

// ─── Logger ──────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ai-service', module: 'anomaly-pattern' },
  transports: [new winston.transports.Console()],
});

// ─── Helpers ─────────────────────────────────────────────────────────

function isNumeric(value: unknown): boolean {
  if (typeof value === 'number' && !isNaN(value)) return true;
  if (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value))) return true;
  return false;
}

function toNumber(value: unknown): number {
  return Number(value);
}

function computeStats(values: number[]): {
  mean: number;
  stdDev: number;
  q1: number;
  q3: number;
  iqr: number;
  median: number;
} {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, q1: 0, q3: 0, iqr: 0, median: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const median = sorted[Math.floor(n * 0.5)];

  return { mean, stdDev, q1, q3, iqr: q3 - q1, median };
}

// ─── Service ─────────────────────────────────────────────────────────

export class AnomalyPatternService {
  constructor(private prisma: PrismaClient) {}

  async detectAnomalies(
    data: DataInput,
    sensitivity: number = 0.5
  ): Promise<AnomalyResult> {
    const startTime = Date.now();
    const clampedSensitivity = Math.max(0, Math.min(1, sensitivity));
    logger.info('Detecting anomalies', {
      columns: data.columns.length,
      rows: data.rows.length,
      sensitivity: clampedSensitivity,
    });

    const allAnomalies: AnomalyEntry[] = [];

    // Separate numeric and categorical columns
    const numericColumns: string[] = [];
    const categoricalColumns: string[] = [];

    for (const col of data.columns) {
      const values = data.rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined);
      const numericCount = values.filter((v) => isNumeric(v)).length;
      if (numericCount > values.length * 0.5) {
        numericColumns.push(col);
      } else {
        categoricalColumns.push(col);
      }
    }

    // Run numeric detection methods
    for (const col of numericColumns) {
      const iqrAnomalies = this.iqrOutlierDetection(data.rows, col, clampedSensitivity);
      allAnomalies.push(...iqrAnomalies);

      const zScoreAnomalies = this.zScoreAnalysis(data.rows, col, clampedSensitivity);
      allAnomalies.push(...zScoreAnomalies);

      const isolationAnomalies = this.isolationSplitDetection(data.rows, col, clampedSensitivity);
      allAnomalies.push(...isolationAnomalies);

      if (data.rows.length >= 10) {
        const patternBreaks = this.rollingPatternBreakDetection(data.rows, col, clampedSensitivity);
        allAnomalies.push(...patternBreaks);
      }
    }

    // Run categorical detection methods
    for (const col of categoricalColumns) {
      const freqAnomalies = this.frequencyAnalysis(data.rows, col, clampedSensitivity);
      allAnomalies.push(...freqAnomalies);
    }

    // Deduplicate: keep highest score per (rowIndex, column)
    const deduped = this.deduplicateAnomalies(allAnomalies);

    // Build summary
    const criticalThreshold = 0.7;
    const criticalCount = deduped.filter((a) => a.score >= criticalThreshold).length;

    const columnBreakdown: Record<string, number> = {};
    for (const anomaly of deduped) {
      columnBreakdown[anomaly.column] = (columnBreakdown[anomaly.column] || 0) + 1;
    }

    const durationMs = Date.now() - startTime;
    logger.info('Anomaly detection complete', {
      totalAnomalies: deduped.length,
      criticalCount,
      durationMs,
    });

    return {
      anomalies: deduped,
      summary: {
        totalAnomalies: deduped.length,
        criticalCount,
        columnBreakdown,
      },
    };
  }

  private iqrOutlierDetection(
    rows: Record<string, unknown>[],
    column: string,
    sensitivity: number
  ): AnomalyEntry[] {
    const anomalies: AnomalyEntry[] = [];
    const entries = rows
      .map((r, idx) => ({ value: r[column], idx }))
      .filter((e) => isNumeric(e.value));

    if (entries.length < 4) return anomalies;

    const values = entries.map((e) => toNumber(e.value));
    const stats = computeStats(values);

    // Sensitivity adjusts the multiplier: higher sensitivity = lower multiplier = more anomalies
    const multiplier = 1.5 + (1 - sensitivity) * 1.5; // ranges from 1.5 to 3.0
    const lowerBound = stats.q1 - multiplier * stats.iqr;
    const upperBound = stats.q3 + multiplier * stats.iqr;

    for (const entry of entries) {
      const val = toNumber(entry.value);
      if (val < lowerBound || val > upperBound) {
        const distance = val < lowerBound
          ? (lowerBound - val) / (stats.iqr > 0 ? stats.iqr : 1)
          : (val - upperBound) / (stats.iqr > 0 ? stats.iqr : 1);
        const score = Math.min(1, distance / 3);

        anomalies.push({
          rowIndex: entry.idx,
          column,
          value: entry.value,
          expectedRange: {
            min: parseFloat(lowerBound.toFixed(4)),
            max: parseFloat(upperBound.toFixed(4)),
          },
          score: parseFloat(score.toFixed(4)),
          type: 'outlier',
          explanation: `Value ${val} is ${val < lowerBound ? 'below' : 'above'} the IQR-based expected range [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}] for column "${column}".`,
        });
      }
    }

    return anomalies;
  }

  private zScoreAnalysis(
    rows: Record<string, unknown>[],
    column: string,
    sensitivity: number
  ): AnomalyEntry[] {
    const anomalies: AnomalyEntry[] = [];
    const entries = rows
      .map((r, idx) => ({ value: r[column], idx }))
      .filter((e) => isNumeric(e.value));

    if (entries.length < 4) return anomalies;

    const values = entries.map((e) => toNumber(e.value));
    const stats = computeStats(values);

    if (stats.stdDev === 0) return anomalies;

    // Threshold adjusts with sensitivity: 3.0 at low, 2.0 at high
    const zThreshold = 3.0 - sensitivity;

    for (const entry of entries) {
      const val = toNumber(entry.value);
      const zScore = Math.abs(val - stats.mean) / stats.stdDev;

      if (zScore > zThreshold) {
        const score = Math.min(1, zScore / 5);
        anomalies.push({
          rowIndex: entry.idx,
          column,
          value: entry.value,
          expectedRange: {
            min: parseFloat((stats.mean - zThreshold * stats.stdDev).toFixed(4)),
            max: parseFloat((stats.mean + zThreshold * stats.stdDev).toFixed(4)),
          },
          score: parseFloat(score.toFixed(4)),
          type: 'outlier',
          explanation: `Z-score of ${zScore.toFixed(2)} exceeds threshold ${zThreshold.toFixed(1)} for column "${column}". Value ${val} deviates significantly from mean ${stats.mean.toFixed(2)}.`,
        });
      }
    }

    return anomalies;
  }

  private isolationSplitDetection(
    rows: Record<string, unknown>[],
    column: string,
    sensitivity: number
  ): AnomalyEntry[] {
    const anomalies: AnomalyEntry[] = [];
    const entries = rows
      .map((r, idx) => ({ value: r[column], idx }))
      .filter((e) => isNumeric(e.value));

    if (entries.length < 10) return anomalies;

    const values = entries.map((e) => toNumber(e.value));
    const sorted = [...values].sort((a, b) => a - b);
    const minVal = sorted[0];
    const maxVal = sorted[sorted.length - 1];

    if (maxVal === minVal) return anomalies;

    // Isolation-forest-inspired: count how many random splits isolate each point
    // Points that are isolated quickly are anomalous
    const numIterations = 50;
    const maxDepth = Math.ceil(Math.log2(entries.length));
    const isolationScores: number[] = new Array(entries.length).fill(0);

    // Use deterministic splits based on data distribution
    for (let iter = 0; iter < numIterations; iter++) {
      for (let eIdx = 0; eIdx < entries.length; eIdx++) {
        const val = values[eIdx];
        let lo = minVal;
        let hi = maxVal;
        let depth = 0;

        for (let d = 0; d < maxDepth; d++) {
          // Deterministic split at different fractions per iteration
          const fraction = (iter + 1) / (numIterations + 1);
          const splitPoint = lo + (hi - lo) * fraction;

          depth++;
          const leftCount = values.filter((v) => v >= lo && v < splitPoint).length;
          const rightCount = values.filter((v) => v >= splitPoint && v <= hi).length;

          if (val < splitPoint) {
            hi = splitPoint;
            if (leftCount <= 1) break;
          } else {
            lo = splitPoint;
            if (rightCount <= 1) break;
          }
        }

        isolationScores[eIdx] += depth;
      }
    }

    // Normalize: lower average depth = more anomalous
    const avgDepths = isolationScores.map((total) => total / numIterations);
    const depthStats = computeStats(avgDepths);
    const depthThreshold = depthStats.mean - (1 + sensitivity) * depthStats.stdDev;

    for (let i = 0; i < entries.length; i++) {
      if (depthStats.stdDev > 0 && avgDepths[i] < depthThreshold) {
        const normalizedScore = Math.min(
          1,
          (depthStats.mean - avgDepths[i]) / (depthStats.stdDev * 3)
        );
        if (normalizedScore > 0.2) {
          anomalies.push({
            rowIndex: entries[i].idx,
            column,
            value: entries[i].value,
            expectedRange: {
              min: parseFloat(sorted[Math.floor(sorted.length * 0.05)].toFixed(4)),
              max: parseFloat(sorted[Math.floor(sorted.length * 0.95)].toFixed(4)),
            },
            score: parseFloat(normalizedScore.toFixed(4)),
            type: 'cluster_deviation',
            explanation: `Value ${values[i]} in column "${column}" is isolated from the main data cluster. Isolation depth: ${avgDepths[i].toFixed(2)} (mean: ${depthStats.mean.toFixed(2)}).`,
          });
        }
      }
    }

    return anomalies;
  }

  private frequencyAnalysis(
    rows: Record<string, unknown>[],
    column: string,
    sensitivity: number
  ): AnomalyEntry[] {
    const anomalies: AnomalyEntry[] = [];
    const entries = rows
      .map((r, idx) => ({ value: r[column], idx }))
      .filter((e) => e.value !== null && e.value !== undefined);

    if (entries.length < 5) return anomalies;

    // Count frequencies
    const freq: Map<string, number[]> = new Map();
    for (const entry of entries) {
      const key = String(entry.value);
      const existing = freq.get(key);
      if (existing) {
        existing.push(entry.idx);
      } else {
        freq.set(key, [entry.idx]);
      }
    }

    const counts = Array.from(freq.values()).map((indices) => indices.length);
    const countStats = computeStats(counts);

    if (countStats.stdDev === 0) return anomalies;

    // Values that appear extremely rarely compared to others
    const rarityThreshold = Math.max(1, countStats.mean - (2 - sensitivity) * countStats.stdDev);

    for (const [value, indices] of freq) {
      const count = indices.length;
      if (count < rarityThreshold && count <= 2) {
        const zScore = Math.abs(count - countStats.mean) / countStats.stdDev;
        const score = Math.min(1, zScore / 4);

        if (score > 0.15) {
          for (const rowIdx of indices) {
            anomalies.push({
              rowIndex: rowIdx,
              column,
              value,
              expectedRange: { min: 0, max: 0 },
              score: parseFloat(score.toFixed(4)),
              type: 'frequency_anomaly',
              explanation: `Value "${value}" in column "${column}" appears only ${count} time(s), which is rare compared to the average frequency of ${countStats.mean.toFixed(1)}.`,
            });
          }
        }
      }
    }

    return anomalies;
  }

  private rollingPatternBreakDetection(
    rows: Record<string, unknown>[],
    column: string,
    sensitivity: number
  ): AnomalyEntry[] {
    const anomalies: AnomalyEntry[] = [];
    const entries = rows
      .map((r, idx) => ({ value: r[column], idx }))
      .filter((e) => isNumeric(e.value));

    if (entries.length < 10) return anomalies;

    const values = entries.map((e) => toNumber(e.value));
    const windowSize = Math.max(5, Math.floor(values.length / 5));

    for (let i = windowSize; i < values.length; i++) {
      const window = values.slice(i - windowSize, i);
      const windowStats = computeStats(window);

      if (windowStats.stdDev === 0) continue;

      const currentVal = values[i];
      const zScore = Math.abs(currentVal - windowStats.mean) / windowStats.stdDev;
      const breakThreshold = 3.0 - sensitivity;

      if (zScore > breakThreshold) {
        const score = Math.min(1, zScore / 5);
        anomalies.push({
          rowIndex: entries[i].idx,
          column,
          value: entries[i].value,
          expectedRange: {
            min: parseFloat((windowStats.mean - breakThreshold * windowStats.stdDev).toFixed(4)),
            max: parseFloat((windowStats.mean + breakThreshold * windowStats.stdDev).toFixed(4)),
          },
          score: parseFloat(score.toFixed(4)),
          type: 'pattern_break',
          explanation: `Value ${currentVal} at index ${entries[i].idx} breaks the rolling pattern in column "${column}". Local mean: ${windowStats.mean.toFixed(2)}, local std: ${windowStats.stdDev.toFixed(2)}, z-score: ${zScore.toFixed(2)}.`,
        });
      }
    }

    return anomalies;
  }

  private deduplicateAnomalies(anomalies: AnomalyEntry[]): AnomalyEntry[] {
    const bestByKey: Map<string, AnomalyEntry> = new Map();

    for (const anomaly of anomalies) {
      const key = `${anomaly.rowIndex}:${anomaly.column}`;
      const existing = bestByKey.get(key);
      if (!existing || anomaly.score > existing.score) {
        bestByKey.set(key, anomaly);
      }
    }

    return Array.from(bestByKey.values()).sort((a, b) => b.score - a.score);
  }
}
