import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface ColumnProfile {
  columnName: string;
  dataType: string;
  totalCount: number;
  nullCount: number;
  distinctCount: number;
  completeness: number;
  min: number | string | null;
  max: number | string | null;
  mean: number | null;
  median: number | null;
  standardDeviation: number | null;
  percentiles: { p25: number | null; p50: number | null; p75: number | null; p90: number | null; p99: number | null };
  topValues: { value: string; count: number; percentage: number }[];
  distribution: { bucket: string; count: number }[];
  patterns: { pattern: string; count: number }[];
}

interface QualityScore {
  overall: number;
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
  uniqueness: number;
  validity: number;
  dimensions: QualityDimension[];
}

interface QualityDimension {
  name: string;
  score: number;
  weight: number;
  issues: QualityIssue[];
}

interface QualityIssue {
  column: string;
  issueType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  affectedRows: number;
  suggestedFix: string;
}

interface AnomalyResult {
  column: string;
  method: 'zscore' | 'iqr' | 'isolation' | 'grubbs';
  anomalies: AnomalyRecord[];
  threshold: number;
  totalAnomalies: number;
  anomalyRate: number;
}

interface AnomalyRecord {
  rowIndex: number;
  value: number;
  score: number;
  isAnomaly: boolean;
  direction: 'high' | 'low' | 'neutral';
}

interface LineageNode {
  id: string;
  type: 'source' | 'transform' | 'target';
  name: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

interface LineageEdge {
  sourceId: string;
  targetId: string;
  transformationType: string;
  metadata: Record<string, any>;
}

interface DataLineage {
  nodes: LineageNode[];
  edges: LineageEdge[];
  rootSources: string[];
  finalTargets: string[];
}

interface QualityRule {
  id: string;
  name: string;
  column: string;
  ruleType: 'not_null' | 'unique' | 'range' | 'pattern' | 'reference' | 'custom';
  parameters: Record<string, any>;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface ProfilingOptions {
  sampleSize?: number;
  includeDistribution: boolean;
  includePatterns: boolean;
  includeTopValues: boolean;
  topValuesLimit: number;
  distributionBuckets: number;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class DataQualityService {
  private prisma: PrismaClient;
  private qualityRulesCache: Map<string, QualityRule[]> = new Map();
  private lineageGraphCache: Map<string, DataLineage> = new Map();
  private profileCache: Map<string, { profile: ColumnProfile[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 300000;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async profileDataset(
    datasetId: string,
    options: ProfilingOptions = {
      includeDistribution: true,
      includePatterns: true,
      includeTopValues: true,
      topValuesLimit: 20,
      distributionBuckets: 10,
    },
  ): Promise<ColumnProfile[]> {
    const cacheKey = `${datasetId}:${JSON.stringify(options)}`;
    const cached = this.profileCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.profile;
    }

    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
      include: { columns: true },
    });

    if (!dataset) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    const sampleClause = options.sampleSize
      ? `TABLESAMPLE SYSTEM (${Math.min(100, (options.sampleSize / 1000) * 100)})`
      : '';

    const profiles: ColumnProfile[] = [];

    for (const column of dataset.columns) {
      const profile = await this.profileColumn(
        dataset.tableName || '',
        column.name,
        column.dataType || 'text',
        sampleClause,
        options,
      );
      profiles.push(profile);
    }

    this.profileCache.set(cacheKey, { profile: profiles, timestamp: Date.now() });

    await this.prisma.dataProfile.upsert({
      where: { datasetId },
      update: {
        profiles: JSON.parse(JSON.stringify(profiles)),
        profiledAt: new Date(),
      },
      create: {
        id: crypto.randomUUID(),
        datasetId,
        profiles: JSON.parse(JSON.stringify(profiles)),
        profiledAt: new Date(),
      },
    });

    return profiles;
  }

  private async profileColumn(
    tableName: string,
    columnName: string,
    dataType: string,
    sampleClause: string,
    options: ProfilingOptions,
  ): Promise<ColumnProfile> {
    const basicStats: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) as total_count,
        COUNT(*) - COUNT("${columnName}") as null_count,
        COUNT(DISTINCT "${columnName}") as distinct_count,
        MIN("${columnName}"::text) as min_val,
        MAX("${columnName}"::text) as max_val
      FROM "${tableName}" ${sampleClause}
    `);

    const stats = basicStats[0];
    const totalCount = Number(stats.total_count);
    const nullCount = Number(stats.null_count);
    const distinctCount = Number(stats.distinct_count);
    const completeness = totalCount > 0 ? (totalCount - nullCount) / totalCount : 0;

    let mean: number | null = null;
    let median: number | null = null;
    let stdDev: number | null = null;
    let percentiles = { p25: null as number | null, p50: null as number | null, p75: null as number | null, p90: null as number | null, p99: null as number | null };

    const isNumeric = ['integer', 'float', 'double', 'decimal', 'numeric', 'bigint', 'real'].some(
      t => dataType.toLowerCase().includes(t),
    );

    if (isNumeric) {
      const numericStats: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
        SELECT
          AVG("${columnName}"::numeric) as mean_val,
          STDDEV("${columnName}"::numeric) as stddev_val,
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY "${columnName}"::numeric) as p25,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "${columnName}"::numeric) as p50,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "${columnName}"::numeric) as p75,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY "${columnName}"::numeric) as p90,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "${columnName}"::numeric) as p99
        FROM "${tableName}" ${sampleClause}
        WHERE "${columnName}" IS NOT NULL
      `);

