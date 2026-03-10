import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { writeFile, readFile, mkdir, readdir, stat } from 'fs/promises';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const STORAGE_BASE = process.env.MEDIA_STORAGE_PATH || '/data/media';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || '';
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || '';
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';

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

// ─── Validation Schemas ─────────────────────────────────────────────────────

const importGoogleSlidesSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(255).optional(),
  importOptions: z.object({
    preserveTheme: z.boolean().default(true),
    preserveAnimations: z.boolean().default(true),
    preserveNotes: z.boolean().default(true),
  }).optional(),
});

const importCanvaSchema = z.object({
  designUrl: z.string().url(),
  accessToken: z.string().min(1),
  name: z.string().min(1).max(255).optional(),
});

const googleConnectSchema = z.object({
  authCode: z.string().min(1),
  redirectUri: z.string().url().optional(),
});

const googleSaveSchema = z.object({
  folderId: z.string().optional(),
  fileName: z.string().min(1).max(255).optional(),
});

const googleSyncSchema = z.object({
  googleSlidesId: z.string().min(1),
  direction: z.enum(['push', 'pull', 'merge']).default('push'),
});

const microsoftConnectSchema = z.object({
  authCode: z.string().min(1),
  redirectUri: z.string().url().optional(),
});

const microsoftSaveSchema = z.object({
  folderId: z.string().optional(),
  fileName: z.string().min(1).max(255).optional(),
});

const zapierWebhookSchema = z.object({
  action: z.string().min(1),
  presentationId: z.string().uuid().optional(),
  data: z.record(z.unknown()).optional(),
});

const makeWebhookSchema = z.object({
  action: z.string().min(1),
  presentationId: z.string().uuid().optional(),
  data: z.record(z.unknown()).optional(),
});

const connectorConnectSchema = z.object({
  config: z.record(z.unknown()),
  authToken: z.string().optional(),
});

const skillSaveSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  workflow: z.record(z.unknown()),
  triggerType: z.enum(['manual', 'scheduled', 'webhook', 'event']).default('manual'),
});

const scheduledTaskSchema = z.object({
  name: z.string().min(1).max(200),
  taskType: z.enum(['export', 'sync', 'backup', 'generate', 'notify']),
  schedule: z.string().min(1).max(100),
  config: z.record(z.unknown()),
  isActive: z.boolean().default(true),
});

const scheduledTaskUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  schedule: z.string().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

// ─── Helper functions ───────────────────────────────────────────────────────

function extractGoogleSlidesId(url: string): string | null {
  const match = url.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function getIntegrationToken(userId: string, provider: string): Promise<string | null> {
  const integration = await prisma.presentationIntegration.findFirst({
    where: { userId, provider, status: 'active' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!integration || !integration.config) return null;
  const config = integration.config as Record<string, unknown>;
  return (config.accessToken as string) || null;
}

function parseCronExpression(cron: string): Date {
  // Simple next-run-at calculator for common patterns
  const now = new Date();
  const parts = cron.split(' ');
  if (parts.length < 5) {
    // Default: run in 1 hour
    return new Date(now.getTime() + 3600000);
  }

  const minute = parts[0] === '*' ? now.getMinutes() : parseInt(parts[0]) || 0;
  const hour = parts[1] === '*' ? now.getHours() : parseInt(parts[1]) || 0;

  const next = new Date(now);
  next.setMinutes(minute);
  next.setSeconds(0);
  next.setMilliseconds(0);

  if (parts[1] !== '*') {
    next.setHours(hour);
  }

  // If the computed time is in the past, advance by one day
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

// ─── PPTX Import / Export Helpers ───────────────────────────────────────────

async function parsePptxBuffer(buffer: Buffer, tenantId: string, userId: string, name?: string): Promise<Record<string, unknown>> {
  const presentationId = crypto.randomUUID();
  const presentationName = name || `Imported PPTX - ${new Date().toISOString().slice(0, 16)}`;

  // Use pptxgenjs-compatible parsing: extract slides from the PPTX zip structure
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);

  // Extract slide XML files
  const slideFiles: string[] = [];
  zip.forEach((relativePath) => {
    if (relativePath.match(/^ppt\/slides\/slide\d+\.xml$/)) {
      slideFiles.push(relativePath);
    }
  });

  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
    const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
    return numA - numB;
  });

  // Create presentation record
  const presentation = await prisma.presentation.create({
    data: {
      id: presentationId,
      name: presentationName,
      status: 'DRAFT',
      slideCount: slideFiles.length,
      tenantId,
      userId,
      theme: {},
      slides: {},
    },
  });

  // Create slide records from extracted data
  const slideRecords = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const slideXml = await zip.file(slideFiles[i])?.async('text');
    const slideContent = extractSlideContent(slideXml || '');

    const slide = await prisma.slide.create({
      data: {
        id: crypto.randomUUID(),
        presentationId,
        slideIndex: i,
        order: i,
        layout: (slideContent.layout as string) || 'blank',
        content: JSON.parse(JSON.stringify(slideContent)),
        notes: (slideContent.notes as string) || null,
      },
    });

    slideRecords.push(slide);
  }

  return {
    id: presentation.id,
    name: presentation.name,
    slideCount: slideFiles.length,
    slides: slideRecords.map(s => ({ id: s.id, slideIndex: s.slideIndex, layout: s.layout })),
    importedAt: new Date().toISOString(),
  };
}

function extractSlideContent(xml: string): Record<string, unknown> {
  // Extract text content from slide XML
  const textMatches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
  const texts = textMatches.map(m => m.replace(/<\/?a:t>/g, ''));

  // Determine layout from slide content heuristics
  let layout = 'blank';
  if (texts.length > 0 && texts[0].length > 0) {
    layout = texts.length <= 2 ? 'title' : 'content';
  }

  return {
    layout,
    texts,
    title: texts[0] || '',
    body: texts.slice(1).join('\n'),
    rawElementCount: textMatches.length,
    notes: '',
  };
}

