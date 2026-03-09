import { Request, Response, NextFunction } from 'express';
import * as permissionsService from '../services/permissions-security';
import { logger } from '../utils/logger';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      search: req.query.search as string,
      resource: req.query.resource as string,
      action: req.query.action as string,
      scope: req.query.scope as string,
    };

    const result = await permissionsService.list(params);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await permissionsService.getById(req.params.id);
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await permissionsService.create({
      ...req.body,
      createdBy: req.user?.userId,
    });
    logger.info('Permission created via API', { id: record.id, userId: req.user?.userId });
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await permissionsService.update(req.params.id, {
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
    await permissionsService.remove(req.params.id);
    res.json({ success: true, message: 'Permission deleted successfully' });
  } catch (error) {
    next(error);
  }
}
