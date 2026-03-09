// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest, describe, it, expect } from '@jest/globals';

const mockOpenAIResponse = {
  choices: [{
    message: {
      content: JSON.stringify({
        title: 'Test Presentation',
        theme: { primaryColor: '#1a73e8', secondaryColor: '#ffffff', fontFamily: 'Arial', backgroundColor: '#ffffff' },
        sections: [{ heading: 'Section 1', content: 'Content 1' }],
        slides: [
          { layout: 'title', title: 'Test Title', subtitle: 'Test Subtitle', notes: 'Notes' },
          { layout: 'content', title: 'Slide 2', body: 'Body text', notes: 'Notes 2' },
        ],
        fullText: 'Extracted text from document',
        summary: 'Video summary content',
        keyPoints: ['point1', 'point2'],
        description: 'Image description',
        dataInsights: ['insight1'],
        chartSuggestions: [],
      }),
    },
  }],
  usage: { total_tokens: 100 },
};

// Mock OpenAI
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn().mockResolvedValue(mockOpenAIResponse as any) } },
  })),
}));

// Mock Prisma - the service uses require('@prisma/client')
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    presentation: {
      create: jest.fn().mockResolvedValue({ id: 'pres-1', name: 'Test', theme: '{}', width: 10, height: 7.5 }),
      findUnique: jest.fn().mockResolvedValue({ id: 'pres-1', name: 'Test', theme: '{}' }),
      update: jest.fn().mockResolvedValue({ id: 'pres-1' }),
    },
    slide: {
      create: jest.fn().mockResolvedValue({ id: 'slide-1', slideIndex: 0, layout: 'content' }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    dataset: { findUnique: jest.fn().mockResolvedValue(null) },
  })),
}));

// Mock sharp - the service uses require('sharp')
jest.mock('sharp', () => {
  const inst = {
    resize: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-image')),
    metadata: jest.fn().mockResolvedValue({ width: 800, height: 600, format: 'png' }),
  };
  return jest.fn().mockReturnValue(inst);
});

// Mock slide-builder
jest.mock('../services/slide-builder.service.js', () => ({
  createPresentation: jest.fn().mockResolvedValue({ id: 'pres-1', name: 'Test', theme: {}, slides: [] }),
  addSlide: jest.fn().mockResolvedValue({ id: 'slide-1', slideIndex: 0, layout: 'content', elements: [] }),
  addChart: jest.fn().mockResolvedValue({ elementId: 'chart-1' }),
  addImage: jest.fn().mockResolvedValue({ elementId: 'img-1' }),
}));

// Import after mocks
import * as sourceProcessor from '../services/source-processor.service.js';

