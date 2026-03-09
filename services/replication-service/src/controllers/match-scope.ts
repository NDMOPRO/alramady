import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as service from '../services/match-scope';

export async function list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      search: req.query.search as string,
      scopeType: req.query.scopeType as string,
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

export async function analyzeScope(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.analyzeDocumentScope({
      documentId: req.body.documentId,
      tenantId: req.user?.tenantId || req.body.tenantId,
      userId: req.user?.userId || req.body.userId,
      sourceFormat: req.body.sourceFormat,
      targetFormat: req.body.targetFormat,
      matchMode: req.body.matchMode,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getCapabilities(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const format = req.params.format as string;
    const capabilities = service.getFormatCapabilities(format);
    res.json({ success: true, data: capabilities });
  } catch (error) {
    next(error);
  }
}

export async function getSupportedFormats(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const formats = service.getSupportedFormats();
    res.json({ success: true, data: formats });
  } catch (error) {
    next(error);
  }
}

export async function checkConversion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const supported = service.isConversionSupported(
      req.query.sourceFormat as string,
      req.query.targetFormat as string,
    );
    res.json({ success: true, data: { supported } });
  } catch (error) {
    next(error);
  }
}
