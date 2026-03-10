import OpenAI from 'openai';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import winston from 'winston';

const prisma = new PrismaClient();
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ai-service', module: 'rag-engine' },
  transports: [new winston.transports.Console()],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const esClient = new ElasticsearchClient({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  auth: process.env.ELASTICSEARCH_API_KEY
    ? { apiKey: process.env.ELASTICSEARCH_API_KEY }
    : undefined,
});

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

export interface KnowledgeBaseSummary {
  id: string;
  name: string;
  description: string;
  indexName: string;
  documentCount: number;
  chunkCount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function createKnowledgeBase(
  name: string,
  description: string,
  tenantId: string,
  userId: string
): Promise<KnowledgeBaseSummary> {
  const kbId = uuidv4();
  const indexName = `rasid-kb-${tenantId}-${kbId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  logger.info('Creating knowledge base', { kbId, name, tenantId, userId, indexName });

  const indexExists = await esClient.indices.exists({ index: indexName });
  if (!indexExists) {
    await esClient.indices.create({
      index: indexName,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
          analysis: {
            analyzer: {
              content_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'stop', 'snowball'],
              },
            },
          },
        },
        mappings: {
          properties: {
            chunk_id: { type: 'keyword' },
            documentId: { type: 'keyword' },
            content: { type: 'text', analyzer: 'content_analyzer' },
            embedding: { type: 'dense_vector', dims: EMBEDDING_DIMENSIONS, index: true, similarity: 'cosine' },
            metadata: { type: 'object', enabled: true },
            chunkIndex: { type: 'integer' },
            filename: { type: 'keyword' },
            createdAt: { type: 'date' },
          },
        },
      },
    });
    logger.info('Elasticsearch index created', { indexName });
  }

  const knowledgeBase = await prisma.knowledgeBase.create({
    data: {
      id: kbId,
      name,
      description,
      tenantId: tenantId,
      createdBy: userId,
      indexName: indexName,
      documentCount: 0,
      chunkCount: 0,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info('Knowledge base created', { kbId, indexName });
  return toKnowledgeBaseSummary(knowledgeBase as Record<string, unknown>);
}

function toKnowledgeBaseSummary(record: Record<string, unknown>): KnowledgeBaseSummary {
  return {
    id: record.id as string,
    name: String(record.name || ''),
    description: String(record.description || ''),
    indexName: String(record.indexName || ''),
    documentCount: Number(record.documentCount || 0),
    chunkCount: Number(record.chunkCount || 0),
    status: String(record.status || 'active'),
    createdAt: record.createdAt as Date,
    updatedAt: record.updatedAt as Date,
  };
}

export async function listKnowledgeBases(tenantId: string): Promise<KnowledgeBaseSummary[]> {
  const items = await prisma.knowledgeBase.findMany({
    where: { tenantId },
    orderBy: { updatedAt: 'desc' },
  });

  return items.map((item) => toKnowledgeBaseSummary(item as Record<string, unknown>));
}

export async function getKnowledgeBase(
  kbId: string,
  tenantId: string
): Promise<KnowledgeBaseSummary | null> {
  const item = await prisma.knowledgeBase.findFirst({
    where: { id: kbId, tenantId },
  });

  if (!item) {
    return null;
  }

  return toKnowledgeBaseSummary(item as Record<string, unknown>);
}

export async function ingestDocument(
  kbId: string,
  document: Buffer,
  filename: string,
  tenantId: string
): Promise<{ documentId: string; chunkCount: number; indexedCount: number }> {
  const documentId = uuidv4();
  const startTime = Date.now();
  logger.info('Ingesting document', { kbId, documentId, filename, tenantId, size: document.length });

  const kb = await prisma.knowledgeBase.findFirst({
    where: { id: kbId, tenantId: tenantId },
  });
  if (!kb) {
    throw new Error(`Knowledge base ${kbId} not found for tenant ${tenantId}`);
  }

  const extension = filename.toLowerCase().split('.').pop() || '';
  let extractedText = '';

  if (extension === 'pdf') {
    const pdfData = await pdfParse(document);
    extractedText = pdfData.text;
    logger.info('PDF text extracted', { pages: pdfData.numpages, textLength: extractedText.length });
  } else if (extension === 'docx' || extension === 'doc') {
    const result = await mammoth.extractRawText({ buffer: document });
    extractedText = result.value;
    logger.info('DOCX text extracted', { textLength: extractedText.length });
  } else if (['txt', 'md', 'csv', 'json', 'xml', 'html'].includes(extension)) {
    extractedText = document.toString('utf-8');
    logger.info('Raw text extracted', { textLength: extractedText.length });
  } else {
    extractedText = document.toString('utf-8');
    logger.warn('Unknown file type, treating as raw text', { extension });
  }

  if (!extractedText || extractedText.trim().length === 0) {
    throw new Error('No text could be extracted from the document');
  }

  const chunks = chunkDocument(extractedText, 1000, 200);
  logger.info('Document chunked', { chunkCount: chunks.length });

  const indexName = (kb as Record<string, unknown>).indexName as string;
  let indexedCount = 0;
  const batchSize = 20;

  for (let batchStart = 0; batchStart < chunks.length; batchStart += batchSize) {
    const batch = chunks.slice(batchStart, batchStart + batchSize);
    const batchTexts = batch.map((c) => c.text);

    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batchTexts,
    });

    const bulkOps: Record<string, unknown>[] = [];
    for (let i = 0; i < batch.length; i++) {
      const chunkId = uuidv4();
      const embedding = embeddingResponse.data[i].embedding;

      bulkOps.push({ index: { _index: indexName, _id: chunkId } });
      bulkOps.push({
        chunk_id: chunkId,
        documentId: documentId,
        content: batch[i].text,
        embedding,
        metadata: { filename, chunkIndex: batch[i].index, totalChunks: chunks.length },
        chunkIndex: batch[i].index,
        filename,
        createdAt: new Date().toISOString(),
      });

      await prisma.knowledgeChunk.create({
        data: {
          id: chunkId,
          knowledgeBaseId: kbId,
          documentId: documentId,
          content: batch[i].text,
          chunkIndex: batch[i].index,
          tokenCount: Math.ceil(batch[i].text.length / 4),
          metadata: JSON.stringify({ filename, totalChunks: chunks.length }),
          createdAt: new Date(),
        },
      });
    }

    if (bulkOps.length > 0) {
      const bulkResult = await esClient.bulk({ body: bulkOps, refresh: 'wait_for' });
      const successCount = bulkResult.items.filter((item) => !(item.index as Record<string, unknown> | undefined)?.error).length;
      indexedCount += successCount;
      if (bulkResult.errors) {
        const errorItems = bulkResult.items.filter((item) => (item.index as Record<string, unknown> | undefined)?.error);
        logger.warn('Some chunks failed to index', { errorCount: errorItems.length });
      }
    }
  }

  await prisma.knowledgeBase.update({
    where: { id: kbId },
    data: {
      documentCount: { increment: 1 },
      chunkCount: { increment: chunks.length },
      updatedAt: new Date(),
    },
  });

  const durationMs = Date.now() - startTime;
  logger.info('Document ingestion complete', { documentId, chunkCount: chunks.length, indexedCount, durationMs });

  return { documentId, chunkCount: chunks.length, indexedCount };
}

export async function queryKnowledgeBase(
  kbId: string,
  question: string,
  topK: number,
  tenantId: string,
  userId: string
): Promise<{ answer: string; sources: Array<{ content: string; filename: string; score: number }>; queryId: string }> {
  const queryId = uuidv4();
  const startTime = Date.now();
  logger.info('Querying knowledge base', { queryId, kbId, tenantId, userId, topK });

  const kb = await prisma.knowledgeBase.findFirst({
    where: { id: kbId, tenantId: tenantId },
  });
  if (!kb) {
    throw new Error(`Knowledge base ${kbId} not found for tenant ${tenantId}`);
  }

  const safeTopK = Math.min(Math.max(1, topK), 20);
  const queryEmbedding = await generateEmbedding(question);
  const indexName = (kb as Record<string, unknown>).indexName as string;

  const searchResult = await esClient.search({
    index: indexName,
    body: {
      size: safeTopK,
      knn: {
        field: 'embedding',
        query_vector: queryEmbedding,
        k: safeTopK,
        num_candidates: safeTopK * 10,
      },
      _source: ['content', 'filename', 'chunk_index', 'document_id'],
    },
  });

  interface ESHit {
    _id: string;
    _score: number | null;
    _source?: Record<string, unknown>;
  }
  const hits = (searchResult.hits?.hits || []) as ESHit[];
  const sources = hits.map((hit) => ({
    content: String(hit._source?.content || ''),
    filename: String(hit._source?.filename || 'unknown'),
    score: typeof hit._score === 'number' ? hit._score : 0,
    chunkIndex: (hit._source?.chunk_index as number) || 0,
  }));

  const contextText = sources
    .map((s, i) => `[Source ${i + 1} - ${s.filename}]:\n${s.content}`)
    .join('\n\n');

  const systemPrompt = `You are a knowledgeable assistant answering questions based on provided context documents.
Rules:
- Answer ONLY based on the provided context. If the context doesn't contain the answer, say so clearly.
- Cite sources by referencing [Source N] when using information from that source.
- Be specific and detailed in your answer.
- If multiple sources provide relevant information, synthesize them coherently.`;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Context:\n${contextText}\n\nQuestion: ${question}` },
    ],
    temperature: 0.2,
    max_tokens: 2000,
  });

  const answer = response.choices[0]?.message?.content || 'No answer generated';
  const durationMs = Date.now() - startTime;
  const totalTokens = response.usage?.total_tokens || 0;

  await prisma.aiQuery.create({
    data: {
      id: queryId,
      tenantId: tenantId,
      userId: userId,
      queryType: 'rag_query',
      inputText: question.substring(0, 2000),
      outputText: answer.substring(0, 5000),
      model: DEFAULT_MODEL,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: totalTokens,
      durationMs: durationMs,
      metadata: JSON.stringify({ kbId, topK: safeTopK, sourcesCount: sources.length }),
      status: 'COMPLETED',
      createdAt: new Date(),
    },
  });

  logger.info('RAG query complete', { queryId, durationMs, sourcesCount: sources.length });
  return { answer, sources, queryId };
}

