import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { validate } from '../middleware/validation';
import { ImportService } from '../services/import.service';
import { ReadingService } from '../services/reading.service';
import { CleansingService } from '../services/cleansing.service';
import { DataTransformationService } from '../services/data-transformation.service';
import { DataMergeService } from '../services/data-merge.service';
import { SourcesService } from '../services/sources.service';
import { DataVisualizationService } from '../services/data-visualization.service';
import { DataSearchService } from '../services/data-search.service';
import { DataVersioningService } from '../services/data-versioning.service';
import { DataExportService } from '../services/data-export.service';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

const importService = new ImportService();
const readingService = new ReadingService();
const cleansingService = new CleansingService();
const transformService = new DataTransformationService(prisma);
const mergeService = new DataMergeService(prisma);
const sourcesService = new SourcesService();
const vizService = new DataVisualizationService();
const searchService = new DataSearchService();
const versioningService = new DataVersioningService();
const dataExportService = new DataExportService(prisma);

// ─── Zod Schemas ──────────────────────────────────────────────────────

const datasetIdParams = z.object({ id: z.string().uuid() });
const versionIdParams = z.object({ versionId: z.string().uuid() });
const compareParams = z.object({ v1: z.string().uuid(), v2: z.string().uuid() });

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
}).partial();

const importUrlSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(500).optional(),
  format: z.enum(['csv', 'json', 'excel', 'xml']).optional(),
});

const cleanseColumnsSchema = z.object({
  columns: z.array(z.string().min(1)),
  threshold: z.number().min(0).max(1).optional(),
});

const cleanseMissingSchema = z.object({
  column: z.string().min(1),
  strategy: z.enum(['mean', 'median', 'mode', 'forward', 'backward', 'drop', 'interpolate']),
});

const normalizeSchema = z.object({
  column: z.string().min(1),
  method: z.enum(['minmax', 'zscore', 'log', 'robust']),
});

const outlierSchema = z.object({
  column: z.string().min(1),
  method: z.enum(['iqr', 'zscore', 'modified_zscore']).optional(),
});

const mergeSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  sourceColumn: z.string().min(1),
  targetColumn: z.string().min(1),
  returnColumns: z.array(z.string()).optional(),
});

const fuzzyMergeSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  sourceColumn: z.string().min(1),
  targetColumn: z.string().min(1),
  threshold: z.number().min(0).max(1).optional(),
});

const concatenateSchema = z.object({
  datasetIds: z.array(z.string().uuid()).min(2),
  name: z.string().min(1).max(500).optional(),
});

const compareSchema = z.object({
  id1: z.string().uuid(),
  id2: z.string().uuid(),
});

const reconcileSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  keyColumns: z.array(z.string().min(1)),
});

const pivotSchema = z.object({
  rowFields: z.array(z.string().min(1)),
  columnField: z.string().min(1),
  valueField: z.string().min(1),
  aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max']).optional(),
});

const unpivotSchema = z.object({
  idColumns: z.array(z.string().min(1)),
  valueColumns: z.array(z.string().min(1)),
  variableName: z.string().optional(),
  valueName: z.string().optional(),
});

const aggregateSchema = z.object({
  groupBy: z.array(z.string().min(1)),
  aggregations: z.array(z.object({
    column: z.string().min(1),
    operation: z.enum(['sum', 'avg', 'count', 'min', 'max', 'first', 'last']),
  })),
});

const filterSchema = z.object({
  conditions: z.array(z.object({
    column: z.string().min(1),
    operator: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  })),
});

const sortSchema = z.object({
  columns: z.array(z.object({
    column: z.string().min(1),
    direction: z.enum(['asc', 'desc']).optional(),
  })),
});

const calculatedColumnSchema = z.object({
  name: z.string().min(1),
  formula: z.string().min(1),
});

const splitColumnSchema = z.object({
  column: z.string().min(1),
  delimiter: z.string().min(1),
  newColumnNames: z.array(z.string().min(1)).optional(),
});

const chartSchema = z.object({
  chartType: z.enum(['bar', 'line', 'pie', 'scatter', 'doughnut']),
  xColumn: z.string().min(1),
  yColumn: z.string().min(1),
  title: z.string().optional(),
  width: z.number().int().min(100).max(4000).optional(),
  height: z.number().int().min(100).max(4000).optional(),
});

