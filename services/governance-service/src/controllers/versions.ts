import { Request, Response, NextFunction } from 'express';
import * as versionsService from '../services/versions';
import { logger } from '../utils/logger';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      search: req.query.search as string,
      resourceType: req.query.resourceType as string,
      resourceId: req.query.resourceId as string,
    };

    const result = await versionsService.list(params);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await versionsService.getById(req.params.id);
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await versionsService.create({
      ...req.body,
      createdBy: req.user?.userId,
    });
    logger.info('Version created via API', { id: record.id, userId: req.user?.userId });
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await versionsService.update(req.params.id, {
      ...req.body,
      updatedBy: req.user?.userId,
    });
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await versionsService.remove(req.params.id);
    res.json({ success: true, message: 'Version deleted successfully' });
  } catch (error) {
    next(error);
  }
}
