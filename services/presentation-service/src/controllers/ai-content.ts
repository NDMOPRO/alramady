import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as aiContentService from '../services/ai-content';

export async function list(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 20, sortBy, sortOrder, contentType, search } = req.query;
    const result = await aiContentService.list({
      page: Number(page), limit: Number(limit), sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc', userId: req.user!.id!,
      contentType: contentType as string, search: search as string,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await aiContentService.getById(req.params.id!, req.user!.id!);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await aiContentService.create(req.body, req.user!.id!);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await aiContentService.update(req.params.id!, req.body, req.user!.id!);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await aiContentService.remove(req.params.id!, req.user!.id!);
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function generate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await aiContentService.generate(req.params.id!, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function regenerate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await aiContentService.regenerate(req.params.id!, req.user!.id!, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function refine(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await aiContentService.refine(req.params.id!, req.user!.id!, req.body.feedback);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function suggestImprovements(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await aiContentService.suggestImprovements(req.params.id!, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
