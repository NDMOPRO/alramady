import { Router } from 'express';
import { authController } from '../controllers/auth.controller';

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

export default router;
