import type { LocaleConfig } from '../types/common.types.js';
import type { CulturalFormatConfig } from '../types/formatting.types.js';

const LOCALE_CONFIGS: Record<string, LocaleConfig> = {
  'ar-SA': {
    locale: 'ar-SA',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: '.', thousands: ',', currency: 'SAR' },
    direction: 'rtl',
    calendar: 'hijri',
    firstDayOfWeek: 0,
  },
  'ar-AE': {
    locale: 'ar-AE',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: '.', thousands: ',', currency: 'AED' },
    direction: 'rtl',
    calendar: 'gregorian',
    firstDayOfWeek: 0,
  },
  'ar-EG': {
    locale: 'ar-EG',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: '.', thousands: ',', currency: 'EGP' },
    direction: 'rtl',
    calendar: 'gregorian',
    firstDayOfWeek: 0,
  },
  'en-US': {
    locale: 'en-US',
    dateFormat: 'MM/DD/YYYY',
    numberFormat: { decimal: '.', thousands: ',', currency: 'USD' },
    direction: 'ltr',
    calendar: 'gregorian',
    firstDayOfWeek: 0,
  },
  'en-GB': {
    locale: 'en-GB',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: '.', thousands: ',', currency: 'GBP' },
    direction: 'ltr',
    calendar: 'gregorian',
    firstDayOfWeek: 1,
  },
  'fr-FR': {
    locale: 'fr-FR',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: ',', thousands: ' ', currency: 'EUR' },
    direction: 'ltr',
    calendar: 'gregorian',
    firstDayOfWeek: 1,
  },
  'de-DE': {
    locale: 'de-DE',
    dateFormat: 'DD.MM.YYYY',
    numberFormat: { decimal: ',', thousands: '.', currency: 'EUR' },
    direction: 'ltr',
    calendar: 'gregorian',
    firstDayOfWeek: 1,
  },
};

export function getLocaleConfig(locale: string): LocaleConfig {
  return LOCALE_CONFIGS[locale] || LOCALE_CONFIGS['en-US'];
}

export function getAllLocales(): string[] {
  return Object.keys(LOCALE_CONFIGS);
}

export function getCulturalFormatConfig(locale: string): CulturalFormatConfig {
  const lc = getLocaleConfig(locale);
  const currencyPositions: Record<string, 'before' | 'after'> = {
    'USD': 'before', 'GBP': 'before', 'EUR': 'after',
    'SAR': 'after', 'AED': 'after', 'EGP': 'after',
  };
  const arabicFonts = ['ar-SA', 'ar-AE', 'ar-EG'];
  return {
    locale: lc.locale,
    direction: lc.direction,
    dateFormat: lc.dateFormat,
    numberFormat: { decimal: lc.numberFormat.decimal, thousands: lc.numberFormat.thousands },
    currencySymbol: lc.numberFormat.currency,
    currencyPosition: currencyPositions[lc.numberFormat.currency] || 'before',
    calendar: lc.calendar,
    fontFamily: arabicFonts.includes(locale) ? 'Sakkal Majalla' : 'Calibri',
  };
}

export function formatNumber(value: number, locale: string): string {
  const config = getLocaleConfig(locale);
  const parts = value.toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, config.numberFormat.thousands);
  return `${intPart}${config.numberFormat.decimal}${parts[1]}`;
}

export function formatCurrency(value: number, locale: string): string {
  const config = getCulturalFormatConfig(locale);
  const formatted = formatNumber(value, locale);
  return config.currencyPosition === 'before'
    ? `${config.currencySymbol} ${formatted}`
    : `${formatted} ${config.currencySymbol}`;
}
