import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { reportBuilderService } from '../services/report-builder.service';
import { templateEngineService } from '../services/template-engine.service';
import { scheduledReportsService } from '../services/scheduled-reports.service';
import { deleteRuntimeReportRecord } from '../services/report-runtime-record.service';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

const router = Router();

// ─── Zod Schemas ──────────────────────────────────────────────────

const createReportSchema = z.object({
  name: z.string().min(1).max(255),
  templateId: z.string().uuid().nullable().optional().default(null),
  dataSources: z.array(z.object({
    datasetId: z.string().uuid(),
    query: z.record(z.unknown()).optional(),
  })).min(1, 'At least one data source is required'),
  tenantId: z.string().min(1).optional(),
});

const updateReportSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  templateId: z.string().uuid().nullable().optional(),
  dataSources: z.array(z.object({
    datasetId: z.string().uuid(),
    query: z.record(z.unknown()).optional(),
  })).optional(),
  status: z.string().optional(),
});

const addSectionSchema = z.object({
  type: z.enum(['text', 'chart', 'table', 'image', 'pagebreak']),
  content: z.any(),
  position: z.number().int().min(0),
});

const headerSchema = z.object({
  logo: z.string().optional(),
  title: z.string().optional(),
  showPageNumbers: z.boolean(),
});

const footerSchema = z.object({
  text: z.string().max(500).optional(),
  showDate: z.boolean(),
  showPageNumbers: z.boolean(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  html: z.string().min(1),
  variables: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'date', 'array', 'object']),
    defaultValue: z.any().optional(),
  })).default([]),
  tenantId: z.string().min(1).optional(),
});

const renderTemplateSchema = z.object({
  data: z.record(z.unknown()),
});

const scheduleReportSchema = z.object({
  cronExpression: z.string().min(9).max(100),
  recipients: z.array(z.string().email()).min(1),
  format: z.enum(['pdf', 'docx', 'html']),
  tenantId: z.string().min(1).optional(),
});

const sendReportSchema = z.object({
  recipients: z.array(z.string().email()).min(1),
  format: z.enum(['pdf', 'docx', 'html']),
});

const exportOptionsSchema = z.object({
  pageSize: z.string().optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  margins: z.record(z.number()).optional(),
}).optional();

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

// ─── Async handler wrapper ────────────────────────────────────────

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ─── REPORT CRUD ──────────────────────────────────────────────────

// POST /reports - Create a new report
router.post(
  '/reports',
  authMiddleware,
  validate(createReportSchema, 'body'),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, templateId, dataSources, tenantId } = req.body;
    const userId = req.user!.userId;
    const resolvedTenantId = tenantId || req.user!.organizationId || 'default';

    const report = await reportBuilderService.createReport(
      name,
      templateId || null,
      dataSources,
      resolvedTenantId,
      userId
    );

    logger.info('Report created via API', { reportId: report.id, userId });

    res.status(201).json({
      success: true,
      data: report,
      message: 'Report created successfully',
    });
  })
);

// GET /reports - List all reports
router.get(
  '/reports',
  authMiddleware,
  validate(paginationSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, sortBy, sortOrder, search } = req.query as Record<string, string | undefined>;

    const skip = ((page || 1) - 1) * (limit || 20);
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.reportDefinition.findMany({
        where,
        skip,
        take: limit || 20,
        orderBy: { [sortBy || 'createdAt']: sortOrder || 'desc' },
      }),
      prisma.reportDefinition.count({ where }),
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        page: page || 1,
        limit: limit || 20,
        total,
        totalPages: Math.ceil(total / (limit || 20)),
      },
    });
  })
);

