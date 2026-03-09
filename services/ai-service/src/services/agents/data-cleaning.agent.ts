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

export interface DataCleaningTask {
  type: 'auto_clean' | 'fix_types' | 'handle_missing' | 'remove_duplicates' | 'standardize_formats';
  datasetId: string;
  data: Array<Record<string, number | string | null>>;
  columns?: string[];
  missingStrategy?: 'mean' | 'median' | 'mode' | 'forward_fill' | 'drop';
  context?: string;
}

interface CleaningOperation {
  column: string;
  operation: string;
  affectedRows: number;
  before: string;
  after: string;
}

export class DataCleaningAgent {
  private readonly agentType = 'data-cleaning';

  async execute(task: DataCleaningTask): Promise<AgentResult> {
    switch (task.type) {
      case 'auto_clean':
        return this.autoClean(task);
      case 'fix_types':
        return this.fixTypes(task);
      case 'handle_missing':
        return this.handleMissing(task);
      case 'remove_duplicates':
        return this.removeDuplicates(task);
      case 'standardize_formats':
        return this.standardizeFormats(task);
      default: {
        const exhaustive: never = task.type;
        throw new Error(`Unsupported task type: ${exhaustive}`);
      }
    }
  }

  private getColumnNames(data: Array<Record<string, number | string | null>>): string[] {
    const keys = new Set<string>();
    data.forEach((row) => Object.keys(row).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }

  private async autoClean(task: DataCleaningTask): Promise<AgentResult> {
    const columns = task.columns ?? this.getColumnNames(task.data);
    const operations: CleaningOperation[] = [];
    const totalRows = task.data.length;

    for (const col of columns) {
      const values = task.data.map((row) => row[col]);

      // Detect and count whitespace issues
      const whitespaceIssues = values.filter(
        (v) => typeof v === 'string' && (v !== v.trim() || /\s{2,}/.test(v))
      ).length;
      if (whitespaceIssues > 0) {
        operations.push({
          column: col,
          operation: 'trim_whitespace',
          affectedRows: whitespaceIssues,
          before: 'strings with leading/trailing/excessive whitespace',
          after: 'trimmed and normalized whitespace',
        });
      }

      // Detect empty strings that should be null
      const emptyStrings = values.filter((v) => typeof v === 'string' && v.trim() === '').length;
      if (emptyStrings > 0) {
        operations.push({
          column: col,
          operation: 'empty_to_null',
          affectedRows: emptyStrings,
          before: 'empty strings',
          after: 'null values',
        });
      }

      // Detect numeric strings in predominantly numeric columns
      const nonNull = values.filter((v): v is number | string => v !== null && v !== undefined);
      const numericValues = nonNull.filter((v) => typeof v === 'number' || (!isNaN(Number(v)) && String(v).trim() !== ''));
      const stringNumbers = nonNull.filter((v) => typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== '');
      if (numericValues.length / (nonNull.length || 1) > 0.8 && stringNumbers.length > 0) {
        operations.push({
          column: col,
          operation: 'cast_to_number',
          affectedRows: stringNumbers.length,
          before: 'string representation of numbers',
          after: 'numeric values',
        });
      }

      // Detect inconsistent casing in categorical columns
      const uniqueRaw = new Set(nonNull.filter((v) => typeof v === 'string').map(String));
      const uniqueLower = new Set(Array.from(uniqueRaw).map((v) => v.toLowerCase()));
      if (uniqueRaw.size > uniqueLower.size && uniqueRaw.size < 50) {
        operations.push({
          column: col,
          operation: 'normalize_casing',
          affectedRows: uniqueRaw.size - uniqueLower.size,
          before: `${uniqueRaw.size} unique values with inconsistent casing`,
          after: `${uniqueLower.size} normalized values`,
        });
      }
    }

    // Detect duplicate rows
    const seen = new Set<string>();
    let duplicateCount = 0;
    for (const row of task.data) {
      const key = JSON.stringify(Object.values(row));
      if (seen.has(key)) duplicateCount++;
      else seen.add(key);
    }
    if (duplicateCount > 0) {
      operations.push({
        column: '*',
        operation: 'remove_duplicates',
        affectedRows: duplicateCount,
        before: `${totalRows} rows with ${duplicateCount} duplicates`,
        after: `${totalRows - duplicateCount} unique rows`,
      });
    }

    const suggestions = operations.map((op) => ({
      action: op.operation,
      description: `Column "${op.column}": ${op.operation} - ${op.affectedRows} rows affected. ${op.before} -> ${op.after}`,
      confidence: 0.9,
    }));

    const interpretation = `Auto-clean analysis on ${columns.length} columns and ${totalRows} rows. Found ${operations.length} cleaning operations affecting data quality. ${duplicateCount} duplicate rows detected.`;

    await prisma.auditLog.create({
      data: {
        action: 'data_cleaning_auto_clean',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ operationCount: operations.length, duplicateCount, totalRows }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async fixTypes(task: DataCleaningTask): Promise<AgentResult> {
    const columns = task.columns ?? this.getColumnNames(task.data);
    const sampleRows = task.data.slice(0, 10);

    const columnAnalysis = columns.map((col) => {
      const values = task.data.map((row) => row[col]).filter((v) => v !== null && v !== undefined);
      const types = new Map<string, number>();
      values.forEach((v) => {
        let t = typeof v;
        if (t === 'string') {
          const s = String(v).trim();
          if (!isNaN(Number(s)) && s !== '') t = 'parseable_number';
          else if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) t = 'parseable_date';
          else if (s === 'true' || s === 'false') t = 'parseable_boolean';
        }
        types.set(t, (types.get(t) ?? 0) + 1);
      });
      return { column: col, types: Object.fromEntries(types), totalNonNull: values.length };
    });

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    for (const analysis of columnAnalysis) {
      const total = analysis.totalNonNull;
      if (total === 0) continue;

      const parseableNumbers = (analysis.types['parseable_number'] ?? 0) + (analysis.types['number'] ?? 0);
      const parseableDates = analysis.types['parseable_date'] ?? 0;
      const parseableBooleans = analysis.types['parseable_boolean'] ?? 0;

      if (parseableNumbers / total > 0.8 && (analysis.types['string'] ?? 0) > 0) {
        suggestions.push({
          action: 'fix_type_to_number',
          description: `Column "${analysis.column}": ${analysis.types['parseable_number'] ?? 0} string values should be numeric. ${total - parseableNumbers} non-numeric values would need handling.`,
          confidence: parseableNumbers / total,
        });
      }

      if (parseableDates / total > 0.8) {
        suggestions.push({
          action: 'fix_type_to_date',
          description: `Column "${analysis.column}": ${parseableDates} values are parseable dates. Recommend converting to Date type.`,
          confidence: parseableDates / total,
        });
      }

      if (parseableBooleans / total > 0.8) {
        suggestions.push({
          action: 'fix_type_to_boolean',
          description: `Column "${analysis.column}": ${parseableBooleans} values are parseable booleans ("true"/"false" strings).`,
          confidence: parseableBooleans / total,
        });
      }

      // Mixed types warning
      const distinctTypes = Object.keys(analysis.types).length;
      if (distinctTypes > 2) {
        suggestions.push({
          action: 'mixed_type_warning',
          description: `Column "${analysis.column}": mixed types detected (${Object.entries(analysis.types).map(([t, c]) => `${t}:${c}`).join(', ')}). Needs manual review.`,
          confidence: 0.7,
        });
      }
    }

    const interpretation = `Type analysis on ${columns.length} columns. Found ${suggestions.length} type issues. Columns with parseable numbers, dates, or booleans stored as strings have been identified for type correction.`;

    await prisma.auditLog.create({
      data: {
        action: 'data_cleaning_fix_types',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ columnsAnalyzed: columns.length, issuesFound: suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async handleMissing(task: DataCleaningTask): Promise<AgentResult> {
    const columns = task.columns ?? this.getColumnNames(task.data);
    const strategy = task.missingStrategy ?? 'mean';
    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    for (const col of columns) {
      const values = task.data.map((row) => row[col]);
      const nullCount = values.filter((v) => v === null || v === undefined).length;
      if (nullCount === 0) continue;

      const nullPct = (nullCount / values.length) * 100;
      const nonNull = values.filter((v): v is number | string => v !== null && v !== undefined);

      if (nullPct > 70) {
        suggestions.push({
          action: 'drop_column',
          description: `Column "${col}": ${nullPct.toFixed(1)}% missing (${nullCount}/${values.length}). Consider dropping this column entirely.`,
          confidence: 0.85,
        });
        continue;
      }

      // Determine if numeric
      const nums = nonNull
        .map((v) => (typeof v === 'number' ? v : Number(v)))
        .filter((v) => !isNaN(v));
      const isNumeric = nums.length / (nonNull.length || 1) > 0.8;

      if (isNumeric) {
        let imputeValue: number;
        let methodUsed: string;

        switch (strategy) {
          case 'mean': {
            imputeValue = nums.reduce((s, v) => s + v, 0) / nums.length;
            methodUsed = 'mean';
            break;
          }
          case 'median': {
            const sorted = [...nums].sort((a, b) => a - b);
            imputeValue = sorted.length % 2 === 0
              ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
              : sorted[Math.floor(sorted.length / 2)];
            methodUsed = 'median';
            break;
          }
          case 'mode': {
            const freq = new Map<number, number>();
            nums.forEach((v) => freq.set(v, (freq.get(v) ?? 0) + 1));
            imputeValue = Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
            methodUsed = 'mode';
            break;
          }
          case 'forward_fill': {
            imputeValue = 0; // forward fill is row-dependent
            methodUsed = 'forward_fill';
            break;
          }
          case 'drop': {
            suggestions.push({
              action: 'drop_missing_rows',
              description: `Column "${col}": drop ${nullCount} rows with missing values (${nullPct.toFixed(1)}% of data)`,
              confidence: 0.8,
            });
            continue;
          }
          default:
            imputeValue = nums.reduce((s, v) => s + v, 0) / nums.length;
            methodUsed = 'mean';
        }

        if (methodUsed === 'forward_fill') {
          suggestions.push({
            action: 'impute_forward_fill',
            description: `Column "${col}": forward-fill ${nullCount} missing values (${nullPct.toFixed(1)}%) using previous non-null value`,
            confidence: 0.75,
          });
        } else {
          suggestions.push({
            action: `impute_${methodUsed}`,
            description: `Column "${col}": impute ${nullCount} missing values (${nullPct.toFixed(1)}%) with ${methodUsed} = ${imputeValue.toFixed(4)}`,
            confidence: 0.85,
          });
        }
      } else {
        // Categorical - use mode
        const freq = new Map<string, number>();
        nonNull.forEach((v) => {
          const key = String(v);
          freq.set(key, (freq.get(key) ?? 0) + 1);
        });
        const modeEntry = Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0];

        if (modeEntry) {
          suggestions.push({
            action: 'impute_mode',
            description: `Column "${col}": impute ${nullCount} missing values (${nullPct.toFixed(1)}%) with mode "${modeEntry[0]}" (frequency: ${modeEntry[1]})`,
            confidence: modeEntry[1] / nonNull.length > 0.5 ? 0.85 : 0.65,
          });
        }
      }
    }

    const totalMissing = columns.reduce((s, col) => {
      return s + task.data.filter((row) => row[col] === null || row[col] === undefined).length;
    }, 0);

    const interpretation = `Missing value analysis: ${totalMissing} missing cells across ${columns.length} columns (${(totalMissing / (task.data.length * columns.length) * 100).toFixed(1)}% of all data). Strategy: ${strategy}. ${suggestions.length} imputation recommendations generated.`;

    await prisma.auditLog.create({
      data: {
        action: 'data_cleaning_handle_missing',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ totalMissing, strategy, suggestionsCount: suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async removeDuplicates(task: DataCleaningTask): Promise<AgentResult> {
    const columns = task.columns ?? this.getColumnNames(task.data);

    // Exact duplicates
    const exactSeen = new Set<string>();
    const exactDuplicateIndices: number[] = [];
    for (let i = 0; i < task.data.length; i++) {
      const key = JSON.stringify(columns.map((c) => task.data[i][c]));
      if (exactSeen.has(key)) {
        exactDuplicateIndices.push(i);
      } else {
        exactSeen.add(key);
      }
    }

    // Near duplicates: check for rows that differ only in whitespace or casing
    const nearDuplicates: Array<{ row1: number; row2: number; differingColumns: string[] }> = [];
    const normalizeValue = (v: number | string | null): string => {
      if (v === null || v === undefined) return '';
      return String(v).trim().toLowerCase().replace(/\s+/g, ' ');
    };

    const normalizedKeys = new Map<string, number>();
    for (let i = 0; i < task.data.length; i++) {
      if (exactDuplicateIndices.includes(i)) continue;
      const normalizedKey = JSON.stringify(columns.map((c) => normalizeValue(task.data[i][c])));
      const existingIdx = normalizedKeys.get(normalizedKey);
      if (existingIdx !== undefined) {
        const differingColumns = columns.filter((c) => {
          const v1 = String(task.data[existingIdx][c] ?? '');
          const v2 = String(task.data[i][c] ?? '');
          return v1 !== v2;
        });
        if (differingColumns.length > 0) {
          nearDuplicates.push({ row1: existingIdx, row2: i, differingColumns });
        }
      } else {
        normalizedKeys.set(normalizedKey, i);
      }
    }

    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    if (exactDuplicateIndices.length > 0) {
      suggestions.push({
        action: 'remove_exact_duplicates',
        description: `Found ${exactDuplicateIndices.length} exact duplicate rows. Removing would reduce dataset from ${task.data.length} to ${task.data.length - exactDuplicateIndices.length} rows.`,
        confidence: 0.98,
      });
    }

    if (nearDuplicates.length > 0) {
      suggestions.push({
        action: 'review_near_duplicates',
        description: `Found ${nearDuplicates.length} near-duplicate pairs (differ only in whitespace/casing). Columns affected: ${[...new Set(nearDuplicates.flatMap((d) => d.differingColumns))].join(', ')}`,
        confidence: 0.8,
      });

      nearDuplicates.slice(0, 5).forEach((nd) => {
        suggestions.push({
          action: 'near_duplicate_detail',
          description: `Rows ${nd.row1} and ${nd.row2} differ only in: ${nd.differingColumns.join(', ')}`,
          confidence: 0.75,
        });
      });
    }

    if (exactDuplicateIndices.length === 0 && nearDuplicates.length === 0) {
      suggestions.push({
        action: 'no_duplicates',
        description: `No duplicate or near-duplicate rows found in ${task.data.length} rows`,
        confidence: 1.0,
      });
    }

    const interpretation = `Duplicate analysis: ${exactDuplicateIndices.length} exact duplicates and ${nearDuplicates.length} near-duplicates found in ${task.data.length} rows across ${columns.length} columns.`;

    await prisma.auditLog.create({
      data: {
        action: 'data_cleaning_remove_duplicates',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({
          exactDuplicates: exactDuplicateIndices.length,
          nearDuplicates: nearDuplicates.length,
          totalRows: task.data.length,
        }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }

  private async standardizeFormats(task: DataCleaningTask): Promise<AgentResult> {
    const columns = task.columns ?? this.getColumnNames(task.data);
    const suggestions: Array<{ action: string; description: string; confidence: number }> = [];

    // Saudi phone number pattern: +966XXXXXXXXX or 05XXXXXXXX
    const saudiPhonePatterns = [
      /^\+966\d{9}$/,
      /^00966\d{9}$/,
      /^966\d{9}$/,
      /^05\d{8}$/,
      /^5\d{8}$/,
    ];

    // Email pattern
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Date patterns
    const datePatterns = [
      { regex: /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/, format: 'YYYY-MM-DD' },
      { regex: /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/, format: 'DD-MM-YYYY' },
      { regex: /^\d{1,2}[-/]\d{1,2}[-/]\d{2}$/, format: 'DD-MM-YY' },
    ];

    for (const col of columns) {
      const values = task.data
        .map((row) => row[col])
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '');

      if (values.length === 0) continue;

      // Check for phone numbers
      const phoneMatches = values.filter((v) => saudiPhonePatterns.some((p) => p.test(v.replace(/[\s-()]/g, ''))));
      if (phoneMatches.length / values.length > 0.5) {
        const formats = new Set<string>();
        phoneMatches.forEach((v) => {
          const cleaned = v.replace(/[\s-()]/g, '');
          if (/^\+966/.test(cleaned)) formats.add('+966XXXXXXXXX');
          else if (/^00966/.test(cleaned)) formats.add('00966XXXXXXXXX');
          else if (/^05/.test(cleaned)) formats.add('05XXXXXXXX');
          else formats.add('other');
        });

        if (formats.size > 1) {
          suggestions.push({
            action: 'standardize_phone',
            description: `Column "${col}": ${phoneMatches.length} phone numbers with ${formats.size} formats (${Array.from(formats).join(', ')}). Recommend standardizing to +966XXXXXXXXX.`,
            confidence: 0.9,
          });
        }
      }

      // Check for emails
      const emailMatches = values.filter((v) => emailPattern.test(v.trim()));
      if (emailMatches.length / values.length > 0.5) {
        const needsLowercase = emailMatches.filter((v) => v !== v.toLowerCase()).length;
        const needsTrim = emailMatches.filter((v) => v !== v.trim()).length;
        if (needsLowercase > 0 || needsTrim > 0) {
          suggestions.push({
            action: 'standardize_email',
            description: `Column "${col}": ${emailMatches.length} emails. ${needsLowercase} need lowercase normalization, ${needsTrim} need trimming.`,
            confidence: 0.92,
          });
        }
      }

      // Check for dates with mixed formats
      const dateFormatCounts = new Map<string, number>();
      values.forEach((v) => {
        for (const dp of datePatterns) {
          if (dp.regex.test(v.trim())) {
            dateFormatCounts.set(dp.format, (dateFormatCounts.get(dp.format) ?? 0) + 1);
            break;
          }
        }
      });

      if (dateFormatCounts.size > 1) {
        const formatList = Array.from(dateFormatCounts.entries())
          .map(([f, c]) => `${f}: ${c}`)
          .join(', ');
        suggestions.push({
          action: 'standardize_date',
          description: `Column "${col}": mixed date formats detected (${formatList}). Recommend standardizing to YYYY-MM-DD (ISO 8601).`,
          confidence: 0.88,
        });
      }

      // Check for inconsistent Arabic text (tashkeel/diacritics)
      const arabicValues = values.filter((v) => /[\u0600-\u06FF]/.test(v));
      if (arabicValues.length > 0) {
        const withDiacritics = arabicValues.filter((v) => /[\u064B-\u065F\u0670]/.test(v));
        if (withDiacritics.length > 0 && withDiacritics.length < arabicValues.length) {
          suggestions.push({
            action: 'standardize_arabic',
            description: `Column "${col}": ${withDiacritics.length}/${arabicValues.length} Arabic values have diacritics (tashkeel). Consider removing for consistency.`,
            confidence: 0.75,
          });
        }
      }

      // Check for currency formatting inconsistencies
      const currencyPattern = /^[\d,]+\.?\d*\s*(SAR|sar|ريال|ر\.س|SR)$/;
      const currencyMatches = values.filter((v) => currencyPattern.test(v.trim()));
      if (currencyMatches.length / values.length > 0.3) {
        suggestions.push({
          action: 'standardize_currency',
          description: `Column "${col}": ${currencyMatches.length} currency values detected. Recommend extracting numeric value and storing currency symbol separately.`,
          confidence: 0.85,
        });
      }
    }

    const interpretation = `Format standardization analysis on ${columns.length} columns. Found ${suggestions.length} formatting inconsistencies including phone numbers, emails, dates, Arabic text, and currency formats.`;

    await prisma.auditLog.create({
      data: {
        action: 'data_cleaning_standardize_formats',
        entityType: 'dataset',
        entityId: task.datasetId,
        details: JSON.stringify({ columnsAnalyzed: columns.length, issuesFound: suggestions.length }),
        performedAt: new Date(),
      },
    });

    return {
      agentType: this.agentType,
      taskType: task.type,
      suggestions,
      interpretation,
      requiresApproval: true,
      executedAt: new Date(),
    };
  }
}
