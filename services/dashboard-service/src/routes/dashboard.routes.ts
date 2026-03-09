import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';
import * as dashboardBuilder from '../services/dashboard-builder.service.js';
import * as chartEngine from '../services/chart-engine.service.js';
import * as kpiEngine from '../services/kpi-engine.service.js';
import * as filterEngine from '../services/filter-engine.service.js';
import {
  ThemeEngineService,
  type ThemeMode,
} from '../services/theme-engine.service.js';
import { PlatformAppearanceService } from '../services/platform-appearance.service.js';

const router = Router();
const themeEngine = new ThemeEngineService(prisma);
const platformAppearanceService = new PlatformAppearanceService(prisma);

// ── Zod Schemas ──────────────────────────────────────────────────────────

const createDashboardSchema = z.object({
  name: z.string().min(1).max(255),
  layout: z.any().optional().default({}),
  config: z.any().optional().default({}),
});

const addWidgetSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1).max(255),
  config: z.any().optional().default({}),
  datasetId: z.string().uuid().optional(),
  position: z.object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    w: z.number().int().min(1).max(12),
    h: z.number().int().min(1),
  }),
});

const updateWidgetSchema = z.object({
  config: z.any().optional().default({}),
  title: z.string().optional(),
  type: z.string().optional(),
});

const reorderWidgetsSchema = z.object({
  positions: z.array(z.object({
    widgetId: z.string().uuid(),
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    w: z.number().int().min(1).max(12),
    h: z.number().int().min(1),
  })).min(1),
});

const barChartSchema = z.object({
  data: z.object({
    labels: z.array(z.string()),
    datasets: z.array(z.object({
      label: z.string(),
      data: z.array(z.number()),
      backgroundColor: z.string().optional(),
    })),
  }),
  config: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    title: z.string().optional(),
  }).optional(),
});

const lineChartSchema = z.object({
  data: z.object({
    labels: z.array(z.string()),
    datasets: z.array(z.object({
      label: z.string(),
      data: z.array(z.number()),
      borderColor: z.string().optional(),
    })),
  }),
  config: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    title: z.string().optional(),
    tension: z.number().optional(),
    fill: z.boolean().optional(),
  }).optional(),
});

const pieChartSchema = z.object({
  data: z.object({
    labels: z.array(z.string()),
    data: z.array(z.number()),
    backgroundColor: z.array(z.string()).optional(),
  }),
  config: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    title: z.string().optional(),
    doughnut: z.boolean().optional(),
    cutout: z.string().optional(),
  }).optional(),
});

const scatterSchema = z.object({
  data: z.object({
    datasets: z.array(z.object({
      label: z.string(),
      data: z.array(z.object({ x: z.number(), y: z.number() })),
      backgroundColor: z.string().optional(),
    })),
  }),
  config: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    title: z.string().optional(),
    trendLine: z.boolean().optional(),
  }).optional(),
});

const areaChartSchema = z.object({
  data: z.object({
    labels: z.array(z.string()),
    datasets: z.array(z.object({
      label: z.string(),
      data: z.array(z.number()),
      backgroundColor: z.string().optional(),
    })),
  }),
  config: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    title: z.string().optional(),
    stacked: z.boolean().optional(),
  }).optional(),
});

const radarChartSchema = z.object({
  data: z.object({
    labels: z.array(z.string()),
    datasets: z.array(z.object({
      label: z.string(),
      data: z.array(z.number()),
      backgroundColor: z.string().optional(),
    })),
  }),
  config: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    title: z.string().optional(),
  }).optional(),
});

const gaugeChartSchema = z.object({
  value: z.number(),
  max: z.number().positive(),
  config: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    title: z.string().optional(),
    thresholds: z.object({
      warning: z.number(),
      critical: z.number(),
    }).optional(),
  }).optional(),
});

const waterfallChartSchema = z.object({
  data: z.object({
    labels: z.array(z.string()),
    values: z.array(z.number()),
  }),
  config: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    title: z.string().optional(),
  }).optional(),
});

const combinedChartSchema = z.object({
  data: z.object({
    labels: z.array(z.string()),
    barDatasets: z.array(z.object({
      label: z.string(),
      data: z.array(z.number()),
      backgroundColor: z.string().optional(),
    })).optional(),
    lineDatasets: z.array(z.object({
      label: z.string(),
      data: z.array(z.number()),
      borderColor: z.string().optional(),
    })).optional(),
  }),
  config: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    title: z.string().optional(),
  }).optional(),
});

