import PptxGenJS from 'pptxgenjs';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

interface PrismaDelegate {
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const EXPORT_DIR = process.env.EXPORT_DIR || path.join(process.cwd(), 'exports');
const EXPORT_TTL_MS = parseInt(process.env.EXPORT_TTL_HOURS || '24', 10) * 60 * 60 * 1000;
const MIN_FILE_SIZE = 100;

interface SlideElement {
  id: string;
  type: 'text' | 'shape' | 'image' | 'chart' | 'table';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style: Record<string, unknown>;
  rotation?: number;
  zIndex?: number;
}

interface Slide {
  id: string;
  order: number;
  title: string;
  notes?: string;
  backgroundColor?: string;
  elements: SlideElement[];
}

interface Presentation {
  id: string;
  title: string;
  userId: string;
  theme?: Record<string, unknown>;
  slides: Slide[];
}

interface ThemeConfig {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  fontFamily?: string;
  titleFontSize?: number;
  bodyFontSize?: number;
  direction?: 'ltr' | 'rtl';
}

interface ExportResult {
  id: string;
  filePath: string;
  sizeBytes: number;
  downloadUrl: string;
  format: string;
  createdAt: string;
  expiresAt: string;
}

export class ExportShareService {
  constructor(private prisma: PrismaClient) {
    if (!fs.existsSync(EXPORT_DIR)) {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }
  }

