// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockPrismaInstance = {
  template: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrismaInstance),
}));

jest.mock('handlebars', () => ({
  default: {
    precompile: jest.fn(),
    compile: jest.fn(() => (data) => `hbs:${JSON.stringify(data)}`),
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
    compile: jest.fn(() => () => ''),
    render: jest.fn((tpl, data) => `ejs:${JSON.stringify(data)}`),
  },
  __esModule: true,
}));

jest.mock('nunjucks', () => {
  const env = { renderString: jest.fn((tpl, data) => `nunjucks:${JSON.stringify(data)}`) };
  return {
    default: {
      configure: jest.fn(() => env),
    },
    __esModule: true,
  };
});

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { TemplateService } from '../services/template.service';

describe('TemplateService', () => {
  let service: TemplateService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TemplateService();
  });

  // ── createTemplate ────────────────────────────────────────────────
  describe('createTemplate', () => {
    it('should throw for invalid engine', async () => {
      await expect(
        service.createTemplate('Test', 'cat', 'badengine', '<p>hi</p>', [], 'ten1', 'user1'),
      ).rejects.toThrow('Invalid engine');
    });

    it('should create template and return metadata', async () => {
      mockPrismaInstance.template.create.mockResolvedValue({
        id: 'tmpl-1', name: 'Test', category: 'cat', engine: 'handlebars',
      });

      const result = await service.createTemplate('Test', 'cat', 'handlebars', '<p>{{x}}</p>', [{ name: 'x', type: 'string' }], 'ten1', 'user1');
      expect(result.id).toBe('tmpl-1');
      expect(result.variableCount).toBe(1);
    });
  });

  // ── renderTemplate ────────────────────────────────────────────────
  describe('renderTemplate', () => {
    it('should throw when template not found', async () => {
      mockPrismaInstance.template.findUnique.mockResolvedValue(null);
      await expect(service.renderTemplate('bad', {})).rejects.toThrow('Template not found');
    });

    it('should render handlebars template', async () => {
      mockPrismaInstance.template.findUnique.mockResolvedValue({
        id: 't1', engine: 'handlebars', templateJson: { content: '<p>{{name}}</p>', engine: 'handlebars' },
      });
      mockPrismaInstance.template.update.mockResolvedValue({});

      const result = await service.renderTemplate('t1', { name: 'Alice' });
      expect(result.templateId).toBe('t1');
      expect(result.rendered).toBeDefined();
      expect(result.renderedLength).toBeGreaterThan(0);
    });

    it('should render mustache template', async () => {
      mockPrismaInstance.template.findUnique.mockResolvedValue({
        id: 't2', engine: 'mustache', templateJson: { content: '{{name}}', engine: 'mustache' },
      });
      mockPrismaInstance.template.update.mockResolvedValue({});

      const result = await service.renderTemplate('t2', { name: 'Bob' });
      expect(result.engine).toBe('mustache');
    });

    it('should throw for unknown engine', async () => {
      mockPrismaInstance.template.findUnique.mockResolvedValue({
        id: 't3', engine: 'unknown', templateJson: { content: 'x', engine: 'unknown' },
      });

      await expect(service.renderTemplate('t3', {})).rejects.toThrow('Unknown template engine');
    });

    it('should increment usageCount after render', async () => {
      mockPrismaInstance.template.findUnique.mockResolvedValue({
        id: 't1', engine: 'handlebars', templateJson: { content: '<p></p>', engine: 'handlebars' },
      });
      mockPrismaInstance.template.update.mockResolvedValue({});

      await service.renderTemplate('t1', {});
      expect(mockPrismaInstance.template.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { usageCount: { increment: 1 } },
      });
    });
  });

  // ── listTemplates ─────────────────────────────────────────────────
  describe('listTemplates', () => {
    it('should paginate and return results', async () => {
      mockPrismaInstance.template.findMany.mockResolvedValue([
        { id: 't1', name: 'A', category: 'cat', engine: 'handlebars', isSystem: false, usageCount: 5, createdAt: new Date() },
      ]);
      mockPrismaInstance.template.count.mockResolvedValue(1);

      const result = await service.listTemplates('ten1', {});
      expect(result.data).toHaveLength(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.total).toBe(1);
    });

    it('should apply category filter', async () => {
      mockPrismaInstance.template.findMany.mockResolvedValue([]);
      mockPrismaInstance.template.count.mockResolvedValue(0);

      await service.listTemplates('ten1', { category: 'finance' });
      const where = mockPrismaInstance.template.findMany.mock.calls[0][0].where;
      expect(where.category).toBe('finance');
    });

    it('should cap limit at 100', async () => {
      mockPrismaInstance.template.findMany.mockResolvedValue([]);
      mockPrismaInstance.template.count.mockResolvedValue(0);

      const result = await service.listTemplates('ten1', { limit: 999 });
      expect(result.pagination.limit).toBe(100);
    });
  });

  // ── duplicateTemplate ─────────────────────────────────────────────
  describe('duplicateTemplate', () => {
    it('should throw when original not found', async () => {
      mockPrismaInstance.template.findUnique.mockResolvedValue(null);
      await expect(service.duplicateTemplate('bad', 'ten1', 'u1')).rejects.toThrow('Template not found');
    });

    it('should create copy with (Copy) suffix', async () => {
      mockPrismaInstance.template.findUnique.mockResolvedValue({
        id: 't1', name: 'Original', category: 'cat', engine: 'handlebars', templateJson: {},
      });
      mockPrismaInstance.template.create.mockResolvedValue({
        id: 't2', name: 'Original (Copy)', category: 'cat',
      });

      const result = await service.duplicateTemplate('t1', 'ten1', 'u1');
      expect(result.name).toBe('Original (Copy)');
    });
  });

  // ── validateTemplate ──────────────────────────────────────────────
  describe('validateTemplate', () => {
    it('should throw when template not found', async () => {
      mockPrismaInstance.template.findUnique.mockResolvedValue(null);
      await expect(service.validateTemplate('bad')).rejects.toThrow('Template not found');
    });

    it('should return valid for correct syntax', async () => {
      mockPrismaInstance.template.findUnique.mockResolvedValue({
        id: 't1', engine: 'handlebars', templateJson: { content: '<p>ok</p>', engine: 'handlebars' },
      });

      const result = await service.validateTemplate('t1');
      expect(result.valid).toBe(true);
    });
  });

  // ── previewTemplate ───────────────────────────────────────────────
  describe('previewTemplate', () => {
    it('should throw when template not found', async () => {
      mockPrismaInstance.template.findUnique.mockResolvedValue(null);
      await expect(service.previewTemplate('bad')).rejects.toThrow('Template not found');
    });

    it('should use custom preview data when provided', async () => {
      mockPrismaInstance.template.findUnique.mockResolvedValue({
        id: 't1', engine: 'handlebars', templateJson: { content: '{{name}}', engine: 'handlebars', variables: [] },
      });
      mockPrismaInstance.template.update.mockResolvedValue({});

      const result = await service.previewTemplate('t1', { name: 'Custom' });
      expect(result.templateId).toBe('t1');
    });
  });
});