const heatmapQuery = z.object({
  columns: z.string().min(1),
});

const histogramQuery = z.object({
  column: z.string().min(1),
  bins: z.coerce.number().int().min(2).max(200).optional(),
});

const correlationQuery = z.object({
  columns: z.string().min(1),
});

const searchQuery = z.object({
  q: z.string().min(1),
  format: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const filterSearchSchema = z.object({
  conditions: z.array(z.object({
    column: z.string().min(1),
    operator: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  })),
});

const aggregationSearchSchema = z.object({
  aggs: z.array(z.object({
    field: z.string().min(1),
    type: z.enum(['terms', 'avg', 'sum', 'min', 'max', 'date_histogram']),
  })),
});

const suggestQuery = z.object({
  prefix: z.string().min(1),
});

const createVersionSchema = z.object({
  description: z.string().min(1).max(2000),
});

const branchSchema = z.object({
  name: z.string().min(1).max(500),
});

const batchImportSchema = z.object({
  urls: z.array(z.string().url()).optional(),
});

const standardizeSchema = z.object({
  column: z.string().min(1),
  mappings: z.record(z.string()).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function getTenantAndUser(req: Request): { tenantId: string; userId: string } {
  const tenantId = req.user!.organizationId || req.headers['x-tenant-id'] as string || '';
  const userId = req.user!.userId || '';
  if (!tenantId) throw new Error('Tenant ID is required');
  if (!userId) throw new Error('User ID is required');
  return { tenantId, userId };
}

// ─── Apply Auth + Tenant Middleware ──────────────────────────────────

router.use(authMiddleware);
router.use(tenantMiddleware);

// ═══════════════════════════════════════════════════════════════════════
// Module 2.1 — Import Routes
// ═══════════════════════════════════════════════════════════════════════

router.post('/import/csv', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ success: false, error: 'File is required' }); return; }
  const { tenantId, userId } = getTenantAndUser(req);
  const result = await importService.importCSV(req.file.buffer, req.file.originalname, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/import/excel', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ success: false, error: 'File is required' }); return; }
  const { tenantId, userId } = getTenantAndUser(req);
  const result = await importService.importExcel(req.file.buffer, req.file.originalname, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/import/json', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ success: false, error: 'File is required' }); return; }
  const { tenantId, userId } = getTenantAndUser(req);
  const result = await importService.importJSON(req.file.buffer, req.file.originalname, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/import/xml', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ success: false, error: 'File is required' }); return; }
  const { tenantId, userId } = getTenantAndUser(req);
  const result = await importService.importXML(req.file.buffer, req.file.originalname, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/import/pdf', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ success: false, error: 'File is required' }); return; }
  const { tenantId, userId } = getTenantAndUser(req);
  const result = await importService.importPDF(req.file.buffer, req.file.originalname, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/import/url', validate(importUrlSchema), asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = getTenantAndUser(req);
  const { url, format } = req.body;
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = url.split('/').pop() || 'import';
  const detectedFormat = format || filename.split('.').pop() || 'csv';
  let result: Record<string, unknown>;
  switch (detectedFormat) {
    case 'csv': result = await importService.importCSV(buffer, filename, tenantId, userId); break;
    case 'json': result = await importService.importJSON(buffer, filename, tenantId, userId); break;
    case 'excel':
    case 'xlsx':
    case 'xls': result = await importService.importExcel(buffer, filename, tenantId, userId); break;
    case 'xml': result = await importService.importXML(buffer, filename, tenantId, userId); break;
    default: result = await importService.importCSV(buffer, filename, tenantId, userId);
  }
  res.status(201).json({ success: true, data: result });
}));

router.post('/import/batch', upload.array('files', 20), asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = getTenantAndUser(req);
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) { res.status(400).json({ success: false, error: 'At least one file is required' }); return; }
  const results: Record<string, unknown>[] = [];
  const errors: { filename: string; error: string }[] = [];
  for (const file of files) {
    try {
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      let result: Record<string, unknown>;
      switch (ext) {
        case 'csv': case 'tsv': result = await importService.importCSV(file.buffer, file.originalname, tenantId, userId); break;
        case 'xlsx': case 'xls': result = await importService.importExcel(file.buffer, file.originalname, tenantId, userId); break;
        case 'json': case 'jsonl': result = await importService.importJSON(file.buffer, file.originalname, tenantId, userId); break;
        case 'xml': result = await importService.importXML(file.buffer, file.originalname, tenantId, userId); break;
        case 'pdf': result = await importService.importPDF(file.buffer, file.originalname, tenantId, userId); break;
        case 'txt': case 'log': case 'md': case 'rst': case 'ini': case 'cfg': case 'yaml': case 'yml': result = await importService.importTXT(file.buffer, file.originalname, tenantId, userId); break;
        case 'doc': case 'docx': result = await importService.importWord(file.buffer, file.originalname, tenantId, userId); break;
        case 'pptx': case 'ppt': result = await importService.importPresentation(file.buffer, file.originalname, tenantId, userId); break;
        case 'zip': result = await importService.importCompressedFile(file.buffer, file.originalname, tenantId, userId); break;
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'bmp': case 'tiff': case 'tif': result = await importService.importDocumentImage(file.buffer, file.originalname, tenantId, userId); break;
        default: result = await importService.importTXT(file.buffer, file.originalname, tenantId, userId);
      }
      results.push({ filename: file.originalname, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ filename: file.originalname, error: message });
    }
  }
  res.status(201).json({ success: true, data: { imported: results, errors, totalProcessed: files.length, successCount: results.length, errorCount: errors.length } });
}));

router.post('/import/txt', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ success: false, error: 'File is required' }); return; }
  const { tenantId, userId } = getTenantAndUser(req);
  const result = await importService.importTXT(req.file.buffer, req.file.originalname, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/import/word', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ success: false, error: 'File is required' }); return; }
  const { tenantId, userId } = getTenantAndUser(req);
  const result = await importService.importWord(req.file.buffer, req.file.originalname, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/import/presentation', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ success: false, error: 'File is required' }); return; }
  const { tenantId, userId } = getTenantAndUser(req);
  const result = await importService.importPresentation(req.file.buffer, req.file.originalname, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/import/compressed', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ success: false, error: 'File is required' }); return; }
  const { tenantId, userId } = getTenantAndUser(req);
  const result = await importService.importCompressedFile(req.file.buffer, req.file.originalname, tenantId, userId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/import/image', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ success: false, error: 'File is required' }); return; }
  const { tenantId, userId } = getTenantAndUser(req);
  const languages = req.body.languages ? req.body.languages.split(',') : ['ara', 'eng'];
  const result = await importService.importDocumentImage(req.file.buffer, req.file.originalname, tenantId, userId, languages);
  res.status(201).json({ success: true, data: result });
}));

router.post('/import/folder', upload.array('files', 100), asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = getTenantAndUser(req);
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) { res.status(400).json({ success: false, error: 'At least one file is required' }); return; }
  const results: Record<string, unknown>[] = [];
  const errors: { filename: string; error: string }[] = [];
  for (const file of files) {
    try {
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      let result: Record<string, unknown>;
      switch (ext) {
        case 'csv': case 'tsv': result = await importService.importCSV(file.buffer, file.originalname, tenantId, userId); break;
        case 'xlsx': case 'xls': result = await importService.importExcel(file.buffer, file.originalname, tenantId, userId); break;
        case 'json': case 'jsonl': result = await importService.importJSON(file.buffer, file.originalname, tenantId, userId); break;
        case 'xml': result = await importService.importXML(file.buffer, file.originalname, tenantId, userId); break;
        case 'pdf': result = await importService.importPDF(file.buffer, file.originalname, tenantId, userId); break;
        case 'txt': case 'log': case 'md': case 'rst': case 'ini': case 'cfg': case 'yaml': case 'yml': result = await importService.importTXT(file.buffer, file.originalname, tenantId, userId); break;
        case 'doc': case 'docx': result = await importService.importWord(file.buffer, file.originalname, tenantId, userId); break;
        case 'pptx': case 'ppt': result = await importService.importPresentation(file.buffer, file.originalname, tenantId, userId); break;
        case 'zip': result = await importService.importCompressedFile(file.buffer, file.originalname, tenantId, userId); break;
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'bmp': case 'tiff': case 'tif': result = await importService.importDocumentImage(file.buffer, file.originalname, tenantId, userId); break;
        default: result = await importService.importTXT(file.buffer, file.originalname, tenantId, userId);
      }
      results.push({ filename: file.originalname, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ filename: file.originalname, error: message });
    }
  }
  res.status(201).json({ success: true, data: { folderName: req.body.folderName || 'upload', imported: results, errors, totalProcessed: files.length, successCount: results.length, errorCount: errors.length } });
}));

