import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';

// ─── Interfaces ──────────────────────────────────────────────────────
interface IconRecord {
  id: string;
  name: string;
  slug: string;
  category: string;
  tags: string[];
  svgContent: string;
  width: number;
  height: number;
  viewBox: string;
  variants: IconVariant[];
  style: 'outline' | 'filled' | 'duotone' | 'solid';
  uploadedBy?: string;
  isCustom: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface IconVariant {
  name: string;
  svgContent: string;
  color?: string;
  size?: number;
  style: string;
}

interface IconSearchOptions {
  query?: string;
  category?: string;
  tags?: string[];
  style?: 'outline' | 'filled' | 'duotone' | 'solid';
  isCustom?: boolean;
  page: number;
  pageSize: number;
  sortBy: 'name' | 'usageCount' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

interface IconSearchResult {
  icons: IconRecord[];
  total: number;
  page: number;
  pageSize: number;
  categories: string[];
  facets: { category: string; count: number }[];
}

interface IconCustomization {
  color?: string;
  size?: number;
  strokeWidth?: number;
  rotation?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  opacity?: number;
  backgroundColor?: string;
  padding?: number;
  borderRadius?: number;
}

interface IconExportOptions {
  format: 'svg' | 'png' | 'webp' | 'jpeg';
  size: number;
  scale: number;
  background?: string;
  padding: number;
}

interface IconCategory {
  name: string;
  slug: string;
  description: string;
  iconCount: number;
  parentCategory?: string;
}

interface IconUploadResult {
  id: string;
  name: string;
  success: boolean;
  error?: string;
  warnings: string[];
}

interface PrismaIconDelegate {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  count(args: Record<string, unknown>): Promise<number>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<unknown>;
  groupBy(args: Record<string, unknown>): Promise<Array<{ category: string; _count: { category: number } }>>;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class IconLibraryService {
  private prisma: PrismaClient;
  private iconCache: Map<string, IconRecord> = new Map();
  private categoryCache: IconCategory[] = [];
  private searchIndex: Map<string, Set<string>> = new Map();
  private readonly ICON_STORAGE_PATH: string;
  private readonly MAX_SVG_SIZE = 100000;
  private readonly ALLOWED_SVG_ELEMENTS = new Set([
    'svg', 'g', 'path', 'circle', 'rect', 'ellipse', 'line', 'polyline',
    'polygon', 'text', 'tspan', 'defs', 'clipPath', 'mask', 'use',
    'symbol', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc',
  ]);

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.ICON_STORAGE_PATH = process.env.ICON_STORAGE_PATH || '/data/icons';
  }

  async initialize(): Promise<void> {
    const icons = await (this.prisma as unknown as Record<string, PrismaIconDelegate>).icon.findMany({
      take: 5000,
      orderBy: { usageCount: 'desc' },
    });

    for (const icon of icons) {
      const record = this.mapIconRecord(icon);
      this.iconCache.set(record.id, record);
      this.indexIcon(record);
    }

    await this.refreshCategories();
  }

  private mapIconRecord(dbIcon: Record<string, unknown>): IconRecord {
    return {
      id: dbIcon.id as string,
      name: dbIcon.name as string,
      slug: dbIcon.slug as string,
      category: dbIcon.category as string,
      tags: (dbIcon.tags as string[]) || [],
      svgContent: dbIcon.svgContent as string,
      width: dbIcon.width as number,
      height: dbIcon.height as number,
      viewBox: (dbIcon.viewBox as string) || `0 0 ${dbIcon.width} ${dbIcon.height}`,
      variants: (dbIcon.variants as IconVariant[]) || [],
      style: dbIcon.style as IconRecord['style'],
      uploadedBy: (dbIcon.uploadedBy as string) || undefined,
      isCustom: dbIcon.isCustom as boolean,
      usageCount: dbIcon.usageCount as number,
      createdAt: dbIcon.createdAt as Date,
      updatedAt: dbIcon.updatedAt as Date,
    };
  }

  private indexIcon(icon: IconRecord): void {
    const tokens = this.tokenize(`${icon.name} ${icon.category} ${icon.tags.join(' ')}`);
    for (const token of tokens) {
      if (!this.searchIndex.has(token)) {
        this.searchIndex.set(token, new Set());
      }
      this.searchIndex.get(token)!.add(icon.id);
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, '')
      .split(/[\s-]+/)
      .filter(t => t.length >= 2);
  }