  async generateExport(
    presentationId: string,
    format: 'pptx' | 'pdf',
    userId: string
  ): Promise<ExportResult> {
    const presentation = await (this.prisma as unknown as Record<string, PrismaDelegate>).presentation.findUnique({
      where: { id: presentationId },
      include: {
        slides: {
          orderBy: { order: 'asc' },
          include: { elements: true },
        },
      },
    });

    if (!presentation) {
      throw new Error(`Presentation not found: ${presentationId}`);
    }

    if (presentation.userId !== userId) {
      throw new Error('Access denied: you do not own this presentation');
    }

    const exportId = uuidv4();
    const presTitle = String(presentation.title || presentation.name || 'export');
    const fileName = `${presTitle.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_')}_${exportId.slice(0, 8)}.${format}`;
    const filePath = path.join(EXPORT_DIR, fileName);

    const theme: ThemeConfig = (presentation.theme as ThemeConfig) || {};
    const presSlides = (presentation.slides as unknown as Slide[]) || [];

    logger.info('Starting export generation', {
      presentationId,
      format,
      userId,
      slideCount: presSlides.length,
    });

    const presObj: Presentation = {
      id: presentation.id as string,
      title: presTitle,
      userId: presentation.userId as string,
      theme: presentation.theme as Record<string, unknown>,
      slides: presSlides,
    };

    if (format === 'pptx') {
      await this.buildPPTX(presObj, theme, filePath);
    } else {
      await this.buildPDF(presObj, theme, filePath);
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Export file was not created: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    if (stats.size < MIN_FILE_SIZE) {
      fs.unlinkSync(filePath);
      throw new Error(`Export file is too small (${stats.size} bytes), likely corrupt`);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + EXPORT_TTL_MS);

    const exportRecord = await (this.prisma as unknown as Record<string, PrismaDelegate>).presentationExportShare.create({
      data: {
        id: exportId,
        presentationId,
        userId,
        exportFormat: format,
        filePath,
        fileName,
        sizeBytes: stats.size,
        expiresAt,
        status: 'completed',
      },
    });

    logger.info('Export generated successfully', {
      exportId,
      filePath,
      sizeBytes: stats.size,
      format,
    });

    return {
      id: exportRecord.id as string,
      filePath,
      sizeBytes: stats.size,
      downloadUrl: `/api/presentations/exports/${exportRecord.id}/download`,
      format,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async buildPPTX(presentation: Presentation, theme: ThemeConfig, filePath: string): Promise<void> {
    const pptx = new PptxGenJS();

    pptx.title = presentation.title;
    pptx.subject = `Exported from RASID Platform`;
    pptx.author = 'RASID Platform';

    if (theme.direction === 'rtl') {
      pptx.rtlMode = true;
    }

    const isArabic = this.containsArabic(presentation.title);
    if (isArabic) {
      pptx.rtlMode = true;
    }

    pptx.layout = 'LAYOUT_WIDE';

    for (const slide of presentation.slides) {
      const pptxSlide = pptx.addSlide();

      if (slide.backgroundColor || theme.backgroundColor) {
        pptxSlide.background = {
          color: (slide.backgroundColor || theme.backgroundColor || '#FFFFFF').replace('#', ''),
        };
      }

      for (const element of slide.elements) {
        const xInches = element.x / 96;
        const yInches = element.y / 96;
        const wInches = element.width / 96;
        const hInches = element.height / 96;

        switch (element.type) {
          case 'text': {
            const textIsArabic = this.containsArabic(element.content);
            const fontSize = Number(element.style.fontSize) || theme.bodyFontSize || 14;
            const fontFace = String(element.style.fontFamily || theme.fontFamily || (textIsArabic ? 'Arial' : 'Calibri'));
            const color = String(element.style.color || theme.primaryColor || '#333333').replace('#', '');
            const bold = Boolean(element.style.bold);
            const italic = Boolean(element.style.italic);
            const align = textIsArabic ? 'right' as const : (String(element.style.textAlign || 'left') as 'left' | 'center' | 'right');

            pptxSlide.addText(element.content, {
              x: xInches,
              y: yInches,
              w: wInches,
              h: hInches,
              fontSize,
              fontFace,
              color,
              bold,
              italic,
              align,
              valign: 'top',
              isTextBox: true,
              rtlMode: textIsArabic,
              rotate: element.rotation || 0,
            });
            break;
          }

          case 'shape': {
            const shapeType = this.mapShapeType(String(element.style.shape || 'rect'));
            const fillColor = String(element.style.fill || theme.secondaryColor || '#4472C4').replace('#', '');
            const lineColor = String(element.style.borderColor || '#2F528F').replace('#', '');
            const lineWidth = Number(element.style.borderWidth) || 1;

            pptxSlide.addShape(shapeType, {
              x: xInches,
              y: yInches,
              w: wInches,
              h: hInches,
              fill: { color: fillColor },
              line: { color: lineColor, width: lineWidth },
              rotate: element.rotation || 0,
            });

            if (element.content) {
              pptxSlide.addText(element.content, {
                x: xInches,
                y: yInches,
                w: wInches,
                h: hInches,
                align: 'center',
                valign: 'middle',
                fontSize: Number(element.style.fontSize) || 12,
                color: String(element.style.color || '#FFFFFF').replace('#', ''),
              });
            }
            break;
          }

          case 'image': {
            if (element.content && fs.existsSync(element.content)) {
              const imageData = fs.readFileSync(element.content);
              const base64 = imageData.toString('base64');
              const ext = path.extname(element.content).slice(1).toLowerCase();
              const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

              pptxSlide.addImage({
                data: `data:${mimeType};base64,${base64}`,
                x: xInches,
                y: yInches,
                w: wInches,
                h: hInches,
                rotate: element.rotation || 0,
              });
            } else if (element.content && element.content.startsWith('data:')) {
              pptxSlide.addImage({
                data: element.content,
                x: xInches,
                y: yInches,
                w: wInches,
                h: hInches,
                rotate: element.rotation || 0,
              });
            }
            break;
          }

          case 'table': {
            try {
              const tableData = JSON.parse(element.content);
              if (Array.isArray(tableData) && tableData.length > 0) {
                const rows: PptxGenJS.TableRow[] = tableData.map((row: string[]) =>
                  row.map((cell: string) => ({
                    text: String(cell),
                    options: {
                      fontSize: 10,
                      border: { type: 'solid' as const, pt: 1, color: '999999' },
                    },
                  }))
                );

                pptxSlide.addTable(rows, {
                  x: xInches,
                  y: yInches,
                  w: wInches,
                  colW: Array(tableData[0].length).fill(wInches / tableData[0].length),
                });
              }
            } catch {
              logger.warn('Failed to parse table data for element', { elementId: element.id });
            }
            break;
          }
        }
      }

      if (slide.notes) {
        pptxSlide.addNotes(slide.notes);
      }
    }

    await pptx.writeFile({ fileName: filePath });

    logger.info('PPTX built', { filePath, slides: presentation.slides.length });
  }

  async buildPDF(presentation: Presentation, theme: ThemeConfig, filePath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size: [960, 540],
        autoFirstPage: false,
        bufferPages: true,
        info: {
          Title: presentation.title,
          Author: 'RASID Platform',
          Creator: 'RASID Export Service',
        },
      });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      writeStream.on('error', (err) => {
        logger.error('PDF write stream error', { error: err.message });
        reject(err);
      });

      for (const slide of presentation.slides) {
        doc.addPage({
          size: [960, 540],
          margin: 0,
        });

        const bgColor = slide.backgroundColor || theme.backgroundColor || '#FFFFFF';
        doc.rect(0, 0, 960, 540).fill(bgColor);

        const sortedElements = [...slide.elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

        for (const element of sortedElements) {
          switch (element.type) {
            case 'text': {
              const fontSize = Number(element.style.fontSize) || theme.bodyFontSize || 14;
              const color = String(element.style.color || theme.primaryColor || '#333333');
              const align = this.containsArabic(element.content) ? 'right' as const : (String(element.style.textAlign || 'left') as 'left' | 'center' | 'right');

              doc.fontSize(fontSize)
                .fillColor(color)
                .text(element.content, element.x, element.y, {
                  width: element.width,
                  height: element.height,
                  align,
                  lineBreak: true,
                  features: this.containsArabic(element.content) ? ['rtla'] : undefined,
                });
              break;
            }

            case 'shape': {
              const fillColor = String(element.style.fill || theme.secondaryColor || '#4472C4');
              const borderColor = String(element.style.borderColor || '#2F528F');
              const lineWidth = Number(element.style.borderWidth) || 1;
              const shapeKind = String(element.style.shape || 'rect');

              doc.save();

              if (shapeKind === 'ellipse' || shapeKind === 'circle') {
                const cx = element.x + element.width / 2;
                const cy = element.y + element.height / 2;
                doc.ellipse(cx, cy, element.width / 2, element.height / 2)
                  .fillAndStroke(fillColor, borderColor);
              } else if (shapeKind === 'roundRect') {
                doc.roundedRect(element.x, element.y, element.width, element.height, 8)
                  .lineWidth(lineWidth)
                  .fillAndStroke(fillColor, borderColor);
              } else {
                doc.rect(element.x, element.y, element.width, element.height)
                  .lineWidth(lineWidth)
                  .fillAndStroke(fillColor, borderColor);
              }

              doc.restore();

              if (element.content) {
                doc.fontSize(Number(element.style.fontSize) || 12)
                  .fillColor(String(element.style.color || '#FFFFFF'))
                  .text(element.content, element.x, element.y + element.height / 2 - 6, {
                    width: element.width,
                    align: 'center',
                  });
              }
              break;
            }

            case 'image': {
              try {
                if (element.content && fs.existsSync(element.content)) {
                  doc.image(element.content, element.x, element.y, {
                    width: element.width,
                    height: element.height,
                    fit: [element.width, element.height],
                  });
                } else if (element.content && element.content.startsWith('data:')) {
                  const base64Data = element.content.split(',')[1];
                  if (base64Data) {
                    const imgBuffer = Buffer.from(base64Data, 'base64');
                    doc.image(imgBuffer, element.x, element.y, {
                      width: element.width,
                      height: element.height,
                      fit: [element.width, element.height],
                    });
                  }
                }
              } catch (imgErr) {
                logger.warn('Failed to embed image in PDF', {
                  elementId: element.id,
                  error: imgErr instanceof Error ? imgErr.message : String(imgErr),
                });
              }
              break;
            }

            case 'table': {
              try {
                const tableData = JSON.parse(element.content) as string[][];
                if (Array.isArray(tableData) && tableData.length > 0) {
                  const colCount = tableData[0].length;
                  const colWidth = element.width / colCount;
                  const rowHeight = 20;

                  for (let rowIdx = 0; rowIdx < tableData.length; rowIdx++) {
                    const row = tableData[rowIdx];
                    const rowY = element.y + rowIdx * rowHeight;

                    for (let colIdx = 0; colIdx < row.length; colIdx++) {
                      const cellX = element.x + colIdx * colWidth;

                      doc.save();
                      doc.rect(cellX, rowY, colWidth, rowHeight)
                        .lineWidth(0.5)
                        .stroke('#999999');

                      if (rowIdx === 0) {
                        doc.rect(cellX, rowY, colWidth, rowHeight).fill('#E8E8E8');
                      }

                      doc.restore();

                      doc.fontSize(9)
                        .fillColor('#333333')
                        .text(String(row[colIdx]), cellX + 4, rowY + 5, {
                          width: colWidth - 8,
                          height: rowHeight - 4,
                          lineBreak: false,
                        });
                    }
                  }
                }
              } catch {
                logger.warn('Failed to render table in PDF', { elementId: element.id });
              }
              break;
            }
          }
        }
      }

      doc.end();

      writeStream.on('finish', () => {
        logger.info('PDF built', { filePath, slides: presentation.slides.length });
        resolve();
      });
    });
  }

