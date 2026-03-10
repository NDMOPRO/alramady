import { PrismaClient } from '@prisma/client';
import Handlebars from 'handlebars';
import PDFDocument from 'pdfkit';
import { Document, Paragraph, TextRun, Table, TableRow, TableCell, Packer, AlignmentType, BorderStyle, WidthType, HeadingLevel, PageBreak, Header, Footer, ImageRun } from 'docx';
import pptxgen from 'pptxgenjs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { NotFoundError, BadRequestError } from '../middleware/errorHandler';
import { cacheDel } from '../utils/redis';

const prisma = new PrismaClient();

interface TemplateVariable {
  name: string;
  type: string;
  defaultValue?: unknown;
}

interface CoverPageConfig {
  title: string;
  subtitle?: string;
  author?: string;
  organization?: string;
  logo?: string;
  date?: string;
  version?: string;
  classification?: string;
  colorScheme?: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

interface DataSourceRef {
  datasetId: string;
  query?: Record<string, unknown>;
}

interface ReportConfig {
  sections: Array<{ id: string; type: string; content: Record<string, any>; position: number; createdAt: string }>;
  header: { logo?: string; title?: string; showPageNumbers: boolean } | null;
  footer: { text?: string; showDate: boolean; showPageNumbers: boolean } | null;
  coverPage: CoverPageConfig | null;
  tableOfContents: Array<{ title: string; page: number; level: number }> | null;
  dataSources: DataSourceRef[];
  metadata: Record<string, any>;
}

export class TemplateEngineService {
  /**
   * Create a Handlebars template, compile to validate syntax, store in DB.
   */
  async createTemplate(
    name: string,
    html: string,
    variables: TemplateVariable[],
    tenantId: string,
    userId: string
  ): Promise<Record<string, unknown>> {
    logger.info('Creating template', { name, tenantId, variableCount: variables.length });

    if (!name || name.trim().length === 0) {
      throw new BadRequestError('Template name is required');
    }

    if (!html || html.trim().length === 0) {
      throw new BadRequestError('Template HTML content is required');
    }

    let compiledTemplate: HandlebarsTemplateDelegate;
    try {
      compiledTemplate = Handlebars.compile(html, { strict: false, noEscape: false });
    } catch (compileError) {
      const compileMsg = compileError instanceof Error ? compileError.message : String(compileError);
      throw new BadRequestError(`Template syntax error: ${compileMsg}`);
    }

    const validatedVariables = variables.map((v) => {
      if (!v.name || v.name.trim().length === 0) {
        throw new BadRequestError('Each variable must have a non-empty name');
      }
      const validTypes = ['string', 'number', 'boolean', 'date', 'array', 'object'];
      if (!validTypes.includes(v.type)) {
        throw new BadRequestError(`Invalid variable type '${v.type}'. Allowed: ${validTypes.join(', ')}`);
      }
      return {
        name: v.name.trim(),
        type: v.type,
        defaultValue: v.defaultValue !== undefined ? v.defaultValue : null,
      };
    });

    const testData: Record<string, unknown> = {};
    for (const variable of validatedVariables) {
      if (variable.defaultValue !== null) {
        testData[variable.name] = variable.defaultValue;
      } else {
        switch (variable.type) {
          case 'string': testData[variable.name] = ''; break;
          case 'number': testData[variable.name] = 0; break;
          case 'boolean': testData[variable.name] = false; break;
          case 'date': testData[variable.name] = new Date().toISOString(); break;
          case 'array': testData[variable.name] = []; break;
          case 'object': testData[variable.name] = {}; break;
        }
      }
    }

    try {
      compiledTemplate(testData);
    } catch (renderError) {
      const renderMsg = renderError instanceof Error ? renderError.message : String(renderError);
      logger.warn('Template test render produced a warning', { error: renderMsg });
    }

    const templateId = uuidv4();

    const template = await prisma.reportTemplate.create({
      data: {
        id: templateId,
        name: name.trim(),
        html,
        variables: JSON.parse(JSON.stringify(validatedVariables)),
        tenantId,
        createdBy: userId,
        updatedBy: userId,
        status: 'active',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    logger.info('Template created successfully', { templateId: template.id, name });

    return {
      id: template.id,
      name: template.name,
      variables: validatedVariables,
      status: template.status,
      version: template.version,
      tenantId: template.tenantId,
      createdBy: template.createdBy,
      createdAt: template.createdAt,
    };
  }

  /**
   * Load template from DB, compile with Handlebars, render with data, return HTML.
   */
  async renderTemplate(templateId: string, data: Record<string, unknown>): Promise<string> {
    logger.info('Rendering template', { templateId, dataKeys: Object.keys(data) });

    const template = await prisma.reportTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundError('Template', templateId);
    }

    const templateRecord = template as unknown as { html: string; variables: TemplateVariable[]; name: string };
    const html = templateRecord.html;
    const variables = templateRecord.variables;

    const mergedData: Record<string, unknown> = {};
    for (const variable of variables) {
      if (data[variable.name] !== undefined) {
        mergedData[variable.name] = data[variable.name];
      } else if (variable.defaultValue !== null && variable.defaultValue !== undefined) {
        mergedData[variable.name] = variable.defaultValue;
      } else {
        mergedData[variable.name] = '';
      }
    }

    Object.keys(data).forEach((key) => {
      if (!(key in mergedData)) {
        mergedData[key] = data[key];
      }
    });

    mergedData['__reportDate'] = new Date().toLocaleDateString();
    mergedData['__reportTimestamp'] = new Date().toISOString();
    mergedData['__templateName'] = templateRecord.name;

    let compiledTemplate: HandlebarsTemplateDelegate;
    try {
      compiledTemplate = Handlebars.compile(html, { strict: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestError(`Failed to compile template: ${message}`);
    }

    const renderedHtml = compiledTemplate(mergedData);

    logger.info('Template rendered successfully', { templateId, outputLength: renderedHtml.length });

    return renderedHtml;
  }

  /**
   * Generate real PDF with pdfkit. Render each section: text paragraphs,
   * tables with borders, charts as described. Add headers, footers, page numbers.
   */
  async exportToPDF(
    reportId: string,
    options?: { pageSize?: string; orientation?: string; margins?: { top: number; bottom: number; left: number; right: number } }
  ): Promise<Buffer> {
    logger.info('Exporting report to PDF', { reportId, options });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const config = report.config as unknown as ReportConfig;
    const pageSize = options?.pageSize || 'A4';
    const orientation = options?.orientation || 'portrait';
    const margins = options?.margins || { top: 72, bottom: 72, left: 72, right: 72 };

    const isLandscape = orientation === 'landscape';
    const doc = new PDFDocument({
      size: pageSize as string,
      layout: isLandscape ? 'landscape' : 'portrait',
      margins,
      bufferPages: true,
      info: {
        Title: (report as unknown as { name: string }).name || 'Report',
        Author: config.metadata?.createdBy || 'RASID Reporting',
        Subject: 'Generated Report',
        CreationDate: new Date(),
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });
      doc.on('error', (err: Error) => reject(err));
    });

    const pageWidth = doc.page.width - margins.left - margins.right;
    let currentPage = 1;

    const drawHeader = () => {
      if (config.header) {
        const savedY = doc.y;
        doc.save();
        doc.fontSize(10).fillColor('#333333');
        if (config.header.title) {
          doc.text(config.header.title, margins.left, margins.top - 30, {
            width: pageWidth,
            align: 'center',
          });
        }
        if (config.header.showPageNumbers) {
          doc.text(`Page ${currentPage}`, margins.left, margins.top - 30, {
            width: pageWidth,
            align: 'right',
          });
        }
        doc.moveTo(margins.left, margins.top - 10)
          .lineTo(margins.left + pageWidth, margins.top - 10)
          .strokeColor('#cccccc')
          .lineWidth(0.5)
          .stroke();
        doc.restore();
        doc.y = savedY;
      }
    };

    const drawFooter = () => {
      if (config.footer) {
        const footerY = doc.page.height - margins.bottom + 15;
        doc.save();
        doc.fontSize(8).fillColor('#666666');
        doc.moveTo(margins.left, footerY - 5)
          .lineTo(margins.left + pageWidth, footerY - 5)
          .strokeColor('#cccccc')
          .lineWidth(0.5)
          .stroke();
        if (config.footer.text) {
          doc.text(config.footer.text, margins.left, footerY, {
            width: pageWidth * 0.5,
            align: 'left',
          });
        }
        const rightParts: string[] = [];
        if (config.footer.showDate) {
          rightParts.push(new Date().toLocaleDateString());
        }
        if (config.footer.showPageNumbers) {
          rightParts.push(`Page ${currentPage}`);
        }
        if (rightParts.length > 0) {
          doc.text(rightParts.join(' | '), margins.left + pageWidth * 0.5, footerY, {
            width: pageWidth * 0.5,
            align: 'right',
          });
        }
        doc.restore();
      }
    };

    // ── Cover Page ──
    if (config.coverPage) {
      const cover = config.coverPage;
      const colors = cover.colorScheme || { primary: '#1a365d', secondary: '#2d3748', accent: '#3182ce' };

      // Background gradient band at top
      doc.save();
      doc.rect(0, 0, doc.page.width, doc.page.height * 0.45)
        .fillColor(colors.primary)
        .fill();

      // Accent stripe
      doc.rect(0, doc.page.height * 0.45, doc.page.width, 6)
        .fillColor(colors.accent)
        .fill();

      // Logo
      if (cover.logo && cover.logo.startsWith('data:image/')) {
        try {
          const base64Data = cover.logo.split(',')[1];
          const logoBuffer = Buffer.from(base64Data, 'base64');
          doc.image(logoBuffer, (doc.page.width - 120) / 2, 60, { width: 120 });
        } catch (logoErr) {
          const logoMsg = logoErr instanceof Error ? logoErr.message : String(logoErr);
          logger.warn('Failed to embed cover logo', { error: logoMsg });
        }
      }

      // Organization name
      if (cover.organization) {
        doc.fontSize(14).fillColor('#ffffff')
          .text(cover.organization, margins.left, 200, {
            width: pageWidth,
            align: 'center',
          });
        doc.moveDown(0.5);
      }

      // Title
      doc.fontSize(32).fillColor('#ffffff')
        .text(cover.title, margins.left, doc.y > 230 ? doc.y : 240, {
          width: pageWidth,
          align: 'center',
        });

      // Subtitle
      if (cover.subtitle) {
        doc.moveDown(0.5);
        doc.fontSize(16).fillColor('#e2e8f0')
          .text(cover.subtitle, margins.left, doc.y, {
            width: pageWidth,
            align: 'center',
          });
      }

      doc.restore();

      // Below the colored band: metadata
      const metaStartY = doc.page.height * 0.55;
      doc.y = metaStartY;

      // Horizontal rule
      doc.moveTo(margins.left + pageWidth * 0.25, metaStartY)
        .lineTo(margins.left + pageWidth * 0.75, metaStartY)
        .strokeColor(colors.accent)
        .lineWidth(1)
        .stroke();

      doc.moveDown(1.5);

      const metaItems: Array<{ label: string; value: string }> = [];
      if (cover.author) metaItems.push({ label: 'Author', value: cover.author });
      if (cover.date) metaItems.push({ label: 'Date', value: cover.date });
      if (cover.version) metaItems.push({ label: 'Version', value: cover.version });

      for (const item of metaItems) {
        doc.fontSize(10).fillColor('#718096')
          .text(item.label, margins.left, doc.y, {
            width: pageWidth,
            align: 'center',
            continued: false,
          });
        doc.fontSize(13).fillColor(colors.secondary)
          .text(item.value, margins.left, doc.y, {
            width: pageWidth,
            align: 'center',
          });
        doc.moveDown(0.8);
      }

      // Classification badge
      if (cover.classification) {
        const badgeY = doc.page.height - margins.bottom - 60;
        doc.fontSize(9).fillColor(colors.accent);
        doc.rect(
          margins.left + pageWidth * 0.3,
          badgeY,
          pageWidth * 0.4,
          24
        ).strokeColor(colors.accent).lineWidth(1).stroke();
        doc.text(cover.classification.toUpperCase(), margins.left, badgeY + 7, {
          width: pageWidth,
          align: 'center',
        });
      }

      // Footer on cover
      doc.fontSize(8).fillColor('#a0aec0')
        .text('Generated by RASID Reporting Service', margins.left, doc.page.height - margins.bottom + 5, {
          width: pageWidth,
          align: 'center',
        });

      // New page after cover
      doc.addPage();
      currentPage++;
    }

    drawHeader();

    if (config.tableOfContents && config.tableOfContents.length > 0) {
      doc.fontSize(18).fillColor('#1a1a1a').text('Table of Contents', { align: 'center' });
      doc.moveDown(1);
      for (const entry of config.tableOfContents) {
        const indent = (entry.level - 1) * 20;
        const entryText = `${'  '.repeat(entry.level - 1)}${entry.title}`;
        const pageText = `Page ${entry.page}`;
        doc.fontSize(11).fillColor('#333333');
        doc.text(entryText, margins.left + indent, doc.y, {
          width: pageWidth - indent - 50,
          continued: false,
        });
        doc.text(pageText, margins.left, doc.y - 14, {
          width: pageWidth,
          align: 'right',
        });
      }
      drawFooter();
      doc.addPage();
      currentPage++;
      drawHeader();
    }

    const sortedSections = [...config.sections].sort((a, b) => a.position - b.position);

    for (const section of sortedSections) {
      const spaceRemaining = doc.page.height - margins.bottom - doc.y;

      if (section.type === 'pagebreak') {
        drawFooter();
        doc.addPage();
        currentPage++;
        drawHeader();
        continue;
      }

      if (spaceRemaining < 80) {
        drawFooter();
        doc.addPage();
        currentPage++;
        drawHeader();
      }

      switch (section.type) {
        case 'text': {
          const textContent = typeof section.content === 'string'
            ? section.content
            : section.content?.text || '';
          const fontSize = section.content?.fontSize || 12;
          const fontColor = section.content?.color || '#000000';

          if (section.content?.title) {
            doc.fontSize(fontSize + 4).fillColor('#1a1a1a')
              .text(section.content.title, { align: 'left' });
            doc.moveDown(0.3);
          }

          doc.fontSize(fontSize).fillColor(fontColor)
            .text(textContent, {
              width: pageWidth,
              align: section.content?.align || 'left',
              lineGap: 4,
            });
          doc.moveDown(0.8);
          break;
        }

        case 'table': {
          const columns = section.content?.columns || [];
          const rows = section.content?.rows || [];
          const colCount = columns.length || 1;
          const colWidth = pageWidth / colCount;
          const rowHeight = 22;
          const headerHeight = 26;
          let tableY = doc.y;

          doc.save();
          doc.rect(margins.left, tableY, pageWidth, headerHeight)
            .fillColor('#2c3e50')
            .fill();

          doc.fillColor('#ffffff').fontSize(10);
          columns.forEach((col: unknown, i: number) => {
            const label = typeof col === 'string' ? col : (col as Record<string, unknown>).label || (col as Record<string, unknown>).field || '';
            doc.text(label, margins.left + i * colWidth + 4, tableY + 6, {
              width: colWidth - 8,
              align: 'left',
            });
          });

          tableY += headerHeight;

          rows.forEach((row: unknown, rowIdx: number) => {
            if (tableY + rowHeight > doc.page.height - margins.bottom) {
              drawFooter();
              doc.addPage();
              currentPage++;
              drawHeader();
              tableY = doc.y;
            }

            const bgColor = rowIdx % 2 === 0 ? '#f8f9fa' : '#ffffff';
            doc.rect(margins.left, tableY, pageWidth, rowHeight)
              .fillColor(bgColor)
              .fill();

            doc.fillColor('#333333').fontSize(9);
            const cells = Array.isArray(row) ? row : columns.map((_c: unknown, i: number) => (row as Record<string, unknown>)[i] || '');
            cells.forEach((cell: unknown, i: number) => {
              doc.text(String(cell ?? ''), margins.left + i * colWidth + 4, tableY + 5, {
                width: colWidth - 8,
                align: 'left',
              });
            });

            doc.rect(margins.left, tableY, pageWidth, rowHeight)
              .strokeColor('#dee2e6')
              .lineWidth(0.5)
              .stroke();

            tableY += rowHeight;
          });

          doc.restore();
          doc.y = tableY + 10;
          doc.moveDown(0.5);
          break;
        }

        case 'chart': {
          if (section.content?.title) {
            doc.fontSize(14).fillColor('#1a1a1a')
              .text(section.content.title, { align: 'center' });
            doc.moveDown(0.3);
          }

          const chartType = section.content?.chartType || 'bar';
          const chartLabels = section.content?.labels || [];
          const chartData = section.content?.data || [];
          const chartHeight = 150;
          const chartStartY = doc.y;
          const barAreaWidth = pageWidth - 60;

          doc.save();

          if (chartType === 'bar' && chartLabels.length > 0) {
            const maxVal = Math.max(...chartData.map(Number), 1);
            const barWidth = Math.min(barAreaWidth / chartLabels.length - 4, 40);

            chartLabels.forEach((label: string, i: number) => {
              const val = Number(chartData[i] || 0);
              const barHeight = (val / maxVal) * (chartHeight - 30);
              const x = margins.left + 50 + i * (barWidth + 4);
              const y = chartStartY + chartHeight - 30 - barHeight;

              const hue = (i * 47) % 360;
              doc.rect(x, y, barWidth, barHeight)
                .fillColor(`hsl(${hue}, 70%, 50%)`)
                .fill();

              doc.fontSize(7).fillColor('#333')
                .text(label, x - 2, chartStartY + chartHeight - 25, {
                  width: barWidth + 4,
                  align: 'center',
                });

              doc.fontSize(7).fillColor('#333')
                .text(String(val), x - 2, y - 12, {
                  width: barWidth + 4,
                  align: 'center',
                });
            });
          } else {
            doc.fontSize(11).fillColor('#666')
              .text(`[${chartType} chart: ${chartLabels.length} data points]`, {
                width: pageWidth,
                align: 'center',
              });
          }

          doc.restore();
          doc.y = chartStartY + chartHeight + 10;
          doc.moveDown(0.5);
          break;
        }

        case 'image': {
          if (section.content?.title) {
            doc.fontSize(12).fillColor('#1a1a1a')
              .text(section.content.title, { align: 'center' });
            doc.moveDown(0.3);
          }

          const imgSrc = section.content?.src || section.content?.url;
          if (imgSrc && typeof imgSrc === 'string') {
            try {
              if (imgSrc.startsWith('data:image/')) {
                const base64Data = imgSrc.split(',')[1];
                const imgBuffer = Buffer.from(base64Data, 'base64');
                const imgWidth = Math.min(section.content?.width || 400, pageWidth);
                doc.image(imgBuffer, { width: imgWidth, align: 'center' as string });
              } else {
                doc.fontSize(10).fillColor('#888')
                  .text(`[Image: ${imgSrc}]`, { align: 'center' });
              }
            } catch (imgErr) {
              const imgMsg = imgErr instanceof Error ? imgErr.message : String(imgErr);
              logger.warn('Failed to embed image in PDF', { error: imgMsg });
              doc.fontSize(10).fillColor('#888')
                .text(`[Image could not be loaded: ${imgSrc}]`, { align: 'center' });
            }
          }
          doc.moveDown(0.8);
          break;
        }
      }
    }

    drawFooter();
    doc.end();

    const pdfBuffer = await pdfPromise;

    await prisma.reportBuildOutput.create({
      data: {
        id: uuidv4(),
        reportId,
        format: 'PDF',
        fileSize: pdfBuffer.length,
        status: 'COMPLETED',
        metadata: JSON.parse(JSON.stringify({
          pageSize,
          orientation,
          pages: currentPage,
          generatedAt: new Date().toISOString(),
        })),
        createdAt: new Date(),
      },
    });

    logger.info('PDF export completed', { reportId, size: pdfBuffer.length, pages: currentPage });

    return pdfBuffer;
  }

  /**
   * Generate real DOCX with docx library.
   */
  async exportToWord(reportId: string, options?: { width?: number; height?: number }): Promise<Buffer> {
    logger.info('Exporting report to DOCX', { reportId });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const config = report.config as unknown as ReportConfig;
    const sortedSections = [...config.sections].sort((a, b) => a.position - b.position);
    const docChildren: (Paragraph | Table)[] = [];

    // ── Cover Page for DOCX ──
    if (config.coverPage) {
      const cover = config.coverPage;

      // Spacer for visual centering
      docChildren.push(new Paragraph({ text: '', spacing: { after: 1200 } }));

      if (cover.organization) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: cover.organization, size: 28, color: '666666', font: 'Calibri' }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          })
        );
      }

      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({ text: cover.title, size: 56, bold: true, color: '1A365D', font: 'Calibri' }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        })
      );

      if (cover.subtitle) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: cover.subtitle, size: 32, color: '4A5568', font: 'Calibri', italics: true }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
          })
        );
      }

      // Horizontal rule via border
      docChildren.push(
        new Paragraph({
          text: '',
          border: { bottom: { color: '3182CE', size: 6, style: BorderStyle.SINGLE, space: 1 } },
          spacing: { after: 600 },
        })
      );

      const metaLines: string[] = [];
      if (cover.author) metaLines.push(`Author: ${cover.author}`);
      if (cover.date) metaLines.push(`Date: ${cover.date}`);
      if (cover.version) metaLines.push(`Version: ${cover.version}`);

      for (const line of metaLines) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: line, size: 22, color: '718096', font: 'Calibri' }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
          })
        );
      }

      if (cover.classification) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: cover.classification.toUpperCase(), size: 20, bold: true, color: '3182CE', font: 'Calibri' }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 200 },
            border: {
              top: { color: '3182CE', size: 1, style: BorderStyle.SINGLE, space: 4 },
              bottom: { color: '3182CE', size: 1, style: BorderStyle.SINGLE, space: 4 },
            },
          })
        );
      }

      // Page break after cover
      docChildren.push(new Paragraph({ text: '', pageBreakBefore: true }));
    }

    docChildren.push(
      new Paragraph({
        text: (report as unknown as { name: string }).name || 'Report',
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      })
    );

    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Generated: ${new Date().toLocaleDateString()} | `,
            size: 18,
            color: '888888',
          }),
          new TextRun({
            text: `Author: ${config.metadata?.createdBy || 'RASID'}`,
            size: 18,
            color: '888888',
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );

    if (config.tableOfContents && config.tableOfContents.length > 0) {
      docChildren.push(
        new Paragraph({
          text: 'Table of Contents',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 200 },
        })
      );

      for (const entry of config.tableOfContents) {
        const indent = (entry.level - 1) * 360;
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: entry.title, size: 22 }),
              new TextRun({ text: `  .....  Page ${entry.page}`, size: 22, color: '888888' }),
            ],
            indent: { left: indent },
            spacing: { after: 60 },
          })
        );
      }

      docChildren.push(
        new Paragraph({ text: '', pageBreakBefore: true })
      );
    }

    for (const section of sortedSections) {
      switch (section.type) {
        case 'text': {
          const textContent = typeof section.content === 'string'
            ? section.content
            : section.content?.text || '';
          const title = section.content?.title;

          if (title) {
            docChildren.push(
              new Paragraph({
                text: title,
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 240, after: 120 },
              })
            );
          }

          const paragraphs = textContent.split('\n').filter((p: string) => p.trim().length > 0);
          for (const para of paragraphs) {
            docChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: para.trim(),
                    size: section.content?.fontSize ? section.content.fontSize * 2 : 24,
                    font: 'Calibri',
                  }),
                ],
                spacing: { after: 120 },
              })
            );
          }
          break;
        }

        case 'table': {
          const columns = section.content?.columns || [];
          const rows = section.content?.rows || [];

          if (section.content?.title) {
            docChildren.push(
              new Paragraph({
                text: section.content.title,
                heading: HeadingLevel.HEADING_3,
                spacing: { before: 200, after: 120 },
              })
            );
          }

          const headerCells = columns.map((col: unknown) => {
            const label = typeof col === 'string' ? col : (col as Record<string, unknown>).label || (col as Record<string, unknown>).field || '';
            return new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: label, bold: true, size: 20, color: 'FFFFFF', font: 'Calibri' }),
                  ],
                  alignment: AlignmentType.CENTER,
                }),
              ],
              shading: { fill: '2C3E50' },
              width: { size: Math.floor(9000 / (columns.length || 1)), type: WidthType.DXA },
            });
          });

          const tableRows: TableRow[] = [new TableRow({ children: headerCells })];

          rows.forEach((row: unknown, rowIdx: number) => {
            const cells = Array.isArray(row)
              ? row
              : columns.map((_c: unknown, i: number) => (row as Record<string, unknown>)[i] || '');

            const rowCells = cells.map((cell: unknown) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: String(cell ?? ''), size: 20, font: 'Calibri' }),
                    ],
                  }),
                ],
                shading: { fill: rowIdx % 2 === 0 ? 'F8F9FA' : 'FFFFFF' },
                width: { size: Math.floor(9000 / (columns.length || 1)), type: WidthType.DXA },
              })
            );

            tableRows.push(new TableRow({ children: rowCells }));
          });

          if (tableRows.length > 0) {
            docChildren.push(
              new Table({
                rows: tableRows,
                width: { size: 9000, type: WidthType.DXA },
              })
            );
            docChildren.push(new Paragraph({ text: '', spacing: { after: 200 } }));
          }
          break;
        }

        case 'chart': {
          docChildren.push(
            new Paragraph({
              text: section.content?.title || 'Chart',
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 200, after: 120 },
            })
          );

          const chartLabels = section.content?.labels || [];
          const chartData = section.content?.data || [];
          const chartDesc = chartLabels.map((lbl: string, i: number) =>
            `${lbl}: ${chartData[i] || 0}`
          ).join(' | ');

          docChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[${section.content?.chartType || 'bar'} chart] ${chartDesc}`,
                  size: 20,
                  italics: true,
                  color: '666666',
                }),
              ],
              spacing: { after: 200 },
              alignment: AlignmentType.CENTER,
            })
          );
          break;
        }

        case 'image': {
          docChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[Image: ${section.content?.alt || section.content?.src || 'embedded'}]`,
                  size: 20,
                  color: '888888',
                  italics: true,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 200, after: 200 },
            })
          );
          break;
        }

        case 'pagebreak': {
          docChildren.push(
            new Paragraph({ text: '', pageBreakBefore: true })
          );
          break;
        }
      }
    }

    const headerChildren: Paragraph[] = [];
    if (config.header?.title) {
      headerChildren.push(
        new Paragraph({
          children: [new TextRun({ text: config.header.title, size: 16, color: '888888' })],
          alignment: AlignmentType.CENTER,
        })
      );
    }

    const footerChildren: Paragraph[] = [];
    if (config.footer?.text) {
      footerChildren.push(
        new Paragraph({
          children: [new TextRun({ text: config.footer.text, size: 16, color: '888888' })],
          alignment: AlignmentType.LEFT,
        })
      );
    }
    if (config.footer?.showDate) {
      footerChildren.push(
        new Paragraph({
          children: [new TextRun({ text: new Date().toLocaleDateString(), size: 16, color: '888888' })],
          alignment: AlignmentType.RIGHT,
        })
      );
    }

    const docDefinition = new Document({
      creator: 'RASID Reporting Service',
      title: (report as unknown as { name: string }).name || 'Report',
      description: 'Auto-generated report',
      sections: [
        {
          properties: {
            page: {
              size: {
                width: options?.width || 12240,
                height: options?.height || 15840,
              },
              margin: {
                top: 1440,
                right: 1440,
                bottom: 1440,
                left: 1440,
              },
            },
          },
          headers: headerChildren.length > 0
            ? { default: new Header({ children: headerChildren }) }
            : undefined,
          footers: footerChildren.length > 0
            ? { default: new Footer({ children: footerChildren }) }
            : undefined,
          children: docChildren,
        },
      ],
    });

    const docxBuffer = await Packer.toBuffer(docDefinition);

    await prisma.reportBuildOutput.create({
      data: {
        id: uuidv4(),
        reportId,
        format: 'DOCX',
        fileSize: docxBuffer.length,
        status: 'COMPLETED',
        metadata: JSON.parse(JSON.stringify({
          sectionCount: sortedSections.length,
          generatedAt: new Date().toISOString(),
        })),
        createdAt: new Date(),
      },
    });

    logger.info('DOCX export completed', { reportId, size: docxBuffer.length });

    return docxBuffer;
  }

  /**
   * Generate standalone HTML with inline CSS.
   */
  async exportToHTML(reportId: string): Promise<string> {
    logger.info('Exporting report to HTML', { reportId });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const config = report.config as unknown as ReportConfig;
    const sortedSections = [...config.sections].sort((a, b) => a.position - b.position);

    const headerHtml = config.header
      ? `<header style="border-bottom:2px solid #2c3e50;padding:10px 0;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
          ${config.header.logo ? `<img src="${config.header.logo}" alt="Logo" style="height:40px;" />` : ''}
          ${config.header.title ? `<h2 style="margin:0;color:#2c3e50;">${config.header.title}</h2>` : ''}
          ${config.header.showPageNumbers ? '<span style="color:#888;font-size:12px;">Page 1</span>' : ''}
         </header>`
      : '';

    const footerHtml = config.footer
      ? `<footer style="border-top:1px solid #ccc;padding:10px 0;margin-top:30px;display:flex;justify-content:space-between;font-size:12px;color:#888;">
          <span>${config.footer.text || ''}</span>
          <span>${[
            config.footer.showDate ? new Date().toLocaleDateString() : '',
            config.footer.showPageNumbers ? 'Page 1' : '',
          ].filter(Boolean).join(' | ')}</span>
         </footer>`
      : '';

    let tocHtml = '';
    if (config.tableOfContents && config.tableOfContents.length > 0) {
      tocHtml = `<nav style="background:#f8f9fa;padding:20px;border-radius:8px;margin-bottom:30px;">
        <h3 style="margin-top:0;color:#2c3e50;">Table of Contents</h3>
        <ul style="list-style:none;padding:0;">
          ${config.tableOfContents.map((e) =>
            `<li style="padding:4px 0;padding-left:${(e.level - 1) * 20}px;">
              <span style="color:#333;">${e.title}</span>
              <span style="float:right;color:#888;">Page ${e.page}</span>
            </li>`
          ).join('')}
        </ul>
      </nav>`;
    }

    let bodyHtml = '';
    for (const section of sortedSections) {
      switch (section.type) {
        case 'text': {
          const text = typeof section.content === 'string' ? section.content : section.content?.text || '';
          const title = section.content?.title;
          bodyHtml += `<section style="margin-bottom:24px;">`;
          if (title) bodyHtml += `<h3 style="color:#2c3e50;margin-bottom:8px;">${title}</h3>`;
          bodyHtml += `<p style="line-height:1.6;color:#333;font-size:14px;">${text.replace(/\n/g, '<br/>')}</p>`;
          bodyHtml += `</section>`;
          break;
        }
        case 'table': {
          const columns = section.content?.columns || [];
          const rows = section.content?.rows || [];
          bodyHtml += `<section style="margin-bottom:24px;">`;
          if (section.content?.title) bodyHtml += `<h4 style="color:#2c3e50;">${section.content.title}</h4>`;
          bodyHtml += `<table style="width:100%;border-collapse:collapse;border:1px solid #dee2e6;font-size:13px;">`;
          bodyHtml += `<thead><tr style="background:#2c3e50;color:#fff;">`;
          columns.forEach((col: unknown) => {
            const label = typeof col === 'string' ? col : (col as Record<string, unknown>).label || (col as Record<string, unknown>).field || '';
            bodyHtml += `<th style="padding:10px 8px;text-align:left;border:1px solid #dee2e6;">${label}</th>`;
          });
          bodyHtml += `</tr></thead><tbody>`;
          rows.forEach((row: unknown, idx: number) => {
            const bg = idx % 2 === 0 ? '#f8f9fa' : '#ffffff';
            const cells = Array.isArray(row) ? row : columns.map((_c: unknown, i: number) => (row as Record<string, unknown>)[i] || '');
            bodyHtml += `<tr style="background:${bg};">`;
            cells.forEach((cell: unknown) => {
              bodyHtml += `<td style="padding:8px;border:1px solid #dee2e6;">${cell ?? ''}</td>`;
            });
            bodyHtml += `</tr>`;
          });
          bodyHtml += `</tbody></table></section>`;
          break;
        }
        case 'chart': {
          bodyHtml += `<section style="margin-bottom:24px;text-align:center;">`;
          if (section.content?.title) bodyHtml += `<h4 style="color:#2c3e50;">${section.content.title}</h4>`;
          bodyHtml += `<div style="background:#f8f9fa;padding:30px;border-radius:8px;color:#888;font-style:italic;">`;
          bodyHtml += `[${section.content?.chartType || 'bar'} chart visualization]`;
          bodyHtml += `</div></section>`;
          break;
        }
        case 'image': {
          const src = section.content?.src || section.content?.url || '';
          const alt = section.content?.alt || 'Report image';
          bodyHtml += `<section style="margin-bottom:24px;text-align:center;">`;
          if (src) {
            bodyHtml += `<img src="${src}" alt="${alt}" style="max-width:100%;height:auto;border-radius:4px;" />`;
          } else {
            bodyHtml += `<div style="padding:30px;background:#f0f0f0;color:#888;text-align:center;border:1px dashed #ccc;border-radius:4px;">[No image source provided]</div>`;
          }
          bodyHtml += `</section>`;
          break;
        }
        case 'pagebreak': {
          bodyHtml += `<div style="page-break-after:always;"></div>`;
          break;
        }
      }
    }

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${(report as unknown as { name: string }).name || 'Report'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 900px; margin: 0 auto; padding: 30px; background: #fff; color: #333; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  ${headerHtml}
  <h1 style="text-align:center;color:#1a1a1a;margin-bottom:5px;">${(report as unknown as { name: string }).name || 'Report'}</h1>
  <p style="text-align:center;color:#888;margin-bottom:30px;font-size:13px;">Generated: ${new Date().toLocaleString()}</p>
  ${tocHtml}
  ${bodyHtml}
  ${footerHtml}
</body>
</html>`;

    await prisma.reportBuildOutput.create({
      data: {
        id: uuidv4(),
        reportId,
        format: 'HTML',
        fileSize: Buffer.byteLength(fullHtml, 'utf8'),
        status: 'COMPLETED',
        metadata: JSON.parse(JSON.stringify({ generatedAt: new Date().toISOString() })),
        createdAt: new Date(),
      },
    });

    logger.info('HTML export completed', { reportId, size: fullHtml.length });

    return fullHtml;
  }

  /**
   * Export data tables as XLSX (using a simplified CSV-based approach for the xlsx format).
   */
  async exportToExcel(reportId: string): Promise<Buffer> {
    logger.info('Exporting report to Excel', { reportId });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const config = report.config as unknown as ReportConfig;
    const tableSections = config.sections
      .filter((s) => s.type === 'table')
      .sort((a, b) => a.position - b.position);

    if (tableSections.length === 0) {
      throw new BadRequestError('Report has no table sections to export as Excel');
    }

    const worksheets: Array<{ name: string; headers: string[]; rows: string[][] }> = [];

    for (const section of tableSections) {
      const columns = section.content?.columns || [];
      const rows = section.content?.rows || [];
      const sheetName = (section.content?.title || `Table_${section.position}`).substring(0, 31);

      const headers = columns.map((col: unknown) =>
        typeof col === 'string' ? col : (col as Record<string, unknown>).label || (col as Record<string, unknown>).field || ''
      );

      const dataRows = rows.map((row: unknown) => {
        const cells = Array.isArray(row) ? row : columns.map((_c: unknown, i: number) => (row as Record<string, unknown>)[i] || '');
        return cells.map((cell: unknown) => String(cell ?? ''));
      });

      worksheets.push({ name: sheetName, headers, rows: dataRows });
    }

    const xlsxParts: string[] = [];
    xlsxParts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    xlsxParts.push('<?mso-application progid="Excel.Sheet"?>');
    xlsxParts.push('<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"');
    xlsxParts.push(' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">');

    xlsxParts.push('<Styles>');
    xlsxParts.push('<Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2C3E50" ss:Pattern="Solid"/></Style>');
    xlsxParts.push('<Style ss:ID="even"><Interior ss:Color="#F8F9FA" ss:Pattern="Solid"/></Style>');
    xlsxParts.push('<Style ss:ID="odd"><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style>');
    xlsxParts.push('</Styles>');

    for (const sheet of worksheets) {
      xlsxParts.push(`<Worksheet ss:Name="${sheet.name}">`);
      xlsxParts.push(`<Table ss:ExpandedColumnCount="${sheet.headers.length}" ss:ExpandedRowCount="${sheet.rows.length + 1}">`);

      xlsxParts.push('<Row>');
      for (const header of sheet.headers) {
        const escaped = header.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        xlsxParts.push(`<Cell ss:StyleID="header"><Data ss:Type="String">${escaped}</Data></Cell>`);
      }
      xlsxParts.push('</Row>');

      sheet.rows.forEach((row, rowIdx) => {
        const styleId = rowIdx % 2 === 0 ? 'even' : 'odd';
        xlsxParts.push('<Row>');
        for (const cell of row) {
          const escaped = cell.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const isNumeric = !isNaN(Number(cell)) && cell.trim().length > 0;
          const dataType = isNumeric ? 'Number' : 'String';
          xlsxParts.push(`<Cell ss:StyleID="${styleId}"><Data ss:Type="${dataType}">${escaped}</Data></Cell>`);
        }
        xlsxParts.push('</Row>');
      });

      xlsxParts.push('</Table>');
      xlsxParts.push('</Worksheet>');
    }

    xlsxParts.push('</Workbook>');

    const xmlContent = xlsxParts.join('\n');
    const excelBuffer = Buffer.from(xmlContent, 'utf8');

    await prisma.reportBuildOutput.create({
      data: {
        id: uuidv4(),
        reportId,
        format: 'XLSX',
        fileSize: excelBuffer.length,
        status: 'COMPLETED',
        metadata: JSON.parse(JSON.stringify({
          sheetCount: worksheets.length,
          totalRows: worksheets.reduce((sum, s) => sum + s.rows.length, 0),
          generatedAt: new Date().toISOString(),
        })),
        createdAt: new Date(),
      },
    });

    logger.info('Excel export completed', { reportId, size: excelBuffer.length, sheets: worksheets.length });

    return excelBuffer;
  }
  /**
   * Export report as a PowerPoint presentation using pptxgenjs.
   * Creates slides from report sections with professional styling.
   */
  async exportToPowerPoint(
    reportId: string,
    options?: { theme?: string; slideWidth?: number; slideHeight?: number }
  ): Promise<Buffer> {
    logger.info('Exporting report to PowerPoint', { reportId });

    const report = await prisma.reportDefinition.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report', reportId);
    }

    const config = report.config as unknown as ReportConfig;
    const sortedSections = [...config.sections].sort((a, b) => a.position - b.position);

    const pptx = new pptxgen();
    pptx.author = config.metadata?.createdBy || 'RASID';
    pptx.company = 'RASID Reporting';
    pptx.subject = (report as unknown as { name: string }).name || 'Report';
    pptx.title = (report as unknown as { name: string }).name || 'Report';

    if (options?.slideWidth) pptx.defineLayout({ name: 'CUSTOM', width: options.slideWidth, height: options.slideHeight || 7.5 });

    const primaryColor = '1A365D';
    const accentColor = '3182CE';
    const textColor = '333333';
    const lightBg = 'F7FAFC';

    // ── Cover Slide ──
    if (config.coverPage) {
      const cover = config.coverPage;
      const coverSlide = pptx.addSlide();
      const coverColors = cover.colorScheme || { primary: '#1a365d', secondary: '#2d3748', accent: '#3182ce' };
      const pptPrimary = coverColors.primary.replace('#', '');
      const pptAccent = coverColors.accent.replace('#', '');

      coverSlide.background = { color: pptPrimary };

      if (cover.organization) {
        coverSlide.addText(cover.organization, {
          x: 0.5, y: 0.8, w: 9, h: 0.6,
          fontSize: 14, color: 'CCCCCC', align: 'center', fontFace: 'Calibri',
        });
      }

      coverSlide.addText(cover.title, {
        x: 0.5, y: 2.0, w: 9, h: 1.4,
        fontSize: 36, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri',
      });

      if (cover.subtitle) {
        coverSlide.addText(cover.subtitle, {
          x: 0.5, y: 3.5, w: 9, h: 0.8,
          fontSize: 18, color: 'E2E8F0', align: 'center', fontFace: 'Calibri', italic: true,
        });
      }

      // Accent line
      coverSlide.addShape(pptx.ShapeType.rect, {
        x: 2.5, y: 4.5, w: 5, h: 0.05, fill: { color: pptAccent },
      });

      const metaParts: string[] = [];
      if (cover.author) metaParts.push(`Author: ${cover.author}`);
      if (cover.date) metaParts.push(cover.date);
      if (cover.version) metaParts.push(`v${cover.version}`);

      if (metaParts.length > 0) {
        coverSlide.addText(metaParts.join('  |  '), {
          x: 0.5, y: 5.0, w: 9, h: 0.5,
          fontSize: 11, color: 'A0AEC0', align: 'center', fontFace: 'Calibri',
        });
      }

      if (cover.classification) {
        coverSlide.addText(cover.classification.toUpperCase(), {
          x: 3.0, y: 6.0, w: 4, h: 0.4,
          fontSize: 10, bold: true, color: pptAccent, align: 'center', fontFace: 'Calibri',
          ...({ border: { pt: 1, color: pptAccent } } as Record<string, unknown>),
        });
      }

      coverSlide.addText('Generated by RASID Reporting Service', {
        x: 0.5, y: 6.8, w: 9, h: 0.3,
        fontSize: 8, color: '888888', align: 'center', fontFace: 'Calibri',
      });
    } else {
      // Default title slide
      const titleSlide = pptx.addSlide();
      titleSlide.background = { color: primaryColor };
      titleSlide.addText((report as unknown as { name: string }).name || 'Report', {
        x: 0.5, y: 2.0, w: 9, h: 1.5,
        fontSize: 36, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri',
      });
      titleSlide.addText(`Generated: ${new Date().toLocaleDateString()}`, {
        x: 0.5, y: 4.0, w: 9, h: 0.5,
        fontSize: 12, color: 'AAAAAA', align: 'center', fontFace: 'Calibri',
      });
    }

    // ── Table of Contents Slide ──
    if (config.tableOfContents && config.tableOfContents.length > 0) {
      const tocSlide = pptx.addSlide();
      tocSlide.addText('Table of Contents', {
        x: 0.5, y: 0.3, w: 9, h: 0.6,
        fontSize: 24, bold: true, color: primaryColor, fontFace: 'Calibri',
      });

      const tocRows: pptxgen.TableRow[] = config.tableOfContents.map((entry) => {
        const indent = '  '.repeat(entry.level - 1);
        return [
          { text: `${indent}${entry.title}`, options: { fontSize: 12, color: textColor, fontFace: 'Calibri' } },
          { text: `Page ${entry.page}`, options: { fontSize: 12, color: '888888', align: 'right' as const, fontFace: 'Calibri' } },
        ];
      });

      tocSlide.addTable(tocRows, {
        x: 0.5, y: 1.2, w: 9, h: 5.5,
        border: { pt: 0, color: 'FFFFFF' },
        colW: [7, 2],
        rowH: 0.35,
        autoPage: true,
        autoPageRepeatHeader: false,
      });
    }

    // ── Content Slides ──
    for (const section of sortedSections) {
      if (section.type === 'pagebreak') continue;

      const slide = pptx.addSlide();

      // Slide header bar
      slide.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: '100%', h: 0.06, fill: { color: accentColor },
      });

      switch (section.type) {
        case 'text': {
          const title = section.content?.title;
          const textContent = typeof section.content === 'string'
            ? section.content
            : section.content?.text || '';

          if (title) {
            slide.addText(title, {
              x: 0.5, y: 0.3, w: 9, h: 0.6,
              fontSize: 22, bold: true, color: primaryColor, fontFace: 'Calibri',
            });
          }

          slide.addText(textContent, {
            x: 0.5, y: title ? 1.1 : 0.5, w: 9, h: 5.5,
            fontSize: 14, color: textColor, fontFace: 'Calibri',
            valign: 'top', wrap: true,
          });
          break;
        }

        case 'table': {
          const columns = section.content?.columns || [];
          const rows = section.content?.rows || [];
          const tableTitle = section.content?.title;

          if (tableTitle) {
            slide.addText(tableTitle, {
              x: 0.5, y: 0.3, w: 9, h: 0.5,
              fontSize: 20, bold: true, color: primaryColor, fontFace: 'Calibri',
            });
          }

          const headerRow: pptxgen.TableRow = columns.map((col: unknown) => {
            const label = typeof col === 'string' ? col : (col as Record<string, unknown>).label || (col as Record<string, unknown>).field || '';
            return {
              text: label,
              options: {
                bold: true, fontSize: 10, color: 'FFFFFF', fill: { color: primaryColor },
                fontFace: 'Calibri', align: 'center' as const, valign: 'middle' as const,
              },
            };
          });

          const dataRows: pptxgen.TableRow[] = rows.map((row: unknown, rowIdx: number) => {
            const cells = Array.isArray(row) ? row : columns.map((_c: unknown, i: number) => (row as Record<string, unknown>)[i] || '');
            return cells.map((cell: unknown) => ({
              text: String(cell ?? ''),
              options: {
                fontSize: 9, color: textColor,
                fill: { color: rowIdx % 2 === 0 ? lightBg : 'FFFFFF' },
                fontFace: 'Calibri', valign: 'middle' as const,
              },
            }));
          });

          const allRows = [headerRow, ...dataRows];
          const colCount = columns.length || 1;
          const colW = Array(colCount).fill(9 / colCount);

          slide.addTable(allRows, {
            x: 0.5, y: tableTitle ? 1.0 : 0.5, w: 9,
            border: { pt: 0.5, color: 'DEE2E6' },
            colW,
            rowH: 0.3,
            autoPage: true,
            autoPageRepeatHeader: true,
          });
          break;
        }

        case 'chart': {
          const chartTitle = section.content?.title || 'Chart';
          const chartType = section.content?.chartType || 'bar';
          const chartLabels = section.content?.labels || [];
          const chartData = section.content?.data || [];

          slide.addText(chartTitle, {
            x: 0.5, y: 0.3, w: 9, h: 0.5,
            fontSize: 20, bold: true, color: primaryColor, fontFace: 'Calibri',
          });

          const chartDataConfig: pptxgen.OptsChartData[] = [{
            name: chartTitle,
            labels: chartLabels.length > 0 ? chartLabels : ['No data'],
            values: chartData.length > 0 ? chartData.map(Number) : [0],
          }];

          let pptxChartType: pptxgen.CHART_NAME;
          switch (chartType) {
            case 'line': pptxChartType = pptx.ChartType.line; break;
            case 'pie': pptxChartType = pptx.ChartType.pie; break;
            case 'doughnut': pptxChartType = pptx.ChartType.doughnut; break;
            case 'scatter': pptxChartType = pptx.ChartType.scatter; break;
            case 'area': pptxChartType = pptx.ChartType.area; break;
            case 'radar': pptxChartType = pptx.ChartType.radar; break;
            default: pptxChartType = pptx.ChartType.bar; break;
          }

          slide.addChart(pptxChartType, chartDataConfig, {
            x: 0.5, y: 1.0, w: 9, h: 5.5,
            showTitle: false,
            showValue: true,
            showLegend: true,
            legendPos: 'b',
            catAxisOrientation: 'minMax',
            valAxisOrientation: 'minMax',
          });
          break;
        }

        case 'image': {
          const imgTitle = section.content?.title || section.content?.alt || 'Image';

          slide.addText(imgTitle, {
            x: 0.5, y: 0.3, w: 9, h: 0.5,
            fontSize: 20, bold: true, color: primaryColor, fontFace: 'Calibri',
          });

          const imgSrc = section.content?.src || section.content?.url;
          if (imgSrc && imgSrc.startsWith('data:image/')) {
            slide.addImage({
              data: imgSrc,
              x: 1, y: 1.2, w: 8, h: 5,
              sizing: { type: 'contain', w: 8, h: 5 },
            });
          } else {
            slide.addText(`[Image: ${imgSrc || 'not available'}]`, {
              x: 1, y: 3, w: 8, h: 1,
              fontSize: 12, color: '888888', align: 'center', fontFace: 'Calibri', italic: true,
            });
          }
          break;
        }
      }

      // Slide footer
      slide.addText(`${(report as unknown as { name: string }).name || 'Report'} | ${new Date().toLocaleDateString()}`, {
        x: 0.5, y: 6.9, w: 9, h: 0.3,
        fontSize: 8, color: '888888', align: 'center', fontFace: 'Calibri',
      });
    }

    const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;

    await prisma.reportBuildOutput.create({
      data: {
        id: uuidv4(),
        reportId,
        format: 'PPTX',
        fileSize: pptxBuffer.length,
        status: 'COMPLETED',
        metadata: JSON.parse(JSON.stringify({
          slideCount: sortedSections.filter(s => s.type !== 'pagebreak').length + 1,
          hasCoverPage: !!config.coverPage,
          hasTableOfContents: !!(config.tableOfContents && config.tableOfContents.length > 0),
          generatedAt: new Date().toISOString(),
        })),
        createdAt: new Date(),
      },
    });

    logger.info('PowerPoint export completed', { reportId, size: pptxBuffer.length });

    return pptxBuffer;
  }

  /**
   * Render a report of the given type with the provided data and output format.
   * Returns a Buffer of the rendered content.
   */
  async renderReport(
    _reportType: string,
    data: Record<string, unknown>,
    outputFormat: 'pdf' | 'docx' | 'html' | string,
  ): Promise<Buffer> {
    const html = Handlebars.compile(
      `<html><body><h1>{{title}}</h1><pre>{{json summary}}</pre></body></html>`,
    )({ title: data.title, summary: JSON.stringify(data.summary ?? data, null, 2) });

    if (outputFormat === 'html') {
      return Buffer.from(html, 'utf-8');
    }

    if (outputFormat === 'docx') {
      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({ children: [new TextRun({ text: String(data.title ?? ''), bold: true })] }),
            new Paragraph({ children: [new TextRun(JSON.stringify(data.summary ?? data, null, 2))] }),
          ],
        }],
      });
      return await Packer.toBuffer(doc) as Buffer;
    }

    // Default: PDF
    const doc = new PDFDocument({ size: 'A4' });
    const chunks: Buffer[] = [];
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.fontSize(18).text(String(data.title ?? ''), { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(JSON.stringify(data.summary ?? data, null, 2));
    doc.end();

    return pdfPromise;
  }
}

export const templateEngineService = new TemplateEngineService();
