import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const prisma = new PrismaClient();

export interface AgentResult {
  agentType: string;
  taskType: string;
  suggestions: Array<{ action: string; description: string; confidence: number }>;
  interpretation: string;
  requiresApproval: boolean;
  executedAt: Date;
}

export interface DataIntelligenceTask {
  type: 'auto_analyze_dataset' | 'detect_anomalies' | 'suggest_enrichment' | 'profile_quality' | 'auto_classify';
  datasetId: string;
  data: Array<Record<string, number | string | null>>;
  columns?: string[];
  context?: string;
}

interface ColumnProfile {
  name: string;
  type: 'numeric' | 'string' | 'date' | 'boolean' | 'mixed';
  nullCount: number;
  uniqueCount: number;
  totalCount: number;
  numericStats?: {
    mean: number;
    median: number;
    stddev: number;
    min: number;
    max: number;
    q1: number;
    q3: number;
    iqr: number;
  };
  topValues?: Array<{ value: string; count: number }>;
}

export class DataIntelligenceAgent {
  private readonly agentType = 'data-intelligence';

  async execute(task: DataIntelligenceTask): Promise<AgentResult> {
    switch (task.type) {
      case 'auto_analyze_dataset':
        return this.autoAnalyzeDataset(task);
      case 'detect_anomalies':
        return this.detectAnomalies(task);
      case 'suggest_enrichment':
        return this.suggestEnrichment(task);
      case 'profile_quality':
        return this.profileQuality(task);
      case 'auto_classify':
        return this.autoClassify(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private inferColumnType(values: Array<number | string | null>): 'numeric' | 'string' | 'date' | 'boolean' | 'mixed' {
    const nonNull = values.filter((v): v is number | string => v !== null && v !== undefined);
    if (nonNull.length === 0) return 'mixed';

    const numericCount = nonNull.filter((v) => typeof v === 'number' || (!isNaN(Number(v)) && String(v).trim() !== '')).length;
    const booleanCount = nonNull.filter((v) => typeof v === 'boolean' || v === 'true' || v === 'false').length;
    const datePattern = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/;
    const dateCount = nonNull.filter((v) => typeof v === 'string' && datePattern.test(v.trim())).length;

    const ratio = nonNull.length;
    if (booleanCount / ratio > 0.9) return 'boolean';
    if (dateCount / ratio > 0.8) return 'date';
    if (numericCount / ratio > 0.8) return 'numeric';
    if (numericCount / ratio < 0.2) return 'string';
    return 'mixed';
  }

  private extractNumeric(values: Array<number | string | null>): number[] {
    return values
      .filter((v): v is number | string => v !== null && v !== undefined)
      .map((v) => (typeof v === 'number' ? v : Number(v)))
      .filter((v) => !isNaN(v));
  }

  private computeStats(nums: number[]): ColumnProfile['numericStats'] {
    if (nums.length === 0) return undefined;
    const sorted = [...nums].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((s, v) => s + v, 0) / n;
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const stddev = Math.sqrt(variance);
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const iqr = q3 - q1;
    return { mean, median, stddev, min: sorted[0], max: sorted[n - 1], q1, q3, iqr };
  }

  private profileColumn(name: string, values: Array<number | string | null>): ColumnProfile {
    const type = this.inferColumnType(values);
    const nullCount = values.filter((v) => v === null || v === undefined).length;
    const nonNullValues = values.filter((v) => v !== null && v !== undefined);
    const uniqueCount = new Set(nonNullValues.map(String)).size;

    const profile: ColumnProfile = {
      name,
      type,
      nullCount,
      uniqueCount,
      totalCount: values.length,
    };

    if (type === 'numeric') {
      profile.numericStats = this.computeStats(this.extractNumeric(values));
    }

    if (type === 'string' || type === 'mixed') {
      const freq = new Map<string, number>();
      nonNullValues.forEach((v) => {
        const key = String(v);
        freq.set(key, (freq.get(key) ?? 0) + 1);
      });
      profile.topValues = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({ value, count }));
    }

    return profile;
  }

  private getColumnNames(data: Array<Record<string, number | string | null>>): string[] {
    const keys = new Set<string>();
    data.forEach((row) => Object.keys(row).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }

  private getColumnValues(data: Array<Record<string, number | string | null>>, col: string): Array<number | string | null> {
    return data.map((row) => row[col] ?? null);
  }

  private async autoAnalyzeDataset(task: DataIntelligenceTask): Promise<AgentResult> {
    const columns = task.columns ?? this.getColumnNames(task.data);
    const profiles = columns.map((col) => this.profileColumn(col, this.getColumnValues(task.data, col)));

    const correlations: Array<{ col1: string; col2: string; correlation: number }> = [];
    const numericCols = profiles.filter((p) => p.type === 'numeric' && p.numericStats);
    for (let i = 0; i < numericCols.length; i++) {
      for (let j = i + 1; j < numericCols.length; j++) {
        const vals1 = this.extractNumeric(this.getColumnValues(task.data, numericCols[i].name));
        const vals2 = this.extractNumeric(this.getColumnValues(task.data, numericCols[j].name));
        const minLen = Math.min(vals1.length, vals2.length);
        if (minLen > 2) {
          const corr = this.pearsonCorrelation(vals1.slice(0, minLen), vals2.slice(0, minLen));
          if (Math.abs(corr) > 0.5) {
            correlations.push({ col1: numericCols[i].name, col2: numericCols[j].name, correlation: corr });
          }
        }
      }
    }

    const profileSummary = profiles.map((p) => ({
      name: p.name,
      type: p.type,
      nullPct: ((p.nullCount / p.totalCount) * 100).toFixed(1) + '%',
      unique: p.uniqueCount,
      stats: p.numericStats ? { mean: p.numericStats.mean.toFixed(2), stddev: p.numericStats.stddev.toFixed(2) } : null,
    }));

    const prompt = `You are a data intelligence expert for a Saudi-market analytics platform (Rasid).
Analyze this dataset profile and provide actionable insights.

Dataset: "${task.datasetId}" with ${task.data.length} rows and ${columns.length} columns.

Column Profiles:
${JSON.stringify(profileSummary, null, 2)}

Notable Correlations:
${correlations.length > 0 ? JSON.stringify(correlations, null, 2) : 'None detected above |0.5|'}

${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "insight", "description": "actionable insight about the data", "confidence": 0.9 }
  ],
  "interpretation": "comprehensive analysis summary in Arabic (formal MSA)"
}

Rules:
- Identify data quality issues
- Highlight interesting patterns and correlations
- Suggest potential KPIs derivable from the data
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for auto_analyze_dataset');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'data_intelligence_auto_analyze',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({
          rowCount: task.data.length,
          columnCount: columns.length,
          correlationsFound: correlations.length,
          suggestionsCount: parsed.suggestions.length,
        }),
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

  private async detectAnomalies(task: DataIntelligenceTask): Promise<AgentResult> {
    const columns = task.columns ?? this.getColumnNames(task.data);
    const anomalies: Array<{ column: string; rowIndex: number; value: number; method: string; score: number }> = [];

    for (const col of columns) {
      const values = this.getColumnValues(task.data, col);
      const nums = this.extractNumeric(values);
      if (nums.length < 5) continue;

      const stats = this.computeStats(nums);
      if (!stats) continue;

      // IQR method
      const lowerFence = stats.q1 - 1.5 * stats.iqr;
      const upperFence = stats.q3 + 1.5 * stats.iqr;

      values.forEach((v, idx) => {
        if (v === null || v === undefined) return;
        const num = typeof v === 'number' ? v : Number(v);
        if (isNaN(num)) return;

        if (num < lowerFence || num > upperFence) {
          anomalies.push({ column: col, rowIndex: idx, value: num, method: 'IQR', score: Math.abs(num - stats.median) / (stats.iqr || 1) });
        }
      });

      // Z-score method
      if (stats.stddev > 0) {
        values.forEach((v, idx) => {
          if (v === null || v === undefined) return;
          const num = typeof v === 'number' ? v : Number(v);
          if (isNaN(num)) return;
          const zScore = Math.abs((num - stats.mean) / stats.stddev);
          if (zScore > 3) {
            const alreadyFound = anomalies.some((a) => a.column === col && a.rowIndex === idx && a.method === 'IQR');
            if (!alreadyFound) {
              anomalies.push({ column: col, rowIndex: idx, value: num, method: 'Z-score', score: zScore });
            }
          }
        });
      }
    }

    const topAnomalies = anomalies.sort((a, b) => b.score - a.score).slice(0, 50);

    const suggestions = topAnomalies.slice(0, 20).map((a) => ({
      action: 'anomaly_detected',
      description: `Column "${a.column}", row ${a.rowIndex}: value ${a.value} detected via ${a.method} (score: ${a.score.toFixed(2)})`,
      confidence: Math.min(0.99, 0.5 + a.score * 0.1),
    }));

    const interpretation = `Anomaly detection completed on ${columns.length} columns across ${task.data.length} rows. Found ${anomalies.length} anomalies using IQR and Z-score methods. Top anomaly score: ${topAnomalies.length > 0 ? topAnomalies[0].score.toFixed(2) : 'N/A'}.`;

    await prisma.auditLog.create({
      data: {
        action: 'data_intelligence_detect_anomalies',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ totalAnomalies: anomalies.length, columnsAnalyzed: columns.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async suggestEnrichment(task: DataIntelligenceTask): Promise<AgentResult> {
    const columns = task.columns ?? this.getColumnNames(task.data);
    const profiles = columns.map((col) => this.profileColumn(col, this.getColumnValues(task.data, col)));
    const sampleRows = task.data.slice(0, 5);

    const prompt = `You are a data enrichment specialist for a Saudi-market analytics platform.
Analyze this dataset and suggest enrichment opportunities.

Dataset "${task.datasetId}":
Columns: ${JSON.stringify(profiles.map((p) => ({ name: p.name, type: p.type, uniqueCount: p.uniqueCount, nullPct: ((p.nullCount / p.totalCount) * 100).toFixed(1) })))}

Sample rows:
${JSON.stringify(sampleRows, null, 2)}

${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "enrich_column", "description": "specific enrichment recommendation", "confidence": 0.85 }
  ],
  "interpretation": "overall enrichment assessment in Arabic (formal MSA)"
}

Consider:
- Geographic enrichment (Saudi regions, cities from postal codes)
- Temporal enrichment (derive day of week, month, quarter, Hijri date)
- Categorical encoding and grouping
- External data join opportunities (Saudi census, economic indicators)
- Derived metrics and calculated fields
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for suggest_enrichment');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'data_intelligence_suggest_enrichment',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ suggestionsCount: parsed.suggestions.length }),
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

  private async profileQuality(task: DataIntelligenceTask): Promise<AgentResult> {
    const columns = task.columns ?? this.getColumnNames(task.data);
    const profiles = columns.map((col) => this.profileColumn(col, this.getColumnValues(task.data, col)));
    const totalCells = task.data.length * columns.length;
    const totalNulls = profiles.reduce((s, p) => s + p.nullCount, 0);
    const completeness = ((1 - totalNulls / totalCells) * 100).toFixed(1);

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    for (const p of profiles) {
      const nullPct = (p.nullCount / p.totalCount) * 100;
      if (nullPct > 20) {
        suggestions.push({
          action: 'quality_issue_missing',
          description: `Column "${p.name}" has ${nullPct.toFixed(1)}% missing values (${p.nullCount}/${p.totalCount})`,
          confidence: 0.95,
        });
      }
      if (p.uniqueCount === 1 && p.totalCount > 1) {
        suggestions.push({
          action: 'quality_issue_constant',
          description: `Column "${p.name}" has only 1 unique value across ${p.totalCount} rows - consider removing`,
          confidence: 0.9,
        });
      }
      if (p.uniqueCount === p.totalCount && p.type === 'string') {
        suggestions.push({
          action: 'quality_potential_id',
          description: `Column "${p.name}" has all unique values - potential identifier column`,
          confidence: 0.8,
        });
      }
      if (p.numericStats && p.numericStats.stddev === 0) {
        suggestions.push({
          action: 'quality_zero_variance',
          description: `Column "${p.name}" has zero variance (constant numeric value: ${p.numericStats.mean})`,
          confidence: 0.95,
        });
      }
    }

    const duplicateRows = this.countDuplicateRows(task.data);
    if (duplicateRows > 0) {
      suggestions.push({
        action: 'quality_issue_duplicates',
        description: `Dataset contains ${duplicateRows} duplicate rows out of ${task.data.length} total`,
        confidence: 0.95,
      });
    }

    const interpretation = `Data quality profile: ${completeness}% complete across ${columns.length} columns and ${task.data.length} rows. Found ${suggestions.length} quality issues. ${duplicateRows} duplicate rows detected.`;

    await prisma.auditLog.create({
      data: {
        action: 'data_intelligence_profile_quality',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ completeness, issuesFound: suggestions.length, duplicateRows }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: false,
      executedAt: new Date(),
    };
  }

  private async autoClassify(task: DataIntelligenceTask): Promise<AgentResult> {
    const columns = task.columns ?? this.getColumnNames(task.data);
    const profiles = columns.map((col) => this.profileColumn(col, this.getColumnValues(task.data, col)));
    const sampleRows = task.data.slice(0, 10);

    const prompt = `You are a data classification expert for a Saudi-market analytics platform.
Classify this dataset and its columns into semantic categories.

Dataset "${task.datasetId}":
Column Profiles:
${JSON.stringify(profiles.map((p) => ({
  name: p.name,
  type: p.type,
  uniqueCount: p.uniqueCount,
  sampleValues: p.topValues?.slice(0, 3).map((v) => v.value) ?? [],
  stats: p.numericStats ? { min: p.numericStats.min, max: p.numericStats.max, mean: p.numericStats.mean.toFixed(2) } : null,
})), null, 2)}

Sample rows:
${JSON.stringify(sampleRows, null, 2)}

${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "classify_column", "description": "column 'X' classified as 'category' - reason", "confidence": 0.9 },
    { "action": "classify_dataset", "description": "dataset classification and domain", "confidence": 0.85 }
  ],
  "interpretation": "overall classification summary in Arabic (formal MSA)"
}

Classification categories for columns:
- identifier, dimension, measure, temporal, geographic, demographic, financial, contact, status, description, metadata
Dataset categories:
- transactional, master-data, reference, event-log, survey, financial, HR, operational, IoT`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for auto_classify');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'data_intelligence_auto_classify',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ columnsClassified: columns.length, suggestionsCount: parsed.suggestions.length }),
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

  private countDuplicateRows(data: Array<Record<string, number | string | null>>): number {
    const seen = new Set<string>();
    let duplicates = 0;
    for (const row of data) {
      const key = JSON.stringify(Object.values(row));
      if (seen.has(key)) {
        duplicates++;
      } else {
        seen.add(key);
      }
    }
    return duplicates;
  }
}
