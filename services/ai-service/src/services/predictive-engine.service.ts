/**
 * Predictive Engine Service - Rasid Platform
 * Forecasting, scenario simulation, and what-if analysis
 */

interface ForecastResult {
  predictions: number[];
  confidenceIntervals: Array<{ lower: number; upper: number }>;
  method: 'exponential' | 'linear' | 'auto';
  mape: number;
  selectedMethod: string;
}

interface ScenarioConfig {
  name: string;
  parameters: Array<{
    column: string;
    min: number;
    max: number;
    distribution: 'uniform' | 'normal';
  }>;
  targetColumn: string;
}

interface ScenarioResult {
  name: string;
  mean: number;
  median: number;
  stddev: number;
  percentile5: number;
  percentile95: number;
  distribution: number[];
}

interface WhatIfChange {
  column: string;
  factor: number;
}

interface WhatIfResult {
  original: Record<string, number>;
  modified: Record<string, number>;
  impacts: Array<{
    column: string;
    originalValue: number;
    newValue: number;
    changePercent: number;
  }>;
}

export class PredictiveEngineService {
  forecast(
    data: number[],
    periods: number,
    method: 'exponential' | 'linear' | 'auto'
  ): ForecastResult {
    if (data.length < 2) {
      throw new Error('Forecast requires at least 2 data points');
    }

    if (periods < 1) {
      throw new Error('Forecast periods must be >= 1');
    }

    if (method === 'auto') {
      const linearResult = this.forecastLinear(data, periods);
      const expResult = this.forecastExponential(data, periods);

      if (linearResult.mape <= expResult.mape) {
        return {
          ...linearResult,
          method: 'auto',
          selectedMethod: 'linear',
        };
      }
      return {
        ...expResult,
        method: 'auto',
        selectedMethod: 'exponential',
      };
    }

    if (method === 'linear') {
      const result = this.forecastLinear(data, periods);
      return { ...result, selectedMethod: 'linear' };
    }

    const result = this.forecastExponential(data, periods);
    return { ...result, selectedMethod: 'exponential' };
  }

  scenarioSimulation(
    baseData: Array<Record<string, number>>,
    scenarios: ScenarioConfig[]
  ): ScenarioResult[] {
    if (baseData.length === 0 || scenarios.length === 0) {
      return [];
    }

    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      const outcomes: number[] = [];

      // Detect correlations between parameters and target
      const correlations = this.detectParameterCorrelations(baseData, scenario);

      for (let iteration = 0; iteration < 1000; iteration++) {
        // Generate parameter values based on config
        const paramValues: Record<string, number> = {};

        for (const param of scenario.parameters) {
          if (param.distribution === 'uniform') {
            paramValues[param.column] = this.pseudoRandom(iteration, param.column) * (param.max - param.min) + param.min;
          } else {
            // Box-Muller for normal distribution
            const u1 = this.pseudoRandom(iteration * 2, param.column);
            const u2 = this.pseudoRandom(iteration * 2 + 1, param.column);
            const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
            const mean = (param.max + param.min) / 2;
            const stddev = (param.max - param.min) / 4;
            paramValues[param.column] = Math.max(param.min, Math.min(param.max, mean + z * stddev));
          }
        }

        // Compute target value based on correlations and parameter values
        let targetValue = 0;
        const baseMeans = this.computeColumnMeans(baseData);
        const baseTargetMean = baseMeans[scenario.targetColumn] ?? 0;

        targetValue = baseTargetMean;

        for (const param of scenario.parameters) {
          const correlation = correlations[param.column] ?? 0;
          const baseMean = baseMeans[param.column] ?? 0;
          const deviation = baseMean !== 0 ? (paramValues[param.column] - baseMean) / baseMean : 0;
          targetValue += baseTargetMean * deviation * correlation;
        }

        outcomes.push(targetValue);
      }

      outcomes.sort((a, b) => a - b);

      const mean = outcomes.reduce((s, v) => s + v, 0) / outcomes.length;
      const median = outcomes[Math.floor(outcomes.length / 2)];
      const variance = outcomes.reduce((s, v) => s + (v - mean) ** 2, 0) / outcomes.length;
      const stddev = Math.sqrt(variance);

      results.push({
        name: scenario.name,
        mean,
        median,
        stddev,
        percentile5: outcomes[Math.floor(outcomes.length * 0.05)],
        percentile95: outcomes[Math.floor(outcomes.length * 0.95)],
        distribution: this.buildHistogram(outcomes, 20),
      });
    }

