import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const prisma = new PrismaClient();

export interface AgentResult {
  agentType: string;
  taskType: string;
  suggestions: Array<{ action: string; description: string; confidence: number }>;
  interpretation: string;
  requiresApproval: boolean;
  executedAt: Date;
}

export interface AnalystTask {
  type: 'detect_gaps' | 'find_anomalies' | 'root_cause' | 'recommendations';
  datasetId: string;
  data: Array<Record<string, number | string | null>>;
  targetColumn?: string;
  columns?: string[];
  context?: string;
  threshold?: number;
}

interface ZScoreResult {
  index: number;
  value: number;
  zScore: number;
  isAnomaly: boolean;
}

export class AnalystAgent {
  private readonly agentType = 'analyst';

  async execute(task: AnalystTask): Promise<AgentResult> {
    switch (task.type) {
      case 'detect_gaps':
        return this.detectGaps(task);
      case 'find_anomalies':
        return this.findAnomalies(task);
      case 'root_cause':
        return this.rootCause(task);
      case 'recommendations':
        return this.generateRecommendations(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private computeZScores(values: number[], threshold: number): ZScoreResult[] {
    const n = values.length;
    if (n === 0) return [];

    const mean = values.reduce((sum, v) => sum + v, 0) / n;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
      return values.map((value, index) => ({
        index,
        value,
        zScore: 0,
        isAnomaly: false,
      }));
    }

    return values.map((value, index) => {
      const zScore = (value - mean) / stdDev;
      return {
        index,
        value,
        zScore,
        isAnomaly: Math.abs(zScore) > threshold,
      };
    });
  }

  private async detectGaps(task: AnalystTask): Promise<AgentResult> {
    const gaps: Array<{ column: string; missingCount: number; missingPercentage: number; pattern: string }> = [];
    const columnsToCheck = task.columns ?? Object.keys(task.data[0] ?? {});

    for (const col of columnsToCheck) {
      const values = task.data.map((row) => row[col]);
      const missingCount = values.filter((v) => v === null || v === undefined || v === '').length;
      const missingPercentage = task.data.length > 0 ? (missingCount / task.data.length) * 100 : 0;

      let pattern = 'none';
      if (missingCount > 0) {
        const missingIndices = values
          .map((v, i) => (v === null || v === undefined || v === '' ? i : -1))
          .filter((i) => i >= 0);

        const isConsecutive = missingIndices.every(
          (idx, i) => i === 0 || idx === missingIndices[i - 1] + 1
        );
        const isAtEnd = missingIndices.length > 0 && missingIndices[missingIndices.length - 1] === task.data.length - 1;
        const isAtStart = missingIndices.length > 0 && missingIndices[0] === 0;

        if (isConsecutive && isAtEnd) pattern = 'trailing_block';
        else if (isConsecutive && isAtStart) pattern = 'leading_block';
        else if (isConsecutive) pattern = 'consecutive_block';
        else pattern = 'scattered';
      }

      if (missingCount > 0) {
        gaps.push({ column: col, missingCount, missingPercentage, pattern });
      }
    }

    const prompt = `You are a data quality analyst for a Saudi-market analytics platform.
Analyze these data gaps and provide actionable recommendations.

Dataset: "${task.datasetId}"
Total rows: ${task.data.length}

Gaps found:
${gaps.map((g) => `- Column "${g.column}": ${g.missingCount} missing (${g.missingPercentage.toFixed(1)}%), pattern: ${g.pattern}`).join('\n')}

${task.context ? `Business context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "fill_strategy", "description": "specific gap-filling recommendation", "confidence": 0.9 }
  ],
  "interpretation": "overall data quality assessment"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for detect_gaps task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'analyst_detect_gaps',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ gapsFound: gaps.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async findAnomalies(task: AnalystTask): Promise<AgentResult> {
    const targetCol = task.targetColumn;
    if (!targetCol) {
      throw new Error('targetColumn is required for find_anomalies task');
    }

    const numericValues: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < task.data.length; i++) {
      const raw = task.data[i][targetCol];
      const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
      if (!isNaN(num)) {
        numericValues.push(num);
        indices.push(i);
      }
    }

    const zScoreThreshold = task.threshold ?? 2.5;
    const zScoreResults = this.computeZScores(numericValues, zScoreThreshold);
    const anomalies = zScoreResults.filter((r) => r.isAnomaly);

    const anomalySummary = anomalies.map((a) => ({
      rowIndex: indices[a.index],
      value: a.value,
      zScore: parseFloat(a.zScore.toFixed(3)),
    }));

    const prompt = `You are a statistical analyst for a Saudi-market analytics platform.
Interpret these anomaly detection results using Z-score analysis.

Dataset: "${task.datasetId}", Column: "${targetCol}"
Total data points: ${numericValues.length}
Z-score threshold: ${zScoreThreshold}
Anomalies detected: ${anomalies.length}

Top anomalies (max 20):
${anomalySummary.slice(0, 20).map((a) => `- Row ${a.rowIndex}: value=${a.value}, z-score=${a.zScore}`).join('\n')}

${task.context ? `Business context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "investigate_anomaly", "description": "specific recommendation", "confidence": 0.85 }
  ],
  "interpretation": "statistical interpretation of the anomalies and their potential business impact"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for find_anomalies task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'analyst_find_anomalies',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ anomalyCount: anomalies.length, threshold: zScoreThreshold }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async rootCause(task: AnalystTask): Promise<AgentResult> {
    const columnsToAnalyze = task.columns ?? Object.keys(task.data[0] ?? {});
    const correlations: Array<{ col1: string; col2: string; correlation: number }> = [];

    const numericCols = columnsToAnalyze.filter((col) => {
      const sample = task.data.find((row) => row[col] !== null && row[col] !== undefined);
      return sample !== undefined && typeof sample[col] === 'number';
    });

    for (let i = 0; i < numericCols.length; i++) {
      for (let j = i + 1; j < numericCols.length; j++) {
        const col1 = numericCols[i];
        const col2 = numericCols[j];
        const pairs: Array<[number, number]> = [];

        for (const row of task.data) {
          const v1 = row[col1];
          const v2 = row[col2];
          if (typeof v1 === 'number' && typeof v2 === 'number') {
            pairs.push([v1, v2]);
          }
        }

        if (pairs.length >= 3) {
          const corr = this.pearsonCorrelation(pairs);
          if (!isNaN(corr)) {
            correlations.push({ col1, col2, correlation: parseFloat(corr.toFixed(4)) });
          }
        }
      }
    }

    correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

    const prompt = `You are a root cause analysis expert for a Saudi-market analytics platform.
Analyze column correlations and data patterns to identify potential root causes.

Dataset: "${task.datasetId}"
${task.targetColumn ? `Target variable: "${task.targetColumn}"` : ''}

Strongest correlations (top 15):
${correlations.slice(0, 15).map((c) => `- "${c.col1}" <-> "${c.col2}": r=${c.correlation}`).join('\n')}

${task.context ? `Investigation context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "investigate_cause", "description": "specific root cause hypothesis with supporting evidence", "confidence": 0.8 }
  ],
  "interpretation": "overall root cause analysis narrative"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for root_cause task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async generateRecommendations(task: AnalystTask): Promise<AgentResult> {
    const summary = this.computeDataSummary(task.data, task.columns);

    const prompt = `You are a strategic data analyst for a Saudi-market analytics platform.
Based on the following data summary, provide actionable business recommendations.

Dataset: "${task.datasetId}"

Data summary:
${JSON.stringify(summary, null, 2)}

${task.context ? `Business context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "recommendation", "description": "specific actionable recommendation with expected impact", "confidence": 0.85 }
  ],
  "interpretation": "executive summary of findings and recommended next steps"
}

