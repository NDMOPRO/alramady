import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/auth.js';

// Helper to cast objects to Prisma-compatible InputJsonValue
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

const router = Router();
const prisma = new PrismaClient();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function generatePaletteFromBase(baseColor: string, count: number): string[] {
  const { h, s, l } = hexToHsl(baseColor);
  const palette: string[] = [baseColor];
  const step = 360 / count;
  for (let i = 1; i < count; i++) {
    const newH = (h + step * i) % 360;
    palette.push(hslToHex(newH, s, l));
  }
  return palette;
}

function generateComplementary(baseColor: string): string[] {
  const { h, s, l } = hexToHsl(baseColor);
  return [
    baseColor,
    hslToHex((h + 180) % 360, s, l),
    hslToHex((h + 30) % 360, s, Math.min(l + 15, 95)),
    hslToHex((h + 210) % 360, s, Math.max(l - 15, 10)),
    hslToHex(h, Math.max(s - 30, 10), Math.min(l + 25, 95)),
  ];
}

// ─── Validation Schemas ─────────────────────────────────────────────────────

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  category: z.string().min(1).max(100),
  layout: z.enum([
    'title', 'title_content', 'two_column', 'comparison', 'section_header',
    'blank', 'content_only', 'image_left', 'image_right', 'full_image',
    'three_column', 'dashboard', 'quote', 'timeline',
  ]),
  elements: z.array(z.object({
    type: z.enum(['text', 'image', 'shape', 'chart', 'table', 'placeholder', 'icon']),
    name: z.string(),
    position: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
    style: z.record(z.unknown()).optional(),
    content: z.string().optional(),
    placeholder: z.string().optional(),
    locked: z.boolean().optional(),
    visible: z.boolean().optional(),
    layer: z.number().optional(),
  })).optional(),
  backgroundColor: z.string().optional(),
  backgroundImage: z.string().optional(),
  transitions: z.object({
    type: z.enum(['none', 'fade', 'slide', 'push', 'wipe', 'dissolve', 'zoom']).optional(),
    duration: z.number().min(0).max(5000).optional(),
    direction: z.enum(['left', 'right', 'up', 'down']).optional(),
  }).optional(),
  masterSlideId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().min(1).max(100).optional(),
  layout: z.enum([
    'title', 'title_content', 'two_column', 'comparison', 'section_header',
    'blank', 'content_only', 'image_left', 'image_right', 'full_image',
    'three_column', 'dashboard', 'quote', 'timeline',
  ]).optional(),
  elements: z.array(z.object({
    type: z.enum(['text', 'image', 'shape', 'chart', 'table', 'placeholder', 'icon']),
    name: z.string(),
    position: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
    style: z.record(z.unknown()).optional(),
    content: z.string().optional(),
    placeholder: z.string().optional(),
    locked: z.boolean().optional(),
    visible: z.boolean().optional(),
    layer: z.number().optional(),
  })).optional(),
  backgroundColor: z.string().optional(),
  backgroundImage: z.string().optional(),
  transitions: z.object({
    type: z.enum(['none', 'fade', 'slide', 'push', 'wipe', 'dissolve', 'zoom']).optional(),
    duration: z.number().min(0).max(5000).optional(),
    direction: z.enum(['left', 'right', 'up', 'down']).optional(),
  }).optional(),
  masterSlideId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const shareTemplateSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
  permission: z.enum(['view', 'edit', 'admin']).optional(),
});

const fromPresentationSchema = z.object({
  presentationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  category: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
});

const createThemeSchema = z.object({
  name: z.string().min(1).max(200),
  colors: z.object({
    primary: z.string().min(4),
    secondary: z.string().min(4),
    accent1: z.string().min(4).optional(),
    accent2: z.string().min(4).optional(),
    background: z.string().min(4).optional(),
    text: z.string().min(4).optional(),
    lightText: z.string().min(4).optional(),
    darkText: z.string().min(4).optional(),
  }),
  fonts: z.object({
    titleFont: z.string().min(1),
    bodyFont: z.string().min(1),
    captionFont: z.string().optional(),
    titleSizes: z.object({
      large: z.number().optional(),
      medium: z.number().optional(),
      small: z.number().optional(),
    }).optional(),
    bodySizes: z.object({
      large: z.number().optional(),
      medium: z.number().optional(),
      small: z.number().optional(),
    }).optional(),
  }),
  backgrounds: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

const updateThemeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  colors: z.object({
    primary: z.string().min(4).optional(),
    secondary: z.string().min(4).optional(),
    accent1: z.string().min(4).optional(),
    accent2: z.string().min(4).optional(),
    background: z.string().min(4).optional(),
    text: z.string().min(4).optional(),
    lightText: z.string().min(4).optional(),
    darkText: z.string().min(4).optional(),
  }).optional(),
  fonts: z.object({
    titleFont: z.string().min(1).optional(),
    bodyFont: z.string().min(1).optional(),
    captionFont: z.string().optional(),
    titleSizes: z.object({
      large: z.number().optional(),
      medium: z.number().optional(),
      small: z.number().optional(),
    }).optional(),
    bodySizes: z.object({
      large: z.number().optional(),
      medium: z.number().optional(),
      small: z.number().optional(),
    }).optional(),
  }).optional(),
  backgrounds: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

const extractIdentitySchema = z.object({
  imageUrl: z.string().url().optional(),
  companyName: z.string().optional(),
  websiteUrl: z.string().url().optional(),
});

const brandKitSchema = z.object({
  name: z.string().min(1).max(200),
  logo: z.string().optional(),
  colors: z.object({
    primary: z.string().min(4),
    secondary: z.string().min(4),
    accent: z.string().min(4).optional(),
    background: z.string().min(4).optional(),
    text: z.string().min(4).optional(),
  }),
  fonts: z.object({
    heading: z.string().min(1),
    body: z.string().min(1),
    accent: z.string().optional(),
  }),
  logoPosition: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']).optional(),
  guidelines: z.string().optional(),
});

const brandMatchSchema = z.object({
  sourcePresentationId: z.string().uuid(),
  targetPresentationId: z.string().uuid(),
});

const createMasterSlideSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  backgroundColor: z.string().min(4).optional(),
  backgroundImage: z.string().optional(),
  headerStyle: z.record(z.unknown()).optional(),
  footerStyle: z.record(z.unknown()).optional(),
  elements: z.record(z.unknown()).optional(),
  layout: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
});

const updateMasterSlideSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  backgroundColor: z.string().min(4).optional(),
  backgroundImage: z.string().optional(),
  headerStyle: z.record(z.unknown()).optional(),
  footerStyle: z.record(z.unknown()).optional(),
  elements: z.record(z.unknown()).optional(),
  layout: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
});

const colorPaletteSchema = z.object({
  baseColor: z.string().min(4).max(9),
  count: z.number().min(2).max(20).optional(),
  mode: z.enum(['analogous', 'complementary', 'triadic', 'tetradic', 'monochromatic', 'split-complementary']).optional(),
});

const colorModeSchema = z.object({
  presentationId: z.string().uuid(),
  mode: z.enum(['light', 'dark', 'auto', 'high-contrast']),
});

const createArchetypeSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().min(1).max(100),
  layout: z.record(z.unknown()),
  elements: z.array(z.record(z.unknown())).optional(),
  thumbnail: z.string().optional(),
});

// ─── Prebuilt Template Definitions ──────────────────────────────────────────

interface PrebuiltTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  colorPalette: {
    primary: string;
    secondary: string;
    accent1: string;
    accent2: string;
    background: string;
    text: string;
    lightText: string;
    darkText: string;
  };
  fonts: {
    titleFont: string;
    bodyFont: string;
    captionFont: string;
    titleSizes: { large: number; medium: number; small: number };
    bodySizes: { large: number; medium: number; small: number };
  };
  layouts: Array<{
    name: string;
    type: string;
    elements: Array<{
      id: string;
      type: string;
      name: string;
      position: { x: number; y: number; w: number; h: number };
      style: Record<string, unknown>;
      placeholder?: string;
      locked: boolean;
      visible: boolean;
      layer: number;
    }>;
    backgroundColor: string;
    backgroundGradient?: { start: string; end: string; angle: number };
    backgroundTexture?: string;
  }>;
  transitions: { type: string; duration: number; direction?: string };
  metadata: Record<string, unknown>;
}

