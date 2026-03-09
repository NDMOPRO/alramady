import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as service from '../services/data-localization';

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: { id: req.params.id } });
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
    res.json({ success: true, data: { id: req.params.id, ...req.body } });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: { id: req.params.id } });
  } catch (error) {
    next(error);
  }
}

export async function convertNumber(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = service.convertNumber(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function convertToHijri(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = service.convertToHijri(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function localizeDataBatch(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.localizeDataBatch({
      ...req.body,
      tenantId: req.user?.tenantId || req.body.tenantId,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