export async function hybridSearch(
  kbId: string,
  query: string,
  topK: number
): Promise<Array<{ content: string; filename: string; score: number; matchType: string }>> {
  logger.info('Performing hybrid search', { kbId, query: query.substring(0, 100), topK });

  const kb = await prisma.knowledgeBase.findFirst({ where: { id: kbId } });
  if (!kb) {
    throw new Error(`Knowledge base ${kbId} not found`);
  }

  const safeTopK = Math.min(Math.max(1, topK), 50);
  const indexName = (kb as Record<string, unknown>).indexName as string;
  const queryEmbedding = await generateEmbedding(query);

  const [semanticResult, keywordResult] = await Promise.all([
    esClient.search({
      index: indexName,
      body: {
        size: safeTopK,
        knn: {
          field: 'embedding',
          query_vector: queryEmbedding,
          k: safeTopK,
          num_candidates: safeTopK * 10,
        },
        _source: ['content', 'filename', 'chunk_index', 'document_id'],
      },
    }),
    esClient.search({
      index: indexName,
      body: {
        size: safeTopK,
        query: {
          match: {
            content: {
              query,
              analyzer: 'content_analyzer',
              fuzziness: 'AUTO',
            },
          },
        },
        _source: ['content', 'filename', 'chunk_index', 'document_id'],
      },
    }),
  ]);

  interface ESSearchHit {
    _id: string;
    _score: number | null;
    _source?: Record<string, unknown>;
  }
  const semanticHits = (semanticResult.hits?.hits || []) as ESSearchHit[];
  const keywordHits = (keywordResult.hits?.hits || []) as ESSearchHit[];

  const resultMap = new Map<string, { content: string; filename: string; score: number; matchType: string }>();

  const maxSemanticScore = semanticHits.length > 0 ? Math.max(...semanticHits.map((h) => h._score || 0)) : 1;
  const maxKeywordScore = keywordHits.length > 0 ? Math.max(...keywordHits.map((h) => h._score || 0)) : 1;

  for (const hit of semanticHits) {
    const id = hit._id as string;
    const normalizedScore = (hit._score || 0) / (maxSemanticScore || 1);
    resultMap.set(id, {
      content: String(hit._source?.content || ''),
      filename: String(hit._source?.filename || 'unknown'),
      score: normalizedScore * 0.6,
      matchType: 'semantic',
    });
  }

  for (const hit of keywordHits) {
    const id = hit._id as string;
    const normalizedScore = (hit._score || 0) / (maxKeywordScore || 1);
    const existing = resultMap.get(id);
    if (existing) {
      existing.score += normalizedScore * 0.4;
      existing.matchType = 'hybrid';
    } else {
      resultMap.set(id, {
        content: String(hit._source?.content || ''),
        filename: String(hit._source?.filename || 'unknown'),
        score: normalizedScore * 0.4,
        matchType: 'keyword',
      });
    }
  }

  const results = Array.from(resultMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, safeTopK);

  logger.info('Hybrid search complete', { totalResults: results.length, semanticHits: semanticHits.length, keywordHits: keywordHits.length });
  return results;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  logger.debug('Generating embedding', { textLength: text.length });

  const truncated = text.length > 8000 ? text.substring(0, 8000) : text;
  const cleanText = truncated.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

  if (!cleanText) {
    throw new Error('Cannot generate embedding for empty text');
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: cleanText,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('OpenAI returned invalid embedding response');
  }

  logger.debug('Embedding generated', { dimensions: embedding.length });
  return embedding;
}

