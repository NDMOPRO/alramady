import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import PptxGenJS from 'pptxgenjs';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { Prisma } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

const router = Router();
const EXPORT_DIR = process.env.EXPORT_DIR || path.join(process.cwd(), 'exports');
const BASE_URL = process.env.BASE_URL || 'http://localhost:8005';

// Ensure export directory exists
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

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

// ── Helpers ──────────────────────────────────────────────────────────────────

interface SlideRecord {
  id: string;
  slideIndex: number;
  layout: string;
  content: Record<string, unknown> | null;
  notes: string | null;
  slideElements: Array<{
    id: string;
    type: string;
    content: Record<string, unknown> | null;
    positionX: number | null;
    positionY: number | null;
    width: number | null;
    height: number | null;
    rotation: number | null;
    layer: number;
    style: Record<string, unknown> | null;
  }>;
}

interface PresentationRecord {
  id: string;
  name: string;
  title: string | null;
  theme: Record<string, unknown> | null;
  width: number | null;
  height: number | null;
  tenantId: string;
  userId: string;
  settings: Record<string, unknown> | null;
}

async function loadPresentationWithSlides(presentationId: string, tenantId: string): Promise<{
  presentation: PresentationRecord;
  slides: SlideRecord[];
}> {
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, tenantId },
  });
  if (!presentation) {
    throw Object.assign(new Error('Presentation not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }
  const slides = await prisma.slide.findMany({
    where: { presentationId },
    orderBy: { slideIndex: 'asc' },
    include: { slideElements: { orderBy: { layer: 'asc' } } },
  });
  return {
    presentation: presentation as unknown as PresentationRecord,
    slides: slides as unknown as SlideRecord[],
  };
}

async function createExportJob(
  presentationId: string,
  userId: string,
  format: string,
  config?: Record<string, unknown>
): Promise<string> {
  const job = await prisma.presentationExportJob.create({
    data: {
      id: randomUUID(),
      presentationId,
      userId,
      format,
      status: 'processing',
      config: (config || null) as Prisma.InputJsonValue,
      startedAt: new Date(),
    },
  });
  return job.id;
}

async function completeExportJob(jobId: string, outputUrl: string): Promise<void> {
  await prisma.presentationExportJob.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      outputUrl,
      completedAt: new Date(),
    },
  });
}

async function failExportJob(jobId: string, error: string): Promise<void> {
  await prisma.presentationExportJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      error,
      completedAt: new Date(),
    },
  });
}

function getSlideElements(slide: SlideRecord): Array<Record<string, unknown>> {
  if (slide.slideElements && slide.slideElements.length > 0) {
    return slide.slideElements.map((e) => ({
      ...e,
      ...(typeof e.content === 'string' ? JSON.parse(e.content) : e.content || {}),
    }));
  }
  const content = typeof slide.content === 'string' ? JSON.parse(slide.content) : slide.content || {};
  return (content.elements as Array<Record<string, unknown>>) || [];
}

function getTheme(presentation: PresentationRecord) {
  const theme = typeof presentation.theme === 'string'
    ? JSON.parse(presentation.theme)
    : presentation.theme || {};
  return {
    primaryColor: (theme.primaryColor as string) || '#1a73e8',
    secondaryColor: (theme.secondaryColor as string) || '#ffffff',
    backgroundColor: (theme.backgroundColor as string) || '#ffffff',
    fontFamily: (theme.fontFamily as string) || 'Arial',
    titleFontSize: (theme.titleFontSize as number) || 28,
    bodyFontSize: (theme.bodyFontSize as number) || 16,
  };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF ]/g, '_').slice(0, 100);
}

// ── Validation Schemas ───────────────────────────────────────────────────────

const exportOptionsSchema = z.object({
  quality: z.enum(['draft', 'standard', 'high']).optional().default('high'),
  includeNotes: z.boolean().optional().default(false),
  slideRange: z.object({
    from: z.number().int().min(0),
    to: z.number().int().min(0),
  }).optional(),
  password: z.string().optional(),
});

const videoExportSchema = z.object({
  fps: z.number().int().min(1).max(60).optional().default(30),
  slideDuration: z.number().min(1).max(60).optional().default(5),
  transition: z.enum(['none', 'fade', 'slide', 'dissolve']).optional().default('fade'),
  transitionDuration: z.number().min(0.1).max(3).optional().default(0.5),
  resolution: z.enum(['720p', '1080p', '4k']).optional().default('1080p'),
  format: z.enum(['mp4', 'webm']).optional().default('mp4'),
});

const htmlExportSchema = z.object({
  interactive: z.boolean().optional().default(true),
  autoPlay: z.boolean().optional().default(false),
  showControls: z.boolean().optional().default(true),
  theme: z.enum(['light', 'dark', 'auto']).optional().default('auto'),
  includeNotes: z.boolean().optional().default(false),
});

const wordExportSchema = z.object({
  includeNotes: z.boolean().optional().default(true),
  includeSlideNumbers: z.boolean().optional().default(true),
  pageSize: z.enum(['A4', 'Letter', 'A3']).optional().default('A4'),
});

const multiFormatSchema = z.object({
  formats: z.array(z.enum(['pptx', 'pdf', 'jpeg', 'html', 'word'])).min(1),
  quality: z.enum(['draft', 'standard', 'high']).optional().default('high'),
});

const publishWebSchema = z.object({
  slug: z.string().min(3).max(100).optional(),
  allowComments: z.boolean().optional().default(false),
  requireAuth: z.boolean().optional().default(false),
  expiresAt: z.string().datetime().optional(),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(500).optional(),
});

const publishLinkedInSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['public', 'connections']).optional().default('public'),
  accessToken: z.string().min(1),
});

const publishDomainSchema = z.object({
  domain: z.string().min(3),
  subdirectory: z.string().optional(),
  sslEnabled: z.boolean().optional().default(true),
  customCss: z.string().optional(),
  customJs: z.string().optional(),
});

const embedSchema = z.object({
  allowedDomains: z.array(z.string()).optional().default([]),
  showControls: z.boolean().optional().default(true),
  autoPlay: z.boolean().optional().default(false),
  startSlide: z.number().int().min(0).optional().default(0),
  maxViews: z.number().int().min(1).optional(),
  expiresAt: z.string().datetime().optional(),
  theme: z.enum(['light', 'dark', 'auto']).optional().default('auto'),
});

const shareSchema = z.object({
  emails: z.array(z.string().email()).optional(),
  permission: z.enum(['view', 'comment', 'edit']).optional().default('view'),
  password: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  notifyByEmail: z.boolean().optional().default(true),
  message: z.string().max(500).optional(),
});

const scheduleSnapshotSchema = z.object({
  schedule: z.string().min(1), // cron expression
  format: z.enum(['pdf', 'pptx', 'jpeg']).default('pdf'),
  channels: z.array(z.object({
    type: z.enum(['email', 'teams', 'slack']),
    target: z.string().min(1),
  })).min(1),
  name: z.string().min(1).max(200),
});

const socialImagesSchema = z.object({
  platforms: z.array(z.enum(['linkedin', 'twitter', 'facebook', 'instagram'])).min(1),
  slideIndices: z.array(z.number().int().min(0)).optional(),
  brandOverlay: z.boolean().optional().default(false),
});

const landingPageSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  ctaText: z.string().max(100).optional(),
  ctaUrl: z.string().url().optional(),
  headerImage: z.boolean().optional().default(true),
  slidePreviewCount: z.number().int().min(1).max(10).optional().default(3),
  customCss: z.string().optional(),
  collectEmails: z.boolean().optional().default(false),
});

