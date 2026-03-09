import sharp from 'sharp';
import { createCanvas } from 'canvas';
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import crypto from 'crypto';

const prisma = new PrismaClient();
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'design-engine' },
  transports: [new winston.transports.Console()],
});

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / d + 2) / 6;
    } else {
      h = ((r - g) / d + 4) / 6;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export async function createTheme(
  name: string,
  colors: string[],
  fonts: string[],
  backgrounds: string[],
  tenantId: string
): Promise<Record<string, unknown>> {
  const themeId = crypto.randomUUID();
  const primaryColor = colors[0] || '#1a73e8';
  const secondaryColor = colors[1] || '#ffffff';
  const accentColor = colors[2] || '#fbbc04';
  const primaryFont = fonts[0] || 'Arial';
  const secondaryFont = fonts[1] || 'Helvetica';
  const primaryBg = backgrounds[0] || '#ffffff';

  const themeData = {
    primaryColor,
    secondaryColor,
    accentColor,
    allColors: colors,
    primaryFont,
    secondaryFont,
    allFonts: fonts,
    backgrounds,
    primaryBackground: primaryBg,
    headerFontSize: 36,
    bodyFontSize: 18,
    captionFontSize: 12,
  };

  const record = await prisma.theme.create({
    data: {
      id: themeId,
      name: name,
      tenantId: tenantId,
      colors: JSON.parse(JSON.stringify(themeData)),
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info('Theme created', { themeId, name, tenantId, colorCount: colors.length });
  return {
    id: record.id,
    name: record.name,
    tenantId,
    theme: themeData,
  };
}

export async function applyBranding(
  presId: string,
  brand: { logo: Buffer; primaryColor: string; secondaryColor: string; fontFamily: string }
): Promise<Record<string, unknown>> {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presId },
  });
  if (!presentation) {
    throw new Error(`Presentation ${presId} not found`);
  }

  const logoResized = await sharp(brand.logo)
    .resize(120, 60, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  const logoBase64 = `data:image/png;base64,${logoResized.toString('base64')}`;

  const existingTheme = JSON.parse(presentation.theme as string);
  const brandedTheme = {
    ...existingTheme,
    primaryColor: brand.primaryColor || existingTheme.primaryColor,
    secondaryColor: brand.secondaryColor || existingTheme.secondaryColor,
    fontFamily: brand.fontFamily || existingTheme.fontFamily,
    brandLogo: logoBase64,
  };

  await prisma.presentation.update({
    where: { id: presId },
    data: { theme: JSON.stringify(brandedTheme), updatedAt: new Date() },
  });

  const slides = await prisma.slide.findMany({
    where: { presentationId: presId },
    orderBy: { slideIndex: 'asc' },
  });

  let updatedCount = 0;
  for (const slide of slides) {
    const content = JSON.parse(slide.content as string);
    const elements = content.elements || [];

    const hasLogo = elements.some((el: Record<string, unknown>) => el.id === 'brand-logo');
    if (!hasLogo) {
      elements.push({
        id: 'brand-logo',
        type: 'image',
        data: logoBase64,
        options: { x: 8.5, y: 0.1, w: 1.2, h: 0.6 },
      });
    }

    for (const el of elements) {
      if (el.type === 'text' && el.options) {
        if (el.options.bold) {
          el.options.color = brand.primaryColor.replace('#', '');
        }
        el.options.fontFace = brand.fontFamily;
      }
    }

    content.elements = elements;
    await prisma.slide.update({
      where: { id: slide.id },
      data: { content: JSON.stringify(content), updatedAt: new Date() },
    });
    updatedCount++;
  }

  logger.info('Branding applied', { presId, updatedSlides: updatedCount });
  return {
    presentationId: presId,
    brandedTheme,
    updatedSlides: updatedCount,
    logoSize: logoResized.length,
  };
}

export function generateColorPalette(baseColor: string, count: number): Record<string, unknown> {
  const hsl = hexToHsl(baseColor);
  const palette: string[] = [baseColor];
  const strategies = ['complementary', 'analogous', 'triadic', 'split-complementary'];

  const targetCount = Math.max(count, 2);

  const complementary = hslToHex((hsl.h + 180) % 360, hsl.s, hsl.l);
  palette.push(complementary);

  if (palette.length < targetCount) {
    const analogous1 = hslToHex((hsl.h + 30) % 360, hsl.s, hsl.l);
    palette.push(analogous1);
  }
  if (palette.length < targetCount) {
    const analogous2 = hslToHex((hsl.h + 330) % 360, hsl.s, hsl.l);
    palette.push(analogous2);
  }
  if (palette.length < targetCount) {
    const triadic1 = hslToHex((hsl.h + 120) % 360, hsl.s, hsl.l);
    palette.push(triadic1);
  }
  if (palette.length < targetCount) {
    const triadic2 = hslToHex((hsl.h + 240) % 360, hsl.s, hsl.l);
    palette.push(triadic2);
  }

  while (palette.length < targetCount) {
    const lightVariant = hslToHex(
      hsl.h,
      Math.max(hsl.s - 20, 10),
      Math.min(hsl.l + 15 * (palette.length - 5), 95)
    );
    palette.push(lightVariant);
  }

  const finalPalette = palette.slice(0, count);

  logger.info('Color palette generated', { baseColor, count, generated: finalPalette.length });
  return {
    baseColor,
    palette: finalPalette,
    baseHsl: hsl,
    strategy: 'mixed-harmony',
    count: finalPalette.length,
  };
}

export async function addEntryAnimation(
  presId: string,
  slideIndex: number,
  elementId: string,
  animation: string
): Promise<Record<string, unknown>> {
  const slide = await prisma.slide.findFirst({
    where: { presentationId: presId, slideIndex: slideIndex },
  });
  if (!slide) {
    throw new Error(`Slide at index ${slideIndex} not found`);
  }

  const animationTypes: Record<string, Record<string, unknown>> = {
    fadeIn: { type: 'fade', direction: 'in', duration: 500, delay: 0 },
    slideLeft: { type: 'slide', direction: 'left', duration: 700, delay: 0 },
    slideRight: { type: 'slide', direction: 'right', duration: 700, delay: 0 },
    slideUp: { type: 'slide', direction: 'up', duration: 700, delay: 0 },
    slideDown: { type: 'slide', direction: 'down', duration: 700, delay: 0 },
    zoomIn: { type: 'zoom', direction: 'in', duration: 600, delay: 0 },
    bounce: { type: 'bounce', direction: 'in', duration: 800, delay: 0 },
    spin: { type: 'spin', direction: 'clockwise', duration: 1000, delay: 0 },
  };

  const animConfig = animationTypes[animation] || animationTypes['fadeIn'];

  const content = JSON.parse(slide.content as string);
  content.animations = content.animations || [];
  content.animations.push({
    elementId,
    animation: animConfig,
    order: content.animations.length,
  });

  await prisma.slide.update({
    where: { id: slide.id },
    data: { content: JSON.stringify(content), updatedAt: new Date() },
  });

  logger.info('Animation added', { presId, slideIndex, elementId, animation });
  return {
    presId,
    slideIndex,
    elementId,
    animation: animConfig,
    order: content.animations.length - 1,
  };
}

export async function exportToImages(
  presId: string,
  format: 'png' | 'jpeg'
): Promise<Buffer[]> {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presId },
  });
  if (!presentation) {
    throw new Error(`Presentation ${presId} not found`);
  }

  const slides = await prisma.slide.findMany({
    where: { presentationId: presId },
    orderBy: { slideIndex: 'asc' },
  });

  const theme = JSON.parse(presentation.theme as string);
  const pageWidth = 960;
  const pageHeight = 720;
  const images: Buffer[] = [];

  for (const slideRecord of slides) {
    const slideData = JSON.parse(slideRecord.content as string);
    const cvs = createCanvas(pageWidth, pageHeight);
    const ctx = cvs.getContext('2d');

    const bgColor = theme.backgroundColor || '#ffffff';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, pageWidth, pageHeight);

    const elements = slideData.elements || [];
    for (const el of elements) {
      if (el.type === 'text') {
        const fontSize = el.options?.fontSize || 18;
        const bold = el.options?.bold ? 'bold ' : '';
        const fontFace = el.options?.fontFace || 'Arial';
        ctx.font = `${bold}${fontSize}px ${fontFace}`;
        ctx.fillStyle = `#${el.options?.color || '333333'}`;
        const xPx = (el.options?.x || 0) * 96;
        const yPx = (el.options?.y || 0) * 96 + fontSize;
        const maxWidth = (el.options?.w || 5) * 96;
        const words = (el.text || '').split(' ');
        let line = '';
        let lineY = yPx;
        for (const word of words) {
          const testLine = line ? `${line} ${word}` : word;
          if (ctx.measureText(testLine).width > maxWidth && line) {
            ctx.fillText(line, xPx, lineY);
            line = word;
            lineY += fontSize * 1.3;
          } else {
            line = testLine;
          }
        }
        if (line) {
          ctx.fillText(line, xPx, lineY);
        }
      } else if (el.type === 'shape') {
        const xPx = (el.options?.x || 0) * 96;
        const yPx = (el.options?.y || 0) * 96;
        const wPx = (el.options?.w || 2) * 96;
        const hPx = (el.options?.h || 2) * 96;
        ctx.fillStyle = `#${el.options?.fill?.color || '4285f4'}`;
        if (el.shapeType === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(xPx + wPx / 2, yPx + hPx / 2, wPx / 2, hPx / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(xPx, yPx, wPx, hPx);
        }
      }
    }

    const rawBuffer = cvs.toBuffer('image/png');
    let outputBuffer: Buffer;
    if (format === 'jpeg') {
      outputBuffer = await sharp(rawBuffer).jpeg({ quality: 90 }).toBuffer();
    } else {
      outputBuffer = await sharp(rawBuffer).png({ compressionLevel: 6 }).toBuffer();
    }
    images.push(outputBuffer);
  }

  logger.info('Slides exported to images', { presId, format, count: images.length });
  return images;
}
