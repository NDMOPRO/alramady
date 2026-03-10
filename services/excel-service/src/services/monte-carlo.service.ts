/**
 * Monte Carlo Simulation Service — Rasid Platform
 * محاكاة مونت كارلو لتحليل المخاطر والتنبؤات
 */

import { PrismaClient } from '@prisma/client';

interface MonteCarloVariable {
  cellRef: string;
  distribution: 'normal' | 'uniform' | 'triangular' | 'lognormal';
  params: Record<string, number>;
}

interface MonteCarloParams {
  iterations: number;
  variables: MonteCarloVariable[];
  outputFormula: string;
  seed?: number;
}

interface SimulationResult {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  percentile5: number;
  percentile95: number;
  median: number;
  histogram: Array<{ binStart: number; binEnd: number; count: number }>;
  rawResults: number[];
}

export class MonteCarloService {
  constructor(private prisma: PrismaClient) {}

  async runSimulation(params: MonteCarloParams): Promise<SimulationResult> {
    const { iterations, variables, outputFormula } = params;
    const random = this.createRandom(
      params.seed ?? this.deriveSeed(iterations, variables, outputFormula)
    );
    const results: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const values: Record<string, number> = {};

      for (const variable of variables) {
        values[variable.cellRef] = this.generateDistributionSample(
          variable.distribution,
          variable.params,
          random
        );
      }

      // Evaluate the output formula with the sampled values
      const result = this.evaluateFormula(outputFormula, values);
      results.push(result);
    }

    results.sort((a, b) => a - b);

    const sum = results.reduce((a, b) => a + b, 0);
    const meanVal = sum / results.length;
    const varianceVal = results.reduce((s, v) => s + (v - meanVal) ** 2, 0) / (results.length - 1);
    const stdDevVal = Math.sqrt(varianceVal);

    const histogram = this.buildHistogram(results, 20);

    return {
      mean: meanVal,
      stdDev: stdDevVal,
      min: results[0],
      max: results[results.length - 1],
      percentile5: this.percentile(results, 5),
      percentile95: this.percentile(results, 95),
      median: this.percentile(results, 50),
      histogram,
      rawResults: results.length <= 10000 ? results : results.filter((_, i) => i % Math.ceil(results.length / 10000) === 0),
    };
  }

  generateDistributionSample(
    distribution: string,
    params: Record<string, number>,
    random: () => number
  ): number {
    switch (distribution) {
      case 'normal': {
        const { mean = 0, std = 1 } = params;
        return this.normalSample(mean, std, random);
      }
      case 'uniform': {
        const { min = 0, max = 1 } = params;
        return min + random() * (max - min);
      }
      case 'triangular': {
        const { min = 0, max = 1, mode = 0.5 } = params;
        return this.triangularSample(min, max, mode, random);
      }
      case 'lognormal': {
        const { mu = 0, sigma = 1 } = params;
        return Math.exp(this.normalSample(mu, sigma, random));
      }
      default:
        throw new Error(`Unsupported distribution: ${distribution}`);
    }
  }

  private normalSample(mean: number, std: number, random: () => number): number {
    // Box-Muller transform
    const u1 = Math.max(random(), Number.EPSILON);
    const u2 = random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + std * z;
  }

  private triangularSample(min: number, max: number, mode: number, random: () => number): number {
    const u = random();
    const fc = (mode - min) / (max - min);

    if (u < fc) {
      return min + Math.sqrt(u * (max - min) * (mode - min));
    }
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  }

  private deriveSeed(
    iterations: number,
    variables: MonteCarloVariable[],
    outputFormula: string
  ): number {
    const payload = JSON.stringify({ iterations, variables, outputFormula });
    let hash = 2166136261;
    for (let i = 0; i < payload.length; i += 1) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private createRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private evaluateFormula(formula: string, values: Record<string, number>): number {
    let expression = formula;
    for (const [ref, value] of Object.entries(values)) {
      expression = expression.replace(new RegExp(ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value));
    }

    try {
      const fn = new Function(`return ${expression}`);
      const result = fn();
      return typeof result === 'number' && !Number.isNaN(result) ? result : 0;
    } catch {
      return 0;
    }
  }

  private percentile(sortedArr: number[], p: number): number {
    const index = (p / 100) * (sortedArr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) return sortedArr[lower];
    return sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight;
  }

  private buildHistogram(
    sortedArr: number[],
    bins: number
  ): Array<{ binStart: number; binEnd: number; count: number }> {
    const min = sortedArr[0];
    const max = sortedArr[sortedArr.length - 1];
    const binWidth = (max - min) / bins;

    if (binWidth === 0) {
      return [{ binStart: min, binEnd: max, count: sortedArr.length }];
    }

    const histogram: Array<{ binStart: number; binEnd: number; count: number }> = [];

    for (let i = 0; i < bins; i++) {
      const binStart = min + i * binWidth;
      const binEnd = i === bins - 1 ? max + 1e-10 : min + (i + 1) * binWidth;
      const count = sortedArr.filter((v) => v >= binStart && v < binEnd).length;
      histogram.push({ binStart, binEnd, count });
    }

    return histogram;
  }
}