const googleSlidesSchema = z.object({
  accessToken: z.string().min(1),
  folderId: z.string().optional(),
  title: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /pptx/:presentationId — Export as PPTX
router.post(
  '/pptx/:presentationId',
  authMiddleware,
  validate(exportOptionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation, slides } = await loadPresentationWithSlides(presentationId, tenantId);
    const jobId = await createExportJob(presentationId, userId, 'pptx');
    const theme = getTheme(presentation);

    try {
      const pptx = new PptxGenJS();
      pptx.title = presentation.title || presentation.name;
      pptx.author = userId;
      pptx.layout = 'LAYOUT_WIDE';

      if (presentation.width && presentation.height) {
        pptx.defineLayout({ name: 'CUSTOM', width: presentation.width, height: presentation.height });
        pptx.layout = 'CUSTOM';
      }

      const filteredSlides = req.body.slideRange
        ? slides.filter((s) => s.slideIndex >= req.body.slideRange.from && s.slideIndex <= req.body.slideRange.to)
        : slides;

      for (const slideData of filteredSlides) {
        const pptxSlide = pptx.addSlide();
        pptxSlide.background = { color: theme.backgroundColor.replace('#', '') };

        if (slideData.notes && req.body.includeNotes) {
          pptxSlide.addNotes(slideData.notes);
        }

        const elements = getSlideElements(slideData);

        for (const elem of elements) {
          const x = (elem.positionX as number) || (elem.x as number) || 0.5;
          const y = (elem.positionY as number) || (elem.y as number) || 0.5;
          const w = (elem.width as number) || (elem.w as number) || 4;
          const h = (elem.height as number) || (elem.h as number) || 1;
          const style = (typeof elem.style === 'string' ? JSON.parse(elem.style as string) : elem.style || {}) as Record<string, unknown>;

          const elemType = (elem.type as string) || '';

          if (elemType === 'text' || elemType.includes('text')) {
            const text = (elem.text as string) || (elem.content as string) || '';
            pptxSlide.addText(text, {
              x, y, w, h,
              fontSize: (style.fontSize as number) || theme.bodyFontSize,
              bold: (style.bold as boolean) || false,
              italic: (style.italic as boolean) || false,
              color: ((style.color as string) || theme.primaryColor).replace('#', ''),
              fontFace: (style.fontFamily as string) || theme.fontFamily,
              align: (style.align as 'left' | 'center' | 'right') || 'left',
              valign: 'middle',
              isTextBox: true,
              rtlMode: (style.rtl as boolean) !== false,
            });
          } else if (elemType === 'shape' || elemType.includes('shape')) {
            const shapeType = (elem.shapeType as string) || 'rect';
            const shapeMap: Record<string, string> = {
              rect: 'rect', circle: 'ellipse', arrow: 'rightArrow', line: 'line',
              ellipse: 'ellipse', triangle: 'triangle', diamond: 'diamond',
            };
            pptxSlide.addShape(
              ((pptx as unknown as Record<string, Record<string, string>>).ShapeType?.[shapeMap[shapeType] || 'rect'] || 'rect') as unknown as PptxGenJS.SHAPE_NAME,
              {
                x, y, w, h,
                fill: { color: ((style.fillColor as string) || theme.primaryColor).replace('#', '') },
                line: style.borderColor ? {
                  color: (style.borderColor as string).replace('#', ''),
                  width: (style.borderWidth as number) || 1,
                } : undefined,
                rotate: (elem.rotation as number) || 0,
              }
            );
          } else if (elemType === 'image' || elemType.includes('image')) {
            const imgData = (elem.data as string) || (elem.src as string) || '';
            if (imgData) {
              const imgOpts: Record<string, unknown> = { x, y, w, h, rotate: (elem.rotation as number) || 0 };
              if (imgData.startsWith('data:') || imgData.startsWith('/9j') || imgData.startsWith('iVBOR')) {
                imgOpts.data = imgData.startsWith('data:') ? imgData : `data:image/png;base64,${imgData}`;
              } else {
                imgOpts.path = imgData;
              }
              pptxSlide.addImage(imgOpts);
            }
          } else if (elemType === 'table' || elemType.includes('table')) {
            const rows = (elem.rows as unknown[][]) || (elem.rawData as unknown[][]) || [];
            if (rows.length > 0) {
              const tableRows = rows.map((row) =>
                (Array.isArray(row) ? row : [row]).map((cell) => ({
                  text: String(cell ?? ''),
                  options: { fontSize: (style.fontSize as number) || 12 },
                }))
              );
              pptxSlide.addTable(tableRows, {
                x, y, w, h,
                border: { pt: 1, color: 'CCCCCC' },
                fontSize: (style.fontSize as number) || 12,
              });
            }
          }
        }
      }

      const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
      const fileName = `${sanitizeFilename(presentation.name)}_${jobId.slice(0, 8)}.pptx`;
      const filePath = path.join(EXPORT_DIR, fileName);
      fs.writeFileSync(filePath, buffer);

      const downloadUrl = `${BASE_URL}/api/v1/presentation/export-publish/download/${jobId}`;
      await completeExportJob(jobId, filePath);

      logger.info('PPTX export completed', { presentationId, jobId, size: buffer.length });
      res.json({
        success: true,
        data: {
          jobId,
          format: 'pptx',
          downloadUrl,
          sizeBytes: buffer.length,
          slideCount: filteredSlides.length,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      await failExportJob(jobId, message);
      throw err;
    }
  })
);

// POST /pdf/:presentationId — Export as PDF
router.post(
  '/pdf/:presentationId',
  authMiddleware,
  validate(exportOptionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation, slides } = await loadPresentationWithSlides(presentationId, tenantId);
    const jobId = await createExportJob(presentationId, userId, 'pdf');
    const theme = getTheme(presentation);

    try {
      const pageWidth = (presentation.width || 13.33) * 72; // inches to points
      const pageHeight = (presentation.height || 7.5) * 72;

      const fileName = `${sanitizeFilename(presentation.name)}_${jobId.slice(0, 8)}.pdf`;
      const filePath = path.join(EXPORT_DIR, fileName);
      const writeStream = fs.createWriteStream(filePath);

      const doc = new PDFDocument({
        size: [pageWidth, pageHeight],
        autoFirstPage: false,
        bufferPages: true,
        info: {
          Title: presentation.title || presentation.name,
          Author: userId,
          Creator: 'Rasid Presentation Service',
        },
      });

      doc.pipe(writeStream);

      const filteredSlides = req.body.slideRange
        ? slides.filter((s) => s.slideIndex >= req.body.slideRange.from && s.slideIndex <= req.body.slideRange.to)
        : slides;

      for (const slideData of filteredSlides) {
        doc.addPage({ size: [pageWidth, pageHeight] });

        // Background
        doc.rect(0, 0, pageWidth, pageHeight)
          .fill(theme.backgroundColor);

        const elements = getSlideElements(slideData);

        for (const elem of elements) {
          const xInches = (elem.positionX as number) || (elem.x as number) || 0.5;
          const yInches = (elem.positionY as number) || (elem.y as number) || 0.5;
          const wInches = (elem.width as number) || (elem.w as number) || 4;
          const hInches = (elem.height as number) || (elem.h as number) || 1;

          const x = xInches * 72;
          const y = yInches * 72;
          const w = wInches * 72;
          const h = hInches * 72;

          const style = (typeof elem.style === 'string' ? JSON.parse(elem.style as string) : elem.style || {}) as Record<string, unknown>;
          const elemType = (elem.type as string) || '';

          if (elemType === 'text' || elemType.includes('text')) {
            const text = (elem.text as string) || (elem.content as string) || '';
            const fontSize = (style.fontSize as number) || theme.bodyFontSize;
            const textColor = (style.color as string) || theme.primaryColor;

            doc.save();
            const opacity = (style.opacity as number) ?? 1;
            doc.opacity(opacity);
            doc.font('Helvetica')
              .fontSize(fontSize)
              .fillColor(textColor);

            if (style.bold) {
              doc.font('Helvetica-Bold');
            }

            const align = (style.align as 'left' | 'center' | 'right') || 'left';
            doc.text(text, x, y, {
              width: w,
              height: h,
              align,
              lineGap: ((style.lineSpacing as number) || 1.2) * fontSize * 0.1,
            });
            doc.restore();
          } else if (elemType === 'shape' || elemType.includes('shape')) {
            const fillColor = (style.fillColor as string) || theme.primaryColor;
            const shapeType = (elem.shapeType as string) || 'rect';

            doc.save();
            if (shapeType === 'circle' || shapeType === 'ellipse') {
              doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2).fill(fillColor);
            } else {
              doc.rect(x, y, w, h).fill(fillColor);
            }
            if (style.borderColor) {
              doc.lineWidth((style.borderWidth as number) || 1)
                .strokeColor(style.borderColor as string)
                .stroke();
            }
            doc.restore();
          } else if (elemType === 'image' || elemType.includes('image')) {
            const imgData = (elem.data as string) || '';
            if (imgData) {
              try {
                let imgBuffer: Buffer;
                if (imgData.startsWith('data:')) {
                  const base64Data = imgData.split(',')[1];
                  imgBuffer = Buffer.from(base64Data, 'base64');
                } else if (imgData.startsWith('/9j') || imgData.startsWith('iVBOR')) {
                  imgBuffer = Buffer.from(imgData, 'base64');
                } else {
                  imgBuffer = fs.readFileSync(imgData);
                }
                doc.image(imgBuffer, x, y, { width: w, height: h });
              } catch {
                logger.warn('Failed to add image to PDF', { slideIndex: slideData.slideIndex });
              }
            }
          } else if (elemType === 'table' || elemType.includes('table')) {
            const rows = (elem.rows as string[][]) || (elem.rawData as string[][]) || [];
            if (rows.length > 0) {
              const cellW = w / (rows[0]?.length || 1);
              const cellH = Math.min(h / rows.length, 25);
              for (let ri = 0; ri < rows.length; ri++) {
                const row = rows[ri] || [];
                for (let ci = 0; ci < row.length; ci++) {
                  const cx = x + ci * cellW;
                  const cy = y + ri * cellH;
                  doc.rect(cx, cy, cellW, cellH).stroke('#cccccc');
                  doc.fontSize(10).fillColor('#333333')
                    .text(String(row[ci] ?? ''), cx + 4, cy + 4, { width: cellW - 8, height: cellH - 8 });
                }
              }
            }
          }
        }

        // Speaker notes on a separate page
        if (slideData.notes && req.body.includeNotes) {
          doc.addPage({ size: [pageWidth, pageHeight] });
          doc.rect(0, 0, pageWidth, pageHeight).fill('#ffffff');
          doc.font('Helvetica-Bold').fontSize(14).fillColor('#333333')
            .text(`Speaker Notes - Slide ${slideData.slideIndex + 1}`, 36, 36, { width: pageWidth - 72 });
          doc.font('Helvetica').fontSize(12).fillColor('#555555')
            .text(slideData.notes, 36, 72, { width: pageWidth - 72 });
        }
      }

      doc.end();

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      const stats = fs.statSync(filePath);
      const downloadUrl = `${BASE_URL}/api/v1/presentation/export-publish/download/${jobId}`;
      await completeExportJob(jobId, filePath);

      logger.info('PDF export completed', { presentationId, jobId, size: stats.size });
      res.json({
        success: true,
        data: {
          jobId,
          format: 'pdf',
          downloadUrl,
          sizeBytes: stats.size,
          slideCount: filteredSlides.length,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF export failed';
      await failExportJob(jobId, message);
      throw err;
    }
  })
);

// POST /google-slides/:presentationId — Export to Google Slides
router.post(
  '/google-slides/:presentationId',
  authMiddleware,
  validate(googleSlidesSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation, slides } = await loadPresentationWithSlides(presentationId, tenantId);
    const jobId = await createExportJob(presentationId, userId, 'google-slides', { folderId: req.body.folderId });

    try {
      const { accessToken, folderId } = req.body;
      const title = req.body.title || presentation.title || presentation.name;

      // Create a Google Slides presentation via API
      const createResponse = await fetch('https://slides.googleapis.com/v1/presentations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      });

      if (!createResponse.ok) {
        const errorBody = await createResponse.text();
        throw new Error(`Google Slides API error: ${createResponse.status} ${errorBody}`);
      }

      const gsPresentation = await createResponse.json() as { presentationId: string };
      const gsPresentationId = gsPresentation.presentationId;

      // Build batch update requests for each slide
      const requests: Array<Record<string, unknown>> = [];

      for (let i = 0; i < slides.length; i++) {
        const slideData = slides[i];
        const slideObjectId = `slide_${i}`;

        if (i > 0) {
          requests.push({
            createSlide: {
              objectId: slideObjectId,
              insertionIndex: i,
            },
          });
        } else {
          // First slide already exists, just get its ID from the response
        }

        const elements = getSlideElements(slideData);
        for (const elem of elements) {
          const elemType = (elem.type as string) || '';
          if (elemType === 'text' || elemType.includes('text')) {
            const text = (elem.text as string) || (elem.content as string) || '';
            const elemObjId = `elem_${i}_${randomUUID().slice(0, 8)}`;
            const x = ((elem.positionX as number) || (elem.x as number) || 0.5) * 914400;
            const y = ((elem.positionY as number) || (elem.y as number) || 0.5) * 914400;
            const w = ((elem.width as number) || (elem.w as number) || 4) * 914400;
            const h = ((elem.height as number) || (elem.h as number) || 1) * 914400;

            requests.push({
              createShape: {
                objectId: elemObjId,
                shapeType: 'TEXT_BOX',
                elementProperties: {
                  pageObjectId: i === 0 ? undefined : slideObjectId,
                  size: {
                    width: { magnitude: w, unit: 'EMU' },
                    height: { magnitude: h, unit: 'EMU' },
                  },
                  transform: {
                    scaleX: 1, scaleY: 1,
                    translateX: x, translateY: y,
                    unit: 'EMU',
                  },
                },
              },
            });

            requests.push({
              insertText: {
                objectId: elemObjId,
                text,
                insertionIndex: 0,
              },
            });
          }
        }

        if (slideData.notes) {
          requests.push({
            insertText: {
              objectId: i === 0 ? undefined : `${slideObjectId}_notes`,
              text: slideData.notes,
            },
          });
        }
      }

      if (requests.length > 0) {
        const batchResponse = await fetch(
          `https://slides.googleapis.com/v1/presentations/${gsPresentationId}:batchUpdate`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ requests }),
          }
        );

        if (!batchResponse.ok) {
          logger.warn('Google Slides batch update partial failure', {
            status: batchResponse.status,
            presentationId: gsPresentationId,
          });
        }
      }

      // Move to folder if specified
      if (folderId) {
        await fetch(
          `https://www.googleapis.com/drive/v3/files/${gsPresentationId}?addParents=${folderId}`,
          {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );
      }

      const googleUrl = `https://docs.google.com/presentation/d/${gsPresentationId}/edit`;
      await completeExportJob(jobId, googleUrl);

      logger.info('Google Slides export completed', { presentationId, gsPresentationId, jobId });
      res.json({
        success: true,
        data: {
          jobId,
          format: 'google-slides',
          googlePresentationId: gsPresentationId,
          url: googleUrl,
          slideCount: slides.length,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google Slides export failed';
      await failExportJob(jobId, message);
      throw err;
    }
  })
);

// POST /jpeg/:presentationId — Export slides as JPEG images
router.post(
  '/jpeg/:presentationId',
  authMiddleware,
  validate(exportOptionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation, slides } = await loadPresentationWithSlides(presentationId, tenantId);
    const jobId = await createExportJob(presentationId, userId, 'jpeg');
    const theme = getTheme(presentation);

    try {
      const qualityMap: Record<string, number> = { draft: 60, standard: 80, high: 95 };
      const quality = qualityMap[req.body.quality || 'high'];
      const slideWidth = Math.round((presentation.width || 13.33) * 96);
      const slideHeight = Math.round((presentation.height || 7.5) * 96);

      const filteredSlides = req.body.slideRange
        ? slides.filter((s) => s.slideIndex >= req.body.slideRange.from && s.slideIndex <= req.body.slideRange.to)
        : slides;

      const outputDir = path.join(EXPORT_DIR, `jpeg_${jobId}`);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const imageResults: Array<{ slideIndex: number; path: string; sizeBytes: number }> = [];

      for (const slideData of filteredSlides) {
        // Create SVG representation of the slide
        const bgColor = theme.backgroundColor || '#ffffff';
        const elements = getSlideElements(slideData);

        let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${slideWidth}" height="${slideHeight}" viewBox="0 0 ${slideWidth} ${slideHeight}">`;
        svgContent += `<rect width="${slideWidth}" height="${slideHeight}" fill="${bgColor}"/>`;

        for (const elem of elements) {
          const x = ((elem.positionX as number) || (elem.x as number) || 0) * 96;
          const y = ((elem.positionY as number) || (elem.y as number) || 0) * 96;
          const w = ((elem.width as number) || (elem.w as number) || 2) * 96;
          const h = ((elem.height as number) || (elem.h as number) || 1) * 96;
          const style = (typeof elem.style === 'string' ? JSON.parse(elem.style as string) : elem.style || {}) as Record<string, unknown>;
          const elemType = (elem.type as string) || '';

          if (elemType === 'text' || elemType.includes('text')) {
            const text = (elem.text as string) || (elem.content as string) || '';
            const fontSize = (style.fontSize as number) || theme.bodyFontSize;
            const color = (style.color as string) || theme.primaryColor;
            const fontWeight = (style.bold as boolean) ? 'bold' : 'normal';
            const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            const lines = escapedText.split('\n');
            const lineHeight = fontSize * 1.3;
            for (let li = 0; li < lines.length; li++) {
              svgContent += `<text x="${x + 5}" y="${y + fontSize + li * lineHeight}" font-size="${fontSize}" fill="${color}" font-weight="${fontWeight}" font-family="${theme.fontFamily}, Arial, sans-serif"><tspan>${lines[li]}</tspan></text>`;
            }
          } else if (elemType === 'shape' || elemType.includes('shape')) {
            const fillColor = (style.fillColor as string) || theme.primaryColor;
            const shapeType = (elem.shapeType as string) || 'rect';
            if (shapeType === 'circle' || shapeType === 'ellipse') {
              svgContent += `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fillColor}"/>`;
            } else {
              svgContent += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fillColor}"/>`;
            }
          }
        }

        svgContent += '</svg>';
        const svgBuffer = Buffer.from(svgContent);

        const jpegBuffer = await sharp(svgBuffer)
          .resize(slideWidth, slideHeight)
          .jpeg({ quality })
          .toBuffer();

        const imgFileName = `slide_${slideData.slideIndex + 1}.jpg`;
        const imgPath = path.join(outputDir, imgFileName);
        fs.writeFileSync(imgPath, jpegBuffer);

        imageResults.push({
          slideIndex: slideData.slideIndex,
          path: imgPath,
          sizeBytes: jpegBuffer.length,
        });
      }

      const downloadUrl = `${BASE_URL}/api/v1/presentation/export-publish/download/${jobId}`;
      await completeExportJob(jobId, outputDir);

      logger.info('JPEG export completed', { presentationId, jobId, slideCount: imageResults.length });
      res.json({
        success: true,
        data: {
          jobId,
          format: 'jpeg',
          downloadUrl,
          slideCount: imageResults.length,
          images: imageResults.map((img) => ({
            slideIndex: img.slideIndex,
            sizeBytes: img.sizeBytes,
          })),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'JPEG export failed';
      await failExportJob(jobId, message);
      throw err;
    }
  })
);

// POST /video/:presentationId — Export as video (ffmpeg)
router.post(
  '/video/:presentationId',
  authMiddleware,
  validate(videoExportSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation, slides } = await loadPresentationWithSlides(presentationId, tenantId);
    const jobId = await createExportJob(presentationId, userId, 'video', req.body);
    const theme = getTheme(presentation);

    try {
      const { fps, slideDuration, transition, transitionDuration, resolution, format } = req.body;
      const resMap: Record<string, { w: number; h: number }> = {
        '720p': { w: 1280, h: 720 },
        '1080p': { w: 1920, h: 1080 },
        '4k': { w: 3840, h: 2160 },
      };
      const { w: videoW, h: videoH } = resMap[resolution] || resMap['1080p'];

      // Generate frames as images
      const framesDir = path.join(EXPORT_DIR, `video_frames_${jobId}`);
      if (!fs.existsSync(framesDir)) {
        fs.mkdirSync(framesDir, { recursive: true });
      }

      const framesPerSlide = Math.ceil(slideDuration * fps);
      const transitionFrames = Math.ceil(transitionDuration * fps);
      let frameIndex = 0;

      for (let si = 0; si < slides.length; si++) {
        const slideData = slides[si];
        const bgColor = theme.backgroundColor || '#ffffff';
        const elements = getSlideElements(slideData);

        // Build SVG for this slide
        let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${videoW}" height="${videoH}" viewBox="0 0 ${videoW} ${videoH}">`;
        svgContent += `<rect width="${videoW}" height="${videoH}" fill="${bgColor}"/>`;

        const scaleX = videoW / ((presentation.width || 13.33) * 96);
        const scaleY = videoH / ((presentation.height || 7.5) * 96);

        for (const elem of elements) {
          const x = ((elem.positionX as number) || (elem.x as number) || 0) * 96 * scaleX;
          const y = ((elem.positionY as number) || (elem.y as number) || 0) * 96 * scaleY;
          const w = ((elem.width as number) || (elem.w as number) || 2) * 96 * scaleX;
          const h = ((elem.height as number) || (elem.h as number) || 1) * 96 * scaleY;
          const style = (typeof elem.style === 'string' ? JSON.parse(elem.style as string) : elem.style || {}) as Record<string, unknown>;
          const elemType = (elem.type as string) || '';

          if (elemType === 'text' || elemType.includes('text')) {
            const text = (elem.text as string) || (elem.content as string) || '';
            const fontSize = ((style.fontSize as number) || theme.bodyFontSize) * Math.min(scaleX, scaleY);
            const color = (style.color as string) || theme.primaryColor;
            const fontWeight = (style.bold as boolean) ? 'bold' : 'normal';
            const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            svgContent += `<text x="${x + 5}" y="${y + fontSize}" font-size="${fontSize}" fill="${color}" font-weight="${fontWeight}" font-family="${theme.fontFamily}, Arial, sans-serif">${escaped.split('\n')[0] || ''}</text>`;
          } else if (elemType === 'shape' || elemType.includes('shape')) {
            const fillColor = (style.fillColor as string) || theme.primaryColor;
            svgContent += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fillColor}"/>`;
          }
        }

        svgContent += '</svg>';
        const slideBuffer = await sharp(Buffer.from(svgContent))
          .resize(videoW, videoH)
          .png()
          .toBuffer();

        // Write static frames for this slide
        for (let f = 0; f < framesPerSlide; f++) {
          const frameName = `frame_${String(frameIndex).padStart(6, '0')}.png`;
          fs.writeFileSync(path.join(framesDir, frameName), slideBuffer);
          frameIndex++;
        }

        // Transition frames (blend with next slide)
        if (si < slides.length - 1 && transition !== 'none') {
          const nextSlideData = slides[si + 1];
          const nextBgColor = theme.backgroundColor || '#ffffff';
          let nextSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${videoW}" height="${videoH}"><rect width="${videoW}" height="${videoH}" fill="${nextBgColor}"/>`;
          const nextElements = getSlideElements(nextSlideData);
          for (const elem of nextElements) {
            const elemType = (elem.type as string) || '';
            if (elemType === 'text' || elemType.includes('text')) {
              const text = (elem.text as string) || '';
              const x = ((elem.positionX as number) || (elem.x as number) || 0) * 96 * scaleX;
              const y = ((elem.positionY as number) || (elem.y as number) || 0) * 96 * scaleY;
              const style = (typeof elem.style === 'string' ? JSON.parse(elem.style as string) : elem.style || {}) as Record<string, unknown>;
              const fontSize = ((style.fontSize as number) || 16) * Math.min(scaleX, scaleY);
              const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              nextSvg += `<text x="${x + 5}" y="${y + fontSize}" font-size="${fontSize}" fill="${(style.color as string) || '#333'}" font-family="Arial">${escaped.split('\n')[0] || ''}</text>`;
            }
          }
          nextSvg += '</svg>';
          const nextBuffer = await sharp(Buffer.from(nextSvg)).resize(videoW, videoH).png().toBuffer();

          for (let f = 0; f < transitionFrames; f++) {
            const alpha = f / transitionFrames;
            const blended = await sharp(slideBuffer)
              .composite([{
                input: nextBuffer,
                blend: 'over',
                opacity: alpha,
              } as sharp.OverlayOptions])
              .png()
              .toBuffer();
            const frameName = `frame_${String(frameIndex).padStart(6, '0')}.png`;
            fs.writeFileSync(path.join(framesDir, frameName), blended);
            frameIndex++;
          }
        }
      }

      // Encode with ffmpeg
      const ext = format === 'webm' ? 'webm' : 'mp4';
      const outputFile = path.join(EXPORT_DIR, `${sanitizeFilename(presentation.name)}_${jobId.slice(0, 8)}.${ext}`);

      const ffmpegArgs = [
        '-y',
        '-framerate', String(fps),
        '-i', path.join(framesDir, 'frame_%06d.png'),
        '-c:v', format === 'webm' ? 'libvpx-vp9' : 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'fast',
        '-crf', '23',
        outputFile,
      ];

      const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';
      await execFileAsync(ffmpegBin, ffmpegArgs, { timeout: 300000 });

      // Clean up frames
      const frameFiles = fs.readdirSync(framesDir);
      for (const f of frameFiles) {
        fs.unlinkSync(path.join(framesDir, f));
      }
      fs.rmdirSync(framesDir);

      const stats = fs.statSync(outputFile);
      const downloadUrl = `${BASE_URL}/api/v1/presentation/export-publish/download/${jobId}`;
      await completeExportJob(jobId, outputFile);

      logger.info('Video export completed', { presentationId, jobId, size: stats.size });
      res.json({
        success: true,
        data: {
          jobId,
          format: ext,
          downloadUrl,
          sizeBytes: stats.size,
          slideCount: slides.length,
          duration: slides.length * slideDuration,
          resolution,
          fps,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video export failed';
      await failExportJob(jobId, message);
      throw err;
    }
  })
);

// POST /html/:presentationId — Export as interactive HTML
router.post(
  '/html/:presentationId',
  authMiddleware,
  validate(htmlExportSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation, slides } = await loadPresentationWithSlides(presentationId, tenantId);
    const jobId = await createExportJob(presentationId, userId, 'html');
    const theme = getTheme(presentation);

    try {
      const { interactive, autoPlay, showControls, theme: htmlTheme, includeNotes } = req.body;
      const title = presentation.title || presentation.name;

      const isDark = htmlTheme === 'dark' || (htmlTheme === 'auto' && theme.backgroundColor.toLowerCase() !== '#ffffff');
      const controlsBg = isDark ? '#1a1a2e' : '#f0f0f0';
      const controlsFg = isDark ? '#e0e0e0' : '#333333';

      let slidesHtml = '';
      for (const slideData of slides) {
        const bgColor = theme.backgroundColor;
        const elements = getSlideElements(slideData);

        let slideInner = '';
        for (const elem of elements) {
          const x = ((elem.positionX as number) || (elem.x as number) || 0) * 96;
          const y = ((elem.positionY as number) || (elem.y as number) || 0) * 96;
          const w = ((elem.width as number) || (elem.w as number) || 4) * 96;
          const h = ((elem.height as number) || (elem.h as number) || 1) * 96;
          const style = (typeof elem.style === 'string' ? JSON.parse(elem.style as string) : elem.style || {}) as Record<string, unknown>;
          const elemType = (elem.type as string) || '';
          const opacity = (style.opacity as number) ?? 1;

          if (elemType === 'text' || elemType.includes('text')) {
            const text = (elem.text as string) || (elem.content as string) || '';
            const fontSize = (style.fontSize as number) || theme.bodyFontSize;
            const color = (style.color as string) || theme.primaryColor;
            const fontWeight = (style.bold as boolean) ? 'bold' : 'normal';
            const textAlign = (style.align as string) || 'left';
            const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
            slideInner += `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;font-size:${fontSize}px;color:${color};font-weight:${fontWeight};font-family:${theme.fontFamily},Arial,sans-serif;text-align:${textAlign};opacity:${opacity};overflow:hidden;direction:rtl;">${escaped}</div>`;
          } else if (elemType === 'shape' || elemType.includes('shape')) {
            const fillColor = (style.fillColor as string) || theme.primaryColor;
            const shapeType = (elem.shapeType as string) || 'rect';
            const borderRadius = shapeType === 'circle' || shapeType === 'ellipse' ? '50%' : '0';
            slideInner += `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${fillColor};border-radius:${borderRadius};opacity:${opacity};"></div>`;
          } else if (elemType === 'image' || elemType.includes('image')) {
            const src = (elem.data as string) || (elem.src as string) || '';
            if (src) {
              const imgSrc = src.startsWith('data:') ? src : (src.startsWith('/') ? src : `data:image/png;base64,${src}`);
              slideInner += `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;opacity:${opacity};"><img src="${imgSrc}" style="width:100%;height:100%;object-fit:contain;" alt=""/></div>`;
            }
          }
        }

        let notesHtml = '';
        if (includeNotes && slideData.notes) {
          notesHtml = `<div class="slide-notes" style="display:none;">${slideData.notes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
        }

        slidesHtml += `<div class="slide" data-index="${slideData.slideIndex}" style="width:100%;height:100%;position:relative;background:${bgColor};display:none;">${slideInner}${notesHtml}</div>`;
      }

      const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title.replace(/</g, '&lt;')}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#000;overflow:hidden;font-family:${theme.fontFamily},Arial,sans-serif;}
#presentation{width:100vw;height:100vh;position:relative;overflow:hidden;}
.slide{transition:opacity 0.5s ease;}
.slide.active{display:block !important;opacity:1;}
.slide.fade-out{opacity:0;}
#controls{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:${showControls ? 'flex' : 'none'};gap:10px;z-index:1000;background:${controlsBg};padding:8px 16px;border-radius:25px;box-shadow:0 2px 10px rgba(0,0,0,0.3);}
#controls button{background:none;border:none;color:${controlsFg};font-size:18px;cursor:pointer;padding:5px 10px;border-radius:5px;}
#controls button:hover{background:rgba(128,128,128,0.3);}
#slide-counter{color:${controlsFg};font-size:14px;display:flex;align-items:center;}
#notes-panel{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);width:60%;max-height:150px;overflow-y:auto;background:rgba(0,0,0,0.85);color:#fff;padding:15px;border-radius:10px;display:none;font-size:14px;z-index:999;}
.fullscreen-btn{position:fixed;top:10px;right:10px;z-index:1001;background:${controlsBg};border:none;color:${controlsFg};padding:8px 12px;border-radius:5px;cursor:pointer;}
</style>
</head>
<body>
<div id="presentation">${slidesHtml}</div>
${showControls ? `
<div id="controls">
<button id="prev-btn" title="Previous">&larr;</button>
<span id="slide-counter">1 / ${slides.length}</span>
<button id="next-btn" title="Next">&rarr;</button>
${includeNotes ? '<button id="notes-btn" title="Notes">&#128196;</button>' : ''}
</div>
<div id="notes-panel"></div>
<button class="fullscreen-btn" id="fs-btn" title="Fullscreen">&#x26F6;</button>
` : ''}
<script>
(function(){
var current=0;
var slides=document.querySelectorAll('.slide');
var total=slides.length;
function show(idx){
if(idx<0||idx>=total)return;
slides[current].classList.remove('active');
slides[current].classList.add('fade-out');
current=idx;
slides[current].classList.add('active');
slides[current].classList.remove('fade-out');
var counter=document.getElementById('slide-counter');
if(counter)counter.textContent=(current+1)+' / '+total;
var np=document.getElementById('notes-panel');
if(np){var notes=slides[current].querySelector('.slide-notes');np.innerHTML=notes?notes.innerHTML:'';};
}
show(0);
${interactive ? `
document.addEventListener('keydown',function(e){
if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' ')show(current+1);
if(e.key==='ArrowLeft'||e.key==='ArrowUp')show(current-1);
if(e.key==='Home')show(0);
if(e.key==='End')show(total-1);
});
document.getElementById('presentation').addEventListener('click',function(e){
if(e.clientX>window.innerWidth/2)show(current+1);else show(current-1);
});
var prevBtn=document.getElementById('prev-btn');
var nextBtn=document.getElementById('next-btn');
if(prevBtn)prevBtn.addEventListener('click',function(e){e.stopPropagation();show(current-1);});
if(nextBtn)nextBtn.addEventListener('click',function(e){e.stopPropagation();show(current+1);});
var notesBtn=document.getElementById('notes-btn');
var notesPanel=document.getElementById('notes-panel');
if(notesBtn&&notesPanel)notesBtn.addEventListener('click',function(e){e.stopPropagation();notesPanel.style.display=notesPanel.style.display==='block'?'none':'block';});
var fsBtn=document.getElementById('fs-btn');
if(fsBtn)fsBtn.addEventListener('click',function(){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen();});
` : ''}
${autoPlay ? `
var autoInterval=setInterval(function(){if(current<total-1)show(current+1);else clearInterval(autoInterval);},${(req.body.autoPlayInterval || 5) * 1000});
` : ''}
})();
</script>
</body>
</html>`;

      const fileName = `${sanitizeFilename(title)}_${jobId.slice(0, 8)}.html`;
      const filePath = path.join(EXPORT_DIR, fileName);
      fs.writeFileSync(filePath, html, 'utf-8');

      const stats = fs.statSync(filePath);
      const downloadUrl = `${BASE_URL}/api/v1/presentation/export-publish/download/${jobId}`;
      await completeExportJob(jobId, filePath);

      logger.info('HTML export completed', { presentationId, jobId, size: stats.size });
      res.json({
        success: true,
        data: {
          jobId,
          format: 'html',
          downloadUrl,
          sizeBytes: stats.size,
          slideCount: slides.length,
          interactive,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'HTML export failed';
      await failExportJob(jobId, message);
      throw err;
    }
  })
);

// POST /word/:presentationId — Export as Word document
router.post(
  '/word/:presentationId',
  authMiddleware,
  validate(wordExportSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation, slides } = await loadPresentationWithSlides(presentationId, tenantId);
    const jobId = await createExportJob(presentationId, userId, 'word');
    const theme = getTheme(presentation);

    try {
      const { includeNotes, includeSlideNumbers } = req.body;
      const title = presentation.title || presentation.name;

      // Generate a Word-compatible HTML (MHTML) document
      let wordContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
<head>
<meta charset="UTF-8">
<style>
@page { size: A4; margin: 2cm; }
body { font-family: ${theme.fontFamily}, Arial, sans-serif; color: #333; direction: rtl; }
h1 { color: ${theme.primaryColor}; font-size: 28pt; text-align: center; margin-bottom: 20pt; }
h2 { color: ${theme.primaryColor}; font-size: 22pt; border-bottom: 2px solid ${theme.primaryColor}; padding-bottom: 5pt; margin-top: 30pt; }
.slide-container { page-break-after: always; padding: 20pt 0; }
.slide-container:last-child { page-break-after: auto; }
.slide-number { color: #999; font-size: 10pt; text-align: left; }
.notes { background: #f5f5f5; border-left: 3px solid ${theme.primaryColor}; padding: 10pt; margin-top: 15pt; font-size: 10pt; color: #666; }
.notes-label { font-weight: bold; margin-bottom: 5pt; }
p { font-size: 12pt; line-height: 1.6; margin: 8pt 0; }
table { border-collapse: collapse; width: 100%; margin: 10pt 0; }
td, th { border: 1px solid #ccc; padding: 6pt 8pt; font-size: 10pt; }
th { background: ${theme.primaryColor}; color: white; }
</style>
</head>
<body>
<h1>${title.replace(/</g, '&lt;')}</h1>
`;

      for (const slideData of slides) {
        const elements = getSlideElements(slideData);

        wordContent += `<div class="slide-container">`;
        if (includeSlideNumbers) {
          wordContent += `<p class="slide-number">Slide ${slideData.slideIndex + 1} of ${slides.length}</p>`;
        }

        for (const elem of elements) {
          const style = (typeof elem.style === 'string' ? JSON.parse(elem.style as string) : elem.style || {}) as Record<string, unknown>;
          const elemType = (elem.type as string) || '';

          if (elemType === 'text' || elemType.includes('text')) {
            const text = (elem.text as string) || (elem.content as string) || '';
            const fontSize = (style.fontSize as number) || theme.bodyFontSize;
            const isBold = (style.bold as boolean) || false;
            const color = (style.color as string) || '#333333';
            const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');

            if (fontSize >= 24) {
              wordContent += `<h2 style="color:${color};">${escaped}</h2>`;
            } else {
              wordContent += `<p style="font-size:${fontSize}pt;${isBold ? 'font-weight:bold;' : ''}color:${color};">${escaped}</p>`;
            }
          } else if (elemType === 'table' || elemType.includes('table')) {
            const rows = (elem.rows as string[][]) || (elem.rawData as string[][]) || [];
            const headers = (elem.headers as string[]) || [];
            if (rows.length > 0 || headers.length > 0) {
              wordContent += '<table>';
              if (headers.length > 0) {
                wordContent += '<tr>' + headers.map((h: string) => `<th>${String(h).replace(/</g, '&lt;')}</th>`).join('') + '</tr>';
              }
              for (const row of rows) {
                wordContent += '<tr>' + (Array.isArray(row) ? row : [row]).map((cell) => `<td>${String(cell ?? '').replace(/</g, '&lt;')}</td>`).join('') + '</tr>';
              }
              wordContent += '</table>';
            }
          }
        }

        if (includeNotes && slideData.notes) {
          wordContent += `<div class="notes"><div class="notes-label">Speaker Notes:</div>${slideData.notes.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</div>`;
        }

        wordContent += `</div>`;
      }

      wordContent += `</body></html>`;

      const fileName = `${sanitizeFilename(title)}_${jobId.slice(0, 8)}.doc`;
      const filePath = path.join(EXPORT_DIR, fileName);
      fs.writeFileSync(filePath, wordContent, 'utf-8');

      const stats = fs.statSync(filePath);
      const downloadUrl = `${BASE_URL}/api/v1/presentation/export-publish/download/${jobId}`;
      await completeExportJob(jobId, filePath);

      logger.info('Word export completed', { presentationId, jobId, size: stats.size });
      res.json({
        success: true,
        data: {
          jobId,
          format: 'word',
          downloadUrl,
          sizeBytes: stats.size,
          slideCount: slides.length,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Word export failed';
      await failExportJob(jobId, message);
      throw err;
    }
  })
);

// POST /multi-format/:presentationId — Export in multiple formats at once
router.post(
  '/multi-format/:presentationId',
  authMiddleware,
  validate(multiFormatSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation, slides } = await loadPresentationWithSlides(presentationId, tenantId);
    const { formats, quality } = req.body;
    const batchId = randomUUID();

    const jobs: Array<{ format: string; jobId: string; status: string; downloadUrl?: string; error?: string }> = [];

    for (const format of formats) {
      const jobId = await createExportJob(presentationId, userId, format, { batchId, quality });

      try {
        let filePath: string;
        const fileName = `${sanitizeFilename(presentation.name)}_${jobId.slice(0, 8)}`;

        switch (format) {
          case 'pptx': {
            const pptx = new PptxGenJS();
            pptx.title = presentation.title || presentation.name;
            pptx.layout = 'LAYOUT_WIDE';
            const theme = getTheme(presentation);

            for (const slideData of slides) {
              const pptxSlide = pptx.addSlide();
              pptxSlide.background = { color: theme.backgroundColor.replace('#', '') };
              const elements = getSlideElements(slideData);
              for (const elem of elements) {
                const elemType = (elem.type as string) || '';
                if (elemType === 'text' || elemType.includes('text')) {
                  pptxSlide.addText((elem.text as string) || '', {
                    x: (elem.positionX as number) || (elem.x as number) || 0.5,
                    y: (elem.positionY as number) || (elem.y as number) || 0.5,
                    w: (elem.width as number) || (elem.w as number) || 4,
                    h: (elem.height as number) || (elem.h as number) || 1,
                    fontSize: ((elem.style as Record<string, unknown>)?.fontSize as number) || theme.bodyFontSize,
                    isTextBox: true,
                  });
                }
              }
            }
            const buf = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
            filePath = path.join(EXPORT_DIR, `${fileName}.pptx`);
            fs.writeFileSync(filePath, buf);
            break;
          }
          case 'pdf': {
            const theme = getTheme(presentation);
            const pw = (presentation.width || 13.33) * 72;
            const ph = (presentation.height || 7.5) * 72;
            filePath = path.join(EXPORT_DIR, `${fileName}.pdf`);
            const ws = fs.createWriteStream(filePath);
            const doc = new PDFDocument({ size: [pw, ph], autoFirstPage: false });
            doc.pipe(ws);
            for (const slideData of slides) {
              doc.addPage({ size: [pw, ph] });
              doc.rect(0, 0, pw, ph).fill(theme.backgroundColor);
              const elements = getSlideElements(slideData);
              for (const elem of elements) {
                const elemType = (elem.type as string) || '';
                if (elemType === 'text' || elemType.includes('text')) {
                  const text = (elem.text as string) || '';
                  doc.font('Helvetica')
                    .fontSize(((elem.style as Record<string, unknown>)?.fontSize as number) || 16)
                    .fillColor('#333')
                    .text(text,
                      ((elem.positionX as number) || (elem.x as number) || 0.5) * 72,
                      ((elem.positionY as number) || (elem.y as number) || 0.5) * 72,
                      { width: ((elem.width as number) || (elem.w as number) || 4) * 72 });
                }
              }
            }
            doc.end();
            await new Promise<void>((resolve, reject) => { ws.on('finish', resolve); ws.on('error', reject); });
            break;
          }
          case 'jpeg': {
            const theme = getTheme(presentation);
            const outDir = path.join(EXPORT_DIR, `jpeg_${jobId}`);
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
            const sw = Math.round((presentation.width || 13.33) * 96);
            const sh = Math.round((presentation.height || 7.5) * 96);
            for (const slideData of slides) {
              let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}"><rect width="${sw}" height="${sh}" fill="${theme.backgroundColor}"/>`;
              const elements = getSlideElements(slideData);
              for (const elem of elements) {
                const elemType = (elem.type as string) || '';
                if (elemType === 'text' || elemType.includes('text')) {
                  const text = ((elem.text as string) || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                  const x = ((elem.positionX as number) || (elem.x as number) || 0) * 96;
                  const y = ((elem.positionY as number) || (elem.y as number) || 0) * 96;
                  svg += `<text x="${x+5}" y="${y+20}" font-size="16" fill="#333">${text.split('\n')[0] || ''}</text>`;
                }
              }
              svg += '</svg>';
              const jpgBuf = await sharp(Buffer.from(svg)).resize(sw, sh).jpeg({ quality: quality === 'high' ? 95 : 80 }).toBuffer();
              fs.writeFileSync(path.join(outDir, `slide_${slideData.slideIndex + 1}.jpg`), jpgBuf);
            }
            filePath = outDir;
            break;
          }
          case 'html': {
            const theme = getTheme(presentation);
            let html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>${(presentation.title || presentation.name).replace(/</g, '&lt;')}</title><style>body{margin:0;font-family:Arial;}.slide{width:100vw;height:100vh;position:relative;}</style></head><body>`;
            for (const slideData of slides) {
              html += `<div class="slide" style="background:${theme.backgroundColor};">`;
              const elements = getSlideElements(slideData);
              for (const elem of elements) {
                const elemType = (elem.type as string) || '';
                if (elemType === 'text' || elemType.includes('text')) {
                  const text = ((elem.text as string) || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
                  html += `<div style="position:absolute;left:${((elem.positionX as number) || (elem.x as number) || 0)*96}px;top:${((elem.positionY as number) || (elem.y as number) || 0)*96}px;">${text}</div>`;
                }
              }
              html += '</div>';
            }
            html += '</body></html>';
            filePath = path.join(EXPORT_DIR, `${fileName}.html`);
            fs.writeFileSync(filePath, html, 'utf-8');
            break;
          }
          case 'word': {
            const theme = getTheme(presentation);
            let wordHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office'><head><meta charset="UTF-8"><style>body{font-family:${theme.fontFamily};direction:rtl;}</style></head><body>`;
            wordHtml += `<h1>${(presentation.title || presentation.name).replace(/</g, '&lt;')}</h1>`;
            for (const slideData of slides) {
              wordHtml += `<div style="page-break-after:always;"><h2>Slide ${slideData.slideIndex + 1}</h2>`;
              const elements = getSlideElements(slideData);
              for (const elem of elements) {
                const elemType = (elem.type as string) || '';
                if (elemType === 'text' || elemType.includes('text')) {
                  wordHtml += `<p>${((elem.text as string) || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`;
                }
              }
              if (slideData.notes) {
                wordHtml += `<p style="color:#666;border-left:3px solid #ccc;padding-left:10px;">${slideData.notes.replace(/</g, '&lt;')}</p>`;
              }
              wordHtml += '</div>';
            }
            wordHtml += '</body></html>';
            filePath = path.join(EXPORT_DIR, `${fileName}.doc`);
            fs.writeFileSync(filePath, wordHtml, 'utf-8');
            break;
          }
          default:
            throw new Error(`Unsupported format: ${format}`);
        }

        const downloadUrl = `${BASE_URL}/api/v1/presentation/export-publish/download/${jobId}`;
        await completeExportJob(jobId, filePath!);
        jobs.push({ format, jobId, status: 'completed', downloadUrl });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Export failed';
        await failExportJob(jobId, message);
        jobs.push({ format, jobId, status: 'failed', error: message });
      }
    }

    logger.info('Multi-format export completed', { presentationId, batchId, formats });
    res.json({
      success: true,
      data: {
        batchId,
        presentationId,
        exports: jobs,
        completedCount: jobs.filter((j) => j.status === 'completed').length,
        failedCount: jobs.filter((j) => j.status === 'failed').length,
      },
    });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// PUBLISH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /publish/web/:presentationId — Publish as web presentation
router.post(
  '/publish/web/:presentationId',
  authMiddleware,
  validate(publishWebSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation } = await loadPresentationWithSlides(presentationId, tenantId);

    const slug = req.body.slug || `pres-${presentationId.slice(0, 8)}`;
    const token = createHash('sha256').update(`${presentationId}:${Date.now()}:${randomUUID()}`).digest('hex').slice(0, 32);

    const embedToken = await prisma.embedToken.create({
      data: {
        id: randomUUID(),
        token,
        presentationId,
        createdBy: userId,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        allowedDomains: ['*'],
        showControls: true,
        autoPlay: false,
        startSlide: 0,
        theme: 'auto',
      },
    });

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        status: 'PUBLISHED',
        isPublic: !req.body.requireAuth,
        settings: {
          ...(typeof presentation.settings === 'string' ? JSON.parse(presentation.settings) : presentation.settings || {}),
          publishedSlug: slug,
          publishedAt: new Date().toISOString(),
          allowComments: req.body.allowComments,
          seoTitle: req.body.seoTitle || presentation.title || presentation.name,
          seoDescription: req.body.seoDescription,
          publishToken: token,
        },
        updatedAt: new Date(),
      },
    });

    const publicUrl = `${BASE_URL}/p/${slug}`;

    logger.info('Presentation published to web', { presentationId, slug });
    res.json({
      success: true,
      data: {
        publicUrl,
        slug,
        token: embedToken.token,
        embedTokenId: embedToken.id,
        status: 'published',
        expiresAt: req.body.expiresAt || null,
      },
    });
  })
);

// POST /publish/linkedin/:presentationId — Publish to LinkedIn
router.post(
  '/publish/linkedin/:presentationId',
  authMiddleware,
  validate(publishLinkedInSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation, slides } = await loadPresentationWithSlides(presentationId, tenantId);
    const { accessToken, title, description, visibility } = req.body;

    // Generate a PDF for LinkedIn document upload
    const jobId = await createExportJob(presentationId, userId, 'linkedin', { title });
    const theme = getTheme(presentation);

    const pageWidth = 792; // 11 inches
    const pageHeight = 612; // 8.5 inches landscape
    const fileName = `linkedin_${jobId.slice(0, 8)}.pdf`;
    const filePath = path.join(EXPORT_DIR, fileName);
    const ws = fs.createWriteStream(filePath);
    const doc = new PDFDocument({ size: [pageWidth, pageHeight], autoFirstPage: false });
    doc.pipe(ws);

    for (const slideData of slides) {
      doc.addPage({ size: [pageWidth, pageHeight] });
      doc.rect(0, 0, pageWidth, pageHeight).fill(theme.backgroundColor);
      const elements = getSlideElements(slideData);
      for (const elem of elements) {
        const elemType = (elem.type as string) || '';
        if (elemType === 'text' || elemType.includes('text')) {
          const text = (elem.text as string) || '';
          const style = (typeof elem.style === 'string' ? JSON.parse(elem.style as string) : elem.style || {}) as Record<string, unknown>;
          doc.font((style.bold as boolean) ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize((style.fontSize as number) || 16)
            .fillColor((style.color as string) || '#333')
            .text(text,
              ((elem.positionX as number) || (elem.x as number) || 0.5) * 72,
              ((elem.positionY as number) || (elem.y as number) || 0.5) * 72,
              { width: ((elem.width as number) || (elem.w as number) || 8) * 72 });
        }
      }
    }
    doc.end();
    await new Promise<void>((resolve, reject) => { ws.on('finish', resolve); ws.on('error', reject); });

    // Register upload with LinkedIn API
    const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-document'],
          owner: 'urn:li:person:me',
          serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
        },
      }),
    });

    let linkedInPostUrl = '';
    let assetUrn = '';

    if (registerResponse.ok) {
      const registerData = await registerResponse.json() as {
        value: {
          asset: string;
          uploadMechanism: {
            'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl: string };
          };
        };
      };
      assetUrn = registerData.value.asset;
      const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;

      // Upload the PDF
      const pdfBuffer = fs.readFileSync(filePath);
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/pdf',
        },
        body: pdfBuffer,
      });

      // Create a share post
      const shareResponse = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          author: 'urn:li:person:me',
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: description || title },
              shareMediaCategory: 'DOCUMENT',
              media: [{
                status: 'READY',
                description: { text: description || '' },
                media: assetUrn,
                title: { text: title },
              }],
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': visibility === 'connections' ? 'CONNECTIONS' : 'PUBLIC',
          },
        }),
      });

      if (shareResponse.ok) {
        const shareData = await shareResponse.json() as { id: string };
        linkedInPostUrl = `https://www.linkedin.com/feed/update/${shareData.id}`;
      }
    }

    await completeExportJob(jobId, filePath);

    logger.info('Published to LinkedIn', { presentationId, jobId });
    res.json({
      success: true,
      data: {
        jobId,
        platform: 'linkedin',
        postUrl: linkedInPostUrl,
        assetUrn,
        title,
        slideCount: slides.length,
      },
    });
  })
);

