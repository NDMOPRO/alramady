import { PrismaClient } from '@prisma/client';
import winston from 'winston';

// ─── Interfaces ──────────────────────────────────────────────────────

interface StressTestResult {
  overallScore: number;
  tests: Array<{
    name: string;
    passed: boolean;
    score: number;
    details: string;
    affectedRows: number[];
  }>;
  recommendations: string[];
}

interface TestInput {
  columns: string[];
  rows: Record<string, unknown>[];
}

interface TestEntry {
  name: string;
  passed: boolean;
  score: number;
  details: string;
  affectedRows: number[];
}

// ─── Logger ──────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ai-service', module: 'data-stress-test' },
  transports: [new winston.transports.Console()],
});

// ─── Helpers ─────────────────────────────────────────────────────────

function isNullOrEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

function isNumeric(value: unknown): boolean {
  if (typeof value === 'number' && !isNaN(value)) return true;
  if (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value))) return true;
  return false;
}

function toNumber(value: unknown): number {
  return Number(value);
}

function computeQuartiles(sorted: number[]): { q1: number; q3: number; iqr: number } {
  const n = sorted.length;
  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  return { q1, q3, iqr: q3 - q1 };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[\+]?[\d\s\-\(\)]{7,20}$/;
const DATE_PATTERN = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$|^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/;
const MOJIBAKE_PATTERN = /[\uFFFD]|Ã[\x80-\xBF]|Ã¢|â€|Â[^\s]/;

// ─── Service ─────────────────────────────────────────────────────────

export class DataStressTestService {
  constructor(private prisma: PrismaClient) {}

  async runStressTest(data: TestInput): Promise<StressTestResult> {
    const startTime = Date.now();
    logger.info('Running stress test', { columns: data.columns.length, rows: data.rows.length });

    const tests: TestEntry[] = [];

    tests.push(this.completenessTest(data));
    tests.push(this.consistencyTest(data));
    tests.push(this.uniquenessTest(data));
    tests.push(this.rangeTest(data));
    tests.push(this.formatTest(data));
    tests.push(this.referentialIntegrityTest(data));
    tests.push(this.encodingTest(data));

    const totalWeight = tests.length;
    const weightedSum = tests.reduce((sum, t) => sum + t.score, 0);
    const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    const recommendations = this.generateRecommendations(tests, data);

    const durationMs = Date.now() - startTime;
    logger.info('Stress test complete', { overallScore, testCount: tests.length, durationMs });

    return { overallScore, tests, recommendations };
  }

  private completenessTest(data: TestInput): TestEntry {
    const { columns, rows } = data;
    const affectedRows: number[] = [];
    let totalCells = 0;
    let nullCells = 0;

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      for (const col of columns) {
        totalCells++;
        if (isNullOrEmpty(row[col])) {
          nullCells++;
          if (!affectedRows.includes(rowIdx)) {
            affectedRows.push(rowIdx);
          }
        }
      }
    }

    const completenessRatio = totalCells > 0 ? (totalCells - nullCells) / totalCells : 1;
    const score = Math.round(completenessRatio * 100);
    const passed = score >= 80;

    const columnNullCounts: Record<string, number> = {};
    for (const col of columns) {
      const nullCount = rows.filter((r) => isNullOrEmpty(r[col])).length;
      if (nullCount > 0) {
        columnNullCounts[col] = nullCount;
      }
    }

    const worstColumns = Object.entries(columnNullCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([col, count]) => `${col}: ${count} nulls (${((count / rows.length) * 100).toFixed(1)}%)`)
      .join('; ');

    return {
      name: 'Completeness Test',
      passed,
      score,
      details: `${nullCells} of ${totalCells} cells are null/empty (${((nullCells / Math.max(totalCells, 1)) * 100).toFixed(1)}%). Worst columns: ${worstColumns || 'none'}`,
      affectedRows,
    };
  }

  private consistencyTest(data: TestInput): TestEntry {
    const { columns, rows } = data;
    const affectedRows: number[] = [];
    let inconsistentColumns = 0;

    const columnDetails: string[] = [];

    for (const col of columns) {
      const values = rows
        .map((r, idx) => ({ value: r[col], idx }))
        .filter((v) => !isNullOrEmpty(v.value));

      if (values.length === 0) continue;

      const typeMap: Record<string, number> = {};
      const rowsByType: Record<string, number[]> = {};

      for (const entry of values) {
        let detectedType: string;
        if (typeof entry.value === 'number') {
          detectedType = 'number';
        } else if (typeof entry.value === 'boolean') {
          detectedType = 'boolean';
        } else if (typeof entry.value === 'string') {
          if (isNumeric(entry.value)) {
            detectedType = 'numeric_string';
          } else if (!isNaN(Date.parse(entry.value))) {
            detectedType = 'date_string';
          } else {
            detectedType = 'string';
          }
        } else if (typeof entry.value === 'object') {
          detectedType = Array.isArray(entry.value) ? 'array' : 'object';
        } else {
          detectedType = typeof entry.value;
        }

        typeMap[detectedType] = (typeMap[detectedType] || 0) + 1;
        if (!rowsByType[detectedType]) rowsByType[detectedType] = [];
        rowsByType[detectedType].push(entry.idx);
      }

      const typeCount = Object.keys(typeMap).length;
      if (typeCount > 1) {
        inconsistentColumns++;
        const dominantType = Object.entries(typeMap).sort((a, b) => b[1] - a[1])[0][0];
        for (const [typeName, indices] of Object.entries(rowsByType)) {
          if (typeName !== dominantType) {
            for (const idx of indices) {
              if (!affectedRows.includes(idx)) affectedRows.push(idx);
            }
          }
        }
        const typeSummary = Object.entries(typeMap)
          .map(([t, c]) => `${t}:${c}`)
          .join(', ');
        columnDetails.push(`${col} has mixed types (${typeSummary})`);
      }
    }

    const consistentRatio = columns.length > 0 ? (columns.length - inconsistentColumns) / columns.length : 1;
    const score = Math.round(consistentRatio * 100);
    const passed = score >= 85;

    return {
      name: 'Consistency Test',
      passed,
      score,
      details: inconsistentColumns === 0
        ? 'All columns have consistent data types'
        : `${inconsistentColumns} column(s) have mixed types. ${columnDetails.slice(0, 5).join('; ')}`,
      affectedRows,
    };
  }

  private uniquenessTest(data: TestInput): TestEntry {
    const { rows } = data;
    const affectedRows: number[] = [];

    if (rows.length === 0) {
      return { name: 'Uniqueness Test', passed: true, score: 100, details: 'No rows to test', affectedRows: [] };
    }

    const rowSignatures: Map<string, number[]> = new Map();
    for (let i = 0; i < rows.length; i++) {
      const sig = JSON.stringify(rows[i]);
      const existing = rowSignatures.get(sig);
      if (existing) {
        existing.push(i);
      } else {
        rowSignatures.set(sig, [i]);
      }
    }

    let duplicateCount = 0;
    for (const [, indices] of rowSignatures) {
      if (indices.length > 1) {
        duplicateCount += indices.length - 1;
        for (const idx of indices.slice(1)) {
          if (!affectedRows.includes(idx)) affectedRows.push(idx);
        }
      }
    }

    const uniqueRatio = rows.length > 0 ? (rows.length - duplicateCount) / rows.length : 1;
    const score = Math.round(uniqueRatio * 100);
    const passed = score >= 90;

    return {
      name: 'Uniqueness Test',
      passed,
      score,
      details: duplicateCount === 0
        ? 'No duplicate rows found'
        : `${duplicateCount} duplicate row(s) found out of ${rows.length} total rows`,
      affectedRows,
    };
  }

  private rangeTest(data: TestInput): TestEntry {
    const { columns, rows } = data;
    const affectedRows: number[] = [];
    let totalNumericColumns = 0;
    let columnsWithOutliers = 0;
    const outlierDetails: string[] = [];

    for (const col of columns) {
      const numericEntries = rows
        .map((r, idx) => ({ value: r[col], idx }))
        .filter((e) => isNumeric(e.value));

      if (numericEntries.length < 4) continue;
      totalNumericColumns++;

      const sorted = numericEntries
        .map((e) => toNumber(e.value))
        .sort((a, b) => a - b);

      const { q1, q3, iqr } = computeQuartiles(sorted);
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;

      let outlierCount = 0;
      for (const entry of numericEntries) {
        const val = toNumber(entry.value);
        if (val < lowerBound || val > upperBound) {
          outlierCount++;
          if (!affectedRows.includes(entry.idx)) {
            affectedRows.push(entry.idx);
          }
        }
      }

      if (outlierCount > 0) {
        columnsWithOutliers++;
        outlierDetails.push(
          `${col}: ${outlierCount} outlier(s), range [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`
        );
      }
    }

    const score = totalNumericColumns > 0
      ? Math.round(((totalNumericColumns - columnsWithOutliers) / totalNumericColumns) * 100)
      : 100;
    const passed = score >= 75;

    return {
      name: 'Range Test (IQR Outliers)',
      passed,
      score,
      details: columnsWithOutliers === 0
        ? `No statistical outliers detected in ${totalNumericColumns} numeric column(s)`
        : `Outliers found in ${columnsWithOutliers} of ${totalNumericColumns} numeric column(s). ${outlierDetails.slice(0, 5).join('; ')}`,
      affectedRows,
    };
  }

  private formatTest(data: TestInput): TestEntry {
    const { columns, rows } = data;
    const affectedRows: number[] = [];
    let testedColumns = 0;
    let failedColumns = 0;
    const formatDetails: string[] = [];

    for (const col of columns) {
      const stringValues = rows
        .map((r, idx) => ({ value: r[col], idx }))
        .filter((e) => typeof e.value === 'string' && (e.value as string).trim() !== '');

      if (stringValues.length < 3) continue;

      const sampleValues = stringValues.slice(0, 20).map((e) => e.value as string);

      const emailMatches = sampleValues.filter((v) => EMAIL_PATTERN.test(v)).length;
      if (emailMatches > sampleValues.length * 0.3) {
        testedColumns++;
        let invalidCount = 0;
        for (const entry of stringValues) {
          if (!EMAIL_PATTERN.test(entry.value as string)) {
            invalidCount++;
            if (!affectedRows.includes(entry.idx)) affectedRows.push(entry.idx);
          }
        }
        if (invalidCount > 0) {
          failedColumns++;
          formatDetails.push(`${col}: ${invalidCount} invalid email(s)`);
        }
        continue;
      }

      const phoneMatches = sampleValues.filter((v) => PHONE_PATTERN.test(v)).length;
      if (phoneMatches > sampleValues.length * 0.3) {
        testedColumns++;
        let invalidCount = 0;
        for (const entry of stringValues) {
          if (!PHONE_PATTERN.test(entry.value as string)) {
            invalidCount++;
            if (!affectedRows.includes(entry.idx)) affectedRows.push(entry.idx);
          }
        }
        if (invalidCount > 0) {
          failedColumns++;
          formatDetails.push(`${col}: ${invalidCount} invalid phone(s)`);
        }
        continue;
      }

      const dateMatches = sampleValues.filter((v) => DATE_PATTERN.test(v)).length;
      if (dateMatches > sampleValues.length * 0.3) {
        testedColumns++;
        let invalidCount = 0;
        for (const entry of stringValues) {
          if (!DATE_PATTERN.test(entry.value as string)) {
            invalidCount++;
            if (!affectedRows.includes(entry.idx)) affectedRows.push(entry.idx);
          }
        }
        if (invalidCount > 0) {
          failedColumns++;
          formatDetails.push(`${col}: ${invalidCount} invalid date(s)`);
        }
      }
    }

    const score = testedColumns > 0
      ? Math.round(((testedColumns - failedColumns) / testedColumns) * 100)
      : 100;
    const passed = score >= 80;

    return {
      name: 'Format Validation Test',
      passed,
      score,
      details: testedColumns === 0
        ? 'No columns with recognizable format patterns (emails, phones, dates) detected'
        : failedColumns === 0
          ? `All ${testedColumns} format-detected column(s) pass validation`
          : `${failedColumns} of ${testedColumns} formatted column(s) have issues. ${formatDetails.slice(0, 5).join('; ')}`,
      affectedRows,
    };
  }

  private referentialIntegrityTest(data: TestInput): TestEntry {
    const { columns, rows } = data;
    const affectedRows: number[] = [];

    if (rows.length === 0 || columns.length < 2) {
      return {
        name: 'Referential Integrity Test',
        passed: true,
        score: 100,
        details: 'Insufficient columns for cross-column checks',
        affectedRows: [],
      };
    }

    const idColumns = columns.filter((col) => {
      const lower = col.toLowerCase();
      return lower.endsWith('_id') || lower.endsWith('id') || lower === 'id' || lower.endsWith('_code') || lower.endsWith('code');
    });

    let checksPerformed = 0;
    let issuesFound = 0;
    const integrityDetails: string[] = [];

    for (const idCol of idColumns) {
      const relatedNameCol = columns.find((c) => {
        const base = idCol.replace(/[_]?(id|code)$/i, '');
        if (base.length === 0) return false;
        const cLower = c.toLowerCase();
        const baseLower = base.toLowerCase();
        return (
          cLower.includes(baseLower) &&
          cLower !== idCol.toLowerCase() &&
          (cLower.includes('name') || cLower.includes('label') || cLower.includes('title'))
        );
      });

      if (!relatedNameCol) continue;
      checksPerformed++;

      const idToNames: Map<string, Set<string>> = new Map();
      for (let i = 0; i < rows.length; i++) {
        const idVal = rows[i][idCol];
        const nameVal = rows[i][relatedNameCol];
        if (isNullOrEmpty(idVal) || isNullOrEmpty(nameVal)) continue;

        const idStr = String(idVal);
        const nameStr = String(nameVal);

        if (!idToNames.has(idStr)) {
          idToNames.set(idStr, new Set());
        }
        idToNames.get(idStr)!.add(nameStr);
      }

      for (const [idVal, names] of idToNames) {
        if (names.size > 1) {
          issuesFound++;
          integrityDetails.push(
            `${idCol}="${idVal}" maps to ${names.size} different ${relatedNameCol} values`
          );
          for (let i = 0; i < rows.length; i++) {
            if (String(rows[i][idCol]) === idVal && !affectedRows.includes(i)) {
              affectedRows.push(i);
            }
          }
        }
      }
    }

    const score = checksPerformed > 0
      ? Math.round(Math.max(0, 100 - (issuesFound / Math.max(checksPerformed, 1)) * 50))
      : 100;
    const passed = score >= 80;

    return {
      name: 'Referential Integrity Test',
      passed,
      score,
      details: checksPerformed === 0
        ? 'No ID/code columns with related name columns detected for cross-referencing'
        : issuesFound === 0
          ? `${checksPerformed} cross-column relationship(s) validated successfully`
          : `${issuesFound} inconsistency(ies) in ${checksPerformed} relationship(s). ${integrityDetails.slice(0, 5).join('; ')}`,
      affectedRows,
    };
  }

  private encodingTest(data: TestInput): TestEntry {
    const { columns, rows } = data;
    const affectedRows: number[] = [];
    let totalStrings = 0;
    let encodingIssues = 0;

    for (let i = 0; i < rows.length; i++) {
      for (const col of columns) {
        const val = rows[i][col];
        if (typeof val !== 'string') continue;
        totalStrings++;

        if (MOJIBAKE_PATTERN.test(val)) {
          encodingIssues++;
          if (!affectedRows.includes(i)) affectedRows.push(i);
        }
      }
    }

    const score = totalStrings > 0
      ? Math.round(((totalStrings - encodingIssues) / totalStrings) * 100)
      : 100;
    const passed = score >= 95;

    return {
      name: 'Encoding Test',
      passed,
      score,
      details: encodingIssues === 0
        ? `No encoding issues (mojibake) detected in ${totalStrings} string value(s)`
        : `${encodingIssues} potential encoding issue(s) detected out of ${totalStrings} string values`,
      affectedRows,
    };
  }

  private generateRecommendations(tests: TestEntry[], data: TestInput): string[] {
    const recommendations: string[] = [];

    for (const test of tests) {
      if (test.name === 'Completeness Test' && !test.passed) {
        recommendations.push(
          `Data completeness is at ${test.score}%. Consider filling missing values or removing rows with critical null fields.`
        );
      }
      if (test.name === 'Consistency Test' && !test.passed) {
        recommendations.push(
          `Mixed data types detected in some columns. Normalize column types before analysis to avoid incorrect aggregations.`
        );
      }
      if (test.name === 'Uniqueness Test' && !test.passed) {
        recommendations.push(
          `Duplicate rows detected (score: ${test.score}%). Deduplicate the dataset or verify that duplicates are intentional.`
        );
      }
      if (test.name === 'Range Test (IQR Outliers)' && !test.passed) {
        recommendations.push(
          `Statistical outliers detected in numeric columns. Review outlier rows for data entry errors or valid extreme values.`
        );
      }
      if (test.name === 'Format Validation Test' && !test.passed) {
        recommendations.push(
          `Format inconsistencies found in structured columns (emails, phones, dates). Standardize formats for reliable querying.`
        );
      }
      if (test.name === 'Referential Integrity Test' && !test.passed) {
        recommendations.push(
          `Cross-column inconsistencies detected (e.g., same ID mapping to different names). Verify lookup relationships.`
        );
      }
      if (test.name === 'Encoding Test' && !test.passed) {
        recommendations.push(
          `Encoding issues (mojibake) detected. Re-import the data with correct encoding (UTF-8 recommended).`
        );
      }
    }

    if (data.rows.length < 10) {
      recommendations.push(
        `Dataset has only ${data.rows.length} row(s). Some statistical tests may not be reliable with small sample sizes.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Data quality is excellent. No immediate actions required.');
    }

    return recommendations;
  }
}
