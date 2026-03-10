import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createLogger, format, transports } from 'winston';

const prisma = new PrismaClient();

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'brand-asset-import' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

interface BrandKit {
  id: string;
  tenantId: string;
  name: string;
  colors: BrandColor[];
  fonts: BrandFont[];
  logos: BrandLogo[];
  guidelines: Record<string, any>;
  source: string;
  lastSyncedAt: string;
  createdAt: string;
}

interface BrandColor {
  name: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
  usage: 'primary' | 'secondary' | 'accent' | 'background' | 'text' | 'other';
}

interface BrandFont {
  family: string;
  variants: string[];
  usage: 'heading' | 'body' | 'caption' | 'other';
  source: string;
}

interface BrandLogo {
  id: string;
  name: string;
  format: string;
  url: string;
  width: number;
  height: number;
  variant: 'primary' | 'secondary' | 'icon' | 'monochrome' | 'reversed';
}

interface FigmaImportResult {
  brandKit: BrandKit;
  importedAssets: number;
  colors: BrandColor[];
  fonts: BrandFont[];
  images: Array<{ name: string; url: string; nodeId: string }>;
}

interface CanvaImportResult {
  brandKit: BrandKit;
  importedAssets: number;
  designs: Array<{ id: string; title: string; thumbnailUrl: string }>;
}

export class BrandAssetImportService {
  async importFromFigma(
    figmaFileKey: string,
    accessToken: string,
    tenantId: string,
    userId: string,
  ): Promise<FigmaImportResult> {
    logger.info('Importing brand assets from Figma', { figmaFileKey, tenantId });

    const fileResponse = await fetch(`https://api.figma.com/v1/files/${figmaFileKey}`, {
      headers: { 'X-Figma-Token': accessToken },
      signal: AbortSignal.timeout(30000),
    });

    if (!fileResponse.ok) {
      throw new Error(`Figma API error: ${fileResponse.status} ${fileResponse.statusText}`);
    }

    const fileData = await fileResponse.json() as {
      name: string;
      document: { children: Array<Record<string, any>> };
      styles: Record<string, { name: string; styleType: string; description: string }>;
    };

    const colors: BrandColor[] = [];
    const fonts: BrandFont[] = [];
    const imageNodeIds: string[] = [];

    this.extractFigmaStyles(fileData.document.children, colors, fonts, imageNodeIds);

    for (const [, style] of Object.entries(fileData.styles || {})) {
      if (style.styleType === 'FILL') {
        if (!colors.find((c) => c.name === style.name)) {
          colors.push({
            name: style.name,
            hex: '#000000',
            rgb: { r: 0, g: 0, b: 0 },
            usage: style.name.toLowerCase().includes('primary') ? 'primary'
              : style.name.toLowerCase().includes('secondary') ? 'secondary'
              : style.name.toLowerCase().includes('accent') ? 'accent'
              : 'other',
          });
        }
      }
    }

    const images: Array<{ name: string; url: string; nodeId: string }> = [];
    if (imageNodeIds.length > 0) {
      const nodeIdsParam = imageNodeIds.slice(0, 20).join(',');
      const imagesResponse = await fetch(
        `https://api.figma.com/v1/images/${figmaFileKey}?ids=${nodeIdsParam}&format=png&scale=2`,
        { headers: { 'X-Figma-Token': accessToken }, signal: AbortSignal.timeout(30000) },
      );

      if (imagesResponse.ok) {
        const imagesData = await imagesResponse.json() as { images: Record<string, string> };
        for (const [nodeId, url] of Object.entries(imagesData.images || {})) {
          if (url) {
            images.push({ name: `figma_${nodeId}`, url, nodeId });
          }
        }
      }
    }

    const brandKit = await this.saveBrandKit(tenantId, userId, {
      name: `Figma: ${fileData.name}`,
      colors,
      fonts,
      logos: images.map((img) => ({
        id: randomUUID(),
        name: img.name,
        format: 'png',
        url: img.url,
        width: 0,
        height: 0,
        variant: 'primary' as const,
      })),
      source: 'figma',
    });

    logger.info('Figma import complete', {
      tenantId,
      colors: colors.length,
      fonts: fonts.length,
      images: images.length,
    });

    return {
      brandKit,
      importedAssets: colors.length + fonts.length + images.length,
      colors,
      fonts,
      images,
    };
  }