const PREBUILT_TEMPLATES: PrebuiltTemplate[] = [
  {
    id: 'prebuilt-vinyl-001',
    name: 'Vinyl',
    description: 'Dark theme with bold typography inspired by vinyl record aesthetics. High contrast with vintage warmth.',
    category: 'creative',
    colorPalette: {
      primary: '#1A1A2E',
      secondary: '#E94560',
      accent1: '#0F3460',
      accent2: '#16213E',
      background: '#0A0A0A',
      text: '#FFFFFF',
      lightText: '#A0A0B0',
      darkText: '#E0E0E0',
    },
    fonts: {
      titleFont: 'Bebas Neue',
      bodyFont: 'Inter',
      captionFont: 'JetBrains Mono',
      titleSizes: { large: 54, medium: 36, small: 28 },
      bodySizes: { large: 18, medium: 14, small: 11 },
    },
    layouts: [
      {
        name: 'Title Slide',
        type: 'title',
        elements: [
          {
            id: 'vinyl-title-bg', type: 'shape', name: 'Background Circle',
            position: { x: 6.5, y: 0.5, w: 4, h: 4 },
            style: { backgroundColor: '#E94560', opacity: 0.15, borderRadius: 999 },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'vinyl-title-line', type: 'shape', name: 'Accent Line',
            position: { x: 0.5, y: 1.4, w: 3, h: 0.06 },
            style: { backgroundColor: '#E94560' },
            locked: true, visible: true, layer: 1,
          },
          {
            id: 'vinyl-title-main', type: 'placeholder', name: 'Title',
            position: { x: 0.5, y: 1.6, w: 8, h: 1.5 },
            style: { fontSize: 54, fontBold: true, fontFamily: 'Bebas Neue', fontColor: '#FFFFFF', alignment: 'left', verticalAlign: 'middle' },
            placeholder: 'YOUR PRESENTATION TITLE', locked: false, visible: true, layer: 2,
          },
          {
            id: 'vinyl-title-sub', type: 'placeholder', name: 'Subtitle',
            position: { x: 0.5, y: 3.2, w: 6, h: 0.8 },
            style: { fontSize: 18, fontFamily: 'Inter', fontColor: '#A0A0B0', alignment: 'left', verticalAlign: 'top' },
            placeholder: 'Subtitle or presenter name', locked: false, visible: true, layer: 3,
          },
        ],
        backgroundColor: '#0A0A0A',
      },
      {
        name: 'Content Slide',
        type: 'title_content',
        elements: [
          {
            id: 'vinyl-content-bar', type: 'shape', name: 'Top Bar',
            position: { x: 0, y: 0, w: 10, h: 0.08 },
            style: { backgroundColor: '#E94560' },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'vinyl-content-title', type: 'placeholder', name: 'Title',
            position: { x: 0.5, y: 0.3, w: 9, h: 0.8 },
            style: { fontSize: 36, fontBold: true, fontFamily: 'Bebas Neue', fontColor: '#FFFFFF', alignment: 'left' },
            placeholder: 'SECTION TITLE', locked: false, visible: true, layer: 1,
          },
          {
            id: 'vinyl-content-body', type: 'placeholder', name: 'Content',
            position: { x: 0.5, y: 1.3, w: 9, h: 4 },
            style: { fontSize: 16, fontFamily: 'Inter', fontColor: '#E0E0E0', alignment: 'left', verticalAlign: 'top' },
            placeholder: 'Add your content here', locked: false, visible: true, layer: 2,
          },
        ],
        backgroundColor: '#1A1A2E',
      },
    ],
    transitions: { type: 'fade', duration: 400 },
    metadata: { style: 'dark', mood: 'bold', inspiration: 'vinyl-record' },
  },
  {
    id: 'prebuilt-whiteboard-002',
    name: 'Whiteboard',
    description: 'Clean white canvas with a handwritten feel, sketchy borders, and informal charm for brainstorming sessions.',
    category: 'education',
    colorPalette: {
      primary: '#2C2C2C',
      secondary: '#4A90D9',
      accent1: '#E8573A',
      accent2: '#F5A623',
      background: '#FAFAF8',
      text: '#2C2C2C',
      lightText: '#8E8E8E',
      darkText: '#1A1A1A',
    },
    fonts: {
      titleFont: 'Caveat',
      bodyFont: 'Nunito',
      captionFont: 'Patrick Hand',
      titleSizes: { large: 48, medium: 32, small: 24 },
      bodySizes: { large: 18, medium: 15, small: 12 },
    },
    layouts: [
      {
        name: 'Title Slide',
        type: 'title',
        elements: [
          {
            id: 'wb-title-border', type: 'shape', name: 'Sketchy Border',
            position: { x: 0.3, y: 0.3, w: 9.4, h: 4.9 },
            style: { borderColor: '#2C2C2C', borderWidth: 2, backgroundColor: 'transparent', opacity: 0.6 },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'wb-title-main', type: 'placeholder', name: 'Title',
            position: { x: 1, y: 1.2, w: 8, h: 1.8 },
            style: { fontSize: 48, fontBold: true, fontFamily: 'Caveat', fontColor: '#2C2C2C', alignment: 'center', verticalAlign: 'middle' },
            placeholder: 'Write your idea here...', locked: false, visible: true, layer: 1,
          },
          {
            id: 'wb-title-underline', type: 'shape', name: 'Underline',
            position: { x: 2.5, y: 3.0, w: 5, h: 0.04 },
            style: { backgroundColor: '#4A90D9', opacity: 0.7 },
            locked: true, visible: true, layer: 2,
          },
          {
            id: 'wb-title-sub', type: 'placeholder', name: 'Subtitle',
            position: { x: 1.5, y: 3.3, w: 7, h: 0.8 },
            style: { fontSize: 20, fontFamily: 'Nunito', fontColor: '#8E8E8E', alignment: 'center' },
            placeholder: 'Notes and details go here', locked: false, visible: true, layer: 3,
          },
        ],
        backgroundColor: '#FAFAF8',
        backgroundTexture: 'grid-dots',
      },
      {
        name: 'Content Slide',
        type: 'title_content',
        elements: [
          {
            id: 'wb-content-title', type: 'placeholder', name: 'Title',
            position: { x: 0.5, y: 0.3, w: 9, h: 0.9 },
            style: { fontSize: 32, fontBold: true, fontFamily: 'Caveat', fontColor: '#2C2C2C', alignment: 'left' },
            placeholder: 'Topic heading', locked: false, visible: true, layer: 0,
          },
          {
            id: 'wb-content-divider', type: 'shape', name: 'Divider',
            position: { x: 0.5, y: 1.2, w: 2, h: 0.04 },
            style: { backgroundColor: '#E8573A', opacity: 0.8 },
            locked: true, visible: true, layer: 1,
          },
          {
            id: 'wb-content-body', type: 'placeholder', name: 'Content',
            position: { x: 0.5, y: 1.5, w: 9, h: 3.8 },
            style: { fontSize: 16, fontFamily: 'Nunito', fontColor: '#2C2C2C', alignment: 'left', verticalAlign: 'top' },
            placeholder: 'Write your notes and content here...', locked: false, visible: true, layer: 2,
          },
        ],
        backgroundColor: '#FAFAF8',
        backgroundTexture: 'grid-dots',
      },
    ],
    transitions: { type: 'fade', duration: 300 },
    metadata: { style: 'sketchy', mood: 'informal', inspiration: 'whiteboard-brainstorm' },
  },
  {
    id: 'prebuilt-grove-003',
    name: 'Grove',
    description: 'Nature-inspired green palette with organic shapes and earthy tones. Perfect for sustainability and eco-friendly topics.',
    category: 'nature',
    colorPalette: {
      primary: '#2D6A4F',
      secondary: '#40916C',
      accent1: '#95D5B2',
      accent2: '#D4A373',
      background: '#F0F7F4',
      text: '#1B4332',
      lightText: '#74A68D',
      darkText: '#081C15',
    },
    fonts: {
      titleFont: 'Playfair Display',
      bodyFont: 'Source Sans Pro',
      captionFont: 'Lato',
      titleSizes: { large: 44, medium: 32, small: 24 },
      bodySizes: { large: 18, medium: 15, small: 12 },
    },
    layouts: [
      {
        name: 'Title Slide',
        type: 'title',
        elements: [
          {
            id: 'grove-title-leaf-l', type: 'shape', name: 'Left Leaf Accent',
            position: { x: -0.5, y: 3.5, w: 3, h: 3 },
            style: { backgroundColor: '#95D5B2', opacity: 0.25, borderRadius: 999 },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'grove-title-leaf-r', type: 'shape', name: 'Right Leaf Accent',
            position: { x: 7.5, y: -0.5, w: 4, h: 4 },
            style: { backgroundColor: '#2D6A4F', opacity: 0.12, borderRadius: 999 },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'grove-title-main', type: 'placeholder', name: 'Title',
            position: { x: 1, y: 1.5, w: 8, h: 1.5 },
            style: { fontSize: 44, fontBold: true, fontFamily: 'Playfair Display', fontColor: '#1B4332', alignment: 'center', verticalAlign: 'middle' },
            placeholder: 'Presentation Title', locked: false, visible: true, layer: 1,
          },
          {
            id: 'grove-title-bar', type: 'shape', name: 'Accent Bar',
            position: { x: 3.5, y: 3.1, w: 3, h: 0.05 },
            style: { backgroundColor: '#D4A373' },
            locked: true, visible: true, layer: 2,
          },
          {
            id: 'grove-title-sub', type: 'placeholder', name: 'Subtitle',
            position: { x: 1.5, y: 3.4, w: 7, h: 0.7 },
            style: { fontSize: 18, fontFamily: 'Source Sans Pro', fontColor: '#74A68D', alignment: 'center' },
            placeholder: 'A nature-inspired presentation', locked: false, visible: true, layer: 3,
          },
        ],
        backgroundColor: '#F0F7F4',
      },
      {
        name: 'Content Slide',
        type: 'title_content',
        elements: [
          {
            id: 'grove-content-accent', type: 'shape', name: 'Side Accent',
            position: { x: 0, y: 0, w: 0.15, h: 5.63 },
            style: { backgroundColor: '#2D6A4F' },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'grove-content-title', type: 'placeholder', name: 'Title',
            position: { x: 0.5, y: 0.3, w: 9, h: 0.8 },
            style: { fontSize: 32, fontBold: true, fontFamily: 'Playfair Display', fontColor: '#1B4332', alignment: 'left' },
            placeholder: 'Section Title', locked: false, visible: true, layer: 1,
          },
          {
            id: 'grove-content-body', type: 'placeholder', name: 'Content',
            position: { x: 0.5, y: 1.3, w: 9, h: 4 },
            style: { fontSize: 16, fontFamily: 'Source Sans Pro', fontColor: '#1B4332', alignment: 'left', verticalAlign: 'top' },
            placeholder: 'Your content here', locked: false, visible: true, layer: 2,
          },
        ],
        backgroundColor: '#F0F7F4',
      },
    ],
    transitions: { type: 'slide', duration: 500, direction: 'left' },
    metadata: { style: 'organic', mood: 'natural', inspiration: 'forest-grove' },
  },
  {
    id: 'prebuilt-fresco-004',
    name: 'Fresco',
    description: 'Warm Mediterranean palette with textured backgrounds, terracotta hues, and Renaissance-inspired elegance.',
    category: 'classic',
    colorPalette: {
      primary: '#8B4513',
      secondary: '#CD853F',
      accent1: '#D4A76A',
      accent2: '#A0522D',
      background: '#FDF5E6',
      text: '#3E2723',
      lightText: '#8D6E63',
      darkText: '#1B0F0A',
    },
    fonts: {
      titleFont: 'Cormorant Garamond',
      bodyFont: 'Crimson Text',
      captionFont: 'EB Garamond',
      titleSizes: { large: 46, medium: 34, small: 26 },
      bodySizes: { large: 18, medium: 15, small: 12 },
    },
    layouts: [
      {
        name: 'Title Slide',
        type: 'title',
        elements: [
          {
            id: 'fresco-title-frame-top', type: 'shape', name: 'Top Frame',
            position: { x: 0.5, y: 0.3, w: 9, h: 0.04 },
            style: { backgroundColor: '#CD853F' },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'fresco-title-frame-bot', type: 'shape', name: 'Bottom Frame',
            position: { x: 0.5, y: 5.2, w: 9, h: 0.04 },
            style: { backgroundColor: '#CD853F' },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'fresco-title-ornament', type: 'shape', name: 'Ornament Block',
            position: { x: 4.2, y: 0.8, w: 1.6, h: 0.4 },
            style: { backgroundColor: '#8B4513', opacity: 0.2, borderRadius: 4 },
            locked: true, visible: true, layer: 1,
          },
          {
            id: 'fresco-title-main', type: 'placeholder', name: 'Title',
            position: { x: 1, y: 1.4, w: 8, h: 1.5 },
            style: { fontSize: 46, fontBold: true, fontFamily: 'Cormorant Garamond', fontColor: '#3E2723', alignment: 'center', verticalAlign: 'middle' },
            placeholder: 'An Elegant Title', locked: false, visible: true, layer: 2,
          },
          {
            id: 'fresco-title-divider', type: 'shape', name: 'Divider',
            position: { x: 3, y: 3.0, w: 4, h: 0.02 },
            style: { backgroundColor: '#A0522D', opacity: 0.6 },
            locked: true, visible: true, layer: 3,
          },
          {
            id: 'fresco-title-sub', type: 'placeholder', name: 'Subtitle',
            position: { x: 1.5, y: 3.3, w: 7, h: 0.7 },
            style: { fontSize: 20, fontItalic: true, fontFamily: 'Crimson Text', fontColor: '#8D6E63', alignment: 'center' },
            placeholder: 'Subtitle with Mediterranean warmth', locked: false, visible: true, layer: 4,
          },
        ],
        backgroundColor: '#FDF5E6',
        backgroundTexture: 'parchment',
      },
      {
        name: 'Content Slide',
        type: 'title_content',
        elements: [
          {
            id: 'fresco-content-border-l', type: 'shape', name: 'Left Border',
            position: { x: 0.3, y: 0.3, w: 0.03, h: 4.9 },
            style: { backgroundColor: '#CD853F', opacity: 0.5 },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'fresco-content-title', type: 'placeholder', name: 'Title',
            position: { x: 0.7, y: 0.3, w: 8.8, h: 0.8 },
            style: { fontSize: 34, fontBold: true, fontFamily: 'Cormorant Garamond', fontColor: '#3E2723', alignment: 'left' },
            placeholder: 'Chapter Title', locked: false, visible: true, layer: 1,
          },
          {
            id: 'fresco-content-body', type: 'placeholder', name: 'Content',
            position: { x: 0.7, y: 1.3, w: 8.8, h: 4 },
            style: { fontSize: 16, fontFamily: 'Crimson Text', fontColor: '#3E2723', alignment: 'left', verticalAlign: 'top' },
            placeholder: 'Add your text here', locked: false, visible: true, layer: 2,
          },
        ],
        backgroundColor: '#FDF5E6',
        backgroundTexture: 'parchment',
      },
    ],
    transitions: { type: 'dissolve', duration: 600 },
    metadata: { style: 'warm', mood: 'elegant', inspiration: 'renaissance-fresco' },
  },
  {
    id: 'prebuilt-easel-005',
    name: 'Easel',
    description: 'Art studio aesthetic with canvas textures, artistic fonts, painterly accents, and creative energy.',
    category: 'creative',
    colorPalette: {
      primary: '#2F2F2F',
      secondary: '#E63946',
      accent1: '#457B9D',
      accent2: '#F1FAEE',
      background: '#F5F0E8',
      text: '#2F2F2F',
      lightText: '#7B7B7B',
      darkText: '#1A1A1A',
    },
    fonts: {
      titleFont: 'Abril Fatface',
      bodyFont: 'Lora',
      captionFont: 'Dancing Script',
      titleSizes: { large: 48, medium: 34, small: 26 },
      bodySizes: { large: 18, medium: 15, small: 12 },
    },
    layouts: [
      {
        name: 'Title Slide',
        type: 'title',
        elements: [
          {
            id: 'easel-title-canvas', type: 'shape', name: 'Canvas Frame',
            position: { x: 0.8, y: 0.5, w: 8.4, h: 4.5 },
            style: { borderColor: '#2F2F2F', borderWidth: 3, backgroundColor: 'transparent' },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'easel-title-splash1', type: 'shape', name: 'Paint Splash 1',
            position: { x: 7.5, y: 0.2, w: 2.5, h: 2.5 },
            style: { backgroundColor: '#E63946', opacity: 0.12, borderRadius: 999 },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'easel-title-splash2', type: 'shape', name: 'Paint Splash 2',
            position: { x: 0, y: 3.5, w: 2, h: 2 },
            style: { backgroundColor: '#457B9D', opacity: 0.1, borderRadius: 999 },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'easel-title-main', type: 'placeholder', name: 'Title',
            position: { x: 1.2, y: 1.2, w: 7.6, h: 1.8 },
            style: { fontSize: 48, fontBold: true, fontFamily: 'Abril Fatface', fontColor: '#2F2F2F', alignment: 'center', verticalAlign: 'middle' },
            placeholder: 'Creative Title', locked: false, visible: true, layer: 1,
          },
          {
            id: 'easel-title-sub', type: 'placeholder', name: 'Subtitle',
            position: { x: 1.5, y: 3.2, w: 7, h: 0.8 },
            style: { fontSize: 22, fontItalic: true, fontFamily: 'Dancing Script', fontColor: '#7B7B7B', alignment: 'center' },
            placeholder: 'An artistic presentation', locked: false, visible: true, layer: 2,
          },
        ],
        backgroundColor: '#F5F0E8',
        backgroundTexture: 'canvas',
      },
      {
        name: 'Content Slide',
        type: 'title_content',
        elements: [
          {
            id: 'easel-content-stripe', type: 'shape', name: 'Color Stripe',
            position: { x: 0, y: 0, w: 0.25, h: 5.63 },
            style: { backgroundColor: '#E63946' },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'easel-content-title', type: 'placeholder', name: 'Title',
            position: { x: 0.6, y: 0.3, w: 9, h: 0.8 },
            style: { fontSize: 34, fontBold: true, fontFamily: 'Abril Fatface', fontColor: '#2F2F2F', alignment: 'left' },
            placeholder: 'Your Heading', locked: false, visible: true, layer: 1,
          },
          {
            id: 'easel-content-body', type: 'placeholder', name: 'Content',
            position: { x: 0.6, y: 1.3, w: 9, h: 4 },
            style: { fontSize: 16, fontFamily: 'Lora', fontColor: '#2F2F2F', alignment: 'left', verticalAlign: 'top' },
            placeholder: 'Express your ideas here', locked: false, visible: true, layer: 2,
          },
        ],
        backgroundColor: '#F5F0E8',
        backgroundTexture: 'canvas',
      },
    ],
    transitions: { type: 'wipe', duration: 500, direction: 'right' },
    metadata: { style: 'artistic', mood: 'creative', inspiration: 'art-studio-easel' },
  },
  {
    id: 'prebuilt-diorama-006',
    name: 'Diorama',
    description: '3D depth effect with layered cards, subtle shadows, and dimensional design that adds visual depth to every slide.',
    category: 'modern',
    colorPalette: {
      primary: '#5C6BC0',
      secondary: '#7E57C2',
      accent1: '#26C6DA',
      accent2: '#FFB74D',
      background: '#ECEFF1',
      text: '#263238',
      lightText: '#78909C',
      darkText: '#0D1B2A',
    },
    fonts: {
      titleFont: 'Montserrat',
      bodyFont: 'Open Sans',
      captionFont: 'Roboto Mono',
      titleSizes: { large: 42, medium: 30, small: 22 },
      bodySizes: { large: 17, medium: 14, small: 11 },
    },
    layouts: [
      {
        name: 'Title Slide',
        type: 'title',
        elements: [
          {
            id: 'diorama-title-layer3', type: 'shape', name: 'Back Layer',
            position: { x: 1.5, y: 1.0, w: 7, h: 3.8 },
            style: { backgroundColor: '#5C6BC0', opacity: 0.08, borderRadius: 16, shadow: { color: '#000000', blur: 20, offset: { x: 0, y: 8 } } },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'diorama-title-layer2', type: 'shape', name: 'Middle Layer',
            position: { x: 1.2, y: 0.8, w: 7.6, h: 4.0 },
            style: { backgroundColor: '#7E57C2', opacity: 0.06, borderRadius: 12, shadow: { color: '#000000', blur: 12, offset: { x: 0, y: 4 } } },
            locked: true, visible: true, layer: 1,
          },
          {
            id: 'diorama-title-card', type: 'shape', name: 'Front Card',
            position: { x: 1, y: 0.6, w: 8, h: 4.2 },
            style: { backgroundColor: '#FFFFFF', borderRadius: 8, shadow: { color: '#000000', blur: 8, offset: { x: 0, y: 2 } } },
            locked: true, visible: true, layer: 2,
          },
          {
            id: 'diorama-title-accent', type: 'shape', name: 'Accent Strip',
            position: { x: 1, y: 0.6, w: 8, h: 0.1 },
            style: { backgroundColor: '#5C6BC0', borderRadius: 0 },
            locked: true, visible: true, layer: 3,
          },
          {
            id: 'diorama-title-main', type: 'placeholder', name: 'Title',
            position: { x: 1.5, y: 1.4, w: 7, h: 1.5 },
            style: { fontSize: 42, fontBold: true, fontFamily: 'Montserrat', fontColor: '#263238', alignment: 'center', verticalAlign: 'middle' },
            placeholder: 'Dimensional Title', locked: false, visible: true, layer: 4,
          },
          {
            id: 'diorama-title-sub', type: 'placeholder', name: 'Subtitle',
            position: { x: 2, y: 3.2, w: 6, h: 0.7 },
            style: { fontSize: 16, fontFamily: 'Open Sans', fontColor: '#78909C', alignment: 'center' },
            placeholder: 'Subtitle with depth', locked: false, visible: true, layer: 5,
          },
        ],
        backgroundColor: '#ECEFF1',
      },
      {
        name: 'Content Slide',
        type: 'title_content',
        elements: [
          {
            id: 'diorama-content-card', type: 'shape', name: 'Content Card',
            position: { x: 0.4, y: 0.3, w: 9.2, h: 5.0 },
            style: { backgroundColor: '#FFFFFF', borderRadius: 8, shadow: { color: '#000000', blur: 6, offset: { x: 0, y: 2 } } },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'diorama-content-title', type: 'placeholder', name: 'Title',
            position: { x: 0.8, y: 0.5, w: 8.4, h: 0.8 },
            style: { fontSize: 30, fontBold: true, fontFamily: 'Montserrat', fontColor: '#263238', alignment: 'left' },
            placeholder: 'Section Title', locked: false, visible: true, layer: 1,
          },
          {
            id: 'diorama-content-line', type: 'shape', name: 'Accent Line',
            position: { x: 0.8, y: 1.3, w: 2.5, h: 0.04 },
            style: { backgroundColor: '#26C6DA' },
            locked: true, visible: true, layer: 2,
          },
          {
            id: 'diorama-content-body', type: 'placeholder', name: 'Content',
            position: { x: 0.8, y: 1.6, w: 8.4, h: 3.5 },
            style: { fontSize: 15, fontFamily: 'Open Sans', fontColor: '#263238', alignment: 'left', verticalAlign: 'top' },
            placeholder: 'Add your layered content', locked: false, visible: true, layer: 3,
          },
        ],
        backgroundColor: '#ECEFF1',
      },
    ],
    transitions: { type: 'zoom', duration: 450 },
    metadata: { style: '3d-depth', mood: 'professional', inspiration: 'diorama-layers' },
  },
  {
    id: 'prebuilt-chromatic-007',
    name: 'Chromatic',
    description: 'Vibrant gradients, modern geometric shapes, and bold color combinations for maximum visual impact.',
    category: 'modern',
    colorPalette: {
      primary: '#6C63FF',
      secondary: '#FF6584',
      accent1: '#3F3D56',
      accent2: '#00D2FF',
      background: '#FFFFFF',
      text: '#2D2D2D',
      lightText: '#9E9E9E',
      darkText: '#0D0D0D',
    },
    fonts: {
      titleFont: 'Poppins',
      bodyFont: 'DM Sans',
      captionFont: 'Space Mono',
      titleSizes: { large: 46, medium: 32, small: 24 },
      bodySizes: { large: 18, medium: 15, small: 12 },
    },
    layouts: [
      {
        name: 'Title Slide',
        type: 'title',
        elements: [
          {
            id: 'chroma-title-geo1', type: 'shape', name: 'Geometric Circle',
            position: { x: 7, y: -0.5, w: 4.5, h: 4.5 },
            style: { backgroundColor: '#6C63FF', opacity: 0.15, borderRadius: 999 },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'chroma-title-geo2', type: 'shape', name: 'Geometric Triangle',
            position: { x: -1, y: 4, w: 3, h: 3 },
            style: { backgroundColor: '#FF6584', opacity: 0.12, borderRadius: 0 },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'chroma-title-geo3', type: 'shape', name: 'Dot Grid',
            position: { x: 8.5, y: 4.5, w: 1.5, h: 1.5 },
            style: { backgroundColor: '#00D2FF', opacity: 0.2, borderRadius: 999 },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'chroma-title-main', type: 'placeholder', name: 'Title',
            position: { x: 0.5, y: 1.2, w: 7, h: 1.8 },
            style: { fontSize: 46, fontBold: true, fontFamily: 'Poppins', fontColor: '#2D2D2D', alignment: 'left', verticalAlign: 'middle' },
            placeholder: 'Bold & Chromatic', locked: false, visible: true, layer: 1,
          },
          {
            id: 'chroma-title-bar', type: 'shape', name: 'Gradient Bar',
            position: { x: 0.5, y: 3.1, w: 4, h: 0.08 },
            style: { backgroundColor: '#6C63FF' },
            locked: true, visible: true, layer: 2,
          },
          {
            id: 'chroma-title-sub', type: 'placeholder', name: 'Subtitle',
            position: { x: 0.5, y: 3.4, w: 6, h: 0.7 },
            style: { fontSize: 18, fontFamily: 'DM Sans', fontColor: '#9E9E9E', alignment: 'left' },
            placeholder: 'Modern design at its finest', locked: false, visible: true, layer: 3,
          },
        ],
        backgroundColor: '#FFFFFF',
        backgroundGradient: { start: '#FFFFFF', end: '#F8F8FF', angle: 135 },
      },
      {
        name: 'Content Slide',
        type: 'title_content',
        elements: [
          {
            id: 'chroma-content-accent', type: 'shape', name: 'Top Gradient Line',
            position: { x: 0, y: 0, w: 10, h: 0.06 },
            style: { backgroundColor: '#6C63FF' },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'chroma-content-dot', type: 'shape', name: 'Accent Dot',
            position: { x: 9.2, y: 0.3, w: 0.5, h: 0.5 },
            style: { backgroundColor: '#FF6584', opacity: 0.3, borderRadius: 999 },
            locked: true, visible: true, layer: 0,
          },
          {
            id: 'chroma-content-title', type: 'placeholder', name: 'Title',
            position: { x: 0.5, y: 0.3, w: 8.5, h: 0.8 },
            style: { fontSize: 32, fontBold: true, fontFamily: 'Poppins', fontColor: '#2D2D2D', alignment: 'left' },
            placeholder: 'Section Heading', locked: false, visible: true, layer: 1,
          },
          {
            id: 'chroma-content-body', type: 'placeholder', name: 'Content',
            position: { x: 0.5, y: 1.3, w: 9, h: 4 },
            style: { fontSize: 16, fontFamily: 'DM Sans', fontColor: '#2D2D2D', alignment: 'left', verticalAlign: 'top' },
            placeholder: 'Add vibrant content here', locked: false, visible: true, layer: 2,
          },
        ],
        backgroundColor: '#FFFFFF',
      },
    ],
    transitions: { type: 'push', duration: 350, direction: 'left' },
    metadata: { style: 'gradient', mood: 'energetic', inspiration: 'chromatic-spectrum' },
  },
];

