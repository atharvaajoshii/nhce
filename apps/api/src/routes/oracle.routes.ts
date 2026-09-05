/**
 * @file oracle.routes.ts
 * @description Oracle & AI Verification Pipeline API Routes.
 * Provides endpoints for deliverable verification, GitHub PR auditing, deployment checks, and authenticity scoring.
 */

import { Router } from 'express';
import { milestoneController } from '../controllers/milestone.controller';
import { optionalAuthenticate } from '../middlewares/auth.middleware';

const router = Router();

// Trigger automated Gemini AI verification for a milestone deliverable
router.post('/verify-milestone', optionalAuthenticate, (req, res) => milestoneController.verifyMilestone(req, res));
router.post('/milestone/:id/verify', optionalAuthenticate, (req, res) => milestoneController.verifyMilestone(req, res));

export default router;
