// @ts-nocheck

// ─── Mock Dependencies ──────────────────────────────────────────────────────

const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
const mockFindMany = jest.fn();
const mockUpdate = jest.fn();
const mockCreate = jest.fn();
const mockCount = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    conversionJob: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      update: mockUpdate,
      create: mockCreate,
      count: mockCount,
    },
    knowledge_chunks: { create: jest.fn() },
  })),
}));

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            entities: [{ name: 'Rasid', type: 'organization', mentions: 3 }],
            relationships: [{ source: 'Rasid', target: 'Rasid', type: 'self', weight: 1 }],
            topics: ['technology', 'documents'],
          }),
        }],
      }),
    },
  })),
}));

jest.mock('pdf-parse', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    extractRawText: jest.fn(),
    convertToHtml: jest.fn(),
  },
}));

jest.mock('xlsx', () => ({
  __esModule: true,
  default: {
    read: jest.fn(),
    utils: {
      sheet_to_csv: jest.fn().mockReturnValue('a,b\n1,2'),
      sheet_to_json: jest.fn().mockReturnValue([{ a: 1, b: 2 }]),
    },
  },
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue(Buffer.from('file-content')),
  writeFileSync: jest.fn(),
}));

jest.mock('crypto', () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('abc123def456abc123def456abc123def456abc123def456abc123def456abcd'),
  }),
  randomUUID: jest.fn().mockReturnValue('mock-uuid'),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

jest.mock('../utils/redis', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
}));

// ─── Import Under Test ──────────────────────────────────────────────────────

import { UdrService } from '../services/udr.service';
import { PrismaClient } from '@prisma/client';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Engine 8.2 - UDR (Universal Document Representation) Service', () => {
  let service;
  let mockPrisma;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new PrismaClient();
    service = new UdrService(mockPrisma);
  });

  describe('buildStructureTree', () => {
    it('should build a root document node from raw content', () => {
      const rawContent = {
        text: '# Title\n\nParagraph one.\n\nParagraph two.',
        html: '',
        pageCount: 1,
        sheets: [],
        tables: [],
        links: [],
        rawMetadata: {},
      };

      const tree = service.buildStructureTree(rawContent);

      expect(tree.type).toBe('document');
      expect(tree.children.length).toBeGreaterThan(0);
    });

    it('should include table nodes when tables are present', () => {
      const rawContent = {
        text: 'Some text',
        html: '',
        pageCount: 1,
        sheets: [],
        tables: [{ headers: ['Name', 'Age'], rows: [['Alice', '30']] }],
        links: [],
        rawMetadata: {},
      };

      const tree = service.buildStructureTree(rawContent);
      const tableNodes = tree.children.filter(c => c.type === 'table');
      expect(tableNodes.length).toBe(1);
      expect(tableNodes[0].attributes.columns).toBe('2');
    });

    it('should include link nodes when links are present', () => {
      const rawContent = {
        text: 'Some text',
        html: '',
        pageCount: 1,
        sheets: [],
        tables: [],
        links: [{ href: 'https://example.com', text: 'Example' }],
        rawMetadata: {},
      };

      const tree = service.buildStructureTree(rawContent);
      const linkNodes = tree.children.filter(c => c.type === 'link');
      expect(linkNodes.length).toBe(1);
    });
  });

  describe('detectLanguage', () => {
    it('should detect Arabic text as "ar"', () => {
      const result = service.detectLanguage('مرحبا بالعالم هذا نص عربي طويل كافي');
      expect(result).toBe('ar');
    });

    it('should detect English text as "en"', () => {
      const result = service.detectLanguage('Hello world this is English text');
      expect(result).toBe('en');
    });

    it('should default to "en" for empty text', () => {
      const result = service.detectLanguage('   ');
      expect(result).toBe('en');
    });
  });

  describe('detectSections', () => {
    it('should detect markdown headings as sections', () => {
      const text = '# Introduction\nSome intro text\n# Methodology\nSome method text';
      const sections = service.detectSections(text);

      expect(sections.length).toBeGreaterThanOrEqual(2);
    });

    it('should return a single document section for plain text with no headings', () => {
      const text = 'Just a plain paragraph without any headings at all.';
      const sections = service.detectSections(text);

      expect(sections.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('extractVisualConstraints', () => {
    it('should return portrait layout for text-only content', () => {
      const rawContent = {
        text: 'Hello world',
        html: '',
        pageCount: 1,
        sheets: [],
        tables: [],
        links: [],
        rawMetadata: {},
      };

      const constraints = service.extractVisualConstraints(rawContent);
      expect(constraints.pageLayout.orientation).toBe('portrait');
      expect(constraints.direction).toBe('ltr');
    });

    it('should set RTL direction for Arabic content', () => {
      const rawContent = {
        text: 'مرحبا بالعالم هذا نص عربي للاختبار',
        html: '',
        pageCount: 1,
        sheets: [],
        tables: [],
        links: [],
        rawMetadata: {},
      };

      const constraints = service.extractVisualConstraints(rawContent);
      expect(constraints.direction).toBe('rtl');
    });

    it('should extract fonts from HTML content', () => {
      const rawContent = {
        text: 'test',
        html: '<p style="font-family: Arial">text</p>',
        pageCount: 1,
        sheets: [],
        tables: [],
        links: [],
        rawMetadata: {},
      };

      const constraints = service.extractVisualConstraints(rawContent);
      expect(constraints.fonts).toContain('Arial');
    });
  });

  describe('buildDataBindingMap', () => {
    it('should extract formulas from sheet data', () => {
      const rawContent = {
        text: 'test',
        html: '',
        pageCount: 1,
        sheets: [
          {
            name: 'Sheet1',
            csv: '',
            json: [{ A: '=SUM(B1:B10)', B: '100' }],
          },
        ],
        tables: [],
        links: [],
        rawMetadata: {},
      };

      const map = service.buildDataBindingMap(rawContent);
      expect(map.formulas.length).toBeGreaterThan(0);
      expect(map.formulas[0].expression).toBe('=SUM(B1:B10)');
    });

    it('should detect template variables in text', () => {
      const rawContent = {
        text: 'Hello {{userName}}, your order {{orderId}} is ready',
        html: '',
        pageCount: 1,
        sheets: [],
        tables: [],
        links: [],
        rawMetadata: {},
      };

      const map = service.buildDataBindingMap(rawContent);
      expect(map.dynamicFields.length).toBe(2);
    });
  });

  describe('detectTablesInText', () => {
    it('should detect pipe-delimited tables in text', () => {
      const text = 'Name | Age | City\n--- | --- | ---\nAlice | 30 | Riyadh\nBob | 25 | Jeddah';
      const tables = service.detectTablesInText(text);

      expect(tables.length).toBe(1);
      expect(tables[0].headers).toContain('Name');
    });

    it('should return empty array when no tables present', () => {
      const text = 'Just plain text without any table structure.';
      const tables = service.detectTablesInText(text);
      expect(tables).toHaveLength(0);
    });
  });

  describe('list', () => {
    it('should return paginated list from database', async () => {
      mockFindMany.mockResolvedValueOnce([{ id: '1' }, { id: '2' }]);
      mockCount.mockResolvedValueOnce(2);

      const result = await service.list({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
      });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('getById', () => {
    it('should return a job by id', async () => {
      mockFindUnique.mockResolvedValueOnce({ id: 'job-1', status: 'completed' });

      const result = await service.getById('job-1');
      expect(result.id).toBe('job-1');
    });

    it('should throw when job not found', async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      await expect(service.getById('missing')).rejects.toThrow('UDR document not found: missing');
    });
  });
});