// GET /reports/:id - Get report by ID
router.get(
  '/reports/:id',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const report = await prisma.reportDefinition.findUnique({
      where: { id: req.params.id! },
    });

    if (!report) {
      res.status(404).json({
        success: false,
        error: 'Report not found',
        code: 'NOT_FOUND',
      });
      return;
    }

    const buildOutputs = await prisma.reportBuildOutput.findMany({
      where: { reportId: req.params.id! },
      orderBy: { createdAt: 'desc' },
    });

    const schedules = await prisma.reportSchedule.findMany({
      where: { reportId: req.params.id! },
      orderBy: { createdAt: 'desc' },
    });

    const reportRecord = report as unknown as Record<string, unknown>;
    const config = (reportRecord.config as Record<string, unknown> | null) ?? {};
    const configSections = Array.isArray(config.sections) ? config.sections as Array<Record<string, unknown>> : [];
    const latestSchedule = schedules[0];
    const latestBuild = buildOutputs[0];

    const outputs = buildOutputs
      .filter((output) => output.format)
      .map((output) => {
        const format = String(output.format ?? '').toLowerCase();
        const routeFormat = format === 'docx' ? 'word' : format === 'xlsx' ? 'excel' : format;
        return {
          id: output.id,
          reportId: output.reportId,
          format,
          url: `/api/v1/reporting/reports/${output.reportId}/export/${routeFormat}`,
          fileSize: output.fileSize ?? 0,
          generatedAt: output.createdAt,
        };
      });

    const detail = {
      id: report.id,
      name: report.name,
      nameAr: report.name,
      description: report.description ?? '',
      templateId: report.templateId,
      templateName: report.templateId ?? 'بدون قالب',
      status: String(report.status ?? 'DRAFT'),
      lastGenerated: latestBuild?.createdAt ?? null,
      scheduleEnabled: Boolean(latestSchedule),
      scheduleCron: latestSchedule?.cronExpression ?? null,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      createdBy: report.createdBy,
      sections: configSections.map((section, index) => ({
        id: String(section.id ?? `${report.id}-section-${index}`),
        title: String((section.content as Record<string, unknown> | undefined)?.title ?? section.type ?? `Section ${index + 1}`),
        titleAr: String((section.content as Record<string, unknown> | undefined)?.titleAr ?? (section.content as Record<string, unknown> | undefined)?.title ?? section.type ?? `Section ${index + 1}`),
        type: String(section.type ?? 'text'),
        content: typeof (section.content as Record<string, unknown> | undefined)?.text === 'string'
          ? String((section.content as Record<string, unknown>).text)
          : JSON.stringify(section.content ?? {}, null, 2),
        order: Number(section.position ?? index),
      })),
      outputs,
      schedules: schedules.map((schedule) => ({
        id: schedule.id,
        cronExpression: schedule.cronExpression,
        recipients: schedule.recipients,
        format: String(schedule.format ?? '').toLowerCase(),
        status: schedule.status,
        nextRunAt: schedule.nextRunAt,
        lastRunAt: schedule.lastRunAt,
      })),
    };

    res.json({
      success: true,
      data: detail,
    });
  })
);

// PUT /reports/:id - Update report
router.put(
  '/reports/:id',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(updateReportSchema, 'body'),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.reportDefinition.findUnique({
      where: { id: req.params.id! },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: 'Report not found',
        code: 'NOT_FOUND',
      });
      return;
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date(), updatedBy: req.user!.userId };
    if (req.body.name) updateData.name = req.body.name;
    if (req.body.templateId !== undefined) updateData.templateId = req.body.templateId;
    if (req.body.status) updateData.status = req.body.status;

    if (req.body.dataSources) {
      const config = existing.config as Record<string, unknown>;
      config.dataSources = req.body.dataSources;
      config.metadata.lastModified = new Date().toISOString();
      updateData.config = JSON.parse(JSON.stringify(config));
    }

    const updated = await prisma.reportDefinition.update({
      where: { id: req.params.id! },
      data: updateData,
    });

    res.json({
      success: true,
      data: updated,
      message: 'Report updated successfully',
    });
  })
);

// DELETE /reports/:id - Delete report
router.delete(
  '/reports/:id',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.reportDefinition.findUnique({
      where: { id: req.params.id! },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: 'Report not found',
        code: 'NOT_FOUND',
      });
      return;
    }

    await prisma.reportOutput.deleteMany({ where: { reportId: req.params.id! } });
    await prisma.reportSchedule.deleteMany({ where: { reportId: req.params.id! } });
    await prisma.reportDefinition.delete({ where: { id: req.params.id! } });
    await deleteRuntimeReportRecord(req.params.id!);

    logger.info('Report deleted', { reportId: req.params.id!, userId: req.user!.userId });

    res.json({
      success: true,
      message: 'Report and associated data deleted successfully',
      deletedId: req.params.id!,
    });
  })
);

// ─── REPORT BUILD ─────────────────────────────────────────────────

// POST /reports/:id/build - Build a report
router.post(
  '/reports/:id/build',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reportBuilderService.buildReport(req.params.id!);

    res.json({
      success: true,
      data: result,
      message: 'Report built successfully',
    });
  })
);

// ─── SECTIONS ─────────────────────────────────────────────────────

// POST /reports/:id/sections - Add section to report
router.post(
  '/reports/:id/sections',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(addSectionSchema, 'body'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reportBuilderService.addSection(req.params.id!, {
      type: req.body.type,
      content: req.body.content,
      position: req.body.position,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Section added successfully',
    });
  })
);

// POST /reports/:id/toc - Generate table of contents
router.post(
  '/reports/:id/toc',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reportBuilderService.addTableOfContents(req.params.id!);

    res.json({
      success: true,
      data: result,
      message: 'Table of contents generated successfully',
    });
  })
);

// PUT /reports/:id/header - Set report header
router.put(
  '/reports/:id/header',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(headerSchema, 'body'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reportBuilderService.addHeader(req.params.id!, req.body);

    res.json({
      success: true,
      data: result,
      message: 'Report header configured successfully',
    });
  })
);

// PUT /reports/:id/footer - Set report footer
router.put(
  '/reports/:id/footer',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(footerSchema, 'body'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reportBuilderService.addFooter(req.params.id!, req.body);

    res.json({
      success: true,
      data: result,
      message: 'Report footer configured successfully',
    });
  })
);