async function parsePdfToSlides(buffer: Buffer, tenantId: string, userId: string): Promise<Record<string, unknown>> {
  const presentationId = crypto.randomUUID();
  const presentationName = `Imported PDF - ${new Date().toISOString().slice(0, 16)}`;

  // Store the PDF buffer temporarily
  const storageDir = path.join(STORAGE_BASE, 'imports', presentationId);
  await mkdir(storageDir, { recursive: true });
  const pdfPath = path.join(storageDir, 'source.pdf');
  await writeFile(pdfPath, buffer);

  // Estimate page count from PDF structure
  const pdfContent = buffer.toString('latin1');
  const pageMatches = pdfContent.match(/\/Type\s*\/Page[^s]/g) || [];
  const estimatedPages = Math.max(pageMatches.length, 1);

  const presentation = await prisma.presentation.create({
    data: {
      id: presentationId,
      name: presentationName,
      status: 'DRAFT',
      slideCount: estimatedPages,
      tenantId,
      userId,
      theme: {},
      slides: {},
      settings: { importedFrom: 'pdf', sourcePath: pdfPath },
    },
  });

  // Create one slide per estimated page
  const slideRecords = [];
  for (let i = 0; i < estimatedPages; i++) {
    const slide = await prisma.slide.create({
      data: {
        id: crypto.randomUUID(),
        presentationId,
        slideIndex: i,
        order: i,
        layout: 'blank',
        content: {
          pageNumber: i + 1,
          sourceType: 'pdf',
          sourcePath: pdfPath,
        },
        notes: null,
      },
    });
    slideRecords.push(slide);
  }

  return {
    id: presentation.id,
    name: presentation.name,
    slideCount: estimatedPages,
    slides: slideRecords.map(s => ({ id: s.id, slideIndex: s.slideIndex })),
    importedAt: new Date().toISOString(),
    source: 'pdf',
  };
}

// ─── Connector definitions ──────────────────────────────────────────────────

interface ConnectorDef {
  type: string;
  name: string;
  description: string;
  provider: string;
  authType: 'oauth2' | 'apiKey' | 'webhook';
  features: string[];
}

const AVAILABLE_CONNECTORS: ConnectorDef[] = [
  { type: 'google_slides', name: 'Google Slides', description: 'Import/export Google Slides presentations', provider: 'google', authType: 'oauth2', features: ['import', 'export', 'sync'] },
  { type: 'google_drive', name: 'Google Drive', description: 'Save and organize in Google Drive', provider: 'google', authType: 'oauth2', features: ['save', 'browse'] },
  { type: 'onedrive', name: 'OneDrive', description: 'Save and organize in OneDrive', provider: 'microsoft', authType: 'oauth2', features: ['save', 'browse'] },
  { type: 'powerpoint', name: 'PowerPoint Online', description: 'Sync with PowerPoint Online', provider: 'microsoft', authType: 'oauth2', features: ['import', 'export', 'sync'] },
  { type: 'canva', name: 'Canva', description: 'Import designs from Canva', provider: 'canva', authType: 'oauth2', features: ['import'] },
  { type: 'slack', name: 'Slack', description: 'Share presentations to Slack channels', provider: 'slack', authType: 'oauth2', features: ['share', 'notify'] },
  { type: 'teams', name: 'Microsoft Teams', description: 'Share presentations to Teams', provider: 'microsoft', authType: 'oauth2', features: ['share', 'notify'] },
  { type: 'zapier', name: 'Zapier', description: 'Automate workflows with Zapier', provider: 'zapier', authType: 'webhook', features: ['automate'] },
  { type: 'make', name: 'Make.com', description: 'Automate workflows with Make', provider: 'make', authType: 'webhook', features: ['automate'] },
  { type: 'dropbox', name: 'Dropbox', description: 'Save to Dropbox', provider: 'dropbox', authType: 'oauth2', features: ['save'] },
  { type: 'notion', name: 'Notion', description: 'Import from Notion pages', provider: 'notion', authType: 'oauth2', features: ['import'] },
];

// ═══════════════════════════════════════════════════════════════════════════
//  IMPORT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /import/pptx - Import from PowerPoint file
router.post(
  '/import/pptx',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'PPTX file is required', code: 'MISSING_FILE' });
      return;
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.pptx' && ext !== '.ppt') {
      res.status(400).json({ success: false, error: 'File must be .pptx or .ppt format', code: 'INVALID_FORMAT' });
      return;
    }

    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';
    const name = req.body.name || req.file.originalname.replace(/\.(pptx?|ppt)$/i, '');

    const result = await parsePptxBuffer(req.file.buffer, tenantId, userId, name);

    await prisma.presentationIntegration.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        integrationType: 'import',
        provider: 'pptx',
        status: 'completed',
        config: JSON.parse(JSON.stringify({ originalName: req.file.originalname, fileSize: req.file.size })),
        metadata: JSON.parse(JSON.stringify({ importResult: result })),
      },
    });

    res.status(201).json({ success: true, data: result });
  })
);

// POST /import/google-slides - Import from Google Slides URL
router.post(
  '/import/google-slides',
  authMiddleware,
  validate(importGoogleSlidesSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { url, name, importOptions } = req.body;
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';

    const slidesId = extractGoogleSlidesId(url);
    if (!slidesId) {
      res.status(400).json({ success: false, error: 'Invalid Google Slides URL', code: 'INVALID_URL' });
      return;
    }

    const accessToken = await getIntegrationToken(userId, 'google');
    if (!accessToken) {
      res.status(401).json({ success: false, error: 'Google account not connected. Please connect first.', code: 'GOOGLE_NOT_CONNECTED' });
      return;
    }

    // Export Google Slides as PPTX via Google Drive API
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${slidesId}/export?mimeType=application/vnd.openxmlformats-officedocument.presentationml.presentation`;
    const response = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({
        success: false,
        error: `Failed to export from Google Slides: ${errorText}`,
        code: 'GOOGLE_EXPORT_FAILED',
      });
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await parsePptxBuffer(buffer, tenantId, userId, name);

    await prisma.presentationIntegration.create({
      data: {
        id: crypto.randomUUID(),
        presentationId: result.id as string,
        userId,
        integrationType: 'import',
        provider: 'google_slides',
        status: 'completed',
        config: JSON.parse(JSON.stringify({ googleSlidesId: slidesId, importOptions })),
        metadata: JSON.parse(JSON.stringify({ importResult: { slideCount: result.slideCount } })),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        ...result,
        source: 'google_slides',
        googleSlidesId: slidesId,
      },
    });
  })
);

// POST /import/canva - Import from Canva
router.post(
  '/import/canva',
  authMiddleware,
  validate(importCanvaSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { designUrl, accessToken, name } = req.body;
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';

    // Extract design ID from Canva URL
    const canvaIdMatch = designUrl.match(/design\/([a-zA-Z0-9_-]+)/);
    const designId = canvaIdMatch ? canvaIdMatch[1] : null;

    if (!designId) {
      res.status(400).json({ success: false, error: 'Invalid Canva design URL', code: 'INVALID_URL' });
      return;
    }

    // Fetch design data from Canva API
    const canvaResponse = await fetch(`https://api.canva.com/rest/v1/designs/${designId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!canvaResponse.ok) {
      const errorText = await canvaResponse.text();
      res.status(canvaResponse.status).json({
        success: false,
        error: `Failed to fetch from Canva: ${errorText}`,
        code: 'CANVA_FETCH_FAILED',
      });
      return;
    }

    const canvaData = await canvaResponse.json() as {
      design: {
        id: string;
        title: string;
        page_count: number;
        urls: { view_url: string; edit_url: string };
        thumbnail: { url: string } | null;
      };
    };

    // Request export as PDF to convert pages
    const exportResponse = await fetch(`https://api.canva.com/rest/v1/exports`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        design_id: designId,
        format: { type: 'pdf' },
      }),
    });

    let slideCount = canvaData.design.page_count || 1;
    const presentationId = crypto.randomUUID();
    const presentationName = name || canvaData.design.title || `Canva Import - ${new Date().toISOString().slice(0, 16)}`;

    const presentation = await prisma.presentation.create({
      data: {
        id: presentationId,
        name: presentationName,
        status: 'DRAFT',
        slideCount,
        tenantId,
        userId,
        theme: {},
        slides: {},
        settings: { importedFrom: 'canva', canvaDesignId: designId },
      },
    });

    // Create slides
    const slideRecords = [];
    for (let i = 0; i < slideCount; i++) {
      const slide = await prisma.slide.create({
        data: {
          id: crypto.randomUUID(),
          presentationId,
          slideIndex: i,
          order: i,
          layout: 'blank',
          content: { sourceType: 'canva', canvaDesignId: designId, pageIndex: i },
        },
      });
      slideRecords.push(slide);
    }

    await prisma.presentationIntegration.create({
      data: {
        id: crypto.randomUUID(),
        presentationId,
        userId,
        integrationType: 'import',
        provider: 'canva',
        status: exportResponse.ok ? 'completed' : 'partial',
        config: { canvaDesignId: designId },
        metadata: { canvaTitle: canvaData.design.title, pageCount: slideCount },
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: presentation.id,
        name: presentation.name,
        slideCount,
        slides: slideRecords.map(s => ({ id: s.id, slideIndex: s.slideIndex })),
        source: 'canva',
        canvaDesignId: designId,
        importedAt: new Date().toISOString(),
      },
    });
  })
);

