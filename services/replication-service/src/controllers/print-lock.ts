import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as service from '../services/print-lock';

export async function list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      search: req.query.search as string,
      lockType: req.query.lockType as string,
      securityLevel: req.query.securityLevel as string,
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

export async function applyLock(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.applyPrintLock({
      documentId: req.body.documentId,
      tenantId: req.user!.tenantId! || req.body.tenantId,
      userId: req.user!.userId || req.body.userId,
      lockType: req.body.lockType,
      scope: req.body.scope,
      targetIds: req.body.targetIds,
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function validateLock(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.validatePrintLock(
      req.params.documentId!,
      req.body.currentElements,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function releaseLock(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.releasePrintLock({
      lockId: req.params.lockId!,
      userId: req.user!.userId || req.body.userId,
      reason: req.body.reason,
      supervisorApproval: req.body.supervisorApproval === true,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function configureFonts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.configureFontLock({
      documentId: req.body.documentId,
      tenantId: req.user!.tenantId! || req.body.tenantId,
      fontEmbedding: req.body.fontEmbedding,
      preserveKerningTables: req.body.preserveKerningTables,
      preserveBaseline: req.body.preserveBaseline,
      preserveLineHeight: req.body.preserveLineHeight,
      preserveLetterSpacing: req.body.preserveLetterSpacing,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getActiveLocks(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const locks = await service.getActiveLocksForDocument(req.params.documentId!);
    res.json({ success: true, data: locks });
  } catch (error) {
    next(error);
  }
}
