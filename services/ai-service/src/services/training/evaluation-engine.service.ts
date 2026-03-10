import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import winston from 'winston';
import { z } from 'zod';

// ─── Logger ──────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: { service: 'evaluation-engine' },
  transports: [new winston.transports.Console()],
});

// ─── Validation Schemas ──────────────────────────────────────────────

const EvaluationRequestSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  modelId: z.string().min(1),
  datasetId: z.string().uuid(),
  split: z.enum(['test', 'validation', 'all']).optional().default('test'),
  metrics: z.array(z.enum([
    'accuracy', 'precision', 'recall', 'f1',
    'bleu', 'rouge', 'exact_match',
    'arabic_morphological_accuracy', 'arabic_diacritics_accuracy',
  ])).min(1),
  maxSamples: z.number().int().min(1).max(10000).optional().default(500),
});

const CompareModelsSchema = z.object({
  tenantId: z.string().uuid(),
  modelIds: z.array(z.string().min(1)).min(2).max(10),
  datasetId: z.string().uuid(),
  metrics: z.array(z.string().min(1)).min(1),
});

// ─── Interfaces ──────────────────────────────────────────────────────

export interface EvaluationResult {
  id: string;
  tenantId: string;
  modelId: string;
  datasetId: string;
  split: string;
  metrics: Record<string, number>;
  confusionMatrix: ConfusionMatrix | null;
  perClassMetrics: PerClassMetric[];
  sampleResults: SampleEvaluation[];
  totalSamples: number;
  evaluatedSamples: number;
  duration: number;
  createdAt: Date;
}

export interface ConfusionMatrix {
  labels: string[];
  matrix: number[][];
  truePositives: Record<string, number>;
  falsePositives: Record<string, number>;
  falseNegatives: Record<string, number>;
}

export interface PerClassMetric {
  label: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface SampleEvaluation {
  input: string;
  expected: string;
  predicted: string;
  isCorrect: boolean;
  confidence: number;
}

export interface ModelComparison {
  models: Array<{
    modelId: string;
    metrics: Record<string, number>;
  }>;
  winner: string;
  metricDifferences: Record<string, Record<string, number>>;
  recommendation: string;
}

// ─── Service ─────────────────────────────────────────────────────────

export class EvaluationEngineService {
  private openai: OpenAI;

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' });
  }

  // ── Run Evaluation ──────────────────────────────────────────────