const renderChartSchema = z.object({
  chartConfig: z.any(),
  format: z.enum(['png', 'jpeg']),
  width: z.number().int().min(100).max(4096),
  height: z.number().int().min(100).max(4096),
});

const createKPISchema = z.object({
  name: z.string().min(1).max(255),
  dataSource: z.any(),
  formula: z.string().min(1),
  target: z.number().positive(),
  thresholds: z.object({
    warning: z.number(),
    critical: z.number(),
  }),
});

const kpiAlertSchema = z.object({
  condition: z.string().min(1),
  recipients: z.array(z.string().email()).min(1),
});

const kpiCompareSchema = z.object({
  kpiIds: z.array(z.string().uuid()).min(2),
  dateRange: z.object({
    start: z.string().or(z.date()),
    end: z.string().or(z.date()),
  }),
});

const createFilterSchema = z.object({
  config: z.object({
    type: z.enum(['date_range', 'dropdown', 'slider', 'text']),
    label: z.string().min(1),
    column: z.string().min(1),
    options: z.array(z.string()).optional(),
  }),
});

const applyFilterSchema = z.object({
  value: z.any(),
});

const bindDatasetSchema = z.object({
  datasetId: z.string().uuid(),
  mapping: z.object({
    xColumn: z.string().optional(),
    yColumn: z.string().optional(),
    labelColumn: z.string().optional(),
  }),
});

const hexColorSchema = z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/);

const createThemeSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().optional(),
  mode: z.enum(['light', 'dark']).optional(),
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema.optional(),
  accentColor: hexColorSchema.optional(),
  backgroundColor: hexColorSchema.optional(),
  surfaceColor: hexColorSchema.optional(),
  textColor: hexColorSchema.optional(),
  fontFamily: z.string().optional(),
  fontFamilyArabic: z.string().optional(),
  displayFamily: z.string().optional(),
  rtl: z.boolean().optional(),
  semanticLabelAr: z.string().optional(),
  semanticDefinitionAr: z.string().optional(),
  isSystem: z.boolean().optional(),
  brandKit: z.object({
    platformName: z.string().optional(),
    companyName: z.string().optional(),
    logoUrl: z.string().url().optional(),
    logoInvertedUrl: z.string().url().optional(),
    headerTitle: z.string().optional(),
    footerText: z.string().optional(),
  }).partial().optional(),
});

const updateAppearanceSchema = z.object({
  platformName: z.string().min(1).max(256).optional(),
  logoUrl: z.string().url().nullable().optional(),
  headerTitle: z.string().min(1).max(256).optional(),
  footerText: z.string().min(1).max(256).optional(),
  activeThemeId: z.string().uuid().nullable().optional(),
  visualIdentity: z.object({
    navStyle: z.string().min(1).max(64).optional(),
    density: z.string().min(1).max(64).optional(),
    accentUsage: z.string().min(1).max(64).optional(),
    shellStyle: z.string().min(1).max(64).optional(),
  }).partial().optional(),
});

const applyBrandKitSchema = z.object({
  platformName: z.string().optional(),
  companyName: z.string().optional(),
  logoUrl: z.string().url().optional(),
  logoInvertedUrl: z.string().url().optional(),
  headerTitle: z.string().optional(),
  footerText: z.string().optional(),
});

// ── Validation Middleware ─────────────────────────────────────────────────

function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(err);
    }
  };
}

// ── Dashboard CRUD Routes ────────────────────────────────────────────────

router.post(
  '/dashboards',
  authMiddleware,
  validate(createDashboardSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, layout, config } = req.body;
      const tenantId = req.user?.organizationId ?? req.user?.userId ?? 'default';
      const userId = req.user?.userId ?? 'anonymous';
      const dashboard = await dashboardBuilder.createDashboard(name, layout, config, tenantId, userId);
      res.status(201).json({ success: true, data: dashboard });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/dashboards',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user?.organizationId ?? req.user?.userId ?? 'default';
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const filters = {
        search: req.query.search as string,
        status: req.query.status as string,
        userId: req.query.userId as string,
        createdAfter: req.query.createdAfter as string,
        createdBefore: req.query.createdBefore as string,
        sortBy: req.query.sortBy as string,
        sortOrder: req.query.sortOrder as string,
      };
      const result = await dashboardBuilder.listDashboards(tenantId, filters, { page, limit });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/dashboards/:id',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dashboard = await dashboardBuilder.getDashboard(req.params.id);
      res.status(200).json({ success: true, data: dashboard });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/dashboards/:id',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, layout, config } = req.body;
      const tenantId = req.user?.organizationId ?? req.user?.userId ?? 'default';
      const userId = req.user?.userId ?? 'anonymous';
      const dashboard = await dashboardBuilder.createDashboard(
        name ?? 'Updated Dashboard', layout ?? {}, config ?? {}, tenantId, userId
      );
      res.status(200).json({ success: true, data: dashboard });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/dashboards/:id',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const now = new Date();
      await prisma.$queryRawUnsafe(
        `UPDATE dashboards SET status = 'deleted', updated_at = $1 WHERE id = $2`,
        now,
        req.params.id
      );
      await prisma.$disconnect();
      res.status(200).json({ success: true, data: { id: req.params.id, deletedAt: now } });
    } catch (err) {
      next(err);
    }
  }
);

