import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as service from '../services/match-phases';

export async function list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      search: req.query.search as string,
      phaseType: req.query.phaseType as string,
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
    const record = await service.getById(req.params.id);
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await service.create({ ...req.body, tenantId: req.user?.tenantId || req.body.tenantId, createdBy: req.user?.userId });
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await service.update(req.params.id, { ...req.body, updatedBy: req.user?.userId });
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.remove(req.params.id);
    res.json({ ...result, success: true });
  } catch (error) {
    next(error);
  }
}

export async function executeFullPipeline(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = (req as unknown as { file?: Express.Multer.File }).file;

    if (!file) {
      res.status(400).json({ success: false, error: 'Image file is required' });
      return;
    }

    const result = await service.executeFullPipeline({
      documentId: req.body.documentId,
      tenantId: req.user?.tenantId || req.body.tenantId,
      userId: req.user?.userId || req.body.userId,
      imageBuffer: file.buffer,
      matchMode: req.body.matchMode || 'STRICT',
      dpi: req.body.dpi ? parseInt(req.body.dpi, 10) : 150,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function compareFingerprints(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { originalFingerprint, replicaFingerprint } = req.body;
    const result = await service.executePhase4ComparisonVerification(
      originalFingerprint,
      replicaFingerprint,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
