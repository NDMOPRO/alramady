import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import winston from 'winston';

// ─── Interfaces ──────────────────────────────────────────────────────

interface ConfidenceFactor {
  name: string;
  score: number;
  weight: number;
  reasoning: string;
}

interface ConfidenceResult {
  overallConfidence: number;
  factors: ConfidenceFactor[];
  recommendation: 'high_confidence' | 'review_recommended' | 'low_confidence';
}

// ─── Logger ──────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ai-service', module: 'confidence-score' },
  transports: [new winston.transports.Console()],
});

// ─── Clients ─────────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// ─── Service ─────────────────────────────────────────────────────────

export class ConfidenceScoreService {
  constructor(private prisma: PrismaClient) {}

  async scoreAnalysis(
    query: string,
    result: Record<string, unknown>,
    sourceData: { rowCount: number; columnCount: number }
  ): Promise<ConfidenceResult> {
    const startTime = Date.now();
    logger.info('Scoring analysis confidence', {
      queryLength: query.length,
      rowCount: sourceData.rowCount,
      columnCount: sourceData.columnCount,
    });

    const factors: ConfidenceFactor[] = [];

    // Factor 1: Data sufficiency
    factors.push(this.scoreDataSufficiency(sourceData));

    // Factor 2: Query clarity (uses GPT)
    const clarityFactor = await this.scoreQueryClarity(query);
    factors.push(clarityFactor);

    // Factor 3: Result consistency
    factors.push(this.scoreResultConsistency(result));

    // Factor 4: Source completeness
    factors.push(this.scoreSourceCompleteness(result, sourceData));

    // Factor 5: Statistical significance
    factors.push(this.scoreStatisticalSignificance(sourceData));

    // Weighted combination
    const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
    const weightedSum = factors.reduce((s, f) => s + f.score * f.weight, 0);
    const overallConfidence = totalWeight > 0
      ? parseFloat((weightedSum / totalWeight).toFixed(4))
      : 0;

    const recommendation = this.determineRecommendation(overallConfidence);

    const durationMs = Date.now() - startTime;
    logger.info('Confidence scoring complete', { overallConfidence, recommendation, durationMs });

    return { overallConfidence, factors, recommendation };
  }

