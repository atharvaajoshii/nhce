/**
 * @file admin.routes.ts
 * @description Admin console API routes — every handler requires a valid
 * ADMIN-role JWT (see auth.controller.ts `POST /auth/admin-login`).
 */

import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { ledgerController } from '../controllers/ledger.controller';
import { authenticateToken, requireAdmin } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/overview', (req, res) => adminController.getOverview(req, res));
router.get('/users', (req, res) => adminController.listUsers(req, res));
router.get('/disputes', (req, res) => adminController.listDisputes(req, res));
router.post('/disputes/:id/resolve', (req, res) => adminController.resolveDispute(req, res));
router.get('/activity', (req, res) => adminController.listActivity(req, res));

// Financial ledger (read-only; writes happen only via ledger.service.ts hooks
// on the real job/milestone/escrow controllers).
router.get('/ledger/summary', (req, res) => ledgerController.getSummary(req, res));
router.get('/ledger/jobs/:jobId', (req, res) => ledgerController.getJobTimeline(req, res));
router.get('/ledger/:id', (req, res) => ledgerController.getEntry(req, res));
router.get('/ledger', (req, res) => ledgerController.listEntries(req, res));

export default router;