      if (numericStats[0]) {
        mean = Number(numericStats[0].mean_val);
        stdDev = Number(numericStats[0].stddev_val);
        median = Number(numericStats[0].p50);
        percentiles = {
          p25: Number(numericStats[0].p25),
          p50: Number(numericStats[0].p50),
          p75: Number(numericStats[0].p75),
          p90: Number(numericStats[0].p90),
          p99: Number(numericStats[0].p99),
        };
      }
    }

    let topValues: { value: string; count: number; percentage: number }[] = [];
    if (options.includeTopValues) {
      const topResults: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
        SELECT "${columnName}"::text as val, COUNT(*) as cnt
        FROM "${tableName}" ${sampleClause}
        WHERE "${columnName}" IS NOT NULL
        GROUP BY "${columnName}"
        ORDER BY cnt DESC
        LIMIT ${options.topValuesLimit}
      `);

      topValues = topResults.map(row => ({
        value: String(row.val),
        count: Number(row.cnt),
        percentage: totalCount > 0 ? (Number(row.cnt) / totalCount) * 100 : 0,
      }));
    }

    let distribution: { bucket: string; count: number }[] = [];
    if (options.includeDistribution && isNumeric) {
      distribution = await this.computeNumericDistribution(
        tableName,
        columnName,
        sampleClause,
        options.distributionBuckets,
      );
    } else if (options.includeDistribution) {
      distribution = topValues.slice(0, options.distributionBuckets).map(tv => ({
        bucket: tv.value,
        count: tv.count,
      }));
    }

    let patterns: { pattern: string; count: number }[] = [];
    if (options.includePatterns && !isNumeric) {
      patterns = await this.detectPatterns(tableName, columnName, sampleClause);
    }

    return {
      columnName,
      dataType,
      totalCount,
      nullCount,
      distinctCount,
      completeness: Math.round(completeness * 10000) / 10000,
      min: stats.min_val,
      max: stats.max_val,
      mean: mean !== null ? Math.round(mean * 10000) / 10000 : null,
      median: median !== null ? Math.round(median * 10000) / 10000 : null,
      standardDeviation: stdDev !== null ? Math.round(stdDev * 10000) / 10000 : null,
      percentiles,
      topValues,
      distribution,
      patterns,
    };
  }

  private async computeNumericDistribution(
    tableName: string,
    columnName: string,
    sampleClause: string,
    bucketCount: number,
  ): Promise<{ bucket: string; count: number }[]> {
    const rangeResult: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
      SELECT
        MIN("${columnName}"::numeric) as min_val,
        MAX("${columnName}"::numeric) as max_val
      FROM "${tableName}" ${sampleClause}
      WHERE "${columnName}" IS NOT NULL
    `);

