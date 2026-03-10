import { Request, Response, NextFunction } from 'express';
import * as oneClickService from '../services/one-click-ops';
import { logger } from '../utils/logger';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      search: req.query.search as string,
      operationType: req.query.operationType as string,
    };

    const result = await oneClickService.list(params);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await oneClickService.getById(req.params.id!);
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await oneClickService.create({
      ...req.body,
      createdBy: req.user!.userId,
    });
    logger.info('One-click op created via API', { id: record.id, userId: req.user!.userId });
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await oneClickService.update(req.params.id!, {
      ...req.body,
      updatedBy: req.user!.userId,
    });
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await oneClickService.remove(req.params.id!);
    res.json({ success: true, message: 'One-click operation deleted successfully' });
  } catch (error) {
    next(error);
  }
}