// POST /publish/domain/:presentationId — Publish to custom domain
router.post(
  '/publish/domain/:presentationId',
  authMiddleware,
  validate(publishDomainSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation } = await loadPresentationWithSlides(presentationId, tenantId);
    const { domain, subdirectory, sslEnabled, customCss, customJs } = req.body;

    const publishPath = subdirectory ? `/${subdirectory.replace(/^\//, '')}` : '/';
    const protocol = sslEnabled ? 'https' : 'http';
    const fullUrl = `${protocol}://${domain}${publishPath}`;

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        status: 'PUBLISHED',
        isPublic: true,
        settings: {
          ...(typeof presentation.settings === 'string' ? JSON.parse(presentation.settings) : presentation.settings || {}),
          customDomain: {
            domain,
            subdirectory: publishPath,
            sslEnabled,
            customCss: customCss || null,
            customJs: customJs || null,
            configuredAt: new Date().toISOString(),
            configuredBy: userId,
          },
        },
        updatedAt: new Date(),
      },
    });

    const token = createHash('sha256').update(`${presentationId}:${domain}:${Date.now()}`).digest('hex').slice(0, 32);
    await prisma.embedToken.create({
      data: {
        id: randomUUID(),
        token,
        presentationId,
        createdBy: userId,
        allowedDomains: [domain],
        showControls: true,
        autoPlay: false,
        startSlide: 0,
        theme: 'auto',
      },
    });

    // DNS verification record
    const verificationRecord = `rasid-verify=${createHash('md5').update(`${presentationId}:${domain}`).digest('hex').slice(0, 16)}`;

    logger.info('Published to custom domain', { presentationId, domain });
    res.json({
      success: true,
      data: {
        url: fullUrl,
        domain,
        path: publishPath,
        sslEnabled,
        verificationRecord,
        dnsInstructions: {
          type: 'CNAME',
          name: domain,
          value: `presentations.rasid.app`,
          txtRecord: verificationRecord,
        },
        token,
      },
    });
  })
);

