import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticationService } from '../services/authentication.service';
import { authorizationService } from '../services/authorization.service';
import { auditService } from '../services/audit.service';
import { dataGovernanceService } from '../services/data-governance.service';
import { workflowService } from '../services/workflow.service';
import { notificationService } from '../services/notification.service';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { logger } from '../utils/logger';

const router = Router();

// ──────────────────────────────────────────────
// Zod Schemas
// ──────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100),
  role: z.string().optional().default('viewer'),
  tenantId: z.string().min(1, 'Tenant ID is required'),
});

const loginSchema = z.object({
  email: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const logoutSchema = z.object({
  tokenId: z.string().min(1, 'Token ID is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email is required'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

const verify2FASchema = z.object({
  token: z.string().min(4, 'Token must be at least 4 characters').max(8),
});

const disable2FASchema = z.object({
  token: z.string().min(4).max(8),
});

const createRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required').max(64),
  permissions: z.array(z.object({
    resource: z.string().min(1),
    actions: z.array(z.string().min(1)).min(1),
  })).min(1),
  tenantId: z.string().min(1),
});

const assignRoleSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

const checkPermissionSchema = z.object({
  userId: z.string().min(1),
  resource: z.string().min(1),
  action: z.string().min(1),
});

const createPolicySchema = z.object({
  name: z.string().min(1).max(128),
  rules: z.array(z.object({
    resource: z.string().min(1),
    action: z.string().min(1),
    condition: z.any().optional(),
  })).min(1),
  tenantId: z.string().min(1),
});

const evaluatePolicySchema = z.object({
  userId: z.string().min(1),
  resource: z.string().min(1),
  action: z.string().min(1),
  context: z.record(z.any()).optional().default({}),
});

const auditQuerySchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('50'),
});

const auditExportSchema = z.object({
  format: z.enum(['csv', 'pdf']).default('csv'),
  userId: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const classifyDataSchema = z.object({
  classification: z.enum(['public', 'internal', 'confidential', 'restricted']),
});

const maskDataSchema = z.object({
  columns: z.array(z.string().min(1)).min(1),
  method: z.enum(['redact', 'hash', 'tokenize']),
});

const anonymizeDataSchema = z.object({
  columns: z.array(z.string().min(1)).min(1),
});

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(128),
  steps: z.array(z.object({
    name: z.string().min(1),
    approverRole: z.string().min(1),
    order: z.number().int().min(0),
  })).min(1),
  tenantId: z.string().min(1),
});

const submitWorkflowSchema = z.object({
  resourceId: z.string().min(1),
  resourceType: z.string().min(1),
  workflowId: z.string().min(1),
});

const approveStepSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().optional().default(''),
});

const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(256),
  body: z.string().min(1),
});

const notificationPaginationSchema = z.object({
  unreadOnly: z.string().optional(),
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('50'),
});

// ──────────────────────────────────────────────
// Helper: wrap async route handlers
// ──────────────────────────────────────────────

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ──────────────────────────────────────────────
// AUTH ROUTES
// ──────────────────────────────────────────────

router.post(
  '/auth/register',
  validate(registerSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { email, password, name, role, tenantId } = req.body;
    const result = await authenticationService.register(email, password, name, role, tenantId);
    logger.info('Registration endpoint called', { email });
    res.status(201).json({
      success: true,
      data: result,
      message: 'User registered successfully',
    });
  })
);