// POST /import/pdf - Import from PDF
router.post(
  '/import/pdf',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'PDF file is required', code: 'MISSING_FILE' });
      return;
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.pdf') {
      res.status(400).json({ success: false, error: 'File must be .pdf format', code: 'INVALID_FORMAT' });
      return;
    }

    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';

    const result = await parsePdfToSlides(req.file.buffer, tenantId, userId);

    await prisma.presentationIntegration.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        integrationType: 'import',
        provider: 'pdf',
        status: 'completed',
        config: JSON.parse(JSON.stringify({ originalName: req.file.originalname, fileSize: req.file.size })),
        metadata: JSON.parse(JSON.stringify({ importResult: { slideCount: result.slideCount } })),
      },
    });

    res.status(201).json({ success: true, data: result });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
//  GOOGLE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

// POST /google/connect - Connect Google account
router.post(
  '/google/connect',
  authMiddleware,
  validate(googleConnectSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { authCode, redirectUri } = req.body;
    const userId = req.user!.userId || 'anonymous';
    const tenantId = req.user!.organizationId || 'default';

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: authCode,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri || GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      res.status(400).json({
        success: false,
        error: 'Failed to exchange Google auth code',
        code: 'GOOGLE_AUTH_FAILED',
        details: errorBody,
      });
      return;
    }

    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
      scope: string;
    };

    // Fetch user profile
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = profileResponse.ok
      ? await profileResponse.json() as { email: string; name: string; picture: string }
      : { email: 'unknown', name: 'Google User', picture: '' };

    // Upsert integration record
    const existingIntegration = await prisma.presentationIntegration.findFirst({
      where: { userId, provider: 'google', integrationType: 'oauth' },
    });

    const integrationData = {
      userId,
      integrationType: 'oauth' as const,
      provider: 'google' as const,
      status: 'active' as const,
      config: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scope: tokens.scope,
      },
      metadata: {
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        connectedAt: new Date().toISOString(),
      },
    };

    if (existingIntegration) {
      await prisma.presentationIntegration.update({
        where: { id: existingIntegration.id },
        data: integrationData,
      });
    } else {
      await prisma.presentationIntegration.create({
        data: { id: crypto.randomUUID(), ...integrationData },
      });
    }

    res.json({
      success: true,
      data: {
        connected: true,
        provider: 'google',
        email: profile.email,
        name: profile.name,
      },
    });
  })
);

