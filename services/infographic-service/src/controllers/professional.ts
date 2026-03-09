import { Request, Response, NextFunction } from 'express';
import * as professionalService from '../services/professional';

interface AuthenticatedUser {
  id: string;
  [key: string]: unknown;
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 20, sortBy, sortOrder, infographicType, search, isPublic } = req.query;
    const result = await professionalService.list({
      page: Number(page), limit: Number(limit), sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc', userId: (req.user as AuthenticatedUser)!.id,
      infographicType: infographicType as string, search: search as string,
      isPublic: isPublic !== undefined ? isPublic === 'true' : undefined,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await professionalService.getById(req.params.id, (req.user as AuthenticatedUser)!.id);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await professionalService.create(req.body, (req.user as AuthenticatedUser)!.id);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await professionalService.update(req.params.id, req.body, (req.user as AuthenticatedUser)!.id);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await professionalService.remove(req.params.id, (req.user as AuthenticatedUser)!.id);
    res.json({ ...result });
  } catch (err) { next(err); }
}

export async function duplicate(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await professionalService.duplicate(req.params.id, (req.user as AuthenticatedUser)!.id);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function exportInfographic(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await professionalService.exportInfographic(req.params.id, req.body.format || 'png', (req.user as AuthenticatedUser)!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function generateFromData(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await professionalService.generateFromData(req.body, (req.user as AuthenticatedUser)!.id);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function applyTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await professionalService.applyTemplate(req.params.id, req.body.templateId, (req.user as AuthenticatedUser)!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await professionalService.getTemplates(req.query.category as string);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function addSection(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await professionalService.addSection(req.params.id, req.body, (req.user as AuthenticatedUser)!.id);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function updateSection(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await professionalService.updateSection(req.params.id, Number(req.params.sectionIndex), req.body, (req.user as AuthenticatedUser)!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function removeSection(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await professionalService.removeSection(req.params.id, Number(req.params.sectionIndex), (req.user as AuthenticatedUser)!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function reorderSections(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await professionalService.reorderSections(req.params.id, req.body.order, (req.user as AuthenticatedUser)!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function analyzeData(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await professionalService.analyzeData(req.params.id, (req.user as AuthenticatedUser)!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
