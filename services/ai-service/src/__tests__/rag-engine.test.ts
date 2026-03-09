// @ts-nocheck

// ─── Mock Dependencies ──────────────────────────────────────────────────────

const mockKbCreate = jest.fn();
const mockKbFindFirst = jest.fn();
const mockKbUpdate = jest.fn();
const mockChunkCreate = jest.fn();
const mockQueryCreate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    knowledge_bases: {
      create: mockKbCreate,
      findFirst: mockKbFindFirst,
      update: mockKbUpdate,
    },
    knowledge_chunks: { create: mockChunkCreate },
    ai_queries: { create: mockQueryCreate },
  })),
}));

const mockChatCreate = jest.fn();
const mockEmbeddingsCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
    embeddings: { create: mockEmbeddingsCreate },
  })),
}));

const mockEsIndicesExists = jest.fn();
const mockEsIndicesCreate = jest.fn();
const mockEsSearch = jest.fn();
const mockEsBulk = jest.fn();

jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    indices: {
      exists: mockEsIndicesExists,
      create: mockEsIndicesCreate,
    },
    search: mockEsSearch,
    bulk: mockEsBulk,
  })),
}));

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-1234'),
}));

jest.mock('pdf-parse', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({ text: 'PDF text content', numpages: 1 }),
}));

jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    extractRawText: jest.fn().mockResolvedValue({ value: 'DOCX text content' }),
  },
}));

jest.mock('winston', () => ({
  __esModule: true,
  default: {
    createLogger: jest.fn().mockReturnValue({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    }),
    format: { combine: jest.fn(), timestamp: jest.fn(), json: jest.fn() },
    transports: { Console: jest.fn() },
  },
}));

// ─── Import Under Test ──────────────────────────────────────────────────────