  async getDownloadUrl(exportId: string, userId: string): Promise<{
    exportId: string;
    filePath: string;
    fileName: string;
    sizeBytes: number;
    downloadUrl: string;
    contentType: string;
    expiresAt: string;
  }> {
    const exportRecord = await (this.prisma as unknown as Record<string, PrismaDelegate>).presentationExportShare.findUnique({
      where: { id: exportId },
    });

    if (!exportRecord) {
      throw new Error(`Export not found: ${exportId}`);
    }

    if (exportRecord.userId !== userId) {
      throw new Error('Access denied: you do not own this export');
    }

    const recFilePath = exportRecord.filePath as string;
    if (!fs.existsSync(recFilePath)) {
      throw new Error(`Export file no longer exists on disk: ${recFilePath}`);
    }

    const now = new Date();
    const recExpiresAt = exportRecord.expiresAt as Date;
    if (recExpiresAt && new Date(recExpiresAt) < now) {
      throw new Error('Export has expired. Please generate a new export.');
    }

    const stats = fs.statSync(recFilePath);
    const contentType = exportRecord.exportFormat === 'pptx'
      ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      : 'application/pdf';

    return {
      exportId: exportRecord.id as string,
      filePath: recFilePath,
      fileName: exportRecord.fileName as string,
      sizeBytes: stats.size,
      downloadUrl: `/api/presentations/exports/${exportRecord.id}/download`,
      contentType,
      expiresAt: recExpiresAt.toISOString(),
    };
  }

