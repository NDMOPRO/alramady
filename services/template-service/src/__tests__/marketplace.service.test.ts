// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockPrisma = {
  marketplaceTemplate: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  publishingWorkflow: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  templateReview: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  templateDownload: {
    findFirst: jest.fn(),
    create: jest.fn(),
    groupBy: jest.fn(),
  },
  revenueTransaction: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  templateCategory: {
    findMany: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

import { MarketplaceService } from '../services/marketplace.service';

function makeValidInput(overrides = {}) {
  return {
    name: 'My Template',
    description: 'A description that is long enough to pass validation easily here.',
    longDescription: 'A'.repeat(120),
    category: 'business',
    tags: ['report'],
    previewImages: ['https://img.example.com/1.png'],
    author: { userId: 'u1', name: 'Author', verified: false, totalTemplates: 0, averageRating: 0 },
    pricing: { type: 'free' },
    version: '1.0.0',
    compatibility: ['v2'],
    fileUrl: 'https://files.example.com/template.zip',
    ...overrides,
  };
}

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MarketplaceService(mockPrisma as any);
  });

  // ── publishTemplate ───────────────────────────────────────────────
  describe('publishTemplate', () => {
    it('should throw when name is too short', async () => {
      const input = makeValidInput({ name: 'AB' });
      await expect(service.publishTemplate(input as any)).rejects.toThrow('validation failed');
    });

    it('should throw when description is too short', async () => {
      const input = makeValidInput({ description: 'short' });
      await expect(service.publishTemplate(input as any)).rejects.toThrow('validation failed');
    });

    it('should throw when duplicate name exists for same author', async () => {
      mockPrisma.marketplaceTemplate.findFirst.mockResolvedValue({ id: 'existing' });
      const input = makeValidInput();
      await expect(service.publishTemplate(input as any)).rejects.toThrow('already have a template named');
    });

    it('should create template with pending_review status', async () => {
      mockPrisma.marketplaceTemplate.findFirst.mockResolvedValue(null);
      const createdRecord = {
        id: 'tpl-1', name: 'My Template', description: 'desc', longDescription: 'long',
        category: 'business', subcategory: null, tags: '["report"]', previewImages: '["img"]',
        authorId: 'u1', authorName: 'Author', pricingType: 'free', price: null, currency: 'USD',
        discount: null, version: '1.0.0', compatibility: '["v2"]', fileUrl: 'url',
        status: 'pending_review', downloads: 0, views: 0, rating: 0, ratingCount: 0, favorites: 0,
        createdAt: new Date(), updatedAt: new Date(),
      };
      mockPrisma.marketplaceTemplate.create.mockResolvedValue(createdRecord);
      mockPrisma.publishingWorkflow.create.mockResolvedValue({});

      const result = await service.publishTemplate(makeValidInput() as any);
      expect(result.status).toBe('pending_review');
      expect(result.id).toBe('tpl-1');
    });

    it('should throw for paid template with no price', async () => {
      const input = makeValidInput({ pricing: { type: 'paid', price: 0 } });
      await expect(service.publishTemplate(input as any)).rejects.toThrow('validation failed');
    });
  });

  // ── reviewTemplate ────────────────────────────────────────────────
  describe('reviewTemplate', () => {
    it('should throw when no workflow found', async () => {
      mockPrisma.publishingWorkflow.findFirst.mockResolvedValue(null);
      await expect(service.reviewTemplate('tpl-1', 'rev1', 'approved')).rejects.toThrow('No publishing workflow found');
    });

    it('should approve template', async () => {
      mockPrisma.publishingWorkflow.findFirst.mockResolvedValue({
        id: 'wf1', templateId: 'tpl-1', submittedAt: new Date(), checklistItems: '[]',
      });
      mockPrisma.marketplaceTemplate.update.mockResolvedValue({});
      mockPrisma.publishingWorkflow.update.mockResolvedValue({});

      const result = await service.reviewTemplate('tpl-1', 'rev1', 'approved', 'Looks good');
      expect(result.status).toBe('approved');
      expect(result.reviewer).toBe('rev1');
    });

    it('should handle changes_requested', async () => {
      mockPrisma.publishingWorkflow.findFirst.mockResolvedValue({
        id: 'wf1', templateId: 'tpl-1', submittedAt: new Date(), checklistItems: '[]',
      });
      mockPrisma.marketplaceTemplate.update.mockResolvedValue({});
      mockPrisma.publishingWorkflow.update.mockResolvedValue({});

      const result = await service.reviewTemplate('tpl-1', 'rev1', 'changes_requested', 'Fix images');
      expect(result.status).toBe('changes_requested');
      expect(result.feedback).toBe('Fix images');
    });
  });

  // ── addReview ─────────────────────────────────────────────────────
  describe('addReview', () => {
    it('should throw when rating is out of range', async () => {
      await expect(service.addReview('t1', 'u1', 'User', 0, 'Bad', 'This is long enough review content')).rejects.toThrow('Rating must be between');
      await expect(service.addReview('t1', 'u1', 'User', 6, 'Bad', 'This is long enough review content')).rejects.toThrow('Rating must be between');
    });

    it('should throw when review content is too short', async () => {
      await expect(service.addReview('t1', 'u1', 'User', 4, 'Good', 'short')).rejects.toThrow('at least');
    });

    it('should throw when user already reviewed', async () => {
      mockPrisma.templateReview.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.addReview('t1', 'u1', 'User', 4, 'Good', 'This is a sufficiently long review.'),
      ).rejects.toThrow('already reviewed');
    });

    it('should create a verified review when user has downloaded', async () => {
      mockPrisma.templateReview.findFirst.mockResolvedValue(null);
      mockPrisma.templateDownload.findFirst.mockResolvedValue({ id: 'd1' });
      mockPrisma.templateReview.create.mockResolvedValue({
        id: 'rev1', createdAt: new Date(),
      });
      mockPrisma.templateReview.findMany.mockResolvedValue([{ rating: 4 }]);
      mockPrisma.marketplaceTemplate.update.mockResolvedValue({});

      const result = await service.addReview('t1', 'u1', 'User', 4, 'Great', 'This template is really excellent work.');
      expect(result.verified).toBe(true);
      expect(result.rating).toBe(4);
    });
  });

  // ── recordView ────────────────────────────────────────────────────
  describe('recordView', () => {
    it('should increment view count', async () => {
      mockPrisma.marketplaceTemplate.update.mockResolvedValue({});
      await service.recordView('tpl-1');
      expect(mockPrisma.marketplaceTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
        data: { views: { increment: 1 } },
      });
    });
  });

  // ── searchTemplates ───────────────────────────────────────────────
  describe('searchTemplates', () => {
    it('should search by query with published filter', async () => {
      mockPrisma.marketplaceTemplate.findMany.mockResolvedValue([]);
      mockPrisma.marketplaceTemplate.count.mockResolvedValue(0);

      const result = await service.searchTemplates('finance');
      expect(result.templates).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('should apply category and pricing filters', async () => {
      mockPrisma.marketplaceTemplate.findMany.mockResolvedValue([]);
      mockPrisma.marketplaceTemplate.count.mockResolvedValue(0);

      await service.searchTemplates('test', { category: 'business', pricingType: 'free', minRating: 3 });
      const callArgs = mockPrisma.marketplaceTemplate.findMany.mock.calls[0][0];
      expect(callArgs.where.category).toBe('business');
      expect(callArgs.where.pricingType).toBe('free');
    });
  });

  // ── generateRevenueReport ─────────────────────────────────────────
  describe('generateRevenueReport', () => {
    it('should compute revenue with zero transactions', async () => {
      mockPrisma.revenueTransaction.findMany.mockResolvedValue([]);
      mockPrisma.marketplaceTemplate.findMany.mockResolvedValue([]);

      const result = await service.generateRevenueReport('author1', new Date('2024-01-01'), new Date('2024-12-31'));
      expect(result.totalRevenue).toBe(0);
      expect(result.authorEarnings).toBe(0);
      expect(result.templateBreakdown).toEqual([]);
    });

    it('should aggregate transactions correctly', async () => {
      mockPrisma.revenueTransaction.findMany.mockResolvedValue([
        { templateId: 't1', amount: 100, platformFee: 30, authorEarnings: 70 },
        { templateId: 't1', amount: 100, platformFee: 30, authorEarnings: 70 },
        { templateId: 't2', amount: 50, platformFee: 15, authorEarnings: 35 },
      ]);
      mockPrisma.marketplaceTemplate.findMany.mockResolvedValue([
        { id: 't1', name: 'Template 1' },
        { id: 't2', name: 'Template 2' },
      ]);

      const result = await service.generateRevenueReport('author1', new Date('2024-01-01'), new Date('2024-12-31'));
      expect(result.totalRevenue).toBe(250);
      expect(result.authorEarnings).toBe(175);
      expect(result.templateBreakdown).toHaveLength(2);
      expect(result.templateBreakdown[0].name).toBe('Template 1');
      expect(result.templateBreakdown[0].downloads).toBe(2);
    });
  });
});