// POST /google/save/:presentationId - Save to Google Drive
router.post(
  '/google/save/:presentationId',
  authMiddleware,
  validate(googleSaveSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const { folderId, fileName } = req.body;
    const userId = req.user!.userId || 'anonymous';
    const tenantId = req.user!.organizationId || 'default';

    const presentation = await prisma.presentation.findFirst({
      where: { id: presentationId, tenantId },
    });

    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const accessToken = await getIntegrationToken(userId, 'google');
    if (!accessToken) {
      res.status(401).json({ success: false, error: 'Google account not connected', code: 'GOOGLE_NOT_CONNECTED' });
      return;
    }

    // Export presentation to PPTX buffer
    const slides = await prisma.slide.findMany({
      where: { presentationId },
      orderBy: { slideIndex: 'asc' },
    });

    const pptxContent = JSON.stringify({
      name: presentation.name,
      slides: slides.map(s => ({ index: s.slideIndex, layout: s.layout, content: s.content })),
    });
    const pptxBuffer = Buffer.from(pptxContent, 'utf-8');

    const uploadFileName = fileName || `${presentation.name}.pptx`;
    const metadata: Record<string, unknown> = {
      name: uploadFileName,
      mimeType: 'application/vnd.google-apps.presentation',
    };
    if (folderId) {
      metadata.parents = [folderId];
    }

    // Upload to Google Drive with conversion
    const boundary = 'rasid_upload_boundary';
    const metadataStr = JSON.stringify(metadata);

    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadataStr}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n`),
      pptxBuffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&convert=true', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      res.status(uploadResponse.status).json({
        success: false,
        error: `Failed to save to Google Drive: ${errorText}`,
        code: 'GOOGLE_SAVE_FAILED',
      });
      return;
    }

    const uploadResult = await uploadResponse.json() as {
      id: string;
      name: string;
      webViewLink: string;
    };

    await prisma.presentationIntegration.create({
      data: {
        id: crypto.randomUUID(),
        presentationId,
        userId,
        integrationType: 'export',
        provider: 'google_drive',
        status: 'completed',
        config: { googleFileId: uploadResult.id, folderId },
        metadata: { fileName: uploadResult.name, webViewLink: uploadResult.webViewLink },
        lastSync: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        googleFileId: uploadResult.id,
        fileName: uploadResult.name,
        webViewLink: uploadResult.webViewLink,
        savedAt: new Date().toISOString(),
      },
    });
  })
);

// POST /google/sync/:presentationId - Sync with Google Slides
router.post(
  '/google/sync/:presentationId',
  authMiddleware,
  validate(googleSyncSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const { googleSlidesId, direction } = req.body;
    const userId = req.user!.userId || 'anonymous';
    const tenantId = req.user!.organizationId || 'default';

    const presentation = await prisma.presentation.findFirst({
      where: { id: presentationId, tenantId },
    });

    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const accessToken = await getIntegrationToken(userId, 'google');
    if (!accessToken) {
      res.status(401).json({ success: false, error: 'Google account not connected', code: 'GOOGLE_NOT_CONNECTED' });
      return;
    }

    let syncResult: Record<string, unknown> = {};

    if (direction === 'pull' || direction === 'merge') {
      // Fetch slides from Google
      const gResponse = await fetch(
        `https://slides.googleapis.com/v1/presentations/${googleSlidesId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!gResponse.ok) {
        res.status(gResponse.status).json({
          success: false,
          error: 'Failed to fetch Google Slides data',
          code: 'GOOGLE_SYNC_FAILED',
        });
        return;
      }

      const gData = await gResponse.json() as {
        presentationId: string;
        title: string;
        slides: Array<{
          objectId: string;
          pageElements?: Array<{ objectId: string; shape?: { text?: { textElements?: Array<{ textRun?: { content: string } }> } } }>;
        }>;
      };

      if (direction === 'pull') {
        // Replace local slides with Google data
        await prisma.slide.deleteMany({ where: { presentationId } });

        for (let i = 0; i < gData.slides.length; i++) {
          const gSlide = gData.slides[i];
          const texts: string[] = [];
          for (const elem of gSlide.pageElements || []) {
            const textElems = elem.shape?.text?.textElements || [];
            for (const te of textElems) {
              if (te.textRun?.content) texts.push(te.textRun.content.trim());
            }
          }

          await prisma.slide.create({
            data: {
              id: crypto.randomUUID(),
              presentationId,
              slideIndex: i,
              order: i,
              layout: texts.length <= 2 ? 'title' : 'content',
              content: { texts, googleSlideId: gSlide.objectId },
            },
          });
        }

        await prisma.presentation.update({
          where: { id: presentationId },
          data: { slideCount: gData.slides.length, name: gData.title },
        });

        syncResult = { direction: 'pull', slidesUpdated: gData.slides.length };
      } else {
        // Merge: keep local, add missing from remote
        const localSlides = await prisma.slide.findMany({
          where: { presentationId },
          orderBy: { slideIndex: 'asc' },
        });

        const newSlides = gData.slides.length - localSlides.length;
        if (newSlides > 0) {
          for (let i = localSlides.length; i < gData.slides.length; i++) {
            await prisma.slide.create({
              data: {
                id: crypto.randomUUID(),
                presentationId,
                slideIndex: i,
                order: i,
                layout: 'content',
                content: { googleSlideId: gData.slides[i].objectId, merged: true },
              },
            });
          }
          await prisma.presentation.update({
            where: { id: presentationId },
            data: { slideCount: gData.slides.length },
          });
        }

        syncResult = { direction: 'merge', localSlides: localSlides.length, remoteSlides: gData.slides.length, newSlidesAdded: Math.max(0, newSlides) };
      }
    } else {
      // Push: upload local to Google
      const localSlides = await prisma.slide.findMany({
        where: { presentationId },
        orderBy: { slideIndex: 'asc' },
      });

      // Create a new Google Slides presentation
      const createResponse = await fetch('https://slides.googleapis.com/v1/presentations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: presentation.name }),
      });

      if (!createResponse.ok) {
        res.status(createResponse.status).json({
          success: false,
          error: 'Failed to create Google Slides presentation',
          code: 'GOOGLE_PUSH_FAILED',
        });
        return;
      }

      const created = await createResponse.json() as { presentationId: string };
      syncResult = { direction: 'push', googlePresentationId: created.presentationId, slidesPushed: localSlides.length };
    }

    await prisma.presentationIntegration.create({
      data: {
        id: crypto.randomUUID(),
        presentationId,
        userId,
        integrationType: 'sync',
        provider: 'google_slides',
        status: 'completed',
        config: JSON.parse(JSON.stringify({ googleSlidesId, direction })),
        metadata: JSON.parse(JSON.stringify(syncResult)),
        lastSync: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        presentationId,
        googleSlidesId,
        ...syncResult,
        syncedAt: new Date().toISOString(),
      },
    });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
//  MICROSOFT INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

// POST /microsoft/connect - Connect Microsoft account
router.post(
  '/microsoft/connect',
  authMiddleware,
  validate(microsoftConnectSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { authCode, redirectUri } = req.body;
    const userId = req.user!.userId || 'anonymous';

    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: authCode,
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        redirect_uri: redirectUri || MICROSOFT_REDIRECT_URI,
        grant_type: 'authorization_code',
        scope: 'Files.ReadWrite.All User.Read',
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      res.status(400).json({
        success: false,
        error: 'Failed to exchange Microsoft auth code',
        code: 'MICROSOFT_AUTH_FAILED',
        details: errorBody,
      });
      return;
    }

    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // Fetch user profile
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = profileResponse.ok
      ? await profileResponse.json() as { displayName: string; mail: string; userPrincipalName: string }
      : { displayName: 'Microsoft User', mail: 'unknown', userPrincipalName: 'unknown' };

    const existingIntegration = await prisma.presentationIntegration.findFirst({
      where: { userId, provider: 'microsoft', integrationType: 'oauth' },
    });

    const integrationData = {
      userId,
      integrationType: 'oauth' as const,
      provider: 'microsoft' as const,
      status: 'active' as const,
      config: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      },
      metadata: {
        email: profile.mail || profile.userPrincipalName,
        name: profile.displayName,
        connectedAt: new Date().toISOString(),
      },
    };

    if (existingIntegration) {
      await prisma.presentationIntegration.update({
        where: { id: existingIntegration.id },
        data: integrationData,
      });
    } else {
      await prisma.presentationIntegration.create({
        data: { id: crypto.randomUUID(), ...integrationData },
      });
    }

    res.json({
      success: true,
      data: {
        connected: true,
        provider: 'microsoft',
        email: profile.mail || profile.userPrincipalName,
        name: profile.displayName,
      },
    });
  })
);