// ─── Preset Theme Definitions ───────────────────────────────────────────────

interface PresetTheme {
  id: string;
  name: string;
  mode: string;
  colors: Record<string, string>;
  fonts: Record<string, string>;
  backgrounds: string[];
}

const PRESET_THEMES: PresetTheme[] = [
  {
    id: 'preset-light-001',
    name: 'Light',
    mode: 'light',
    colors: {
      primary: '#1976D2',
      secondary: '#424242',
      accent1: '#FF9800',
      accent2: '#4CAF50',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      text: '#212121',
      lightText: '#757575',
      darkText: '#0D0D0D',
    },
    fonts: { titleFont: 'Inter', bodyFont: 'Inter', captionFont: 'Inter' },
    backgrounds: ['#FFFFFF', '#F5F5F5', '#FAFAFA'],
  },
  {
    id: 'preset-dark-002',
    name: 'Dark',
    mode: 'dark',
    colors: {
      primary: '#90CAF9',
      secondary: '#CE93D8',
      accent1: '#FFB74D',
      accent2: '#81C784',
      background: '#121212',
      surface: '#1E1E1E',
      text: '#E0E0E0',
      lightText: '#9E9E9E',
      darkText: '#FFFFFF',
    },
    fonts: { titleFont: 'Inter', bodyFont: 'Inter', captionFont: 'Inter' },
    backgrounds: ['#121212', '#1E1E1E', '#2C2C2C'],
  },
  {
    id: 'preset-high-contrast-003',
    name: 'High Contrast',
    mode: 'high-contrast',
    colors: {
      primary: '#FFFF00',
      secondary: '#00FF00',
      accent1: '#FF00FF',
      accent2: '#00FFFF',
      background: '#000000',
      surface: '#1A1A1A',
      text: '#FFFFFF',
      lightText: '#CCCCCC',
      darkText: '#FFFFFF',
    },
    fonts: { titleFont: 'Arial', bodyFont: 'Arial', captionFont: 'Courier New' },
    backgrounds: ['#000000', '#1A1A1A'],
  },
];

