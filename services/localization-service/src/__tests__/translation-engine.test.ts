// @ts-nocheck

// ─── Mock Dependencies ──────────────────────────────────────────────────────

const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockQueryRawUnsafe = jest.fn();
const mockExecuteRawUnsafe = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    glossaryTerm: { findMany: mockFindMany },
    localizationJob: {
      create: mockCreate,
      update: mockUpdate,
    },
    document: { findFirst: mockFindFirst },
    $queryRawUnsafe: mockQueryRawUnsafe,
    $executeRawUnsafe: mockExecuteRawUnsafe,
  })),
}));

const mockChatCompletionsCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCompletionsCreate } },
  })),
}));

jest.mock('winston', () => ({
  __esModule: true,
  default: {
    createLogger: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      json: jest.fn(),
    },
    transports: { Console: jest.fn() },
  },
}));

// ─── Import Under Test ──────────────────────────────────────────────────────

import {
  translateText,
  translateDocument,
  translateBatch,
  detectLanguage,
  getTranslationMemory,
  addToTranslationMemory,
} from '../services/translation-engine.service';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Engine 7.1 - Translation Engine Service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('translateText', () => {
    it('should return cached translation when translation memory has an exact match', async () => {
      mockQueryRawUnsafe.mockResolvedValueOnce([
        { sourceText: 'Hello', targetText: 'مرحبا', createdAt: new Date() },
      ]);

      const result = await translateText('Hello', 'en', 'ar');

      expect(result.translatedText).toBe('مرحبا');
      expect(result.glossaryApplied).toBe(false);
      expect(result.sourceLang).toBe('en');
      expect(result.targetLang).toBe('ar');
    });

    it('should call OpenAI when no translation memory exists', async () => {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([]) // exact TM match
        .mockResolvedValueOnce([]) // fuzzy TM match
        .mockResolvedValueOnce([]) // duplicate TM match
        .mockResolvedValueOnce([{ id: 'tm-1' }]); // insert translation memory
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'مرحبا بالعالم' } }],
      });

      const result = await translateText('Hello world', 'en', 'ar');

      expect(result.translatedText).toBe('مرحبا بالعالم');
      expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(1);
    });

    it('should apply glossary terms when glossaryId is provided', async () => {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([]) // exact TM match
        .mockResolvedValueOnce([]) // fuzzy TM match
        .mockResolvedValueOnce([ // glossary terms
          { term: 'API', translations: { ar: 'واجهة برمجة التطبيقات' }, context: null },
        ])
        .mockResolvedValueOnce([]) // duplicate TM match
        .mockResolvedValueOnce([{ id: 'tm-2' }]); // insert translation memory
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'واجهة برمجة التطبيقات جاهزة' } }],
      });

      const result = await translateText('API is ready', 'en', 'ar', 'glossary-1');

      expect(result.glossaryApplied).toBe(true);
    });

    it('should throw an error when OpenAI returns empty content', async () => {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([]) // exact TM match
        .mockResolvedValueOnce([]); // fuzzy TM match
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '' } }],
      });

      await expect(translateText('Hello', 'en', 'ar')).rejects.toThrow(
        'Translation failed: empty response from OpenAI',
      );
    });
  });

  describe('translateBatch', () => {
    it('should translate multiple texts in a single call', async () => {
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '[1] مرحبا\n[2] وداعا' } }],
      });
      mockQueryRawUnsafe
        .mockResolvedValueOnce([]) // existing TM for first item
        .mockResolvedValueOnce([{ id: 'tm-batch-1' }]) // insert first item
        .mockResolvedValueOnce([]) // existing TM for second item
        .mockResolvedValueOnce([{ id: 'tm-batch-2' }]); // insert second item

      const result = await translateBatch(['Hello', 'Goodbye'], 'en', 'ar');

      expect(result.translations).toHaveLength(2);
      expect(result.translations[0].translated).toBe('مرحبا');
      expect(result.translations[1].translated).toBe('وداعا');
    });

    it('should throw when texts array is empty', async () => {
      await expect(translateBatch([], 'en', 'ar')).rejects.toThrow(
        'Batch translation requires at least one text',
      );
    });

    it('should throw when OpenAI returns empty batch response', async () => {
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null } }],
      });

      await expect(translateBatch(['Hello'], 'en', 'ar')).rejects.toThrow(
        'Batch translation failed: empty response from OpenAI',
      );
    });
  });

  describe('detectLanguage', () => {
    it('should detect language from text via OpenAI', async () => {
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"language":"ar","confidence":0.98,"script":"Arabic"}' } }],
      });

      const result = await detectLanguage('مرحبا بالعالم');

      expect(result.language).toBe('ar');
      expect(result.confidence).toBe(0.98);
      expect(result.script).toBe('Arabic');
    });

    it('should throw when given empty text', async () => {
      await expect(detectLanguage('   ')).rejects.toThrow(
        'Cannot detect language of empty text',
      );
    });

    it('should throw when OpenAI response cannot be parsed', async () => {
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'INVALID' } }],
      });

      await expect(detectLanguage('hello')).rejects.toThrow(
        'Language detection failed: could not parse OpenAI response',
      );
    });
  });

  describe('addToTranslationMemory', () => {
    it('should create a new entry when no duplicate exists', async () => {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'new-tm-1' }]);

      const result = await addToTranslationMemory('Hello', 'مرحبا', 'en', 'ar');

      expect(result.id).toBe('new-tm-1');
      expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(2);
    });

    it('should increment usage count when duplicate exists', async () => {
      mockQueryRawUnsafe.mockResolvedValueOnce([{ id: 'existing-tm' }]);
      mockExecuteRawUnsafe.mockResolvedValueOnce(1);

      const result = await addToTranslationMemory('Hello', 'مرحبا', 'en', 'ar');

      expect(result.id).toBe('existing-tm');
      expect(mockExecuteRawUnsafe).toHaveBeenCalled();
    });

    it('should throw when source or target is empty', async () => {
      await expect(addToTranslationMemory('', 'مرحبا', 'en', 'ar')).rejects.toThrow(
        'Source and target text must not be empty',
      );
      await expect(addToTranslationMemory('Hello', '  ', 'en', 'ar')).rejects.toThrow(
        'Source and target text must not be empty',
      );
    });
  });
});
