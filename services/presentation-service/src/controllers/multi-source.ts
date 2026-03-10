import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as multiSourceService from '../services/multi-source';
import { logger } from '../utils/logger';

export async function list(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 20, sortBy, sortOrder, sourceType, search } = req.query;
    const result = await multiSourceService.list({
      page: Number(page), limit: Number(limit), sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc', userId: req.user!.id!,
      sourceType: sourceType as string, search: search as string,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await multiSourceService.getById(req.params.id!, req.user!.id!);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await multiSourceService.create(req.body, req.user!.id!);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await multiSourceService.update(req.params.id!, req.body, req.user!.id!);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await multiSourceService.remove(req.params.id!, req.user!.id!);
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function importFromSource(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await multiSourceService.importFromSource(req.params.id!, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function syncSource(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await multiSourceService.syncSource(req.params.id!, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function previewSource(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await multiSourceService.previewSource(req.params.id!, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