Prioritize recommendations by potential business impact.
Consider Saudi market specifics and Vision 2030 alignment where relevant.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for recommendations task');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions: parsed.suggestions,
      interpretation: parsed.interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private pearsonCorrelation(pairs: Array<[number, number]>): number {
    const n = pairs.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (const [x, y] of pairs) {
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return NaN;
    return numerator / denominator;
  }

  private computeDataSummary(
    data: Array<Record<string, number | string | null>>,
    columns?: string[]
  ): Record<string, { type: string; min?: number; max?: number; mean?: number; nullCount: number; uniqueCount: number }> {
    const cols = columns ?? Object.keys(data[0] ?? {});
    const summary: Record<string, { type: string; min?: number; max?: number; mean?: number; nullCount: number; uniqueCount: number }> = {};

    for (const col of cols) {
      const values = data.map((row) => row[col]);
      const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
      const uniqueSet = new Set(nonNull.map(String));

      const numericValues = nonNull
        .map((v) => (typeof v === 'number' ? v : parseFloat(String(v))))
        .filter((v) => !isNaN(v));

      if (numericValues.length > nonNull.length * 0.5 && numericValues.length > 0) {
        const min = Math.min(...numericValues);
        const max = Math.max(...numericValues);
        const mean = numericValues.reduce((s, v) => s + v, 0) / numericValues.length;

        summary[col] = {
          type: 'numeric',
          min,
          max,
          mean: parseFloat(mean.toFixed(4)),
          nullCount: values.length - nonNull.length,
          uniqueCount: uniqueSet.size,
        };
      } else {
        summary[col] = {
          type: 'categorical',
          nullCount: values.length - nonNull.length,
          uniqueCount: uniqueSet.size,
        };
      }
    }

    return summary;
  }
}