describe('Source Processor Service', () => {
  describe('processSource', () => {
    it('should process text source', async () => {
      const result = await sourceProcessor.processSource({
        type: 'text',
        content: 'This is a test presentation about AI technology and its impact on business',
      });

      expect(result.sourceType).toBe('text');
      expect(result.extractedText).toContain('AI technology');
      expect(result.sections.length).toBeGreaterThan(0);
      expect(result.metadata).toHaveProperty('charCount');
      expect(result.metadata).toHaveProperty('wordCount');
    });

    it('should throw on empty text', async () => {
      await expect(sourceProcessor.processSource({ type: 'text', content: '' }))
        .rejects.toThrow('Text content is empty');
    });

    it('should process JSON source', async () => {
      const jsonData = JSON.stringify({
        sales: [
          { month: 'Jan', revenue: 10000 },
          { month: 'Feb', revenue: 15000 },
        ],
      });

      const result = await sourceProcessor.processSource({
        type: 'json',
        content: jsonData,
      });

      expect(result.sourceType).toBe('json');
      expect(result.sections.length).toBeGreaterThanOrEqual(0);
    });

    it('should process CSV source', async () => {
      const csv = 'Name,Age,City\nAlice,30,Riyadh\nBob,25,Jeddah\nCarol,35,Dammam';

      const result = await sourceProcessor.processSource({
        type: 'csv',
        content: csv,
      });

      expect(result.sourceType).toBe('csv');
      expect(result.metadata).toHaveProperty('headers');
      expect(result.metadata).toHaveProperty('rowCount');
      expect((result.metadata as any).headers).toContain('Name');
      expect((result.metadata as any).rowCount).toBe(3);
    });

    it('should process markdown source', async () => {
      const md = `# Main Title\n\nIntroduction paragraph.\n\n## Section 1\n\nContent of section 1.\n\n## Section 2\n\nContent of section 2.`;

      const result = await sourceProcessor.processSource({
        type: 'markdown',
        content: md,
      });

      expect(result.sourceType).toBe('markdown');
      expect(result.title).toBe('Main Title');
      expect(result.sections.length).toBeGreaterThanOrEqual(2);
    });

    it('should process HTML source', async () => {
      const html = '<html><head><title>Test Page</title></head><body><h1>Hello World</h1><p>Test content here.</p></body></html>';

      const result = await sourceProcessor.processSource({
        type: 'html',
        content: html,
      });

      expect(result.sourceType).toBe('html');
      expect(result.title).toBe('Test Page');
      expect(result.extractedText).toContain('Hello World');
    });

    it('should process email source', async () => {
      const email = `From: sender@example.com\nTo: recipient@example.com\nSubject: Q4 Results\nDate: 2026-01-15\n\nDear team,\n\nHere are the Q4 results.\n\nBest regards`;

      const result = await sourceProcessor.processSource({
        type: 'email',
        content: email,
      });

      expect(result.sourceType).toBe('email');
      expect(result.title).toBe('Q4 Results');
      expect((result.metadata as any).from).toBe('sender@example.com');
      expect((result.metadata as any).to).toBe('recipient@example.com');
    });

    it('should process image source', async () => {
      const result = await sourceProcessor.processSource({
        type: 'image',
        fileBuffer: Buffer.from('fake-image-data'),
      });

      expect(result.sourceType).toBe('image');
      expect(result.mediaAssets.length).toBeGreaterThan(0);
      expect(result.mediaAssets[0].type).toBe('image');
    });

    it('should throw on unsupported source type', async () => {
      await expect(sourceProcessor.processSource({ type: 'unknown' as any }))
        .rejects.toThrow('Unsupported source type');
    });

    it('should require buffer for PDF source', async () => {
      await expect(sourceProcessor.processSource({ type: 'pdf' }))
        .rejects.toThrow('PDF file buffer is required');
    });

    it('should require buffer for Word source', async () => {
      await expect(sourceProcessor.processSource({ type: 'word' }))
        .rejects.toThrow('Word file buffer is required');
    });

    it('should require URL for YouTube source', async () => {
      await expect(sourceProcessor.processSource({ type: 'youtube' }))
        .rejects.toThrow('YouTube URL is required');
    });
  });

  describe('createPresentationFromSource', () => {
    it('should create presentation from text source', async () => {
      const result = await sourceProcessor.createPresentationFromSource(
        { type: 'text', content: 'This is a long text about artificial intelligence and its applications in modern business' },
        { slideCount: 5, style: 'professional', language: 'ar' },
        'tenant-1',
        'user-1'
      );

      expect(result).toHaveProperty('presentationId');
      expect(result).toHaveProperty('slideCount');
      expect(result).toHaveProperty('sourceType', 'text');
    });

    it('should create presentation from JSON data', async () => {
      const result = await sourceProcessor.createPresentationFromSource(
        { type: 'json', content: JSON.stringify({ data: [1, 2, 3] }) },
        { slideCount: 3 },
        'tenant-1',
        'user-1'
      );

      expect(result).toHaveProperty('presentationId');
      expect(result.sourceType).toBe('json');
    });
  });

  describe('createPresentationFromMultipleSources', () => {
    it('should merge multiple sources into one presentation', async () => {
      const result = await sourceProcessor.createPresentationFromMultipleSources(
        [
          { type: 'text', content: 'Source 1: AI overview' },
          { type: 'text', content: 'Source 2: Business impact analysis' },
        ],
        { slideCount: 8 },
        'tenant-1',
        'user-1'
      );

      expect(result).toHaveProperty('presentationId');
      expect(result).toHaveProperty('slideCount');
    });

    it('should throw on empty sources array', async () => {
      await expect(sourceProcessor.createPresentationFromMultipleSources([], {}, 't', 'u'))
        .rejects.toThrow('No sources provided');
    });
  });

  describe('convertReportToPresentation', () => {
    it('should convert operational report to presentation', async () => {
      const result = await sourceProcessor.convertReportToPresentation(
        'Operational report: Q4 2025 saw a 15% increase in production output...',
        'operational',
        { slideCount: 6 },
        'tenant-1',
        'user-1'
      );

      expect(result).toHaveProperty('presentationId');
    });

    it('should convert executive report to presentation', async () => {
      const result = await sourceProcessor.convertReportToPresentation(
        'Executive summary: Revenue grew by 20% year-over-year...',
        'executive',
        {},
        'tenant-1',
        'user-1'
      );

      expect(result).toHaveProperty('presentationId');
    });
  });

  describe('suggestPresentationStructure', () => {
    it('should suggest structure for a topic', async () => {
      const result = await sourceProcessor.suggestPresentationStructure(
        'Digital Transformation in Saudi Arabia',
        'For executive leadership'
      );

      expect(result).toBeDefined();
    });
  });

  describe('YouTube URL parsing', () => {
    it('should process YouTube source with valid URL', async () => {
      const result = await sourceProcessor.processSource({
        type: 'youtube',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });

      expect(result.sourceType).toBe('youtube');
      expect((result.metadata as any).videoId).toBe('dQw4w9WgXcQ');
    });

    it('should handle short YouTube URLs', async () => {
      const result = await sourceProcessor.processSource({
        type: 'youtube',
        url: 'https://youtu.be/dQw4w9WgXcQ',
      });

      expect((result.metadata as any).videoId).toBe('dQw4w9WgXcQ');
    });

    it('should reject invalid YouTube URLs', async () => {
      await expect(sourceProcessor.processSource({
        type: 'youtube',
        url: 'https://example.com/not-youtube',
      })).rejects.toThrow('Invalid YouTube URL');
    });
  });
});
