import { Request, Response, NextFunction } from 'express';
import * as teamworkService from '../services/teamwork';
import { logger } from '../utils/logger';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      search: req.query.search as string,
      organizationId: req.query.organizationId as string,
      type: req.query.type as string,
    };

    const result = await teamworkService.list(params);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await teamworkService.getById(req.params.id!);
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await teamworkService.create({
      ...req.body,
      createdBy: req.user!.userId,
    });
    logger.info('Team created via API', { id: record.id, userId: req.user!.userId });
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await teamworkService.update(req.params.id!, {
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
    await teamworkService.remove(req.params.id!);
    res.json({ success: true, message: 'Team deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function getMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await teamworkService.getMembers(req.params.id!);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, role } = req.body as { userId?: string; role?: string };
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }

    const result = await teamworkService.addMember(req.params.id!, userId, role || 'member');
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await teamworkService.removeMember(req.params.id!, req.params.userId!);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
