// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock external dependencies
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

jest.mock('handlebars', () => ({
  default: {
    precompile: jest.fn(),
    compile: jest.fn(() => jest.fn((data) => `rendered:${JSON.stringify(data)}`)),
  },
  __esModule: true,
}));

jest.mock('mustache', () => ({
  default: {
    parse: jest.fn(),
    render: jest.fn((tpl, data) => `mustache:${JSON.stringify(data)}`),
  },
  __esModule: true,
}));

jest.mock('ejs', () => ({
  default: {
    compile: jest.fn(() => jest.fn()),
    render: jest.fn((tpl, data) => `ejs:${JSON.stringify(data)}`),
  },
  __esModule: true,
}));

jest.mock('nunjucks', () => ({
  default: {
    configure: jest.fn(() => ({})),
    compile: jest.fn(),
    renderString: jest.fn((tpl, data) => `nunjucks:${JSON.stringify(data)}`),
  },
  __esModule: true,
}));

jest.mock('winston', () => ({
  default: {
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      json: jest.fn(),
    },
    transports: { Console: jest.fn() },
  },
  __esModule: true,
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-1234'),
  createHash: jest.fn(() => ({ update: jest.fn().mockReturnThis(), digest: jest.fn(() => 'hash') })),
}));

const mockPrisma = {
  templates: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  documents: {
    findUnique: jest.fn(),
  },
  template_ratings: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

import {
  createTemplate,
  renderTemplate,
  listTemplates,
  duplicateTemplate,
  createFromExisting,
  addVariable,
  validateTemplate,
  getGallery,
  rateTemplate,
} from '../services/template-manager.service';

describe('template-manager.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── createTemplate ────────────────────────────────────────────────
  describe('createTemplate', () => {
    it('should throw when name is empty', async () => {
      await expect(
        createTemplate('', 'report', 'handlebars', '<p>hi</p>', [], 'cat', 'tenant1', 'user1'),
      ).rejects.toThrow('Template name cannot be empty');
    });

    it('should throw when content is empty', async () => {
      await expect(
        createTemplate('Test', 'report', 'handlebars', '', [], 'cat', 'tenant1', 'user1'),
      ).rejects.toThrow('Template content cannot be empty');
    });

    it('should throw for invalid template type', async () => {
      await expect(
        createTemplate('Test', 'invalid' as any, 'handlebars', '<p>hi</p>', [], 'cat', 'tenant1', 'user1'),
      ).rejects.toThrow('Invalid template type');
    });

    it('should throw for invalid engine', async () => {
      await expect(
        createTemplate('Test', 'report', 'badengine' as any, '<p>hi</p>', [], 'cat', 'tenant1', 'user1'),
      ).rejects.toThrow('Invalid engine');
    });

    it('should create a template and return its metadata', async () => {
      const now = new Date();
      mockPrisma.templates.create.mockResolvedValue({
        id: 'test-uuid-1234',
        name: 'My Template',
        type: 'report',
        engine: 'handlebars',
        category: 'finance',
        variables: [],
        version: 1,
        isPublished: false,
        createdAt: now,
      });

      const result = await createTemplate(
        'My Template', 'report', 'handlebars', '<p>{{name}}</p>', [], 'finance', 'tenant1', 'user1',
      );

      expect(result.id).toBe('test-uuid-1234');
      expect(result.name).toBe('My Template');
      expect(result.type).toBe('report');
      expect(result.engine).toBe('handlebars');
      expect(result.isPublished).toBe(false);
      expect(mockPrisma.templates.create).toHaveBeenCalledTimes(1);
    });
  });

  // ── renderTemplate ────────────────────────────────────────────────
  describe('renderTemplate', () => {
    it('should throw when template not found', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue(null);
      await expect(renderTemplate('no-such-id', {})).rejects.toThrow('Template not found');
    });

    it('should throw when template is deleted', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue({
        id: 't1', engine: 'handlebars', content: '<p>hi</p>', deletedAt: new Date(),
      });
      await expect(renderTemplate('t1', {})).rejects.toThrow('Template has been deleted');
    });

    it('should render and increment usageCount', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue({
        id: 't1', name: 'Tmpl', engine: 'handlebars', content: '<p>{{name}}</p>', deletedAt: null,
      });
      mockPrisma.templates.update.mockResolvedValue({});

      const result = await renderTemplate('t1', { name: 'Alice' });
      expect(result.templateId).toBe('t1');
      expect(result.rendered).toBeDefined();
      expect(result.dataKeysUsed).toEqual(['name']);
      expect(mockPrisma.templates.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' } }),
      );
    });
  });

  // ── listTemplates ─────────────────────────────────────────────────
  describe('listTemplates', () => {
    it('should return paginated results', async () => {
      mockPrisma.templates.findMany.mockResolvedValue([
        { id: '1', name: 'T1', type: 'report', engine: 'handlebars' },
      ]);
      mockPrisma.templates.count.mockResolvedValue(1);

      const result = await listTemplates('tenant1');
      expect(result.data).toHaveLength(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.totalCount).toBe(1);
    });

    it('should apply type and category filters', async () => {
      mockPrisma.templates.findMany.mockResolvedValue([]);
      mockPrisma.templates.count.mockResolvedValue(0);

      await listTemplates('tenant1', 'report', 'finance');
      const callArgs = mockPrisma.templates.findMany.mock.calls[0][0];
      expect(callArgs.where.type).toBe('report');
      expect(callArgs.where.category).toBe('finance');
    });

    it('should clamp pagination limits', async () => {
      mockPrisma.templates.findMany.mockResolvedValue([]);
      mockPrisma.templates.count.mockResolvedValue(0);

      const result = await listTemplates('tenant1', undefined, undefined, { page: 1, limit: 999 });
      expect(result.pagination.limit).toBe(100);
    });
  });

  // ── duplicateTemplate ─────────────────────────────────────────────
  describe('duplicateTemplate', () => {
    it('should throw when original not found', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue(null);
      await expect(duplicateTemplate('bad-id', 'user1')).rejects.toThrow('Template not found');
    });

    it('should throw when original is deleted', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue({ id: 't1', deletedAt: new Date() });
      await expect(duplicateTemplate('t1', 'user1')).rejects.toThrow('Cannot duplicate a deleted template');
    });

    it('should duplicate with "Copy of" prefix', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue({
        id: 't1', name: 'My Tmpl', type: 'report', engine: 'handlebars',
        content: '<p></p>', variables: [], category: 'cat', tenantId: 'ten1',
        deletedAt: null,
      });
      mockPrisma.templates.create.mockResolvedValue({
        id: 'new-id', name: 'Copy of My Tmpl', type: 'report', engine: 'handlebars',
        category: 'cat', createdAt: new Date(),
      });

      const result = await duplicateTemplate('t1', 'user1');
      expect(result.name).toBe('Copy of My Tmpl');
      expect(result.originalTemplateId).toBe('t1');
    });
  });

  // ── addVariable ───────────────────────────────────────────────────
  describe('addVariable', () => {
    it('should throw when template not found', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue(null);
      await expect(addVariable('bad', 'x', 'string')).rejects.toThrow('Template not found');
    });

    it('should throw on duplicate variable name', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue({
        id: 't1', variables: [{ name: 'title', type: 'string' }], deletedAt: null,
      });
      await expect(addVariable('t1', 'title', 'string')).rejects.toThrow('already exists');
    });

    it('should add a new variable', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue({
        id: 't1', variables: [], deletedAt: null,
      });
      mockPrisma.templates.update.mockResolvedValue({ id: 't1' });

      const result = await addVariable('t1', 'newVar', 'number', 0);
      expect(result.variableAdded.name).toBe('newVar');
      expect(result.totalVariables).toBe(1);
    });
  });

  // ── validateTemplate ──────────────────────────────────────────────
  describe('validateTemplate', () => {
    it('should throw when template not found', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue(null);
      await expect(validateTemplate('bad')).rejects.toThrow('Template not found');
    });

    it('should return valid=true for a valid template', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue({
        id: 't1', engine: 'handlebars', content: '<p>{{name}}</p>',
        variables: [{ name: 'name', type: 'string' }],
      });

      const result = await validateTemplate('t1');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about unused variables', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue({
        id: 't1', engine: 'handlebars', content: '<p>hello</p>',
        variables: [{ name: 'unused', type: 'string' }],
      });

      const result = await validateTemplate('t1');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('unused');
    });
  });

  // ── getGallery ────────────────────────────────────────────────────
  describe('getGallery', () => {
    it('should return gallery with stats', async () => {
      mockPrisma.templates.findMany.mockResolvedValue([
        { id: '1', name: 'T', type: 'report', category: 'finance', usageCount: 10, averageRating: 4.5 },
      ]);

      const result = await getGallery('tenant1');
      expect(result.totalCount).toBe(1);
      expect(result.stats.totalUsageCount).toBe(10);
      expect(result.availableCategories).toContain('finance');
    });
  });

  // ── rateTemplate ──────────────────────────────────────────────────
  describe('rateTemplate', () => {
    it('should throw for rating out of range', async () => {
      await expect(rateTemplate('t1', 0, 'user1')).rejects.toThrow('Rating must be between 1 and 5');
      await expect(rateTemplate('t1', 6, 'user1')).rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should throw when template not found', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue(null);
      await expect(rateTemplate('bad', 3, 'user1')).rejects.toThrow('Template not found');
    });

    it('should create a new rating', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue({ id: 't1', deletedAt: null });
      mockPrisma.template_ratings.findFirst.mockResolvedValue(null);
      mockPrisma.template_ratings.create.mockResolvedValue({});
      mockPrisma.template_ratings.findMany.mockResolvedValue([{ rating: 4 }]);
      mockPrisma.templates.update.mockResolvedValue({
        id: 't1', averageRating: 4, ratingCount: 1,
      });

      const result = await rateTemplate('t1', 4, 'user1');
      expect(result.userRating).toBe(4);
      expect(result.message).toBe('Rating submitted');
    });

    it('should update an existing rating', async () => {
      mockPrisma.templates.findUnique.mockResolvedValue({ id: 't1', deletedAt: null });
      mockPrisma.template_ratings.findFirst.mockResolvedValue({ id: 'r1', rating: 3 });
      mockPrisma.template_ratings.update.mockResolvedValue({});
      mockPrisma.template_ratings.findMany.mockResolvedValue([{ rating: 5 }]);
      mockPrisma.templates.update.mockResolvedValue({
        id: 't1', averageRating: 5, ratingCount: 1,
      });

      const result = await rateTemplate('t1', 5, 'user1');
      expect(result.message).toBe('Rating updated');
    });
  });
});
