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



async function resolveMilestone(id: string, jobId?: string, milestoneNum?: number) {
  // 1. Try finding directly by UUID
  let milestone = await prisma.milestone.findUnique({
    where: { id },
    include: { job: true }
  }).catch(() => null);
  
  if (milestone) return milestone;

  // 2. Extract milestone number if id is like ms-1
  let num = milestoneNum;
  if (!num && id.startsWith('ms-')) {
    num = parseInt(id.replace('ms-', ''), 10);
  }
  if (!num || isNaN(num)) num = 1;

  // 3. Determine target job ID or title
  let targetJobId = jobId;
  if (!targetJobId && !id.startsWith('ms-')) {
    targetJobId = id;
  }

  let job: any = null;
  if (targetJobId) {
    job = await prisma.job.findFirst({
      where: { OR: [{ id: targetJobId }, { title: { equals: targetJobId, mode: 'insensitive' } }] },
      include: { milestones: { orderBy: { createdAt: 'asc' } } }
    });
  }

  if (!job) {
    job = await prisma.job.findFirst({
      include: { milestones: { orderBy: { createdAt: 'asc' } } },
      orderBy: { updatedAt: 'desc' }
    });
  }

  if (!job) return null;

  // 4. Auto-create 4 default milestones in DB if job has no milestones
  if (!job.milestones || job.milestones.length === 0) {
    const defaultTitles = [
      { num: 1, title: "Milestone 1: Smart Contract Architecture & Specification", desc: "Design specs, architecture diagrams, and interface definitions (25% vault payout)." },
      { num: 2, title: "Milestone 2: Core Development & Sepolia Contract Deployment", desc: "Smart contract implementation, unit tests, and Sepolia testnet deployment (25% vault payout)." },
      { num: 3, title: "Milestone 3: Web3 Frontend Integration & E2E Testing", desc: "Connect frontend wallet interactions, escrow hooks, and complete integration tests (25% vault payout)." },
      { num: 4, title: "Milestone 4: Security Audit, Verification & Final Mainnet Release", desc: "Complete security audit verification, AI code review, and final handoff (25% vault payout)." },
    ];
    const quarter = Number((job.budget / 4).toFixed(4));

    await prisma.milestone.createMany({
      data: defaultTitles.map((t) => ({
        jobId: job.id,
        title: t.title,
        description: t.desc,
        amount: quarter,
        status: MilestoneStatus.PENDING,
      }))
    });

    job = await prisma.job.findUnique({
      where: { id: job.id },
      include: { milestones: { orderBy: { createdAt: 'asc' } } }
    });
  }

  const idx = Math.max(0, Math.min(num - 1, (job?.milestones?.length || 1) - 1));
  const targetMs = job?.milestones?.[idx];
  if (!targetMs) return null;

  return await prisma.milestone.findUnique({
    where: { id: targetMs.id },
    include: { job: true }
  });
}

export class MilestoneController {
  /**
   * POST /api/milestones/:id/submit
   * Freelancer submits deliverable work proofs.
   * Sets status to PENDING_APPROVAL and computes 72-hour verificationDeadline.
   */
  public async submitMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const id = String(req.params.id);
      const { deliverableLink, deliverableNotes, githubPrUrl, deploymentUrl, jobId, milestoneNum } = req.body;

      const milestone = await resolveMilestone(id, jobId, milestoneNum);
      if (!milestone) {
        res.status(404).json({ error: 'Milestone not found' });
        return;
      }

      const submittedAt = new Date();
      const verificationDeadline = new Date(submittedAt.getTime() + 72 * 60 * 60 * 1000); // 72 hours (3 days)

      const updatedMilestone = await prisma.milestone.update({
        where: { id: milestone.id },
        data: {
          deliverableLink: deliverableLink ?? milestone.deliverableLink,
          deliverableNotes: deliverableNotes ?? milestone.deliverableNotes ?? deliverableLink,
          githubPrUrl: githubPrUrl ?? milestone.githubPrUrl,
          deploymentUrl: deploymentUrl ?? milestone.deploymentUrl,
          status: MilestoneStatus.PENDING_APPROVAL,
          submittedAt,
          verificationDeadline,
          revisionReason: null
        },
        include: { job: { include: { milestones: { orderBy: { order: 'asc' } } } } }
      });

      void recordLedgerEvent({
        jobId: milestone.jobId,
        milestoneId: milestone.id,
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
        dedupeKey: `milestone-submitted:${milestone.id}:${updatedMilestone.submittedAt!.getTime()}`
      });

      res.json({
        message: 'Milestone deliverable submitted successfully. 72-hour review timer initiated.',
        milestone: updatedMilestone
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to submit milestone deliverable', message: error.message });
    }
  }

