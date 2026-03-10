import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as collaborationService from '../services/collaboration';

export async function list(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 20, sortBy, sortOrder, presentationId, collaborationType } = req.query;
    const result = await collaborationService.list({
      page: Number(page), limit: Number(limit), sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc', userId: req.user!.id!,
      presentationId: presentationId as string, collaborationType: collaborationType as string,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await collaborationService.getById(req.params.id!, req.user!.id!);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await collaborationService.create(req.body, req.user!.id!);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await collaborationService.update(req.params.id!, req.body, req.user!.id!);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await collaborationService.remove(req.params.id!, req.user!.id!);
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function addCollaborator(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await collaborationService.addCollaborator(req.params.id!, req.body, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function removeCollaborator(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await collaborationService.removeCollaborator(req.params.id!, req.params.collaboratorId!, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getActiveUsers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await collaborationService.getActiveUsers(req.params.id!, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function addComment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await collaborationService.addComment(req.params.id!, req.body, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
