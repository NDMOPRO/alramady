import { logger } from '../utils/logger';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ReportData {
  title?: string;
  period?: string;
  metrics?: Record<string, number>;
  previousMetrics?: Record<string, number>;
  sections?: Array<{ title: string; data: unknown }>;
  metadata?: Record<string, unknown>;
}

export interface ExecutiveSummary {
  headline: string;
  keyFindings: string[];
  performanceOverview: string;
  outlook: string;
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  area: string;
  recommendation: string;
  rationale: string;
}

export interface TrendAnalysis {
  direction: 'up' | 'down' | 'stable';
  percentageChange: number;
  movingAverage: number[];
  slope: number;
  volatility: number;
  summary: string;
}

export interface ForecastResult {
  projectedValues: number[];
  slope: number;
  intercept: number;
  rSquared: number;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
}

export interface DataNarrative {
  paragraphs: string[];
  highlights: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function computeMovingAverage(values: number[], windowSize: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = values.slice(start, i + 1);
    result.push(mean(window));
  }
  return result;
}

/**
 * Ordinary least-squares linear regression.
 * Returns { slope, intercept, rSquared }.
 */
function linearRegression(values: number[]): { slope: number; intercept: number; rSquared: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, rSquared: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: mean(values), rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const yMean = sumY / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept;
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - yMean) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

function directionWord(slope: number, threshold: number): 'up' | 'down' | 'stable' {
  if (slope > threshold) return 'up';
  if (slope < -threshold) return 'down';
  return 'stable';
}

function directionAdverb(dir: 'up' | 'down' | 'stable'): string {
  if (dir === 'up') return 'an upward';
  if (dir === 'down') return 'a downward';
  return 'a stable';
}

// ────────────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────────────

export class AiNarrativeService {
  /**
   * Creates a structured executive summary from report data using heuristic-based
   * template generation. Analyses metrics, compares to previous period, and
   * produces headline, key findings, performance overview, and outlook.
   */
  generateExecutiveSummary(reportData: ReportData): ExecutiveSummary {
    logger.info('Generating executive summary', { title: reportData.title });

    const metrics = reportData.metrics ?? {};
    const prevMetrics = reportData.previousMetrics ?? {};
    const metricKeys = Object.keys(metrics);
    const period = reportData.period ?? 'the current period';

    // ── Headline ──
    let headline: string;
    if (metricKeys.length === 0) {
      headline = `Report Summary for ${period}`;
    } else {
      const changes = metricKeys.map((key) => ({
        key,
        current: metrics[key],
        change: prevMetrics[key] !== undefined ? percentChange(metrics[key], prevMetrics[key]) : 0,
      }));
      const topChange = changes.reduce(
        (best, c) => (Math.abs(c.change) > Math.abs(best.change) ? c : best),
        changes[0],
      );
      const direction = topChange.change >= 0 ? 'increased' : 'decreased';
      headline = `${topChange.key} ${direction} by ${Math.abs(topChange.change).toFixed(1)}% in ${period}`;
    }

    // ── Key Findings ──
    const keyFindings: string[] = [];

    for (const key of metricKeys) {
      const current = metrics[key];
      if (prevMetrics[key] !== undefined) {
        const change = percentChange(current, prevMetrics[key]);
        const dir = change >= 0 ? 'increased' : 'decreased';
        keyFindings.push(
          `${key} ${dir} by ${Math.abs(change).toFixed(1)}% from ${formatNumber(prevMetrics[key])} to ${formatNumber(current)}.`,
        );
      } else {
        keyFindings.push(`${key} stands at ${formatNumber(current)}.`);
      }
    }

    if (keyFindings.length === 0) {
      keyFindings.push('No measurable metrics were provided for this period.');
    }

    // ── Performance Overview ──
    const improvingCount = metricKeys.filter(
      (k) => prevMetrics[k] !== undefined && metrics[k] > prevMetrics[k],
    ).length;
    const decliningCount = metricKeys.filter(
      (k) => prevMetrics[k] !== undefined && metrics[k] < prevMetrics[k],
    ).length;
    const stableCount = metricKeys.filter(
      (k) => prevMetrics[k] !== undefined && metrics[k] === prevMetrics[k],
    ).length;

    let performanceOverview: string;
    if (metricKeys.length === 0) {
      performanceOverview = 'Insufficient data to assess overall performance.';
    } else if (improvingCount > decliningCount) {
      performanceOverview =
        `Overall performance is positive for ${period}. ` +
        `${improvingCount} of ${metricKeys.length} tracked metrics showed improvement` +
        (decliningCount > 0 ? `, while ${decliningCount} declined.` : '.');
    } else if (decliningCount > improvingCount) {
      performanceOverview =
        `Performance for ${period} requires attention. ` +
        `${decliningCount} of ${metricKeys.length} tracked metrics showed decline` +
        (improvingCount > 0 ? `, though ${improvingCount} improved.` : '.');
    } else {
      performanceOverview =
        `Performance for ${period} is mixed. ` +
        `${improvingCount} metrics improved, ${decliningCount} declined` +
        (stableCount > 0 ? `, and ${stableCount} remained stable.` : '.');
    }

    // ── Outlook ──
    let outlook: string;
    if (improvingCount > decliningCount * 2) {
      outlook = 'The strong positive momentum suggests continued growth if current strategies are maintained.';
    } else if (decliningCount > improvingCount * 2) {
      outlook = 'The declining trend warrants immediate review of current strategies and potential corrective actions.';
    } else if (metricKeys.length === 0) {
      outlook = 'Additional data is needed to project future performance.';
    } else {
      outlook = 'Mixed results indicate the need for targeted improvements in underperforming areas while sustaining gains.';
    }

    logger.debug('Executive summary generated', { findingsCount: keyFindings.length });

    return { headline, keyFindings, performanceOverview, outlook };
  }