// ─── Layout Archetype Definitions ───────────────────────────────────────────

interface LayoutArchetype {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  category: string;
  gridConfig: { columns: number; rows: number; gap: number };
  zones: Array<{
    name: string;
    position: { x: number; y: number; w: number; h: number };
    purpose: string;
    allowedTypes: string[];
  }>;
  thumbnail: string;
}

const LAYOUT_ARCHETYPES: LayoutArchetype[] = [
  {
    id: 'archetype-title-001',
    name: 'Title Hero',
    nameAr: 'عنوان رئيسي',
    description: 'Full-width title with large heading and centered subtitle',
    category: 'title',
    gridConfig: { columns: 12, rows: 8, gap: 0.2 },
    zones: [
      { name: 'title', position: { x: 0.5, y: 1.5, w: 9, h: 1.5 }, purpose: 'main-title', allowedTypes: ['text', 'placeholder'] },
      { name: 'subtitle', position: { x: 1.5, y: 3.2, w: 7, h: 0.8 }, purpose: 'subtitle', allowedTypes: ['text', 'placeholder'] },
      { name: 'accent', position: { x: 3, y: 3.0, w: 4, h: 0.05 }, purpose: 'decoration', allowedTypes: ['shape'] },
    ],
    thumbnail: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIiBmaWxsPSIjZjVmNWY1Ii8+PHJlY3QgeD0iMjAiIHk9IjMwIiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjE1IiBmaWxsPSIjY2NjIi8+PHJlY3QgeD0iNDAiIHk9IjU1IiB3aWR0aD0iODAiIGhlaWdodD0iOCIgZmlsbD0iI2RkZCIvPjwvc3ZnPg==',
  },
  {
    id: 'archetype-split-002',
    name: 'Split Content',
    nameAr: 'محتوى مقسم',
    description: 'Two-column layout with equal-width content areas',
    category: 'content',
    gridConfig: { columns: 12, rows: 8, gap: 0.3 },
    zones: [
      { name: 'title', position: { x: 0.5, y: 0.3, w: 9, h: 0.8 }, purpose: 'title', allowedTypes: ['text', 'placeholder'] },
      { name: 'left', position: { x: 0.5, y: 1.3, w: 4.25, h: 4 }, purpose: 'content', allowedTypes: ['text', 'image', 'chart', 'table', 'placeholder'] },
      { name: 'right', position: { x: 5.25, y: 1.3, w: 4.25, h: 4 }, purpose: 'content', allowedTypes: ['text', 'image', 'chart', 'table', 'placeholder'] },
    ],
    thumbnail: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIiBmaWxsPSIjZjVmNWY1Ii8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iNjUiIGhlaWdodD0iNzAiIGZpbGw9IiNkZGQiLz48cmVjdCB4PSI4NSIgeT0iMTAiIHdpZHRoPSI2NSIgaGVpZ2h0PSI3MCIgZmlsbD0iI2RkZCIvPjwvc3ZnPg==',
  },
  {
    id: 'archetype-media-left-003',
    name: 'Media Left',
    nameAr: 'وسائط يسار',
    description: 'Large media area on left with text content on the right',
    category: 'media',
    gridConfig: { columns: 12, rows: 8, gap: 0.3 },
    zones: [
      { name: 'media', position: { x: 0.3, y: 0.3, w: 4.7, h: 4.9 }, purpose: 'media', allowedTypes: ['image', 'chart'] },
      { name: 'title', position: { x: 5.3, y: 0.5, w: 4.4, h: 0.8 }, purpose: 'title', allowedTypes: ['text', 'placeholder'] },
      { name: 'content', position: { x: 5.3, y: 1.5, w: 4.4, h: 3.5 }, purpose: 'content', allowedTypes: ['text', 'placeholder'] },
    ],
    thumbnail: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIiBmaWxsPSIjZjVmNWY1Ii8+PHJlY3QgeD0iNSIgeT0iNSIgd2lkdGg9Ijc1IiBoZWlnaHQ9IjgwIiBmaWxsPSIjYmJiIi8+PHJlY3QgeD0iODUiIHk9IjEwIiB3aWR0aD0iNjUiIGhlaWdodD0iMTIiIGZpbGw9IiNjY2MiLz48cmVjdCB4PSI4NSIgeT0iMzAiIHdpZHRoPSI2NSIgaGVpZ2h0PSI1MCIgZmlsbD0iI2RkZCIvPjwvc3ZnPg==',
  },
  {
    id: 'archetype-dashboard-004',
    name: 'Dashboard Grid',
    nameAr: 'شبكة لوحة المعلومات',
    description: 'Four-quadrant grid layout for charts and KPIs',
    category: 'data',
    gridConfig: { columns: 12, rows: 8, gap: 0.2 },
    zones: [
      { name: 'title', position: { x: 0.5, y: 0.2, w: 9, h: 0.6 }, purpose: 'title', allowedTypes: ['text'] },
      { name: 'tl', position: { x: 0.5, y: 1.0, w: 4.25, h: 2.1 }, purpose: 'chart', allowedTypes: ['chart', 'table', 'text'] },
      { name: 'tr', position: { x: 5.25, y: 1.0, w: 4.25, h: 2.1 }, purpose: 'chart', allowedTypes: ['chart', 'table', 'text'] },
      { name: 'bl', position: { x: 0.5, y: 3.3, w: 4.25, h: 2.1 }, purpose: 'chart', allowedTypes: ['chart', 'table', 'text'] },
      { name: 'br', position: { x: 5.25, y: 3.3, w: 4.25, h: 2.1 }, purpose: 'chart', allowedTypes: ['chart', 'table', 'text'] },
    ],
    thumbnail: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIiBmaWxsPSIjZjVmNWY1Ii8+PHJlY3QgeD0iNSIgeT0iMTUiIHdpZHRoPSI3MiIgaGVpZ2h0PSIzMCIgZmlsbD0iI2RkZCIvPjxyZWN0IHg9IjgzIiB5PSIxNSIgd2lkdGg9IjcyIiBoZWlnaHQ9IjMwIiBmaWxsPSIjZGRkIi8+PHJlY3QgeD0iNSIgeT0iNTAiIHdpZHRoPSI3MiIgaGVpZ2h0PSIzMCIgZmlsbD0iI2RkZCIvPjxyZWN0IHg9IjgzIiB5PSI1MCIgd2lkdGg9IjcyIiBoZWlnaHQ9IjMwIiBmaWxsPSIjZGRkIi8+PC9zdmc+',
  },
  {
    id: 'archetype-quote-005',
    name: 'Quote Spotlight',
    nameAr: 'اقتباس بارز',
    description: 'Centered quote with large quotation mark and attribution',
    category: 'narrative',
    gridConfig: { columns: 12, rows: 8, gap: 0.2 },
    zones: [
      { name: 'quotemark', position: { x: 0.5, y: 0.5, w: 2, h: 2 }, purpose: 'decoration', allowedTypes: ['text'] },
      { name: 'quote', position: { x: 1.5, y: 1.5, w: 7, h: 2 }, purpose: 'main-content', allowedTypes: ['text', 'placeholder'] },
      { name: 'author', position: { x: 1.5, y: 3.7, w: 7, h: 0.5 }, purpose: 'attribution', allowedTypes: ['text', 'placeholder'] },
    ],
    thumbnail: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIiBmaWxsPSIjZjVmNWY1Ii8+PHRleHQgeD0iMTUiIHk9IjQwIiBmb250LXNpemU9IjUwIiBmaWxsPSIjZGRkIj4mIzgyMjA7PC90ZXh0PjxyZWN0IHg9IjMwIiB5PSIzMCIgd2lkdGg9IjEwMCIgaGVpZ2h0PSIyMCIgZmlsbD0iI2RkZCIvPjxyZWN0IHg9IjUwIiB5PSI2MCIgd2lkdGg9IjYwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZWVlIi8+PC9zdmc+',
  },
  {
    id: 'archetype-timeline-006',
    name: 'Timeline',
    nameAr: 'خط زمني',
    description: 'Horizontal timeline with milestones and event descriptions',
    category: 'narrative',
    gridConfig: { columns: 12, rows: 8, gap: 0.2 },
    zones: [
      { name: 'title', position: { x: 0.5, y: 0.3, w: 9, h: 0.6 }, purpose: 'title', allowedTypes: ['text'] },
      { name: 'timeline-bar', position: { x: 0.5, y: 2.7, w: 9, h: 0.05 }, purpose: 'decoration', allowedTypes: ['shape'] },
      { name: 'event-1', position: { x: 0.5, y: 1.2, w: 2, h: 1.2 }, purpose: 'content', allowedTypes: ['text', 'placeholder'] },
      { name: 'event-2', position: { x: 2.8, y: 3.0, w: 2, h: 1.2 }, purpose: 'content', allowedTypes: ['text', 'placeholder'] },
      { name: 'event-3', position: { x: 5.1, y: 1.2, w: 2, h: 1.2 }, purpose: 'content', allowedTypes: ['text', 'placeholder'] },
      { name: 'event-4', position: { x: 7.4, y: 3.0, w: 2, h: 1.2 }, purpose: 'content', allowedTypes: ['text', 'placeholder'] },
    ],
    thumbnail: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIiBmaWxsPSIjZjVmNWY1Ii8+PGxpbmUgeDE9IjEwIiB5MT0iNDUiIHgyPSIxNTAiIHkyPSI0NSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSIzMCIgY3k9IjQ1IiByPSI1IiBmaWxsPSIjOTk5Ii8+PGNpcmNsZSBjeD0iNzAiIGN5PSI0NSIgcj0iNSIgZmlsbD0iIzk5OSIvPjxjaXJjbGUgY3g9IjExMCIgY3k9IjQ1IiByPSI1IiBmaWxsPSIjOTk5Ii8+PC9zdmc+',
  },
  {
    id: 'archetype-fullimage-007',
    name: 'Full Bleed Image',
    nameAr: 'صورة كاملة',
    description: 'Full-bleed background image with overlaid text zone',
    category: 'media',
    gridConfig: { columns: 12, rows: 8, gap: 0 },
    zones: [
      { name: 'background', position: { x: 0, y: 0, w: 10, h: 5.63 }, purpose: 'background-image', allowedTypes: ['image'] },
      { name: 'overlay', position: { x: 0, y: 3.5, w: 10, h: 2.13 }, purpose: 'overlay', allowedTypes: ['shape'] },
      { name: 'title', position: { x: 0.5, y: 3.7, w: 9, h: 0.8 }, purpose: 'title', allowedTypes: ['text', 'placeholder'] },
      { name: 'subtitle', position: { x: 0.5, y: 4.5, w: 9, h: 0.6 }, purpose: 'subtitle', allowedTypes: ['text', 'placeholder'] },
    ],
    thumbnail: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIiBmaWxsPSIjYmJiIi8+PHJlY3QgeT0iNjAiIHdpZHRoPSIxNjAiIGhlaWdodD0iMzAiIGZpbGw9InJnYmEoMCwwLDAsMC41KSIvPjxyZWN0IHg9IjEwIiB5PSI2NSIgd2lkdGg9IjEyMCIgaGVpZ2h0PSIxMCIgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iMC42Ii8+PC9zdmc+',
  },
  {
    id: 'archetype-three-col-008',
    name: 'Three Column',
    nameAr: 'ثلاثة أعمدة',
    description: 'Three equal columns for comparison or feature showcase',
    category: 'content',
    gridConfig: { columns: 12, rows: 8, gap: 0.3 },
    zones: [
      { name: 'title', position: { x: 0.5, y: 0.3, w: 9, h: 0.6 }, purpose: 'title', allowedTypes: ['text'] },
      { name: 'col1', position: { x: 0.5, y: 1.2, w: 2.8, h: 4 }, purpose: 'content', allowedTypes: ['text', 'image', 'icon', 'placeholder'] },
      { name: 'col2', position: { x: 3.6, y: 1.2, w: 2.8, h: 4 }, purpose: 'content', allowedTypes: ['text', 'image', 'icon', 'placeholder'] },
      { name: 'col3', position: { x: 6.7, y: 1.2, w: 2.8, h: 4 }, purpose: 'content', allowedTypes: ['text', 'image', 'icon', 'placeholder'] },
    ],
    thumbnail: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIiBmaWxsPSIjZjVmNWY1Ii8+PHJlY3QgeD0iNSIgeT0iMTUiIHdpZHRoPSI0NiIgaGVpZ2h0PSI2NSIgZmlsbD0iI2RkZCIvPjxyZWN0IHg9IjU3IiB5PSIxNSIgd2lkdGg9IjQ2IiBoZWlnaHQ9IjY1IiBmaWxsPSIjZGRkIi8+PHJlY3QgeD0iMTA5IiB5PSIxNSIgd2lkdGg9IjQ2IiBoZWlnaHQ9IjY1IiBmaWxsPSIjZGRkIi8+PC9zdmc+',
  },
];

