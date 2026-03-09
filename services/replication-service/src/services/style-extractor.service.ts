import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { createCanvas, CanvasRenderingContext2D } from 'canvas';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ExtractedStyle {
  id: string;
  sourceDocumentId: string;
  colors: ExtractedColor[];
  fonts: ExtractedFont[];
  layout: LayoutGrid;
  spacing: SpacingAnalysis;
  typography: TypographyHierarchy;
  brandGuide?: BrandStyleGuide;
  extractedAt: Date;
}

export interface ExtractedColor {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  usage: 'primary' | 'secondary' | 'accent' | 'background' | 'text' | 'border';
  frequency: number;
  sampleArea?: { x: number; y: number; width: number; height: number };
}

export interface ExtractedFont {
  family: string;
  weights: number[];
  sizes: number[];
  usage: 'heading' | 'body' | 'caption' | 'label' | 'title';
  confidence: number;
  fallbacks: string[];
}

export interface LayoutGrid {
  columns: number;
  gutterWidth: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  contentWidth: number;
  gridLines: { position: number; type: 'vertical' | 'horizontal' }[];
}

export interface SpacingAnalysis {
  baseUnit: number;
  elementSpacings: { from: string; to: string; distance: number }[];
  consistentSpacings: number[];
  sectionPadding: { top: number; right: number; bottom: number; left: number };
  lineSpacing: number;
  paragraphSpacing: number;
}

export interface TypographyHierarchy {
  levels: TypographyLevel[];
  baseSize: number;
  scaleRatio: number;
  lineHeightRatio: number;
}