  async scoreWithLLMVerification(
    query: string,
    result: string
  ): Promise<ConfidenceResult> {
    const startTime = Date.now();
    logger.info('Scoring with LLM verification', { queryLength: query.length });

    const systemPrompt = `You are a quality assurance evaluator for AI-generated analyses. Evaluate the following query and its result for confidence.

Score each factor from 0 to 1:
1. Factual Grounding: Is the response based on verifiable data or claims?
2. Specificity: Does the response contain specific numbers, dates, or details vs vague statements?
3. Internal Consistency: Are there contradictions within the response?
4. Completeness: Does the response fully address the query?
5. Hedging Appropriateness: Does the response appropriately express uncertainty where needed?

Return a JSON object:
{
  "factors": [
    { "name": "factual_grounding", "score": <0-1>, "weight": 0.3, "reasoning": "<explanation>" },
    { "name": "specificity", "score": <0-1>, "weight": 0.2, "reasoning": "<explanation>" },
    { "name": "internal_consistency", "score": <0-1>, "weight": 0.25, "reasoning": "<explanation>" },
    { "name": "completeness", "score": <0-1>, "weight": 0.15, "reasoning": "<explanation>" },
    { "name": "hedging_appropriateness", "score": <0-1>, "weight": 0.1, "reasoning": "<explanation>" }
  ]
}
Return ONLY valid JSON.`;

    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Query: ${query}\n\nResult:\n${result.substring(0, 4000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response for confidence verification');
    }

    const parsed = JSON.parse(content);
    const rawFactors = Array.isArray(parsed.factors) ? parsed.factors : [];

    const factors: ConfidenceFactor[] = rawFactors.map(
      (f: { name?: string; score?: number; weight?: number; reasoning?: string }) => ({
        name: String(f.name || 'unknown'),
        score: typeof f.score === 'number' ? Math.max(0, Math.min(1, f.score)) : 0.5,
        weight: typeof f.weight === 'number' ? Math.max(0, Math.min(1, f.weight)) : 0.2,
        reasoning: String(f.reasoning || ''),
      })
    );

    if (factors.length === 0) {
      factors.push({
        name: 'llm_evaluation',
        score: 0.5,
        weight: 1.0,
        reasoning: 'LLM did not return structured factor breakdown',
      });
    }

    const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
    const weightedSum = factors.reduce((s, f) => s + f.score * f.weight, 0);
    const overallConfidence = totalWeight > 0
      ? parseFloat((weightedSum / totalWeight).toFixed(4))
      : 0;

    const recommendation = this.determineRecommendation(overallConfidence);

    const durationMs = Date.now() - startTime;
    logger.info('LLM verification scoring complete', {
      overallConfidence,
      recommendation,
      factorCount: factors.length,
      durationMs,
    });

    return { overallConfidence, factors, recommendation };
  }

  private scoreDataSufficiency(sourceData: {
    rowCount: number;
    columnCount: number;
  }): ConfidenceFactor {
    const { rowCount, columnCount } = sourceData;

    let score: number;
    let reasoning: string;

    if (rowCount >= 100 && columnCount >= 3) {
      score = 0.95;
      reasoning = `Excellent data volume: ${rowCount} rows and ${columnCount} columns provide strong statistical basis.`;
    } else if (rowCount >= 30 && columnCount >= 2) {
      score = 0.8;
      reasoning = `Adequate data volume: ${rowCount} rows and ${columnCount} columns are sufficient for most analyses.`;
    } else if (rowCount >= 10) {
      score = 0.6;
      reasoning = `Limited data volume: ${rowCount} rows may not support complex statistical conclusions.`;
    } else if (rowCount >= 3) {
      score = 0.35;
      reasoning = `Very small dataset: only ${rowCount} rows. Results should be treated as preliminary.`;
    } else {
      score = 0.1;
      reasoning = `Insufficient data: ${rowCount} row(s) cannot support meaningful analysis.`;
    }

    return {
      name: 'data_sufficiency',
      score,
      weight: 0.3,
      reasoning,
    };
  }

  private async scoreQueryClarity(query: string): Promise<ConfidenceFactor> {
    try {
      const response = await openai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: 'system',
            content: `Rate the clarity and specificity of the following data analysis query on a scale of 0 to 1.
Return a JSON object: { "score": <0-1>, "reasoning": "<brief explanation>" }
Score guidelines:
- 0.9-1.0: Very specific, mentions exact columns/metrics/timeframes
- 0.7-0.89: Clear intent with some specifics
- 0.5-0.69: Understandable but vague
- 0.3-0.49: Ambiguous, could be interpreted multiple ways
- 0.0-0.29: Unclear or nonsensical
Return ONLY valid JSON.`,
          },
          { role: 'user', content: query },
        ],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return {
          name: 'query_clarity',
          score: 0.5,
          weight: 0.2,
          reasoning: 'Unable to assess query clarity (empty LLM response).',
        };
      }

