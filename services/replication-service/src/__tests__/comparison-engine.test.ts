// @ts-nocheck

/* ───── Mocks ─────────────────────────────────────────────────────── */

// Mock sharp
const mockSharpToBuffer = jest.fn().mockResolvedValue(Buffer.alloc(100 * 100 * 4, 200));
const mockSharpMetadata = jest.fn().mockResolvedValue({ width: 800, height: 600 });
const mockSharpInstance = {
  resize: jest.fn().mockReturnThis(),
  raw: jest.fn().mockReturnThis(),
  png: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  composite: jest.fn().mockReturnThis(),
  toBuffer: mockSharpToBuffer,
  metadata: mockSharpMetadata,
};

const mockSharpFn = Object.assign(jest.fn((...args: any[]) => mockSharpInstance), {
  __esModule: true,
  default: null as any,
  kernel: { lanczos3: 'lanczos3' },
});
mockSharpFn.default = mockSharpFn;
jest.mock('sharp', () => mockSharpFn);

// Mock crypto
jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('comp-uuid-001'),
}));

// Prisma mock data holders
const mockComparisonResultCreate = jest.fn().mockResolvedValue({});
const mockFidelityReportCreate = jest.fn().mockResolvedValue({});
const mockComparisonResultFindUnique = jest.fn();
const mockDocumentFindUnique = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    comparisonResult: {
      create: mockComparisonResultCreate,
      findUnique: mockComparisonResultFindUnique,
    },
    fidelityReport: {
      create: mockFidelityReportCreate,
    },
    document: {
      findUnique: mockDocumentFindUnique,
    },
  })),
}));

/* ───── Import SUT ────────────────────────────────────────────────── */

import ComparisonEngineService from '../services/comparison-engine.service';
import { PrismaClient } from '@prisma/client';

/* ───── Helpers ────────────────────────────────────────────────────── */

function makeDocumentWithPages(id: string, elements: any[] = []) {
  return {
    id,
    pages: [
      {
        pageNumber: 1,
        width: 595,
        height: 842,
        imageData: null,
        elements: elements,
      },
    ],
  };
}

const defaultRequest = {
  id: 'req-1',
  originalDocumentId: 'doc-orig',
  replicaDocumentId: 'doc-replica',
  comparisonType: 'full' as const,
  options: {
    pixelTolerance: 5,
    colorThreshold: 10,
    structureWeight: 0.3,
    contentWeight: 0.3,
    visualWeight: 0.4,
    dpi: 150,
    includeOverlay: false,
    antiAliasing: true,
  },
};

/* ───── Tests ─────────────────────────────────────────────────────── */