// ─── Template Categories ────────────────────────────────────────────────────

const TEMPLATE_CATEGORIES = [
  { id: 'creative', name: 'Creative', nameAr: 'إبداعي', count: 0 },
  { id: 'business', name: 'Business', nameAr: 'أعمال', count: 0 },
  { id: 'education', name: 'Education', nameAr: 'تعليمي', count: 0 },
  { id: 'modern', name: 'Modern', nameAr: 'عصري', count: 0 },
  { id: 'classic', name: 'Classic', nameAr: 'كلاسيكي', count: 0 },
  { id: 'nature', name: 'Nature', nameAr: 'طبيعة', count: 0 },
  { id: 'technology', name: 'Technology', nameAr: 'تقنية', count: 0 },
  { id: 'medical', name: 'Medical', nameAr: 'طبي', count: 0 },
  { id: 'marketing', name: 'Marketing', nameAr: 'تسويق', count: 0 },
  { id: 'minimal', name: 'Minimal', nameAr: 'بسيط', count: 0 },
];

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /templates - Create/upload template
router.post(
  '/templates',
  authMiddleware,
  validate(createTemplateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId || req.user?.id || '';
    const body = req.body;

    const id = crypto.randomUUID();
    const elements = (body.elements || []).map((el: Record<string, unknown>) => ({
      id: crypto.randomUUID(),
      type: el.type,
      name: el.name,
      position: el.position,
      style: el.style || {},
      content: el.content || undefined,
      placeholder: el.placeholder || undefined,
      locked: el.locked ?? false,
      visible: el.visible ?? true,
      layer: el.layer ?? 0,
    }));

    const template = await prisma.slideTemplate.create({
      data: {
        id,
        name: body.name,
        description: body.description || '',
        category: body.category,
        layout: body.layout,
        masterSlideId: body.masterSlideId || null,
        elements: elements as Prisma.InputJsonValue,
        backgroundColor: body.backgroundColor || '#FFFFFF',
        backgroundImage: body.backgroundImage || null,
        transitions: (body.transitions || { type: 'none', duration: 500 }) as Prisma.InputJsonValue,
        metadata: (body.metadata || {}) as Prisma.InputJsonValue,
        version: 1,
        createdBy: userId,
      },
    });

    res.status(201).json({ success: true, data: template });
  })
);

// GET /templates - List templates with categories, search, pagination
router.get(
  '/templates',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const category = req.query.category as string | undefined;
    const layout = req.query.layout as string | undefined;
    const search = req.query.search as string | undefined;

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (layout) where.layout = layout;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [templates, total] = await Promise.all([
      prisma.slideTemplate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.slideTemplate.count({ where }),
    ]);

    res.json({
      success: true,
      data: templates,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

// GET /templates/categories - List template categories with counts
router.get(
  '/templates/categories',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const categoryCounts = await prisma.slideTemplate.groupBy({
      by: ['category'],
      _count: { category: true },
    });

    const countMap = new Map(categoryCounts.map((c) => [c.category, c._count.category]));
    const categories = TEMPLATE_CATEGORIES.map((cat) => ({
      ...cat,
      count: countMap.get(cat.id) || 0,
    }));

    res.json({ success: true, data: categories });
  })
);

// GET /templates/prebuilt - Get 7 prebuilt templates
router.get(
  '/templates/prebuilt',
  authMiddleware,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ success: true, data: PREBUILT_TEMPLATES });
  })
);