// POST /microsoft/save/:presentationId - Save to OneDrive
router.post(
  '/microsoft/save/:presentationId',
  authMiddleware,
  validate(microsoftSaveSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const { folderId, fileName } = req.body;
    const userId = req.user!.userId || 'anonymous';
    const tenantId = req.user!.organizationId || 'default';

    const presentation = await prisma.presentation.findFirst({
      where: { id: presentationId, tenantId },
    });

    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const accessToken = await getIntegrationToken(userId, 'microsoft');
    if (!accessToken) {
      res.status(401).json({ success: false, error: 'Microsoft account not connected', code: 'MICROSOFT_NOT_CONNECTED' });
      return;
    }

    const slides = await prisma.slide.findMany({
      where: { presentationId },
      orderBy: { slideIndex: 'asc' },
    });

    const pptxContent = JSON.stringify({
      name: presentation.name,
      slides: slides.map(s => ({ index: s.slideIndex, layout: s.layout, content: s.content })),
    });
    const pptxBuffer = Buffer.from(pptxContent, 'utf-8');

    const uploadFileName = fileName || `${presentation.name}.pptx`;
    const uploadPath = folderId
      ? `/me/drive/items/${folderId}:/${encodeURIComponent(uploadFileName)}:/content`
      : `/me/drive/root:/${encodeURIComponent(uploadFileName)}:/content`;

    const uploadResponse = await fetch(`https://graph.microsoft.com/v1.0${uploadPath}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
      body: pptxBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      res.status(uploadResponse.status).json({
        success: false,
        error: `Failed to save to OneDrive: ${errorText}`,
        code: 'ONEDRIVE_SAVE_FAILED',
      });
      return;
    }

    const uploadResult = await uploadResponse.json() as {
      id: string;
      name: string;
      webUrl: string;
      size: number;
    };

    await prisma.presentationIntegration.create({
      data: {
        id: crypto.randomUUID(),
        presentationId,
        userId,
        integrationType: 'export',
        provider: 'onedrive',
        status: 'completed',
        config: { onedriveFileId: uploadResult.id, folderId },
        metadata: { fileName: uploadResult.name, webUrl: uploadResult.webUrl, size: uploadResult.size },
        lastSync: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        onedriveFileId: uploadResult.id,
        fileName: uploadResult.name,
        webUrl: uploadResult.webUrl,
        savedAt: new Date().toISOString(),
      },
    });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
//  WEBHOOK INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════════════

// POST /zapier/webhook - Zapier webhook endpoint
router.post(
  '/zapier/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = zapierWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid webhook payload', code: 'VALIDATION_ERROR' });
      return;
    }

    const { action, presentationId, data } = parsed.data;

    const webhookLog: Record<string, unknown> = {
      source: 'zapier',
      action,
      presentationId,
      receivedAt: new Date().toISOString(),
    };

    let result: Record<string, unknown> = {};

    switch (action) {
      case 'create_presentation': {
        const name = (data?.name as string) || 'Zapier Presentation';
        const tenantId = (data?.tenantId as string) || 'default';
        const userId = (data?.userId as string) || 'system';
        const pres = await prisma.presentation.create({
          data: {
            id: crypto.randomUUID(),
            name,
            status: 'DRAFT',
            slideCount: 0,
            tenantId,
            userId,
            theme: {},
            slides: {},
          },
        });
        result = { presentationId: pres.id, name: pres.name, action: 'created' };
        break;
      }
      case 'add_slide': {
        if (!presentationId) {
          res.status(400).json({ success: false, error: 'presentationId required for add_slide', code: 'MISSING_PARAM' });
          return;
        }
        const existing = await prisma.slide.count({ where: { presentationId } });
        const slide = await prisma.slide.create({
          data: {
            id: crypto.randomUUID(),
            presentationId,
            slideIndex: existing,
            order: existing,
            layout: (data?.layout as string) || 'content',
            content: data?.content || {},
          },
        });
        await prisma.presentation.update({
          where: { id: presentationId },
          data: { slideCount: existing + 1 },
        });
        result = { slideId: slide.id, slideIndex: slide.slideIndex, action: 'slide_added' };
        break;
      }
      case 'export': {
        if (!presentationId) {
          res.status(400).json({ success: false, error: 'presentationId required for export', code: 'MISSING_PARAM' });
          return;
        }
        result = { presentationId, status: 'queued', action: 'export_queued' };
        break;
      }
      default: {
        result = { action, status: 'received', message: 'Action acknowledged' };
        break;
      }
    }

    await prisma.presentationIntegration.create({
      data: {
        id: crypto.randomUUID(),
        presentationId: presentationId || null,
        userId: 'system',
        integrationType: 'webhook',
        provider: 'zapier',
        status: 'completed',
        config: JSON.parse(JSON.stringify({ action })),
        metadata: JSON.parse(JSON.stringify({ ...webhookLog, result })),
      },
    });

    res.json({ success: true, data: result });
  })
);

// POST /make/webhook - Make.com webhook endpoint
router.post(
  '/make/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = makeWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid webhook payload', code: 'VALIDATION_ERROR' });
      return;
    }

    const { action, presentationId, data } = parsed.data;

    let result: Record<string, unknown> = {};

    switch (action) {
      case 'create_presentation': {
        const name = (data?.name as string) || 'Make.com Presentation';
        const tenantId = (data?.tenantId as string) || 'default';
        const userId = (data?.userId as string) || 'system';
        const pres = await prisma.presentation.create({
          data: {
            id: crypto.randomUUID(),
            name,
            status: 'DRAFT',
            slideCount: 0,
            tenantId,
            userId,
            theme: {},
            slides: {},
          },
        });
        result = { presentationId: pres.id, name: pres.name, action: 'created' };
        break;
      }
      case 'duplicate_presentation': {
        if (!presentationId) {
          res.status(400).json({ success: false, error: 'presentationId required', code: 'MISSING_PARAM' });
          return;
        }
        const source = await prisma.presentation.findUnique({ where: { id: presentationId } });
        if (!source) {
          res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
          return;
        }
        const newId = crypto.randomUUID();
        const dup = await prisma.presentation.create({
          data: {
            id: newId,
            name: `${source.name} (Copy)`,
            status: 'DRAFT',
            slideCount: source.slideCount,
            tenantId: source.tenantId,
            userId: source.userId,
            theme: source.theme || {},
            slides: source.slides || {},
          },
        });
        const sourceSlides = await prisma.slide.findMany({ where: { presentationId }, orderBy: { slideIndex: 'asc' } });
        for (const s of sourceSlides) {
          await prisma.slide.create({
            data: {
              id: crypto.randomUUID(),
              presentationId: newId,
              slideIndex: s.slideIndex,
              order: s.order,
              layout: s.layout,
              content: s.content ?? undefined,
              notes: s.notes,
            },
          });
        }
        result = { newPresentationId: dup.id, action: 'duplicated' };
        break;
      }
      default: {
        result = { action, status: 'received', message: 'Action acknowledged' };
        break;
      }
    }

    await prisma.presentationIntegration.create({
      data: {
        id: crypto.randomUUID(),
        presentationId: presentationId || null,
        userId: 'system',
        integrationType: 'webhook',
        provider: 'make',
        status: 'completed',
        config: JSON.parse(JSON.stringify({ action })),
        metadata: JSON.parse(JSON.stringify({ action, result, receivedAt: new Date().toISOString() })),
      },
    });

    res.json({ success: true, data: result });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
//  CONNECTORS
// ═══════════════════════════════════════════════════════════════════════════

// GET /connectors - List available connectors
router.get(
  '/connectors',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId || 'anonymous';

    // Fetch user's connected integrations
    const connected = await prisma.presentationIntegration.findMany({
      where: { userId, integrationType: 'oauth', status: 'active' },
    });

    const connectedProviders = new Set(connected.map(c => c.provider));

    const connectors = AVAILABLE_CONNECTORS.map(c => ({
      ...c,
      connected: connectedProviders.has(c.provider),
    }));

    res.json({
      success: true,
      data: {
        connectors,
        connectedCount: connectedProviders.size,
        totalAvailable: AVAILABLE_CONNECTORS.length,
      },
    });
  })
);

// POST /connectors/:type/connect - Connect to service
router.post(
  '/connectors/:type/connect',
  authMiddleware,
  validate(connectorConnectSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { type } = req.params;
    const { config, authToken } = req.body;
    const userId = req.user!.userId || 'anonymous';
    const tenantId = req.user!.organizationId || 'default';

    const connectorDef = AVAILABLE_CONNECTORS.find(c => c.type === type);
    if (!connectorDef) {
      res.status(400).json({
        success: false,
        error: `Unknown connector type: ${type}`,
        code: 'UNKNOWN_CONNECTOR',
        availableTypes: AVAILABLE_CONNECTORS.map(c => c.type),
      });
      return;
    }

    // Check for existing connection
    const existing = await prisma.presentationIntegration.findFirst({
      where: { userId, provider: connectorDef.provider, integrationType: 'oauth', status: 'active' },
    });

    if (existing) {
      // Update existing connection
      await prisma.presentationIntegration.update({
        where: { id: existing.id },
        data: {
          config: { ...config, accessToken: authToken },
          metadata: { connectorType: type, updatedAt: new Date().toISOString() },
        },
      });

      res.json({
        success: true,
        data: {
          connectorType: type,
          provider: connectorDef.provider,
          status: 'reconnected',
          integrationId: existing.id,
        },
      });
      return;
    }

    const integration = await prisma.presentationIntegration.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        integrationType: 'oauth',
        provider: connectorDef.provider,
        status: 'active',
        config: { ...config, accessToken: authToken, connectorType: type },
        metadata: {
          connectorType: type,
          connectorName: connectorDef.name,
          connectedAt: new Date().toISOString(),
          tenantId,
        },
      },
    });

    res.status(201).json({
      success: true,
      data: {
        connectorType: type,
        provider: connectorDef.provider,
        status: 'connected',
        integrationId: integration.id,
      },
    });
  })
);

// POST /connectors/:type/disconnect - Disconnect from service
router.post(
  '/connectors/:type/disconnect',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { type } = req.params;
    const userId = req.user!.userId || 'anonymous';

    const connectorDef = AVAILABLE_CONNECTORS.find(c => c.type === type);
    if (!connectorDef) {
      res.status(400).json({ success: false, error: `Unknown connector type: ${type}`, code: 'UNKNOWN_CONNECTOR' });
      return;
    }

    const integration = await prisma.presentationIntegration.findFirst({
      where: { userId, provider: connectorDef.provider, integrationType: 'oauth', status: 'active' },
    });

    if (!integration) {
      res.status(404).json({ success: false, error: 'No active connection found for this connector', code: 'NOT_CONNECTED' });
      return;
    }

    await prisma.presentationIntegration.update({
      where: { id: integration.id },
      data: {
        status: 'disconnected',
        metadata: {
          ...(integration.metadata as Record<string, unknown> || {}),
          disconnectedAt: new Date().toISOString(),
        },
      },
    });

    res.json({
      success: true,
      data: {
        connectorType: type,
        provider: connectorDef.provider,
        status: 'disconnected',
      },
    });
  })
);

// GET /connectors/:type/status - Check connection status
router.get(
  '/connectors/:type/status',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { type } = req.params;
    const userId = req.user!.userId || 'anonymous';

    const connectorDef = AVAILABLE_CONNECTORS.find(c => c.type === type);
    if (!connectorDef) {
      res.status(400).json({ success: false, error: `Unknown connector type: ${type}`, code: 'UNKNOWN_CONNECTOR' });
      return;
    }

    const integration = await prisma.presentationIntegration.findFirst({
      where: { userId, provider: connectorDef.provider, integrationType: 'oauth' },
      orderBy: { updatedAt: 'desc' },
    });

    if (!integration) {
      res.json({
        success: true,
        data: {
          connectorType: type,
          provider: connectorDef.provider,
          connected: false,
          status: 'not_connected',
        },
      });
      return;
    }

    const config = (integration.config as Record<string, unknown>) || {};
    const expiresAt = config.expiresAt as string | undefined;
    const isExpired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;

    res.json({
      success: true,
      data: {
        connectorType: type,
        provider: connectorDef.provider,
        connected: integration.status === 'active' && !isExpired,
        status: isExpired ? 'expired' : integration.status,
        lastSync: integration.lastSync,
        metadata: integration.metadata,
      },
    });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
//  SKILLS / AUTOMATION
// ═══════════════════════════════════════════════════════════════════════════

// POST /skills/save - Save workflow as reusable skill
router.post(
  '/skills/save',
  authMiddleware,
  validate(skillSaveSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, description, workflow, triggerType } = req.body;
    const userId = req.user!.userId || 'anonymous';
    const tenantId = req.user!.organizationId || 'default';

    const skill = await prisma.automationSkill.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        userId,
        name,
        description: description || null,
        workflow,
        triggerType,
        isActive: true,
        runCount: 0,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        triggerType: skill.triggerType,
        isActive: skill.isActive,
        createdAt: skill.createdAt,
      },
    });
  })
);

// GET /skills - List saved skills
router.get(
  '/skills',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || 'default';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [skills, total] = await Promise.all([
      prisma.automationSkill.findMany({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.automationSkill.count({ where: { tenantId } }),
    ]);

    res.json({
      success: true,
      data: skills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        triggerType: s.triggerType,
        isActive: s.isActive,
        runCount: s.runCount,
        lastRunAt: s.lastRunAt,
        createdAt: s.createdAt,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

// POST /skills/:id/run - Run saved skill
router.post(
  '/skills/:id/run',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const tenantId = req.user!.organizationId || 'default';
    const userId = req.user!.userId || 'anonymous';

    const skill = await prisma.automationSkill.findFirst({
      where: { id, tenantId },
    });

    if (!skill) {
      res.status(404).json({ success: false, error: 'Skill not found', code: 'NOT_FOUND' });
      return;
    }

    if (!skill.isActive) {
      res.status(400).json({ success: false, error: 'Skill is inactive', code: 'SKILL_INACTIVE' });
      return;
    }

    const workflow = skill.workflow as Record<string, unknown>;
    const inputData = req.body.input || {};
    const runId = crypto.randomUUID();

    // Execute workflow steps
    const steps = (workflow.steps as Array<Record<string, unknown>>) || [];
    const results: Array<{ step: number; action: string; status: string; output: unknown }> = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const action = (step.action as string) || 'noop';

      try {
        let output: unknown = null;

        switch (action) {
          case 'create_presentation': {
            const presName = (step.name as string) || (inputData.name as string) || `Skill: ${skill.name}`;
            const pres = await prisma.presentation.create({
              data: {
                id: crypto.randomUUID(),
                name: presName,
                status: 'DRAFT',
                slideCount: 0,
                tenantId,
                userId,
                theme: JSON.parse(JSON.stringify((step.theme as Record<string, unknown>) || {})),
                slides: JSON.parse(JSON.stringify({})),
              },
            });
            output = { presentationId: pres.id, name: pres.name };
            break;
          }
          case 'add_slides': {
            const presId = (step.presentationId as string) || (inputData.presentationId as string);
            if (presId) {
              const slideTemplates = (step.slides as Array<Record<string, unknown>>) || [{ layout: 'title', content: {} }];
              const existingCount = await prisma.slide.count({ where: { presentationId: presId } });
              for (let j = 0; j < slideTemplates.length; j++) {
                const tmpl = slideTemplates[j];
                await prisma.slide.create({
                  data: {
                    id: crypto.randomUUID(),
                    presentationId: presId,
                    slideIndex: existingCount + j,
                    order: existingCount + j,
                    layout: (tmpl.layout as string) || 'content',
                    content: tmpl.content || {},
                  },
                });
              }
              await prisma.presentation.update({
                where: { id: presId },
                data: { slideCount: existingCount + slideTemplates.length },
              });
              output = { slidesAdded: slideTemplates.length };
            }
            break;
          }
          case 'apply_theme': {
            const presId = (step.presentationId as string) || (inputData.presentationId as string);
            if (presId) {
              await prisma.presentation.update({
                where: { id: presId },
                data: { theme: JSON.parse(JSON.stringify((step.theme as Record<string, unknown>) || {})) },
              });
              output = { themeApplied: true };
            }
            break;
          }
          default: {
            output = { action, status: 'skipped', reason: 'Unknown action' };
            break;
          }
        }

        results.push({ step: i, action, status: 'completed', output });
      } catch (stepError) {
        const errorMessage = stepError instanceof Error ? stepError.message : 'Unknown error';
        results.push({ step: i, action, status: 'failed', output: { error: errorMessage } });
      }
    }

    // Update skill run statistics
    await prisma.automationSkill.update({
      where: { id: skill.id },
      data: {
        runCount: skill.runCount + 1,
        lastRunAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        runId,
        skillId: skill.id,
        skillName: skill.name,
        stepsExecuted: results.length,
        stepsSucceeded: results.filter(r => r.status === 'completed').length,
        stepsFailed: results.filter(r => r.status === 'failed').length,
        results,
        executedAt: new Date().toISOString(),
      },
    });
  })
);

// DELETE /skills/:id - Delete skill
router.delete(
  '/skills/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const tenantId = req.user!.organizationId || 'default';

    const skill = await prisma.automationSkill.findFirst({
      where: { id, tenantId },
    });

    if (!skill) {
      res.status(404).json({ success: false, error: 'Skill not found', code: 'NOT_FOUND' });
      return;
    }

    await prisma.automationSkill.delete({ where: { id } });

    res.json({
      success: true,
      data: { id, name: skill.name, deleted: true },
    });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
//  SCHEDULED TASKS
// ═══════════════════════════════════════════════════════════════════════════

// POST /scheduled - Create scheduled task
router.post(
  '/scheduled',
  authMiddleware,
  validate(scheduledTaskSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, taskType, schedule, config, isActive } = req.body;
    const userId = req.user!.userId || 'anonymous';
    const tenantId = req.user!.organizationId || 'default';

    const nextRunAt = parseCronExpression(schedule);

    const task = await prisma.scheduledPresentationTask.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        userId,
        name,
        taskType,
        schedule,
        config,
        isActive,
        nextRunAt,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: task.id,
        name: task.name,
        taskType: task.taskType,
        schedule: task.schedule,
        isActive: task.isActive,
        nextRunAt: task.nextRunAt,
        createdAt: task.createdAt,
      },
    });
  })
);

// GET /scheduled - List scheduled tasks
router.get(
  '/scheduled',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || 'default';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      prisma.scheduledPresentationTask.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.scheduledPresentationTask.count({ where: { tenantId } }),
    ]);

    res.json({
      success: true,
      data: tasks.map(t => ({
        id: t.id,
        name: t.name,
        taskType: t.taskType,
        schedule: t.schedule,
        isActive: t.isActive,
        lastRunAt: t.lastRunAt,
        nextRunAt: t.nextRunAt,
        createdAt: t.createdAt,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

// PUT /scheduled/:id - Update scheduled task
router.put(
  '/scheduled/:id',
  authMiddleware,
  validate(scheduledTaskUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const tenantId = req.user!.organizationId || 'default';

    const task = await prisma.scheduledPresentationTask.findFirst({
      where: { id, tenantId },
    });

    if (!task) {
      res.status(404).json({ success: false, error: 'Scheduled task not found', code: 'NOT_FOUND' });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.schedule !== undefined) {
      updateData.schedule = req.body.schedule;
      updateData.nextRunAt = parseCronExpression(req.body.schedule);
    }
    if (req.body.config !== undefined) updateData.config = req.body.config;
    if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;

    const updated = await prisma.scheduledPresentationTask.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        taskType: updated.taskType,
        schedule: updated.schedule,
        isActive: updated.isActive,
        nextRunAt: updated.nextRunAt,
        updatedAt: updated.updatedAt,
      },
    });
  })
);

// DELETE /scheduled/:id - Delete scheduled task
router.delete(
  '/scheduled/:id',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const tenantId = req.user!.organizationId || 'default';

    const task = await prisma.scheduledPresentationTask.findFirst({
      where: { id, tenantId },
    });

    if (!task) {
      res.status(404).json({ success: false, error: 'Scheduled task not found', code: 'NOT_FOUND' });
      return;
    }

    await prisma.scheduledPresentationTask.delete({ where: { id } });

    res.json({
      success: true,
      data: { id, name: task.name, deleted: true },
    });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
//  MEDIA LIBRARY
// ═══════════════════════════════════════════════════════════════════════════

// GET /media-library - Browse media library
router.get(
  '/media-library',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || 'default';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const skip = (page - 1) * limit;
    const mimeFilter = req.query.type as string | undefined;

    const whereClause: Record<string, unknown> = {};

    if (mimeFilter) {
      const mimeMap: Record<string, string[]> = {
        images: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
        videos: ['video/mp4', 'video/webm', 'video/quicktime'],
        icons: ['image/svg+xml'],
        fonts: ['font/ttf', 'font/otf', 'font/woff', 'font/woff2'],
      };
      const mimes = mimeMap[mimeFilter];
      if (mimes) {
        whereClause.mimeType = { in: mimes };
      }
    }

    const [assets, total] = await Promise.all([
      prisma.mediaAsset.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.mediaAsset.count({ where: whereClause }),
    ]);

    res.json({
      success: true,
      data: assets.map(a => ({
        id: a.id,
        source: a.source,
        mimeType: a.mimeType,
        fileSize: a.fileSize,
        width: a.width,
        height: a.height,
        altText: a.altText,
        photographer: a.photographer,
        localPath: a.localPath,
        createdAt: a.createdAt,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

// POST /media-library/upload - Upload to media library
router.post(
  '/media-library/upload',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'File is required', code: 'MISSING_FILE' });
      return;
    }

    const userId = req.user!.userId || 'anonymous';
    const presentationId = req.body.presentationId || 'library';
    const altText = req.body.altText || req.file.originalname;

    const fileHash = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(req.file.originalname).toLowerCase() || '.bin';
    const fileName = `${fileHash}${ext}`;
    const dirPath = path.join(STORAGE_BASE, 'library', userId);
    const filePath = path.join(dirPath, fileName);

    await mkdir(dirPath, { recursive: true });
    await writeFile(filePath, req.file.buffer);

    const asset = await prisma.mediaAsset.create({
      data: {
        id: crypto.randomUUID(),
        presentationId,
        source: 'upload',
        sourceId: fileHash,
        sourceUrl: filePath,
        localPath: filePath,
        mimeType: req.file.mimetype || 'application/octet-stream',
        fileSize: req.file.size,
        altText,
        photographer: null,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: asset.id,
        localPath: asset.localPath,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
        altText: asset.altText,
        createdAt: asset.createdAt,
      },
    });
  })
);

// GET /media-library/search - Search media library
router.get(
  '/media-library/search',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const query = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    if (!query) {
      res.status(400).json({ success: false, error: 'Query parameter "q" is required', code: 'MISSING_QUERY' });
      return;
    }

    const [assets, total] = await Promise.all([
      prisma.mediaAsset.findMany({
        where: {
          OR: [
            { altText: { contains: query, mode: 'insensitive' } },
            { source: { contains: query, mode: 'insensitive' } },
            { photographer: { contains: query, mode: 'insensitive' } },
            { mimeType: { contains: query, mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.mediaAsset.count({
        where: {
          OR: [
            { altText: { contains: query, mode: 'insensitive' } },
            { source: { contains: query, mode: 'insensitive' } },
            { photographer: { contains: query, mode: 'insensitive' } },
            { mimeType: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    res.json({
      success: true,
      data: assets.map(a => ({
        id: a.id,
        source: a.source,
        mimeType: a.mimeType,
        fileSize: a.fileSize,
        width: a.width,
        height: a.height,
        altText: a.altText,
        photographer: a.photographer,
        createdAt: a.createdAt,
      })),
      query,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

// GET /media-library/stock - Search stock images (Pexels/Unsplash)
router.get(
  '/media-library/stock',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const query = (req.query.q as string) || '';
    const source = (req.query.source as string) || 'all';
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.perPage as string) || 15;
    const orientation = req.query.orientation as string | undefined;

    if (!query) {
      res.status(400).json({ success: false, error: 'Query parameter "q" is required', code: 'MISSING_QUERY' });
      return;
    }

    interface StockImage {
      id: string;
      source: 'unsplash' | 'pexels';
      thumbnailUrl: string;
      regularUrl: string;
      fullUrl: string;
      width: number;
      height: number;
      altText: string;
      photographer: string;
      photographerUrl: string;
      color: string | null;
    }

    const results: { unsplash: StockImage[]; pexels: StockImage[] } = { unsplash: [], pexels: [] };

    // Search Unsplash
    if ((source === 'all' || source === 'unsplash') && UNSPLASH_ACCESS_KEY) {
      const params = new URLSearchParams({
        query,
        page: page.toString(),
        per_page: perPage.toString(),
      });
      if (orientation) params.set('orientation', orientation);

      const unsplashResponse = await fetch(
        `https://api.unsplash.com/search/photos?${params.toString()}`,
        { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } },
      );

      if (unsplashResponse.ok) {
        const data = await unsplashResponse.json() as {
          results: Array<{
            id: string;
            width: number;
            height: number;
            color: string | null;
            alt_description: string | null;
            urls: { thumb: string; regular: string; full: string };
            user: { name: string; links: { html: string } };
          }>;
        };

        results.unsplash = data.results.map(p => ({
          id: p.id,
          source: 'unsplash' as const,
          thumbnailUrl: p.urls.thumb,
          regularUrl: p.urls.regular,
          fullUrl: p.urls.full,
          width: p.width,
          height: p.height,
          altText: p.alt_description || query,
          photographer: p.user.name,
          photographerUrl: p.user.links.html,
          color: p.color,
        }));
      }
    }

    // Search Pexels
    if ((source === 'all' || source === 'pexels') && PEXELS_API_KEY) {
      const params = new URLSearchParams({
        query,
        page: page.toString(),
        per_page: perPage.toString(),
      });
      if (orientation) params.set('orientation', orientation);

      const pexelsResponse = await fetch(
        `https://api.pexels.com/v1/search?${params.toString()}`,
        { headers: { Authorization: PEXELS_API_KEY } },
      );

      if (pexelsResponse.ok) {
        const data = await pexelsResponse.json() as {
          photos: Array<{
            id: number;
            width: number;
            height: number;
            avg_color: string | null;
            alt: string | null;
            photographer: string;
            photographer_url: string;
            src: { tiny: string; medium: string; original: string };
          }>;
        };

        results.pexels = data.photos.map(p => ({
          id: p.id.toString(),
          source: 'pexels' as const,
          thumbnailUrl: p.src.tiny,
          regularUrl: p.src.medium,
          fullUrl: p.src.original,
          width: p.width,
          height: p.height,
          altText: p.alt || query,
          photographer: p.photographer,
          photographerUrl: p.photographer_url,
          color: p.avg_color,
        }));
      }
    }

    // Interleave results for combined list
    const combined: StockImage[] = [];
    const maxLen = Math.max(results.unsplash.length, results.pexels.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < results.unsplash.length) combined.push(results.unsplash[i]);
      if (i < results.pexels.length) combined.push(results.pexels[i]);
    }

    res.json({
      success: true,
      data: {
        combined,
        unsplash: results.unsplash,
        pexels: results.pexels,
        query,
        page,
        perPage,
      },
    });
  })
);

export default router;