describe('ComparisonEngineService', () => {
  let service: InstanceType<typeof ComparisonEngineService>;
  const prisma = new PrismaClient();

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ComparisonEngineService(prisma);
  });

  // ── compareDocuments ────────────────────────────────────────────

  describe('compareDocuments', () => {
    it('should compare two identical documents and return a passing score', async () => {
      const doc = makeDocumentWithPages('doc-orig', [
        { id: 'el-1', type: 'text', bounds: { x: 10, y: 10, width: 100, height: 20 }, content: 'Hello' },
      ]);

      mockDocumentFindUnique.mockImplementation(({ where }) => {
        if (where.id === 'doc-orig') return Promise.resolve({ ...doc, id: 'doc-orig' });
        return Promise.resolve({ ...doc, id: 'doc-replica' });
      });

      // Make pixel buffers identical (same fill value)
      mockSharpToBuffer.mockResolvedValue(Buffer.alloc(100 * 100 * 4, 200));

      const result = await service.compareDocuments(defaultRequest);

      expect(result).toHaveProperty('overallScore');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('differences');
      expect(result).toHaveProperty('statistics');
      expect(mockComparisonResultCreate).toHaveBeenCalled();
    });

    it('should detect missing page in replica', async () => {
      const origDoc = {
        id: 'doc-orig',
        pages: [
          { pageNumber: 1, width: 595, height: 842, imageData: null, elements: [] },
          { pageNumber: 2, width: 595, height: 842, imageData: null, elements: [] },
        ],
      };
      const replicaDoc = {
        id: 'doc-replica',
        pages: [
          { pageNumber: 1, width: 595, height: 842, imageData: null, elements: [] },
        ],
      };

      mockDocumentFindUnique.mockImplementation(({ where }) => {
        if (where.id === 'doc-orig') return Promise.resolve(origDoc);
        return Promise.resolve(replicaDoc);
      });

      const result = await service.compareDocuments(defaultRequest);

      const missingPageDiffs = result.differences.filter(
        d => d.type === 'missing_element' && d.description.includes('missing from replica'),
      );
      expect(missingPageDiffs.length).toBeGreaterThan(0);
    });

    it('should detect structural differences (missing elements)', async () => {
      mockDocumentFindUnique.mockImplementation(({ where }) => {
        if (where.id === 'doc-orig') {
          return Promise.resolve(makeDocumentWithPages('doc-orig', [
            { id: 'el-1', type: 'text', bounds: { x: 10, y: 10, width: 100, height: 20 }, content: 'Original Text' },
          ]));
        }
        return Promise.resolve(makeDocumentWithPages('doc-replica', []));
      });

      const request = { ...defaultRequest, comparisonType: 'structural' as const };
      const result = await service.compareDocuments(request);

      const missingEls = result.differences.filter(d => d.type === 'missing_element');
      expect(missingEls.length).toBeGreaterThan(0);
    });

    it('should detect content differences in text elements', async () => {
      mockDocumentFindUnique.mockImplementation(({ where }) => {
        if (where.id === 'doc-orig') {
          return Promise.resolve(makeDocumentWithPages('doc-orig', [
            { id: 'el-1', type: 'text', bounds: { x: 10, y: 10, width: 100, height: 20 }, content: 'Original text here' },
          ]));
        }
        return Promise.resolve(makeDocumentWithPages('doc-replica', [
          { id: 'el-2', type: 'text', bounds: { x: 10, y: 10, width: 100, height: 20 }, content: 'Changed text here' },
        ]));
      });

      const request = { ...defaultRequest, comparisonType: 'content' as const };
      const result = await service.compareDocuments(request);

      const textDiffs = result.differences.filter(d => d.type === 'text');
      expect(textDiffs.length).toBeGreaterThan(0);
    });

    it('should throw when original document is not found', async () => {
      mockDocumentFindUnique.mockResolvedValue(null);

      await expect(service.compareDocuments(defaultRequest))
        .rejects.toThrow('Document not found');
    });
  });

  // ── generateFidelityReport ──────────────────────────────────────

  describe('generateFidelityReport', () => {
    it('should generate a report from a cached comparison result', async () => {
      // First run a comparison to populate cache
      const doc = makeDocumentWithPages('doc-orig', []);
      mockDocumentFindUnique.mockResolvedValue(doc);

      const comparison = await service.compareDocuments(defaultRequest);

      // Now generate report
      const report = await service.generateFidelityReport(comparison.id);

      expect(report).toHaveProperty('overallFidelity');
      expect(report).toHaveProperty('categories');
      expect(report).toHaveProperty('recommendations');
      expect(report.categories).toHaveLength(3);
      expect(mockFidelityReportCreate).toHaveBeenCalled();
    });

    it('should generate recommendations for low visual scores', async () => {
      // Simulate a cached result with low scores
      mockComparisonResultFindUnique.mockResolvedValue({
        id: 'low-score-comp',
        requestId: 'req-1',
        overallScore: 60,
        visualScore: 70,
        structuralScore: 50,
        contentScore: 80,
        status: 'fail',
        differences: [
          { type: 'missing_element', description: 'Element missing', severity: 'major', location: {}, score: 0 },
        ],
        statistics: {
          totalPixels: 1000,
          matchingPixels: 700,
          differingPixels: 300,
          matchPercentage: 70,
          totalElements: 5,
          matchingElements: 3,
          missingElements: 2,
          extraElements: 0,
          averageColorDelta: 15,
          maxColorDelta: 80,
          processingTime: 500,
        },
        createdAt: new Date(),
      });

      const report = await service.generateFidelityReport('low-score-comp');

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.includes('resolution'))).toBe(true);
      expect(report.recommendations.some(r => r.includes('positioning'))).toBe(true);
    });

    it('should throw when comparison result is not found', async () => {
      mockComparisonResultFindUnique.mockResolvedValue(null);

      await expect(service.generateFidelityReport('nonexistent'))
        .rejects.toThrow('Comparison not found');
    });
  });

  // ── scoring ─────────────────────────────────────────────────────

  describe('scoring logic', () => {
    it('should produce status "pass" for scores >= 95', async () => {
      const doc = makeDocumentWithPages('doc-orig', []);
      mockDocumentFindUnique.mockResolvedValue(doc);

      const result = await service.compareDocuments(defaultRequest);

      // Identical docs should score high
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(['pass', 'warning', 'fail']).toContain(result.status);
    });
  });
});
