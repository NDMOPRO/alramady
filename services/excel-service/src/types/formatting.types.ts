export interface ProfessionalFormatOptions {
  theme?: ThemePreset;
  brand?: BrandConfig;
  autoFreezeHeader?: boolean;
  autoFilter?: boolean;
  alternateRowColors?: boolean;
  professionalFonts?: boolean;
  professionalBorders?: boolean;
  autoAlign?: boolean;
  convertToTable?: boolean;
}

export type ThemePreset =
  | 'corporate-blue'
  | 'modern-green'
  | 'elegant-gray'
  | 'bold-red'
  | 'ocean-teal'
  | 'sunset-orange'
  | 'midnight-purple'
  | 'nature-earth'
  | 'minimal-white'
  | 'dark-professional';

export interface ThemeConfig {
  name: ThemePreset;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headerBg: string;
  headerFg: string;
  altRowBg: string;
  borderColor: string;
  fontFamily: string;
  headerFontFamily: string;
  headerFontSize: number;
  bodyFontSize: number;
}

export interface BrandConfig {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  headerFontFamily?: string;
  logoUrl?: string;
}

export interface CulturalFormatConfig {
  locale: string;
  direction: 'ltr' | 'rtl';
  dateFormat: string;
  numberFormat: { decimal: string; thousands: string };
  currencySymbol: string;
  currencyPosition: 'before' | 'after';
  calendar: 'gregorian' | 'hijri';
  fontFamily?: string;
}

export interface CoverPageConfig {
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  logo?: string;
  organization?: string;
  theme?: ThemePreset;
}

export interface AccessibilityReport {
  score: number;
  issues: AccessibilityIssue[];
  passed: string[];
}

export interface AccessibilityIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  location?: string;
  suggestion: string;
}

export interface ConditionalFormatRule {
  type: 'cellValue' | 'colorScale' | 'dataBar' | 'iconSet' | 'formula' | 'top10' | 'duplicates';
  range: string;
  priority: number;
  config: Record<string, unknown>;
  style: Record<string, unknown>;
}

export interface DesignConstraints {
  maxColors?: number;
  maxFonts?: number;
  requiredFontFamily?: string;
  requiredColors?: string[];
  maxFontSize?: number;
  minFontSize?: number;
  requireAlternateRows?: boolean;
  requireHeaders?: boolean;
}

export interface DesignValidationResult {
  valid: boolean;
  violations: Array<{ constraint: string; message: string; severity: 'error' | 'warning' }>;
}
