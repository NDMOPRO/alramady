import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as service from '../services/core-principle';

export async function list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      search: req.query.search as string,
      principleType: req.query.principleType as string,
      isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
      sortBy: (req.query.sortBy as string) || 'createdAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };
    const result = await service.list(params);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await service.getById(req.params.id!);
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await service.create({ ...req.body, tenantId: req.user!.tenantId! || req.body.tenantId, createdBy: req.user!.userId });
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await service.update(req.params.id!, { ...req.body, updatedBy: req.user!.userId });
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.remove(req.params.id!);
    res.json({ ...result, success: true });
  } catch (error) {
    next(error);
  }
}

export async function configure(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const config = await service.configurePrinciple({
      ...req.body,
      tenantId: req.user!.tenantId! || req.body.tenantId,
    });
    res.json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
}

export async function validate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId! || req.body.tenantId;
    const result = await service.validateAgainstPrinciples(
      tenantId,
      req.body.matchMode,
      req.body.scores,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function checkResources(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId! || (req.query.tenantId as string);
    const result = await service.checkResourceLimits(tenantId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