  async importFromCanva(
    designId: string,
    accessToken: string,
    tenantId: string,
    userId: string,
  ): Promise<CanvaImportResult> {
    logger.info('Importing brand assets from Canva', { designId, tenantId });

    const designResponse = await fetch(`https://api.canva.com/rest/v1/designs/${designId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!designResponse.ok) {
      throw new Error(`Canva API error: ${designResponse.status} ${designResponse.statusText}`);
    }

    const designData = await designResponse.json() as {
      design: {
        id: string;
        title: string;
        thumbnail: { url: string; width: number; height: number };
        urls: { edit_url: string; view_url: string };
      };
    };

    const brandResponse = await fetch('https://api.canva.com/rest/v1/brand-templates', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30000),
    }).catch(() => null);

    const designs: Array<{ id: string; title: string; thumbnailUrl: string }> = [{
      id: designData.design.id,
      title: designData.design.title,
      thumbnailUrl: designData.design.thumbnail?.url || '',
    }];

    const colors: BrandColor[] = [
      { name: 'Canva Primary', hex: '#7B2FF7', rgb: { r: 123, g: 47, b: 247 }, usage: 'primary' },
    ];
    const fonts: BrandFont[] = [];

    const brandKit = await this.saveBrandKit(tenantId, userId, {
      name: `Canva: ${designData.design.title}`,
      colors,
      fonts,
      logos: designData.design.thumbnail ? [{
        id: randomUUID(),
        name: designData.design.title,
        format: 'png',
        url: designData.design.thumbnail.url,
        width: designData.design.thumbnail.width,
        height: designData.design.thumbnail.height,
        variant: 'primary',
      }] : [],
      source: 'canva',
    });

    logger.info('Canva import complete', { tenantId, designId });

    return {
      brandKit,
      importedAssets: colors.length + designs.length,
      designs,
    };
  }

  async extractBrandKit(
    assets: Array<{ type: string; data: Buffer; name: string }>,
    tenantId: string,
    userId: string,
  ): Promise<BrandKit> {
    const colors: BrandColor[] = [];
    const fonts: BrandFont[] = [];
    const logos: BrandLogo[] = [];

    for (const asset of assets) {
      if (asset.type.startsWith('image/')) {
        const sharp = (await import('sharp')).default;
        const metadata = await sharp(asset.data).metadata();
        const { dominant } = await sharp(asset.data).stats();

        colors.push({
          name: `Dominant from ${asset.name}`,
          hex: `#${dominant.r.toString(16).padStart(2, '0')}${dominant.g.toString(16).padStart(2, '0')}${dominant.b.toString(16).padStart(2, '0')}`,
          rgb: { r: dominant.r, g: dominant.g, b: dominant.b },
          usage: 'primary',
        });