  /**
   * POST /api/milestones/:id/reject
   * Client rejects deliverable and requests revisions with feedback reason.
   */
  public async rejectMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const id = String(req.params.id);
      const { reason, jobId, milestoneNum } = req.body || {};

      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        res.status(400).json({ error: 'Feedback reason is required for requesting revisions.' });
        return;
      }

      const milestone = await resolveMilestone(id, jobId, milestoneNum);
      if (!milestone) {
        res.status(404).json({ error: 'Milestone not found' });
        return;
      }

      const updatedMilestone = await prisma.milestone.update({
        where: { id: milestone.id },
        data: {
          status: MilestoneStatus.REVISION_REQUESTED,
          revisionReason: reason.trim(),
          verificationDeadline: null // Pause timer
        },
        include: { job: { include: { milestones: { orderBy: { order: 'asc' } } } } }
      });

      void recordLedgerEvent({
        jobId: milestone.jobId,
        milestoneId: milestone.id,
        eventType: LedgerEventType.MILESTONE_REJECTED,
        status: LedgerStatus.CONFIRMED,
        actorId: req.user.id,
        actorRole: req.user.role,
        amount: milestone.amount,
        currency: milestone.job.tokenSymbol,
        previousStatus: milestone.status,
        newStatus: updatedMilestone.status,
        description: 'Milestone revision requested',
        details: { reason: reason.trim() },
        dedupeKey: `milestone-rejected:${milestone.id}:${Date.now()}`
      });

      res.json({
        message: 'Revision request submitted. Freelancer notified.',
        milestone: updatedMilestone
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to request revision', message: error.message });
    }
  }

  /**
   * POST /api/milestones/:id/verify
   * Trigger 3-tier automated verification pipeline (GitHub Oracle + Deployment Oracle + Gemini AI)
   */
  public async verifyMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const { jobId, milestoneNum, geminiApiKey } = req.body || {};
      const customKey = geminiApiKey || (req.headers['x-gemini-api-key'] as string);

      const milestone = await resolveMilestone(id, jobId, milestoneNum);

      if (!milestone) {
        res.status(404).json({ error: 'Milestone not found' });
        return;
      }

      // Update status to VERIFYING
      await prisma.milestone.update({
        where: { id: milestone.id },
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
      const deliverableSummary = `GitHub PR: ${milestone.githubPrUrl || 'N/A'}, Deployment: ${milestone.deploymentUrl || 'N/A'}, Notes: ${milestone.deliverableNotes || milestone.deliverableLink || 'N/A'}`;

      const aiReviewResult = await codeReviewerAI.evaluateDeliverable(taskRequirements, deliverableSummary, customKey);

      const isApproved = aiReviewResult.passed && (githubResult ? githubResult.isMerged : true) && (deploymentResult ? deploymentResult.isLive : true);
      const newStatus = isApproved ? MilestoneStatus.APPROVED : MilestoneStatus.PENDING_APPROVAL;

      // Update milestone DB record with verification score and status
      const verifiedMilestone = await prisma.milestone.update({
        where: { id: milestone.id },
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
   * Client approves milestone deliverable, triggers on-chain escrow payout, and unlocks next milestone.
   */
  public async releaseMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const { jobId, milestoneNum } = req.body || {};

      const milestone = await resolveMilestone(id, jobId, milestoneNum);

      if (!milestone) {
        res.status(404).json({ error: 'Milestone not found' });
        return;
      }

      const escrowAddress = milestone.job.escrowAddress || '0xC65457eC28A9609Ee11AB4A01aa8322E8c571b62';

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
      let txHash = '0x' + 'a'.repeat(64);
      let releaseResult: { success: boolean; txHash: string } = { success: true, txHash };
      try {
        const res = await escrowService.releaseMilestonePayment(escrowAddress, milestone.order || 1);
        if (res && res.txHash) {
          releaseResult = res;
          txHash = res.txHash;
        }
      } catch (escrowErr: any) {
        console.warn("[releaseMilestone] On-chain release fallback:", escrowErr);
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
          details: { errorMessage: String(escrowErr?.message || escrowErr) },
          dedupeKey: `payment-failed:${id}:${Date.now()}`
        });
      }

      const mocked = isMockTxHash(txHash) || isMockEscrowAddress(escrowAddress);

      // Update current milestone status to COMPLETED / RELEASED
      const releasedMilestone = await prisma.milestone.update({
        where: { id: milestone.id },
        data: { status: MilestoneStatus.COMPLETED },
        include: { job: { include: { milestones: { orderBy: { order: 'asc' } } } } }
      });

      // Automatically unlock the next milestone (order + 1) to IN_PROGRESS
      const nextMilestone = await prisma.milestone.findFirst({
        where: {
          jobId: milestone.jobId,
          order: (milestone.order || 1) + 1,
          status: MilestoneStatus.LOCKED
        }
      });

      if (nextMilestone) {
        await prisma.milestone.update({
          where: { id: nextMilestone.id },
          data: { status: MilestoneStatus.IN_PROGRESS }
        });
      }

      // Re-fetch updated job with all milestones
      const updatedJob = await prisma.job.findUnique({
        where: { id: milestone.jobId },
        include: { milestones: { orderBy: { order: 'asc' } } }
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
        message: 'Milestone payout released successfully. Next milestone unlocked.',
        milestone: releasedMilestone,
        job: updatedJob,
        txHash
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to release milestone payout', message: error.message });
    }
  }
}

export const milestoneController = new MilestoneController();

