/**
 * @file ledger.controller.ts
 * @description Admin-only READ layer over the append-only `LedgerEntry`
 * table. This never writes ledger rows (that happens only via
 * ledger.service.ts, called from the real job/milestone/escrow controllers)
 * and never becomes a source of truth — it just lets an admin inspect what
 * the ledger recorded.
 *
 * Every handler here is mounted behind `authenticateToken` + `requireAdmin`.
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { prisma } from '../config/db.config';
import { LedgerStatus } from '@prisma/client';

/** Pulls the jobId every ledger write stores in `details.jobId`. */
function jobIdOf(details: unknown): string | null {
  if (details && typeof details === 'object' && 'jobId' in (details as any)) {
    const v = (details as any).jobId;
    return typeof v === 'string' ? v : null;
  }
  return null;
}

export class LedgerController {
  /**
   * GET /api/admin/ledger/summary
   * Real counts over the ledger table — no fabricated numbers.
   */
  public async getSummary(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const [total, confirmed, pending, processing, failed, cancelled, allDetails] = await Promise.all([
        prisma.ledgerEntry.count(),
        prisma.ledgerEntry.count({ where: { status: LedgerStatus.CONFIRMED } }),
        prisma.ledgerEntry.count({ where: { status: LedgerStatus.PENDING } }),
        prisma.ledgerEntry.count({ where: { status: LedgerStatus.PROCESSING } }),
        prisma.ledgerEntry.count({ where: { status: LedgerStatus.FAILED } }),
        prisma.ledgerEntry.count({ where: { status: LedgerStatus.CANCELLED } }),
        prisma.ledgerEntry.findMany({ select: { details: true } }),
      ]);

      const jobIds = new Set<string>();
      for (const e of allDetails) {
        const jobId = jobIdOf(e.details);
        if (jobId) jobIds.add(jobId);
      }

      res.json({
        total,
        confirmed,
        pendingOrProcessing: pending + processing,
        failed,
        cancelled,
        jobsRepresented: jobIds.size,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load ledger summary', message: error.message });
    }
  }

  /**
   * GET /api/admin/ledger?jobId=&eventType=&status=&milestoneId=&q=&limit=&cursor=
   * Filterable, paginated event list.
   */
  public async listEntries(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobId, eventType, status, milestoneId } = req.query;
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

      const where: any = {};
      if (jobId) where.details = { path: ['jobId'], equals: String(jobId) };
      if (eventType) where.eventType = String(eventType);
      if (status) where.status = String(status);
      if (milestoneId) where.milestoneId = String(milestoneId);

      if (q) {
        const matchingJobs = await prisma.job.findMany({
          where: { title: { contains: q, mode: 'insensitive' } },
          select: { id: true },
          take: 50,
        });
        where.OR = [
          { description: { contains: q, mode: 'insensitive' } },
          { blockchainTransactionHash: { contains: q, mode: 'insensitive' } },
          { escrowId: { contains: q, mode: 'insensitive' } },
          { milestoneId: { contains: q, mode: 'insensitive' } },
          { actorId: { contains: q, mode: 'insensitive' } },
          ...matchingJobs.map((j) => ({ details: { path: ['jobId'], equals: j.id } })),
        ];
      }

      const entries = await prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      const hasMore = entries.length > limit;
      const page = hasMore ? entries.slice(0, limit) : entries;

      const shaped = await this.enrich(page);

      res.json({ entries: shaped, nextCursor: hasMore ? page[page.length - 1].id : null });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load ledger entries', message: error.message });
    }
  }

  /**
   * GET /api/admin/ledger/jobs/:jobId
   * Full chronological ledger history for one job (every entry that carries
   * this jobId in its details), plus basic job context.
   */
  public async getJobTimeline(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const jobId = String(req.params.jobId);

      const job = await prisma.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          title: true,
          status: true,
          budget: true,
          tokenSymbol: true,
          escrowAddress: true,
          client: { select: { id: true, name: true, email: true } },
          freelancer: { select: { id: true, name: true, email: true } },
        },
      });
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const entries = await prisma.ledgerEntry.findMany({
        where: { details: { path: ['jobId'], equals: jobId } },
        orderBy: { createdAt: 'asc' },
      });

      const shaped = await this.enrich(entries);

      res.json({ job, entries: shaped });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load job ledger history', message: error.message });
    }
  }

  /**
   * GET /api/admin/ledger/:id
   * Single entry, with job/milestone context resolved for display.
   */
  public async getEntry(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const entry = await prisma.ledgerEntry.findUnique({ where: { id } });
      if (!entry) {
        res.status(404).json({ error: 'Ledger entry not found' });
        return;
      }
      const [shaped] = await this.enrich([entry]);
      res.json({ entry: shaped });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load ledger entry', message: error.message });
    }
  }

  /** Attaches jobId/jobTitle/milestoneTitle/actorLabel for display; read-only, no persistence. */
  private async enrich(entries: Array<Awaited<ReturnType<typeof prisma.ledgerEntry.findFirst>>>) {
    const list = entries.filter((e): e is NonNullable<typeof e> => !!e);

    const jobIds = Array.from(new Set(list.map((e) => jobIdOf(e.details)).filter((v): v is string => !!v)));
    const milestoneIds = Array.from(new Set(list.map((e) => e.milestoneId).filter((v): v is string => !!v)));
    const actorIds = Array.from(new Set(list.map((e) => e.actorId).filter((v): v is string => !!v)));

    const [jobs, milestones, actors] = await Promise.all([
      jobIds.length ? prisma.job.findMany({ where: { id: { in: jobIds } }, select: { id: true, title: true } }) : [],
      milestoneIds.length
        ? prisma.milestone.findMany({ where: { id: { in: milestoneIds } }, select: { id: true, title: true } })
        : [],
      actorIds.length
        ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
        : [],
    ]);
    const jobTitleById = new Map<string, string>(jobs.map((j): [string, string] => [j.id, j.title]));
    const milestoneTitleById = new Map<string, string>(milestones.map((m): [string, string] => [m.id, m.title]));
    const actorById = new Map<string, string>(
      actors.map((a): [string, string] => [a.id, a.name || a.email || a.id])
    );

    return list.map((e) => {
      const jobId = jobIdOf(e.details);
      return {
        ...e,
        jobId,
        jobTitle: jobId ? jobTitleById.get(jobId) ?? null : null,
        milestoneTitle: e.milestoneId ? milestoneTitleById.get(e.milestoneId) ?? null : null,
        actorLabel: e.actorId ? actorById.get(e.actorId) ?? e.actorId : null,
      };
    });
  }
}

export const ledgerController = new LedgerController();