  async searchIcons(options: IconSearchOptions): Promise<IconSearchResult> {
    let candidateIds: Set<string> | null = null;

    if (options.query) {
      candidateIds = new Set<string>();
      const queryTokens = this.tokenize(options.query);
      for (const token of queryTokens) {
        const partialMatches = new Set<string>();
        for (const [indexedToken, ids] of this.searchIndex) {
          if (indexedToken.includes(token) || token.includes(indexedToken)) {
            for (const id of ids) {
              partialMatches.add(id);
            }
          }
        }
        if (candidateIds.size === 0) {
          candidateIds = partialMatches;
        } else {
          candidateIds = new Set([...candidateIds].filter(id => partialMatches.has(id)));
        }
      }
    }

    const where: Record<string, unknown> = {};

    if (candidateIds !== null) {
      where.id = { in: Array.from(candidateIds) };
    }
    if (options.category) {
      where.category = options.category;
    }
    if (options.style) {
      where.style = options.style;
    }
    if (options.isCustom !== undefined) {
      where.isCustom = options.isCustom;
    }
    if (options.tags && options.tags.length > 0) {
      where.tags = { hasSome: options.tags };
    }

    const orderBy: Record<string, string> = {};
    orderBy[options.sortBy] = options.sortOrder;

    const [icons, total] = await Promise.all([
      (this.prisma as unknown as Record<string, PrismaIconDelegate>).icon.findMany({
        where,
        orderBy,
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      }),
      (this.prisma as unknown as Record<string, PrismaIconDelegate>).icon.count({ where }),
    ]);

    const facetsResult = await (this.prisma as unknown as Record<string, PrismaIconDelegate>).icon.groupBy({
      by: ['category'],
      where: candidateIds ? { id: { in: Array.from(candidateIds) } } : {},
      _count: { category: true },
      orderBy: { _count: { category: 'desc' } },
    });

    const facets = facetsResult.map((f: { category: string; _count: { category: number } }) => ({
      category: f.category,
      count: f._count.category,
    }));

    return {
      icons: icons.map((i: Record<string, unknown>) => this.mapIconRecord(i)),
      total,
      page: options.page,
      pageSize: options.pageSize,
      categories: facets.map((f: { category: string; count: number }) => f.category),
      facets,
    };
  }

  async getIcon(iconId: string): Promise<IconRecord> {
    const cached = this.iconCache.get(iconId);
    if (cached) return cached;

    const dbIcon = await (this.prisma as unknown as Record<string, PrismaIconDelegate>).icon.findUnique({ where: { id: iconId } });
    if (!dbIcon) {
      throw new Error(`Icon not found: ${iconId}`);
    }

    const record = this.mapIconRecord(dbIcon);
    this.iconCache.set(iconId, record);
    return record;
  }

  async uploadIcon(
    name: string,
    svgContent: string,
    category: string,
    tags: string[],
    uploadedBy: string,
  ): Promise<IconUploadResult> {
    const warnings: string[] = [];

    if (svgContent.length > this.MAX_SVG_SIZE) {
      return {
        id: '',
        name,
        success: false,
        error: `SVG content exceeds maximum size of ${this.MAX_SVG_SIZE} bytes`,
        warnings: [],
      };
    }

    const sanitized = this.sanitizeSvg(svgContent);
    if (sanitized.warnings.length > 0) {
      warnings.push(...sanitized.warnings);
    }

    const dimensions = this.extractSvgDimensions(sanitized.content);
    if (!dimensions) {
      return {
        id: '',
        name,
        success: false,
        error: 'Could not determine SVG dimensions from viewBox or width/height attributes',
        warnings,
      };
    }

    const slug = this.generateSlug(name);
    const iconId = crypto.randomUUID();

    const iconRecord: IconRecord = {
      id: iconId,
      name,
      slug,
      category,
      tags,
      svgContent: sanitized.content,
      width: dimensions.width,
      height: dimensions.height,
      viewBox: dimensions.viewBox,
      variants: [],
      style: 'outline',
      uploadedBy,
      isCustom: true,
      usageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await (this.prisma as unknown as Record<string, PrismaIconDelegate>).icon.create({
      data: {
        id: iconRecord.id,
        name: iconRecord.name,
        slug: iconRecord.slug,
        category: iconRecord.category,
        tags: iconRecord.tags,
        svgContent: iconRecord.svgContent,
        width: iconRecord.width,
        height: iconRecord.height,
        viewBox: iconRecord.viewBox,
        variants: iconRecord.variants as unknown as Record<string, unknown>[],
        style: iconRecord.style,
        uploadedBy: iconRecord.uploadedBy,
        isCustom: iconRecord.isCustom,
        usageCount: 0,
        createdAt: iconRecord.createdAt,
        updatedAt: iconRecord.updatedAt,
      },
    });

    this.iconCache.set(iconId, iconRecord);
    this.indexIcon(iconRecord);
    await this.refreshCategories();

    return {
      id: iconId,
      name,
      success: true,
      warnings,
    };
  }

  private sanitizeSvg(svgContent: string): { content: string; warnings: string[] } {
    const warnings: string[] = [];
    let content = svgContent.trim();

    const scriptRegex = /<script[\s\S]*?<\/script>/gi;
    if (scriptRegex.test(content)) {
      content = content.replace(scriptRegex, '');
      warnings.push('Removed script elements from SVG');
    }

    const eventHandlerRegex = /\s(on\w+)="[^"]*"/gi;
    if (eventHandlerRegex.test(content)) {
      content = content.replace(eventHandlerRegex, '');
      warnings.push('Removed event handler attributes from SVG');
    }

    const hrefJsRegex = /href="javascript:[^"]*"/gi;
    if (hrefJsRegex.test(content)) {
      content = content.replace(hrefJsRegex, '');
      warnings.push('Removed javascript: hrefs from SVG');
    }