// POST /templates/from-presentation - Create template from existing presentation
router.post(
  '/templates/from-presentation',
  authMiddleware,
  validate(fromPresentationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, name, category, description } = req.body;
    const userId = req.user?.userId || req.user?.id || '';

    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
    });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const slides = await prisma.slide.findMany({
      where: { presentationId },
      orderBy: { slideIndex: 'asc' },
    });

    const templateElements = slides.map((slide, idx) => {
      const content = slide.content as Record<string, unknown> | null;
      return {
        id: crypto.randomUUID(),
        type: 'placeholder' as const,
        name: `Slide ${idx + 1}`,
        position: { x: 0.5, y: 0.5, w: 9, h: 4.5 },
        style: {},
        content: content ? JSON.stringify(content) : undefined,
        locked: false,
        visible: true,
        layer: idx,
      };
    });

    const themeData = presentation.theme as Record<string, unknown> | null;
    const backgroundColor = (themeData?.backgroundColor as string) || '#FFFFFF';

    const template = await prisma.slideTemplate.create({
      data: {
        id: crypto.randomUUID(),
        name,
        description: description || `Template derived from presentation: ${presentation.name}`,
        category: category || 'custom',
        layout: slides[0]?.layout || 'title_content',
        elements: templateElements as Prisma.InputJsonValue,
        backgroundColor,
        transitions: { type: 'fade', duration: 400 } as Prisma.InputJsonValue,
        metadata: {
          sourcePresentation: presentationId,
          sourceName: presentation.name,
          slideCount: slides.length,
          extractedTheme: themeData || {},
        } as Prisma.InputJsonValue,
        version: 1,
        createdBy: userId,
      },
    });

    res.status(201).json({ success: true, data: template });
  })
);

// POST /templates/import - Import external template (PPTX/POTX)
router.post(
  '/templates/import',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Template file (PPTX or POTX) is required', code: 'MISSING_FILE' });
      return;
    }

    const userId = req.user?.userId || req.user?.id || '';
    const originalName = req.file.originalname || 'imported-template';
    const ext = originalName.split('.').pop()?.toLowerCase();

    if (!['pptx', 'potx'].includes(ext || '')) {
      res.status(400).json({ success: false, error: 'Only PPTX and POTX files are supported', code: 'INVALID_FILE_TYPE' });
      return;
    }

    const templateName = req.body.name || originalName.replace(/\.(pptx|potx)$/i, '');
    const category = req.body.category || 'imported';

    const fileBase64 = req.file.buffer.toString('base64');

    const template = await prisma.slideTemplate.create({
      data: {
        id: crypto.randomUUID(),
        name: templateName,
        description: `Imported from ${originalName}`,
        category,
        layout: 'title_content',
        elements: [] as Prisma.InputJsonValue,
        backgroundColor: '#FFFFFF',
        transitions: { type: 'none', duration: 500 } as Prisma.InputJsonValue,
        metadata: {
          importedFrom: originalName,
          importedAt: new Date().toISOString(),
          fileSize: req.file.size,
          fileFormat: ext,
          rawFileBase64: fileBase64.substring(0, 200) + '...',
          totalFileSize: fileBase64.length,
        } as Prisma.InputJsonValue,
        version: 1,
        createdBy: userId,
      },
    });

    res.status(201).json({
      success: true,
      data: template,
      message: `Template imported from ${originalName}`,
    });
  })
);

// GET /templates/:id - Get template details
router.get(
  '/templates/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const template = await prisma.slideTemplate.findUnique({
      where: { id: req.params.id },
    });

    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found', code: 'NOT_FOUND' });
      return;
    }

    res.json({ success: true, data: template });
  })
);

// PUT /templates/:id - Update template
router.put(
  '/templates/:id',
  authMiddleware,
  validate(updateTemplateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.slideTemplate.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: 'Template not found', code: 'NOT_FOUND' });
      return;
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date(), version: existing.version + 1 };
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.layout !== undefined) updateData.layout = req.body.layout;
    if (req.body.elements !== undefined) {
      updateData.elements = req.body.elements.map((el: Record<string, unknown>) => ({
        id: (el.id as string) || crypto.randomUUID(),
        type: el.type,
        name: el.name,
        position: el.position,
        style: el.style || {},
        content: el.content || undefined,
        placeholder: el.placeholder || undefined,
        locked: el.locked ?? false,
        visible: el.visible ?? true,
        layer: el.layer ?? 0,
      }));
    }
    if (req.body.backgroundColor !== undefined) updateData.backgroundColor = req.body.backgroundColor;
    if (req.body.backgroundImage !== undefined) updateData.backgroundImage = req.body.backgroundImage;
    if (req.body.transitions !== undefined) updateData.transitions = req.body.transitions;
    if (req.body.masterSlideId !== undefined) updateData.masterSlideId = req.body.masterSlideId;
    if (req.body.metadata !== undefined) updateData.metadata = req.body.metadata;

    const template = await prisma.slideTemplate.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ success: true, data: template });
  })
);

// DELETE /templates/:id - Delete template
router.delete(
  '/templates/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.slideTemplate.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: 'Template not found', code: 'NOT_FOUND' });
      return;
    }

    await prisma.slideTemplate.delete({ where: { id: req.params.id } });

    res.json({ success: true, message: 'Template deleted successfully' });
  })
);

// POST /templates/:id/duplicate - Duplicate template
router.post(
  '/templates/:id/duplicate',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId || req.user?.id || '';

    const source = await prisma.slideTemplate.findUnique({
      where: { id: req.params.id },
    });

    if (!source) {
      res.status(404).json({ success: false, error: 'Template not found', code: 'NOT_FOUND' });
      return;
    }

    const newName = req.body.name || `${source.name} (Copy)`;
    const sourceElements = (source.elements as unknown as Array<Record<string, unknown>>) || [];
    const clonedElements = sourceElements.map((el) => ({
      ...el,
      id: crypto.randomUUID(),
    }));

    const duplicate = await prisma.slideTemplate.create({
      data: {
        id: crypto.randomUUID(),
        name: newName,
        description: source.description,
        category: req.body.category || source.category,
        layout: source.layout,
        masterSlideId: source.masterSlideId,
        elements: clonedElements as Prisma.InputJsonValue,
        backgroundColor: source.backgroundColor,
        backgroundImage: source.backgroundImage,
        transitions: source.transitions as Prisma.InputJsonValue,
        metadata: {
          ...(source.metadata as Record<string, unknown> || {}),
          duplicatedFrom: source.id,
          duplicatedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        version: 1,
        createdBy: userId,
      },
    });

    res.status(201).json({ success: true, data: duplicate });
  })
);

// POST /templates/:id/share - Share template with users
router.post(
  '/templates/:id/share',
  authMiddleware,
  validate(shareTemplateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const template = await prisma.slideTemplate.findUnique({
      where: { id: req.params.id },
    });

    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found', code: 'NOT_FOUND' });
      return;
    }

    const { userIds, permission } = req.body;
    const currentMetadata = (template.metadata as Record<string, unknown>) || {};
    const existingShares = (currentMetadata.sharedWith as Array<Record<string, unknown>>) || [];

    const newShares = userIds.map((uid: string) => ({
      userId: uid,
      permission: permission || 'view',
      sharedAt: new Date().toISOString(),
      sharedBy: req.user?.userId || req.user?.id || '',
    }));

    const mergedShares = [
      ...existingShares.filter(
        (s: Record<string, unknown>) => !userIds.includes(s.userId as string)
      ),
      ...newShares,
    ];

    const updated = await prisma.slideTemplate.update({
      where: { id: req.params.id },
      data: {
        metadata: {
          ...currentMetadata,
          sharedWith: mergedShares,
        } as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        templateId: updated.id,
        sharedWith: mergedShares,
        totalShares: mergedShares.length,
      },
    });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// THEME ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /themes - Create theme
router.post(
  '/themes',
  authMiddleware,
  validate(createThemeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || '';

    const colors = {
      primary: req.body.colors.primary,
      secondary: req.body.colors.secondary,
      accent1: req.body.colors.accent1 || hslToHex((hexToHsl(req.body.colors.primary).h + 120) % 360, 70, 55),
      accent2: req.body.colors.accent2 || hslToHex((hexToHsl(req.body.colors.primary).h + 240) % 360, 60, 50),
      background: req.body.colors.background || '#FFFFFF',
      text: req.body.colors.text || '#212121',
      lightText: req.body.colors.lightText || '#757575',
      darkText: req.body.colors.darkText || '#0D0D0D',
    };

    const fonts = {
      titleFont: req.body.fonts.titleFont,
      bodyFont: req.body.fonts.bodyFont,
      captionFont: req.body.fonts.captionFont || req.body.fonts.bodyFont,
      titleSizes: req.body.fonts.titleSizes || { large: 44, medium: 32, small: 24 },
      bodySizes: req.body.fonts.bodySizes || { large: 18, medium: 14, small: 11 },
    };

    const theme = await prisma.theme.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        name: req.body.name,
        colors: colors as Prisma.InputJsonValue,
        fonts: fonts as Prisma.InputJsonValue,
        backgrounds: (req.body.backgrounds || [colors.background]) as Prisma.InputJsonValue,
        isDefault: req.body.isDefault || false,
      },
    });

    res.status(201).json({ success: true, data: theme });
  })
);

// GET /themes - List themes
router.get(
  '/themes',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search as string | undefined;

    const where: Record<string, unknown> = { tenantId };
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [themes, total] = await Promise.all([
      prisma.theme.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.theme.count({ where }),
    ]);

    res.json({
      success: true,
      data: themes,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

// GET /themes/presets - Get preset themes
router.get(
  '/themes/presets',
  authMiddleware,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ success: true, data: PRESET_THEMES });
  })
);

// GET /themes/:id - Get theme details
router.get(
  '/themes/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const theme = await prisma.theme.findUnique({
      where: { id: req.params.id },
    });

    if (!theme) {
      res.status(404).json({ success: false, error: 'Theme not found', code: 'NOT_FOUND' });
      return;
    }

    res.json({ success: true, data: theme });
  })
);

// PUT /themes/:id - Update theme
router.put(
  '/themes/:id',
  authMiddleware,
  validate(updateThemeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.theme.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: 'Theme not found', code: 'NOT_FOUND' });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.colors !== undefined) {
      const existingColors = (existing.colors as Record<string, string>) || {};
      updateData.colors = { ...existingColors, ...req.body.colors };
    }
    if (req.body.fonts !== undefined) {
      const existingFonts = (existing.fonts as Record<string, unknown>) || {};
      updateData.fonts = { ...existingFonts, ...req.body.fonts };
    }
    if (req.body.backgrounds !== undefined) updateData.backgrounds = req.body.backgrounds;
    if (req.body.isDefault !== undefined) {
      updateData.isDefault = req.body.isDefault;
      if (req.body.isDefault) {
        const tenantId = req.user?.organizationId || req.user?.tenantId || '';
        await prisma.theme.updateMany({
          where: { tenantId, isDefault: true, id: { not: req.params.id } },
          data: { isDefault: false },
        });
      }
    }

    const theme = await prisma.theme.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ success: true, data: theme });
  })
);

// DELETE /themes/:id - Delete theme
router.delete(
  '/themes/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.theme.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: 'Theme not found', code: 'NOT_FOUND' });
      return;
    }

    if (existing.isDefault) {
      res.status(400).json({
        success: false,
        error: 'Cannot delete the default theme. Set another theme as default first.',
        code: 'CANNOT_DELETE_DEFAULT',
      });
      return;
    }

    await prisma.theme.delete({ where: { id: req.params.id } });

    res.json({ success: true, message: 'Theme deleted successfully' });
  })
);

