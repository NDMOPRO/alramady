import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import winston from 'winston';

// ─── Interfaces ──────────────────────────────────────────────────────

interface SQLPreview {
  sql: string;
  explanation: string;
  estimatedRows: number;
  affectedTables: string[];
  isReadOnly: boolean;
  warnings: string[];
  suggestedOptimizations: string[];
}

interface SchemaDefinition {
  tables: Array<{
    name: string;
    columns: Array<{ name: string; type: string }>;
  }>;
}

interface SQLValidation {
  safe: boolean;
  warnings: string[];
}

// ─── Logger ──────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ai-service', module: 'sql-preview' },
  transports: [new winston.transports.Console()],
});

// ─── Clients ─────────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' ?? '' });
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// ─── Dangerous Patterns ─────────────────────────────────────────────

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; message: string; severity: 'critical' | 'warning' }> = [
  {
    pattern: /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX)\b/i,
    message: 'DROP statement detected - this will permanently remove database objects',
    severity: 'critical',
  },
  {
    pattern: /\bTRUNCATE\s+TABLE\b/i,
    message: 'TRUNCATE TABLE detected - this will remove all rows from the table',
    severity: 'critical',
  },
  {
    pattern: /\bDELETE\s+FROM\s+\w+\s*(?:;|$)/i,
    message: 'DELETE without WHERE clause - this will delete ALL rows from the table',
    severity: 'critical',
  },
  {
    pattern: /\bUPDATE\s+\w+\s+SET\s+[^;]*(?:;|$)(?![\s\S]*WHERE)/i,
    message: 'UPDATE without WHERE clause - this will modify ALL rows in the table',
    severity: 'critical',
  },
  {
    pattern: /\bALTER\s+TABLE\b/i,
    message: 'ALTER TABLE detected - this will modify the table structure',
    severity: 'warning',
  },
  {
    pattern: /\bGRANT\b|\bREVOKE\b/i,
    message: 'Permission modification detected (GRANT/REVOKE)',
    severity: 'critical',
  },
  {
    pattern: /;\s*(?:DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|GRANT|REVOKE)\b/i,
    message: 'Multiple statements detected - possible SQL injection pattern',
    severity: 'critical',
  },
  {
    pattern: /\bEXEC(?:UTE)?\s*\(/i,
    message: 'Dynamic SQL execution detected (EXEC/EXECUTE)',
    severity: 'critical',
  },
  {
    pattern: /\bINTO\s+OUTFILE\b|\bLOAD\s+DATA\b/i,
    message: 'File system access detected (INTO OUTFILE / LOAD DATA)',
    severity: 'critical',
  },
  {
    pattern: /\bxp_cmdshell\b|\bsp_executesql\b/i,
    message: 'System stored procedure detected - potential command execution',
    severity: 'critical',
  },
  {
    pattern: /--\s*$|\/\*[\s\S]*?\*\//m,
    message: 'SQL comments detected - review for potential injection',
    severity: 'warning',
  },
  {
    pattern: /\bUNION\s+(?:ALL\s+)?SELECT\b/i,
    message: 'UNION SELECT detected - verify this is intentional and not an injection',
    severity: 'warning',
  },
  {
    pattern: /\bSELECT\s+\*\b/i,
    message: 'SELECT * detected - consider specifying columns explicitly for better performance',
    severity: 'warning',
  },
];

const WRITE_OPERATIONS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|MERGE|UPSERT)\b/i;
const READ_OPERATIONS = /\b(SELECT|WITH|EXPLAIN|SHOW|DESCRIBE)\b/i;

// ─── Service ─────────────────────────────────────────────────────────

export class SQLPreviewService {
  constructor(private prisma: PrismaClient) {}

