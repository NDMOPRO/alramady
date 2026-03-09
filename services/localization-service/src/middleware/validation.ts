import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { AppError } from './errorHandler';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
        next(new AppError(`Validation failed: ${messages}`, 422));
      } else {
        next(error);
      }
    }
  };
}

/* ─── Language-Intelligence (MOD-0049) ─── */
export const languageIntelligenceCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  sourceLanguage: z.string().min(2).max(10),
  targetLanguage: z.string().min(2).max(10),
  detectionMethod: z.string().min(1),
  confidenceThreshold: z.number().min(0).max(1).default(0.85),
  supportedDialects: z.array(z.string()).default([]),
  translationEngine: z.string().optional(),
  glossaryId: z.string().optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});
export const languageIntelligenceUpdateSchema = languageIntelligenceCreateSchema.partial();

/* ─── RTL-Layout (MOD-0050) ─── */
export const rtlLayoutCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  layoutType: z.string().min(1),
  direction: z.enum(['rtl', 'ltr', 'auto']).default('rtl'),
  mirrorLayout: z.boolean().default(true),
  bidirectionalRules: z.record(z.unknown()).optional(),
  fontConfig: z.record(z.unknown()).optional(),
  alignmentRules: z.record(z.unknown()).optional(),
  componentOverrides: z.array(z.record(z.unknown())).default([]),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});
export const rtlLayoutUpdateSchema = rtlLayoutCreateSchema.partial();

/* ─── Arabic-Typography (MOD-0051) ─── */
export const arabicTypographyCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  fontFamily: z.string().min(1),
  fontWeight: z.number().int().min(100).max(900).default(400),
  fontSize: z.number().min(8).max(200).default(16),
  lineHeight: z.number().min(1).max(3).default(1.6),
  letterSpacing: z.number().default(0),
  ligatureRules: z.record(z.unknown()).optional(),
  diacriticsHandling: z.enum(['show', 'hide', 'smart']).default('smart'),
  kashidaExtension: z.boolean().default(true),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});
export const arabicTypographyUpdateSchema = arabicTypographyCreateSchema.partial();

/* ─── Data-Localization (MOD-0052) ─── */
export const dataLocalizationCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  localeCode: z.string().min(2).max(10),
  dateFormat: z.string().default('DD/MM/YYYY'),
  timeFormat: z.string().default('HH:mm:ss'),
  numberFormat: z.record(z.unknown()).optional(),
  currencyCode: z.string().length(3).default('SAR'),
  calendarSystem: z.enum(['gregorian', 'hijri', 'dual']).default('hijri'),
  measurementUnit: z.enum(['metric', 'imperial']).default('metric'),
  addressFormat: z.record(z.unknown()).optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});
export const dataLocalizationUpdateSchema = dataLocalizationCreateSchema.partial();

/* ─── Quality-Gate (MOD-0053) ─── */
export const qualityGateCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  gateType: z.string().min(1),
  checkRules: z.array(z.record(z.unknown())),
  passThreshold: z.number().min(0).max(100).default(95),
  blockOnFailure: z.boolean().default(true),
  notifyOnFailure: z.boolean().default(true),
  reviewerRoles: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});
export const qualityGateUpdateSchema = qualityGateCreateSchema.partial();
