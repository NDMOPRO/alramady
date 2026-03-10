import { Request, Response, NextFunction } from 'express';
import * as compareService from '../services/advanced-compare';
import { logger } from '../utils/logger';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      search: req.query.search as string,
      sourceType: req.query.sourceType as string,
      targetType: req.query.targetType as string,
      compareMode: req.query.compareMode as string,
    };

    const result = await compareService.list(params);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await compareService.getById(req.params.id!);
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await compareService.create({
      ...req.body,
      createdBy: req.user!.userId,
    });
    logger.info('Comparison created via API', { id: record.id, userId: req.user!.userId });
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await compareService.update(req.params.id!, {
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
    await compareService.remove(req.params.id!);
    res.json({ success: true, message: 'Comparison deleted successfully' });
  } catch (error) {
    next(error);
  }
}