    return results;
  }

  whatIfAnalysis(
    data: Array<Record<string, number>>,
    changes: WhatIfChange[]
  ): WhatIfResult {
    if (data.length === 0) {
      throw new Error('whatIfAnalysis requires at least one data row');
    }

    // Compute column means as baseline
    const columns = Object.keys(data[0]);
    const original: Record<string, number> = {};
    for (const col of columns) {
      const vals = data.map((r) => r[col]).filter((v) => v !== undefined && !isNaN(v));
      original[col] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    }

    // Compute correlation matrix for propagation
    const correlationMatrix: Record<string, Record<string, number>> = {};
    for (const col1 of columns) {
      correlationMatrix[col1] = {};
      for (const col2 of columns) {
        if (col1 === col2) {
          correlationMatrix[col1][col2] = 1;
        } else {
          const vals1 = data.map((r) => r[col1]).filter((v) => !isNaN(v));
          const vals2 = data.map((r) => r[col2]).filter((v) => !isNaN(v));
          const minLen = Math.min(vals1.length, vals2.length);
          if (minLen >= 3) {
            correlationMatrix[col1][col2] = this.pearsonCorrelation(vals1.slice(0, minLen), vals2.slice(0, minLen));
          } else {
            correlationMatrix[col1][col2] = 0;
          }
        }
      }
    }

    // Apply changes
    const modified: Record<string, number> = { ...original };
    const changedColumns = new Set<string>();

    for (const change of changes) {
      if (modified[change.column] !== undefined) {
        modified[change.column] = original[change.column] * change.factor;
        changedColumns.add(change.column);
      }
    }

    // Propagate through correlations
    for (const col of columns) {
      if (changedColumns.has(col)) continue;

      let totalImpact = 0;

      for (const changedCol of changedColumns) {
        const corr = correlationMatrix[changedCol]?.[col] ?? 0;
        if (Math.abs(corr) < 0.3) continue; // Only propagate significant correlations

        const changePercent = original[changedCol] !== 0
          ? (modified[changedCol] - original[changedCol]) / original[changedCol]
          : 0;

        totalImpact += changePercent * corr;
      }

      modified[col] = original[col] * (1 + totalImpact);
    }

    // Build impact assessment
    const impacts = columns.map((col) => ({
      column: col,
      originalValue: original[col],
      newValue: modified[col],
      changePercent: original[col] !== 0
        ? ((modified[col] - original[col]) / original[col]) * 100
        : 0,
    })).filter((impact) => Math.abs(impact.changePercent) > 0.01);

    impacts.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

    return { original, modified, impacts };
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private forecastLinear(data: number[], periods: number): Omit<ForecastResult, 'selectedMethod'> {
    const x = data.map((_, i) => i);
    const n = data.length;

    const sumX = x.reduce((s, v) => s + v, 0);
    const sumY = data.reduce((s, v) => s + v, 0);
    const sumXY = x.reduce((s, v, i) => s + v * data[i], 0);
    const sumX2 = x.reduce((s, v) => s + v * v, 0);

    const denom = n * sumX2 - sumX * sumX;
    const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // MAPE on training data
    const mape = this.computeMAPE(
      data,
      x.map((xi) => slope * xi + intercept)
    );

    // Compute residual std for confidence intervals
    const residuals = data.map((v, i) => v - (slope * i + intercept));
    const residualStd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(n - 2, 1));

    const predictions: number[] = [];
    const confidenceIntervals: Array<{ lower: number; upper: number }> = [];

    for (let i = 0; i < periods; i++) {
      const futureX = n + i;
      const pred = slope * futureX + intercept;
      predictions.push(pred);

      const intervalWidth = 1.96 * residualStd * Math.sqrt(1 + 1 / n + ((futureX - sumX / n) ** 2) / (sumX2 - sumX * sumX / n));
      confidenceIntervals.push({
        lower: pred - intervalWidth,
        upper: pred + intervalWidth,
      });
    }

    return { predictions, confidenceIntervals, method: 'linear', mape };
  }

  private forecastExponential(data: number[], periods: number): Omit<ForecastResult, 'selectedMethod'> {
    // Holt's double exponential smoothing
    const alpha = 0.3;
    const beta = 0.1;

    let level = data[0];
    let trend = data.length > 1 ? data[1] - data[0] : 0;

    const fitted: number[] = [level];

    for (let i = 1; i < data.length; i++) {
      const prevLevel = level;
      level = alpha * data[i] + (1 - alpha) * (prevLevel + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      fitted.push(level + trend);
    }

    const mape = this.computeMAPE(data, fitted);

    // Compute residual std for confidence intervals
    const residuals = data.map((v, i) => v - fitted[i]);
    const residualStd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(data.length - 2, 1));

    const predictions: number[] = [];
    const confidenceIntervals: Array<{ lower: number; upper: number }> = [];

    for (let i = 1; i <= periods; i++) {
      const pred = level + trend * i;
      predictions.push(pred);

      const intervalWidth = 1.96 * residualStd * Math.sqrt(i);
      confidenceIntervals.push({
        lower: pred - intervalWidth,
        upper: pred + intervalWidth,
      });
    }

    return { predictions, confidenceIntervals, method: 'exponential', mape };
  }

  private computeMAPE(actual: number[], predicted: number[]): number {
    let totalError = 0;
    let count = 0;

    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== 0) {
        totalError += Math.abs((actual[i] - predicted[i]) / actual[i]);
        count++;
      }
    }

    return count > 0 ? (totalError / count) * 100 : 0;
  }

  private detectParameterCorrelations(
    data: Array<Record<string, number>>,
    scenario: ScenarioConfig
  ): Record<string, number> {
    const correlations: Record<string, number> = {};
    const targetValues = data.map((r) => r[scenario.targetColumn]).filter((v) => v !== undefined && !isNaN(v));

    for (const param of scenario.parameters) {
      const paramValues = data.map((r) => r[param.column]).filter((v) => v !== undefined && !isNaN(v));
      const minLen = Math.min(paramValues.length, targetValues.length);

      if (minLen >= 3) {
        correlations[param.column] = this.pearsonCorrelation(
          paramValues.slice(0, minLen),
          targetValues.slice(0, minLen)
        );
      } else {
        correlations[param.column] = 0;
      }
    }

    return correlations;
  }

  private computeColumnMeans(data: Array<Record<string, number>>): Record<string, number> {
    const means: Record<string, number> = {};
    if (data.length === 0) return means;

    const columns = Object.keys(data[0]);
    for (const col of columns) {
      const vals = data.map((r) => r[col]).filter((v) => v !== undefined && !isNaN(v));
      means[col] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    }

    return means;
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

  private pseudoRandom(seed: number, salt: string): number {
    // Deterministic PRNG using a hash-like approach
    let hash = 0;
    const str = `${seed}-${salt}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Normalize to [0, 1)
    return Math.abs((Math.sin(hash) * 10000) % 1);
  }

  private buildHistogram(values: number[], bins: number): number[] {
    if (values.length === 0) return [];

    const min = values[0];
    const max = values[values.length - 1];
    const range = max - min || 1;
    const binWidth = range / bins;

    const histogram = new Array<number>(bins).fill(0);

    for (const v of values) {
      const binIndex = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      histogram[binIndex]++;
    }

    return histogram;
  }
}
