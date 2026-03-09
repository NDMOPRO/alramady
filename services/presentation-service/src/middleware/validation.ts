import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from './errorHandler';

// --- Validation middleware ---
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors: Record<string, string[]> = {};
        err.errors.forEach((e) => {
          const path = e.path.join('.');
          if (!errors[path]) errors[path] = [];
          errors[path].push(e.message);
        });
        next(new ValidationError('Validation failed', errors));
      } else {
        next(err);
      }
    }
  };
}

// --- Common schemas ---
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const idParamSchema = z.object({ id: z.string().uuid() });

// ==============================
// MOD-0030: Multi-Source schemas
// ==============================
export const multiSourceCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  sourceType: z.enum(['file', 'url', 'database', 'api', 'cloud_storage', 'clipboard', 'email', 'social_media']),
  sourceConfig: z.record(z.unknown()).optional(),
  autoSync: z.boolean().default(false),
  syncInterval: z.number().int().min(60).optional(),
  transformRules: z.array(z.record(z.unknown())).optional(),
  tags: z.array(z.string()).optional(),
});

export const multiSourceUpdateSchema = multiSourceCreateSchema.partial();

// ==============================
// MOD-0031: AI-Content schemas
// ==============================
export const aiContentCreateSchema = z.object({
  title: z.string().min(1).max(500),
  prompt: z.string().min(1).max(5000),
  contentType: z.enum(['slide', 'outline', 'script', 'summary', 'talking_points', 'quiz', 'handout']),
  tone: z.enum(['professional', 'casual', 'academic', 'creative', 'persuasive']).default('professional'),
  language: z.string().default('ar'),
  targetAudience: z.string().max(500).optional(),
  maxSlides: z.number().int().min(1).max(200).optional(),
  includeNotes: z.boolean().default(true),
  includeImages: z.boolean().default(true),
  templateId: z.string().uuid().optional(),
  keywords: z.array(z.string()).optional(),
  sourceDocuments: z.array(z.string().uuid()).optional(),
});

export const aiContentUpdateSchema = aiContentCreateSchema.partial();

// ==============================
// MOD-0032: Smart-Design schemas
// ==============================
export const smartDesignCreateSchema = z.object({
  name: z.string().min(1).max(255),
  presentationId: z.string().uuid(),
  designMode: z.enum(['auto', 'template', 'brand', 'custom', 'ai_generated']),
  colorPalette: z.array(z.string()).optional(),
  fontFamily: z.string().optional(),
  layoutPreference: z.enum(['minimal', 'content_heavy', 'visual', 'balanced']).default('balanced'),
  brandGuideId: z.string().uuid().optional(),
  aspectRatio: z.enum(['16:9', '4:3', '1:1', '9:16']).default('16:9'),
  theme: z.enum(['light', 'dark', 'auto']).default('light'),
});

export const smartDesignUpdateSchema = smartDesignCreateSchema.partial();

// ==============================
// MOD-0033: Advanced-Edit schemas
// ==============================
export const advancedEditCreateSchema = z.object({
  presentationId: z.string().uuid(),
  slideIndex: z.number().int().min(0),
  operation: z.enum(['add_element', 'remove_element', 'modify_element', 'reorder', 'duplicate', 'merge', 'split', 'transform', 'group', 'ungroup']),
  elementType: z.enum(['text', 'image', 'shape', 'chart', 'table', 'video', 'audio', 'icon', 'smartart']).optional(),
  elementData: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  size: z.object({ width: z.number(), height: z.number() }).optional(),
  style: z.record(z.unknown()).optional(),
  layerOrder: z.number().int().optional(),
});

export const advancedEditUpdateSchema = advancedEditCreateSchema.partial();

// ==============================
// MOD-0034: Animation schemas
// ==============================
export const animationCreateSchema = z.object({
  presentationId: z.string().uuid(),
  slideIndex: z.number().int().min(0),
  elementId: z.string().uuid().optional(),
  animationType: z.enum(['entrance', 'exit', 'emphasis', 'motion_path', 'transition']),
  effect: z.string().min(1).max(100),
  duration: z.number().min(0.1).max(60).default(1),
  delay: z.number().min(0).max(120).default(0),
  triggerOn: z.enum(['click', 'with_previous', 'after_previous', 'auto']).default('click'),
  easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out', 'bounce', 'elastic']).default('ease_in_out'),
  repeat: z.number().int().min(0).max(100).default(0),
  direction: z.enum(['in', 'out', 'left', 'right', 'up', 'down']).optional(),
});

export const animationUpdateSchema = animationCreateSchema.partial();

// ==============================
// MOD-0035: Export-Share schemas
// ==============================
export const exportShareCreateSchema = z.object({
  presentationId: z.string().uuid(),
  exportFormat: z.enum(['pptx', 'pdf', 'png', 'jpg', 'svg', 'html', 'video', 'gif', 'google_slides']),
  quality: z.enum(['draft', 'standard', 'high', 'print']).default('standard'),
  slideRange: z.string().optional(),
  includeNotes: z.boolean().default(false),
  includeAnimations: z.boolean().default(true),
  watermark: z.string().optional(),
  password: z.string().optional(),
  shareSettings: z.object({
    visibility: z.enum(['private', 'team', 'organization', 'public']).default('private'),
    allowDownload: z.boolean().default(true),
    allowCopy: z.boolean().default(true),
    expiresAt: z.string().datetime().optional(),
  }).optional(),
});

export const exportShareUpdateSchema = exportShareCreateSchema.partial();

// ==============================
// MOD-0036: Collaboration schemas
// ==============================
export const collaborationCreateSchema = z.object({
  presentationId: z.string().uuid(),
  collaborationType: z.enum(['real_time', 'async', 'review', 'comment_only']),
  invitees: z.array(z.object({
    userId: z.string().uuid().optional(),
    email: z.string().email().optional(),
    role: z.enum(['editor', 'commenter', 'viewer']).default('viewer'),
  })).min(1),
  settings: z.object({
    allowChat: z.boolean().default(true),
    trackChanges: z.boolean().default(true),
    requireApproval: z.boolean().default(false),
    maxCollaborators: z.number().int().min(1).max(100).default(25),
    lockSlides: z.boolean().default(false),
  }).optional(),
  message: z.string().max(1000).optional(),
});

export const collaborationUpdateSchema = collaborationCreateSchema.partial();

// ==============================
// MOD-0037: Integration schemas
// ==============================
export const integrationCreateSchema = z.object({
  name: z.string().min(1).max(255),
  integrationType: z.enum(['google_workspace', 'microsoft_365', 'slack', 'teams', 'dropbox', 'onedrive', 'sharepoint', 'notion', 'confluence', 'zapier', 'webhook']),
  config: z.record(z.unknown()),
  enabled: z.boolean().default(true),
  syncDirection: z.enum(['import', 'export', 'bidirectional']).default('bidirectional'),
  autoSync: z.boolean().default(false),
  webhookUrl: z.string().url().optional(),
  credentials: z.record(z.unknown()).optional(),
});

export const integrationUpdateSchema = integrationCreateSchema.partial();
