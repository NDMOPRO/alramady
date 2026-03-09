/**
 * Pattern Discovery Service - Rasid Platform
 * Advanced pattern detection: correlations, clustering, anomalies, trends, causality
 */

type DataRecord = Record<string, number | null>;

interface CorrelationEntry {
  col1: string;
  col2: string;
  pearson: number;
  spearman: number;
  strength: 'strong' | 'moderate' | 'weak' | 'negligible';
}

interface CorrelationResult {
  matrix: Record<string, Record<string, number>>;
  significant: CorrelationEntry[];
}

interface ClusterResult {
  assignments: number[];
  centroids: number[][];
  k: number;
  silhouetteScore: number;
  inertia: number;
  clusterSizes: number[];
}

interface AnomalyResult {
  anomalyScores: number[];
  flaggedRows: number[];
  details: Array<{
    rowIndex: number;
    score: number;
    method: 'iqr' | 'zscore' | 'density';
    columns: string[];
  }>;
}

interface TrendResult {
  column: string;
  linearSlope: number;
  direction: 'increasing' | 'decreasing' | 'stable';
  rSquared: number;
  seasonalityPeriod: number | null;
  changePoints: Array<{ index: number; beforeSlope: number; afterSlope: number }>;
}

interface CausalCandidate {
  cause: string;
  effect: string;
  laggedCorrelation: number;
  optimalLag: number;
  grangerScore: number;
  direction: 'forward' | 'reverse' | 'bidirectional';
}

