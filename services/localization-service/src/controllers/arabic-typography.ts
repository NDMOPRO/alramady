import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as service from '../services/arabic-typography';

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: { id: req.params.id! } });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(201).json({ success: true, data: req.body });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: { id: req.params.id!, ...req.body } });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: { id: req.params.id! } });
  } catch (error) {
    next(error);
  }
}

export async function applyArabicFont(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = service.applyArabicFont(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function processDiacritics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.processDiacritics({
      ...req.body,
      tenantId: req.user!.tenantId! || req.body.tenantId,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function applyUthmaniScript(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = service.applyUthmaniScript({
      ...req.body,
      tenantId: req.user!.tenantId! || req.body.tenantId,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function justifyWithKashida(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = service.justifyWithKashida(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function computeBaseline(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = service.computeBaseline(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
