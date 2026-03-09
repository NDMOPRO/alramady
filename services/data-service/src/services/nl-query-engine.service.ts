import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { SqlQueryEngineService } from './sql-query-engine.service';
import crypto from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────

interface NlQueryResult {
  generatedSql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  confidence: number;
  explanation: string;
}

interface QuerySuggestion {
  question: string;
  description: string;
  category: 'aggregation' | 'filtering' | 'comparison' | 'trend' | 'distribution';
}

interface ExplainResult {
  narrative: string;
  keyFindings: string[];
  recommendations: string[];
}

interface DatasetSchema {
  datasetId: string;
  name: string;
  columns: Array<{
    name: string;
    dataType: string | null;
    sampleValues: unknown[];
    nullCount: number;
    uniqueCount: number;
  }>;
  rowCount: number;
}

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ─── Service ───────────────────────────────────────────────────────

export class NlQueryEngineService {
  private prisma: PrismaClient;
  private sqlEngine: SqlQueryEngineService;
  private openaiApiKey: string;
  private openaiModel: string;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.sqlEngine = new SqlQueryEngineService(prisma);
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';
  }

  async query(
    naturalLanguage: string,
    datasetId: string,
    tenantId: string
  ): Promise<NlQueryResult> {
    logger.info('Processing natural language query', { naturalLanguage, datasetId, tenantId });
    const startTime = Date.now();

    // Get dataset schema
    const schema = await this.getDatasetSchema(datasetId, tenantId);

    // Generate SQL from natural language
    const { sql, confidence, explanation } = await this.generateSql(naturalLanguage, schema);

    // Execute the generated SQL
    const queryResult = await this.sqlEngine.executeQuery(sql, tenantId);

    // Audit
    await this.logAudit(tenantId, 'nl_query_execute', JSON.stringify({
      question: naturalLanguage,
      generatedSql: sql,
      datasetId,
    }));

    return {
      generatedSql: sql,
      columns: queryResult.columns,
      rows: queryResult.rows,
      rowCount: queryResult.rowCount,
      executionTimeMs: Date.now() - startTime,
      confidence,
      explanation,
    };
  }

  async suggestQueries(datasetId: string, tenantId: string): Promise<QuerySuggestion[]> {
    logger.info('Generating query suggestions', { datasetId, tenantId });

    const schema = await this.getDatasetSchema(datasetId, tenantId);

    const systemPrompt = `أنت مساعد تحليل بيانات متخصص. بناءً على مخطط البيانات التالي، اقترح 8 أسئلة تحليلية مفيدة باللغة العربية.

أعد الإجابة بصيغة JSON array فقط بدون أي نص إضافي. كل عنصر يحتوي على:
- question: السؤال بالعربية
- description: وصف مختصر لما سيكشفه السؤال
- category: واحد من (aggregation, filtering, comparison, trend, distribution)

مخطط البيانات:
اسم الجدول: ${schema.name}
عدد الصفوف: ${schema.rowCount}
الأعمدة:
${schema.columns.map(c => `- ${c.name} (${c.dataType || 'text'}): ${c.sampleValues.slice(0, 3).join(', ')}`).join('\n')}`;

    const response = await this.callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'اقترح أسئلة تحليلية مفيدة لهذه البيانات' },
    ]);

    try {
      const jsonStr = this.extractJson(response);
      const suggestions = JSON.parse(jsonStr) as QuerySuggestion[];
      return suggestions.slice(0, 10);
    } catch {
      // Return static fallback suggestions based on schema
      return this.generateFallbackSuggestions(schema);
    }
  }

  async explainResults(
    queryDescription: string,
    results: Record<string, unknown>[],
    tenantId: string
  ): Promise<ExplainResult> {
    logger.info('Explaining query results', { queryDescription, resultCount: results.length, tenantId });

    const sampleResults = results.slice(0, 20);
    const columns = sampleResults.length > 0 ? Object.keys(sampleResults[0]) : [];

    const systemPrompt = `أنت محلل بيانات متخصص. حلل نتائج الاستعلام التالية وقدم شرحاً باللغة العربية.

أعد الإجابة بصيغة JSON فقط بدون أي نص إضافي:
{
  "narrative": "شرح تفصيلي للنتائج (3-5 جمل)",
  "keyFindings": ["اكتشاف 1", "اكتشاف 2", ...],
  "recommendations": ["توصية 1", "توصية 2", ...]
}`;

    const userContent = `السؤال: ${queryDescription}
الأعمدة: ${columns.join(', ')}
عدد النتائج: ${results.length}
عينة من النتائج:
${JSON.stringify(sampleResults, null, 2)}`;

    const response = await this.callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ]);

    try {
      const jsonStr = this.extractJson(response);
      const parsed = JSON.parse(jsonStr) as ExplainResult;
      return {
        narrative: String(parsed.narrative || ''),
        keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings.map(String) : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
      };
    } catch {
      return {
        narrative: `تم العثور على ${results.length} نتيجة للاستعلام "${queryDescription}".`,
        keyFindings: [`عدد النتائج: ${results.length}`, `عدد الأعمدة: ${columns.length}`],
        recommendations: ['قم بتصفية النتائج للحصول على رؤى أكثر تفصيلاً'],
      };
    }
  }

  // ─── Private methods ───────────────────────────────────────────

  private async getDatasetSchema(datasetId: string, tenantId: string): Promise<DatasetSchema> {
    const dataset = await this.prisma.dataset.findFirst({
      where: { id: datasetId, tenantId },
      include: {
        columns: { orderBy: { position: 'asc' } },
      },
    });

    if (!dataset) throw new Error(`Dataset '${datasetId}' not found`);

    // Get sample rows for value inspection
    const sampleRows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      take: 100,
      select: { data: true },
    });

    const rowData = sampleRows.map(r => r.data as Record<string, unknown>);

    const columnSchemas = dataset.columns.map(col => {
      const values = rowData.map(r => r[col.name]);
      const nonNullValues = values.filter(v => v !== null && v !== undefined);
      const uniqueValues = new Set(nonNullValues.map(String));

      return {
        name: col.name,
        dataType: col.dataType,
        sampleValues: nonNullValues.slice(0, 5),
        nullCount: values.length - nonNullValues.length,
        uniqueCount: uniqueValues.size,
      };
    });

    return {
      datasetId,
      name: dataset.name,
      columns: columnSchemas,
      rowCount: dataset.rowCount ? Number(dataset.rowCount) : rowData.length,
    };
  }

  private async generateSql(
    naturalLanguage: string,
    schema: DatasetSchema
  ): Promise<{ sql: string; confidence: number; explanation: string }> {
    const systemPrompt = `أنت محرك تحويل من اللغة الطبيعية إلى SQL. حوّل السؤال إلى استعلام SQL.

القواعد:
1. استخدم فقط SELECT statements
2. اسم الجدول هو: "${schema.name}"
3. الأعمدة المتاحة:
${schema.columns.map(c => `   - "${c.name}" (${c.dataType || 'text'})`).join('\n')}
4. لا تستخدم أعمدة غير موجودة في المخطط
5. استخدم دوال التجميع (COUNT, SUM, AVG, MIN, MAX) حسب الحاجة
6. يدعم المحرك: SELECT, FROM, WHERE, GROUP BY, ORDER BY, HAVING, LIMIT, JOIN, DISTINCT, LIKE, IN, BETWEEN, IS NULL

أعد الإجابة بصيغة JSON فقط:
{
  "sql": "SELECT ...",
  "confidence": 0.0-1.0,
  "explanation": "شرح مختصر بالعربية"
}`;

    const response = await this.callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: naturalLanguage },
    ]);

    try {
      const jsonStr = this.extractJson(response);
      const parsed = JSON.parse(jsonStr) as { sql: string; confidence: number; explanation: string };

      // Validate the generated SQL
      const validation = this.sqlEngine.validateQuery(parsed.sql);
      if (!validation.valid) {
        throw new Error(`Generated SQL is invalid: ${validation.errors.join('; ')}`);
      }

      return {
        sql: String(parsed.sql),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        explanation: String(parsed.explanation || ''),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Failed to generate SQL from NL', { error: message, naturalLanguage });

      // Attempt a simple fallback
      const fallbackSql = this.generateFallbackSql(naturalLanguage, schema);
      return {
        sql: fallbackSql,
        confidence: 0.3,
        explanation: 'تم إنشاء استعلام بسيط كبديل',
      };
    }
  }

  private generateFallbackSql(question: string, schema: DatasetSchema): string {
    const tableName = schema.name;
    const lower = question.toLowerCase();

    // Count-related questions
    if (lower.includes('كم') || lower.includes('عدد') || lower.includes('count') || lower.includes('how many')) {
      return `SELECT COUNT(*) AS total FROM "${tableName}" LIMIT 1000`;
    }

    // Average-related
    if (lower.includes('متوسط') || lower.includes('average') || lower.includes('avg')) {
      const numCol = schema.columns.find(c =>
        c.dataType === 'number' || c.dataType === 'integer' || c.dataType === 'float' || c.dataType === 'decimal'
      );
      if (numCol) {
        return `SELECT AVG("${numCol.name}") AS average FROM "${tableName}" LIMIT 1000`;
      }
    }

    // Top/max related
    if (lower.includes('أعلى') || lower.includes('أكبر') || lower.includes('top') || lower.includes('max') || lower.includes('highest')) {
      const numCol = schema.columns.find(c =>
        c.dataType === 'number' || c.dataType === 'integer' || c.dataType === 'float'
      );
      if (numCol) {
        return `SELECT * FROM "${tableName}" ORDER BY "${numCol.name}" DESC LIMIT 10`;
      }
    }

    // Default: return first rows
    return `SELECT * FROM "${tableName}" LIMIT 100`;
  }

  private generateFallbackSuggestions(schema: DatasetSchema): QuerySuggestion[] {
    const suggestions: QuerySuggestion[] = [];
    const numericCols = schema.columns.filter(c =>
      c.dataType === 'number' || c.dataType === 'integer' || c.dataType === 'float' || c.dataType === 'decimal'
    );
    const textCols = schema.columns.filter(c =>
      c.dataType === 'text' || c.dataType === 'string' || c.dataType === 'varchar'
    );

    suggestions.push({
      question: `ما هو إجمالي عدد السجلات في ${schema.name}؟`,
      description: 'حساب العدد الإجمالي للسجلات',
      category: 'aggregation',
    });

    if (numericCols.length > 0) {
      suggestions.push({
        question: `ما هو متوسط ${numericCols[0].name}؟`,
        description: `حساب المتوسط الحسابي لعمود ${numericCols[0].name}`,
        category: 'aggregation',
      });
      suggestions.push({
        question: `ما هي أعلى 10 قيم في ${numericCols[0].name}؟`,
        description: 'عرض القيم الأعلى مرتبة تنازلياً',
        category: 'filtering',
      });
    }

    if (textCols.length > 0) {
      suggestions.push({
        question: `ما هي القيم الفريدة في ${textCols[0].name}؟`,
        description: 'عرض القيم الفريدة وتكرارها',
        category: 'distribution',
      });
    }

    if (numericCols.length > 0 && textCols.length > 0) {
      suggestions.push({
        question: `ما هو مجموع ${numericCols[0].name} لكل ${textCols[0].name}؟`,
        description: 'تجميع البيانات حسب الفئات',
        category: 'comparison',
      });
    }

    suggestions.push({
      question: `ما هي السجلات التي تحتوي على قيم فارغة؟`,
      description: 'البحث عن البيانات الناقصة',
      category: 'filtering',
    });

    return suggestions;
  }

  private async callOpenAI(messages: OpenAIChatMessage[]): Promise<string> {
    if (!this.openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    const requestBody = {
      model: this.openaiModel,
      messages,
      temperature: 0.1,
      max_tokens: 2000,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as OpenAIChatResponse;

    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response from OpenAI');
    }

    return data.choices[0].message.content;
  }

  private extractJson(text: string): string {
    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try to find JSON array or object
    const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }

    return text.trim();
  }

  private async logAudit(tenantId: string, action: string, details: string): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          userId: '00000000-0000-0000-0000-000000000000',
          action,
          entityType: 'dataset',
          detailsJson: { action, details, timestamp: new Date().toISOString() },
        },
      });
    } catch (err) {
      logger.warn('Failed to write audit log', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