  /**
   * Generates prioritised recommendations by analysing metric trends and
   * comparing current vs previous values.
   */
  generateRecommendations(reportData: ReportData, reportType: string): Recommendation[] {
    logger.info('Generating recommendations', { reportType });

    const metrics = reportData.metrics ?? {};
    const prevMetrics = reportData.previousMetrics ?? {};
    const recommendations: Recommendation[] = [];

    for (const key of Object.keys(metrics)) {
      const current = metrics[key];
      const previous = prevMetrics[key];

      if (previous === undefined) continue;

      const change = percentChange(current, previous);

      if (change < -20) {
        recommendations.push({
          priority: 'high',
          area: key,
          recommendation: `Investigate the significant decline in ${key} (${change.toFixed(1)}%) and implement corrective measures.`,
          rationale: `${key} dropped from ${formatNumber(previous)} to ${formatNumber(current)}, a ${Math.abs(change).toFixed(1)}% decrease that exceeds the 20% alert threshold.`,
        });
      } else if (change < -5) {
        recommendations.push({
          priority: 'medium',
          area: key,
          recommendation: `Monitor ${key} closely and consider adjustments to reverse the downward trend.`,
          rationale: `${key} decreased by ${Math.abs(change).toFixed(1)}% from ${formatNumber(previous)} to ${formatNumber(current)}.`,
        });
      } else if (change > 20) {
        recommendations.push({
          priority: 'medium',
          area: key,
          recommendation: `Capitalise on the strong growth in ${key} by allocating additional resources to sustain momentum.`,
          rationale: `${key} grew by ${change.toFixed(1)}% from ${formatNumber(previous)} to ${formatNumber(current)}.`,
        });
      } else if (change > 5) {
        recommendations.push({
          priority: 'low',
          area: key,
          recommendation: `Continue current ${key} strategy; moderate growth trajectory is on track.`,
          rationale: `${key} grew modestly by ${change.toFixed(1)}% from ${formatNumber(previous)} to ${formatNumber(current)}.`,
        });
      }
    }

    // Sort by priority (high first)
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'low',
        area: 'general',
        recommendation: `Continue monitoring key metrics for the ${reportType} report. No significant variances detected.`,
        rationale: 'All tracked metrics are within normal variance thresholds.',
      });
    }

    logger.debug('Recommendations generated', { count: recommendations.length });
    return recommendations;
  }

  /**
   * Analyses a numeric data series for trends. Computes moving averages,
   * regression slope, volatility, percentage change, and direction.
   */
  generateTrendAnalysis(dataPoints: number[], fieldName: string): TrendAnalysis {
    logger.info('Generating trend analysis', { fieldName, pointCount: dataPoints.length });

    if (dataPoints.length === 0) {
      return {
        direction: 'stable',
        percentageChange: 0,
        movingAverage: [],
        slope: 0,
        volatility: 0,
        summary: `No data available for ${fieldName}.`,
      };
    }

    if (dataPoints.length === 1) {
      return {
        direction: 'stable',
        percentageChange: 0,
        movingAverage: [dataPoints[0]],
        slope: 0,
        volatility: 0,
        summary: `Only one data point available for ${fieldName} (${formatNumber(dataPoints[0])}). Trend analysis requires at least two data points.`,
      };
    }

    const windowSize = Math.max(2, Math.min(5, Math.floor(dataPoints.length / 3)));
    const movingAvg = computeMovingAverage(dataPoints, windowSize);

    const { slope } = linearRegression(dataPoints);

    const first = dataPoints[0];
    const last = dataPoints[dataPoints.length - 1];
    const pctChange = percentChange(last, first);

    const volatility = standardDeviation(dataPoints) / (mean(dataPoints) || 1);

    // Use slope relative to the mean to determine direction
    const slopeThreshold = Math.abs(mean(dataPoints)) * 0.01 || 0.01;
    const direction = directionWord(slope, slopeThreshold);

    const dirAdverb = directionAdverb(direction);
    const volDescription = volatility > 0.3 ? 'high' : volatility > 0.1 ? 'moderate' : 'low';

    const summary =
      `${fieldName} shows ${dirAdverb} trend over the analysed period, ` +
      `moving from ${formatNumber(first)} to ${formatNumber(last)} ` +
      `(${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%). ` +
      `The ${windowSize}-period moving average confirms this trajectory with ${volDescription} volatility ` +
      `(coefficient of variation: ${(volatility * 100).toFixed(1)}%).`;

    return { direction, percentageChange: pctChange, movingAverage: movingAvg, slope, volatility, summary };
  }

  /**
   * Produces a simple linear-regression-based forecast for future periods.
   */
  generateForecast(historicalData: number[], periods: number): ForecastResult {
    logger.info('Generating forecast', { dataPoints: historicalData.length, periods });

    if (historicalData.length < 2) {
      return {
        projectedValues: [],
        slope: 0,
        intercept: historicalData[0] ?? 0,
        rSquared: 0,
        confidence: 'low',
        summary: 'Insufficient historical data for forecasting. At least two data points are required.',
      };
    }

    const { slope, intercept, rSquared } = linearRegression(historicalData);

    const n = historicalData.length;
    const projectedValues: number[] = [];
    for (let i = 0; i < periods; i++) {
      projectedValues.push(slope * (n + i) + intercept);
    }

    let confidence: 'high' | 'medium' | 'low';
    if (rSquared >= 0.8 && historicalData.length >= 10) {
      confidence = 'high';
    } else if (rSquared >= 0.5 && historicalData.length >= 5) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    const lastActual = historicalData[n - 1];
    const lastProjected = projectedValues[projectedValues.length - 1];
    const projectedChange = percentChange(lastProjected, lastActual);

    const trendWord = slope > 0 ? 'growth' : slope < 0 ? 'decline' : 'flat';
    const summary =
      `Based on ${n} historical data points, the linear regression model (R²=${rSquared.toFixed(3)}) ` +
      `projects ${trendWord} over the next ${periods} period${periods > 1 ? 's' : ''}. ` +
      `Values are expected to move from ${formatNumber(lastActual)} to ${formatNumber(lastProjected)} ` +
      `(${projectedChange >= 0 ? '+' : ''}${projectedChange.toFixed(1)}%). ` +
      `Forecast confidence: ${confidence}.`;

    return { projectedValues, slope, intercept, rSquared, confidence, summary };
  }

  /**
   * Converts tabular data into readable narrative paragraphs.
   * Uses template-based generation to describe each column's distribution,
   * extremes, and notable patterns.
   */
  generateDataNarrative(tableData: Record<string, unknown>[], columns: string[]): DataNarrative {
    logger.info('Generating data narrative', { rowCount: tableData.length, columns });

    if (tableData.length === 0 || columns.length === 0) {
      return {
        paragraphs: ['No data is available to generate a narrative.'],
        highlights: [],
      };
    }

    const paragraphs: string[] = [];
    const highlights: string[] = [];

    // Opening paragraph
    paragraphs.push(
      `The dataset contains ${tableData.length} record${tableData.length !== 1 ? 's' : ''} ` +
      `across ${columns.length} field${columns.length !== 1 ? 's' : ''}: ${columns.join(', ')}.`,
    );

    for (const col of columns) {
      const values = tableData.map((row) => row[col]).filter((v) => v !== undefined && v !== null);

      if (values.length === 0) {
        paragraphs.push(`No data is available for the "${col}" field.`);
        continue;
      }

      const numericValues = values.filter((v) => typeof v === 'number') as number[];

      if (numericValues.length > values.length * 0.5) {
        // Numeric column analysis
        const total = numericValues.reduce((s, v) => s + v, 0);
        const avg = mean(numericValues);
        const min = Math.min(...numericValues);
        const max = Math.max(...numericValues);
        const stdDev = standardDeviation(numericValues);

        paragraphs.push(
          `For "${col}", values range from ${formatNumber(min)} to ${formatNumber(max)} ` +
          `with a mean of ${formatNumber(avg)} and a total of ${formatNumber(total)}. ` +
          `The standard deviation is ${formatNumber(stdDev)}, indicating ` +
          `${stdDev / (Math.abs(avg) || 1) > 0.5 ? 'high' : stdDev / (Math.abs(avg) || 1) > 0.2 ? 'moderate' : 'low'} variability.`,
        );

        // Highlight extremes
        const maxRow = tableData.find((row) => row[col] === max);
        const minRow = tableData.find((row) => row[col] === min);
        if (maxRow) {
          const identifier = columns.find((c) => c !== col && typeof maxRow[c] === 'string');
          if (identifier) {
            highlights.push(`Highest ${col}: ${formatNumber(max)} (${maxRow[identifier]})`);
          } else {
            highlights.push(`Highest ${col}: ${formatNumber(max)}`);
          }
        }
        if (minRow && min !== max) {
          const identifier = columns.find((c) => c !== col && typeof minRow[c] === 'string');
          if (identifier) {
            highlights.push(`Lowest ${col}: ${formatNumber(min)} (${minRow[identifier]})`);
          } else {
            highlights.push(`Lowest ${col}: ${formatNumber(min)}`);
          }
        }

        // Outlier detection using IQR
        const sorted = [...numericValues].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const outliers = numericValues.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr);
        if (outliers.length > 0) {
          highlights.push(`${outliers.length} outlier${outliers.length > 1 ? 's' : ''} detected in ${col}`);
        }
      } else {
        // Categorical column analysis
        const freq: Record<string, number> = {};
        for (const v of values) {
          const key = String(v);
          freq[key] = (freq[key] || 0) + 1;
        }
        const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]);
        const uniqueCount = entries.length;
        const topEntries = entries.slice(0, 3);

        const topList = topEntries
          .map(([val, count]) => `"${val}" (${count}, ${((count / values.length) * 100).toFixed(0)}%)`)
          .join(', ');

        paragraphs.push(
          `The "${col}" field contains ${uniqueCount} distinct value${uniqueCount !== 1 ? 's' : ''}. ` +
          `The most common ${uniqueCount > 1 ? 'values are' : 'value is'}: ${topList}.`,
        );

        if (entries.length > 0) {
          highlights.push(`Most frequent ${col}: ${entries[0][0]} (${entries[0][1]} occurrences)`);
        }
      }
    }

    // Closing paragraph with cross-column observations
    const numericCols = columns.filter((col) => {
      const vals = tableData.map((r) => r[col]).filter((v) => typeof v === 'number');
      return vals.length > tableData.length * 0.5;
    });

    if (numericCols.length >= 2) {
      // Simple correlation check between first two numeric columns
      const colA = numericCols[0];
      const colB = numericCols[1];
      const pairs = tableData
        .filter((r) => typeof r[colA] === 'number' && typeof r[colB] === 'number')
        .map((r) => ({ a: r[colA] as number, b: r[colB] as number }));

      if (pairs.length >= 3) {
        const aVals = pairs.map((p) => p.a);
        const bVals = pairs.map((p) => p.b);
        const aMean = mean(aVals);
        const bMean = mean(bVals);
        let cov = 0;
        let aVar = 0;
        let bVar = 0;
        for (const p of pairs) {
          cov += (p.a - aMean) * (p.b - bMean);
          aVar += (p.a - aMean) ** 2;
          bVar += (p.b - bMean) ** 2;
        }
        const denom = Math.sqrt(aVar * bVar);
        const correlation = denom === 0 ? 0 : cov / denom;

        if (Math.abs(correlation) > 0.7) {
          const corDesc = correlation > 0 ? 'positive' : 'negative';
          paragraphs.push(
            `A notable ${corDesc} correlation (r=${correlation.toFixed(2)}) exists between "${colA}" and "${colB}", ` +
            `suggesting these metrics move ${correlation > 0 ? 'together' : 'inversely'}.`,
          );
          highlights.push(`Strong ${corDesc} correlation between ${colA} and ${colB} (r=${correlation.toFixed(2)})`);
        }
      }
    }

    logger.debug('Data narrative generated', { paragraphs: paragraphs.length, highlights: highlights.length });
    return { paragraphs, highlights };
  }
}

export const aiNarrativeService = new AiNarrativeService();
