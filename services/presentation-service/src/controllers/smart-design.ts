import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as smartDesignService from '../services/smart-design';

export async function list(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 20, sortBy, sortOrder, designMode, search } = req.query;
    const result = await smartDesignService.list({
      page: Number(page), limit: Number(limit), sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc', userId: req.user!.id,
      designMode: designMode as string, search: search as string,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await smartDesignService.getById(req.params.id, req.user!.id);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await smartDesignService.create(req.body, req.user!.id);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await smartDesignService.update(req.params.id, req.body, req.user!.id);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await smartDesignService.remove(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function applyDesign(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await smartDesignService.applyDesign(req.params.presentationId, req.params.id, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function suggestDesigns(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await smartDesignService.suggestDesigns(req.params.presentationId, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function analyzeBrand(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await smartDesignService.analyzeBrand(req.params.brandGuideId, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