// POST /embed/:presentationId — Get embed code for website
router.post(
  '/embed/:presentationId',
  authMiddleware,
  validate(embedSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    await loadPresentationWithSlides(presentationId, tenantId);

    const token = createHash('sha256').update(`embed:${presentationId}:${Date.now()}:${randomUUID()}`).digest('hex').slice(0, 48);

    const embedToken = await prisma.embedToken.create({
      data: {
        id: randomUUID(),
        token,
        presentationId,
        createdBy: userId,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        allowedDomains: req.body.allowedDomains,
        showControls: req.body.showControls,
        autoPlay: req.body.autoPlay,
        startSlide: req.body.startSlide,
        maxViews: req.body.maxViews || null,
        theme: req.body.theme,
      },
    });

    const embedUrl = `${BASE_URL}/embed/${token}`;
    const iframeCode = `<iframe src="${embedUrl}" width="960" height="540" frameborder="0" allowfullscreen style="border:none;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);"></iframe>`;
    const scriptCode = `<div id="rasid-presentation-${presentationId.slice(0, 8)}"></div><script src="${BASE_URL}/embed.js" data-token="${token}" data-target="rasid-presentation-${presentationId.slice(0, 8)}"></script>`;

    logger.info('Embed code generated', { presentationId, tokenId: embedToken.id });
    res.json({
      success: true,
      data: {
        embedTokenId: embedToken.id,
        token,
        embedUrl,
        iframeCode,
        scriptCode,
        settings: {
          showControls: req.body.showControls,
          autoPlay: req.body.autoPlay,
          startSlide: req.body.startSlide,
          theme: req.body.theme,
          maxViews: req.body.maxViews,
          expiresAt: req.body.expiresAt,
          allowedDomains: req.body.allowedDomains,
        },
      },
    });
  })
);