  async cleanupExpired(): Promise<{ deletedCount: number; freedBytes: number }> {
    const now = new Date();

    const expiredRecords = await (this.prisma as unknown as Record<string, PrismaDelegate>).presentationExportShare.findMany({
      where: {
        expiresAt: { lt: now },
      },
    });

    let deletedCount = 0;
    let freedBytes = 0;

    for (const record of expiredRecords) {
      try {
        const recPath = record.filePath as string;
        if (fs.existsSync(recPath)) {
          const stats = fs.statSync(recPath);
          freedBytes += stats.size;
          fs.unlinkSync(recPath);
          logger.info('Deleted expired export file', { filePath: recPath, sizeBytes: stats.size });
        }

        await (this.prisma as unknown as Record<string, PrismaDelegate>).presentationExportShare.delete({
          where: { id: record.id },
        });

        deletedCount++;
      } catch (err) {
        logger.error('Failed to cleanup expired export', {
          exportId: record.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('Expired exports cleanup completed', { deletedCount, freedBytes });
    return { deletedCount, freedBytes };
  }

  private containsArabic(text: string): boolean {
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return arabicPattern.test(text);
  }

  private mapShapeType(shape: string): PptxGenJS.ShapeType {
    const shapeMap: Record<string, string> = {
      rect: 'rect',
      rectangle: 'rect',
      roundRect: 'roundRect',
      ellipse: 'ellipse',
      circle: 'ellipse',
      triangle: 'triangle',
      diamond: 'diamond',
      star: 'star5',
      arrow: 'rightArrow',
      line: 'line',
    };

    return (shapeMap[shape] || 'rect') as unknown as PptxGenJS.ShapeType;
  }
}