export interface TypographyLevel {
  level: number;
  name: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export interface BrandStyleGuide {
  id: string;
  name: string;
  colorPalette: {
    primary: ExtractedColor;
    secondary: ExtractedColor;
    accent: ExtractedColor;
    neutrals: ExtractedColor[];
  };
  typography: {
    headingFont: ExtractedFont;
    bodyFont: ExtractedFont;
    hierarchy: TypographyHierarchy;
  };
  spacing: SpacingAnalysis;
  layout: LayoutGrid;
  generatedAt: Date;
}

export interface FontMatch {
  requestedFont: string;
  matches: {
    fontName: string;
    similarity: number;
    source: 'google_fonts' | 'system' | 'custom';
    category: string;
  }[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class StyleExtractorService {
  private readonly COMMON_FONTS: Record<string, string[]> = {
    'serif': ['Georgia', 'Times New Roman', 'Palatino', 'Book Antiqua', 'Garamond'],
    'sans-serif': ['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Open Sans', 'Roboto', 'Inter'],
    'monospace': ['Courier New', 'Consolas', 'Monaco', 'Fira Code', 'JetBrains Mono'],
    'arabic': ['Cairo', 'Tajawal', 'Amiri', 'Noto Sans Arabic', 'IBM Plex Sans Arabic'],
  };

  constructor(private prisma: PrismaClient) {}

  async extractColorsFromImage(imageBuffer: Buffer, maxColors: number = 10): Promise<ExtractedColor[]> {
    const { data, info } = await sharp(imageBuffer)
      .resize(200, 200, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const colorMap = new Map<string, { r: number; g: number; b: number; count: number }>();
    const pixelCount = data.length / info.channels;

    for (let i = 0; i < data.length; i += info.channels) {
      const r = Math.round(data[i] / 16) * 16;
      const g = Math.round(data[i + 1] / 16) * 16;
      const b = Math.round(data[i + 2] / 16) * 16;
      const key = `${r},${g},${b}`;

      const existing = colorMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        colorMap.set(key, { r, g, b, count: 1 });
      }
    }

    const sortedColors = Array.from(colorMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, maxColors * 3);

    const mergedColors = this.mergeNearbyColors(sortedColors);
    const topColors = mergedColors.slice(0, maxColors);

    const extractedColors: ExtractedColor[] = topColors.map((color, index) => {
      const hex = `#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`.toUpperCase();
      const hsl = this.rgbToHsl(color.r, color.g, color.b);
      const frequency = color.count / pixelCount;

      let usage: ExtractedColor['usage'] = 'accent';
      if (index === 0) usage = frequency > 0.3 ? 'background' : 'primary';
      else if (index === 1) usage = 'secondary';
      else if (hsl.l > 90) usage = 'background';
      else if (hsl.l < 20) usage = 'text';
      else if (hsl.s < 10) usage = 'border';

      return {
        hex,
        rgb: { r: color.r, g: color.g, b: color.b },
        hsl,
        usage,
        frequency: Math.round(frequency * 10000) / 100,
      };
    });

    return extractedColors;
  }

  private mergeNearbyColors(
    colors: { r: number; g: number; b: number; count: number }[],
  ): { r: number; g: number; b: number; count: number }[] {
    const merged: { r: number; g: number; b: number; count: number }[] = [];
    const used = new Set<number>();
    const threshold = 40;

    for (let i = 0; i < colors.length; i++) {
      if (used.has(i)) continue;
      let totalR = colors[i].r * colors[i].count;
      let totalG = colors[i].g * colors[i].count;
      let totalB = colors[i].b * colors[i].count;
      let totalCount = colors[i].count;

      for (let j = i + 1; j < colors.length; j++) {
        if (used.has(j)) continue;
        const dist = Math.sqrt(
          Math.pow(colors[i].r - colors[j].r, 2) +
          Math.pow(colors[i].g - colors[j].g, 2) +
          Math.pow(colors[i].b - colors[j].b, 2),
        );
        if (dist < threshold) {
          totalR += colors[j].r * colors[j].count;
          totalG += colors[j].g * colors[j].count;
          totalB += colors[j].b * colors[j].count;
          totalCount += colors[j].count;
          used.add(j);
        }
      }

      merged.push({
        r: Math.round(totalR / totalCount),
        g: Math.round(totalG / totalCount),
        b: Math.round(totalB / totalCount),
        count: totalCount,
      });
      used.add(i);
    }

    return merged.sort((a, b) => b.count - a.count);
  }

  private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
      else if (max === gn) h = ((bn - rn) / d + 2) / 6;
      else h = ((rn - gn) / d + 4) / 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  async detectFontFromImage(imageBuffer: Buffer): Promise<ExtractedFont[]> {
    const { info } = await sharp(imageBuffer).metadata() as { info: sharp.OutputInfo } & sharp.Metadata;
    const metadata = await sharp(imageBuffer).metadata();

    const detectedFonts: ExtractedFont[] = [];

    const image = await sharp(imageBuffer).grayscale().raw().toBuffer({ resolveWithObject: true });
    const { data, info: grayInfo } = image;

    const edgeStrength = this.calculateEdgeStrength(data, grayInfo.width, grayInfo.height);
    const hasSerifs = edgeStrength > 0.6;
    const isMonospace = this.detectMonospacePattern(data, grayInfo.width, grayInfo.height);

    if (isMonospace) {
      detectedFonts.push({
        family: 'Monospace detected',
        weights: [400, 700],
        sizes: [13, 14],
        usage: 'body',
        confidence: 0.7,
        fallbacks: this.COMMON_FONTS.monospace,
      });
    } else if (hasSerifs) {
      detectedFonts.push({
        family: 'Serif detected',
        weights: [400, 700],
        sizes: [14, 16, 24],
        usage: 'body',
        confidence: 0.65,
        fallbacks: this.COMMON_FONTS.serif,
      });
    } else {
      detectedFonts.push({
        family: 'Sans-serif detected',
        weights: [400, 500, 700],
        sizes: [14, 16, 20, 28],
        usage: 'body',
        confidence: 0.75,
        fallbacks: this.COMMON_FONTS['sans-serif'],
      });
    }

    detectedFonts.push({
      family: 'Arabic font detected',
      weights: [400, 700],
      sizes: [14, 16, 24],
      usage: 'body',
      confidence: 0.5,
      fallbacks: this.COMMON_FONTS.arabic,
    });

    return detectedFonts;
  }

  private calculateEdgeStrength(data: Buffer, width: number, height: number): number {
    let totalEdge = 0;
    let pixelCount = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const gx = -data[idx - width - 1] + data[idx - width + 1]
          - 2 * data[idx - 1] + 2 * data[idx + 1]
          - data[idx + width - 1] + data[idx + width + 1];
        const gy = -data[idx - width - 1] - 2 * data[idx - width] - data[idx - width + 1]
          + data[idx + width - 1] + 2 * data[idx + width] + data[idx + width + 1];
        totalEdge += Math.sqrt(gx * gx + gy * gy);
        pixelCount += 1;
      }
    }

    const avgEdge = pixelCount > 0 ? totalEdge / pixelCount : 0;
    return Math.min(1, avgEdge / 255);
  }

