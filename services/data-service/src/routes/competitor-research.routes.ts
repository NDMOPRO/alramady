import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { CompetitorResearchService } from '../services/competitor-research.service';

const router = Router();
const service = new CompetitorResearchService();

router.use(authMiddleware);
router.use(tenantMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const ScrapeBody = z.object({
  url: z.string().url('A valid URL is required'),
  selectors: z.record(z.string()).default({}),
});

const AnalyzeBody = z.object({
  competitors: z.array(z.object({
    name: z.string().min(1, 'Competitor name is required'),
    data: z.record(z.unknown()),
  })).min(1, 'At least one competitor is required'),
  yourMetrics: z.record(z.number()),
  industry: z.string().min(1, 'Industry is required'),
});

const MonitorBody = z.object({
  url: z.string().url('A valid URL is required'),
  competitorName: z.string().min(1, 'Competitor name is required'),
  selectors: z.record(z.string()).default({}),
  frequency: z.enum(['hourly', 'daily', 'weekly']),
});

const CompareSnapshotsBody = z.object({
  monitorId: z.string().uuid('Valid monitor ID is required'),
  date1: z.string().refine((d) => !isNaN(Date.parse(d)), { message: 'date1 must be a valid ISO date' }),
  date2: z.string().refine((d) => !isNaN(Date.parse(d)), { message: 'date2 must be a valid ISO date' }),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post('/scrape', asyncHandler(async (req: Request, res: Response) => {
  const { url, selectors } = ScrapeBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.scrapeCompetitorData(url, selectors, tenantId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/analyze', asyncHandler(async (req: Request, res: Response) => {
  const { competitors, yourMetrics, industry } = AnalyzeBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.analyzeCompetitors(competitors, yourMetrics, industry, tenantId);
  res.status(201).json({ success: true, data: result });
}));

router.post('/monitor', asyncHandler(async (req: Request, res: Response) => {
  const { url, competitorName, selectors, frequency } = MonitorBody.parse(req.body);
  const { tenantId } = req.tenant!;
  const result = await service.setupMonitoring({
    url,
    competitorName,
    selectors,
    frequency,
    tenantId,
  });
  res.status(201).json({ success: true, data: result });
}));

router.delete('/monitor/:monitorId', asyncHandler(async (req: Request, res: Response) => {
  const monitorId = req.params.monitorId;
  await service.stopMonitoring(monitorId);
  res.json({ success: true, message: 'Monitoring stopped' });
}));

router.get('/monitor/:monitorId/history', asyncHandler(async (req: Request, res: Response) => {
  const monitorId = req.params.monitorId;
  const limit = parseInt(req.query.limit as string) || 50;
  const result = await service.getMonitoringHistory(monitorId, limit);
  res.json({ success: true, data: result });
}));

router.post('/compare', asyncHandler(async (req: Request, res: Response) => {
  const { monitorId, date1, date2 } = CompareSnapshotsBody.parse(req.body);
  const result = await service.compareSnapshots(monitorId, date1, date2);
  res.json({ success: true, data: result });
}));

export default router;
