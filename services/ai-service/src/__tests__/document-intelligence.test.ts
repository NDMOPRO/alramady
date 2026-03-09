// @ts-nocheck

// ─── Mock Dependencies ──────────────────────────────────────────────────────

const mockDbCreate = jest.fn().mockResolvedValue({ id: 'db-1' });
const mockDbFindUniqueOrThrow = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    documentClassification: { create: mockDbCreate },
    documentExtraction: { create: mockDbCreate },
    documentSummary: { create: mockDbCreate },
    documentSentiment: { create: mockDbCreate },
    documentEntities: { create: mockDbCreate },
    documentSimilarity: { create: mockDbCreate },
    document: { findUniqueOrThrow: mockDbFindUniqueOrThrow },
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

// ─── Import Under Test ──────────────────────────────────────────────────────

import { DocumentIntelligenceService } from '../services/document-intelligence.service';
import { PrismaClient } from '@prisma/client';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Engine 9.1 - Document Intelligence Service', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    const mockPrisma = new PrismaClient();
    service = new DocumentIntelligenceService(mockPrisma);
  });

  describe('classifyDocument', () => {
    it('should classify a document and return category with confidence', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              category: 'invoice',
              subcategory: 'purchase_order',
              confidence: 0.95,
              alternativeCategories: [{ category: 'financial', confidence: 0.3 }],
              language: 'en',
            }),
          },
        }],
      });

      const result = await service.classifyDocument('doc-1', 'Invoice #123 - Total: $500.00');

      expect(result.category).toBe('invoice');
      expect(result.confidence).toBe(0.95);
      expect(result.language).toBe('en');
      expect(result.documentId).toBe('doc-1');
      expect(mockDbCreate).toHaveBeenCalled();
    });

    it('should default to general category when parsing fails', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'NOT JSON' } }],
      });

      const result = await service.classifyDocument('doc-2', 'Some content');

      expect(result.category).toBe('general');
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('extractKeyInformation', () => {
    it('should extract fields and tables from document content', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              fields: [
                { name: 'Company', value: 'Rasid Inc', type: 'text', confidence: 0.9 },
                { name: 'Total', value: '$1,500.00', type: 'currency', confidence: 0.85 },
              ],
              tables: [
                { headers: ['Item', 'Qty'], rows: [['Widget', '10']], confidence: 0.8, page: 1 },
              ],
            }),
          },
        }],
      });

      const result = await service.extractKeyInformation('doc-3', 'Company: Rasid Inc\nTotal: $1,500.00');

      expect(result.fields).toHaveLength(2);
      expect(result.tables).toHaveLength(1);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle extraction failure gracefully', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'bad json' } }],
      });

      const result = await service.extractKeyInformation('doc-4', 'Some text');
      expect(result.fields).toHaveLength(0);
      expect(result.tables).toHaveLength(0);
    });

    it('should accept specific fields to extract', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              fields: [{ name: 'email', value: 'test@example.com', type: 'email', confidence: 0.95 }],
              tables: [],
            }),
          },
        }],
      });

      const result = await service.extractKeyInformation('doc-5', 'Contact: test@example.com', ['email']);
      expect(result.fields[0].name).toBe('email');
    });
  });

  describe('summarizeDocument', () => {
    it('should produce a summary with key points', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'This document describes a platform for document management.',
              keyPoints: ['Multi-format support', 'AI integration', 'Arabic support'],
              language: 'en',
            }),
          },
        }],
      });

      const content = 'A '.repeat(200);
      const result = await service.summarizeDocument('doc-6', content);

      expect(result.summary).toContain('platform');
      expect(result.keyPoints).toHaveLength(3);
      expect(result.compressionRatio).toBeGreaterThan(0);
    });
  });

  describe('analyzeSentiment', () => {
    it('should return overall sentiment and sentence-level analysis', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              overallSentiment: 'positive',
              sentimentScore: 0.8,
              sentences: [
                { text: 'Great product!', sentiment: 'positive', score: 0.9 },
              ],
              aspects: [
                { aspect: 'usability', sentiment: 'positive', score: 0.85, mentions: 3 },
              ],
            }),
          },
        }],
      });

      const result = await service.analyzeSentiment('doc-7', 'Great product! Very user-friendly.');

      expect(result.overallSentiment).toBe('positive');
      expect(result.sentimentScore).toBe(0.8);
      expect(result.sentences).toHaveLength(1);
      expect(result.aspects).toHaveLength(1);
    });
  });

  describe('extractNamedEntities', () => {
    it('should extract named entities and return counts by type', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              entities: [
                { text: 'Rasid', type: 'organization', confidence: 0.95, startOffset: 0, endOffset: 5 },
                { text: 'Riyadh', type: 'location', confidence: 0.9, startOffset: 20, endOffset: 26 },
              ],
            }),
          },
        }],
      });

      const result = await service.extractNamedEntities('doc-8', 'Rasid is based in Riyadh, Saudi Arabia.');

      expect(result.entities).toHaveLength(2);
      expect(result.entityCounts.organization).toBe(1);
      expect(result.entityCounts.location).toBe(1);
    });
  });

  describe('computeDocumentSimilarity', () => {
    it('should compute similarity between two documents', async () => {
      mockEmbeddingsCreate
        .mockResolvedValueOnce({ data: [{ embedding: [0.1, 0.2, 0.3] }] })
        .mockResolvedValueOnce({ data: [{ embedding: [0.1, 0.2, 0.3] }] });

      mockChatCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              structureSimilarity: 0.9,
              topicSimilarity: 0.85,
              sharedEntities: ['Rasid'],
            }),
          },
        }],
      });

      const result = await service.computeDocumentSimilarity(
        'doc-A', 'Content of document A about Rasid platform.',
        'doc-B', 'Content of document B about Rasid system.',
      );

      expect(result.overallSimilarity).toBeGreaterThan(0);
      expect(result.contentSimilarity).toBeGreaterThan(0);
      expect(result.sharedEntities).toContain('Rasid');
    });
  });

  describe('batchProcess', () => {
    it('should process multiple documents for classification', async () => {
      mockDbFindUniqueOrThrow.mockResolvedValue({ id: 'doc-x', content: 'Test content' });
      mockChatCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              category: 'report',
              confidence: 0.8,
              alternativeCategories: [],
              language: 'en',
            }),
          },
        }],
      });

      const result = await service.batchProcess(['doc-x', 'doc-y'], 'classify');

      expect(result.results.length).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should capture errors for individual documents', async () => {
      mockDbFindUniqueOrThrow.mockRejectedValue(new Error('Not found'));

      const result = await service.batchProcess(['missing-doc'], 'classify');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].documentId).toBe('missing-doc');
    });
  });
});