// ─── TEMPLATES ────────────────────────────────────────────────────

// POST /templates - Create a template
router.post(
  '/templates',
  authMiddleware,
  validate(createTemplateSchema, 'body'),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, html, variables, tenantId } = req.body;
    const userId = req.user!.userId;
    const resolvedTenantId = tenantId || req.user!.organizationId || 'default';

    const template = await templateEngineService.createTemplate(
      name,
      html,
      variables,
      resolvedTenantId,
      userId
    );

    res.status(201).json({
      success: true,
      data: template,
      message: 'Template created successfully',
    });
  })
);

// POST /templates/:id/render - Render template with data
router.post(
  '/templates/:id/render',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(renderTemplateSchema, 'body'),
  asyncHandler(async (req: Request, res: Response) => {
    const renderedHtml = await templateEngineService.renderTemplate(
      req.params.id!,
      req.body.data
    );

    res.json({
      success: true,
      data: {
        html: renderedHtml,
        templateId: req.params.id!,
        renderedAt: new Date().toISOString(),
      },
      message: 'Template rendered successfully',
    });
  })
);

// ─── EXPORT ───────────────────────────────────────────────────────

// GET /reports/:id/export/pdf - Export report to PDF
router.get(
  '/reports/:id/export/pdf',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const options = {
      pageSize: (req.query.pageSize as string) || 'A4',
      orientation: (req.query.orientation as string) || 'portrait',
      margins: req.query.margins ? JSON.parse(req.query.margins as string) : undefined,
    };

    const pdfBuffer = await templateEngineService.exportToPDF(req.params.id!, options);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report_${req.params.id!}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    res.send(pdfBuffer);
  })
);

// GET /reports/:id/export/word - Export report to DOCX
router.get(
  '/reports/:id/export/word',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const docxBuffer = await templateEngineService.exportToWord(req.params.id!);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="report_${req.params.id!}.docx"`);
    res.setHeader('Content-Length', docxBuffer.length.toString());
    res.send(docxBuffer);
  })
);

// GET /reports/:id/export/html - Export report to HTML
router.get(
  '/reports/:id/export/html',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const htmlContent = await templateEngineService.exportToHTML(req.params.id!);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="report_${req.params.id!}.html"`);
    res.send(htmlContent);
  })
);

// GET /reports/:id/export/excel - Export report to Excel
router.get(
  '/reports/:id/export/excel',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const excelBuffer = await templateEngineService.exportToExcel(req.params.id!);

    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="report_${req.params.id!}.xls"`);
    res.setHeader('Content-Length', excelBuffer.length.toString());
    res.send(excelBuffer);
  })
);

// ─── SCHEDULES ────────────────────────────────────────────────────

// POST /reports/:id/schedule - Schedule a report
router.post(
  '/reports/:id/schedule',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(scheduleReportSchema, 'body'),
  asyncHandler(async (req: Request, res: Response) => {
    const { cronExpression, recipients, format, tenantId } = req.body;
    const userId = req.user!.userId;
    const resolvedTenantId = tenantId || req.user!.organizationId || 'default';

    const schedule = await scheduledReportsService.scheduleReport(
      req.params.id!,
      cronExpression,
      recipients,
      format,
      resolvedTenantId,
      userId
    );

    res.status(201).json({
      success: true,
      data: schedule,
      message: 'Report scheduled successfully',
    });
  })
);

// GET /reports/:id/schedules - List schedules for a report
router.get(
  '/reports/:id/schedules',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await scheduledReportsService.listSchedules(req.params.id!);

    res.json({
      success: true,
      data: result,
    });
  })
);

// PUT /schedules/:id/pause - Pause a schedule
router.put(
  '/schedules/:id/pause',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await scheduledReportsService.pauseSchedule(req.params.id!);

    res.json({
      success: true,
      data: result,
      message: 'Schedule paused successfully',
    });
  })
);

// PUT /schedules/:id/resume - Resume a schedule
router.put(
  '/schedules/:id/resume',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await scheduledReportsService.resumeSchedule(req.params.id!);

    res.json({
      success: true,
      data: result,
      message: 'Schedule resumed successfully',
    });
  })
);

// GET /schedules/:id/history - Get schedule execution history
router.get(
  '/schedules/:id/history',
  authMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await scheduledReportsService.getScheduleHistory(req.params.id!);

    res.json({
      success: true,
      data: result,
    });
  })
);

// ─── SEND REPORT ──────────────────────────────────────────────────

// POST /reports/:id/send - Send report via email
router.post(
  '/reports/:id/send',
  authMiddleware,
  validate(idParamSchema, 'params'),
  validate(sendReportSchema, 'body'),
  asyncHandler(async (req: Request, res: Response) => {
    const { recipients, format } = req.body;

    const result = await scheduledReportsService.sendReport(
      req.params.id!,
      recipients,
      format
    );

    res.json({
      success: true,
      data: result,
      message: 'Report sent successfully',
    });
  })
);

export default router;
