import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as service from '../services/image-matching';

export async function list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      search: req.query.search as string,
      algorithm: req.query.algorithm as string,
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

export async function matchDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = (req as unknown as { file?: Express.Multer.File }).file;

    if (!file) {
      res.status(400).json({ success: false, error: 'Dashboard image file is required' });
      return;
    }

    const result = await service.matchDashboardFromImage({
      tenantId: req.user!.tenantId! || req.body.tenantId,
      userId: req.user!.userId || req.body.userId,
      imageBuffer: file.buffer,
      preserveExactDimensions: req.body.preserveExactDimensions !== 'false',
      preserveExactPadding: req.body.preserveExactPadding !== 'false',
      disableAutoBeautification: req.body.disableAutoBeautification !== 'false',
      matchMode: req.body.matchMode || 'STRICT',
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function extractChartData(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = (req as unknown as { file?: Express.Multer.File }).file;

    if (!file) {
      res.status(400).json({ success: false, error: 'Image file is required' });
      return;
    }

    const position = {
      x: parseInt(req.body.x || '0', 10),
      y: parseInt(req.body.y || '0', 10),
      width: parseInt(req.body.width || '400', 10),
      height: parseInt(req.body.height || '300', 10),
    };

    const result = await service.extractChartAxesAndDataPoints(file.buffer, position);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
