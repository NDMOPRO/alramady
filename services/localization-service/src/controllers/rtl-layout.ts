import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth';
import * as service from '../services/rtl-layout';

const prisma = new PrismaClient();

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const items = await prisma.localizedContent.findMany({
      where: { tenantId, contentType: 'rtl-layout' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const item = await prisma.localizedContent.findFirst({
      where: { id: req.params.id!, tenantId, contentType: 'rtl-layout' },
    });
    if (!item) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    res.json({ success: true, data: item });
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
    const item = await prisma.localizedContent.create({
      data: {
        tenantId,
        createdBy: userId,
        contentType: 'rtl-layout',
        contentId: req.body.contentId || req.body.sourceId || '',
        locale: req.body.locale || 'ar',
        title: req.body.title || null,
        content: req.body.content ? JSON.stringify(req.body.content) : null,
        status: 'pending',
      },
    });
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const existing = await prisma.localizedContent.findFirst({
      where: { id: req.params.id!, tenantId, contentType: 'rtl-layout' },
    });
    if (!existing) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    const updated = await prisma.localizedContent.update({
      where: { id: req.params.id! },
      data: {
        ...(req.body.content && { content: JSON.stringify(req.body.content) }),
        ...(req.body.status && { status: req.body.status }),
        ...(req.body.title && { title: req.body.title }),
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
    const existing = await prisma.localizedContent.findFirst({
      where: { id: req.params.id!, tenantId, contentType: 'rtl-layout' },
    });
    if (!existing) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    await prisma.localizedContent.delete({ where: { id: req.params.id! } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function mirrorChart(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = service.mirrorChart(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function mirrorTable(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = service.mirrorTable(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function mirrorUIElements(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = service.mirrorUIElements(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
