import { Request, Response, NextFunction } from 'express';

export interface TenantContext {
  tenantId: string;
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  const tenantId =
    req.user?.organizationId ||
    req.user?.tenantId ||
    (req.headers['x-tenant-id'] as string | undefined);

  if (!tenantId) {
    res.status(400).json({
      success: false,
      error: 'Tenant ID is required. Provide organizationId/tenantId in JWT or X-Tenant-Id header.',
      code: 'TENANT_MISSING',
    });
    return;
  }

  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'User ID is required in JWT payload.',
      code: 'USER_MISSING',
    });
    return;
  }

  req.tenant = { tenantId, userId };
  next();
}
