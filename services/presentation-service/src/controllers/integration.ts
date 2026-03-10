import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as integrationService from '../services/integration';

export async function list(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 20, sortBy, sortOrder, integrationType, enabled } = req.query;
    const result = await integrationService.list({
      page: Number(page), limit: Number(limit), sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc', userId: req.user!.id!,
      integrationType: integrationType as string,
      enabled: enabled !== undefined ? enabled === 'true' : undefined,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await integrationService.getById(req.params.id!, req.user!.id!);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await integrationService.create(req.body, req.user!.id!);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await integrationService.update(req.params.id!, req.body, req.user!.id!);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await integrationService.remove(req.params.id!, req.user!.id!);
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function testConnection(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await integrationService.testConnection(req.params.id!, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function syncNow(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await integrationService.syncNow(req.params.id!, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getWebhookLogs(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await integrationService.getWebhookLogs(req.params.id!, req.user!.id!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
