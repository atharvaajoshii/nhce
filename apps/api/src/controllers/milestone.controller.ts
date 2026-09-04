/**
 * @file milestone.controller.ts
 * @description Milestone Submission & Automated Verification Pipeline Controller.
 * Manages deliverable submissions, triggers GitHub + Deployment Oracles & Gemini AI Code Reviewer, and initiates on-chain payouts.
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { prisma } from '../config/db.config';
import { githubOracle, IGitHubVerificationResult } from '../services/oracle/github.oracle';
import { deploymentOracle, IDeploymentVerificationResult } from '../services/oracle/deployment.oracle';
import { codeReviewerAI } from '../services/ai/codeReviewer.ai';
import { escrowService } from '../services/web3/escrow.service';
import { MilestoneStatus, LedgerEventType, LedgerStatus } from '@prisma/client';
import { recordLedgerEvent, isMockTxHash, isMockEscrowAddress } from '../services/ledger.service';


export class MilestoneController {
  /**
   * POST /api/milestones/:id/submit
   * Freelancer submits deliverable work proofs (githubPrUrl, deploymentUrl, completion notes / deliverableLink)
   */
  public async submitMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const id = String(req.params.id);
      const { deliverableLink, githubPrUrl, deploymentUrl } = req.body;

      const milestone = await prisma.milestone.findUnique({ where: { id }, include: { job: true } });
      if (!milestone) {
        res.status(404).json({ error: 'Milestone not found' });
        return;
      }

      const updatedMilestone = await prisma.milestone.update({
        where: { id },
        data: {
          deliverableLink,
          githubPrUrl,
          deploymentUrl,
          status: MilestoneStatus.SUBMITTED,
          submittedAt: new Date()
        }
      });

      void recordLedgerEvent({
        jobId: milestone.jobId,
        milestoneId: id,
        eventType: LedgerEventType.MILESTONE_SUBMITTED,
        status: LedgerStatus.CONFIRMED,
        actorId: req.user.id,
        actorRole: req.user.role,
        amount: milestone.amount,
        currency: milestone.job.tokenSymbol,
        previousStatus: milestone.status,
        newStatus: updatedMilestone.status,
        description: 'Milestone deliverable submitted',
        details: { deliverableLink, githubPrUrl, deploymentUrl },
        dedupeKey: `milestone-submitted:${id}:${updatedMilestone.submittedAt!.getTime()}`
      });

      res.json({
        message: 'Milestone deliverable submitted successfully',
        milestone: updatedMilestone
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to submit milestone deliverable', message: error.message });
    }
  }

  /**
   * POST /api/milestones/:id/verify
   * Trigger 3-tier automated verification pipeline (GitHub Oracle + Deployment Oracle + Gemini AI)
   */
  public async verifyMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);

      const milestone = await prisma.milestone.findUnique({
        where: { id },
        include: { job: true }
      });

      if (!milestone) {
        res.status(404).json({ error: 'Milestone not found' });
        return;
      }

      // Update status to VERIFYING
      await prisma.milestone.update({
        where: { id },
        data: { status: MilestoneStatus.VERIFYING }
      });

      // 1. Run GitHub Oracle Check (if GitHub PR URL provided)
      let githubResult: IGitHubVerificationResult | null = null;
      if (milestone.githubPrUrl) {
        githubResult = await githubOracle.verifyPullRequest(milestone.githubPrUrl);
      }

      // 2. Run Deployment Oracle Check (if Live URL provided)
      let deploymentResult: IDeploymentVerificationResult | null = null;
      if (milestone.deploymentUrl) {
        deploymentResult = await deploymentOracle.verifyDeployment(milestone.deploymentUrl);
      }

      // 3. Gemini AI Code Reviewer
      const taskRequirements = `${milestone.job.title} - ${milestone.title}: ${milestone.description}`;
      const deliverableSummary = `GitHub PR: ${milestone.githubPrUrl || 'N/A'}, Deployment: ${milestone.deploymentUrl || 'N/A'}, Notes: ${milestone.deliverableLink || 'N/A'}`;

      const aiReviewResult = await codeReviewerAI.evaluateDeliverable(taskRequirements, deliverableSummary);

      const isApproved = aiReviewResult.passed && (githubResult ? githubResult.isMerged : true) && (deploymentResult ? deploymentResult.isLive : true);
      const newStatus = isApproved ? MilestoneStatus.APPROVED : MilestoneStatus.SUBMITTED;

      // Update milestone DB record with verification score and status
      const verifiedMilestone = await prisma.milestone.update({
        where: { id },
        data: {
          aiReviewScore: aiReviewResult.score,
          status: newStatus
        },
        include: { job: true }
      });

      void recordLedgerEvent({
        jobId: verifiedMilestone.jobId,
        milestoneId: id,
        eventType: isApproved ? LedgerEventType.MILESTONE_APPROVED : LedgerEventType.MILESTONE_REJECTED,
        status: LedgerStatus.CONFIRMED,
        actorId: req.user?.id ?? null,
        actorRole: req.user?.role ?? null,
        amount: verifiedMilestone.amount,
        currency: verifiedMilestone.job.tokenSymbol,
        previousStatus: MilestoneStatus.SUBMITTED,
        newStatus,
        description: isApproved ? 'Milestone verification passed' : 'Milestone verification did not pass',
        details: {
          aiScore: aiReviewResult.score,
          aiSummary: aiReviewResult.summary,
          githubOracle: githubResult,
          deploymentOracle: deploymentResult
        },
        dedupeKey: `milestone-verified:${id}:${Date.now()}`
      });

      res.json({
        message: 'Milestone verification pipeline completed',
        milestone: verifiedMilestone,
        verificationScore: aiReviewResult.score,
        aiSummary: aiReviewResult.summary,
        status: newStatus,
        pipelineResults: {
          githubOracle: githubResult,
          deploymentOracle: deploymentResult,
          aiReviewer: aiReviewResult
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Verification pipeline failed', message: error.message });
    }
  }

  /**
   * POST /api/milestones/:id/release
   * Client approves milestone deliverable and triggers on-chain escrow payout for JobEscrow.sol on Sepolia
   */
  public async releaseMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);

      const milestone = await prisma.milestone.findUnique({
        where: { id },
        include: { job: true }
      });

      if (!milestone) {
        res.status(404).json({ error: 'Milestone not found' });
        return;
      }

      const escrowAddress = milestone.job.escrowAddress || '0x' + '1'.repeat(40);

      void recordLedgerEvent({
        jobId: milestone.jobId,
        milestoneId: id,
        escrowId: escrowAddress,
        eventType: LedgerEventType.PAYMENT_PENDING,
        status: LedgerStatus.PENDING,
        actorId: req.user?.id ?? null,
        actorRole: req.user?.role ?? null,
        amount: milestone.amount,
        currency: milestone.job.tokenSymbol,
        previousStatus: milestone.status,
        newStatus: null,
        description: 'Milestone payout requested — awaiting blockchain execution',
        dedupeKey: `payment-pending:${id}:${Date.now()}`
      });

      // Trigger Smart Contract Release call on Sepolia Devnet
      let releaseResult: { success: boolean; txHash: string };
      try {
        releaseResult = await escrowService.releaseMilestonePayment(escrowAddress, 1);
      } catch (releaseError: any) {
        void recordLedgerEvent({
          jobId: milestone.jobId,
          milestoneId: id,
          escrowId: escrowAddress,
          eventType: LedgerEventType.PAYMENT_FAILED,
          status: LedgerStatus.FAILED,
          actorId: req.user?.id ?? null,
          actorRole: req.user?.role ?? null,
          amount: milestone.amount,
          currency: milestone.job.tokenSymbol,
          previousStatus: milestone.status,
          newStatus: milestone.status,
          description: 'Milestone payout failed',
          details: { errorMessage: String(releaseError?.message || releaseError) },
          dedupeKey: `payment-failed:${id}:${Date.now()}`
        });
        throw releaseError; // preserve existing error-response behavior exactly
      }

      const mocked = isMockTxHash(releaseResult.txHash) || isMockEscrowAddress(escrowAddress);

      // Update DB Status to RELEASED
      const releasedMilestone = await prisma.milestone.update({
        where: { id },
        data: { status: MilestoneStatus.RELEASED },
        include: { job: true }
      });

      void recordLedgerEvent({
        jobId: milestone.jobId,
        milestoneId: id,
        escrowId: escrowAddress,
        eventType: LedgerEventType.MILESTONE_RELEASED,
        status: mocked ? LedgerStatus.PENDING : LedgerStatus.CONFIRMED,
        actorId: req.user?.id ?? null,
        actorRole: req.user?.role ?? null,
        amount: milestone.amount,
        currency: milestone.job.tokenSymbol,
        previousStatus: milestone.status,
        newStatus: releasedMilestone.status,
        description: mocked
          ? 'Milestone marked released (devnet mock payout — no real on-chain settlement)'
          : 'Milestone payout released on-chain',
        blockchainTransactionHash: releaseResult.txHash,
        dedupeKey: `milestone-released:${id}`
      });

      res.json({
        message: 'Milestone payout released on-chain successfully',
        milestone: releasedMilestone,
        txHash: releaseResult.txHash
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to release milestone payout', message: error.message });
    }
  }
}

export const milestoneController = new MilestoneController();