// POST /share/:presentationId — Share via link
router.post(
  '/share/:presentationId',
  authMiddleware,
  validate(shareSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation } = await loadPresentationWithSlides(presentationId, tenantId);

    const shareToken = createHash('sha256').update(`share:${presentationId}:${Date.now()}:${randomUUID()}`).digest('hex').slice(0, 32);
    const shareUrl = `${BASE_URL}/shared/${shareToken}`;

    // Store share settings in presentation settings
    const currentSettings = (typeof presentation.settings === 'string'
      ? JSON.parse(presentation.settings)
      : presentation.settings) || {};

    const shares = currentSettings.shares || [];
    const shareRecord = {
      id: randomUUID(),
      token: shareToken,
      permission: req.body.permission,
      password: req.body.password ? createHash('sha256').update(req.body.password).digest('hex') : null,
      expiresAt: req.body.expiresAt || null,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      emails: req.body.emails || [],
      message: req.body.message || null,
    };
    shares.push(shareRecord);

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        settings: { ...currentSettings, shares },
        updatedAt: new Date(),
      },
    });

    // Create embed token for the share link
    await prisma.embedToken.create({
      data: {
        id: randomUUID(),
        token: shareToken,
        presentationId,
        createdBy: userId,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        allowedDomains: ['*'],
        showControls: true,
        autoPlay: false,
        startSlide: 0,
        theme: 'auto',
      },
    });

    // Add collaborators if emails provided
    if (req.body.emails && req.body.emails.length > 0) {
      for (const email of req.body.emails) {
        // Find user by email
        const targetUser = await prisma.user.findFirst({ where: { email, tenantId } });
        if (targetUser) {
          await prisma.presentationCollaboration.upsert({
            where: { presentationId_userId: { presentationId, userId: targetUser.id } },
            update: {
              role: req.body.permission === 'edit' ? 'editor' : req.body.permission === 'comment' ? 'commenter' : 'viewer',
              isActive: true,
              updatedAt: new Date(),
            },
            create: {
              id: randomUUID(),
              presentationId,
              userId: targetUser.id,
              role: req.body.permission === 'edit' ? 'editor' : req.body.permission === 'comment' ? 'commenter' : 'viewer',
              isActive: true,
            },
          });
        }
      }
    }

    logger.info('Presentation shared', { presentationId, shareToken, emails: req.body.emails });
    res.json({
      success: true,
      data: {
        shareUrl,
        shareToken,
        permission: req.body.permission,
        passwordProtected: !!req.body.password,
        expiresAt: req.body.expiresAt || null,
        sharedWith: req.body.emails || [],
      },
    });
  })
);

