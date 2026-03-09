import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as advancedEditService from '../services/advanced-edit';

export async function list(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 20, sortBy, sortOrder, presentationId, operation } = req.query;
    const result = await advancedEditService.list({
      page: Number(page), limit: Number(limit), sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc', userId: req.user!.id,
      presentationId: presentationId as string, operation: operation as string,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await advancedEditService.getById(req.params.id, req.user!.id);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await advancedEditService.create(req.body, req.user!.id);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await advancedEditService.update(req.params.id, req.body, req.user!.id);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await advancedEditService.remove(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function undo(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await advancedEditService.undo(req.params.presentationId, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function redo(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await advancedEditService.redo(req.params.presentationId, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function batchEdit(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await advancedEditService.batchEdit(req.params.presentationId, req.body.operations, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