  async evaluate(input: z.infer<typeof EvaluationRequestSchema>): Promise<EvaluationResult> {
    const validated = EvaluationRequestSchema.parse(input);
    const evalId = crypto.randomUUID();
    const startTime = Date.now();

    logger.info('Starting evaluation', { evalId, modelId: validated.modelId, datasetId: validated.datasetId });

    // Fetch samples
    const where: Record<string, unknown> = { datasetId: validated.datasetId };
    if (validated.split !== 'all') {
      where.split = validated.split;
    }

    const samples = await this.prisma.trainingSample.findMany({
      where,
      take: validated.maxSamples,
      orderBy: { quality: 'desc' },
    });

    if (samples.length === 0) {
      throw new Error(`No samples found for dataset ${validated.datasetId} with split "${validated.split}"`);
    }

    // Generate predictions
    const sampleResults: SampleEvaluation[] = [];
    const predictions: string[] = [];
    const actuals: string[] = [];

    for (const sample of samples) {
      const typed = sample as Record<string, unknown>;
      const inputText = typed.input as string;
      const expectedOutput = typed.expectedOutput as string;

      let predicted: string;
      let confidence: number;

      try {
        const response = await this.openai.chat.completions.create({
          model: validated.modelId,
          messages: [
            { role: 'system', content: 'You are a helpful assistant trained on domain-specific data.' },
            { role: 'user', content: inputText },
          ],
          max_tokens: 2000,
          temperature: 0,
        });

        predicted = response.choices[0]?.message?.content?.trim() || '';
        const logprobs = response.choices[0]?.logprobs;
        confidence = logprobs ? Math.exp(logprobs.content?.[0]?.logprob ?? -1) : 0.5;
      } catch (err) {
        logger.warn('Prediction failed for sample', { sampleId: typed.id, error: err instanceof Error ? err.message : String(err) });
        predicted = '';
        confidence = 0;
      }

      const isCorrect = this.isMatchingOutput(predicted, expectedOutput);

      predictions.push(predicted);
      actuals.push(expectedOutput);

      sampleResults.push({
        input: inputText.substring(0, 200),
        expected: expectedOutput.substring(0, 200),
        predicted: predicted.substring(0, 200),
        isCorrect,
        confidence,
      });
    }

    // Compute metrics
    const metrics: Record<string, number> = {};

    for (const metric of validated.metrics) {
      switch (metric) {
        case 'accuracy':
          metrics.accuracy = this.computeAccuracy(predictions, actuals);
          break;
        case 'precision':
          metrics.precision = this.computePrecision(predictions, actuals);
          break;
        case 'recall':
          metrics.recall = this.computeRecall(predictions, actuals);
          break;
        case 'f1':
          metrics.f1 = this.computeF1(predictions, actuals);
          break;
        case 'bleu':
          metrics.bleu = this.computeBLEU(predictions, actuals);
          break;
        case 'rouge':
          metrics.rouge = this.computeROUGE(predictions, actuals);
          break;
        case 'exact_match':
          metrics.exact_match = this.computeExactMatch(predictions, actuals);
          break;
        case 'arabic_morphological_accuracy':
          metrics.arabic_morphological_accuracy = this.computeArabicMorphologicalAccuracy(predictions, actuals);
          break;
        case 'arabic_diacritics_accuracy':
          metrics.arabic_diacritics_accuracy = this.computeArabicDiacriticsAccuracy(predictions, actuals);
          break;
      }
    }

    // Confusion matrix
    const confusionMatrix = this.buildConfusionMatrix(predictions, actuals);

    // Per-class metrics
    const perClassMetrics = this.computePerClassMetrics(predictions, actuals);

    const duration = Date.now() - startTime;

    // Save evaluation result
    await this.prisma.evaluationResult.create({
      data: {
        id: evalId,
        tenantId: validated.tenantId,
        userId: validated.userId,
        modelId: validated.modelId,
        datasetId: validated.datasetId,
        split: validated.split,
        metrics: JSON.stringify(metrics),
        confusionMatrix: confusionMatrix ? JSON.stringify(confusionMatrix) : null,
        perClassMetrics: JSON.stringify(perClassMetrics),
        sampleResults: JSON.stringify(sampleResults.slice(0, 100)),
        totalSamples: samples.length,
        evaluatedSamples: sampleResults.length,
        duration,
        createdAt: new Date(),
      },
    });

    logger.info('Evaluation complete', { evalId, metrics, duration, evaluatedSamples: sampleResults.length });

    return {
      id: evalId,
      tenantId: validated.tenantId,
      modelId: validated.modelId,
      datasetId: validated.datasetId,
      split: validated.split,
      metrics,
      confusionMatrix,
      perClassMetrics,
      sampleResults: sampleResults.slice(0, 100),
      totalSamples: samples.length,
      evaluatedSamples: sampleResults.length,
      duration,
      createdAt: new Date(),
    };
  }

  // ── Get Evaluation Result ───────────────────────────────────────

  async getEvaluation(evalId: string, tenantId: string): Promise<EvaluationResult | null> {
    const result = await this.prisma.evaluationResult.findFirst({
      where: { id: evalId, tenantId },
    });

    if (!result) return null;
    return this.toEvaluationResult(result);
  }

  // ── List Evaluations ────────────────────────────────────────────

  async listEvaluations(
    tenantId: string,
    options: { modelId?: string; datasetId?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: EvaluationResult[]; total: number }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (options.modelId) where.modelId = options.modelId;
    if (options.datasetId) where.datasetId = options.datasetId;

    const [results, total] = await Promise.all([
      this.prisma.evaluationResult.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.evaluationResult.count({ where }),
    ]);

    return {
      data: results.map((r: Record<string, unknown>) => this.toEvaluationResult(r)),
      total,
    };
  }

  // ── Compare Models ──────────────────────────────────────────────