      const parsed = JSON.parse(content);
      return {
        name: 'query_clarity',
        score: typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : 0.5,
        weight: 0.2,
        reasoning: String(parsed.reasoning || 'Query clarity assessed by LLM.'),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('Query clarity scoring failed, using fallback', { error: errorMessage });

      // Fallback heuristic
      const wordCount = query.trim().split(/\s+/).length;
      let score: number;
      if (wordCount >= 8 && wordCount <= 50) {
        score = 0.7;
      } else if (wordCount >= 3) {
        score = 0.5;
      } else {
        score = 0.3;
      }

      return {
        name: 'query_clarity',
        score,
        weight: 0.2,
        reasoning: `Fallback heuristic: query has ${wordCount} words. LLM evaluation unavailable: ${errorMessage}`,
      };
    }
  }

  private scoreResultConsistency(result: Record<string, unknown>): ConfidenceFactor {
    let score = 0.7;
    const issues: string[] = [];

    const resultStr = JSON.stringify(result);

    // Check for empty or minimal results
    if (Object.keys(result).length === 0) {
      score = 0.2;
      issues.push('Result object is empty');
    }

    // Check for null/undefined values in result
    const nullCount = Object.values(result).filter(
      (v) => v === null || v === undefined
    ).length;
    if (nullCount > 0) {
      const nullRatio = nullCount / Object.keys(result).length;
      score = Math.max(0.1, score - nullRatio * 0.5);
      issues.push(`${nullCount} null value(s) in result`);
    }

    // Check for numeric values in reasonable ranges
    const numericValues = Object.values(result).filter(
      (v) => typeof v === 'number'
    ) as number[];
    const hasInfinity = numericValues.some((v) => !isFinite(v));
    if (hasInfinity) {
      score = Math.max(0.1, score - 0.3);
      issues.push('Result contains Infinity or NaN numeric values');
    }

    // Check result contains meaningful content
    if (resultStr.length > 50) {
      score = Math.min(1, score + 0.1);
    }

    const reasoning =
      issues.length > 0
        ? `Result consistency issues: ${issues.join('; ')}`
        : 'Result structure appears consistent with no obvious issues.';

    return {
      name: 'result_consistency',
      score: parseFloat(score.toFixed(4)),
      weight: 0.2,
      reasoning,
    };
  }

  private scoreSourceCompleteness(
    result: Record<string, unknown>,
    sourceData: { rowCount: number; columnCount: number }
  ): ConfidenceFactor {
    // Estimate completeness based on available metadata
    const { rowCount, columnCount } = sourceData;

    // Check if result references data coverage
    const resultStr = JSON.stringify(result);
    const mentionsNulls =
      resultStr.includes('null') ||
      resultStr.includes('missing') ||
      resultStr.includes('N/A');

    let score: number;
    let reasoning: string;

    if (rowCount > 50 && columnCount > 3 && !mentionsNulls) {
      score = 0.9;
      reasoning = `Source data appears complete: ${rowCount} rows, ${columnCount} columns, no null indicators in result.`;
    } else if (rowCount > 20) {
      score = mentionsNulls ? 0.6 : 0.75;
      reasoning = mentionsNulls
        ? `Source data has ${rowCount} rows but result mentions missing values, suggesting gaps.`
        : `Source data has ${rowCount} rows and ${columnCount} columns, appearing reasonably complete.`;
    } else {
      score = 0.4;
      reasoning = `Limited source data (${rowCount} rows, ${columnCount} columns). Completeness cannot be fully assessed.`;
    }

    return {
      name: 'source_completeness',
      score: parseFloat(score.toFixed(4)),
      weight: 0.15,
      reasoning,
    };
  }

  private scoreStatisticalSignificance(sourceData: {
    rowCount: number;
    columnCount: number;
  }): ConfidenceFactor {
    const { rowCount } = sourceData;

    // Rule of thumb: n >= 30 for Central Limit Theorem
    let score: number;
    let reasoning: string;

    if (rowCount >= 1000) {
      score = 0.95;
      reasoning = `Large sample size (${rowCount}) ensures high statistical significance for most analyses.`;
    } else if (rowCount >= 100) {
      score = 0.85;
      reasoning = `Sample size of ${rowCount} is statistically robust for standard analyses.`;
    } else if (rowCount >= 30) {
      score = 0.7;
      reasoning = `Sample size of ${rowCount} meets minimum threshold for CLT-based inferences.`;
    } else if (rowCount >= 10) {
      score = 0.45;
      reasoning = `Sample size of ${rowCount} is below CLT minimum (30). Non-parametric methods may be more appropriate.`;
    } else {
      score = 0.2;
      reasoning = `Very small sample size (${rowCount}). Statistical significance cannot be established.`;
    }

    return {
      name: 'statistical_significance',
      score: parseFloat(score.toFixed(4)),
      weight: 0.15,
      reasoning,
    };
  }

  private determineRecommendation(
    confidence: number
  ): 'high_confidence' | 'review_recommended' | 'low_confidence' {
    if (confidence >= 0.75) return 'high_confidence';
    if (confidence >= 0.5) return 'review_recommended';
    return 'low_confidence';
  }
}
