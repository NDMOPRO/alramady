import { PrismaClient } from '@prisma/client';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  category: string;
  subcategory?: string;
  tags: string[];
  previewImages: string[];
  author: AuthorInfo;
  pricing: PricingInfo;
  stats: TemplateStats;
  version: string;
  compatibility: string[];
  fileUrl: string;
  status: 'draft' | 'pending_review' | 'published' | 'rejected' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthorInfo {
  userId: string;
  name: string;
  avatar?: string;
  verified: boolean;
  totalTemplates: number;
  averageRating: number;
}

export interface PricingInfo {
  type: 'free' | 'paid' | 'subscription';
  price?: number;
  currency?: string;
  discount?: { percentage: number; validUntil: Date };
}

export interface TemplateStats {
  downloads: number;
  views: number;
  rating: number;
  ratingCount: number;
  favorites: number;
}

export interface TemplateReview {
  id: string;
  templateId: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  content: string;
  helpful: number;
  verified: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface TemplateCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId?: string;
  templateCount: number;
  icon?: string;
  sortOrder: number;
}

export interface PublishingWorkflow {
  templateId: string;
  status: 'submitted' | 'in_review' | 'changes_requested' | 'approved' | 'rejected';
  reviewer?: string;
  submittedAt: Date;
  reviewedAt?: Date;
  feedback?: string;
  checklistItems: { name: string; passed: boolean; notes?: string }[];
}

export interface RevenueReport {
  authorId: string;
  period: { start: Date; end: Date };
  totalRevenue: number;
  platformFee: number;
  authorEarnings: number;
  templateBreakdown: { templateId: string; name: string; downloads: number; revenue: number }[];
  currency: string;
}