// ═══════════════════════════════════════════════════════════════════════
// Module 2.2 — Parse / Reading Routes
// ═══════════════════════════════════════════════════════════════════════

router.post('/parse/structured/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const dataset = await readingService.getById(req.params.id!);
  res.json({ success: true, data: dataset });
}));

router.post('/parse/stream', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = getTenantAndUser(req);
  const list = await readingService.list({ page: 1, limit: 100, sortOrder: 'desc' });
  res.json({ success: true, data: list });
}));

router.post('/parse/chunk/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = getTenantAndUser(req);
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 100;
  const rows = await sourcesService.getDatasetRows(req.params.id!, tenantId, { page, limit });
  res.json({ success: true, data: rows });
}));

router.post('/parse/schema', asyncHandler(async (req: Request, res: Response) => {
  const { name, description, tenantId } = req.body;
  const { userId } = getTenantAndUser(req);
  const result = await readingService.create({ datasetId: req.body.datasetId, sessionType: 'browse' });
  res.status(201).json({ success: true, data: result });
}));

router.post('/parse/validate', asyncHandler(async (req: Request, res: Response) => {
  const { datasetId } = req.body;
  const result = await cleansingService.validateDataTypes(datasetId);
  res.json({ success: true, data: result });
}));

// ═══════════════════════════════════════════════════════════════════════
// Module 2.3 — Cleansing Routes
// ═══════════════════════════════════════════════════════════════════════