// POST /themes/extract-identity - Extract visual identity from image/URL
router.post(
  '/themes/extract-identity',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    let parsedBody: Record<string, string> = {};
    if (req.body.imageUrl || req.body.companyName || req.body.websiteUrl) {
      parsedBody = req.body;
    }

    const imageUrl = parsedBody.imageUrl;
    const companyName = parsedBody.companyName || 'Unknown';
    const websiteUrl = parsedBody.websiteUrl;

    let dominantColors: string[];
    let suggestedFonts: { titleFont: string; bodyFont: string; captionFont: string };

    if (req.file) {
      const buffer = req.file.buffer;
      const samplePoints = [
        buffer.length > 100 ? buffer[50] : 128,
        buffer.length > 200 ? buffer[150] : 64,
        buffer.length > 500 ? buffer[300] : 200,
        buffer.length > 1000 ? buffer[700] : 100,
      ];
      const baseHue = (samplePoints[0] + samplePoints[1]) % 360;
      const baseSat = 40 + (samplePoints[2] % 40);
      const baseLit = 30 + (samplePoints[3] % 35);

      dominantColors = [
        hslToHex(baseHue, baseSat, baseLit),
        hslToHex((baseHue + 30) % 360, baseSat - 10, baseLit + 20),
        hslToHex((baseHue + 180) % 360, baseSat - 5, baseLit + 10),
        hslToHex(baseHue, baseSat - 20, 95),
        hslToHex(baseHue, baseSat - 30, 15),
      ];
    } else if (imageUrl || websiteUrl) {
      const seedStr = imageUrl || websiteUrl || companyName;
      let hash = 0;
      for (let i = 0; i < seedStr.length; i++) {
        hash = ((hash << 5) - hash + seedStr.charCodeAt(i)) | 0;
      }
      const hue = Math.abs(hash) % 360;
      dominantColors = [
        hslToHex(hue, 65, 45),
        hslToHex((hue + 30) % 360, 55, 55),
        hslToHex((hue + 180) % 360, 50, 50),
        hslToHex(hue, 15, 95),
        hslToHex(hue, 20, 15),
      ];
    } else {
      dominantColors = ['#1976D2', '#424242', '#FF9800', '#FFFFFF', '#212121'];
    }

    suggestedFonts = {
      titleFont: 'Montserrat',
      bodyFont: 'Open Sans',
      captionFont: 'Roboto Mono',
    };

    const identity = {
      companyName,
      dominantColors,
      suggestedTheme: {
        primary: dominantColors[0],
        secondary: dominantColors[1],
        accent: dominantColors[2],
        background: dominantColors[3],
        text: dominantColors[4],
      },
      suggestedFonts,
      colorHarmony: generateComplementary(dominantColors[0]),
      extractedFrom: imageUrl || websiteUrl || (req.file ? req.file.originalname : 'manual'),
    };

    res.json({ success: true, data: identity });
  })
);

// POST /themes/import - Import theme
router.post(
  '/themes/import',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || '';

    let themeData: Record<string, unknown>;

    if (req.file) {
      const content = req.file.buffer.toString('utf-8');
      themeData = JSON.parse(content);
    } else if (req.body.themeData) {
      themeData = typeof req.body.themeData === 'string'
        ? JSON.parse(req.body.themeData)
        : req.body.themeData;
    } else {
      res.status(400).json({ success: false, error: 'Theme data or file is required', code: 'MISSING_DATA' });
      return;
    }

    const name = (themeData.name as string) || req.body.name || 'Imported Theme';
    const colors = (themeData.colors as Record<string, unknown>) || {};
    const fonts = (themeData.fonts as Record<string, unknown>) || {};
    const backgrounds = (themeData.backgrounds as string[]) || ['#FFFFFF'];

    const theme = await prisma.theme.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        name,
        colors: colors as Prisma.InputJsonValue,
        fonts: fonts as Prisma.InputJsonValue,
        backgrounds: backgrounds as Prisma.InputJsonValue,
        isDefault: false,
      },
    });

    res.status(201).json({ success: true, data: theme, message: 'Theme imported successfully' });
  })
);