  private detectMonospacePattern(data: Buffer, width: number, height: number): boolean {
    const rowProfiles: number[] = [];
    const sampleRows = Math.min(20, height);
    const step = Math.max(1, Math.floor(height / sampleRows));

    for (let y = 0; y < height; y += step) {
      let transitions = 0;
      let prevBright = data[y * width] > 128;
      for (let x = 1; x < width; x++) {
        const bright = data[y * width + x] > 128;
        if (bright !== prevBright) transitions += 1;
        prevBright = bright;
      }
      rowProfiles.push(transitions);
    }

    const validProfiles = rowProfiles.filter(p => p > 5);
    if (validProfiles.length < 3) return false;

    const avg = validProfiles.reduce((a, b) => a + b, 0) / validProfiles.length;
    const variance = validProfiles.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / validProfiles.length;
    const cv = avg > 0 ? Math.sqrt(variance) / avg : 1;

    return cv < 0.15;
  }

  async detectLayoutGrid(imageBuffer: Buffer): Promise<LayoutGrid> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;

    const { data, info } = await sharp(imageBuffer)
      .grayscale()
      .resize(Math.min(width, 400), Math.min(height, 400), { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const scaleX = width / info.width;
    const scaleY = height / info.height;

    const verticalProjection = new Array(info.width).fill(0);
    const horizontalProjection = new Array(info.height).fill(0);

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const val = data[y * info.width + x];
        if (val < 200) {
          verticalProjection[x] += 1;
          horizontalProjection[y] += 1;
        }
      }
    }

    const verticalThreshold = Math.max(...verticalProjection) * 0.1;
    let marginLeft = 0;
    let marginRight = 0;

    for (let x = 0; x < info.width; x++) {
      if (verticalProjection[x] > verticalThreshold) {
        marginLeft = Math.round(x * scaleX);
        break;
      }
    }
    for (let x = info.width - 1; x >= 0; x--) {
      if (verticalProjection[x] > verticalThreshold) {
        marginRight = Math.round((info.width - x) * scaleX);
        break;
      }
    }

    const horizontalThreshold = Math.max(...horizontalProjection) * 0.1;
    let marginTop = 0;
    let marginBottom = 0;

    for (let y = 0; y < info.height; y++) {
      if (horizontalProjection[y] > horizontalThreshold) {
        marginTop = Math.round(y * scaleY);
        break;
      }
    }
    for (let y = info.height - 1; y >= 0; y--) {
      if (horizontalProjection[y] > horizontalThreshold) {
        marginBottom = Math.round((info.height - y) * scaleY);
        break;
      }
    }

    const contentWidth = width - marginLeft - marginRight;
    const gaps: number[] = [];
    let inGap = false;
    let gapStart = 0;

    for (let x = Math.round(marginLeft / scaleX); x < info.width - Math.round(marginRight / scaleX); x++) {
      if (verticalProjection[x] <= verticalThreshold) {
        if (!inGap) {
          gapStart = x;
          inGap = true;
        }
      } else {
        if (inGap) {
          const gapWidth = (x - gapStart) * scaleX;
          if (gapWidth > 5) gaps.push(gapWidth);
          inGap = false;
        }
      }
    }

    const gutterWidth = gaps.length > 0
      ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
      : 20;
    const columns = Math.max(1, gaps.length + 1);