    const minVal = Number(rangeResult[0].min_val);
    const maxVal = Number(rangeResult[0].max_val);

    if (minVal === maxVal) {
      return [{ bucket: String(minVal), count: 1 }];
    }

    const bucketWidth = (maxVal - minVal) / bucketCount;
    const caseClauses: string[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const lower = minVal + i * bucketWidth;
      const upper = minVal + (i + 1) * bucketWidth;
      const label = `${lower.toFixed(2)}-${upper.toFixed(2)}`;
      if (i < bucketCount - 1) {
        caseClauses.push(
          `WHEN "${columnName}"::numeric >= ${lower} AND "${columnName}"::numeric < ${upper} THEN '${label}'`,
        );
      } else {
        caseClauses.push(
          `WHEN "${columnName}"::numeric >= ${lower} AND "${columnName}"::numeric <= ${upper} THEN '${label}'`,
        );
      }
    }

    const distResult: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
      SELECT
        CASE ${caseClauses.join(' ')} END as bucket,
        COUNT(*) as cnt
      FROM "${tableName}" ${sampleClause}
      WHERE "${columnName}" IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket
    `);

    return distResult
      .filter(r => r.bucket !== null)
      .map(r => ({
        bucket: String(r.bucket),
        count: Number(r.cnt),
      }));
  }

  private async detectPatterns(
    tableName: string,
    columnName: string,
    sampleClause: string,
  ): Promise<{ pattern: string; count: number }[]> {
    const queryRows: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
      SELECT "${columnName}"::text as val
      FROM "${tableName}" ${sampleClause}
      WHERE "${columnName}" IS NOT NULL
      LIMIT 5000
    `);

    const patternCounts = new Map<string, number>();

    for (const row of queryRows) {
      const val = String(row.val);
      let pattern = '';
      for (let i = 0; i < val.length && i < 50; i++) {
        const char = val[i];
        if (/[A-Z]/.test(char)) pattern += 'A';
        else if (/[a-z]/.test(char)) pattern += 'a';
        else if (/[0-9]/.test(char)) pattern += '9';
        else if (/[\u0600-\u06FF]/.test(char)) pattern += '\u0639';
        else pattern += char;
      }

      pattern = pattern
        .replace(/A{2,}/g, 'A+')
        .replace(/a{2,}/g, 'a+')
        .replace(/9{2,}/g, '9+')
        .replace(/\u0639{2,}/g, '\u0639+');

      patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    }

    return Array.from(patternCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pattern, count]) => ({ pattern, count }));
  }

  async computeQualityScore(
    datasetId: string,
    rules?: QualityRule[],
  ): Promise<QualityScore> {
    const profiles = await this.profileDataset(datasetId, {
      includeDistribution: false,
      includePatterns: true,
      includeTopValues: true,
      topValuesLimit: 10,
      distributionBuckets: 10,
    });

    const appliedRules = rules || this.qualityRulesCache.get(datasetId) || [];
    if (rules) {
      this.qualityRulesCache.set(datasetId, rules);
    }

    const completenessResult = this.assessCompleteness(profiles);
    const uniquenessResult = this.assessUniqueness(profiles);
    const validityResult = await this.assessValidity(datasetId, profiles, appliedRules);
    const consistencyResult = await this.assessConsistency(datasetId, profiles);
    const timelinessResult = await this.assessTimeliness(datasetId);
    const accuracyResult = this.assessAccuracy(profiles, appliedRules);

    const dimensions: QualityDimension[] = [
      { name: 'Completeness', score: completenessResult.score, weight: 0.20, issues: completenessResult.issues },
      { name: 'Uniqueness', score: uniquenessResult.score, weight: 0.15, issues: uniquenessResult.issues },
      { name: 'Validity', score: validityResult.score, weight: 0.20, issues: validityResult.issues },
      { name: 'Consistency', score: consistencyResult.score, weight: 0.15, issues: consistencyResult.issues },
      { name: 'Timeliness', score: timelinessResult.score, weight: 0.15, issues: timelinessResult.issues },
      { name: 'Accuracy', score: accuracyResult.score, weight: 0.15, issues: accuracyResult.issues },
    ];

    const overall = dimensions.reduce((sum, dim) => sum + dim.score * dim.weight, 0);

    const qualityScore: QualityScore = {
      overall: Math.round(overall * 100) / 100,
      completeness: completenessResult.score,
      accuracy: accuracyResult.score,
      consistency: consistencyResult.score,
      timeliness: timelinessResult.score,
      uniqueness: uniquenessResult.score,
      validity: validityResult.score,
      dimensions,
    };

    await this.prisma.qualityScore.create({
      data: {
        id: crypto.randomUUID(),
        datasetId,
        overall: qualityScore.overall,
        completeness: qualityScore.completeness,
        accuracy: qualityScore.accuracy,
        consistency: qualityScore.consistency,
        timeliness: qualityScore.timeliness,
        uniqueness: qualityScore.uniqueness,
        validity: qualityScore.validity,
        dimensions: JSON.parse(JSON.stringify(dimensions)),
        scoredAt: new Date(),
      },
    });

    return qualityScore;
  }

  private assessCompleteness(profiles: ColumnProfile[]): { score: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    let totalCompleteness = 0;

    for (const profile of profiles) {
      totalCompleteness += profile.completeness;
      const nullPercentage = profile.totalCount > 0
        ? (profile.nullCount / profile.totalCount) * 100
        : 0;

      if (nullPercentage > 50) {
        issues.push({
          column: profile.columnName,
          issueType: 'high_nulls',
          severity: 'critical',
          description: `Column has ${nullPercentage.toFixed(1)}% null values`,
          affectedRows: profile.nullCount,
          suggestedFix: 'Consider filling nulls with default values or removing the column',
        });
      } else if (nullPercentage > 20) {
        issues.push({
          column: profile.columnName,
          issueType: 'moderate_nulls',
          severity: 'high',
          description: `Column has ${nullPercentage.toFixed(1)}% null values`,
          affectedRows: profile.nullCount,
          suggestedFix: 'Investigate source of null values and consider imputation',
        });
      } else if (nullPercentage > 5) {
        issues.push({
          column: profile.columnName,
          issueType: 'low_nulls',
          severity: 'medium',
          description: `Column has ${nullPercentage.toFixed(1)}% null values`,
          affectedRows: profile.nullCount,
          suggestedFix: 'Review if nulls are intentional or require data collection improvement',
        });
      }
    }

    const score = profiles.length > 0
      ? (totalCompleteness / profiles.length) * 100
      : 100;

    return { score: Math.round(score * 100) / 100, issues };
  }

  private assessUniqueness(profiles: ColumnProfile[]): { score: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    let uniquenessScores: number[] = [];

    for (const profile of profiles) {
      const nonNullCount = profile.totalCount - profile.nullCount;
      if (nonNullCount === 0) continue;

      const uniquenessRatio = profile.distinctCount / nonNullCount;
      uniquenessScores.push(uniquenessRatio);

      if (uniquenessRatio < 0.01 && nonNullCount > 100) {
        issues.push({
          column: profile.columnName,
          issueType: 'low_cardinality',
          severity: 'low',
          description: `Column has very low cardinality (${profile.distinctCount} unique values out of ${nonNullCount})`,
          affectedRows: nonNullCount,
          suggestedFix: 'Consider converting to enum or categorical type',
        });
      }

      if (uniquenessRatio > 0.99 && uniquenessRatio < 1.0 && nonNullCount > 100) {
        const duplicateCount = nonNullCount - profile.distinctCount;
        issues.push({
          column: profile.columnName,
          issueType: 'near_unique_duplicates',
          severity: 'medium',
          description: `Column is near-unique but has ${duplicateCount} duplicate values`,
          affectedRows: duplicateCount,
          suggestedFix: 'Check if this column should be unique and investigate duplicates',
        });
      }
    }

    const avgUniqueness = uniquenessScores.length > 0
      ? uniquenessScores.reduce((a, b) => a + b, 0) / uniquenessScores.length
      : 1;

    return { score: Math.round(avgUniqueness * 100 * 100) / 100, issues };
  }

  private async assessValidity(
    datasetId: string,
    profiles: ColumnProfile[],
    rules: QualityRule[],
  ): Promise<{ score: number; issues: QualityIssue[] }> {
    const issues: QualityIssue[] = [];
    let totalChecks = 0;
    let passedChecks = 0;

    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });
    if (!dataset) {
      return { score: 100, issues: [] };
    }

    for (const rule of rules) {
      totalChecks++;
      const profile = profiles.find(p => p.columnName === rule.column);
      if (!profile) continue;

      switch (rule.ruleType) {
        case 'not_null': {
          if (profile.nullCount === 0) {
            passedChecks++;
          } else {
            issues.push({
              column: rule.column,
              issueType: 'null_violation',
              severity: rule.severity,
              description: `Not-null rule violated: ${profile.nullCount} null values found`,
              affectedRows: profile.nullCount,
              suggestedFix: 'Ensure all records have values for this required field',
            });
          }
          break;
        }
        case 'unique': {
          const nonNullCount = profile.totalCount - profile.nullCount;
          if (profile.distinctCount === nonNullCount) {
            passedChecks++;
          } else {
            const duplicates = nonNullCount - profile.distinctCount;
            issues.push({
              column: rule.column,
              issueType: 'uniqueness_violation',
              severity: rule.severity,
              description: `Uniqueness rule violated: ${duplicates} duplicate values`,
              affectedRows: duplicates,
              suggestedFix: 'Remove or merge duplicate records',
            });
          }
          break;
        }
        case 'range': {
          const minBound = rule.parameters.min as number;
          const maxBound = rule.parameters.max as number;
          if (profile.min !== null && profile.max !== null) {
            const minVal = Number(profile.min);
            const maxVal = Number(profile.max);
            if (minVal >= minBound && maxVal <= maxBound) {
              passedChecks++;
            } else {
              const violationResult: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
                SELECT COUNT(*) as cnt
                FROM "${dataset.tableName}"
                WHERE "${rule.column}"::numeric < ${minBound}
                  OR "${rule.column}"::numeric > ${maxBound}
              `);
              const violationCount = Number(violationResult[0]?.cnt || 0);
              issues.push({
                column: rule.column,
                issueType: 'range_violation',
                severity: rule.severity,
                description: `Values outside range [${minBound}, ${maxBound}]: ${violationCount} violations`,
                affectedRows: violationCount,
                suggestedFix: `Clamp values to range [${minBound}, ${maxBound}] or investigate outliers`,
              });
            }
          }
          break;
        }
        case 'pattern': {
          const patternRegex = rule.parameters.regex as string;
          const patternResult: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
            SELECT COUNT(*) as cnt
            FROM "${dataset.tableName}"
            WHERE "${rule.column}" IS NOT NULL
              AND "${rule.column}"::text !~ '${patternRegex}'
          `);
          const mismatchCount = Number(patternResult[0]?.cnt || 0);
          if (mismatchCount === 0) {
            passedChecks++;
          } else {
            issues.push({
              column: rule.column,
              issueType: 'pattern_violation',
              severity: rule.severity,
              description: `${mismatchCount} values don't match pattern: ${patternRegex}`,
              affectedRows: mismatchCount,
              suggestedFix: 'Fix values that do not match the expected pattern',
            });
          }
          break;
        }
      }
    }

    const score = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 100;
    return { score: Math.round(score * 100) / 100, issues };
  }

  private async assessConsistency(
    datasetId: string,
    profiles: ColumnProfile[],
  ): Promise<{ score: number; issues: QualityIssue[] }> {
    const issues: QualityIssue[] = [];
    let consistencyScore = 100;

    for (const profile of profiles) {
      if (profile.patterns.length > 0) {
        const dominantPattern = profile.patterns[0];
        const totalPatternCount = profile.patterns.reduce((sum, p) => sum + p.count, 0);
        const dominantRatio = totalPatternCount > 0
          ? dominantPattern.count / totalPatternCount
          : 1;

        if (dominantRatio < 0.8 && profile.patterns.length > 3) {
          const inconsistentCount = totalPatternCount - dominantPattern.count;
          consistencyScore -= 5;
          issues.push({
            column: profile.columnName,
            issueType: 'format_inconsistency',
            severity: 'medium',
            description: `Multiple data formats detected: dominant pattern covers only ${(dominantRatio * 100).toFixed(1)}%`,
            affectedRows: inconsistentCount,
            suggestedFix: 'Standardize data format to the dominant pattern',
          });
        }
      }

      if (profile.standardDeviation !== null && profile.mean !== null && profile.mean !== 0) {
        const cv = Math.abs(profile.standardDeviation / profile.mean);
        if (cv > 3) {
          consistencyScore -= 3;
          issues.push({
            column: profile.columnName,
            issueType: 'high_variability',
            severity: 'low',
            description: `High coefficient of variation (${cv.toFixed(2)}): data is highly variable`,
            affectedRows: profile.totalCount,
            suggestedFix: 'Investigate if high variability is expected or indicates data quality issues',
          });
        }
      }
    }

    return { score: Math.max(0, Math.round(consistencyScore * 100) / 100), issues };
  }

  private async assessTimeliness(datasetId: string): Promise<{ score: number; issues: QualityIssue[] }> {
    const issues: QualityIssue[] = [];

    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
      select: { updatedAt: true, metadata: true },
    });

    if (!dataset) {
      return { score: 100, issues: [] };
    }

    const lastUpdated = dataset.updatedAt;
    const ageHours = (Date.now() - lastUpdated.getTime()) / 3600000;
    const metadata = dataset.metadata as Record<string, any> | null;
    const expectedFrequencyHours = (metadata?.refreshFrequencyHours as number) || 24;

    let score = 100;
    if (ageHours > expectedFrequencyHours * 3) {
      score = 30;
      issues.push({
        column: '_dataset',
        issueType: 'stale_data',
        severity: 'critical',
        description: `Data is ${Math.round(ageHours)} hours old (expected refresh every ${expectedFrequencyHours} hours)`,
        affectedRows: 0,
        suggestedFix: 'Trigger an immediate data refresh or check the import pipeline',
      });
    } else if (ageHours > expectedFrequencyHours * 2) {
      score = 60;
      issues.push({
        column: '_dataset',
        issueType: 'aging_data',
        severity: 'high',
        description: `Data is ${Math.round(ageHours)} hours old, exceeding 2x expected frequency`,
        affectedRows: 0,
        suggestedFix: 'Schedule a data refresh soon',
      });
    } else if (ageHours > expectedFrequencyHours) {
      score = 80;
      issues.push({
        column: '_dataset',
        issueType: 'overdue_refresh',
        severity: 'medium',
        description: `Data refresh is overdue by ${Math.round(ageHours - expectedFrequencyHours)} hours`,
        affectedRows: 0,
        suggestedFix: 'Check if scheduled refresh is running properly',
      });
    }

    return { score, issues };
  }

  private assessAccuracy(profiles: ColumnProfile[], rules: QualityRule[]): { score: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    let accuracyDeductions = 0;

    for (const profile of profiles) {
      if (profile.mean !== null && profile.standardDeviation !== null) {
        const values = profile.topValues.map(tv => Number(tv.value)).filter(v => !isNaN(v));
        for (const tv of profile.topValues) {
          const numVal = Number(tv.value);
          if (!isNaN(numVal) && profile.standardDeviation > 0) {
            const zScore = Math.abs((numVal - profile.mean) / profile.standardDeviation);
            if (zScore > 4 && tv.count > 1) {
              accuracyDeductions += 2;
              issues.push({
                column: profile.columnName,
                issueType: 'potential_inaccuracy',
                severity: 'medium',
                description: `Value ${tv.value} appears ${tv.count} times with z-score ${zScore.toFixed(2)}`,
                affectedRows: tv.count,
                suggestedFix: 'Verify extreme values against source data',
              });
            }
          }
        }
      }

      if (profile.topValues.length > 0) {
        const suspiciousDefaults = ['0', '-1', '9999', '99999', 'N/A', 'null', 'undefined', 'TBD', 'unknown'];
        for (const tv of profile.topValues) {
          if (suspiciousDefaults.includes(tv.value.toLowerCase()) && tv.percentage > 10) {
            accuracyDeductions += 3;
            issues.push({
              column: profile.columnName,
              issueType: 'suspicious_default',
              severity: 'high',
              description: `Suspicious default value '${tv.value}' found in ${tv.percentage.toFixed(1)}% of rows`,
              affectedRows: tv.count,
              suggestedFix: 'Replace default values with actual data or proper null handling',
            });
          }
        }
      }
    }

    const score = Math.max(0, 100 - accuracyDeductions);
    return { score: Math.round(score * 100) / 100, issues };
  }

  async detectAnomalies(
    datasetId: string,
    columnName: string,
    method: 'zscore' | 'iqr' = 'zscore',
    threshold: number = 3.0,
  ): Promise<AnomalyResult> {
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    const rawData: Record<string, any>[] = await this.prisma.$queryRawUnsafe(`
      SELECT ROW_NUMBER() OVER () as row_idx, "${columnName}"::numeric as val
      FROM "${dataset.tableName}"
      WHERE "${columnName}" IS NOT NULL
      ORDER BY ROW_NUMBER() OVER ()
    `);

    const values = rawData.map(r => Number(r.val));
    const rowIndices = rawData.map(r => Number(r.row_idx));

    let anomalies: AnomalyRecord[];

    if (method === 'zscore') {
      anomalies = this.detectZScoreAnomalies(values, rowIndices, threshold);
    } else {
      anomalies = this.detectIQRAnomalies(values, rowIndices, threshold);
    }

    const totalAnomalies = anomalies.filter(a => a.isAnomaly).length;
    const anomalyRate = values.length > 0 ? totalAnomalies / values.length : 0;

    const result: AnomalyResult = {
      column: columnName,
      method,
      anomalies: anomalies.filter(a => a.isAnomaly),
      threshold,
      totalAnomalies,
      anomalyRate: Math.round(anomalyRate * 10000) / 10000,
    };

    await this.prisma.anomalyDetection.create({
      data: {
        id: crypto.randomUUID(),
        datasetId,
        column: columnName,
        method,
        threshold,
        totalAnomalies,
        anomalyRate: result.anomalyRate,
        results: JSON.parse(JSON.stringify(result)),
        detectedAt: new Date(),
      },
    });

    return result;
  }

  private detectZScoreAnomalies(
    values: number[],
    rowIndices: number[],
    threshold: number,
  ): AnomalyRecord[] {
    const n = values.length;
    if (n === 0) return [];

    const mean = values.reduce((sum, v) => sum + v, 0) / n;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
      return values.map((value, i) => ({
        rowIndex: rowIndices[i],
        value,
        score: 0,
        isAnomaly: false,
        direction: 'neutral' as const,
      }));
    }

    return values.map((value, i) => {
      const zScore = (value - mean) / stdDev;
      const absZScore = Math.abs(zScore);
      const isAnomaly = absZScore > threshold;
      const direction: 'high' | 'low' | 'neutral' = zScore > threshold
        ? 'high'
        : zScore < -threshold
          ? 'low'
          : 'neutral';

      return {
        rowIndex: rowIndices[i],
        value,
        score: Math.round(absZScore * 1000) / 1000,
        isAnomaly,
        direction,
      };
    });
  }

  private detectIQRAnomalies(
    values: number[],
    rowIndices: number[],
    multiplier: number,
  ): AnomalyRecord[] {
    const n = values.length;
    if (n === 0) return [];

    const sorted = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(n * 0.25);
    const q3Index = Math.floor(n * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - multiplier * iqr;
    const upperBound = q3 + multiplier * iqr;

    return values.map((value, i) => {
      const isAnomaly = value < lowerBound || value > upperBound;
      let score = 0;
      let direction: 'high' | 'low' | 'neutral' = 'neutral';

      if (value > upperBound) {
        score = iqr > 0 ? (value - upperBound) / iqr : 0;
        direction = 'high';
      } else if (value < lowerBound) {
        score = iqr > 0 ? (lowerBound - value) / iqr : 0;
        direction = 'low';
      }

      return {
        rowIndex: rowIndices[i],
        value,
        score: Math.round(score * 1000) / 1000,
        isAnomaly,
        direction,
      };
    });
  }

  async trackLineage(
    datasetId: string,
    sourceNodes: LineageNode[],
    transformations: LineageEdge[],
    targetNodes: LineageNode[],
  ): Promise<DataLineage> {
    const allNodes = [...sourceNodes, ...targetNodes];
    const lineage: DataLineage = {
      nodes: allNodes,
      edges: transformations,
      rootSources: sourceNodes.map(n => n.id),
      finalTargets: targetNodes.map(n => n.id),
    };

    for (const node of allNodes) {
      await this.prisma.lineageNode.upsert({
        where: { id: node.id },
        update: {
          type: node.type,
          name: node.name,
          metadata: JSON.parse(JSON.stringify(node.metadata)),
          timestamp: node.timestamp,
        },
        create: {
          id: node.id,
          datasetId,
          type: node.type,
          name: node.name,
          metadata: JSON.parse(JSON.stringify(node.metadata)),
          timestamp: node.timestamp,
        },
      });
    }

    for (const edge of transformations) {
      const edgeId = `${edge.sourceId}:${edge.targetId}`;
      await this.prisma.lineageEdge.upsert({
        where: { id: edgeId },
        update: {
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          transformationType: edge.transformationType,
          metadata: JSON.parse(JSON.stringify(edge.metadata)),
        },
        create: {
          id: edgeId,
          datasetId,
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          transformationType: edge.transformationType,
          metadata: JSON.parse(JSON.stringify(edge.metadata)),
        },
      });
    }

    this.lineageGraphCache.set(datasetId, lineage);
    return lineage;
  }

  async getLineage(datasetId: string): Promise<DataLineage> {
    const cached = this.lineageGraphCache.get(datasetId);
    if (cached) return cached;

    const nodes = await this.prisma.lineageNode.findMany({
      where: { datasetId },
    });

    const edges = await this.prisma.lineageEdge.findMany({
      where: { datasetId },
    });

    const lineageNodes: LineageNode[] = nodes.map(n => ({
      id: n.id,
      type: n.type as LineageNode['type'],
      name: n.name,
      metadata: n.metadata as Record<string, any>,
      timestamp: n.timestamp,
    }));

    const lineageEdges: LineageEdge[] = edges.map(e => ({
      sourceId: e.sourceId,
      targetId: e.targetId,
      transformationType: e.transformationType || '',
      metadata: e.metadata as Record<string, any>,
    }));

    const nodeIds = new Set(lineageNodes.map(n => n.id));
    const targetIds = new Set(lineageEdges.map(e => e.targetId));
    const sourceIds = new Set(lineageEdges.map(e => e.sourceId));

    const rootSources = [...nodeIds].filter(id => !targetIds.has(id));
    const finalTargets = [...nodeIds].filter(id => !sourceIds.has(id));

    const lineage: DataLineage = {
      nodes: lineageNodes,
      edges: lineageEdges,
      rootSources,
      finalTargets,
    };

    this.lineageGraphCache.set(datasetId, lineage);
    return lineage;
  }

  async getQualityTrend(
    datasetId: string,
    days: number = 30,
  ): Promise<{ date: Date; overall: number; completeness: number; accuracy: number }[]> {
    const since = new Date(Date.now() - days * 86400000);

    const scores = await this.prisma.qualityScore.findMany({
      where: {
        datasetId,
        scoredAt: { gte: since },
      },
      orderBy: { scoredAt: 'asc' },
      select: {
        scoredAt: true,
        overall: true,
        completeness: true,
        accuracy: true,
      },
    });

    return scores.map(s => ({
      date: s.scoredAt,
      overall: s.overall,
      completeness: s.completeness,
      accuracy: s.accuracy,
    }));
  }
}
