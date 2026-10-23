import { Router, json } from 'express';
import { register, login, verifyEmail, resendCode, currentUser, logout, adminDashboard } from '../controllers/authController.js';
import { authLimit, checkOrigin, requireAuth, requireCsrf, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.use(checkOrigin);
router.use(json({ limit: '8kb' }));
router.post('/register', authLimit, register);
router.post('/verify-email', authLimit, verifyEmail);
router.post('/resend-code', authLimit, resendCode);
router.post('/login', authLimit, login);
router.get('/me', requireAuth, currentUser);
router.get('/admin/dashboard', requireAuth, requireSuperAdmin, adminDashboard);
router.post('/logout', requireAuth, requireCsrf, logout);
export default router;
