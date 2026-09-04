/**
 * @file auth.routes.ts
 * @description Authentication & Profile API Route Definitions.
 */

import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.post('/signup', (req, res) => authController.signup(req, res));
router.post('/login', (req, res) => authController.login(req, res));
router.post('/admin-login', (req, res) => authController.adminLogin(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));
router.get('/me', authenticateToken, (req, res) => authController.getMe(req, res));

// Post-signup onboarding (profile setup)
router.post('/onboarding/complete', authenticateToken, (req, res) =>
  authController.completeOnboarding(req, res)
);

router.get('/profile', authenticateToken, (req, res) => authController.getProfile(req, res));
router.put('/profile', authenticateToken, (req, res) => authController.updateProfile(req, res));
router.post('/connect-wallet', authenticateToken, (req, res) => authController.connectWallet(req, res));
router.post('/disconnect-wallet', authenticateToken, (req, res) => authController.disconnectWallet(req, res));

export default router;
