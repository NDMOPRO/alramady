import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { authController } from '../controllers/auth.controller';
import { protectOwner } from '../middleware/protect-owner';

function asyncRouteHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

const prisma = new PrismaClient();
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

router.post('/users', asyncRouteHandler(async (req: Request, res: Response) => {
  const { username, password, email, displayName, displayNameAr, roleNames } = req.body as {
    username: string;
    password: string;
    email?: string;
    displayName?: string;
    displayNameAr?: string;
    roleNames?: string[];
  };

  if (!username || !password) {
    res.status(400).json({ success: false, error: 'username and password required' });
    return;
  }

  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) {
    res.status(500).json({ success: false, error: 'No tenant configured' });
    return;
  }

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username,
      passwordHash: await bcrypt.hash(password, 12),
      email: email || `${username}@rasid.local`,
      name: displayName || username,
      displayName: displayNameAr || displayName || username,
      role: roleNames?.[0] || 'viewer',
      status: 'ACTIVE',
    },
    select: { id: true, username: true, email: true, role: true, status: true },
  });

  res.status(201).json({ success: true, data: user });
}));

router.patch('/users/:id/status', protectOwner, asyncRouteHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' };
  if (!status) {
    res.status(400).json({ success: false, error: 'status required' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { status },
    select: { id: true, status: true },
  });
  res.json({ success: true, data: user });
}));

router.post('/users/:userId/roles', protectOwner, asyncRouteHandler(async (req: Request, res: Response) => {
  const { roleName } = req.body as { roleName?: string };
  if (!roleName) {
    res.status(400).json({ success: false, error: 'roleName required' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { role: roleName },
    select: { id: true, role: true },
  });

  res.json({ success: true, data: user });
}));

router.post('/seed-owner', asyncRouteHandler(async (_req: Request, res: Response) => {
  const OWNER_EMAIL = 'prog.muhammed@gmail.com';
  const OWNER_USERNAME = 'MRUHAILY';
  const OWNER_PASSWORD = '15001500';
  const OWNER_PHONE = '+966553445533';

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { isOwner: true },
        { email: OWNER_EMAIL },
        { username: OWNER_USERNAME },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { isOwner: true, role: 'root_admin', status: 'ACTIVE' },
    });
    res.json({ success: true, message: 'Owner already exists', userId: existing.id });
    return;
  }

  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) {
    res.status(500).json({ success: false, error: 'No tenant configured' });
    return;
  }

  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: OWNER_USERNAME,
      email: OWNER_EMAIL,
      name: OWNER_USERNAME,
      displayName: 'محمد الرحيلي',
      phone: OWNER_PHONE,
      passwordHash: await bcrypt.hash(OWNER_PASSWORD, 12),
      role: 'root_admin',
      status: 'ACTIVE',
      isOwner: true,
    },
    select: { id: true },
  });

  res.json({ success: true, message: 'Owner created', userId: owner.id });
}));

export default router;