    const gridLines: { position: number; type: 'vertical' | 'horizontal' }[] = [];
    gridLines.push({ position: marginLeft, type: 'vertical' });
    gridLines.push({ position: width - marginRight, type: 'vertical' });
    if (columns > 1) {
      const colWidth = (contentWidth - gutterWidth * (columns - 1)) / columns;
      for (let i = 1; i < columns; i++) {
        gridLines.push({ position: Math.round(marginLeft + i * (colWidth + gutterWidth)), type: 'vertical' });
      }
    }

    return {
      columns,
      gutterWidth,
      marginLeft,
      marginRight,
      marginTop,
      marginBottom,
      contentWidth,
      gridLines,
    };
  }

  async analyzeSpacing(imageBuffer: Buffer): Promise<SpacingAnalysis> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;

    const { data, info } = await sharp(imageBuffer)
      .grayscale()
      .resize(Math.min(width, 300), Math.min(height, 300), { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const scaleY = height / info.height;
    const horizontalGaps: number[] = [];
    let inContent = false;
    let contentEnd = 0;
    const contentThreshold = info.width * 0.05;

    for (let y = 0; y < info.height; y++) {
      let rowSum = 0;
      for (let x = 0; x < info.width; x++) {
        if (data[y * info.width + x] < 200) rowSum += 1;
      }

      if (rowSum > contentThreshold) {
        if (!inContent && contentEnd > 0) {
          horizontalGaps.push(Math.round((y - contentEnd) * scaleY));
        }
        inContent = true;
      } else {
        if (inContent) {
          contentEnd = y;
          inContent = false;
        }
      }
    }

    const sortedGaps = [...horizontalGaps].sort((a, b) => a - b);
    const lineSpacing = sortedGaps.length > 0 ? sortedGaps[0] : 8;
    const paragraphSpacing = sortedGaps.length > 1 ? sortedGaps[Math.floor(sortedGaps.length / 2)] : lineSpacing * 2;

    const gapCounts = new Map<number, number>();
    for (const gap of horizontalGaps) {
      const rounded = Math.round(gap / 4) * 4;
      gapCounts.set(rounded, (gapCounts.get(rounded) || 0) + 1);
    }

    const consistentSpacings = Array.from(gapCounts.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([spacing]) => spacing);

    const baseUnit = consistentSpacings.length > 0
      ? this.gcd(consistentSpacings.reduce((a, b) => this.gcd(a, b), consistentSpacings[0]), consistentSpacings[0])
      : 8;

    return {
      baseUnit: Math.max(4, baseUnit),
      elementSpacings: horizontalGaps.map((gap, i) => ({
        from: `element_${i}`,
        to: `element_${i + 1}`,
        distance: gap,
      })),
      consistentSpacings,
      sectionPadding: { top: 20, right: 20, bottom: 20, left: 20 },
      lineSpacing,
      paragraphSpacing,
    };
  }

  private gcd(a: number, b: number): number {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  async detectTypographyHierarchy(
    fontSizes: number[],
    fontWeights: number[],
    colors: string[],
  ): Promise<TypographyHierarchy> {
    const uniqueSizes = [...new Set(fontSizes)].sort((a, b) => b - a);
    const uniqueWeights = [...new Set(fontWeights)].sort((a, b) => b - a);

    const baseSize = uniqueSizes.length > 0 ? uniqueSizes[Math.floor(uniqueSizes.length * 0.6)] : 16;

    let scaleRatio = 1.25;
    if (uniqueSizes.length >= 2) {
      const ratios: number[] = [];
      for (let i = 0; i < uniqueSizes.length - 1; i++) {
        const ratio = uniqueSizes[i] / uniqueSizes[i + 1];
        if (ratio > 1 && ratio < 3) ratios.push(ratio);
      }
      if (ratios.length > 0) {
        scaleRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      }
    }

    const levelNames = ['Display', 'H1', 'H2', 'H3', 'H4', 'Body', 'Caption', 'Overline'];
    const levels: TypographyLevel[] = uniqueSizes.slice(0, 8).map((size, index) => {
      const weight = index < uniqueWeights.length ? uniqueWeights[Math.min(index, uniqueWeights.length - 1)] : 400;
      const color = index < colors.length ? colors[Math.min(index, colors.length - 1)] : '#333333';

      return {
        level: index + 1,
        name: levelNames[index] || `Level ${index + 1}`,
        fontSize: size,
        fontWeight: weight,
        lineHeight: Math.round(size * 1.4),
        letterSpacing: index < 2 ? -0.5 : index > 5 ? 0.5 : 0,
        color,
        textTransform: index > 6 ? 'uppercase' : 'none',
      };
    });

    const lineHeightRatio = levels.length > 0
      ? levels.reduce((sum, l) => sum + l.lineHeight / l.fontSize, 0) / levels.length
      : 1.5;

    return {
      levels,
      baseSize,
      scaleRatio: Math.round(scaleRatio * 100) / 100,
      lineHeightRatio: Math.round(lineHeightRatio * 100) / 100,
    };
  }

  async generateBrandStyleGuide(
    documentId: string,
    imageBuffer: Buffer,
    name: string,
  ): Promise<BrandStyleGuide> {
    const [colors, fonts, layout, spacing] = await Promise.all([
      this.extractColorsFromImage(imageBuffer, 12),
      this.detectFontFromImage(imageBuffer),
      this.detectLayoutGrid(imageBuffer),
      this.analyzeSpacing(imageBuffer),
    ]);

    const primary = colors.find(c => c.usage === 'primary') || colors[0];
    const secondary = colors.find(c => c.usage === 'secondary') || colors[1] || primary;
    const accent = colors.find(c => c.usage === 'accent') || colors[2] || secondary;
    const neutrals = colors.filter(c => c.usage === 'background' || c.usage === 'border' || c.usage === 'text');

    const headingFont = fonts.find(f => f.usage === 'heading') || fonts[0];
    const bodyFont = fonts.find(f => f.usage === 'body') || fonts[0];

    const fontSizes = fonts.flatMap(f => f.sizes);
    const fontWeights = fonts.flatMap(f => f.weights);
    const textColors = colors.filter(c => c.usage === 'text' || c.hsl.l < 50).map(c => c.hex);
    const hierarchy = await this.detectTypographyHierarchy(fontSizes, fontWeights, textColors);

    const guide: BrandStyleGuide = {
      id: `guide_${Date.now()}`,
      name,
      colorPalette: { primary, secondary, accent, neutrals },
      typography: { headingFont, bodyFont, hierarchy },
      spacing,
      layout,
      generatedAt: new Date(),
    };

    await this.prisma.brandStyleGuide.create({
      data: {
        sourceDocumentId: documentId,
        name,
        colorPalette: JSON.stringify(guide.colorPalette),
        typography: JSON.stringify(guide.typography),
        spacing: JSON.stringify(guide.spacing),
        layout: JSON.stringify(guide.layout),
        generatedAt: guide.generatedAt,
      },
    });

    return guide;
  }

  async findMatchingFonts(fontName: string): Promise<FontMatch> {
    const allFonts = Object.values(this.COMMON_FONTS).flat();
    const matches: FontMatch['matches'] = [];

    for (const candidate of allFonts) {
      const similarity = this.calculateStringSimilarity(fontName.toLowerCase(), candidate.toLowerCase());
      const category = Object.entries(this.COMMON_FONTS)
        .find(([_, fonts]) => fonts.includes(candidate))?.[0] || 'unknown';

      if (similarity > 0.2) {
        matches.push({
          fontName: candidate,
          similarity: Math.round(similarity * 100) / 100,
          source: 'system',
          category,
        });
      }
    }

    matches.sort((a, b) => b.similarity - a.similarity);

    return { requestedFont: fontName, matches: matches.slice(0, 5) };
  }

  private calculateStringSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    const matrix: number[][] = [];
    for (let i = 0; i <= shorter.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= longer.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= shorter.length; i++) {
      for (let j = 1; j <= longer.length; j++) {
        const cost = shorter[i - 1] === longer[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }

    const distance = matrix[shorter.length][longer.length];
    return 1 - distance / longer.length;
  }
}
