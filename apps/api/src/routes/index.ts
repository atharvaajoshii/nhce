/**
 * @file index.ts
 * @description Master Express API Router Index.
 * Aggregates all modular route handlers under unified API endpoints.
 */

import { Router } from 'express';
import authRoutes from './auth.routes';
import jobRoutes from './job.routes';
import applicationRoutes from './application.routes';
import milestoneRoutes from './milestone.routes';
import swapRoutes from './swap.routes';
import withdrawalRoutes from './withdrawal.routes';
import subscriptionRoutes from './subscription.routes';
import disputeRoutes from './dispute.routes';
import webhookRoutes from './webhook.routes';
import conversationRoutes from './conversation.routes';
import notificationRoutes from './notification.routes';
import adminRoutes from './admin.routes';
import oracleRoutes from './oracle.routes';
import stablecoinRoutes from './stablecoin.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/jobs', jobRoutes);
router.use('/applications', applicationRoutes);
router.use('/milestones', milestoneRoutes);
router.use('/oracle', oracleRoutes);
router.use('/swap', swapRoutes);
router.use('/withdrawal', withdrawalRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/disputes', disputeRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/conversations', conversationRoutes);
router.use('/stablecoins', stablecoinRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);

export default router;