// POST /schedule-snapshot/:presentationId — Schedule periodic snapshots
router.post(
  '/schedule-snapshot/:presentationId',
  authMiddleware,
  validate(scheduleSnapshotSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    await loadPresentationWithSlides(presentationId, tenantId);

    const { schedule, format, channels, name } = req.body;

    // Parse cron to determine next run
    const cronParts = schedule.split(' ');
    let nextRunAt = new Date();
    if (cronParts.length >= 5) {
      const minute = cronParts[0] !== '*' ? parseInt(cronParts[0]) : 0;
      const hour = cronParts[1] !== '*' ? parseInt(cronParts[1]) : nextRunAt.getHours();
      nextRunAt.setHours(hour, minute, 0, 0);
      if (nextRunAt <= new Date()) {
        nextRunAt = new Date(nextRunAt.getTime() + 86400000); // next day
      }
    }

    const task = await prisma.scheduledPresentationTask.create({
      data: {
        id: randomUUID(),
        tenantId,
        userId,
        name,
        taskType: 'snapshot-export',
        schedule,
        config: {
          presentationId,
          format,
          channels,
        },
        isActive: true,
        nextRunAt,
      },
    });

    logger.info('Snapshot schedule created', { presentationId, taskId: task.id, schedule });
    res.status(201).json({
      success: true,
      data: {
        taskId: task.id,
        name,
        schedule,
        format,
        channels,
        nextRunAt: nextRunAt.toISOString(),
        isActive: true,
      },
    });
  })
);

