import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as service from '../services/dual-verify';

export async function list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      search: req.query.search as string,
      verificationMethod: req.query.verificationMethod as string,
      autoResolve: req.query.autoResolve !== undefined ? req.query.autoResolve === 'true' : undefined,
      isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
      sortBy: (req.query.sortBy as string) || 'verifiedAt',
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
    const record = await service.create({ ...req.body, createdBy: req.user!.userId });
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

export async function executeDualVerification(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const originalFile = files?.originalImage?.[0];
    const replicaFile = files?.replicaImage?.[0];

    if (!originalFile || !replicaFile) {
      res.status(400).json({
        success: false,
        error: 'Both originalImage and replicaImage files are required',
      });
      return;
    }

    const result = await service.executeDualVerification({
      originalDocumentId: req.body.originalDocumentId,
      replicaDocumentId: req.body.replicaDocumentId,
      tenantId: req.user!.tenantId! || req.body.tenantId,
      userId: req.user!.userId || req.body.userId,
      originalImageBuffer: originalFile.buffer,
      replicaImageBuffer: replicaFile.buffer,
      matchMode: req.body.matchMode || 'STRICT',
      pixelDeviationThreshold: req.body.pixelDeviationThreshold
        ? parseFloat(req.body.pixelDeviationThreshold)
        : 0.001,
      structuralFingerprintThreshold: req.body.structuralFingerprintThreshold
        ? parseFloat(req.body.structuralFingerprintThreshold)
        : 0.999,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function analyzeDeviations(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.analyzeDeviations(req.params.verificationId!);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