router.post('/cleanse/duplicates/:id', validate(datasetIdParams, 'params'), validate(cleanseColumnsSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await cleansingService.removeDuplicates(req.params.id!, req.body.columns, req.body.threshold);
  res.json({ success: true, data: result });
}));

router.post('/cleanse/missing/:id', validate(datasetIdParams, 'params'), validate(cleanseMissingSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await cleansingService.handleMissing(req.params.id!, req.body.column, req.body.strategy);
  res.json({ success: true, data: result });
}));

router.post('/cleanse/normalize/:id', validate(datasetIdParams, 'params'), validate(normalizeSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await cleansingService.normalizeValues(req.params.id!, req.body.column, req.body.method);
  res.json({ success: true, data: result });
}));

router.post('/cleanse/standardize/:id', validate(datasetIdParams, 'params'), validate(standardizeSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await cleansingService.normalizeValues(req.params.id!, req.body.column, 'minmax');
  res.json({ success: true, data: result });
}));

router.post('/cleanse/outliers/:id', validate(datasetIdParams, 'params'), validate(outlierSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await cleansingService.detectOutliers(req.params.id!, req.body.column, req.body.method);
  res.json({ success: true, data: result });
}));

router.post('/cleanse/trim/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await cleansingService.trimWhitespace(req.params.id!);
  res.json({ success: true, data: result });
}));

router.post('/cleanse/validate-types/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await cleansingService.validateDataTypes(req.params.id!);
  res.json({ success: true, data: result });
}));

// ═══════════════════════════════════════════════════════════════════════
// Module 2.4 — Transformation Routes
// ═══════════════════════════════════════════════════════════════════════

router.post('/transform/merge', validate(mergeSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await transformService.mergeDatasets([req.body.sourceId, req.body.targetId], 'inner', [req.body.sourceColumn]);
  res.status(201).json({ success: true, data: result });
}));

router.post('/transform/pivot/:id', validate(datasetIdParams, 'params'), validate(pivotSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await transformService.pivotTable(req.params.id!, req.body.rowFields, req.body.columnField, req.body.valueField, req.body.aggregation || 'sum');
  res.status(201).json({ success: true, data: result });
}));

router.post('/transform/unpivot/:id', validate(datasetIdParams, 'params'), validate(unpivotSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await transformService.unpivotTable(req.params.id!, req.body.idColumns, req.body.valueColumns);
  res.status(201).json({ success: true, data: result });
}));

