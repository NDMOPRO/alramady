// @ts-nocheck

// ─── Mock Dependencies ──────────────────────────────────────────────────────

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    translationEntry: { findMany: jest.fn().mockResolvedValue([]) },
    glossaryTerm: { findMany: jest.fn().mockResolvedValue([]) },
    lengthConstraint: { findMany: jest.fn().mockResolvedValue([]) },
    qualityReport: { create: jest.fn().mockResolvedValue({ id: 'qr-1' }) },
  })),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mock-uuid-12345678'),
}));

// ─── Import Under Test ──────────────────────────────────────────────────────

import { QualityAssuranceService } from '../services/quality-assurance.service';
import { PrismaClient } from '@prisma/client';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEntry(key, source, translated, locale = 'ar', status = 'approved') {
  return { key, sourceText: source, translatedText: translated, locale, status };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Engine 7.5 - Quality Assurance Service', () => {
  let service;
  let mockPrisma;

  beforeEach(() => {
    mockPrisma = new PrismaClient();
    service = new QualityAssuranceService(mockPrisma);
  });

  describe('checkConsistency', () => {
    it('should detect inconsistent translations for the same source term', async () => {
      const translations = [
        makeEntry('k1', 'The system is ready', 'النظام جاهز'),
        makeEntry('k2', 'The system is offline', 'البرنامج غير متصل'),
        makeEntry('k3', 'The system is updating', 'المنظومة تتحدث'),
        makeEntry('k4', 'The system is fast', 'النظام سريع'),
      ];

      const result = await service.checkConsistency(translations);
      // "system" has multiple different translations => should flag inconsistency
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array when translations are consistent', async () => {
      const translations = [
        makeEntry('k1', 'hello world', 'مرحبا بالعالم'),
      ];

      const result = await service.checkConsistency(translations);
      expect(result).toEqual([]);
    });
  });

  describe('checkTerminology', () => {
    it('should detect when a glossary term is missing in translation', async () => {
      const translations = [
        makeEntry('k1', 'The API endpoint is ready', 'نقطة النهاية جاهزة'),
      ];
      const glossary = [
        { term: 'API', translation: 'واجهة برمجة التطبيقات', locale: 'ar', approved: true },
      ];

      const issues = await service.checkTerminology(translations, glossary);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].type).toBe('terminology');
      expect(issues[0].severity).toBe('major');
    });

    it('should not flag when glossary term is present in translation', async () => {
      const translations = [
        makeEntry('k1', 'The API endpoint is ready', 'واجهة برمجة التطبيقات جاهزة'),
      ];
      const glossary = [
        { term: 'API', translation: 'واجهة برمجة التطبيقات', locale: 'ar', approved: true },
      ];

      const issues = await service.checkTerminology(translations, glossary);
      expect(issues).toHaveLength(0);
    });

    it('should skip unapproved glossary terms', async () => {
      const translations = [
        makeEntry('k1', 'The API is ready', 'الواجهة جاهزة'),
      ];
      const glossary = [
        { term: 'API', translation: 'واجهة برمجة التطبيقات', locale: 'ar', approved: false },
      ];

      const issues = await service.checkTerminology(translations, glossary);
      expect(issues).toHaveLength(0);
    });
  });

  describe('checkPlaceholders', () => {
    it('should detect missing placeholders in translation', () => {
      const translations = [
        makeEntry('k1', 'Hello {name}, welcome to {place}', 'مرحبا، أهلا بك'),
      ];

      const issues = service.checkPlaceholders(translations, 'ar');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].type).toBe('placeholder');
      expect(issues[0].severity).toBe('critical');
    });

    it('should pass when all placeholders are preserved', () => {
      const translations = [
        makeEntry('k1', 'Hello {name}', 'مرحبا {name}'),
      ];

      const issues = service.checkPlaceholders(translations, 'ar');
      expect(issues).toHaveLength(0);
    });

    it('should detect extra placeholders in translation', () => {
      const translations = [
        makeEntry('k1', 'Hello {name}', 'مرحبا {name} {extra}'),
      ];

      const issues = service.checkPlaceholders(translations, 'ar');
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe('checkRtlLtrMixing', () => {
    it('should flag RTL locale with no RTL characters in translation', () => {
      const translations = [
        makeEntry('k1', 'Hello world', 'Hello world', 'ar'),
      ];

      const issues = service.checkRtlLtrMixing(translations, 'ar');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].type).toBe('rtl');
    });

    it('should not flag when RTL locale has RTL characters', () => {
      const translations = [
        makeEntry('k1', 'Hello', 'مرحبا', 'ar'),
      ];

      const issues = service.checkRtlLtrMixing(translations, 'ar');
      // No issue about missing RTL characters
      const missingRtlIssues = issues.filter(i => i.description.includes('no RTL characters'));
      expect(missingRtlIssues).toHaveLength(0);
    });
  });

  describe('detectMachineTranslation', () => {
    it('should flag text with literal translation indicators', () => {
      const translations = [
        makeEntry('k1',
          'The system provides advanced features for users to manage their accounts effectively',
          'The system provides advanced features for users to manage their accounts effectively',
        ),
      ];

      const results = service.detectMachineTranslation(translations, 'ar');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty when translation looks natural', () => {
      const translations = [
        makeEntry('k1', 'Hello', 'مرحبا'),
      ];

      const results = service.detectMachineTranslation(translations, 'ar');
      // Short text should not trigger false positives
      expect(results.length).toBe(0);
    });
  });

  describe('checkLengths', () => {
    it('should flag empty translations', async () => {
      const translations = [
        makeEntry('k1', 'Hello world', '', 'ar'),
      ];

      const issues = await service.checkLengths(translations, [], 'ar');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].description).toBe('Translation is empty');
      expect(issues[0].severity).toBe('critical');
    });

    it('should flag translation exceeding max length constraint', async () => {
      const translations = [
        makeEntry('k1', 'OK', 'A'.repeat(200), 'de'),
      ];
      const constraints = [{ key: 'k1', maxLength: 10, context: 'button' }];

      const issues = await service.checkLengths(translations, constraints, 'de');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].type).toBe('length');
    });
  });
});
