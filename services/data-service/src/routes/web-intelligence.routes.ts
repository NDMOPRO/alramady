import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { WebIntelligenceService } from '../services/web-intelligence.service';

const router = Router();
const service = new WebIntelligenceService();

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const ScrapeUrlBody = z.object({
  url: z.string().url('A valid URL is required'),
  selectors: z.record(z.string()).default({}),
});

const ScrapeMultipleBody = z.object({
  urls: z.array(z.string().url()).min(1, 'At least one URL is required').max(50, 'Maximum 50 URLs per batch'),
  selectors: z.record(z.string()).default({}),
});

const MonitorUrlBody = z.object({
  url: z.string().url('A valid URL is required'),
  selectors: z.record(z.string()).default({}),
  frequency: z.enum(['hourly', 'daily', 'weekly']),
});

const CompareSnapshotsBody = z.object({
  monitorId: z.string().uuid('Valid monitor ID is required'),
  date1: z.string().refine((d) => !isNaN(Date.parse(d)), { message: 'date1 must be a valid ISO date' }),
  date2: z.string().refine((d) => !isNaN(Date.parse(d)), { message: 'date2 must be a valid ISO date' }),
});

const ExtractTablesBody = z.object({
  url: z.string().url('A valid URL is required'),
});

const SearchWebBody = z.object({
  query: z.string().min(1, 'Search query is required').max(500),
  numResults: z.number().int().min(1).max(20).default(10),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post('/scrape', asyncHandler(async (req: Request, res: Response) => {
  const { url, selectors } = ScrapeUrlBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.scrapeUrl(url, selectors, tenantId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/scrape-multiple', asyncHandler(async (req: Request, res: Response) => {
  const { urls, selectors } = ScrapeMultipleBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.scrapeMultiple(urls, selectors, tenantId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/monitor', asyncHandler(async (req: Request, res: Response) => {
  const { url, selectors, frequency } = MonitorUrlBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.monitorUrl(url, selectors, frequency, tenantId);
  res.status(201).json({ success: true, data: result });
}));

router.delete('/monitor/:monitorId', asyncHandler(async (req: Request, res: Response) => {
  const monitorId = req.params.monitorId;
  await service.stopMonitoring(monitorId);
  res.json({ success: true, message: 'Monitoring stopped' });
}));

router.get('/data/:tenantId', asyncHandler(async (req: Request, res: Response) => {
  const jobId = req.params.tenantId;
  const result = await service.getScrapedData(jobId);
  if (!result) {
    res.status(404).json({ success: false, error: 'Scraped data not found', code: 'NOT_FOUND' });
    return;
  }
  res.json({ success: true, data: result });
}));

router.post('/compare', asyncHandler(async (req: Request, res: Response) => {
  const { monitorId, date1, date2 } = CompareSnapshotsBody.parse(req.body);
  const result = await service.compareSnapshots(monitorId, date1, date2);
  res.json({ success: true, data: result });
}));

router.post('/extract-tables', asyncHandler(async (req: Request, res: Response) => {
  const { url } = ExtractTablesBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.extractTables(url, tenantId);
  res.json({ success: true, data: result });
}));

router.post('/search', asyncHandler(async (req: Request, res: Response) => {
  const { query } = SearchWebBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.searchWeb(query, tenantId);
  res.json({ success: true, data: result });
}));

export default router;
