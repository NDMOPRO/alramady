import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as exportShareService from '../services/export-share';

export async function list(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 20, sortBy, sortOrder, exportFormat, search } = req.query;
    const result = await exportShareService.list({
      page: Number(page), limit: Number(limit), sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc', userId: req.user!.id!,
      exportFormat: exportFormat as string, search: search as string,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await exportShareService.getById(req.params.id!, req.user!.id!);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await exportShareService.create(req.body, req.user!.id!);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await exportShareService.update(req.params.id!, req.body, req.user!.id!);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await exportShareService.remove(req.params.id!, req.user!.id!);
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function getDownloadUrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await exportShareService.getDownloadUrl(req.params.id!, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getShareLink(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await exportShareService.getShareLink(req.params.id!, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function revokeShare(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await exportShareService.revokeShare(req.params.id!, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
