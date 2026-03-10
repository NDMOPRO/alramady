import { Request, Response, NextFunction } from 'express';
import * as templateService from '../services/templates-themes';
import { logger } from '../utils/logger';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      search: req.query.search as string,
      category: req.query.category as string,
      type: req.query.type as string,
      industry: req.query.industry as string,
      locale: req.query.locale as string,
      isPremium: req.query.isPremium !== undefined ? req.query.isPremium === 'true' : undefined,
      isPublished: req.query.isPublished !== undefined ? req.query.isPublished === 'true' : undefined,
    };

    const result = await templateService.list(params);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await templateService.getById(req.params.id!);
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await templateService.create({
      ...req.body,
      createdBy: req.user!.userId,
    });
    logger.info('Template created via API', { id: record.id, userId: req.user!.userId });
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await templateService.update(req.params.id!, {
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
    await templateService.remove(req.params.id!);
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    next(error);
  }
}
