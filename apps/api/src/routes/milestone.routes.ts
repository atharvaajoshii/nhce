/**
 * @file milestone.routes.ts
 * @description Milestone Submission & Automated Verification Pipeline API Route Definitions.
 */

import { Router } from 'express';
import { milestoneController } from '../controllers/milestone.controller';
import { authenticateToken, optionalAuthenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/:id/submit', authenticateToken, (req, res) => milestoneController.submitMilestone(req, res));
router.post('/:id/reject', authenticateToken, (req, res) => milestoneController.rejectMilestone(req, res));
router.post('/:id/verify', optionalAuthenticate, (req, res) => milestoneController.verifyMilestone(req, res));
router.post('/:id/release', authenticateToken, (req, res) => milestoneController.releaseMilestone(req, res));

export default router;
