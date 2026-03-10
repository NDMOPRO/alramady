import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ClassificationResult {
  documentId: string;
  category: string;
  subcategory?: string;
  confidence: number;
  alternativeCategories: { category: string; confidence: number }[];
  language: string;
  processedAt: Date;
}

export interface ExtractionResult {
  documentId: string;
  fields: ExtractedField[];
  tables: ExtractedTable[];
  metadata: Record<string, unknown>;
  confidence: number;
  processingTimeMs: number;
}

export interface ExtractedField {
  name: string;
  value: string;
  type: 'text' | 'number' | 'date' | 'currency' | 'email' | 'phone' | 'address';
  confidence: number;
  location?: { page: number; x: number; y: number; width: number; height: number };
}

export interface ExtractedTable {
  id: string;
  headers: string[];
  rows: string[][];
  confidence: number;
  page: number;
}

export interface SummarizationResult {
  documentId: string;
  summary: string;
  keyPoints: string[];
  wordCount: number;
  originalWordCount: number;
  compressionRatio: number;
  language: string;
}

export interface SentimentResult {
  documentId: string;
  overallSentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  sentimentScore: number;
  sentences: {
    text: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
  }[];
  aspects: {
    aspect: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    mentions: number;
  }[];
}

export interface NamedEntity {
  text: string;
  type: 'person' | 'organization' | 'location' | 'date' | 'money' | 'percentage' | 'product' | 'event';
  confidence: number;
  startOffset: number;
  endOffset: number;
  normalizedValue?: string;
}

export interface NerResult {
  documentId: string;
  entities: NamedEntity[];
  entityCounts: Record<string, number>;
}

