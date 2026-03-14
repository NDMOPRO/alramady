import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * protectOwner middleware — يمنع حذف أو تعطيل أو تخفيض دور مالك النظام (isOwner).
 * يُطبَّق على أي route يعدّل أو يحذف مستخدمًا عبر params.id.
 *
 * ⚠️ تحذير أمني: لا تُزِل هذا الـ middleware بدون موافقة مالك النظام.
 * للتواصل: prog.muhammed@gmail.com | +966553445533
 */
export async function protectOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  const targetUserId = req.params.id;
  if (!targetUserId) {
    next();
    return;
  }

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isOwner: true, email: true, name: true },
    });

    if (!targetUser || !targetUser.isOwner) {
      next();
      return;
    }

    // Block DELETE requests on owner
    if (req.method === 'DELETE') {
      res.status(403).json({
        success: false,
        error: '⛔ لا يمكن حذف حساب مالك النظام. هذا الحساب محمي بشكل دائم.',
        code: 'OWNER_PROTECTED',
      });
      return;
    }

    // Block status changes to INACTIVE/SUSPENDED/BANNED
    const payload = req.body as Record<string, unknown>;
    if (payload.status && typeof payload.status === 'string') {
      const blockedStatuses = ['INACTIVE', 'SUSPENDED', 'BANNED', 'DISABLED', 'DELETED'];
      if (blockedStatuses.includes(payload.status.toUpperCase())) {
        res.status(403).json({
          success: false,
          error: '⛔ لا يمكن تعطيل أو إيقاف حساب مالك النظام. هذا الحساب محمي بشكل دائم.',
          code: 'OWNER_PROTECTED',
        });
        return;
      }
    }

    // Block role downgrade (owner must stay root_admin or admin)
    if (payload.role && typeof payload.role === 'string') {
      const protectedRoles = ['root_admin', 'admin'];
      if (!protectedRoles.includes(payload.role)) {
        res.status(403).json({
          success: false,
          error: '⛔ لا يمكن تخفيض دور مالك النظام. يجب أن يبقى بدور root_admin أو admin.',
          code: 'OWNER_PROTECTED',
        });
        return;
      }
    }

    next();
  } catch (error) {
    // If isOwner column doesn't exist yet, allow the request to proceed
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('isOwner') || errorMessage.includes('Unknown arg')) {
      next();
      return;
    }
    next(error);
  }
}