    const styleImportRegex = /@import\s+url\([^)]+\)/gi;
    if (styleImportRegex.test(content)) {
      content = content.replace(styleImportRegex, '');
      warnings.push('Removed CSS @import rules from SVG');
    }

    const foreignObjectRegex = /<foreignObject[\s\S]*?<\/foreignObject>/gi;
    if (foreignObjectRegex.test(content)) {
      content = content.replace(foreignObjectRegex, '');
      warnings.push('Removed foreignObject elements from SVG');
    }

    return { content, warnings };
  }

  private extractSvgDimensions(svgContent: string): { width: number; height: number; viewBox: string } | null {
    const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
    const widthMatch = svgContent.match(/width="(\d+(?:\.\d+)?)/);
    const heightMatch = svgContent.match(/height="(\d+(?:\.\d+)?)/);

    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every(n => !isNaN(n))) {
        return {
          width: parts[2],
          height: parts[3],
          viewBox: viewBoxMatch[1],
        };
      }
    }

    if (widthMatch && heightMatch) {
      const w = parseFloat(widthMatch[1]);
      const h = parseFloat(heightMatch[1]);
      if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
        return {
          width: w,
          height: h,
          viewBox: `0 0 ${w} ${h}`,
        };
      }
    }

    return null;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 64);
  }

  async customizeIcon(
    iconId: string,
    customization: IconCustomization,
  ): Promise<string> {
    const icon = await this.getIcon(iconId);
    let svgContent = icon.svgContent;

    if (customization.color) {
      svgContent = svgContent.replace(
        /fill="(?!none)[^"]*"/g,
        `fill="${customization.color}"`,
      );
      svgContent = svgContent.replace(
        /stroke="(?!none)[^"]*"/g,
        `stroke="${customization.color}"`,
      );

      if (!svgContent.includes('fill=') && !svgContent.includes('stroke=')) {
        svgContent = svgContent.replace(
          '<svg',
          `<svg fill="${customization.color}"`,
        );
      }
    }

    if (customization.strokeWidth !== undefined) {
      svgContent = svgContent.replace(
        /stroke-width="[^"]*"/g,
        `stroke-width="${customization.strokeWidth}"`,
      );
    }

    if (customization.size) {
      svgContent = svgContent.replace(
        /width="[^"]*"/,
        `width="${customization.size}"`,
      );
      svgContent = svgContent.replace(
        /height="[^"]*"/,
        `height="${customization.size}"`,
      );
    }

    const transforms: string[] = [];
    if (customization.rotation) {
      transforms.push(`rotate(${customization.rotation}, ${icon.width / 2}, ${icon.height / 2})`);
    }
    if (customization.flipHorizontal) {
      transforms.push(`scale(-1, 1) translate(-${icon.width}, 0)`);
    }
    if (customization.flipVertical) {
      transforms.push(`scale(1, -1) translate(0, -${icon.height})`);
    }

    if (transforms.length > 0) {
      const transformAttr = `transform="${transforms.join(' ')}"`;
      svgContent = svgContent.replace(
        /(<svg[^>]*>)/,
        `$1<g ${transformAttr}>`,
      );
      svgContent = svgContent.replace(
        '</svg>',
        '</g></svg>',
      );
    }

    if (customization.opacity !== undefined) {
      svgContent = svgContent.replace(
        '<svg',
        `<svg opacity="${customization.opacity}"`,
      );
    }

    if (customization.backgroundColor) {
      const padding = customization.padding || 0;
      const bgWidth = icon.width + padding * 2;
      const bgHeight = icon.height + padding * 2;
      const rx = customization.borderRadius || 0;

      const bgRect = `<rect x="0" y="0" width="${bgWidth}" height="${bgHeight}" rx="${rx}" fill="${customization.backgroundColor}"/>`;
      svgContent = svgContent.replace(
        /viewBox="[^"]*"/,
        `viewBox="${-padding} ${-padding} ${bgWidth} ${bgHeight}"`,
      );
      svgContent = svgContent.replace(
        /(<svg[^>]*>)/,
        `$1${bgRect}`,
      );
    }

    return svgContent;
  }

  async exportIcon(
    iconId: string,
    options: IconExportOptions,
    customization?: IconCustomization,
  ): Promise<Buffer> {
    let svgContent: string;
    if (customization) {
      svgContent = await this.customizeIcon(iconId, customization);
    } else {
      const icon = await this.getIcon(iconId);
      svgContent = icon.svgContent;
    }

    const totalSize = options.size + options.padding * 2;
    const scaledSize = totalSize * options.scale;

    if (options.format === 'svg') {
      return Buffer.from(svgContent, 'utf-8');
    }

    const svgBuffer = Buffer.from(svgContent, 'utf-8');
    let pipeline = sharp(svgBuffer)
      .resize(scaledSize, scaledSize, {
        fit: 'contain',
        background: options.background
          ? this.parseColor(options.background)
          : { r: 0, g: 0, b: 0, alpha: 0 },
      });

    switch (options.format) {
      case 'png':
        pipeline = pipeline.png({ quality: 100 });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality: 90 });
        break;
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality: 90 });
        break;
    }

    const buffer = await pipeline.toBuffer();

    await (this.prisma as unknown as Record<string, PrismaIconDelegate>).icon.update({
      where: { id: iconId },
      data: { usageCount: { increment: 1 }, updatedAt: new Date() },
    });

    return buffer;
  }

  private parseColor(hex: string): { r: number; g: number; b: number; alpha: number } {
    const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i);
    if (!match) {
      return { r: 0, g: 0, b: 0, alpha: 0 };
    }
    return {
      r: parseInt(match[1], 16),
      g: parseInt(match[2], 16),
      b: parseInt(match[3], 16),
      alpha: match[4] ? parseInt(match[4], 16) / 255 : 1,
    };
  }

  async getCategories(): Promise<IconCategory[]> {
    if (this.categoryCache.length > 0) {
      return this.categoryCache;
    }
    return this.refreshCategories();
  }

  private async refreshCategories(): Promise<IconCategory[]> {
    const result = await (this.prisma as unknown as Record<string, PrismaIconDelegate>).icon.groupBy({
      by: ['category'],
      _count: { category: true },
      orderBy: { _count: { category: 'desc' } },
    });

    this.categoryCache = result.map((r: { category: string; _count: { category: number } }) => ({
      name: r.category,
      slug: this.generateSlug(r.category),
      description: '',
      iconCount: r._count.category,
    }));

    return this.categoryCache;
  }

  async deleteIcon(iconId: string): Promise<void> {
    this.iconCache.delete(iconId);

    for (const [token, ids] of this.searchIndex) {
      ids.delete(iconId);
      if (ids.size === 0) {
        this.searchIndex.delete(token);
      }
    }

    await (this.prisma as unknown as Record<string, PrismaIconDelegate>).icon.delete({ where: { id: iconId } });
    await this.refreshCategories();
  }

  async bulkUpload(
    icons: { name: string; svgContent: string; category: string; tags: string[] }[],
    uploadedBy: string,
  ): Promise<IconUploadResult[]> {
    const results: IconUploadResult[] = [];

    for (const iconData of icons) {
      const result = await this.uploadIcon(
        iconData.name,
        iconData.svgContent,
        iconData.category,
        iconData.tags,
        uploadedBy,
      );
      results.push(result);
    }

    return results;
  }
}
