import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth';
import * as service from '../services/language-intelligence';

const prisma = new PrismaClient();

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const jobs = await prisma.localizationJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const job = await prisma.localizationJob.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!job) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    res.json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId;
    const userId = authReq.user?.userId;
    if (!tenantId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const job = await prisma.localizationJob.create({
      data: {
        tenantId,
        createdBy: userId,
        documentId: req.body.documentId || null,
        sourceLanguage: req.body.sourceLanguage || 'en',
        targetLanguage: req.body.targetLanguage || 'ar',
        status: 'pending',
      },
    });
    res.status(201).json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const existing = await prisma.localizationJob.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!existing) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    const updated = await prisma.localizationJob.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.sourceLanguage && { sourceLanguage: req.body.sourceLanguage }),
        ...(req.body.targetLanguage && { targetLanguage: req.body.targetLanguage }),
        ...(req.body.status && { status: req.body.status }),
        ...(req.body.resultContent && { resultContent: req.body.resultContent }),
        ...(req.body.metadata && { metadata: req.body.metadata }),
      },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const existing = await prisma.localizationJob.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!existing) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    await prisma.localizationJob.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function analyzeContext(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.analyzeContext({
      ...req.body,
      tenantId: req.user?.tenantId || req.body.tenantId,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function buildSemanticMap(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.buildSemanticMap({
      ...req.body,
      tenantId: req.user?.tenantId || req.body.tenantId,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function translateTechnicalTerms(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.translateTechnicalTerms({
      ...req.body,
      tenantId: req.user?.tenantId || req.body.tenantId,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function translateAbbreviations(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.translateAbbreviations({
      ...req.body,
      tenantId: req.user?.tenantId || req.body.tenantId,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getDomainTerms(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const domain = req.params.domain || req.query.domain as string;
    const targetLanguage = (req.query.targetLanguage as string) || 'ar';
    const result = await service.getDomainTerms(domain, targetLanguage);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