export function chunkDocument(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): Array<{ text: string; index: number; startChar: number; endChar: number }> {
  logger.debug('Chunking document', { textLength: text.length, chunkSize, overlap });

  const safeChunkSize = Math.max(100, chunkSize);
  const safeOverlap = Math.min(Math.max(0, overlap), Math.floor(safeChunkSize / 2));

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  const chunks: Array<{ text: string; index: number; startChar: number; endChar: number }> = [];
  let currentChunk = '';
  let chunkIndex = 0;
  let currentStartChar = 0;
  let charOffset = 0;

  for (const paragraph of paragraphs) {
    const trimmedPara = paragraph.trim();

    if (currentChunk.length + trimmedPara.length + 1 > safeChunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex,
        startChar: currentStartChar,
        endChar: currentStartChar + currentChunk.trim().length,
      });
      chunkIndex++;

      if (safeOverlap > 0 && currentChunk.length > safeOverlap) {
        const overlapText = currentChunk.slice(-safeOverlap);
        const sentenceBoundary = overlapText.lastIndexOf('. ');
        if (sentenceBoundary > overlapText.length * 0.3) {
          currentChunk = overlapText.substring(sentenceBoundary + 2);
        } else {
          currentChunk = overlapText;
        }
        currentStartChar = charOffset - currentChunk.length;
      } else {
        currentChunk = '';
        currentStartChar = charOffset;
      }
    }

    if (trimmedPara.length > safeChunkSize) {
      if (currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex,
          startChar: currentStartChar,
          endChar: currentStartChar + currentChunk.trim().length,
        });
        chunkIndex++;
        currentChunk = '';
      }

      const sentences = trimmedPara.match(/[^.!?]+[.!?]+\s*/g) || [trimmedPara];
      let sentenceChunk = '';
      const paraStart = charOffset;

      for (const sentence of sentences) {
        if (sentenceChunk.length + sentence.length > safeChunkSize && sentenceChunk.length > 0) {
          chunks.push({
            text: sentenceChunk.trim(),
            index: chunkIndex,
            startChar: paraStart,
            endChar: paraStart + sentenceChunk.trim().length,
          });
          chunkIndex++;
          sentenceChunk = safeOverlap > 0 ? sentenceChunk.slice(-safeOverlap) : '';
        }
        sentenceChunk += sentence;
      }

      if (sentenceChunk.trim().length > 0) {
        currentChunk = sentenceChunk;
        currentStartChar = charOffset;
      }
    } else {
      if (currentChunk.length === 0) {
        currentStartChar = charOffset;
      }
      currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + trimmedPara;
    }

    charOffset += trimmedPara.length + 2;
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
      startChar: currentStartChar,
      endChar: currentStartChar + currentChunk.trim().length,
    });
  }

  if (chunks.length === 0 && text.trim().length > 0) {
    chunks.push({ text: text.trim(), index: 0, startChar: 0, endChar: text.trim().length });
  }

  logger.debug('Chunking complete', { chunkCount: chunks.length });
  return chunks;
}