  async compareModels(input: z.infer<typeof CompareModelsSchema>): Promise<ModelComparison> {
    const validated = CompareModelsSchema.parse(input);

    logger.info('Comparing models', { modelIds: validated.modelIds });

    const modelMetrics: Array<{ modelId: string; metrics: Record<string, number> }> = [];

    for (const modelId of validated.modelIds) {
      // Get latest evaluation for each model
      const evaluation = await this.prisma.evaluationResult.findFirst({
        where: {
          tenantId: validated.tenantId,
          modelId,
          datasetId: validated.datasetId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (evaluation) {
        const typed = evaluation as Record<string, unknown>;
        let metrics: Record<string, number>;
        try {
          const raw = typed.metrics;
          metrics = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, number>;
        } catch {
          metrics = {};
        }
        modelMetrics.push({ modelId, metrics });
      } else {
        modelMetrics.push({ modelId, metrics: {} });
      }
    }

    // Calculate differences
    const metricDifferences: Record<string, Record<string, number>> = {};

    for (const metric of validated.metrics) {
      metricDifferences[metric] = {};
      for (const model of modelMetrics) {
        metricDifferences[metric][model.modelId] = model.metrics[metric] ?? 0;
      }
    }

    // Determine winner (model with best average across metrics)
    let bestModelId = validated.modelIds[0];
    let bestScore = -Infinity;

    for (const model of modelMetrics) {
      const metricValues = validated.metrics
        .map((m) => model.metrics[m])
        .filter((v): v is number => v !== undefined);

      if (metricValues.length > 0) {
        const avgScore = metricValues.reduce((a, b) => a + b, 0) / metricValues.length;
        if (avgScore > bestScore) {
          bestScore = avgScore;
          bestModelId = model.modelId;
        }
      }
    }

    const recommendation = this.generateComparisonRecommendation(modelMetrics, validated.metrics);

    return {
      models: modelMetrics,
      winner: bestModelId,
      metricDifferences,
      recommendation,
    };
  }

  // ── Metric Computations ─────────────────────────────────────────

  private computeAccuracy(predictions: string[], actuals: string[]): number {
    if (predictions.length === 0) return 0;
    let correct = 0;

    for (let i = 0; i < predictions.length; i++) {
      if (this.isMatchingOutput(predictions[i], actuals[i])) {
        correct++;
      }
    }

    return Math.round((correct / predictions.length) * 10000) / 10000;
  }

  private computePrecision(predictions: string[], actuals: string[]): number {
    const labels = this.extractUniqueLabels(actuals);
    if (labels.length === 0) return 0;

    let totalPrecision = 0;

    for (const label of labels) {
      const tp = this.countMatches(predictions, actuals, label, label);
      const fp = predictions.filter((p, i) =>
        this.normalizeText(p) === label && this.normalizeText(actuals[i]) !== label,
      ).length;

      totalPrecision += tp + fp > 0 ? tp / (tp + fp) : 0;
    }

    return Math.round((totalPrecision / labels.length) * 10000) / 10000;
  }

  private computeRecall(predictions: string[], actuals: string[]): number {
    const labels = this.extractUniqueLabels(actuals);
    if (labels.length === 0) return 0;

    let totalRecall = 0;

    for (const label of labels) {
      const tp = this.countMatches(predictions, actuals, label, label);
      const fn = actuals.filter((a, i) =>
        this.normalizeText(a) === label && this.normalizeText(predictions[i]) !== label,
      ).length;

      totalRecall += tp + fn > 0 ? tp / (tp + fn) : 0;
    }

    return Math.round((totalRecall / labels.length) * 10000) / 10000;
  }

  private computeF1(predictions: string[], actuals: string[]): number {
    const precision = this.computePrecision(predictions, actuals);
    const recall = this.computeRecall(predictions, actuals);

    if (precision + recall === 0) return 0;
    return Math.round((2 * precision * recall / (precision + recall)) * 10000) / 10000;
  }

  private computeBLEU(predictions: string[], actuals: string[]): number {
    if (predictions.length === 0) return 0;
    let totalBleu = 0;

    for (let i = 0; i < predictions.length; i++) {
      totalBleu += this.sentenceBLEU(predictions[i], actuals[i]);
    }

    return Math.round((totalBleu / predictions.length) * 10000) / 10000;
  }

  private sentenceBLEU(prediction: string, reference: string): number {
    const predTokens = this.tokenize(prediction);
    const refTokens = this.tokenize(reference);

    if (predTokens.length === 0 || refTokens.length === 0) return 0;

    let totalScore = 0;
    const maxN = Math.min(4, predTokens.length, refTokens.length);

    for (let n = 1; n <= maxN; n++) {
      const predNgrams = this.getNgrams(predTokens, n);
      const refNgrams = this.getNgrams(refTokens, n);

      const refNgramCounts = new Map<string, number>();
      for (const ng of refNgrams) {
        const key = ng.join(' ');
        refNgramCounts.set(key, (refNgramCounts.get(key) || 0) + 1);
      }

      let matches = 0;
      const usedCounts = new Map<string, number>();

      for (const ng of predNgrams) {
        const key = ng.join(' ');
        const refCount = refNgramCounts.get(key) || 0;
        const usedCount = usedCounts.get(key) || 0;

        if (usedCount < refCount) {
          matches++;
          usedCounts.set(key, usedCount + 1);
        }
      }

      const precision = predNgrams.length > 0 ? matches / predNgrams.length : 0;
      totalScore += Math.log(Math.max(precision, 1e-10));
    }

    // Brevity penalty
    const bp = predTokens.length >= refTokens.length
      ? 1
      : Math.exp(1 - refTokens.length / predTokens.length);

    return bp * Math.exp(totalScore / maxN);
  }

  private computeROUGE(predictions: string[], actuals: string[]): number {
    if (predictions.length === 0) return 0;
    let totalRouge = 0;

    for (let i = 0; i < predictions.length; i++) {
      totalRouge += this.rougeL(predictions[i], actuals[i]);
    }

    return Math.round((totalRouge / predictions.length) * 10000) / 10000;
  }

  private rougeL(prediction: string, reference: string): number {
    const predTokens = this.tokenize(prediction);
    const refTokens = this.tokenize(reference);

    if (predTokens.length === 0 || refTokens.length === 0) return 0;

    const lcsLength = this.longestCommonSubsequence(predTokens, refTokens);

    const precision = lcsLength / predTokens.length;
    const recall = lcsLength / refTokens.length;

    if (precision + recall === 0) return 0;
    return (2 * precision * recall) / (precision + recall);
  }

  private longestCommonSubsequence(a: string[], b: string[]): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  private computeExactMatch(predictions: string[], actuals: string[]): number {
    if (predictions.length === 0) return 0;
    let matches = 0;

    for (let i = 0; i < predictions.length; i++) {
      if (this.normalizeText(predictions[i]) === this.normalizeText(actuals[i])) {
        matches++;
      }
    }

    return Math.round((matches / predictions.length) * 10000) / 10000;
  }

  // ── Arabic-Specific Metrics ─────────────────────────────────────

  private computeArabicMorphologicalAccuracy(predictions: string[], actuals: string[]): number {
    if (predictions.length === 0) return 0;
    let totalScore = 0;

    for (let i = 0; i < predictions.length; i++) {
      const predRoots = this.extractArabicRoots(predictions[i]);
      const actualRoots = this.extractArabicRoots(actuals[i]);

      if (actualRoots.length === 0) {
        totalScore += predictions[i].trim() === actuals[i].trim() ? 1 : 0;
        continue;
      }

      const matchedRoots = predRoots.filter((r) => actualRoots.includes(r));
      totalScore += matchedRoots.length / Math.max(actualRoots.length, 1);
    }

    return Math.round((totalScore / predictions.length) * 10000) / 10000;
  }

  private computeArabicDiacriticsAccuracy(predictions: string[], actuals: string[]): number {
    if (predictions.length === 0) return 0;
    const diacriticsPattern = /[\u064B-\u065F\u0670]/g;
    let totalScore = 0;

    for (let i = 0; i < predictions.length; i++) {
      const predDiacritics = predictions[i].match(diacriticsPattern) || [];
      const actualDiacritics = actuals[i].match(diacriticsPattern) || [];

      if (actualDiacritics.length === 0) {
        totalScore += predDiacritics.length === 0 ? 1 : 0.5;
        continue;
      }

      const minLen = Math.min(predDiacritics.length, actualDiacritics.length);
      const maxLen = Math.max(predDiacritics.length, actualDiacritics.length);
      let matches = 0;

      for (let j = 0; j < minLen; j++) {
        if (predDiacritics[j] === actualDiacritics[j]) matches++;
      }

      totalScore += maxLen > 0 ? matches / maxLen : 1;
    }

    return Math.round((totalScore / predictions.length) * 10000) / 10000;
  }

  // ── Confusion Matrix ───────────────────────────────────────────

  private buildConfusionMatrix(predictions: string[], actuals: string[]): ConfusionMatrix | null {
    const labels = this.extractUniqueLabels([...predictions, ...actuals]);

    if (labels.length === 0 || labels.length > 50) return null;

    const labelIndex = new Map<string, number>();
    labels.forEach((label, idx) => labelIndex.set(label, idx));

    const matrix: number[][] = Array.from(
      { length: labels.length },
      () => Array(labels.length).fill(0),
    );

    const tp: Record<string, number> = {};
    const fp: Record<string, number> = {};
    const fn: Record<string, number> = {};

    for (const label of labels) {
      tp[label] = 0;
      fp[label] = 0;
      fn[label] = 0;
    }

    for (let i = 0; i < predictions.length; i++) {
      const predLabel = this.normalizeText(predictions[i]);
      const actualLabel = this.normalizeText(actuals[i]);

      const predIdx = labelIndex.get(predLabel);
      const actualIdx = labelIndex.get(actualLabel);

      if (predIdx !== undefined && actualIdx !== undefined) {
        matrix[actualIdx][predIdx]++;
      }

      if (predLabel === actualLabel) {
        tp[actualLabel] = (tp[actualLabel] || 0) + 1;
      } else {
        fp[predLabel] = (fp[predLabel] || 0) + 1;
        fn[actualLabel] = (fn[actualLabel] || 0) + 1;
      }
    }

    return {
      labels,
      matrix,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
    };
  }

  // ── Per-Class Metrics ──────────────────────────────────────────

  private computePerClassMetrics(predictions: string[], actuals: string[]): PerClassMetric[] {
    const labels = this.extractUniqueLabels(actuals);
    const result: PerClassMetric[] = [];

    for (const label of labels) {
      const tp = this.countMatches(predictions, actuals, label, label);
      const fp = predictions.filter((p, i) =>
        this.normalizeText(p) === label && this.normalizeText(actuals[i]) !== label,
      ).length;
      const fn = actuals.filter((a, i) =>
        this.normalizeText(a) === label && this.normalizeText(predictions[i]) !== label,
      ).length;

      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
      const support = actuals.filter((a) => this.normalizeText(a) === label).length;

      result.push({
        label,
        precision: Math.round(precision * 10000) / 10000,
        recall: Math.round(recall * 10000) / 10000,
        f1: Math.round(f1 * 10000) / 10000,
        support,
      });
    }

    return result.sort((a, b) => b.support - a.support);
  }

  // ── Private Helpers ─────────────────────────────────────────────

  private isMatchingOutput(prediction: string, actual: string): boolean {
    const normPred = this.normalizeText(prediction);
    const normActual = this.normalizeText(actual);

    if (normPred === normActual) return true;

    // Fuzzy match: check if similarity > 0.8
    const similarity = this.computeStringSimilarity(normPred, normActual);
    return similarity > 0.8;
  }

  private computeStringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const maxLen = Math.max(a.length, b.length);
    const distance = this.levenshteinDistance(a, b);
    return 1 - distance / maxLen;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }

    return dp[m][n];
  }

  private normalizeText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '') // Remove Arabic diacritics
      .replace(/\s+/g, ' ');
  }

  private tokenize(text: string): string[] {
    return text.trim().split(/\s+/).filter((t) => t.length > 0);
  }

  private getNgrams(tokens: string[], n: number): string[][] {
    const ngrams: string[][] = [];
    for (let i = 0; i <= tokens.length - n; i++) {
      ngrams.push(tokens.slice(i, i + n));
    }
    return ngrams;
  }

  private extractUniqueLabels(texts: string[]): string[] {
    const labels = new Set<string>();
    for (const text of texts) {
      const normalized = this.normalizeText(text);
      if (normalized.length > 0 && normalized.length < 100) {
        labels.add(normalized);
      }
    }
    return Array.from(labels).sort();
  }

  private countMatches(
    predictions: string[],
    actuals: string[],
    predLabel: string,
    actualLabel: string,
  ): number {
    let count = 0;
    for (let i = 0; i < predictions.length; i++) {
      if (this.normalizeText(predictions[i]) === predLabel &&
          this.normalizeText(actuals[i]) === actualLabel) {
        count++;
      }
    }
    return count;
  }

  private extractArabicRoots(text: string): string[] {
    const arabicWordPattern = /[\u0600-\u06FF]{3,}/g;
    const words = text.match(arabicWordPattern) || [];

    return words.map((word) => {
      // Simplified root extraction: strip prefixes/suffixes and diacritics
      let root = word.replace(/[\u064B-\u065F\u0670]/g, '');

      // Strip common prefixes
      const prefixes = ['ال', 'و', 'ب', 'ل', 'ف', 'ك'];
      for (const prefix of prefixes) {
        if (root.startsWith(prefix) && root.length > prefix.length + 2) {
          root = root.substring(prefix.length);
          break;
        }
      }

      // Strip common suffixes
      const suffixes = ['ات', 'ون', 'ين', 'ة', 'ه', 'ها', 'هم'];
      for (const suffix of suffixes) {
        if (root.endsWith(suffix) && root.length > suffix.length + 2) {
          root = root.substring(0, root.length - suffix.length);
          break;
        }
      }

      return root;
    });
  }

  private generateComparisonRecommendation(
    models: Array<{ modelId: string; metrics: Record<string, number> }>,
    metricNames: string[],
  ): string {
    if (models.length < 2) return 'Not enough models to compare.';

    const scores = models.map((m) => {
      const values = metricNames
        .map((name) => m.metrics[name])
        .filter((v): v is number => v !== undefined);
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return { modelId: m.modelId, avg };
    });

    scores.sort((a, b) => b.avg - a.avg);
    const best = scores[0];
    const second = scores[1];
    const diff = Math.round((best.avg - second.avg) * 100);

    if (diff < 1) {
      return `Models ${best.modelId} and ${second.modelId} perform similarly. Consider cost and latency for final selection.`;
    }

    return `Model ${best.modelId} outperforms ${second.modelId} by ${diff}% on average across selected metrics. Recommended for production use.`;
  }

  private toEvaluationResult(record: Record<string, unknown>): EvaluationResult {
    let metrics: Record<string, number>;
    let confusionMatrix: ConfusionMatrix | null = null;
    let perClassMetrics: PerClassMetric[] = [];
    let sampleResults: SampleEvaluation[] = [];

    try {
      const raw = record.metrics;
      metrics = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, number>) || {};
    } catch {
      metrics = {};
    }

    try {
      const raw = record.confusionMatrix;
      if (raw) {
        confusionMatrix = typeof raw === 'string' ? JSON.parse(raw) : raw as ConfusionMatrix;
      }
    } catch {
      confusionMatrix = null;
    }

    try {
      const raw = record.perClassMetrics;
      perClassMetrics = typeof raw === 'string' ? JSON.parse(raw) : (raw as PerClassMetric[]) || [];
    } catch {
      perClassMetrics = [];
    }

    try {
      const raw = record.sampleResults;
      sampleResults = typeof raw === 'string' ? JSON.parse(raw) : (raw as SampleEvaluation[]) || [];
    } catch {
      sampleResults = [];
    }

    return {
      id: record.id as string,
      tenantId: record.tenantId as string,
      modelId: record.modelId as string,
      datasetId: record.datasetId as string,
      split: (record.split as string) || 'test',
      metrics,
      confusionMatrix,
      perClassMetrics,
      sampleResults,
      totalSamples: (record.totalSamples as number) || 0,
      evaluatedSamples: (record.evaluatedSamples as number) || 0,
      duration: (record.duration as number) || 0,
      createdAt: record.createdAt as Date,
    };
  }
}