// ── Widget Routes ────────────────────────────────────────────────────────

router.post(
  '/dashboards/:id/widgets',
  authMiddleware,
  validate(addWidgetSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const widget = await dashboardBuilder.addWidget(req.params.id, req.body);
      res.status(201).json({ success: true, data: widget });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/dashboards/:id/widgets/:widgetId',
  authMiddleware,
  validate(updateWidgetSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const widget = await dashboardBuilder.updateWidget(req.params.id, req.params.widgetId, req.body);
      res.status(200).json({ success: true, data: widget });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/dashboards/:id/widgets/:widgetId',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await dashboardBuilder.removeWidget(req.params.id, req.params.widgetId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/dashboards/:id/widgets/reorder',
  authMiddleware,
  validate(reorderWidgetsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await dashboardBuilder.reorderWidgets(req.params.id, req.body.positions);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ── Duplicate Dashboard ──────────────────────────────────────────────────

router.post(
  '/dashboards/:id/duplicate',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId ?? 'anonymous';
      const result = await dashboardBuilder.duplicateDashboard(req.params.id, userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ── Chart Rendering Routes ───────────────────────────────────────────────

router.post(
  '/charts/bar',
  authMiddleware,
  validate(barChartSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const buffer = await chartEngine.renderBarChart(req.body.data, req.body.config);
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/charts/line',
  authMiddleware,
  validate(lineChartSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const buffer = await chartEngine.renderLineChart(req.body.data, req.body.config);
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/charts/pie',
  authMiddleware,
  validate(pieChartSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const buffer = await chartEngine.renderPieChart(req.body.data, req.body.config);
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/charts/scatter',
  authMiddleware,
  validate(scatterSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const buffer = await chartEngine.renderScatterPlot(req.body.data, req.body.config);
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/charts/area',
  authMiddleware,
  validate(areaChartSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const buffer = await chartEngine.renderAreaChart(req.body.data, req.body.config);
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/charts/radar',
  authMiddleware,
  validate(radarChartSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const buffer = await chartEngine.renderRadarChart(req.body.data, req.body.config);
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/charts/gauge',
  authMiddleware,
  validate(gaugeChartSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const buffer = await chartEngine.renderGaugeChart(req.body.value, req.body.max, req.body.config);
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/charts/waterfall',
  authMiddleware,
  validate(waterfallChartSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const buffer = await chartEngine.renderWaterfallChart(req.body.data, req.body.config);
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/charts/combined',
  authMiddleware,
  validate(combinedChartSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const buffer = await chartEngine.renderCombinedChart(req.body.data, req.body.config);
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/charts/render',
  authMiddleware,
  validate(renderChartSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { chartConfig, format, width, height } = req.body;
      const buffer = await chartEngine.renderChartToImage(chartConfig, format, width, height);
      const contentType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      res.set('Content-Type', contentType);
      res.set('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

// ── KPI Routes ───────────────────────────────────────────────────────────

router.post(
  '/kpis',
  authMiddleware,
  validate(createKPISchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user?.organizationId ?? req.user?.userId ?? 'default';
      const userId = req.user?.userId ?? 'anonymous';
      const { name, dataSource, formula, target, thresholds } = req.body;
      const kpi = await kpiEngine.createKPI(name, dataSource, formula, target, thresholds, tenantId, userId);
      res.status(201).json({ success: true, data: kpi });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/kpis/:id/calculate',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await kpiEngine.calculateKPI(req.params.id);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/kpis/:id/history',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const start = req.query.start ? new Date(req.query.start as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = req.query.end ? new Date(req.query.end as string) : new Date();
      const result = await kpiEngine.getKPIHistory(req.params.id, { start, end });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/kpis/:id/alert',
  authMiddleware,
  validate(kpiAlertSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { condition, recipients } = req.body;
      const alert = await kpiEngine.setKPIAlert(req.params.id, condition, recipients);
      res.status(201).json({ success: true, data: alert });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/kpis/compare',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kpiIds = (req.query.ids as string)?.split(',') ?? [];
      const start = req.query.start ? new Date(req.query.start as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = req.query.end ? new Date(req.query.end as string) : new Date();
      const result = await kpiEngine.compareKPIs(kpiIds, { start, end });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ── Filter Routes ────────────────────────────────────────────────────────

router.post(
  '/dashboards/:id/filters',
  authMiddleware,
  validate(createFilterSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter = await filterEngine.createFilter(req.params.id, req.body.config);
      res.status(201).json({ success: true, data: filter });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/dashboards/:id/filters/:filterId/apply',
  authMiddleware,
  validate(applyFilterSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await filterEngine.applyFilter(req.params.id, req.params.filterId, req.body.value);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ── Bind Dataset ─────────────────────────────────────────────────────────

router.post(
  '/widgets/:widgetId/bind',
  authMiddleware,
  validate(bindDatasetSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await filterEngine.bindDataset(req.params.widgetId, req.body.datasetId, req.body.mapping);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ── Theme & Appearance Routes ────────────────────────────────────────────

router.get(
  '/themes',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const mode = req.query.mode === 'dark' || req.query.mode === 'light'
        ? (req.query.mode as ThemeMode)
        : undefined;
      const themes = await themeEngine.listThemes(mode);
      res.status(200).json({ success: true, data: themes });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/themes',
  authMiddleware,
  validate(createThemeSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const theme = await themeEngine.createTheme(req.body);
      res.status(201).json({ success: true, data: theme });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/themes/:id',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const theme = await themeEngine.getTheme(req.params.id);
      res.status(200).json({ success: true, data: theme });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/themes/:id/preview',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const mode = req.query.mode === 'dark' || req.query.mode === 'light'
        ? (req.query.mode as ThemeMode)
        : undefined;
      const preview = await themeEngine.generateThemePreview(req.params.id, mode);
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', String(preview.imageBuffer.length));
      res.status(200).send(preview.imageBuffer);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/themes/:id/css',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const css = await themeEngine.exportThemeCSS(req.params.id);
      res.set('Content-Type', 'text/css; charset=utf-8');
      res.status(200).send(css);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/themes/:id/variants/rtl',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const theme = await themeEngine.createRtlVariant(req.params.id);
      res.status(201).json({ success: true, data: theme });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/themes/:id/variants/mode',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const theme = await themeEngine.createDarkLightVariant(req.params.id);
      res.status(201).json({ success: true, data: theme });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/themes/:id/brand-kit',
  authMiddleware,
  validate(applyBrandKitSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const theme = await themeEngine.applyBrandKit(req.params.id, req.body);
      res.status(200).json({ success: true, data: theme });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/appearance',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user?.tenantId ?? req.user?.organizationId;
      const appearance = await platformAppearanceService.getAppearance(tenantId);
      res.status(200).json({ success: true, data: appearance });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/appearance',
  authMiddleware,
  validate(updateAppearanceSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user?.tenantId ?? req.user?.organizationId;
      const appearance = await platformAppearanceService.updateAppearance(tenantId, req.body);
      res.status(200).json({ success: true, data: appearance });
    } catch (err) {
      next(err);
    }
  }
);

// ── Export Routes ────────────────────────────────────────────────────────

router.get(
  '/dashboards/:id/export/pdf',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const width = parseInt(req.query.width as string, 10) || undefined;
      const height = parseInt(req.query.height as string, 10) || undefined;
      const buffer = await filterEngine.exportToPDF(req.params.id, { width, height });
      res.set('Content-Type', 'image/png');
      res.set('Content-Disposition', `attachment; filename="dashboard-${req.params.id}.png"`);
      res.set('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/dashboards/:id/export/image',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const format = (req.query.format as string) === 'jpeg' ? 'jpeg' : 'png';
      const resolution = parseFloat(req.query.resolution as string) || undefined;
      const buffer = await filterEngine.exportToImage(req.params.id, format, resolution);
      const contentType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      res.set('Content-Type', contentType);
      res.set('Content-Disposition', `attachment; filename="dashboard-${req.params.id}.${format}"`);
      res.set('Content-Length', String(buffer.length));
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
