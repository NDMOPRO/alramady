import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as animationService from '../services/animation';

export async function list(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 20, sortBy, sortOrder, presentationId, animationType } = req.query;
    const result = await animationService.list({
      page: Number(page), limit: Number(limit), sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc', userId: req.user!.id,
      presentationId: presentationId as string, animationType: animationType as string,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await animationService.getById(req.params.id, req.user!.id);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await animationService.create(req.body, req.user!.id);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await animationService.update(req.params.id, req.body, req.user!.id);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await animationService.remove(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function preview(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await animationService.preview(req.params.id, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function applyPreset(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await animationService.applyPreset(req.params.presentationId, req.body.presetId, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function reorder(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await animationService.reorder(req.params.presentationId, Number(req.body.slideIndex), req.body.order, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