  async generatePreview(
    naturalLanguageQuery: string,
    schema: SchemaDefinition
  ): Promise<SQLPreview> {
    const startTime = Date.now();
    logger.info('Generating SQL preview', {
      queryLength: naturalLanguageQuery.length,
      tableCount: schema.tables.length,
    });

    const schemaDescription = schema.tables
      .map((table) => {
        const cols = table.columns.map((c) => `  ${c.name} (${c.type})`).join('\n');
        return `Table: ${table.name}\n${cols}`;
      })
      .join('\n\n');

    const systemPrompt = `You are an expert SQL developer. Convert the user's natural language query into safe, optimized SQL based on the provided schema.

Schema:
${schemaDescription}

Return a JSON object:
{
  "sql": "<the SQL query>",
  "explanation": "<human-readable explanation of what the query does>",
  "estimatedRows": <estimated number of rows the query might return, use -1 if unknown>,
  "affectedTables": ["<table names referenced>"],
  "suggestedOptimizations": ["<optimization suggestions if any>"]
}

Rules:
- Generate read-only queries (SELECT) unless the user explicitly asks for data modification
- Always include WHERE clauses for UPDATE/DELETE operations
- Use parameterized-style placeholders ($1, $2) for user-supplied values when appropriate
- Prefer explicit column names over SELECT *
- Add appropriate LIMIT clauses for potentially large result sets
- Use table aliases for readability in JOINs

Return ONLY valid JSON.`;

    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: naturalLanguageQuery },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response for SQL generation');
    }

    const parsed = JSON.parse(content);
    const sql = String(parsed.sql || '');
    const explanation = String(parsed.explanation || '');
    const estimatedRows = typeof parsed.estimatedRows === 'number' ? parsed.estimatedRows : -1;
    const affectedTables = Array.isArray(parsed.affectedTables)
      ? parsed.affectedTables.map(String)
      : this.extractTableNames(sql, schema);
    const suggestedOptimizations = Array.isArray(parsed.suggestedOptimizations)
      ? parsed.suggestedOptimizations.map(String)
      : [];

    // Validate the generated SQL
    const validation = this.validateSQL(sql);
    const isReadOnly = !WRITE_OPERATIONS.test(sql);

    // Add optimizations based on analysis
    const additionalOptimizations = this.suggestOptimizations(sql, schema);
    const allOptimizations = [...new Set([...suggestedOptimizations, ...additionalOptimizations])];

    const durationMs = Date.now() - startTime;
    logger.info('SQL preview generated', {
      isReadOnly,
      safe: validation.safe,
      warningCount: validation.warnings.length,
      durationMs,
    });

    return {
      sql,
      explanation,
      estimatedRows,
      affectedTables,
      isReadOnly,
      warnings: validation.warnings,
      suggestedOptimizations: allOptimizations,
    };
  }

  validateSQL(sql: string): SQLValidation {
    const warnings: string[] = [];
    let safe = true;

    if (!sql || sql.trim().length === 0) {
      return { safe: false, warnings: ['Empty SQL statement'] };
    }

    // Check for multiple statements (potential injection)
    const statementCount = sql
      .split(';')
      .filter((s) => s.trim().length > 0).length;
    if (statementCount > 1) {
      warnings.push('Multiple SQL statements detected. Each statement should be reviewed individually.');
    }

    // Run through dangerous patterns
    for (const check of DANGEROUS_PATTERNS) {
      if (check.pattern.test(sql)) {
        warnings.push(check.message);
        if (check.severity === 'critical') {
          safe = false;
        }
      }
    }

    // Check for DELETE with WHERE
    const deleteMatch = sql.match(/\bDELETE\s+FROM\s+\w+/i);
    if (deleteMatch) {
      const afterDelete = sql.substring(sql.indexOf(deleteMatch[0]) + deleteMatch[0].length);
      if (!/\bWHERE\b/i.test(afterDelete.split(';')[0])) {
        safe = false;
        if (!warnings.includes('DELETE without WHERE clause - this will delete ALL rows from the table')) {
          warnings.push('DELETE without WHERE clause detected');
        }
      }
    }

    // Check for UPDATE with WHERE
    const updateMatch = sql.match(/\bUPDATE\s+\w+\s+SET\b/i);
    if (updateMatch) {
      const afterUpdate = sql.substring(sql.indexOf(updateMatch[0]) + updateMatch[0].length);
      if (!/\bWHERE\b/i.test(afterUpdate.split(';')[0])) {
        safe = false;
        if (!warnings.includes('UPDATE without WHERE clause - this will modify ALL rows in the table')) {
          warnings.push('UPDATE without WHERE clause detected');
        }
      }
    }

    // Check for reasonable LIMIT on SELECT
    if (READ_OPERATIONS.test(sql) && !WRITE_OPERATIONS.test(sql)) {
      if (!/\bLIMIT\b/i.test(sql) && !/\bTOP\b/i.test(sql) && !/\bFETCH\s+FIRST\b/i.test(sql)) {
        warnings.push('No LIMIT clause on SELECT query. Consider adding a limit to prevent returning excessive rows.');
      }
    }

    // Check for string concatenation (injection risk)
    if (/\|\||CONCAT\s*\(/i.test(sql) && /['"][^'"]*\+[^'"]*['"]/i.test(sql)) {
      warnings.push('String concatenation detected - ensure values are properly parameterized.');
    }

    logger.info('SQL validation complete', { safe, warningCount: warnings.length });

    return { safe, warnings };
  }

  private extractTableNames(sql: string, schema: SchemaDefinition): string[] {
    const tableNames = schema.tables.map((t) => t.name.toLowerCase());
    const found: Set<string> = new Set();

    for (const table of schema.tables) {
      const regex = new RegExp(`\\b${this.escapeRegExp(table.name)}\\b`, 'i');
      if (regex.test(sql)) {
        found.add(table.name);
      }
    }

    return Array.from(found);
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private suggestOptimizations(sql: string, schema: SchemaDefinition): string[] {
    const suggestions: string[] = [];

    // Check for SELECT *
    if (/\bSELECT\s+\*/i.test(sql)) {
      suggestions.push('Replace SELECT * with explicit column names for better performance and clarity.');
    }

    // Check for missing index hints on large JOINs
    const joinCount = (sql.match(/\bJOIN\b/gi) || []).length;
    if (joinCount >= 3) {
      suggestions.push(
        `Query has ${joinCount} JOINs. Verify that join columns have proper indexes for optimal performance.`
      );
    }

    // Check for subqueries that could be CTEs
    const subqueryCount = (sql.match(/\(\s*SELECT\b/gi) || []).length;
    if (subqueryCount >= 2) {
      suggestions.push(
        'Multiple subqueries detected. Consider using Common Table Expressions (WITH/CTE) for better readability.'
      );
    }

    // Check for LIKE with leading wildcard
    if (/%[^']*'/i.test(sql) || /LIKE\s+'%/i.test(sql)) {
      suggestions.push(
        'LIKE with leading wildcard (%) prevents index usage. Consider full-text search if available.'
      );
    }

    // Check for ORDER BY without LIMIT
    if (/\bORDER\s+BY\b/i.test(sql) && !/\bLIMIT\b/i.test(sql)) {
      suggestions.push(
        'ORDER BY without LIMIT may sort the entire result set. Add LIMIT if only top results are needed.'
      );
    }

    // Check for DISTINCT that might indicate join issues
    if (/\bSELECT\s+DISTINCT\b/i.test(sql)) {
      suggestions.push(
        'DISTINCT detected. Verify that JOINs are correct - DISTINCT may mask duplicate-producing joins.'
      );
    }

    return suggestions;
  }
}