router.post(
  '/auth/login',
  validate(loginSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { email, password } = req.body;
    const result = await authenticationService.login(email, password);
    logger.info('Login endpoint called', { email });
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.post(
  '/auth/logout',
  authMiddleware,
  validate(logoutSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.userId;
    const { tokenId } = req.body;
    const result = await authenticationService.logout(userId, tokenId);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.post(
  '/auth/refresh',
  validate(refreshSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { refreshToken } = req.body;
    const result = await authenticationService.refreshToken(refreshToken);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.post(
  '/auth/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { email } = req.body;
    const result = await authenticationService.forgotPassword(email);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.post(
  '/auth/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { token, newPassword } = req.body;
    const result = await authenticationService.resetPassword(token, newPassword);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.post(
  '/auth/2fa/enable',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.userId;
    const result = await authenticationService.enable2FA(userId);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.post(
  '/auth/2fa/verify',
  authMiddleware,
  validate(verify2FASchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.userId;
    const { token } = req.body;
    const result = await authenticationService.verify2FA(userId, token);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.post(
  '/auth/2fa/disable',
  authMiddleware,
  validate(disable2FASchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.userId;
    const { token } = req.body;
    const result = await authenticationService.disable2FA(userId, token);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

// ──────────────────────────────────────────────
// ROLES ROUTES
// ──────────────────────────────────────────────

router.post(
  '/roles',
  authMiddleware,
  validate(createRoleSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { name, permissions, tenantId } = req.body;
    const result = await authorizationService.createRole(name, permissions, tenantId);
    res.status(201).json({
      success: true,
      data: result,
    });
  })
);

router.post(
  '/roles/:id/assign',
  authMiddleware,
  validate(assignRoleSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const roleId = req.params.id;
    const { userId } = req.body;
    const result = await authorizationService.assignRole(userId, roleId);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.get(
  '/roles',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { PrismaClient: PClient } = await import('@prisma/client');
    const db = new PClient();
    try {
      const tenantId = (req.query.tenantId as string) || req.user!.organizationId || '';
      const where: Record<string, unknown> = {};
      if (tenantId) {
        where.tenantId = tenantId;
      }
      const allRoles = await db.role.findMany({
        where,
        include: { permissions: true },
        orderBy: { createdAt: 'desc' },
      });
      const roles = allRoles.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        tenantId: r.tenantId,
        permissions: r.permissions.map((p: { resourceType: string; action: string }) => ({
          resource: p.resourceType,
          action: p.action,
        })),
        createdAt: r.createdAt,
      }));
      res.status(200).json({
        success: true,
        data: roles,
      });
    } finally {
      await db.$disconnect();
    }
  })
);

router.post(
  '/permissions/check',
  authMiddleware,
  validate(checkPermissionSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId, resource, action } = req.body;
    const result = await authorizationService.checkPermission(userId, resource, action);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

// ──────────────────────────────────────────────
// POLICIES ROUTES
// ──────────────────────────────────────────────

router.post(
  '/policies',
  authMiddleware,
  validate(createPolicySchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { name, rules, tenantId } = req.body;
    const result = await authorizationService.createPolicy(name, rules, tenantId);
    res.status(201).json({
      success: true,
      data: result,
    });
  })
);

router.post(
  '/policies/evaluate',
  authMiddleware,
  validate(evaluatePolicySchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId, resource, action, context } = req.body;
    const result = await authorizationService.evaluatePolicy(userId, resource, action, context);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

// ──────────────────────────────────────────────
// AUDIT ROUTES
// ──────────────────────────────────────────────

router.get(
  '/audit',
  authMiddleware,
  validate(auditQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const query = req.query as Record<string, string | undefined>;
    const tenantId = query.tenantId || req.user!.organizationId || '';
    const filters: Record<string, unknown> = {};
    if (query.userId) filters.userId = query.userId;
    if (query.action) filters.action = query.action;
    if (query.resource) filters.resource = query.resource;
    if (query.startDate || query.endDate) {
      filters.dateRange = {
        start: query.startDate ? new Date(query.startDate) : new Date('2000-01-01'),
        end: query.endDate ? new Date(query.endDate) : new Date(),
      };
    }
    const pagination = {
      page: parseInt(query.page || '1', 10),
      limit: parseInt(query.limit || '50', 10),
    };
    const result = await auditService.getAuditLog(filters as { userId?: string; action?: string; resource?: string; dateRange?: { start: Date; end: Date } }, pagination, tenantId);
    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  })
);

router.get(
  '/audit/trail/:resourceId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { resourceId } = req.params;
    const tenantId = (req.query.tenantId as string) || req.user!.organizationId || '';
    const result = await auditService.getAuditTrail(resourceId, tenantId);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.get(
  '/audit/user/:userId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    const startDate = (req.query.startDate as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = (req.query.endDate as string) || new Date().toISOString();
    const result = await auditService.getUserActivity(userId, {
      start: new Date(startDate),
      end: new Date(endDate),
    });
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.get(
  '/audit/export',
  authMiddleware,
  validate(auditExportSchema, 'query'),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const query = req.query as Record<string, string | undefined>;
    const tenantId = query.tenantId || req.user!.organizationId || '';
    const format = (query.format as 'csv' | 'pdf') || 'csv';
    const filters: Record<string, unknown> = {};
    if (query.userId) filters.userId = query.userId;
    if (query.action) filters.action = query.action;
    if (query.resource) filters.resource = query.resource;
    if (query.startDate) filters.startDate = query.startDate;
    if (query.endDate) filters.endDate = query.endDate;

    const buffer = await auditService.exportAuditLog(filters, format, tenantId);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-log.csv');
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-log.pdf');
    }
    res.status(200).send(buffer);
  })
);

// ──────────────────────────────────────────────
// DATA GOVERNANCE ROUTES
// ──────────────────────────────────────────────

router.put(
  '/data-governance/classify/:datasetId',
  authMiddleware,
  validate(classifyDataSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { datasetId } = req.params;
    const { classification } = req.body;
    const result = await dataGovernanceService.classifyData(datasetId, classification);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.post(
  '/data-governance/mask/:datasetId',
  authMiddleware,
  validate(maskDataSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { datasetId } = req.params;
    const { columns, method } = req.body;
    const result = await dataGovernanceService.maskSensitiveData(datasetId, columns, method);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.post(
  '/data-governance/anonymize/:datasetId',
  authMiddleware,
  validate(anonymizeDataSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { datasetId } = req.params;
    const { columns } = req.body;
    const result = await dataGovernanceService.anonymizeData(datasetId, columns);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.get(
  '/data-governance/lineage/:datasetId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { datasetId } = req.params;
    const result = await dataGovernanceService.trackDataLineage(datasetId);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

// ──────────────────────────────────────────────
// WORKFLOW ROUTES
// ──────────────────────────────────────────────

router.post(
  '/workflows',
  authMiddleware,
  validate(createWorkflowSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { name, steps, tenantId } = req.body;
    const userId = req.user!.userId;
    const result = await workflowService.createWorkflow(name, steps, tenantId, userId);
    res.status(201).json({
      success: true,
      data: result,
    });
  })
);

router.post(
  '/workflows/submit',
  authMiddleware,
  validate(submitWorkflowSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { resourceId, resourceType, workflowId } = req.body;
    const userId = req.user!.userId;
    const result = await workflowService.submitForApproval(resourceId, resourceType, workflowId, userId);
    res.status(201).json({
      success: true,
      data: result,
    });
  })
);

router.put(
  '/workflows/:instanceId/steps/:stepId',
  authMiddleware,
  validate(approveStepSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { instanceId, stepId } = req.params;
    const { decision, comment } = req.body;
    const userId = req.user!.userId;
    const result = await workflowService.approveStep(instanceId, stepId, userId, decision, comment);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

// ──────────────────────────────────────────────
// NOTIFICATION ROUTES
// ──────────────────────────────────────────────

router.get(
  '/notifications',
  authMiddleware,
  validate(notificationPaginationSchema, 'query'),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.userId;
    const query = req.query as Record<string, string | undefined>;
    const unreadOnly = query.unreadOnly === 'true';
    const pagination = {
      page: parseInt(query.page || '1', 10),
      limit: parseInt(query.limit || '50', 10),
    };
    const result = await notificationService.getNotifications(userId, unreadOnly, pagination);
    res.status(200).json({
      success: true,
      data: result.notifications,
      unreadCount: result.unreadCount,
      pagination: result.pagination,
    });
  })
);

router.put(
  '/notifications/:id/read',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const result = await notificationService.markAsRead(id, userId);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

router.post(
  '/notifications/email',
  authMiddleware,
  validate(sendEmailSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { to, subject, body } = req.body;
    const result = await notificationService.sendEmail(to, subject, body);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

export default router;
