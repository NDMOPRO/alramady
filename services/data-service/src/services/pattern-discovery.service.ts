import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────

interface PatternResult {
  patternId: string;
  type: 'temporal' | 'categorical' | 'numeric' | 'correlation' | 'anomaly';
  column: string;
  description: string;
  confidence: number;
  details: Record<string, any>;
}

interface AnomalyRecord {
  rowIndex: number;
  column: string;
  value: unknown;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface PatternSummary {
  datasetId: string;
  totalPatterns: number;
  byType: Record<string, number>;
  topPatterns: PatternResult[];
  overallComplexity: 'low' | 'medium' | 'high';
  analyzedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
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
  if (denom === 0) return 0;
  return num / denom;
}

function linearTrendSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
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
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ||
    /^\d{2}\/\d{2}\/\d{4}/.test(value) ||
    /^\d{2}-\d{2}-\d{4}/.test(value);
}

// ─── Service ─────────────────────────────────────────────────────────

export class PatternDiscoveryService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async discoverPatterns(datasetId: string, tenantId: string): Promise<PatternResult[]> {
    logger.info('Starting pattern discovery', { datasetId, tenantId });

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
      select: { data: true, rowIndex: true },
    });

    const rows = dataRows.map(r => r.data as Record<string, any>);
    if (rows.length === 0) {
      logger.warn('Dataset has no rows', { datasetId });
      return [];
    }

    const patterns: PatternResult[] = [];
    const numericColumns: { name: string; values: number[] }[] = [];
    const categoricalColumns: { name: string; values: string[] }[] = [];
    const temporalColumns: { name: string; dates: Date[] }[] = [];

    // Classify columns and extract values
    for (const col of dataset.columns) {
      const rawValues = rows.map(r => r[col.name]);
      const nonNull = rawValues.filter(v => v !== null && v !== undefined && v !== '');

      if (nonNull.length === 0) continue;

      const numbers = nonNull.map(v => Number(v)).filter(n => !isNaN(n));
      const numericRatio = nonNull.length > 0 ? numbers.length / nonNull.length : 0;

      if (numericRatio > 0.8 && numbers.length >= 5) {
        numericColumns.push({ name: col.name, values: numbers });
        patterns.push(...this.analyzeNumericColumn(col.name, numbers));
      } else {
        const stringValues = nonNull.map(v => String(v));

        // Check if temporal
        const dateValues: Date[] = [];
        let dateCount = 0;
        for (const sv of stringValues) {
          if (isDateString(sv)) {
            const d = new Date(sv);
            if (!isNaN(d.getTime())) {
              dateValues.push(d);
              dateCount++;
            }
          }
        }

        if (dateCount > stringValues.length * 0.7 && dateValues.length >= 3) {
          temporalColumns.push({ name: col.name, dates: dateValues });
          patterns.push(...this.analyzeTemporalColumn(col.name, dateValues));
        } else {
          categoricalColumns.push({ name: col.name, values: stringValues });
          patterns.push(...this.analyzeCategoricalColumn(col.name, stringValues));
        }
      }
    }

    // Cross-column correlations
    patterns.push(...this.analyzeCorrelations(numericColumns));

    logger.info('Pattern discovery completed', {
      datasetId,
      patternCount: patterns.length,
    });

    return patterns;
  }

  async detectAnomalies(
    datasetId: string,
    tenantId: string,
    column?: string,
    threshold: number = 3
  ): Promise<AnomalyRecord[]> {
    logger.info('Starting anomaly detection', { datasetId, tenantId, column, threshold });

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
      select: { data: true, rowIndex: true },
    });

    const rows = dataRows.map(r => ({
      data: r.data as Record<string, any>,
      rowIndex: r.rowIndex,
    }));

    if (rows.length === 0) return [];

    const columnsToCheck = column
      ? dataset.columns.filter(c => c.name === column)
      : dataset.columns;

    const anomalies: AnomalyRecord[] = [];

    for (const col of columnsToCheck) {
      const rawValues = rows.map(r => ({
        value: r.data[col.name],
        rowIndex: r.rowIndex,
      }));

      const nonNullEntries = rawValues.filter(
        e => e.value !== null && e.value !== undefined && e.value !== ''
      );

      if (nonNullEntries.length === 0) continue;

      // Try numeric anomaly detection
      const numbers = nonNullEntries
        .map(e => ({ num: Number(e.value), rowIndex: e.rowIndex, value: e.value }))
        .filter(e => !isNaN(e.num));

      if (numbers.length >= 5) {
        const vals = numbers.map(e => e.num);
        const m = mean(vals);
        const sd = standardDeviation(vals);

        if (sd > 0) {
          // Z-score method
          for (const entry of numbers) {
            const zScore = Math.abs((entry.num - m) / sd);
            if (zScore > threshold) {
              const severity = zScore > threshold * 2
                ? 'critical'
                : zScore > threshold * 1.5
                  ? 'high'
                  : zScore > threshold
                    ? 'medium'
                    : 'low';

              anomalies.push({
                rowIndex: entry.rowIndex,
                column: col.name,
                value: entry.value,
                reason: `Z-score ${zScore.toFixed(2)} exceeds threshold ${threshold} (mean=${m.toFixed(2)}, stddev=${sd.toFixed(2)})`,
                severity,
              });
            }
          }
        }

        // IQR method
        const sorted = [...vals].sort((a, b) => a - b);
        const q1Idx = Math.floor(sorted.length * 0.25);
        const q3Idx = Math.floor(sorted.length * 0.75);
        const q1 = sorted[q1Idx];
        const q3 = sorted[q3Idx];
        const iqr = q3 - q1;

        if (iqr > 0) {
          const lower = q1 - 1.5 * iqr;
          const upper = q3 + 1.5 * iqr;

          for (const entry of numbers) {
            if (entry.num < lower || entry.num > upper) {
              const alreadyDetected = anomalies.some(
                a => a.rowIndex === entry.rowIndex && a.column === col.name
              );
              if (!alreadyDetected) {
                anomalies.push({
                  rowIndex: entry.rowIndex,
                  column: col.name,
                  value: entry.value,
                  reason: `IQR outlier: value ${entry.num} outside [${lower.toFixed(2)}, ${upper.toFixed(2)}] (Q1=${q1.toFixed(2)}, Q3=${q3.toFixed(2)}, IQR=${iqr.toFixed(2)})`,
                  severity: entry.num < lower - iqr || entry.num > upper + iqr ? 'high' : 'medium',
                });
              }
            }
          }
        }
      } else {
        // Categorical anomaly detection: rare values < 1% frequency
        const freqMap = new Map<string, number>();
        for (const entry of nonNullEntries) {
          const key = String(entry.value);
          freqMap.set(key, (freqMap.get(key) || 0) + 1);
        }

        const totalCount = nonNullEntries.length;
        const rarityThreshold = totalCount * 0.01;

        for (const entry of nonNullEntries) {
          const key = String(entry.value);
          const count = freqMap.get(key) || 0;
          if (count <= rarityThreshold && count > 0 && totalCount > 50) {
            anomalies.push({
              rowIndex: entry.rowIndex,
              column: col.name,
              value: entry.value,
              reason: `Rare category: '${key}' appears ${count} times (${((count / totalCount) * 100).toFixed(2)}% of ${totalCount} total)`,
              severity: 'low',
            });
          }
        }
      }
    }

    logger.info('Anomaly detection completed', {
      datasetId,
      anomalyCount: anomalies.length,
    });

    return anomalies;
  }

  async getPatternSummary(datasetId: string, tenantId: string): Promise<PatternSummary> {
    logger.info('Generating pattern summary', { datasetId, tenantId });

    const patterns = await this.discoverPatterns(datasetId, tenantId);

    const byType: Record<string, number> = {};
    for (const p of patterns) {
      byType[p.type] = (byType[p.type] || 0) + 1;
    }

    const sorted = [...patterns].sort((a, b) => b.confidence - a.confidence);

    const totalTypes = Object.keys(byType).length;
    const overallComplexity: 'low' | 'medium' | 'high' =
      patterns.length > 20 || totalTypes >= 4
        ? 'high'
        : patterns.length > 8 || totalTypes >= 3
          ? 'medium'
          : 'low';

    return {
      datasetId,
      totalPatterns: patterns.length,
      byType,
      topPatterns: sorted.slice(0, 10),
      overallComplexity,
      analyzedAt: new Date().toISOString(),
    };
  }

  // ─── Private: Numeric analysis ───────────────────────────────────

  private analyzeNumericColumn(columnName: string, values: number[]): PatternResult[] {
    const patterns: PatternResult[] = [];
    const m = mean(values);
    const sd = standardDeviation(values);
    const slope = linearTrendSlope(values);

    // Trend detection
    if (values.length >= 5) {
      const normalizedSlope = sd > 0 ? Math.abs(slope) / sd : 0;
      if (normalizedSlope > 0.05) {
        const direction = slope > 0 ? 'increasing' : 'decreasing';
        const confidence = Math.min(0.99, normalizedSlope);

        patterns.push({
          patternId: crypto.randomUUID(),
          type: 'numeric',
          column: columnName,
          description: `${direction} trend detected (slope=${slope.toFixed(4)})`,
          confidence: Math.round(confidence * 1000) / 1000,
          details: {
            trend: direction,
            slope: Math.round(slope * 10000) / 10000,
            mean: Math.round(m * 100) / 100,
            stddev: Math.round(sd * 100) / 100,
          },
        });
      }

      // Cyclical pattern detection using autocorrelation
      const cyclicalResult = this.detectCyclicalPattern(values);
      if (cyclicalResult.detected) {
        patterns.push({
          patternId: crypto.randomUUID(),
          type: 'numeric',
          column: columnName,
          description: `Cyclical pattern detected with period ~${cyclicalResult.period}`,
          confidence: cyclicalResult.confidence,
          details: {
            pattern: 'cyclical',
            period: cyclicalResult.period,
            autocorrelation: cyclicalResult.autocorrelation,
          },
        });
      }
    }

    // Distribution type detection
    if (values.length >= 10) {
      const distType = this.classifyDistribution(values, m, sd);
      patterns.push({
        patternId: crypto.randomUUID(),
        type: 'numeric',
        column: columnName,
        description: `Distribution appears ${distType.type} (skewness=${distType.skewness.toFixed(3)})`,
        confidence: distType.confidence,
        details: {
          distributionType: distType.type,
          skewness: Math.round(distType.skewness * 1000) / 1000,
          kurtosis: Math.round(distType.kurtosis * 1000) / 1000,
          mean: Math.round(m * 100) / 100,
          median: Math.round(distType.median * 100) / 100,
          stddev: Math.round(sd * 100) / 100,
        },
      });
    }

    // Outlier summary using IQR
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const outlierCount = values.filter(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr).length;

    if (outlierCount > 0) {
      const outlierRate = outlierCount / values.length;
      patterns.push({
        patternId: crypto.randomUUID(),
        type: 'anomaly',
        column: columnName,
        description: `${outlierCount} outliers detected (${(outlierRate * 100).toFixed(1)}% of values) using IQR method`,
        confidence: Math.min(0.99, 0.7 + outlierRate),
        details: {
          method: 'iqr',
          outlierCount,
          outlierRate: Math.round(outlierRate * 10000) / 10000,
          q1: Math.round(q1 * 100) / 100,
          q3: Math.round(q3 * 100) / 100,
          iqr: Math.round(iqr * 100) / 100,
          lowerBound: Math.round((q1 - 1.5 * iqr) * 100) / 100,
          upperBound: Math.round((q3 + 1.5 * iqr) * 100) / 100,
        },
      });
    }

    return patterns;
  }

  private detectCyclicalPattern(values: number[]): {
    detected: boolean;
    period: number;
    confidence: number;
    autocorrelation: number;
  } {
    const n = values.length;
    if (n < 10) return { detected: false, period: 0, confidence: 0, autocorrelation: 0 };

    const m = mean(values);
    let denom = 0;
    for (let i = 0; i < n; i++) {
      denom += (values[i] - m) ** 2;
    }
    if (denom === 0) return { detected: false, period: 0, confidence: 0, autocorrelation: 0 };

    let bestLag = 0;
    let bestAc = 0;
    const maxLag = Math.min(Math.floor(n / 2), 50);

    for (let lag = 2; lag <= maxLag; lag++) {
      let num = 0;
      for (let i = 0; i < n - lag; i++) {
        num += (values[i] - m) * (values[i + lag] - m);
      }
      const ac = num / denom;
      if (ac > bestAc) {
        bestAc = ac;
        bestLag = lag;
      }
    }

    const detected = bestAc > 0.3;
    return {
      detected,
      period: bestLag,
      confidence: Math.min(0.99, Math.round(bestAc * 1000) / 1000),
      autocorrelation: Math.round(bestAc * 1000) / 1000,
    };
  }

  private classifyDistribution(
    values: number[],
    m: number,
    sd: number
  ): { type: string; skewness: number; kurtosis: number; median: number; confidence: number } {
    const n = values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    // Skewness (Fisher)
    let skewness = 0;
    let kurtosis = 0;
    if (sd > 0) {
      let m3 = 0;
      let m4 = 0;
      for (let i = 0; i < n; i++) {
        const diff = values[i] - m;
        m3 += diff ** 3;
        m4 += diff ** 4;
      }
      skewness = (m3 / n) / (sd ** 3);
      kurtosis = (m4 / n) / (sd ** 4) - 3; // excess kurtosis
    }

    let type: string;
    let confidence: number;

    if (Math.abs(skewness) < 0.5 && Math.abs(kurtosis) < 1.0) {
      type = 'normal';
      confidence = Math.max(0.5, 1 - Math.abs(skewness) - Math.abs(kurtosis) * 0.3);
    } else if (Math.abs(skewness) < 0.5) {
      type = 'symmetric-non-normal';
      confidence = 0.6;
    } else if (skewness > 0.5) {
      type = 'right-skewed';
      confidence = Math.min(0.95, 0.5 + Math.abs(skewness) * 0.2);
    } else if (skewness < -0.5) {
      type = 'left-skewed';
      confidence = Math.min(0.95, 0.5 + Math.abs(skewness) * 0.2);
    } else {
      // Check uniform: low kurtosis, similar min-max range across quartiles
      const range = sorted[n - 1] - sorted[0];
      const q1Range = sorted[Math.floor(n * 0.25)] - sorted[0];
      const q3Range = sorted[n - 1] - sorted[Math.floor(n * 0.75)];
      const isUniform = range > 0 && Math.abs(q1Range - q3Range) / range < 0.15;
      type = isUniform ? 'uniform' : 'unknown';
      confidence = isUniform ? 0.7 : 0.3;
    }

    return {
      type,
      skewness,
      kurtosis,
      median,
      confidence: Math.round(confidence * 1000) / 1000,
    };
  }

  // ─── Private: Categorical analysis ───────────────────────────────

  private analyzeCategoricalColumn(columnName: string, values: string[]): PatternResult[] {
    const patterns: PatternResult[] = [];
    const freqMap = new Map<string, number>();

    for (const v of values) {
      freqMap.set(v, (freqMap.get(v) || 0) + 1);
    }

    const total = values.length;
    const sortedEntries = [...freqMap.entries()].sort((a, b) => b[1] - a[1]);
    const distinctCount = sortedEntries.length;

    // Dominant category detection
    if (sortedEntries.length > 0) {
      const topCategory = sortedEntries[0];
      const topPct = topCategory[1] / total;

      if (topPct > 0.5) {
        patterns.push({
          patternId: crypto.randomUUID(),
          type: 'categorical',
          column: columnName,
          description: `Dominant category '${topCategory[0]}' represents ${(topPct * 100).toFixed(1)}% of values`,
          confidence: Math.round(topPct * 1000) / 1000,
          details: {
            dominantCategory: topCategory[0],
            dominantPercentage: Math.round(topPct * 10000) / 10000,
            totalCategories: distinctCount,
          },
        });
      }
    }

    // Category distribution pattern
    if (sortedEntries.length >= 2 && sortedEntries.length <= 50) {
      const topCategories = sortedEntries.slice(0, 10).map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / total) * 10000) / 10000,
      }));

      // Compute entropy to measure distribution evenness
      let entropy = 0;
      for (const [, count] of sortedEntries) {
        const p = count / total;
        if (p > 0) entropy -= p * Math.log2(p);
      }
      const maxEntropy = Math.log2(distinctCount);
      const evenness = maxEntropy > 0 ? entropy / maxEntropy : 0;

      const distType = evenness > 0.9 ? 'uniform' : evenness > 0.6 ? 'moderate' : 'concentrated';

      patterns.push({
        patternId: crypto.randomUUID(),
        type: 'categorical',
        column: columnName,
        description: `Category distribution is ${distType} (evenness=${evenness.toFixed(3)}, ${distinctCount} categories)`,
        confidence: Math.round(Math.max(0.5, evenness) * 1000) / 1000,
        details: {
          distributionType: distType,
          entropy: Math.round(entropy * 1000) / 1000,
          evenness: Math.round(evenness * 1000) / 1000,
          distinctCategories: distinctCount,
          topCategories,
        },
      });
    }

    // Rare values detection
    const rareThreshold = total * 0.01;
    const rareCategories = sortedEntries.filter(([, count]) => count <= rareThreshold && total > 50);

    if (rareCategories.length > 0) {
      patterns.push({
        patternId: crypto.randomUUID(),
        type: 'categorical',
        column: columnName,
        description: `${rareCategories.length} rare categories detected (< 1% frequency)`,
        confidence: 0.8,
        details: {
          rareCount: rareCategories.length,
          rareCategories: rareCategories.slice(0, 20).map(([name, count]) => ({
            name,
            count,
            percentage: Math.round((count / total) * 10000) / 10000,
          })),
        },
      });
    }

    return patterns;
  }

  // ─── Private: Temporal analysis ──────────────────────────────────

  private analyzeTemporalColumn(columnName: string, dates: Date[]): PatternResult[] {
    const patterns: PatternResult[] = [];
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());

    if (sorted.length < 3) return patterns;

    // Gap analysis
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i].getTime() - sorted[i - 1].getTime());
    }

    const meanGap = mean(gaps);
    const sdGap = standardDeviation(gaps);

    if (meanGap > 0) {
      const gapDays = meanGap / 86400000;
      const regularity = sdGap > 0 ? 1 - Math.min(1, sdGap / meanGap) : 1;

      patterns.push({
        patternId: crypto.randomUUID(),
        type: 'temporal',
        column: columnName,
        description: `Average interval: ${gapDays.toFixed(1)} days (regularity: ${(regularity * 100).toFixed(1)}%)`,
        confidence: Math.round(regularity * 1000) / 1000,
        details: {
          averageGapMs: Math.round(meanGap),
          averageGapDays: Math.round(gapDays * 100) / 100,
          stddevGapMs: Math.round(sdGap),
          regularity: Math.round(regularity * 1000) / 1000,
          startDate: sorted[0].toISOString(),
          endDate: sorted[sorted.length - 1].toISOString(),
          totalPoints: sorted.length,
        },
      });

      // Detect large gaps (> 3x average)
      const largeGaps: { index: number; gapDays: number }[] = [];
      for (let i = 0; i < gaps.length; i++) {
        if (gaps[i] > meanGap * 3 && sdGap > 0) {
          largeGaps.push({
            index: i,
            gapDays: Math.round((gaps[i] / 86400000) * 100) / 100,
          });
        }
      }

      if (largeGaps.length > 0) {
        patterns.push({
          patternId: crypto.randomUUID(),
          type: 'temporal',
          column: columnName,
          description: `${largeGaps.length} unusual gap(s) detected (> 3x average interval)`,
          confidence: 0.85,
          details: {
            gapCount: largeGaps.length,
            gaps: largeGaps.slice(0, 20),
          },
        });
      }
    }

    // Seasonality detection by month
    if (sorted.length >= 12) {
      const monthCounts = new Array(12).fill(0);
      for (const d of sorted) {
        monthCounts[d.getMonth()]++;
      }

      const avgMonth = sorted.length / 12;
      let seasonalVariance = 0;
      for (let i = 0; i < 12; i++) {
        seasonalVariance += (monthCounts[i] - avgMonth) ** 2;
      }
      seasonalVariance /= 12;
      const seasonalCoefficient = avgMonth > 0 ? Math.sqrt(seasonalVariance) / avgMonth : 0;

      if (seasonalCoefficient > 0.3) {
        const peakMonths = monthCounts
          .map((count, idx) => ({ month: idx + 1, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        patterns.push({
          patternId: crypto.randomUUID(),
          type: 'temporal',
          column: columnName,
          description: `Seasonal pattern detected (coefficient=${seasonalCoefficient.toFixed(3)})`,
          confidence: Math.min(0.95, Math.round((0.5 + seasonalCoefficient * 0.5) * 1000) / 1000),
          details: {
            seasonalCoefficient: Math.round(seasonalCoefficient * 1000) / 1000,
            monthlyDistribution: monthCounts,
            peakMonths,
          },
        });
      }
    }

    // Trend detection on temporal data count over time
    if (sorted.length >= 10) {
      const timestamps = sorted.map(d => d.getTime());
      const slope = linearTrendSlope(timestamps);
      const sdTs = standardDeviation(timestamps);
      const normalizedSlope = sdTs > 0 ? Math.abs(slope) / sdTs : 0;

      if (normalizedSlope > 0.01) {
        const direction = slope > 0 ? 'accelerating' : 'decelerating';
        patterns.push({
          patternId: crypto.randomUUID(),
          type: 'temporal',
          column: columnName,
          description: `Temporal trend: dates are ${direction} over sequence`,
          confidence: Math.min(0.9, Math.round(normalizedSlope * 10 * 1000) / 1000),
          details: {
            trend: direction,
            normalizedSlope: Math.round(normalizedSlope * 10000) / 10000,
          },
        });
      }
    }

    return patterns;
  }

  // ─── Private: Cross-column correlations ──────────────────────────

  private analyzeCorrelations(
    numericColumns: { name: string; values: number[] }[]
  ): PatternResult[] {
    const patterns: PatternResult[] = [];

    for (let i = 0; i < numericColumns.length; i++) {
      for (let j = i + 1; j < numericColumns.length; j++) {
        const colA = numericColumns[i];
        const colB = numericColumns[j];
        const minLen = Math.min(colA.values.length, colB.values.length);

        if (minLen < 5) continue;

        const r = pearsonCorrelation(
          colA.values.slice(0, minLen),
          colB.values.slice(0, minLen)
        );
        const absR = Math.abs(r);

        if (absR > 0.5) {
          const strength = absR > 0.8 ? 'strong' : 'moderate';
          const direction = r > 0 ? 'positive' : 'negative';

          patterns.push({
            patternId: crypto.randomUUID(),
            type: 'correlation',
            column: `${colA.name} <-> ${colB.name}`,
            description: `${strength} ${direction} correlation (r=${r.toFixed(4)}) between ${colA.name} and ${colB.name}`,
            confidence: Math.round(absR * 1000) / 1000,
            details: {
              column1: colA.name,
              column2: colB.name,
              pearsonR: Math.round(r * 10000) / 10000,
              rSquared: Math.round(r * r * 10000) / 10000,
              strength,
              direction,
              sampleSize: minLen,
            },
          });
        }
      }
    }

    return patterns;
  }
}
