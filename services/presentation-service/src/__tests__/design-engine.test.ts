// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  theme: {
    create: jest.fn().mockResolvedValue({
      id: 'theme-001',
      name: 'Corporate Blue',
      tenantId: 'tenant-abc',
      config: '{}',
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  },
  presentation: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'pres-001',
      theme: JSON.stringify({
        primaryColor: '#1a73e8',
        secondaryColor: '#ffffff',
        fontFamily: 'Arial',
      }),
    }),
    update: jest.fn().mockResolvedValue({}),
  },
  slide: {
    findFirst: jest.fn().mockResolvedValue({
      id: 'slide-001',
      presentationId: 'pres-001',
      slideIndex: 0,
      content: JSON.stringify({ elements: [], animations: [] }),
    }),
    findMany: jest.fn().mockResolvedValue([
      {
        id: 'slide-001',
        presentationId: 'pres-001',
        slideIndex: 0,
        content: JSON.stringify({
          elements: [
            { id: 'el-1', type: 'text', text: 'Hello', options: { bold: true, color: '333333', fontFace: 'Arial' } },
            { id: 'el-2', type: 'text', text: 'World', options: { bold: false, color: '666666', fontFace: 'Arial' } },
          ],
        }),
      },
    ]),
    update: jest.fn().mockResolvedValue({}),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

jest.mock('sharp', () => {
  const sharpInstance = {
    resize: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-image-data')),
  };
  return {
    __esModule: true,
    default: jest.fn(() => sharpInstance),
  };
});

jest.mock('canvas', () => ({
  createCanvas: jest.fn(() => {
    const ctx = {
      fillStyle: '',
      font: '',
      fillRect: jest.fn(),
      fillText: jest.fn(),
      beginPath: jest.fn(),
      ellipse: jest.fn(),
      fill: jest.fn(),
      measureText: jest.fn(() => ({ width: 50 })),
    };
    return {
      getContext: jest.fn(() => ctx),
      toBuffer: jest.fn(() => Buffer.from('mock-canvas-buffer')),
    };
  }),
}));

import {
  createTheme,
  applyBranding,
  generateColorPalette,
  addEntryAnimation,
  exportToImages,
} from '../services/design-engine.service.js';

describe('Design Engine Service (Section 5.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTheme', () => {
    it('should create a theme with provided colors, fonts, and backgrounds', async () => {
      const result = await createTheme(
        'Corporate Blue',
        ['#1a73e8', '#ffffff', '#fbbc04'],
        ['Roboto', 'Open Sans'],
        ['#f5f5f5'],
        'tenant-abc',
      );
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name', 'Corporate Blue');
      expect(result).toHaveProperty('tenantId', 'tenant-abc');
      expect(result.theme).toBeDefined();
      expect(result.theme.primaryColor).toBe('#1a73e8');
      expect(result.theme.secondaryColor).toBe('#ffffff');
      expect(result.theme.accentColor).toBe('#fbbc04');
      expect(result.theme.primaryFont).toBe('Roboto');
      expect(result.theme.secondaryFont).toBe('Open Sans');
      expect(result.theme.backgrounds).toEqual(['#f5f5f5']);
    });

    it('should use default colors and fonts when arrays are empty', async () => {
      const result = await createTheme('Default Theme', [], [], [], 'tenant-xyz');
      expect(result.theme.primaryColor).toBe('#1a73e8');
      expect(result.theme.secondaryColor).toBe('#ffffff');
      expect(result.theme.accentColor).toBe('#fbbc04');
      expect(result.theme.primaryFont).toBe('Arial');
      expect(result.theme.secondaryFont).toBe('Helvetica');
      expect(result.theme.primaryBackground).toBe('#ffffff');
    });

    it('should persist the theme via prisma.theme.create', async () => {
      await createTheme('Persisted', ['#000000'], ['Verdana'], ['#fff'], 'tenant-1');
      expect(mockPrisma.theme.create).toHaveBeenCalledTimes(1);
      const callArg = mockPrisma.theme.create.mock.calls[0][0];
      expect(callArg.data.name).toBe('Persisted');
      expect(callArg.data.tenantId).toBe('tenant-1');
      expect(callArg.data.isDefault).toBe(false);
    });

    it('should include standard font sizes in the theme config', async () => {
      const result = await createTheme('Sized', ['#aaa'], ['Inter'], [], 'tenant-2');
      expect(result.theme.headerFontSize).toBe(36);
      expect(result.theme.bodyFontSize).toBe(18);
      expect(result.theme.captionFontSize).toBe(12);
    });
  });

  describe('applyBranding', () => {
    it('should apply branding with logo, colors, and font to a presentation', async () => {
      const logo = Buffer.from('fake-logo-png');
      const result = await applyBranding('pres-001', {
        logo,
        primaryColor: '#0d47a1',
        secondaryColor: '#e3f2fd',
        fontFamily: 'Montserrat',
      });
      expect(result.presentationId).toBe('pres-001');
      expect(result.brandedTheme.primaryColor).toBe('#0d47a1');
      expect(result.brandedTheme.secondaryColor).toBe('#e3f2fd');
      expect(result.brandedTheme.fontFamily).toBe('Montserrat');
      expect(result.brandedTheme.brandLogo).toMatch(/^data:image\/png;base64,/);
      expect(result.updatedSlides).toBe(1);
      expect(result.logoSize).toBeGreaterThan(0);
    });

    it('should throw when presentation is not found', async () => {
      mockPrisma.presentation.findUnique.mockResolvedValueOnce(null);
      await expect(
        applyBranding('nonexistent', {
          logo: Buffer.from('x'),
          primaryColor: '#000',
          secondaryColor: '#fff',
          fontFamily: 'Arial',
        }),
      ).rejects.toThrow('Presentation nonexistent not found');
    });

    it('should add brand-logo element to slides that lack one', async () => {
      await applyBranding('pres-001', {
        logo: Buffer.from('logo-data'),
        primaryColor: '#333',
        secondaryColor: '#eee',
        fontFamily: 'Lato',
      });
      expect(mockPrisma.slide.update).toHaveBeenCalled();
      const updateCall = mockPrisma.slide.update.mock.calls[0][0];
      const updatedContent = JSON.parse(updateCall.data.content);
      const logoElement = updatedContent.elements.find((el: any) => el.id === 'brand-logo');
      expect(logoElement).toBeDefined();
      expect(logoElement.type).toBe('image');
    });
  });

  describe('generateColorPalette', () => {
    it('should generate a palette with the requested number of colors', () => {
      const result = generateColorPalette('#1a73e8', 5);
      expect(result.palette).toHaveLength(5);
      expect(result.baseColor).toBe('#1a73e8');
      expect(result.count).toBe(5);
      expect(result.strategy).toBe('mixed-harmony');
    });

    it('should always include the base color as the first palette entry', () => {
      const result = generateColorPalette('#ff5722', 3);
      expect(result.palette[0]).toBe('#ff5722');
    });

    it('should include a complementary color as the second entry', () => {
      const result = generateColorPalette('#ff0000', 4);
      expect(result.palette).toHaveLength(4);
      // The complementary of pure red should be a cyan-ish hue
      expect(result.palette[1]).toBeDefined();
      expect(result.palette[1]).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('should return HSL info for the base color', () => {
      const result = generateColorPalette('#000000', 2);
      expect(result.baseHsl).toHaveProperty('h');
      expect(result.baseHsl).toHaveProperty('s');
      expect(result.baseHsl).toHaveProperty('l');
    });

    it('should enforce a minimum of 2 colors internally', () => {
      const result = generateColorPalette('#abcdef', 1);
      // count comes from palette.slice(0, count), so result has 1
      expect(result.count).toBe(1);
      expect(result.palette).toHaveLength(1);
    });
  });

  describe('addEntryAnimation', () => {
    it('should add a known animation type to a slide element', async () => {
      const result = await addEntryAnimation('pres-001', 0, 'el-title', 'fadeIn');
      expect(result.presId).toBe('pres-001');
      expect(result.slideIndex).toBe(0);
      expect(result.elementId).toBe('el-title');
      expect(result.animation.type).toBe('fade');
      expect(result.animation.direction).toBe('in');
      expect(result.animation.duration).toBe(500);
    });

    it('should fall back to fadeIn for unknown animation names', async () => {
      const result = await addEntryAnimation('pres-001', 0, 'el-body', 'unknownAnim');
      expect(result.animation.type).toBe('fade');
      expect(result.animation.direction).toBe('in');
    });

    it('should throw when the target slide is not found', async () => {
      mockPrisma.slide.findFirst.mockResolvedValueOnce(null);
      await expect(
        addEntryAnimation('pres-001', 99, 'el-title', 'slideLeft'),
      ).rejects.toThrow('Slide at index 99 not found');
    });

    it('should support slideLeft animation with correct config', async () => {
      const result = await addEntryAnimation('pres-001', 0, 'el-img', 'slideLeft');
      expect(result.animation.type).toBe('slide');
      expect(result.animation.direction).toBe('left');
      expect(result.animation.duration).toBe(700);
    });

    it('should persist animations to the slide content via prisma update', async () => {
      await addEntryAnimation('pres-001', 0, 'el-chart', 'zoomIn');
      expect(mockPrisma.slide.update).toHaveBeenCalled();
      const updateCall = mockPrisma.slide.update.mock.calls[0][0];
      const updatedContent = JSON.parse(updateCall.data.content);
      expect(updatedContent.animations).toHaveLength(1);
      expect(updatedContent.animations[0].elementId).toBe('el-chart');
      expect(updatedContent.animations[0].animation.type).toBe('zoom');
    });
  });

  describe('exportToImages', () => {
    it('should export slides as PNG buffers', async () => {
      const images = await exportToImages('pres-001', 'png');
      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBeGreaterThan(0);
      expect(Buffer.isBuffer(images[0])).toBe(true);
    });

    it('should throw when presentation is not found for export', async () => {
      mockPrisma.presentation.findUnique.mockResolvedValueOnce(null);
      await expect(exportToImages('nonexistent', 'png')).rejects.toThrow(
        'Presentation nonexistent not found',
      );
    });
  });
});