export interface SimilarityResult {
  documentId1: string;
  documentId2: string;
  overallSimilarity: number;
  contentSimilarity: number;
  structureSimilarity: number;
  topicSimilarity: number;
  sharedEntities: string[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class DocumentIntelligenceService {
  private openai: OpenAI;
  private readonly MAX_TOKENS = 4000;
  private readonly CLASSIFICATION_CATEGORIES = [
    'invoice', 'contract', 'report', 'letter', 'memo', 'resume',
    'legal', 'financial', 'technical', 'marketing', 'hr', 'general',
  ];

  constructor(private prisma: PrismaClient) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder' || '',
    });
  }

  async classifyDocument(documentId: string, content: string): Promise<ClassificationResult> {
    const truncatedContent = this.truncateContent(content, 3000);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a document classification expert. Classify the document into one of these categories: ${this.CLASSIFICATION_CATEGORIES.join(', ')}. Also detect the language. Respond in JSON format with fields: category, subcategory, confidence (0-1), alternativeCategories (array of {category, confidence}), language.`,
        },
        {
          role: 'user',
          content: `Classify this document:\n\n${truncatedContent}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    const rawResult = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawResult);
    } catch {
      parsed = { category: 'general', confidence: 0.5, alternativeCategories: [], language: 'en' };
    }

    const result: ClassificationResult = {
      documentId,
      category: String(parsed.category || 'general'),
      subcategory: parsed.subcategory ? String(parsed.subcategory) : undefined,
      confidence: Number(parsed.confidence) || 0.5,
      alternativeCategories: Array.isArray(parsed.alternativeCategories)
        ? (parsed.alternativeCategories as { category: string; confidence: number }[]).slice(0, 3)
        : [],
      language: String(parsed.language || 'en'),
      processedAt: new Date(),
    };

    await this.prisma.documentClassification.create({
      data: {
        documentId,
        category: result.category,
        subcategory: result.subcategory || null,
        confidence: result.confidence,
        alternativeCategories: JSON.stringify(result.alternativeCategories),
        language: result.language,
        processedAt: new Date(),
      },
    });

    return result;
  }

  async extractKeyInformation(documentId: string, content: string, fields?: string[]): Promise<ExtractionResult> {
    const startTime = Date.now();
    const truncatedContent = this.truncateContent(content, 3000);

    const fieldPrompt = fields && fields.length > 0
      ? `Extract the following specific fields: ${fields.join(', ')}.`
      : 'Extract all key information including names, dates, amounts, addresses, and any identifiers.';

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a document information extraction expert. ${fieldPrompt} Return JSON with fields array (each with name, value, type, confidence) and tables array (each with headers and rows).`,
        },
        {
          role: 'user',
          content: `Extract key information from this document:\n\n${truncatedContent}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const rawResult = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawResult);
    } catch {
      parsed = { fields: [], tables: [] };
    }

    const extractedFields: ExtractedField[] = (Array.isArray(parsed.fields) ? parsed.fields : []).map(
      (f: Record<string, unknown>) => ({
        name: String(f.name || ''),
        value: String(f.value || ''),
        type: this.inferFieldType(String(f.value || ''), String(f.type || 'text')),
        confidence: Number(f.confidence) || 0.7,
      }),
    );

    const extractedTables: ExtractedTable[] = (Array.isArray(parsed.tables) ? parsed.tables : []).map(
      (t: Record<string, unknown>, idx: number) => ({
        id: `table_${idx}`,
        headers: Array.isArray(t.headers) ? (t.headers as string[]) : [],
        rows: Array.isArray(t.rows) ? (t.rows as string[][]) : [],
        confidence: Number(t.confidence) || 0.7,
        page: Number(t.page) || 1,
      }),
    );

    const processingTimeMs = Date.now() - startTime;
    const overallConfidence = extractedFields.length > 0
      ? extractedFields.reduce((sum, f) => sum + f.confidence, 0) / extractedFields.length
      : 0.5;

    const result: ExtractionResult = {
      documentId,
      fields: extractedFields,
      tables: extractedTables,
      metadata: {
        totalFields: extractedFields.length,
        totalTables: extractedTables.length,
        model: 'gpt-4',
      },
      confidence: Math.round(overallConfidence * 100) / 100,
      processingTimeMs,
    };

    await this.prisma.documentExtraction.create({
      data: {
        documentId,
        fields: JSON.stringify(extractedFields),
        tables: JSON.stringify(extractedTables),
        confidence: result.confidence,
        processingTimeMs,
        processedAt: new Date(),
      },
    });

    return result;
  }

  private inferFieldType(value: string, hintType: string): ExtractedField['type'] {
    if (hintType && ['text', 'number', 'date', 'currency', 'email', 'phone', 'address'].includes(hintType)) {
      return hintType as ExtractedField['type'];
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailPattern.test(value)) return 'email';

    const phonePattern = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
    if (phonePattern.test(value.replace(/\s/g, ''))) return 'phone';

    const currencyPattern = /^[\$\€\£\¥\﷼]?\s?[\d,]+\.?\d*$/;
    if (currencyPattern.test(value)) return 'currency';

    const datePattern = /^\d{1,4}[-\/\.]\d{1,2}[-\/\.]\d{1,4}$/;
    if (datePattern.test(value)) return 'date';

    if (!isNaN(Number(value.replace(/,/g, ''))) && value.trim().length > 0) return 'number';

    return 'text';
  }

  async summarizeDocument(documentId: string, content: string, maxLength?: number): Promise<SummarizationResult> {
    const originalWordCount = content.split(/\s+/).length;
    const targetLength = maxLength || Math.max(50, Math.round(originalWordCount * 0.2));
    const truncatedContent = this.truncateContent(content, 6000);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are an expert document summarizer. Create a concise summary in approximately ${targetLength} words. Also extract 3-7 key points. If the document is in Arabic, summarize in Arabic. Return JSON with fields: summary, keyPoints (array of strings), language.`,
        },
        {
          role: 'user',
          content: `Summarize this document:\n\n${truncatedContent}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const rawResult = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawResult);
    } catch {
      parsed = {
        summary: response.choices[0]?.message?.content || 'Unable to summarize',
        keyPoints: [],
        language: 'en',
      };
    }

    const summary = String(parsed.summary || '');
    const keyPoints = Array.isArray(parsed.keyPoints) ? (parsed.keyPoints as string[]) : [];
    const wordCount = summary.split(/\s+/).length;

    const result: SummarizationResult = {
      documentId,
      summary,
      keyPoints,
      wordCount,
      originalWordCount,
      compressionRatio: originalWordCount > 0 ? Math.round((wordCount / originalWordCount) * 100) / 100 : 0,
      language: String(parsed.language || 'en'),
    };

    await this.prisma.documentSummary.create({
      data: {
        documentId,
        summary: result.summary,
        keyPoints: JSON.stringify(result.keyPoints),
        wordCount: result.wordCount,
        originalWordCount: result.originalWordCount,
        compressionRatio: result.compressionRatio,
        language: result.language,
        processedAt: new Date(),
      },
    });

    return result;
  }

  async analyzeSentiment(documentId: string, content: string): Promise<SentimentResult> {
    const truncatedContent = this.truncateContent(content, 3000);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a sentiment analysis expert. Analyze the sentiment of the document. Return JSON with: overallSentiment (positive/negative/neutral/mixed), sentimentScore (-1 to 1), sentences (array of {text, sentiment, score}), aspects (array of {aspect, sentiment, score, mentions}).`,
        },
        {
          role: 'user',
          content: `Analyze sentiment:\n\n${truncatedContent}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const rawResult = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawResult);
    } catch {
      parsed = { overallSentiment: 'neutral', sentimentScore: 0, sentences: [], aspects: [] };
    }

    const sentences = (Array.isArray(parsed.sentences) ? parsed.sentences : []).map(
      (s: Record<string, unknown>) => ({
        text: String(s.text || ''),
        sentiment: (s.sentiment || 'neutral') as 'positive' | 'negative' | 'neutral',
        score: Number(s.score) || 0,
      }),
    );

    const aspects = (Array.isArray(parsed.aspects) ? parsed.aspects : []).map(
      (a: Record<string, unknown>) => ({
        aspect: String(a.aspect || ''),
        sentiment: (a.sentiment || 'neutral') as 'positive' | 'negative' | 'neutral',
        score: Number(a.score) || 0,
        mentions: Number(a.mentions) || 1,
      }),
    );

    const result: SentimentResult = {
      documentId,
      overallSentiment: (parsed.overallSentiment || 'neutral') as SentimentResult['overallSentiment'],
      sentimentScore: Number(parsed.sentimentScore) || 0,
      sentences,
      aspects,
    };

    await this.prisma.documentSentiment.create({
      data: {
        documentId,
        overallSentiment: result.overallSentiment,
        sentimentScore: result.sentimentScore,
        sentences: JSON.stringify(result.sentences),
        aspects: JSON.stringify(result.aspects),
        processedAt: new Date(),
      },
    });

    return result;
  }

  async extractNamedEntities(documentId: string, content: string): Promise<NerResult> {
    const truncatedContent = this.truncateContent(content, 4000);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a named entity recognition expert. Extract all named entities from the document. Return JSON with entities array, each having: text, type (person/organization/location/date/money/percentage/product/event), confidence (0-1), startOffset, endOffset. For dates and money, include normalizedValue.`,
        },
        {
          role: 'user',
          content: `Extract named entities:\n\n${truncatedContent}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const rawResult = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawResult);
    } catch {
      parsed = { entities: [] };
    }

    const entities: NamedEntity[] = (Array.isArray(parsed.entities) ? parsed.entities : []).map(
      (e: Record<string, unknown>) => ({
        text: String(e.text || ''),
        type: (e.type || 'person') as NamedEntity['type'],
        confidence: Number(e.confidence) || 0.7,
        startOffset: Number(e.startOffset) || 0,
        endOffset: Number(e.endOffset) || 0,
        normalizedValue: e.normalizedValue ? String(e.normalizedValue) : undefined,
      }),
    );

    const entityCounts: Record<string, number> = {};
    for (const entity of entities) {
      entityCounts[entity.type] = (entityCounts[entity.type] || 0) + 1;
    }

    const result: NerResult = { documentId, entities, entityCounts };

    await this.prisma.documentEntities.create({
      data: {
        documentId,
        entities: JSON.stringify(entities),
        entityCounts: JSON.stringify(entityCounts),
        totalEntities: entities.length,
        processedAt: new Date(),
      },
    });

    return result;
  }

  async computeDocumentSimilarity(
    documentId1: string,
    content1: string,
    documentId2: string,
    content2: string,
  ): Promise<SimilarityResult> {
    const truncated1 = this.truncateContent(content1, 2000);
    const truncated2 = this.truncateContent(content2, 2000);

    const [embedding1, embedding2] = await Promise.all([
      this.getEmbedding(truncated1),
      this.getEmbedding(truncated2),
    ]);

    const contentSimilarity = this.cosineSimilarity(embedding1, embedding2);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'Compare two documents and provide: structureSimilarity (0-1), topicSimilarity (0-1), sharedEntities (array of strings). Return JSON.',
        },
        {
          role: 'user',
          content: `Document 1:\n${truncated1.slice(0, 1000)}\n\nDocument 2:\n${truncated2.slice(0, 1000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    const rawResult = response.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawResult);
    } catch {
      parsed = { structureSimilarity: 0.5, topicSimilarity: 0.5, sharedEntities: [] };
    }

    const structureSimilarity = Number(parsed.structureSimilarity) || 0.5;
    const topicSimilarity = Number(parsed.topicSimilarity) || 0.5;
    const sharedEntities = Array.isArray(parsed.sharedEntities) ? (parsed.sharedEntities as string[]) : [];

    const overallSimilarity = contentSimilarity * 0.4 + structureSimilarity * 0.3 + topicSimilarity * 0.3;

    const result: SimilarityResult = {
      documentId1,
      documentId2,
      overallSimilarity: Math.round(overallSimilarity * 100) / 100,
      contentSimilarity: Math.round(contentSimilarity * 100) / 100,
      structureSimilarity: Math.round(structureSimilarity * 100) / 100,
      topicSimilarity: Math.round(topicSimilarity * 100) / 100,
      sharedEntities,
    };

    await this.prisma.documentSimilarity.create({
      data: {
        documentId1,
        documentId2,
        overallSimilarity: result.overallSimilarity,
        contentSimilarity: result.contentSimilarity,
        structureSimilarity: result.structureSimilarity,
        topicSimilarity: result.topicSimilarity,
        sharedEntities: JSON.stringify(sharedEntities),
        computedAt: new Date(),
      },
    });

    return result;
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    return response.data[0]?.embedding || [];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  private truncateContent(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content;

    const firstPart = content.slice(0, Math.floor(maxChars * 0.7));
    const lastPart = content.slice(-Math.floor(maxChars * 0.3));

    return `${firstPart}\n\n[...content truncated...]\n\n${lastPart}`;
  }

  async batchProcess(
    documentIds: string[],
    operation: 'classify' | 'extract' | 'summarize' | 'sentiment' | 'ner',
  ): Promise<{ results: Record<string, unknown>[]; errors: { documentId: string; error: string }[] }> {
    const results: Record<string, unknown>[] = [];
    const errors: { documentId: string; error: string }[] = [];

    const batchSize = 5;
    for (let i = 0; i < documentIds.length; i += batchSize) {
      const batch = documentIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (docId) => {
        try {
          const doc = await this.prisma.document.findUniqueOrThrow({ where: { id: docId } });
          const content = doc.content || '';

          let result: Record<string, unknown>;
          switch (operation) {
            case 'classify':
              result = await this.classifyDocument(docId, content) as unknown as Record<string, unknown>;
              break;
            case 'extract':
              result = await this.extractKeyInformation(docId, content) as unknown as Record<string, unknown>;
              break;
            case 'summarize':
              result = await this.summarizeDocument(docId, content) as unknown as Record<string, unknown>;
              break;
            case 'sentiment':
              result = await this.analyzeSentiment(docId, content) as unknown as Record<string, unknown>;
              break;
            case 'ner':
              result = await this.extractNamedEntities(docId, content) as unknown as Record<string, unknown>;
              break;
            default:
              throw new Error(`Unknown operation: ${operation}`);
          }
          results.push(result);
        } catch (err) {
          errors.push({
            documentId: docId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

      await Promise.all(batchPromises);
    }

    return { results, errors };
  }
}
