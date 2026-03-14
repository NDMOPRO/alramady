import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { auditService } from '../services/audit.service';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, name, tenantId } = req.body;
      if (!email || !password || !name) { res.status(400).json({ error: 'email, password, and name are required' }); return; }
      const result = await authService.register(email, password, name, tenantId);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('already registered') || message.includes('Password must')) {
        res.status(400).json({ error: message }); return;
      }
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, username, password } = req.body;
      const loginIdentifier = username || email;
      if (!loginIdentifier || !password) { res.status(400).json({ error: 'username/password required' }); return; }
      const result = await authService.login(loginIdentifier, password);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Invalid credentials') || message.includes('locked') || message.includes('suspended')) {
        res.status(401).json({ error: message }); return;
      }
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id as string;
      const { refreshToken } = req.body;
      const result = await authService.logout(userId, refreshToken || '');
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) { res.status(400).json({ error: 'refreshToken required' }); return; }
      const result = await authService.refreshToken(refreshToken);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(401).json({ error: message });
    }
  }

  async enable2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id as string;
      const result = await authService.enable2FA(userId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async verify2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, token } = req.body;
      if (!userId || !token) { res.status(400).json({ error: 'userId and token required' }); return; }
      const result = await authService.verify2FA(userId, token);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(401).json({ error: message });
    }
  }

  async getAuditLog(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const { page, limit, userId, action, entityType, startDate, endDate } = req.query;
      const dateRange = startDate && endDate
        ? { start: new Date(startDate as string), end: new Date(endDate as string) }
        : undefined;
      const result = await auditService.getAuditLog(
        { userId: userId as string, action: action as string, resource: entityType as string, dateRange },
        { page: Number(page) || 1, limit: Number(limit) || 50 },
        tenantId,
      );
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  }

  async getAuditTrail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user!.tenantId as string;
      const result = await auditService.getAuditTrail(req.params.entityId!, tenantId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async getUserActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { start, end } = req.query;
      const dateRange = start && end ? { start: new Date(start as string), end: new Date(end as string) } : { start: new Date(0), end: new Date() };
      const result = await auditService.getUserActivity(req.params.userId!, dateRange);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }
}

export const authController = new AuthController();