export class PatternDiscoveryService {
  detectCorrelations(
    data: DataRecord[],
    columns: string[]
  ): CorrelationResult {
    if (data.length < 3 || columns.length < 2) {
      return { matrix: {}, significant: [] };
    }

    const matrix: Record<string, Record<string, number>> = {};
    const significant: CorrelationEntry[] = [];

    const columnValues: Record<string, number[]> = {};
    for (const col of columns) {
      columnValues[col] = this.extractCleanValues(data, col);
    }

    for (const col of columns) {
      matrix[col] = {};
    }

    for (let i = 0; i < columns.length; i++) {
      const col1 = columns[i];
      matrix[col1][col1] = 1.0;

      for (let j = i + 1; j < columns.length; j++) {
        const col2 = columns[j];

        const { aligned1, aligned2 } = this.alignValues(data, col1, col2);
        if (aligned1.length < 3) {
          matrix[col1][col2] = 0;
          matrix[col2][col1] = 0;
          continue;
        }

        const pearson = this.pearsonCorrelation(aligned1, aligned2);
        const spearman = this.spearmanCorrelation(aligned1, aligned2);

        matrix[col1][col2] = pearson;
        matrix[col2][col1] = pearson;

        const absR = Math.abs(pearson);
        const strength: CorrelationEntry['strength'] =
          absR > 0.8 ? 'strong' :
          absR > 0.5 ? 'moderate' :
          absR > 0.3 ? 'weak' :
          'negligible';

        if (absR > 0.5) {
          significant.push({ col1, col2, pearson, spearman, strength });
        }
      }
    }

    significant.sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson));

    return { matrix, significant };
  }

  clusterData(
    data: DataRecord[],
    columns: string[],
    k?: number
  ): ClusterResult {
    if (data.length === 0 || columns.length === 0) {
      return { assignments: [], centroids: [], k: 0, silhouetteScore: 0, inertia: 0, clusterSizes: [] };
    }

    // Build numeric matrix with imputation
    const points: number[][] = [];
    const colMeans: number[] = columns.map((col) => {
      const vals = this.extractCleanValues(data, col);
      return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    });

    for (const row of data) {
      const point = columns.map((col, idx) => {
        const val = row[col];
        return val !== null && val !== undefined && !isNaN(val) ? val : colMeans[idx];
      });
      points.push(point);
    }

    // Normalize (min-max)
    const mins = columns.map((_, ci) => Math.min(...points.map((p) => p[ci])));
    const maxs = columns.map((_, ci) => Math.max(...points.map((p) => p[ci])));
    const ranges = mins.map((min, ci) => maxs[ci] - min || 1);

    const normalized = points.map((p) => p.map((v, ci) => (v - mins[ci]) / ranges[ci]));

    // Determine k using elbow method if not specified
    const effectiveK = k ?? this.findOptimalK(normalized, Math.min(10, Math.floor(normalized.length / 2)));

    if (effectiveK <= 0 || normalized.length < effectiveK) {
      return { assignments: Array(data.length).fill(0), centroids: [[]], k: 1, silhouetteScore: 0, inertia: 0, clusterSizes: [data.length] };
    }

    // Run k-means
    const { assignments, centroids, inertia } = this.kMeans(normalized, effectiveK);

    // Compute cluster sizes
    const clusterSizes = new Array<number>(effectiveK).fill(0);
    assignments.forEach((a) => clusterSizes[a]++);

    // Compute silhouette score
    const silhouetteScore = this.computeSilhouette(normalized, assignments, effectiveK);

    return { assignments, centroids, k: effectiveK, silhouetteScore, inertia, clusterSizes };
  }

  detectAnomalies(
    data: DataRecord[],
    columns: string[]
  ): AnomalyResult {
    if (data.length === 0 || columns.length === 0) {
      return { anomalyScores: [], flaggedRows: [], details: [] };
    }

    const anomalyScores = new Array<number>(data.length).fill(0);
    const details: AnomalyResult['details'] = [];
    const rowFlags = new Map<number, { score: number; methods: Set<string>; columns: Set<string> }>();

    for (const col of columns) {
      const values = data.map((r) => r[col]);
      const nums: Array<{ idx: number; val: number }> = [];
      values.forEach((v, idx) => {
        if (v !== null && v !== undefined && !isNaN(v)) {
          nums.push({ idx, val: v });
        }
      });

      if (nums.length < 5) continue;

      const sorted = [...nums].sort((a, b) => a.val - b.val);
      const n = sorted.length;
      const q1 = sorted[Math.floor(n * 0.25)].val;
      const q3 = sorted[Math.floor(n * 0.75)].val;
      const iqr = q3 - q1;
      const lowerFence = q1 - 1.5 * iqr;
      const upperFence = q3 + 1.5 * iqr;

      const mean = nums.reduce((s, v) => s + v.val, 0) / nums.length;
      const stddev = Math.sqrt(nums.reduce((s, v) => s + (v.val - mean) ** 2, 0) / nums.length);

      for (const { idx, val } of nums) {
        // IQR method
        if (iqr > 0 && (val < lowerFence || val > upperFence)) {
          const score = Math.abs(val - (q1 + q3) / 2) / (iqr || 1);
          this.addRowFlag(rowFlags, idx, score, 'iqr', col);
        }

        // Z-score method
        if (stddev > 0) {
          const zScore = Math.abs((val - mean) / stddev);
          if (zScore > 3) {
            this.addRowFlag(rowFlags, idx, zScore, 'zscore', col);
          }
        }
      }

      // Density-based (local density estimation)
      if (nums.length >= 10) {
        const densityK = Math.min(5, Math.floor(nums.length / 3));
        for (const { idx, val } of nums) {
          const distances = nums
            .filter((n) => n.idx !== idx)
            .map((n) => Math.abs(n.val - val))
            .sort((a, b) => a - b);

          const kthDistance = distances[densityK - 1] ?? 0;
          const avgKDistance = nums.reduce((sum, n) => {
            const ds = nums
              .filter((m) => m.idx !== n.idx)
              .map((m) => Math.abs(m.val - n.val))
              .sort((a, b) => a - b);
            return sum + (ds[densityK - 1] ?? 0);
          }, 0) / nums.length;

          if (avgKDistance > 0) {
            const densityScore = kthDistance / avgKDistance;
            if (densityScore > 2.0) {
              this.addRowFlag(rowFlags, idx, densityScore, 'density', col);
            }
          }
        }
      }
    }

    // Aggregate scores
    for (const [idx, flags] of rowFlags) {
      anomalyScores[idx] = flags.score;
      details.push({
        rowIndex: idx,
        score: flags.score,
        method: flags.methods.has('density') ? 'density' : flags.methods.has('zscore') ? 'zscore' : 'iqr',
        columns: Array.from(flags.columns),
      });
    }

    details.sort((a, b) => b.score - a.score);

    const threshold = details.length > 0
      ? Math.max(details[Math.min(details.length - 1, Math.floor(details.length * 0.9))].score, 2.0)
      : 2.0;

    const flaggedRows = details.filter((d) => d.score >= threshold).map((d) => d.rowIndex);

    return { anomalyScores, flaggedRows, details };
  }

  detectTrends(
    data: DataRecord[],
    timeColumn: string,
    valueColumns: string[]
  ): TrendResult[] {
    if (data.length < 3) return [];

    const results: TrendResult[] = [];

    // Extract time indices
    const timeValues = data.map((r, idx) => {
      const v = r[timeColumn];
      if (v !== null && v !== undefined && !isNaN(v)) return v;
      return idx; // fall back to row index
    });

    for (const col of valueColumns) {
      const values = data.map((r) => r[col]);
      const validPairs: Array<{ t: number; v: number }> = [];

      for (let i = 0; i < data.length; i++) {
        const v = values[i];
        if (v !== null && v !== undefined && !isNaN(v)) {
          validPairs.push({ t: timeValues[i], v });
        }
      }

      if (validPairs.length < 3) continue;

      const x = validPairs.map((p) => p.t);
      const y = validPairs.map((p) => p.v);

      // Linear trend
      const reg = this.linearRegression(x, y);

      const direction: TrendResult['direction'] =
        Math.abs(reg.slope) < 0.001 ? 'stable' :
        reg.slope > 0 ? 'increasing' : 'decreasing';

      // Seasonality detection via autocorrelation
      const seasonalityPeriod = this.detectSeasonality(y);

      // Change point detection (CUSUM)
      const changePoints = this.detectChangePoints(y);

      results.push({
        column: col,
        linearSlope: reg.slope,
        direction,
        rSquared: reg.rSquared,
        seasonalityPeriod,
        changePoints,
      });
    }

    return results;
  }

  detectCausality(
    data: DataRecord[],
    columns: string[]
  ): CausalCandidate[] {
    if (data.length < 10 || columns.length < 2) return [];

    const results: CausalCandidate[] = [];
    const maxLag = Math.min(10, Math.floor(data.length / 4));

    for (let i = 0; i < columns.length; i++) {
      for (let j = i + 1; j < columns.length; j++) {
        const col1 = columns[i];
        const col2 = columns[j];

        const vals1 = data.map((r) => r[col1] ?? 0);
        const vals2 = data.map((r) => r[col2] ?? 0);

        // Check if there are enough non-null values
        const nonNull1 = vals1.filter((v) => v !== 0).length;
        const nonNull2 = vals2.filter((v) => v !== 0).length;
        if (nonNull1 < 5 || nonNull2 < 5) continue;

        // Forward lagged correlations (col1 causes col2)
        let bestForwardCorr = 0;
        let bestForwardLag = 0;

        for (let lag = 1; lag <= maxLag; lag++) {
          const x = vals1.slice(0, vals1.length - lag);
          const y = vals2.slice(lag);
          if (x.length < 5) continue;
          const corr = Math.abs(this.pearsonCorrelation(x, y));
          if (corr > bestForwardCorr) {
            bestForwardCorr = corr;
            bestForwardLag = lag;
          }
        }

        // Reverse lagged correlations (col2 causes col1)
        let bestReverseCorr = 0;
        let bestReverseLag = 0;

        for (let lag = 1; lag <= maxLag; lag++) {
          const x = vals2.slice(0, vals2.length - lag);
          const y = vals1.slice(lag);
          if (x.length < 5) continue;
          const corr = Math.abs(this.pearsonCorrelation(x, y));
          if (corr > bestReverseCorr) {
            bestReverseCorr = corr;
            bestReverseLag = lag;
          }
        }

        // Granger causality approximation
        // Compare prediction error with and without lagged values
        const grangerForward = this.grangerTest(vals1, vals2, bestForwardLag > 0 ? bestForwardLag : 1);
        const grangerReverse = this.grangerTest(vals2, vals1, bestReverseLag > 0 ? bestReverseLag : 1);

        const threshold = 0.3;

        if (bestForwardCorr > threshold || bestReverseCorr > threshold) {
          let direction: CausalCandidate['direction'];
          let laggedCorrelation: number;
          let optimalLag: number;
          let grangerScore: number;

          if (bestForwardCorr > bestReverseCorr + 0.1) {
            direction = 'forward';
            laggedCorrelation = bestForwardCorr;
            optimalLag = bestForwardLag;
            grangerScore = grangerForward;
          } else if (bestReverseCorr > bestForwardCorr + 0.1) {
            direction = 'reverse';
            laggedCorrelation = bestReverseCorr;
            optimalLag = bestReverseLag;
            grangerScore = grangerReverse;
          } else {
            direction = 'bidirectional';
            laggedCorrelation = Math.max(bestForwardCorr, bestReverseCorr);
            optimalLag = bestForwardCorr >= bestReverseCorr ? bestForwardLag : bestReverseLag;
            grangerScore = Math.max(grangerForward, grangerReverse);
          }

          results.push({
            cause: direction === 'reverse' ? col2 : col1,
            effect: direction === 'reverse' ? col1 : col2,
            laggedCorrelation,
            optimalLag,
            grangerScore,
            direction,
          });
        }
      }
    }

    results.sort((a, b) => b.grangerScore - a.grangerScore);
    return results;
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private extractCleanValues(data: DataRecord[], col: string): number[] {
    return data
      .map((r) => r[col])
      .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
  }

  private alignValues(
    data: DataRecord[],
    col1: string,
    col2: string
  ): { aligned1: number[]; aligned2: number[] } {
    const aligned1: number[] = [];
    const aligned2: number[] = [];
    for (const row of data) {
      const v1 = row[col1];
      const v2 = row[col2];
      if (v1 !== null && v1 !== undefined && !isNaN(v1) && v2 !== null && v2 !== undefined && !isNaN(v2)) {
        aligned1.push(v1);
        aligned2.push(v2);
      }
    }
    return { aligned1, aligned2 };
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

  private spearmanCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 3) return 0;

    const rankX = this.computeRanks(x);
    const rankY = this.computeRanks(y);

    return this.pearsonCorrelation(rankX, rankY);
  }

  private computeRanks(values: number[]): number[] {
    const indexed = values.map((v, i) => ({ value: v, index: i }));
    indexed.sort((a, b) => a.value - b.value);

    const ranks = new Array<number>(values.length);
    let i = 0;
    while (i < indexed.length) {
      let j = i;
      while (j < indexed.length && indexed[j].value === indexed[i].value) {
        j++;
      }
      const avgRank = (i + j + 1) / 2; // 1-based average rank for ties
      for (let k = i; k < j; k++) {
        ranks[indexed[k].index] = avgRank;
      }
      i = j;
    }

    return ranks;
  }

  private kMeans(
    data: number[][],
    k: number,
    maxIter: number = 100
  ): { assignments: number[]; centroids: number[][]; inertia: number } {
    const n = data.length;
    const dims = data[0]?.length ?? 0;
    if (n === 0 || dims === 0) {
      return { assignments: [], centroids: [], inertia: 0 };
    }

    const effectiveK = Math.min(k, n);

    // k-means++ initialization
    const centroids: number[][] = [[...data[0]]];
    const usedIndices = new Set<number>([0]);

    for (let c = 1; c < effectiveK; c++) {
      let bestIdx = 0;
      let bestDist = -1;
      for (let i = 0; i < n; i++) {
        if (usedIndices.has(i)) continue;
        let minDist = Infinity;
        for (const centroid of centroids) {
          const dist = this.euclidean(data[i], centroid);
          if (dist < minDist) minDist = dist;
        }
        if (minDist > bestDist) {
          bestDist = minDist;
          bestIdx = i;
        }
      }
      centroids.push([...data[bestIdx]]);
      usedIndices.add(bestIdx);
    }

    let assignments = new Array<number>(n).fill(0);

    for (let iter = 0; iter < maxIter; iter++) {
      const newAssignments = data.map((point) => {
        let minDist = Infinity;
        let best = 0;
        for (let c = 0; c < effectiveK; c++) {
          const dist = this.euclidean(point, centroids[c]);
          if (dist < minDist) {
            minDist = dist;
            best = c;
          }
        }
        return best;
      });

      const changed = newAssignments.some((a, i) => a !== assignments[i]);
      assignments = newAssignments;
      if (!changed) break;

      for (let c = 0; c < effectiveK; c++) {
        const members = data.filter((_, i) => assignments[i] === c);
        if (members.length === 0) continue;
        for (let d = 0; d < dims; d++) {
          centroids[c][d] = members.reduce((s, m) => s + m[d], 0) / members.length;
        }
      }
    }

    let inertia = 0;
    for (let i = 0; i < n; i++) {
      inertia += this.euclidean(data[i], centroids[assignments[i]]) ** 2;
    }

    return { assignments, centroids, inertia };
  }

  private euclidean(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }

  private findOptimalK(data: number[][], maxK: number): number {
    if (data.length <= 2) return 1;

    const inertias: number[] = [];
    const kValues = [];

    for (let k = 1; k <= Math.min(maxK, data.length); k++) {
      const { inertia } = this.kMeans(data, k, 50);
      inertias.push(inertia);
      kValues.push(k);
    }

    if (inertias.length <= 2) return 1;

    // Elbow method: find k where rate of decrease slows
    let bestK = 2;
    let bestScore = 0;

    for (let i = 1; i < inertias.length - 1; i++) {
      const prev = inertias[i - 1];
      const curr = inertias[i];
      const next = inertias[i + 1];

      if (prev === 0) continue;

      const decreaseRate = (prev - curr) / prev;
      const nextDecreaseRate = (curr - next) / (curr || 1);

      const elbowScore = decreaseRate - nextDecreaseRate;

      if (elbowScore > bestScore) {
        bestScore = elbowScore;
        bestK = kValues[i];
      }
    }

    return Math.max(2, bestK);
  }

  private computeSilhouette(data: number[][], assignments: number[], k: number): number {
    const n = data.length;
    if (n < 2 || k < 2) return 0;

    let totalSilhouette = 0;

    for (let i = 0; i < n; i++) {
      const myCluster = assignments[i];

      // a(i): mean distance to same cluster
      const sameCluster = data.filter((_, j) => j !== i && assignments[j] === myCluster);
      const a = sameCluster.length > 0
        ? sameCluster.reduce((s, p) => s + this.euclidean(data[i], p), 0) / sameCluster.length
        : 0;

      // b(i): minimum mean distance to other cluster
      let b = Infinity;
      for (let c = 0; c < k; c++) {
        if (c === myCluster) continue;
        const otherCluster = data.filter((_, j) => assignments[j] === c);
        if (otherCluster.length === 0) continue;
        const meanDist = otherCluster.reduce((s, p) => s + this.euclidean(data[i], p), 0) / otherCluster.length;
        if (meanDist < b) b = meanDist;
      }

      if (b === Infinity) b = 0;

      const maxAB = Math.max(a, b);
      const silhouette = maxAB === 0 ? 0 : (b - a) / maxAB;
      totalSilhouette += silhouette;
    }

    return totalSilhouette / n;
  }

  private linearRegression(x: number[], y: number[]): { slope: number; intercept: number; rSquared: number } {
    const n = x.length;
    if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };

    const sumX = x.reduce((s, v) => s + v, 0);
    const sumY = y.reduce((s, v) => s + v, 0);
    const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
    const sumX2 = x.reduce((s, v) => s + v * v, 0);

    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) {
      return { slope: 0, intercept: sumY / n, rSquared: 0 };
    }

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const meanY = sumY / n;
    const ssTotal = y.reduce((s, v) => s + (v - meanY) ** 2, 0);
    const predictions = x.map((v) => slope * v + intercept);
    const ssResidual = y.reduce((s, v, i) => s + (v - predictions[i]) ** 2, 0);
    const rSquared = ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal;

    return { slope, intercept, rSquared };
  }

  private detectSeasonality(values: number[]): number | null {
    if (values.length < 8) return null;

    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const detrended = values.map((v) => v - mean);

    const maxLag = Math.floor(values.length / 2);
    const autocorrelations: number[] = [];

    // Variance at lag 0
    const variance = detrended.reduce((s, v) => s + v * v, 0);
    if (variance === 0) return null;

    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < values.length - lag; i++) {
        sum += detrended[i] * detrended[i + lag];
      }
      autocorrelations.push(sum / variance);
    }

    // Find peaks in autocorrelation
    let bestPeriod: number | null = null;
    let bestAC = 0;

    for (let i = 1; i < autocorrelations.length - 1; i++) {
      if (
        autocorrelations[i] > autocorrelations[i - 1] &&
        autocorrelations[i] > autocorrelations[i + 1] &&
        autocorrelations[i] > 0.3
      ) {
        if (autocorrelations[i] > bestAC) {
          bestAC = autocorrelations[i];
          bestPeriod = i + 1;
        }
      }
    }

    return bestPeriod;
  }

  private detectChangePoints(values: number[]): Array<{ index: number; beforeSlope: number; afterSlope: number }> {
    if (values.length < 6) return [];

    const changePoints: Array<{ index: number; beforeSlope: number; afterSlope: number }> = [];

    // CUSUM algorithm
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const stddev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);

    if (stddev === 0) return [];

    const threshold = stddev * 2;
    let cumSum = 0;
    let minSum = 0;
    let maxSum = 0;

    for (let i = 0; i < values.length; i++) {
      cumSum += values[i] - mean;

      if (cumSum - minSum > threshold) {
        const beforeX = Array.from({ length: i }, (_, k) => k);
        const afterX = Array.from({ length: values.length - i }, (_, k) => i + k);
        const beforeSlope = this.linearRegression(beforeX, values.slice(0, i)).slope;
        const afterSlope = this.linearRegression(afterX, values.slice(i)).slope;

        changePoints.push({ index: i, beforeSlope, afterSlope });
        minSum = cumSum;
      }

      if (maxSum - cumSum > threshold) {
        const beforeX = Array.from({ length: i }, (_, k) => k);
        const afterX = Array.from({ length: values.length - i }, (_, k) => i + k);
        const beforeSlope = this.linearRegression(beforeX, values.slice(0, i)).slope;
        const afterSlope = this.linearRegression(afterX, values.slice(i)).slope;

        changePoints.push({ index: i, beforeSlope, afterSlope });
        maxSum = cumSum;
      }

      if (cumSum < minSum) minSum = cumSum;
      if (cumSum > maxSum) maxSum = cumSum;
    }

    // Deduplicate nearby change points
    const filtered: typeof changePoints = [];
    for (const cp of changePoints) {
      if (filtered.length === 0 || cp.index - filtered[filtered.length - 1].index > 3) {
        filtered.push(cp);
      }
    }

    return filtered;
  }

  private grangerTest(cause: number[], effect: number[], lag: number): number {
    if (cause.length < lag + 5) return 0;

    const n = cause.length - lag;

    // Restricted model: predict effect from its own lags
    const yRestricted = effect.slice(lag);
    const xRestricted = Array.from({ length: n }, (_, i) => effect[i]);
    const regRestricted = this.linearRegression(
      Array.from({ length: n }, (_, i) => i),
      yRestricted
    );
    const ssRestricted = yRestricted.reduce((s, v, i) => {
      const pred = regRestricted.slope * i + regRestricted.intercept;
      return s + (v - pred) ** 2;
    }, 0);

    // Unrestricted model: predict effect from its own lags + cause lags
    const yUnrestricted = effect.slice(lag);
    const causeLagged = cause.slice(0, n);
    const regUnrestricted = this.linearRegression(causeLagged, yUnrestricted);
    const ssUnrestricted = yUnrestricted.reduce((s, v, i) => {
      const pred = regUnrestricted.slope * causeLagged[i] + regUnrestricted.intercept;
      return s + (v - pred) ** 2;
    }, 0);

    // F-statistic approximation
    if (ssUnrestricted === 0) return 1.0;

    const improvement = (ssRestricted - ssUnrestricted) / ssRestricted;
    return Math.max(0, Math.min(1, improvement));
  }

  private addRowFlag(
    map: Map<number, { score: number; methods: Set<string>; columns: Set<string> }>,
    idx: number,
    score: number,
    method: string,
    col: string
  ): void {
    const existing = map.get(idx);
    if (existing) {
      existing.score = Math.max(existing.score, score);
      existing.methods.add(method);
      existing.columns.add(col);
    } else {
      map.set(idx, { score, methods: new Set([method]), columns: new Set([col]) });
    }
  }
}
