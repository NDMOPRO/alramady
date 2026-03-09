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

export interface ResearchTask {
  type: 'analyze_market' | 'compare_metrics' | 'benchmark_performance' | 'generate_insights' | 'trend_analysis';
  datasetId: string;
  data: Array<Record<string, number | string | null>>;
  benchmarks?: Array<{ metric: string; industryAvg: number; topPerformer: number; unit?: string }>;
  competitors?: Array<{ name: string; metrics: Record<string, number> }>;
  targetMetrics?: string[];
  timePeriod?: { start: string; end: string };
  context?: string;
}

export class ResearchAgent {
  private readonly agentType = 'research';

  async execute(task: ResearchTask): Promise<AgentResult> {
    switch (task.type) {
      case 'analyze_market':
        return this.analyzeMarket(task);
      case 'compare_metrics':
        return this.compareMetrics(task);
      case 'benchmark_performance':
        return this.benchmarkPerformance(task);
      case 'generate_insights':
        return this.generateInsights(task);
      case 'trend_analysis':
        return this.trendAnalysis(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private extractNumeric(data: Array<Record<string, number | string | null>>, col: string): number[] {
    return data
      .map((row) => row[col])
      .filter((v): v is number | string => v !== null && v !== undefined)
      .map((v) => (typeof v === 'number' ? v : Number(v)))
      .filter((v) => !isNaN(v));
  }

  private computePercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    const idx = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
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

  private computeSkewness(vals: number[], mean: number, stddev: number): number {
    if (stddev === 0 || vals.length < 3) return 0;
    const n = vals.length;
    const m3 = vals.reduce((s, v) => s + ((v - mean) / stddev) ** 3, 0) / n;
    return m3;
  }

  private async analyzeMarket(task: ResearchTask): Promise<AgentResult> {
    const columns = Object.keys(task.data[0] ?? {});
    const numericColumns = columns.filter((col) => {
      const vals = this.extractNumeric(task.data, col);
      return vals.length > task.data.length * 0.5;
    });

    const metricSummaries = numericColumns.slice(0, 10).map((col) => {
      const vals = this.extractNumeric(task.data, col);
      const sorted = [...vals].sort((a, b) => a - b);
      const sum = vals.reduce((s, v) => s + v, 0);
      const mean = sum / vals.length;
      const growth = vals.length > 1 ? ((vals[vals.length - 1] - vals[0]) / (Math.abs(vals[0]) || 1)) * 100 : 0;

      return {
        metric: col,
        count: vals.length,
        sum: sum.toFixed(2),
        mean: mean.toFixed(2),
        median: this.computePercentile(sorted, 50).toFixed(2),
        p25: this.computePercentile(sorted, 25).toFixed(2),
        p75: this.computePercentile(sorted, 75).toFixed(2),
        min: sorted[0]?.toFixed(2) ?? '0',
        max: sorted[sorted.length - 1]?.toFixed(2) ?? '0',
        growthPct: growth.toFixed(1),
      };
    });

    const competitorInfo = task.competitors
      ? `\nCompetitor data:\n${JSON.stringify(task.competitors, null, 2)}`
      : '';

    const prompt = `You are a market research analyst specializing in the Saudi Arabian market.
Analyze this dataset and provide strategic market insights.

Dataset "${task.datasetId}" with ${task.data.length} records.
${task.timePeriod ? `Time period: ${task.timePeriod.start} to ${task.timePeriod.end}` : ''}

Key metric summaries:
${JSON.stringify(metricSummaries, null, 2)}
${competitorInfo}

${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "market_insight", "description": "specific strategic insight with data backing", "confidence": 0.85 }
  ],
  "interpretation": "comprehensive market analysis in Arabic (formal MSA), covering market position, growth trends, and strategic recommendations aligned with Saudi Vision 2030"
}

Rules:
- Provide actionable, data-driven insights
- Reference Saudi market context (Vision 2030, NEOM, sectors)
- Include competitive positioning where relevant
- confidence must be between 0 and 1`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for analyze_market');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'research_analyze_market',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ metricsAnalyzed: metricSummaries.length, rowCount: task.data.length }),
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

  private async compareMetrics(task: ResearchTask): Promise<AgentResult> {
    const competitors = task.competitors ?? [];
    const targetMetrics = task.targetMetrics ?? [];

    if (competitors.length === 0) {
      throw new Error('compare_metrics requires competitors data');
    }

    const ownMetrics: Record<string, number> = {};
    const metricsToCompare = targetMetrics.length > 0 ? targetMetrics : Object.keys(competitors[0]?.metrics ?? {});

    for (const metric of metricsToCompare) {
      const vals = this.extractNumeric(task.data, metric);
      if (vals.length > 0) {
        ownMetrics[metric] = vals.reduce((s, v) => s + v, 0) / vals.length;
      }
    }

    const comparisons: Array<{
      metric: string;
      ownValue: number;
      competitorValues: Array<{ name: string; value: number; diffPct: number }>;
      rank: number;
      totalCompetitors: number;
    }> = [];

    for (const metric of metricsToCompare) {
      const ownValue = ownMetrics[metric];
      if (ownValue === undefined) continue;

      const competitorValues = competitors
        .filter((c) => c.metrics[metric] !== undefined)
        .map((c) => ({
          name: c.name,
          value: c.metrics[metric],
          diffPct: ownValue !== 0 ? ((ownValue - c.metrics[metric]) / Math.abs(ownValue)) * 100 : 0,
        }));

      const allValues = [ownValue, ...competitorValues.map((c) => c.value)].sort((a, b) => b - a);
      const rank = allValues.indexOf(ownValue) + 1;

      comparisons.push({
        metric,
        ownValue,
        competitorValues,
        rank,
        totalCompetitors: competitorValues.length + 1,
      });
    }

    const suggestions = comparisons.map((c) => {
      const bestCompetitor = c.competitorValues.sort((a, b) => b.value - a.value)[0];
      const position = c.rank <= Math.ceil(c.totalCompetitors / 3) ? 'leader' : c.rank <= Math.ceil(c.totalCompetitors * 2 / 3) ? 'mid-pack' : 'lagging';

      return {
        action: 'metric_comparison',
        description: `${c.metric}: Your value ${c.ownValue.toFixed(2)} | Rank ${c.rank}/${c.totalCompetitors} (${position})${bestCompetitor ? ` | Top competitor: ${bestCompetitor.name} at ${bestCompetitor.value.toFixed(2)} (${bestCompetitor.diffPct > 0 ? '+' : ''}${bestCompetitor.diffPct.toFixed(1)}% diff)` : ''}`,
        confidence: 0.85,
      };
    });

    const leadingMetrics = comparisons.filter((c) => c.rank === 1).length;
    const laggingMetrics = comparisons.filter((c) => c.rank === c.totalCompetitors).length;

    const interpretation = `Competitive comparison: ${comparisons.length} metrics compared against ${competitors.length} competitors. Leading in ${leadingMetrics} metrics, lagging in ${laggingMetrics}.`;

    await prisma.auditLog.create({
      data: {
        action: 'research_compare_metrics',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ metricsCompared: comparisons.length, competitors: competitors.length }),
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

  private async benchmarkPerformance(task: ResearchTask): Promise<AgentResult> {
    const benchmarks = task.benchmarks ?? [];

    if (benchmarks.length === 0) {
      throw new Error('benchmark_performance requires benchmarks data');
    }

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];
    let totalScore = 0;
    let scoredMetrics = 0;

    for (const benchmark of benchmarks) {
      const vals = this.extractNumeric(task.data, benchmark.metric);
      if (vals.length === 0) {
        suggestions.push({
          action: 'benchmark_missing_data',
          description: `Metric "${benchmark.metric}" not found in dataset. Cannot benchmark.`,
          confidence: 0.9,
        });
        continue;
      }

      const currentValue = vals.reduce((s, v) => s + v, 0) / vals.length;
      const industryGap = currentValue - benchmark.industryAvg;
      const industryGapPct = benchmark.industryAvg !== 0 ? (industryGap / Math.abs(benchmark.industryAvg)) * 100 : 0;
      const topGap = currentValue - benchmark.topPerformer;
      const topGapPct = benchmark.topPerformer !== 0 ? (topGap / Math.abs(benchmark.topPerformer)) * 100 : 0;

      const range = benchmark.topPerformer - benchmark.industryAvg;
      let score = 50;
      if (range !== 0) {
        score = Math.max(0, Math.min(100, ((currentValue - benchmark.industryAvg) / range) * 50 + 50));
      }

      totalScore += score;
      scoredMetrics++;

      const rating = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Average' : score >= 20 ? 'Below Average' : 'Poor';

      suggestions.push({
        action: 'benchmark_result',
        description: `${benchmark.metric}${benchmark.unit ? ` (${benchmark.unit})` : ''}: Current=${currentValue.toFixed(2)} | Industry Avg=${benchmark.industryAvg} (${industryGapPct > 0 ? '+' : ''}${industryGapPct.toFixed(1)}%) | Top=${benchmark.topPerformer} (${topGapPct > 0 ? '+' : ''}${topGapPct.toFixed(1)}%) | Score: ${score.toFixed(0)}/100 (${rating})`,
        confidence: 0.85,
      });
    }

    const overallScore = scoredMetrics > 0 ? totalScore / scoredMetrics : 0;
    const overallRating = overallScore >= 80 ? 'Excellent' : overallScore >= 60 ? 'Good' : overallScore >= 40 ? 'Average' : 'Below Average';

    suggestions.push({
      action: 'overall_benchmark_score',
      description: `Overall benchmark score: ${overallScore.toFixed(0)}/100 (${overallRating}). Scored on ${scoredMetrics}/${benchmarks.length} metrics.`,
      confidence: 0.9,
    });

    const interpretation = `Performance benchmarking: ${scoredMetrics} metrics evaluated. Overall score: ${overallScore.toFixed(0)}/100 (${overallRating}). ${suggestions.filter((s) => s.description.includes('Excellent') || s.description.includes('Good')).length} metrics performing well, ${suggestions.filter((s) => s.description.includes('Poor') || s.description.includes('Below')).length} need improvement.`;

    await prisma.auditLog.create({
      data: {
        action: 'research_benchmark_performance',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ metricsScored: scoredMetrics, overallScore }),
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

  private async generateInsights(task: ResearchTask): Promise<AgentResult> {
    const columns = Object.keys(task.data[0] ?? {});
    const numericColumns = columns.filter((col) => {
      const vals = this.extractNumeric(task.data, col);
      return vals.length > task.data.length * 0.3;
    });

    const stats = numericColumns.map((col) => {
      const vals = this.extractNumeric(task.data, col);
      const sorted = [...vals].sort((a, b) => a - b);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;

      return {
        column: col,
        mean: mean.toFixed(2),
        stddev: Math.sqrt(variance).toFixed(2),
        cv: mean !== 0 ? ((Math.sqrt(variance) / Math.abs(mean)) * 100).toFixed(1) : 'N/A',
        min: sorted[0]?.toFixed(2) ?? '0',
        max: sorted[sorted.length - 1]?.toFixed(2) ?? '0',
        skewness: this.computeSkewness(vals, mean, Math.sqrt(variance)).toFixed(3),
      };
    });

    const highVariability = stats.filter((s) => s.cv !== 'N/A' && parseFloat(s.cv) > 100);

    const correlations: Array<{ col1: string; col2: string; r: number }> = [];
    for (let i = 0; i < Math.min(numericColumns.length, 8); i++) {
      for (let j = i + 1; j < Math.min(numericColumns.length, 8); j++) {
        const x = this.extractNumeric(task.data, numericColumns[i]);
        const y = this.extractNumeric(task.data, numericColumns[j]);
        const minLen = Math.min(x.length, y.length);
        if (minLen > 3) {
          const r = this.pearsonCorrelation(x.slice(0, minLen), y.slice(0, minLen));
          if (Math.abs(r) > 0.6) {
            correlations.push({ col1: numericColumns[i], col2: numericColumns[j], r });
          }
        }
      }
    }

    const prompt = `You are a senior research analyst for a Saudi-market analytics platform.
Generate actionable business insights from this dataset analysis.

Dataset "${task.datasetId}" with ${task.data.length} records, ${columns.length} columns.
${task.timePeriod ? `Period: ${task.timePeriod.start} to ${task.timePeriod.end}` : ''}

Statistical summaries:
${JSON.stringify(stats, null, 2)}

High variability columns (CV > 100%):
${highVariability.length > 0 ? JSON.stringify(highVariability.map((h) => h.column)) : 'None'}

Strong correlations (|r| > 0.6):
${correlations.length > 0 ? JSON.stringify(correlations) : 'None found'}

Sample data (first 5 rows):
${JSON.stringify(task.data.slice(0, 5), null, 2)}

${task.context ? `Context: ${task.context}` : ''}

Respond in JSON:
{
  "suggestions": [
    { "action": "strategic_insight", "description": "data-backed business insight with specific numbers", "confidence": 0.85 },
    { "action": "risk_alert", "description": "potential risk identified from data patterns", "confidence": 0.8 },
    { "action": "opportunity", "description": "growth or improvement opportunity", "confidence": 0.75 }
  ],
  "interpretation": "executive research summary in Arabic (formal MSA)"
}

Generate 5-8 insights. Mix of strategic, risk, and opportunity insights.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI for generate_insights');
    }

    const parsed: {
      suggestions: Array<{ action: string; description: string; confidence: number }>;
      interpretation: string;
    } = JSON.parse(content);

    await prisma.auditLog.create({
      data: {
        action: 'research_generate_insights',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ insightsGenerated: parsed.suggestions.length, metricsAnalyzed: stats.length }),
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

  private async trendAnalysis(task: ResearchTask): Promise<AgentResult> {
    const targetMetrics = task.targetMetrics ?? [];
    const columns = targetMetrics.length > 0 ? targetMetrics : Object.keys(task.data[0] ?? {});

    const numericColumns = columns.filter((col) => {
      const vals = this.extractNumeric(task.data, col);
      return vals.length >= 3;
    });

    const trends: Array<{
      metric: string;
      direction: string;
      slope: number;
      rSquared: number;
      changePct: number;
      volatility: number;
      momentum: string;
    }> = [];

    for (const col of numericColumns.slice(0, 10)) {
      const vals = this.extractNumeric(task.data, col);
      const x = vals.map((_, i) => i);

      const n = vals.length;
      const sumX = x.reduce((s, v) => s + v, 0);
      const sumY = vals.reduce((s, v) => s + v, 0);
      const sumXY = x.reduce((s, v, i) => s + v * vals[i], 0);
      const sumX2 = x.reduce((s, v) => s + v * v, 0);
      const denom = n * sumX2 - sumX * sumX;
      const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
      const intercept = (sumY - slope * sumX) / n;

      const predicted = x.map((v) => slope * v + intercept);
      const meanY = sumY / n;
      const ssTotal = vals.reduce((s, v) => s + (v - meanY) ** 2, 0);
      const ssRes = vals.reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0);
      const rSquared = ssTotal > 0 ? 1 - ssRes / ssTotal : 0;

      const firstVal = vals[0];
      const lastVal = vals[vals.length - 1];
      const changePct = firstVal !== 0 ? ((lastVal - firstVal) / Math.abs(firstVal)) * 100 : 0;

      const variance = vals.reduce((s, v) => s + (v - meanY) ** 2, 0) / n;
      const volatility = meanY !== 0 ? (Math.sqrt(variance) / Math.abs(meanY)) * 100 : 0;

      const recentCount = Math.max(1, Math.floor(n * 0.2));
      const recentAvg = vals.slice(-recentCount).reduce((s, v) => s + v, 0) / recentCount;
      const momentum = recentAvg > meanY * 1.1 ? 'accelerating' : recentAvg < meanY * 0.9 ? 'decelerating' : 'stable';

      const direction = slope > 0.01 ? 'upward' : slope < -0.01 ? 'downward' : 'flat';

      trends.push({ metric: col, direction, slope, rSquared, changePct, volatility, momentum });
    }

    const suggestions = trends.map((t) => ({
      action: 'trend_identified',
      description: `${t.metric}: ${t.direction} trend (slope=${t.slope.toFixed(4)}, R\u00B2=${t.rSquared.toFixed(3)}). Total change: ${t.changePct > 0 ? '+' : ''}${t.changePct.toFixed(1)}%. Volatility: ${t.volatility.toFixed(1)}%. Momentum: ${t.momentum}.`,
      confidence: Math.min(0.95, Math.max(0.3, t.rSquared + 0.2)),
    }));

    const upwardTrends = trends.filter((t) => t.direction === 'upward').length;
    const downwardTrends = trends.filter((t) => t.direction === 'downward').length;
    suggestions.push({
      action: 'trend_summary',
      description: `Trend summary: ${upwardTrends} metrics trending up, ${downwardTrends} trending down, ${trends.length - upwardTrends - downwardTrends} flat. Highest volatility: ${trends.sort((a, b) => b.volatility - a.volatility)[0]?.metric ?? 'N/A'}.`,
      confidence: 0.85,
    });

    const interpretation = `Trend analysis on ${trends.length} metrics. ${upwardTrends} upward, ${downwardTrends} downward, ${trends.length - upwardTrends - downwardTrends} flat. Average R\u00B2: ${(trends.reduce((s, t) => s + t.rSquared, 0) / (trends.length || 1)).toFixed(3)}.`;

    await prisma.auditLog.create({
      data: {
        action: 'research_trend_analysis',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ metricsAnalyzed: trends.length, upward: upwardTrends, downward: downwardTrends }),
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
}