router.post('/transform/aggregate/:id', validate(datasetIdParams, 'params'), validate(aggregateSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await transformService.aggregateData(req.params.id!, req.body.groupBy, req.body.aggregations);
  res.status(201).json({ success: true, data: result });
}));

router.post('/transform/filter/:id', validate(datasetIdParams, 'params'), validate(filterSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await transformService.filterData(req.params.id!, req.body.conditions);
  res.status(201).json({ success: true, data: result });
}));

router.post('/transform/sort/:id', validate(datasetIdParams, 'params'), validate(sortSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await transformService.sortData(req.params.id!, req.body.columns);
  res.status(201).json({ success: true, data: result });
}));

router.post('/transform/calculated-column/:id', validate(datasetIdParams, 'params'), validate(calculatedColumnSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await transformService.addCalculatedColumn(req.params.id!, req.body.name, req.body.formula);
  res.status(201).json({ success: true, data: result });
}));

router.post('/transform/split-column/:id', validate(datasetIdParams, 'params'), validate(splitColumnSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await transformService.splitColumn(req.params.id!, req.body.column, req.body.delimiter);
  res.status(201).json({ success: true, data: result });
}));

router.post('/transform/transpose/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await transformService.transposeData(req.params.id!);
  res.status(201).json({ success: true, data: result });
}));

// ═══════════════════════════════════════════════════════════════════════
// Module 2.5 — Merge Routes
// ═══════════════════════════════════════════════════════════════════════

router.post('/merge/vlookup', validate(mergeSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await mergeService.vlookup(req.body.sourceId, req.body.targetId, req.body.sourceColumn, req.body.targetColumn, (req.body.returnColumns || [])[0] || req.body.targetColumn);
  res.status(201).json({ success: true, data: result });
}));

router.post('/merge/fuzzy', validate(fuzzyMergeSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await mergeService.fuzzyMatch(req.body.sourceId, req.body.targetId, [req.body.sourceColumn, req.body.targetColumn], req.body.threshold || 0.8);
  res.status(201).json({ success: true, data: result });
}));

router.post('/merge/concatenate', validate(concatenateSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await mergeService.concatenateDatasets(req.body.datasetIds, 'vertical');
  res.status(201).json({ success: true, data: result });
}));

router.post('/merge/compare', validate(compareSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await mergeService.compareDatasets(req.body.id1, req.body.id2);
  res.json({ success: true, data: result });
}));

router.post('/merge/reconcile', validate(reconcileSchema), asyncHandler(async (req: Request, res: Response) => {
  const result = await mergeService.reconcileData(req.body.sourceId, req.body.targetId, req.body.keyColumns.map((k: string) => ({ sourceCol: k, targetCol: k, matchType: 'exact' })));
  res.json({ success: true, data: result });
}));

// ═══════════════════════════════════════════════════════════════════════
// Module 2.6 — Export Routes
// ═══════════════════════════════════════════════════════════════════════

router.get('/export/csv/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = getTenantAndUser(req);
  const delimiter = (req.query.delimiter as string) || ',';
  const encoding = (req.query.encoding as string) || 'utf-8';
  const result = await sourcesService.exportCSV(req.params.id!, tenantId, { delimiter, encoding });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="export_${req.params.id!}.csv"`);
  res.send(result);
}));

router.get('/export/excel/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = getTenantAndUser(req);
  const result = await sourcesService.exportExcel(req.params.id!, tenantId);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="export_${req.params.id!}.xlsx"`);
  res.send(result);
}));

router.get('/export/json/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = getTenantAndUser(req);
  const format = (req.query.format as 'json' | 'jsonl') || 'json';
  const result = await sourcesService.exportJSON(req.params.id!, tenantId, { format });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="export_${req.params.id!}.json"`);
  res.send(result);
}));

router.get('/export/pdf/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = getTenantAndUser(req);
  const dataset = await sourcesService.getDataset(req.params.id!, tenantId);
  const pdfBuffer = await dataExportService.exportPDF(req.params.id!, {
    title: dataset.name || `Export ${req.params.id!}`,
    orientation: (req.query.orientation as string) || 'portrait',
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="export_${req.params.id!}.pdf"`);
  res.send(pdfBuffer);
}));