// POST /social-images/:presentationId — Generate social media images
router.post(
  '/social-images/:presentationId',
  authMiddleware,
  validate(socialImagesSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation, slides } = await loadPresentationWithSlides(presentationId, tenantId);
    const { platforms, slideIndices, brandOverlay } = req.body;
    const theme = getTheme(presentation);

    const platformSizes: Record<string, { w: number; h: number }> = {
      linkedin: { w: 1200, h: 627 },
      twitter: { w: 1200, h: 675 },
      facebook: { w: 1200, h: 630 },
      instagram: { w: 1080, h: 1080 },
    };

    const jobId = await createExportJob(presentationId, userId, 'social-images', { platforms });
    const outputDir = path.join(EXPORT_DIR, `social_${jobId}`);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const targetSlides = slideIndices
      ? slides.filter((s) => slideIndices.includes(s.slideIndex))
      : [slides[0]].filter(Boolean);

    const generatedImages: Array<{ platform: string; slideIndex: number; path: string; sizeBytes: number; dimensions: { w: number; h: number } }> = [];

    for (const platform of platforms) {
      const size = platformSizes[platform] || { w: 1200, h: 630 };

      for (const slideData of targetSlides) {
        const elements = getSlideElements(slideData);
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}">`;
        svg += `<rect width="${size.w}" height="${size.h}" fill="${theme.backgroundColor}"/>`;

        const scaleX = size.w / ((presentation.width || 13.33) * 96);
        const scaleY = size.h / ((presentation.height || 7.5) * 96);

        for (const elem of elements) {
          const elemType = (elem.type as string) || '';
          if (elemType === 'text' || elemType.includes('text')) {
            const text = ((elem.text as string) || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const x = ((elem.positionX as number) || (elem.x as number) || 0) * 96 * scaleX;
            const y = ((elem.positionY as number) || (elem.y as number) || 0) * 96 * scaleY;
            const style = (typeof elem.style === 'string' ? JSON.parse(elem.style as string) : elem.style || {}) as Record<string, unknown>;
            const fontSize = Math.round(((style.fontSize as number) || 16) * Math.min(scaleX, scaleY));
            const color = (style.color as string) || theme.primaryColor;
            const fontWeight = (style.bold as boolean) ? 'bold' : 'normal';
            svg += `<text x="${x + 5}" y="${y + fontSize}" font-size="${fontSize}" fill="${color}" font-weight="${fontWeight}" font-family="${theme.fontFamily}, Arial">${text.split('\n')[0] || ''}</text>`;
          } else if (elemType === 'shape' || elemType.includes('shape')) {
            const style = (typeof elem.style === 'string' ? JSON.parse(elem.style as string) : elem.style || {}) as Record<string, unknown>;
            const fillColor = (style.fillColor as string) || theme.primaryColor;
            const x = ((elem.positionX as number) || (elem.x as number) || 0) * 96 * scaleX;
            const y = ((elem.positionY as number) || (elem.y as number) || 0) * 96 * scaleY;
            const w = ((elem.width as number) || (elem.w as number) || 2) * 96 * scaleX;
            const h = ((elem.height as number) || (elem.h as number) || 1) * 96 * scaleY;
            svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fillColor}"/>`;
          }
        }

        if (brandOverlay) {
          // Add brand bar at bottom
          svg += `<rect x="0" y="${size.h - 50}" width="${size.w}" height="50" fill="${theme.primaryColor}" opacity="0.9"/>`;
          svg += `<text x="${size.w - 20}" y="${size.h - 18}" font-size="16" fill="white" text-anchor="end" font-family="Arial">${(presentation.title || presentation.name).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
        }

        svg += '</svg>';

        const imgBuffer = await sharp(Buffer.from(svg))
          .resize(size.w, size.h)
          .png({ quality: 95 })
          .toBuffer();

        const imgName = `${platform}_slide${slideData.slideIndex + 1}.png`;
        const imgPath = path.join(outputDir, imgName);
        fs.writeFileSync(imgPath, imgBuffer);

        generatedImages.push({
          platform,
          slideIndex: slideData.slideIndex,
          path: imgPath,
          sizeBytes: imgBuffer.length,
          dimensions: size,
        });
      }
    }

    await completeExportJob(jobId, outputDir);
    const downloadUrl = `${BASE_URL}/api/v1/presentation/export-publish/download/${jobId}`;

    logger.info('Social images generated', { presentationId, jobId, imageCount: generatedImages.length });
    res.json({
      success: true,
      data: {
        jobId,
        downloadUrl,
        imageCount: generatedImages.length,
        images: generatedImages.map((img) => ({
          platform: img.platform,
          slideIndex: img.slideIndex,
          sizeBytes: img.sizeBytes,
          dimensions: img.dimensions,
        })),
      },
    });
  })
);

// POST /landing-page/:presentationId — Create landing page from presentation
router.post(
  '/landing-page/:presentationId',
  authMiddleware,
  validate(landingPageSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const userId = req.user?.userId || req.user?.id || 'anonymous';
    const { presentationId } = req.params;

    const { presentation, slides } = await loadPresentationWithSlides(presentationId, tenantId);
    const theme = getTheme(presentation);
    const { title, description, ctaText, ctaUrl, headerImage, slidePreviewCount, customCss, collectEmails } = req.body;

    const jobId = await createExportJob(presentationId, userId, 'landing-page');

    // Generate preview images for first N slides
    const previewSlides = slides.slice(0, slidePreviewCount || 3);
    const previewImages: string[] = [];

    for (const slideData of previewSlides) {
      const sw = 800;
      const sh = 450;
      const elements = getSlideElements(slideData);
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}"><rect width="${sw}" height="${sh}" fill="${theme.backgroundColor}"/>`;
      for (const elem of elements) {
        const elemType = (elem.type as string) || '';
        if (elemType === 'text' || elemType.includes('text')) {
          const text = ((elem.text as string) || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const scaleX = sw / ((presentation.width || 13.33) * 96);
          const scaleY = sh / ((presentation.height || 7.5) * 96);
          const x = ((elem.positionX as number) || (elem.x as number) || 0) * 96 * scaleX;
          const y = ((elem.positionY as number) || (elem.y as number) || 0) * 96 * scaleY;
          const style = (typeof elem.style === 'string' ? JSON.parse(elem.style as string) : elem.style || {}) as Record<string, unknown>;
          const fontSize = Math.round(((style.fontSize as number) || 16) * Math.min(scaleX, scaleY));
          svg += `<text x="${x + 5}" y="${y + fontSize}" font-size="${fontSize}" fill="${(style.color as string) || '#333'}" font-family="Arial">${text.split('\n')[0] || ''}</text>`;
        }
      }
      svg += '</svg>';
      const imgBuf = await sharp(Buffer.from(svg)).resize(sw, sh).jpeg({ quality: 85 }).toBuffer();
      previewImages.push(`data:image/jpeg;base64,${imgBuf.toString('base64')}`);
    }

    const escapedTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedDesc = (description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const landingHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapedTitle}</title>
<meta name="description" content="${escapedDesc}">
<meta property="og:title" content="${escapedTitle}">
<meta property="og:description" content="${escapedDesc}">
<meta property="og:type" content="website">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:${theme.fontFamily},'Tajawal',Arial,sans-serif;background:#fafafa;color:#333;direction:rtl;}
.hero{background:linear-gradient(135deg,${theme.primaryColor},${theme.secondaryColor || '#4a90d9'});color:white;padding:80px 20px;text-align:center;}
.hero h1{font-size:2.5em;margin-bottom:20px;}
.hero p{font-size:1.2em;max-width:700px;margin:0 auto 30px;opacity:0.9;line-height:1.6;}
.cta-btn{display:inline-block;background:white;color:${theme.primaryColor};padding:15px 40px;border-radius:30px;text-decoration:none;font-size:1.1em;font-weight:bold;transition:transform 0.2s,box-shadow 0.2s;}
.cta-btn:hover{transform:translateY(-2px);box-shadow:0 5px 20px rgba(0,0,0,0.2);}
.previews{max-width:1100px;margin:60px auto;padding:0 20px;}
.previews h2{font-size:1.8em;text-align:center;margin-bottom:40px;color:${theme.primaryColor};}
.preview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:25px;}
.preview-card{background:white;border-radius:12px;overflow:hidden;box-shadow:0 3px 15px rgba(0,0,0,0.1);transition:transform 0.2s;}
.preview-card:hover{transform:translateY(-5px);}
.preview-card img{width:100%;height:auto;display:block;}
.preview-card .caption{padding:15px;font-size:0.9em;color:#666;}
${collectEmails ? `
.signup{background:${theme.primaryColor};color:white;padding:60px 20px;text-align:center;}
.signup h2{font-size:1.8em;margin-bottom:20px;}
.signup form{display:flex;gap:10px;max-width:500px;margin:0 auto;}
.signup input[type="email"]{flex:1;padding:12px 20px;border:none;border-radius:25px;font-size:1em;}
.signup button{background:white;color:${theme.primaryColor};border:none;padding:12px 30px;border-radius:25px;font-weight:bold;cursor:pointer;}
` : ''}
.footer{text-align:center;padding:30px;color:#999;font-size:0.85em;}
${customCss || ''}
</style>
</head>
<body>
<section class="hero">
${headerImage && previewImages.length > 0 ? '' : ''}
<h1>${escapedTitle}</h1>
${escapedDesc ? `<p>${escapedDesc}</p>` : ''}
${ctaText && ctaUrl ? `<a href="${ctaUrl}" class="cta-btn">${ctaText.replace(/</g, '&lt;')}</a>` : ''}
</section>
<section class="previews">
<h2>Preview</h2>
<div class="preview-grid">
${previewImages.map((img, i) => `<div class="preview-card"><img src="${img}" alt="Slide ${i + 1}"/><div class="caption">Slide ${i + 1}</div></div>`).join('')}
</div>
</section>
${collectEmails ? `
<section class="signup">
<h2>Get Access</h2>
<form onsubmit="event.preventDefault();alert('Thank you!');"><input type="email" placeholder="your@email.com" required/><button type="submit">Subscribe</button></form>
</section>
` : ''}
<footer class="footer">
<p>Built with Rasid Platform</p>
</footer>
</body>
</html>`;

    const fileName = `landing_${sanitizeFilename(title)}_${jobId.slice(0, 8)}.html`;
    const filePath = path.join(EXPORT_DIR, fileName);
    fs.writeFileSync(filePath, landingHtml, 'utf-8');

    const stats = fs.statSync(filePath);
    const downloadUrl = `${BASE_URL}/api/v1/presentation/export-publish/download/${jobId}`;

    // Create a public slug
    const slug = `lp-${presentationId.slice(0, 8)}-${Date.now().toString(36)}`;
    await completeExportJob(jobId, filePath);

    logger.info('Landing page created', { presentationId, jobId, slug });
    res.status(201).json({
      success: true,
      data: {
        jobId,
        slug,
        publicUrl: `${BASE_URL}/lp/${slug}`,
        downloadUrl,
        sizeBytes: stats.size,
        previewSlideCount: previewImages.length,
      },
    });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// DOWNLOAD / STATUS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /download/:jobId — Download exported file
router.get(
  '/download/:jobId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { jobId } = req.params;

    const job = await prisma.presentationExportJob.findUnique({ where: { id: jobId } });
    if (!job) {
      res.status(404).json({ success: false, error: 'Export job not found', code: 'JOB_NOT_FOUND' });
      return;
    }

    if (job.status === 'processing') {
      res.status(202).json({ success: false, error: 'Export still processing', code: 'JOB_PROCESSING', data: { status: 'processing' } });
      return;
    }

    if (job.status === 'failed') {
      res.status(500).json({ success: false, error: job.error || 'Export failed', code: 'JOB_FAILED' });
      return;
    }

    if (!job.outputUrl) {
      res.status(404).json({ success: false, error: 'Export output not found', code: 'OUTPUT_NOT_FOUND' });
      return;
    }

    const outputPath = job.outputUrl;

    // Check if it's a directory (JPEG / social images export)
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
      const files = fs.readdirSync(outputPath);
      if (files.length === 1) {
        const filePath = path.join(outputPath, files[0]);
        const ext = path.extname(files[0]).slice(1);
        const mimeTypes: Record<string, string> = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        };
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${files[0]}"`);
        const fileBuffer = fs.readFileSync(filePath);
        res.setHeader('Content-Length', fileBuffer.length.toString());
        res.send(fileBuffer);
        return;
      }

      // Multiple files — create a zip-like response with base64 data
      const fileList = files.map((f) => {
        const fp = path.join(outputPath, f);
        const buf = fs.readFileSync(fp);
        return { name: f, sizeBytes: buf.length, data: buf.toString('base64') };
      });

      res.json({
        success: true,
        data: {
          jobId,
          format: job.format,
          fileCount: fileList.length,
          files: fileList.map((f) => ({ name: f.name, sizeBytes: f.sizeBytes, base64: f.data })),
        },
      });
      return;
    }

    // Single file
    if (!fs.existsSync(outputPath)) {
      res.status(404).json({ success: false, error: 'Export file has been deleted or expired', code: 'FILE_NOT_FOUND' });
      return;
    }

    const ext = path.extname(outputPath).slice(1);
    const mimeTypes: Record<string, string> = {
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      pdf: 'application/pdf',
      html: 'text/html',
      doc: 'application/msword',
      mp4: 'video/mp4',
      webm: 'video/webm',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
    };

    const fileBuffer = fs.readFileSync(outputPath);
    const fileName = path.basename(outputPath);

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileBuffer.length.toString());
    res.send(fileBuffer);
  })
);

// GET /jobs/:presentationId — List export jobs
router.get(
  '/jobs/:presentationId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.organizationId || req.user?.tenantId || 'default';
    const { presentationId } = req.params;

    // Verify presentation belongs to tenant
    const presentation = await prisma.presentation.findFirst({
      where: { id: presentationId, tenantId },
    });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string | undefined;
    const format = req.query.format as string | undefined;

    const where: Record<string, unknown> = { presentationId };
    if (status) where.status = status;
    if (format) where.format = format;

    const [jobs, total] = await Promise.all([
      prisma.presentationExportJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.presentationExportJob.count({ where }),
    ]);

    res.json({
      success: true,
      data: jobs.map((job) => ({
        id: job.id,
        format: job.format,
        status: job.status,
        downloadUrl: job.status === 'completed' ? `${BASE_URL}/api/v1/presentation/export-publish/download/${job.id}` : null,
        error: job.error,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  })
);

export default router;
