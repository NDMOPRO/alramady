import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as service from '../services/kpi-advanced';
import { logger } from '../utils/logger';

export async function list(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page, limit, sortBy, sortOrder, search } = req.query as Record<string, string | undefined>;
    const result = await service.list({ page, limit, sortBy, sortOrder, search });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await service.getById(req.params.id);
    res.json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await service.create({ ...req.body, createdBy: req.user?.id });
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await service.update(req.params.id, req.body);
    res.json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await service.remove(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function calculate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    logger.info('KPI calculate request', { userId: req.user?.id });
    const result = await service.calculate(req.body, req.user?.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function definitions(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const defs = await service.getDefinitions();
    res.json({ success: true, data: defs });
  } catch (err) {
    next(err);
  }
}

export async function benchmarkKpi(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    logger.info('KPI benchmark request', { userId: req.user?.id });
    const result = await service.benchmark(req.body, req.user?.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function trends(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { kpiId, period, limit: trendLimit } = req.query as Record<string, string | undefined>;
    const result = await service.getTrends({ kpiId, period, limit: trendLimit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