router.get('/export/sql/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = getTenantAndUser(req);
  const dataset = await sourcesService.getDataset(req.params.id!, tenantId);
  const rows = await sourcesService.getDatasetRows(req.params.id!, tenantId, { page: 1, limit: 50000 });
  const tableName = (dataset.name || 'data_export').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  const dataRows = (rows as { rows?: Record<string, unknown>[] }).rows || rows;
  const allRows = Array.isArray(dataRows) ? dataRows : [];
  const columns = allRows.length > 0 ? Object.keys(allRows[0]).filter(k => k !== 'rowIndex') : [];
  let sql = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n`;
  sql += columns.map(c => `  "${c}" TEXT`).join(',\n');
  sql += '\n);\n\n';
  for (const row of allRows) {
    const values = columns.map(c => {
      const v = row[c];
      if (v === null || v === undefined) return 'NULL';
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    sql += `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});\n`;
  }
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="export_${req.params.id!}.sql"`);
  res.send(sql);
}));

router.post('/export/bulk', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = getTenantAndUser(req);
  const { datasetIds, format } = req.body as { datasetIds: string[]; format: string };
  if (!datasetIds || !Array.isArray(datasetIds) || datasetIds.length === 0) {
    res.status(400).json({ success: false, error: 'datasetIds array is required' }); return;
  }
  const results: { datasetId: string; exported: boolean; sizeBytes: number }[] = [];
  const errors: { datasetId: string; error: string }[] = [];
  for (const dsId of datasetIds) {
    try {
      let exportResult: { content: string | Buffer; filename: string; mimeType: string; rowCount: number };
      switch (format) {
        case 'csv': exportResult = await sourcesService.exportCSV(dsId, tenantId); break;
        case 'excel': exportResult = await sourcesService.exportExcel(dsId, tenantId); break;
        case 'json': default: exportResult = await sourcesService.exportJSON(dsId, tenantId); break;
      }
      const content = exportResult.content;
      results.push({ datasetId: dsId, exported: true, sizeBytes: Buffer.byteLength(typeof content === 'string' ? content : content) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ datasetId: dsId, error: message });
    }
  }
  res.json({ success: true, data: { exported: results, errors, totalProcessed: datasetIds.length } });
}));

// ═══════════════════════════════════════════════════════════════════════
// Module 2.7 — Visualization Routes
// ═══════════════════════════════════════════════════════════════════════

router.get('/visualize/chart/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const parsed = chartSchema.parse({
    chartType: req.query.chartType || 'bar',
    xColumn: req.query.xColumn,
    yColumn: req.query.yColumn,
    title: req.query.title,
    width: req.query.width ? Number(req.query.width) : undefined,
    height: req.query.height ? Number(req.query.height) : undefined,
  });
  const buffer = await vizService.generateChart(req.params.id!, parsed.chartType, {
    xColumn: parsed.xColumn,
    yColumn: parsed.yColumn,
    title: parsed.title,
    width: parsed.width,
    height: parsed.height,
  });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `inline; filename="chart_${req.params.id!}.png"`);
  res.send(buffer);
}));

router.get('/visualize/heatmap/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const { columns } = heatmapQuery.parse(req.query);
  const columnList = columns.split(',').map(c => c.trim()).filter(Boolean);
  if (columnList.length < 2) { res.status(400).json({ success: false, error: 'At least 2 columns required' }); return; }
  const buffer = await vizService.generateHeatmap(req.params.id!, columnList);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `inline; filename="heatmap_${req.params.id!}.png"`);
  res.send(buffer);
}));

router.get('/visualize/histogram/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const { column, bins } = histogramQuery.parse(req.query);
  const buffer = await vizService.generateHistogram(req.params.id!, column, bins);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `inline; filename="histogram_${req.params.id!}.png"`);
  res.send(buffer);
}));

router.get('/visualize/boxplot/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const columnsRaw = req.query.columns as string || '';
  const columnList = columnsRaw.split(',').map(c => c.trim()).filter(Boolean);
  if (columnList.length === 0) { res.status(400).json({ success: false, error: 'columns query parameter is required' }); return; }
  const buffer = await vizService.generateBoxplot(req.params.id!, columnList);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `inline; filename="boxplot_${req.params.id!}.png"`);
  res.send(buffer);
}));