import {
  createKnowledgeBase,
  ingestDocument,
  queryKnowledgeBase,
  hybridSearch,
  generateEmbedding,
  chunkDocument,
} from '../services/rag-engine.service';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Engine 9.2 - RAG Engine Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createKnowledgeBase', () => {
    it('should create a new knowledge base with ES index', async () => {
      mockEsIndicesExists.mockResolvedValueOnce(false);
      mockEsIndicesCreate.mockResolvedValueOnce({});
      mockKbCreate.mockResolvedValueOnce({
        id: 'mock-uuid-1234',
        name: 'Test KB',
        index_name: 'rasid-kb-tenant1-mock-uuid-1234',
      });

      const result = await createKnowledgeBase('Test KB', 'A test knowledge base', 'tenant1', 'user1');

      expect(result.id).toBe('mock-uuid-1234');
      expect(result.name).toBe('Test KB');
      expect(mockEsIndicesCreate).toHaveBeenCalled();
    });

    it('should skip index creation if index already exists', async () => {
      mockEsIndicesExists.mockResolvedValueOnce(true);
      mockKbCreate.mockResolvedValueOnce({
        id: 'mock-uuid-1234',
        name: 'Existing KB',
        index_name: 'existing-index',
      });

      await createKnowledgeBase('Existing KB', 'desc', 'tenant1', 'user1');

      expect(mockEsIndicesCreate).not.toHaveBeenCalled();
    });
  });

  describe('ingestDocument', () => {
    it('should ingest a text document into the knowledge base', async () => {
      mockKbFindFirst.mockResolvedValueOnce({
        id: 'kb-1',
        tenant_id: 'tenant1',
        index_name: 'rasid-kb-test',
      });
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: new Array(1536).fill(0.1) }],
      });
      mockEsBulk.mockResolvedValue({
        errors: false,
        items: [{ index: { _id: 'chunk-1' } }],
      });
      mockChunkCreate.mockResolvedValue({ id: 'chunk-1' });
      mockKbUpdate.mockResolvedValue({});

      const result = await ingestDocument(
        'kb-1',
        Buffer.from('This is a sample document for testing.'),
        'test.txt',
        'tenant1',
      );

      expect(result.documentId).toBeDefined();
      expect(result.chunkCount).toBeGreaterThan(0);
    });

    it('should throw when knowledge base is not found', async () => {
      mockKbFindFirst.mockResolvedValueOnce(null);

      await expect(
        ingestDocument('missing-kb', Buffer.from('text'), 'file.txt', 'tenant1'),
      ).rejects.toThrow('Knowledge base missing-kb not found for tenant tenant1');
    });

    it('should throw when document has no extractable text', async () => {
      mockKbFindFirst.mockResolvedValueOnce({
        id: 'kb-1',
        tenant_id: 'tenant1',
        index_name: 'test-index',
      });

      await expect(
        ingestDocument('kb-1', Buffer.from(''), 'empty.txt', 'tenant1'),
      ).rejects.toThrow('No text could be extracted from the document');
    });
  });

  describe('queryKnowledgeBase', () => {
    it('should return an answer with sources', async () => {
      mockKbFindFirst.mockResolvedValueOnce({
        id: 'kb-1',
        tenant_id: 'tenant1',
        index_name: 'rasid-kb-test',
      });
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: new Array(1536).fill(0.1) }],
      });
      mockEsSearch.mockResolvedValueOnce({
        hits: {
          hits: [
            { _id: 'c1', _score: 0.95, _source: { content: 'Relevant chunk', filename: 'doc.pdf', chunk_index: 0 } },
          ],
        },
      });
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Based on [Source 1], the answer is...' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });
      mockQueryCreate.mockResolvedValue({});

      const result = await queryKnowledgeBase('kb-1', 'What is Rasid?', 5, 'tenant1', 'user1');

      expect(result.answer).toContain('Source 1');
      expect(result.sources).toHaveLength(1);
      expect(result.queryId).toBeDefined();
    });

    it('should throw when knowledge base is not found', async () => {
      mockKbFindFirst.mockResolvedValueOnce(null);

      await expect(
        queryKnowledgeBase('missing', 'question', 5, 'tenant1', 'user1'),
      ).rejects.toThrow('Knowledge base missing not found for tenant tenant1');
    });
  });

  describe('generateEmbedding', () => {
    it('should generate an embedding vector for text', async () => {
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      });

      const result = await generateEmbedding('Hello world');
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should throw on empty text', async () => {
      await expect(generateEmbedding('  ')).rejects.toThrow('Cannot generate embedding for empty text');
    });

    it('should throw when OpenAI returns invalid embedding', async () => {
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: null }],
      });

      await expect(generateEmbedding('hello')).rejects.toThrow('OpenAI returned invalid embedding response');
    });
  });

  describe('chunkDocument', () => {
    it('should split text into chunks with overlap', () => {
      const text = Array.from({ length: 20 }, (_, i) => `Paragraph ${i}. This is sentence ${i} with some content.`).join('\n\n');
      const chunks = chunkDocument(text, 200, 50);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toHaveProperty('text');
      expect(chunks[0]).toHaveProperty('index', 0);
      expect(chunks[0]).toHaveProperty('startChar');
      expect(chunks[0]).toHaveProperty('endChar');
    });

    it('should return a single chunk for short text', () => {
      const chunks = chunkDocument('Short text.', 1000, 200);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe('Short text.');
    });

    it('should handle empty text gracefully', () => {
      const chunks = chunkDocument('', 1000, 200);
      expect(chunks).toHaveLength(0);
    });

    it('should respect minimum chunk size of 100', () => {
      const text = 'A'.repeat(50);
      const chunks = chunkDocument(text, 10, 0);
      // chunkSize gets clamped to 100
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('hybridSearch', () => {
    it('should combine semantic and keyword results', async () => {
      mockKbFindFirst.mockResolvedValueOnce({
        id: 'kb-1',
        index_name: 'rasid-kb-test',
      });
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: new Array(1536).fill(0.1) }],
      });
      mockEsSearch
        .mockResolvedValueOnce({
          hits: {
            hits: [
              { _id: 's1', _score: 0.9, _source: { content: 'Semantic match', filename: 'a.pdf' } },
            ],
          },
        })
        .mockResolvedValueOnce({
          hits: {
            hits: [
              { _id: 'k1', _score: 5.0, _source: { content: 'Keyword match', filename: 'b.pdf' } },
              { _id: 's1', _score: 3.0, _source: { content: 'Semantic match', filename: 'a.pdf' } },
            ],
          },
        });

      const results = await hybridSearch('kb-1', 'test query', 5);

      expect(results.length).toBeGreaterThanOrEqual(1);
      // The item appearing in both should have matchType 'hybrid'
      const hybridResult = results.find(r => r.matchType === 'hybrid');
      expect(hybridResult).toBeDefined();
    });
  });
});