export interface TrendingResult {
  period: 'daily' | 'weekly' | 'monthly';
  templates: (MarketplaceTemplate & { trendScore: number })[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class MarketplaceService {
  private readonly PLATFORM_FEE_PERCENTAGE = 0.30;
  private readonly MIN_REVIEW_LENGTH = 20;
  private readonly MAX_RATING = 5;

  constructor(private prisma: PrismaClient) {}

  async publishTemplate(
    input: Omit<MarketplaceTemplate, 'id' | 'stats' | 'status' | 'createdAt' | 'updatedAt'>,
  ): Promise<MarketplaceTemplate> {
    const validationErrors = this.validateTemplate(input);
    if (validationErrors.length > 0) {
      throw new Error(`Template validation failed: ${validationErrors.join(', ')}`);
    }

    const existingByName = await this.prisma.marketplaceTemplate.findFirst({
      where: { name: input.name, authorId: input.author.userId },
    });

    if (existingByName) {
      throw new Error(`You already have a template named "${input.name}"`);
    }

    const template = await this.prisma.marketplaceTemplate.create({
      data: {
        name: input.name,
        description: input.description,
        longDescription: input.longDescription,
        category: input.category,
        subcategory: input.subcategory || null,
        tags: JSON.stringify(input.tags),
        previewImages: JSON.stringify(input.previewImages),
        authorId: input.author.userId,
        authorName: input.author.name,
        pricingType: input.pricing.type,
        price: input.pricing.price || null,
        currency: input.pricing.currency || 'USD',
        discount: input.pricing.discount ? JSON.stringify(input.pricing.discount) : null,
        version: input.version,
        compatibility: JSON.stringify(input.compatibility),
        fileUrl: input.fileUrl,
        status: 'pending_review',
        downloads: 0,
        views: 0,
        rating: 0,
        ratingCount: 0,
        favorites: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await this.prisma.publishingWorkflow.create({
      data: {
        templateId: template.id,
        status: 'submitted',
        submittedAt: new Date(),
        checklistItems: JSON.stringify(this.generateChecklist(input)),
      },
    });

    return this.toMarketplaceTemplate(template);
  }

  private validateTemplate(
    input: Omit<MarketplaceTemplate, 'id' | 'stats' | 'status' | 'createdAt' | 'updatedAt'>,
  ): string[] {
    const errors: string[] = [];
    if (!input.name || input.name.trim().length < 3) errors.push('Name must be at least 3 characters');
    if (!input.description || input.description.trim().length < 20) errors.push('Description must be at least 20 characters');
    if (!input.longDescription || input.longDescription.trim().length < 100) errors.push('Long description must be at least 100 characters');
    if (!input.category) errors.push('Category is required');
    if (!input.tags || input.tags.length === 0) errors.push('At least one tag is required');
    if (input.tags && input.tags.length > 20) errors.push('Maximum 20 tags allowed');
    if (!input.previewImages || input.previewImages.length === 0) errors.push('At least one preview image is required');
    if (!input.version || !/^\d+\.\d+(\.\d+)?$/.test(input.version)) errors.push('Version must be in semver format');
    if (!input.fileUrl) errors.push('File URL is required');
    if (input.pricing.type === 'paid' && (!input.pricing.price || input.pricing.price <= 0)) {
      errors.push('Paid templates must have a positive price');
    }
    return errors;
  }

  private generateChecklist(
    input: Omit<MarketplaceTemplate, 'id' | 'stats' | 'status' | 'createdAt' | 'updatedAt'>,
  ): { name: string; passed: boolean }[] {
    return [
      { name: 'Has descriptive name', passed: input.name.length >= 3 },
      { name: 'Has adequate description', passed: input.description.length >= 20 },
      { name: 'Has preview images', passed: input.previewImages.length > 0 },
      { name: 'Has tags for discovery', passed: input.tags.length > 0 },
      { name: 'Valid version number', passed: /^\d+\.\d+(\.\d+)?$/.test(input.version) },
      { name: 'Has compatibility info', passed: input.compatibility.length > 0 },
      { name: 'Pricing configured correctly', passed: input.pricing.type === 'free' || (input.pricing.price !== undefined && input.pricing.price > 0) },
    ];
  }

  async reviewTemplate(
    templateId: string,
    reviewerId: string,
    decision: 'approved' | 'rejected' | 'changes_requested',
    feedback?: string,
  ): Promise<PublishingWorkflow> {
    const workflow = await this.prisma.publishingWorkflow.findFirst({
      where: { templateId },
      orderBy: { submittedAt: 'desc' },
    });

    if (!workflow) {
      throw new Error(`No publishing workflow found for template ${templateId}`);
    }

    const newStatus = decision === 'approved' ? 'published' : decision === 'rejected' ? 'rejected' : 'pending_review';

    await this.prisma.marketplaceTemplate.update({
      where: { id: templateId },
      data: { status: newStatus, updatedAt: new Date() },
    });

    await this.prisma.publishingWorkflow.update({
      where: { id: workflow.id },
      data: {
        status: decision === 'changes_requested' ? 'changes_requested' : decision,
        reviewer: reviewerId,
        reviewedAt: new Date(),
        feedback: feedback || null,
      },
    });

    return {
      templateId,
      status: decision === 'changes_requested' ? 'changes_requested' : decision,
      reviewer: reviewerId,
      submittedAt: workflow.submittedAt,
      reviewedAt: new Date(),
      feedback,
      checklistItems: JSON.parse(workflow.checklistItems as string),
    };
  }

  async addReview(
    templateId: string,
    userId: string,
    userName: string,
    rating: number,
    title: string,
    content: string,
  ): Promise<TemplateReview> {
    if (rating < 1 || rating > this.MAX_RATING) {
      throw new Error(`Rating must be between 1 and ${this.MAX_RATING}`);
    }
    if (content.length < this.MIN_REVIEW_LENGTH) {
      throw new Error(`Review must be at least ${this.MIN_REVIEW_LENGTH} characters`);
    }

    const existingReview = await this.prisma.templateReview.findFirst({
      where: { templateId, userId },
    });
    if (existingReview) {
      throw new Error('You have already reviewed this template');
    }

    const hasDownloaded = await this.prisma.templateDownload.findFirst({
      where: { templateId, userId },
    });

    const review = await this.prisma.templateReview.create({
      data: {
        templateId,
        userId,
        userName,
        rating,
        title,
        content,
        helpful: 0,
        verified: !!hasDownloaded,
        createdAt: new Date(),
      },
    });

    const allReviews = await this.prisma.templateReview.findMany({
      where: { templateId },
      select: { rating: true },
    });

    const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = allReviews.length > 0 ? totalRating / allReviews.length : 0;

    await this.prisma.marketplaceTemplate.update({
      where: { id: templateId },
      data: {
        rating: Math.round(averageRating * 10) / 10,
        ratingCount: allReviews.length,
        updatedAt: new Date(),
      },
    });

    return {
      id: review.id,
      templateId,
      userId,
      userName,
      rating,
      title,
      content,
      helpful: 0,
      verified: !!hasDownloaded,
      createdAt: review.createdAt,
    };
  }

  async recordDownload(templateId: string, userId: string): Promise<void> {
    await this.prisma.templateDownload.create({
      data: {
        templateId,
        userId,
        downloadedAt: new Date(),
      },
    });

    await this.prisma.marketplaceTemplate.update({
      where: { id: templateId },
      data: { downloads: { increment: 1 }, updatedAt: new Date() },
    });

    const template = await this.prisma.marketplaceTemplate.findUnique({
      where: { id: templateId },
    });

    if (template && template.pricingType === 'paid' && template.price) {
      let effectivePrice = template.price;
      if (template.discount) {
        const discount = JSON.parse(template.discount as string) as PricingInfo['discount'];
        if (discount && new Date() < new Date(discount.validUntil)) {
          effectivePrice = template.price * (1 - discount.percentage / 100);
        }
      }

      const platformFee = effectivePrice * this.PLATFORM_FEE_PERCENTAGE;
      const authorEarnings = effectivePrice - platformFee;

      await this.prisma.revenueTransaction.create({
        data: {
          templateId,
          authorId: template.authorId,
          buyerId: userId,
          amount: effectivePrice,
          platformFee,
          authorEarnings,
          currency: template.currency || 'USD',
          transactionAt: new Date(),
        },
      });
    }
  }

  async recordView(templateId: string): Promise<void> {
    await this.prisma.marketplaceTemplate.update({
      where: { id: templateId },
      data: { views: { increment: 1 } },
    });
  }

  async getTrendingTemplates(period: 'daily' | 'weekly' | 'monthly', limit: number = 20): Promise<TrendingResult> {
    const since = new Date();
    if (period === 'daily') since.setDate(since.getDate() - 1);
    else if (period === 'weekly') since.setDate(since.getDate() - 7);
    else since.setMonth(since.getMonth() - 1);

    const downloads = await this.prisma.templateDownload.groupBy({
      by: ['templateId'],
      where: { downloadedAt: { gte: since } },
      _count: { templateId: true },
      orderBy: { _count: { templateId: 'desc' } },
      take: limit * 2,
    });

    const templateIds = downloads.map(d => d.templateId);
    const templates = await this.prisma.marketplaceTemplate.findMany({
      where: { id: { in: templateIds }, status: 'published' },
    });

    const downloadCounts = new Map(downloads.map(d => [d.templateId, d._count.templateId]));

    const scored = templates.map(t => {
      const recentDownloads = downloadCounts.get(t.id) || 0;
      const recencyBoost = 1 + (1 / (1 + Math.max(0, (Date.now() - t.createdAt.getTime()) / 86400000)));
      const ratingBoost = t.rating / this.MAX_RATING;
      const trendScore = recentDownloads * 0.5 + ratingBoost * 0.3 + recencyBoost * 0.2;

      return { ...this.toMarketplaceTemplate(t), trendScore: Math.round(trendScore * 100) / 100 };
    }).sort((a, b) => b.trendScore - a.trendScore).slice(0, limit);

    return { period, templates: scored };
  }

  async getFeaturedTemplates(limit: number = 10): Promise<MarketplaceTemplate[]> {
    const templates = await this.prisma.marketplaceTemplate.findMany({
      where: {
        status: 'published',
        rating: { gte: 4.0 },
        downloads: { gte: 10 },
      },
      orderBy: [{ rating: 'desc' }, { downloads: 'desc' }],
      take: limit,
    });

    return templates.map(t => this.toMarketplaceTemplate(t));
  }

  async searchTemplates(
    query: string,
    filters?: { category?: string; pricingType?: string; minRating?: number; tags?: string[] },
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{ templates: MarketplaceTemplate[]; totalCount: number }> {
    const where: Record<string, unknown> = { status: 'published' };

    if (query && query.trim().length > 0) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { tags: { contains: query } },
      ];
    }

    if (filters?.category) where.category = filters.category;
    if (filters?.pricingType) where.pricingType = filters.pricingType;
    if (filters?.minRating) where.rating = { gte: filters.minRating };

    const [templates, totalCount] = await Promise.all([
      this.prisma.marketplaceTemplate.findMany({
        where,
        orderBy: [{ rating: 'desc' }, { downloads: 'desc' }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      this.prisma.marketplaceTemplate.count({ where }),
    ]);

    let filtered = templates;
    if (filters?.tags && filters.tags.length > 0) {
      filtered = templates.filter(t => {
        const templateTags: string[] = JSON.parse(t.tags as string || '[]');
        return filters.tags!.some(tag => templateTags.includes(tag));
      });
    }

    return {
      templates: filtered.map(t => this.toMarketplaceTemplate(t)),
      totalCount,
    };
  }

  async getCategories(): Promise<TemplateCategory[]> {
    const categories = await this.prisma.templateCategory.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    const categoryIds = categories.map(c => c.id);
    const counts = await this.prisma.marketplaceTemplate.groupBy({
      by: ['category'],
      where: { status: 'published' },
      _count: { category: true },
    });

    const countMap = new Map(counts.map(c => [c.category, c._count.category]));

    return categories.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      parentId: c.parentId || undefined,
      templateCount: countMap.get(c.name) || 0,
      icon: c.icon || undefined,
      sortOrder: c.sortOrder,
    }));
  }

  async generateRevenueReport(authorId: string, startDate: Date, endDate: Date): Promise<RevenueReport> {
    const transactions = await this.prisma.revenueTransaction.findMany({
      where: {
        authorId,
        transactionAt: { gte: startDate, lte: endDate },
      },
    });

    const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
    const platformFee = transactions.reduce((sum, t) => sum + t.platformFee, 0);
    const authorEarnings = transactions.reduce((sum, t) => sum + t.authorEarnings, 0);

    const templateMap = new Map<string, { downloads: number; revenue: number }>();
    for (const t of transactions) {
      const existing = templateMap.get(t.templateId) || { downloads: 0, revenue: 0 };
      existing.downloads += 1;
      existing.revenue += t.authorEarnings;
      templateMap.set(t.templateId, existing);
    }

    const templateIds = Array.from(templateMap.keys());
    const templates = await this.prisma.marketplaceTemplate.findMany({
      where: { id: { in: templateIds } },
      select: { id: true, name: true },
    });

    const nameMap = new Map(templates.map(t => [t.id, t.name]));
    const templateBreakdown = Array.from(templateMap.entries()).map(([templateId, stats]) => ({
      templateId,
      name: nameMap.get(templateId) || 'Unknown',
      downloads: stats.downloads,
      revenue: Math.round(stats.revenue * 100) / 100,
    })).sort((a, b) => b.revenue - a.revenue);

    return {
      authorId,
      period: { start: startDate, end: endDate },
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      platformFee: Math.round(platformFee * 100) / 100,
      authorEarnings: Math.round(authorEarnings * 100) / 100,
      templateBreakdown,
      currency: 'USD',
    };
  }

  async purchaseTemplate(
    listingId: string,
    buyerTenantId: string,
  ): Promise<{ purchaseId: string; templateId: string; amount: number; currency: string }> {
    const template = await this.prisma.marketplaceTemplate.findUnique({
      where: { id: listingId },
    });

    if (!template) {
      throw new Error(`Template listing ${listingId} not found`);
    }

    if (template.status !== 'published') {
      throw new Error(`Template ${listingId} is not available for purchase`);
    }

    if (template.authorId === buyerTenantId) {
      throw new Error('Cannot purchase your own template');
    }

    const existingPurchase = await this.prisma.revenueTransaction.findFirst({
      where: { templateId: listingId, buyerId: buyerTenantId },
    });

    if (existingPurchase) {
      throw new Error('You have already purchased this template');
    }

    let effectivePrice = 0;
    if (template.pricingType === 'paid' && template.price) {
      effectivePrice = template.price;
      if (template.discount) {
        const discount = JSON.parse(template.discount as string) as PricingInfo['discount'];
        if (discount && new Date() < new Date(discount.validUntil)) {
          effectivePrice = template.price * (1 - discount.percentage / 100);
        }
      }
    }

    const platformFee = effectivePrice * this.PLATFORM_FEE_PERCENTAGE;
    const authorEarnings = effectivePrice - platformFee;

    const transaction = await this.prisma.revenueTransaction.create({
      data: {
        templateId: listingId,
        authorId: template.authorId,
        buyerId: buyerTenantId,
        amount: effectivePrice,
        platformFee,
        authorEarnings,
        currency: template.currency || 'USD',
        status: 'completed',
        transactionAt: new Date(),
      },
    });

    return {
      purchaseId: transaction.id,
      templateId: listingId,
      amount: effectivePrice,
      currency: template.currency || 'USD',
    };
  }

  async downloadTemplate(
    listingId: string,
    tenantId: string,
  ): Promise<{ fileUrl: string; filename: string }> {
    const template = await this.prisma.marketplaceTemplate.findUnique({
      where: { id: listingId },
    });

    if (!template) {
      throw new Error(`Template ${listingId} not found`);
    }

    if (template.pricingType === 'paid') {
      const purchase = await this.prisma.revenueTransaction.findFirst({
        where: { templateId: listingId, buyerId: tenantId, status: 'completed' },
      });

      if (!purchase && template.authorId !== tenantId) {
        throw new Error('You must purchase this template before downloading');
      }
    }

    await this.recordDownload(listingId, tenantId);

    return {
      fileUrl: template.fileUrl,
      filename: `${template.name.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')}.zip`,
    };
  }

  async getListingDetails(
    listingId: string,
  ): Promise<{ template: MarketplaceTemplate; reviews: TemplateReview[]; reviewCount: number }> {
    const template = await this.prisma.marketplaceTemplate.findUnique({
      where: { id: listingId },
    });

    if (!template) {
      throw new Error(`Template ${listingId} not found`);
    }

    await this.recordView(listingId);

    const reviews = await this.prisma.templateReview.findMany({
      where: { templateId: listingId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const reviewCount = await this.prisma.templateReview.count({
      where: { templateId: listingId },
    });

    const authorTemplateCount = await this.prisma.marketplaceTemplate.count({
      where: { authorId: template.authorId, status: 'published' },
    });

    const authorAvgRating = await this.prisma.marketplaceTemplate.aggregate({
      where: { authorId: template.authorId, status: 'published', ratingCount: { gt: 0 } },
      _avg: { rating: true },
    });

    const marketplaceTemplate = this.toMarketplaceTemplate(template);
    marketplaceTemplate.author.totalTemplates = authorTemplateCount;
    marketplaceTemplate.author.averageRating = Math.round((authorAvgRating._avg.rating || 0) * 10) / 10;

    return {
      template: marketplaceTemplate,
      reviews: reviews.map((r) => ({
        id: r.id,
        templateId: r.templateId,
        userId: r.userId,
        userName: r.userName,
        rating: r.rating,
        title: r.title,
        content: r.content,
        helpful: r.helpful,
        verified: r.verified,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt || undefined,
      })),
      reviewCount,
    };
  }

  async getSellerDashboard(tenantId: string): Promise<{
    totalRevenue: number;
    totalDownloads: number;
    averageRating: number;
    templateCount: number;
    recentTransactions: Array<{ templateName: string; amount: number; date: Date }>;
  }> {
    const templates = await this.prisma.marketplaceTemplate.findMany({
      where: { authorId: tenantId },
      select: { id: true, name: true, downloads: true, rating: true, ratingCount: true },
    });

    const totalDownloads = templates.reduce((sum, t) => sum + (t.downloads || 0), 0);
    const ratedTemplates = templates.filter((t) => t.ratingCount > 0);
    const averageRating = ratedTemplates.length > 0
      ? ratedTemplates.reduce((sum, t) => sum + t.rating, 0) / ratedTemplates.length
      : 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const transactions = await this.prisma.revenueTransaction.findMany({
      where: { authorId: tenantId },
      orderBy: { transactionAt: 'desc' },
    });

    const totalRevenue = transactions.reduce((sum, t) => sum + t.authorEarnings, 0);

    const templateNameMap = new Map(templates.map((t) => [t.id, t.name]));
    const recentTransactions = transactions.slice(0, 20).map((t) => ({
      templateName: templateNameMap.get(t.templateId) || 'Unknown',
      amount: t.authorEarnings,
      date: t.transactionAt,
    }));

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalDownloads,
      averageRating: Math.round(averageRating * 10) / 10,
      templateCount: templates.length,
      recentTransactions,
    };
  }

  async requestRefund(
    purchaseId: string,
    reason: string,
  ): Promise<{ refundId: string; status: 'pending' | 'approved' | 'rejected' }> {
    const transaction = await this.prisma.revenueTransaction.findUnique({
      where: { id: purchaseId },
    });

    if (!transaction) {
      throw new Error(`Purchase ${purchaseId} not found`);
    }

    const daysSincePurchase = (Date.now() - transaction.transactionAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePurchase > 14) {
      throw new Error('Refund requests must be made within 14 days of purchase');
    }

    if (!reason || reason.trim().length < 10) {
      throw new Error('Refund reason must be at least 10 characters');
    }

    const existingRefund = await this.prisma.refundRequest.findFirst({
      where: { transactionId: purchaseId },
    });

    if (existingRefund) {
      throw new Error('A refund request already exists for this purchase');
    }

    const refund = await this.prisma.refundRequest.create({
      data: {
        transactionId: purchaseId,
        buyerId: transaction.buyerId,
        authorId: transaction.authorId,
        amount: transaction.amount,
        reason,
        status: 'pending',
        requestedAt: new Date(),
      },
    });

    return { refundId: refund.id, status: 'pending' };
  }

  async reportListing(
    listingId: string,
    reason: string,
    tenantId: string,
  ): Promise<{ reportId: string }> {
    const template = await this.prisma.marketplaceTemplate.findUnique({
      where: { id: listingId },
    });

    if (!template) {
      throw new Error(`Template ${listingId} not found`);
    }

    if (!reason || reason.trim().length < 10) {
      throw new Error('Report reason must be at least 10 characters');
    }

    const existingReport = await this.prisma.listingReport.findFirst({
      where: { templateId: listingId, reporterId: tenantId },
    });

    if (existingReport) {
      throw new Error('You have already reported this listing');
    }

    const report = await this.prisma.listingReport.create({
      data: {
        templateId: listingId,
        reporterId: tenantId,
        reason,
        status: 'pending',
        reportedAt: new Date(),
      },
    });

    return { reportId: report.id };
  }

  private toMarketplaceTemplate(record: Record<string, unknown>): MarketplaceTemplate {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      longDescription: record.longDescription,
      category: record.category,
      subcategory: record.subcategory || undefined,
      tags: JSON.parse(record.tags as string || '[]'),
      previewImages: JSON.parse(record.previewImages as string || '[]'),
      author: {
        userId: record.authorId,
        name: record.authorName,
        verified: false,
        totalTemplates: 0,
        averageRating: 0,
      },
      pricing: {
        type: record.pricingType,
        price: record.price || undefined,
        currency: record.currency || 'USD',
        discount: record.discount ? JSON.parse(record.discount as string) : undefined,
      },
      stats: {
        downloads: record.downloads || 0,
        views: record.views || 0,
        rating: record.rating || 0,
        ratingCount: record.ratingCount || 0,
        favorites: record.favorites || 0,
      },
      version: record.version,
      compatibility: JSON.parse(record.compatibility as string || '[]'),
      fileUrl: record.fileUrl,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
