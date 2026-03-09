import { PrismaClient } from '@prisma/client';

export type ThemeMode = 'light' | 'dark';

export interface ColorPalette {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  secondaryLight: string;
  secondaryDark: string;
  accent: string;
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  heroStart: string;
  heroMid: string;
  heroEnd: string;
  chartColors: string[];
}

export interface TypographyConfig {
  fontFamily: string;
  fontFamilyArabic: string;
  displayFamily: string;
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  fontWeight: {
    regular: number;
    medium: number;
    semibold: number;
    bold: number;
    black: number;
  };
}

export interface SpacingConfig {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export interface BorderRadiusConfig {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  capsule: number;
}

export interface ShadowConfig {
  sm: string;
  md: string;
  lg: string;
  glow: string;
}

export interface ThemeCatalogFamily {
  key: string;
  nameAr: string;
  count: number;
}

export interface ThemeCatalogItem {
  key: string;
  family: string;
  familyNameAr: string;
  style: string;
  shape: string;
  nameAr: string;
  usageAr: string;
}

export interface ThemeCatalog {
  totalElements: number;
  families: ThemeCatalogFamily[];
  items: ThemeCatalogItem[];
}

export interface ThemeBrandKit {
  platformName?: string;
  companyName?: string;
  logoUrl?: string;
  logoInvertedUrl?: string;
  headerTitle?: string;
  footerText?: string;
}

export interface DashboardTheme {
  id: string;
  name: string;
  description: string;
  defaultMode: ThemeMode;
  rtl: boolean;
  palettes: {
    light: ColorPalette;
    dark: ColorPalette;
  };
  typography: TypographyConfig;
  spacing: SpacingConfig;
  borderRadius: BorderRadiusConfig;
  shadows: ShadowConfig;
  brandKit?: ThemeBrandKit;
  semanticLabelAr?: string;
  semanticDefinitionAr?: string;
  catalog: ThemeCatalog;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThemePreview {
  imageBuffer: Buffer;
  width: number;
  height: number;
  format: 'png';
}

export interface CreateThemeInput {
  name: string;
  description?: string;
  mode?: ThemeMode;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  fontFamily?: string;
  fontFamilyArabic?: string;
  displayFamily?: string;
  rtl?: boolean;
  semanticLabelAr?: string;
  semanticDefinitionAr?: string;
  brandKit?: ThemeBrandKit;
  isSystem?: boolean;
}

interface DbThemeRow {
  id: string;
  name: string;
  config: unknown;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

interface StoredThemeConfig {
  description: string;
  defaultMode: ThemeMode;
  rtl: boolean;
  palettes: {
    light: ColorPalette;
    dark: ColorPalette;
  };
  typography: TypographyConfig;
  spacing: SpacingConfig;
  borderRadius: BorderRadiusConfig;
  shadows: ShadowConfig;
  brandKit?: ThemeBrandKit;
  semanticLabelAr?: string;
  semanticDefinitionAr?: string;
  catalog: ThemeCatalog;
}

const HEX_COLOR = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

const CATALOG_FAMILIES = [
  ['hero_panels', 'ألواح الواجهة'],
  ['kpi_cards', 'بطاقات المؤشرات'],
  ['chart_surfaces', 'إطارات الرسوم'],
  ['comparison_strips', 'شرائط المقارنة'],
  ['table_skins', 'أنماط الجداول'],
  ['filter_bars', 'أشرطة الفلاتر'],
  ['legends', 'أنماط الشرح'],
  ['callouts', 'بطاقات التنبيه'],
  ['widgets', 'حاويات الويدجت'],
  ['section_headers', 'رؤوس الأقسام'],
  ['badges', 'الشارات والحالات'],
  ['navigation_blocks', 'أنماط التصفح'],
] as const;

const STYLE_VARIANTS = [
  ['executive', 'تنفيذي'],
  ['glass', 'زجاجي'],
  ['mesh', 'شبكي'],
  ['outline', 'حدودي'],
  ['luminous', 'مضيء'],
  ['contrast', 'تباين عال'],
] as const;

const SHAPE_VARIANTS = [
  ['soft', 'ناعم'],
  ['angular', 'حاد'],
  ['capsule', 'كبسولي'],
] as const;

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof value === 'object') {
    return value as T;
  }
  return fallback;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ThemeEngineService {
  constructor(private readonly prisma: PrismaClient) {}

  async createTheme(input: CreateThemeInput): Promise<DashboardTheme> {
    const normalized = this.normalizeThemeInput(input);
    const rows = await this.prisma.$queryRawUnsafe<DbThemeRow[]>(
      `
        INSERT INTO dashboard_themes (name, config, is_system, created_at, updated_at)
        VALUES ($1, $2::jsonb, $3, NOW(), NOW())
        RETURNING id, name, config, is_system, created_at, updated_at
      `,
      normalized.name,
      JSON.stringify(normalized.config),
      Boolean(input.isSystem)
    );

    return this.mapRow(rows[0]);
  }

  async getTheme(themeId: string): Promise<DashboardTheme> {
    const rows = await this.prisma.$queryRawUnsafe<DbThemeRow[]>(
      `
        SELECT id, name, config, is_system, created_at, updated_at
        FROM dashboard_themes
        WHERE id = $1
      `,
      themeId
    );

    if (!rows[0]) {
      throw new Error('Theme not found');
    }

    return this.mapRow(rows[0]);
  }

  async listThemes(mode?: ThemeMode): Promise<DashboardTheme[]> {
    const rows = await this.prisma.$queryRawUnsafe<DbThemeRow[]>(
      `
        SELECT id, name, config, is_system, created_at, updated_at
        FROM dashboard_themes
        ORDER BY is_system DESC, updated_at DESC, created_at DESC
      `
    );

    return rows
      .map((row) => this.mapRow(row))
      .filter((theme) => (mode ? theme.defaultMode === mode : true));
  }

  async createRtlVariant(themeId: string): Promise<DashboardTheme> {
    const baseTheme = await this.getTheme(themeId);
    return this.createTheme({
      name: `${baseTheme.name} RTL`,
      description: `${baseTheme.description} - نسخة عربية RTL`,
      mode: baseTheme.defaultMode,
      primaryColor: baseTheme.palettes.light.primary,
      secondaryColor: baseTheme.palettes.light.secondary,
      accentColor: baseTheme.palettes.light.accent,
      backgroundColor: baseTheme.palettes.light.background,
      surfaceColor: baseTheme.palettes.light.surface,
      textColor: baseTheme.palettes.light.text,
      fontFamily: baseTheme.typography.fontFamily,
      fontFamilyArabic: baseTheme.typography.fontFamilyArabic,
      displayFamily: baseTheme.typography.displayFamily,
      rtl: true,
      semanticLabelAr: baseTheme.semanticLabelAr,
      semanticDefinitionAr: baseTheme.semanticDefinitionAr,
      brandKit: baseTheme.brandKit,
      isSystem: false,
    });
  }

  async createDarkLightVariant(themeId: string): Promise<DashboardTheme> {
    const baseTheme = await this.getTheme(themeId);
    const sourcePalette =
      baseTheme.defaultMode === 'light' ? baseTheme.palettes.light : baseTheme.palettes.dark;
    const nextMode: ThemeMode = baseTheme.defaultMode === 'light' ? 'dark' : 'light';

    return this.createTheme({
      name: `${baseTheme.name} ${nextMode === 'dark' ? 'ليلي' : 'نهاري'}`,
      description: `${baseTheme.description} - تحويل تلقائي إلى وضع ${nextMode === 'dark' ? 'داكن' : 'فاتح'}`,
      mode: nextMode,
      primaryColor: sourcePalette.primary,
      secondaryColor: sourcePalette.secondary,
      accentColor: sourcePalette.accent,
      backgroundColor: sourcePalette.background,
      surfaceColor: sourcePalette.surface,
      textColor: sourcePalette.text,
      fontFamily: baseTheme.typography.fontFamily,
      fontFamilyArabic: baseTheme.typography.fontFamilyArabic,
      displayFamily: baseTheme.typography.displayFamily,
      rtl: baseTheme.rtl,
      semanticLabelAr: baseTheme.semanticLabelAr,
      semanticDefinitionAr: baseTheme.semanticDefinitionAr,
      brandKit: baseTheme.brandKit,
      isSystem: false,
    });
  }

  async applyBrandKit(themeId: string, brandKit: ThemeBrandKit): Promise<DashboardTheme> {
    const theme = await this.getTheme(themeId);
    const config: StoredThemeConfig = {
      description: theme.description,
      defaultMode: theme.defaultMode,
      rtl: theme.rtl,
      palettes: clone(theme.palettes),
      typography: clone(theme.typography),
      spacing: clone(theme.spacing),
      borderRadius: clone(theme.borderRadius),
      shadows: clone(theme.shadows),
      brandKit: {
        ...theme.brandKit,
        ...brandKit,
      },
      semanticLabelAr: theme.semanticLabelAr,
      semanticDefinitionAr: theme.semanticDefinitionAr,
      catalog: clone(theme.catalog),
    };

    const rows = await this.prisma.$queryRawUnsafe<DbThemeRow[]>(
      `
        UPDATE dashboard_themes
        SET config = $2::jsonb, updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, config, is_system, created_at, updated_at
      `,
      themeId,
      JSON.stringify(config)
    );

    return this.mapRow(rows[0]);
  }

  async generateThemePreview(themeId: string, mode?: ThemeMode): Promise<ThemePreview> {
    const { createCanvas } = await import('canvas');
    const theme = await this.getTheme(themeId);
    const palette = theme.palettes[mode ?? theme.defaultMode];
    const width = 1040;
    const height = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);

    const hero = ctx.createLinearGradient(0, 0, width, height * 0.55);
    hero.addColorStop(0, palette.heroStart);
    hero.addColorStop(0.5, palette.heroMid);
    hero.addColorStop(1, palette.heroEnd);
    ctx.fillStyle = hero;
    ctx.fillRect(0, 0, width, 240);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 34px ${theme.typography.displayFamily}`;
    ctx.fillText(theme.name, 48, 76);
    ctx.font = `600 16px ${theme.typography.fontFamilyArabic}`;
    ctx.fillText(theme.semanticDefinitionAr || theme.description || 'نظام بصري قابل لإعادة الاستخدام للوحات راصد', 48, 112);

    const swatchY = 156;
    palette.chartColors.slice(0, 8).forEach((color, index) => {
      ctx.fillStyle = color;
      ctx.fillRect(48 + index * 44, swatchY, 28, 28);
    });

    const cards = [
      { x: 48, y: 290, w: 240, h: 132, label: 'الإيراد', value: '12.4M', tone: palette.primary },
      { x: 312, y: 290, w: 240, h: 132, label: 'النمو', value: '+18%', tone: palette.accent },
      { x: 576, y: 290, w: 200, h: 132, label: 'الاكتفاء', value: '91%', tone: palette.success },
    ];

    for (const card of cards) {
      ctx.fillStyle = palette.surface;
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1;
      this.roundRect(ctx, card.x, card.y, card.w, card.h, theme.borderRadius.xl, true, true);
      ctx.fillStyle = card.tone;
      ctx.fillRect(card.x + 18, card.y + 18, 12, 12);
      ctx.fillStyle = palette.textSecondary;
      ctx.font = `600 14px ${theme.typography.fontFamilyArabic}`;
      ctx.fillText(card.label, card.x + 42, card.y + 29);
      ctx.fillStyle = palette.text;
      ctx.font = `900 34px ${theme.typography.displayFamily}`;
      ctx.fillText(card.value, card.x + 18, card.y + 86);
    }

    ctx.fillStyle = palette.surface;
    ctx.strokeStyle = palette.border;
    this.roundRect(ctx, 48, 462, 728, 190, theme.borderRadius.xl, true, true);

    const chartX = 84;
    const chartY = 618;
    const heights = [82, 126, 64, 140, 108, 92, 132, 74];
    heights.forEach((value, index) => {
      ctx.fillStyle = palette.chartColors[index % palette.chartColors.length];
      this.roundRect(ctx, chartX + index * 78, chartY - value, 42, value, 12, true, false);
    });

    ctx.fillStyle = palette.surface;
    ctx.strokeStyle = palette.border;
    this.roundRect(ctx, 804, 290, 188, 362, theme.borderRadius.xl, true, true);
    ctx.fillStyle = palette.text;
    ctx.font = `800 18px ${theme.typography.fontFamilyArabic}`;
    ctx.fillText('ملخص الكتالوج', 830, 328);
    ctx.font = `600 13px ${theme.typography.fontFamilyArabic}`;
    theme.catalog.families.slice(0, 6).forEach((family, index) => {
      const y = 368 + index * 42;
      ctx.fillStyle = palette.surfaceMuted;
      this.roundRect(ctx, 826, y - 18, 144, 28, 14, true, false);
      ctx.fillStyle = palette.textSecondary;
      ctx.fillText(`${family.nameAr}: ${family.count}`, 842, y);
    });

    return {
      imageBuffer: canvas.toBuffer('image/png'),
      width,
      height,
      format: 'png',
    };
  }

  async exportThemeCSS(themeId: string): Promise<string> {
    const theme = await this.getTheme(themeId);
    const light = theme.palettes.light;
    const dark = theme.palettes.dark;

    return [
      ':root {',
      `  --rasid-theme-name: "${theme.name}";`,
      `  --rasid-primary: ${light.primary};`,
      `  --rasid-secondary: ${light.secondary};`,
      `  --rasid-accent: ${light.accent};`,
      `  --rasid-surface: ${light.surface};`,
      `  --rasid-background: ${light.background};`,
      `  --rasid-text: ${light.text};`,
      `  --rasid-font-display: '${theme.typography.displayFamily}';`,
      `  --rasid-font-arabic: '${theme.typography.fontFamilyArabic}';`,
      '}',
      '',
      '.dark {',
      `  --rasid-primary: ${dark.primary};`,
      `  --rasid-secondary: ${dark.secondary};`,
      `  --rasid-accent: ${dark.accent};`,
      `  --rasid-surface: ${dark.surface};`,
      `  --rasid-background: ${dark.background};`,
      `  --rasid-text: ${dark.text};`,
      '}',
    ].join('\n');
  }

  private normalizeThemeInput(input: CreateThemeInput): { name: string; config: StoredThemeConfig } {
    if (!input.name?.trim()) {
      throw new Error('Theme name is required');
    }
    if (!HEX_COLOR.test(input.primaryColor)) {
      throw new Error('Primary color must be a valid hex color');
    }

    const defaultMode = input.mode ?? 'light';
    const secondary = input.secondaryColor && HEX_COLOR.test(input.secondaryColor) ? input.secondaryColor : '#0F172A';
    const accent = input.accentColor && HEX_COLOR.test(input.accentColor) ? input.accentColor : '#F97316';
    const background = input.backgroundColor && HEX_COLOR.test(input.backgroundColor) ? input.backgroundColor : '#F4F7FB';
    const surface = input.surfaceColor && HEX_COLOR.test(input.surfaceColor) ? input.surfaceColor : '#FFFFFF';
    const text = input.textColor && HEX_COLOR.test(input.textColor) ? input.textColor : '#0F172A';
    const typography = this.buildTypography(input.fontFamily, input.fontFamilyArabic, input.displayFamily);
    const catalog = this.buildCatalog(input.name);

    return {
      name: input.name.trim(),
      config: {
        description: input.description?.trim() || 'ثيم تشغيلي احترافي قابل لإعادة الاستخدام',
        defaultMode,
        rtl: input.rtl ?? true,
        palettes: {
          light: this.buildPalette(input.primaryColor, secondary, accent, background, surface, text, 'light'),
          dark: this.buildPalette(input.primaryColor, secondary, accent, '#07111F', '#111C2E', '#F8FAFC', 'dark'),
        },
        typography,
        spacing: {
          xs: 6,
          sm: 10,
          md: 14,
          lg: 20,
          xl: 28,
          xxl: 36,
        },
        borderRadius: {
          sm: 10,
          md: 16,
          lg: 22,
          xl: 30,
          capsule: 999,
        },
        shadows: {
          sm: '0 10px 30px rgba(15, 23, 42, 0.08)',
          md: '0 20px 60px rgba(15, 23, 42, 0.12)',
          lg: '0 34px 90px rgba(15, 23, 42, 0.18)',
          glow: '0 0 0 1px rgba(255,255,255,0.12), 0 22px 64px rgba(59,130,246,0.26)',
        },
        brandKit: input.brandKit,
        semanticLabelAr: input.semanticLabelAr?.trim() || undefined,
        semanticDefinitionAr: input.semanticDefinitionAr?.trim() || undefined,
        catalog,
      },
    };
  }

  private mapRow(row: DbThemeRow): DashboardTheme {
    const raw = parseJsonValue<Partial<StoredThemeConfig>>(row.config, {});
    const typography = this.buildTypography(
      raw.typography?.fontFamily,
      raw.typography?.fontFamilyArabic,
      raw.typography?.displayFamily
    );
    const palettes = {
      light: this.ensurePalette(raw.palettes?.light, 'light'),
      dark: this.ensurePalette(raw.palettes?.dark, 'dark'),
    };

    return {
      id: row.id,
      name: row.name,
      description: raw.description || 'ثيم تشغيلي احترافي قابل لإعادة الاستخدام',
      defaultMode: raw.defaultMode === 'dark' ? 'dark' : 'light',
      rtl: raw.rtl ?? true,
      palettes,
      typography,
      spacing: {
        xs: raw.spacing?.xs ?? 6,
        sm: raw.spacing?.sm ?? 10,
        md: raw.spacing?.md ?? 14,
        lg: raw.spacing?.lg ?? 20,
        xl: raw.spacing?.xl ?? 28,
        xxl: raw.spacing?.xxl ?? 36,
      },
      borderRadius: {
        sm: raw.borderRadius?.sm ?? 10,
        md: raw.borderRadius?.md ?? 16,
        lg: raw.borderRadius?.lg ?? 22,
        xl: raw.borderRadius?.xl ?? 30,
        capsule: raw.borderRadius?.capsule ?? 999,
      },
      shadows: {
        sm: raw.shadows?.sm ?? '0 10px 30px rgba(15, 23, 42, 0.08)',
        md: raw.shadows?.md ?? '0 20px 60px rgba(15, 23, 42, 0.12)',
        lg: raw.shadows?.lg ?? '0 34px 90px rgba(15, 23, 42, 0.18)',
        glow: raw.shadows?.glow ?? '0 0 0 1px rgba(255,255,255,0.12), 0 22px 64px rgba(59,130,246,0.26)',
      },
      brandKit: raw.brandKit,
      semanticLabelAr: raw.semanticLabelAr,
      semanticDefinitionAr: raw.semanticDefinitionAr,
      catalog: raw.catalog?.items?.length ? (raw.catalog as ThemeCatalog) : this.buildCatalog(row.name),
      isSystem: row.is_system,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private buildTypography(
    fontFamily?: string,
    fontFamilyArabic?: string,
    displayFamily?: string
  ): TypographyConfig {
    return {
      fontFamily: fontFamily || 'Space Grotesk, sans-serif',
      fontFamilyArabic: fontFamilyArabic || 'Tajawal, sans-serif',
      displayFamily: displayFamily || fontFamilyArabic || 'Tajawal, sans-serif',
      fontSize: {
        xs: 11,
        sm: 13,
        md: 15,
        lg: 18,
        xl: 24,
        xxl: 34,
      },
      fontWeight: {
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        black: 900,
      },
    };
  }

  private ensurePalette(value: Partial<ColorPalette> | undefined, mode: ThemeMode): ColorPalette {
    const primary = value?.primary && HEX_COLOR.test(value.primary) ? value.primary : '#2563EB';
    const secondary = value?.secondary && HEX_COLOR.test(value.secondary) ? value.secondary : '#0F172A';
    const accent = value?.accent && HEX_COLOR.test(value.accent) ? value.accent : '#F97316';
    const background =
      value?.background && HEX_COLOR.test(value.background)
        ? value.background
        : mode === 'dark'
          ? '#07111F'
          : '#F4F7FB';
    const surface =
      value?.surface && HEX_COLOR.test(value.surface)
        ? value.surface
        : mode === 'dark'
          ? '#111C2E'
          : '#FFFFFF';
    const text =
      value?.text && HEX_COLOR.test(value.text)
        ? value.text
        : mode === 'dark'
          ? '#F8FAFC'
          : '#0F172A';

    return this.buildPalette(primary, secondary, accent, background, surface, text, mode);
  }

  private buildPalette(
    primary: string,
    secondary: string,
    accent: string,
    background: string,
    surface: string,
    text: string,
    mode: ThemeMode
  ): ColorPalette {
    const chartColors = this.buildChartColors(primary, accent, mode);
    return {
      primary,
      primaryLight: this.lightenColor(primary, 0.22),
      primaryDark: this.darkenColor(primary, 0.24),
      secondary,
      secondaryLight: this.lightenColor(secondary, mode === 'dark' ? 0.16 : 0.28),
      secondaryDark: this.darkenColor(secondary, mode === 'dark' ? 0.18 : 0.3),
      accent,
      background,
      surface,
      surfaceMuted: mode === 'dark' ? '#17263A' : '#EDF3FB',
      text,
      textSecondary: mode === 'dark' ? '#CBD5E1' : '#475569',
      border: mode === 'dark' ? '#25364C' : '#D8E3F0',
      success: mode === 'dark' ? '#4ADE80' : '#15803D',
      warning: mode === 'dark' ? '#FBBF24' : '#B45309',
      error: mode === 'dark' ? '#FB7185' : '#BE123C',
      info: mode === 'dark' ? '#38BDF8' : '#0369A1',
      heroStart: mode === 'dark' ? '#07111F' : this.lightenColor(primary, 0.08),
      heroMid: mode === 'dark' ? this.darkenColor(primary, 0.36) : primary,
      heroEnd: mode === 'dark' ? this.darkenColor(accent, 0.4) : accent,
      chartColors,
    };
  }

  private buildCatalog(themeName: string): ThemeCatalog {
    const items: ThemeCatalogItem[] = [];

    for (const [familyKey, familyNameAr] of CATALOG_FAMILIES) {
      for (const [styleKey, styleNameAr] of STYLE_VARIANTS) {
        for (const [shapeKey, shapeNameAr] of SHAPE_VARIANTS) {
          items.push({
            key: `${familyKey}-${styleKey}-${shapeKey}`,
            family: familyKey,
            familyNameAr,
            style: styleKey,
            shape: shapeKey,
            nameAr: `${familyNameAr} ${styleNameAr} ${shapeNameAr}`,
            usageAr: `نمط ${styleNameAr} ضمن ${themeName} مهيأ للاستخدام في ${familyNameAr}.`,
          });
        }
      }
    }

    return {
      totalElements: items.length,
      families: CATALOG_FAMILIES.map(([key, nameAr]) => ({
        key,
        nameAr,
        count: STYLE_VARIANTS.length * SHAPE_VARIANTS.length,
      })),
      items,
    };
  }

  private buildChartColors(primary: string, accent: string, mode: ThemeMode): string[] {
    const baseHsl = this.hexToHsl(primary);
    const accentHsl = this.hexToHsl(accent);
    const colors: string[] = [];

    for (let index = 0; index < 12; index += 1) {
      const hue = (baseHsl.h + index * 24 + (index % 2 === 0 ? 0 : accentHsl.h - baseHsl.h)) % 360;
      const saturation = Math.min(90, 58 + (index % 4) * 8);
      const lightness = mode === 'dark' ? 55 + (index % 3) * 6 : 40 + (index % 4) * 7;
      colors.push(this.hslToHex((hue + 360) % 360, saturation, lightness));
    }

    return colors;
  }

  private hexToHsl(hex: string): { h: number; s: number; l: number } {
    const normalized = hex.replace('#', '');
    const step = normalized.length === 3 ? 1 : 2;
    const [r, g, b] = [0, 1, 2].map((index) => {
      const raw = normalized.slice(index * step, index * step + step);
      const full = step === 1 ? `${raw}${raw}` : raw;
      return parseInt(full, 16) / 255;
    });

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const lightness = (max + min) / 2;
    let hue = 0;
    let saturation = 0;

    if (delta !== 0) {
      saturation =
        lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

      switch (max) {
        case r:
          hue = (g - b) / delta + (g < b ? 6 : 0);
          break;
        case g:
          hue = (b - r) / delta + 2;
          break;
        default:
          hue = (r - g) / delta + 4;
          break;
      }

      hue /= 6;
    }

    return {
      h: Math.round(hue * 360),
      s: Math.round(saturation * 100),
      l: Math.round(lightness * 100),
    };
  }

  private hslToHex(h: number, s: number, l: number): string {
    const saturation = s / 100;
    const lightness = l / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
    const match = lightness - chroma / 2;
    let r = 0;
    let g = 0;
    let b = 0;

    if (h < 60) {
      r = chroma;
      g = x;
    } else if (h < 120) {
      r = x;
      g = chroma;
    } else if (h < 180) {
      g = chroma;
      b = x;
    } else if (h < 240) {
      g = x;
      b = chroma;
    } else if (h < 300) {
      r = x;
      b = chroma;
    } else {
      r = chroma;
      b = x;
    }

    const toHex = (value: number) =>
      Math.round((value + match) * 255)
        .toString(16)
        .padStart(2, '0')
        .toUpperCase();

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private lightenColor(hex: string, amount: number): string {
    const hsl = this.hexToHsl(hex);
    return this.hslToHex(hsl.h, hsl.s, Math.min(96, Math.round(hsl.l + (100 - hsl.l) * amount)));
  }

  private darkenColor(hex: string, amount: number): string {
    const hsl = this.hexToHsl(hex);
    return this.hslToHex(hsl.h, hsl.s, Math.max(6, Math.round(hsl.l * (1 - amount))));
  }

  private roundRect(
    ctx: {
      beginPath: () => void;
      moveTo: (x: number, y: number) => void;
      lineTo: (x: number, y: number) => void;
      quadraticCurveTo: (cpx: number, cpy: number, x: number, y: number) => void;
      closePath: () => void;
      fill: () => void;
      stroke: () => void;
    },
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: boolean,
    stroke: boolean
  ) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }
}