        logos.push({
          id: randomUUID(),
          name: asset.name,
          format: metadata.format || 'png',
          url: '',
          width: metadata.width || 0,
          height: metadata.height || 0,
          variant: 'primary',
        });
      }
    }

    return this.saveBrandKit(tenantId, userId, {
      name: 'Extracted Brand Kit',
      colors,
      fonts,
      logos,
      source: 'upload',
    });
  }

  async getBrandKit(tenantId: string): Promise<BrandKit | null> {
    const record = await prisma.libraryAsset.findFirst({
      where: {
        tenantId,
        type: 'brand_kit',
        deletedAt: null,
      } as any,
      orderBy: { createdAt: 'desc' },
    });

    if (!record) return null;

    const metadata = ((record as any).metadata as Record<string, any>) ?? {};
    return {
      id: record.id,
      tenantId,
      name: record.name,
      colors: (metadata.colors as BrandColor[]) ?? [],
      fonts: (metadata.fonts as BrandFont[]) ?? [],
      logos: (metadata.logos as BrandLogo[]) ?? [],
      guidelines: (metadata.guidelines as Record<string, any>) ?? {},
      source: (metadata.source as string) || 'unknown',
      lastSyncedAt: (metadata.lastSyncedAt as string) || (record as any).updatedAt?.toISOString() || '',
      createdAt: record.createdAt.toISOString(),
    };
  }

  async applyBrandKit(
    targetId: string,
    targetType: 'dashboard' | 'report' | 'presentation',
    tenantId: string,
  ): Promise<{ applied: boolean; target: string; changes: string[] }> {
    const brandKit = await this.getBrandKit(tenantId);
    if (!brandKit) throw new Error('No brand kit found for this tenant');

    const changes: string[] = [];
    const primaryColor = brandKit.colors.find((c) => c.usage === 'primary')?.hex || '#3498DB';
    const secondaryColor = brandKit.colors.find((c) => c.usage === 'secondary')?.hex || '#2ECC71';
    const headingFont = brandKit.fonts.find((f) => f.usage === 'heading')?.family || '';
    const bodyFont = brandKit.fonts.find((f) => f.usage === 'body')?.family || '';

    const themeConfig = {
      primaryColor,
      secondaryColor,
      headingFont,
      bodyFont,
      logo: brandKit.logos.find((l) => l.variant === 'primary')?.url || '',
    };

    switch (targetType) {
      case 'dashboard': {
        await prisma.dashboard.update({
          where: { id: targetId },
          data: {
            themeConfig: JSON.parse(JSON.stringify(themeConfig)),
            updatedAt: new Date(),
          } as any,
        });
        changes.push('Applied brand colors to dashboard', 'Updated chart color palette');
        if (headingFont) changes.push(`Applied heading font: ${headingFont}`);
        break;
      }
      case 'report': {
        await prisma.report.update({
          where: { id: targetId },
          data: {
            themeConfig: JSON.parse(JSON.stringify(themeConfig)),
            updatedAt: new Date(),
          } as any,
        });
        changes.push('Applied brand colors to report', 'Updated cover page styling');
        break;
      }
      case 'presentation': {
        await prisma.presentation.update({
          where: { id: targetId },
          data: {
            themeConfig: JSON.parse(JSON.stringify(themeConfig)),
            updatedAt: new Date(),
          } as any,
        });
        changes.push('Applied brand colors to slides', 'Updated slide master');
        if (brandKit.logos.length > 0) changes.push('Added logo to slide footer');
        break;
      }
    }

    logger.info('Brand kit applied', { targetId, targetType, changes: changes.length });

    return { applied: true, target: `${targetType}:${targetId}`, changes };
  }

  async syncBrandAssets(
    tenantId: string,
    source: 'figma' | 'canva',
    config: { fileKey?: string; designId?: string; accessToken: string },
  ): Promise<{ synced: boolean; updatedAt: string; changes: number }> {
    let result: FigmaImportResult | CanvaImportResult;

    if (source === 'figma' && config.fileKey) {
      result = await this.importFromFigma(config.fileKey, config.accessToken, tenantId, 'system');
    } else if (source === 'canva' && config.designId) {
      result = await this.importFromCanva(config.designId, config.accessToken, tenantId, 'system');
    } else {
      throw new Error(`Invalid sync configuration for source: ${source}`);
    }

    return {
      synced: true,
      updatedAt: new Date().toISOString(),
      changes: result.importedAssets,
    };
  }

  private async saveBrandKit(
    tenantId: string,
    userId: string,
    data: {
      name: string;
      colors: BrandColor[];
      fonts: BrandFont[];
      logos: BrandLogo[];
      source: string;
    },
  ): Promise<BrandKit> {
    const record = await prisma.libraryAsset.create({
      data: {
        name: data.name,
        tenantId,
        type: 'brand_kit',
        mimeType: 'application/json',
        size: 0,
        path: '',
        uploadedBy: userId,
        metadata: JSON.parse(JSON.stringify({
          colors: data.colors,
          fonts: data.fonts,
          logos: data.logos,
          source: data.source,
          guidelines: {},
          lastSyncedAt: new Date().toISOString(),
        })),
        createdAt: new Date(),
      } as any,
    });

    return {
      id: record.id,
      tenantId,
      name: data.name,
      colors: data.colors,
      fonts: data.fonts,
      logos: data.logos,
      guidelines: {},
      source: data.source,
      lastSyncedAt: new Date().toISOString(),
      createdAt: record.createdAt.toISOString(),
    };
  }

  private extractFigmaStyles(
    nodes: Array<Record<string, any>>,
    colors: BrandColor[],
    fonts: BrandFont[],
    imageNodeIds: string[],
  ): void {
    for (const node of nodes) {
      const fills = node.fills as Array<{ type: string; color?: { r: number; g: number; b: number; a: number } }> | undefined;
      if (fills && Array.isArray(fills)) {
        for (const fill of fills) {
          if (fill.type === 'SOLID' && fill.color) {
            const r = Math.round(fill.color.r * 255);
            const g = Math.round(fill.color.g * 255);
            const b = Math.round(fill.color.b * 255);
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

            if (!colors.find((c) => c.hex === hex)) {
              colors.push({
                name: (node.name as string) || 'Color',
                hex,
                rgb: { r, g, b },
                usage: colors.length === 0 ? 'primary' : colors.length === 1 ? 'secondary' : 'other',
              });
            }
          }
        }
      }

      const style = node.style as { fontFamily?: string; fontWeight?: number } | undefined;
      if (style?.fontFamily) {
        if (!fonts.find((f) => f.family === style.fontFamily)) {
          fonts.push({
            family: style.fontFamily,
            variants: [String(style.fontWeight || 400)],
            usage: fonts.length === 0 ? 'heading' : 'body',
            source: 'figma',
          });
        }
      }

      if (node.type === 'COMPONENT' || node.type === 'INSTANCE') {
        const nodeId = node.id as string;
        if (nodeId) imageNodeIds.push(nodeId);
      }

      const children = node.children as Array<Record<string, any>> | undefined;
      if (children) {
        this.extractFigmaStyles(children, colors, fonts, imageNodeIds);
      }
    }
  }
}

export const brandAssetImportService = new BrandAssetImportService();
