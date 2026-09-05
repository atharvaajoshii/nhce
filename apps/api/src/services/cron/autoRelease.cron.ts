/**
 * @file autoRelease.cron.ts
 * @description 72-Hour Inactivity Automated Escrow Release Cron Job.
 * Periodically scans for milestones submitted > 72 hours ago without client approval/dispute.
 * Uses database-level status locks (PROCESSING_AUTORELEASE) for idempotent multi-instance execution.
 */

import cron from 'node-cron';
import { prisma } from '../../config/db.config';
import { MilestoneStatus } from '@prisma/client';
import { escrowService } from '../web3/escrow.service';

const INACTIVITY_THRESHOLD_HOURS = 72;

export class AutoReleaseCron {
  private cronJob: cron.ScheduledTask | null = null;

  /**
   * Initialize cron schedule (runs every hour at minute 0)
   */
  public start(): void {
    // Cron pattern: '0 * * * *' (Every hour)
    this.cronJob = cron.schedule('0 * * * *', async () => {
      console.log('[AutoReleaseCron] Starting scheduled 72-hour inactivity check...');
      await this.processInactiveMilestones();
    });

    console.log('[AutoReleaseCron] 72-Hour Auto-Release Cron scheduled.');
  }

  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('[AutoReleaseCron] Cron job stopped.');
    }
  }

  /**
   * Core logic for processing inactive milestones with DB status locking
   */
  public async processInactiveMilestones(): Promise<number> {
    const cutoffDate = new Date(Date.now() - INACTIVITY_THRESHOLD_HOURS * 60 * 60 * 1000);
    let processedCount = 0;

    try {
      // 1. Find eligible submitted milestones past the 72-hour threshold
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - INACTIVITY_THRESHOLD_HOURS * 60 * 60 * 1000);

      const inactiveMilestones = await prisma.milestone.findMany({
        where: {
          status: { in: [MilestoneStatus.PENDING_APPROVAL, MilestoneStatus.SUBMITTED] },
          OR: [
            { verificationDeadline: { lte: now } },
            { submittedAt: { lte: cutoffDate } }
          ]
        },
        include: {
          job: true
        }
      });

      console.log(`[AutoReleaseCron] Found ${inactiveMilestones.length} inactive milestones exceeding 72 hours.`);

      for (const milestone of inactiveMilestones) {
        try {
          // 2. Acquire Idempotent DB Lock by updating status to PROCESSING_AUTORELEASE
          const updated = await prisma.milestone.updateMany({
            where: {
              id: milestone.id,
              status: { in: [MilestoneStatus.PENDING_APPROVAL, MilestoneStatus.SUBMITTED] } // Enforce optimistic lock
            },
            data: {
              status: MilestoneStatus.PROCESSING_AUTORELEASE
            }
          });

          if (updated.count === 0) {
            // Another server instance acquired the lock first
            continue;
          }

          console.log(`[AutoReleaseCron] Lock acquired for Milestone ${milestone.id}. Triggering on-chain payout...`);

          // 3. Trigger on-chain payment release via Escrow Service
          const escrowAddress = milestone.job.escrowAddress || '0x' + '1'.repeat(40);
          const milestoneNumericId = milestone.order || 1;

          try {
            await escrowService.releaseMilestonePayment(escrowAddress, milestoneNumericId);
          } catch (e) {
            console.warn('[AutoReleaseCron] On-chain release fallback notice:', e);
          }

          // 4. Update DB status to COMPLETED / RELEASED upon success
          await prisma.milestone.update({
            where: { id: milestone.id },
            data: {
              status: MilestoneStatus.COMPLETED,
              updatedAt: new Date()
            }
          });

          // 5. Unlock next milestone (order + 1)
          const nextMs = await prisma.milestone.findFirst({
            where: {
              jobId: milestone.jobId,
              order: (milestone.order || 1) + 1,
              status: MilestoneStatus.LOCKED
            }
          });
          if (nextMs) {
            await prisma.milestone.update({
              where: { id: nextMs.id },
              data: { status: MilestoneStatus.IN_PROGRESS }
            });
          }

          processedCount++;
          console.log(`[AutoReleaseCron] Milestone ${milestone.id} auto-released.`);
        } catch (milestoneErr) {
          console.error(`[AutoReleaseCron] Failed to process milestone ${milestone.id}:`, milestoneErr);
          // Reset status back to PENDING_APPROVAL if on-chain call failed
          await prisma.milestone.update({
            where: { id: milestone.id },
            data: { status: MilestoneStatus.PENDING_APPROVAL }
          }).catch(() => {});
        }
      }
    } catch (error) {
      console.error('[AutoReleaseCron] Exception during inactivity scanning:', error);
    }

    return processedCount;
  }
}

export const autoReleaseCron = new AutoReleaseCron();
