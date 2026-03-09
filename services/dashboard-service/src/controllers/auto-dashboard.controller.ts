import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { autoDashboardGeneratorService } from '../services/auto-dashboard-generator.service';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
    ];
    const allowedExts = ['.xlsx', '.xls', '.csv'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: .xlsx, .xls, .csv`));
    }
  },
});

export class AutoDashboardController {
  /**
   * POST /api/dashboard/auto-generate
   * Feature #1: Generate a dashboard from an existing dataset (easy mode).
   */
  async generateFromDataset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = (req as unknown as Record<string, Record<string, string>>).user?.tenantId;
      const userId = (req as unknown as Record<string, Record<string, string>>).user?.id;
      const { datasetId, dashboardName, preferredChartTypes, maxWidgets } = req.body;

      if (!datasetId) {
        res.status(400).json({ success: false, error: 'datasetId is required' });
        return;
      }

      const result = await autoDashboardGeneratorService.generateFromDataset({
        datasetId,
        tenantId,
        userId,
        dashboardName,
        preferredChartTypes,
        maxWidgets,
      });

      logger.info('Auto-dashboard generated via API', {
        dashboardId: result.dashboardId,
        widgetCount: result.widgets.length,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/dashboard/upload-and-generate
   * Feature #6: Upload Excel file and get a complete dashboard.
   * Uses BullMQ for heavy processing.
   */
  async uploadAndGenerate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadMiddleware = upload.single('file');

      await new Promise<void>((resolve, reject) => {
        uploadMiddleware(req, res, (err: unknown) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file uploaded. Send file as multipart form-data with field name "file"' });
        return;
      }

      const tenantId = (req as unknown as Record<string, Record<string, string>>).user?.tenantId;
      const userId = (req as unknown as Record<string, Record<string, string>>).user?.id;
      const dashboardName = req.body.dashboardName;

      const result = await autoDashboardGeneratorService.generateFromExcelUpload({
        fileBuffer: file.buffer,
        fileName: file.originalname,
        tenantId,
        userId,
        dashboardName,
      });

      logger.info('Excel upload job enqueued', {
        jobId: result.jobId,
        fileName: file.originalname,
        fileSize: file.size,
      });

      res.status(202).json({
        success: true,
        data: {
          jobId: result.jobId,
          status: result.status,
          message: 'File uploaded successfully. Dashboard generation is in progress.',
          statusUrl: `/api/dashboard/job-status/${result.jobId}`,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/dashboard/job-status/:jobId
   * Check the status of an async dashboard generation job.
   */
  async getJobStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;

      if (!jobId) {
        res.status(400).json({ success: false, error: 'jobId is required' });
        return;
      }

      const status = await autoDashboardGeneratorService.getJobStatus(jobId);

      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/dashboard/analyze-data
   * Feature #2 & #3: Analyze a dataset and return chart recommendations + KPIs
   * without creating a dashboard.
   */
  async analyzeData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { datasetId, preferredChartTypes } = req.body;

      if (!datasetId) {
        res.status(400).json({ success: false, error: 'datasetId is required' });
        return;
      }

      // Fetch dataset rows for profiling
      const datasets: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(
        `SELECT id, name, schema_json::text AS schema_json FROM datasets WHERE id = $1`,
        datasetId
      );

      if (!datasets || datasets.length === 0) {
        res.status(404).json({ success: false, error: `Dataset ${datasetId} not found` });
        return;
      }

      const rawSchema = datasets[0].schema_json;
      const parsedSchema = typeof rawSchema === 'string'
        ? JSON.parse(rawSchema)
        : rawSchema;
      const columnsMeta = Array.isArray(parsedSchema)
        ? parsedSchema
        : [];

      const sampleRows: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(
        `SELECT data FROM data_rows WHERE dataset_id = $1 ORDER BY row_index ASC LIMIT 1000`,
        datasetId
      );

      const rows = sampleRows.map((r: Record<string, unknown>) => {
        const data = r.data;
        return typeof data === 'string' ? JSON.parse(data) : (data as Record<string, unknown>) ?? {};
      });

      if (rows.length === 0) {
        res.status(400).json({ success: false, error: 'Dataset has no data rows' });
        return;
      }

      const service = autoDashboardGeneratorService;
      const dataProfile = service.profileData(rows, columnsMeta);
      const kpis = service.detectKPIs(dataProfile);
      const chartRecommendations = service.recommendCharts(dataProfile, preferredChartTypes);

      res.status(200).json({
        success: true,
        data: {
          dataProfile,
          kpiRecommendations: kpis,
          chartRecommendations,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const autoDashboardController = new AutoDashboardController();