// POST /themes/export/:id - Export theme
router.post(
  '/themes/export/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const theme = await prisma.theme.findUnique({
      where: { id: req.params.id },
    });

    if (!theme) {
      res.status(404).json({ success: false, error: 'Theme not found', code: 'NOT_FOUND' });
      return;
    }

    const format = (req.body.format as string) || (req.query.format as string) || 'json';

    const exportData = {
      name: theme.name,
      colors: theme.colors,
      fonts: theme.fonts,
      backgrounds: theme.backgrounds,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };

    if (format === 'file') {
      const jsonStr = JSON.stringify(exportData, null, 2);
      const buffer = Buffer.from(jsonStr, 'utf-8');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="theme-${theme.name.replace(/\s+/g, '-')}.json"`);
      res.setHeader('Content-Length', buffer.length.toString());
      res.send(buffer);
      return;
    }

    res.json({ success: true, data: exportData });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// BRAND KIT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /brand-kit - Create/update brand kit
router.post(
  '/brand-kit',
  authMiddleware,
  validate(brandKitSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || '';
    const body = req.body;

    const existingBrandKit = await prisma.theme.findFirst({
      where: {
        tenantId,
        name: { startsWith: 'BrandKit:' },
      },
    });

    const brandKitData = {
      name: `BrandKit:${body.name}`,
      colors: {
        primary: body.colors.primary,
        secondary: body.colors.secondary,
        accent: body.colors.accent || hslToHex((hexToHsl(body.colors.primary).h + 120) % 360, 60, 50),
        background: body.colors.background || '#FFFFFF',
        text: body.colors.text || '#212121',
      } as Prisma.InputJsonValue,
      fonts: {
        heading: body.fonts.heading,
        body: body.fonts.body,
        accent: body.fonts.accent || body.fonts.body,
      } as Prisma.InputJsonValue,
      backgrounds: [body.colors.background || '#FFFFFF'] as Prisma.InputJsonValue,
    };

    let brandKit;
    if (existingBrandKit) {
      brandKit = await prisma.theme.update({
        where: { id: existingBrandKit.id },
        data: {
          ...brandKitData,
          isDefault: true,
        },
      });
    } else {
      brandKit = await prisma.theme.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          ...brandKitData,
          isDefault: true,
        },
      });
    }

    res.status(existingBrandKit ? 200 : 201).json({
      success: true,
      data: {
        id: brandKit.id,
        name: body.name,
        logo: body.logo || null,
        colors: body.colors,
        fonts: body.fonts,
        logoPosition: body.logoPosition || 'top-left',
        guidelines: body.guidelines || null,
        updatedAt: brandKit.updatedAt,
      },
    });
  })
);

// GET /brand-kit - Get current brand kit
router.get(
  '/brand-kit',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || '';

    const brandKit = await prisma.theme.findFirst({
      where: {
        tenantId,
        name: { startsWith: 'BrandKit:' },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!brandKit) {
      res.status(404).json({
        success: false,
        error: 'No brand kit found. Create one first.',
        code: 'BRAND_KIT_NOT_FOUND',
      });
      return;
    }

    const colors = (brandKit.colors as Record<string, string>) || {};
    const fonts = (brandKit.fonts as Record<string, string>) || {};

    res.json({
      success: true,
      data: {
        id: brandKit.id,
        name: brandKit.name.replace('BrandKit:', ''),
        colors,
        fonts,
        backgrounds: brandKit.backgrounds,
        isDefault: brandKit.isDefault,
        createdAt: brandKit.createdAt,
        updatedAt: brandKit.updatedAt,
      },
    });
  })
);

// POST /brand-kit/apply/:presentationId - Apply brand kit to presentation
router.post(
  '/brand-kit/apply/:presentationId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || '';
    const presentationId = req.params.presentationId;

    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
    });

    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const brandKit = await prisma.theme.findFirst({
      where: { tenantId, name: { startsWith: 'BrandKit:' } },
      orderBy: { updatedAt: 'desc' },
    });

    if (!brandKit) {
      res.status(404).json({
        success: false,
        error: 'No brand kit found for this tenant',
        code: 'BRAND_KIT_NOT_FOUND',
      });
      return;
    }

    const colors = (brandKit.colors as Record<string, string>) || {};
    const fonts = (brandKit.fonts as Record<string, string>) || {};

    const themeUpdate = {
      primaryColor: colors.primary || '#1976D2',
      secondaryColor: colors.secondary || '#424242',
      accentColor: colors.accent || '#FF9800',
      backgroundColor: colors.background || '#FFFFFF',
      textColor: colors.text || '#212121',
      fontFamily: fonts.heading || 'Arial',
      bodyFontFamily: fonts.body || 'Arial',
      brandKitId: brandKit.id,
      appliedAt: new Date().toISOString(),
    };

    const updated = await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        theme: themeUpdate as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    const slides = await prisma.slide.findMany({
      where: { presentationId },
    });

    for (const slide of slides) {
      const content = (slide.content as Record<string, unknown>) || {};
      const updatedContent = {
        ...content,
        brandKit: {
          primaryColor: colors.primary,
          secondaryColor: colors.secondary,
          fontFamily: fonts.heading,
          bodyFontFamily: fonts.body,
        },
      };

      await prisma.slide.update({
        where: { id: slide.id },
        data: {
          content: updatedContent as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });
    }

    res.json({
      success: true,
      data: {
        presentationId: updated.id,
        brandKitApplied: brandKit.name.replace('BrandKit:', ''),
        slidesUpdated: slides.length,
        theme: themeUpdate,
      },
    });
  })
);

// POST /brand-kit/match - Match design of one presentation to another
router.post(
  '/brand-kit/match',
  authMiddleware,
  validate(brandMatchSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { sourcePresentationId, targetPresentationId } = req.body;

    const [source, target] = await Promise.all([
      prisma.presentation.findUnique({ where: { id: sourcePresentationId } }),
      prisma.presentation.findUnique({ where: { id: targetPresentationId } }),
    ]);

    if (!source) {
      res.status(404).json({ success: false, error: 'Source presentation not found', code: 'SOURCE_NOT_FOUND' });
      return;
    }
    if (!target) {
      res.status(404).json({ success: false, error: 'Target presentation not found', code: 'TARGET_NOT_FOUND' });
      return;
    }

    const sourceTheme = (source.theme as Record<string, unknown>) || {};

    const updated = await prisma.presentation.update({
      where: { id: targetPresentationId },
      data: {
        theme: {
          ...sourceTheme,
          matchedFrom: sourcePresentationId,
          matchedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    const targetSlides = await prisma.slide.findMany({
      where: { presentationId: targetPresentationId },
    });

    for (const slide of targetSlides) {
      const content = (slide.content as Record<string, unknown>) || {};
      await prisma.slide.update({
        where: { id: slide.id },
        data: {
          content: {
            ...content,
            matchedTheme: sourceTheme,
          } as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });
    }

    res.json({
      success: true,
      data: {
        targetPresentationId: updated.id,
        matchedFrom: sourcePresentationId,
        themeApplied: sourceTheme,
        slidesUpdated: targetSlides.length,
      },
    });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// MASTER SLIDE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /master-slides - Create master slide
router.post(
  '/master-slides',
  authMiddleware,
  validate(createMasterSlideSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId || req.user?.id || '';
    const body = req.body;

    const defaultHeaderStyle = {
      elements: [
        {
          id: crypto.randomUUID(),
          type: 'shape',
          name: 'Header Bar',
          position: { x: 0, y: 0, w: 10, h: 0.08 },
          style: { backgroundColor: '#1976D2' },
        },
      ],
    };

    const defaultFooterStyle = {
      elements: [
        {
          id: crypto.randomUUID(),
          type: 'text',
          name: 'Page Number',
          position: { x: 9, y: 5.2, w: 0.8, h: 0.3 },
          style: { fontSize: 9, alignment: 'right', fontColor: '#757575' },
          content: '{{pageNumber}}',
        },
        {
          id: crypto.randomUUID(),
          type: 'text',
          name: 'Footer Text',
          position: { x: 0.3, y: 5.2, w: 4, h: 0.3 },
          style: { fontSize: 8, alignment: 'left', fontColor: '#757575' },
          content: '{{footerText}}',
        },
      ],
    };

    const masterSlide = await prisma.masterSlide.create({
      data: {
        id: crypto.randomUUID(),
        name: body.name,
        description: body.description || null,
        backgroundColor: body.backgroundColor || '#FFFFFF',
        backgroundImage: body.backgroundImage || null,
        headerStyle: (body.headerStyle || defaultHeaderStyle) as Prisma.InputJsonValue,
        footerStyle: (body.footerStyle || defaultFooterStyle) as Prisma.InputJsonValue,
        elements: (body.elements || {}) as Prisma.InputJsonValue,
        layout: (body.layout || {}) as Prisma.InputJsonValue,
        isDefault: body.isDefault || false,
        createdBy: userId,
      },
    });

    if (body.isDefault) {
      await prisma.masterSlide.updateMany({
        where: { isDefault: true, id: { not: masterSlide.id } },
        data: { isDefault: false },
      });
    }

    res.status(201).json({ success: true, data: masterSlide });
  })
);

// GET /master-slides - List master slides
router.get(
  '/master-slides',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [masterSlides, total] = await Promise.all([
      prisma.masterSlide.findMany({
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.masterSlide.count(),
    ]);

    res.json({
      success: true,
      data: masterSlides,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

// PUT /master-slides/:id - Update master slide
router.put(
  '/master-slides/:id',
  authMiddleware,
  validate(updateMasterSlideSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.masterSlide.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: 'Master slide not found', code: 'NOT_FOUND' });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.backgroundColor !== undefined) updateData.backgroundColor = req.body.backgroundColor;
    if (req.body.backgroundImage !== undefined) updateData.backgroundImage = req.body.backgroundImage;
    if (req.body.headerStyle !== undefined) updateData.headerStyle = req.body.headerStyle;
    if (req.body.footerStyle !== undefined) updateData.footerStyle = req.body.footerStyle;
    if (req.body.elements !== undefined) updateData.elements = req.body.elements;
    if (req.body.layout !== undefined) updateData.layout = req.body.layout;
    if (req.body.isDefault !== undefined) {
      updateData.isDefault = req.body.isDefault;
      if (req.body.isDefault) {
        await prisma.masterSlide.updateMany({
          where: { isDefault: true, id: { not: req.params.id } },
          data: { isDefault: false },
        });
      }
    }

    const masterSlide = await prisma.masterSlide.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ success: true, data: masterSlide });
  })
);

// DELETE /master-slides/:id - Delete master slide
router.delete(
  '/master-slides/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.masterSlide.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: 'Master slide not found', code: 'NOT_FOUND' });
      return;
    }

    const templatesUsingMaster = await prisma.slideTemplate.count({
      where: { masterSlideId: req.params.id },
    });

    if (templatesUsingMaster > 0) {
      res.status(400).json({
        success: false,
        error: `Cannot delete master slide: ${templatesUsingMaster} template(s) reference it. Remove or reassign them first.`,
        code: 'MASTER_SLIDE_IN_USE',
      });
      return;
    }

    await prisma.masterSlide.delete({ where: { id: req.params.id } });

    res.json({ success: true, message: 'Master slide deleted successfully' });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// COLOR ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /color-palette - Generate color palette from base color
router.post(
  '/color-palette',
  authMiddleware,
  validate(colorPaletteSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { baseColor, count, mode } = req.body;
    const paletteCount = count || 5;
    const paletteMode = mode || 'analogous';
    const { h, s, l } = hexToHsl(baseColor);

    let palette: string[];

    switch (paletteMode) {
      case 'complementary':
        palette = [
          baseColor,
          hslToHex((h + 180) % 360, s, l),
          hslToHex(h, Math.max(s - 20, 10), Math.min(l + 20, 90)),
          hslToHex((h + 180) % 360, Math.max(s - 20, 10), Math.min(l + 20, 90)),
          hslToHex(h, s, Math.max(l - 20, 10)),
        ];
        break;

      case 'triadic':
        palette = [
          baseColor,
          hslToHex((h + 120) % 360, s, l),
          hslToHex((h + 240) % 360, s, l),
          hslToHex(h, Math.max(s - 25, 10), Math.min(l + 25, 90)),
          hslToHex((h + 120) % 360, Math.max(s - 25, 10), Math.min(l + 25, 90)),
        ];
        break;

      case 'tetradic':
        palette = [
          baseColor,
          hslToHex((h + 90) % 360, s, l),
          hslToHex((h + 180) % 360, s, l),
          hslToHex((h + 270) % 360, s, l),
          hslToHex(h, Math.max(s - 30, 10), Math.min(l + 15, 90)),
        ];
        break;

      case 'monochromatic':
        palette = [];
        for (let i = 0; i < paletteCount; i++) {
          const lightness = 15 + (70 / (paletteCount - 1)) * i;
          palette.push(hslToHex(h, s, Math.round(lightness)));
        }
        break;

      case 'split-complementary':
        palette = [
          baseColor,
          hslToHex((h + 150) % 360, s, l),
          hslToHex((h + 210) % 360, s, l),
          hslToHex(h, Math.max(s - 20, 10), Math.min(l + 25, 90)),
          hslToHex((h + 180) % 360, Math.max(s - 15, 10), Math.min(l + 20, 90)),
        ];
        break;

      case 'analogous':
      default:
        palette = generatePaletteFromBase(baseColor, paletteCount);
        const step = 30;
        palette = [];
        for (let i = 0; i < paletteCount; i++) {
          const offset = (i - Math.floor(paletteCount / 2)) * step;
          palette.push(hslToHex((h + offset + 360) % 360, s, l));
        }
        break;
    }

    palette = palette.slice(0, paletteCount);

    const paletteWithInfo = palette.map((color) => {
      const hsl = hexToHsl(color);
      return {
        hex: color,
        hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
        role: hsl.l > 70 ? 'light' : hsl.l < 30 ? 'dark' : 'mid',
      };
    });

    res.json({
      success: true,
      data: {
        baseColor,
        mode: paletteMode,
        count: palette.length,
        palette: paletteWithInfo,
        css: palette.map((c, i) => `--color-${i + 1}: ${c};`).join('\n'),
      },
    });
  })
);

// POST /color-modes - Switch color mode (light/dark/auto/high-contrast)
router.post(
  '/color-modes',
  authMiddleware,
  validate(colorModeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, mode } = req.body;

    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
    });

    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const existingTheme = (presentation.theme as Record<string, unknown>) || {};

    let modeColors: Record<string, string>;

    switch (mode) {
      case 'dark':
        modeColors = {
          backgroundColor: '#121212',
          textColor: '#E0E0E0',
          primaryColor: (existingTheme.primaryColor as string) || '#90CAF9',
          secondaryColor: (existingTheme.secondaryColor as string) || '#CE93D8',
          surfaceColor: '#1E1E1E',
          cardColor: '#2C2C2C',
        };
        break;
      case 'high-contrast':
        modeColors = {
          backgroundColor: '#000000',
          textColor: '#FFFFFF',
          primaryColor: '#FFFF00',
          secondaryColor: '#00FF00',
          surfaceColor: '#1A1A1A',
          cardColor: '#333333',
        };
        break;
      case 'auto': {
        const hour = new Date().getHours();
        const isDark = hour < 6 || hour >= 20;
        if (isDark) {
          modeColors = {
            backgroundColor: '#121212',
            textColor: '#E0E0E0',
            primaryColor: (existingTheme.primaryColor as string) || '#90CAF9',
            secondaryColor: (existingTheme.secondaryColor as string) || '#CE93D8',
            surfaceColor: '#1E1E1E',
            cardColor: '#2C2C2C',
          };
        } else {
          modeColors = {
            backgroundColor: '#FFFFFF',
            textColor: '#212121',
            primaryColor: (existingTheme.primaryColor as string) || '#1976D2',
            secondaryColor: (existingTheme.secondaryColor as string) || '#424242',
            surfaceColor: '#F5F5F5',
            cardColor: '#FFFFFF',
          };
        }
        break;
      }
      case 'light':
      default:
        modeColors = {
          backgroundColor: '#FFFFFF',
          textColor: '#212121',
          primaryColor: (existingTheme.primaryColor as string) || '#1976D2',
          secondaryColor: (existingTheme.secondaryColor as string) || '#424242',
          surfaceColor: '#F5F5F5',
          cardColor: '#FFFFFF',
        };
        break;
    }

    const updatedTheme = {
      ...existingTheme,
      ...modeColors,
      colorMode: mode,
      colorModeAppliedAt: new Date().toISOString(),
    };

    const updated = await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        theme: updatedTheme as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        presentationId: updated.id,
        mode,
        appliedColors: modeColors,
        updatedAt: updated.updatedAt,
      },
    });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT ARCHETYPE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /layout-archetypes - Get layout archetype library
router.get(
  '/layout-archetypes',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const category = req.query.category as string | undefined;

    let filtered = LAYOUT_ARCHETYPES;
    if (category) {
      filtered = LAYOUT_ARCHETYPES.filter((a) => a.category === category);
    }

    const categories = [...new Set(LAYOUT_ARCHETYPES.map((a) => a.category))];

    res.json({
      success: true,
      data: {
        archetypes: filtered,
        total: filtered.length,
        categories,
      },
    });
  })
);

// POST /layout-archetypes - Create layout archetype
router.post(
  '/layout-archetypes',
  authMiddleware,
  validate(createArchetypeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId || req.user?.id || '';
    const body = req.body;

    const archetype = {
      id: crypto.randomUUID(),
      name: body.name,
      description: body.description || '',
      category: body.category,
      layout: body.layout,
      elements: body.elements || [],
      thumbnail: body.thumbnail || null,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };

    await prisma.slideTemplate.create({
      data: {
        id: archetype.id,
        name: `Archetype:${body.name}`,
        description: body.description || '',
        category: `archetype:${body.category}`,
        layout: 'blank',
        elements: {
          archetypeLayout: body.layout,
          archetypeElements: body.elements || [],
        } as Prisma.InputJsonValue,
        backgroundColor: '#FFFFFF',
        transitions: { type: 'none', duration: 500 } as Prisma.InputJsonValue,
        metadata: {
          isArchetype: true,
          archetypeCategory: body.category,
          thumbnail: body.thumbnail || null,
        } as Prisma.InputJsonValue,
        version: 1,
        createdBy: userId,
      },
    });

    res.status(201).json({ success: true, data: archetype });
  })
);

export default router;
