// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockSlideTemplateRecords = [];

const mockPrisma = {
  slideTemplate: {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  masterSlide: {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(null),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

jest.mock('pptxgenjs', () => {
  const mockSlide = {
    background: null,
    addText: jest.fn(),
    addShape: jest.fn(),
  };
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      title: '',
      author: '',
      ShapeType: { rect: 'rect' },
      addSlide: jest.fn(() => mockSlide),
      write: jest.fn().mockResolvedValue(Buffer.from('mock-pptx-buffer')),
    })),
  };
});

import TemplateManagerService from '../services/template-manager.service.js';

describe('Template Manager Service (Section 5.4)', () => {
  let service: TemplateManagerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TemplateManagerService(mockPrisma as any);
  });

  describe('createTemplate', () => {
    it('should create a template with the specified layout and category', async () => {
      const template = await service.createTemplate(
        'Sales Deck Title',
        'title',
        'business',
        'user-001',
      );
      expect(template.name).toBe('Sales Deck Title');
      expect(template.layout).toBe('title');
      expect(template.category).toBe('business');
      expect(template.createdBy).toBe('user-001');
      expect(template.version).toBe(1);
      expect(template.backgroundColor).toBe('#FFFFFF');
      expect(template.transitions).toEqual({ type: 'none', duration: 500 });
      expect(template.elements.length).toBeGreaterThan(0);
      expect(mockPrisma.slideTemplate.create).toHaveBeenCalledTimes(1);
    });

    it('should use custom elements when provided', async () => {
      const customElements = [
        {
          id: 'custom-el-1',
          type: 'text' as const,
          name: 'Custom Title',
          position: { x: 1, y: 1, w: 8, h: 1 },
          style: { fontSize: 32, fontBold: true },
          locked: false,
          visible: true,
          layer: 1,
        },
      ];
      const template = await service.createTemplate(
        'Custom Template',
        'blank',
        'custom',
        'user-002',
        customElements,
      );
      expect(template.elements).toHaveLength(1);
      expect(template.elements[0].id).toBe('custom-el-1');
      expect(template.elements[0].name).toBe('Custom Title');
    });

    it('should create a blank layout template with no elements', async () => {
      const template = await service.createTemplate(
        'Empty Slide',
        'blank',
        'general',
        'user-003',
      );
      expect(template.layout).toBe('blank');
      expect(template.elements).toHaveLength(0);
    });
  });

  describe('getTemplate', () => {
    it('should return a cached template without querying prisma', async () => {
      const created = await service.createTemplate(
        'Cached Template',
        'two_column',
        'marketing',
        'user-004',
      );
      mockPrisma.slideTemplate.findUnique.mockClear();

      const fetched = await service.getTemplate(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('Cached Template');
      expect(mockPrisma.slideTemplate.findUnique).not.toHaveBeenCalled();
    });

    it('should throw when template is not found in cache or database', async () => {
      mockPrisma.slideTemplate.findUnique.mockResolvedValueOnce(null);
      await expect(service.getTemplate('nonexistent-id')).rejects.toThrow(
        'Template not found: nonexistent-id',
      );
    });

    it('should fetch from database and cache when not in memory', async () => {
      const mockRecord = {
        id: 'db-template-001',
        name: 'DB Template',
        description: 'From database',
        category: 'education',
        layout: 'title_content',
        masterSlideId: null,
        elements: [{ id: 'e1', type: 'text', name: 'Title', position: { x: 0, y: 0, w: 9, h: 1 }, style: {}, locked: false, visible: true, layer: 1 }],
        backgroundColor: '#FAFAFA',
        transitions: { type: 'fade', duration: 300 },
        metadata: {},
        version: 2,
        createdBy: 'user-005',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.slideTemplate.findUnique.mockResolvedValueOnce(mockRecord);

      const template = await service.getTemplate('db-template-001');
      expect(template.id).toBe('db-template-001');
      expect(template.name).toBe('DB Template');
      expect(template.layout).toBe('title_content');
    });
  });

  describe('updateTemplate', () => {
    it('should increment the version and persist updates', async () => {
      const created = await service.createTemplate(
        'Updatable',
        'comparison',
        'analytics',
        'user-006',
      );
      const updated = await service.updateTemplate(created.id, {
        name: 'Updated Name',
        backgroundColor: '#222222',
      });
      expect(updated.name).toBe('Updated Name');
      expect(updated.backgroundColor).toBe('#222222');
      expect(updated.version).toBe(2);
      expect(mockPrisma.slideTemplate.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteTemplate', () => {
    it('should delete the template from cache and database', async () => {
      const created = await service.createTemplate(
        'Deletable',
        'section_header',
        'temp',
        'user-007',
      );
      await service.deleteTemplate(created.id);
      expect(mockPrisma.slideTemplate.delete).toHaveBeenCalledWith({
        where: { id: created.id },
      });
    });
  });

  describe('listTemplates', () => {
    it('should filter templates by category and return paginated results', async () => {
      const mockRecords = [
        {
          id: 'list-001',
          name: 'Template A',
          description: '',
          category: 'business',
          layout: 'title',
          masterSlideId: null,
          elements: [],
          backgroundColor: '#FFF',
          transitions: { type: 'none', duration: 500 },
          metadata: {},
          version: 1,
          createdBy: 'user-008',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.slideTemplate.findMany.mockResolvedValueOnce(mockRecords);
      mockPrisma.slideTemplate.count.mockResolvedValueOnce(1);

      const result = await service.listTemplates({ category: 'business' }, 1, 10);
      expect(result.templates).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.templates[0].name).toBe('Template A');
    });
  });

  describe('createMasterSlide', () => {
    it('should create a master slide with header, footer, and color/font schemes', async () => {
      const colorScheme = {
        primary: '#1B5E20',
        secondary: '#4CAF50',
        accent1: '#8BC34A',
        accent2: '#CDDC39',
        background: '#FFFFFF',
        text: '#212121',
        lightText: '#9E9E9E',
        darkText: '#000000',
      };
      const fontScheme = {
        titleFont: 'Roboto',
        bodyFont: 'Open Sans',
        captionFont: 'Roboto Mono',
        titleSizes: { large: 44, medium: 32, small: 24 },
        bodySizes: { large: 18, medium: 14, small: 11 },
      };

      const master = await service.createMasterSlide('Green Theme', colorScheme, fontScheme);
      expect(master.name).toBe('Green Theme');
      expect(master.backgroundColor).toBe('#FFFFFF');
      expect(master.colorScheme.primary).toBe('#1B5E20');
      expect(master.fontScheme.titleFont).toBe('Roboto');
      expect(master.headerElements.length).toBeGreaterThan(0);
      expect(master.footerElements.length).toBeGreaterThan(0);
      expect(mockPrisma.masterSlide.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('cloneTemplate', () => {
    it('should clone a template with a new name and fresh element IDs', async () => {
      const original = await service.createTemplate(
        'Original',
        'title',
        'business',
        'user-009',
      );
      const cloned = await service.cloneTemplate(original.id, 'Cloned Version');
      expect(cloned.name).toBe('Cloned Version');
      expect(cloned.layout).toBe('title');
      expect(cloned.category).toBe('business');
      expect(cloned.id).not.toBe(original.id);
      // cloned elements should have different IDs
      const originalIds = original.elements.map(e => e.id);
      const clonedIds = cloned.elements.map(e => e.id);
      for (const cid of clonedIds) {
        expect(originalIds).not.toContain(cid);
      }
    });
  });

  describe('getAvailableLayouts', () => {
    it('should return all 8 initialized layout presets with element counts', () => {
      const layouts = service.getAvailableLayouts();
      expect(layouts.length).toBeGreaterThanOrEqual(8);
      const layoutNames = layouts.map(l => l.layout);
      expect(layoutNames).toContain('title');
      expect(layoutNames).toContain('title_content');
      expect(layoutNames).toContain('two_column');
      expect(layoutNames).toContain('comparison');
      expect(layoutNames).toContain('section_header');
      expect(layoutNames).toContain('blank');
      expect(layoutNames).toContain('image_left');
      expect(layoutNames).toContain('quote');

      const blankLayout = layouts.find(l => l.layout === 'blank');
      expect(blankLayout.elementCount).toBe(0);

      const titleLayout = layouts.find(l => l.layout === 'title');
      expect(titleLayout.elementCount).toBe(2);

      const compLayout = layouts.find(l => l.layout === 'comparison');
      expect(compLayout.elementCount).toBe(5);
    });
  });

  describe('generatePresentation', () => {
    it('should generate a PPTX buffer from template IDs and content', async () => {
      const template = await service.createTemplate(
        'PPTX Template',
        'title_content',
        'report',
        'user-010',
      );
      const contentMap = new Map<string, Record<string, string>>();
      contentMap.set(template.id, {
        Title: 'Quarterly Report',
        Content: 'Revenue grew by 25% year over year.',
      });

      const buffer = await service.generatePresentation(
        [template.id],
        contentMap,
        'Q4 2025 Report',
      );
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });
});