router.get('/visualize/statistics/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const stats = await vizService.getStatistics(req.params.id!);
  res.json({ success: true, data: stats });
}));

router.get('/visualize/correlation/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const { columns } = correlationQuery.parse(req.query);
  const columnList = columns.split(',').map(c => c.trim()).filter(Boolean);
  if (columnList.length < 2) { res.status(400).json({ success: false, error: 'At least 2 columns required' }); return; }
  const correlation = await vizService.getCorrelation(req.params.id!, columnList);
  res.json({ success: true, data: correlation });
}));

// ═══════════════════════════════════════════════════════════════════════
// Module 2.8 — Search Routes
// ═══════════════════════════════════════════════════════════════════════

router.get('/search', asyncHandler(async (req: Request, res: Response) => {
  const parsed = searchQuery.parse(req.query);
  const results = await searchService.fullTextSearch(
    parsed.q,
    { format: parsed.format, status: parsed.status },
    { page: parsed.page || 1, limit: parsed.limit || 20 }
  );
  res.json({ success: true, data: results });
}));

router.get('/search/filter/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const conditionsRaw = req.query.conditions as string;
  let conditions: Array<{ column: string; operator: string; value: string | number | boolean | null }>;
  try {
    conditions = JSON.parse(conditionsRaw || '[]');
  } catch {
    res.status(400).json({ success: false, error: 'conditions must be valid JSON array' }); return;
  }
  const result = await searchService.filterSearch(req.params.id!, conditions);
  res.json({ success: true, data: result });
}));

router.get('/search/aggregation/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const aggsRaw = req.query.aggs as string;
  let aggs: Array<{ field: string; type: 'terms' | 'avg' | 'sum' | 'min' | 'max' | 'date_histogram' }>;
  try {
    aggs = JSON.parse(aggsRaw || '[]');
  } catch {
    res.status(400).json({ success: false, error: 'aggs must be valid JSON array' }); return;
  }
  const result = await searchService.aggregationSearch(req.params.id!, aggs);
  res.json({ success: true, data: result });
}));

router.get('/search/suggest', asyncHandler(async (req: Request, res: Response) => {
  const { prefix } = suggestQuery.parse(req.query);
  const { tenantId } = getTenantAndUser(req);
  const suggestions = await searchService.suggestSearch(prefix, tenantId);
  res.json({ success: true, data: suggestions });
}));

router.post('/search/index/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await searchService.indexDataset(req.params.id!);
  res.json({ success: true, data: result });
}));

router.post('/search/reindex', asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = getTenantAndUser(req);
  const result = await searchService.reindexAll(tenantId);
  res.json({ success: true, data: result });
}));

// ═══════════════════════════════════════════════════════════════════════
// Module 2.9 — Versioning Routes
// ═══════════════════════════════════════════════════════════════════════

router.post('/versions/:id', validate(datasetIdParams, 'params'), validate(createVersionSchema), asyncHandler(async (req: Request, res: Response) => {
  const { userId } = getTenantAndUser(req);
  const result = await versioningService.createVersion(req.params.id!, req.body.description, userId);
  res.status(201).json({ success: true, data: result });
}));

router.get('/versions/:id', validate(datasetIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const versions = await versioningService.listVersions(req.params.id!);
  res.json({ success: true, data: versions });
}));

router.post('/versions/restore/:versionId', validate(versionIdParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const { userId } = getTenantAndUser(req);
  const { datasetId } = req.body;
  if (!datasetId) { res.status(400).json({ success: false, error: 'datasetId is required in body' }); return; }
  const result = await versioningService.restoreVersion(datasetId, req.params.versionId!, userId);
  res.json({ success: true, data: result });
}));

router.get('/versions/compare/:v1/:v2', validate(compareParams, 'params'), asyncHandler(async (req: Request, res: Response) => {
  const result = await versioningService.compareVersions(req.params.v1!, req.params.v2!);
  res.json({ success: true, data: result });
}));

router.post('/versions/branch/:id', validate(datasetIdParams, 'params'), validate(branchSchema), asyncHandler(async (req: Request, res: Response) => {
  const { userId } = getTenantAndUser(req);
  const result = await versioningService.branchDataset(req.params.id!, req.body.name, userId);
  res.status(201).json({ success: true, data: result });
}));

export default router;
